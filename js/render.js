/* Landfracht — Zeichnen von Karte, Gespann und Minikarte */
var TG = window.TG || (window.TG = {});

TG.zeichnen = (function () {
  var U = TG.util, W = TG.welt, D = TG.data;

  var leinwand, ctx, breite = 0, hoehe = 0, dpr = 1;
  var mk, mctx;

  var kamera = { x: 1500, y: 1500, scale: 5.2, zielScale: 5.2 };

  var feldFarben = [
    { boden: '#6f8f4a', linie: '#658347' },   // Weide
    { boden: '#b3a05a', linie: '#a19050' },   // Getreide
    { boden: '#7a6144', linie: '#6d5640' }    // Acker
  ];

  function start() {
    leinwand = document.getElementById('leinwand');
    ctx = leinwand.getContext('2d');
    mk = document.getElementById('minikarte');
    mctx = mk.getContext('2d');
    groesseAnpassen();
    window.addEventListener('resize', groesseAnpassen);
  }

  var grundGesetzt = false;

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
  }

  function zoom(richtung) {
    kamera.zielScale = U.clamp(kamera.zielScale * (richtung > 0 ? 1.22 : 0.82), 2.2, 11);
  }

  function kameraFolgen(dt, g) {
    var tempo = Math.abs(g.v);
    // Bei hohem Tempo etwas herauszoomen, damit man weiter voraussieht
    var auto = U.clamp(kamera.zielScale * (1 - tempo / 90), 2.2, 11);
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

  function sichtbereich() {
    var hw = breite / 2 / kamera.scale, hh = hoehe / 2 / kamera.scale;
    return { x0: kamera.x - hw - 40, x1: kamera.x + hw + 40, y0: kamera.y - hh - 40, y1: kamera.y + hh + 40 };
  }

  /* ---------------------------------------------------------- */
  function bild(dt, spiel) {
    var g = spiel.gespann;
    kameraFolgen(dt, g);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, breite, hoehe);

    ctx.fillStyle = '#5f7f45';
    ctx.fillRect(0, 0, breite, hoehe);

    ctx.save();
    ctx.translate(breite / 2, hoehe / 2);
    ctx.scale(kamera.scale, kamera.scale);
    ctx.translate(-kamera.x, -kamera.y);

    var s = sichtbereich();
    felderZeichnen(s);
    wegeZeichnen(s);
    zonenZeichnen(s, spiel);
    gebaeudeZeichnen(s);
    gespannZeichnen(spiel);
    ctx.restore();

    ortsnamen(s);
    wegweiser(spiel);
  }

  function felderZeichnen(s) {
    for (var i = 0; i < W.felder.length; i++) {
      var f = W.felder[i];
      if (f.x > s.x1 || f.x + f.w < s.x0 || f.y > s.y1 || f.y + f.h < s.y0) continue;
      var fa = feldFarben[f.t];
      ctx.fillStyle = fa.boden;
      ctx.fillRect(f.x, f.y, f.w, f.h);
      if (kamera.scale > 3) {
        ctx.strokeStyle = fa.linie;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (var x = f.x + 12; x < f.x + f.w; x += 16) {
          ctx.moveTo(x, f.y + 4); ctx.lineTo(x, f.y + f.h - 4);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(40,55,28,.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(f.x, f.y, f.w, f.h);
    }
  }

  function wegeZeichnen(s) {
    // erst Feldwege, dann Straßen darüber
    for (var durchgang = 0; durchgang < 2; durchgang++) {
      var typ = durchgang === 0 ? 'feldweg' : 'strasse';
      for (var i = 0; i < W.wege.length; i++) {
        var weg = W.wege[i];
        if (weg.typ !== typ) continue;
        if (!wegSichtbar(weg, s)) continue;

        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        // Bankett
        ctx.strokeStyle = typ === 'strasse' ? '#3a3a36' : '#6b5a3e';
        ctx.lineWidth = weg.breite + 3;
        pfad(weg.p); ctx.stroke();
        // Fahrbahn
        ctx.strokeStyle = typ === 'strasse' ? '#55554f' : '#8e7a52';
        ctx.lineWidth = weg.breite;
        pfad(weg.p); ctx.stroke();

        if (typ === 'strasse' && kamera.scale > 3.4) {
          ctx.save();
          ctx.strokeStyle = 'rgba(230,225,190,.45)';
          ctx.lineWidth = 0.9;
          ctx.setLineDash([6, 9]);
          pfad(weg.p); ctx.stroke();
          ctx.restore();
        }
      }
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

  function zonenZeichnen(s, spiel) {
    var a = spiel.aktiverAnhaenger();
    var art = a ? a.spec.art : null;
    var chance = spiel.ladeChance();
    var ziel = spiel.zielOrt();

    for (var i = 0; i < W.orte.length; i++) {
      var o = W.orte[i];
      if (o.x < s.x0 - 120 || o.x > s.x1 + 120 || o.y < s.y0 - 120 || o.y > s.y1 + 120) continue;

      for (var z = 0; z < o.zonen.length; z++) {
        var zn = o.zonen[z];
        var passt = art && zn.arten.indexOf(art) >= 0;
        var istZiel = ziel && ziel.id === o.id && passt;
        var aktiv = chance && chance.zone === zn;

        ctx.save();
        ctx.translate(zn.x, zn.y);
        ctx.rotate(zn.rot);
        ctx.lineWidth = aktiv ? 1.6 : 1.0;
        ctx.setLineDash(aktiv ? [] : [4, 3]);
        if (aktiv) { ctx.strokeStyle = '#9ede63'; ctx.fillStyle = 'rgba(120,200,80,.22)'; }
        else if (istZiel) { ctx.strokeStyle = '#e8c14a'; ctx.fillStyle = 'rgba(230,190,70,.14)'; }
        else if (passt) { ctx.strokeStyle = 'rgba(230,235,220,.5)'; ctx.fillStyle = 'rgba(240,240,230,.06)'; }
        else { ctx.strokeStyle = 'rgba(180,190,170,.25)'; ctx.fillStyle = 'rgba(0,0,0,0)'; }
        ctx.fillRect(-zn.w / 2, -zn.h / 2, zn.w, zn.h);
        ctx.strokeRect(-zn.w / 2, -zn.h / 2, zn.w, zn.h);
        ctx.restore();
      }
    }
    ctx.setLineDash([]);
  }

  function gebaeudeZeichnen(s) {
    for (var i = 0; i < W.orte.length; i++) {
      var o = W.orte[i];
      if (o.x < s.x0 - 160 || o.x > s.x1 + 160 || o.y < s.y0 - 160 || o.y > s.y1 + 160) continue;
      for (var b = 0; b < o.gebaeude.length; b++) {
        var geb = o.gebaeude[b];
        ctx.save();
        ctx.translate(geb.x, geb.y);
        // Schatten
        ctx.fillStyle = 'rgba(0,0,0,.22)';
        if (geb.rund) { kreis(3, 4, geb.w / 2); } else { ctx.fillRect(-geb.w / 2 + 3, -geb.h / 2 + 4, geb.w, geb.h); }
        // Wand
        ctx.fillStyle = geb.f;
        if (geb.rund) { kreis(0, 0, geb.w / 2); } else { ctx.fillRect(-geb.w / 2, -geb.h / 2, geb.w, geb.h); }
        // Dach
        ctx.fillStyle = geb.d;
        if (geb.rund) { kreis(0, 0, geb.w / 2 * 0.72); }
        else { ctx.fillRect(-geb.w / 2, -geb.h / 2, geb.w, geb.h * 0.52); }
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.lineWidth = 1;
        if (!geb.rund) ctx.strokeRect(-geb.w / 2, -geb.h / 2, geb.w, geb.h);
        ctx.restore();
      }
    }
  }

  function kreis(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

  /* ---------------------------------------------------------- */
  function gespannZeichnen(spiel) {
    var g = spiel.gespann;
    var t = spiel.aktiverTraktor(), a = spiel.aktiverAnhaenger();
    var k = g.kupplung();

    if (a) anhaengerZeichnen(spiel, g, a, k);
    traktorZeichnen(g, t.spec);
  }

  function anhaengerZeichnen(spiel, g, a, k) {
    var geo = a.spec.geo;
    var ct = Math.cos(g.th), st = Math.sin(g.th);
    var bodyMitte = geo.bodyOff + geo.bodyLen / 2;

    // Deichsel
    ctx.strokeStyle = '#3c3c38'; ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(k.x, k.y);
    ctx.lineTo(k.x - ct * geo.bodyOff, k.y - st * geo.bodyOff);
    ctx.stroke();

    // Räder der Anhängerachse
    radPaar(k.x - ct * geo.b, k.y - st * geo.b, g.th, geo.breite, 1.5, 0.55);

    ctx.save();
    ctx.translate(k.x - ct * bodyMitte, k.y - st * bodyMitte);
    ctx.rotate(g.th);

    var L = geo.bodyLen, B = geo.breite;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(-L / 2 + 0.6, -B / 2 + 0.8, L, B);

    // Aufbau je nach Typ
    var farben = {
      schuett: ['#6f7a5e', '#59634c'], palette: ['#7d7565', '#615b4e'],
      ballen: ['#6d6a56', '#565343'], fluessig: ['#5f6b6e', '#4a5457'],
      fahrzeug: ['#5a5f66', '#464a50'], holz: ['#66594a', '#4f453a']
    };
    var f = farben[a.spec.art] || farben.schuett;
    ctx.fillStyle = f[0];
    ctx.fillRect(-L / 2, -B / 2, L, B);
    ctx.strokeStyle = f[1]; ctx.lineWidth = 0.5;
    ctx.strokeRect(-L / 2, -B / 2, L, B);

    // Ladung
    var lad = spiel.state.ladung;
    if (lad) {
      var anteil = U.clamp(lad.menge / a.spec.kap, 0.12, 1);
      var w = D.waren[lad.ware];
      ctx.fillStyle = w ? w.farbe : '#c8a850';
      var innenL = (L - 0.9) * anteil, innenB = B - 0.9;
      ctx.fillRect(-L / 2 + 0.45, -innenB / 2, innenL, innenB);
      if (a.spec.art === 'ballen' || a.spec.art === 'palette') {
        ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 0.35;
        ctx.beginPath();
        for (var x = -L / 2 + 0.45; x < -L / 2 + 0.45 + innenL; x += 1.5) {
          ctx.moveTo(x, -innenB / 2); ctx.lineTo(x, innenB / 2);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function traktorZeichnen(g, spec) {
    var c = Math.cos(g.h), s = Math.sin(g.h);

    // Räder: hinten groß, vorne gelenkt
    radPaar(g.x, g.y, g.h, spec.breite, 1.8, 0.62);
    var vx = g.x + c * spec.achsstand, vy = g.y + s * spec.achsstand;
    radPaar(vx, vy, g.h + g.lenk, spec.breite * 0.86, 1.25, 0.48);

    var mitte = spec.achsstand * 0.52;
    ctx.save();
    ctx.translate(g.x + c * mitte, g.y + s * mitte);
    ctx.rotate(g.h);

    var L = spec.laenge, B = spec.breite;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(-L / 2 + 0.7, -B / 2 + 0.9, L, B * 0.9);

    // Kotflügel und Rumpf in der Hausfarbe
    ctx.fillStyle = spec.farbe;
    ctx.fillRect(-L / 2, -B / 2, L, B);
    // Motorhaube etwas heller abgesetzt
    ctx.fillStyle = spec.dach;
    ctx.fillRect(L / 2 - L * 0.40, -B / 2 + 0.45, L * 0.40, B - 0.9);
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.fillRect(L / 2 - L * 0.40, -B / 2 + 0.45, L * 0.40, (B - 0.9) * 0.4);
    // Kabine, dunkel mit Glas
    ctx.fillStyle = '#23261f';
    ctx.fillRect(-L / 2 + L * 0.10, -B / 2 + 0.2, L * 0.40, B - 0.4);
    ctx.fillStyle = 'rgba(196,220,232,.62)';
    ctx.fillRect(-L / 2 + L * 0.16, -B / 2 + 0.45, L * 0.28, B - 0.9);
    // Auspuff als kleiner Punkt vorn links
    ctx.fillStyle = '#1a1c17';
    ctx.fillRect(L / 2 - L * 0.38, -B / 2 + 0.15, 0.32, 0.32);

    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 0.45;
    ctx.strokeRect(-L / 2, -B / 2, L, B);
    ctx.restore();
  }

  function radPaar(x, y, ang, spur, laenge, dicke) {
    var nx = -Math.sin(ang), ny = Math.cos(ang);
    ctx.fillStyle = '#22241f';
    for (var i = -1; i <= 1; i += 2) {
      var px = x + nx * (spur / 2) * i, py = y + ny * (spur / 2) * i;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.fillRect(-laenge / 2, -dicke / 2, laenge, dicke);
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------- */
  function ortsnamen(s) {
    ctx.save();
    ctx.font = '600 12px "Segoe UI",Arial,sans-serif';
    ctx.textAlign = 'center';
    for (var i = 0; i < W.orte.length; i++) {
      var o = W.orte[i];
      if (o.x < s.x0 || o.x > s.x1 || o.y < s.y0 || o.y > s.y1) continue;
      var p = welt2schirm(o.x, o.y - 30);
      ctx.fillStyle = 'rgba(10,14,8,.6)';
      var w = ctx.measureText(o.name).width;
      ctx.fillRect(p.x - w / 2 - 6, p.y - 12, w + 12, 17);
      ctx.fillStyle = '#e6ead9';
      ctx.fillText(o.name, p.x, p.y);
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

    if (p.x > rand && p.x < breite - rand && p.y > rand + 40 && p.y < hoehe - rand) {
      // Ziel im Bild: Ring darum
      ctx.save();
      ctx.strokeStyle = '#e8c14a'; ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      return;
    }

    var ang = Math.atan2(ziel.y - g.y, ziel.x - g.x);
    var cx = breite / 2, cy = hoehe / 2;
    var r = Math.min(breite, hoehe) / 2 - 62;
    var ax = cx + Math.cos(ang) * r, ay = cy + Math.sin(ang) * r;
    var d = U.abstand(g.x, g.y, ziel.x, ziel.y);

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(232,193,74,.92)';
    ctx.beginPath();
    ctx.moveTo(17, 0); ctx.lineTo(-11, 11); ctx.lineTo(-6, 0); ctx.lineTo(-11, -11);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = '600 12px "Segoe UI",Arial,sans-serif';
    ctx.textAlign = 'center';
    var txt = ziel.kurz + ' · ' + U.strecke(d);
    var w = ctx.measureText(txt).width;
    ctx.fillStyle = 'rgba(10,14,8,.72)';
    ctx.fillRect(ax - w / 2 - 7, ay + 16, w + 14, 18);
    ctx.fillStyle = '#e8c14a';
    ctx.fillText(txt, ax, ay + 29);
    ctx.restore();
  }

  /* ---------------------------------------------------------- */
  function minikarte(spiel) {
    var g = spiel.gespann;
    var G = W.GROESSE;
    var s = mk.width / G;

    mctx.clearRect(0, 0, mk.width, mk.height);
    mctx.fillStyle = '#3d5230';
    mctx.fillRect(0, 0, mk.width, mk.height);

    mctx.lineCap = 'round'; mctx.lineJoin = 'round';
    for (var i = 0; i < W.wege.length; i++) {
      var weg = W.wege[i];
      mctx.strokeStyle = weg.typ === 'strasse' ? '#8d8d84' : '#7a6544';
      mctx.lineWidth = weg.typ === 'strasse' ? 2 : 1.1;
      mctx.beginPath();
      mctx.moveTo(weg.p[0][0] * s, weg.p[0][1] * s);
      for (var k = 1; k < weg.p.length; k++) mctx.lineTo(weg.p[k][0] * s, weg.p[k][1] * s);
      mctx.stroke();
    }

    var ziel = spiel.zielOrt();
    for (var o = 0; o < W.orte.length; o++) {
      var ort = W.orte[o];
      var istZiel = ziel && ziel.id === ort.id;
      mctx.fillStyle = istZiel ? '#e8c14a' : (ort.istHof ? '#9ede63' : '#cfd6c2');
      mctx.beginPath();
      mctx.arc(ort.x * s, ort.y * s, istZiel ? 5 : 3, 0, Math.PI * 2);
      mctx.fill();
      if (istZiel) {
        mctx.strokeStyle = '#e8c14a'; mctx.lineWidth = 1.2;
        mctx.beginPath(); mctx.arc(ort.x * s, ort.y * s, 9, 0, Math.PI * 2); mctx.stroke();
      }
    }

    // Spieler
    mctx.save();
    mctx.translate(g.x * s, g.y * s);
    mctx.rotate(g.h);
    mctx.fillStyle = '#ff6b4a';
    mctx.beginPath();
    mctx.moveTo(6, 0); mctx.lineTo(-4, 4); mctx.lineTo(-4, -4);
    mctx.closePath(); mctx.fill();
    mctx.restore();
  }

  return {
    start: start, bild: bild, minikarte: minikarte, zoom: zoom,
    kamera: kamera, welt2schirm: welt2schirm
  };
})();
