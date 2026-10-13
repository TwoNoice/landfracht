# -*- coding: utf-8 -*-
"""Bettet echte Motoraufnahmen als js/klang_motor.js ins Spiel ein.

Gehoert nicht zum Spiel. Aufruf aus dem Wurzelverzeichnis des Projekts:

    python werkzeug/klang_einbetten.py leerlauf.ogg:800 volllast.ogg:2100

Jedes Argument ist Datei:Drehzahl -- die Drehzahl, mit der der Motor in
*dieser* Aufnahme laeuft. Sie muss nicht stimmen; sie legt nur fest, bei
welcher Spieldrehzahl die Aufnahme unverstimmt laeuft. Ist sie zu hoch
angesetzt, klingt der Motor im Spiel zu tief, und umgekehrt. Der Regler
"Bezugsdrehzahl" in werkzeug/klang.html stellt das am Ohr nach.

Warum base64 statt einer Datei daneben: das Spiel soll aus dem Dateisystem
laufen, und ein fetch() auf eine Datei ist unter file:// gesperrt. Als Skript
eingebettet laedt der Browser die Aufnahme wie jedes andere Skript.

Rueckgaengig machen:

    python werkzeug/klang_einbetten.py --entfernen
"""

import base64
import io
import os
import sys

ZIEL = os.path.join('js', 'klang_motor.js')

# Beide Seiten, die den Ton laden, bekommen das Skript. Eingetragen wird es
# nur, wenn es auch eine Aufnahme gibt -- ein fest verdrahtetes Skript waere
# sonst ohne Aufnahme ein 404 in der Konsole, den man fuer einen echten Fehler
# haelt. (Seite, Anker davor, Marke)
SEITEN = [
    ('index.html',
     '<script src="js/sound.js"></script>',
     '<script src="js/klang_motor.js"></script>'),
    (os.path.join('werkzeug', 'klang.html'),
     '<script src="../js/sound.js"></script>',
     '<script src="../js/klang_motor.js"></script>'),
]

TYPEN = {
    '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.opus': 'audio/ogg',
}


def eintragen():
    """Das Skript vor sound.js haengen, falls noch nicht da."""
    neu = []
    for seite, anker, marke in SEITEN:
        if not os.path.exists(seite):
            continue
        s = io.open(seite, encoding='utf-8').read()
        if marke in s:
            continue
        if anker not in s:
            sys.exit('In %s steht kein %s -- Ladereihenfolge von Hand pruefen.'
                     % (seite, anker))
        io.open(seite, 'w', encoding='utf-8').write(s.replace(anker, marke + '\n' + anker))
        neu.append(seite)
    return neu


def austragen():
    weg = []
    for seite, _anker, marke in SEITEN:
        if not os.path.exists(seite):
            continue
        s = io.open(seite, encoding='utf-8').read()
        if marke not in s:
            continue
        io.open(seite, 'w', encoding='utf-8').write(
            s.replace(marke + '\n', '').replace(marke, ''))
        weg.append(seite)
    return weg


def entfernen():
    weg = austragen()
    if os.path.exists(ZIEL):
        os.remove(ZIEL)
        weg.append(ZIEL)
    print('Entfernt (%s). Das Spiel rechnet den Motor wieder selbst.'
          % ', '.join(weg) if weg else 'Es war nichts eingebettet.')


def einbetten(vorgaben):
    proben, gesamt = [], 0
    for vorgabe in vorgaben:
        if ':' not in vorgabe:
            sys.exit('Erwartet wird Datei:Drehzahl, bekommen habe ich: %s' % vorgabe)
        pfad, _, umin = vorgabe.rpartition(':')
        try:
            umin = int(umin)
        except ValueError:
            sys.exit('Keine Drehzahl: %s' % umin)
        if not os.path.exists(pfad):
            sys.exit('Nicht gefunden: %s' % pfad)

        endung = os.path.splitext(pfad)[1].lower()
        if endung not in TYPEN:
            sys.exit('Unbekanntes Format %s. Bekannt: %s'
                     % (endung, ', '.join(sorted(TYPEN))))

        roh = open(pfad, 'rb').read()
        gesamt += len(roh)
        proben.append({
            'umin': umin,
            'typ': TYPEN[endung],
            'daten': base64.b64encode(roh).decode('ascii'),
            'name': os.path.basename(pfad),
            'bytes': len(roh),
        })

    proben.sort(key=lambda p: p['umin'])
    typen = set(p['typ'] for p in proben)
    if len(typen) > 1:
        sys.exit('Alle Aufnahmen muessen dasselbe Format haben, hier: %s'
                 % ', '.join(sorted(typen)))

    zeilen = [
        '/* Landfracht -- eingebettete Motoraufnahmen.',
        ' *',
        ' * Erzeugt von werkzeug/klang_einbetten.py, nicht von Hand aendern.',
        ' * Quelle und Lizenz der Aufnahmen gehoeren in werkzeug/LIESMICH.md.',
        ' */',
        'var TG = window.TG || (window.TG = {});',
        '',
        'TG.klangMotor = {',
        "  typ: '%s'," % proben[0]['typ'],
        '  proben: [',
    ]
    for i, p in enumerate(proben):
        komma = ',' if i < len(proben) - 1 else ''
        zeilen.append('    /* %s, %d kB */' % (p['name'], round(p['bytes'] / 1024.0)))
        zeilen.append("    { umin: %d, daten: '%s' }%s" % (p['umin'], p['daten'], komma))
    zeilen += ['  ]', '};', '']

    if not os.path.isdir('js'):
        sys.exit('Kein Verzeichnis js/ -- aus dem Wurzelverzeichnis aufrufen.')
    io.open(ZIEL, 'w', encoding='utf-8').write('\n'.join(zeilen))

    b64 = os.path.getsize(ZIEL)
    print('%s geschrieben, %d kB (%d kB Rohton).' % (ZIEL, round(b64 / 1024.0), round(gesamt / 1024.0)))
    for p in proben:
        print('   %-28s %5d /min' % (p['name'], p['umin']))
    neu = eintragen()
    print('Skript eingetragen in: %s' % (', '.join(neu) if neu else 'nichts, stand schon drin'))

    if b64 > 2 * 1024 * 1024:
        print('\nAchtung: ueber 2 MB. Das laedt jeder Besucher der Seite mit,')
        print('bevor er das Spiel sieht. Kuerzere Schleifen oder eine')
        print('niedrigere Datenrate sind fast immer moeglich -- drei bis vier')
        print('Sekunden Motor bei 96 kbit/s mono reichen vollkommen.')

    print('\nNaechster Schritt: werkzeug/klang.html oeffnen und dort')
    print('PROBEN_PEGEL und LADER einstellen. Der Lader steckt in einer')
    print('echten Aufnahme meist schon drin, dann gehoert LADER weit herunter.')


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    if sys.argv[1] in ('--entfernen', '-e'):
        entfernen()
    else:
        einbetten(sys.argv[1:])


if __name__ == '__main__':
    main()
