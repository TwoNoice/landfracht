/* Landfracht — die Karte
 *
 * Weltmass: 1 Einheit = 1 Meter. Die Karte ist 720 x 720 gross.
 * Wege sind Polygonzuege mit Breite; daraus wird beim Start ein
 * grobes Raster gebaut, damit die Untergrundabfrage billig bleibt.
 * Gebaeude und Ladezonen sind in echten Metern angegeben: eine Scheune
 * ist gut 30 m lang, eine enge Zone knapp 10 m — das ist der Grund,
 * warum Rangieren dort Arbeit macht.
 */
var TG = window.TG || (window.TG = {});

TG.welt = (function () {
  var U = TG.util;

  var GROESSE = 720;

  /* ---------------- Untergruende ---------------- */
  var untergruende = {
    strasse:  { name: 'Landstraße', speed: 1.00, halt: 1.00, roll: 1.00, verbrauch: 1.00, verschleiss: 1.00 },
    feldweg:  { name: 'Feldweg',    speed: 0.72, halt: 0.80, roll: 1.55, verbrauch: 1.25, verschleiss: 1.85 },
    gelaende: { name: 'Gelände',    speed: 0.45, halt: 0.62, roll: 2.60, verbrauch: 1.50, verschleiss: 2.60 }
  };

  /* ---------------- Wegenetz ----------------
   * Angegeben wird nur das Gerippe: alle 20 bis 50 m ein Stuetzpunkt. Aus
   * dem Gerippe wird der fertige Weg in zwei Schritten gebaut:
   *
   *   1. `schlaengeln()` legt in jedes Stueck eine Schlangenlinie und setzt
   *      dazu Zwischenpunkte. Deshalb windet sich auch eine Verbindung, die
   *      im Gerippe als Gerade steht.
   *   2. `ausrollen()` glaettet das Ganze zu einem dichten Zug, ein Punkt
   *      alle zwei Meter.
   *
   * Gefahren, gezeichnet und ins Raster gelegt wird ausschliesslich dieser
   * Zug — Optik, Untergrund und Kollision koennen so gar nicht
   * auseinanderlaufen.
   *
   * Wo zwei Wege sich treffen, nennen beide denselben Stuetzpunkt. Das ist
   * kein Zufall, sondern Bedingung: Stuetzpunkte werden vom Schlaengeln nicht
   * verschoben und die Kurve laeuft durch sie hindurch, also bleibt die
   * Kreuzung genau dort liegen. Ein Abzweig, der nur ungefaehr am Hauptweg
   * beginnt, haengt hinterher sichtbar daneben.
   *
   * Das Netz ist bewusst vermascht und nicht sternfoermig: zu jedem Ort
   * fuehren mindestens zwei Wege, und die Spangen verbinden die Zubringer
   * untereinander. Ein Stern zwingt jede Fahrt ueber dieselbe Kreuzung, und
   * dann fahren alle Auftraege sich gleich an.
   */
  var wege = [
    /* --- Hauptachsen --- */
    // Talstraße — Nord-Sued, quer durchs Dorf
    { typ: 'strasse', breite: 7, p: [[348.6, 10], [360, 36], [375.8, 72], [386.9, 112.8], [374.4, 144], [352.8, 182.4], [337.9, 216], [340.3, 249.6], [358.1, 278.4], [372.5, 304.8], [371, 331.7], [362.9, 360], [358.6, 386.4], [348.5, 410.9], [349.4, 434.4], [359.3, 456], [368.6, 480], [364.8, 503.5], [354.7, 523.2], [348.5, 549.6], [354.7, 580.8], [369.6, 609.6], [375.8, 643.2], [365.3, 676.8], [354.9, 710]] },
    // Querstraße — West-Ost
    { typ: 'strasse', breite: 7, p: [[10, 393.4], [48, 383], [79.2, 374.4], [112.8, 365.8], [146.4, 371], [178.1, 380.2], [203.5, 371.5], [223.2, 352.8], [254.4, 344.6], [288, 348.5], [319.2, 358.6], [340.8, 362.9], [362.9, 360], [386.4, 351.8], [412.8, 344.6], [439.2, 348], [467.5, 358.6], [495.4, 361.9], [522.7, 354.7], [549.6, 345.6], [578.4, 348.5], [609.6, 360.5], [643.2, 369.6], [681.6, 372.5], [710, 374.6]] },
    /* --- Zubringer zu den Orten --- */
    // Mühlenweg
    { typ: 'strasse', breite: 6.5, p: [[337.9, 216], [333.1, 201.1], [319.2, 192], [309.6, 178.1], [301.9, 155]] },
    // Hochwaldstraße — die lange Steigung hinauf zum Saegewerk
    { typ: 'strasse', breite: 6.5, p: [[203.5, 371.5], [189.6, 340.8], [168, 312], [158.4, 278.4], [145.4, 247.2], [122.9, 219.8], [105.6, 196.8], [97.9, 177.1]] },
    // Lindenbachstraße — zum Hof
    { typ: 'strasse', breite: 6.5, p: [[178.1, 380.2], [185.3, 405.6], [182.9, 433.4], [178, 450], [169.4, 482.4], [161.3, 506.4], [155, 523.2], [152.6, 537.6]] },
    // Talhofstraße — zur Biogasanlage
    { typ: 'strasse', breite: 6.5, p: [[354.7, 580.8], [384, 593.3], [417.6, 601.4], [451.2, 594.7], [482.4, 585.6], [513.6, 589.4], [542.4, 601.4], [559.2, 606.7], [578.4, 608.2], [595.7, 603.8]] },
    // Speicherstraße — zum Lagerhaus, westlich um die Halle herum
    { typ: 'strasse', breite: 6.5, p: [[522.7, 354.7], [535.7, 374.4], [538.6, 398.9], [541.9, 420], [548.6, 438.2], [559.2, 443], [569.3, 439.2]] },
    // Kernstraße — zum Baustoffhandel
    { typ: 'strasse', breite: 6.5, p: [[371, 331.7], [390.2, 319.2], [405.6, 307.7], [415.2, 292.3], [430.6, 283.2], [445.4, 281.3]] },
    // Vosskampstraße — zum Landtechnik-Haendler
    { typ: 'strasse', breite: 6.5, p: [[354.7, 523.2], [376.8, 515.5], [398.4, 520.3], [419.5, 531.4], [443, 537.1], [467.5, 532.8]] },
    // Kirschbergstraße — hinauf zum Gutshof
    { typ: 'strasse', breite: 6.5, p: [[549.6, 345.6], [566.4, 324.5], [574.6, 299], [593.3, 280.8], [614.4, 258.7], [631.7, 243.8], [646.6, 239], [653.8, 230.9]] },
    // Dorfstraße — kleiner Ring oestlich der Kreuzung
    { typ: 'strasse', breite: 5.5, p: [[358.6, 386.4], [371, 392.6], [384, 390.2], [390.2, 379.2], [392.3, 369.2], [386.4, 351.8]] },
    // Moorkampstraße — zur Feldscheune
    { typ: 'strasse', breite: 6.5, p: [[288, 348.5], [273.6, 331.2], [254.4, 309.6], [240, 292.8], [225.1, 283.2], [216, 277.9]] },
    /* --- Spangen: verbinden die Zubringer untereinander --- */
    // Höhenstraße — grosser Nordostbogen von der Talstraße zum Kirschberg
    { typ: 'strasse', breite: 6.5, p: [[386.9, 112.8], [418.1, 103.7], [448.3, 112.3], [473.3, 129.6], [493.9, 149.8], [511.7, 172.8], [529.9, 194.9], [548.6, 216], [566.4, 240], [580.3, 261.6], [593.3, 280.8]] },
    // Nordstraße — Muehle nach Nordwesten zum Saegewerk
    { typ: 'strasse', breite: 6.5, p: [[309.6, 178.1], [283.2, 165.6], [254.4, 146.4], [240.4, 129.2], [223.2, 121.6], [206.4, 124.8], [175.2, 141.6], [151.2, 165.6], [124.8, 182.4], [105.6, 196.8]] },
    // Ostspange — Nord-Sued im Osten, Querstraße nach Vosskamp
    { typ: 'strasse', breite: 6.5, p: [[439.2, 348], [450.2, 374.4], [456, 412.8], [454.1, 446.4], [451.2, 475.2], [440.6, 504], [429.6, 520.8], [419.5, 531.4]] },
    // Südstraße — am Hof vorbei durch den Sueden zurueck zur Talstraße
    { typ: 'strasse', breite: 6.5, p: [[152.6, 537.6], [168, 576], [196.8, 609.6], [235.2, 636], [278.4, 652.8], [319.2, 662.4], [352.8, 657.6], [375.8, 643.2]] },
    // Westumgehung — Querstraße hinauf zur Hochwaldstraße
    { typ: 'strasse', breite: 6.5, p: [[112.8, 365.8], [108.5, 345.6], [103.2, 321.6], [112.8, 292.8], [129.6, 268.8], [145.4, 247.2]] },
    // Baumarktspange — vom Baustoffhandel hinunter zur Querstraße
    { typ: 'strasse', breite: 6.5, p: [[445.4, 281.3], [463.2, 297.6], [470.4, 319.2], [467.5, 358.6]] },
    // Lagerspange — zweiter Zugang zum Lagerhaus von Westen
    { typ: 'strasse', breite: 6.5, p: [[495.4, 361.9], [504, 384], [513.6, 408], [528, 422.4], [548.6, 438.2]] },
    // Ostring — oestliche Schleife hinauf zum Kirschberg
    { typ: 'strasse', breite: 6.5, p: [[609.6, 360.5], [622.1, 336], [628.8, 309.1], [624, 283.2], [614.4, 258.7]] },
    // Biogasspange — vom Haendler quer zur Talhofstraße
    { typ: 'strasse', breite: 6.5, p: [[467.5, 532.8], [482.4, 556.8], [494.4, 576], [513.6, 589.4]] },
    // Tankspange — von der Tankstelle nach Osten auf die Ostspange
    { typ: 'strasse', breite: 6.5, p: [[359.3, 456], [379.2, 448.3], [400.8, 439.2], [424.8, 429.6], [439.2, 421.4], [456, 412.8]] },
    /* --- Feldwege: Abkuerzungen und Randlagen --- */
    // Abkuerzung Hof -> Tankstelle
    { typ: 'feldweg', breite: 4.5, p: [[161.3, 506.4], [196.8, 498.7], [230.4, 488.6], [261.6, 477.6], [292.8, 471.8], [319.2, 463.7], [340.8, 458.9], [359.3, 456]] },
    // Feldscheune -> Muehle
    { typ: 'feldweg', breite: 4.5, p: [[216, 277.9], [234.7, 258.7], [259.7, 247.2], [278.4, 228.5], [291.4, 206.4], [309.6, 178.1]] },
    // Biogas -> Lagerhaus
    { typ: 'feldweg', breite: 4.5, p: [[559.2, 606.7], [583.7, 576], [592.8, 542.4], [583.7, 507.8], [584.5, 477.6], [576, 451.2], [559.2, 443]] },
    // Ostschleife am Kartenrand entlang
    { typ: 'feldweg', breite: 4.5, p: [[646.6, 239], [665.6, 265.6], [673.4, 307.2], [659.5, 348], [643.2, 369.6], [635.5, 420], [624, 456], [604.8, 494.4], [592.8, 542.4]] },
    // Nordschleife hinter der Muehle
    { typ: 'feldweg', breite: 4.5, p: [[309.6, 178.1], [327.4, 163.7], [338.9, 142.1], [353.3, 121.4], [373.4, 109.9], [386.9, 112.8]] },
    // Heideweg — durch den leeren Suedwesten
    { typ: 'feldweg', breite: 4.5, p: [[112.8, 365.8], [96, 398.4], [81.6, 432], [72, 468], [81.6, 504], [100.8, 537.6], [124.8, 571.2], [153.6, 592.8], [196.8, 609.6]] },
    // Waldweg — durch den Nordwesten
    { typ: 'feldweg', breite: 4.5, p: [[105.6, 196.8], [86.4, 168], [72, 134.4], [81.6, 103.2], [110.4, 86.4], [144, 81.6], [175.2, 91.2], [206.4, 100.8], [223.2, 121.6]] },
    // Nordweg — oben quer zur Talstraße
    { typ: 'feldweg', breite: 4.5, p: [[360, 36], [336, 55.2], [312, 79.2], [290.4, 103.2], [273.6, 129.6], [254.4, 146.4]] },
    // Ostweg Nord — hinter der Höhenstraße herum
    { typ: 'feldweg', breite: 4.5, p: [[511.7, 172.8], [544.8, 155], [578.4, 147.4], [609.6, 153.6], [636, 172.8], [655.2, 192], [664.8, 213.6], [657.6, 230.4], [646.6, 239]] },
    // Ostweg Sued — am oestlichen Kartenrand
    { typ: 'feldweg', breite: 4.5, p: [[681.6, 372.5], [688.8, 408], [681.6, 446.4], [662.4, 475.2], [636, 492], [604.8, 494.4]] },
    // Suedostweg — Schleife um die Biogasanlage
    { typ: 'feldweg', breite: 4.5, p: [[595.7, 603.8], [624, 621.1], [642.2, 640.3], [651.8, 660.5], [645.6, 677.8], [621.6, 686.9], [588, 687.4], [556.8, 677.3], [528, 660.5], [503.5, 635.5], [487.7, 608.2], [482.4, 585.6]] },
    // Suedwestweg — von der Suedstraße hoch zur Abkuerzung
    { typ: 'feldweg', breite: 4.5, p: [[235.2, 636], [254.4, 600], [268.8, 571.2], [283.2, 542.4], [291.6, 508.8], [292.8, 471.8]] },
    // Dorfweg Ost — hinter dem Dorf herum
    { typ: 'feldweg', breite: 4.5, p: [[390.2, 379.2], [409.4, 389.3], [429.6, 393.6], [445.4, 384], [450.2, 374.4]] },
    // Muehlenfeldweg — Talstraße quer zur Moorkampstraße
    { typ: 'feldweg', breite: 4.5, p: [[340.3, 249.6], [319.2, 261.6], [297.6, 276], [276, 292.8], [254.4, 309.6]] }
  ];

  /* Schlangenlinie in die geraden Stuecke.
   *
   * Jedes Stueck zwischen zwei Stuetzpunkten wird quer zur Fahrtrichtung
   * ausgebeult, mit wechselndem Vorzeichen: einmal nach links, einmal nach
   * rechts, einmal wieder nach links. Aus einer Kette gerader Stuecke wird so
   * eine Kette von Boegen. Vorzeichen und Staerke kommen aus einer festen
   * Saat, die Karte sieht also bei jedem Start gleich aus.
   *
   * Die Form der Ausbeulung ist `sin(pi*u)^2` — eine *halbe* Welle je Stueck,
   * und das ist der ganze Trick. Eine volle Welle je Stueck (Bogen hin, Bogen
   * zurueck) sieht auf dem Papier lebendiger aus, kann aber nicht gross
   * werden: ihre Kruemmung faellt mit Laenge^2 / Ausschlag, und der Faktor ist
   * dabei dreimal so gross wie bei der halben Welle. Bei gleichem Radius
   * bleibt von ihr nur ein Siebtel des Ausschlags uebrig — das sieht man
   * schlicht nicht.
   *
   * Zwei Dinge daran sind nicht verhandelbar:
   *
   * - `sin(pi*u)^2` ist an beiden Enden null *und* dort flach. Nur null zu
   *   sein reicht nicht: dann knickt der Weg am Stuetzpunkt ab, statt
   *   hindurchzulaufen, und aus jeder Kreuzung wird ein Eck.
   * - Der Ausschlag waechst mit dem *Quadrat* der Stuecklaenge. Der Radius
   *   einer solchen Beule ist Laenge^2 / (2*pi^2 * Ausschlag); haelt man den
   *   Ausschlag fest, wird die Kurve auf einem kurzen Stueck beliebig eng und
   *   das Gespann kommt nicht mehr herum. Weil der Ausschlag aus der Laenge
   *   folgt, faellt der Radius dabei heraus: `AUSSCHLAG_NENNER` = 480 setzt
   *   ihn auf gut 24 m, unabhaengig davon, wie lang das Stueck ist — und
   *   damit auch unabhaengig vom Massstab der Karte. Beim Stauchen auf ein
   *   Viertel blieb er deshalb stehen, waehrend der Ausschlag selbst von
   *   ueber 20 m auf wenige Meter zusammenging. `WANDER` deckelt lange
   *   Stuecke, damit sie nicht ausufern.
   */
  var SCHLAENGEL_SCHRITT = 6;       // Meter zwischen zwei Zwischenpunkten
  var AUSSCHLAG_NENNER = 480;       // Laenge^2 / dieser Wert = Ausschlag in Metern
  var WANDER = { strasse: 4.5, feldweg: 5.5 };  // Obergrenze des Ausschlags je Art

  function wurf(n) {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    n = (n ^ (n >>> 13)) & 0x7fffffff;
    return ((n >>> 7) & 0xffff) / 0xffff;
  }

  function schlaengeln(p, kennung, staerke) {
    var aus = [p[0].slice()];
    for (var i = 0; i < p.length - 1; i++) {
      var a = p[i], b = p[i + 1];
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1) continue;
      var nx = -dy / L, ny = dx / L;
      // Die Seite wechselt streng ab, sie wird nicht gewuerfelt. Beulen zwei
      // benachbarte Stuecke zur selben Seite, addieren sich ihre Kruemmungen
      // am gemeinsamen Stuetzpunkt und der Radius dort halbiert sich — und das
      // ist genau die Stelle, an der ein Gespann haengt.
      // Abwechselnd heben sie sich stattdessen auf und es entsteht ein
      // Wendepunkt. Gewuerfelt werden nur die Staerke und die Seite, mit der
      // ein Weg anfaengt.
      var ausschlag = Math.min(staerke, L * L / AUSSCHLAG_NENNER)
        * (0.6 + 0.4 * wurf(kennung * 977 + i * 31))
        * (wurf(kennung * 613) < 0.5 ? -1 : 1) * (i % 2 ? -1 : 1);
      var stuecke = Math.max(2, Math.round(L / SCHLAENGEL_SCHRITT));
      for (var j = 1; j < stuecke; j++) {
        var u = j / stuecke;
        var huelle = Math.sin(Math.PI * u);
        var s = huelle * huelle * ausschlag;
        aus.push([a[0] + dx * u + nx * s, a[1] + dy * u + ny * s]);
      }
      aus.push(b.slice());
    }
    return aus;
  }

  /* Zentripetaler Catmull-Rom: die Kurve laeuft durch jeden Stuetzpunkt und
   * kann dabei — anders als die gleichmaessig parametrisierte Fassung — keine
   * Schlaufe nach aussen werfen, auch wenn die Stuetzpunkte ungleich weit
   * auseinanderliegen. Ein Ueberschwinger waere hier kein Schoenheitsfehler,
   * sondern eine Strasse, die durch ein Haus laeuft. */
  var AUSROLL_SCHRITT = 2;   // Meter zwischen zwei ausgerollten Punkten

  function misch(a, b, wa, wb) { return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb]; }

  function ausrollen(p, schritt) {
    if (p.length < 3) return p.slice();
    // Enden gespiegelt verlaengern, damit auch das erste und letzte Stueck
    // eine Kurve bekommt. Verdoppeln ginge nicht: Abstand 0 teilt durch null.
    var q = [[2 * p[0][0] - p[1][0], 2 * p[0][1] - p[1][1]]]
      .concat(p)
      .concat([[2 * p[p.length - 1][0] - p[p.length - 2][0], 2 * p[p.length - 1][1] - p[p.length - 2][1]]]);

    var aus = [];
    for (var i = 1; i < q.length - 2; i++) {
      var p0 = q[i - 1], p1 = q[i], p2 = q[i + 1], p3 = q[i + 2];
      var t0 = 0;
      var t1 = t0 + Math.max(0.001, Math.sqrt(U.abstand(p0[0], p0[1], p1[0], p1[1])));
      var t2 = t1 + Math.max(0.001, Math.sqrt(U.abstand(p1[0], p1[1], p2[0], p2[1])));
      var t3 = t2 + Math.max(0.001, Math.sqrt(U.abstand(p2[0], p2[1], p3[0], p3[1])));

      var n = Math.max(2, Math.round(U.abstand(p1[0], p1[1], p2[0], p2[1]) / schritt));
      for (var j = 0; j < n; j++) {
        var t = t1 + (t2 - t1) * (j / n);
        var a1 = misch(p0, p1, (t1 - t) / (t1 - t0), (t - t0) / (t1 - t0));
        var a2 = misch(p1, p2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1));
        var a3 = misch(p2, p3, (t3 - t) / (t3 - t2), (t - t2) / (t3 - t2));
        var b1 = misch(a1, a2, (t2 - t) / (t2 - t0), (t - t0) / (t2 - t0));
        var b2 = misch(a2, a3, (t3 - t) / (t3 - t1), (t - t1) / (t3 - t1));
        aus.push(misch(b1, b2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1)));
      }
    }
    aus.push(p[p.length - 1].slice());
    return aus;
  }

  for (var wi = 0; wi < wege.length; wi++) {
    wege[wi].stuetz = wege[wi].p;
    wege[wi].p = ausrollen(schlaengeln(wege[wi].p, wi + 1, WANDER[wege[wi].typ]), AUSROLL_SCHRITT);
  }

  /* ---------------- Felder (nur Optik) ----------------
   * t: 0 Weide, 1 Getreide, 2 Acker. `dreh` kippt den Schlag ein wenig aus
   * der Achse — lauter achsparallele Rechtecke sehen aus wie ein Formular,
   * nicht wie eine Flur.
   */
  var felder = [
    { x: 85.9, y: 17.4, w: 77, h: 51.4, t: 0, dreh: -0.1 },
    { x: 211.1, y: 29.6, w: 57.4, h: 55.6, t: 0, dreh: -0.05 },
    { x: 632.7, y: 22.2, w: 40.3, h: 33.6, t: 1, dreh: 0 },
    { x: 414.7, y: 192.5, w: 35.3, h: 43.2, t: 1, dreh: -0.09 },
    { x: 153.3, y: 642.1, w: 36.9, h: 64.1, t: 1, dreh: 0.07 },
    { x: 222.6, y: 389.8, w: 70.2, h: 28.3, t: 1, dreh: 0.03 },
    { x: 448.5, y: 39, w: 36.1, h: 59.8, t: 1, dreh: -0.06 },
    { x: 508.4, y: 70.7, w: 59.2, h: 36.5, t: 2, dreh: -0.1 },
    { x: 647.4, y: 526.6, w: 44.7, h: 41, t: 1, dreh: 0.05 },
    { x: 436.7, y: 623.8, w: 47.8, h: 60, t: 2, dreh: -0.09 },
    { x: 19.9, y: 206.2, w: 72, h: 48.8, t: 2, dreh: 0.1 },
    { x: 663.1, y: 651.4, w: 38.1, h: 50.2, t: 2, dreh: 0.05 },
    { x: 464.3, y: 457.7, w: 64.9, h: 31, t: 1, dreh: -0.03 },
    { x: 36.2, y: 619.3, w: 90.6, h: 28.7, t: 0, dreh: -0.05 },
    { x: 156.7, y: 172.6, w: 34.6, h: 46.1, t: 1, dreh: 0.05 },
    { x: 606.2, y: 104.3, w: 33.3, h: 29.2, t: 0, dreh: 0.09 },
    { x: 19.6, y: 494.9, w: 45.3, h: 65.3, t: 0, dreh: -0.04 },
    { x: 223.3, y: 538.9, w: 35.3, h: 32.4, t: 2, dreh: 0.06 },
    { x: 223.6, y: 200.5, w: 40.4, h: 26.8, t: 0, dreh: -0.06 },
    { x: 284.4, y: 584.8, w: 53.4, h: 39, t: 2, dreh: -0.08 },
    { x: 255.3, y: 670.3, w: 41.7, h: 29.8, t: 1, dreh: 0.04 },
    { x: 466.5, y: 196.1, w: 38.9, h: 34.8, t: 0, dreh: 0.03 },
    { x: 89.8, y: 464.8, w: 33.9, h: 33.7, t: 2, dreh: 0.02 },
    { x: 498.8, y: 272.3, w: 55, h: 50.1, t: 2, dreh: 0.05 },
    { x: 14.9, y: 300.7, w: 43.4, h: 26.6, t: 2, dreh: -0.01 },
    { x: 408.7, y: 128.9, w: 44.8, h: 49.1, t: 1, dreh: 0.05 },
    { x: 541.1, y: 620.6, w: 54.7, h: 28.1, t: 1, dreh: 0.03 },
    { x: 23.9, y: 14.7, w: 41, h: 35, t: 0, dreh: -0.08 },
    { x: 15.1, y: 672.9, w: 30.7, h: 27.7, t: 0, dreh: 0.07 },
    { x: 523.5, y: 516.8, w: 49.5, h: 41.8, t: 0, dreh: -0.08 }
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
      id: 'hof', name: 'Hof Lindenbach', kurz: 'Hof', x: 146, y: 517.4, istHof: true,
      gebaeude: [
        geb(135, 558.8, 12, 15, '#7a5c3c', '#9c4a34'),
        geb(117.8, 522.6, 14, 34, '#6e5236', '#8a4a30'),
        geb(178.4, 527.8, 11, 26, '#6a5a44', '#6a6a5a')
      ],
      zonen: [zone(149.3, 483.6, 20, 11, 4.32, WEIT), zone(181.6, 483.2, 11, 5, 4.32, ENG, true)],
      gibt: ['getreide', 'mais', 'kartoffeln', 'guelle', 'strohballen', 'heuballen'],
      nimmt: ['duenger', 'saatgut', 'futtersaecke', 'wasser', 'silageballen', 'traktor', 'pflug', 'maehwerk']
    },
    {
      id: 'lager', name: 'Lagerhaus Ebersbach', kurz: 'Lagerhaus', x: 574.5, y: 436.8,
      gebaeude: [
        geb(595.6, 435.9, 38, 16, '#6c7680', '#8a949c'),
        geb(564.5, 461.5, 14, 12, '#5e6870', '#7a848c')
      ],
      zonen: [zone(565.6, 419.9, 20, 11, 2.55, WEIT), zone(542.9, 447.1, 11, 5, 2.55, ENG, true)],
      gibt: ['getreide', 'kartoffeln', 'saatgut', 'duenger', 'futtersaecke', 'ziegel'],
      nimmt: ['getreide', 'kartoffeln', 'mais', 'saatgut', 'duenger', 'futtersaecke', 'ziegel', 'strohballen']
    },
    {
      id: 'muehle', name: 'Mühle Rothbach', kurz: 'Mühle', x: 297.5, y: 122.8,
      gebaeude: [
        geb(317.3, 122.8, 22, 22, '#8a7a5c', '#6a5a44'),
        geb(290.4, 138.4, 14, 18, '#7a6c50', '#5e523e')
      ],
      zonen: [zone(273.4, 98.8, 20, 11, 2.36, WEIT), zone(257.9, 128.5, 11, 5, 2.36, ENG, true)],
      gibt: ['futtersaecke', 'getreide'],
      nimmt: ['getreide', 'mais']
    },
    {
      id: 'biogas', name: 'Biogasanlage Talhof', kurz: 'Biogas', x: 618, y: 573.6,
      gebaeude: [
        geb(614.2, 556.8, 26, 26, '#5e7a52', '#7a9a68', true),
        geb(633, 586.9, 22, 16, '#546c4a', '#6a8a5c')
      ],
      zonen: [zone(593.6, 592.1, 20, 11, 0.73, WEIT), zone(622.9, 607.3, 11, 5, 0.73, ENG, true)],
      gibt: ['guelle', 'hackschnitzel'],
      nimmt: ['mais', 'silageballen', 'guelle', 'hackschnitzel', 'wasser']
    },
    {
      id: 'baumarkt', name: 'Baustoffhandel Kern', kurz: 'Baumarkt', x: 445.8, y: 275.5,
      gebaeude: [
        geb(428, 266.8, 32, 14, '#8a5c42', '#a8543c'),
        geb(464.7, 268.9, 18, 14, '#77503a', '#934834')
      ],
      zonen: [zone(442.3, 302.1, 20, 11, 5.95, ['schuett', 'holz', 'ballen', 'fluessig']), zone(473.8, 289.1, 11, 5, 5.95, ENG, true)],
      gibt: ['ziegel', 'duenger', 'saatgut'],
      nimmt: ['ziegel', 'hackschnitzel', 'stammholz']
    },
    {
      id: 'saegewerk', name: 'Sägewerk Hochwald', kurz: 'Sägewerk', x: 111.5, y: 141.4,
      gebaeude: [
        geb(98.4, 126.5, 34, 15, '#6a4e32', '#8a6440'),
        geb(131.5, 142.6, 16, 12, '#5c442c', '#7a5638')
      ],
      zonen: [zone(100.3, 160.7, 20, 11, 0.06, WEIT), zone(134.2, 164.8, 11, 5, 0.06, ENG, true)],
      gibt: ['stammholz', 'hackschnitzel'],
      nimmt: ['stammholz']
    },
    {
      id: 'haendler', name: 'Landtechnik Vosskamp', kurz: 'Händler', x: 474.9, y: 531.9, istHaendler: true,
      gebaeude: [
        geb(463.9, 515.5, 34, 15, '#4a6e82', '#5b8ea8'),
        geb(498.4, 526.4, 15, 12, '#3e5c6c', '#4d7d94')
      ],
      zonen: [zone(458.5, 553.1, 20, 11, 0.2, WEIT), zone(493.4, 551.9, 11, 5, 0.2, ENG, true)],
      gibt: ['traktor', 'maehwerk', 'pflug', 'feldspritze'],
      nimmt: ['traktor', 'maehwerk', 'pflug', 'feldspritze']
    },
    {
      id: 'gutshof', name: 'Gutshof Kirschberg', kurz: 'Gutshof', x: 671, y: 199.8,
      gebaeude: [
        geb(699.8, 191.6, 12, 15, '#7a6a42', '#8a5a3c'),
        geb(678.5, 223.1, 14, 30, '#6a5c3a', '#7a4e34'),
        geb(661.6, 172.6, 11, 24, '#5e5236', '#6a6a52')
      ],
      zonen: [zone(645.7, 213.3, 20, 11, 2.22, WEIT), zone(630.7, 186.8, 11, 5, 2.22, ENG, true)],
      gibt: ['getreide', 'mais', 'strohballen', 'heuballen', 'silageballen', 'guelle', 'kartoffeln'],
      nimmt: ['duenger', 'saatgut', 'futtersaecke', 'wasser', 'traktor', 'maehwerk', 'feldspritze', 'pflug']
    },
    {
      id: 'scheune', name: 'Feldscheune Moorkamp', kurz: 'Feldscheune', x: 217.4, y: 284.6,
      gebaeude: [
        geb(200.5, 284.6, 14, 30, '#7a6448', '#6a5238')
      ],
      zonen: [zone(220.3, 298.7, 20, 11, 5.5, WEIT), zone(237.2, 273.3, 11, 5, 5.5, ENG, true)],
      gibt: ['strohballen', 'heuballen', 'silageballen', 'kartoffeln'],
      nimmt: ['duenger', 'saatgut', 'strohballen', 'heuballen', 'kartoffeln', 'getreide', 'mais']
    },
    {
      id: 'dorf', name: 'Dorf Ebersbach', kurz: 'Dorf', x: 376.9, y: 383.4,
      gebaeude: [
        geb(406.4, 365.4, 16, 12, '#8a8272', '#8a4a3c'),
        geb(385.4, 403.4, 15, 11, '#847c6c', '#7c443a'),
        geb(343.4, 379.4, 14, 11, '#7e7666', '#8a4a3c'),
        geb(337.4, 395.4, 14, 11, '#8a8272', '#6e5a4a'),
        geb(405.4, 401.4, 14, 11, '#847c6c', '#8a4a3c'),
        geb(365.4, 415.4, 14, 11, '#8a8272', '#7c443a'),
        geb(375.4, 375.4, 13, 10, '#847c6c', '#7c443a'),
        geb(399.4, 331.4, 13, 10, '#8a8272', '#8a4a3c')
      ],
      zonen: [zone(420.9, 379.4, 20, 11, 0, WEIT), zone(369.9, 400.4, 11, 5, 0, ENG, true)],
      gibt: ['ziegel', 'futtersaecke'],
      nimmt: ['ziegel', 'hackschnitzel', 'futtersaecke', 'wasser']
    },
    {
      id: 'tanke', name: 'Tankstelle Ebersbach', kurz: 'Tankstelle', x: 387.8, y: 472.3, istTanke: true,
      gebaeude: [
        geb(402.9, 457.5, 9, 18, '#6a6658', '#c9a53d')
      ],
      zonen: [zone(387, 482.3, 20, 10, 0.79, alleArten)],
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
  var RASTER = 30;
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

  /* ---------------- Beiwerk (nur Optik) ----------------
   * Feldgehoelze, Tuempel, Findlinge, Buesche. Rein zum Ansehen: nichts
   * davon haelt auf, sonst waere die Karte ueber Nacht voller unsichtbarer
   * Fallen. Gestreut wird mit festem Startwert, damit die Karte bei jedem
   * Start dieselbe ist — eine Landschaft, die sich beim Neuladen umbaut,
   * kann man sich nicht merken.
   */
  var beiwerk = null;
  var saat = 20260821;
  function wuerfel() {
    saat = (saat * 1103515245 + 12345) & 0x7fffffff;
    return saat / 0x7fffffff;
  }

  var teiche = [
    { x: 578, y: 49, r: 7.8 },
    { x: 337.3, y: 328.6, r: 8.3 },
    { x: 206.5, y: 188.7, r: 6.7 },
    { x: 673.1, y: 116.5, r: 9.9 },
    { x: 274.4, y: 446, r: 8.9 },
    { x: 503, y: 48.3, r: 6.2 },
    { x: 109.1, y: 665.4, r: 9.3 }
  ];

  function freiFuerBeiwerk(x, y, r) {
    if (x < 12 || y < 12 || x > GROESSE - 12 || y > GROESSE - 12) return false;
    if (untergrundAn(x, y) !== 'gelaende') return false;
    // Etwas Abstand zum Wegrand halten, sonst waechst der Wald aufs Bankett.
    if (untergrundAn(x + r + 3, y) !== 'gelaende' || untergrundAn(x - r - 3, y) !== 'gelaende') return false;
    if (untergrundAn(x, y + r + 3) !== 'gelaende' || untergrundAn(x, y - r - 3) !== 'gelaende') return false;
    for (var i = 0; i < felder.length; i++) {
      var f = felder[i];
      if (x > f.x - r && x < f.x + f.w + r && y > f.y - r && y < f.y + f.h + r) return false;
    }
    for (var o = 0; o < orte.length; o++) {
      if (U.abstand(x, y, orte[o].x, orte[o].y) < 34) return false;
    }
    for (var t = 0; t < teiche.length; t++) {
      if (U.abstand(x, y, teiche[t].x, teiche[t].y) < teiche[t].r + r + 4) return false;
    }
    return true;
  }

  function bauBeiwerk() {
    beiwerk = [];
    for (var t = 0; t < teiche.length; t++) {
      beiwerk.push({ art: 'teich', x: teiche[t].x, y: teiche[t].y, r: teiche[t].r, ton: 0 });
    }
    // Baumgruppen: erst einen Anker suchen, dann darum herum streuen. So
    // entstehen Feldgehoelze statt gleichmaessig verteilter Einzelbaeume.
    var gruppen = 0, versuche = 0;
    while (gruppen < 18 && versuche < 5000) {
      versuche++;
      var gx = wuerfel() * GROESSE, gy = wuerfel() * GROESSE;
      if (!freiFuerBeiwerk(gx, gy, 14)) continue;
      gruppen++;
      var n = 3 + Math.floor(wuerfel() * 5);
      for (var i = 0; i < n; i++) {
        var w = wuerfel() * Math.PI * 2, d = wuerfel() * 13;
        var bx = gx + Math.cos(w) * d, by = gy + Math.sin(w) * d;
        if (!freiFuerBeiwerk(bx, by, 6)) continue;
        beiwerk.push({ art: 'baum', x: bx, y: by, r: 4.5 + wuerfel() * 3.5, ton: Math.floor(wuerfel() * 3) });
      }
    }
    var kleinzeug = 0, v2 = 0;
    while (kleinzeug < 16 && v2 < 3000) {
      v2++;
      var sx = wuerfel() * GROESSE, sy = wuerfel() * GROESSE;
      if (!freiFuerBeiwerk(sx, sy, 8)) continue;
      kleinzeug++;
      beiwerk.push({
        art: wuerfel() < 0.42 ? 'stein' : 'busch',
        x: sx, y: sy, r: 1.6 + wuerfel() * 1.9, ton: Math.floor(wuerfel() * 3)
      });
    }
    return beiwerk;
  }

  function gibBeiwerk() { return beiwerk || bauBeiwerk(); }

  /* ---------------- Entfernungen ---------------- */
  // Die Fahrstrecke wird als Luftlinie mit Umwegzuschlag geschaetzt. Fuer die
  // Bewertung eines Auftrags reicht das und bleibt nachvollziehbar. Der
  // Zuschlag ist am ausgerollten Netz nachgemessen, ueber alle 55 Ortspaare
  // geroutet: 1.13 / 1.40 / 2.71 (min / Median / max), Mittel 1.455. Das
  // Stauchen hat ihn kaum bewegt -- es ist eine Eigenschaft der Netzform,
  // nicht der Groesse. Er gehoert trotzdem zur Geometrie und nicht zur
  // Balance: jobs.fahrzeit() bemisst daran jedes Zeitfenster, ein zu kleiner
  // Wert verengt sie also stillschweigend alle.
  var UMWEG = 1.45;

  function fahrstrecke(idA, idB) {
    var a = ort(idA), b = ort(idB);
    if (!a || !b) return 0;
    return U.abstand(a.x, a.y, b.x, b.y) * UMWEG;
  }

  function naechsterOrt(x, y, maxD) {
    var best = null, bd = maxD || 65;
    for (var i = 0; i < orte.length; i++) {
      var d = U.abstand(x, y, orte[i].x, orte[i].y);
      if (d < bd) { bd = d; best = orte[i]; }
    }
    return best;
  }

  return {
    GROESSE: GROESSE,
    untergruende: untergruende,
    wege: wege, felder: felder, orte: orte, beiwerk: gibBeiwerk,
    ort: ort, zoneFuer: zoneFuer,
    untergrundAn: untergrundAn, imGebaeude: imGebaeude,
    fahrstrecke: fahrstrecke, naechsterOrt: naechsterOrt
  };
})();
