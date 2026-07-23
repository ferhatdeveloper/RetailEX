#!/usr/bin/env python3
"""Asin brand rasters — Pillow (ImageMagick SVG gradient güvenilmez)."""
from __future__ import annotations

import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
INK = (14, 36, 51, 255)
ACCENT = (31, 168, 160, 255)
SURFACE = (243, 245, 247, 255)
MUTED = (90, 107, 120, 255)


def hexagon(cx: float, cy: float, r: float):
    pts = []
    for i in range(6):
        ang = math.radians(-90 + i * 60)
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    return pts


def draw_mark(size: int, rounded: bool = True) -> Image.Image:
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    radius = int(size * 0.21875) if rounded else 0
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=INK)
    inset = int(size * 0.055)
    d.rounded_rectangle(
        [inset, inset, size - 1 - inset, size - 1 - inset],
        radius=max(0, radius - inset),
        outline=(31, 168, 160, 55),
        width=max(1, size // 128),
    )
    s = size / 512
    hx = hexagon(256 * s, 256 * s, size * 0.36)
    d.line(hx + [hx[0]], fill=ACCENT, width=max(2, size // 36))
    a = [
        (256 * s, 140 * s),
        (360 * s, 372 * s),
        (318 * s, 372 * s),
        (292 * s, 312 * s),
        (220 * s, 312 * s),
        (194 * s, 372 * s),
        (152 * s, 372 * s),
    ]
    d.polygon(a, fill=SURFACE)
    d.polygon([(232 * s, 268 * s), (280 * s, 268 * s), (256 * s, 212 * s)], fill=INK)
    d.rounded_rectangle([372 * s, 196 * s, 400 * s, 316 * s], radius=max(2, int(10 * s)), fill=ACCENT)
    return im


def font(sz: int, bold: bool = True):
    candidates = [
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf' if bold else '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, sz)
            except Exception:
                continue
    return ImageFont.load_default()


def save(im: Image.Image, rel: str):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'PNG')
    print('png', rel, im.size)


def wordmark(rel: str, size: int = 640):
    mark = draw_mark(288)
    canvas = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    mx, my = (size - mark.width) // 2, 56
    canvas.alpha_composite(mark, (mx, my))
    d = ImageDraw.Draw(canvas)
    f = font(92, True)
    bb = d.textbbox((0, 0), 'Asin', font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    tx, ty = (size - tw) // 2, my + mark.height + 28
    d.text((tx, ty), 'Asin', font=f, fill=INK)
    bar_w = max(120, int(tw * 0.55))
    bx = (size - bar_w) // 2
    by = ty + th + 10
    d.rounded_rectangle([bx, by, bx + bar_w, by + 6], radius=3, fill=ACCENT)
    f2 = font(22, False)
    lb = d.textbbox((0, 0), 'ERP', font=f2)
    lw = lb[2] - lb[0]
    d.text(((size - lw) // 2, by + 18), 'ERP', font=f2, fill=MUTED)
    out = Image.new('RGB', (size, size), (255, 255, 255))
    out.paste(canvas, mask=canvas.split()[-1])
    path = os.path.join(ROOT, rel)
    out.save(path, 'PNG')
    print('wordmark', rel)


def main():
    icon512 = draw_mark(512)
    save(icon512, 'DeskApp/icons/icon.png')
    for name, sz in [
        ('32x32.png', 32),
        ('64x64.png', 64),
        ('128x128.png', 128),
        ('128x128@2x.png', 256),
        ('Square30x30Logo.png', 30),
        ('Square44x44Logo.png', 44),
        ('Square71x71Logo.png', 71),
        ('Square89x89Logo.png', 89),
        ('Square107x107Logo.png', 107),
        ('Square142x142Logo.png', 142),
        ('Square150x150Logo.png', 150),
        ('Square284x284Logo.png', 284),
        ('Square310x310Logo.png', 310),
        ('StoreLogo.png', 50),
    ]:
        save(draw_mark(sz), f'DeskApp/icons/{name}')

    ico_path = os.path.join(ROOT, 'DeskApp/icons/icon.ico')
    icon512.save(ico_path, format='ICO', sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    print('ico', 'DeskApp/icons/icon.ico')
    try:
        subprocess.check_call(['magick', os.path.join(ROOT, 'DeskApp/icons/icon.png'), os.path.join(ROOT, 'DeskApp/icons/icon.icns')])
        print('icns', 'DeskApp/icons/icon.icns')
    except Exception as e:
        print('icns skip', e, file=sys.stderr)

    save(draw_mark(72), 'src/public/icons/icon-72x72.png')
    save(draw_mark(1024), 'mobile/assets/icon.png')
    save(draw_mark(1024), 'mobile/assets/splash-icon.png')
    save(draw_mark(48), 'mobile/assets/favicon.png')
    save(draw_mark(512), 'mobile/assets/android-icon-foreground.png')
    Image.new('RGB', (512, 512), INK[:3]).save(os.path.join(ROOT, 'mobile/assets/android-icon-background.png'))
    mono = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    d = ImageDraw.Draw(mono)
    d.polygon([(256, 140), (360, 372), (318, 372), (292, 312), (220, 312), (194, 372), (152, 372)], fill=(255, 255, 255, 255))
    d.polygon([(232, 268), (280, 268), (256, 212)], fill=(0, 0, 0, 0))
    d.rounded_rectangle([372, 196, 400, 316], radius=10, fill=(255, 255, 255, 255))
    save(mono, 'mobile/assets/android-icon-monochrome.png')

    wordmark('src/public/logo.png')
    wordmark('DeskApp/logo.png')
    wordmark('DeskApp/logo_fixed.png')

    # NSIS
    h = Image.new('RGB', (150, 57), INK[:3])
    d = ImageDraw.Draw(h)
    d.text((14, 14), 'Asin', font=font(22, True), fill=(255, 255, 255))
    d.rounded_rectangle([14, 42, 62, 46], radius=2, fill=ACCENT)
    h.save(os.path.join(ROOT, 'DeskApp/branding/header.bmp'), 'BMP')
    mark110 = draw_mark(110)
    s = Image.new('RGBA', (164, 314), (*INK[:3], 255))
    s.alpha_composite(mark110, ((164 - 110) // 2, 70))
    d = ImageDraw.Draw(s)
    f = font(26, True)
    bb = d.textbbox((0, 0), 'Asin', font=f)
    tw = bb[2] - bb[0]
    d.text(((164 - tw) // 2, 210), 'Asin', font=f, fill=(255, 255, 255, 255))
    d.rounded_rectangle([(164 - 50) // 2, 244, (164 + 50) // 2, 248], radius=2, fill=ACCENT)
    s.convert('RGB').save(os.path.join(ROOT, 'DeskApp/branding/sidebar.bmp'), 'BMP')
    print('nsis branding ok')


if __name__ == '__main__':
    main()
