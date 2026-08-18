/* Landfracht — Steuerung, Spielschleife, Hinweise */
(function () {
  var U = TG.util, D = TG.data, W = TG.welt, S = TG.spiel, R = TG.zeichnen, UI = TG.ui, T = TG.ton;

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
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      document.getElementById('touch').classList.remove('aus');
    }

    UI.kopfleiste();
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
    UI.kopfleiste();
  }

  /* ---------------- Eingaben ---------------- */
  function bindeEingaben() {
    window.addEventListener('keydown', function (e) {
      if (titelAn || e.repeat) return;
      var code = e.code;

      if (code === 'Escape') { UI.schliessen(); return; }
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      // Wer gerade am Kreditschieber steht, will damit nicht lenken
      var f = document.activeElement;
      if (f && (f.tagName === 'INPUT' || f.tagName === 'TEXTAREA')) return;

      // Panels
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
      if (code === 'NumpadAdd' || code === 'Equal' || code === 'BracketRight') { R.zoom(1); return; }
      if (code === 'NumpadSubtract' || code === 'Minus' || code === 'Slash') { R.zoom(-1); return; }

      if (TASTEN[code]) { tasten[TASTEN[code]] = true; e.preventDefault(); }
    });

    window.addEventListener('keyup', function (e) {
      if (TASTEN[e.code]) { tasten[TASTEN[e.code]] = false; e.preventDefault(); }
    });

    window.addEventListener('blur', function () { tasten = {}; });

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

  /* ---------------- Ton ---------------- */
  function tonAnmelden() {
    S.bei('meldung', function (d) { if (d.art) T.signal(d.art); });
    S.bei('vorgang', function (d) { T.vorgang(!!d); });
    S.bei('geladen', function () { T.signal('gut'); });
    S.bei('stufe', function () { T.signal('stufe'); });
  }

  /** Was der Ton ueber das Gespann wissen muss. */
  function tonZustand(pausiert) {
    var tech = S.technik();
    var t = S.aktiverTraktor();
    var leer = t.f.tank <= 0.05;
    return {
      tempo: pausiert ? 0 : Math.abs(S.gespann.v),
      vmax: tech.vmaxKmh / 3.6,
      gas: !pausiert && !!tasten.gas && !leer,
      bremse: !pausiert && !!tasten.bremse,
      motorAus: leer,
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

    if (!pausiert) {
      var eingabe = {
        gas: !!tasten.gas, bremse: !!tasten.bremse,
        links: !!tasten.links, rechts: !!tasten.rechts,
        handbremse: !!tasten.handbremse
      };
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

    seitAnzeige += dt;
    if (seitAnzeige > 0.1) {
      seitAnzeige = 0;
      UI.kopfleiste();
      R.minikarte(S);
      UI.hinweis(pausiert ? '' : hinweisText());
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
