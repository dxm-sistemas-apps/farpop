"""Gera os ícones do FARPOP (PWA + Android) só com a biblioteca padrão do Python.
Uso: python3 scripts/gen_icons.py
"""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SS = 3  # supersampling para bordas suaves


def write_png(path, n, rgba):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = bytearray()
    for y in range(n):
        raw.append(0)
        raw += rgba[y * n * 4:(y + 1) * n * 4]

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)

    data = (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
            + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(data)


def render(n, mode):
    """mode: icon (quadrado cheio) | legacy (cantos arredondados) | round | fg (adaptativo) | stat (notificação)."""
    c = n / 2
    if mode == 'fg':
        half, thick = 0.20 * n, 0.10 * n
    elif mode == 'stat':
        half, thick = 0.38 * n, 0.20 * n
    else:
        half, thick = 0.24 * n, 0.13 * n
    radius = 0.18 * n

    def in_plus(x, y):
        ax, ay = abs(x - c), abs(y - c)
        return (ax <= thick / 2 and ay <= half) or (ay <= thick / 2 and ax <= half)

    def in_mask(x, y):
        if mode in ('icon', 'fg', 'stat'):
            return True
        if mode == 'round':
            return (x - c) ** 2 + (y - c) ** 2 <= c * c
        dx = max(abs(x - c) - (c - radius), 0)
        dy = max(abs(y - c) - (c - radius), 0)
        return dx * dx + dy * dy <= radius * radius

    out = bytearray(n * n * 4)
    total = SS * SS
    for py in range(n):
        for px in range(n):
            a = r = g = b = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS
                    plus = in_plus(x, y)
                    if mode in ('fg', 'stat'):
                        if plus:
                            a += 1; r += 255; g += 255; b += 255
                        continue
                    if not in_mask(x, y):
                        continue
                    a += 1
                    if plus:
                        r += 255; g += 255; b += 255
                    else:
                        t = (x + y) / (2 * n)
                        r += 30 + 7 * t; g += 58 + 41 * t; b += 138 + 97 * t
            i = (py * n + px) * 4
            if a:
                out[i] = int(r / a); out[i + 1] = int(g / a); out[i + 2] = int(b / a)
            out[i + 3] = int(255 * a / total)
    return out


def save(rel, n, mode):
    write_png(os.path.join(ROOT, rel), n, render(n, mode))


# PWA
save('www/icon-192.png', 192, 'icon')
save('www/icon-512.png', 512, 'icon')

# Android
dens = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']
launcher = [48, 72, 96, 144, 192]
foreground = [108, 162, 216, 324, 432]
status = [24, 36, 48, 72, 96]
for d, a, b, s in zip(dens, launcher, foreground, status):
    save(f'android-res/mipmap-{d}/ic_launcher.png', a, 'legacy')
    save(f'android-res/mipmap-{d}/ic_launcher_round.png', a, 'round')
    save(f'android-res/mipmap-{d}/ic_launcher_foreground.png', b, 'fg')
    save(f'android-res/drawable-{d}/ic_stat_icon.png', s, 'stat')

bg = os.path.join(ROOT, 'android-res/values/ic_launcher_background.xml')
os.makedirs(os.path.dirname(bg), exist_ok=True)
with open(bg, 'w', encoding='utf-8') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#2563EB</color>\n</resources>\n')

print('Ícones gerados.')
