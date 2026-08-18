# Rasterisiert das Traktorsymbol aus favicon.svg in die PNG-Groessen, die
# Android und iOS beim Ablegen auf dem Startbildschirm verlangen.
import zlib, struct, math

SS = 4                              # Ueberabtastung fuer weiche Kanten
GRUND = (0x1b, 0x20, 0x16)
GELB = (0xe8, 0xc1, 0x4a)
SICHER = 0.76                       # Schutzzone fuer maskierbare Symbole


def bild(groesse):
    W = H = groesse * SS
    img = bytearray(bytes(GRUND) * (W * H))

    def px(x, y, c):
        if 0 <= x < W and 0 <= y < H:
            i = (y * W + x) * 3
            img[i], img[i+1], img[i+2] = c

    def poly(pts, c):
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
                    px(x, y, c)

    def kreis(cx, cy, r, c):
        for y in range(max(0, int(cy - r)), min(H, int(cy + r) + 1)):
            dy = y + 0.5 - cy
            d = r * r - dy * dy
            if d <= 0:
                continue
            dx = math.sqrt(d)
            for x in range(max(0, int(cx - dx)), min(W, int(cx + dx) + 1)):
                px(x, y, c)

    # Vom 64er Koordinatennetz der SVG-Datei in Bildpunkte, mit Schutzzone
    k = groesse * SS / 64.0 * SICHER
    v = groesse * SS / 2.0

    def P(x, y):
        return (v + (x - 32) * k, v + (y - 32) * k)

    def R(x, y, w, h, c):
        poly([P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)], c)

    def K(cx, cy, r, c):
        p = P(cx, cy)
        kreis(p[0], p[1], r * k, c)

    poly([P(15, 14), P(39, 14), P(39, 33), P(60, 33), P(60, 46), P(15, 46)], GELB)
    R(11, 10, 31, 5, GELB)          # Dach
    R(42, 17, 4.5, 17, GELB)        # Auspuff
    R(19, 18, 16, 11, GRUND)        # Scheibe
    K(24, 45, 16, (0x23, 0x27, 0x1d))
    K(24, 45, 7.5, GELB)
    K(54, 51, 10, (0x23, 0x27, 0x1d))
    K(54, 51, 4.5, GELB)

    # Herunterrechnen
    OW = OH = groesse
    n = SS * SS
    roh = bytearray()
    for y in range(OH):
        roh.append(0)
        for x in range(OW):
            r = g = b = 0
            for dy in range(SS):
                base = ((y * SS + dy) * W + x * SS) * 3
                for dx in range(SS):
                    i = base + dx * 3
                    r += img[i]
                    g += img[i+1]
                    b += img[i+2]
            roh += bytes((r // n, g // n, b // n))

    def chunk(typ, daten):
        c = struct.pack('>I', len(daten)) + typ + daten
        return c + struct.pack('>I', zlib.crc32(typ + daten) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', OW, OH, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(roh), 9))
    png += chunk(b'IEND', b'')
    name = 'symbol-%d.png' % groesse
    open(name, 'wb').write(png)
    print(name, len(png), 'Bytes')


for g in (180, 192, 512):
    bild(g)
