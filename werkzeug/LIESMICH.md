# Werkzeug

Gehört nicht zum Spiel. Zwei Wegwerfskripte, die die Bilddateien der Webseite
erzeugen, damit man sie später ändern kann statt neu zu malen.

    python werkzeug/vorschau_bauen.py   # vorschau.png, 1200x630
    python werkzeug/symbole_bauen.py    # symbol-180/192/512.png

Beide schreiben ins aktuelle Verzeichnis, also aus dem Wurzelverzeichnis des
Projekts aufrufen. Sie brauchen nur Python selbst — auf diesem Rechner war
keine Bildbibliothek vorhanden, deshalb malen sie Polygone von Hand und
schreiben die PNG-Datei über `zlib` selbst zusammen. Das ist langsam
(gut eine Minute für die Vorschau) und genau einmal im Jahr nötig.

`symbole_bauen.py` bildet `favicon.svg` nach. Wer das Symbol ändert, muss
beides anfassen.
