/* Landfracht — die Karte
 *
 * Weltmass: 1 Einheit = 1 Meter. Die Karte ist 3000 x 3000 gross.
 * Wege sind Polygonzuege mit Breite; daraus wird beim Start ein
 * grobes Raster gebaut, damit die Untergrundabfrage billig bleibt.
 * Gebaeude und Ladezonen sind in echten Metern angegeben: eine Scheune
 * ist gut 30 m lang, eine enge Zone knapp 10 m — das ist der Grund,
 * warum Rangieren dort Arbeit macht.
 */
var TG = window.TG || (window.TG = {});

TG.welt = (function () {
  var U = TG.util;

  var GROESSE = 3000;

  /* ---------------- Untergruende ---------------- */
  var untergruende = {
    strasse:  { name: 'Landstraße', speed: 1.00, halt: 1.00, roll: 1.00, verbrauch: 1.00, verschleiss: 1.00 },
    feldweg:  { name: 'Feldweg',    speed: 0.72, halt: 0.80, roll: 1.55, verbrauch: 1.25, verschleiss: 1.85 },
    gelaende: { name: 'Gelände',    speed: 0.45, halt: 0.62, roll: 2.60, verbrauch: 1.50, verschleiss: 2.60 }
  };

  /* ---------------- Wegenetz ---------------- */
  var wege = [
    // Hauptachse Nord-Sued durch das Dorf
    { typ: 'strasse', breite: 10, p: [[1500, 220], [1500, 620], [1490, 900], [1520, 1180], [1515, 1420], [1500, 1700], [1495, 1900], [1480, 2180], [1478, 2420], [1500, 2760]] },
    // Hauptachse West-Ost
    { typ: 'strasse', breite: 10, p: [[240, 1560], [560, 1540], [810, 1520], [1140, 1505], [1515, 1500], [1830, 1490], [2210, 1478], [2560, 1495], [2830, 1520]] },

    // Abzweig Muehle
    { typ: 'strasse', breite: 8, p: [[1490, 900], [1400, 800], [1300, 700], [1258, 646]] },
    // Abzweig Saegewerk
    { typ: 'strasse', breite: 8, p: [[810, 1520], [700, 1290], [560, 1030], [455, 830], [408, 738]] },
    // Abzweig Hof Lindenbach
    { typ: 'strasse', breite: 8, p: [[810, 1520], [790, 1760], [740, 1990], [672, 2142], [640, 2200]] },
    // Abzweig Biogasanlage
    { typ: 'strasse', breite: 8, p: [[1478, 2420], [1740, 2470], [2050, 2510], [2330, 2520], [2482, 2516]] },
    // Abzweig Lagerhaus
    { typ: 'strasse', breite: 8, p: [[2210, 1478], [2290, 1580], [2340, 1700], [2352, 1808]] },
    // Abzweig Baumarkt
    { typ: 'strasse', breite: 8, p: [[1515, 1420], [1650, 1310], [1780, 1215], [1856, 1172]] },
    // Abzweig Landtechnik-Haendler
    { typ: 'strasse', breite: 8, p: [[1480, 2180], [1650, 2200], [1830, 2210], [1948, 2220]] },
    // Abzweig Gutshof Kirschberg
    { typ: 'strasse', breite: 8, p: [[2210, 1478], [2380, 1300], [2560, 1090], [2704, 936]] },

    // Feldwege
    { typ: 'feldweg', breite: 5.5, p: [[672, 2142], [900, 2050], [1150, 1985], [1350, 1935], [1493, 1905]] },  // Abkuerzung Hof -> Tankstelle
    { typ: 'feldweg', breite: 5.5, p: [[810, 1520], [845, 1370], [880, 1230], [900, 1158]] },                  // zur Feldscheune
    { typ: 'feldweg', breite: 5.5, p: [[2330, 2520], [2450, 2260], [2440, 2010], [2356, 1824]] },              // Biogas -> Lagerhaus
    { typ: 'feldweg', breite: 5.5, p: [[1258, 646], [1050, 690], [830, 760], [620, 800], [455, 830]] },        // Muehle -> Saegewerk
    { typ: 'feldweg', breite: 5.5, p: [[900, 1158], [1080, 1080], [1230, 950], [1250, 762]] },                 // Feldscheune -> Muehle
    { typ: 'feldweg', breite: 5.5, p: [[2704, 936], [2770, 1250], [2700, 1560], [2620, 1800], [2500, 2050], [2450, 2260]] } // Ostschleife
  ];

  /* ---------------- Felder (nur Optik) ---------------- */
  var felder = [
    { x: 300,  y: 300,  w: 420, h: 300, t: 0 },
    { x: 880,  y: 260,  w: 360, h: 250, t: 1 },
    { x: 1650, y: 250,  w: 480, h: 330, t: 2 },
    { x: 2380, y: 320,  w: 360, h: 300, t: 0 },
    { x: 250,  y: 980,  w: 280, h: 340, t: 1 },
    { x: 980,  y: 880,  w: 340, h: 260, t: 2 },
    { x: 1700, y: 780,  w: 400, h: 380, t: 1 },
    { x: 2300, y: 880,  w: 260, h: 250, t: 0 },
    { x: 280,  y: 1700, w: 340, h: 380, t: 2 },
    { x: 950,  y: 1620, w: 380, h: 220, t: 0 },
    { x: 1750, y: 1620, w: 400, h: 340, t: 1 },
    { x: 2500, y: 1650, w: 300, h: 250, t: 2 },
    { x: 300,  y: 2400, w: 500, h: 360, t: 1 },
    { x: 1050, y: 2280, w: 280, h: 400, t: 2 },
    { x: 1680, y: 2620, w: 400, h: 230, t: 0 },
    { x: 2100, y: 1900, w: 240, h: 270, t: 1 }
  ];

  /* ---------------- Orte ---------------- */
  function zone(x, y, w, h, rot, arten, eng) {
    return { x: x, y: y, w: w, h: h, rot: rot || 0, arten: arten, eng: !!eng };
  }
  function geb(x, y, w, h, f, d, rund) {
    return { x: x, y: y, w: w, h: h, f: f, d: d, rund: !!rund };
  }

  var alleArten = ['schuett', 'palette', 'ballen', 'fluessig', 'fahrzeug', 'holz'];
  var WEIT = ['schuett', 'ballen', 'fluessig', 'holz'];   // Zonen, in die man grob hineinfahren darf
  var ENG = ['palette', 'fahrzeug'];                       // Zonen, die sauberes Rangieren verlangen

  var orte = [
    {
      id: 'hof', name: 'Hof Lindenbach', kurz: 'Hof', x: 600, y: 2210, istHof: true,
      gebaeude: [
        geb(566, 2184, 15, 12, '#7a5c3c', '#9c4a34'),
        geb(606, 2182, 34, 14, '#6e5236', '#8a4a30'),
        geb(578, 2236, 26, 11, '#6a5a44', '#6a6a5a')
      ],
      zonen: [zone(630, 2226, 20, 11, 0, WEIT), zone(618, 2256, 11, 5, 0, ENG, true)],
      gibt: ['getreide', 'mais', 'kartoffeln', 'guelle', 'strohballen', 'heuballen'],
      nimmt: ['duenger', 'saatgut', 'futtersaecke', 'wasser', 'silageballen', 'traktor', 'pflug', 'maehwerk']
    },
    {
      id: 'lager', name: 'Lagerhaus Ebersbach', kurz: 'Lagerhaus', x: 2352, y: 1795,
      gebaeude: [
        geb(2334, 1784, 38, 16, '#6c7680', '#8a949c'),
        geb(2374, 1780, 14, 12, '#5e6870', '#7a848c')
      ],
      zonen: [zone(2350, 1814, 20, 11, 0, WEIT), zone(2384, 1804, 11, 5, 0, ENG, true)],
      gibt: ['getreide', 'kartoffeln', 'saatgut', 'duenger', 'futtersaecke', 'ziegel'],
      nimmt: ['getreide', 'kartoffeln', 'mais', 'saatgut', 'duenger', 'futtersaecke', 'ziegel', 'strohballen']
    },
    {
      id: 'muehle', name: 'Mühle Rothbach', kurz: 'Mühle', x: 1252, y: 616,
      gebaeude: [
        geb(1238, 602, 22, 22, '#8a7a5c', '#6a5a44'),
        geb(1268, 610, 18, 14, '#7a6c50', '#5e523e')
      ],
      zonen: [zone(1252, 650, 20, 11, 0, WEIT), zone(1284, 640, 11, 5, 0, ENG, true)],
      gibt: ['futtersaecke', 'getreide'],
      nimmt: ['getreide', 'mais']
    },
    {
      id: 'biogas', name: 'Biogasanlage Talhof', kurz: 'Biogas', x: 2496, y: 2490,
      gebaeude: [
        geb(2482, 2480, 26, 26, '#5e7a52', '#7a9a68', true),
        geb(2516, 2490, 22, 16, '#546c4a', '#6a8a5c')
      ],
      zonen: [zone(2490, 2520, 20, 11, 0, WEIT), zone(2522, 2512, 11, 5, 0, ENG, true)],
      gibt: ['guelle', 'hackschnitzel'],
      nimmt: ['mais', 'silageballen', 'guelle', 'hackschnitzel', 'wasser']
    },
    {
      id: 'baumarkt', name: 'Baustoffhandel Kern', kurz: 'Baumarkt', x: 1866, y: 1152,
      gebaeude: [
        geb(1852, 1138, 32, 14, '#8a5c42', '#a8543c'),
        geb(1886, 1152, 18, 14, '#77503a', '#934834')
      ],
      zonen: [zone(1854, 1176, 20, 11, 0, ['schuett', 'holz', 'ballen', 'fluessig']), zone(1888, 1174, 11, 5, 0, ENG, true)],
      gibt: ['ziegel', 'duenger', 'saatgut'],
      nimmt: ['ziegel', 'hackschnitzel', 'stammholz']
    },
    {
      id: 'saegewerk', name: 'Sägewerk Hochwald', kurz: 'Sägewerk', x: 398, y: 714,
      gebaeude: [
        geb(384, 700, 34, 15, '#6a4e32', '#8a6440'),
        geb(418, 714, 16, 12, '#5c442c', '#7a5638')
      ],
      zonen: [zone(388, 734, 20, 11, 0, WEIT), zone(422, 736, 11, 5, 0, ENG, true)],
      gibt: ['stammholz', 'hackschnitzel'],
      nimmt: ['stammholz']
    },
    {
      id: 'haendler', name: 'Landtechnik Vosskamp', kurz: 'Händler', x: 1958, y: 2208, istHaendler: true,
      gebaeude: [
        geb(1944, 2194, 34, 15, '#4a6e82', '#5b8ea8'),
        geb(1980, 2198, 15, 12, '#3e5c6c', '#4d7d94')
      ],
      zonen: [zone(1946, 2232, 20, 11, 0, WEIT), zone(1980, 2224, 11, 5, 0, ENG, true)],
      gibt: ['traktor', 'maehwerk', 'pflug', 'feldspritze'],
      nimmt: ['traktor', 'maehwerk', 'pflug', 'feldspritze']
    },
    {
      id: 'gutshof', name: 'Gutshof Kirschberg', kurz: 'Gutshof', x: 2700, y: 916,
      gebaeude: [
        geb(2676, 898, 15, 12, '#7a6a42', '#8a5a3c'),
        geb(2714, 896, 30, 14, '#6a5c3a', '#7a4e34'),
        geb(2684, 940, 24, 11, '#5e5236', '#6a6a52')
      ],
      zonen: [zone(2726, 928, 20, 11, 0, WEIT), zone(2714, 956, 11, 5, 0, ENG, true)],
      gibt: ['getreide', 'mais', 'strohballen', 'heuballen', 'silageballen', 'guelle', 'kartoffeln'],
      nimmt: ['duenger', 'saatgut', 'futtersaecke', 'wasser', 'traktor', 'maehwerk', 'feldspritze', 'pflug']
    },
    {
      id: 'scheune', name: 'Feldscheune Moorkamp', kurz: 'Feldscheune', x: 906, y: 1140,
      gebaeude: [geb(894, 1128, 30, 14, '#7a6448', '#6a5238')],
      zonen: [zone(898, 1152, 20, 11, 0, WEIT), zone(928, 1146, 11, 5, 0, ENG, true)],
      gibt: ['strohballen', 'heuballen', 'silageballen', 'kartoffeln'],
      nimmt: ['duenger', 'saatgut', 'strohballen', 'heuballen', 'kartoffeln', 'getreide', 'mais']
    },
    {
      id: 'dorf', name: 'Dorf Ebersbach', kurz: 'Dorf', x: 1556, y: 1556,
      gebaeude: [
        geb(1470, 1452, 14, 11, '#8a8272', '#8a4a3c'),
        geb(1532, 1446, 13, 10, '#847c6c', '#7c443a'),
        geb(1464, 1528, 14, 11, '#8a8272', '#7c443a'),
        geb(1546, 1534, 16, 12, '#7e7666', '#8a4a3c'),
        geb(1566, 1588, 13, 10, '#8a8272', '#6e5a4a'),
        geb(1504, 1598, 14, 11, '#847c6c', '#8a4a3c'),
        geb(1602, 1556, 15, 11, '#8a8272', '#7c443a')
      ],
      zonen: [zone(1596, 1602, 20, 11, 0, WEIT), zone(1624, 1578, 11, 5, 0, ENG, true)],
      gibt: ['ziegel', 'futtersaecke'],
      nimmt: ['ziegel', 'hackschnitzel', 'futtersaecke', 'wasser']
    },
    {
      id: 'tanke', name: 'Tankstelle Ebersbach', kurz: 'Tankstelle', x: 1524, y: 1868, istTanke: true,
      gebaeude: [geb(1530, 1856, 18, 9, '#6a6658', '#c9a53d')],
      zonen: [zone(1516, 1876, 20, 10, 0, alleArten)],
      gibt: ['diesel'],
      nimmt: ['diesel']
    }
  ];

  function ort(id) {
    for (var i = 0; i < orte.length; i++) if (orte[i].id === id) return orte[i];
    return null;
  }

  /** Passende Zone eines Ortes fuer eine Auftragsart. */
  function zoneFuer(o, art) {
    var allgemein = null;
    for (var i = 0; i < o.zonen.length; i++) {
      var z = o.zonen[i];
      if (z.arten.indexOf(art) >= 0) {
        if (z.eng) return z;
        if (!allgemein) allgemein = z;
      }
    }
    return allgemein;
  }

  /* ---------------- Untergrundraster ---------------- */
  var RASTER = 120;
  var spalten = Math.ceil(GROESSE / RASTER);
  var raster = null;

  function bauRaster() {
    raster = new Array(spalten * spalten);
    for (var i = 0; i < raster.length; i++) raster[i] = null;

    for (var w = 0; w < wege.length; w++) {
      var weg = wege[w];
      for (var s = 0; s < weg.p.length - 1; s++) {
        var a = weg.p[s], b = weg.p[s + 1];
        var r = weg.breite / 2 + 4;
        var minx = Math.min(a[0], b[0]) - r, maxx = Math.max(a[0], b[0]) + r;
        var miny = Math.min(a[1], b[1]) - r, maxy = Math.max(a[1], b[1]) + r;
        var cx0 = Math.max(0, Math.floor(minx / RASTER)), cx1 = Math.min(spalten - 1, Math.floor(maxx / RASTER));
        var cy0 = Math.max(0, Math.floor(miny / RASTER)), cy1 = Math.min(spalten - 1, Math.floor(maxy / RASTER));
        for (var cy = cy0; cy <= cy1; cy++) {
          for (var cx = cx0; cx <= cx1; cx++) {
            var k = cy * spalten + cx;
            if (!raster[k]) raster[k] = [];
            raster[k].push({ typ: weg.typ, br: weg.breite, ax: a[0], ay: a[1], bx: b[0], by: b[1] });
          }
        }
      }
    }
  }

  /** Untergrund an einer Weltposition. */
  function untergrundAn(x, y) {
    if (!raster) bauRaster();
    var cx = Math.floor(x / RASTER), cy = Math.floor(y / RASTER);
    if (cx < 0 || cy < 0 || cx >= spalten || cy >= spalten) return 'gelaende';
    var liste = raster[cy * spalten + cx];
    if (!liste) return 'gelaende';
    var treffer = null;
    for (var i = 0; i < liste.length; i++) {
      var s = liste[i];
      var d = U.abstandStrecke(x, y, s.ax, s.ay, s.bx, s.by);
      if (d <= s.br / 2) {
        if (s.typ === 'strasse') return 'strasse';
        treffer = 'feldweg';
      }
    }
    return treffer || 'gelaende';
  }

  /* ---------------- Gebaeude-Kollision ---------------- */
  var hindernisse = null;

  function bauHindernisse() {
    hindernisse = [];
    for (var i = 0; i < orte.length; i++) {
      var o = orte[i];
      for (var g = 0; g < o.gebaeude.length; g++) {
        var b = o.gebaeude[g];
        hindernisse.push({ x: b.x, y: b.y, w: b.w, h: b.h });
      }
    }
  }

  /** Gibt das Gebaeude zurueck, in dem der Punkt steckt. */
  function imGebaeude(x, y, puffer) {
    if (!hindernisse) bauHindernisse();
    puffer = puffer || 0;
    for (var i = 0; i < hindernisse.length; i++) {
      var b = hindernisse[i];
      if (Math.abs(x - b.x) <= b.w / 2 + puffer && Math.abs(y - b.y) <= b.h / 2 + puffer) return b;
    }
    return null;
  }

  /* ---------------- Entfernungen ---------------- */
  // Die Fahrstrecke wird als Luftlinie mit Umwegzuschlag geschaetzt. Fuer die
  // Bewertung eines Auftrags reicht das und bleibt nachvollziehbar.
  function fahrstrecke(idA, idB) {
    var a = ort(idA), b = ort(idB);
    if (!a || !b) return 0;
    return U.abstand(a.x, a.y, b.x, b.y) * 1.28;
  }

  function naechsterOrt(x, y, maxD) {
    var best = null, bd = maxD || 260;
    for (var i = 0; i < orte.length; i++) {
      var d = U.abstand(x, y, orte[i].x, orte[i].y);
      if (d < bd) { bd = d; best = orte[i]; }
    }
    return best;
  }

  return {
    GROESSE: GROESSE,
    untergruende: untergruende,
    wege: wege, felder: felder, orte: orte,
    ort: ort, zoneFuer: zoneFuer,
    untergrundAn: untergrundAn, imGebaeude: imGebaeude,
    fahrstrecke: fahrstrecke, naechsterOrt: naechsterOrt
  };
})();
