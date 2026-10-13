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

  /* Reisetempo, mit dem die Boerse rechnet. Nicht die Spitze des Traktors:
   * Anfahren, Kurven, Feldwege und der Weg zur Ladestelle druecken den
   * Schnitt, und auf der gestauchten Karte tun sie das viel staerker als
   * frueher -- zwischen zwei Kurven liegen jetzt keine 200 m mehr, auf denen
   * man ausfahren koennte. Nachgemessen laeuft der Starttraktor beladen im
   * Schnitt 28 km/h ueber das ganze Netz (31 nur auf Landstrasse), obwohl er
   * 38 km/h koennte. Geplant wird mit 24; die Differenz ist die Reserve, aus
   * der ein Zeitfenster ueberhaupt zu schaffen ist. Wer die
   * Hoechstgeschwindigkeiten in data.js aendert oder die Karte umbaut, zieht
   * diese Zahl mit, sonst haengen die Fristen in der Luft. */
  var PLANTEMPO = 24;

  /** Meter Fahrstrecke in Spielminuten, gerechnet mit Reisetempo. */
  function fahrzeit(meter, kmh) {
    var sek = meter / ((kmh || PLANTEMPO) / 3.6);
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
   *
   * wunsch (alles freiwillig):
   *   art  — nur diese Auftragsart
   *   von  — muss an diesem Ort losgehen. Damit entstehen die
   *          Anschlussfuhren, die am Ziel der letzten Lieferung ausliegen.
   */
  function erzeugen(state, wunsch) {
    wunsch = wunsch || {};
    var stufe = D.stufeVonRuf(state.ruf);
    var moeglich = freieArten(stufe);
    if (!moeglich.length) return null;

    var von, ware;

    if (wunsch.von) {
      // Vom Ort aus gedacht: was gibt der hier ueberhaupt ab, und findet sich
      // dafuer ein Abnehmer, der nicht derselbe Hof ist?
      von = W.ort(wunsch.von);
      if (!von) return null;
      var kandidaten = von.gibt.filter(function (w) {
        var sp = D.waren[w];
        if (!sp || moeglich.indexOf(sp.art) < 0) return false;
        if (wunsch.art && sp.art !== wunsch.art) return false;
        return senken(w).some(function (z) { return z.id !== von.id; });
      });
      if (!kandidaten.length) return null;
      ware = U.waehle(kandidaten);
    } else {
      var gewaehlt = wunsch.art && moeglich.indexOf(wunsch.art) >= 0 ? wunsch.art : U.waehle(moeglich);

      // Ware dieser Art waehlen
      var warenIds = [];
      for (var w in D.waren) if (D.waren[w].art === gewaehlt) warenIds.push(w);
      ware = U.waehle(warenIds);
      von = U.waehle(quellen(ware));
      if (!von) return null;
    }

    var wSpec = D.waren[ware];
    var art = wSpec.art;

    var moeglichZiele = senken(ware).filter(function (o) { return o.id !== von.id; });
    if (!moeglichZiele.length) return null;
    var nach = U.waehle(moeglichZiele);

    var meter = W.fahrstrecke(von.id, nach.id);
    if (meter < 72) return null;

    // Auf Stufe 1 bleiben die Wege kurz. Nicht aber bei einer Anschlussfuhr:
    // wer schon am anderen Ende der Karte steht, soll dort auch etwas
    // aufladen duerfen, statt leer zurueckzufahren.
    if (stufe === 1 && meter > (wunsch.von ? 880 : 640)) return null;

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
    var strecke = meter * (2 * fahrten - 1) + 170;          // Anfahrt grob mitgerechnet
    var netto = fahrzeit(strecke, PLANTEMPO) + fahrten * 2 * 8;  // je Ladevorgang etwas Zeit
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

  /** Wie oft liegt derselbe Weg mit derselben Ware schon aus? */
  function gleiche(state, j) {
    return state.boerse.filter(function (b) {
      return b.ware === j.ware && b.von === j.von && b.nach === j.nach;
    }).length;
  }

  /* Wie viele Angebote die Boerse traegt. Frueher waren es 7 bis 10; das
   * reichte, solange man ohnehin zum Hof zurueckfuhr. Wer unterwegs am Ziel
   * gleich die naechste Fuhr aufnehmen soll, braucht mehr Auswahl -- sonst
   * stehen dort nur Wege, fuer die der falsche Anhaenger am Haken haengt. */
  var BOERSE_MIN = 12, BOERSE_MAX = 16;

  /** Haelt die Boerse gefuellt und wirft abgelaufene Angebote raus. */
  function auffuellen(state) {
    var vorher = state.boerse.length;
    state.boerse = state.boerse.filter(function (j) { return j.gueltigBis > state.zeit; });

    var ziel = U.zufallGanz(BOERSE_MIN, BOERSE_MAX);
    var versuche = 0;
    while (state.boerse.length < ziel && versuche < 140) {
      versuche++;
      var j = erzeugen(state, null);
      if (!j || gleiche(state, j)) continue;
      state.boerse.push(j);
    }
    return state.boerse.length - vorher;
  }

  /**
   * Anschlussfuhren: sorgt dafuer, dass an einem Ort mindestens `mindestens`
   * Angebote losgehen. Wird nach jeder Lieferung fuer den Zielort gerufen,
   * damit die Rueckfahrt nicht leer sein muss.
   *
   * Gibt die neu entstandenen Auftraege zurueck.
   */
  function anschluss(state, ortId, mindestens) {
    mindestens = mindestens || 3;
    var da = state.boerse.filter(function (b) { return b.von === ortId; }).length;
    var neu = [];
    var versuche = 0;
    while (da + neu.length < mindestens && versuche < 60) {
      versuche++;
      var j = erzeugen(state, { von: ortId });
      // Hier darf derselbe Weg zweimal ausliegen. Auf Stufe 1 gibt ein Ort
      // oft nur eine einzige freigeschaltete Ware her; mit der strengen
      // Regel der Boerse staende dort dann genau ein Angebot, und die
      // Rueckfracht waere keine Wahl, sondern eine Ansage.
      if (!j || gleiche(state, j) >= 2) continue;
      // Anschluesse liegen laenger aus: man soll sie beim Abladen in Ruhe
      // ansehen koennen, statt sie waehrend des Ladebalkens zu verpassen.
      j.gueltigBis = state.zeit + U.zufallGanz(420, 900);
      j.anschluss = true;
      state.boerse.push(j);
      neu.push(j);
    }
    return neu;
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
    anschluss: anschluss,
    ersterAuftrag: ersterAuftrag,
    freieArten: freieArten,
    eigeneKapazitaet: eigeneKapazitaet,
    fahrzeit: fahrzeit,
    setzeZaehler: setzeZaehler
  };
})();
