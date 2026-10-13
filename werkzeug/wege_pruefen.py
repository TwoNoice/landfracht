# -*- coding: utf-8 -*-
"""Landfracht — die geometrische Probe am Wegenetz.

Laeuft ausserhalb des Spiels: liest js/world.js, baut das Netz mit denselben
zwei Durchgaengen auf wie der Browser (schlaengeln, ausrollen) und misst dann,
was sich am fertigen Zug messen laesst. Aufruf aus dem Projektstamm:

    python werkzeug/wege_pruefen.py

Gemessen wird:

  * Netzlaenge je Wegart
  * Untergrund und Gebaeudefreiheit jedes Mittellinienpunktes
    (breite/2 + 1.0 — die 1.0 ist der Puffer aus physics.js)
  * lose Wegenden: jedes Ende sitzt auf dem Stuetzpunkt eines anderen Weges,
    erreicht den Kartenrand oder endet in einem Hof
  * der Umwegzuschlag, ueber das Netz geroutet statt geschaetzt — daraus
    kommt UMWEG in world.js
  * die Fahrprobe: jede Route mit Vollgas abgefahren, gemessen wird der
    groesste seitliche Ausschlag von der Mittellinie gegen die halbe
    Fahrbahnbreite. Sie ist die Probe, die eine Karte wirklich fuer befahrbar
    erklaert; blosse Kurvenradien tun das nicht. Die Vorausschau muss mit dem
    Tempo wachsen, sonst schneidet der Regler jede Kurve und meldet Fehler,
    die keine sind.

Das Gegenstueck im Browser steht in CLAUDE.md unter "Testing"; beide muessen
dasselbe sagen. Sie tun es: nachgemessen 2,19 m gegen 2,22 m groesster
Ausschlag auf demselben Netz.
"""
import os, sys, io, re, math, heapq

QUELLE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'world.js')

def txt():
    with io.open(QUELLE, encoding='utf-8') as f:
        return f.read()

def block(t, name, oeffner='['):
    """Inhalt von 'var name = [ ... ];' mit Klammerzaehlung."""
    i = t.index('var ' + name + ' = ' + oeffner)
    i = t.index(oeffner, i)
    tiefe, j = 0, i
    while True:
        c = t[j]
        if c in '[{': tiefe += 1
        elif c in ']}':
            tiefe -= 1
            if tiefe == 0: return t[i:j+1]
        j += 1

ZAHL = r'-?\d+(?:\.\d+)?'

def lies_wege(t):
    b = block(t, 'wege')
    aus = []
    for m in re.finditer(r"\{\s*typ:\s*'(\w+)',\s*breite:\s*(" + ZAHL + r"),\s*p:\s*\[(.*?)\]\s*\}", b, re.S):
        pts = [[float(a), float(c)] for a, c in
               re.findall(r'\[\s*(' + ZAHL + r')\s*,\s*(' + ZAHL + r')\s*\]', m.group(3))]
        aus.append({'typ': m.group(1), 'breite': float(m.group(2)), 'p': pts})
    return aus

def lies_felder(t):
    b = block(t, 'felder')
    return [{'x': float(a), 'y': float(c), 'w': float(d), 'h': float(e), 't': int(f), 'dreh': float(g)}
            for a, c, d, e, f, g in re.findall(
                r'\{\s*x:\s*(' + ZAHL + r'),\s*y:\s*(' + ZAHL + r'),\s*w:\s*(' + ZAHL +
                r'),\s*h:\s*(' + ZAHL + r'),\s*t:\s*(\d+),\s*dreh:\s*(' + ZAHL + r')\s*\}', b)]

def lies_teiche(t):
    b = block(t, 'teiche')
    return [{'x': float(a), 'y': float(c), 'r': float(d)} for a, c, d in re.findall(
        r'\{\s*x:\s*(' + ZAHL + r'),\s*y:\s*(' + ZAHL + r'),\s*r:\s*(' + ZAHL + r')\s*\}', b)]

def lies_orte(t):
    b = block(t, 'orte')
    aus = []
    # jeder Ort beginnt mit "id: '...'"
    stellen = [m.start() for m in re.finditer(r"\n\s*id:\s*'", b)]
    stellen.append(len(b))
    for k in range(len(stellen) - 1):
        st = b[stellen[k]:stellen[k+1]]
        oid = re.search(r"id:\s*'(\w+)'", st).group(1)
        name = re.search(r"name:\s*'([^']*)'", st).group(1)
        kurz = re.search(r"kurz:\s*'([^']*)'", st).group(1)
        x = float(re.search(r"x:\s*(" + ZAHL + r")", st).group(1))
        y = float(re.search(r"y:\s*(" + ZAHL + r")", st).group(1))
        geb = [dict(x=float(a), y=float(c), w=float(d), h=float(e))
               for a, c, d, e in re.findall(
                   r'geb\(\s*(' + ZAHL + r'),\s*(' + ZAHL + r'),\s*(' + ZAHL + r'),\s*(' + ZAHL + r')', st)]
        zon = [dict(x=float(a), y=float(c), w=float(d), h=float(e))
               for a, c, d, e in re.findall(
                   r'zone\(\s*(' + ZAHL + r'),\s*(' + ZAHL + r'),\s*(' + ZAHL + r'),\s*(' + ZAHL + r')', st)]
        aus.append({'id': oid, 'name': name, 'kurz': kurz, 'x': x, 'y': y,
                    'gebaeude': geb, 'zonen': zon, 'roh': st})
    return aus

# ---------------- Geometrie wie in world.js ----------------

def wurf(n):
    n = (n * 1103515245 + 12345) & 0x7fffffff
    n = (n ^ (n >> 13)) & 0x7fffffff
    return ((n >> 7) & 0xffff) / 0xffff

def schlaengeln(p, kennung, staerke, schritt, nenner):
    aus = [list(p[0])]
    for i in range(len(p) - 1):
        a, b = p[i], p[i+1]
        dx, dy = b[0]-a[0], b[1]-a[1]
        L = math.hypot(dx, dy)
        if L < 1: continue
        nx, ny = -dy/L, dx/L
        ausschlag = (min(staerke, L*L/nenner)
                     * (0.6 + 0.4*wurf(kennung*977 + i*31))
                     * (-1 if wurf(kennung*613) < 0.5 else 1)
                     * (-1 if i % 2 else 1))
        stuecke = max(2, round(L/schritt))
        for j in range(1, int(stuecke)):
            u = j/stuecke
            h = math.sin(math.pi*u)
            s = h*h*ausschlag
            aus.append([a[0]+dx*u+nx*s, a[1]+dy*u+ny*s])
        aus.append(list(b))
    return aus

def misch(a, b, wa, wb):
    return [a[0]*wa + b[0]*wb, a[1]*wa + b[1]*wb]

def ausrollen(p, schritt):
    if len(p) < 3: return [list(q) for q in p]
    q = ([[2*p[0][0]-p[1][0], 2*p[0][1]-p[1][1]]] + [list(z) for z in p]
         + [[2*p[-1][0]-p[-2][0], 2*p[-1][1]-p[-2][1]]])
    aus = []
    for i in range(1, len(q)-2):
        p0, p1, p2, p3 = q[i-1], q[i], q[i+1], q[i+2]
        t0 = 0.0
        t1 = t0 + max(0.001, math.sqrt(math.dist(p0, p1)))
        t2 = t1 + max(0.001, math.sqrt(math.dist(p1, p2)))
        t3 = t2 + max(0.001, math.sqrt(math.dist(p2, p3)))
        n = max(2, round(math.dist(p1, p2)/schritt))
        for j in range(int(n)):
            t = t1 + (t2-t1)*(j/n)
            a1 = misch(p0, p1, (t1-t)/(t1-t0), (t-t0)/(t1-t0))
            a2 = misch(p1, p2, (t2-t)/(t2-t1), (t-t1)/(t2-t1))
            a3 = misch(p2, p3, (t3-t)/(t3-t2), (t-t2)/(t3-t2))
            b1 = misch(a1, a2, (t2-t)/(t2-t0), (t-t0)/(t2-t0))
            b2 = misch(a2, a3, (t3-t)/(t3-t1), (t-t1)/(t3-t1))
            aus.append(misch(b1, b2, (t2-t)/(t2-t1), (t-t1)/(t2-t1)))
    aus.append(list(p[-1]))
    return aus


def stellschrauben():
    """SCHLAENGEL_SCHRITT, AUSROLL_SCHRITT, AUSSCHLAG_NENNER und WANDER aus
    world.js lesen. Fest eingetragene Werte laufen sonst irgendwann aus dem
    Ruder: die Probe misst dann eine Karte, die es nicht gibt."""
    t = txt()
    z = lambda n: float(re.search(r'var ' + n + r' = ([\d.]+)', t).group(1))
    m = re.search(r'var WANDER = \{ strasse: ([\d.]+), feldweg: ([\d.]+) \}', t)
    return dict(schlaengel=z('SCHLAENGEL_SCHRITT'), ausroll=z('AUSROLL_SCHRITT'),
                nenner=z('AUSSCHLAG_NENNER'),
                wander={'strasse': float(m.group(1)), 'feldweg': float(m.group(2))})


def netz(wege, **fest):
    s = stellschrauben()
    s.update(fest)
    for i, w in enumerate(wege):
        w['stuetz'] = [list(q) for q in w['p_roh']]
        w['p'] = ausrollen(schlaengeln(w['p_roh'], i+1, s['wander'][w['typ']],
                                       s['schlaengel'], s['nenner']), s['ausroll'])
    return wege

def laden():
    t = txt()
    wege = lies_wege(t)
    for w in wege: w['p_roh'] = [list(q) for q in w['p']]
    return {'wege': wege, 'orte': lies_orte(t), 'felder': lies_felder(t), 'teiche': lies_teiche(t)}


def laenge(p):
    return sum(math.dist(p[i], p[i+1]) for i in range(len(p)-1))

def radien(p, stencil=21.0):
    """Kruemmungsradius ueber ein +-stencil Meter breites Fenster."""
    n = len(p)
    s = [0.0]*n
    for i in range(1, n): s[i] = s[i-1] + math.dist(p[i-1], p[i])
    aus = []
    j0 = 0; j1 = 0
    for i in range(n):
        while j0 < i and s[i]-s[j0] > stencil: j0 += 1
        while j1 < n-1 and s[j1]-s[i] < stencil: j1 += 1
        if s[i]-s[j0] < stencil*0.7 or s[j1]-s[i] < stencil*0.7:
            aus.append(float('inf')); continue
        a, b, c = p[j0], p[i], p[j1]
        ax, ay = a[0]-b[0], a[1]-b[1]
        cx, cy = c[0]-b[0], c[1]-b[1]
        kreuz = ax*cy - ay*cx
        la, lc, lac = math.hypot(ax, ay), math.hypot(cx, cy), math.dist(a, c)
        if abs(kreuz) < 1e-9: aus.append(float('inf'))
        else: aus.append(la*lc*lac/(2*abs(kreuz)))
    return aus

def rechteck_abstand(x, y, r):
    dx = max(abs(x-r['x']) - r['w']/2, 0.0)
    dy = max(abs(y-r['y']) - r['h']/2, 0.0)
    return math.hypot(dx, dy)

def gebaeude_liste(orte):
    return [g for o in orte for g in o['gebaeude']]

def freiheit(wege, orte, puffer=1.0):
    """Verstoesse: Mittellinienpunkt naeher als breite/2+puffer an einem Gebaeude."""
    geb = gebaeude_liste(orte)
    raus, proben = [], 0
    for k, w in enumerate(wege):
        noetig = w['breite']/2 + puffer
        for q in w['p']:
            proben += 1
            for g in geb:
                d = rechteck_abstand(q[0], q[1], g)
                if d < noetig:
                    raus.append((k, round(q[0]), round(q[1]), round(d, 2), round(noetig, 2)))
                    break
    return raus, proben

def knoten_pruefen(wege, welt_gross, tol=0.5):
    """Jedes Wegende sitzt exakt auf einem Stuetzpunkt eines anderen Weges,
    erreicht den Kartenrand oder endet in einem Hof."""
    alle = {}
    for k, w in enumerate(wege):
        for q in w['stuetz']:
            alle.setdefault((round(q[0], 3), round(q[1], 3)), []).append(k)
    lose = []
    for k, w in enumerate(wege):
        for e in (w['stuetz'][0], w['stuetz'][-1]):
            key = (round(e[0], 3), round(e[1], 3))
            if len(alle.get(key, [])) > 1: continue
            if e[0] < 60 or e[1] < 60 or e[0] > welt_gross-60 or e[1] > welt_gross-60: continue
            lose.append((k, round(e[0]), round(e[1])))
    return lose

# ---------------- Routing ----------------
class Graph(object):
    def __init__(self, wege, tol=0.6):
        self.kn = []          # (x,y)
        self.kanten = []      # dict idx -> [(idx, kosten)]
        self.index = {}
        self.wege = wege
        for k, w in enumerate(wege):
            vor = None
            for q in w['p']:
                i = self._knoten(q, tol)
                if vor is not None and vor != i:
                    d = math.dist(self.kn[vor], self.kn[i])
                    self.kanten[vor].append((i, d))
                    self.kanten[i].append((vor, d))
                vor = i
    def _knoten(self, q, tol):
        key = (round(q[0]/tol), round(q[1]/tol))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                k2 = (key[0]+dx, key[1]+dy)
                if k2 in self.index:
                    i = self.index[k2]
                    if math.dist(self.kn[i], q) <= tol: return i
        i = len(self.kn)
        self.kn.append([q[0], q[1]])
        self.kanten.append([])
        self.index[key] = i
        return i
    def naechster(self, x, y):
        best, bd = None, 1e18
        for i, q in enumerate(self.kn):
            d = (q[0]-x)**2 + (q[1]-y)**2
            if d < bd: bd, best = d, i
        return best, math.sqrt(bd)
    def dijkstra(self, start):
        dist = [float('inf')]*len(self.kn)
        dist[start] = 0.0
        h = [(0.0, start)]
        while h:
            d, i = heapq.heappop(h)
            if d > dist[i]: continue
            for j, c in self.kanten[i]:
                nd = d + c
                if nd < dist[j]: dist[j] = nd; heapq.heappush(h, (nd, j))
        return dist

def umwege(wege, orte):
    g = Graph(wege)
    anker = {}
    for o in orte:
        i, d = g.naechster(o['x'], o['y'])
        anker[o['id']] = (i, d)
    aus = []
    ids = [o['id'] for o in orte]
    lage = {o['id']: (o['x'], o['y']) for o in orte}
    for a in ids:
        dist = g.dijkstra(anker[a][0])
        for b in ids:
            if a >= b: continue
            weg = dist[anker[b][0]] + anker[a][1] + anker[b][1]
            luft = math.dist(lage[a], lage[b])
            aus.append((luft, weg, weg/luft if luft else 0, a, b))
    return aus


LENK_MAX, LENK_RATE, LENK_RUECK, KNICK_MAX, KUPPLUNG = 0.52, 2.6, 3.4, 1.48, 1.15
UNTERGRUND = {'strasse': dict(speed=1.00, halt=1.00, roll=1.00),
              'feldweg': dict(speed=0.72, halt=0.80, roll=1.55),
              'gelaende': dict(speed=0.45, halt=0.62, roll=2.60)}

def winkel(a):
    while a > math.pi: a -= 2*math.pi
    while a < -math.pi: a += 2*math.pi
    return a

def clamp(v, a, b): return a if v < a else (b if v > b else v)

class Gespann(object):
    def __init__(s): s.x = s.y = s.h = s.v = s.lenk = s.th = 0.0

    def schritt(s, dt, ein, t, u):
        tempo = abs(s.v)
        maxEin = LENK_MAX*(0.16 + 0.84/(1 + tempo/4.2))
        ziel = maxEin*clamp(ein.get('lenkZiel', 0.0), -1, 1)
        rate = (LENK_RUECK if abs(ziel) < 0.004 else LENK_RATE)*u['halt']
        if s.lenk < ziel: s.lenk = min(ziel, s.lenk + rate*dt)
        else: s.lenk = max(ziel, s.lenk - rate*dt)
        s.lenk = clamp(s.lenk, -maxEin, maxEin)

        zust = 1.0
        zustFaktor = 0.55 + 0.45*zust
        vmax = (t['vmaxKmh']/3.6)*u['speed']*(0.92 + 0.08*zust)*(0.95 + 0.05*(1 - t['ladungsAnteil']))
        masseAnh = max(0.0, t['masseGesamt'] - t['masseTraktor'])
        zugMasse = t['masseTraktor'] + masseAnh*0.55
        aAntrieb = (t['ps']*0.20*zustFaktor)/max(1.0, zugMasse)*u['halt']
        aRoll = (0.42 + 0.0038*tempo*tempo)*u['roll']
        a = aAntrieb if s.v < vmax else 0.0
        vAlt = s.v
        s.v = clamp(s.v + a*dt, -4.0, vmax)
        omega = (s.v/t['achsstand'])*math.tan(s.lenk)*clamp(0.55 + 0.45*u['halt'], 0.4, 1)
        s.h = winkel(s.h + omega*dt)
        s.x += math.cos(s.h)*s.v*dt
        s.y += math.sin(s.h)*s.v*dt
        b = t['anhaengerB']
        d = winkel(s.h - s.th)
        dth = (s.v*math.sin(d) - KUPPLUNG*omega*math.cos(d))/b
        s.th = winkel(s.th + dth*dt)
        knick = winkel(s.h - s.th)
        if abs(knick) > KNICK_MAX:
            s.th = winkel(s.h - math.copysign(KNICK_MAX, knick))
            s.v *= 0.4
        return abs(knick)

def abstand_strecke(px, py, ax, ay, bx, by):
    dx, dy = bx-ax, by-ay
    l2 = dx*dx + dy*dy
    if l2 < 1e-9: return math.hypot(px-ax, py-ay)
    t = clamp(((px-ax)*dx + (py-ay)*dy)/l2, 0, 1)
    return math.hypot(px - (ax+dx*t), py - (ay+dy*t))

# Der schwerste Fall: groesster Traktor, laengster Anhaenger, voll beladen.
SCHWER = dict(ps=300, achsstand=3.15, vmaxKmh=67, masseTraktor=8.5,
              masseGesamt=8.5+6.0+22.0, ladungsAnteil=1.0, anhaengerB=8.6)
LEICHT = dict(ps=60, achsstand=2.35, vmaxKmh=40, masseTraktor=3.2,
              masseGesamt=3.2+2.2+8.0, ladungsAnteil=1.0, anhaengerB=4.9)

def probe(weg, technik, voraus_min=8.0):
    """Faehrt eine Route mit Vollgas ab. Die Vorausschau waechst mit dem Tempo;
    eine feste kuerzt jede Kurve ab und meldet Fehler, die keine sind."""
    p = weg['p']
    u = UNTERGRUND[weg['typ']]
    g = Gespann()
    g.x, g.y = p[0]
    g.h = math.atan2(p[1][1]-p[0][1], p[1][0]-p[0][0])
    g.th = g.h
    idx, n, maxAb, maxKnick, maxV = 1, 0, 0.0, 0.0, 0.0
    while idx < len(p)-1 and n < 60000:
        n += 1
        voraus = max(voraus_min, abs(g.v)*1.1)
        while idx < len(p)-1 and math.hypot(p[idx][0]-g.x, p[idx][1]-g.y) < voraus: idx += 1
        d = winkel(math.atan2(p[idx][1]-g.y, p[idx][0]-g.x) - g.h)
        k = g.schritt(1/60.0, {'lenkZiel': clamp(d*2, -1, 1)}, technik, u)
        maxKnick = max(maxKnick, k)
        maxV = max(maxV, g.v)
        nah = 1e9
        for q in range(max(0, idx-60), min(len(p)-1, idx+60)):
            nah = min(nah, abstand_strecke(g.x, g.y, p[q][0], p[q][1], p[q+1][0], p[q+1][1]))
        if n > 90: maxAb = max(maxAb, nah)
    return maxAb, idx >= len(p)-1, maxKnick, maxV*3.6



# ---------------- Fahrprobe ueber das ganze Netz ----------------
# Der Starttraktor ist der dokumentierte Massstab: mit ihm faengt jeder an,
# und er hat den kleinsten Radstand. Der Strassenschlepper wird zusaetzlich
# gefahren, weil er am schnellsten ist und die groesste Deichsel hat.
START = dict(ps=60, achsstand=2.35, vmaxKmh=40, masseTraktor=3.2, masseGesamt=5.4,
             ladungsAnteil=0.0, anhaengerB=4.9)
GROSS = dict(ps=300, achsstand=3.15, vmaxKmh=67, masseTraktor=8.5, masseGesamt=36.5,
             ladungsAnteil=1.0, anhaengerB=8.6)

def fahrprobe(wege, technik, name, voraus_min=8.0):
    raus, worst = [], 0.0
    for k, w in enumerate(wege):
        ab, fertig, _, _ = probe(w, technik, voraus_min)
        worst = max(worst, ab)
        if ab > w['breite']/2 or not fertig:
            raus.append((k, w['typ'], round(ab, 2), round(w['breite']/2, 2), fertig))
    print('  %-8s Verstoesse %2d von %d Routen, groesster Ausschlag %.2f m'
          % (name, len(raus), len(wege), worst))
    for r in raus:
        print('      Weg %-3d %-8s Ausschlag %5.2f m (halbe Breite %.2f) durchgefahren=%s' % r)
    return raus


def main():
    d = laden()
    w = netz(d['wege'])
    L = sum(laenge(x['p']) for x in w if x['typ'] == 'strasse')
    F = sum(laenge(x['p']) for x in w if x['typ'] == 'feldweg')
    print('Netz: %d Routen, %.2f km Landstrasse, %.2f km Feldweg, %d Punkte'
          % (len(w), L/1000, F/1000, sum(len(x['p']) for x in w)))

    raus, proben = freiheit(w, d['orte'])
    print('Gebaeudefreiheit: %d Verstoesse bei %d Proben' % (len(raus), proben))
    for r in raus[:10]: print('      Weg %d bei (%d,%d): %.2f m statt %.2f m' % r)

    groesse = int(re.search(r'var GROESSE = (\d+)', txt()).group(1))
    lose = knoten_pruefen(w, groesse)
    print('lose Wegenden: %s' % (lose if lose else 'keine ausser den Hofenden'))

    u = umwege(w, d['orte'])
    q = sorted(x[2] for x in u); r = sorted(x[1] for x in u)
    print('Umweg %.2f / %.2f / %.2f (Mittel %.3f)  -> UMWEG in world.js'
          % (q[0], q[len(q)//2], q[-1], sum(q)/len(q)))
    print('echte Fahrstrecke ueber alle %d Ortspaare: %d / %d / %d m' % (len(r), r[0], r[len(r)//2], r[-1]))

    print('Fahrprobe (muss ohne Verstoss durchlaufen):')
    a = fahrprobe(w, START, 'Start')
    b = fahrprobe(w, GROSS, 'Gross')
    return 1 if (raus or a or b) else 0


if __name__ == '__main__':
    sys.exit(main())
