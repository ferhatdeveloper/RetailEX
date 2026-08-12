#!/usr/bin/env python3
"""EN1_logo_OUT.scr icindeki RT RONGTA logosunu siyah Megal logosu ile degistirir."""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
RONGTA = ROOT.parent
PROJECT = RONGTA.parent.parent
INSTALLER_RONGTA = PROJECT / "installer" / "payload" / "Rongta"

SRC_LOGO = Path(
    r"C:\Users\FERHAT\.cursor\projects\c-Users-FERHAT-Desktop-TeraziRongta"
    r"\assets\c__Users_FERHAT_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images"
    r"_megal-6d9fc414-8d8a-4431-b24f-699ce45b0d7f.png"
)
BASE_SCR = RONGTA / "EN1_logo_OUT.scr"
BACKUP_SCR = ROOT / "EN1_logo_OUT_rongta.scr"
OUTPUT_SCR = RONGTA / "EN1_logo_OUT.scr"
LABELS_SCR = ROOT / "EN1_logo_OUT.scr"

# 56x40 mm @ 8 dots/mm
LABEL_W = 448
LABEL_H = 320
ROW_BYTES = LABEL_W // 8
BITMAP_BLOB_START = 400

# RT RONGTA logosu (EN1 orijinalinde tespit edilen bbox)
LOGO_X = 97
LOGO_Y = 3
LOGO_W = 54
LOGO_H = 39


def find_markers(data: bytes) -> list[int]:
    return [i for i in range(len(data) - 1) if data[i] == 0xFF and data[i + 1] == 0x00]


def blob_start(data: bytes) -> int:
    return find_markers(data)[6] + 2


def bitmap_base(data: bytes) -> int:
    return blob_start(data) + BITMAP_BLOB_START


def decode_bitmap(data: bytes) -> Image.Image:
    """EN1: satir basina 56 byte paketlenmis bitmap."""
    bb = bitmap_base(data)
    rest = data[bb:]
    img = Image.new("1", (LABEL_W, LABEL_H), 1)
    px = img.load()
    for y in range(LABEL_H):
        row_off = y * ROW_BYTES
        if row_off + ROW_BYTES > len(rest):
            break
        row = rest[row_off : row_off + ROW_BYTES]
        for x in range(LABEL_W):
            b = row[x // 8]
            if (b >> (7 - (x % 8))) & 1:
                px[x, y] = 0
    return img


def encode_row(img: Image.Image, y: int) -> bytes:
    px = img.load()
    row = bytearray(ROW_BYTES)
    for x in range(LABEL_W):
        if px[x, y] == 0:
            row[x // 8] |= 1 << (7 - (x % 8))
    return bytes(row)


def patch_bitmap(base_scr: bytes, img: Image.Image) -> bytes:
    """Yalnizca bitmap bolgesini gunceller; metadata'ya dokunmaz."""
    out = bytearray(base_scr)
    bb = bitmap_base(base_scr)
    for y in range(LABEL_H):
        dest = bb + y * ROW_BYTES
        if dest + ROW_BYTES > len(out):
            break
        out[dest : dest + ROW_BYTES] = encode_row(img, y)
    return bytes(out)


def blacken_logo(src: Path, target_w: int, target_h: int) -> Image.Image:
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
    return mono.resize((target_w, target_h), Image.Resampling.LANCZOS)


def _logo_mask(logo: Image.Image) -> Image.Image:
    return logo.point(lambda p: 255 if p == 0 else 0, mode="L")


def save_logo_assets(logo: Image.Image) -> None:
    png = Image.new("RGB", logo.size, "white")
    png.paste((0, 0, 0), mask=_logo_mask(logo))
    png.save(ROOT / "megal_logo_black.png")
    logo.save(ROOT / "megal_logo_black.bmp")


def replace_logo_in_bitmap(base_img: Image.Image, logo: Image.Image) -> Image.Image:
    """Rongta logo bolgesini temizleyip Megal logosunu ayni konuma yazar."""
    out = base_img.copy()
    px = out.load()
    lpx = logo.load()

    for y in range(LOGO_Y, LOGO_Y + LOGO_H):
        for x in range(LOGO_X, LOGO_X + LOGO_W):
            px[x, y] = 1

    for ly in range(logo.height):
        for lx in range(logo.width):
            if lpx[lx, ly] == 0:
                px[LOGO_X + lx, LOGO_Y + ly] = 0
    return out


def compare_with_base(patched: bytes, base: bytes) -> dict:
    bs = blob_start(base)
    meta_end = bs + BITMAP_BLOB_START
    diff_positions = [i for i, (a, b) in enumerate(zip(base, patched)) if a != b]
    meta_diffs = [i for i in diff_positions if i < meta_end]
    bitmap_diffs = [i for i in diff_positions if i >= meta_end]
    return {
        "total": len(diff_positions),
        "metadata": len(meta_diffs),
        "bitmap": len(bitmap_diffs),
    }


def _load_font(size: int):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def render_preview(img: Image.Image, title: str, scale: int = 2) -> Image.Image:
    w, h = LABEL_W * scale, LABEL_H * scale
    preview = img.convert("RGB").resize((w, h), Image.Resampling.NEAREST)
    canvas = Image.new("RGB", (w, h + 28), "#f4f4f4")
    canvas.paste(preview, (0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.text((8, h + 6), title, fill="#333333", font=_load_font(11))
    return canvas


def create_previews(original: Image.Image, patched: Image.Image) -> None:
    scale = 2
    orig_prev = render_preview(original, "EN1_logo_OUT.scr (RT RONGTA)", scale)
    megal_prev = render_preview(patched, "EN1_logo_OUT.scr (Megal)", scale)
    orig_prev.save(ROOT / "EN1_rongta_onizleme.png")
    megal_prev.save(ROOT / "EN1_megal_onizleme.png")

    w = LABEL_W * scale
    h = LABEL_H * scale + 28
    combined = Image.new("RGB", (w * 2 + 24, h + 8), "#f0f0f0")
    combined.paste(orig_prev, (8, 8))
    combined.paste(megal_prev, (w + 16, 8))
    cd = ImageDraw.Draw(combined)
    cd.text((8, h + 2), "Orijinal RT RONGTA", fill="#333333", font=_load_font(11))
    cd.text((w + 16, h + 2), f"Megal logo ({LOGO_W}x{LOGO_H} @ {LOGO_X},{LOGO_Y})", fill="#333333", font=_load_font(11))
    combined.save(ROOT / "karsilastirma_onizleme.png")


def sync_outputs(patched: bytes) -> None:
    OUTPUT_SCR.write_bytes(patched)
    LABELS_SCR.write_bytes(patched)
    if INSTALLER_RONGTA.exists():
        (INSTALLER_RONGTA / "EN1_logo_OUT.scr").write_bytes(patched)


def write_readme() -> None:
    text = f"""# EN1 Megal Logolu Etiket Sablonu

`EN1_logo_OUT.scr` (56x40 mm) sablonunda RT RONGTA logosu siyah Megal logosu ile degistirildi.

## Dosyalar

| Dosya | Aciklama |
|-------|----------|
| `../EN1_logo_OUT.scr` | Megal logolu birincil sablon (varsayilan) |
| `EN1_logo_OUT_rongta.scr` | Orijinal RT RONGTA yedegi |
| `megal_logo_black.png` | Siyah Megal logosu |
| `megal_logo_black.bmp` | Termal yazici icin 1-bit BMP |
| `EN1_megal_onizleme.png` | Megal logolu onizleme |
| `EN1_rongta_onizleme.png` | Orijinal onizleme |
| `karsilastirma_onizleme.png` | Yan yana karsilastirma |

## Logo yerlesimi

- Konum: x={LOGO_X}, y={LOGO_Y} (RT RONGTA ile ayni bbox)
- Boyut: {LOGO_W}x{LOGO_H} nokta
- PLU Name, PACKED DATE, VALID DATE, NET WT, UNIT PRICE, TOTAL PRICE, barkod alanlari **degistirilmedi**

## Yeniden olusturma

```bash
python create_en1_megal.py
```
"""
    (ROOT / "README.md").write_text(text, encoding="utf-8")


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)

    if not SRC_LOGO.exists():
        raise FileNotFoundError(f"Kaynak logo bulunamadi: {SRC_LOGO}")
    if not BASE_SCR.exists():
        raise FileNotFoundError(f"EN1_logo_OUT.scr bulunamadi: {BASE_SCR}")

    base_bytes = BASE_SCR.read_bytes()
    if not BACKUP_SCR.exists():
        BACKUP_SCR.write_bytes(base_bytes)

    original_bitmap = decode_bitmap(base_bytes)
    logo = blacken_logo(SRC_LOGO, LOGO_W, LOGO_H)
    save_logo_assets(logo)

    patched_bitmap = replace_logo_in_bitmap(original_bitmap, logo)
    patched = patch_bitmap(base_bytes, patched_bitmap)

    stats = compare_with_base(patched, base_bytes)
    if stats["metadata"] > 0:
        raise RuntimeError(
            f"Metadata degisti ({stats['metadata']} byte). Patch iptal edildi."
        )

    sync_outputs(patched)
    create_previews(original_bitmap, patched_bitmap)
    write_readme()

    print("Olusturuldu / guncellendi:")
    for path in [
        OUTPUT_SCR,
        LABELS_SCR,
        ROOT / "megal_logo_black.png",
        ROOT / "megal_logo_black.bmp",
        ROOT / "EN1_megal_onizleme.png",
        ROOT / "karsilastirma_onizleme.png",
        BACKUP_SCR,
    ]:
        if path.exists():
            print(f"  {path} ({path.stat().st_size} byte)")

    if (INSTALLER_RONGTA / "EN1_logo_OUT.scr").exists():
        print(f"  {INSTALLER_RONGTA / 'EN1_logo_OUT.scr'} (installer payload)")

    print(
        f"Patch: {stats['bitmap']} byte yalnizca bitmap bolgesinde "
        f"(metadata: {stats['metadata']} byte)"
    )


if __name__ == "__main__":
    main()
