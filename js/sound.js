/* Landfracht — Ton: Motor, Umgebung und kurze Signale
 *
 * Alles wird zur Laufzeit erzeugt (Web Audio). Es gibt bewusst keine
 * Klangdateien: das Spiel soll aus dem Dateisystem laufen, und ein Ladevorgang
 * auf eine Datei waere unter file:// je nach Browser blockiert.
 *
 * Vorbild ist ein aufgeladener Sechszylinder-Reihendiesel mit knapp sieben
 * Litern, wie er in den grossen Schleppern der Neunziger sass: Leerlauf um
 * 750/min, Nenndrehzahl 2100/min. Nachgebaut sind nur die Kennzahlen, es
 * steckt keine fremde Aufnahme im Spiel. Sechs Zylinder im Viertakt zuenden
 * dreimal je Umdrehung, die Zuendfrequenz ist also Drehzahl/20 -- 38 Hz im
 * Leerlauf bis 108 Hz.
 *
 * Der Motor ist als Anregung und Koerper gebaut, nicht als Klang:
 *
 *   Anregung  eine Folge von Schlaegen. Je Zuendung ein Druckberg, dazwischen
 *             das Nageln des Ventiltriebs. Im Puffer vorberechnet.
 *   Koerper   parallele Resonanzen, die nach jedem Schlag ausklingen -- Block,
 *             Auspuffsaeule, Blech, Nageln.
 *
 * Das ist der Unterschied zu einer Oberwellenreihe, und es ist der Grund,
 * warum hier kaum noch Bass sitzt: das Ohr hoert die Drehzahl an der
 * Wiederholrate der Schlaege, nicht an der Energie bei 38 Hz. Unterhalb von
 * 150 Hz liegt darum fast nichts, und es klingt trotzdem nach einem langsam
 * laufenden Diesel. Mit einer Oberwellenreihe ging das nicht: dort musste der
 * Grundton da sein, damit die Drehzahl stimmt -- und der Grundton war genau
 * das Wummern, das weg sollte.
 *
 * Die Drehzahl folgt einem gedachten Getriebe mit vier Gaengen, damit das
 * Tempo hoerbar bleibt und der Ton nicht ueber die ganze Fahrt monoton
 * hochlaeuft.
 */
var TG = window.TG || (window.TG = {});

TG.ton = (function () {
  var U = TG.util;

  // Eigener Speicherplatz. Der Spielstand bleibt unberuehrt, sonst muesste
  // fuer eine Lautstaerke die Version hochgezaehlt und der Stand verworfen
  // werden (siehe game.laden).
  var SCHLUESSEL = 'landfracht_ton';

  /* =============================================================
   *  Klangbalance
   *  An einer Stelle gesammelt, damit sie zu finden ist -- wie BAL in
   *  game.js. werkzeug/klang.html schraubt live an diesen Werten.
   * ============================================================= */
  var KLANG = {
    ZYLINDER: 6,
    // 360 Zuendungen sind sechs Sekunden Schleife bei 60 Hz. Die alte Schleife
    // hatte 72, also 1,2 s -- kurz genug, dass das Ohr das Muster nach einer
    // Minute kennt und nicht mehr loslaesst. Das war die halbe Eintoenigkeit.
    ZUENDUNGEN: 360,
    BASIS_HZ: 60,          // Zuendfrequenz, auf die der Puffer gerechnet ist

    // Etwas laenger und weicher ausklingend als vorher (0,22, Abfall 4,2):
    // ein Pochen statt eines Knalls. Ganz rund (0,34 / 0,78) war zu weich --
    // dann steckt im Schlag selbst nichts mehr oberhalb von 1 kHz, und kein
    // Filter dahinter kann den Klang unter Last noch oeffnen. Gemessen lag
    // der Schwerpunkt damit bei 190 Hz: kein Stechen mehr, dafuer Droehnen.
    BRENN_ANTEIL: 0.26,
    BERG: 0.45,
    NAGELN: 0.16,          // Ventiltrieb: halb so stark wie vorher

    // Eigenheiten je Zylinder, als Anteil des Zuendabstands und der Kraft.
    // Zu eng klingt nach Metronom, zu weit laesst die Autokorrelation auf die
    // Kurbelwellenumdrehung einrasten statt auf den Zuendtakt -- der Motor
    // wirkt dann langsamer, als er dreht. Gemessen sind 1,1 % und 7 % der
    // brauchbare Bereich.
    STREU_ZEIT: 0.011,
    STREU_KRAFT: 0.05,
    // Dazu jede einzelne Verbrennung ein wenig anders stark, ohne festes
    // Muster -- wie beim echten Motor von Arbeitsspiel zu Arbeitsspiel. Weil
    // sie sich nicht wiederholt, rastet die Tonhoehe darauf nicht ein; sie
    // macht den Lauf nur lebendig.
    STREU_ZYKLUS: 0.14,

    // Resonanzen des Motorkoerpers: [Frequenz, Guete, Pegel, Gruppe].
    // Die Frequenzen bleiben fest, waehrend die Drehzahl steigt -- beim echten
    // Motor ist es genauso: der Block klingt immer gleich, nur die Anregung
    // wird schneller. Deshalb steht der Koerper hier auch ausserhalb des
    // Puffers und nicht darin.
    //
    // Die Gueten sind gegenueber vorher halbiert. Schmale Resonanzen klingen
    // nach jedem Schlag lange nach und legen einen festen Ton unter den Motor,
    // der sich bei keiner Drehzahl aendert -- genau das Dauerbrummen, das
    // anstrengt. Breit gedaempft bleibt vom Koerper nur die Farbe.
    MODEN: [
      [150, 2.6, 0.25, 'groll'],     // der Block selbst
      [240, 3.2, 0.80, 'groll'],     // Auspuffsaeule
      [400, 3.6, 0.90, 'groll'],     // Blech
      [700, 3.2, 0.60, 'groll'],
      [1300, 2.6, 0.45, 'klapper'],  // hier sitzt das Nageln
      [2400, 2.2, 0.16, 'klapper'],
      [3900, 2.0, 0.035, 'klapper']
    ],

    HOCHPASS: 150,         // was darunter liegt, ist Wummern

    // Ein Tiefpass ueber dem ganzen Motor, der mit der Last aufgeht: im
    // Leerlauf und beim Rollen dumpf, unter Vollgas offen. Ein Motor, der
    // immer gleich hell klingt, klingt immer gleich -- die Helligkeit ist
    // das, woran man Last hoert, lange bevor sich die Drehzahl aendert.
    TIEFPASS_ZU: 1300,
    TIEFPASS_AUF: 3600,

    // Gesamtpegel. Der Wert allein sagt wenig: 0,55 war vorher zu laut und
    // ist es jetzt nicht mehr, weil der Pegel nun mit der Last geht (siehe
    // setzen) und die stechenden Anteile fehlen. A-bewertet gemessen gegen
    // die alte Fassung: Leerlauf rund 10 dB leiser, Vollgas rund 4 dB --
    // zwischen beiden liegen jetzt 11 dB statt 4, und genau dieser Abstand
    // ist es, der den Motor nicht mehr eintoenig klingen laesst.
    MEISTER: 0.55,

    // Ab hier nur wirksam, wenn eine echte Aufnahme eingebettet ist, also
    // js/klang_motor.js vorhanden ist. Siehe werkzeug/klang_einbetten.py.
    PROBEN_PEGEL: 0.5,
    PROBEN_HOCHPASS: 60,   // eine Aufnahme bringt ihre Balance schon mit
    // Der Lader steckt bei einer echten Aufnahme bereits darin, dann gehoert
    // dieser Wert weit herunter -- sonst pfeift es doppelt.
    LADER: 1.0
  };

  var ctx = null;
  var n = null;              // dauerhafte Knoten
  var aktiv = true;          // Ton eingeschaltet?
  var laut = 0.7;            // 0 .. 1
  var motorLaut = 0.6;       // 0 .. 1, nur Motor, Lader und Getriebe
  var wach = false;          // Browser erlauben Audio erst nach einer Eingabe

  var zeit = 0;              // Sekunden Laufzeit, treibt die langsamen Schwebungen
  var dreh = 0.14;           // geglaettete Drehzahl 0 .. 1
  var ladedruck = 0;         // Lader 0 .. 1, laeuft der Drehzahl hinterher
  var last = 0;              // getretenes Gas 0 .. 1, geglaettet
  var gangVorher = 0;
  var schaltPause = 0;       // Sekunden, die der Schaltvorgang noch dauert
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
      if (typeof d.motor === 'number') motorLaut = U.clamp(d.motor, 0, 1);
    } catch (e) { /* ohne gespeicherte Einstellung ist der Vorgabewert richtig */ }
  }

  function einstellungenSchreiben() {
    try {
      window.localStorage.setItem(SCHLUESSEL, JSON.stringify({ an: aktiv, laut: laut, motor: motorLaut }));
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

  /** Sanft auf einen Wert ziehen; harte Spruenge knacken hoerbar. */
  function setz(param, wert, traeg) {
    param.setTargetAtTime(wert, ctx.currentTime, traeg || 0.07);
  }

  /* =============================================================
   *  Die Anregung
   * ============================================================= */
  /**
   * Eine Schleife aus ZUENDUNGEN Verbrennungsschlaegen, auf BASIS_HZ gerechnet.
   *
   * Der Puffer enthaelt bewusst nur die Anregung und keine einzige Resonanz.
   * Damit skaliert alles darin linear mit der Zuendfrequenz -- die Brenndauer
   * ist als Anteil des Zuendabstands definiert, das Nageln ebenso. Schneller
   * abspielen ist deshalb nicht blosses Verstimmen, sondern genau die richtige
   * Anregung fuer die hoehere Drehzahl. Nur darum kommt der ganze
   * Drehzahlbereich mit einem einzigen Puffer aus.
   */
  function anregungsPuffer() {
    var SR = ctx.sampleRate;
    var laenge = Math.round(SR * KLANG.ZUENDUNGEN / KLANG.BASIS_HZ);
    var puffer = ctx.createBuffer(1, laenge, SR);
    var d = puffer.getChannelData(0);
    var abstand = laenge / KLANG.ZUENDUNGEN;   // Samples zwischen zwei Zuendungen
    var i, j, k;

    // Geglaettetes Rauschen. Weiss waere hier gefaehrlich: der Puffer wird beim
    // Hochdrehen bis zu 1,8-fach schneller gelesen, und alles oberhalb der
    // halben Abtastrate geteilt durch 1,8 kaeme als Zirpen zurueck.
    var rZustand = 0;
    function rauh() {
      rZustand = rZustand * 0.42 + (Math.random() * 2 - 1) * 0.58;
      return rZustand;
    }

    // Jeder Zylinder bekommt eine feste Eigenheit in Zeitpunkt und Staerke.
    // Ohne sie klingt der Motor wie ein Metronom. Diese kleine
    // Unregelmaessigkeit ist der Unterschied zwischen Maschine und Taktgeber.
    var versatz = [], staerke = [];
    for (k = 0; k < KLANG.ZYLINDER; k++) {
      versatz.push((Math.random() * 2 - 1) * KLANG.STREU_ZEIT);
      staerke.push(1 - KLANG.STREU_KRAFT + Math.random() * 2 * KLANG.STREU_KRAFT);
    }

    // Verbrennung: ein Druckberg mit rauher Flanke, vorne steil, hinten
    // ausklingend. Der Berg gibt den Schlag, die Rauheit den Knall.
    var brennLaenge = Math.round(abstand * KLANG.BRENN_ANTEIL);
    for (k = 0; k < KLANG.ZUENDUNGEN; k++) {
      var zyl = k % KLANG.ZYLINDER;
      var start = Math.round(k * abstand + versatz[zyl] * abstand);
      var zyklus = 1 + (Math.random() * 2 - 1) * KLANG.STREU_ZYKLUS;
      for (j = 0; j < brennLaenge; j++) {
        var t = j / brennLaenge;
        var wert = Math.exp(-3.2 * t) *
                   (KLANG.BERG * Math.sin(Math.PI * t) + (1 - KLANG.BERG) * rauh());
        d[(start + j + laenge) % laenge] += wert * staerke[zyl] * zyklus;
      }
    }

    // Ventiltrieb: zwischen den Zuendungen, kuerzer und heller. Das ist das
    // Nageln, an dem man einen Diesel erkennt, noch bevor man die Drehzahl
    // heraushoert.
    var tickLaenge = Math.max(3, Math.round(abstand * 0.055));
    for (k = 0; k < KLANG.ZUENDUNGEN * 2; k++) {
      var tp = Math.round(k * abstand / 2 + abstand * 0.34);
      var ts = KLANG.NAGELN * (0.7 + Math.random() * 0.6);
      for (j = 0; j < tickLaenge; j++) {
        d[(tp + j) % laenge] += ts * Math.exp(-5.5 * j / tickLaenge) * rauh();
      }
    }

    // Gleichanteil raus: alle Druckberge zeigen nach oben, ohne das hier haette
    // der Puffer einen Versatz und traege nur Wummern bei.
    var mittel = 0;
    for (i = 0; i < laenge; i++) mittel += d[i];
    mittel /= laenge;
    for (i = 0; i < laenge; i++) d[i] -= mittel;

    // Sicherheitsnetz gegen dasselbe Umklappen wie oben. Der Anlaufwert kommt
    // vom Ende des Puffers, sonst knackt die Schleifennaht.
    var a = Math.exp(-2 * Math.PI * 11000 / SR);
    for (var lauf = 0; lauf < 2; lauf++) {
      var letzt = d[laenge - 1];
      for (i = 0; i < laenge; i++) { letzt = letzt * a + d[i] * (1 - a); d[i] = letzt; }
    }

    // Auf Vollausschlag ziehen, damit die Pegel weiter unten nicht von der
    // Abtastrate des Geraets abhaengen.
    var spitze = 0;
    for (i = 0; i < laenge; i++) spitze = Math.max(spitze, Math.abs(d[i]));
    if (spitze > 0) for (i = 0; i < laenge; i++) d[i] /= spitze;

    return puffer;
  }

  /* =============================================================
   *  Motor, zwei Bauarten
   *
   *  Beide liefern dasselbe nach aussen: setzen(umin, dreh, ladedruck, aus).
   *  Die Drehzahl in Umdrehungen je Minute ist die gemeinsame Waehrung -- die
   *  Synthese rechnet daraus ihre Zuendfrequenz, die Aufnahmen ihr Tempo.
   * ============================================================= */

  /** Die gerechnete Bauart: Schlagfolge durch feste Resonanzen. */
  function motorSynthetisch(summe) {
    var quelle = ctx.createBufferSource();
    quelle.buffer = anregungsPuffer();
    quelle.loop = true;
    var hoch = filter('highpass', KLANG.HOCHPASS, 0.7);
    quelle.connect(hoch);
    quelle.start();

    var grollGain = verstaerker(0), klapperGain = verstaerker(0), motorGain = verstaerker(0);
    var tief = filter('lowpass', KLANG.TIEFPASS_ZU, 0.6);
    grollGain.connect(tief);
    klapperGain.connect(tief);
    tief.connect(motorGain);
    motorGain.connect(summe);

    var moden = [];
    KLANG.MODEN.forEach(function (m) {
      var bp = filter('bandpass', m[0], m[1]);
      var g = verstaerker(m[2]);
      hoch.connect(bp); bp.connect(g);
      g.connect(m[3] === 'klapper' ? klapperGain : grollGain);
      moden.push({ bp: bp, g: g });
    });

    return {
      art: 'synthese', moden: moden, hoch: hoch,
      /* last 0 .. 1: wie weit das Gas gerade getreten ist, geglaettet. Die
       * Aufnahmen kennen sie nicht und lassen sie weg. */
      setzen: function (umin, dreh, ladedruck, motorAus, last) {
        last = last || 0;
        setz(quelle.playbackRate, (umin / 20) / KLANG.BASIS_HZ, 0.06);
        setz(motorGain.gain, motorAus ? 0
             : KLANG.MEISTER * (0.42 + 0.30 * Math.min(dreh, 1) + 0.38 * last), 0.1);
        setz(grollGain.gain, motorAus ? 0 : 0.7 + 0.35 * dreh + 0.25 * ladedruck, 0.1);
        setz(klapperGain.gain, motorAus ? 0 : 0.6 + 0.5 * last, 0.1);
        setz(tief.frequency, KLANG.TIEFPASS_ZU +
             (KLANG.TIEFPASS_AUF - KLANG.TIEFPASS_ZU) * U.clamp(0.25 * dreh + 0.75 * last, 0, 1), 0.12);
      }
    };
  }

  /** base64 in einen AudioBuffer, ueber den Rueckruf statt ueber ein
   *  Versprechen -- aeltere Browser koennen nur das eine. */
  function entpacken(b64, fertig, schief) {
    try {
      var roh = window.atob(b64);
      var feld = new Uint8Array(roh.length);
      for (var i = 0; i < roh.length; i++) feld[i] = roh.charCodeAt(i);
      ctx.decodeAudioData(feld.buffer, fertig, schief);
    } catch (e) { schief(e); }
  }

  /** Gewichte fuer die Ueberblendung zwischen den Proben, Summe 1. */
  function anteile(stimmen, umin) {
    var g = [], i;
    for (i = 0; i < stimmen.length; i++) g.push(0);
    if (stimmen.length === 1) { g[0] = 1; return g; }
    if (umin <= stimmen[0].umin) { g[0] = 1; return g; }
    if (umin >= stimmen[stimmen.length - 1].umin) { g[g.length - 1] = 1; return g; }
    for (i = 0; i < stimmen.length - 1; i++) {
      var u = stimmen[i].umin, o = stimmen[i + 1].umin;
      if (umin >= u && umin <= o) {
        // Ueber der Tonhoehe gerechnet, nicht ueber der Drehzahl: das Gehoer
        // hoert Verhaeltnisse, nicht Differenzen.
        var t = Math.log(umin / u) / Math.log(o / u);
        g[i] = 1 - t; g[i + 1] = t;
        return g;
      }
    }
    return g;
  }

  /**
   * Die Bauart aus echten Aufnahmen. Wird nur gewaehlt, wenn js/klang_motor.js
   * geladen wurde und TG.klangMotor setzt; werkzeug/klang_einbetten.py legt
   * beides an.
   *
   * Die Aufnahmen stecken als base64 im Skript und liegen nicht als Datei
   * daneben: eine echte Datei muesste ueber fetch geladen werden, und das ist
   * unter file:// gesperrt -- damit waere die Eigenschaft weg, dass das Spiel
   * ohne Server laeuft.
   *
   * Mehrere Proben mit je einer Bezugsdrehzahl werden ueberblendet. Eine
   * einzelne Aufnahme ueber den ganzen Bereich zu verstimmen zieht die
   * Resonanzen des Blocks mit hoch und klingt jenseits von etwa dem
   * Anderthalbfachen nach Spielzeug.
   */
  function motorAusProben(summe) {
    var quelle = window.TG.klangMotor;
    var pegel = verstaerker(0);
    var hoch = filter('highpass', KLANG.PROBEN_HOCHPASS, 0.7);
    hoch.connect(pegel); pegel.connect(summe);

    var proben = quelle.proben.slice().sort(function (a, b) { return a.umin - b.umin; });
    var stimmen = [], schiefe = 0, ersatz = null;

    proben.forEach(function (p) {
      var st = { umin: p.umin, q: null, gain: verstaerker(0) };
      st.gain.connect(hoch);
      stimmen.push(st);
      entpacken(p.daten, function (puffer) {
        var q = ctx.createBufferSource();
        q.buffer = puffer;
        q.loop = true;
        if (p.schleifeAb != null) q.loopStart = p.schleifeAb;
        if (p.schleifeBis != null) q.loopEnd = p.schleifeBis;
        q.connect(st.gain); q.start();
        st.q = q;
      }, function (e) {
        // Eine stumme Seite waere die schlechteste Antwort auf eine kaputte
        // Aufnahme, also lieber zurueck auf die gerechnete Bauart.
        if (window.console) window.console.warn('Landfracht: Motoraufnahme nicht lesbar', e);
        if (++schiefe === proben.length) {
          ersatz = motorSynthetisch(summe);
          ich.art = 'ersatz';   // damit klang.html nicht das Falsche anzeigt
        }
      });
    });

    var ich = {
      art: 'proben',
      setzen: function (umin, dreh, ladedruck, motorAus) {
        if (ersatz) { ersatz.setzen(umin, dreh, ladedruck, motorAus); return; }
        var gesamt = motorAus ? 0
                   : KLANG.PROBEN_PEGEL * (0.75 + 0.25 * dreh + 0.15 * ladedruck);
        var gew = anteile(stimmen, umin);
        for (var i = 0; i < stimmen.length; i++) {
          if (stimmen[i].q) setz(stimmen[i].q.playbackRate, umin / stimmen[i].umin, 0.06);
          setz(stimmen[i].gain.gain, gesamt * gew[i], 0.08);
        }
      },
      // Bezugsdrehzahl einer Probe am Ohr nachstellen. Der Wert wandert
      // anschliessend als Argument in klang_einbetten.py zurueck.
      bezug: function (i, umin) {
        if (stimmen[i]) stimmen[i].umin = umin;
      },
      bezuege: function () {
        return stimmen.map(function (st) { return st.umin; });
      }
    };
    return ich;
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
    // Sanfter als vorher (-12 dB bei 10:1): der harte Begrenzer hat bei jeder
    // Zuendspitze den ganzen Rest heruntergedrueckt und wieder losgelassen,
    // und dieses Pumpen im Zuendtakt ermuedet mehr als jede Lautstaerke.
    var begrenzer = ctx.createDynamicsCompressor();
    begrenzer.threshold.value = -8;
    begrenzer.knee.value = 10;
    begrenzer.ratio.value = 5;
    begrenzer.attack.value = 0.01;
    begrenzer.release.value = 0.25;
    summe.connect(begrenzer);
    begrenzer.connect(ctx.destination);

    var puffer = rauschPuffer(2.4);

    // Eigener Regler fuer alles, was vom Schlepper selbst kommt. Wind, Voegel
    // und Signale haengen nicht daran -- wer den Motor leiser will, will die
    // Welt deswegen nicht leiser.
    var motorBus = verstaerker(motorLaut);
    motorBus.connect(summe);

    /* ---- Motor ----
     * Eine eingebettete Aufnahme hat Vorrang. Ohne sie die gerechnete Bauart,
     * damit das Spiel in jedem Fall klingt.
     */
    var motor = (window.TG.klangMotor && window.TG.klangMotor.proben &&
                 window.TG.klangMotor.proben.length)
              ? motorAusProben(motorBus)
              : motorSynthetisch(motorBus);

    /* ---- Lader ----
     * Schmalbandiges Rauschen statt eines Oszillators: ein reiner Sinus klingt
     * nach Wasserkessel, das gefilterte Rauschen atmet. Die Frequenz haengt am
     * Ladedruck, nicht an der Drehzahl -- deshalb pfeift es beim Anfahren unter
     * Last hoch und faellt beim Vomgaswegnehmen ab.
     */
    var laderFilter = filter('bandpass', 1500, 6);
    var laderGain = verstaerker(0);
    laderFilter.connect(laderGain); laderGain.connect(motorBus);
    rauschQuelle(puffer, laderFilter);

    /* ---- Getriebeheulen ----
     * Sehr leise, haengt am Tempo statt an der Drehzahl. Erst damit klingt es
     * nach einem fahrenden Fahrzeug und nicht nach einem Motor auf dem Bock.
     */
    // Sinus statt Dreieck: die Obertoene des Dreiecks standen als duenner,
    // fester Pfeifton ueber allem.
    var heulOsz = ctx.createOscillator();
    heulOsz.type = 'sine';
    heulOsz.frequency.value = 200;
    var heulGain = verstaerker(0);
    heulOsz.connect(heulGain); heulGain.connect(motorBus);
    heulOsz.start();

    /* ---- Untergrund unter den Raedern ---- */
    var rollFilter = filter('lowpass', 300, 0.9);
    // Reifen rollen, sie wummern nicht: darunter kam nur Matsch, der sich mit
    // dem Motor zu einem einzigen Bassteppich addiert hat.
    var rollHoch = filter('highpass', 110, 0.7);
    var rollGain = verstaerker(0);
    rollFilter.connect(rollHoch); rollHoch.connect(rollGain); rollGain.connect(summe);
    rauschQuelle(puffer, rollFilter);

    /* ---- Umgebung: Wind ueber dem Feld ---- */
    var windFilter = filter('lowpass', 480, 0.6);
    var windGain = verstaerker(0.02);
    windFilter.connect(windGain); windGain.connect(summe);
    rauschQuelle(puffer, windFilter);

    /* ---- Regen: dunkles Rauschen, kein Zischen ----
     * Bewusst unter 1,6 kHz gehalten. Echter Regen ist heller, aber er laeuft
     * minutenlang unter allem anderen, und das Ohr ermuedet an hellem Rauschen
     * schneller als am Motor. */
    var regenFilter = filter('lowpass', 1600, 0.5);
    var regenHoch = filter('highpass', 350, 0.6);
    var regenGain = verstaerker(0);
    regenFilter.connect(regenHoch); regenHoch.connect(regenGain); regenGain.connect(summe);
    rauschQuelle(puffer, regenFilter);

    /* ---- Laden und Abladen ---- */
    var ladeFilter = filter('bandpass', 900, 3.5);
    var ladeGain = verstaerker(0);
    ladeFilter.connect(ladeGain); ladeGain.connect(summe);
    rauschQuelle(puffer, ladeFilter);

    n = {
      summe: summe,
      motorBus: motorBus,
      motor: motor,
      laderFilter: laderFilter, laderGain: laderGain,
      heulOsz: heulOsz, heulGain: heulGain,
      rollFilter: rollFilter, rollGain: rollGain,
      windGain: windGain,
      regenGain: regenGain,
      ladeFilter: ladeFilter, ladeGain: ladeGain
    };
    return true;
  }

  /**
   * Geaenderte Werte aus KLANG.MODEN in die laufenden Filter uebernehmen.
   * Fuer werkzeug/klang.html; im Spiel wird das nie gerufen. Die Zuordnung zu
   * Groll und Klappern und alles, was im Puffer steckt, braucht dagegen einen
   * Neuaufbau -- die Werkzeugseite laedt dafuer neu.
   */
  function koerperNeu() {
    if (!n || !n.motor || n.motor.art !== 'synthese') return;
    for (var i = 0; i < KLANG.MODEN.length && i < n.motor.moden.length; i++) {
      var m = KLANG.MODEN[i], k = n.motor.moden[i];
      setz(k.bp.frequency, m[0], 0.02);
      setz(k.bp.Q, m[1], 0.02);
      setz(k.g.gain, m[2], 0.02);
    }
    setz(n.motor.hoch.frequency, KLANG.HOCHPASS, 0.02);
  }

  /** Welche Bauart laeuft gerade: 'synthese', 'proben' oder 'ersatz'? */
  function bauart() { return n && n.motor ? n.motor.art : null; }

  /** Bezugsdrehzahlen der Aufnahmen lesen und setzen. Nur fuer klang.html. */
  function bezuege() {
    return n && n.motor && n.motor.bezuege ? n.motor.bezuege() : [];
  }
  function bezug(i, umin) {
    if (n && n.motor && n.motor.bezug) n.motor.bezug(i, umin);
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

  function motorLautstaerke() { return motorLaut; }

  function setzeMotorLautstaerke(wert) {
    motorLaut = U.clamp(wert, 0, 1);
    einstellungenSchreiben();
    if (ctx) setz(n.motorBus.gain, motorLaut, 0.05);
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

    /* ---- Schalten ----
     * Beim Hochschalten unter Gas geht fuer einen Moment die Last weg und die
     * Drehzahl faellt in den naechsten Gang. Diese kleine Atempause gliedert
     * eine Fahrt; ohne sie lief der Ton von der Hofeinfahrt bis zum Ziel in
     * einem Strich durch.
     */
    if (gang > gangVorher && z.gas && !z.motorAus) schaltPause = 0.32;
    gangVorher = gang;
    schaltPause = Math.max(0, schaltPause - dt);
    var schaltet = schaltPause > 0;

    var ziel = 0.14 + 0.70 * imGang;
    if (z.gas && !schaltet) ziel += 0.13 + 0.12 * z.ladung;    // unter Last haengt er tiefer im Drehmoment
    if (z.bremse && z.tempo > 0.5) ziel *= 0.82;
    if (z.motorAus) ziel = 0;
    // Hochdrehen geht schneller als abfallen.
    dreh += (ziel - dreh) * Math.min(1, dt * (ziel > dreh ? 3.4 : 1.9));

    // Last folgt dem Gasfuss, aber nicht sprunghaft: Gas geben oeffnet den
    // Klang in einer Viertelsekunde, Gas wegnehmen laesst ihn etwas langsamer
    // zurueckfallen.
    var lastZiel = (z.gas && !z.motorAus && !schaltet) ? 0.65 + 0.35 * z.ladung : 0;
    last += (lastZiel - last) * Math.min(1, dt * (lastZiel > last ? 4.0 : 2.6));

    /* ---- Ladedruck ----
     * Der Lader haengt an der Last, nicht an der Drehzahl allein, und er
     * braucht Zeit. Aufbauen dauert laenger als abfallen: nimmt man das Gas
     * weg, ist der Druck sofort weg, hochkommen muss er sich erst.
     */
    var druckZiel = z.motorAus ? 0 : (z.gas ? dreh : dreh * 0.22);
    ladedruck += (druckZiel - ladedruck) * Math.min(1, dt * (druckZiel > ladedruck ? 1.1 : 2.4));
    // dreh laeuft unter Last ueber 1 hinaus; ohne Deckel pfiffe der Lader
    // lauter als vorgesehen.
    ladedruck = U.clamp(ladedruck, 0, 1);

    /* ---- Motor ----
     * Zuendfrequenz = Drehzahl/20. Die Steigung ist so gewaehlt, dass der
     * Leerlauf bei dreh 0,14 auf 756/min und die Volllast auf 2170/min faellt.
     */
    var umin = (27 + 77 * dreh) * 20;
    // Der Regler pendelt ein wenig um seine Solldrehzahl, im Leerlauf mehr als
    // unter Last. Zwei Schwingungen mit ungleichen Perioden, damit es nicht
    // selbst wieder zum Takt wird.
    var pendel = (1 - 0.6 * last) * (0.007 * Math.sin(zeit * 2.3) + 0.004 * Math.sin(zeit * 0.71 + 1.3));
    umin *= 1 + pendel;
    n.motor.setzen(umin, dreh, ladedruck, z.motorAus, last);

    /* ---- Lader ---- */
    // Frueher bis 7 kHz hinauf -- ein Pfeifen in der Lage, in der das Ohr am
    // empfindlichsten ist. Jetzt bleibt er unter 3,5 kHz und deutlich leiser.
    setz(n.laderFilter.frequency, 1500 + 2000 * ladedruck, 0.12);
    setz(n.laderGain.gain,
         z.motorAus ? 0 : KLANG.LADER * (0.004 + 0.032 * ladedruck * ladedruck), 0.12);

    /* ---- Getriebe ---- */
    setz(n.heulOsz.frequency, 180 + 520 * vN, 0.1);
    setz(n.heulGain.gain, z.motorAus ? 0 : 0.002 + 0.007 * vN, 0.15);

    /* ---- Untergrund ---- */
    var rau = z.untergrund === 'strasse' ? 0.55 : (z.untergrund === 'feldweg' ? 1.15 : 1.7);
    setz(n.rollGain.gain, 0.055 * rau * vN);
    setz(n.rollFilter.frequency, 170 + 620 * vN + (rau > 1 ? 220 : 0));

    /* ---- Wind, zwei ungleiche Schwingungen, damit es nicht pulst ---- */
    var boe = 0.5 + 0.32 * Math.sin(zeit * 0.13) + 0.18 * Math.sin(zeit * 0.047);
    setz(n.windGain.gain, (0.014 + 0.020 * boe) * (1 + 0.6 * (z.regen || 0)), 0.6);

    /* ---- Regen ---- */
    setz(n.regenGain.gain, 0.03 * (z.regen || 0), 1.5);

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
      // Im Regen und im Schnee singt keiner.
      if (dreh < 0.5 && !z.regen && !z.still) vogel();
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

  /** Donner nach einem Blitz: tiefes Grollen, leicht verzoegert, langsam
   *  verebbend. Leise gehalten -- es soll erschrecken, nicht droehnen. */
  function donner() {
    if (!ctx || !aktiv || ctx.state !== 'running') return;
    var t = ctx.currentTime + 0.4 + Math.random() * 1.4;
    var q = ctx.createBufferSource();
    q.buffer = rauschPuffer(3.2);
    var tf = filter('lowpass', 160 + Math.random() * 80, 0.8);
    var g = verstaerker(0);
    q.connect(tf); tf.connect(g); g.connect(n.summe);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.06, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);
    q.start(t); q.stop(t + 3.2);
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

  /**
   * Anlasser. Ein Elektromotor, der sich hochdreht und dabei den kalten
   * Diesel durchschleppt: ein heulender Saegezahn um die 90 Hz und darueber
   * die einzelnen Kompressionen als Amplitudenmodulation. Das Ende faellt
   * nicht ab, sondern reisst kurz vor Ablauf ab -- da faengt der Motor.
   */
  function anlasser(dauer) {
    if (!ctx || !aktiv || ctx.state !== 'running') return;
    var t = ctx.currentTime + 0.02;
    var bis = t + (dauer || 1.4);

    // Der Elektromotor selbst
    var o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(52, t);
    o.frequency.linearRampToValueAtTime(96, t + 0.35);
    o.frequency.linearRampToValueAtTime(104, bis);
    var of = filter('bandpass', 420, 2.2);
    var og = verstaerker(0);
    o.connect(of); of.connect(og); og.connect(n.summe);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.10, t + 0.12);
    og.gain.setValueAtTime(0.10, bis - 0.08);
    og.gain.exponentialRampToValueAtTime(0.0001, bis + 0.02);
    o.start(t); o.stop(bis + 0.06);

    // Das Durchschleppen: langsame Modulation auf gefiltertem Rauschen
    var q = ctx.createBufferSource();
    q.buffer = rauschPuffer(Math.max(0.6, (dauer || 1.4) + 0.3));
    var qf = filter('bandpass', 180, 1.4);
    var qg = verstaerker(0.0);
    q.connect(qf); qf.connect(qg); qg.connect(n.summe);

    var mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(4.2, t);
    mod.frequency.linearRampToValueAtTime(7.5, bis);
    var modG = verstaerker(0.10);
    mod.connect(modG); modG.connect(qg.gain);
    qg.gain.setValueAtTime(0.15, t);
    qg.gain.setValueAtTime(0.15, bis - 0.06);
    qg.gain.linearRampToValueAtTime(0, bis + 0.04);
    mod.start(t); mod.stop(bis + 0.06);
    q.start(t); q.stop(bis + 0.06);
  }

  /** Motor abstellen: ein kurzes Auslaufen, dann ist Ruhe. */
  function motorStopp() {
    if (!ctx || !aktiv || ctx.state !== 'running') return;
    // dreh selbst faellt in schritt() ohnehin; hier nur das Nachsacken,
    // damit das Abstellen einen Moment hat und nicht bloss verstummt.
    var t = ctx.currentTime + 0.01;
    var o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(46, t);
    o.frequency.exponentialRampToValueAtTime(17, t + 0.55);
    var f = filter('lowpass', 300, 0.8);
    var g = verstaerker(0);
    o.connect(f); f.connect(g); g.connect(n.summe);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.start(t); o.stop(t + 0.65);
  }

  /** Laden oder Abladen laeuft (true) oder ist vorbei (false). */
  function vorgang(laeuft) { ladeLaeuft = !!laeuft; }

  return {
    start: start, schritt: schritt,
    istAn: istAn, umschalten: umschalten, setzeAn: setzeAn,
    lautstaerke: lautstaerke, setzeLautstaerke: setzeLautstaerke,
    motorLautstaerke: motorLautstaerke, setzeMotorLautstaerke: setzeMotorLautstaerke,
    stoss: stoss, signal: signal, vorgang: vorgang, donner: donner,
    anlasser: anlasser, motorStopp: motorStopp,
    // Nur fuer werkzeug/klang.html, das Spiel fasst nichts davon an.
    KLANG: KLANG, koerperNeu: koerperNeu,
    bauart: bauart, bezuege: bezuege, bezug: bezug
  };
})();
