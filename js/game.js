/* Landfracht — Spielzustand, Wirtschaft und Abläufe */
var TG = window.TG || (window.TG = {});

TG.spiel = (function () {
  var U = TG.util, D = TG.data, W = TG.welt;

  /* Spielminuten je echter Minute.
   *
   * Hier steckt ein Kompromiss: Fährt man eine Strecke wirklich ab, dann
   * braucht ein Traktor dafür echte Minuten. Läuft die Uhr gleichzeitig so
   * schnell, dass ein Spieltag in zwölf Minuten vorbei ist, dann verschluckt
   * eine einzige Fuhre einen halben Tag und alle Zeitfenster lesen sich
   * absurd ("Lieferung in 79 Stunden"). Mit 40 dauert ein Spieltag rund
   * 36 echte Minuten, eine Fuhre kostet zwei bis vier Spielstunden und die
   * Zeitfenster stehen in einem Verhältnis, das man im Kopf nachrechnen kann.
   * Wer lieber kürzere Tage will, dreht allein an dieser Zahl. */
  var ZEITFAKTOR = 40;

  var SPEICHER = 'landfracht_v1';

  /* Stellschrauben fuer die Balance an einem Ort */
  var BAL = {
    startgeld: 8000,
    dieselBasis: 1.55,
    verbrauchGrund: 2.60,       // l/h im Stand unter Last
    verbrauchTempo: 1.00,       // l/h je m/s
    verschleissProKm: 0.80,     // Prozentpunkte je Kilometer Strasse
    reparaturGrund: 14,         // € je Zustandspunkt, unabhaengig vom Wert
    reparaturProWert: 0.0006,   // zusaetzlich je Zustandspunkt vom Neuwert
    reparaturMinutenProPunkt: 4,
    kreditMax: 100000,
    kreditZins: 0.012,          // je Woche auf die Restschuld
    kreditTilgung: 0.04,        // je Woche von der Aufnahmesumme
    verkaufsAnteil: 0.55
  };

  var state = null;
  var gespann = new TG.Gespann();
  var uidZaehler = 1;

  /* Laufender Lade- oder Abladevorgang */
  var vorgang = null;

  var horcher = {};   // einfache Ereignisse fuer die Oberflaeche
  function bei(name, fn) { (horcher[name] || (horcher[name] = [])).push(fn); }
  function melden(name, daten) {
    var l = horcher[name] || [];
    for (var i = 0; i < l.length; i++) l[i](daten);
  }

  /* =============================================================
   *  Neues Spiel
   * ============================================================= */
  function neu() {
    gesperrt = false;
    state = {
      v: 1,
      geld: BAL.startgeld,
      ruf: 0,
      zeit: 6 * 60,                 // Tag 1, 06:00
      fuhrpark: [],
      aktivTraktor: null,
      aktivAnhaenger: null,
      ausruestung: [],
      ladung: null,
      boerse: [],
      angenommen: [],
      dieselPreis: BAL.dieselBasis,
      letzteWoche: 0,
      kredit: { betrag: 0, aufnahme: 0 },
      stats: { meter: 0, tonnen: 0, auftraege: 0, puenktlich: 0, verspaetet: 0, abgebrochen: 0, verdient: 0, ausgaben: 0, diesel: 0 },
      pos: null,
      einstieg: 0
    };

    var t = neuesFahrzeug('traktor', 'hoftraktor', 78);
    var a = neuesFahrzeug('anhaenger', 'mk1', 71);
    state.aktivTraktor = t.uid;
    state.aktivAnhaenger = a.uid;

    var hof = W.ort('hof');
    gespann.setzen(hof.x + 30, hof.y, -Math.PI / 2);

    state.boerse.push(TG.auftraege.ersterAuftrag(state));
    TG.auftraege.auffuellen(state);
    return state;
  }

  function neuesFahrzeug(typ, id, zustand) {
    var spec = typ === 'traktor' ? D.traktor(id) : D.anhaenger_(id);
    var f = {
      uid: 'f' + (uidZaehler++),
      typ: typ, id: id,
      zustand: zustand === undefined ? 100 : zustand
    };
    if (typ === 'traktor') f.tank = spec.tank * (zustand === undefined ? 1 : 0.55);
    state.fuhrpark.push(f);
    return f;
  }

  /* =============================================================
   *  Speichern und Laden
   * ============================================================= */
  /* Nach dem Löschen darf nichts mehr geschrieben werden. Sonst legt der
   * Aufräumhaken beim Verlassen der Seite den alten Stand wieder ab und der
   * Neuanfang wäre wirkungslos. */
  var gesperrt = false;

  function speichern() {
    if (!state || gesperrt) return;
    state.pos = { x: gespann.x, y: gespann.y, h: gespann.h, th: gespann.th };
    state.uidZaehler = uidZaehler;
    try {
      localStorage.setItem(SPEICHER, JSON.stringify(state));
    } catch (e) { /* voller oder gesperrter Speicher: dann eben nicht */ }
  }

  function laden() {
    var roh;
    try { roh = localStorage.getItem(SPEICHER); } catch (e) { return false; }
    if (!roh) return false;
    var s;
    try { s = JSON.parse(roh); } catch (e) { return false; }
    if (!s || s.v !== 1 || !s.fuhrpark || !s.fuhrpark.length) return false;

    state = s;
    uidZaehler = s.uidZaehler || (s.fuhrpark.length + 1);
    if (!state.kredit) state.kredit = { betrag: 0, aufnahme: 0 };
    if (!state.ausruestung) state.ausruestung = [];

    var hoechste = 1;
    state.boerse.concat(state.angenommen).forEach(function (j) {
      var n = parseInt(String(j.id).slice(1), 10);
      if (n > hoechste) hoechste = n;
    });
    TG.auftraege.setzeZaehler(hoechste + 1);

    if (state.pos) gespann.setzen(state.pos.x, state.pos.y, state.pos.h);
    else { var hof = W.ort('hof'); gespann.setzen(hof.x + 70, hof.y + 40, -Math.PI / 2); }
    if (state.pos && state.pos.th !== undefined) gespann.th = state.pos.th;
    return true;
  }

  function loeschen() {
    gesperrt = true;
    try { localStorage.removeItem(SPEICHER); } catch (e) {}
  }

  /* =============================================================
   *  Fuhrpark
   * ============================================================= */
  function fahrzeug(uid) {
    for (var i = 0; i < state.fuhrpark.length; i++) if (state.fuhrpark[i].uid === uid) return state.fuhrpark[i];
    return null;
  }

  function aktiverTraktor() {
    var f = fahrzeug(state.aktivTraktor);
    return f ? { f: f, spec: D.traktor(f.id) } : null;
  }
  function aktiverAnhaenger() {
    if (!state.aktivAnhaenger) return null;
    var f = fahrzeug(state.aktivAnhaenger);
    return f ? { f: f, spec: D.anhaenger_(f.id) } : null;
  }

  function hatAusruestung(id) { return state.ausruestung.indexOf(id) >= 0; }

  /** Gesamtwirkung der Ausruestung fuer einen Untergrund. */
  function ausruestungsWirkung(untergrund) {
    var w = { speed: 1, verbrauch: 1, halt: 1, tank: 1 };
    for (var i = 0; i < state.ausruestung.length; i++) {
      var a = D.ausruestung_(state.ausruestung[i]);
      if (!a) continue;
      var teile = [a.wirkung[untergrund], a.wirkung.alle];
      for (var t = 0; t < teile.length; t++) {
        var p = teile[t];
        if (!p) continue;
        if (p.speed) w.speed *= p.speed;
        if (p.verbrauch) w.verbrauch *= p.verbrauch;
      }
      if (a.wirkung.halt) w.halt *= a.wirkung.halt;
      if (a.wirkung.tank) w.tank *= a.wirkung.tank;
    }
    return w;
  }

  function tankGroesse() {
    var t = aktiverTraktor();
    if (!t) return 0;
    return t.spec.tank * ausruestungsWirkung('strasse').tank;
  }

  function ladungTonnen() {
    if (!state.ladung) return 0;
    var w = D.waren[state.ladung.ware];
    return state.ladung.menge * (w ? w.tProEinheit : 1);
  }

  /** Alles, was die Fahrphysik wissen muss. */
  function technik() {
    var t = aktiverTraktor(), a = aktiverAnhaenger();
    var untergrund = W.untergrundAn(gespann.x, gespann.y);
    var aw = ausruestungsWirkung(untergrund);

    var ladT = ladungTonnen();
    var masseAnh = a ? a.spec.leer + ladT : 0;
    var anteil = (a && state.ladung) ? U.clamp(state.ladung.menge / a.spec.kap, 0, 1) : 0;

    return {
      untergrund: untergrund,
      ps: t.spec.ps,
      achsstand: t.spec.achsstand,
      vmaxKmh: t.spec.vmax * aw.speed,
      masseTraktor: t.spec.masse,
      masseGesamt: t.spec.masse + masseAnh,
      ladungsAnteil: anteil,
      zustand: t.f.zustand,
      anhaengerB: a ? a.spec.geo.b : 0,
      halt: aw.halt,
      verbrauchFaktor: t.spec.verbrauch * aw.verbrauch
    };
  }

  /* =============================================================
   *  Zeit, Diesel, Verschleiss
   * ============================================================= */
  function tag() { return Math.floor(state.zeit / 1440) + 1; }
  function woche() { return Math.floor(state.zeit / (1440 * 7)); }
  function stufe() { return D.stufeVonRuf(state.ruf); }

  function zeitVoran(spielminuten) {
    state.zeit += spielminuten;
    pruefeWoche();
    pruefeFristen();
  }

  function pruefeWoche() {
    var w = woche();
    if (w <= state.letzteWoche) return;
    state.letzteWoche = w;

    // Dieselpreis bewegt sich langsam
    var d = state.dieselPreis + U.zufall(-0.18, 0.18);
    state.dieselPreis = Math.round(U.clamp(d, 1.18, 2.10) * 100) / 100;

    // Kredit
    if (state.kredit.betrag > 0) {
      var zins = state.kredit.betrag * BAL.kreditZins;
      var tilgung = Math.min(state.kredit.betrag, state.kredit.aufnahme * BAL.kreditTilgung);
      var rate = zins + tilgung;
      state.geld -= rate;
      state.kredit.betrag -= tilgung;
      state.stats.ausgaben += rate;
      if (state.kredit.betrag < 1) { state.kredit.betrag = 0; state.kredit.aufnahme = 0; }
      melden('meldung', { text: 'Wochenrate für den Kredit abgebucht: ' + U.geld(rate), art: 'schlecht' });
    }
    melden('meldung', { text: 'Neue Woche. Diesel kostet jetzt ' + U.zahl(state.dieselPreis, 2) + ' € je Liter.' });
  }

  /** Aufträge, deren Zeitfenster deutlich gerissen ist, platzen. */
  function pruefeFristen() {
    for (var i = state.angenommen.length - 1; i >= 0; i--) {
      var j = state.angenommen[i];
      var grenze = j.faelligUm + j.fensterMin * 0.5;
      if (state.zeit > grenze) {
        state.angenommen.splice(i, 1);
        state.geld -= j.strafe;
        state.ruf = Math.max(0, state.ruf - j.ruf);
        state.stats.abgebrochen++;
        state.stats.ausgaben += j.strafe;
        if (state.ladung && state.ladung.jobId === j.id) state.ladung = null;
        melden('meldung', {
          text: 'Auftrag geplatzt: ' + D.waren[j.ware].name + ' nach ' + W.ort(j.nach).kurz +
                '. Strafe ' + U.geld(j.strafe) + ', Ruf −' + j.ruf + '.', art: 'schlecht'
        });
      }
    }
  }

  /* =============================================================
   *  Fahrschritt
   * ============================================================= */
  function schritt(dt, eingabe) {
    var tech = technik();
    var t = aktiverTraktor(), a = aktiverAnhaenger();

    var leer = t.f.tank <= 0.05;
    if (leer) { eingabe = { gas: false, bremse: eingabe.bremse, links: eingabe.links, rechts: eingabe.rechts, handbremse: eingabe.handbremse }; }

    var vorX = gespann.x, vorY = gespann.y;
    gespann.schritt(dt, eingabe, tech);
    var meter = U.abstand(vorX, vorY, gespann.x, gespann.y);

    // Zeit laeuft
    var spielminuten = dt * (ZEITFAKTOR / 60);
    state.zeit += spielminuten;

    // Diesel
    var u = W.untergruende[tech.untergrund];
    var tempo = Math.abs(gespann.v);
    var lph = (BAL.verbrauchGrund + BAL.verbrauchTempo * tempo)
            * (1 + 0.045 * ladungTonnen())
            * tech.verbrauchFaktor * u.verbrauch
            * (1 + (100 - t.f.zustand) / 240);
    var liter = lph * (spielminuten / 60);
    if (!leer) {
      t.f.tank = Math.max(0, t.f.tank - liter);
      state.stats.diesel += liter;
    }

    // Verschleiss
    if (meter > 0) {
      var km = meter / 1000;
      var abnutzung = BAL.verschleissProKm * u.verschleiss * (1 + 0.02 * ladungTonnen()) * km;
      t.f.zustand = U.clamp(t.f.zustand - abnutzung, 0, 100);
      if (a) a.f.zustand = U.clamp(a.f.zustand - abnutzung * 0.7, 0, 100);
      state.stats.meter += meter;
    }

    // Anstossen kostet Substanz
    if (gespann.stoss > 2.5) {
      var schaden = U.clamp(gespann.stoss * 0.35, 0, 6);
      t.f.zustand = U.clamp(t.f.zustand - schaden, 0, 100);
      if (a) a.f.zustand = U.clamp(a.f.zustand - schaden * 0.8, 0, 100);
    }

    pruefeWoche();
    pruefeFristen();
    vorgangSchritt(dt);

    return { meter: meter, untergrund: tech.untergrund, leer: leer, lph: lph };
  }

  /* =============================================================
   *  Zonen, Laden und Abladen
   * ============================================================= */
  /** Zone unter der Anhaengerachse, passend zum angehaengten Typ. */
  function aktuelleZone() {
    var a = aktiverAnhaenger();
    if (!a) return null;
    var p = gespann.anhaengerAchse(a.spec.geo.b);
    for (var i = 0; i < W.orte.length; i++) {
      var o = W.orte[i];
      for (var z = 0; z < o.zonen.length; z++) {
        var zn = o.zonen[z];
        if (zn.arten.indexOf(a.spec.art) < 0) continue;
        if (U.inRechteck(p.x, p.y, zn)) {
          if (zn.eng) {
            // Enge Zonen wollen sauber ausgerichtet sein
            var d = Math.abs(U.winkel(gespann.th - zn.rot));
            var ok = d < 0.5 || Math.abs(d - Math.PI) < 0.5;
            if (!ok) return { ort: o, zone: zn, schief: true };
          }
          return { ort: o, zone: zn, schief: false };
        }
      }
    }
    return null;
  }

  /** Zone der Tankstelle unter dem Traktor. */
  function anTankstelle() {
    var o = W.ort('tanke');
    for (var z = 0; z < o.zonen.length; z++) {
      var zn = o.zonen[z];
      var gross = { x: zn.x, y: zn.y, w: zn.w + 14, h: zn.h + 14, rot: zn.rot };
      if (U.inRechteck(gespann.x, gespann.y, gross)) return true;
    }
    return U.abstand(gespann.x, gespann.y, o.x, o.y) < 34;
  }

  function amHof() {
    var o = W.ort('hof');
    return U.abstand(gespann.x, gespann.y, o.x, o.y) < 110;
  }
  function beimHaendler() {
    var o = W.ort('haendler');
    return U.abstand(gespann.x, gespann.y, o.x, o.y) < 110;
  }

  /** Was liesse sich hier gerade laden oder abladen? */
  function ladeChance() {
    var a = aktiverAnhaenger();
    if (!a) return null;
    var zn = aktuelleZone();
    if (!zn) return null;

    if (state.ladung) {
      var job = angenommenerAuftrag(state.ladung.jobId);
      if (job && job.nach === zn.ort.id) {
        return { art: 'abladen', job: job, ort: zn.ort, zone: zn.zone, schief: zn.schief, menge: state.ladung.menge };
      }
      return null;
    }

    // Laden: passender angenommener Auftrag mit Restmenge
    for (var i = 0; i < state.angenommen.length; i++) {
      var j = state.angenommen[i];
      if (j.von !== zn.ort.id) continue;
      if (j.art !== a.spec.art) continue;
      var rest = j.menge - j.geliefert;
      if (rest <= 0) continue;
      return {
        art: 'laden', job: j, ort: zn.ort, zone: zn.zone, schief: zn.schief,
        menge: Math.min(rest, a.spec.kap)
      };
    }
    return null;
  }

  function angenommenerAuftrag(id) {
    for (var i = 0; i < state.angenommen.length; i++) if (state.angenommen[i].id === id) return state.angenommen[i];
    return null;
  }

  function vorgangSchritt(dt) {
    var steht = Math.abs(gespann.v) < 0.35;
    var c = ladeChance();

    if (!c || c.schief || !steht) {
      if (vorgang) { vorgang = null; melden('vorgang', null); }
      return;
    }

    if (!vorgang || vorgang.jobId !== c.job.id || vorgang.art !== c.art) {
      var dauer = c.job.art === 'fahrzeug' ? 4 + 2.5 * c.menge : U.clamp(2.2 + c.menge * 0.14, 2.5, 8);
      vorgang = { art: c.art, jobId: c.job.id, menge: c.menge, dauer: dauer, t: 0 };
    }

    vorgang.t += dt;
    melden('vorgang', {
      art: vorgang.art, anteil: U.clamp(vorgang.t / vorgang.dauer, 0, 1),
      text: (vorgang.art === 'laden' ? 'Laden: ' : 'Abladen: ') +
            U.zahl(vorgang.menge) + ' ' + c.job.einheit + ' ' + D.waren[c.job.ware].name
    });

    if (vorgang.t >= vorgang.dauer) {
      if (vorgang.art === 'laden') ladenFertig(c);
      else abladenFertig(c);
      vorgang = null;
      melden('vorgang', null);
    }
  }

  function ladenFertig(c) {
    state.ladung = { jobId: c.job.id, ware: c.job.ware, menge: c.menge };
    melden('meldung', {
      text: U.zahl(c.menge) + ' ' + c.job.einheit + ' ' + D.waren[c.job.ware].name +
            ' geladen. Ziel: ' + W.ort(c.job.nach).name + '.', art: 'gut'
    });
    melden('geladen', c.job);
    speichern();
  }

  function abladenFertig(c) {
    var j = c.job;
    j.geliefert += state.ladung.menge;
    var w = D.waren[j.ware];
    state.stats.tonnen += state.ladung.menge * (w ? w.tProEinheit : 1);
    state.ladung = null;

    if (j.geliefert >= j.menge) abrechnen(j);
    else {
      melden('meldung', {
        text: 'Teillieferung angekommen. Noch ' + U.zahl(j.menge - j.geliefert) + ' ' + j.einheit + ' offen.', art: 'gut'
      });
      speichern();
    }
  }

  /* =============================================================
   *  Auftragsabwicklung
   * ============================================================= */
  function annehmen(job) {
    if (state.angenommen.length >= 3) return { ok: false, grund: 'Mehr als drei Aufträge gleichzeitig sind nicht drin.' };
    var i = state.boerse.indexOf(job);
    if (i < 0) return { ok: false, grund: 'Der Auftrag ist nicht mehr zu haben.' };
    state.boerse.splice(i, 1);
    job.status = 'laufend';
    job.angenommenUm = state.zeit;
    job.faelligUm = state.zeit + job.fensterMin;
    job.geliefert = 0;
    state.angenommen.push(job);
    speichern();
    return { ok: true };
  }

  function abbrechen(job) {
    var i = state.angenommen.indexOf(job);
    if (i < 0) return;
    state.angenommen.splice(i, 1);
    state.geld -= job.strafe;
    state.ruf = Math.max(0, state.ruf - Math.round(job.ruf * 0.8));
    state.stats.abgebrochen++;
    state.stats.ausgaben += job.strafe;
    if (state.ladung && state.ladung.jobId === job.id) state.ladung = null;
    melden('meldung', { text: 'Auftrag abgebrochen. Strafe ' + U.geld(job.strafe) + '.', art: 'schlecht' });
    speichern();
  }

  function abrechnen(j) {
    var i = state.angenommen.indexOf(j);
    if (i >= 0) state.angenommen.splice(i, 1);

    var alteStufe = stufe();
    var verspaetung = state.zeit - j.faelligUm;
    var lohn = j.lohn, rufGewinn = j.ruf, text, art;

    if (verspaetung <= 0) {
      var rest = -verspaetung;
      var frueh = rest > j.fensterMin * 0.4;
      if (frueh) { lohn = Math.round(lohn * 1.05); }
      state.stats.puenktlich++;
      text = 'Geliefert: ' + U.zahl(j.menge) + ' ' + j.einheit + ' ' + D.waren[j.ware].name +
             '. ' + U.geld(lohn) + (frueh ? ' (mit Bonus für frühe Lieferung)' : '') + ', Ruf +' + rufGewinn + '.';
      art = 'gut';
    } else {
      lohn = Math.max(0, lohn - j.strafe);
      rufGewinn = -Math.round(j.ruf * 0.5);
      state.stats.verspaetet++;
      text = 'Zu spät geliefert. Nur ' + U.geld(lohn) + ' nach Abzug der Strafe, Ruf ' + rufGewinn + '.';
      art = 'schlecht';
    }

    state.geld += lohn;
    state.stats.verdient += lohn;
    state.ruf = Math.max(0, state.ruf + rufGewinn);
    state.stats.auftraege++;

    melden('meldung', { text: text, art: art });

    var neueStufe = stufe();
    if (neueStufe > alteStufe) {
      var s = D.stufen[neueStufe - 1];
      melden('meldung', { text: 'Ruf-Stufe ' + neueStufe + ' erreicht. Neu: ' + s.frei, art: 'gut' });
      melden('stufe', neueStufe);
    }

    TG.auftraege.auffuellen(state);
    speichern();
  }

  /* =============================================================
   *  Hof: Tanken, Reparieren, Ankoppeln
   * ============================================================= */
  function tankKosten() {
    var t = aktiverTraktor();
    var fehlt = tankGroesse() - t.f.tank;
    return { liter: fehlt, kosten: fehlt * state.dieselPreis };
  }

  function tanken() {
    var t = aktiverTraktor();
    var k = tankKosten();
    if (k.liter < 0.5) return { ok: false, grund: 'Der Tank ist voll.' };
    var bezahlbar = Math.min(k.liter, state.geld / state.dieselPreis);
    if (bezahlbar < 0.5) return { ok: false, grund: 'Dafür reicht das Geld nicht.' };
    t.f.tank += bezahlbar;
    var kosten = bezahlbar * state.dieselPreis;
    state.geld -= kosten;
    state.stats.ausgaben += kosten;
    zeitVoran(12);
    speichern();
    return { ok: true, liter: bezahlbar, kosten: kosten };
  }

  /* Bleibt jemand mit leerem Tank auf freier Strecke stehen, wäre der
   * Spielstand sonst tot. Der Nachbar bringt einen Kanister — teuer, kostet
   * Zeit, und man darf dafür auch ins Minus rutschen. */
  function kanisterKosten() {
    return { liter: 25, kosten: Math.round(25 * state.dieselPreis * 1.8) };
  }

  function kanister() {
    var t = aktiverTraktor();
    if (t.f.tank > 2) return { ok: false, grund: 'So leer ist der Tank noch nicht.' };
    var k = kanisterKosten();
    t.f.tank = Math.min(tankGroesse(), t.f.tank + k.liter);
    state.geld -= k.kosten;
    state.stats.ausgaben += k.kosten;
    zeitVoran(45);
    speichern();
    return { ok: true, liter: k.liter, kosten: k.kosten };
  }

  function reparaturKosten(f) {
    var spec = f.typ === 'traktor' ? D.traktor(f.id) : D.anhaenger_(f.id);
    var wert = spec.neuwert || spec.preis || 10000;
    var punkte = 100 - f.zustand;
    var satz = BAL.reparaturGrund + wert * BAL.reparaturProWert;
    return { punkte: punkte, kosten: Math.round(punkte * satz), minuten: Math.round(punkte * BAL.reparaturMinutenProPunkt) };
  }

  function reparieren(f) {
    var k = reparaturKosten(f);
    if (k.punkte < 1) return { ok: false, grund: 'Da gibt es nichts zu richten.' };
    if (state.geld < k.kosten) return { ok: false, grund: 'Das Geld reicht nicht.' };
    state.geld -= k.kosten;
    state.stats.ausgaben += k.kosten;
    f.zustand = 100;
    zeitVoran(k.minuten);
    speichern();
    return { ok: true, kosten: k.kosten, minuten: k.minuten };
  }

  function ankoppeln(uid) {
    if (state.ladung) return { ok: false, grund: 'Erst abladen, dann wechseln.' };
    state.aktivAnhaenger = uid;
    gespann.th = gespann.h;
    speichern();
    return { ok: true };
  }

  function abkoppeln() {
    if (state.ladung) return { ok: false, grund: 'Erst abladen, dann abkoppeln.' };
    state.aktivAnhaenger = null;
    speichern();
    return { ok: true };
  }

  function traktorWechseln(uid) {
    state.aktivTraktor = uid;
    speichern();
    return { ok: true };
  }

  /* =============================================================
   *  Händler
   * ============================================================= */
  function verkaufswert(f) {
    var spec = f.typ === 'traktor' ? D.traktor(f.id) : D.anhaenger_(f.id);
    var wert = spec.neuwert || spec.preis || 0;
    return Math.round(wert * BAL.verkaufsAnteil * (0.45 + 0.55 * f.zustand / 100));
  }

  function kaufen(typ, id) {
    var spec = typ === 'traktor' ? D.traktor(id) : D.anhaenger_(id);
    if (!spec) return { ok: false, grund: 'Unbekanntes Gerät.' };
    if (state.geld < spec.preis) return { ok: false, grund: 'Dafür fehlt das Geld.' };
    state.geld -= spec.preis;
    state.stats.ausgaben += spec.preis;
    var f = neuesFahrzeug(typ, id, 100);
    if (typ === 'anhaenger' && !state.ladung) state.aktivAnhaenger = f.uid;
    speichern();
    return { ok: true, fahrzeug: f };
  }

  function verkaufen(f) {
    if (f.uid === state.aktivTraktor) {
      var andere = state.fuhrpark.filter(function (x) { return x.typ === 'traktor' && x.uid !== f.uid; });
      if (!andere.length) return { ok: false, grund: 'Ohne Traktor geht gar nichts.' };
      state.aktivTraktor = andere[0].uid;
    }
    if (f.uid === state.aktivAnhaenger) {
      if (state.ladung) return { ok: false, grund: 'Auf dem Anhänger liegt noch Ladung.' };
      state.aktivAnhaenger = null;
    }
    var wert = verkaufswert(f);
    state.fuhrpark.splice(state.fuhrpark.indexOf(f), 1);
    state.geld += wert;
    state.stats.verdient += wert;
    speichern();
    return { ok: true, wert: wert };
  }

  function kaufeAusruestung(id) {
    var a = D.ausruestung_(id);
    if (!a) return { ok: false, grund: 'Unbekannt.' };
    if (hatAusruestung(id)) return { ok: false, grund: 'Hast du schon.' };
    if (state.geld < a.preis) return { ok: false, grund: 'Dafür fehlt das Geld.' };
    // In einer Gruppe (z.B. Reifen) zaehlt nur ein Stueck
    state.ausruestung = state.ausruestung.filter(function (x) {
      var o = D.ausruestung_(x);
      return !o || o.gruppe !== a.gruppe;
    });
    state.geld -= a.preis;
    state.stats.ausgaben += a.preis;
    state.ausruestung.push(id);
    speichern();
    return { ok: true };
  }

  /* =============================================================
   *  Kredit
   * ============================================================= */
  function kreditAufnehmen(betrag) {
    betrag = Math.round(betrag);
    var frei = BAL.kreditMax - state.kredit.betrag;
    if (betrag <= 0 || betrag > frei) return { ok: false, grund: 'So viel gibt die Bank nicht her.' };
    state.kredit.betrag += betrag;
    state.kredit.aufnahme += betrag;
    state.geld += betrag;
    speichern();
    return { ok: true };
  }

  function kreditTilgen(betrag) {
    betrag = Math.min(Math.round(betrag), state.kredit.betrag, state.geld);
    if (betrag <= 0) return { ok: false, grund: 'Dafür ist kein Geld da.' };
    state.kredit.betrag -= betrag;
    state.geld -= betrag;
    if (state.kredit.betrag < 1) { state.kredit.betrag = 0; state.kredit.aufnahme = 0; }
    speichern();
    return { ok: true, betrag: betrag };
  }

  function wochenrate() {
    if (!state.kredit.betrag) return 0;
    return state.kredit.betrag * BAL.kreditZins + Math.min(state.kredit.betrag, state.kredit.aufnahme * BAL.kreditTilgung);
  }

  /* =============================================================
   *  Ziel und Wegweiser
   * ============================================================= */
  /** Der Ort, zu dem es als Nächstes geht. */
  function zielOrt() {
    if (state.ladung) {
      var j = angenommenerAuftrag(state.ladung.jobId);
      if (j) return W.ort(j.nach);
    }
    var t = aktiverAnhaenger();
    var beste = null, bd = 1e9;
    for (var i = 0; i < state.angenommen.length; i++) {
      var a = state.angenommen[i];
      if (a.geliefert >= a.menge) continue;
      if (t && a.art !== t.spec.art) continue;
      var rest = a.faelligUm - state.zeit;
      if (rest < bd) { bd = rest; beste = a; }
    }
    if (beste) return W.ort(beste.von);
    return null;
  }

  /** Der Auftrag, der oben in der Kopfleiste steht. */
  function anzeigeAuftrag() {
    if (state.ladung) {
      var j = angenommenerAuftrag(state.ladung.jobId);
      if (j) return j;
    }
    var beste = null, bd = 1e9;
    for (var i = 0; i < state.angenommen.length; i++) {
      var rest = state.angenommen[i].faelligUm - state.zeit;
      if (rest < bd) { bd = rest; beste = state.angenommen[i]; }
    }
    return beste;
  }

  return {
    ZEITFAKTOR: ZEITFAKTOR, BAL: BAL,
    get state() { return state; },
    gespann: gespann,
    bei: bei, melden: melden,

    neu: neu, laden: laden, speichern: speichern, loeschen: loeschen,

    fahrzeug: fahrzeug, aktiverTraktor: aktiverTraktor, aktiverAnhaenger: aktiverAnhaenger,
    hatAusruestung: hatAusruestung, ausruestungsWirkung: ausruestungsWirkung,
    tankGroesse: tankGroesse, ladungTonnen: ladungTonnen, technik: technik,

    tag: tag, woche: woche, stufe: stufe, zeitVoran: zeitVoran,
    schritt: schritt,

    aktuelleZone: aktuelleZone, anTankstelle: anTankstelle, amHof: amHof, beimHaendler: beimHaendler,
    ladeChance: ladeChance, angenommenerAuftrag: angenommenerAuftrag,

    annehmen: annehmen, abbrechen: abbrechen,

    tankKosten: tankKosten, tanken: tanken,
    kanisterKosten: kanisterKosten, kanister: kanister,
    reparaturKosten: reparaturKosten, reparieren: reparieren,
    ankoppeln: ankoppeln, abkoppeln: abkoppeln, traktorWechseln: traktorWechseln,

    verkaufswert: verkaufswert, kaufen: kaufen, verkaufen: verkaufen, kaufeAusruestung: kaufeAusruestung,

    kreditAufnehmen: kreditAufnehmen, kreditTilgen: kreditTilgen, wochenrate: wochenrate,

    zielOrt: zielOrt, anzeigeAuftrag: anzeigeAuftrag
  };
})();
