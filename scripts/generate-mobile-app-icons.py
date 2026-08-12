#!/usr/bin/env python3
"""
RetailEX mobil uygulama ikonlarını DeskApp marka ikonundan üretir.

Kaynak: DeskApp/icons/icon.png (Windows / Tauri ile aynı marka)
Çıktı:  mobile/assets/{icon,splash-icon,android-icon-*,favicon}.png

Kullanım (repo kökü):
  python3 scripts/generate-mobile-app-icons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "DeskApp" / "icons" / "icon.png"
OUT = ROOT / "mobile" / "assets"

# Expo / Android adaptive güvenli alan ~ %66 merkez
SAFE = 0.66
BRAND_BLUE = (37, 99, 235, 255)  # #2563eb
BRAND_BLUE_DEEP = (30, 64, 175, 255)  # #1e40af


def resize_cover(im: Image.Image, size: int) -> Image.Image:
    im = im.convert("RGBA")
    return im.resize((size, size), Image.Resampling.LANCZOS)


def make_gradient(size: int) -> Image.Image:
    """Çapraz mavi gradient — DeskApp ikon zeminiyle uyumlu."""
    img = Image.new("RGBA", (size, size), BRAND_BLUE)
    px = img.load()
    assert px is not None
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            r = int(56 + (37 - 56) * t)  # soft cyan → blue
            g = int(189 + (99 - 189) * t)
            b = int(248 + (235 - 248) * t)
            # deepen toward bottom-right
            t2 = (x * 0.35 + y * 0.65) / (size - 1)
            r = int(r * (1 - 0.35 * t2) + 30 * 0.35 * t2)
            g = int(g * (1 - 0.45 * t2) + 64 * 0.45 * t2)
            b = int(b * (1 - 0.15 * t2) + 175 * 0.15 * t2)
            px[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)), 255)
    return img


def paste_centered(base: Image.Image, overlay: Image.Image, scale: float) -> Image.Image:
    out = base.copy()
    ow = max(1, int(base.width * scale))
    oh = max(1, int(base.height * scale))
    mark = overlay.resize((ow, oh), Image.Resampling.LANCZOS)
    x = (base.width - ow) // 2
    y = (base.height - oh) // 2
    out.alpha_composite(mark, (x, y))
    return out


def extract_mark_on_transparent(src: Image.Image, size: int, scale: float = SAFE) -> Image.Image:
    """
    Kaynak ikonu güvenli alanda ortalar; zemin şeffaf (adaptive foreground).
    Kaynak zaten yuvarlatılmış kare ise doğrudan küçültülüp ortalanır.
    """
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mark = resize_cover(src, int(size * scale))
    # hafif kenar yumuşatma
    x = (size - mark.width) // 2
    y = (size - mark.height) // 2
    canvas.paste(mark, (x, y), mark)
    return canvas


def make_monochrome(src: Image.Image, size: int = 432) -> Image.Image:
    """Android themed icon — beyaz siluet, şeffaf zemin."""
    im = resize_cover(src, size)
    pixels = im.load()
    assert pixels is not None
    mask = Image.new("L", (size, size), 0)
    mask_px = mask.load()
    assert mask_px is not None
    for y in range(size):
        for x in range(size):
            r, g, b, a = pixels[x, y]
            if a < 16:
                continue
            luma = 0.299 * r + 0.587 * g + 0.114 * b
            is_warm = r > 180 and g > 120 and b < 140  # güneş
            is_light = luma > 175 and b < 220  # beyaz bina (mavi zeminden ayrışır)
            if is_light or is_warm:
                mask_px[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(3))
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    white = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    out.paste(white, (0, 0), mask)
    return out


def make_favicon(src: Image.Image, size: int = 48) -> Image.Image:
    return resize_cover(src, size)


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"Kaynak yok: {SRC}")
    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC).convert("RGBA")

    # 1) Ana uygulama ikonu (iOS / Expo)
    icon = resize_cover(src, 1024)
    # Expo icon genelde opak ister — RGB kaydet
    icon_rgb = Image.new("RGB", (1024, 1024), (37, 99, 235))
    icon_rgb.paste(icon, mask=icon.split()[3])
    icon_path = OUT / "icon.png"
    icon_rgb.save(icon_path, "PNG", optimize=True)

    # 2) Splash — mavi zeminde ortalanmış marka (contain)
    splash_bg = make_gradient(1024)
    splash = paste_centered(splash_bg, src, 0.55)
    splash_path = OUT / "splash-icon.png"
    splash.convert("RGB").save(splash_path, "PNG", optimize=True)

    # 3) Android adaptive foreground (şeffaf zemin + güvenli alan)
    fg = extract_mark_on_transparent(src, 1024, scale=0.72)
    fg_path = OUT / "android-icon-foreground.png"
    fg.save(fg_path, "PNG", optimize=True)

    # 4) Android adaptive background
    bg = make_gradient(512)
    bg_path = OUT / "android-icon-background.png"
    bg.save(bg_path, "PNG", optimize=True)

    # 5) Monochrome
    mono = make_monochrome(src, 432)
    mono_path = OUT / "android-icon-monochrome.png"
    mono.save(mono_path, "PNG", optimize=True)

    # 6) Favicon
    fav = make_favicon(src, 48)
    fav_path = OUT / "favicon.png"
    fav.save(fav_path, "PNG", optimize=True)

    print("RetailEX mobil ikonları güncellendi:")
    for p in (icon_path, splash_path, fg_path, bg_path, mono_path, fav_path):
        print(f"  {p.relative_to(ROOT)}  ({p.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
