#!/usr/bin/env python3
"""Megal logosunu des.scr sablonuna minimum degisiklikle ekler."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
RONGTA = ROOT.parent
SRC_LOGO = Path(
    r"C:\Users\FERHAT\.cursor\projects\c-Users-FERHAT-Desktop-TeraziRongta"
    r"\assets\c__Users_FERHAT_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images"
    r"_megal-6d9fc414-8d8a-4431-b24f-699ce45b0d7f.png"
)
BASE_SCR = RONGTA / "des.scr"

# 40x30 mm @ 8 dots/mm
LABEL_W = 320
LABEL_H = 240
ROW_STRIDE = 16
ROW_DATA_OFFSET = 8
BITMAP_ROW_WIDTH = 104

# Koruyucu logo yerlesimi: sol ust bosluk, kucuk boyut
LOGO_W = 44
LOGO_H = 24
LOGO_X = 6
LOGO_Y = 4
BITMAP_BLOB_START = 400

# des.scr baslik bloklarindan alan koordinatlari (degistirilmez)
FIELD_MARKERS = [
    {"x": 157, "y": 13, "type": 10, "label": "Urun adi alani"},
    {"x": 92, "y": 13, "type": 13, "label": ""},
    {"x": 241, "y": 121, "type": 10, "label": "Agirlik/Deger"},
    {"x": 317, "y": 81, "type": 8, "label": "Fiyat alani"},
]


def find_markers(data: bytes) -> list[int]:
    return [i for i in range(len(data) - 1) if data[i] == 0xFF and data[i + 1] == 0x00]


def blob_start(data: bytes) -> int:
    return find_markers(data)[6] + 2


def blacken_logo(src: Path) -> Image.Image:
    img = Image.open(src).convert("RGBA")
    pixels = img.load()
    w, h = img.size
    mono = Image.new("1", (w, h), 1)
    mpx = mono.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 32:
                continue
            if r < 230 or g < 230 or b < 230:
                mpx[x, y] = 0
    bbox = mono.getbbox()
    if bbox:
        mono = mono.crop(bbox)
    return mono.resize((LOGO_W, LOGO_H), Image.Resampling.LANCZOS)


def _logo_mask(logo: Image.Image) -> Image.Image:
    return logo.point(lambda p: 255 if p == 0 else 0, mode="L")


def save_logo_assets(logo: Image.Image) -> None:
    png = Image.new("RGB", logo.size, "white")
    png.paste((0, 0, 0), mask=_logo_mask(logo))
    png.save(ROOT / "megal_logo_black.png")
    logo.save(ROOT / "megal_logo_black.bmp")


def encode_logo_rows(logo: Image.Image) -> list[bytes]:
    """Sadece logo satirlarini kodla; bos satir yazma."""
    lw, lh = logo.size
    px = logo.load()
    max_x = min(BITMAP_ROW_WIDTH, LOGO_X + lw)
    byte_count = (max_x + 7) // 8 - LOGO_X // 8
    rows: list[bytes] = []
    for y in range(lh):
        row_bits = bytearray(byte_count)
        for x in range(lw):
            if px[x, y] == 0:
                abs_x = LOGO_X + x
                if abs_x >= BITMAP_ROW_WIDTH:
                    continue
                local = abs_x // 8 - LOGO_X // 8
                row_bits[local] |= 1 << (7 - (abs_x % 8))
        out = bytearray(ROW_STRIDE)
        start_byte = ROW_DATA_OFFSET + LOGO_X // 8
        for i, b in enumerate(row_bits):
            if start_byte + i < ROW_STRIDE:
                out[start_byte + i] = b
        rows.append(bytes(out))
    return rows


def patch_scr_minimal(base_scr: bytes, logo_rows: list[bytes]) -> bytes:
    """Yalnizca bos bitmap bloguna logo piksellerini yazar; metadata'ya dokunmaz."""
    out = bytearray(base_scr)
    bs = blob_start(base_scr)
    row_start = bs + BITMAP_BLOB_START + LOGO_Y * ROW_STRIDE

    for row_idx, row_data in enumerate(logo_rows):
        dest = row_start + row_idx * ROW_STRIDE
        if dest + ROW_STRIDE > len(out):
            break
        for i, value in enumerate(row_data):
            if value == 0:
                continue
            pos = dest + i
            if out[pos] == 0:
                out[pos] = value
            else:
                out[pos] = out[pos] | value
    return bytes(out)


def _load_fonts(scale: int) -> tuple:
    try:
        return (
            ImageFont.truetype("arial.ttf", 11 * scale),
            ImageFont.truetype("arial.ttf", 13 * scale),
            ImageFont.truetype("arial.ttf", 15 * scale),
            ImageFont.truetype("arial.ttf", 9 * scale),
        )
    except OSError:
        default = ImageFont.load_default()
        return default, default, default, default


def render_des_layout(
    img: Image.Image,
    scale: int,
    fonts: tuple,
    show_logo: Image.Image | None,
) -> None:
    """des.scr koordinatlarina gore ornek yerlesim cizer."""
    draw = ImageDraw.Draw(img)
    sm, md, lg, xs = fonts
    w, h = LABEL_W * scale, LABEL_H * scale

    draw.rectangle([2, 2, w - 3, h - 3], outline="#222222", width=1)

    if show_logo is not None:
        logo_big = show_logo.resize((LOGO_W * scale, LOGO_H * scale), Image.Resampling.NEAREST)
        logo_rgb = Image.new("RGB", logo_big.size, "white")
        logo_rgb.paste((0, 0, 0), mask=_logo_mask(logo_big))
        img.paste(logo_rgb, (LOGO_X * scale, LOGO_Y * scale))

    # des.scr alan isaretleri (koordinatlar korunur)
    for field in FIELD_MARKERS:
        fx, fy = field["x"] * scale, field["y"] * scale
        draw.ellipse([fx - 3, fy - 3, fx + 3, fy + 3], fill="#c0392b", outline="#c0392b")
        if field["label"]:
            draw.text((fx + 6, fy - 5), field["label"], fill="#888888", font=xs)

    # Ornek icerik — des.scr alan konumlarina hizali
    draw.text((20 * scale, 42 * scale), "ORNEK URUN ADI", fill="black", font=lg)
    draw.text((20 * scale, 78 * scale), "Agirlik", fill="#333333", font=sm)
    draw.text((w - 12 * scale, 78 * scale), "1,250 kg", fill="black", font=md, anchor="ra")
    draw.text((20 * scale, 98 * scale), "Birim Fiyat", fill="#333333", font=sm)
    draw.text((w - 12 * scale, 98 * scale), "89,90", fill="black", font=md, anchor="ra")
    draw.text((20 * scale, 118 * scale), "Tutar", fill="#333333", font=sm)
    draw.text((w - 12 * scale, 116 * scale), "112,38", fill="black", font=lg, anchor="ra")

  # Barkod bolgesi (alt — des.scr ile ayni bolge)
    bx0, by0 = 36 * scale, 150 * scale
    bx1 = w - 36 * scale
    for i in range(52):
        x = bx0 + i * ((bx1 - bx0) // 52)
        bar_h = 22 * scale if i % 3 else 30 * scale
        draw.line([(x, by0), (x, by0 + bar_h)], fill="black", width=max(1, scale))
    draw.text((w // 2, by0 + 34 * scale), "2 900001 250112", fill="black", font=sm, anchor="mt")


def create_previews(logo: Image.Image) -> None:
    scale = 2
    w, h = LABEL_W * scale, LABEL_H * scale

    original = Image.new("RGB", (w, h), "white")
    render_des_layout(original, scale, _load_fonts(scale), show_logo=None)
    draw_orig = ImageDraw.Draw(original)
    draw_orig.text(
        (w // 2, h - 8 * scale),
        "des.scr (orijinal)",
        fill="#666666",
        font=_load_fonts(scale)[3],
        anchor="mb",
    )
    original.save(ROOT / "des_tasarim_onizleme.png")

    logolu = Image.new("RGB", (w, h), "white")
    render_des_layout(logolu, scale, _load_fonts(scale), show_logo=logo)
    draw_new = ImageDraw.Draw(logolu)
    draw_new.text(
        (w // 2, h - 8 * scale),
        "logolu_tasarim.scr",
        fill="#666666",
        font=_load_fonts(scale)[3],
        anchor="mb",
    )
    logolu.save(ROOT / "logolu_tasarim_onizleme.png")

    combined = Image.new("RGB", (w * 2 + 24, h + 36), "#f4f4f4")
    combined.paste(original, (8, 8))
    combined.paste(logolu, (w + 16, 8))
    cd = ImageDraw.Draw(combined)
    cd.text((8, h + 22), "Orijinal des.scr", fill="#333333", font=_load_fonts(1)[3])
    cd.text((w + 16, h + 22), "Logo: sol ust 44x24 nokta", fill="#333333", font=_load_fonts(1)[3])
    combined.save(ROOT / "karsilastirma_onizleme.png")


def write_readme() -> None:
    text = """# Megal Logolu Etiket Tasarimi (des.scr tabanli)

`des.scr` sablonunun yerlesimi korunarak sol ust koseye kucuk Megal logosu eklenir.

## Dosyalar

| Dosya | Aciklama |
|-------|----------|
| `megal_logo_black.png` | Siyah Megal logosu |
| `megal_logo_black.bmp` | Termal yazici icin 1-bit BMP |
| `logolu_tasarim.scr` | Logolu etiket sablonu |
| `des_tasarim_onizleme.png` | Orijinal des.scr onizlemesi |
| `logolu_tasarim_onizleme.png` | Logolu onizleme |
| `karsilastirma_onizleme.png` | Yan yana karsilastirma |

## Logo yerlesimi

- Konum: sol ust (x=6, y=4 nokta)
- Boyut: 44x24 nokta
- Urun adi, fiyat, barkod alanlari **des.scr ile ayni konumda** birakildi
- Yalnizca bos bitmap bloguna (offset 400+) logo pikselleri yazilir

## Teraziye yukleme

RetailEX Terazi Yoneticisi → Terazi Islemleri → etiket yolu:
`Resources\\Rongta\\Labels\\logolu_tasarim.scr`

## Yeniden olusturma

```bash
python create_logolu_tasarim.py
```
"""
    (ROOT / "README.md").write_text(text, encoding="utf-8")


def compare_with_base(patched: bytes, base: bytes) -> dict:
    bs = blob_start(base)
    diff_positions = [i for i, (a, b) in enumerate(zip(base, patched)) if a != b]
    meta_diffs = [i for i in diff_positions if i < bs + BITMAP_BLOB_START]
    bitmap_diffs = [i for i in diff_positions if i >= bs + BITMAP_BLOB_START]
    return {
        "total": len(diff_positions),
        "metadata": len(meta_diffs),
        "bitmap": len(bitmap_diffs),
        "first_bitmap": min(bitmap_diffs) if bitmap_diffs else None,
        "last_bitmap": max(bitmap_diffs) if bitmap_diffs else None,
    }


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)

    if not SRC_LOGO.exists():
        raise FileNotFoundError(f"Kaynak logo bulunamadi: {SRC_LOGO}")
    if not BASE_SCR.exists():
        raise FileNotFoundError(f"des.scr bulunamadi: {BASE_SCR}")

    logo = blacken_logo(SRC_LOGO)
    save_logo_assets(logo)

    logo_rows = encode_logo_rows(logo)
    base = BASE_SCR.read_bytes()
    patched = patch_scr_minimal(base, logo_rows)

    stats = compare_with_base(patched, base)
    if stats["metadata"] > 0:
        raise RuntimeError(
            f"Metadata degisti ({stats['metadata']} byte). Patch iptal edildi."
        )

    (ROOT / "logolu_tasarim.scr").write_bytes(patched)
    create_previews(logo)
    write_readme()

    print("Olusturuldu:")
    for name in [
        "megal_logo_black.png",
        "megal_logo_black.bmp",
        "logolu_tasarim.scr",
        "des_tasarim_onizleme.png",
        "logolu_tasarim_onizleme.png",
        "karsilastirma_onizleme.png",
        "README.md",
    ]:
        p = ROOT / name
        print(f"  {p} ({p.stat().st_size} byte)")

    print(
        f"Patch: {stats['bitmap']} byte yalnizca bitmap blogunda "
        f"(metadata: {stats['metadata']} byte)"
    )


if __name__ == "__main__":
    main()
