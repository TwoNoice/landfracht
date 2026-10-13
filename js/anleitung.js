/* Landfracht — Einweisung: ein Rundgang durch alle Anzeigen und Bildschirme
 *
 * Laeuft ueber dem stehenden Spiel. Jeder Schritt hebt eine Stelle der
 * Oberflaeche hervor -- ein Rahmen mit einem grossen Schatten drumherum, der
 * den Rest abdunkelt -- und erklaert sie in einer Karte daneben. Bildschirme
 * wie Boerse und Hof werden dafuer echt geoeffnet, also zeigt die Einweisung
 * den eigenen Betrieb und nicht eine Attrappe.
 *
 * Eine durchsichtige Sperrflaeche liegt ueber allem ausser der Karte: der
 * Rundgang zeigt, er bedient nicht. Wer waehrenddessen "Annehmen" klicken
 * koennte, haette danach einen Auftrag am Hals, dessen Frist schon laeuft.
 *
 * Die Uhr steht, solange er laeuft: main.js fragt `laeuft()` an denselben
 * Stellen wie das offene Panel. Tasten nimmt der Rundgang selbst ab und
 * gibt sie nicht weiter.
 *
 * Wie entwickler.js ist er abnehmbar: ohne diese Datei fehlt nur der Knopf.
 */
var TG = window.TG || (window.TG = {});

TG.anleitung = (function () {
  var S = TG.spiel, UI = TG.ui, R = TG.zeichnen;

  var aktiv = false, nr = 0, opt = {};
  var el = null;
  var zeitgeber = 0;

  /* ---------------- Ziele ----------------
   * Ein Ziel ist ein Selektor, eine Liste davon (die Huelle um alle) oder
   * eine Funktion, die ein Element oder ein Rechteck liefert. Fehlt das Ziel
   * auf der Seite, steht die Karte in der Mitte. */
  function block(id) {
    return function () { var e = document.getElementById(id); return e ? e.closest('.kf-block') : null; };
  }

  /** Das Gespann auf dem Bildschirm, als Rechteck. */
  function gespann() {
    var g = S.gespann;
    var p = R.welt2schirm(g.x, g.y);
    var r = Math.max(46, 9 * R.kamera.scale);
    return { left: p.x - r, top: p.y - r, width: 2 * r, height: 2 * r };
  }

  function ersteKarte() {
    return document.querySelector('#panel-inhalt .karte:not(.angenommen) [data-tat="annehmen"]')
      ? document.querySelector('#panel-inhalt .karte:not(.angenommen) [data-tat="annehmen"]').closest('.karte')
      : null;
  }

  /* ---------------- Die Schritte ---------------- */
  var schritte = [
    { titel: 'Willkommen auf Hof Lindenbach',
      text: 'Diese Einweisung zeigt dir einmal alles, was zum Betrieb gehört: die Anzeigen am Rand, ' +
            'die fünf Bildschirme und die Handgriffe beim Fahren. Die Uhr steht still, solange sie läuft.' +
            '<br><br>Weiter mit <b>→</b> oder <b>Enter</b>, zurück mit <b>←</b>, <b>Esc</b> beendet sie.' },

    { titel: 'Geld', ziel: block('kf-geld'),
      text: 'Dein Kontostand. Lohn kommt bei jeder Lieferung herein; Diesel, Reparaturen, Strafen und ' +
            'Kreditraten gehen ab. Unter null darfst du rutschen — kaufen kannst du dann aber nichts.' },

    { titel: 'Ruf', ziel: block('kf-ruf'),
      text: 'Ruf ist die eigentliche Fortschrittswährung. Pünktliche Lieferungen bringen ihn, Verspätungen ' +
            'und abgebrochene Aufträge kosten ihn. Jede <b>Ruf-Stufe</b> schaltet neue Auftragsarten frei; ' +
            'in Klammern steht, wie viel bis zur nächsten fehlt.' },

    { titel: 'Uhr', ziel: block('kf-zeit'),
      text: 'Tag und Uhrzeit. Ein Spieltag dauert rund 36 echte Minuten. Jede Fahrt kostet Zeit, und an der ' +
            'Uhr hängen die Fristen deiner Aufträge. Mit jeder neuen Woche ändert sich der Dieselpreis.' },

    { titel: 'Diesel und Zustand', ziel: [block('kf-diesel'), block('kf-zustand')],
      text: 'Links der Tank, rechts der Zustand des Schleppers. Geht der Tank leer, geht der Motor aus. ' +
            'Ein verschlissener Schlepper ist langsamer, braucht mehr Diesel und hat öfter eine ' +
            '<b>Reifenpanne</b>. Getankt und instand gesetzt wird auf dem Hof.' },

    { titel: 'Der laufende Auftrag', ziel: '#kf-auftrag',
      text: 'Hier steht der dringendste deiner Aufträge: was, wohin, und wie viel Zeit noch bleibt. ' +
            'Gelb wird es knapp, rot ist die Frist schon gerissen.' },

    { titel: 'Die fünf Bildschirme', ziel: '.kf-block.knoepfe',
      text: '<b>Karte</b>, <b>Börse</b>, <b>Hof</b>, <b>Händler</b> und <b>Buch</b> — jeder mit seiner Taste: ' +
            'N, B, H, K und U. Solange einer offen ist, steht die Uhr. Gleich gehen wir sie der Reihe nach durch.' },

    { titel: 'Wetter und Jahreszeit', ziel: ['#lage-wetter', '#lage-ereignisse'],
      text: 'Regen und Schnee nehmen dem Gespann Halt und Tempo, vor allem auf Feldwegen und im Gelände; ' +
            'bei Nebel sieht man kaum über die nächste Kurve. Hinter „danach" steht die Vorhersage.' +
            '<br><br>Alle drei Tage wechselt die <b>Jahreszeit</b>, und mit ihr, welche Waren gefragt sind und ' +
            'besser bezahlt werden. Darunter erscheinen <b>Ereignisse</b>: ein Fest, bei dem ein Ort mehr zahlt, ' +
            'eine Werkstatt mit Rabatt, eine Sonderfahrt, eine Unwetterwarnung.' },

    { titel: 'Tagesziele', ziel: '#lage-ziele',
      text: 'Jeden Tag drei neue Ziele — etwa eine Menge abliefern, pünktlich sein oder an einen bestimmten Ort ' +
            'fahren. Jedes bringt Geld und Ruf, alle drei zusammen einen Bonus obendrauf. Um Mitternacht ' +
            'verfallen sie.' },

    { titel: 'Tacho', ziel: '#tacho',
      text: 'Tempo, Fahrtrichtung (<b>V</b>orwärts, <b>N</b>, <b>R</b>ückwärts), der Motor und was geladen ist. ' +
            'Der Schlepper steht immer kalt da — mit <b>I</b> drehst du den Anlasser. Hinter der Ladung steht, ' +
            'wie heil sie noch ist.' },

    { titel: 'Fahren', ziel: gespann,
      text: '<b>Pfeiltasten</b> oder <b>WASD</b>: hoch gibt Gas, runter bremst und fährt im Stand rückwärts, ' +
            'links und rechts lenken. Die <b>Leertaste</b> ist die Handbremse. Mausrad oder <b>+</b>/<b>−</b> zoomt.' +
            '<br><br>Mit <b>L</b> kommt die Maus dazu: dann lenkt der Traktor zum Zeiger, die linke Taste gibt Gas, ' +
            'die rechte bremst. Die Tasten bleiben daneben scharf.' },

    { titel: 'Der Anhänger', ziel: gespann,
      text: 'Der Anhänger hängt hinten an der Kupplung und knickt beim Lenken ein. Rückwärts läuft er zur ' +
            'Gegenseite aus — kleine Lenkbewegungen, und wenn er zu weit einknickt, ein Stück vorziehen und ' +
            'neu ansetzen.' },

    { titel: 'Minikarte', ziel: '#minikarte',
      text: 'Die ganze Gegend im Kleinen. Dein Gespann ist der rote Punkt, das Ziel des Auftrags der gelbe, ' +
            'der eigene Hof der grüne. Liegt das Ziel außerhalb des Bildes, zeigt ein Pfeil am Rand dorthin.' },

    { titel: 'Karte', panel: 'karte', ziel: '#panel',
      text: '<b>N</b> öffnet das Kartenblatt: das ganze Land mit Wegen, Feldern und Orten. Das Mausrad zieht ' +
            'heran, Ziehen verschiebt, ein Doppelklick zeigt wieder alles.' },

    { titel: 'Auftragsbörse', panel: 'boerse', ziel: '#panel',
      text: '<b>B</b> öffnet die Börse. Oben stehen deine laufenden Aufträge — bis zu fünf auf einmal —, ' +
            'darunter die Angebote. Stehst du gerade an einem Ort, kommen die Fuhren von dort zuerst: ' +
            'so muss die Rückfahrt nicht leer sein.' },

    { titel: 'Eine Auftragskarte', panel: 'boerse', ziel: ersteKarte, rollen: true,
      text: 'Ware und Menge, Lohn, Start und Ziel. Darunter Entfernung, Zeitfenster, die Strafe bei ' +
            'Verspätung und der Ruf, den der Auftrag bringt. Die Marken sagen, was besonders ist: gut oder ' +
            'mager bezahlt, enges Fenster, Rückfracht, Saisonware, nässeempfindlich, Sonderfahrt.' },

    { titel: 'Annehmen und liefern', panel: 'boerse',
      ziel: function () { var k = ersteKarte(); return k ? k.querySelector('[data-tat="annehmen"]') : null; }, rollen: true,
      text: 'Annehmen, zum Start fahren, laden, zum Ziel fahren, abladen — das ist die ganze Fuhre. Ab dem ' +
            'Annehmen läuft die Frist. Wer abbricht oder sie weit überzieht, zahlt Strafe und verliert Ruf. ' +
            'Für jede Auftragsart braucht es den passenden Anhänger.' },

    { titel: 'Hof', panel: 'hof', ziel: '#panel',
      text: '<b>H</b> öffnet den Hof, deinen Betrieb. Hier tankst du, koppelst Anhänger an und ab, steigst auf ' +
            'einen anderen Traktor und setzt alles instand. Ankoppeln und Reparieren geht nur, wenn du ' +
            'auch auf dem Hof stehst.' },

    { titel: 'Händler', panel: 'haendler', ziel: '#panel',
      text: '<b>K</b> öffnet Landtechnik Vosskamp: Traktoren, Anhänger für jede Auftragsart und Ausrüstung — ' +
            'Reifen, Frontgewicht, größerer Tank und die <b>Abdeckplane</b> gegen Regen. Ansehen geht von ' +
            'überall, gekauft und verkauft wird vor Ort im Süden der Karte.' },

    { titel: 'Buch', panel: 'buch', ziel: '#panel',
      text: '<b>U</b> öffnet das Buch: Tagesziele, Wetter mit Vorhersage und was die Jahreszeit verlangt, ' +
            'Kasse und Kredit, die Statistik, die Ruf-Stufen und die Einstellungen für Steuerung, Motor und Ton. ' +
            'Ganz unten lässt sich diese Einweisung jederzeit wieder starten.' },

    { titel: 'Laden und Abladen', ziel: gespann,
      text: 'Am Startort ist eine <b>Ladezone</b> markiert. Stell den Anhänger hinein und halte an — geladen ' +
            'wird von selbst, ein Balken zeigt den Fortschritt. Am Ziel wird genauso abgeladen. Zonen für ' +
            'Paletten und Fahrzeuge sind eng: dort muss das Gespann gerade drinstehen.' },

    { titel: 'Ladungsschaden', ziel: '#tacho',
      text: 'Ladung leidet, wenn du zu schnell in die Kurve gehst, irgendwo anstößt oder durchs Gelände ' +
            'rumpelst. Ballen und Paletten sind empfindlich, Schüttgut verzeiht viel. Stroh, Heu und Säcke ' +
            'werden im Regen nass, außer unter einer Plane. Jedes Prozent Schaden kostet ein Prozent Lohn.' },

    { titel: 'Taste E und der Tank', ziel: gespann,
      text: '<b>E</b> ist der Handgriff für alles vor Ort: an der Tankstelle tanken, auf dem Hof und beim Händler ' +
            'den Bildschirm öffnen. Bleibst du mit leerem Tank liegen, bringt der Nachbar auf <b>E</b> einen ' +
            'Kanister — teuer, und der Vormittag ist hin.' },

    { titel: 'Hinweise und Meldungen',
      text: 'Unten in der Mitte steht beim Fahren immer, was als Nächstes zu tun ist; oben erscheinen Meldungen ' +
            'zu Lieferungen, Wetter und Ereignissen. <b>M</b> schaltet den Ton, <b>Esc</b> schließt jeden ' +
            'Bildschirm.<br><br>Das war die Einweisung. In der Börse wartet ein erster Auftrag — viel Erfolg!' }
  ];

  /* ---------------- Aufbau ---------------- */
  function bauen() {
    if (el) return;
    var d = document.createElement('div');
    d.id = 'einweisung';
    d.className = 'aus';
    d.innerHTML =
      '<div class="ew-sperre"></div>' +
      '<div class="ew-spot"></div>' +
      '<div class="ew-karte" role="dialog" aria-live="polite">' +
        '<div class="ew-kopf"><span class="ew-zaehler"></span>' +
          '<button type="button" class="ew-zu" title="Einweisung beenden (Esc)">Beenden ✕</button></div>' +
        '<h3 class="ew-titel"></h3>' +
        '<div class="ew-text"></div>' +
        '<div class="ew-balken"><i></i></div>' +
        '<div class="ew-knoepfe">' +
          '<button type="button" class="ew-zurueck">← Zurück</button>' +
          '<button type="button" class="ew-weiter haupt">Weiter →</button>' +
        '</div>' +
      '</div>';
    document.getElementById('spiel').appendChild(d);
    el = {
      kasten: d,
      sperre: d.querySelector('.ew-sperre'),
      spot: d.querySelector('.ew-spot'),
      karte: d.querySelector('.ew-karte'),
      zaehler: d.querySelector('.ew-zaehler'),
      titel: d.querySelector('.ew-titel'),
      text: d.querySelector('.ew-text'),
      balken: d.querySelector('.ew-balken i'),
      zurueck: d.querySelector('.ew-zurueck'),
      weiter: d.querySelector('.ew-weiter'),
      zu: d.querySelector('.ew-zu')
    };
    el.zurueck.addEventListener('click', function () { gehe(nr - 1); });
    el.weiter.addEventListener('click', function () {
      if (nr >= schritte.length - 1) fertig(true); else gehe(nr + 1);
    });
    el.zu.addEventListener('click', function () { fertig(false); });
    window.addEventListener('keydown', taste, true);
    window.addEventListener('resize', function () { if (aktiv) platzieren(); });
    // Ist das Panel fertig hereingeglitten, steht das Ziel endgueltig.
    document.getElementById('panel').addEventListener('transitionend', function () { if (aktiv) platzieren(); });
  }

  function taste(e) {
    if (!aktiv) return;
    var c = e.code;
    if (c === 'Escape') fertig(false);
    else if (c === 'ArrowRight' || c === 'Enter' || c === 'NumpadEnter' || c === 'Space') {
      if (nr >= schritte.length - 1) fertig(true); else gehe(nr + 1);
    } else if (c === 'ArrowLeft') gehe(nr - 1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  /* ---------------- Ablauf ---------------- */
  /**
   * opt.ausSpiel  aus dem laufenden Spiel gestartet (Buch) statt vom Titelbild
   * opt.los       Rueckruf fuer den Knopf "Spiel starten" am Ende; fehlt er,
   *               steht dort "Fertig"
   * opt.ende      Rueckruf beim Abbrechen oder Fertigwerden ohne `los`
   */
  function starten(o) {
    opt = o || {};
    bauen();
    aktiv = true;
    // Die Kamera folgt nur, solange Bilder mit Zeit gezeichnet werden; vor
    // dem ersten Meter steht sie noch irgendwo ueber der Karte.
    R.kamera.x = S.gespann.x;
    R.kamera.y = S.gespann.y;
    document.body.classList.add('einweisung-an');
    el.kasten.classList.remove('aus');
    gehe(0);
  }

  function gehe(n) {
    if (n < 0 || n >= schritte.length) return;
    nr = n;
    var s = schritte[nr];

    var warOffen = UI.istOffen();
    if (s.panel) UI.oeffnen(s.panel); else UI.schliessen();
    // Die Lade behaelt sonst die Rollhoehe des vorigen Bildschirms.
    var inhalt = document.getElementById('panel-inhalt');
    if (inhalt && !s.rollen) inhalt.scrollTop = 0;
    // Ein frisch aufgehendes Panel gleitet noch 0,22 s herein. Das Rechteck
    // vorher zu messen hiesse, neben das Ziel zu zeigen.
    var warten = s.panel && !warOffen ? 260 : 0;

    el.zaehler.textContent = (nr + 1) + ' / ' + schritte.length;
    el.titel.textContent = s.titel;
    el.text.innerHTML = s.text;
    el.balken.style.width = ((nr + 1) / schritte.length * 100).toFixed(1) + '%';
    el.zurueck.disabled = nr === 0;
    var letzter = nr === schritte.length - 1;
    el.weiter.textContent = letzter ? (opt.los ? 'Spiel starten' : 'Fertig') : 'Weiter →';

    // Die Karte erst zeigen, wenn sie richtig steht.
    el.karte.classList.add('wartet');
    clearTimeout(zeitgeber);
    zeitgeber = setTimeout(function () {
      if (s.rollen) { var z = zielElement(s); if (z && z.scrollIntoView) z.scrollIntoView({ block: 'center' }); }
      platzieren();
      el.karte.classList.remove('wartet');
      nachfuehren(nr);
    }, warten);
  }

  /* Eine knappe Sekunde lang jedes Bild nachmessen. Die feste Wartezeit oben
   * reicht nicht immer: ein langsamer Rechner ist mit dem Hereingleiten des
   * Panels noch nicht fertig, und der Rahmen stuende dann neben dem Knopf. */
  function nachfuehren(fuer) {
    var bis = Date.now() + 800;
    (function bild() {
      if (!aktiv || nr !== fuer || Date.now() > bis) return;
      platzieren();
      requestAnimationFrame(bild);
    })();
  }

  function fertig(durch) {
    if (!aktiv) return;
    aktiv = false;
    clearTimeout(zeitgeber);
    el.kasten.classList.add('aus');
    document.body.classList.remove('einweisung-an');
    UI.schliessen();
    if (durch && opt.los) opt.los();
    else if (opt.ende) opt.ende();
  }

  /* ---------------- Lage auf dem Schirm ---------------- */
  function zielElement(s) {
    var z = s.ziel;
    if (typeof z === 'function') z = z();
    if (typeof z === 'string') z = document.querySelector(z);
    return z && z.nodeType === 1 ? z : null;
  }

  function rechteck(z) {
    if (!z) return null;
    if (typeof z === 'function') return rechteck(z());
    if (typeof z === 'string') return rechteck(document.querySelector(z));
    if (Array.isArray(z)) {
      var r = null;
      z.forEach(function (t) {
        var q = rechteck(t);
        if (!q) return;
        if (!r) { r = q; return; }
        var l = Math.min(r.left, q.left), o = Math.min(r.top, q.top);
        var rr = Math.max(r.left + r.width, q.left + q.width), u = Math.max(r.top + r.height, q.top + q.height);
        r = { left: l, top: o, width: rr - l, height: u - o };
      });
      return r;
    }
    if (z.nodeType === 1) {
      var b = z.getBoundingClientRect();
      // Unsichtbares (display:none, leere Ereignisliste) zaehlt nicht.
      if (b.width < 2 || b.height < 2) return null;
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    }
    return z;   // schon ein Rechteck
  }

  function platzieren() {
    var s = schritte[nr];
    var vb = window.innerWidth, vh = window.innerHeight;
    var r = rechteck(s.ziel);
    var rand = 6;

    if (r) {
      // Im Bild halten: ein Ziel, das ueber den Rand ragt (das Panel reicht
      // bis unten), soll trotzdem einen sichtbaren Rahmen bekommen.
      var l = Math.max(4, r.left - rand), o = Math.max(4, r.top - rand);
      var re = Math.min(vb - 4, r.left + r.width + rand), u = Math.min(vh - 4, r.top + r.height + rand);
      r = { left: l, top: o, width: re - l, height: u - o };
      el.spot.style.left = r.left + 'px';
      el.spot.style.top = r.top + 'px';
      el.spot.style.width = r.width + 'px';
      el.spot.style.height = r.height + 'px';
      el.spot.classList.remove('aus');
      el.sperre.classList.remove('dunkel');
    } else {
      el.spot.classList.add('aus');
      el.sperre.classList.add('dunkel');
    }

    var k = el.karte;
    var kb = k.offsetWidth, kh = k.offsetHeight, abst = 14;
    var x, y;
    if (!r) {
      x = (vb - kb) / 2; y = (vh - kh) / 2;
    } else {
      // Der Reihe nach: darunter, links daneben, rechts daneben, darueber.
      // Ist nirgends Platz (Panel ueber die halbe Breite), unten in die Mitte.
      var mitteX = r.left + r.width / 2 - kb / 2, mitteY = r.top + r.height / 2 - kh / 2;
      var wahl = [
        { x: mitteX, y: r.top + r.height + abst, ok: r.top + r.height + abst + kh < vh - 8 },
        { x: r.left - abst - kb, y: mitteY, ok: r.left - abst - kb > 8 },
        { x: r.left + r.width + abst, y: mitteY, ok: r.left + r.width + abst + kb < vb - 8 },
        { x: mitteX, y: r.top - abst - kh, ok: r.top - abst - kh > 8 }
      ].filter(function (w) { return w.ok; })[0];
      if (wahl) { x = wahl.x; y = wahl.y; }
      else { x = (vb - kb) / 2; y = vh - kh - 16; }
    }
    k.style.left = Math.round(Math.max(8, Math.min(vb - kb - 8, x))) + 'px';
    k.style.top = Math.round(Math.max(8, Math.min(vh - kh - 8, y))) + 'px';
  }

  return {
    starten: starten,
    laeuft: function () { return aktiv; },
    beenden: function () { fertig(false); },
    // Zum Nachsehen aus der Konsole
    schritte: schritte,
    gehe: function (n) { if (aktiv) gehe(n); }
  };
})();
