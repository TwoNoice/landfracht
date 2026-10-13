/* Landfracht — Jahreszeiten, Wetter, Ereignisse und Tagesziele
 *
 * Alles, was sich ueber den Tag und das Jahr veraendert, ohne dass der
 * Spieler es ausloest. Wie jobs.js bekommt jede Funktion den Spielstand
 * hereingereicht und haelt selbst keinen. Was sie dem Spiel mitzuteilen hat,
 * geht ueber zwei Rueckrufe, die game.js beim Laden einhaengt (`anmelden`):
 * eine Meldung und eine Belohnung. Die Belohnung laeuft ueber game.js, weil
 * nur dort feststeht, was beim Aufstieg in eine neue Ruf-Stufe passiert.
 *
 * Gespeichert wird alles im Spielstand, aber nur als neue Felder: laden()
 * prueft allein `v === 1`, und `einrichten()` ergaenzt, was einem alten Stand
 * fehlt. Das Speicherformat bleibt damit bei Version 1.
 */
var TG = window.TG || (window.TG = {});

TG.umwelt = (function () {
  var U = TG.util, D = TG.data, W = TG.welt;

  var rueck = { melden: function () {}, belohnen: function () {} };
  function anmelden(r) { rueck = r; }
  function melde(text, art) { rueck.melden(text, art); }

  /* =============================================================
   *  Jahreszeiten
   *
   *  Ein Spieltag dauert rund 36 echte Minuten. Eine Jahreszeit ueber eine
   *  Woche haette also gut vier Stunden Spiel gekostet -- die meisten saehen
   *  nie einen Herbst. Drei Tage sind knapp zwei Stunden, ein Jahr zwoelf
   *  Spieltage.
   * ============================================================= */
  var SAISON_TAGE = 3;

  /* nachfrage: Lohnfaktor je Ware, und zugleich das Gewicht, mit dem die
   * Boerse sie auswaehlt. Was nicht genannt ist, steht bei 1.
   * wetter: Wahrscheinlichkeit der Wetterlagen. */
  var saisonen = [
    { id: 'fruehling', name: 'Frühling',
      nachfrage: { duenger: 1.35, saatgut: 1.35, guelle: 1.3, kartoffeln: 1.15 },
      wetter: { sonne: 0.36, wolken: 0.30, regen: 0.26, nebel: 0.08 },
      text: 'Bestellzeit: Saatgut, Dünger und Gülle sind gefragt, Pflanzkartoffeln gehen raus.' },
    { id: 'sommer', name: 'Sommer',
      nachfrage: { getreide: 1.3, strohballen: 1.35, heuballen: 1.35, wasser: 1.25, guelle: 0.85 },
      wetter: { sonne: 0.54, wolken: 0.20, regen: 0.12, gewitter: 0.14 },
      text: 'Ernte: Getreide, Stroh und Heu wollen eingefahren werden, das Vieh braucht Wasser.' },
    { id: 'herbst', name: 'Herbst',
      nachfrage: { kartoffeln: 1.35, mais: 1.35, silageballen: 1.3, hackschnitzel: 1.15, pflug: 1.2 },
      wetter: { sonne: 0.24, wolken: 0.30, regen: 0.28, nebel: 0.18 },
      text: 'Kartoffeln und Mais kommen vom Feld, Silage für den Winter, die Pflüge gehen raus.' },
    { id: 'winter', name: 'Winter',
      nachfrage: { stammholz: 1.35, hackschnitzel: 1.35, futtersaecke: 1.25, diesel: 1.2, getreide: 1.1, guelle: 0.7, duenger: 0.8 },
      wetter: { sonne: 0.22, wolken: 0.30, nebel: 0.14, schnee: 0.34 },
      text: 'Holz und Hackschnitzel zum Heizen, Futter für die Ställe. Gülle ruht über die Sperrfrist.' }
  ];

  function saisonIndex(state) {
    var tag = Math.floor(state.zeit / 1440);
    return Math.floor(tag / SAISON_TAGE) % saisonen.length;
  }
  function saison(state) { return saisonen[saisonIndex(state)]; }
  /** Der wievielte Tag der Jahreszeit, 1 .. SAISON_TAGE. */
  function saisonTag(state) { return Math.floor(state.zeit / 1440) % SAISON_TAGE + 1; }

  /* =============================================================
   *  Wetter
   *
   *  tempo  Faktor auf die Hoechstgeschwindigkeit je Untergrund
   *  griff  Faktor auf den Halt des Untergrunds: Anfahren, Bremsen und wie
   *         gut die Vorderraeder in der Kurve fassen
   *  nass   wie schnell nasse Ladung leidet (siehe NASS_WAREN)
   *  plan   Faktor auf das Reisetempo, mit dem die Boerse neue Zeitfenster
   *         bemisst. Wer bei Schnee anbietet, rechnet mit Schnee.
   *
   *  Der Fahrtest in CLAUDE.md laeuft bei Sonne. Bei Schnee laeuft das
   *  Gespann mit Vollgas in engen Kurven gelegentlich aufs Bankett -- das ist
   *  gewollt, bei Glaette faehrt man langsamer.
   * ============================================================= */
  var wetterArten = {
    sonne:    { name: 'Sonnig',   zeichen: '☀', tempo: { strasse: 1, feldweg: 1, gelaende: 1 },          griff: 1,    nass: 0,   plan: 1 },
    wolken:   { name: 'Bewölkt',  zeichen: '☁', tempo: { strasse: 1, feldweg: 1, gelaende: 1 },          griff: 1,    nass: 0,   plan: 1 },
    regen:    { name: 'Regen',    zeichen: '☂', tempo: { strasse: 0.96, feldweg: 0.86, gelaende: 0.76 }, griff: 0.86, nass: 1,   plan: 0.93 },
    gewitter: { name: 'Gewitter', zeichen: '⚡', tempo: { strasse: 0.92, feldweg: 0.80, gelaende: 0.66 }, griff: 0.8,  nass: 1.6, plan: 0.88 },
    nebel:    { name: 'Nebel',    zeichen: '≋', tempo: { strasse: 1, feldweg: 1, gelaende: 1 },          griff: 1,    nass: 0.2, plan: 0.95 },
    schnee:   { name: 'Schnee',   zeichen: '❄', tempo: { strasse: 0.88, feldweg: 0.80, gelaende: 0.70 }, griff: 0.74, nass: 0.4, plan: 0.86 }
  };

  /* Was unter einer Plane muesste und im Regen leidet. Silage ist gewickelt,
   * Schuettgut verzeiht ein paar Tropfen, Flüssiges ist ohnehin nass. */
  var NASS_WAREN = ['strohballen', 'heuballen', 'saatgut', 'duenger', 'futtersaecke'];

  function wetterWuerfeln(state, vorher) {
    var p = saison(state).wetter, summe = 0, k;
    var gewicht = {};
    for (k in p) {
      // Wetter haelt sich: dieselbe Lage wird bevorzugt, sonst springt es
      // stuendlich zwischen Sonne und Gewitter hin und her.
      gewicht[k] = p[k] * (k === vorher ? 1.6 : 1);
      summe += gewicht[k];
    }
    var r = Math.random() * summe;
    for (k in gewicht) { r -= gewicht[k]; if (r <= 0) return k; }
    return 'sonne';
  }

  /** Zwei bis sechs Spielstunden, also drei bis neun echte Minuten. */
  function wetterDauer() { return U.zufallGanz(120, 360); }

  function wetter(state) { return wetterArten[state.wetter.art] || wetterArten.sonne; }
  function vorhersage(state) {
    return { spec: wetterArten[state.wetter.naechste] || wetterArten.sonne, in: Math.max(0, state.wetter.bis - state.zeit) };
  }

  function wetterWechseln(state, still) {
    var w = state.wetter;
    var alt = w.art;
    w.art = w.naechste;
    w.bis += wetterDauer();
    w.naechste = wetterWuerfeln(state, w.art);
    if (!still && alt !== w.art) {
      var t = {
        sonne: 'Die Wolken reißen auf. Es wird sonnig.',
        wolken: 'Es zieht zu.',
        regen: 'Es fängt an zu regnen. Feldwege werden schmierig, Ballen und Säcke wollen trocken bleiben.',
        gewitter: 'Ein Gewitter zieht auf. Wenig Halt, und nasse Ladung leidet schnell.',
        nebel: 'Nebel kommt auf. Man sieht kaum über die nächste Kurve.',
        schnee: 'Es schneit. Glatt auf allen Wegen — früher bremsen.'
      }[w.art];
      if (t) melde(t, null);    // ohne Signalton: das Wetter wechselt oft
    }
  }

  /** Fahrphysik: was das Wetter auf diesem Untergrund an Tempo und Halt laesst. */
  function fahrFaktor(state, untergrund) {
    var w = wetter(state);
    return { tempo: w.tempo[untergrund] || 1, griff: w.griff };
  }

  function planFaktor(state) { return wetter(state).plan; }

  /* =============================================================
   *  Ereignisse
   *
   *  Jede volle Spielstunde wird einmal gewuerfelt. Ein Ereignis ist entweder
   *  ein einmaliger Vorgang (Dieselpreis, Sonderfahrt) oder ein Zustand mit
   *  Ablaufzeit, der in state.ereignisse liegt und von dort aus wirkt.
   *  Die Reifenpanne haengt nicht an der Uhr, sondern an den gefahrenen
   *  Metern und am Zustand -- sie steht deshalb in game.js.
   * ============================================================= */
  var EREIGNIS_CHANCE = 0.08;     // je Spielstunde; knapp zwei am Spieltag

  var ereignisArten = {
    fest: {
      gewicht: 1.0,
      start: function (state) {
        // Ein Ort, der etwas annimmt, was man auf dieser Stufe fahren darf.
        var frei = TG.auftraege.freieArten(D.stufeVonRuf(state.ruf));
        var orte = W.orte.filter(function (o) {
          return o.nimmt.some(function (w) { return D.waren[w] && frei.indexOf(D.waren[w].art) >= 0; });
        });
        if (!orte.length) return null;
        var o = U.waehle(orte);
        var anlass = U.waehle(['Erntedankfest', 'Hoffest', 'Tag der offenen Tür', 'großer Bedarf', 'Lager wird aufgefüllt']);
        var e = { art: 'fest', ort: o.id, faktor: 1.3, bis: state.zeit + U.zufallGanz(360, 720), anlass: anlass };
        // Gleich ein paar passende Fuhren anbieten, sonst sieht man vom Fest nichts.
        var n = 0;
        for (var i = 0; i < 30 && n < 2; i++) {
          var j = TG.auftraege.erzeugen(state, { nach: o.id });
          if (!j) continue;
          state.boerse.push(j);
          n++;
        }
        melde(o.name + ': ' + anlass + '. Lieferungen dorthin werden einige Stunden lang um 30 % besser bezahlt.', 'gut');
        return e;
      },
      text: function (e) { return W.ort(e.ort).kurz + ': ' + e.anlass + ', Lieferungen +30 %'; }
    },

    werkstatt: {
      gewicht: 0.6,
      start: function (state) {
        melde('Die Werkstatt hat gerade Luft: Instandsetzen kostet die nächsten zwölf Stunden ein Drittel weniger.', 'gut');
        return { art: 'werkstatt', faktor: 0.67, bis: state.zeit + 720 };
      },
      text: function () { return 'Werkstatt: Instandsetzen −33 %'; }
    },

    diesel: {
      gewicht: 0.8,
      start: function (state) {
        var hoch = Math.random() < 0.5;
        var d = (hoch ? 1 : -1) * U.zufall(0.12, 0.26);
        // Dieselben Grenzen wie der Wochenpreis in game.js.
        state.dieselPreis = Math.round(U.clamp(state.dieselPreis + d, 1.18, 2.10) * 100) / 100;
        melde(hoch
          ? 'Der Dieselpreis zieht an: jetzt ' + U.zahl(state.dieselPreis, 2) + ' € je Liter.'
          : 'Diesel ist günstiger geworden: ' + U.zahl(state.dieselPreis, 2) + ' € je Liter. Volltanken lohnt.',
          hoch ? 'schlecht' : 'gut');
        return null;     // wirkt bis zum naechsten Wochenpreis, keine eigene Laufzeit
      }
    },

    sonderfahrt: {
      gewicht: 1.0,
      start: function (state) {
        for (var i = 0; i < 30; i++) {
          var j = TG.auftraege.erzeugen(state, null);
          // Nur einfache Fuhren: eine Sonderfahrt ueber zwei Ladungen kam auf
          // gut 2000 EUR, das Sechsfache einer gewoehnlichen.
          if (!j || j.schlecht || j.fahrten > 1) continue;
          // Gut bezahlt, aber eilig und nur kurz zu haben.
          j.lohn = Math.round(j.lohn * 1.45 / 5) * 5;
          j.strafe = Math.round(j.lohn * 0.30 / 5) * 5;
          j.ruf = Math.round(j.ruf * 1.4);
          j.fensterMin = Math.max(45, Math.round(j.fensterMin * 0.8 / 15) * 15);
          j.eilig = true;
          j.sonder = true;
          j.guete = Math.round(j.guete * 145) / 100;
          j.gueltigBis = state.zeit + U.zufallGanz(90, 180);
          state.boerse.push(j);
          melde('Sonderfahrt in der Börse: ' + D.waren[j.ware].name + ' von ' + W.ort(j.von).kurz + ' nach ' +
                W.ort(j.nach).kurz + ' für ' + U.geld(j.lohn) + '. Eilig.', 'gut');
          return null;
        }
        return null;
      }
    },

    unwetter: {
      gewicht: 0.5,
      nur: ['sommer', 'herbst'],
      start: function (state) {
        // Das Wetter schlaegt sofort um, und die Kunden geben Aufschub.
        state.wetter.naechste = 'gewitter';
        state.wetter.bis = state.zeit;
        wetterWechseln(state, true);
        state.angenommen.forEach(function (j) { j.faelligUm += 60; });
        melde('Unwetterwarnung. Ein schweres Gewitter zieht durch — alle laufenden Aufträge bekommen eine Stunde Aufschub.', 'schlecht');
        return null;
      }
    }
  };

  function ereignisWuerfeln(state) {
    var s = saison(state).id;
    var kandidaten = [], summe = 0;
    for (var k in ereignisArten) {
      var a = ereignisArten[k];
      if (a.nur && a.nur.indexOf(s) < 0) continue;
      // Was gerade laeuft, kommt nicht doppelt.
      if (state.ereignisse.some(function (e) { return e.art === k; })) continue;
      kandidaten.push(k); summe += a.gewicht;
    }
    if (!kandidaten.length) return;
    var r = Math.random() * summe;
    for (var i = 0; i < kandidaten.length; i++) {
      r -= ereignisArten[kandidaten[i]].gewicht;
      if (r <= 0) { ausloesen(state, kandidaten[i]); return; }
    }
  }

  function ausloesen(state, art) {
    var a = ereignisArten[art];
    if (!a) return null;
    var e = a.start(state);
    if (e) state.ereignisse.push(e);
    return e;
  }

  function laufende(state) {
    return state.ereignisse.map(function (e) {
      var a = ereignisArten[e.art];
      return { art: e.art, text: a && a.text ? a.text(e) : e.art, rest: Math.max(0, e.bis - state.zeit) };
    });
  }

  /** Lohnfaktor einer Ware in dieser Jahreszeit. */
  function nachfrage(state, ware) {
    var n = saison(state).nachfrage[ware];
    return n || 1;
  }

  /** Aufschlag fuer Lieferungen an diesen Ort (Feste). */
  function zielFaktor(state, ortId) {
    var f = 1;
    state.ereignisse.forEach(function (e) { if (e.art === 'fest' && e.ort === ortId) f *= e.faktor; });
    return f;
  }

  function reparaturFaktor(state) {
    var f = 1;
    state.ereignisse.forEach(function (e) { if (e.art === 'werkstatt') f *= e.faktor; });
    return f;
  }

  /* =============================================================
   *  Tagesziele
   *
   *  Drei je Tag, neu gewuerfelt um Mitternacht. Sie sollen an einem
   *  Spieltag -- rund 36 echte Minuten, gut ein Dutzend Fuhren -- zu schaffen
   *  sein, aber nicht nebenbei: eines davon verlangt meist, die Route nach
   *  ihm auszurichten.
   * ============================================================= */
  var zielArten = {
    auftraege:  { gewicht: 1.0, bauen: function (st) { var n = U.zufallGanz(2, 3); return { ziel: n, text: n + ' Aufträge abschließen' }; } },
    puenktlich: { gewicht: 1.0, bauen: function (st) { var n = U.zufallGanz(2, 3); return { ziel: n, text: n + ' Aufträge pünktlich liefern' }; } },
    tonnen:     { gewicht: 0.9, bauen: function (st) {
                    var n = Math.round(U.zufall(1.6, 2.6) * kapazitaet(st) / 2) * 2;
                    return { ziel: n, text: n + ' t Ware abliefern' }; } },
    strecke:    { gewicht: 0.7, bauen: function (st) { var n = U.zufallGanz(3, 5); return { ziel: n * 1000, text: n + ' km fahren' }; } },
    schonend:   { gewicht: 0.8, bauen: function (st) { var n = U.zufallGanz(1, 2); return { ziel: n, text: n + (n > 1 ? ' Ladungen' : ' Ladung') + ' ohne Schaden abliefern' }; } },
    rueckfracht:{ gewicht: 0.7, bauen: function (st) { return { ziel: 1, text: 'Eine Rückfracht fahren' }; } },
    ort:        { gewicht: 0.9, bauen: function (st) {
                    var frei = TG.auftraege.freieArten(D.stufeVonRuf(st.ruf));
                    var orte = W.orte.filter(function (o) {
                      return !o.istHof && o.nimmt.some(function (w) { return D.waren[w] && frei.indexOf(D.waren[w].art) >= 0; });
                    });
                    if (!orte.length) return null;
                    var o = U.waehle(orte);
                    return { ziel: 1, ort: o.id, text: 'Eine Lieferung nach ' + o.kurz }; } },
    saison:     { gewicht: 0.9, bauen: function (st) {
                    var frei = TG.auftraege.freieArten(D.stufeVonRuf(st.ruf));
                    var s = saison(st);
                    var waren = Object.keys(s.nachfrage).filter(function (w) {
                      return s.nachfrage[w] > 1 && D.waren[w] && frei.indexOf(D.waren[w].art) >= 0;
                    });
                    if (!waren.length) return null;
                    var w = U.waehle(waren);
                    return { ziel: 1, ware: w, text: D.waren[w].name + ' liefern (' + s.name + 'sware)' }; } }
  };

  /** Groesster eigener Anhaenger in Tonnen, fuer das Mengenziel. */
  function kapazitaet(state) {
    var best = 8;
    state.fuhrpark.forEach(function (f) {
      if (f.typ !== 'anhaenger') return;
      var sp = D.anhaenger_(f.id);
      if (sp && sp.art === 'schuett') best = Math.max(best, sp.kap);
    });
    return best;
  }

  function zieleWuerfeln(state) {
    var stufe = D.stufeVonRuf(state.ruf);
    var arten = U.mischen(Object.keys(zielArten));
    var liste = [];
    for (var i = 0; i < arten.length && liste.length < 3; i++) {
      // Nicht beides: "Aufträge" und "pünktliche Aufträge" an einem Tag ist doppelt gezählt.
      if (arten[i] === 'puenktlich' && liste.some(function (z) { return z.art === 'auftraege'; })) continue;
      if (arten[i] === 'auftraege' && liste.some(function (z) { return z.art === 'puenktlich'; })) continue;
      if (Math.random() > zielArten[arten[i]].gewicht) continue;
      var z = zielArten[arten[i]].bauen(state);
      if (!z) continue;
      z.art = arten[i];
      z.stand = 0;
      z.fertig = false;
      // Die Belohnung waechst mit der Stufe, sonst ist sie ab Stufe 3 Kleingeld.
      z.geld = Math.round(U.zufall(140, 260) * (1 + 0.6 * (stufe - 1)) / 10) * 10;
      z.ruf = U.zufallGanz(10, 20) + 4 * (stufe - 1);
      liste.push(z);
    }
    state.ziele = { tag: Math.floor(state.zeit / 1440), liste: liste, alle: false };
  }

  /** Bonus, wenn an einem Tag alle drei Ziele geschafft sind. */
  var ALLE_BONUS = { geld: 300, ruf: 20 };

  /**
   * Fortschritt melden. art:
   *   'meter'      daten = Meter
   *   'abgeladen'  daten = { tonnen, ware, nach, schaden }
   *   'fertig'     daten = { job, puenktlich }
   */
  function zielMelden(state, art, daten) {
    if (!state.ziele) return;
    var z, i, l = state.ziele.liste;
    for (i = 0; i < l.length; i++) {
      z = l[i];
      if (z.fertig) continue;
      var plus = 0;
      if (art === 'meter' && z.art === 'strecke') plus = daten;
      if (art === 'abgeladen') {
        if (z.art === 'tonnen') plus = daten.tonnen;
        if (z.art === 'schonend' && daten.schaden < 0.01) plus = 1;
        if (z.art === 'ort' && daten.nach === z.ort) plus = 1;
        if (z.art === 'saison' && daten.ware === z.ware) plus = 1;
      }
      if (art === 'fertig') {
        if (z.art === 'auftraege') plus = 1;
        if (z.art === 'puenktlich' && daten.puenktlich) plus = 1;
        if (z.art === 'rueckfracht' && daten.job.anschluss) plus = 1;
      }
      if (!plus) continue;
      z.stand = Math.min(z.ziel, z.stand + plus);
      if (z.stand >= z.ziel) {
        z.fertig = true;
        rueck.belohnen(z.geld, z.ruf, 'Tagesziel geschafft: ' + z.text + '. ' + U.geld(z.geld) + ', Ruf +' + z.ruf + '.');
      }
    }
    if (!state.ziele.alle && l.length && l.every(function (x) { return x.fertig; })) {
      state.ziele.alle = true;
      rueck.belohnen(ALLE_BONUS.geld, ALLE_BONUS.ruf,
        'Alle Tagesziele erledigt. Bonus ' + U.geld(ALLE_BONUS.geld) + ', Ruf +' + ALLE_BONUS.ruf + '.');
    }
  }

  /* =============================================================
   *  Takt
   * ============================================================= */
  /** Fehlende Felder in neuem oder altem Spielstand ergaenzen. */
  function einrichten(state) {
    if (!state.wetter || !wetterArten[state.wetter.art]) {
      state.wetter = { art: 'sonne', naechste: 'wolken', bis: state.zeit + wetterDauer() };
    }
    if (!state.ereignisse) state.ereignisse = [];
    if (state.stunde === undefined) state.stunde = Math.floor(state.zeit / 60);
    if (!state.ziele) zieleWuerfeln(state);
    if (state.saison === undefined) state.saison = saisonIndex(state);
  }

  /**
   * Nach jedem Vorruecken der Uhr. Holt auch grosse Spruenge nach (Reparatur,
   * Kanister, Pruefstand), wuerfelt dabei aber nicht jede uebersprungene
   * Stunde einzeln -- vier Stunden Werkstatt sollen nicht vier Ereignisse
   * auf einmal ausschuetten.
   */
  function takt(state) {
    var w = state.wetter, n = 0;
    while (state.zeit >= w.bis && n++ < 40) wetterWechseln(state, n > 1 || state.zeit - w.bis > 240);

    for (var i = state.ereignisse.length - 1; i >= 0; i--) {
      if (state.zeit >= state.ereignisse[i].bis) state.ereignisse.splice(i, 1);
    }

    var stunde = Math.floor(state.zeit / 60);
    if (stunde > state.stunde) {
      var sprung = stunde - state.stunde;
      state.stunde = stunde;
      if (sprung <= 2 && Math.random() < EREIGNIS_CHANCE) ereignisWuerfeln(state);
    }

    var tag = Math.floor(state.zeit / 1440);
    if (state.ziele && tag > state.ziele.tag) {
      var offen = state.ziele.liste.filter(function (z) { return !z.fertig; }).length;
      zieleWuerfeln(state);
      melde('Neuer Tag, neue Tagesziele' + (offen ? ' — gestern sind ' + offen + ' liegen geblieben.' : '.') +
            ' Im Buch steht, was heute zählt.');
    }

    var si = saisonIndex(state);
    if (si !== state.saison) {
      state.saison = si;
      melde('Der ' + saisonen[si].name + ' beginnt. ' + saisonen[si].text, 'gut');
    }
  }

  return {
    SAISON_TAGE: SAISON_TAGE, NASS_WAREN: NASS_WAREN,
    saisonen: saisonen, wetterArten: wetterArten, zielArten: zielArten, ereignisArten: ereignisArten,
    anmelden: anmelden, einrichten: einrichten, takt: takt,
    saison: saison, saisonTag: saisonTag,
    wetter: wetter, vorhersage: vorhersage, fahrFaktor: fahrFaktor, planFaktor: planFaktor,
    nachfrage: nachfrage, zielFaktor: zielFaktor, reparaturFaktor: reparaturFaktor,
    laufende: laufende, ausloesen: ausloesen,
    // Fuer den Pruefstand: Wetter von Hand setzen.
    wetterSetzen: function (state, art) {
      if (!wetterArten[art]) return;
      state.wetter.naechste = art;
      state.wetter.bis = state.zeit;
      wetterWechseln(state, false);
    },
    zielMelden: zielMelden, zieleWuerfeln: zieleWuerfeln
  };
})();
