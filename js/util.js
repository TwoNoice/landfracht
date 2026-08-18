/* Landfracht — kleine Helfer */
var TG = window.TG || (window.TG = {});

TG.util = (function () {

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function zufall(a, b) { return a + Math.random() * (b - a); }
  function zufallGanz(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function waehle(liste) { return liste[Math.floor(Math.random() * liste.length)]; }

  /** mischt eine Kopie der Liste */
  function mischen(liste) {
    var l = liste.slice();
    for (var i = l.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = l[i]; l[i] = l[j]; l[j] = t;
    }
    return l;
  }

  /** Winkel auf -PI..PI bringen */
  function winkel(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function abstand(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** kuerzester Abstand eines Punktes zu einer Strecke */
  function abstandStrecke(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var l2 = dx * dx + dy * dy;
    if (l2 === 0) return abstand(px, py, x1, y1);
    var t = clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
    return abstand(px, py, x1 + t * dx, y1 + t * dy);
  }

  /** Punkt in gedrehtem Rechteck (Mittelpunkt x,y, Groesse w,h, Drehung rot) */
  function inRechteck(px, py, r) {
    var c = Math.cos(-r.rot || 0), s = Math.sin(-r.rot || 0);
    var dx = px - r.x, dy = py - r.y;
    var lx = dx * c - dy * s, ly = dx * s + dy * c;
    return Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.h / 2;
  }

  // ---- Formatierung ----

  function geld(n) {
    var v = Math.round(n);
    return v.toLocaleString('de-DE') + ' €';
  }

  function zahl(n, stellen) {
    return Number(n).toLocaleString('de-DE', {
      minimumFractionDigits: stellen || 0,
      maximumFractionDigits: stellen === undefined ? 0 : stellen
    });
  }

  /** Spielminuten seit Spielbeginn -> "07:35" */
  function uhrzeit(minuten) {
    var m = Math.floor(minuten) % 1440;
    var h = Math.floor(m / 60), mm = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }

  /** Dauer in Spielminuten -> "2 Std 15 Min" bzw. "45 Min" */
  function dauer(minuten) {
    var m = Math.max(0, Math.round(minuten));
    if (m < 60) return m + ' Min';
    var h = Math.floor(m / 60);
    var r = m % 60;
    return h + ' Std' + (r ? ' ' + r + ' Min' : '');
  }

  function strecke(meter) {
    if (meter < 950) return Math.round(meter) + ' m';
    return zahl(meter / 1000, 1) + ' km';
  }

  function html(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  return {
    clamp: clamp, lerp: lerp, zufall: zufall, zufallGanz: zufallGanz,
    waehle: waehle, mischen: mischen, winkel: winkel,
    abstand: abstand, abstandStrecke: abstandStrecke, inRechteck: inRechteck,
    geld: geld, zahl: zahl, uhrzeit: uhrzeit, dauer: dauer, strecke: strecke, html: html
  };
})();
