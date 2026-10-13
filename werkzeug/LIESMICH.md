# Werkzeug

Gehört nicht zum Spiel.

## Bilddateien

Zwei Wegwerfskripte, die die Bilddateien der Webseite erzeugen, damit man sie
später ändern kann statt neu zu malen.

    python werkzeug/vorschau_bauen.py   # vorschau.png, 1200x630
    python werkzeug/symbole_bauen.py    # symbol-180/192/512.png

Beide schreiben ins aktuelle Verzeichnis, also aus dem Wurzelverzeichnis des
Projekts aufrufen. Sie brauchen nur Python selbst — auf diesem Rechner war
keine Bildbibliothek vorhanden, deshalb malen sie Polygone von Hand und
schreiben die PNG-Datei über `zlib` selbst zusammen. Das ist langsam
(gut eine Minute für die Vorschau) und genau einmal im Jahr nötig.

`symbole_bauen.py` bildet `favicon.svg` nach. Wer das Symbol ändert, muss
beides anfassen.

## Motor einstellen — `klang.html`

Im Browser öffnen (über den Entwicklungsserver, nicht per Doppelklick — die
Seite lädt `../js/sound.js`). Fahrzustand links einstellen, Ton einschalten,
an den Reglern drehen, unten „Werte abholen“ und das Ergebnis in `KLANG` oben
in `js/sound.js` übernehmen.

Die Seite zeigt je nach Bauart etwas anderes an: rechnet das Spiel den Motor
selbst, gibt es Regler für die Resonanzen und die Anregung; steckt eine
Aufnahme drin, gibt es stattdessen Pegel, Hochpass und die Bezugsdrehzahlen.

Werte, die im vorberechneten Puffer stecken — Brenndauer, Druckberg, Nageln —
wirken erst nach „Puffer neu berechnen“. Die Seite lädt dazu neu und holt die
Werte aus dem `localStorage` zurück.

Der Lautstärkeregler ganz oben ist derselbe wie im Spiel (`landfracht_ton`).
Wer ihn hier verstellt, verstellt ihn dort mit.

## Echte Motoraufnahmen — `klang_einbetten.py`

Bettet Klangdateien ins Spiel ein. Das Spiel benutzt sie dann statt des
gerechneten Motors; ohne sie rechnet es weiter wie bisher.

    python werkzeug/klang_einbetten.py leerlauf.ogg:800 volllast.ogg:2100
    python werkzeug/klang_einbetten.py --entfernen

Jedes Argument ist `Datei:Drehzahl` — die Drehzahl, mit der der Motor in
*dieser* Aufnahme läuft. Sie muss nicht stimmen, sie legt nur fest, bei
welcher Spieldrehzahl die Aufnahme unverstimmt läuft. Zu hoch angesetzt heißt
zu tief im Spiel und umgekehrt; der Regler „Bezugsdrehzahl“ in `klang.html`
stellt das am Ohr nach und gibt am Ende die Zahlen für den nächsten Aufruf
aus.

Das Skript schreibt `js/klang_motor.js` und trägt es in `index.html` und
`klang.html` ein. Eingetragen wird es nur, wenn es auch eine Aufnahme gibt —
ein fest verdrahtetes Skript wäre ohne Aufnahme ein 404 in der Konsole, den
man für einen echten Fehler hält.

### Warum base64 statt einer Datei daneben

Das Spiel soll aus dem Dateisystem laufen, und ein `fetch()` auf eine Datei
ist unter `file://` gesperrt. Als Skript eingebettet lädt der Browser die
Aufnahme wie jedes andere Skript. Der Preis ist ein Drittel mehr Größe und
dass jeder Besucher der Webseite die Aufnahme mitlädt, bevor er das Spiel
sieht — drei bis vier Sekunden Motor bei 96 kbit/s mono reichen dafür
vollkommen, das sind pro Aufnahme etwa 50 kB.

### Wie viele Aufnahmen

Eine reicht, wird aber an den Rändern unsauber: eine Aufnahme über den ganzen
Bereich zu verstimmen zieht die Resonanzen des Motorblocks mit hoch, und
jenseits von etwa dem Anderthalbfachen klingt das nach Spielzeug. Zwei bis
drei über den Bereich 750 bis 2100/min verteilt sind der übliche Kompromiss;
das Spiel blendet zwischen ihnen über.

### Lizenz

Das ist der Teil, an dem es tatsächlich hängt. Aufnahmen aus fremden Mods,
aus Videos oder von kommerziellen Klangbibliotheken dürfen nicht in ein
Projekt, das öffentlich auf einer Webseite liegt. Brauchbare Quellen mit
klarer Lizenz:

* **freesound.org** — beim Suchen auf die Lizenz filtern. `Creative Commons 0`
  ist bedingungslos, `Attribution` verlangt eine Namensnennung.
* **pixabay.com** unter Sound Effects — eigene Lizenz, Nutzung frei.
* **commons.wikimedia.org** — meist CC BY-SA, Namensnennung und gleiche
  Lizenz für das Ergebnis.

Suchbegriffe, die etwas bringen: `tractor idle`, `diesel engine loop`,
`traktor motor`. Brauchbar ist eine Aufnahme mit gleichbleibender Drehzahl,
ohne Wind, ohne Stimmen, mindestens drei Sekunden lang. Mono genügt.

**Quelle und Lizenz jeder verwendeten Aufnahme gehören hier hinein**, sonst
weiß in einem Jahr niemand mehr, was eingebettet ist und unter welchen
Bedingungen:

| Datei | Drehzahl | Quelle | Lizenz |
|-------|----------|--------|--------|
| _(noch nichts eingebettet)_ | | | |
