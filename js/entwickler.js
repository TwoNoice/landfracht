/* Landfracht — Prüfstand: der Entwicklermodus
 *
 * Ein Werkstattmodus zum Ausprobieren: die Kasse hat keinen Boden, der Tank
 * bleibt voll, nichts nutzt sich ab, und man springt an jeden Ort der Karte,
 * statt hinzufahren. Gedacht ist er zum Prüfen von Balance, Ladezonen und
 * Wegenetz, nicht zum Spielen.
 *
 * Zwei Dinge daran sind Absicht:
 *
 * - Der Modus steht in einem eigenen Speicherschlüssel, nicht im Spielstand.
 *   `spiel.laden()` wirft fremde Stände weg statt sie umzuschreiben, also
 *   würde jede Erweiterung des Spielstands alle alten Stände kosten. Ton und
 *   Steuerung liegen aus demselben Grund für sich.
 * - Der Schalter *Spielstand einfrieren* gehört dazu. Wer mit unerschöpflicher
 *   Kasse durch den Handel geht, hat sonst hinterher einen Betrieb, den er
 *   nicht erspielt hat, und der alte Stand ist überschrieben.
 *
 * Das Modul hängt an keinem anderen zur Ladezeit; `game.js`, `render.js` und
 * `main.js` fragen es zur Laufzeit über `TG.entwickler` ab, und wenn es fehlt,
 * läuft das Spiel unverändert weiter.
 */
var TG = window.TG || (window.TG = {});

TG.entwickler = (function () {
  var U = TG.util, D = TG.data, W = TG.welt, S = TG.spiel;

  var SPEICHER = 'landfracht_pruefstand';

  /* Untergrenze der Kasse. Nicht unendlich, sondern hoch und wieder
   * aufgefüllt: so bleibt am Kontostand ablesbar, was ein Kauf wirklich
   * gekostet hat, statt dass dort immer dieselbe Zahl steht. */
  var KASSE_SOLL = 1000000;
  var KASSE_MIN = 500000;

  var stand = {
    an: false,
    kasse: true,        // Konto wird nachgefüllt
    tank: true,         // Diesel geht nicht zur Neige
    heil: true,         // kein Verschleiß, kein Anstoßschaden
    fristlos: false,    // Aufträge platzen nicht
    sofort: false,      // Laden und Abladen in einem Augenblick
    schief: false,      // enge Zonen ohne Ausrichten
    diagnose: true,     // Zahlenfeld links oben
    linien: false,      // Wege, Stützpunkte, Zonen und Hüllen im Bild
    einfrieren: false,  // nichts in den Spielstand schreiben
    tempo: 1            // Faktor auf Höchstgeschwindigkeit und Leistung
  };

  /* Was die Schalter im Prüfstand anrichten. Steht als Tabelle da, damit
   * Panel und Erklärung nicht auseinanderlaufen. */
  var SCHALTER = [
    { id: 'kasse', name: 'Kasse ohne Boden', text: 'Fällt der Kontostand unter ' + U.geld(KASSE_MIN) + ', wird auf ' + U.geld(KASSE_SOLL) + ' aufgefüllt.' },
    { id: 'tank', name: 'Tank bleibt voll', text: 'Der Diesel wird nicht weniger. Der Motor geht nicht aus.' },
    { id: 'heil', name: 'Kein Verschleiß', text: 'Zustand bleibt, wo er ist — auch nach einem Anstoß.' },
    { id: 'fristlos', name: 'Fristen laufen leer', text: 'Angenommene Aufträge platzen nicht mehr, egal wie lange es dauert.' },
    { id: 'sofort', name: 'Sofort laden', text: 'Laden und Abladen dauern eine halbe Sekunde statt der vollen Zeit.' },
    { id: 'schief', name: 'Ausrichten egal', text: 'Enge Zonen (Paletten, Tieflader) nehmen das Gespann in jeder Lage an.' },
    { id: 'diagnose', name: 'Zahlenfeld', text: 'Ort, Kurs, Tempo, Untergrund und Ladelage links oben.' },
    { id: 'linien', name: 'Wege und Hüllen', text: 'Mittellinien, Stützpunkte, Ladezonen und die Gebäudehüllen, an denen die Kollision hängt.' },
    { id: 'einfrieren', name: 'Spielstand einfrieren', text: 'Es wird nichts mehr gespeichert. Zum Ausprobieren ohne Folgen — nach dem Neuladen ist alles wie vorher.' }
  ];

  /* ---------------- Zustand halten ---------------- */
  function laden() {
    var roh = null;
    try { roh = localStorage.getItem(SPEICHER); } catch (e) { /* privater Modus */ }
    if (!roh) return;
    try {
      var s = JSON.parse(roh);
      for (var k in stand) if (s[k] !== undefined) stand[k] = s[k];
    } catch (e) { /* kaputt: dann eben die Vorgaben */ }
    anzeigen();
  }

  function sichern() {
    try { localStorage.setItem(SPEICHER, JSON.stringify(stand)); } catch (e) { /* privater Modus */ }
  }

  function anzeigen() {
    document.body.classList.toggle('pruefstand', stand.an);
    var knopf = document.getElementById('kf-pruefstand');
    if (knopf) knopf.classList.toggle('aus', !stand.an);
    var feld = document.getElementById('diagnose');
    if (feld) feld.classList.toggle('aus', !(stand.an && stand.diagnose));
  }

  function an() { return stand.an; }

  /** Ist dieser Schalter scharf? Aus heißt aus, sobald der Modus aus ist. */
  function hat(name) { return stand.an && !!stand[name]; }

  /** Faktor auf Tempo und Leistung; 1, solange der Prüfstand aus ist. */
  function tempo() { return stand.an ? stand.tempo : 1; }

  function umschalten(soll) {
    stand.an = soll === undefined ? !stand.an : !!soll;
    anzeigen();
    sichern();
    return stand.an;
  }

  function schalten(name) {
    if (!(name in stand)) return;
    stand[name] = !stand[name];
    anzeigen();
    sichern();
    return stand[name];
  }

  /* ---------------- Jeden Bildschritt ----------------
   * Läuft aus `main.js` heraus, und zwar auch bei offenem Panel: gekauft und
   * repariert wird im Panel, und dort steht `schritt()` still. */
  function pflegen() {
    if (!stand.an || !S.state) return;
    if (stand.kasse && S.state.geld < KASSE_MIN) S.state.geld = KASSE_SOLL;
    if (stand.tank) {
      var t = S.aktiverTraktor();
      if (t) t.f.tank = S.tankGroesse();
    }
  }

  /* =============================================================
   *  Handgriffe
   * ============================================================= */
  /** Alles im Fuhrpark instand setzen und volltanken, ohne Rechnung. */
  function instandSetzen() {
    var s = S.state, n = 0;
    s.fuhrpark.forEach(function (f) {
      if (f.zustand < 100) n++;
      f.zustand = 100;
      if (f.typ === 'traktor') {
        var spec = D.traktor(f.id);
        if (spec) f.tank = spec.tank;
      }
    });
    // Der aktive Traktor bekommt den Tank inklusive Zusatzfass.
    var t = S.aktiverTraktor();
    if (t) t.f.tank = S.tankGroesse();
    return n;
  }

  /** Jeden Traktor, jeden Anhänger und jedes Ausrüstungsteil einmal — umsonst.
   *
   * Gekauft wird über die normalen Wege des Spiels, damit Aktivschaltung und
   * Gruppenregeln der Ausrüstung dieselben bleiben. Das Geld wird vorher
   * gutgeschrieben, sodass der Kontostand hinterher dort steht, wo er war. */
  function alleAnschaffen() {
    var s = S.state, n = 0;

    D.traktoren.forEach(function (sp) {
      if (s.fuhrpark.some(function (f) { return f.typ === 'traktor' && f.id === sp.id; })) return;
      s.geld += sp.preis;
      if (S.kaufen('traktor', sp.id).ok) n++;
    });
    D.anhaenger.forEach(function (sp) {
      if (s.fuhrpark.some(function (f) { return f.typ === 'anhaenger' && f.id === sp.id; })) return;
      s.geld += sp.preis;
      if (S.kaufen('anhaenger', sp.id).ok) n++;
    });
    // Ausrüstung sitzt in Gruppen: ein neues Teil wirft das alte derselben
    // Gruppe raus. Alles kaufen heißt also, dass aus jeder Gruppe nur das
    // zuletzt gekaufte Stück hängen bleibt — genau wie im Handel. Deshalb
    // wird gezählt, was hinterher dran ist, und nicht, was gekauft wurde.
    D.ausruestung.forEach(function (x) {
      if (S.hatAusruestung(x.id)) return;
      s.geld += x.preis;
      S.kaufeAusruestung(x.id);
    });
    return { fahrzeuge: n, teile: s.ausruestung.length };
  }

  /** Der Auftrag, der oben in der Kopfleiste steht, gilt als geliefert. */
  function auftragAbrechnen() {
    var j = S.anzeigeAuftrag();
    if (!j) return { ok: false, grund: 'Kein Auftrag angenommen.' };
    if (S.state.ladung && S.state.ladung.jobId === j.id) S.state.ladung = null;
    j.geliefert = j.menge;
    S.abrechnen(j);
    return { ok: true, job: j };
  }

  /** Börse leeren und neu würfeln. */
  function boerseNeu() {
    S.state.boerse.length = 0;
    return TG.auftraege.auffuellen(S.state);
  }

  /**
   * Gespann an einen Ort versetzen.
   *
   * Möglichst in die Ladezone, die zum angehängten Anhänger passt, und mit
   * deren Ausrichtung: dann steht das Gespann nach dem Sprung ladebereit da
   * und nicht schief in einer engen Zone. Ohne passende Zone geht es neben
   * die Ortsmitte — dort steht sonst leicht ein Gebäude.
   */
  function springen(ortId) {
    var o = W.ort(ortId);
    if (!o) return { ok: false, grund: 'Diesen Ort gibt es nicht.' };
    var a = S.aktiverAnhaenger();
    var zn = a ? W.zoneFuer(o, a.spec.art) : (o.zonen[0] || null);
    var g = S.gespann;

    if (zn) {
      // Die Kupplung sitzt hinter der Traktorachse; der Anhänger muss in die
      // Zone, nicht der Traktor. Also ein Stück in Fahrtrichtung vorsetzen.
      var vor = a ? 6 + a.spec.geo.b : 0;
      g.setzen(zn.x + Math.cos(zn.rot) * vor, zn.y + Math.sin(zn.rot) * vor, zn.rot);
    } else {
      g.setzen(o.x + 40, o.y, -Math.PI / 2);
    }
    return { ok: true, ort: o, zone: !!zn };
  }

  /** Gespann dorthin versetzen, wo der Zeiger auf der Karte steht. */
  function versetzen(x, y) {
    S.gespann.setzen(x, y, S.gespann.h);
    return { ok: true };
  }

  /* =============================================================
   *  Zahlenfeld
   * ============================================================= */
  function diagnose(bilder) {
    var s = S.state;
    if (!s) return '';
    var g = S.gespann, t = S.aktiverTraktor(), a = S.aktiverAnhaenger();
    var u = W.untergrundAn(g.x, g.y);
    var c = S.ladeChance();
    var zn = S.aktuelleZone();
    var grad = function (r) { return Math.round(r * 180 / Math.PI); };

    var h = '';
    h += zeile('Bilder', bilder ? bilder.toFixed(0) + '/s' : '–');
    h += zeile('Ort', Math.round(g.x) + ' / ' + Math.round(g.y));
    h += zeile('Kurs', grad(g.h) + '° · Anh ' + grad(g.th) + '°');
    h += zeile('Knick', grad(g.knickwinkel()) + '°' + (g.knickWarnung ? ' ⚠' : ''));
    h += zeile('Tempo', (Math.abs(g.v) * 3.6).toFixed(1) + ' km/h · Lenk ' + grad(g.lenk) + '°');
    h += zeile('Untergrund', W.untergruende[u].name + (W.imGebaeude(g.x, g.y, 1.0) ? ' · im Gebäude!' : ''));
    h += zeile('Traktor', t ? t.spec.name + ' · ' + Math.round(t.f.zustand) + ' % · ' + Math.round(t.f.tank) + ' l' : '–');
    h += zeile('Anhänger', a ? a.spec.name + ' · ' + (s.ladung ? U.zahl(s.ladung.menge) + ' ' + D.waren[s.ladung.ware].name : 'leer') : 'keiner');
    h += zeile('Zone', zn ? zn.ort.kurz + (zn.schief ? ' (schief)' : '') : '–');
    h += zeile('Ladechance', c ? c.art + ' ' + U.zahl(c.menge) : '–');
    h += zeile('Zeit', 'Tag ' + S.tag() + ' ' + U.uhrzeit(s.zeit) + ' · Stufe ' + S.stufe());
    h += zeile('Aufträge', s.angenommen.length + ' laufend · ' + s.boerse.length + ' in der Börse');
    var uw = TG.umwelt;
    h += zeile('Wetter', uw.wetter(s).name + ' bis ' + U.uhrzeit(s.wetter.bis) + ' · ' + uw.saison(s).name);
    var lz = S.ladungsZustand();
    h += zeile('Quer', g.querBeschl.toFixed(2) + ' m/s²' + (a ? ' · Grenze ' + (S.SCHADEN.querGrund * a.spec.kurve).toFixed(2) : '') +
               (lz ? ' · Schaden ' + (lz.schaden * 100).toFixed(1) + ' %' : ''));
    if (stand.tempo !== 1) h += zeile('Tempofaktor', '×' + stand.tempo);
    return h;
  }

  function zeile(k, v) {
    return '<span class="k">' + U.html(k) + '</span><span class="v">' + U.html(String(v)) + '</span>';
  }

  /* =============================================================
   *  Panel
   * ============================================================= */
  function panel() {
    var s = S.state;
    var h = '';

    h += '<div class="hinweisbox">Der Prüfstand ist eine Werkbank, kein Spielstand. ' +
         'Was hier passiert, landet im normalen Spielstand — außer du frierst ihn unten ein. ' +
         '<b>Strg+Alt+E</b> schaltet den ganzen Modus wieder ab.</div>';

    h += '<div class="ueberschrift">Schalter</div>';
    SCHALTER.forEach(function (sc) {
      var scharf = !!stand[sc.id];
      h += '<div class="karte pruef' + (scharf ? ' angenommen' : '') + '">' +
           '<div class="kopf"><span class="ware">' + U.html(sc.name) + '</span>' +
           '<button class="tat' + (scharf ? ' haupt' : '') + '" data-tat="p-schalter" data-wert="' + sc.id + '">' +
           (scharf ? 'an' : 'aus') + '</button></div>' +
           '<div class="weg">' + U.html(sc.text) + '</div></div>';
    });

    h += '<div class="ueberschrift">Tempo</div>';
    h += '<div class="karte"><div class="weg">Faktor auf Höchstgeschwindigkeit und Motorleistung. ' +
         'Zum Abfahren der Karte gedacht — die Wege sind für ×1 gebaut, in der Kurve fliegt das ' +
         'Gespann bei ×4 aus der Fahrbahn.</div>' +
         '<div class="knopfleiste" style="margin-top:8px">';
    [1, 2, 4, 8].forEach(function (f) {
      h += '<button class="tat' + (stand.tempo === f ? ' haupt' : '') + '" data-tat="p-tempo" data-wert="' + f + '">×' + f + '</button>';
    });
    h += '</div></div>';

    h += '<div class="ueberschrift">Kasse, Zeit und Ruf</div>';
    h += reihe('Kontostand', U.geld(s.geld));
    h += reihe('Ruf', U.zahl(s.ruf) + ' · Stufe ' + S.stufe());
    h += reihe('Zeit', 'Tag ' + S.tag() + ', ' + U.uhrzeit(s.zeit));
    h += '<div class="karte"><div class="knopfleiste">' +
         '<button class="tat" data-tat="p-geld" data-wert="100000">+ ' + U.geld(100000) + '</button>' +
         '<button class="tat" data-tat="p-zeit" data-wert="60">+ 1 Stunde</button>' +
         '<button class="tat" data-tat="p-zeit" data-wert="1440">+ 1 Tag</button>' +
         '</div>';
    h += '<div class="weg" style="margin-top:10px">Ruf auf eine Stufe setzen — schaltet die Waren frei, ' +
         'die zu ihr gehören:</div>';
    h += '<div class="knopfleiste" style="margin-top:6px">';
    D.stufen.forEach(function (x) {
      h += '<button class="tat' + (S.stufe() === x.stufe ? ' haupt' : '') + '" data-tat="p-ruf" data-wert="' + x.ruf + '">Stufe ' + x.stufe + '</button>';
    });
    h += '</div></div>';

    h += '<div class="ueberschrift">Wetter und Ereignisse</div>';
    h += '<div class="karte"><div class="weg">Jetzt: <b>' + U.html(TG.umwelt.wetter(s).name) + '</b>, ' +
         U.html(TG.umwelt.saison(s).name) + '. Setzt das Wetter sofort; danach wechselt es wie gewohnt.</div>' +
         '<div class="knopfleiste" style="margin-top:8px">';
    Object.keys(TG.umwelt.wetterArten).forEach(function (k) {
      h += '<button class="tat' + (s.wetter.art === k ? ' haupt' : '') + '" data-tat="p-wetter" data-wert="' + k + '">' +
           U.html(TG.umwelt.wetterArten[k].name) + '</button>';
    });
    h += '</div><div class="weg" style="margin-top:10px">Ein Ereignis jetzt auslösen:</div>' +
         '<div class="knopfleiste" style="margin-top:6px">';
    Object.keys(TG.umwelt.ereignisArten).forEach(function (k) {
      h += '<button class="tat" data-tat="p-ereignis" data-wert="' + k + '">' + U.html(k) + '</button>';
    });
    h += '<button class="tat" data-tat="p-ziele">Tagesziele neu</button>';
    h += '</div></div>';

    h += '<div class="ueberschrift">Fuhrpark und Aufträge</div>';
    h += '<div class="karte"><div class="knopfleiste">' +
         '<button class="tat" data-tat="p-instand">Alles instand setzen</button>' +
         '<button class="tat" data-tat="p-fuhrpark">Alles anschaffen</button>' +
         '</div>';
    h += '<div class="knopfleiste" style="margin-top:8px">' +
         '<button class="tat" data-tat="p-boerse">Börse neu würfeln</button>' +
         '<button class="tat" data-tat="p-fertig"' + (S.anzeigeAuftrag() ? '' : ' disabled') + '>Laufenden Auftrag abrechnen</button>' +
         '</div>';
    h += '<div class="weg" style="margin-top:8px">„Alles anschaffen" kauft jeden Traktor, jeden Anhänger ' +
         'und jedes Ausrüstungsteil einmal und schreibt den Preis vorher gut — der Kontostand bleibt stehen.</div>';
    h += '</div>';

    h += '<div class="ueberschrift">Springen</div>';
    h += '<div class="karte"><div class="weg">Das Gespann wird versetzt, nach Möglichkeit gleich in die ' +
         'Ladezone, die zum angehängten Anhänger passt, und richtig ausgerichtet. Taste <b>T</b> versetzt ' +
         'es dorthin, wo der Mauszeiger auf der Karte steht.</div>';
    h += '<div class="knopfleiste" style="margin-top:8px">';
    var ziel = S.zielOrt();
    if (ziel) h += '<button class="tat haupt" data-tat="p-springen" data-ort="' + ziel.id + '">Zum Ziel: ' + U.html(ziel.kurz) + '</button>';
    W.orte.forEach(function (o) {
      if (ziel && o.id === ziel.id) return;
      h += '<button class="tat" data-tat="p-springen" data-ort="' + o.id + '">' + U.html(o.kurz) + '</button>';
    });
    h += '</div></div>';

    h += '<div class="ueberschrift">Tasten</div>';
    h += '<div class="karte">' +
         '<div class="reihe"><span class="k">Strg + Alt + E</span><span class="v">Prüfstand an und aus</span></div>' +
         '<div class="reihe"><span class="k">P</span><span class="v">Dieses Fenster</span></div>' +
         '<div class="reihe"><span class="k">T</span><span class="v">Gespann zum Mauszeiger</span></div>' +
         '<div class="reihe"><span class="k">O</span><span class="v">Wege und Hüllen im Bild</span></div>' +
         '<div class="reihe"><span class="k">Z</span><span class="v">Zahlenfeld</span></div>' +
         '</div>';

    h += '<div class="trenner"></div>';
    h += '<div class="knopfleiste"><button class="tat warn" data-tat="p-aus">Prüfstand verlassen</button></div>';
    return h;
  }

  function reihe(k, v) {
    return '<div class="reihe"><span class="k">' + U.html(k) + '</span><span class="v">' + U.html(v) + '</span></div>';
  }

  /**
   * Klicks aus dem Panel. `ui.js` reicht jeden Knopf zuerst hier durch und
   * macht erst weiter, wenn hier nichts zuständig war — deshalb tragen alle
   * Taten des Prüfstands das Kürzel `p-`.
   *
   * Rückgabe: true, wenn behandelt.
   */
  function klick(b, melden) {
    var tat = b.getAttribute('data-tat');
    if (!tat || tat.slice(0, 2) !== 'p-') return false;
    var s = S.state, erg;

    if (tat === 'p-schalter') {
      var name = b.getAttribute('data-wert');
      var jetzt = schalten(name);
      var sc = SCHALTER.filter(function (x) { return x.id === name; })[0];
      melden((sc ? sc.name : name) + ': ' + (jetzt ? 'an' : 'aus'));
    } else if (tat === 'p-tempo') {
      stand.tempo = Number(b.getAttribute('data-wert')) || 1;
      sichern();
      melden('Tempofaktor ×' + stand.tempo + '.');
    } else if (tat === 'p-geld') {
      s.geld += Number(b.getAttribute('data-wert')) || 0;
      melden('Gutgeschrieben. Kontostand ' + U.geld(s.geld) + '.', 'gut');
    } else if (tat === 'p-zeit') {
      S.zeitVoran(Number(b.getAttribute('data-wert')) || 0);
      melden('Uhr steht jetzt auf Tag ' + S.tag() + ', ' + U.uhrzeit(s.zeit) + '.');
    } else if (tat === 'p-ruf') {
      s.ruf = Number(b.getAttribute('data-wert')) || 0;
      melden('Ruf auf ' + U.zahl(s.ruf) + ' gesetzt — Stufe ' + S.stufe() + '.', 'gut');
    } else if (tat === 'p-instand') {
      var n = instandSetzen();
      melden(n ? n + (n === 1 ? ' Fahrzeug' : ' Fahrzeuge') + ' instand gesetzt und volle Tanks.' : 'Es war schon alles heil.', 'gut');
    } else if (tat === 'p-fuhrpark') {
      var k = alleAnschaffen();
      melden(k.fahrzeuge
        ? k.fahrzeuge + ' Fahrzeuge geschenkt bekommen. Ausrüstung: ' + k.teile +
          ' Teile dran (je Gruppe bleibt eins).'
        : 'Der Fuhrpark ist schon vollständig.', 'gut');
    } else if (tat === 'p-boerse') {
      melden(boerseNeu() >= 0 ? 'Börse neu gewürfelt: ' + s.boerse.length + ' Angebote.' : 'Nichts zu würfeln.');
    } else if (tat === 'p-fertig') {
      erg = auftragAbrechnen();
      if (!erg.ok) melden(erg.grund, 'schlecht');
    } else if (tat === 'p-springen') {
      erg = springen(b.getAttribute('data-ort'));
      melden(erg.ok
        ? 'Versetzt nach ' + erg.ort.name + (erg.zone ? ' — direkt in die Ladezone.' : '.')
        : erg.grund, erg.ok ? 'gut' : 'schlecht');
    } else if (tat === 'p-wetter') {
      TG.umwelt.wetterSetzen(s, b.getAttribute('data-wert'));
    } else if (tat === 'p-ereignis') {
      TG.umwelt.ausloesen(s, b.getAttribute('data-wert'));
    } else if (tat === 'p-ziele') {
      TG.umwelt.zieleWuerfeln(s);
      melden('Tagesziele neu gewürfelt.');
    } else if (tat === 'p-aus') {
      umschalten(false);
      melden('Prüfstand aus. Mit Strg+Alt+E kommt er wieder.');
    } else {
      return false;
    }
    return true;
  }

  laden();

  return {
    an: an, hat: hat, tempo: tempo, umschalten: umschalten, schalten: schalten,
    pflegen: pflegen, anzeigen: anzeigen,
    panel: panel, klick: klick, diagnose: diagnose,
    springen: springen, versetzen: versetzen,
    instandSetzen: instandSetzen, alleAnschaffen: alleAnschaffen,
    boerseNeu: boerseNeu, auftragAbrechnen: auftragAbrechnen,
    // Nur zum Nachsehen aus der Konsole
    get stand() { return stand; }
  };
})();
