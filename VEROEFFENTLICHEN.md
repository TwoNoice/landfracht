# Landfracht ins Netz bringen

Landfracht besteht nur aus Dateien, die ein Browser direkt lesen kann — HTML,
CSS, JavaScript und ein paar Bilder. Es gibt keine Datenbank, keinen
Serverprozess, nichts, was laufen müsste. Das ist der einfachste Fall, den es
im Web gibt: Dateien irgendwo hinlegen, fertig. Alles zusammen sind rund
250 KB.

Der Spielstand wandert nie zu einem Server, er bleibt im Browser des Spielers.

---

## Schritt 0 — die Unterschrift richtigstellen

Das Verzeichnis ist bereits ein Git-Repository, der erste Speicherpunkt ist
angelegt. Er trägt aber vorerst nur eine Platzhalter-Adresse:
`Nikla <landfracht@example.com>`.

Git schreibt an jeden Speicherpunkt, wer ihn gemacht hat — Name und
Mailadresse, wie eine Unterschrift. Bei einem öffentlichen Repository auf
GitHub kann jeder diese Adresse aus dem Verlauf auslesen. Trag deshalb hier
**nicht** deine private Adresse ein, sondern die Wegwerfadresse, die GitHub
dir gibt. Sie sieht so aus:
`12345678+deinname@users.noreply.github.com` und steht nach der Anmeldung
unter *Settings → Emails → Keep my email addresses private*.

Sobald du sie hast, diese zwei Befehle — sie schreiben die Unterschrift des
vorhandenen Speicherpunkts um:

```bash
git config user.email "12345678+deinname@users.noreply.github.com"
git commit --amend --reset-author --no-edit
```

Das geht nur, solange noch nichts hochgeladen ist. Also vor Schritt 3.
Landest du bei einem klassischen Webhoster statt bei GitHub, kannst du den
ganzen Schritt überspringen: dort werden nur Dateien hochgeladen, die
Unterschrift sieht nie jemand.

---

## Weg A — GitHub Pages

Kostenlos, dauerhaft, und du hast den Verlauf deiner Änderungen mit dabei.
Die Adresse sieht dann so aus: `https://deinname.github.io/landfracht/`

1. **Konto anlegen** auf [github.com](https://github.com) — kostenlos, es
   reicht Mailadresse und Passwort.

2. **Repository anlegen**: oben rechts auf `+` → *New repository*.
   - *Repository name*: `landfracht`
   - *Public* auswählen (bei einem kostenlosen Konto braucht GitHub Pages das)
   - Bei *Initialize this repository* **nichts** ankreuzen — kein README,
     keine .gitignore. Die Dateien sind hier ja schon da.
   - *Create repository*

3. **Hochladen.** GitHub zeigt dir danach eine Seite mit Befehlen an. Du
   brauchst nur diese zwei, mit deinem Namen statt `DEINNAME`:

   ```bash
   git remote add origin https://github.com/DEINNAME/landfracht.git
   git push -u origin main
   ```

   Beim ersten Mal fragt Git nach Zugangsdaten. Windows öffnet dafür ein
   Fenster, in dem du dich einmal bei GitHub anmeldest; danach merkt es sich
   das.

4. **Pages einschalten**: im Repository auf *Settings* → links *Pages* →
   unter *Build and deployment* bei *Source* `Deploy from a branch` lassen,
   bei *Branch* `main` und `/ (root)` wählen → *Save*.

5. **Warten.** Nach ein bis zwei Minuten steht die Adresse oben auf derselben
   Seite. Fertig.

Ab dann gilt: Änderungen mit `git add -A`, `git commit -m "…"` und
`git push` hochschieben, die Seite aktualisiert sich von selbst.

---

## Weg B — Netlify Drop

Wenn du das Spiel in zwei Minuten irgendwo liegen haben willst, ohne Konto,
ohne Git.

1. [app.netlify.com/drop](https://app.netlify.com/drop) öffnen.
2. Den Ordner `Traktor Game` aus dem Explorer in das Feld ziehen.
3. Du bekommst sofort eine Adresse wie `zarte-wolke-12345.netlify.app`.

Zwei Haken: die Adresse ist Kauderwelsch, und ohne kostenloses Konto ist die
Seite nach kurzer Zeit wieder weg. Legst du ein Konto an, kannst du den
vorderen Teil der Adresse frei wählen (`landfracht.netlify.app`) und die Seite
bleibt.

Netlify eignet sich gut zum Ausprobieren. Für dauerhaft ist Weg A der
sauberere.

---

## Eine eigene Adresse

`deinname.github.io/landfracht` ist eine echte, öffentliche Adresse — das
Spiel ist damit im Netz. Wenn du lieber `landfracht.de` hättest, ist das der
einzige Teil, der Geld kostet: eine `.de`-Adresse liegt bei etwa 5 bis 15 Euro
im Jahr, `.com` etwas darüber. Anbieter in Deutschland sind zum Beispiel
INWX, Netcup oder United Domains; die Preise unterscheiden sich kaum, die
Bedienoberflächen schon.

Die Adresse wird dann auf GitHub Pages gezeigt, das Spiel liegt weiterhin
kostenlos dort:

1. Beim Anbieter in der DNS-Verwaltung vier `A`-Einträge für die nackte
   Domain anlegen, auf `185.199.108.153`, `185.199.109.153`,
   `185.199.110.153` und `185.199.111.153`. Dazu einen `CNAME`-Eintrag für
   `www` auf `deinname.github.io`.
2. Im Repository unter *Settings → Pages → Custom domain* die Adresse
   eintragen und speichern. GitHub legt dafür eine Datei `CNAME` im
   Repository an.
3. *Enforce HTTPS* ankreuzen, sobald die Option auswählbar wird — das dauert
   nach der Umstellung noch eine Weile, weil erst ein Zertifikat ausgestellt
   werden muss.

Bis alle DNS-Server die Änderung kennen, können ein paar Stunden vergehen.

---

## Nach dem Hochladen

**Die Vorschau beim Teilen richtig verlinken.** In `index.html` stehen zwei
Zeilen mit relativen Pfaden. Ein Teil der Dienste, die Linkvorschauen bauen,
liest nur vollständige Adressen. Sobald du deine Adresse kennst, ersetze:

```html
<meta property="og:image" content="vorschau.png">
```

durch die volle Fassung, zum Beispiel:

```html
<meta property="og:image" content="https://deinname.github.io/landfracht/vorschau.png">
```

Prüfen kannst du das Ergebnis, indem du die Adresse in einen WhatsApp-Chat
mit dir selbst oder auf einen Discord-Server schreibst.

**Nachsehen, ob alles da ist.** Ruf die Seite einmal in einem privaten
Fenster auf. So siehst du sie ohne alten Spielstand und ohne Zwischenspeicher,
also so wie ein fremder Besucher.

---

## Was rechtlich zu bedenken ist

Das hier ist kein Rechtsrat, nur der Hinweis, wonach du gegebenenfalls suchen
solltest.

Für rein private, nicht kommerzielle Seiten wird in Deutschland allgemein
keine Impressumspflicht angenommen. Sobald Werbung, Spenden-Knöpfe oder
sonstige Einnahmen dazukommen, sieht das anders aus — dann sind Impressum
und Datenschutzerklärung Pflicht. Beides ist schnell gemacht: eine weitere
HTML-Seite, verlinkt vom Titelbild.

Zum Datenschutz: Landfracht selbst sendet nichts. Es gibt keine Anmeldung,
keine Zählpixel, keine fremden Skripte, keine Cookies — der Spielstand liegt
im `localStorage` des Browsers und bleibt dort. Der Hoster protokolliert
allerdings, wie jeder Webserver, die IP-Adressen der Besucher. Das ist der
Punkt, den eine Datenschutzerklärung ansprechen müsste.

---

## Wenn etwas nicht geht

**Weiße Seite, nichts passiert.** Mit `F12` die Entwicklerwerkzeuge öffnen und
unter *Console* nachsehen. Meist ist es ein Pfad: `js/`, `css/` und die
Bilddateien müssen neben `index.html` liegen, mit genau der gleichen
Groß- und Kleinschreibung. Windows nimmt das nicht genau, ein Webserver schon.

**Alte Fassung wird angezeigt.** Der Browser hält Dateien fest. `Strg` +
`Umschalt` + `R` lädt neu ohne Zwischenspeicher.

**Kein Ton.** Browser lassen Ton erst zu, nachdem jemand geklickt hat. Genau
dafür ist das Titelbild da — der Klick auf *Spiel starten* schaltet ihn frei.
Ansonsten `M` drücken oder im Buch die Lautstärke prüfen.

**GitHub Pages zeigt 404.** Meistens war die Wartezeit nach dem Einschalten
noch zu kurz, oder unter *Settings → Pages* steht der falsche Branch.
