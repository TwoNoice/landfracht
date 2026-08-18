/* Landfracht — Ton: Motor, Umgebung und kurze Signale
 *
 * Alles wird zur Laufzeit erzeugt (Web Audio). Es gibt bewusst keine
 * Klangdateien: das Spiel soll aus dem Dateisystem laufen, und ein Ladevorgang
 * auf eine Datei waere unter file:// je nach Browser blockiert.
 *
 * Der Motor ist ein Diesel-Einspurmodell fuers Ohr: ein Grundton auf der
 * Zuendfrequenz mit kraeftigen Harmonischen, dazu Klappern und ein Tiefpass,
 * der mit der Drehzahl aufmacht. Die Drehzahl folgt einem gedachten Getriebe
 * mit vier Gaengen, damit das Tempo hoerbar bleibt und der Ton nicht ueber die
 * ganze Fahrt monoton hochlaeuft.
 */
var TG = window.TG || (window.TG = {});

TG.ton = (function () {
  var U = TG.util;

  // Eigener Speicherplatz. Der Spielstand bleibt unberuehrt, sonst muesste
  // fuer eine Lautstaerke die Version hochgezaehlt und der Stand verworfen
  // werden (siehe game.laden).
  var SCHLUESSEL = 'landfracht_ton';

  var ctx = null;
  var n = null;              // dauerhafte Knoten
  var aktiv = true;          // Ton eingeschaltet?
  var laut = 0.7;            // 0 .. 1
  var wach = false;          // Browser erlauben Audio erst nach einer Eingabe

  var zeit = 0;              // Sekunden Laufzeit, treibt die langsamen Schwebungen
  var dreh = 0.14;           // geglaettete Drehzahl 0 .. 1
  var vogelUhr = 4;          // Sekunden bis zum naechsten Vogel
  var ladeLaeuft = false;

  /* =============================================================
   *  Einstellungen
   * ============================================================= */
  function einstellungenLesen() {
    try {
      var roh = window.localStorage.getItem(SCHLUESSEL);
      if (!roh) return;
      var d = JSON.parse(roh);
      if (typeof d.an === 'boolean') aktiv = d.an;
      if (typeof d.laut === 'number') laut = U.clamp(d.laut, 0, 1);
    } catch (e) { /* ohne gespeicherte Einstellung ist der Vorgabewert richtig */ }
  }

  function einstellungenSchreiben() {
    try {
      window.localStorage.setItem(SCHLUESSEL, JSON.stringify({ an: aktiv, laut: laut }));
    } catch (e) { /* privater Modus: dann eben nur fuer diese Sitzung */ }
  }

  /* =============================================================
   *  Bausteine
   * ============================================================= */
  function rauschPuffer(sek) {
    var laenge = Math.floor(ctx.sampleRate * sek);
    var puffer = ctx.createBuffer(1, laenge, ctx.sampleRate);
    var d = puffer.getChannelData(0);
    // Leicht geglaettetes Rauschen, reines Weiss zischt zu scharf.
    var letzt = 0;
    for (var i = 0; i < laenge; i++) {
      var w = Math.random() * 2 - 1;
      letzt = letzt * 0.35 + w * 0.65;
      d[i] = letzt;
    }
    return puffer;
  }

  function rauschQuelle(puffer, ziel) {
    var q = ctx.createBufferSource();
    q.buffer = puffer;
    q.loop = true;
    q.connect(ziel);
    q.start();
    return q;
  }

  function filter(typ, f, q) {
    var b = ctx.createBiquadFilter();
    b.type = typ; b.frequency.value = f;
    if (q != null) b.Q.value = q;
    return b;
  }

  function verstaerker(wert) {
    var g = ctx.createGain();
    g.gain.value = wert;
    return g;
  }

  /** Oberwellen eines Diesels: unten viel, oben ausduennend. */
  function dieselWelle() {
    var imag = [0, 1, 0.74, 0.52, 0.44, 0.31, 0.25, 0.19, 0.14, 0.1, 0.07, 0.05];
    return ctx.createPeriodicWave(new Float32Array(imag.length), new Float32Array(imag));
  }

  /** Sanft auf einen Wert ziehen; harte Spruenge knacken hoerbar. */
  function setz(param, wert, traeg) {
    param.setTargetAtTime(wert, ctx.currentTime, traeg || 0.07);
  }

  /* =============================================================
   *  Aufbau
   * ============================================================= */
  function bauen() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    ctx = new Ctx();

    var summe = verstaerker(aktiv ? laut : 0);
    // Der Begrenzer faengt ab, wenn Motor, Untergrund und ein Rums
    // gleichzeitig anliegen.
    var begrenzer = ctx.createDynamicsCompressor();
    begrenzer.threshold.value = -12;
    begrenzer.knee.value = 12;
    begrenzer.ratio.value = 10;
    begrenzer.attack.value = 0.004;
    begrenzer.release.value = 0.2;
    summe.connect(begrenzer);
    begrenzer.connect(ctx.destination);

    var puffer = rauschPuffer(2.4);

    /* ---- Motor ---- */
    var welle = dieselWelle();
    var motorFilter = filter('lowpass', 700, 0.8);
    var motorGain = verstaerker(0);
    motorFilter.connect(motorGain);
    motorGain.connect(summe);

    var m1 = ctx.createOscillator();
    m1.setPeriodicWave(welle); m1.frequency.value = 28;
    var g1 = verstaerker(0.85);
    m1.connect(g1); g1.connect(motorFilter); m1.start();

    // Zweiter Oszillator eine Oktave hoeher und leicht verstimmt. Ohne ihn
    // klingt der Motor wie ein Summton, mit ihm schwebt es leicht.
    var m2 = ctx.createOscillator();
    m2.setPeriodicWave(welle); m2.frequency.value = 57;
    var g2 = verstaerker(0.3);
    m2.connect(g2); g2.connect(motorFilter); m2.start();

    var klapperFilter = filter('bandpass', 1500, 0.9);
    var klapperGain = verstaerker(0);
    klapperFilter.connect(klapperGain); klapperGain.connect(motorFilter);
    rauschQuelle(puffer, klapperFilter);

    /* ---- Untergrund unter den Raedern ---- */
    var rollFilter = filter('lowpass', 300, 0.9);
    var rollGain = verstaerker(0);
    rollFilter.connect(rollGain); rollGain.connect(summe);
    rauschQuelle(puffer, rollFilter);

    /* ---- Umgebung: Wind ueber dem Feld ---- */
    var windFilter = filter('lowpass', 480, 0.6);
    var windGain = verstaerker(0.02);
    windFilter.connect(windGain); windGain.connect(summe);
    rauschQuelle(puffer, windFilter);

    /* ---- Laden und Abladen ---- */
    var ladeFilter = filter('bandpass', 900, 3.5);
    var ladeGain = verstaerker(0);
    ladeFilter.connect(ladeGain); ladeGain.connect(summe);
    rauschQuelle(puffer, ladeFilter);

    n = {
      summe: summe,
      m1: m1, m2: m2, motorFilter: motorFilter, motorGain: motorGain,
      klapperGain: klapperGain,
      rollFilter: rollFilter, rollGain: rollGain,
      windGain: windGain,
      ladeFilter: ladeFilter, ladeGain: ladeGain
    };
    return true;
  }

  /* =============================================================
   *  Start und Schalter
   * ============================================================= */
  function start() {
    einstellungenLesen();

    // Ein AudioContext, der vor der ersten Eingabe entsteht, bleibt in
    // Chrome stumm ("suspended"). Also erst beim ersten Tastendruck oder
    // Klick aufbauen.
    function wecken() {
      if (wach) return;
      wach = true;
      if (!bauen()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (!aktiv) ctx.suspend();
    }
    ['keydown', 'pointerdown', 'touchstart'].forEach(function (e) {
      window.addEventListener(e, wecken, { once: false, passive: true });
    });
  }

  function istAn() { return aktiv; }
  function lautstaerke() { return laut; }

  function umschalten() { setzeAn(!aktiv); return aktiv; }

  function setzeAn(wert) {
    aktiv = !!wert;
    einstellungenSchreiben();
    if (!ctx) return;
    if (aktiv) {
      if (ctx.state === 'suspended') ctx.resume();
      setz(n.summe.gain, laut, 0.05);
    } else {
      n.summe.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      // Kurz warten, sonst bricht der Ton mit einem Knacks ab.
      window.setTimeout(function () { if (!aktiv && ctx) ctx.suspend(); }, 200);
    }
  }

  function setzeLautstaerke(wert) {
    laut = U.clamp(wert, 0, 1);
    einstellungenSchreiben();
    if (ctx && aktiv) setz(n.summe.gain, laut, 0.05);
  }

  /* =============================================================
   *  Laufender Ton
   * ============================================================= */
  /**
   * z : {tempo, vmax, gas, bremse, motorAus, untergrund, ladung}
   *     tempo und vmax in m/s, ladung 0 .. 1
   */
  function schritt(dt, z) {
    if (!ctx || !aktiv || ctx.state !== 'running') return;
    zeit += dt;

    /* ---- Drehzahl ueber ein gedachtes Getriebe ---- */
    var vN = U.clamp(z.tempo / Math.max(3, z.vmax), 0, 1);
    var GAENGE = 4;
    var gang = Math.min(GAENGE - 1, Math.floor(vN * GAENGE));
    var imGang = vN * GAENGE - gang;

    var ziel = 0.14 + 0.70 * imGang;
    if (z.gas) ziel += 0.13 + 0.12 * z.ladung;    // unter Last haengt er tiefer im Drehmoment
    if (z.bremse && z.tempo > 0.5) ziel *= 0.82;
    if (z.motorAus) ziel = 0;
    // Hochdrehen geht schneller als abfallen.
    dreh += (ziel - dreh) * Math.min(1, dt * (ziel > dreh ? 3.4 : 1.9));

    var f = 26 + 62 * dreh;                        // Zuendfrequenz, Leerlauf ~26 Hz
    setz(n.m1.frequency, f, 0.05);
    setz(n.m2.frequency, f * 2.01, 0.05);
    setz(n.motorFilter.frequency, 240 + 1450 * dreh, 0.08);
    setz(n.motorGain.gain, z.motorAus ? 0 : 0.10 + 0.20 * dreh);
    setz(n.klapperGain.gain, z.motorAus ? 0 : 0.015 + 0.05 * dreh);

    /* ---- Untergrund ---- */
    var rau = z.untergrund === 'strasse' ? 0.55 : (z.untergrund === 'feldweg' ? 1.15 : 1.7);
    setz(n.rollGain.gain, 0.055 * rau * vN);
    setz(n.rollFilter.frequency, 170 + 620 * vN + (rau > 1 ? 220 : 0));

    /* ---- Wind, zwei ungleiche Schwingungen, damit es nicht pulst ---- */
    var boe = 0.5 + 0.32 * Math.sin(zeit * 0.13) + 0.18 * Math.sin(zeit * 0.047);
    setz(n.windGain.gain, 0.014 + 0.020 * boe, 0.6);

    /* ---- Ladegeraeusch ---- */
    if (ladeLaeuft) {
      setz(n.ladeGain.gain, 0.030 + 0.018 * Math.sin(zeit * 8.5), 0.05);
      setz(n.ladeFilter.frequency, 820 + 260 * Math.sin(zeit * 1.7), 0.1);
    } else {
      setz(n.ladeGain.gain, 0, 0.08);
    }

    /* ---- Voegel, aber nicht gegen den hochdrehenden Motor an ---- */
    vogelUhr -= dt;
    if (vogelUhr <= 0) {
      vogelUhr = 7 + Math.random() * 16;
      if (dreh < 0.5) vogel();
    }
  }

  /* =============================================================
   *  Einzelne Geraeusche
   * ============================================================= */
  function vogel() {
    var t0 = ctx.currentTime + Math.random() * 0.2;
    var zahl = 2 + Math.floor(Math.random() * 3);
    var grund = 2100 + Math.random() * 1500;
    var pegel = Math.max(0.006, 0.055 * (1 - dreh));   // exponentialRamp vertraegt keine Null

    for (var i = 0; i < zahl; i++) {
      var t = t0 + i * (0.09 + Math.random() * 0.07);
      var o = ctx.createOscillator();
      o.type = 'sine';
      var g = verstaerker(0);
      o.connect(g); g.connect(n.summe);
      var f0 = grund * (0.9 + Math.random() * 0.25);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.25 + Math.random() * 0.35), t + 0.05);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(pegel, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.start(t); o.stop(t + 0.12);
    }
  }

  /** Anstossen: dumpfer Schlag plus kurzes Krachen. */
  function stoss(kraft) {
    if (!ctx || !aktiv || ctx.state !== 'running') return;
    var p = U.clamp(kraft / 6, 0.15, 1);
    var t = ctx.currentTime;

    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    var g = verstaerker(0);
    o.connect(g); g.connect(n.summe);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * p, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.start(t); o.stop(t + 0.32);

    var q = ctx.createBufferSource();
    q.buffer = rauschPuffer(0.3);
    var kf = filter('lowpass', 900, 1);
    var kg = verstaerker(0);
    q.connect(kf); kf.connect(kg); kg.connect(n.summe);
    kg.gain.setValueAtTime(0.28 * p, t);
    kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    q.start(t); q.stop(t + 0.3);
  }

  /** Kurzes Signal fuer Meldungen. art: 'gut' | 'schlecht' | 'stufe' */
  function signal(art) {
    if (!ctx || !aktiv || ctx.state !== 'running') return;
    var toene = art === 'schlecht' ? [420, 320]
              : art === 'stufe'    ? [523, 659, 784]
              : [620, 880];
    var t0 = ctx.currentTime + 0.02;
    for (var i = 0; i < toene.length; i++) {
      var t = t0 + i * 0.11;
      var o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(toene[i], t);
      var g = verstaerker(0);
      o.connect(g); g.connect(n.summe);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t); o.stop(t + 0.18);
    }
  }

  /** Laden oder Abladen laeuft (true) oder ist vorbei (false). */
  function vorgang(laeuft) { ladeLaeuft = !!laeuft; }

  return {
    start: start, schritt: schritt,
    istAn: istAn, umschalten: umschalten, setzeAn: setzeAn,
    lautstaerke: lautstaerke, setzeLautstaerke: setzeLautstaerke,
    stoss: stoss, signal: signal, vorgang: vorgang
  };
})();
