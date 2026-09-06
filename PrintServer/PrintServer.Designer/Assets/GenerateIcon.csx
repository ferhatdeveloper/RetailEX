#!/usr/bin/env python3
"""
RetailEX Designer icon olusturucu.
- Modern gradient mavi arkaplan (#1E40AF -> #3B82F6)
- Beyaz 'RX' harfleri (RetailEX kisaltmasi)
- Printer/scalpel ikonu vari teget detay
- 16/24/32/48/64/128/256 boyutlarinda uretir

Kullanim:
    python3 scripts/generate-designer-icon.py
"""
from PIL import Image, ImageDraw, ImageFont
import os
import sys

SIZES = [16, 24, 32, 48, 64, 128, 256]
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "Assets")
OUTPUT_ICO = os.path.join(OUTPUT_DIR, "app.ico")
OUTPUT_PNG = os.path.join(OUTPUT_DIR, "app.png")


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def draw_gradient(size: int) -> Image.Image:
    """Capraz gradient: sol ust koyu mavi -> sag alt acik mavi."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pixels = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            r = lerp(30, 96, t)    # 1E -> 60
            g = lerp(64, 165, t)   # 40 -> A5
            b = lerp(175, 250, t)  # AF -> FA
            pixels[x, y] = (r, g, b, 255)
    return img


def rounded_rect_mask(size: int, radius_ratio: float = 0.18) -> Image.Image:
    """Yuvarlatilmis kare maskesi (alpha)."""
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    radius = int(size * radius_ratio)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def draw_rx_letter(img: Image.Image, size: int) -> Image.Image:
    """'RX' harfini beyaz olarak ciz."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    text = "RX"
    # En uygun font boyutunu bul
    font = None
    for font_size in range(size, 4, -2):
        try:
            f = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
        except OSError:
            try:
                f = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", font_size)
            except OSError:
                f = ImageFont.load_default()
        bbox = d.textbbox((0, 0), text, font=f)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        if tw <= size * 0.75 and th <= size * 0.6:
            font = f
            break
    if font is None:
        font = ImageFont.load_default()

    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1]
    # Golge
    d.text((x + 1, y + 2), text, fill=(0, 0, 0, 80), font=font)
    # Beyaz
    d.text((x, y), text, fill=(255, 255, 255, 255), font=font)
    return Image.alpha_composite(img, layer)


def add_printer_band(img: Image.Image, size: int) -> Image.Image:
    """Alt kisma ince bir 'yazici kagidi' bandi ekle (cihaz hissi)."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    band_height = max(2, size // 10)
    band_y = size - band_height - max(2, size // 16)
    band_left = size // 4
    band_right = size - size // 4
    # Beyaz kagit bandi (yuvarlatilmis)
    radius = band_height // 2
    d.rounded_rectangle(
        (band_left, band_y, band_right, band_y + band_height),
        radius=radius,
        fill=(255, 255, 255, 220),
    )
    # Uzerine uc kucuk yatay cizgi (metin temsili)
    line_color = (180, 200, 230, 255)
    line_y = band_y + band_height // 2 - 1
    line_left = band_left + band_height // 2
    line_right = band_right - band_height // 2
    line_count = 3
    spacing = (line_right - line_left) // (line_count + 1)
    for i in range(1, line_count + 1):
        x = line_left + i * spacing
        d.ellipse((x - 1, line_y - 1, x + 1, line_y + 1), fill=line_color)
    return Image.alpha_composite(img, layer)


def make_icon(size: int) -> Image.Image:
    gradient = draw_gradient(size)
    # Yuvarlatilmis koselere kirp
    mask = rounded_rect_mask(size)
    gradient.putalpha(mask)
    icon = gradient
    icon = draw_rx_letter(icon, size)
    if size >= 32:
        icon = add_printer_band(icon, size)
    return icon


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    images = []
    for size in SIZES:
        img = make_icon(size)
        images.append(img)
        # PNG'yi de kaydet (256 buyukluk referans)
        if size == 256:
            img.save(OUTPUT_PNG, "PNG")
            print(f"PNG  : {OUTPUT_PNG}")
    # ICO kaydet
    images[0].save(
        OUTPUT_ICO,
        format="ICO",
        sizes=[(s, s) for s in SIZES],
        append_images=images[1:],
    )
    print(f"ICO  : {OUTPUT_ICO}")
    print(f"Boyutlar: {SIZES}")


if __name__ == "__main__":
    main()
