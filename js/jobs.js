/* Landfracht — Auftragsboerse
 *
 * Auftraege entstehen zufaellig aus Ware, Start und Ziel. Die Bezahlung
 * ergibt sich aus Entfernung mal Menge mal Warensatz, mit Streuung.
 * Ein Teil der Angebote ist absichtlich schlecht bezahlt.
 */
var TG = window.TG || (window.TG = {});

TG.auftraege = (function () {
  var U = TG.util, D = TG.data, W = TG.welt;

  var zaehler = 1;

  /* Allgemeiner Fuhrlohn-Multiplikator. Er entscheidet darüber, wie schnell
   * man sich Gerät leisten kann; die Verhältnisse der Waren zueinander
   * stecken in data.js. */
  var TARIF = 2.6;

  /** Schrittweite und Höchstmenge je Auftragsart */
  var mengen = {
    schuett:  { schritt: 2, max: 30 },
    palette:  { schritt: 1, max: 16 },
    ballen:   { schritt: 2, max: 24 },
    fluessig: { schritt: 2, max: 20 },
    fahrzeug: { schritt: 1, max: 2 },
    holz:     { schritt: 2, max: 24 }
  };

  /** Alle Orte, die eine Ware abgeben bzw. annehmen */
  function quellen(ware) {
    return W.orte.filter(function (o) { return o.gibt.indexOf(ware) >= 0; });
  }
  function senken(ware) {
    return W.orte.filter(function (o) { return o.nimmt.indexOf(ware) >= 0; });
  }

  /** Groesste Kapazitaet, die der Spieler fuer diese Art besitzt. */
  function eigeneKapazitaet(state, art) {
    var best = 0;
    for (var i = 0; i < state.fuhrpark.length; i++) {
      var f = state.fuhrpark[i];
      if (f.typ !== 'anhaenger') continue;
      var spec = D.anhaenger_(f.id);
      if (spec && spec.art === art) best = Math.max(best, spec.kap);
    }
    if (best) return best;
    // Noch keiner im Besitz: mit dem kleinsten Angebot am Markt rechnen
    for (var k = 0; k < D.anhaenger.length; k++) {
      if (D.anhaenger[k].art === art) return D.anhaenger[k].kap;
    }
    return 10;
  }

  /** Meter Fahrstrecke in Spielminuten, gerechnet mit gemuetlichem Tempo. */
  function fahrzeit(meter, kmh) {
    var sek = meter / ((kmh || 24) / 3.6);
    return sek * (TG.spiel.ZEITFAKTOR / 60);
  }

  /** Welche Auftragsarten sind bei diesem Ruf freigeschaltet? */
  function freieArten(stufe) {
    var liste = [];
    for (var k in D.arten) if (D.arten[k].stufe <= stufe) liste.push(k);
    return liste;
  }

  /**
   * Erzeugt einen Auftrag. Gibt null zurueck, wenn sich fuer die gewaehlte
   * Ware kein sinnvolles Paar aus Start und Ziel finden laesst.
   */
  function erzeugen(state, artWunsch) {
    var stufe = D.stufeVonRuf(state.ruf);
    var moeglich = freieArten(stufe);
    if (!moeglich.length) return null;

    var art = artWunsch && moeglich.indexOf(artWunsch) >= 0 ? artWunsch : U.waehle(moeglich);

    // Ware dieser Art waehlen
    var warenIds = [];
    for (var w in D.waren) if (D.waren[w].art === art) warenIds.push(w);
    var ware = U.waehle(warenIds);
    var wSpec = D.waren[ware];

    var von = U.waehle(quellen(ware));
    var moeglichZiele = senken(ware).filter(function (o) { return o.id !== (von && von.id); });
    if (!von || !moeglichZiele.length) return null;
    var nach = U.waehle(moeglichZiele);

    var meter = W.fahrstrecke(von.id, nach.id);
    if (meter < 300) return null;

    // Auf Stufe 1 bleiben die Wege kurz
    if (stufe === 1 && meter > 2600) return null;

    // ---- Menge ----
    // Die Menge richtet sich nach dem, was der Spieler tatsächlich fassen
    // kann. Sonst stehen an der Börse Aufträge, für die man fünfmal hin und
    // her fahren müsste. Mehr als zwei Fuhren wird nie verlangt.
    var mb = mengen[art];
    var kap = eigeneKapazitaet(state, art);
    var fahrten = Math.random() < 0.80 ? 1 : 2;
    var menge = Math.round(kap * fahrten * U.zufall(0.55, 1.0) / mb.schritt) * mb.schritt;
    menge = U.clamp(menge, mb.schritt, mb.max);
    fahrten = Math.max(1, Math.ceil(menge / kap));

    // ---- Bezahlung ----
    // Bei zwei Fuhren faehrt man einmal leer zurueck. Ohne Zuschlag waeren
    // solche Auftraege je Fahrminute immer der schlechtere Griff.
    var km = meter / 1000;
    var grund = (menge * wSpec.satz * km + 55) * TARIF * (1 + 0.55 * (fahrten - 1));

    var schlecht = Math.random() < 0.26;
    var streuung = U.zufall(0.85, 1.15);
    var guete = streuung * (schlecht ? U.zufall(0.58, 0.78) : 1);

    // ---- Zeitfenster ----
    var strecke = meter * (2 * fahrten - 1) + 700;          // Anfahrt grob mitgerechnet
    var netto = fahrzeit(strecke, 24) + fahrten * 2 * 8;    // je Ladevorgang etwas Zeit
    var luft = fahrten > 1 ? U.zufall(1.20, 1.55) : U.zufall(1.30, 2.10);
    if (schlecht) luft += 0.35;                             // magere Bezahlung, wenigstens Zeit
    var fenster = Math.round(netto * luft / 15) * 15;

    // Enge Zeitfenster werden besser bezahlt
    if (luft < 1.55) guete *= 1.18;

    var lohn = Math.round(grund * guete / 5) * 5;

    var ruf = U.clamp(Math.round(lohn / 26), 8, 60);
    if (schlecht) ruf = Math.round(ruf * 1.15);             // Ruf als Trostpflaster

    return {
      id: 'a' + (zaehler++),
      art: art, ware: ware,
      menge: menge, einheit: D.arten[art].einheit,
      von: von.id, nach: nach.id,
      meter: Math.round(meter),
      fahrten: fahrten,
      fensterMin: fenster,
      lohn: lohn,
      strafe: Math.round(lohn * 0.30 / 5) * 5,
      ruf: ruf,
      guete: Math.round(guete * 100) / 100,
      schlecht: schlecht,
      eilig: luft < 1.55,
      gueltigBis: state.zeit + U.zufallGanz(180, 620),
      // Werte nach der Annahme
      status: 'angebot',
      faelligUm: 0,
      geliefert: 0
    };
  }

  /** Haelt 6 bis 10 Angebote an der Boerse und wirft abgelaufene raus. */
  function auffuellen(state) {
    var vorher = state.boerse.length;
    state.boerse = state.boerse.filter(function (j) { return j.gueltigBis > state.zeit; });

    var ziel = U.zufallGanz(7, 10);
    var versuche = 0;
    while (state.boerse.length < ziel && versuche < 90) {
      versuche++;
      var j = erzeugen(state, null);
      if (!j) continue;
      // Nicht dreimal derselbe Weg mit derselben Ware
      var doppelt = state.boerse.some(function (b) {
        return b.ware === j.ware && b.von === j.von && b.nach === j.nach;
      });
      if (doppelt) continue;
      state.boerse.push(j);
    }
    return state.boerse.length - vorher;
  }

  /** Der Auftrag, mit dem das Spiel sich selbst erklaert. */
  function ersterAuftrag(state) {
    var von = W.ort('hof'), nach = W.ort('scheune');
    var meter = W.fahrstrecke('hof', 'scheune');
    var menge = 8;
    var lohn = Math.round((menge * D.waren.kartoffeln.satz * meter / 1000 + 55) * TARIF * 1.2 / 5) * 5;
    return {
      id: 'a' + (zaehler++),
      art: 'schuett', ware: 'kartoffeln',
      menge: menge, einheit: 't',
      von: von.id, nach: nach.id,
      meter: Math.round(meter),
      fahrten: 1,
      fensterMin: 480,
      lohn: lohn,
      strafe: Math.round(lohn * 0.3 / 5) * 5,
      ruf: 30,
      guete: 1.2,
      schlecht: false, eilig: false,
      gueltigBis: state.zeit + 1800,
      status: 'angebot', faelligUm: 0, geliefert: 0,
      einstieg: true
    };
  }

  function setzeZaehler(n) { zaehler = Math.max(zaehler, n || 1); }

  return {
    erzeugen: erzeugen,
    auffuellen: auffuellen,
    ersterAuftrag: ersterAuftrag,
    freieArten: freieArten,
    eigeneKapazitaet: eigeneKapazitaet,
    fahrzeit: fahrzeit,
    setzeZaehler: setzeZaehler
  };
})();
