/* Landfracht — Steuerung, Spielschleife, Hinweise */
(function () {
  var U = TG.util, D = TG.data, W = TG.welt, S = TG.spiel, R = TG.zeichnen, UI = TG.ui, T = TG.ton;
  // Der Prüfstand ist Beiwerk: fehlt js/entwickler.js, läuft alles wie zuvor.
  var E = TG.entwickler || null;

  var tasten = {};
  var letzteZeit = 0;
  var seitSpeichern = 0;
  var seitBoerse = 0;
  var seitAnzeige = 0;

  // Das Titelbild haelt die Uhr an, bis der Spieler startet, und liefert
  // nebenbei die Eingabe, ohne die kein Browser Ton zulaesst.
  var titelAn = true;
  var fortsetzung = false;

  var TASTEN = {
    ArrowUp: 'gas', KeyW: 'gas',
    ArrowDown: 'bremse', KeyS: 'bremse',
    ArrowLeft: 'links', KeyA: 'links',
    ArrowRight: 'rechts', KeyD: 'rechts',
    Space: 'handbremse'
  };

  /* ---------------- Maussteuerung ----------------
   * Der Traktor lenkt zum Zeiger, die linke Maustaste gibt Gas, die rechte
   * bremst und faehrt rueckwaerts. Die Tastatur bleibt daneben scharf; wer
   * mit der Maus lenkt und mit W bremst, soll nicht gegen sich selbst
   * arbeiten muessen.
   *
   * Sie liegt in einem eigenen Speicherschluessel, nicht im Spielstand:
   * eine Einstellung des Geraets, keine des Betriebs -- und laden() wirft
   * fremde Spielstaende weg, statt sie umzuschreiben. */
  var MAUS_SPEICHER = 'landfracht_steuerung';

  /* Ablage vom Zeiger bis zum vollen Einschlag. 0,55 rad sind gut 31 Grad:
   * eng genug, dass eine Kurve ohne Zielen gelingt, weit genug, dass die
   * Geradeausfahrt nicht bei jedem Zucken der Hand ausbricht. */
  var MAUS_VOLL = 0.55;
  /* Naeher als das am Traktor wird nicht gelenkt. Direkt unter dem Gespann
   * springt der Winkel bei jeder Bewegung um halbe Umdrehungen. */
  var MAUS_TOT = 5;

  var maus = { an: false, drin: false, x: 0, y: 0, gas: false, bremse: false };
  var leinwand = null;

  function mausLaden() {
    var gespeichert = null;
    try { gespeichert = localStorage.getItem(MAUS_SPEICHER); } catch (e) { /* privater Modus */ }
    maus.an = gespeichert === 'maus';
    // Auf einem Geraet ohne Maus waere sie eine Sackgasse. Nur pruefen, wenn
    // nichts gespeichert ist: wer sie am Hybridgeraet bewusst eingeschaltet
    // hat, soll sie beim naechsten Start wiederfinden.
    if (!gespeichert && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) maus.an = false;
    mausAnzeigen();
  }

  function mausSichern() {
    try { localStorage.setItem(MAUS_SPEICHER, maus.an ? 'maus' : 'tasten'); } catch (e) { /* privater Modus */ }
  }

  function mausAnzeigen() {
    document.body.classList.toggle('maus-lenkt', maus.an);
    if (!maus.an) { maus.gas = false; maus.bremse = false; R.mausZiel(null); }
    // Die Schalter im Titelbild und im Buch zeigen denselben Zustand.
    document.querySelectorAll('[data-steuerart]').forEach(function (b) {
      b.classList.toggle('aktiv', (b.getAttribute('data-steuerart') === 'maus') === maus.an);
    });
  }

  function mausSetzen(an) {
    an = !!an;
    if (an === maus.an) return maus.an;
    maus.an = an;
    mausAnzeigen();
    mausSichern();
    if (UI.istOffen()) UI.zeichnen();
    return maus.an;
  }

  function mausUmschalten() { return mausSetzen(!maus.an); }

  /* Zeigt der Zeiger gerade auf die Karte -- und nicht auf Kopfleiste,
   * Panel oder einen Knopf? Frueher hing das an mouseleave der Leinwand;
   * jedes Ueberstreichen einer Anzeige hat die Lenkung dann mitten in der
   * Kurve abgeworfen und kam erst mit der naechsten Bewegung zurueck.
   * Das Ereignisziel sagt dasselbe, aber ohne Gedaechtnis: Anzeigen mit
   * pointer-events:none lassen den Zeiger zur Leinwand durch. */
  function aufKarte(ziel) { return ziel === leinwand; }

  function mausMerken(e) {
    if (!leinwand) return;
    var r = leinwand.getBoundingClientRect();
    maus.x = e.clientX - r.left;
    maus.y = e.clientY - r.top;
    maus.drin = aufKarte(e.target);
    if (!maus.drin) { maus.gas = false; maus.bremse = false; }
  }

  /** Sollwert der Lenkung aus der Zeigerlage, -1 .. 1. */
  function mausLenkung(g) {
    var w = R.schirm2welt(maus.x, maus.y);
    var dx = w.x - g.x, dy = w.y - g.y;
    if (dx * dx + dy * dy < MAUS_TOT * MAUS_TOT) return { lenk: 0, ziel: null };

    // Rueckwaerts dreht dieselbe Radstellung das Gespann andersherum. Damit
    // der Zeiger auch beim Rangieren zieht statt zu schieben, wird dann das
    // Heck auf ihn ausgerichtet und der Einschlag gespiegelt.
    var rueckwaerts = g.v < -0.3;
    var bezug = rueckwaerts ? U.winkel(g.h + Math.PI) : g.h;
    var ab = U.winkel(Math.atan2(dy, dx) - bezug);
    var lenk = U.clamp(ab / MAUS_VOLL, -1, 1);
    return { lenk: rueckwaerts ? -lenk : lenk, ziel: w };
  }

  function start() {
    R.start();
    UI.start();
    T.start();
    tonAnmelden();

    // Der Stand wird schon hier gelesen, damit das Titelbild weiss, ob es
    // "Weiterspielen" oder "Spiel starten" anbieten muss.
    fortsetzung = S.laden();
    if (!fortsetzung) S.neu();

    bindeEingaben();
    mausLaden();
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      document.getElementById('touch').classList.remove('aus');
    }

    UI.kopfleiste();
    // Der Prüfstand überdauert das Neuladen; Knopf und Rahmen müssen das
    // gleich beim Start zeigen.
    if (E) { E.anzeigen(); diagnoseZeigen(true); }
    titelbild();
    letzteZeit = performance.now();
    requestAnimationFrame(schleife);
  }

  /* ---------------- Titelbild ---------------- */
  function titelbild() {
    var kasten = document.getElementById('titel');
    var los = document.getElementById('t-los');
    var neu = document.getElementById('t-neu');

    document.body.classList.add('titel-an');

    if (fortsetzung) {
      los.textContent = 'Weiterspielen — Tag ' + S.tag();
      neu.classList.remove('aus');
    }

    // Umschalter Tastatur / Maus. Er steht hier, weil das die Stelle ist, an
    // der man die Steuerung vor dem ersten Meter waehlt -- und nicht erst,
    // wenn das Gespann schon in der Hecke steht.
    kasten.querySelectorAll('[data-steuerart]').forEach(function (b) {
      b.addEventListener('click', function () {
        mausSetzen(b.getAttribute('data-steuerart') === 'maus');
      });
    });
    mausAnzeigen();

    los.addEventListener('click', function () { losfahren(kasten); });
    neu.addEventListener('click', function () {
      // loeschen() sperrt das Speichern, neu() gibt es wieder frei.
      S.loeschen();
      S.neu();
      fortsetzung = false;
      UI.kopfleiste();
      losfahren(kasten);
    });

    window.addEventListener('keydown', titelTaste);
    los.focus();
  }

  function titelTaste(e) {
    if (!titelAn) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      e.preventDefault();
      losfahren(document.getElementById('titel'));
    }
  }

  function losfahren(kasten) {
    if (!titelAn) return;
    titelAn = false;
    window.removeEventListener('keydown', titelTaste);

    kasten.classList.add('weg');
    document.body.classList.remove('titel-an');
    setTimeout(function () { kasten.classList.add('aus'); }, 320);

    if (fortsetzung) {
      UI.meldung('Spielstand geladen. Weiter geht es an Tag ' + S.tag() + '.', 'gut');
    } else {
      UI.meldung('Willkommen auf Hof Lindenbach. In der Börse liegt ein erster Auftrag für dich.', 'gut');
      setTimeout(function () { UI.oeffnen('boerse'); }, 700);
    }
    // Der Schlepper steht immer kalt da, egal ob neu oder weitergespielt.
    setTimeout(function () { UI.meldung('Der Motor ist aus. Mit I den Anlasser drehen.'); }, 1400);
    UI.kopfleiste();
  }

  /* ---------------- Eingaben ---------------- */
  function bindeEingaben() {
    window.addEventListener('keydown', function (e) {
      if (titelAn || e.repeat) return;
      var code = e.code;

      if (code === 'Escape') { UI.schliessen(); return; }

      // Strg+Alt+E holt den Prüfstand. Bewusst ein Griff, in den niemand
      // beim Fahren gerät: der Entwicklermodus schreibt in denselben
      // Spielstand wie das Spiel.
      if (code === 'KeyE' && e.ctrlKey && e.altKey && E) {
        pruefstandUmschalten();
        e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      // Wer gerade am Kreditschieber steht, will damit nicht lenken
      var f = document.activeElement;
      if (f && (f.tagName === 'INPUT' || f.tagName === 'TEXTAREA')) return;

      // Panels
      // N wie Navigation: K ist der Haendler, M der Ton.
      if (code === 'KeyN') { UI.umschalten('karte'); e.preventDefault(); return; }
      if (code === 'KeyB') { UI.umschalten('boerse'); e.preventDefault(); return; }
      if (code === 'KeyH') { UI.umschalten('hof'); e.preventDefault(); return; }
      if (code === 'KeyK') { UI.umschalten('haendler'); e.preventDefault(); return; }
      if (code === 'KeyU') { UI.umschalten('buch'); e.preventDefault(); return; }
      if (code === 'KeyE') { handeln(); e.preventDefault(); return; }
      if (code === 'KeyM') {
        UI.meldung(T.umschalten() ? 'Ton an.' : 'Ton aus.');
        if (UI.istOffen()) UI.zeichnen();
        e.preventDefault();
        return;
      }
      if (code === 'KeyL') {
        UI.meldung(mausUmschalten()
          ? 'Maussteuerung an: der Traktor lenkt zum Zeiger, linke Maustaste gibt Gas, rechte bremst.'
          : 'Maussteuerung aus. Gelenkt wird wieder mit den Pfeiltasten.');
        e.preventDefault();
        return;
      }
      if (code === 'KeyI') { zuendung(); e.preventDefault(); return; }

      // Prüfstand. Die Tasten liegen nur an, solange er läuft — sonst nimmt
      // der Entwicklermodus dem Spiel drei Buchstaben weg.
      if (E && E.an()) {
        if (code === 'KeyP') { UI.umschalten('pruefstand'); e.preventDefault(); return; }
        if (code === 'KeyT') { zumZeigerVersetzen(); e.preventDefault(); return; }
        if (code === 'KeyO') {
          UI.meldung(E.schalten('linien') ? 'Wege, Stützpunkte und Hüllen an.' : 'Wege und Hüllen aus.');
          if (UI.istOffen()) UI.zeichnen();
          e.preventDefault();
          return;
        }
        if (code === 'KeyZ') {
          UI.meldung(E.schalten('diagnose') ? 'Zahlenfeld an.' : 'Zahlenfeld aus.');
          if (UI.istOffen()) UI.zeichnen();
          e.preventDefault();
          return;
        }
      }
      if (code === 'NumpadAdd' || code === 'Equal' || code === 'BracketRight') { R.zoom(1); return; }
      if (code === 'NumpadSubtract' || code === 'Minus' || code === 'Slash') { R.zoom(-1); return; }

      if (TASTEN[code]) { tasten[TASTEN[code]] = true; e.preventDefault(); }
    });

    window.addEventListener('keyup', function (e) {
      if (TASTEN[e.code]) { tasten[TASTEN[e.code]] = false; e.preventDefault(); }
    });

    window.addEventListener('blur', function () {
      tasten = {};
      maus.gas = false; maus.bremse = false; maus.drin = false;
    });

    // Maus auf der Karte. Alles am Fenster, nicht an der Leinwand: nur so
    // bekommt die Steuerung auch die Bewegung mit, die ueber einer Anzeige
    // endet, und ein Loslassen ausserhalb des Bildes klemmt das Gas nicht.
    var lw = document.getElementById('leinwand');
    leinwand = lw;
    window.addEventListener('mousemove', mausMerken);
    window.addEventListener('mousedown', function (e) {
      if (!maus.an) return;
      mausMerken(e);
      if (!maus.drin) return;              // Klick auf einen Knopf ist kein Gaspedal
      if (e.button === 0) maus.gas = true;
      if (e.button === 2) maus.bremse = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) maus.gas = false;
      if (e.button === 2) maus.bremse = false;
    });
    // Verlaesst der Zeiger das Fenster ganz, faellt alles ab.
    document.addEventListener('mouseleave', function () {
      maus.drin = false; maus.gas = false; maus.bremse = false;
    });
    lw.addEventListener('contextmenu', function (e) {
      if (maus.an) e.preventDefault();
    });

    // Touchflächen
    document.querySelectorAll('#touch button').forEach(function (b) {
      var t = TASTEN[b.getAttribute('data-taste')];
      if (!t) return;
      function an(e) { e.preventDefault(); tasten[t] = true; }
      function aus(e) { e.preventDefault(); tasten[t] = false; }
      b.addEventListener('touchstart', an, { passive: false });
      b.addEventListener('touchend', aus, { passive: false });
      b.addEventListener('touchcancel', aus, { passive: false });
      b.addEventListener('mousedown', an);
      b.addEventListener('mouseup', aus);
      b.addEventListener('mouseleave', aus);
    });

    // Zuendung fuer Geraete ohne Tastatur
    var tm = document.getElementById('touch-motor');
    if (tm) tm.addEventListener('click', function (e) { e.preventDefault(); zuendung(); });

    // Mausrad zoomt
    document.getElementById('leinwand').addEventListener('wheel', function (e) {
      R.zoom(e.deltaY < 0 ? 1 : -1);
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('beforeunload', function () { if (!titelAn) S.speichern(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && !titelAn) S.speichern();
    });
  }

  /* ---------------- Zuendung ---------------- */
  /** Taste I: Motor anlassen oder abstellen. */
  function zuendung() {
    if (S.motorLaeuft() || S.motorOrgelt()) {
      S.motorAbstellen(false);
      UI.meldung('Motor aus.');
      return;
    }
    var erg = S.motorStarten();
    if (!erg.ok) UI.meldung(erg.grund, 'schlecht');
  }

  /* ---------------- Prüfstand ----------------
   * Der Entwicklermodus selbst steckt in js/entwickler.js; hier hängen nur
   * die Tasten, das Zahlenfeld und der Knopf in der Kopfleiste. */
  function pruefstandUmschalten() {
    var an = E.umschalten();
    UI.meldung(an
      ? 'Prüfstand an. P öffnet ihn, T versetzt das Gespann zum Zeiger, Strg+Alt+E schaltet ihn ab.'
      : 'Prüfstand aus. Es gilt wieder, was der Betrieb hergibt.', an ? 'gut' : null);
    if (an) UI.oeffnen('pruefstand');
    else if (UI.istOffen()) UI.zeichnen();
    diagnoseZeigen(true);
  }

  /** Taste T: Gespann dorthin, wo der Zeiger auf der Karte steht. */
  function zumZeigerVersetzen() {
    var w = R.schirm2welt(maus.x, maus.y);
    E.versetzen(w.x, w.y);
    kameraNachziehen();
    UI.meldung('Versetzt auf ' + Math.round(w.x) + ' / ' + Math.round(w.y) +
               ' — ' + W.untergruende[W.untergrundAn(w.x, w.y)].name + '.');
  }

  /* Nach einem Sprung soll die Kamera nicht über die halbe Karte
   * hinterhergleiten; kameraFolgen() zieht sonst sekundenlang nach. */
  function kameraNachziehen() {
    R.kamera.x = S.gespann.x;
    R.kamera.y = S.gespann.y;
  }

  var diagnoseFeld = null;
  var bilderZaehler = 0, bilderZeit = 0, bilderRate = 0;

  function diagnoseZeigen(sofort) {
    if (!diagnoseFeld) diagnoseFeld = document.getElementById('diagnose');
    if (!diagnoseFeld) return;
    var zeigen = E && E.hat('diagnose') && S.state;
    diagnoseFeld.classList.toggle('aus', !zeigen);
    if (zeigen) diagnoseFeld.innerHTML = E.diagnose(bilderRate);
    else if (sofort) diagnoseFeld.innerHTML = '';
  }

  /* ---------------- Ton ---------------- */
  function tonAnmelden() {
    S.bei('meldung', function (d) { if (d.art) T.signal(d.art); });
    S.bei('vorgang', function (d) { T.vorgang(!!d); });
    S.bei('geladen', function () { T.signal('gut'); });
    S.bei('stufe', function () { T.signal('stufe'); });
    S.bei('anlasser', function (dauer) { T.anlasser(dauer); });
    S.bei('motor', function (an) { if (!an) T.motorStopp(); });
  }

  /** Was der Ton ueber das Gespann wissen muss. */
  function tonZustand(pausiert) {
    var tech = S.technik();
    var laeuft = S.motorLaeuft();
    return {
      tempo: pausiert ? 0 : Math.abs(S.gespann.v),
      vmax: tech.vmaxKmh / 3.6,
      gas: !pausiert && laeuft && (!!tasten.gas || mausGas()),
      bremse: !pausiert && (!!tasten.bremse || mausBremse()),
      motorAus: !laeuft,
      untergrund: tech.untergrund,
      ladung: tech.ladungsAnteil
    };
  }

  /** Taste E: tanken, Kanister holen oder den passenden Bildschirm öffnen. */
  function handeln() {
    var t = S.aktiverTraktor();
    if (t.f.tank <= 2 && !S.anTankstelle()) {
      var kan = S.kanister();
      if (kan.ok) {
        UI.meldung('Der Nachbar hat ' + kan.liter + ' l vorbeigebracht. ' + U.geld(kan.kosten) + ', und der Vormittag ist hin.', 'schlecht');
        UI.kopfleiste();
        return;
      }
    }
    if (S.anTankstelle()) {
      var erg = S.tanken();
      UI.meldung(erg.ok ? 'Getankt: ' + Math.round(erg.liter) + ' l für ' + U.geld(erg.kosten) + '.' : erg.grund,
                 erg.ok ? 'gut' : 'schlecht');
      UI.kopfleiste();
      return;
    }
    if (S.amHof()) { UI.oeffnen('hof'); return; }
    if (S.beimHaendler()) { UI.oeffnen('haendler'); return; }
  }

  /* ---------------- Schleife ---------------- */
  function schleife(jetzt) {
    var dt = Math.min((jetzt - letzteZeit) / 1000, 0.05);
    letzteZeit = jetzt;
    requestAnimationFrame(schleife);

    var pausiert = titelAn || UI.istOffen();

    // Der Anlasser dreht auch bei offenem Panel zu Ende; im Buch steht ein
    // Knopf dafuer, und der darf nicht ins Leere greifen.
    // Der Pruefstand haelt Kasse und Tank aus demselben Grund von hier aus
    // nach: gekauft und repariert wird im Panel, und dort steht schritt().
    if (!titelAn) {
      S.zuendungSchritt(dt);
      if (E) E.pflegen();
    }

    if (pausiert) R.mausZiel(null);

    if (!pausiert) {
      var eingabe = {
        gas: !!tasten.gas || mausGas(), bremse: !!tasten.bremse || mausBremse(),
        links: !!tasten.links, rechts: !!tasten.rechts,
        handbremse: !!tasten.handbremse
      };
      if (maus.an && maus.drin) {
        var m = mausLenkung(S.gespann);
        // Eine gedrueckte Pfeiltaste hat Vorrang: sie ist die eindeutigere
        // Ansage, etwa beim Rangieren dicht am Gebaeude.
        if (!eingabe.links && !eingabe.rechts) eingabe.lenkZiel = m.lenk;
        R.mausZiel(m.ziel);
      } else {
        R.mausZiel(null);
      }
      S.schritt(dt, eingabe);
      // Erst ab einem spuerbaren Anstoss, sonst rumpelt es beim Anlegen an
      // eine Wand in jedem Bild.
      if (S.gespann.stoss > 1.2) T.stoss(S.gespann.stoss);

      seitBoerse += dt;
      if (seitBoerse > 25) {           // etwa alle 50 Spielminuten Nachschub
        seitBoerse = 0;
        TG.auftraege.auffuellen(S.state);
        if (UI.istOffen()) UI.zeichnen();
      }

      seitSpeichern += dt;
      if (seitSpeichern > 20) { seitSpeichern = 0; S.speichern(); }
    }

    R.bild(pausiert ? 0 : dt, S);
    // Laeuft auch im Panel weiter: der Motor tuckert dann im Leerlauf.
    T.schritt(dt, tonZustand(pausiert));

    // Bildrate ueber ein halbes Sekundenfenster, fuers Zahlenfeld
    bilderZaehler++;
    bilderZeit += dt;
    if (bilderZeit > 0.5) {
      bilderRate = bilderZaehler / bilderZeit;
      bilderZaehler = 0; bilderZeit = 0;
    }

    seitAnzeige += dt;
    if (seitAnzeige > 0.1) {
      seitAnzeige = 0;
      UI.kopfleiste();
      R.minikarte(S);
      UI.hinweis(pausiert ? '' : hinweisText());
      if (E) diagnoseZeigen(false);
    }
  }

  /* ---------------- Kontexthinweis ---------------- */
  function hinweisText() {
    var s = S.state;
    var g = S.gespann;
    var t = S.aktiverTraktor();
    var a = S.aktiverAnhaenger();

    if (t.f.tank <= 2 && !S.anTankstelle()) {
      var k = S.kanisterKosten();
      return 'Der Tank ist leer. <b>E</b> ruft den Nachbarn — ' + k.liter + ' l für ' + U.geld(k.kosten) + '.';
    }

    if (S.anTankstelle()) {
      var k = S.tankKosten();
      if (k.liter > 0.5) return '<b>E</b> zum Tanken — ' + Math.round(k.liter) + ' l für ' + U.geld(k.kosten);
    }

    var c = S.ladeChance();
    if (c) {
      if (c.schief) return 'Die Zone ist eng. Stell das Gespann gerade hinein.';
      if (Math.abs(g.v) >= 0.35) return 'Anhalten, dann wird ' + (c.art === 'laden' ? 'geladen' : 'abgeladen') + '.';
      return '';   // Fortschrittsbalken erklärt sich selbst
    }

    // Danach aber vor allem anderen: ohne Zuendung bewegt sich nichts, und wer
    // das nicht weiss, haelt das Spiel fuer kaputt.
    if (S.motorOrgelt()) return 'Der Anlasser dreht …';
    if (!S.motorLaeuft()) return 'Der Motor steht still. <b>I</b> dreht den Anlasser.';

    if (g.knickWarnung && g.v < -0.2) return 'Der Anhänger knickt ein. Ein Stück vorwärts ziehen, dann neu ansetzen.';

    if (!a) return 'Ohne Anhänger geht nichts. Auf dem Hof kannst du einen ankoppeln — <b>H</b>.';

    if (S.amHof()) return '<b>H</b> öffnet den Hof: ankoppeln, tanken, instand setzen.';
    if (S.beimHaendler()) return '<b>K</b> öffnet den Händler.';

    if (!s.angenommen.length) return 'Keine Aufträge. <b>B</b> öffnet die Börse.';

    if (s.ladung) {
      var j = S.angenommenerAuftrag(s.ladung.jobId);
      if (j) return 'Geladen. Ziel: <b>' + U.html(W.ort(j.nach).name) + '</b>.';
    }

    var ziel = S.zielOrt();
    if (ziel) {
      var passend = s.angenommen.some(function (x) { return a && x.art === a.spec.art && x.geliefert < x.menge; });
      if (!passend) return 'Für deine offenen Aufträge brauchst du einen anderen Anhänger. Auf dem Hof wechseln — <b>H</b>.';
      return 'Abholen bei <b>' + U.html(ziel.name) + '</b>.';
    }
    return '';
  }

  function mausGas() { return maus.an && maus.gas; }
  function mausBremse() { return maus.an && maus.bremse; }

  /* Die Oberflaeche darf die Steuerung umstellen. Schalter dafuer stehen im
   * Titelbild und im Buch; beide reden ueber diese drei Funktionen. */
  TG.steuerung = {
    istAn: function () { return maus.an; },
    art: function () { return maus.an ? 'maus' : 'tasten'; },
    setzen: function (art) { return mausSetzen(art === 'maus'); },
    umschalten: mausUmschalten,
    // Nur zum Nachsehen von aussen, etwa in der Konsole.
    zustand: function () { return { an: maus.an, drin: maus.drin, x: maus.x, y: maus.y, gas: maus.gas, bremse: maus.bremse }; },
    lenkung: function () { return mausLenkung(S.gespann); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
