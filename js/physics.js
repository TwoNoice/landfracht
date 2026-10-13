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
   * eingabe : {gas, bremse, links, rechts, handbremse, lenkZiel}
   *           lenkZiel ist der stufenlose Sollwert der Maussteuerung
   *           (-1 ganz links .. 1 ganz rechts) und ersetzt links/rechts.
   * technik : {ps, achsstand, vmaxKmh, masseGesamt, masseTraktor, zustand,
   *            anhaengerB, halt, untergrund, griff}
   *            griff ist der Wetterfaktor auf den Halt des Untergrunds.
   */
  Gespann.prototype.schritt = function (dt, eingabe, technik) {
    var u = TG.welt.untergruende[technik.untergrund] || TG.welt.untergruende.gelaende;
    // Halt des Untergrunds, gemindert durch Naesse und Schnee (umwelt.js).
    var halt = u.halt * (technik.griff || 1);

    // ---- Lenkung -------------------------------------------------
    // Bei hohem Tempo wird der Einschlag begrenzt. Sonst wirft es das
    // Gespann bei jeder Antippbewegung aus der Spur, und der Anhänger
    // knickt schon in einer gewöhnlichen Straßenkurve ein. Im Schritttempo
    // bleibt der volle Einschlag zum Rangieren erhalten.
    //
    // Die Kurve gehoert zum Tempo, nicht zur Karte: bei gleicher Geschwindigkeit
    // liefert sie denselben Einschlag wie vor der Stauchung. Weil die Spitzen
    // gefallen sind (67 statt 90 km/h), bleibt am oberen Ende jetzt knapp ein
    // Drittel von LENK_MAX statt gut einem Viertel -- auf der engeren Karte mit
    // ihren dichteren Kurven ist das gewollt. Voller Einschlag im Schritttempo
    // bleibt unberuehrt. Wer die Spitzen wieder anhebt, muss sie versteilern.
    var tempo = Math.abs(this.v);
    var maxEin = LENK_MAX * (0.16 + 0.84 / (1 + tempo / 4.2));

    // Maussteuerung liefert einen stufenlosen Sollwert -1 .. 1, die Tastatur
    // nur ganz links oder ganz rechts. Beides landet in derselben Groesse.
    var ziel = 0;
    if (typeof eingabe.lenkZiel === 'number') {
      ziel = maxEin * U.clamp(eingabe.lenkZiel, -1, 1);
    } else {
      if (eingabe.links) ziel -= maxEin;
      if (eingabe.rechts) ziel += maxEin;
    }

    var rate = (Math.abs(ziel) < 0.004 ? LENK_RUECK : LENK_RATE) * (technik.halt || 1);
    if (this.lenk < ziel) this.lenk = Math.min(ziel, this.lenk + rate * dt);
    else if (this.lenk > ziel) this.lenk = Math.max(ziel, this.lenk - rate * dt);
    this.lenk = U.clamp(this.lenk, -maxEin, maxEin);

    // ---- Antrieb -------------------------------------------------
    var zust = U.clamp(technik.zustand, 0, 100) / 100;
    var zustFaktor = 0.55 + 0.45 * zust;

    // Verschleiss und Ladung kosten Spitze, aber nur noch wenig. Beide
    // Faktoren multiplizieren sich, deshalb ist der schlimmste Fall --
    // durchgefahrener Traktor mit vollem Anhaenger -- 0,92 * 0,95 = 0,874.
    // Der Starttraktor (40 km/h) laeuft dann noch 35 km/h. Auf der gestauchten
    // Karte ist das kein Problem mehr: die typische Fuhre misst gut 400 m und
    // dauert damit unter einer Minute. Die Last soll sich in der Beschleunigung
    // zeigen, nicht in der Endgeschwindigkeit.
    var vmax = (technik.vmaxKmh / 3.6) * u.speed * (0.92 + 0.08 * zust);
    var ladungsAnteil = technik.ladungsAnteil || 0;
    vmax *= (0.95 + 0.05 * (1 - ladungsAnteil));
    // Rueckwaerts bleibt Rangiertempo, unabhaengig von der Spitze.
    var vmaxRueck = Math.min(vmax, 14 / 3.6);

    // Beschleunigung aus Leistung je Tonne. Der Anhaenger zaehlt nur zum Teil
    // mit: rein linear gerechnet kroch das schwer beladene Gespann mit knapp
    // 0,4 m/s^2 an, das sind ueber 20 s bis zur Reisegeschwindigkeit. Der
    // Getriebeuebersetzung entspricht das ohnehin nicht.
    //
    // 0,20 je PS bleibt, obwohl die Spitzen gefallen sind: auf der engeren
    // Karte sind die Geraden kurz, und ein zaeh anfahrendes Gespann kaeme dort
    // gar nicht mehr auf Tempo. Der Hoftraktor mit voller Mulde braucht damit
    // nachgemessen achteinhalb Sekunden auf seine 37 km/h, leer viereinhalb.
    // Das ist der Grund, warum er ueber das ganze Netz nur 28 km/h schafft,
    // obwohl er 38 koennte -- PLANTEMPO in jobs.js rechnet mit dem Schnitt,
    // nicht mit der Spitze.
    var masseAnh = Math.max(0, technik.masseGesamt - technik.masseTraktor);
    var zugMasse = technik.masseTraktor + masseAnh * 0.55;
    var aAntrieb = (technik.ps * 0.20 * zustFaktor) / Math.max(1, zugMasse);
    aAntrieb *= halt;

    // Bremsen: der Traktor bremst, der Anhaenger schiebt. Etwas kraeftiger als
    // frueher (4,2), sonst wird der Bremsweg aus Reisegeschwindigkeit laenger,
    // als die Vorausschau der Kamera reicht.
    var anteilTraktor = technik.masseTraktor / Math.max(0.1, technik.masseGesamt);
    var aBremse = 5.0 * halt * (0.5 + 0.5 * anteilTraktor) * (0.7 + 0.3 * zust);

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
    omega *= U.clamp(0.55 + 0.45 * halt, 0.4, 1);

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
    // Der Zaun gehoert zur Karte, nicht zum Gespann: auf der alten, viermal
    // weiteren Karte waren 20 m ein Bankett, hier waeren sie fast drei Prozent
    // der Kartenbreite -- und die beiden Hauptachsen laufen bis an den Rand,
    // waeren auf ihren letzten Metern also gesperrt. Acht Meter sind eine
    // Gespannlaenge und tun dasselbe.
    var rand = 8, g = TG.welt.GROESSE;
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
