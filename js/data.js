/* Landfracht — Stammdaten: Waren, Auftragsarten, Fuhrpark, Ruf-Stufen
 *
 * Alle Zahlen sind Spielwerte, keine echten Maschinendaten.
 * Laengen in Metern, Massen in Tonnen, Geschwindigkeiten in km/h.
 */
var TG = window.TG || (window.TG = {});

TG.data = (function () {

  /* ---------------------------------------------------------------
   * Auftragsarten. "art" ist zugleich der noetige Anhaengertyp.
   * ------------------------------------------------------------- */
  var arten = {
    schuett: {
      name: 'Schüttgut', anhaenger: 'Muldenkipper', einheit: 't', stufe: 1,
      hinweis: 'Menge in Tonnen, größere Mengen brauchen mehrere Fahrten.'
    },
    palette: {
      name: 'Paletten', anhaenger: 'Plattformanhänger', einheit: 'Pal.', stufe: 2,
      hinweis: 'Ladung kippt bei zu schneller Kurvenfahrt.'
    },
    ballen: {
      name: 'Ballen', anhaenger: 'Ballenwagen', einheit: 'Ballen', stufe: 2,
      hinweis: 'Voluminös, nur niedrige Kurvengeschwindigkeit.'
    },
    fluessig: {
      name: 'Flüssig', anhaenger: 'Fasswagen', einheit: 'm³', stufe: 2,
      hinweis: 'Das Schwappen verändert das Fahrverhalten.'
    },
    fahrzeug: {
      name: 'Fahrzeugüberführung', anhaenger: 'Tieflader', einheit: 'Stk.', stufe: 3,
      hinweis: 'Genaues Auffahren beim Laden, dafür hohe Bezahlung.'
    },
    holz: {
      name: 'Rundholz', anhaenger: 'Rückewagen', einheit: 'fm', stufe: 3,
      hinweis: 'Schwere, lange Last.'
    }
  };

  /* ---------------------------------------------------------------
   * Waren.  satz = Grundbezahlung je Einheit und Kilometer.
   * tProEinheit = Masse je Einheit in Tonnen (fuer die Fahrphysik).
   * ------------------------------------------------------------- */
  var waren = {
    getreide:     { name: 'Getreide',       art: 'schuett',  satz: 16, tProEinheit: 1.0,  farbe: '#c8a850' },
    mais:         { name: 'Mais',           art: 'schuett',  satz: 14, tProEinheit: 1.0,  farbe: '#d8b23c' },
    kartoffeln:   { name: 'Kartoffeln',     art: 'schuett',  satz: 20, tProEinheit: 1.0,  farbe: '#b08a52' },
    hackschnitzel:{ name: 'Hackschnitzel',  art: 'schuett',  satz: 12, tProEinheit: 1.0,  farbe: '#8a6b40' },

    saatgut:      { name: 'Saatgut',        art: 'palette',  satz: 38, tProEinheit: 0.7,  farbe: '#c9b078' },
    duenger:      { name: 'Dünger',         art: 'palette',  satz: 34, tProEinheit: 0.9,  farbe: '#9aa7b8' },
    futtersaecke: { name: 'Futtersäcke',    art: 'palette',  satz: 30, tProEinheit: 0.6,  farbe: '#b89a6a' },
    ziegel:       { name: 'Ziegel',         art: 'palette',  satz: 26, tProEinheit: 1.1,  farbe: '#a8543c' },

    strohballen:  { name: 'Strohballen',    art: 'ballen',   satz: 20, tProEinheit: 0.32, farbe: '#d8c377' },
    heuballen:    { name: 'Heuballen',      art: 'ballen',   satz: 22, tProEinheit: 0.36, farbe: '#bda85e' },
    silageballen: { name: 'Silageballen',   art: 'ballen',   satz: 26, tProEinheit: 0.75, farbe: '#c8d2d8' },

    guelle:       { name: 'Gülle',          art: 'fluessig', satz: 13, tProEinheit: 1.05, farbe: '#7a6a3a' },
    wasser:       { name: 'Wasser',         art: 'fluessig', satz: 11, tProEinheit: 1.0,  farbe: '#5b8ea8' },
    diesel:       { name: 'Diesel',         art: 'fluessig', satz: 24, tProEinheit: 0.85, farbe: '#8a8a5a' },

    traktor:      { name: 'Traktor',        art: 'fahrzeug', satz: 900, tProEinheit: 5.5, farbe: '#7a9a4a' },
    maehwerk:     { name: 'Mähwerk',        art: 'fahrzeug', satz: 620, tProEinheit: 2.2, farbe: '#a8a8a8' },
    pflug:        { name: 'Pflug',          art: 'fahrzeug', satz: 700, tProEinheit: 3.4, farbe: '#9a5a4a' },
    feldspritze:  { name: 'Feldspritze',    art: 'fahrzeug', satz: 860, tProEinheit: 4.2, farbe: '#8aa8b8' },

    stammholz:    { name: 'Baumstämme',     art: 'holz',     satz: 40, tProEinheit: 0.95, farbe: '#7a5a38' }
  };

  /* ---------------------------------------------------------------
   * Traktoren
   * ps        Leistung
   * vmax      Hoechstgeschwindigkeit km/h auf der Strasse
   * verbrauch relativer Dieselverbrauch
   * masse     Leergewicht in Tonnen
   * achsstand Radstand in Metern (bestimmt den Wendekreis)
   * ------------------------------------------------------------- */
  var traktoren = [
    // vmax 32 statt 28: mit Anhaenger und etwas Verschleiss blieb der
    // Starttraktor sonst unter dem Tempo, mit dem jobs.fahrzeit die
    // Zeitfenster kalkuliert.
    { id: 'hoftraktor', name: 'Alter Hoftraktor', ps: 60, vmax: 32, verbrauch: 1.35,
      masse: 3.2, achsstand: 2.35, laenge: 4.2, breite: 1.95, tank: 220,
      preis: 0, neuwert: 9000, farbe: '#9c4a34', dach: '#7a3826',
      text: 'Steht seit Jahren auf dem Hof. Läuft, mehr nicht.' },

    { id: 'allrounder', name: 'Allrounder 110', ps: 110, vmax: 40, verbrauch: 1.0,
      masse: 4.6, achsstand: 2.55, laenge: 4.7, breite: 2.1, tank: 300,
      preis: 45000, neuwert: 45000, farbe: '#3f7a3a', dach: '#2f5c2b',
      text: 'Der vernünftige Schritt: schneller, sparsamer, zieht ordentlich.' },

    { id: 'grosstraktor', name: 'Großtraktor 200', ps: 200, vmax: 50, verbrauch: 0.9,
      masse: 7.0, achsstand: 2.95, laenge: 5.4, breite: 2.45, tank: 380,
      preis: 140000, neuwert: 140000, farbe: '#2f5f86', dach: '#24486a',
      text: 'Zieht schwere Anhänger, ohne ins Schwitzen zu kommen.' },

    { id: 'strassenschlepper', name: 'Straßenschlepper 300', ps: 300, vmax: 65, verbrauch: 0.78,
      masse: 8.5, achsstand: 3.15, laenge: 5.9, breite: 2.55, tank: 460,
      preis: 320000, neuwert: 320000, farbe: '#8a7a2c', dach: '#6b5e22',
      text: 'Für lange Wege. Auf dem Acker ist er zu schade.' }
  ];

  /* ---------------------------------------------------------------
   * Anhaenger
   * kap    Kapazitaet in Einheiten der Auftragsart
   * leer   Leergewicht in Tonnen
   * geo.b  Abstand Kupplung -> Anhaengerachse (bestimmt das Einknicken)
   * kurve  zulaessige Querbeschleunigung, kleiner = kippeliger
   * ------------------------------------------------------------- */
  var anhaenger = [
    { id: 'mk1', name: 'Muldenkipper 8', art: 'schuett', kap: 8, leer: 2.2, preis: 12000,
      geo: { b: 4.9, bodyOff: 1.1, bodyLen: 5.0, breite: 2.35 }, kurve: 1.0 },
    { id: 'mk2', name: 'Muldenkipper 16', art: 'schuett', kap: 16, leer: 3.6, preis: 34000,
      geo: { b: 6.2, bodyOff: 1.2, bodyLen: 6.4, breite: 2.5 }, kurve: 0.95 },
    { id: 'mk3', name: 'Muldenkipper 26', art: 'schuett', kap: 26, leer: 5.2, preis: 72000,
      geo: { b: 7.4, bodyOff: 1.3, bodyLen: 7.6, breite: 2.6 }, kurve: 0.88 },

    { id: 'pl1', name: 'Plattformanhänger 8', art: 'palette', kap: 8, leer: 2.4, preis: 18000,
      geo: { b: 5.6, bodyOff: 1.1, bodyLen: 5.8, breite: 2.5 }, kurve: 0.68 },
    { id: 'pl2', name: 'Plattformanhänger 14', art: 'palette', kap: 14, leer: 3.8, preis: 39000,
      geo: { b: 7.0, bodyOff: 1.2, bodyLen: 7.4, breite: 2.55 }, kurve: 0.62 },

    { id: 'bw1', name: 'Ballenwagen 12', art: 'ballen', kap: 12, leer: 2.6, preis: 22000,
      geo: { b: 6.6, bodyOff: 1.1, bodyLen: 7.0, breite: 2.55 }, kurve: 0.52 },
    { id: 'bw2', name: 'Ballenwagen 20', art: 'ballen', kap: 20, leer: 3.9, preis: 48000,
      geo: { b: 8.2, bodyOff: 1.2, bodyLen: 8.8, breite: 2.6 }, kurve: 0.46 },

    { id: 'fw1', name: 'Fasswagen 10', art: 'fluessig', kap: 10, leer: 3.0, preis: 26000,
      geo: { b: 5.8, bodyOff: 1.1, bodyLen: 5.9, breite: 2.4 }, kurve: 0.74 },
    { id: 'fw2', name: 'Fasswagen 18', art: 'fluessig', kap: 18, leer: 4.6, preis: 58000,
      geo: { b: 7.2, bodyOff: 1.2, bodyLen: 7.4, breite: 2.5 }, kurve: 0.68 },

    { id: 'tl1', name: 'Tieflader 1', art: 'fahrzeug', kap: 1, leer: 4.2, preis: 55000,
      geo: { b: 7.0, bodyOff: 1.0, bodyLen: 7.6, breite: 2.6 }, kurve: 0.72 },
    { id: 'tl2', name: 'Tieflader 2', art: 'fahrzeug', kap: 2, leer: 6.0, preis: 110000,
      geo: { b: 8.6, bodyOff: 1.1, bodyLen: 9.4, breite: 2.7 }, kurve: 0.66 },

    { id: 'rw1', name: 'Rückewagen 14', art: 'holz', kap: 14, leer: 4.4, preis: 64000,
      geo: { b: 6.8, bodyOff: 1.1, bodyLen: 7.2, breite: 2.5 }, kurve: 0.7 },
    { id: 'rw2', name: 'Rückewagen 24', art: 'holz', kap: 24, leer: 6.2, preis: 118000,
      geo: { b: 8.4, bodyOff: 1.2, bodyLen: 8.9, breite: 2.6 }, kurve: 0.64 }
  ];

  /* ---------------------------------------------------------------
   * Zusatzausruestung fuer den Traktor
   * ------------------------------------------------------------- */
  var ausruestung = [
    { id: 'strassenreifen', name: 'Straßenreifen', preis: 4200, gruppe: 'reifen',
      text: 'Schneller und sparsamer auf befestigten Wegen, mühsam im Gelände.',
      wirkung: { strasse: { speed: 1.08, verbrauch: 0.92 }, feldweg: { speed: 0.95 }, gelaende: { speed: 0.78, verbrauch: 1.15 } } },
    { id: 'ackerreifen', name: 'Ackerreifen', preis: 5400, gruppe: 'reifen',
      text: 'Zieht überall durch, kostet auf der Straße etwas Tempo.',
      wirkung: { strasse: { speed: 0.93, verbrauch: 1.06 }, feldweg: { speed: 1.14 }, gelaende: { speed: 1.28, verbrauch: 0.94 } } },
    { id: 'frontgewicht', name: 'Frontgewicht', preis: 3100, gruppe: 'anbau',
      text: 'Ruhigere Lenkung mit schwerem Anhänger, dafür etwas mehr Verbrauch.',
      wirkung: { alle: { verbrauch: 1.05 }, halt: 1.14, masse: 0.9 } },
    { id: 'grosstank', name: 'Größerer Tank', preis: 2600, gruppe: 'anbau',
      text: 'Ein Drittel mehr Diesel an Bord. Seltener zur Tankstelle.',
      wirkung: { tank: 1.34 } }
  ];

  /* ---------------------------------------------------------------
   * Ruf-Stufen
   * ------------------------------------------------------------- */
  var stufen = [
    { stufe: 1, ruf: 0,    frei: 'Schüttgut, kleine Aufträge rund ums Dorf' },
    { stufe: 2, ruf: 250,  frei: 'Paletten, Ballen und Fasswagen, mittlere Entfernungen' },
    { stufe: 3, ruf: 700,  frei: 'Fahrzeugüberführungen, Rundholz, Aufträge zum Sägewerk' },
    { stufe: 4, ruf: 1500, frei: 'Eigene Halle und der erste angestellte Fahrer' },
    { stufe: 5, ruf: 3000, frei: 'Zweite Region auf der Karte, Großaufträge über mehrere Tage' },
    { stufe: 6, ruf: 6000, frei: 'Stammkunden mit dauerhaften Verträgen' }
  ];

  function stufeVonRuf(ruf) {
    var s = 1;
    for (var i = 0; i < stufen.length; i++) if (ruf >= stufen[i].ruf) s = stufen[i].stufe;
    return s;
  }
  function naechsteStufe(ruf) {
    for (var i = 0; i < stufen.length; i++) if (ruf < stufen[i].ruf) return stufen[i];
    return null;
  }

  function traktor(id) {
    for (var i = 0; i < traktoren.length; i++) if (traktoren[i].id === id) return traktoren[i];
    return null;
  }
  function anh(id) {
    for (var i = 0; i < anhaenger.length; i++) if (anhaenger[i].id === id) return anhaenger[i];
    return null;
  }
  function ausr(id) {
    for (var i = 0; i < ausruestung.length; i++) if (ausruestung[i].id === id) return ausruestung[i];
    return null;
  }

  return {
    arten: arten, waren: waren,
    traktoren: traktoren, anhaenger: anhaenger, ausruestung: ausruestung,
    stufen: stufen,
    stufeVonRuf: stufeVonRuf, naechsteStufe: naechsteStufe,
    traktor: traktor, anhaenger_: anh, ausruestung_: ausr
  };
})();
