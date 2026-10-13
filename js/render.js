/* Landfracht — Zeichnen von Karte, Gespann und Minikarte */
var TG = window.TG || (window.TG = {});

TG.zeichnen = (function () {
  var U = TG.util, W = TG.welt, D = TG.data;

  var leinwand, ctx, breite = 0, hoehe = 0, dpr = 1;
  var mk, mctx;

  var kamera = { x: 360, y: 360, scale: 5.2, zielScale: 5.2 };

  // Abgelaufene Spielzeit fuer Staub und Reifenprofil; die Ringe um Ziel und
  // Ladezone laufen dagegen auf der Uhr der Seite, damit sie auch bei offener
  // Lade weiterleben.
  var rollWeg = 0;

  function start() {
    leinwand = document.getElementById('leinwand');
    ctx = leinwand.getContext('2d');
    mk = document.getElementById('minikarte');
    mctx = mk.getContext('2d');
    texturenBauen();
    groesseAnpassen();
    window.addEventListener('resize', groesseAnpassen);
    // Das Beiwerk einmal jetzt streuen lassen: es kostet ein paar tausend
    // Untergrundabfragen, und die gehoeren nicht in das erste gezeichnete Bild.
    W.beiwerk();
    wegMasken();
  }

  var grundGesetzt = false;
  var vignette = null;

  function groesseAnpassen() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    breite = leinwand.clientWidth;
    hoehe = leinwand.clientHeight;
    leinwand.width = Math.round(breite * dpr);
    leinwand.height = Math.round(hoehe * dpr);

    // So einstellen, dass rund 95 Meter Karte quer ins Bild passen.
    if (!grundGesetzt) {
      grundGesetzt = true;
      kamera.zielScale = U.clamp(breite / 95, 4, 14);
      kamera.scale = kamera.zielScale;
    }

    // Der Verlauf haengt nur an der Fenstergroesse, also wird er hier gebaut
    // und nicht in jedem Bild.
    var r = Math.max(breite, hoehe);
    vignette = ctx.createRadialGradient(breite / 2, hoehe / 2, r * 0.32, breite / 2, hoehe / 2, r * 0.78);
    vignette.addColorStop(0, 'rgba(10,14,8,0)');
    vignette.addColorStop(1, 'rgba(10,14,8,.34)');
  }

  function zoom(richtung) {
    kamera.zielScale = U.clamp(kamera.zielScale * (richtung > 0 ? 1.22 : 0.82), 2.2, 11);
  }

  function kameraFolgen(dt, g) {
    var tempo = Math.abs(g.v);
    // Bei hohem Tempo etwas herauszoomen, damit man weiter voraussieht
    var auto = U.clamp(kamera.zielScale * (1 - tempo / 66), 2.2, 11);
    kamera.scale = U.lerp(kamera.scale, auto, 1 - Math.pow(0.001, dt));

    var vor = U.clamp(g.v * 0.9, -14, 26);
    var zx = g.x + Math.cos(g.h) * vor;
    var zy = g.y + Math.sin(g.h) * vor;
    var f = 1 - Math.pow(0.0015, dt);
    kamera.x = U.lerp(kamera.x, zx, f);
    kamera.y = U.lerp(kamera.y, zy, f);
  }

  function welt2schirm(x, y) {
    return { x: (x - kamera.x) * kamera.scale + breite / 2, y: (y - kamera.y) * kamera.scale + hoehe / 2 };
  }

  /** Umgekehrter Weg, fuer die Maussteuerung: Bildpunkt -> Weltpunkt. */
  function schirm2welt(px, py) {
    return { x: (px - breite / 2) / kamera.scale + kamera.x, y: (py - hoehe / 2) / kamera.scale + kamera.y };
  }

  /* Zielpunkt der Maussteuerung in Weltkoordinaten, oder null. main.js setzt
   * ihn je Bild; gezeichnet wird er, damit man sieht, wohin man lenkt. */
  var mausPunkt = null;
  function mausZiel(p) { mausPunkt = p; }

  function mausZielZeichnen(g) {
    if (!mausPunkt) return;
    var r = 1.6;
    ctx.save();
    ctx.lineWidth = 0.32;
    ctx.strokeStyle = 'rgba(246,238,205,.85)';
    // Gestrichelte Leine von der Motorhaube zum Zeiger: das Auge liest daran
    // ab, wie weit der Einschlag noch geht.
    ctx.setLineDash([1.4, 1.2]);
    ctx.beginPath();
    ctx.moveTo(g.x + Math.cos(g.h) * 2.6, g.y + Math.sin(g.h) * 2.6);
    ctx.lineTo(mausPunkt.x, mausPunkt.y);
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(mausPunkt.x, mausPunkt.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mausPunkt.x - r * 1.9, mausPunkt.y); ctx.lineTo(mausPunkt.x - r * 0.6, mausPunkt.y);
    ctx.moveTo(mausPunkt.x + r * 0.6, mausPunkt.y); ctx.lineTo(mausPunkt.x + r * 1.9, mausPunkt.y);
    ctx.moveTo(mausPunkt.x, mausPunkt.y - r * 1.9); ctx.lineTo(mausPunkt.x, mausPunkt.y - r * 0.6);
    ctx.moveTo(mausPunkt.x, mausPunkt.y + r * 0.6); ctx.lineTo(mausPunkt.x, mausPunkt.y + r * 1.9);
    ctx.stroke();
    ctx.restore();
  }

  function sichtbereich() {
    var hw = breite / 2 / kamera.scale, hh = hoehe / 2 / kamera.scale;
    return { x0: kamera.x - hw - 40, x1: kamera.x + hw + 40, y0: kamera.y - hh - 40, y1: kamera.y + hh + 40 };
  }

  /* ---------------- Texturen ----------------
   * Einmal beim Start in kleine Leinwaende gemalt und als Muster gekachelt:
   * je Bild kostet eine Flaeche dann eine Fuellung, nicht tausend Striche.
   * Gestreut wird mit festem Startwert — eine Wiese, die bei jedem Laden
   * anders gesprenkelt ist, faellt niemandem auf, aber sie macht Vorher-
   * Nachher-Bilder unvergleichbar.
   *
   * Jede Kachel traegt ihre Groesse in Metern. Das Muster wird per
   * setTransform auf diesen Massstab gebracht und haengt damit an der Welt,
   * nicht am Bildschirm — es schwimmt beim Fahren nicht mit. Wo der Browser
   * setTransform auf Mustern nicht kennt, bleibt es bei den glatten Farben
   * von vorher; die Kacheln waeren sonst einen Meter je Bildpunkt gross.
   */
  var tex = {};

  function zufallsQuelle(saat) {
    return function () {
      saat = (saat + 0x6D2B79F5) | 0;
      var t = Math.imul(saat ^ (saat >>> 15), 1 | saat);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function kachel(px, malen) {
    var c = document.createElement('canvas');
    c.width = c.height = px;
    malen(c.getContext('2d'), px);
    return c;
  }

  /* Nahtlos: jede Marke wird auch um eine Kachelbreite versetzt gesetzt, so
   * laeuft, was rechts hinausragt, links wieder herein. */
  function rundum(n, x, y, f) {
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) f(x + dx * n, y + dy * n);
  }

  function muster(bild, meter) {
    var p = ctx.createPattern(bild, 'repeat');
    if (!p || !p.setTransform || typeof DOMMatrix === 'undefined') return null;
    var k = meter / bild.width;
    p.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
    return p;
  }

  function sprenkel(c, n, r, anzahl, farben, gMin, gMax) {
    for (var i = 0; i < anzahl; i++) {
      var x = r() * n, y = r() * n, gr = gMin + r() * (gMax - gMin);
      c.fillStyle = farben[Math.floor(r() * farben.length)];
      rundum(n, x, y, function (X, Y) { c.beginPath(); c.arc(X, Y, gr, 0, Math.PI * 2); c.fill(); });
    }
  }

  function halme(c, n, r, anzahl, farben) {
    c.lineCap = 'round';
    for (var i = 0; i < anzahl; i++) {
      var x = r() * n, y = r() * n, l = 2 + r() * 4, a = -Math.PI / 2 + (r() - 0.5) * 1.6;
      c.strokeStyle = farben[Math.floor(r() * farben.length)];
      c.lineWidth = 0.8 + r() * 0.9;
      rundum(n, x, y, function (X, Y) {
        c.beginPath(); c.moveTo(X, Y); c.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l); c.stroke();
      });
    }
  }

  /* Weiches Rauschen ueber die ganze Karte: helle und dunkle Flecken von
   * zwanzig, dreissig Metern, wie Wiese eben aussieht, die nicht gemaeht
   * wird. 128 Bildpunkte fuer 720 m genuegen, das Hochskalieren glaettet
   * den Rest. */
  function bodenFlecken() {
    var n = 128, r = zufallsQuelle(4711);
    function gitter(zellen) {
      var g = [];
      for (var i = 0; i < (zellen + 1) * (zellen + 1); i++) g.push(r());
      return function (u, v) {
        var x = u * zellen, y = v * zellen, ix = Math.min(zellen - 1, Math.floor(x)), iy = Math.min(zellen - 1, Math.floor(y));
        var fx = x - ix, fy = y - iy;
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        var a = g[iy * (zellen + 1) + ix], b = g[iy * (zellen + 1) + ix + 1];
        var c = g[(iy + 1) * (zellen + 1) + ix], d = g[(iy + 1) * (zellen + 1) + ix + 1];
        return U.lerp(U.lerp(a, b, fx), U.lerp(c, d, fx), fy);
      };
    }
    var grob = gitter(9), fein = gitter(26);
    var c = document.createElement('canvas');
    c.width = c.height = n;
    var bc = c.getContext('2d'), bild = bc.createImageData(n, n);
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var w = grob(x / n, y / n) * 0.68 + fein(x / n, y / n) * 0.32 - 0.5;
        var o = (y * n + x) * 4;
        if (w > 0) { bild.data[o] = 140; bild.data[o + 1] = 168; bild.data[o + 2] = 94; bild.data[o + 3] = Math.min(105, w * 300); }
        else { bild.data[o] = 52; bild.data[o + 1] = 80; bild.data[o + 2] = 38; bild.data[o + 3] = Math.min(115, -w * 330); }
      }
    }
    bc.putImageData(bild, 0, 0);
    return c;
  }

  function texturenBauen() {
    tex.flecken = bodenFlecken();

    tex.gras = muster(kachel(256, function (c, n) {
      var r = zufallsQuelle(11);
      sprenkel(c, n, r, 60, ['rgba(130,165,88,.07)', 'rgba(38,58,26,.08)'], 6, 16);
      halme(c, n, r, 1300, ['rgba(140,175,96,.20)', 'rgba(36,56,24,.20)', 'rgba(110,140,70,.16)']);
    }), 16);

    tex.erde = muster(kachel(128, function (c, n) {
      var r = zufallsQuelle(23);
      c.fillStyle = '#8e7a52'; c.fillRect(0, 0, n, n);
      sprenkel(c, n, r, 30, ['rgba(110,92,60,.25)', 'rgba(160,140,100,.18)'], 5, 12);
      sprenkel(c, n, r, 500, ['rgba(96,78,50,.45)', 'rgba(170,152,112,.4)', 'rgba(120,104,74,.4)'], 0.5, 1.4);
      sprenkel(c, n, r, 40, ['rgba(180,172,150,.55)', 'rgba(130,124,108,.55)'], 1.2, 2.2);
    }), 8);

    tex.asphalt = muster(kachel(128, function (c, n) {
      var r = zufallsQuelle(37);
      c.fillStyle = '#55554f'; c.fillRect(0, 0, n, n);
      sprenkel(c, n, r, 24, ['rgba(70,70,64,.22)', 'rgba(100,100,92,.16)'], 6, 14);
      sprenkel(c, n, r, 700, ['rgba(72,72,66,.6)', 'rgba(104,104,96,.5)', 'rgba(90,90,84,.5)'], 0.4, 1.0);
    }), 8);

    // Schlaege: Grasland, Getreide, Acker — in derselben Reihenfolge wie t
    // in world.js. Die Reihen laufen senkrecht, wie die Fahrgassen.
    tex.feld = [
      muster(kachel(64, function (c, n) {
        var r = zufallsQuelle(51);
        c.fillStyle = '#6f8f4a'; c.fillRect(0, 0, n, n);
        sprenkel(c, n, r, 14, ['rgba(130,160,86,.18)', 'rgba(70,96,46,.18)'], 3, 7);
        halme(c, n, r, 260, ['rgba(140,172,96,.3)', 'rgba(64,90,40,.28)']);
      }), 4),
      muster(kachel(64, function (c, n) {
        var r = zufallsQuelle(52);
        c.fillStyle = '#b3a05a'; c.fillRect(0, 0, n, n);
        for (var x = 0; x < n; x += 8) {
          c.fillStyle = 'rgba(150,132,70,.55)'; c.fillRect(x, 0, 3, n);
          c.fillStyle = 'rgba(205,188,118,.35)'; c.fillRect(x + 4, 0, 2, n);
        }
        sprenkel(c, n, r, 180, ['rgba(214,198,128,.45)', 'rgba(140,124,64,.4)'], 0.5, 1.1);
      }), 4),
      muster(kachel(64, function (c, n) {
        var r = zufallsQuelle(53);
        c.fillStyle = '#7a6144'; c.fillRect(0, 0, n, n);
        for (var x = 0; x < n; x += 16) {
          c.fillStyle = 'rgba(92,72,50,.75)'; c.fillRect(x, 0, 5, n);
          c.fillStyle = 'rgba(146,118,86,.45)'; c.fillRect(x + 8, 0, 3, n);
        }
        sprenkel(c, n, r, 160, ['rgba(70,54,36,.5)', 'rgba(150,124,92,.4)'], 0.6, 1.5);
      }), 4)
    ];
  }

  /* Mit Rundung, wo der Browser sie kann — sonst eckig, wie bisher. */
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
  }

  /* Farbe heller (f > 0, Richtung Weiss) oder dunkler (f < 0, Richtung
   * Schwarz). Gemerkt, weil dieselben paar Toene jedes Bild wiederkommen. */
  var tonSpeicher = {};
  function ton(hex, f) {
    var k = hex + f;
    if (tonSpeicher[k]) return tonSpeicher[k];
    var n = parseInt(hex.slice(1), 16);
    var rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    for (var i = 0; i < 3; i++) rgb[i] = Math.round(f >= 0 ? rgb[i] + (255 - rgb[i]) * f : rgb[i] * (1 + f));
    return (tonSpeicher[k] = 'rgb(' + rgb.join(',') + ')');
  }

  /* Fester Wurf je Ort, damit ein Baum bei jedem Bild dieselbe Krone hat. */
  function streuwert(x, y) {
    var s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  /* ---------------------------------------------------------- */
  function bild(dt, spiel) {
    var g = spiel.gespann;
    kameraFolgen(dt, g);
    rollWeg += g.v * dt;
    staubSchritt(dt, spiel);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, breite, hoehe);

    ctx.fillStyle = '#5f7f45';
    ctx.fillRect(0, 0, breite, hoehe);

    ctx.save();
    ctx.translate(breite / 2, hoehe / 2);
    ctx.scale(kamera.scale, kamera.scale);
    ctx.translate(-kamera.x, -kamera.y);

    var s = sichtbereich();
    bodenZeichnen(s);
    felderZeichnen(s);
    wegeZeichnen(s);
    beiwerkZeichnen(s, false);
    zonenZeichnen(s, spiel);
    gebaeudeZeichnen(s);
    partikelZeichnen('staub');
    gespannZeichnen(spiel);
    partikelZeichnen('rauch');
    beiwerkZeichnen(s, true);
    mausZielZeichnen(g);
    if (TG.entwickler && TG.entwickler.hat('linien')) pruefLinien(s, spiel);
    ctx.restore();

    if (spiel.state && TG.umwelt) wetterZeichnen(dt, spiel.state);

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, breite, hoehe);

    ortsnamen(s);
    wegweiser(spiel);
  }

  function bodenZeichnen(s) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tex.flecken, 0, 0, W.GROESSE, W.GROESSE);
    ctx.restore();
    // Halme erst, wenn man sie sehen kann; weit herausgezoomt sind sie nur
    // ein Grauschleier.
    if (tex.gras && kamera.scale > 2.6) {
      ctx.fillStyle = tex.gras;
      ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
    }
  }

  var feldFarben = ['#6f8f4a', '#b3a05a', '#7a6144'];

  function felderZeichnen(s) {
    for (var i = 0; i < W.felder.length; i++) {
      var f = W.felder[i];
      // Grosszuegig sichten: der Schlag ist gedreht und ragt dadurch ueber
      // sein achsparalleles Rechteck hinaus.
      var luft = Math.abs(f.dreh || 0) * Math.max(f.w, f.h) + 8;
      if (f.x - luft > s.x1 || f.x + f.w + luft < s.x0 || f.y - luft > s.y1 || f.y + f.h + luft < s.y0) continue;

      ctx.save();
      if (f.dreh) {
        ctx.translate(f.x + f.w / 2, f.y + f.h / 2);
        ctx.rotate(f.dreh);
        ctx.translate(-(f.x + f.w / 2), -(f.y + f.h / 2));
      }
      // Feldrain: ein heller Grasstreifen rundum, auf dem der Schlag liegt.
      ctx.fillStyle = 'rgba(128,156,86,.55)';
      rr(ctx, f.x - 1.2, f.y - 1.2, f.w + 2.4, f.h + 2.4, 2.4); ctx.fill();

      ctx.fillStyle = tex.feld[f.t] || feldFarben[f.t];
      rr(ctx, f.x, f.y, f.w, f.h, 1.6); ctx.fill();

      if (kamera.scale > 3) {
        ctx.save();
        rr(ctx, f.x, f.y, f.w, f.h, 1.6); ctx.clip();
        if (f.t === 1) {
          // Fahrgassen im Getreide: zwei Spuren im Abstand einer Spurweite
          ctx.strokeStyle = 'rgba(120,104,56,.55)';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          for (var x = f.x + 9; x < f.x + f.w; x += 18) {
            ctx.moveTo(x - 0.9, f.y); ctx.lineTo(x - 0.9, f.y + f.h);
            ctx.moveTo(x + 0.9, f.y); ctx.lineTo(x + 0.9, f.y + f.h);
          }
          ctx.stroke();
        } else if (f.t === 0) {
          // Maehstreifen im Grasland: breite Bahnen, abwechselnd hell
          ctx.fillStyle = 'rgba(190,215,140,.07)';
          for (var m = f.x; m < f.x + f.w; m += 12) ctx.fillRect(m, f.y, 6, f.h);
        }
        ctx.restore();
      }
      // Innen dunkel abgesetzt, damit der Schlag eine Kante hat
      ctx.strokeStyle = 'rgba(40,55,28,.35)';
      ctx.lineWidth = 0.6;
      rr(ctx, f.x + 0.3, f.y + 0.3, f.w - 0.6, f.h - 0.6, 1.4); ctx.stroke();
      ctx.restore();
    }
  }

  /* Feldgehoelze, Tuempel, Findlinge. Nur Optik — nichts davon haelt auf,
   * darum wird hier auch nichts gegen das Gespann geprueft.
   *
   * Zwei Durchgaenge: was am Boden liegt (Tuempel, Steine) vor allem
   * anderen, Kronen und Buesche zum Schluss ueber Staub und Gespann — eine
   * Krone ueberdeckt, was unter ihr ist, auch wenn es faehrt. */
  var baumTon = [
    { krone: '#3f6b33', kern: '#4f7d3c' },
    { krone: '#48753a', kern: '#598a45' },
    { krone: '#375f2e', kern: '#456f37' }
  ];
  var buschTon = ['#4e7440', '#5b8149', '#446b39'];
  var steinTon = ['#8f8c84', '#7d7a72', '#9a978e'];

  function beiwerkZeichnen(s, oben) {
    var liste = W.beiwerk();
    // Schatten aller Kronen zuerst, sonst legt sich der Schatten des einen
    // Baumes ueber die Krone des Nachbarn.
    if (oben) {
      ctx.fillStyle = 'rgba(16,26,10,.24)';
      ctx.beginPath();
      for (var j = 0; j < liste.length; j++) {
        var sb = liste[j];
        if (sb.art !== 'baum' && sb.art !== 'busch') continue;
        if (sb.x + sb.r * 2 < s.x0 || sb.x - sb.r > s.x1 || sb.y + sb.r * 2 < s.y0 || sb.y - sb.r > s.y1) continue;
        var vs = sb.art === 'baum' ? 0.5 : 0.3;
        ctx.moveTo(sb.x + sb.r * vs + sb.r * 1.02, sb.y + sb.r * vs * 1.2);
        ctx.ellipse(sb.x + sb.r * vs, sb.y + sb.r * vs * 1.2, sb.r * 1.02, sb.r * 0.94, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    for (var i = 0; i < liste.length; i++) {
      var b = liste[i];
      if (b.x + b.r < s.x0 || b.x - b.r > s.x1 || b.y + b.r < s.y0 || b.y - b.r > s.y1) continue;
      var istOben = b.art === 'baum' || b.art === 'busch';
      if (istOben !== oben) continue;

      if (b.art === 'teich') teich(b);
      else if (b.art === 'baum') krone(b, baumTon[b.ton].krone, 5, 0.38, 0.62);
      else if (b.art === 'busch') krone(b, buschTon[b.ton], 3, 0.3, 0.72);
      else stein(b);
    }
  }

  function teich(b) {
    var rx = b.r, ry = b.r * 0.72;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(0.4);
    // feuchter Rand
    ctx.fillStyle = '#56764a';
    ctx.beginPath(); ctx.ellipse(0, 0, rx * 1.1, ry * 1.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a6f5e';
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    // Wasser: am Rand flach und hell, in der Mitte tief
    var gr = ctx.createRadialGradient(-rx * 0.15, -ry * 0.1, 0, 0, 0, rx * 0.86);
    gr.addColorStop(0, '#24475a');
    gr.addColorStop(0.75, '#2f5568');
    gr.addColorStop(1, '#3f6a72');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.84, ry * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    // Lichtkante oben links, wo die Sonne steht
    ctx.strokeStyle = 'rgba(200,225,220,.28)'; ctx.lineWidth = 0.35;
    ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.7, ry * 0.62, 0, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
    // Schilf am Ufer
    if (kamera.scale > 3) {
      ctx.strokeStyle = 'rgba(52,80,36,.8)'; ctx.lineWidth = 0.22; ctx.lineCap = 'round';
      ctx.beginPath();
      for (var k = 0; k < 18; k++) {
        var a = k / 18 * Math.PI * 2 + streuwert(b.x, k) * 0.3;
        var px = Math.cos(a) * rx * 0.88, py = Math.sin(a) * ry * 0.86;
        ctx.moveTo(px, py); ctx.lineTo(px * 1.07 + (streuwert(k, b.y) - 0.5) * 0.6, py * 1.09 - 0.5);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Eine Krone aus mehreren Tupfen statt einem Kreis, mit Licht von oben
   * links. Die Tupfen werden zu einem Pfad vereint und zweimal gefuellt:
   * einmal mit dem Grundton, einmal mit dem Lichtverlauf. */
  function krone(b, farbe, tupfen, ab, gr) {
    var w = streuwert(b.x, b.y) * Math.PI * 2;
    ctx.beginPath();
    for (var k = 0; k < tupfen; k++) {
      var a = w + k / tupfen * Math.PI * 2;
      var px = b.x + Math.cos(a) * b.r * ab, py = b.y + Math.sin(a) * b.r * ab;
      ctx.moveTo(px + b.r * gr, py);
      ctx.arc(px, py, b.r * gr, 0, Math.PI * 2);
    }
    ctx.moveTo(b.x + b.r * 0.7, b.y);
    ctx.arc(b.x, b.y, b.r * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = farbe;
    ctx.fill();
    var licht = ctx.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.45, b.r * 0.05, b.x, b.y, b.r * 1.05);
    licht.addColorStop(0, 'rgba(176,206,120,.42)');
    licht.addColorStop(0.55, 'rgba(120,160,80,.08)');
    licht.addColorStop(1, 'rgba(10,30,8,.32)');
    ctx.fillStyle = licht;
    ctx.fill();
  }

  function stein(b) {
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    kreis(b.x + b.r * 0.35, b.y + b.r * 0.45, b.r);
    var gr = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, 0, b.x, b.y, b.r);
    gr.addColorStop(0, ton(steinTon[b.ton], 0.25));
    gr.addColorStop(1, ton(steinTon[b.ton], -0.2));
    ctx.fillStyle = gr;
    kreis(b.x, b.y, b.r);
  }

  /* Wo ein Weg in einen anderen hineinlaeuft, hoeren seine Markierungen auf:
   * der Mittelstrich der Landstrasse und der Grasstreifen des Feldwegs
   * liefen sonst quer ueber die Fahrbahn des anderen. Einmal beim Start
   * ausgerechnet, je Mittellinienpunkt ein Ja oder Nein. */
  function wegMasken() {
    var zelle = 12, gitter = {};
    for (var k = 0; k < W.wege.length; k++) {
      var p = W.wege[k].p;
      for (var i = 0; i < p.length; i++) {
        var key = Math.floor(p[i][0] / zelle) + ',' + Math.floor(p[i][1] / zelle);
        (gitter[key] || (gitter[key] = [])).push(k, i);
      }
    }
    for (var a = 0; a < W.wege.length; a++) {
      var w = W.wege[a], frei = [];
      for (var j = 0; j < w.p.length; j++) {
        var q = w.p[j], gx = Math.floor(q[0] / zelle), gy = Math.floor(q[1] / zelle), ok = true;
        for (var dx = -1; dx <= 1 && ok; dx++) {
          for (var dy = -1; dy <= 1 && ok; dy++) {
            var l = gitter[(gx + dx) + ',' + (gy + dy)];
            if (!l) continue;
            for (var n = 0; n < l.length; n += 2) {
              if (l[n] === a) continue;
              var o = W.wege[l[n]], r = o.p[l[n + 1]];
              var grenze = o.breite / 2 + 0.8;
              if ((r[0] - q[0]) * (r[0] - q[0]) + (r[1] - q[1]) * (r[1] - q[1]) < grenze * grenze) { ok = false; break; }
            }
          }
        }
        frei.push(ok);
      }
      w.frei = frei;
      if (w.typ === 'feldweg') {
        w.spurL = versetzt(w.p, -w.breite * 0.24);
        w.spurR = versetzt(w.p, w.breite * 0.24);
      }
    }
  }

  function versetzt(p, d) {
    var aus = [];
    for (var i = 0; i < p.length; i++) {
      var a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy) || 1;
      aus.push([p[i][0] - dy / l * d, p[i][1] + dx / l * d]);
    }
    return aus;
  }

  /* Vier Durchgaenge, nicht Weg fuer Weg: erst alle Bankette einer Art, dann
   * alle Fahrbahnen dieser Art. Zeichnet man Bankett und Fahrbahn je Weg
   * hintereinander, legt das Bankett des naechsten Weges einen dunklen
   * Streifen quer ueber die Fahrbahn des vorigen — an jeder Kreuzung, und
   * Kreuzungen sind auf der gestauchten Karte alle paar Sekunden eine. Die
   * Kartenansicht (karte()) macht es aus demselben Grund genauso.
   *
   * Die Randlinien der Landstrasse sind kein eigener Strich neben der
   * Fahrbahn, sondern eine weisse Fahrbahn, auf die eine etwas schmalere
   * graue gelegt wird. Weil alle grauen nach allen weissen kommen, deckt an
   * der Einmuendung die Fahrbahn des einen Weges die Randlinie des anderen
   * zu — die Linien enden an der Kreuzung, wie sie es draussen auch tun.
   *
   * Die Mittelstriche kommen ganz zum Schluss, sonst ueberdeckt die naechste
   * Fahrbahn sie an der Kreuzung wieder halb. */
  function wegeZeichnen(s) {
    var sicht = [];
    for (var i = 0; i < W.wege.length; i++) {
      if (wegSichtbar(W.wege[i], s)) sicht.push(W.wege[i]);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var nah = kamera.scale > 2.6;

    var lagen = [
      { typ: 'feldweg', farbe: 'rgba(96,80,52,.55)', zu: 1.8 },
      { typ: 'feldweg', farbe: tex.erde || '#8e7a52', zu: 0 },
      { typ: 'strasse', farbe: 'rgba(118,116,96,.6)', zu: 2.6 },
      { typ: 'strasse', farbe: '#3b3c37', zu: 0.8 },
      { typ: 'strasse', farbe: '#d4d3c6', zu: -0.5, nah: true },
      { typ: 'strasse', farbe: tex.asphalt || '#55554f', zu: nah ? -0.9 : 0 }
    ];
    for (var l = 0; l < lagen.length; l++) {
      var lage = lagen[l];
      if (lage.nah && !nah) continue;
      ctx.strokeStyle = lage.farbe;
      for (var k = 0; k < sicht.length; k++) {
        if (sicht[k].typ !== lage.typ) continue;
        ctx.lineWidth = sicht[k].breite + lage.zu;
        pfad(sicht[k].p); ctx.stroke();
      }
      // Die Feldwege bekommen ihre Spuren gleich nach der Fahrbahn, bevor die
      // Landstrassen kommen: die decken sie an der Kreuzung dann zu.
      if (l === 1 && nah) feldwegSpuren(sicht);
    }

    if (kamera.scale > 3.4) {
      ctx.save();
      ctx.lineCap = 'butt';
      ctx.strokeStyle = 'rgba(236,233,212,.78)';
      ctx.lineWidth = 0.24;
      ctx.setLineDash([4, 6]);
      for (var m = 0; m < sicht.length; m++) {
        if (sicht[m].typ !== 'strasse') continue;
        pfadMaske(sicht[m].p, sicht[m].frei); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function feldwegSpuren(sicht) {
    // Fahrspuren: zwei dunklere Baender, durch die Kreuzung hindurch — dort
    // kreuzen sich die Spuren draussen auch.
    ctx.strokeStyle = 'rgba(92,74,48,.38)';
    for (var k = 0; k < sicht.length; k++) {
      var w = sicht[k];
      if (w.typ !== 'feldweg' || !w.spurL) continue;
      ctx.lineWidth = w.breite * 0.2;
      pfad(w.spurL); ctx.stroke();
      pfad(w.spurR); ctx.stroke();
    }
    // Grasnarbe in der Mitte, an Einmuendungen unterbrochen
    ctx.strokeStyle = 'rgba(112,134,70,.62)';
    for (var j = 0; j < sicht.length; j++) {
      var v = sicht[j];
      if (v.typ !== 'feldweg' || !v.frei) continue;
      ctx.lineWidth = v.breite * 0.16;
      pfadMaske(v.p, v.frei); ctx.stroke();
    }
  }

  function wegSichtbar(weg, s) {
    for (var i = 0; i < weg.p.length; i++) {
      var p = weg.p[i];
      if (p[0] > s.x0 - 200 && p[0] < s.x1 + 200 && p[1] > s.y0 - 200 && p[1] < s.y1 + 200) return true;
    }
    return false;
  }

  function pfad(punkte) {
    ctx.beginPath();
    ctx.moveTo(punkte[0][0], punkte[0][1]);
    for (var i = 1; i < punkte.length; i++) ctx.lineTo(punkte[i][0], punkte[i][1]);
  }

  /** Wie pfad(), aber nur ueber die Stuecke, deren Punkte frei sind. */
  function pfadMaske(punkte, frei) {
    ctx.beginPath();
    var an = false;
    for (var i = 0; i < punkte.length; i++) {
      if (frei && !frei[i]) { an = false; continue; }
      if (an) ctx.lineTo(punkte[i][0], punkte[i][1]);
      else { ctx.moveTo(punkte[i][0], punkte[i][1]); an = true; }
    }
  }

  function zonenZeichnen(s, spiel) {
    var a = spiel.aktiverAnhaenger();
    var art = a ? a.spec.art : null;
    var chance = spiel.ladeChance();
    var ziel = spiel.zielOrt();
    var uhr = (window.performance ? performance.now() : Date.now()) / 1000;

    for (var i = 0; i < W.orte.length; i++) {
      var o = W.orte[i];
      if (o.x < s.x0 - 120 || o.x > s.x1 + 120 || o.y < s.y0 - 120 || o.y > s.y1 + 120) continue;

      for (var z = 0; z < o.zonen.length; z++) {
        var zn = o.zonen[z];
        var passt = art && zn.arten.indexOf(art) >= 0;
        var istZiel = ziel && ziel.id === o.id && passt;
        var aktiv = chance && chance.zone === zn;
        var hw = zn.w / 2, hh = zn.h / 2;

        ctx.save();
        ctx.translate(zn.x, zn.y);
        ctx.rotate(zn.rot);

        // Befestigter Platz unter jeder Zone, auch der unpassenden: eine
        // Ladestelle ist auch dann ein Platz, wenn man gerade nichts dafuer hat.
        ctx.fillStyle = 'rgba(150,140,112,.22)';
        rr(ctx, -hw - 0.6, -hh - 0.6, zn.w + 1.2, zn.h + 1.2, 1.2); ctx.fill();

        var farbe, fuell;
        if (aktiv) { farbe = '#9ede63'; fuell = 'rgba(120,200,80,.24)'; }
        else if (istZiel) { farbe = '#e8c14a'; fuell = 'rgba(230,190,70,.15)'; }
        else if (passt) { farbe = 'rgba(236,240,226,.75)'; fuell = 'rgba(240,240,230,.06)'; }
        else { farbe = 'rgba(190,200,180,.3)'; fuell = null; }

        if (fuell) { ctx.fillStyle = fuell; rr(ctx, -hw, -hh, zn.w, zn.h, 0.7); ctx.fill(); }
        ctx.strokeStyle = farbe;

        if (aktiv) {
          ctx.shadowColor = 'rgba(140,230,90,.8)';
          ctx.shadowBlur = 12;
          ctx.lineWidth = 0.5;
          rr(ctx, -hw, -hh, zn.w, zn.h, 0.7); ctx.stroke();
        } else if (istZiel) {
          // Laufende Striche: das Auge findet Bewegung schneller als Farbe.
          ctx.lineWidth = 0.4;
          ctx.setLineDash([1.6, 1.1]);
          ctx.lineDashOffset = -uhr * 2.2;
          rr(ctx, -hw, -hh, zn.w, zn.h, 0.7); ctx.stroke();
          ctx.setLineDash([]);
          ecken(hw, hh, 0.55);
        } else if (passt) {
          ecken(hw, hh, 0.35);
        } else {
          ctx.lineWidth = 0.28;
          ctx.setLineDash([1.2, 1.2]);
          rr(ctx, -hw, -hh, zn.w, zn.h, 0.7); ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.setLineDash([]);
  }

  /* Eckwinkel statt Rahmen: eine Ladezone, die passt, soll man sehen, ohne
   * dass sie den Hof mit gestrichelten Kaesten zustellt. */
  function ecken(hw, hh, dicke) {
    var l = Math.min(2.2, hh * 0.8);
    ctx.lineWidth = dicke;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var sx = -1; sx <= 1; sx += 2) {
      for (var sy = -1; sy <= 1; sy += 2) {
        ctx.moveTo(sx * hw, sy * (hh - l)); ctx.lineTo(sx * hw, sy * hh); ctx.lineTo(sx * (hw - l), sy * hh);
      }
    }
    ctx.stroke();
  }

  function gebaeudeZeichnen(s) {
    for (var i = 0; i < W.orte.length; i++) {
      var o = W.orte[i];
      if (o.x < s.x0 - 160 || o.x > s.x1 + 160 || o.y < s.y0 - 160 || o.y > s.y1 + 160) continue;
      for (var b = 0; b < o.gebaeude.length; b++) {
        if (o.gebaeude[b].rund) silo(o.gebaeude[b]); else haus(o.gebaeude[b]);
      }
    }
  }

  /* Satteldach von oben: der First laeuft ueber die lange Seite, die Haelfte
   * zur Sonne (oben links) hell, die andere dunkel. Unter der Traufe sieht
   * man ein Stueck der Suedwand — das ist die Wandfarbe, die vorher als
   * halbe Flaeche dastand, und sie haelt das Bild bei der alten Lesart. */
  function haus(geb) {
    var w = geb.w, h = geb.h, x = geb.x - w / 2, y = geb.y - h / 2;
    var ue = 0.35;                                  // Dachueberstand

    // Weicher Schatten in zwei Lagen
    ctx.fillStyle = 'rgba(10,18,6,.13)';
    rr(ctx, x + 1.0, y + 1.6, w + 2.6, h + 2.8, 1.4); ctx.fill();
    ctx.fillStyle = 'rgba(10,18,6,.18)';
    rr(ctx, x + 1.6, y + 2.4, w + 0.6, h + 0.8, 0.6); ctx.fill();

    // Suedwand unter der Traufe, mit Toren und Fenstern
    ctx.fillStyle = ton(geb.f, -0.1);
    ctx.fillRect(x, y + h - 0.2, w, 1.3);
    if (kamera.scale > 3) {
      ctx.fillStyle = 'rgba(24,26,20,.55)';
      var tor = Math.min(3.2, w * 0.3);
      if (w > 12) ctx.fillRect(x + w * 0.5 - tor / 2, y + h + 0.1, tor, 1.0);
      for (var fx = x + 1.6; fx < x + w - 1.6; fx += 3.2) {
        if (w > 12 && Math.abs(fx + 0.4 - (x + w / 2)) < tor / 2 + 0.8) continue;
        ctx.fillRect(fx, y + h + 0.3, 0.8, 0.5);
      }
    }

    var laengs = w >= h;
    var hell = ton(geb.d, 0.12), dunkel = ton(geb.d, -0.18);
    ctx.fillStyle = dunkel;
    ctx.fillRect(x - ue, y - ue, w + ue * 2, h + ue * 2);
    ctx.fillStyle = hell;
    if (laengs) ctx.fillRect(x - ue, y - ue, w + ue * 2, h / 2 + ue);
    else ctx.fillRect(x - ue, y - ue, w / 2 + ue, h + ue * 2);

    // Wellblech oder Ziegelreihen, quer zum First
    if (kamera.scale > 4) {
      ctx.strokeStyle = 'rgba(0,0,0,.08)';
      ctx.lineWidth = 0.14;
      ctx.beginPath();
      if (laengs) for (var rx = x + 0.6; rx < x + w; rx += 0.9) { ctx.moveTo(rx, y - ue); ctx.lineTo(rx, y + h + ue); }
      else for (var ry = y + 0.6; ry < y + h; ry += 0.9) { ctx.moveTo(x - ue, ry); ctx.lineTo(x + w + ue, ry); }
      ctx.stroke();
    }

    // First
    ctx.strokeStyle = ton(geb.d, 0.28);
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    if (laengs) { ctx.moveTo(x - ue, y + h / 2); ctx.lineTo(x + w + ue, y + h / 2); }
    else { ctx.moveTo(x + w / 2, y - ue); ctx.lineTo(x + w / 2, y + h + ue); }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 0.22;
    ctx.strokeRect(x - ue, y - ue, w + ue * 2, h + ue * 2);
  }

  /* Rundbau (Fermenter, Silo): Kegeldach mit Licht von oben links. */
  function silo(geb) {
    var r = geb.w / 2, x = geb.x, y = geb.y;
    ctx.fillStyle = 'rgba(10,18,6,.13)'; kreis(x + 1.6, y + 2.4, r + 1.2);
    ctx.fillStyle = 'rgba(10,18,6,.18)'; kreis(x + 1.8, y + 2.6, r);
    ctx.fillStyle = ton(geb.f, -0.08); kreis(x, y + 0.6, r);
    ctx.fillStyle = geb.f; kreis(x, y, r);
    var gr = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r * 0.95);
    gr.addColorStop(0, ton(geb.d, 0.3));
    gr.addColorStop(1, ton(geb.d, -0.22));
    ctx.fillStyle = gr; kreis(x, y, r * 0.88);
    ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 0.2;
    ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = ton(geb.d, -0.3); kreis(x, y, r * 0.1);
  }

  function kreis(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

  /* ---------------- Staub und Abgas ----------------
   * Reine Zierde, wie das Beiwerk: der Staub sagt dem Auge, dass es abseits
   * der Strasse unterwegs ist, bevor der Tacho es tut. Lebt nur im Renderer;
   * mit dt = 0 (Lade offen) steht er still. */
  var teilchen = [];
  var staubRest = 0, rauchRest = 0;

  function staubSchritt(dt, spiel) {
    if (!dt) return;
    for (var i = teilchen.length - 1; i >= 0; i--) {
      var t = teilchen[i];
      t.t += dt;
      if (t.t >= t.dauer) { teilchen.splice(i, 1); continue; }
      t.x += t.vx * dt; t.y += t.vy * dt;
      t.r += t.wachsen * dt;
    }
    if (teilchen.length > 240) return;

    var g = spiel.gespann, v = Math.abs(g.v);
    var c = Math.cos(g.h), s = Math.sin(g.h), spec = spiel.aktiverTraktor().spec;

    if (v > 2.2) {
      var u = W.untergrundAn(g.x, g.y);
      if (u !== 'strasse') {
        staubRest += dt * v * (u === 'feldweg' ? 1.6 : 1.1);
        while (staubRest > 1) {
          staubRest -= 1;
          var seite = Math.random() < 0.5 ? -1 : 1;
          teilchen.push({
            art: 'staub', t: 0, dauer: 1.4 + Math.random() * 0.9,
            x: g.x - c * 0.9 - s * seite * spec.breite / 2 + (Math.random() - 0.5) * 0.6,
            y: g.y - s * 0.9 + c * seite * spec.breite / 2 + (Math.random() - 0.5) * 0.6,
            vx: -c * v * 0.12 + (Math.random() - 0.5) * 0.8, vy: -s * v * 0.12 + (Math.random() - 0.5) * 0.8,
            r: 0.6, wachsen: 1.4 + Math.random() * 0.6, staerke: u === 'feldweg' ? 0.5 : 0.36
          });
        }
      }
    }

    if (spiel.motorLaeuft && spiel.motorLaeuft()) {
      rauchRest += dt * (2.2 + v * 0.35);
      var aus = spec.achsstand * 0.52 + 0.5;   // ueber dem Auspuff, vor der Kabine
      while (rauchRest > 1) {
        rauchRest -= 1;
        teilchen.push({
          art: 'rauch', t: 0, dauer: 0.9 + Math.random() * 0.5,
          x: g.x + c * aus + s * spec.breite * 0.16, y: g.y + s * aus - c * spec.breite * 0.16,
          vx: 0.6 + (Math.random() - 0.5) * 0.5 - c * v * 0.5, vy: 0.8 + (Math.random() - 0.5) * 0.5 - s * v * 0.5,
          r: 0.2, wachsen: 0.9, staerke: 0.2
        });
      }
    }
  }

  function partikelZeichnen(art) {
    for (var i = 0; i < teilchen.length; i++) {
      var t = teilchen[i];
      if (t.art !== art) continue;
      var a = t.staerke * (1 - t.t / t.dauer);
      ctx.fillStyle = art === 'staub' ? 'rgba(222,208,170,' + a.toFixed(3) + ')' : 'rgba(64,66,60,' + a.toFixed(3) + ')';
      kreis(t.x, t.y, t.r);
    }
  }

  /* ---------------- Wetter und Jahreszeit ----------------
   *
   * Liegt im Schirmraum ueber der fertigen Welt, unter Vignette, Ortsnamen und
   * Wegweiser -- die sollen auch im dicksten Nebel lesbar bleiben. Die Staerken
   * gleiten mit dt, damit ein Wetterwechsel nicht von einem Bild aufs andere
   * umschlaegt; bei offener Lade (dt = 0) steht alles still wie Staub und
   * Rauch.
   *
   * Die Jahreszeit ist nur ein Farbschleier. Die Kacheln der Felder fuer jede
   * Jahreszeit neu zu bauen haette das Vierfache an Texturen gekostet, und der
   * Schleier liest sich auf den ersten Blick genauso. */
  var wz = { regen: 0, schnee: 0, nebel: 0, dunkel: 0, blitz: 0, blitze: 0 };
  var tropfen = [], flocken = [];

  var WETTER_ZIEL = {
    sonne:    { regen: 0,   schnee: 0, nebel: 0, dunkel: 0 },
    wolken:   { regen: 0,   schnee: 0, nebel: 0, dunkel: 0.10 },
    regen:    { regen: 0.6, schnee: 0, nebel: 0.1, dunkel: 0.18 },
    gewitter: { regen: 1,   schnee: 0, nebel: 0.1, dunkel: 0.32 },
    nebel:    { regen: 0,   schnee: 0, nebel: 1, dunkel: 0.04 },
    schnee:   { regen: 0,   schnee: 1, nebel: 0.15, dunkel: 0.06 }
  };
  var SAISON_SCHLEIER = {
    fruehling: 'rgba(150,205,95,.05)',
    sommer:    'rgba(255,214,120,.07)',
    herbst:    'rgba(196,112,42,.13)',
    winter:    'rgba(232,240,250,.26)'
  };

  function wetterZeichnen(dt, state) {
    var art = state.wetter ? state.wetter.art : 'sonne';
    var ziel = WETTER_ZIEL[art] || WETTER_ZIEL.sonne;
    // Erstes Bild: gleich dort anfangen, wo das Wetter steht, statt aus dem
    // Sonnenschein hineinzublenden.
    var k = wz.gesetzt ? Math.min(1, dt / 4) : 1;
    wz.gesetzt = true;
    ['regen', 'schnee', 'nebel', 'dunkel'].forEach(function (n) { wz[n] += (ziel[n] - wz[n]) * k; });

    var sz = TG.umwelt.saison(state);
    ctx.fillStyle = SAISON_SCHLEIER[sz.id] || 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, breite, hoehe);

    if (wz.dunkel > 0.005) {
      ctx.fillStyle = 'rgba(24,31,40,' + wz.dunkel.toFixed(3) + ')';
      ctx.fillRect(0, 0, breite, hoehe);
    }

    if (wz.regen > 0.02) regenZeichnen(dt);
    if (wz.schnee > 0.02) schneeZeichnen(dt);

    if (wz.nebel > 0.02) {
      // Gleichmaessiger Schleier und zum Rand hin dichter: in der Mitte, wo
      // das Gespann steht, sieht man noch etwas, die naechste Kurve nicht.
      ctx.fillStyle = 'rgba(214,220,214,' + (0.22 * wz.nebel).toFixed(3) + ')';
      ctx.fillRect(0, 0, breite, hoehe);
      var r = Math.max(breite, hoehe);
      var nv = ctx.createRadialGradient(breite / 2, hoehe / 2, r * 0.12, breite / 2, hoehe / 2, r * 0.62);
      nv.addColorStop(0, 'rgba(214,220,214,0)');
      nv.addColorStop(1, 'rgba(214,220,214,' + (0.72 * wz.nebel).toFixed(3) + ')');
      ctx.fillStyle = nv;
      ctx.fillRect(0, 0, breite, hoehe);
    }

    // Blitz: selten, kurz, und nur bei echtem Gewitter.
    if (art === 'gewitter' && dt > 0 && Math.random() < dt * 0.06) { wz.blitz = 1; wz.blitze++; }
    if (wz.blitz > 0.01) {
      ctx.fillStyle = 'rgba(235,240,255,' + (0.45 * wz.blitz).toFixed(3) + ')';
      ctx.fillRect(0, 0, breite, hoehe);
      wz.blitz *= Math.exp(-dt * 7);
    }
  }

  function regenZeichnen(dt) {
    var soll = Math.round(260 * wz.regen);
    while (tropfen.length < soll) {
      tropfen.push({ x: Math.random() * breite, y: Math.random() * hoehe,
                     l: 10 + Math.random() * 12, v: 520 + Math.random() * 260 });
    }
    if (tropfen.length > soll) tropfen.length = soll;
    ctx.strokeStyle = 'rgba(196,210,224,' + (0.32 + 0.12 * wz.regen).toFixed(3) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < tropfen.length; i++) {
      var t = tropfen[i];
      t.y += t.v * dt; t.x -= t.v * 0.18 * dt;
      if (t.y > hoehe + 20) { t.y = -20; t.x = Math.random() * (breite + 60); }
      if (t.x < -20) t.x += breite + 40;
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x + t.l * 0.18, t.y - t.l);
    }
    ctx.stroke();
  }

  function schneeZeichnen(dt) {
    var soll = Math.round(220 * wz.schnee);
    while (flocken.length < soll) {
      flocken.push({ x: Math.random() * breite, y: Math.random() * hoehe,
                     r: 0.8 + Math.random() * 1.8, v: 30 + Math.random() * 40, p: Math.random() * 6.3 });
    }
    if (flocken.length > soll) flocken.length = soll;
    ctx.fillStyle = 'rgba(250,252,255,' + (0.85 * wz.schnee).toFixed(3) + ')';
    ctx.beginPath();
    for (var i = 0; i < flocken.length; i++) {
      var f = flocken[i];
      f.p += dt * 1.3;
      f.y += f.v * dt; f.x += Math.sin(f.p) * 14 * dt - 8 * dt;
      if (f.y > hoehe + 5) { f.y = -5; f.x = Math.random() * breite; }
      if (f.x < -5) f.x += breite + 10;
      ctx.moveTo(f.x + f.r, f.y);
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  /** Wie viele Blitze bisher -- main.js reicht neue an den Ton weiter. */
  function blitze() { return wz.blitze; }

  /* ---------------- Prüfstand: das Gerüst hinter dem Bild ----------------
   *
   * Gezeichnet wird, was sonst nur in den Daten steht und beim Fahren
   * gerätselt werden muss: die Mittellinie jedes Weges mit ihren
   * Stützpunkten, die Ladezonen samt Arten, die Gebäudehüllen einschließlich
   * des Puffers, an dem physics.js die Kollision aufhängt, und die
   * Anhängerachse — der Punkt, der über jedes Laden entscheidet.
   *
   * Alles im Weltmaßstab, deshalb werden Linienstärke und Schrift durch
   * kamera.scale geteilt: sonst wächst das Gerüst beim Zoom mit und deckt
   * gerade das zu, was man ansehen will. */
  function pruefLinien(s, spiel) {
    var m = 1 / kamera.scale;
    ctx.save();
    ctx.setLineDash([]);

    // Wege: Mittellinie, darauf die Stützpunkte des Skeletts
    for (var i = 0; i < W.wege.length; i++) {
      var weg = W.wege[i];
      if (!wegSichtbar(weg, s)) continue;
      ctx.strokeStyle = weg.typ === 'strasse' ? 'rgba(255,90,190,.85)' : 'rgba(120,210,255,.85)';
      ctx.lineWidth = 1.2 * m;
      pfad(weg.p); ctx.stroke();

      var st = weg.stuetz || [];
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      for (var q = 0; q < st.length; q++) {
        if (st[q][0] < s.x0 || st[q][0] > s.x1 || st[q][1] < s.y0 || st[q][1] > s.y1) continue;
        kreis(st[q][0], st[q][1], 2.2 * m);
      }
    }

    ctx.font = (11 * m) + 'px ui-monospace, monospace';
    ctx.textAlign = 'center';

    for (var o = 0; o < W.orte.length; o++) {
      var ort = W.orte[o];
      if (ort.x < s.x0 - 200 || ort.x > s.x1 + 200 || ort.y < s.y0 - 200 || ort.y > s.y1 + 200) continue;

      // Gebäudehülle mit dem Puffer, den physics.js benutzt
      for (var b = 0; b < ort.gebaeude.length; b++) {
        var geb = ort.gebaeude[b];
        ctx.strokeStyle = 'rgba(255,80,60,.75)';
        ctx.lineWidth = 0.8 * m;
        if (geb.rund) {
          ctx.beginPath();
          ctx.arc(geb.x, geb.y, geb.w / 2 + 1.0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeRect(geb.x - geb.w / 2 - 1.0, geb.y - geb.h / 2 - 1.0, geb.w + 2.0, geb.h + 2.0);
        }
      }

      // Ladezonen mit ihren Arten; enge Zonen bekommen einen Pfeil in
      // Sollrichtung, weil genau daran das Ankoppeln scheitert.
      for (var z = 0; z < ort.zonen.length; z++) {
        var zn = ort.zonen[z];
        ctx.save();
        ctx.translate(zn.x, zn.y);
        ctx.rotate(zn.rot);
        ctx.strokeStyle = zn.eng ? 'rgba(255,200,60,.9)' : 'rgba(140,255,120,.75)';
        ctx.lineWidth = 0.9 * m;
        ctx.strokeRect(-zn.w / 2, -zn.h / 2, zn.w, zn.h);
        if (zn.eng) {
          ctx.beginPath();
          ctx.moveTo(-zn.w / 2 + 1, 0); ctx.lineTo(zn.w / 2 - 1, 0);
          ctx.moveTo(zn.w / 2 - 4, -2); ctx.lineTo(zn.w / 2 - 1, 0); ctx.lineTo(zn.w / 2 - 4, 2);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.fillText(zn.arten.join(' '), 0, -zn.h / 2 - 2 * m);
        ctx.restore();
      }
    }

    // Anhängerachse: der Punkt, den aktuelleZone() abfragt
    var a = spiel.aktiverAnhaenger();
    if (a) {
      var p = spiel.gespann.anhaengerAchse(a.spec.geo.b);
      ctx.fillStyle = 'rgba(255,240,80,.95)';
      kreis(p.x, p.y, 1.4 * m);
      ctx.strokeStyle = 'rgba(255,240,80,.6)';
      ctx.lineWidth = 0.7 * m;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 * m, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.textAlign = 'left';
    ctx.restore();
  }

  /* ---------------------------------------------------------- */
  function gespannZeichnen(spiel) {
    var g = spiel.gespann;
    var t = spiel.aktiverTraktor(), a = spiel.aktiverAnhaenger();
    var k = g.kupplung();

    if (a) anhaengerZeichnen(spiel, g, a, k);
    traktorZeichnen(g, t.spec);
  }

  /* Weicher Schatten fuer Fahrzeuge: zwei Lagen, die aeussere groesser und
   * blasser. shadowBlur waere weicher, kostet aber je Bild und Form mehr als
   * das ganze uebrige Gespann. */
  function schatten(x, y, l, b, r) {
    ctx.fillStyle = 'rgba(8,14,4,.14)';
    rr(ctx, x + 0.4, y + 0.6, l + 0.9, b + 0.9, r + 0.4); ctx.fill();
    ctx.fillStyle = 'rgba(8,14,4,.2)';
    rr(ctx, x + 0.5, y + 0.7, l, b, r); ctx.fill();
  }

  var aufbauFarben = {
    schuett: ['#6f7a5e', '#59634c'], palette: ['#7d7565', '#615b4e'],
    ballen: ['#6d6a56', '#565343'], fluessig: ['#5f6b6e', '#4a5457'],
    fahrzeug: ['#5a5f66', '#464a50'], holz: ['#66594a', '#4f453a']
  };

  function anhaengerZeichnen(spiel, g, a, k) {
    var geo = a.spec.geo, art = a.spec.art;
    var ct = Math.cos(g.th), st = Math.sin(g.th);
    var bodyMitte = geo.bodyOff + geo.bodyLen / 2;
    var L = geo.bodyLen, B = geo.breite;
    var f = aufbauFarben[art] || aufbauFarben.schuett;

    // Deichsel
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2e2f2a'; ctx.lineWidth = 0.32;
    ctx.beginPath();
    ctx.moveTo(k.x, k.y);
    ctx.lineTo(k.x - ct * geo.bodyOff - st * 0.5, k.y - st * geo.bodyOff + ct * 0.5);
    ctx.moveTo(k.x, k.y);
    ctx.lineTo(k.x - ct * geo.bodyOff + st * 0.5, k.y - st * geo.bodyOff - ct * 0.5);
    ctx.stroke();

    ctx.save();
    ctx.translate(k.x - ct * bodyMitte, k.y - st * bodyMitte);
    ctx.rotate(g.th);
    schatten(-L / 2, -B / 2, L, B, 0.4);
    ctx.restore();

    // Räder der Anhängerachse, unter dem Aufbau
    radPaar(k.x - ct * geo.b, k.y - st * geo.b, g.th, geo.breite, 1.5, 0.55);

    ctx.save();
    ctx.translate(k.x - ct * bodyMitte, k.y - st * bodyMitte);
    ctx.rotate(g.th);

    var lad = spiel.state.ladung;
    var w = lad ? D.waren[lad.ware] : null;
    var wf = w ? w.farbe : '#c8a850';
    var anteil = lad ? U.clamp(lad.menge / a.spec.kap, 0.12, 1) : 0;

    if (art === 'fluessig') {
      // Fass: Zylinder mit Glanz laengs, oben ein Dom
      ctx.fillStyle = f[1];
      rr(ctx, -L / 2, -B / 2 + 0.1, L, B - 0.2, B * 0.42); ctx.fill();
      var gl = ctx.createLinearGradient(0, -B / 2, 0, B / 2);
      gl.addColorStop(0, ton(f[0], 0.32)); gl.addColorStop(0.35, ton(f[0], 0.1));
      gl.addColorStop(1, ton(f[0], -0.32));
      ctx.fillStyle = gl;
      rr(ctx, -L / 2 + 0.12, -B / 2 + 0.2, L - 0.24, B - 0.4, B * 0.4); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 0.1;
      ctx.beginPath();
      for (var rb = -L / 2 + 1.4; rb < L / 2 - 1; rb += 1.6) { ctx.moveTo(rb, -B / 2 + 0.25); ctx.lineTo(rb, B / 2 - 0.25); }
      ctx.stroke();
      ctx.fillStyle = '#3a3f40'; kreis(0, 0, 0.42);
      ctx.fillStyle = lad ? wf : '#5a6264'; kreis(0, 0, 0.28);
      if (lad) {
        // Fuellstand als Leiste an der Seite
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-L / 2 + 0.6, B / 2 - 0.42, L - 1.2, 0.18);
        ctx.fillStyle = wf; ctx.fillRect(-L / 2 + 0.6, B / 2 - 0.42, (L - 1.2) * anteil, 0.18);
      }
      ctx.restore();
      return;
    }

    // Kasten: Bordwand aussen, Boden innen
    ctx.fillStyle = f[0];
    rr(ctx, -L / 2, -B / 2, L, B, 0.3); ctx.fill();
    ctx.fillStyle = ton(f[0], 0.14);
    ctx.fillRect(-L / 2 + 0.1, -B / 2 + 0.06, L - 0.2, 0.12);
    var iL = L - 0.44, iB = B - 0.44;
    ctx.fillStyle = art === 'fahrzeug' ? '#3e4044' : ton(f[1], -0.25);
    ctx.fillRect(-iL / 2, -iB / 2, iL, iB);
    // Rungen auf der Bordwand
    ctx.fillStyle = f[1];
    for (var rx = -L / 2 + 1.0; rx < L / 2 - 0.5; rx += 1.4) {
      ctx.fillRect(rx, -B / 2, 0.16, 0.22);
      ctx.fillRect(rx, B / 2 - 0.22, 0.16, 0.22);
    }

    if (lad) {
      var lL = iL * anteil, x0 = -iL / 2;
      if (art === 'schuett') {
        // Haufen: in der Mitte hoeher, also heller
        var hg = ctx.createRadialGradient(x0 + lL * 0.55, -iB * 0.1, 0.2, x0 + lL / 2, 0, Math.max(lL, iB) * 0.62);
        hg.addColorStop(0, ton(wf, 0.22)); hg.addColorStop(1, ton(wf, -0.22));
        ctx.fillStyle = hg;
        rr(ctx, x0 + 0.05, -iB / 2 + 0.05, lL - 0.1, iB - 0.1, 0.5); ctx.fill();
        if (kamera.scale > 4) {
          ctx.fillStyle = 'rgba(0,0,0,.12)';
          for (var kk = 0; kk < lL * 6; kk++) {
            var sx = x0 + streuwert(kk, 3.1) * lL, sy = (streuwert(kk, 7.7) - 0.5) * (iB - 0.3);
            ctx.fillRect(sx, sy, 0.1, 0.1);
          }
        }
      } else if (art === 'ballen') {
        // Rundballen in zwei Reihen
        var dm = iB / 2 - 0.04;
        for (var bx = x0 + dm / 2 + 0.02; bx <= x0 + lL - dm / 2 + 0.01; bx += dm + 0.04) {
          for (var by = -1; by <= 1; by += 2) {
            var cy = by * (dm / 2 + 0.02);
            var bg = ctx.createRadialGradient(bx - dm * 0.15, cy - dm * 0.18, 0.05, bx, cy, dm / 2);
            bg.addColorStop(0, ton(wf, 0.25)); bg.addColorStop(1, ton(wf, -0.2));
            ctx.fillStyle = bg; kreis(bx, cy, dm / 2);
            ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 0.06;
            ctx.beginPath(); ctx.arc(bx, cy, dm * 0.3, 0, Math.PI * 2); ctx.stroke();
          }
        }
      } else if (art === 'palette') {
        var ps = Math.min(1.15, iB / 2 - 0.06);
        for (var px = x0 + 0.04; px + ps <= x0 + lL + 0.01; px += ps + 0.08) {
          for (var py = -1; py <= 1; py += 2) {
            var qy = py > 0 ? 0.04 : -ps - 0.04;
            ctx.fillStyle = ton(wf, -0.08); ctx.fillRect(px, qy, ps, ps);
            ctx.fillStyle = ton(wf, 0.16); ctx.fillRect(px + 0.06, qy + 0.06, ps - 0.12, ps * 0.4);
            ctx.fillStyle = 'rgba(0,0,0,.25)';
            ctx.fillRect(px + ps / 2 - 0.04, qy, 0.08, ps);
          }
        }
      } else if (art === 'holz') {
        var reihen = 4, dk = iB / reihen;
        for (var r = 0; r < reihen; r++) {
          var ly = -iB / 2 + dk * r + dk / 2;
          var ll = lL - (r % 2) * 0.3;
          ctx.fillStyle = ton(wf, (r % 2) ? -0.08 : 0.06);
          rr(ctx, x0, ly - dk / 2 + 0.03, ll, dk - 0.06, dk / 2); ctx.fill();
          ctx.fillStyle = '#c9a77a'; kreis(x0 + ll - dk / 2 + 0.05, ly, dk / 2 - 0.06);
          ctx.strokeStyle = 'rgba(90,60,30,.6)'; ctx.lineWidth = 0.05;
          ctx.beginPath(); ctx.arc(x0 + ll - dk / 2 + 0.05, ly, dk / 4, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (art === 'fahrzeug') {
        // Die Maschine auf dem Tieflader: Rumpf in ihrer Farbe, Kabine dunkel
        var mL = Math.max(2.4, lL - 0.3);
        ctx.fillStyle = 'rgba(0,0,0,.3)'; rr(ctx, x0 + 0.3, -iB / 2 + 0.35, mL, iB - 0.5, 0.3); ctx.fill();
        ctx.fillStyle = wf; rr(ctx, x0 + 0.15, -iB / 2 + 0.2, mL, iB - 0.5, 0.3); ctx.fill();
        ctx.fillStyle = ton(wf, 0.2); ctx.fillRect(x0 + 0.25, -iB / 2 + 0.3, mL - 0.2, 0.18);
        ctx.fillStyle = '#23261f'; rr(ctx, x0 + mL * 0.25, -iB / 2 + 0.45, mL * 0.32, iB - 1.0, 0.2); ctx.fill();
      } else {
        ctx.fillStyle = wf;
        ctx.fillRect(x0, -iB / 2, lL, iB);
      }
    }

    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 0.14;
    rr(ctx, -L / 2, -B / 2, L, B, 0.3); ctx.stroke();
    // Rueckleuchten
    ctx.fillStyle = '#b8352a';
    ctx.fillRect(-L / 2 - 0.05, -B / 2 + 0.15, 0.12, 0.3);
    ctx.fillRect(-L / 2 - 0.05, B / 2 - 0.45, 0.12, 0.3);
    ctx.restore();
  }

  /* Von oben gesehen: schmale Haube vorn, die Kabine ueber der Hinterachse,
   * Kotfluegel auf den grossen Raedern. Die Masse kommen alle aus spec, damit
   * jeder Traktor in seiner eigenen Groesse dasteht. */
  function traktorZeichnen(g, spec) {
    var c = Math.cos(g.h), s = Math.sin(g.h);
    var L = spec.laenge, B = spec.breite;
    var mitte = spec.achsstand * 0.52;

    ctx.save();
    ctx.translate(g.x + c * mitte, g.y + s * mitte);
    ctx.rotate(g.h);
    schatten(-L / 2, -B / 2, L, B, 0.6);
    ctx.restore();

    // Räder: hinten groß, vorne gelenkt
    radPaar(g.x, g.y, g.h, B, 1.8, 0.62);
    var vx = g.x + c * spec.achsstand, vy = g.y + s * spec.achsstand;
    radPaar(vx, vy, g.h + g.lenk, B * 0.86, 1.25, 0.48);

    ctx.save();
    ctx.translate(g.x + c * mitte, g.y + s * mitte);
    ctx.rotate(g.h);

    var hinten = -mitte;                 // Hinterachse im eigenen Rahmen
    var kHinten = hinten - 0.95, kVorn = hinten + 1.35;
    var kB = B * 0.8;

    // Rahmen und Haube, quer schattiert: so liest sie sich als Wölbung
    var hb = B * 0.5;
    var hg = ctx.createLinearGradient(0, -hb / 2, 0, hb / 2);
    hg.addColorStop(0, ton(spec.farbe, 0.28));
    hg.addColorStop(0.45, spec.farbe);
    hg.addColorStop(1, ton(spec.farbe, -0.3));
    ctx.fillStyle = '#25271f';
    rr(ctx, -L / 2 + 0.1, -B * 0.22, L - 0.1, B * 0.44, 0.2); ctx.fill();
    ctx.fillStyle = hg;
    rr(ctx, kVorn - 0.2, -hb / 2, L / 2 - kVorn + 0.1, hb, [0.15, 0.4, 0.4, 0.15]); ctx.fill();
    // Kühlergrill und Scheinwerfer an der Nase
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.fillRect(L / 2 - 0.22, -hb * 0.32, 0.08, hb * 0.64);
    ctx.fillStyle = '#f4ecc8';
    ctx.fillRect(L / 2 - 0.16, -hb / 2 + 0.04, 0.12, 0.2);
    ctx.fillRect(L / 2 - 0.16, hb / 2 - 0.24, 0.12, 0.2);

    // Kotfluegel ueber den Hinterraedern
    ctx.fillStyle = ton(spec.farbe, -0.08);
    rr(ctx, hinten - 0.98, -B / 2 - 0.04, 1.96, 0.62, 0.28); ctx.fill();
    rr(ctx, hinten - 0.98, B / 2 - 0.58, 1.96, 0.62, 0.28); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.fillRect(hinten - 0.8, -B / 2 + 0.02, 1.6, 0.12);

    // Kabine: dunkler Rahmen, Glas rundum, das Dach in der Hausfarbe
    ctx.fillStyle = '#1f221b';
    rr(ctx, kHinten, -kB / 2, kVorn - kHinten, kB, 0.3); ctx.fill();
    // Von oben sieht man vom Glas nur die Frontscheibe und einen Saum —
    // das Dach deckt den Rest.
    ctx.fillStyle = 'rgba(120,162,184,.85)';
    rr(ctx, kHinten + 0.08, -kB / 2 + 0.08, kVorn - kHinten - 0.16, kB - 0.16, 0.22); ctx.fill();
    var dg = ctx.createLinearGradient(kHinten, -kB / 2, kVorn, kB / 2);
    dg.addColorStop(0, ton(spec.farbe, 0.22));
    dg.addColorStop(1, ton(spec.dach, -0.08));
    ctx.fillStyle = dg;
    rr(ctx, kHinten + 0.12, -kB / 2 + 0.12, kVorn - kHinten - 0.46, kB - 0.24, 0.24); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    rr(ctx, kHinten + 0.3, -kB / 2 + 0.22, kVorn - kHinten - 0.9, 0.16, 0.08); ctx.fill();
    // Rundumleuchte und Auspuff
    ctx.fillStyle = '#e8a23a'; kreis(kHinten + 0.45, -kB / 2 + 0.42, 0.13);
    ctx.fillStyle = '#121310'; kreis(kVorn + 0.5, -hb / 2 - 0.02, 0.13);

    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 0.1;
    rr(ctx, kHinten, -kB / 2, kVorn - kHinten, kB, 0.3); ctx.stroke();
    ctx.restore();
  }

  /* Reifen mit Stollen, die mit der gefahrenen Strecke weiterlaufen — beim
   * Rangieren sieht man so, dass sich etwas bewegt, auch bei 2 km/h. */
  function radPaar(x, y, ang, spur, laenge, dicke) {
    var nx = -Math.sin(ang), ny = Math.cos(ang);
    var profil = kamera.scale > 4;
    var teilung = 0.3, versatz = ((rollWeg % teilung) + teilung) % teilung;
    for (var i = -1; i <= 1; i += 2) {
      var px = x + nx * (spur / 2) * i, py = y + ny * (spur / 2) * i;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.fillStyle = '#1d1f1a';
      rr(ctx, -laenge / 2, -dicke / 2, laenge, dicke, Math.min(0.25, dicke * 0.4)); ctx.fill();
      if (profil) {
        ctx.fillStyle = '#34372f';
        for (var sx = -laenge / 2 + versatz + 0.04; sx < laenge / 2 - 0.1; sx += teilung) {
          ctx.fillRect(sx, -dicke / 2 + 0.06, 0.1, dicke - 0.12);
        }
      }
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------- */
  var schrift = '600 12px "Segoe UI",system-ui,Arial,sans-serif';

  /* Ein Schild mit runden Enden. Der Punkt vorn traegt dieselbe Farbe wie
   * auf der Karte — eigener Hof gruen, Ziel gelb —, damit beide Ansichten
   * dieselbe Sprache sprechen. */
  function schild(x, y, txt, punkt, schriftFarbe) {
    var w = ctx.measureText(txt).width;
    var bw = w + (punkt ? 26 : 18), bh = 22;
    var x0 = x - bw / 2, y0 = y - bh / 2;
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    rr(ctx, x0, y0 + 2, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = 'rgba(16,20,13,.78)';
    rr(ctx, x0, y0, bw, bh, bh / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1;
    rr(ctx, x0 + 0.5, y0 + 0.5, bw - 1, bh - 1, bh / 2); ctx.stroke();
    if (punkt) {
      ctx.fillStyle = punkt;
      ctx.beginPath(); ctx.arc(x0 + 11, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = schriftFarbe || '#e6ead9';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x0 + (punkt ? 19 : 9), y + 0.5);
  }

  function ortsnamen(s) {
    ctx.save();
    ctx.font = schrift;
    for (var i = 0; i < W.orte.length; i++) {
      var o = W.orte[i];
      if (o.x < s.x0 || o.x > s.x1 || o.y < s.y0 || o.y > s.y1) continue;
      var p = welt2schirm(o.x, o.y - 30);
      schild(p.x, p.y - 4, o.name, o.istHof ? '#9ede63' : '#cfd6c2');
    }
    ctx.restore();
  }

  /** Pfeil am Bildrand zum aktuellen Ziel. */
  function wegweiser(spiel) {
    var ziel = spiel.zielOrt();
    if (!ziel) return;
    var g = spiel.gespann;
    var p = welt2schirm(ziel.x, ziel.y);
    var rand = 60;
    var uhr = (window.performance ? performance.now() : Date.now()) / 1000;

    if (p.x > rand && p.x < breite - rand && p.y > rand + 40 && p.y < hoehe - rand) {
      // Ziel im Bild: ein Ring, der langsam atmet
      var r = 34 + Math.sin(uhr * 2.4) * 3;
      ctx.save();
      ctx.strokeStyle = 'rgba(232,193,74,.22)'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#e8c14a'; ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -uhr * 10;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      return;
    }

    var ang = Math.atan2(ziel.y - g.y, ziel.x - g.x);
    var cx = breite / 2, cy = hoehe / 2;
    var rr0 = Math.min(breite, hoehe) / 2 - 62;
    var ax = cx + Math.cos(ang) * rr0, ay = cy + Math.sin(ang) * rr0;
    var d = U.abstand(g.x, g.y, ziel.x, ziel.y);
    var puls = 1 + Math.sin(uhr * 3) * 0.06;

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.scale(puls, puls);
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#e8c14a';
    ctx.strokeStyle = 'rgba(16,20,13,.85)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.lineTo(-10, 12); ctx.lineTo(-4, 0); ctx.lineTo(-10, -12);
    ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = schrift;
    schild(ax, ay + 30, ziel.kurz + ' · ' + U.strecke(d), null, '#e8c14a');
    ctx.restore();
  }

  /* ---------------- Kartenbild ----------------
   * Dieselbe Zeichnung fuer die Minikarte unten rechts und fuer den
   * Kartenbildschirm. Es gibt sie genau einmal: zwei Fassungen waeren zwei
   * Karten, die frueher oder spaeter auseinanderlaufen. Unterschiedlich sind
   * nur Ausschnitt und Massstab, und beides steht in den Parametern.
   *
   * `zctx` ist ein beliebiger 2D-Kontext, `bp`/`hp` seine Groesse in
   * Bildpunkten, `mitte`/`spanne` der Ausschnitt in Metern.
   */
  var kartenFeld = ['#63823f', '#a89451', '#6f583e'];

  function karte(zctx, bp, hp, mitte, spanne, spiel, opt) {
    opt = opt || {};
    var m = bp / spanne;                      // Bildpunkte je Meter
    var G = W.GROESSE;
    var g = spiel.gespann;
    var ziel = spiel.zielOrt();

    // Sichtbarer Ausschnitt in Weltmass, mit Rand fuers Beschneiden
    var hw = spanne / 2, hh = hp / 2 / m;
    var s = { x0: mitte.x - hw - 40, x1: mitte.x + hw + 40, y0: mitte.y - hh - 40, y1: mitte.y + hh + 40 };

    zctx.clearRect(0, 0, bp, hp);
    zctx.fillStyle = '#2b3524';                // ausserhalb der Karte
    zctx.fillRect(0, 0, bp, hp);

    zctx.save();
    zctx.translate(bp / 2, hp / 2);
    zctx.scale(m, m);
    zctx.translate(-mitte.x, -mitte.y);

    zctx.fillStyle = '#4b6635';
    zctx.fillRect(0, 0, G, G);
    // Dieselben Flecken wie im Fahrbild, nur blasser: die Karte soll nicht
    // gleichmaessig gruen sein, aber auch nicht unruhig.
    if (tex.flecken) {
      zctx.save();
      zctx.globalAlpha = 0.6;
      zctx.imageSmoothingEnabled = true;
      zctx.drawImage(tex.flecken, 0, 0, G, G);
      zctx.restore();
    }

    // Schlaege
    for (var f = 0; f < W.felder.length; f++) {
      var fe = W.felder[f];
      var luft = Math.abs(fe.dreh || 0) * Math.max(fe.w, fe.h) + 8;
      if (fe.x - luft > s.x1 || fe.x + fe.w + luft < s.x0 || fe.y - luft > s.y1 || fe.y + fe.h + luft < s.y0) continue;
      zctx.save();
      if (fe.dreh) {
        zctx.translate(fe.x + fe.w / 2, fe.y + fe.h / 2);
        zctx.rotate(fe.dreh);
        zctx.translate(-(fe.x + fe.w / 2), -(fe.y + fe.h / 2));
      }
      zctx.fillStyle = kartenFeld[fe.t];
      rr(zctx, fe.x, fe.y, fe.w, fe.h, Math.min(3, 2 / m));
      zctx.fill();
      zctx.restore();
    }

    // Beiwerk: Tuempel immer, Gehoelze erst, wenn sie mehr als ein Pixel gross
    // waeren — darunter sind sie nur Grieß auf der Karte.
    var bw = W.beiwerk();
    for (var b = 0; b < bw.length; b++) {
      var st = bw[b];
      if (st.art === 'teich') {
        if (st.x < s.x0 || st.x > s.x1 || st.y < s.y0 || st.y > s.y1) continue;
        zctx.fillStyle = '#33586a';
        zctx.beginPath(); zctx.ellipse(st.x, st.y, st.r, st.r * 0.72, 0.4, 0, Math.PI * 2); zctx.fill();
      } else if (m > 0.22 && st.art === 'baum') {
        if (st.x < s.x0 || st.x > s.x1 || st.y < s.y0 || st.y > s.y1) continue;
        zctx.fillStyle = '#3c6631';
        zctx.beginPath(); zctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); zctx.fill();
      }
    }

    // Wege in vier Lagen: Feldwege ganz, dann Strassen ganz darueber. Je Art
    // erst alle Bankette, dann alle Fahrbahnen — sonst schneidet das Bankett
    // des einen Weges die Fahrbahn des anderen an der Kreuzung durch.
    zctx.lineCap = 'round'; zctx.lineJoin = 'round';
    for (var lage = 0; lage < 4; lage++) {
      var typ = lage < 2 ? 'feldweg' : 'strasse';
      var bankett = (lage % 2) === 0;
      for (var i = 0; i < W.wege.length; i++) {
        var weg = W.wege[i];
        if (weg.typ !== typ) continue;
        if (!wegSichtbar(weg, s)) continue;
        // Untergrenze in Bildpunkten: auf der Minikarte waere eine 10 m breite
        // Strasse sonst schmaler als ein Pixel und schlicht nicht da.
        if (bankett) {
          zctx.strokeStyle = typ === 'strasse' ? '#3a3a36' : '#5c4d34';
          zctx.lineWidth = Math.max(weg.breite + 3, (typ === 'strasse' ? 3.6 : 3.0) / m);
        } else {
          zctx.strokeStyle = typ === 'strasse' ? '#9a9a90' : '#a08a5c';
          zctx.lineWidth = Math.max(weg.breite, (typ === 'strasse' ? 1.9 : 1.5) / m);
        }
        pfadIn(zctx, weg.p);
        zctx.stroke();
      }
    }

    // Gebaeude, sobald sie mehr als ein Fleck waeren
    if (m > 0.35) {
      for (var o = 0; o < W.orte.length; o++) {
        var ort = W.orte[o];
        if (ort.x < s.x0 - 160 || ort.x > s.x1 + 160 || ort.y < s.y0 - 160 || ort.y > s.y1 + 160) continue;
        for (var gb = 0; gb < ort.gebaeude.length; gb++) {
          var geb = ort.gebaeude[gb];
          zctx.fillStyle = geb.d;
          if (geb.rund) { zctx.beginPath(); zctx.arc(geb.x, geb.y, geb.w / 2, 0, Math.PI * 2); zctx.fill(); }
          else zctx.fillRect(geb.x - geb.w / 2, geb.y - geb.h / 2, geb.w, geb.h);
        }
      }
    }

    zctx.restore();

    /* Ab hier in Bildpunkten: Punkte, Namen und das Gespann sollen bei jedem
     * Massstab gleich gross bleiben. */
    function aufSchirm(x, y) {
      return { x: (x - mitte.x) * m + bp / 2, y: (y - mitte.y) * m + hp / 2 };
    }

    // Ziel: gestrichelte Leine vom Gespann dorthin, damit die Richtung
    // ablesbar ist, ohne die Namen zu suchen.
    if (ziel && opt.zielLinie) {
      var a = aufSchirm(g.x, g.y), z = aufSchirm(ziel.x, ziel.y);
      zctx.save();
      zctx.strokeStyle = 'rgba(232,193,74,.55)'; zctx.lineWidth = 1.4;
      zctx.setLineDash([5, 5]);
      zctx.beginPath(); zctx.moveTo(a.x, a.y); zctx.lineTo(z.x, z.y); zctx.stroke();
      zctx.restore();
    }

    var punkte = [];
    for (var n = 0; n < W.orte.length; n++) {
      var or = W.orte[n];
      var p = aufSchirm(or.x, or.y);
      if (p.x < -60 || p.x > bp + 60 || p.y < -40 || p.y > hp + 40) continue;
      var istZiel = ziel && ziel.id === or.id;
      punkte.push({ ort: or, p: p, istZiel: istZiel });

      zctx.fillStyle = istZiel ? '#e8c14a' : (or.istHof ? '#9ede63' : '#cfd6c2');
      zctx.beginPath(); zctx.arc(p.x, p.y, istZiel ? 5 : 3.5, 0, Math.PI * 2); zctx.fill();
      zctx.strokeStyle = 'rgba(10,14,8,.7)'; zctx.lineWidth = 1;
      zctx.beginPath(); zctx.arc(p.x, p.y, istZiel ? 5 : 3.5, 0, Math.PI * 2); zctx.stroke();
      if (istZiel) {
        zctx.strokeStyle = '#e8c14a'; zctx.lineWidth = 1.4;
        zctx.beginPath(); zctx.arc(p.x, p.y, 10, 0, Math.PI * 2); zctx.stroke();
      }
    }

    // Schriftgroesse haengt an der Leinwand, die Namensform am Massstab: auf
    // der Minikarte ist alles klein und kurz, auf dem Kartenblatt gross — und
    // sobald man dort hineinzoomt, stehen die vollen Namen da, weil dann Platz
    // dafuer ist.
    if (opt.namen) namenSetzen(zctx, punkte, bp >= 420 ? 12 : 9, m > 0.35, bp);

    // Gespann
    var sp = aufSchirm(g.x, g.y);
    zctx.save();
    zctx.translate(sp.x, sp.y);
    zctx.rotate(g.h);
    zctx.fillStyle = '#ff6b4a';
    zctx.strokeStyle = 'rgba(10,14,8,.8)'; zctx.lineWidth = 1;
    zctx.lineJoin = 'round';
    zctx.beginPath();
    zctx.moveTo(7, 0); zctx.lineTo(-5, 4.5); zctx.lineTo(-2.5, 0); zctx.lineTo(-5, -4.5);
    zctx.closePath(); zctx.fill(); zctx.stroke();
    zctx.restore();
  }

  /* Ortsnamen setzen, ohne dass sie sich stapeln.
   *
   * Auf dem grossen Kartenblatt passen alle elf hin, auf der Minikarte nicht
   * einmal die Haelfte: Dorf und Tankstelle liegen dort 24 Bildpunkte
   * auseinander und ihre Schilder sind fuenfzig breit. Deshalb wird nicht
   * entschieden, *ob* Namen gezeichnet werden, sondern jeder einzelne wird
   * verworfen, wenn sein Platz schon belegt ist. Wichtig zuerst: das Ziel des
   * Auftrags, dann der eigene Hof, dann der Rest — so faellt bei Enge das
   * Entbehrliche weg und nicht das Gesuchte.
   */
  function namenSetzen(zctx, punkte, groesse, lang, bp) {
    var reihenfolge = punkte.slice().sort(function (a, b) {
      var ra = a.istZiel ? 0 : (a.ort.istHof ? 1 : 2);
      var rb = b.istZiel ? 0 : (b.ort.istHof ? 1 : 2);
      return ra - rb;
    });
    var belegt = [];
    zctx.save();
    zctx.font = groesse + 'px system-ui, sans-serif';
    zctx.textAlign = 'left';
    zctx.textBaseline = 'middle';
    zctx.lineJoin = 'round';
    for (var i = 0; i < reihenfolge.length; i++) {
      var e = reihenfolge[i];
      var txt = lang ? e.ort.name : e.ort.kurz;
      var br = zctx.measureText(txt).width;
      // Am rechten Rand klappt das Schild auf die andere Seite des Punktes,
      // sonst steht dort nur der halbe Ortsname.
      var links = e.p.x + 7 + br + 3 > bp - 2;
      var kasten = { x: links ? e.p.x - 7 - br - 3 : e.p.x + 7,
                     y: e.p.y - groesse / 2 - 1, w: br + 3, h: groesse + 2 };
      var frei = true;
      for (var b = 0; b < belegt.length; b++) {
        var o = belegt[b];
        if (kasten.x < o.x + o.w && o.x < kasten.x + kasten.w &&
            kasten.y < o.y + o.h && o.y < kasten.y + kasten.h) { frei = false; break; }
      }
      if (!frei) continue;
      belegt.push(kasten);
      // Der Punkt selbst ist auch belegt, sonst schreibt der Nachbar darueber.
      belegt.push({ x: e.p.x - 6, y: e.p.y - 6, w: 12, h: 12 });
      zctx.strokeStyle = 'rgba(10,14,8,.85)';
      zctx.lineWidth = 3;
      var schriftX = links ? kasten.x + 3 : kasten.x;
      zctx.strokeText(txt, schriftX, e.p.y);
      zctx.fillStyle = e.istZiel ? '#e8c14a' : '#eef1e4';
      zctx.fillText(txt, schriftX, e.p.y);
    }
    zctx.restore();
  }

  function pfadIn(zctx, punkte) {
    zctx.beginPath();
    zctx.moveTo(punkte[0][0], punkte[0][1]);
    for (var i = 1; i < punkte.length; i++) zctx.lineTo(punkte[i][0], punkte[i][1]);
  }

  /* ---------------------------------------------------------- */
  function minikarte(spiel) {
    karte(mctx, mk.width, mk.height,
      { x: W.GROESSE / 2, y: W.GROESSE / 2 }, W.GROESSE, spiel,
      { namen: true, zielLinie: true });
  }

  return {
    start: start, bild: bild, minikarte: minikarte, karte: karte, zoom: zoom,
    kamera: kamera, welt2schirm: welt2schirm, schirm2welt: schirm2welt,
    mausZiel: mausZiel, blitze: blitze
  };
})();
