# Landfracht

Ein Browserspiel über ein kleines landwirtschaftliches Transportunternehmen.
Reines HTML, CSS und JavaScript, kein Server, kein Login, kein Framework.

## Hochladen

Den ganzen Ordner in ein Verzeichnis der Webseite kopieren, fertig. Es genügt
auch ein Doppelklick auf `index.html` — die Skripte sind bewusst keine
ES-Module, damit das Spiel auch direkt von der Festplatte läuft. Einzige
Ausnahme ist `manifest.webmanifest`, das nur über einen Server greift; ohne
ihn fehlt lediglich das Symbol beim Ablegen auf dem Startbildschirm.

Schritt für Schritt, von der Anmeldung bis zur eigenen Adresse, steht in
[VEROEFFENTLICHEN.md](VEROEFFENTLICHEN.md).

Der Spielstand liegt im `localStorage` unter `landfracht_v1` und wird nach
jedem Auftrag, alle 20 Sekunden und beim Verlassen der Seite geschrieben —
aber erst, nachdem das Titelbild weggeklickt wurde. Wer nur kurz reinschaut
und die Seite wieder schließt, hinterlässt keinen Stand.

## Steuerung

| Taste | Wirkung |
|---|---|
| Pfeil hoch / W | Gas. Aus dem Rückwärtsgang heraus zuerst bremsen. |
| Pfeil runter / S | Bremsen, im Stand rückwärts |
| Pfeil links, rechts / A, D | Lenken |
| Leertaste | Handbremse |
| B, H, K, U | Börse, Hof, Händler, Buch |
| E | Tanken an der Tankstelle, Kanister bei leerem Tank |
| M | Ton an und aus |
| Mausrad, + / − | Zoom |
| Esc | Bildschirm schließen |
| Enter, Leertaste | Auf dem Titelbild: losfahren |

Auf Geräten ohne Tastatur erscheinen vier Schaltflächen zum Fahren.

## Ablauf

Aufträge kommen aus der Börse, bis zu drei gleichzeitig. Zum Laden fährt man
in die markierte Zone am Startpunkt und hält an; geladen und abgeladen wird
von selbst, mit Fortschrittsbalken. Zonen für Paletten und Fahrzeuge sind eng
und verlangen, dass das Gespann gerade darin steht.

Ruf ist die eigentliche Fortschrittswährung. Er schaltet Auftragsarten frei,
Geld schaltet das Gerät frei, mit dem man sie fahren kann.

## Aufbau der Dateien

| Datei | Inhalt |
|---|---|
| `js/util.js` | Rechen- und Formatierhilfen |
| `js/data.js` | Waren, Auftragsarten, Traktoren, Anhänger, Ruf-Stufen |
| `js/world.js` | Karte: Wege, Orte, Gebäude, Ladezonen, Untergrundabfrage |
| `js/physics.js` | Fahrverhalten von Traktor und Anhänger |
| `js/jobs.js` | Erzeugung und Bewertung der Aufträge |
| `js/game.js` | Spielzustand, Wirtschaft, Laden/Abladen, Speichern |
| `js/render.js` | Zeichnen von Karte, Gespann und Minikarte |
| `js/ui.js` | Kopfleiste, Meldungen, die vier Bildschirme |
| `js/sound.js` | Motor, Umgebung und Signale, alles zur Laufzeit erzeugt |
| `js/main.js` | Titelbild, Eingaben, Spielschleife, Kontexthinweise |

Dazu die Beiwerksdateien der Webseite: `favicon.svg` und `symbol-*.png` als
Symbole, `manifest.webmanifest` fürs Ablegen auf dem Handy-Startbildschirm,
`vorschau.png` als Bild in Linkvorschauen. Alle drei PNG-Dateien und
`vorschau.png` sind erzeugte Dateien, keine Handarbeit.

`.claude/launch.json` startet nur einen lokalen Testserver und wird zum
Betrieb nicht gebraucht.

## An welchen Schrauben man dreht

**Tempo der Uhr** — `ZEITFAKTOR` in `js/game.js`. Spielminuten je echter
Minute. Steht auf 40, ein Spieltag dauert damit rund 36 echte Minuten.

Ein höherer Wert macht die Tage kürzer, lässt aber die Zeitfenster
unglaubwürdig werden: Fährt man eine Strecke wirklich ab, kostet das echte
Minuten. Bei 120 — also zwölf Minuten je Spieltag — verschlingt eine einzige
Fuhre einen halben Spieltag und die Börse bietet Aufträge mit „Zeitfenster
79 Std" an. Wer kürzere Tage will, sollte die Karte gleichzeitig enger
zusammenrücken.

**Höhe der Fuhrlöhne** — `TARIF` in `js/jobs.js`. Multipliziert alle
Bezahlungen. Die Verhältnisse der Waren zueinander stehen als `satz` in
`js/data.js`.

**Diesel, Verschleiß, Reparatur, Kredit** — das Objekt `BAL` oben in
`js/game.js`.

**Ton** — `js/sound.js`. Es gibt keine Klangdateien, alles entsteht im
Browser: der Motor aus einem Grundton auf der Zündfrequenz mit Oberwellen,
Untergrund und Wind aus gefiltertem Rauschen. Die Drehzahl läuft über ein
gedachtes Getriebe mit vier Gängen, deshalb hört man das Hochschalten. Die
Lautstärke steht im Buch und liegt getrennt vom Spielstand unter
`landfracht_ton` im `localStorage`. Schrauben: `GAENGE` und die Zeile
`var f = 26 + 62 * dreh` für die Motortonlage, die `verstaerker(...)`-Werte
im Aufbau für die Mischung.

**Fahrgefühl** — `LENK_MAX`, `LENK_RATE`, `KNICK_MAX` und `KUPPLUNG` oben in
`js/physics.js`. `KNICK_MAX` ist der Winkel, ab dem der Anhänger quersteht.

**Karte** — `wege`, `felder` und `orte` in `js/world.js`. Ein Ort braucht
`gebaeude` (nur Optik und Kollision), `zonen` (wo geladen wird) sowie `gibt`
und `nimmt` (welche Waren dort abgeholt und abgeliefert werden). Daraus baut
die Auftragsbörse ihre Fahrten selbst zusammen; neue Orte oder Waren muss man
nirgends sonst nachtragen.

## Stand der Umsetzung

Fertig sind Stufe 1 und Stufe 2 aus der Vorgabe:

* Karte mit elf Orten, Landstraßen und Feldwegen, Kamera folgt dem Gespann
* Fahren mit Anhängerphysik, Einknicken, Rückwärtsrangieren
* Laden und Abladen in Zonen, enge Zonen für Paletten und Fahrzeuge
* Auftragsbörse mit Zufallsaufträgen, Sortierung, absichtlich mageren Angeboten
* Ruf und Stufen, sechs Auftragsarten, Freischaltung nach Stufe
* Händler für Traktoren, Anhänger und Ausrüstung, Verkauf mit Zustandsabschlag
* Diesel mit Wochenpreis, Verschleiß, Reparatur, Strafen, Kredit
* Speichern im Browser, Statistik, Buch
* Ton: Motor mit Last und Drehzahl, Untergrund, Wind, Vögel, kurze Signale

Noch offen sind Stufe 3 (Wetter, Saisonen, Ereignisse, Ladungsschaden,
Tagesziele) und Stufe 4 (angestellte Fahrer, Halle, zweite Region,
Stammkunden). Die Haken dafür sind angelegt: `kurve` je Anhänger für den
Ladungsschaden, `querBeschl` im Gespann, `pruefeWoche` für den Wochenrhythmus.
