/* Landfracht — Kopfleiste, Meldungen und die vier Bildschirme */
var TG = window.TG || (window.TG = {});

TG.ui = (function () {
  var U = TG.util, D = TG.data, W = TG.welt, S = TG.spiel;

  var el = {};
  var offen = null;
  var sortierung = 'lohn';
  var letzterHinweis = '';

  function $(id) { return document.getElementById(id); }

  function start() {
    el.panel = $('panel');
    el.titel = $('panel-titel');
    el.inhalt = $('panel-inhalt');
    el.hinweis = $('hinweis');
    el.meldungen = $('meldungen');
    el.fortschritt = $('fortschritt');
    el.fsTitel = $('fs-titel');
    el.fsBalken = $('fs-balken');

    el.geld = $('kf-geld'); el.ruf = $('kf-ruf'); el.zeit = $('kf-zeit');
    el.diesel = $('kf-diesel'); el.dieselB = $('kf-diesel-b');
    el.zustand = $('kf-zustand'); el.zustandB = $('kf-zustand-b');
    el.auftrag = $('kf-auftrag');
    el.kmh = $('t-kmh'); el.gang = $('t-gang'); el.ladung = $('t-ladung'); el.motor = $('t-motor');
    el.lageWetter = $('lage-wetter'); el.lageEreignisse = $('lage-ereignisse'); el.lageZiele = $('lage-ziele');

    document.querySelectorAll('[data-panel]').forEach(function (b) {
      b.addEventListener('click', function () { umschalten(b.getAttribute('data-panel')); });
    });
    $('panel-zu').addEventListener('click', schliessen);
    el.inhalt.addEventListener('click', klick);
    el.inhalt.addEventListener('input', schieber);

    S.bei('meldung', function (d) { meldung(d.text, d.art); });
    S.bei('vorgang', vorgang);
  }

  /* ---------------- Panelsteuerung ---------------- */
  function umschalten(name) {
    if (offen === name) schliessen(); else oeffnen(name);
  }

  function oeffnen(name) {
    if (name === 'pruefstand' && !(TG.entwickler && TG.entwickler.an())) return;
    offen = name;
    el.panel.classList.remove('zu');
    // Die Karte braucht mehr Breite als eine Liste; die Lade bekommt dafuer
    // eine eigene Klasse statt eines zweiten Panels.
    el.panel.classList.toggle('breit', name === 'karte');
    zeichnen();
  }

  function schliessen() {
    offen = null;
    el.panel.classList.add('zu');
    el.panel.classList.remove('breit');
  }

  function istOffen() { return !!offen; }

  function zeichnen() {
    if (!offen) return;
    // Der Pruefstand steht nur offen, solange der Entwicklermodus laeuft --
    // auch dann, wenn er sich selbst gerade abgeschaltet hat.
    if (offen === 'pruefstand' && !(TG.entwickler && TG.entwickler.an())) { schliessen(); return; }
    var titel = { boerse: 'Auftragsbörse', hof: 'Hof', haendler: 'Landtechnik Vosskamp', buch: 'Buch', karte: 'Karte', pruefstand: 'Prüfstand' }[offen];
    el.titel.textContent = titel;
    el.inhalt.innerHTML =
      offen === 'boerse' ? boerse() :
      offen === 'hof' ? hof() :
      offen === 'haendler' ? haendler() :
      offen === 'karte' ? kartenblatt() :
      offen === 'pruefstand' ? TG.entwickler.panel() : buch();
    if (offen === 'karte') karteAufbauen();
  }

  /* ---------------- Kopfleiste ---------------- */
  function kopfleiste() {
    var s = S.state;
    if (!s) return;
    var t = S.aktiverTraktor();

    el.geld.textContent = U.geld(s.geld);
    el.geld.style.color = s.geld < 0 ? '#c9553d' : '';

    var st = S.stufe(), naechste = D.naechsteStufe(s.ruf);
    el.ruf.textContent = U.zahl(s.ruf) + ' · Stufe ' + st + (naechste ? ' (' + U.zahl(naechste.ruf - s.ruf) + ' bis ' + naechste.stufe + ')' : '');

    el.zeit.textContent = 'Tag ' + S.tag() + ', ' + U.uhrzeit(s.zeit);

    var gr = S.tankGroesse();
    var anteil = gr ? t.f.tank / gr : 0;
    el.dieselB.style.width = (anteil * 100).toFixed(0) + '%';
    el.dieselB.className = anteil < 0.1 ? 'krit' : (anteil < 0.25 ? 'warn' : '');
    el.diesel.textContent = Math.round(t.f.tank) + ' l';

    if (el.lageWetter) lage();

    el.zustandB.style.width = t.f.zustand.toFixed(0) + '%';
    el.zustandB.className = t.f.zustand < 25 ? 'krit' : (t.f.zustand < 50 ? 'warn' : '');
    el.zustand.textContent = Math.round(t.f.zustand) + ' %';

    var j = S.anzeigeAuftrag();
    if (!j) {
      el.auftrag.innerHTML = '<span class="leer">Kein Auftrag angenommen — drücke <b>B</b> für die Börse</span>';
    } else {
      var rest = j.faelligUm - s.zeit;
      var klasse = rest < 0 ? 'spaet' : (rest < j.fensterMin * 0.25 ? 'knapp' : '');
      var was = s.ladung && s.ladung.jobId === j.id
        ? 'geladen → ' + W.ort(j.nach).name
        : 'abholen bei ' + W.ort(j.von).name;
      el.auftrag.innerHTML =
        '<b>' + U.html(D.waren[j.ware].name) + '</b> ' + U.zahl(j.menge - j.geliefert) + ' ' + j.einheit +
        ' · ' + U.html(was) +
        ' · <span class="rest ' + klasse + '">' + (rest < 0 ? 'überfällig seit ' + U.dauer(-rest) : 'noch ' + U.dauer(rest)) + '</span>';
    }

    var g = S.gespann;
    el.kmh.textContent = Math.round(Math.abs(g.v) * 3.6);
    el.gang.textContent = g.v > 0.15 ? 'V' : (g.v < -0.15 ? 'R' : 'N');

    // Zuendung. Steht im Tacho, weil man dort ohnehin hinsieht, wenn sich
    // nichts bewegt.
    var laeuft = S.motorLaeuft(), orgelt = S.motorOrgelt();
    el.motor.textContent = orgelt ? 'Anlasser …' : (laeuft ? 'Motor läuft' : 'Motor aus · I');
    el.motor.className = 'motor' + (laeuft ? ' an' : (orgelt ? ' orgelt' : ' aus'));
    if (s.ladung) {
      var lz = S.ladungsZustand();
      var heil = Math.round((1 - lz.schaden) * 100);
      el.ladung.textContent = U.zahl(s.ladung.menge) + ' ' + D.arten[D.waren[s.ladung.ware].art].einheit + ' ' + D.waren[s.ladung.ware].name +
        (heil < 100 ? ' · ' + heil + ' % heil' : '');
      // Rot, solange sie gerade leidet -- das sieht man aus dem Augenwinkel.
      el.ladung.className = 'ladung voll' + (lz.grund ? ' leidet' : (lz.schaden > 0.15 ? ' angeschlagen' : ''));
    } else {
      var a = S.aktiverAnhaenger();
      el.ladung.textContent = a ? a.spec.name + ', leer' : 'ohne Anhänger';
      el.ladung.className = 'ladung';
    }
  }

  /* ---------------- Lage: Wetter, Ereignisse, Tagesziele ----------------
   * Wird mit der Kopfleiste zehnmal in der Sekunde gerufen; geschrieben wird
   * nur, was sich geaendert hat, sonst flackert die Auswahl im Text. */
  var lageVorher = { w: '', e: '', z: '' };

  function lage() {
    var s = S.state, UW = TG.umwelt;
    var w = UW.wetter(s), vh = UW.vorhersage(s), sz = UW.saison(s);
    var wt = '<span class="zeichen">' + w.zeichen + '</span><b>' + U.html(w.name) + '</b> · ' + U.html(sz.name) +
             ' <span class="schwach">Tag ' + UW.saisonTag(s) + '/' + UW.SAISON_TAGE + '</span>' +
             (vh.spec !== w ? '<span class="schwach"> · danach ' + vh.spec.zeichen + ' ' + U.html(vh.spec.name) + '</span>' : '');
    if (wt !== lageVorher.w) { el.lageWetter.innerHTML = wt; lageVorher.w = wt; }

    var et = UW.laufende(s).map(function (e) {
      return '<div>' + U.html(e.text) + ' <span class="schwach">noch ' + U.dauer(e.rest) + '</span></div>';
    }).join('');
    if (et !== lageVorher.e) { el.lageEreignisse.innerHTML = et; lageVorher.e = et; }

    var zt = '';
    if (s.ziele && s.ziele.liste.length) {
      zt += '<div class="lage-kopf">Tagesziele' + (s.ziele.alle ? ' — alle geschafft' : '') + '</div>';
      s.ziele.liste.forEach(function (z) { zt += '<div class="' + (z.fertig ? 'fertig' : '') + '">' + zielZeile(z) + '</div>'; });
    }
    if (zt !== lageVorher.z) { el.lageZiele.innerHTML = zt; lageVorher.z = zt; }
  }

  function zielStand(z) {
    if (z.art === 'strecke') return U.zahl(z.stand / 1000, 1) + '/' + U.zahl(z.ziel / 1000) + ' km';
    if (z.art === 'tonnen') return U.zahl(z.stand, 1) + '/' + U.zahl(z.ziel) + ' t';
    return U.zahl(z.stand) + '/' + U.zahl(z.ziel);
  }

  function zielZeile(z) {
    return '<span class="haken">' + (z.fertig ? '✓' : '○') + '</span>' + U.html(z.text) +
           ' <span class="schwach">' + (z.fertig ? 'erledigt' : zielStand(z)) + '</span>';
  }

  /* ---------------- Hinweis, Meldung, Fortschritt ---------------- */
  function hinweis(text) {
    if (text === letzterHinweis) return;
    letzterHinweis = text;
    if (!text) { el.hinweis.classList.remove('an'); return; }
    el.hinweis.innerHTML = text;
    el.hinweis.classList.add('an');
  }

  function meldung(text, art) {
    var d = document.createElement('div');
    d.className = 'meldung' + (art ? ' ' + art : '');
    d.textContent = text;
    el.meldungen.appendChild(d);
    setTimeout(function () { d.classList.add('weg'); }, 5200);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 5800);
    while (el.meldungen.children.length > 4) el.meldungen.removeChild(el.meldungen.firstChild);
  }

  function vorgang(daten) {
    if (!daten) { el.fortschritt.classList.add('aus'); return; }
    el.fortschritt.classList.remove('aus');
    el.fsTitel.textContent = daten.text;
    el.fsBalken.style.width = (daten.anteil * 100).toFixed(1) + '%';
  }

  /* =============================================================
   *  Auftragsbörse
   * ============================================================= */
  function besitztAnhaengerArt(art) {
    return S.state.fuhrpark.some(function (f) {
      if (f.typ !== 'anhaenger') return false;
      var sp = D.anhaenger_(f.id);
      return sp && sp.art === art;
    });
  }

  function boerse() {
    var s = S.state;
    var h = '';

    if (s.angenommen.length === 0 && s.stats.auftraege === 0) {
      h += '<div class="hinweisbox">Nimm einen Auftrag an, fahr zum Startpunkt und stell dich in die markierte Zone. ' +
           'Geladen wird von selbst, sobald das Gespann dort steht.</div>';
    }

    if (s.angenommen.length) {
      h += '<div class="ueberschrift">Angenommen (' + s.angenommen.length + ' von ' + S.BAL.maxAuftraege + ')</div>';
      s.angenommen.forEach(function (j) { h += karte(j, true); });
    }

    var liste = s.boerse.slice();
    liste.sort(sortieren);

    // Was von hier losgeht, steht oben. Wer gerade abgeladen hat, soll die
    // Rueckfracht sehen, ohne durch die ganze Liste zu scrollen.
    var hier = S.naheOrt();
    var vonHier = [];
    if (hier) {
      vonHier = liste.filter(function (j) { return j.von === hier.id; });
      liste = liste.filter(function (j) { return j.von !== hier.id; });
    }

    if (vonHier.length) {
      h += '<div class="ueberschrift">Ab ' + U.html(hier.name) + ' — hier stehst du</div>';
      h += '<div class="hinweisbox">Diese Fuhren gehen von hier los. Annehmen, in die Zone stellen, laden — ' +
           'die Rückfahrt muss nicht leer sein.</div>';
      vonHier.forEach(function (j) { h += karte(j, false); });
    }

    h += '<div class="ueberschrift">' + (vonHier.length ? 'Übrige Angebote' : 'Angebote') + '</div>';
    h += '<div class="sortierung"><span class="k">Sortieren:</span>' +
      knopfSort('lohn', 'Bezahlung') + knopfSort('km', 'Entfernung') + knopfSort('zeit', 'Restzeit') + '</div>';

    if (!liste.length && !vonHier.length) h += '<div class="leerhinweis">Gerade liegt nichts aus. Es kommt gleich Neues herein.</div>';
    liste.forEach(function (j) { h += karte(j, false); });
    return h;
  }

  function sortieren(a, b) {
    if (a.einstieg !== b.einstieg) return a.einstieg ? -1 : 1;   // der erste Auftrag steht oben
    if (sortierung === 'lohn') return b.lohn - a.lohn;
    if (sortierung === 'km') return a.meter - b.meter;
    return (a.gueltigBis - S.state.zeit) - (b.gueltigBis - S.state.zeit);
  }

  function knopfSort(id, text) {
    return '<button data-tat="sort" data-wert="' + id + '"' + (sortierung === id ? ' class="aktiv"' : '') + '>' + text + '</button>';
  }

  function karte(j, angenommen) {
    var s = S.state;
    var ware = D.waren[j.ware], art = D.arten[j.art];
    var vonO = W.ort(j.von), nachO = W.ort(j.nach);
    var proKm = j.lohn / (j.meter / 1000);
    var hatAnh = besitztAnhaengerArt(j.art);

    var marken = '';
    var guete = j.guete || 1;
    if (guete < 0.86) marken += '<span class="marke schlecht">mager bezahlt</span> ';
    else if (guete > 1.12) marken += '<span class="marke gut">gut bezahlt</span> ';
    if (j.eilig) marken += '<span class="marke eilig">enges Fenster</span> ';
    if (j.anschluss) marken += '<span class="marke gut">Rückfracht</span> ';
    if (j.sonder) marken += '<span class="marke eilig">Sonderfahrt</span> ';
    if (j.fest) marken += '<span class="marke gut">Fest am Ziel</span> ';
    if (j.saison > 1.05) marken += '<span class="marke gut">' + U.html(TG.umwelt.saison(s).name) + 'sware</span> ';
    else if (j.saison && j.saison < 0.95) marken += '<span class="marke schlecht">wenig gefragt</span> ';
    if (TG.umwelt.NASS_WAREN.indexOf(j.ware) >= 0) marken += '<span class="marke">nässeempfindlich</span> ';
    if (!hatAnh) marken += '<span class="marke schlecht">' + U.html(art.anhaenger) + ' fehlt</span> ';
    if (j.fahrten > 1) marken += '<span class="marke">' + j.fahrten + ' Fahrten</span> ';

    var h = '<div class="karte' + (angenommen ? ' angenommen' : '') + '">';
    h += '<div class="kopf"><span class="ware">' + U.zahl(j.menge) + ' ' + j.einheit + ' ' + U.html(ware.name) + '</span>' +
         '<span class="geld">' + U.geld(j.lohn) + '</span></div>';
    h += '<div class="weg"><b>' + U.html(vonO.name) + '</b> → <b>' + U.html(nachO.name) + '</b></div>';

    h += '<div class="zeilen">';
    h += '<span>Entfernung <b>' + U.strecke(j.meter) + '</b></span>';
    if (angenommen) {
      var rest = j.faelligUm - s.zeit;
      h += '<span>' + (rest < 0 ? 'überfällig <b>' + U.dauer(-rest) + '</b>' : 'Restzeit <b>' + U.dauer(rest) + '</b>') + '</span>';
      if (j.geliefert > 0) h += '<span>geliefert <b>' + U.zahl(j.geliefert) + '/' + U.zahl(j.menge) + '</b></span>';
    } else {
      h += '<span>Zeitfenster <b>' + U.dauer(j.fensterMin) + '</b></span>';
      h += '<span>Angebot läuft <b>' + U.dauer(Math.max(0, j.gueltigBis - s.zeit)) + '</b></span>';
    }
    h += '<span>Satz <b>' + U.zahl(proKm) + ' €/km</b></span>';
    h += '<span>Strafe <b>' + U.geld(j.strafe) + '</b></span>';
    h += '<span>Ruf <b>+' + j.ruf + '</b></span>';
    h += '<span>' + U.html(art.anhaenger) + '</span>';
    h += '</div>';

    if (marken) h += '<div style="margin-bottom:8px">' + marken + '</div>';

    h += '<div class="knopfleiste">';
    if (angenommen) {
      h += '<button class="tat warn" data-tat="abbrechen" data-id="' + j.id + '">Auftrag abbrechen</button>';
    } else {
      var sperre = '', grund = '';
      if (s.angenommen.length >= S.BAL.maxAuftraege) { sperre = ' disabled'; grund = S.BAL.maxAuftraege + ' Aufträge sind das Höchste.'; }
      else if (!hatAnh) { sperre = ' disabled'; grund = 'Dafür fehlt dir ein ' + art.anhaenger + '.'; }
      h += '<button class="tat haupt" data-tat="annehmen" data-id="' + j.id + '"' + sperre + '>Auftrag annehmen</button>';
      if (grund) h += '<span style="align-self:center;color:#9aa68a;font-size:12px">' + U.html(grund) + '</span>';
    }
    h += '</div></div>';
    return h;
  }

  /* =============================================================
   *  Hof
   * ============================================================= */
  function hof() {
    var s = S.state;
    var daheim = S.amHof();
    var h = '';

    if (!daheim) {
      h += '<div class="hinweisbox">Du bist gerade nicht auf dem <b>Hof Lindenbach</b>. ' +
           'Ankoppeln und Reparieren geht nur dort. Fahr hin, dann steht hier alles zur Verfügung.</div>';
    }

    var t = S.aktiverTraktor(), a = S.aktiverAnhaenger();
    h += '<div class="ueberschrift">Gespann</div>';
    h += '<div class="karte"><div class="kopf"><span class="ware">' + U.html(t.spec.name) + '</span>' +
         '<span class="geld">' + Math.round(t.f.zustand) + ' %</span></div>';
    h += '<div class="zeilen"><span>Leistung <b>' + t.spec.ps + ' PS</b></span>' +
         '<span>Höchstgeschwindigkeit <b>' + t.spec.vmax + ' km/h</b></span>' +
         '<span>Diesel <b>' + Math.round(t.f.tank) + ' / ' + Math.round(S.tankGroesse()) + ' l</b></span></div>';
    h += '<div class="weg">Anhänger: <b>' + (a ? U.html(a.spec.name) : 'keiner') + '</b>' +
         (a ? ' · fasst ' + U.zahl(a.spec.kap) + ' ' + D.arten[a.spec.art].einheit : '') + '</div>';
    if (s.ladung) {
      h += '<div class="weg">Geladen: <b>' + U.zahl(s.ladung.menge) + ' ' + U.html(D.waren[s.ladung.ware].name) + '</b></div>';
    }
    h += '</div>';

    // Tanken
    var tk = S.tankKosten();
    h += '<div class="ueberschrift">Tanken</div>';
    h += '<div class="karte"><div class="zeilen"><span>Fehlmenge <b>' + Math.round(tk.liter) + ' l</b></span>' +
         '<span>Preis <b>' + U.zahl(s.dieselPreis, 2) + ' €/l</b></span>' +
         '<span>Kosten <b>' + U.geld(tk.kosten) + '</b></span></div>' +
         '<div class="knopfleiste"><button class="tat haupt" data-tat="tanken"' +
         (tk.liter < 0.5 || !daheim ? ' disabled' : '') + '>Volltanken</button></div></div>';

    // Fuhrpark
    h += '<div class="ueberschrift">Traktoren</div>';
    s.fuhrpark.filter(function (f) { return f.typ === 'traktor'; }).forEach(function (f) {
      h += fahrzeugKarte(f, daheim);
    });

    h += '<div class="ueberschrift">Anhänger</div>';
    var anh = s.fuhrpark.filter(function (f) { return f.typ === 'anhaenger'; });
    if (!anh.length) h += '<div class="leerhinweis">Kein Anhänger im Bestand.</div>';
    anh.forEach(function (f) { h += fahrzeugKarte(f, daheim); });
    if (a) {
      h += '<div class="knopfleiste"><button class="tat" data-tat="abkoppeln"' +
           (daheim && !s.ladung ? '' : ' disabled') + '>Anhänger abkoppeln</button></div>';
    }

    if (s.ausruestung.length) {
      h += '<div class="ueberschrift">Ausrüstung</div>';
      s.ausruestung.forEach(function (id) {
        var x = D.ausruestung_(id);
        if (x) h += '<div class="karte"><div class="kopf"><span class="ware">' + U.html(x.name) + '</span></div>' +
                    '<div class="weg">' + U.html(x.text) + '</div></div>';
      });
    }
    return h;
  }

  function fahrzeugKarte(f, daheim) {
    var s = S.state;
    var spec = f.typ === 'traktor' ? D.traktor(f.id) : D.anhaenger_(f.id);
    var rep = S.reparaturKosten(f);
    var aktiv = f.uid === s.aktivTraktor || f.uid === s.aktivAnhaenger;

    var h = '<div class="karte' + (aktiv ? ' angenommen' : '') + '">';
    h += '<div class="kopf"><span class="ware">' + U.html(spec.name) + (aktiv ? ' · im Einsatz' : '') + '</span>' +
         '<span class="geld">' + Math.round(f.zustand) + ' %</span></div>';
    h += '<div class="balken" style="margin-bottom:8px"><i class="' + (f.zustand < 25 ? 'krit' : f.zustand < 50 ? 'warn' : '') +
         '" style="width:' + f.zustand + '%"></i></div>';

    if (f.typ === 'traktor') {
      h += '<div class="zeilen"><span>Leistung <b>' + spec.ps + ' PS</b></span>' +
           '<span>Tempo <b>' + spec.vmax + ' km/h</b></span>' +
           '<span>Diesel <b>' + Math.round(f.tank) + ' l</b></span></div>';
    } else {
      h += '<div class="zeilen"><span>Für <b>' + U.html(D.arten[spec.art].name) + '</b></span>' +
           '<span>Fasst <b>' + U.zahl(spec.kap) + ' ' + D.arten[spec.art].einheit + '</b></span></div>';
    }

    h += '<div class="knopfleiste">';
    if (!aktiv) {
      h += '<button class="tat" data-tat="' + (f.typ === 'traktor' ? 'traktorwahl' : 'ankoppeln') + '" data-uid="' + f.uid + '"' +
           (daheim ? '' : ' disabled') + '>' + (f.typ === 'traktor' ? 'Aufsteigen' : 'Ankoppeln') + '</button>';
    }
    h += '<button class="tat" data-tat="reparieren" data-uid="' + f.uid + '"' +
         (rep.punkte < 1 || !daheim || s.geld < rep.kosten ? ' disabled' : '') + '>Instandsetzen · ' +
         U.geld(rep.kosten) + ' · ' + U.dauer(rep.minuten) + '</button>';
    h += '</div></div>';
    return h;
  }

  /* =============================================================
   *  Händler
   * ============================================================= */
  function haendler() {
    var s = S.state;
    var da = S.beimHaendler();
    var h = '';
    if (!da) {
      h += '<div class="hinweisbox">Gekauft und verkauft wird bei <b>Landtechnik Vosskamp</b> im Süden der Karte. ' +
           'Ansehen kannst du alles von hier aus.</div>';
    }

    var t = S.aktiverTraktor();
    var stufe = S.stufe();

    h += '<div class="ueberschrift">Traktoren</div>';
    D.traktoren.forEach(function (sp) {
      if (sp.preis <= 0) return;
      h += '<div class="karte">';
      h += '<div class="kopf"><span class="ware">' + U.html(sp.name) + '</span><span class="geld">' + U.geld(sp.preis) + '</span></div>';
      h += '<div class="weg">' + U.html(sp.text) + '</div>';
      h += '<table class="werte">' +
        vergleich('Leistung', sp.ps + ' PS', sp.ps - t.spec.ps) +
        vergleich('Höchstgeschwindigkeit', sp.vmax + ' km/h', sp.vmax - t.spec.vmax) +
        vergleich('Verbrauch', U.zahl(sp.verbrauch, 2) + '×', t.spec.verbrauch - sp.verbrauch) +
        vergleich('Tankgröße', Math.round(sp.tank) + ' l', sp.tank - t.spec.tank) +
        '</table>';
      h += '<div class="knopfleiste"><button class="tat haupt" data-tat="kaufen" data-typ="traktor" data-id="' + sp.id + '"' +
           (!da || s.geld < sp.preis ? ' disabled' : '') + '>Kaufen</button></div></div>';
    });

    h += '<div class="ueberschrift">Anhänger</div>';
    var artOrder = ['schuett', 'palette', 'ballen', 'fluessig', 'fahrzeug', 'holz'];
    artOrder.forEach(function (art) {
      var info = D.arten[art];
      var frei = info.stufe <= stufe;
      var passende = D.anhaenger.filter(function (x) { return x.art === art; });
      h += '<div class="karte' + (frei ? '' : ' gesperrt') + '">';
      h += '<div class="kopf"><span class="ware">' + U.html(info.anhaenger) + '</span>' +
           '<span class="geld">' + (frei ? U.html(info.name) : 'ab Stufe ' + info.stufe) + '</span></div>';
      h += '<div class="weg">' + U.html(info.hinweis) + '</div>';
      h += '<div class="knopfleiste">';
      passende.forEach(function (sp) {
        var besitzt = s.fuhrpark.some(function (f) { return f.typ === 'anhaenger' && f.id === sp.id; });
        h += '<button class="tat" data-tat="kaufen" data-typ="anhaenger" data-id="' + sp.id + '"' +
             (!da || !frei || s.geld < sp.preis ? ' disabled' : '') + '>' +
             U.zahl(sp.kap) + ' ' + info.einheit + ' · ' + U.geld(sp.preis) + (besitzt ? ' (weiterer)' : '') + '</button>';
      });
      h += '</div></div>';
    });

    h += '<div class="ueberschrift">Ausrüstung</div>';
    D.ausruestung.forEach(function (x) {
      var hat = S.hatAusruestung(x.id);
      h += '<div class="karte"><div class="kopf"><span class="ware">' + U.html(x.name) + (hat ? ' · vorhanden' : '') + '</span>' +
           '<span class="geld">' + U.geld(x.preis) + '</span></div>';
      h += '<div class="weg">' + U.html(x.text) + '</div>';
      h += '<div class="knopfleiste"><button class="tat" data-tat="ausruestung" data-id="' + x.id + '"' +
           (hat || !da || s.geld < x.preis ? ' disabled' : '') + '>Kaufen</button></div></div>';
    });

    h += '<div class="ueberschrift">Verkaufen</div>';
    s.fuhrpark.forEach(function (f) {
      var sp = f.typ === 'traktor' ? D.traktor(f.id) : D.anhaenger_(f.id);
      var wert = S.verkaufswert(f);
      h += '<div class="karte"><div class="kopf"><span class="ware">' + U.html(sp.name) + '</span>' +
           '<span class="geld">' + U.geld(wert) + '</span></div>' +
           '<div class="zeilen"><span>Zustand <b>' + Math.round(f.zustand) + ' %</b></span></div>' +
           '<div class="knopfleiste"><button class="tat warn" data-tat="verkaufen" data-uid="' + f.uid + '"' +
           (!da ? ' disabled' : '') + '>Verkaufen</button></div></div>';
    });
    return h;
  }

  function vergleich(name, wert, besser) {
    var k = besser > 0 ? ' class="besser"' : (besser < 0 ? ' class="schlechter"' : '');
    return '<tr><td>' + U.html(name) + '</td><td' + k + '>' + U.html(wert) + '</td></tr>';
  }

  /* =============================================================
   *  Buch
   * ============================================================= */
  function buch() {
    var s = S.state, st = s.stats;
    var h = '';

    h += tagesblatt();

    h += '<div class="ueberschrift">Kasse</div>';
    h += reihe('Kontostand', U.geld(s.geld));
    h += reihe('Dieselpreis', U.zahl(s.dieselPreis, 2) + ' € je Liter');
    h += reihe('Woche', String(S.woche() + 1));
    h += reihe('Laufende Wochenkosten', U.geld(S.wochenrate()));

    h += '<div class="ueberschrift">Kredit</div>';
    h += reihe('Restschuld', U.geld(s.kredit.betrag));
    h += reihe('Rahmen', U.geld(S.BAL.kreditMax - s.kredit.betrag) + ' frei');
    h += reihe('Zins', U.zahl(S.BAL.kreditZins * 100, 1) + ' % je Woche');
    h += '<div class="karte" style="margin-top:10px">';
    h += '<div class="weg">Betrag: <b id="kredit-anzeige">' + U.geld(10000) + '</b></div>';
    h += '<input type="range" id="kredit-schieber" min="5000" max="' + Math.max(5000, S.BAL.kreditMax - s.kredit.betrag) + '" step="5000" value="10000">';
    h += '<div class="knopfleiste" style="margin-top:8px">' +
         '<button class="tat haupt" data-tat="kredit-auf">Aufnehmen</button>' +
         '<button class="tat" data-tat="kredit-tilgen"' + (s.kredit.betrag <= 0 ? ' disabled' : '') + '>Sondertilgung</button>' +
         '</div></div>';

    h += '<div class="ueberschrift">Statistik</div>';
    h += reihe('Gefahrene Strecke', U.zahl(st.meter / 1000, 1) + ' km');
    h += reihe('Transportierte Menge', U.zahl(st.tonnen, 1) + ' t');
    h += reihe('Abgeschlossene Aufträge', U.zahl(st.auftraege));
    h += reihe('Davon pünktlich', U.zahl(st.puenktlich));
    h += reihe('Davon verspätet', U.zahl(st.verspaetet));
    h += reihe('Abgebrochen oder geplatzt', U.zahl(st.abgebrochen));
    h += reihe('Eingenommen', U.geld(st.verdient));
    h += reihe('Ausgegeben', U.geld(st.ausgaben));
    h += reihe('Getankter Diesel', U.zahl(st.diesel, 0) + ' l');
    h += reihe('Abzug für beschädigte Ladung', U.geld(st.schaden || 0));
    h += reihe('Reifenpannen', U.zahl(st.pannen || 0));

    h += '<div class="ueberschrift">Ruf</div>';
    D.stufen.forEach(function (x) {
      var erreicht = s.ruf >= x.ruf;
      h += '<div class="karte' + (erreicht ? ' angenommen' : ' gesperrt') + '">' +
           '<div class="kopf"><span class="ware">Stufe ' + x.stufe + '</span>' +
           '<span class="geld">' + U.zahl(x.ruf) + ' Ruf</span></div>' +
           '<div class="weg">' + U.html(x.frei) + '</div></div>';
    });

    h += '<div class="ueberschrift">Steuerung</div>';
    var mausAn = TG.steuerung && TG.steuerung.istAn();
    h += '<div class="karte">';
    h += '<div class="weg">Mit der Maus lenkt der Traktor dorthin, wo der Zeiger steht. ' +
         'Linke Maustaste gibt Gas, rechte bremst und fährt rückwärts. Die Tasten bleiben ' +
         'daneben in Betrieb. Taste <b>L</b> schaltet um.</div>';
    // Zwei Knoepfe statt eines Schalters: derselbe Umschalter wie im
    // Titelbild, damit an beiden Stellen dasselbe steht.
    h += '<div class="wahl-knoepfe" style="margin-top:8px">' +
         '<button type="button" data-steuerart="tasten"' + (mausAn ? '' : ' class="aktiv"') + '>Tastatur</button>' +
         '<button type="button" data-steuerart="maus"' + (mausAn ? ' class="aktiv"' : '') + '>Maus</button>' +
         '</div>';
    h += '</div>';

    h += '<div class="ueberschrift">Motor</div>';
    h += '<div class="karte">';
    h += '<div class="weg">Der Schlepper startet abgestellt — auch nach dem Weiterspielen. ' +
         'Taste <b>I</b> dreht den Anlasser und stellt ihn wieder ab. Ohne laufenden Motor ' +
         'gibt es keinen Antrieb; bremsen und lenken geht weiter.</div>';
    h += '<div class="knopfleiste" style="margin-top:8px">' +
         '<button class="tat' + (S.motorLaeuft() ? ' haupt' : '') + '" data-tat="motor">' +
         (S.motorLaeuft() || S.motorOrgelt() ? 'Motor abstellen' : 'Motor anlassen') + '</button></div>';
    h += '</div>';

    h += '<div class="ueberschrift">Ton</div>';
    h += '<div class="karte">';
    h += '<div class="weg">Motor, Untergrund und die Geräusche vom Feld. Taste <b>M</b> schaltet um.</div>';
    h += '<div class="knopfleiste" style="margin-top:8px">' +
         '<button class="tat' + (TG.ton.istAn() ? ' haupt' : '') + '" data-tat="ton">' +
         (TG.ton.istAn() ? 'Ton an' : 'Ton aus') + '</button></div>';
    h += '<div class="weg" style="margin-top:8px">Lautstärke: <b id="ton-anzeige">' +
         Math.round(TG.ton.lautstaerke() * 100) + ' %</b></div>';
    h += '<input type="range" id="ton-schieber" min="0" max="100" step="5" value="' +
         Math.round(TG.ton.lautstaerke() * 100) + '">';
    // Der Motor eigens: wer ihn leiser will, soll Wind und Voegel behalten.
    h += '<div class="weg" style="margin-top:8px">Motor: <b id="motor-anzeige">' +
         Math.round(TG.ton.motorLautstaerke() * 100) + ' %</b></div>';
    h += '<input type="range" id="motor-schieber" min="0" max="100" step="5" value="' +
         Math.round(TG.ton.motorLautstaerke() * 100) + '">';
    h += '</div>';

    h += '<div class="ueberschrift">Einweisung</div>';
    h += '<div class="karte"><div class="weg">Der Rundgang vom Titelbild: einmal durch alle Anzeigen, ' +
         'Bildschirme und Handgriffe. Die Uhr steht still, solange er läuft.</div>' +
         '<div class="knopfleiste" style="margin-top:8px"><button class="tat" data-tat="einweisung">Einweisung starten</button></div></div>';

    h += '<div class="trenner"></div>';
    h += '<div class="knopfleiste"><button class="tat warn" data-tat="neuanfang">Spielstand löschen und neu anfangen</button></div>';
    return h;
  }

  /** Oberer Teil des Buchs: Tagesziele, Wetter, Jahreszeit, Ereignisse. */
  function tagesblatt() {
    var s = S.state, UW = TG.umwelt, h = '';

    h += '<div class="ueberschrift">Tagesziele · Tag ' + S.tag() + '</div>';
    h += '<div class="karte" id="buch-ziele">';
    if (!s.ziele || !s.ziele.liste.length) h += '<div class="weg">Heute ist nichts ausgeschrieben.</div>';
    else s.ziele.liste.forEach(function (z) {
      h += '<div class="reihe ziel' + (z.fertig ? ' fertig' : '') + '"><span class="k">' + zielZeile(z) + '</span>' +
           '<span class="v">' + U.geld(z.geld) + ' · +' + z.ruf + '</span></div>';
    });
    h += '<div class="weg" style="margin-top:6px">Alle drei an einem Tag bringen obendrauf ' + U.geld(300) + ' und Ruf +20. ' +
         'Um Mitternacht gibt es neue.</div></div>';

    var w = UW.wetter(s), vh = UW.vorhersage(s), sz = UW.saison(s);
    h += '<div class="ueberschrift">Wetter und Jahreszeit</div>';
    h += '<div class="karte" id="buch-wetter">';
    h += reihe('Wetter', w.zeichen + ' ' + w.name);
    h += reihe('Vorhersage', vh.spec.zeichen + ' ' + vh.spec.name + ' in etwa ' + U.dauer(Math.ceil(vh.in / 15) * 15));
    h += reihe('Jahreszeit', sz.name + ', Tag ' + UW.saisonTag(s) + ' von ' + UW.SAISON_TAGE);
    var wirkung = [];
    if (w.griff < 1) wirkung.push('weniger Halt beim Bremsen und in der Kurve');
    if (w.tempo.feldweg < 1) wirkung.push('Feldwege und Gelände langsamer');
    if (w.nass > 0.5) wirkung.push('Stroh, Heu und Sackware werden ohne Plane nass');
    if (s.wetter.art === 'nebel') wirkung.push('kurze Sicht');
    h += '<div class="weg" style="margin-top:6px">' + U.html(sz.text) +
         (wirkung.length ? ' <b>Gerade:</b> ' + U.html(wirkung.join(', ')) + '.' : '') + '</div>';
    var gefragt = Object.keys(sz.nachfrage).filter(function (k) { return sz.nachfrage[k] > 1; })
      .map(function (k) { return D.waren[k].name + ' +' + Math.round((sz.nachfrage[k] - 1) * 100) + ' %'; });
    if (gefragt.length) h += '<div class="weg" style="margin-top:6px">Gefragt: ' + U.html(gefragt.join(' · ')) + '</div>';
    h += '</div>';

    var lauf = UW.laufende(s);
    if (lauf.length) {
      h += '<div class="ueberschrift">Ereignisse</div><div class="karte">';
      lauf.forEach(function (e) { h += reihe(e.text, 'noch ' + U.dauer(e.rest)); });
      h += '</div>';
    }
    return h;
  }

  function reihe(k, v) {
    return '<div class="reihe"><span class="k">' + U.html(k) + '</span><span class="v">' + U.html(v) + '</span></div>';
  }

  /* =============================================================
   *  Kartenbildschirm
   *
   *  Gezeichnet wird mit `TG.zeichnen.karte()` — derselben Routine wie die
   *  Minikarte. Hier steht nur, welchen Ausschnitt sie bekommt und wie man
   *  ihn mit Rad und Maus verschiebt.
   *
   *  Die Uhr steht still, solange ein Panel offen ist, also gibt es keine
   *  Schleife: gezeichnet wird beim Oeffnen und nach jeder Eingabe.
   * ============================================================= */
  var kartenBlick = null;        // { x, y, spanne } in Metern, null = ganze Karte
  var KARTE_MIN = 70, KARTE_MAX = 720;
  // Griffe fuer die Knoepfe in der Leiste; `karteAufbauen()` setzt sie neu,
  // weil die Leinwand bei jedem Oeffnen des Panels eine andere ist.
  var karteMalen = function () {};
  var karteGanz = function () { return { x: W.GROESSE / 2, y: W.GROESSE / 2, spanne: KARTE_MAX }; };

  function kartenblatt() {
    var h = '';
    h += '<canvas id="kartenblatt"></canvas>';
    h += '<div class="karten-leiste">' +
         '<button class="tat" data-tat="karte-alles">Ganze Karte</button>' +
         '<button class="tat" data-tat="karte-gespann">Zum Gespann</button>' +
         '<span class="karten-mass" id="karten-mass"></span>' +
         '</div>';
    h += '<div class="karten-legende">' +
         '<span><i style="background:#8d8d84"></i>Landstraße</span>' +
         '<span><i style="background:#8e7a52"></i>Feldweg</span>' +
         '<span><i style="background:#9ede63;border-radius:50%;width:8px;height:8px"></i>eigener Hof</span>' +
         '<span><i style="background:#e8c14a;border-radius:50%;width:8px;height:8px"></i>Ziel des Auftrags</span>' +
         '<span><i style="background:#ff6b4a;border-radius:50%;width:8px;height:8px"></i>Gespann</span>' +
         '</div>';
    h += '<div class="karten-hinweis">Rad zieht heran, Ziehen verschiebt, Doppelklick zeigt wieder alles. ' +
         'Ortsnamen weichen einander aus — wo es eng wird, bleibt das Auftragsziel stehen.</div>';
    return h;
  }

  function karteAufbauen() {
    var leinwand = $('kartenblatt');
    if (!leinwand) return;

    if (!kartenBlick) kartenBlick = ganzeKarte();

    function ganzeKarte() {
      return { x: W.GROESSE / 2, y: W.GROESSE / 2, spanne: KARTE_MAX };
    }

    function malen() {
      // Die Aufloesung erst hier setzen: vor dem Einhaengen ins Dokument hat
      // die Leinwand noch keine Breite.
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var bp = leinwand.clientWidth, hp = leinwand.clientHeight;
      if (!bp || !hp) return;
      if (leinwand.width !== Math.round(bp * dpr)) {
        leinwand.width = Math.round(bp * dpr);
        leinwand.height = Math.round(hp * dpr);
      }
      var k = leinwand.getContext('2d');
      k.setTransform(dpr, 0, 0, dpr, 0, 0);
      begrenzen();
      TG.zeichnen.karte(k, bp, hp, kartenBlick, kartenBlick.spanne, S,
        { namen: true, zielLinie: true });
      var mass = $('karten-mass');
      if (mass) mass.textContent = 'Bildausschnitt ' + U.strecke(kartenBlick.spanne);
    }

    /* Der Ausschnitt darf nicht neben der Karte stehen. Ist er groesser als
     * die Karte, wird sie mittig gezeigt, sonst haengt sie in der Ecke. */
    function begrenzen() {
      var b = kartenBlick;
      b.spanne = U.clamp(b.spanne, KARTE_MIN, KARTE_MAX);
      var hw = b.spanne / 2;
      if (hw * 2 >= W.GROESSE) { b.x = W.GROESSE / 2; }
      else b.x = U.clamp(b.x, hw, W.GROESSE - hw);
      var hh = hw * (leinwand.clientHeight / Math.max(1, leinwand.clientWidth));
      if (hh * 2 >= W.GROESSE) { b.y = W.GROESSE / 2; }
      else b.y = U.clamp(b.y, hh, W.GROESSE - hh);
    }

    function zuWelt(e) {
      var r = leinwand.getBoundingClientRect();
      var m = r.width / kartenBlick.spanne;
      return {
        x: (e.clientX - r.left - r.width / 2) / m + kartenBlick.x,
        y: (e.clientY - r.top - r.height / 2) / m + kartenBlick.y
      };
    }

    leinwand.addEventListener('wheel', function (e) {
      e.preventDefault();
      // Um den Zeiger herum zoomen, nicht um die Bildmitte: sonst rutscht das,
      // was man ansieht, beim Heranziehen aus dem Bild.
      var vorher = zuWelt(e);
      kartenBlick.spanne = U.clamp(kartenBlick.spanne * (e.deltaY > 0 ? 1.22 : 0.82), KARTE_MIN, KARTE_MAX);
      var nachher = zuWelt(e);
      kartenBlick.x += vorher.x - nachher.x;
      kartenBlick.y += vorher.y - nachher.y;
      malen();
    }, { passive: false });

    var zieht = null;
    leinwand.addEventListener('pointerdown', function (e) {
      zieht = { welt: zuWelt(e) };
      leinwand.classList.add('zieht');
      leinwand.setPointerCapture(e.pointerId);
    });
    leinwand.addEventListener('pointermove', function (e) {
      if (!zieht) return;
      var jetzt = zuWelt(e);
      kartenBlick.x += zieht.welt.x - jetzt.x;
      kartenBlick.y += zieht.welt.y - jetzt.y;
      malen();
    });
    function loslassen() { zieht = null; leinwand.classList.remove('zieht'); }
    leinwand.addEventListener('pointerup', loslassen);
    leinwand.addEventListener('pointercancel', loslassen);
    leinwand.addEventListener('dblclick', function () { kartenBlick = ganzeKarte(); malen(); });

    karteMalen = malen;
    karteGanz = ganzeKarte;
    malen();
  }


  /* =============================================================
   *  Eingaben in den Panels
   * ============================================================= */
  function schieber(e) {
    if (e.target.id === 'kredit-schieber') {
      var a = document.getElementById('kredit-anzeige');
      if (a) a.textContent = U.geld(Number(e.target.value));
    }
    if (e.target.id === 'ton-schieber') {
      var v = Number(e.target.value);
      TG.ton.setzeLautstaerke(v / 100);
      var t = document.getElementById('ton-anzeige');
      if (t) t.textContent = v + ' %';
    }
    if (e.target.id === 'motor-schieber') {
      var mv = Number(e.target.value);
      TG.ton.setzeMotorLautstaerke(mv / 100);
      var ma = document.getElementById('motor-anzeige');
      if (ma) ma.textContent = mv + ' %';
    }
  }

  function klick(e) {
    // Der Umschalter Tastatur/Maus traegt kein data-tat, sondern dieselbe
    // Kennung wie der im Titelbild.
    var w = e.target.closest ? e.target.closest('[data-steuerart]') : null;
    if (w) {
      var willMaus = w.getAttribute('data-steuerart') === 'maus';
      if (TG.steuerung.art() !== w.getAttribute('data-steuerart')) {
        TG.steuerung.setzen(w.getAttribute('data-steuerart'));
        meldung(willMaus
          ? 'Maussteuerung an: lenken zum Zeiger, linke Maustaste Gas, rechte Bremse.'
          : 'Tastatursteuerung an. Gelenkt wird mit den Pfeiltasten.');
      }
      zeichnen();
      return;
    }

    var b = e.target.closest ? e.target.closest('[data-tat]') : null;
    if (!b || b.disabled) return;
    var tat = b.getAttribute('data-tat');
    var s = S.state;
    var erg;

    // Die Taten des Pruefstands tragen alle das Kuerzel `p-` und werden
    // druebengeschickt, damit der Entwicklermodus fuer sich bleibt.
    if (TG.entwickler && TG.entwickler.klick(b, meldung)) {
      zeichnen();
      kopfleiste();
      return;
    }

    if (tat === 'sort') { sortierung = b.getAttribute('data-wert'); zeichnen(); return; }
    if (tat === 'karte-alles') { kartenBlick = karteGanz(); karteMalen(); return; }
    if (tat === 'karte-gespann') {
      var gp = S.gespann;
      kartenBlick = { x: gp.x, y: gp.y, spanne: 170 };
      karteMalen();
      return;
    }
    if (tat === 'ton') { TG.ton.umschalten(); zeichnen(); return; }
    if (tat === 'einweisung') {
      if (TG.anleitung) TG.anleitung.starten({ ausSpiel: true });
      return;
    }
    if (tat === 'maus') {
      meldung(TG.steuerung.umschalten()
        ? 'Maussteuerung an: lenken zum Zeiger, linke Maustaste Gas, rechte Bremse.'
        : 'Maussteuerung aus. Gelenkt wird wieder mit den Pfeiltasten.');
      zeichnen();
      return;
    }
    if (tat === 'motor') {
      if (S.motorLaeuft() || S.motorOrgelt()) { S.motorAbstellen(false); meldung('Motor aus.'); }
      else {
        erg = S.motorStarten();
        if (!erg.ok) meldung(erg.grund, 'schlecht');
      }
      zeichnen();
      return;
    }

    if (tat === 'annehmen') {
      var j = s.boerse.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
      if (j) {
        erg = S.annehmen(j);
        if (erg.ok) meldung('Angenommen: ' + D.waren[j.ware].name + ' nach ' + W.ort(j.nach).name + '. Zeit bis ' + U.uhrzeit(j.faelligUm) + '.', 'gut');
        else meldung(erg.grund, 'schlecht');
      }
    } else if (tat === 'abbrechen') {
      var a = s.angenommen.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
      if (a) S.abbrechen(a);
    } else if (tat === 'tanken') {
      erg = S.tanken();
      meldung(erg.ok ? 'Getankt: ' + Math.round(erg.liter) + ' l für ' + U.geld(erg.kosten) + '.' : erg.grund, erg.ok ? 'gut' : 'schlecht');
    } else if (tat === 'reparieren') {
      erg = S.reparieren(S.fahrzeug(b.getAttribute('data-uid')));
      meldung(erg.ok ? 'Instand gesetzt für ' + U.geld(erg.kosten) + '. Hat ' + U.dauer(erg.minuten) + ' gedauert.' : erg.grund, erg.ok ? 'gut' : 'schlecht');
    } else if (tat === 'ankoppeln') {
      erg = S.ankoppeln(b.getAttribute('data-uid'));
      if (!erg.ok) meldung(erg.grund, 'schlecht');
    } else if (tat === 'traktorwahl') {
      S.traktorWechseln(b.getAttribute('data-uid'));
    } else if (tat === 'abkoppeln') {
      erg = S.abkoppeln();
      if (!erg.ok) meldung(erg.grund, 'schlecht');
    } else if (tat === 'kaufen') {
      erg = S.kaufen(b.getAttribute('data-typ'), b.getAttribute('data-id'));
      if (erg.ok) {
        var sp = b.getAttribute('data-typ') === 'traktor' ? D.traktor(b.getAttribute('data-id')) : D.anhaenger_(b.getAttribute('data-id'));
        meldung(sp.name + ' gekauft.', 'gut');
      } else meldung(erg.grund, 'schlecht');
    } else if (tat === 'verkaufen') {
      erg = S.verkaufen(S.fahrzeug(b.getAttribute('data-uid')));
      meldung(erg.ok ? 'Verkauft für ' + U.geld(erg.wert) + '.' : erg.grund, erg.ok ? 'gut' : 'schlecht');
    } else if (tat === 'ausruestung') {
      erg = S.kaufeAusruestung(b.getAttribute('data-id'));
      if (!erg.ok) meldung(erg.grund, 'schlecht');
    } else if (tat === 'kredit-auf') {
      var sch = document.getElementById('kredit-schieber');
      erg = S.kreditAufnehmen(Number(sch.value));
      meldung(erg.ok ? U.geld(Number(sch.value)) + ' aufgenommen. Die Rate läuft ab nächster Woche.' : erg.grund, erg.ok ? 'gut' : 'schlecht');
    } else if (tat === 'kredit-tilgen') {
      var sch2 = document.getElementById('kredit-schieber');
      erg = S.kreditTilgen(Number(sch2.value));
      meldung(erg.ok ? U.geld(erg.betrag) + ' getilgt.' : erg.grund, erg.ok ? 'gut' : 'schlecht');
    } else if (tat === 'neuanfang') {
      if (window.confirm('Spielstand wirklich löschen? Das lässt sich nicht rückgängig machen.')) {
        S.loeschen();
        window.location.reload();
        return;
      }
    }

    zeichnen();
    kopfleiste();
  }

  return {
    start: start, oeffnen: oeffnen, schliessen: schliessen, umschalten: umschalten,
    istOffen: istOffen, zeichnen: zeichnen, kopfleiste: kopfleiste,
    hinweis: hinweis, meldung: meldung
  };
})();
