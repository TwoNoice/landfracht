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
| I | Motor anlassen und abstellen |
| Pfeil hoch / W | Gas. Aus dem Rückwärtsgang heraus zuerst bremsen. |
| Pfeil runter / S | Bremsen, im Stand rückwärts |
| Pfeil links, rechts / A, D | Lenken |
| Leertaste | Handbremse |
| B, H, K, U | Börse, Hof, Händler, Buch |
| N | Karte |
| E | Tanken an der Tankstelle, Kanister bei leerem Tank |
| L | Zwischen Tastatur- und Maussteuerung umschalten |
| M | Ton an und aus |
| Mausrad, + / − | Zoom |
| Esc | Bildschirm schließen |
| Enter, Leertaste | Auf dem Titelbild: losfahren |

Auf Geräten ohne Tastatur erscheinen vier Schaltflächen zum Fahren.

### Zündung

Der Schlepper steht abgestellt da — bei einem neuen Spiel wie beim
Weiterspielen. **I** dreht den Anlasser, nach gut einer Sekunde springt der
Motor an; dieselbe Taste stellt ihn wieder ab. Ohne laufenden Motor gibt es
keinen Antrieb und keinen Verbrauch, gebremst und gelenkt wird weiter, damit
ein rollendes Gespann sich noch abfangen lässt. Geht der Tank leer, geht auch
der Motor aus. Im Tacho steht, was er gerade tut.

### Steuerung wählen

Tastatur oder Maus wird auf dem Titelbild umgeschaltet, im Buch unter
„Steuerung" und jederzeit mit **L**. Voreingestellt ist die Tastatur.

### Maussteuerung

Sie kommt zur Tastatur dazu, sie ersetzt sie nicht: eingeschaltet lenkt der
Traktor dorthin, wo der Zeiger steht, und alle Tasten bleiben scharf. Wer eine
Pfeiltaste drückt, lenkt damit — solange sie gedrückt ist, hat sie Vorrang vor
dem Zeiger.

| Maus | Wirkung |
|---|---|
| Bewegen | Lenken zum Zeiger. Direkt am Gespann wird nicht gelenkt. |
| Linke Taste | Gas |
| Rechte Taste | Bremsen, im Stand rückwärts |

Rückwärts richtet sich das Heck auf den Zeiger aus, nicht die Motorhaube —
sonst würde der Zeiger beim Rangieren schieben statt zu ziehen. Eine
gestrichelte Leine vom Traktor zum Fadenkreuz zeigt, wohin gelenkt wird.

Die Einstellung liegt getrennt vom Spielstand unter `landfracht_steuerung` im
`localStorage`. Auf einem Gerät ohne Maus bleibt sie aus, solange sie nicht
ausdrücklich eingeschaltet wurde.

### Karte

**N** oder der Knopf *Karte* öffnet das Kartenblatt: das ganze Land auf einem
Bild, mit Wegen, Schlägen, Tümpeln, Ortsnamen, der eigenen Position und dem
Ziel des angenommenen Auftrags. Das Rad zieht heran, Ziehen verschiebt,
Doppelklick zeigt wieder alles. Die Uhr steht still, solange das Blatt offen
ist — wie bei den anderen Bildschirmen auch.

Gezeichnet wird es von derselben Routine wie die Minikarte unten rechts, nur
mit anderem Ausschnitt. Ortsnamen weichen einander aus: wo es eng wird, bleibt
das Auftragsziel stehen und Entbehrliches fällt weg. Herangezoomt stehen die
vollen Namen da, in der Übersicht die kurzen.

## Ablauf

Aufträge kommen aus der Börse, bis zu fünf gleichzeitig. Zum Laden fährt man
in die markierte Zone am Startpunkt und hält an; geladen und abgeladen wird
von selbst, mit Fortschrittsbalken. Zonen für Paletten und Fahrzeuge sind eng
und verlangen, dass das Gespann gerade darin steht.

Nach jeder Lieferung entsteht am Zielort Rückfracht: die Börse sorgt dafür,
dass dort mindestens drei Fuhren losgehen, und stellt sie beim Öffnen unter
„Ab hier" nach oben. So muss die Rückfahrt nicht leer sein. Was an einem Ort
angeboten wird, hängt an dessen `gibt`-Liste und an der Ruf-Stufe — ein Ort,
der nur Paletten abgibt, hat auf Stufe 1 nichts anzubieten.

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
| `js/render.js` | Zeichnen von Gelände, Gespann, Minikarte und Kartenblatt |
| `js/ui.js` | Kopfleiste, Meldungen, die fünf Bildschirme |
| `js/entwickler.js` | Prüfstand: der Entwicklermodus (Strg+Alt+E) |
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

Genau das ist einmal geschehen: die Karte ist auf 0,24 gestaucht worden, von
3000 auf 720 Meter Kantenlänge. `ZEITFAKTOR` blieb dabei absichtlich stehen.
Was man je Spieltag verdient, hat sich dadurch kaum verschoben — eine Fuhre
kostet jetzt rund ein Drittel der Spielminuten und bringt rund ein Drittel des
Lohns, weil der Fuhrlohn überwiegend an der Entfernung hängt.

**Tempo der Traktoren** — `vmax` je Traktor in `js/data.js`, in km/h auf der
Straße: 40, 48, 57 und 67. Das Tempo gehört zur Größe der Karte. Auf der alten,
viermal weiteren Karte war 45 km/h die Untergrenze, unter der sich jede Fuhre
zog; bei rund 430 Metern Schnittstrecke ist auch der Hoftraktor damit in
weniger als einer Minute am Ziel. Verschleiß und Ladung kosten zusammen
höchstens 13 % Spitze (`physics.js`), der durchgefahrene Schlepper mit voller
Mulde läuft also noch 35. Auf dem Feldweg sind es rund 27, im Gelände 17 —
dafür sorgt `speed` je Untergrund in `js/world.js`.

Wer daran dreht, zieht zwei Zahlen mit. `PLANTEMPO` in `js/jobs.js` (24) ist
das Tempo, mit dem die Börse ihre Zeitfenster rechnet — nicht die Spitze:
nachgemessen kommt der beladene Hoftraktor über das ganze Netz auf 28 km/h,
obwohl er 38 könnte, weil zwischen zwei Kurven kein Platz mehr zum Ausfahren
ist. Steht es zu niedrig, verschenkt die Börse Zeit und keine Frist ist mehr
eine Frist. Und die Fahrbahnbreiten in `js/world.js`: je schneller das
Gespann, desto weiter trägt es in der Kurve nach außen, desto breiter muss die
Fahrbahn sein.

**Höhe der Fuhrlöhne** — `TARIF` in `js/jobs.js`. Multipliziert alle
Bezahlungen. Die Verhältnisse der Waren zueinander stehen als `satz` in
`js/data.js`.

**Umfang der Börse** — `BOERSE_MIN` und `BOERSE_MAX` in `js/jobs.js` sagen,
wie viele Angebote gleichzeitig ausliegen (12 bis 16). `anschluss()` daneben
füllt einen einzelnen Ort auf und wird nach jeder Lieferung für das Ziel
gerufen; wie viele Aufträge man gleichzeitig führen darf, steht als
`maxAuftraege` in `BAL` (`js/game.js`).

**Diesel, Verschleiß, Reparatur, Kredit** — das Objekt `BAL` oben in
`js/game.js`.

**Ton** — `js/sound.js`. Es gibt keine Klangdateien, alles entsteht im
Browser. Der Motor ist dabei nicht als Klang gebaut, sondern als Anregung und
Körper: eine vorberechnete Folge von Verbrennungsschlägen läuft durch feste
Resonanzen, die nach jedem Schlag ausklingen. Im Leerlauf hört man die
einzelnen Schläge, unter Last verschmelzen sie zum Knurren — das stellt sich
von selbst ein. Dazu das Pfeifen des Laders und ein leises Getriebeheulen;
Untergrund und Wind aus gefiltertem Rauschen.

Unterhalb von 120 Hz liegt fast nichts. Die Drehzahl hört das Ohr an der
Wiederholrate der Schläge, nicht an einem Grundton — deshalb braucht es den
Bass nicht, der vorher alles zugedeckt hat.

Vorbild ist ein aufgeladener Sechszylinder-Reihendiesel mit knapp sieben
Litern: Leerlauf 756/min, Nenndrehzahl gut 2100/min. Sechs Zylinder zünden
dreimal je Umdrehung, die Zündfrequenz ist also Drehzahl/20 — 38 Hz im
Leerlauf bis 108 Hz. Nachgebaut sind nur diese Kennzahlen; es steckt keine
fremde Aufnahme im Spiel. Der Lader hängt am Gas und braucht rund zweieinhalb
Sekunden, bis er oben ist, deshalb pfeift es beim Anfahren unter Last hoch.

Die Drehzahl läuft über ein gedachtes Getriebe mit vier Gängen, deshalb hört
man das Hochschalten. Die Lautstärke steht im Buch und liegt getrennt vom
Spielstand unter `landfracht_ton` im `localStorage`.

Geschraubt wird am Objekt `KLANG` oben in `js/sound.js` — Resonanzen,
Brenndauer, Nageln, Gesamtpegel. Am Ohr geht das bequemer mit
`werkzeug/klang.html`: Fahrzustand einstellen, live an den Reglern drehen, am
Ende die Werte abholen und zurück in `KLANG` schreiben.

Wer lieber eine **echte Aufnahme** hört: `werkzeug/klang_einbetten.py` bettet
Klangdateien ein, das Spiel benutzt dann sie statt des gerechneten Motors und
blendet zwischen mehreren Drehzahlstufen über. Ohne Aufnahme rechnet es
weiter wie bisher — es ändert sich nichts, solange nichts eingebettet ist.
Einzelheiten und die Lizenzfrage stehen in `werkzeug/LIESMICH.md`.

**Fahrgefühl** — `LENK_MAX`, `LENK_RATE`, `KNICK_MAX` und `KUPPLUNG` oben in
`js/physics.js`. `KNICK_MAX` ist der Winkel, ab dem der Anhänger quersteht.
Der zulässige Einschlag fällt mit dem Tempo; bei Reisegeschwindigkeit bleibt
gut ein Fünftel davon übrig, sonst dreht das Gespann auf der Landstraße auf
der Stelle. Wie weit der Zeiger vom Traktor abliegen muss, bis die
Maussteuerung vollen Einschlag verlangt, steht als `MAUS_VOLL` in
`js/main.js`.

**Anlasser** — `ANLASSER_DAUER` in `js/game.js`, in Sekunden. Das Geräusch
dazu steht als `anlasser()` in `js/sound.js`.

**Karte** — `wege`, `felder` und `orte` in `js/world.js`. Ein Ort braucht
`gebaeude` (nur Optik und Kollision), `zonen` (wo geladen wird) sowie `gibt`
und `nimmt` (welche Waren dort abgeholt und abgeliefert werden). Daraus baut
die Auftragsbörse ihre Fahrten selbst zusammen; neue Orte oder Waren muss man
nirgends sonst nachtragen.

**Straßenverlauf** — bei `wege` steht nur das Gerippe: alle 20 bis 50 m ein
Stützpunkt. Daraus wird der fertige Weg beim Laden in zwei Schritten gebaut.
`schlaengeln()` beult jedes Stück quer zur Fahrtrichtung aus, abwechselnd nach
links und nach rechts, und `ausrollen()` glättet das Ergebnis zu einem dichten
Zug mit einem Punkt alle zwei Meter (`AUSROLL_SCHRITT`). *Dieser* Zug ist
es, der gezeichnet, befahren und in das Untergrundraster gelegt wird. Man
setzt also grob die Richtung und bekommt die Kurven geschenkt.

Wie stark sich ein Weg windet, hängt an `AUSSCHLAG_NENNER` (480, kleiner =
kurviger) und an `WANDER`, der Obergrenze je Wegart. Der Nenner setzt den
Kurvenradius der Ausbeulung, zurzeit auf gut 24 m.

Ob ein geänderter Straßenverlauf überhaupt befahrbar ist, sagt einem nicht das
Auge, sondern `python werkzeug/wege_pruefen.py`: das Werkzeug fährt jede Route
mit Vollgas ab und misst, wie weit das Gespann dabei aus der Fahrbahn trägt.
Es prüft daneben, dass kein Weg ein Gebäude streift, dass jedes Wegende
wirklich auf einer Kreuzung sitzt und dass kein Weg durch einen Schlag läuft.

Wo zwei Wege sich treffen, müssen beide denselben Stützpunkt nennen. Stützpunkte
werden vom Schlängeln nicht verschoben und die Kurve läuft durch sie hindurch,
also bleibt die Kreuzung liegen; ein Abzweig mit nur ungefähr passendem Anfang
hängt hinterher sichtbar neben der Straße.

**Umwegzuschlag** — `UMWEG` in `js/world.js` (1.40). Die Auftragsbörse rechnet
Entfernungen als Luftlinie mal diesem Faktor. Am ausgerollten Netz
nachgemessen liegt der echte Umweg im Median bei 1.36. Wer die Wege
verwinkelter zieht oder das Netz erweitert, muss den Faktor mit anheben, sonst
werden alle Zeitfenster stillschweigend knapper.

**Beiwerk** — Feldgehölze, Tümpel und Findlinge streut `bauBeiwerk()` mit
festem Startwert, sie sehen also bei jedem Start gleich aus. Sie sind reine
Optik und halten nichts auf.

## Prüfstand — der Entwicklermodus

Zum Ausprobieren gibt es eine Werkbank. **Strg+Alt+E** schaltet sie an; oben in
der Kopfleiste erscheint dann ein Knopf *Prüfstand*, und um das Bild liegt ein
Rahmen, damit man nicht vergisst, dass man gerade nicht spielt.

| Taste | Wirkung |
|---|---|
| `Strg+Alt+E` | Prüfstand an und aus |
| `P` | Prüfstand-Fenster |
| `T` | Gespann dorthin versetzen, wo der Mauszeiger steht |
| `O` | Wege, Stützpunkte, Ladezonen und Gebäudehüllen einblenden |
| `Z` | Zahlenfeld links oben |

Im Fenster stehen Schalter und Handgriffe:

* **Kasse ohne Boden** — fällt der Kontostand unter 500.000 €, wird auf eine
  Million aufgefüllt. Nicht unendlich, damit an der Zahl ablesbar bleibt, was
  ein Kauf gekostet hat.
* **Tank bleibt voll**, **kein Verschleiß**, **Fristen laufen leer** —
  Diesel, Zustand und Zeitfenster hören auf, eine Rolle zu spielen.
* **Sofort laden** — Laden und Abladen dauern eine halbe Sekunde.
* **Ausrichten egal** — enge Zonen (Paletten, Tieflader) nehmen das Gespann in
  jeder Lage an.
* **Wege und Hüllen** — die Mittellinie jedes Weges mit ihren Stützpunkten,
  die Ladezonen mit ihren Arten und die Gebäudehüllen einschließlich des
  Puffers, an dem die Kollision hängt. Dazu der Punkt der Anhängerachse, denn
  der entscheidet über jedes Laden.
* **Zahlenfeld** — Bildrate, Ort, Kurs, Knickwinkel, Tempo, Untergrund, Zone,
  Ladechance, Uhr und Auftragsstand.
* **Spielstand einfrieren** — es wird nichts mehr gespeichert. Der Schalter,
  ohne den man sich mit voller Kasse den eigenen Betrieb überschreibt.
* **Tempofaktor** ×1 bis ×8 auf Höchstgeschwindigkeit *und* Motorleistung.
  Die Wege sind für ×1 gebaut; ab ×4 fliegt das Gespann aus der Kurve.
* **Handgriffe**: Zeit vorstellen, Ruf auf eine Stufe setzen, alles instand
  setzen, den ganzen Fuhrpark geschenkt bekommen, die Börse neu würfeln, den
  laufenden Auftrag abrechnen, und an jeden Ort springen — nach Möglichkeit
  gleich in die passende Ladezone und richtig ausgerichtet.

Die Einstellungen liegen unter einem eigenen Schlüssel im Browser
(`landfracht_pruefstand`), nicht im Spielstand, und überdauern das Neuladen.
Ohne `js/entwickler.js` läuft das Spiel unverändert weiter.

## Stand der Umsetzung

Fertig sind Stufe 1 und Stufe 2 aus der Vorgabe:

* Karte mit elf Orten, 4,48 km Landstraße und 2,78 km Feldweg in einem
  vermaschten Netz aus 36 Routen auf 720 × 720 Metern, Kamera folgt dem
  Gespann. Die typische Fuhre misst gut 400 Meter, die längste knapp 900.
* Kartenblatt zum Aufziehen und Verschieben, dazu die Minikarte
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
