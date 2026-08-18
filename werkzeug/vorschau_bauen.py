# Rendert das Vorschaubild (Open Graph) im Stil der Spielkarte.
# Reines Python: es ist keine Bildbibliothek auf diesem Rechner vorhanden.
import zlib, struct, math, random

SS = 2                      # Kantenglaettung durch Ueberabtastung
W, H = 1200 * SS, 630 * SS

img = bytearray(W * H * 3)

def rgb(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

def px(x, y, c, a=1.0):
    if x < 0 or y < 0 or x >= W or y >= H:
        return
    i = (y * W + x) * 3
    if a >= 1.0:
        img[i], img[i+1], img[i+2] = c
    else:
        for k in range(3):
            img[i+k] = int(img[i+k] * (1 - a) + c[k] * a)

def fill_rect(x0, y0, x1, y1, c, a=1.0):
    for y in range(max(0, int(y0)), min(H, int(y1))):
        for x in range(max(0, int(x0)), min(W, int(x1))):
            px(x, y, c, a)

def fill_poly(pts, c, a=1.0):
    ys = [p[1] for p in pts]
    for y in range(max(0, int(min(ys))), min(H, int(max(ys)) + 1)):
        yc = y + 0.5
        xs = []
        n = len(pts)
        for i in range(n):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % n]
            if (y1 <= yc < y2) or (y2 <= yc < y1):
                xs.append(x1 + (yc - y1) * (x2 - x1) / (y2 - y1))
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            for x in range(max(0, int(xs[i])), min(W, int(xs[i+1]) + 1)):
                px(x, y, c, a)

def in_poly(x, y, pts):
    drin = False
    n = len(pts)
    j = n - 1
    for i in range(n):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            drin = not drin
        j = i
    return drin

def fill_circle(cx, cy, r, c, a=1.0):
    for y in range(max(0, int(cy - r)), min(H, int(cy + r) + 1)):
        dy = y + 0.5 - cy
        d = r * r - dy * dy
        if d <= 0:
            continue
        dx = math.sqrt(d)
        for x in range(max(0, int(cx - dx)), min(W, int(cx + dx) + 1)):
            px(x, y, c, a)

def thick_line(p1, p2, w, c, a=1.0, rund=True):
    x1, y1 = p1
    x2, y2 = p2
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    if L < 0.001:
        return
    nx, ny = -dy / L * w / 2, dx / L * w / 2
    fill_poly([(x1+nx, y1+ny), (x2+nx, y2+ny), (x2-nx, y2-ny), (x1-nx, y1-ny)], c, a)
    if rund:
        fill_circle(x1, y1, w / 2, c, a)
        fill_circle(x2, y2, w / 2, c, a)

def polyline(pts, w, c, a=1.0):
    for i in range(len(pts) - 1):
        thick_line(pts[i], pts[i+1], w, c, a)

def rot_rect(cx, cy, laenge, breite, winkel):
    ca, sa = math.cos(winkel), math.sin(winkel)
    out = []
    for lx, ly in ((laenge/2, breite/2), (laenge/2, -breite/2),
                   (-laenge/2, -breite/2), (-laenge/2, breite/2)):
        out.append((cx + lx*ca - ly*sa, cy + lx*sa + ly*ca))
    return out

def S(v):
    return v * SS

def sp(pts):
    return [(S(x), S(y)) for x, y in pts]

# ---------------------------------------------------------------- Schlaege
fill_rect(0, 0, W, H, rgb('#5f7f45'))
random.seed(11)

# Unregelmaessige Grenzen: gerade Kanten wirken wie ein Schachbrett, nicht wie
# gewachsene Flur.
schlaege = [
    ([(-40, -40), (545, -40), (495, 250), (150, 300), (-40, 265)], '#6f8f4a', '#658347', 0.38),
    ([(545, -40), (1250, -40), (1250, 215), (905, 250), (600, 235), (495, 250)], '#b3a05a', '#a19050', 0.06),
    ([(-40, 300), (300, 320), (415, 400), (370, 680), (-40, 680)], '#7a6144', '#6d5640', 1.22),
    ([(830, 400), (1250, 350), (1250, 680), (795, 680)], '#b3a05a', '#a19050', 1.54),
    ([(415, 400), (830, 415), (795, 680), (370, 680)], '#6f8f4a', '#658347', 0.0),
]
for rand, boden, linie, ri in schlaege:
    fill_poly(sp(rand), rgb(boden))
    xs = [p[0] for p in rand]
    ys = [p[1] for p in rand]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    diag = int(math.hypot(max(xs) - min(xs), max(ys) - min(ys))) + 30
    schritt = 24
    for k in range(-diag // schritt, diag // schritt):
        o = k * schritt
        ax = cx + math.cos(ri) * -diag - math.sin(ri) * o
        ay = cy + math.sin(ri) * -diag + math.cos(ri) * o
        bx = cx + math.cos(ri) * diag - math.sin(ri) * o
        by = cy + math.sin(ri) * diag + math.cos(ri) * o
        pts = []
        n = 240
        for t in range(n + 1):
            x = ax + (bx - ax) * t / n
            y = ay + (by - ay) * t / n
            if in_poly(x, y, rand):
                pts.append((S(x), S(y)))
            elif len(pts) > 1:
                polyline(pts, S(1.7), rgb(linie))
                pts = []
            else:
                pts = []
        if len(pts) > 1:
            polyline(pts, S(1.7), rgb(linie))

# ---------------------------------------------------------------- Wege
feldweg = [(70, 690), (215, 500), (300, 345), (285, 150), (355, 10)]
polyline(sp(feldweg), S(15), rgb('#6b5a3e'))
polyline(sp(feldweg), S(11), rgb('#8e7a52'))

strasse = [(-30, 235), (215, 292), (455, 372), (720, 348), (905, 262), (1075, 305), (1240, 430)]
polyline(sp(strasse), S(32), rgb('#3a3a36'))
polyline(sp(strasse), S(25), rgb('#55554f'))

abzweig = [(720, 348), (782, 208), (872, 128)]
polyline(sp(abzweig), S(27), rgb('#3a3a36'))
polyline(sp(abzweig), S(20), rgb('#55554f'))

# ---------------------------------------------------------------- Hof
def gebaeude(cx, cy, l, b, winkel, dach='#3c4033', first='#4c5140'):
    fill_poly(sp(rot_rect(cx + 3, cy + 5, l, b, winkel)), (0, 0, 0), 0.24)
    fill_poly(sp(rot_rect(cx, cy, l, b, winkel)), rgb(dach))
    fill_poly(sp(rot_rect(cx, cy, l * 0.88, b * 0.16, winkel)), rgb(first))

fill_poly(sp(rot_rect(905, 150, 235, 165, 0.08)), rgb('#8d8878'))
gebaeude(852, 92, 158, 48, 0.08)
gebaeude(975, 190, 128, 42, 1.60)
gebaeude(820, 205, 84, 34, 0.08, '#4a3f30', '#5c4e3c')
fill_circle(S(988), S(92), S(17), rgb('#5f6455'))       # Silo
fill_circle(S(988), S(92), S(11), rgb('#878c76'))

# Ladezone am Hof, wie im Spiel gelb umrandet
zone = rot_rect(880, 218, 46, 22, 0.08)
fill_poly(sp(zone), rgb('#e8c14a'), 0.16)
polyline(sp(zone + [zone[0]]), S(1.8), rgb('#e8c14a'), 0.75)

# ---------------------------------------------------------------- Bewuchs
def baum(x, y, r):
    fill_circle(S(x + 2), S(y + 4), S(r), (0, 0, 0), 0.22)
    fill_circle(S(x), S(y), S(r), rgb('#3f5730'))
    fill_circle(S(x - r * 0.3), S(y - r * 0.3), S(r * 0.5), rgb('#4d6a3a'))

for i in range(12):                                     # Hecke am Feldweg
    t = i / 11
    x = 70 + t * 285 - 26
    y = 690 - t * 680 - 14
    baum(x + random.uniform(-7, 7), y + random.uniform(-9, 9), random.uniform(9, 14))
for i in range(9):                                      # Baumreihe unten
    baum(415 + i * 47 + random.uniform(-9, 9), 592 + random.uniform(-18, 12), random.uniform(9, 14))
for i in range(5):                                      # Gehoelz oben rechts
    baum(1120 + random.uniform(-60, 60), 60 + random.uniform(-40, 60), random.uniform(10, 16))

# ---------------------------------------------------------------- Gespann
# Das Gespann traegt das Bild: gross genug, um im Kartenanreisser noch als
# Traktor mit Anhaenger erkennbar zu sein.
K = 2.0
gx, gy, gh = 520, 368, -0.155
th = gh + 0.16

ax = gx - math.cos(th) * 46 * K
ay = gy - math.sin(th) * 46 * K

def teil(cx, cy, l, b, winkel, farbe, a=1.0):
    fill_poly(sp(rot_rect(cx, cy, l * K, b * K, winkel)), rgb(farbe) if isinstance(farbe, str) else farbe, a)

# Anhaenger
fill_poly(sp(rot_rect(ax + 4, ay + 6, 52 * K, 22 * K, th)), (0, 0, 0), 0.30)
teil(ax, ay, 52, 22, th, '#7d7565')
teil(ax, ay, 45, 15.5, th, '#b3a05a')                   # Getreide bis unter die Bordwand
for dx, dy in ((-14, -13), (-14, 13), (10, -13), (10, 13)):
    wx = ax + dx * K * math.cos(th) - dy * K * math.sin(th)
    wy = ay + dx * K * math.sin(th) + dy * K * math.cos(th)
    teil(wx, wy, 12, 5, th, '#22241f')

# Deichsel
hx = gx - math.cos(gh) * 17 * K
hy = gy - math.sin(gh) * 17 * K
tx = ax + math.cos(th) * 26 * K
ty = ay + math.sin(th) * 26 * K
thick_line((S(hx), S(hy)), (S(tx), S(ty)), S(4 * K), rgb('#3c3c38'))

# Traktor
fill_poly(sp(rot_rect(gx + 4, gy + 6, 40 * K, 20 * K, gh)), (0, 0, 0), 0.30)
for dx, dy in ((-11, -12), (-11, 12)):
    wx = gx + dx * K * math.cos(gh) - dy * K * math.sin(gh)
    wy = gy + dx * K * math.sin(gh) + dy * K * math.cos(gh)
    teil(wx, wy, 16, 7, gh, '#22241f')
for dx, dy in ((13, -11), (13, 11)):
    wx = gx + dx * K * math.cos(gh) - dy * K * math.sin(gh)
    wy = gy + dx * K * math.sin(gh) + dy * K * math.cos(gh)
    teil(wx, wy, 11, 5, gh, '#22241f')
teil(gx, gy, 40, 17, gh, '#e8c14a')
teil(gx + 12, gy, 9, 12, gh, '#d0a93c')                 # Haube etwas dunkler
teil(gx - 4, gy, 15, 19, gh, '#23261f')                 # Kabine
teil(gx - 4, gy, 11, 14, gh, '#5b8ea8')                 # Glas

# ---------------------------------------------------------------- Abdunklung
# Nur der untere Rand, damit ein darueber gelegter Titel lesbar bleibt.
for y in range(H):
    t = y / H
    if t <= 0.62:
        continue
    a = ((t - 0.62) / 0.38) ** 1.5 * 0.55
    for x in range(W):
        i = (y * W + x) * 3
        img[i] = int(img[i] * (1 - a) + 0x12 * a)
        img[i+1] = int(img[i+1] * (1 - a) + 0x16 * a)
        img[i+2] = int(img[i+2] * (1 - a) + 0x0f * a)

# ---------------------------------------------------------------- Ausgabe
OW, OH = W // SS, H // SS
klein = bytearray(OW * OH * 3)
n = SS * SS
for y in range(OH):
    for x in range(OW):
        r = g = b = 0
        for dy in range(SS):
            base = ((y * SS + dy) * W + x * SS) * 3
            for dx in range(SS):
                i = base + dx * 3
                r += img[i]
                g += img[i+1]
                b += img[i+2]
        j = (y * OW + x) * 3
        klein[j] = r // n
        klein[j+1] = g // n
        klein[j+2] = b // n

roh = bytearray()
for y in range(OH):
    roh.append(0)
    roh += klein[y * OW * 3:(y + 1) * OW * 3]

def chunk(typ, daten):
    c = struct.pack('>I', len(daten)) + typ + daten
    return c + struct.pack('>I', zlib.crc32(typ + daten) & 0xffffffff)

png = b'\x89PNG\r\n\x1a\n'
png += chunk(b'IHDR', struct.pack('>IIBBBBB', OW, OH, 8, 2, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(bytes(roh), 9))
png += chunk(b'IEND', b'')
open('vorschau.png', 'wb').write(png)
print('vorschau.png', OW, 'x', OH, len(png), 'Bytes')
