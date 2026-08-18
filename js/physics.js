/* Landfracht — Fahrverhalten von Traktor und Anhaenger
 *
 * Der Traktor folgt einem Einspurmodell: die Hinterachse ist der
 * Bezugspunkt, die Vorderraeder lenken. Der Anhaenger haengt an einer
 * Kupplung hinter der Hinterachse und dreht sich nach, dadurch knickt
 * er beim Lenken ein und laesst sich rueckwaerts nur mit Gefuehl fuehren.
 */
var TG = window.TG || (window.TG = {});

TG.Gespann = (function () {
  var U = TG.util;

  var LENK_MAX = 0.52;        // rad, knapp 30 Grad Einschlag
  var LENK_RATE = 2.6;        // rad/s beim Einschlagen
  var LENK_RUECK = 3.4;       // rad/s beim Zurueckstellen
  var KNICK_MAX = 1.48;       // rad, ab hier ist der Anhaenger quer
  var KUPPLUNG = 1.15;        // m hinter der Hinterachse

  function Gespann() {
    this.x = 0; this.y = 0;
    this.h = 0;               // Blickrichtung Traktor
    this.v = 0;               // m/s, negativ = rueckwaerts
    this.lenk = 0;
    this.th = 0;              // Blickrichtung Anhaenger
    this.knickWarnung = false;
    this.querBeschl = 0;      // m/s^2 seitlich, fuer Ladungsschaden
    this.stoss = 0;           // Anzeige nach einer Kollision
  }

  Gespann.prototype.setzen = function (x, y, h) {
    this.x = x; this.y = y; this.h = h; this.th = h;
    this.v = 0; this.lenk = 0;
  };

  /** Kupplungspunkt in Weltkoordinaten */
  Gespann.prototype.kupplung = function () {
    return { x: this.x - Math.cos(this.h) * KUPPLUNG, y: this.y - Math.sin(this.h) * KUPPLUNG };
  };

  /** Position der Anhaengerachse */
  Gespann.prototype.anhaengerAchse = function (b) {
    var k = this.kupplung();
    return { x: k.x - Math.cos(this.th) * b, y: k.y - Math.sin(this.th) * b };
  };

  Gespann.prototype.knickwinkel = function () { return U.winkel(this.h - this.th); };

  /**
   * Ein Simulationsschritt.
   * eingabe : {gas, bremse, links, rechts, handbremse}
   * technik : {ps, achsstand, vmaxKmh, masseGesamt, masseTraktor, zustand,
   *            anhaengerB, halt, untergrund}
   */
  Gespann.prototype.schritt = function (dt, eingabe, technik) {
    var u = TG.welt.untergruende[technik.untergrund] || TG.welt.untergruende.gelaende;

    // ---- Lenkung -------------------------------------------------
    // Bei hohem Tempo wird der Einschlag begrenzt. Sonst wirft es das
    // Gespann bei jeder Antippbewegung aus der Spur, und der Anhänger
    // knickt schon in einer gewöhnlichen Straßenkurve ein. Im Schritttempo
    // bleibt der volle Einschlag zum Rangieren erhalten.
    var tempo = Math.abs(this.v);
    var maxEin = LENK_MAX * (0.30 + 0.70 / (1 + tempo / 6.0));
    var ziel = 0;
    if (eingabe.links) ziel -= maxEin;
    if (eingabe.rechts) ziel += maxEin;

    var rate = (ziel === 0 ? LENK_RUECK : LENK_RATE) * (technik.halt || 1);
    if (this.lenk < ziel) this.lenk = Math.min(ziel, this.lenk + rate * dt);
    else if (this.lenk > ziel) this.lenk = Math.max(ziel, this.lenk - rate * dt);
    this.lenk = U.clamp(this.lenk, -maxEin, maxEin);

    // ---- Antrieb -------------------------------------------------
    var zust = U.clamp(technik.zustand, 0, 100) / 100;
    var zustFaktor = 0.55 + 0.45 * zust;

    // Verschleiss und Ladung kosten Spitze, aber sparsam. Beide Faktoren
    // multiplizieren sich, und frueher waren es 30 % plus 26 %: der Hoftraktor
    // kam mit voller Mulde auf 19 km/h. Die Auftragsfenster rechnen mit
    // 24 km/h (jobs.fahrzeit), damit war jede volle Fahrt von vornherein
    // knapp. Die Last soll sich in der Beschleunigung zeigen, nicht in der
    // Endgeschwindigkeit.
    var vmax = (technik.vmaxKmh / 3.6) * u.speed * (0.86 + 0.14 * zust);
    var ladungsAnteil = technik.ladungsAnteil || 0;
    vmax *= (0.93 + 0.07 * (1 - ladungsAnteil));
    var vmaxRueck = Math.min(vmax, 13 / 3.6);

    // Beschleunigung aus Leistung je Tonne. Der Anhaenger zaehlt nur zum Teil
    // mit: rein linear gerechnet kroch das schwer beladene Gespann mit knapp
    // 0,4 m/s^2 an, das sind ueber 20 s bis zur Reisegeschwindigkeit. Der
    // Getriebeuebersetzung entspricht das ohnehin nicht.
    var masseAnh = Math.max(0, technik.masseGesamt - technik.masseTraktor);
    var zugMasse = technik.masseTraktor + masseAnh * 0.55;
    var aAntrieb = (technik.ps * 0.15 * zustFaktor) / Math.max(1, zugMasse);
    aAntrieb *= u.halt;

    // Bremsen: der Traktor bremst, der Anhaenger schiebt
    var anteilTraktor = technik.masseTraktor / Math.max(0.1, technik.masseGesamt);
    var aBremse = 4.2 * u.halt * (0.5 + 0.5 * anteilTraktor) * (0.7 + 0.3 * zust);

    // Rollwiderstand
    var aRoll = (0.42 + 0.0038 * tempo * tempo) * u.roll;

    var a = 0;
    if (eingabe.handbremse) {
      a = -Math.sign(this.v) * (aBremse * 1.25 + aRoll);
    } else if (eingabe.gas && !eingabe.bremse) {
      if (this.v < -0.2) a = aBremse;                 // erst ausrollen
      else a = aAntrieb * (this.v < vmax ? 1 : 0);
    } else if (eingabe.bremse && !eingabe.gas) {
      if (this.v > 0.2) a = -aBremse;                 // bremsen
      else a = -aAntrieb * 0.62 * (this.v > -vmaxRueck ? 1 : 0);   // dann rueckwaerts
    } else if (eingabe.gas && eingabe.bremse) {
      a = -Math.sign(this.v) * aBremse;
    } else {
      a = -Math.sign(this.v) * aRoll;
    }

    var vAlt = this.v;
    this.v += a * dt;
    // Ausrollen darf nicht ueber Null hinausschiessen
    if (!eingabe.gas && !eingabe.bremse && Math.sign(this.v) !== Math.sign(vAlt)) this.v = 0;
    if (eingabe.handbremse && Math.sign(this.v) !== Math.sign(vAlt)) this.v = 0;
    this.v = U.clamp(this.v, -vmaxRueck, vmax);
    // Nur beim Ausrollen ganz auf null runden. Waehrend Gas oder Bremse
    // anliegen, waere das ein Anfahrverbot: der Zuwachs je Bild ist kleiner
    // als die Totzone, das Gespann kaeme nie in Bewegung.
    var antrieb = (eingabe.gas || eingabe.bremse) && !eingabe.handbremse;
    if (!antrieb && Math.abs(this.v) < 0.02) this.v = 0;

    // ---- Kinematik Traktor --------------------------------------
    var omega = (this.v / technik.achsstand) * Math.tan(this.lenk);
    // Bei wenig Grip rutscht die Front, die Drehrate faellt ab
    omega *= U.clamp(0.55 + 0.45 * u.halt, 0.4, 1);

    var altX = this.x, altY = this.y, altH = this.h, altTh = this.th;

    this.h = U.winkel(this.h + omega * dt);
    this.x += Math.cos(this.h) * this.v * dt;
    this.y += Math.sin(this.h) * this.v * dt;

    this.querBeschl = Math.abs(omega * this.v);

    // ---- Kinematik Anhaenger ------------------------------------
    var b = technik.anhaengerB;
    if (b > 0) {
      var d = U.winkel(this.h - this.th);
      var dth = (this.v * Math.sin(d) - KUPPLUNG * omega * Math.cos(d)) / b;
      this.th = U.winkel(this.th + dth * dt);

      var knick = U.winkel(this.h - this.th);
      this.knickWarnung = Math.abs(knick) > KNICK_MAX * 0.72;
      if (Math.abs(knick) > KNICK_MAX) {
        // Der Anhaenger steht an. Weiter geht es nur vorwaerts.
        this.th = U.winkel(this.h - Math.sign(knick) * KNICK_MAX);
        if (this.v < 0) this.v *= 0.35;
      }
      this.querBeschl = Math.max(this.querBeschl, Math.abs(dth * this.v));
    } else {
      this.th = this.h;
      this.knickWarnung = false;
    }

    // ---- Kartenrand und Gebaeude --------------------------------
    var rand = 20, g = TG.welt.GROESSE;
    if (this.x < rand || this.x > g - rand || this.y < rand || this.y > g - rand) {
      this.x = U.clamp(this.x, rand, g - rand);
      this.y = U.clamp(this.y, rand, g - rand);
      this.v *= -0.15;
    }

    var vorne = { x: this.x + Math.cos(this.h) * 2.4, y: this.y + Math.sin(this.h) * 2.4 };
    var achse = b > 0 ? this.anhaengerAchse(b) : null;
    var treffer = TG.welt.imGebaeude(vorne.x, vorne.y, 1.0) ||
                  TG.welt.imGebaeude(this.x, this.y, 1.0) ||
                  (achse && TG.welt.imGebaeude(achse.x, achse.y, 1.0));
    if (treffer) {
      this.x = altX; this.y = altY; this.h = altH; this.th = altTh;
      this.stoss = Math.abs(this.v);
      this.v *= -0.18;
    } else {
      this.stoss = 0;
    }

    return { untergrund: technik.untergrund, tempo: Math.abs(this.v) };
  };

  Gespann.KUPPLUNG = KUPPLUNG;
  Gespann.KNICK_MAX = KNICK_MAX;
  return Gespann;
})();
