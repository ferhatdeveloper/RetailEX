#!/usr/bin/env python3
"""EN1_logo_OUT.scr -> retailex_logoluetiket.scr

Orijinal yerlesim aynen korunur. Yalnizca ustteki RT/RONGTA markasi:
  - RT oval ikon -> Megal ikon
  - RONGTA yazisi -> MEGAL (ayni 15px bloklu piksel font)

Metadata'ya dokunulmaz. Temizleme alanlari yalnizca logo + RONGTA bbox ile sinirli.
"""
from __future__ import annotations

import shutil
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
RONGTA_DIR = ROOT.parent
PROJECT = RONGTA_DIR.parent.parent
INSTALLER_RONGTA = PROJECT / "installer" / "payload" / "Rongta"

SRC_LOGO_CANDIDATES = [
    Path(
        r"C:\Users\FERHAT\.cursor\projects\c-Users-FERHAT-Desktop-TeraziRongta"
        r"\assets\c__Users_FERHAT_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images"
        r"_megal-edf5c2e7-98e0-4215-9169-24dad3fe501b.png"
    ),
    Path(
        r"C:\Users\FERHAT\.cursor\projects\c-Users-FERHAT-Desktop-TeraziRongta"
        r"\assets\c__Users_FERHAT_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images"
        r"_megal-6d9fc414-8d8a-4431-b24f-699ce45b0d7f.png"
    ),
    ROOT / "megal_logo_black.png",
]

ORIGINAL_SOURCES = [
    Path(r"C:\RLS1000\EN1_logo_OUT.scr"),
    ROOT / "EN1_logo_OUT_rongta.scr",
]

OUTPUT_LABELS = ROOT / "retailex_logoluetiket.scr"
OUTPUT_RONGTA = RONGTA_DIR / "retailex_logoluetiket.scr"
PREVIEW_PNG = ROOT / "retailex_logoluetiket_onizleme.png"
COMPARE_PNG = ROOT / "retailex_logoluetiket_karsilastirma.png"
DEBUG_PNG = ROOT / "_debug_megal_brand.png"

LABEL_W = 448
LABEL_H = 320
ROW_BYTES = LABEL_W // 8
BITMAP_BLOB_START = 400

# EN1 orijinal logo kutusu
LOGO_X, LOGO_Y, LOGO_W, LOGO_H = 97, 3, 54, 39

# RONGTA metin bbox (piksel analizi: x=71..177, y=51..65)
RONGTA_X0, RONGTA_Y0, RONGTA_X1, RONGTA_Y1 = 71, 51, 178, 66
RONGTA_H = RONGTA_Y1 - RONGTA_Y0  # 15

# MEGAL harfleri — orijinal RONGTA ile ayni stroke (~5px) ve 15 satir yukseklik.
# G: orijinal G kalibi; A: orijinal A kalibi; M/E/L: ayni stil.
MEGAL_M = [
    "#####.........#####",
    "#####.........#####",
    "######.......######",
    "######.......######",
    "#######.....#######",
    "#######.....#######",
    "########...########",
    "###.#####.#####.###",
    "###..#########..###",
    "###...#######...###",
    "###....#####....###",
    "###....#####....###",
    "###....#####....###",
    "###....#####....###",
    "###....#####....###",
]

MEGAL_E = [
    "#################",
    "#################",
    "#####............",
    "#####............",
    "#####............",
    "#####............",
    "#############....",
    "#############....",
    "#####............",
    "#####............",
    "#####............",
    "#####............",
    "#####............",
    "#################",
    "#################",
]

# Orijinal RONGTA G (15x17)
MEGAL_G = [
    "#################",
    "#####............",
    "#####............",
    "#####............",
    "#####............",
    "#####............",
    "#####....########",
    "#####.......#####",
    "#####.......#####",
    "#####.......#####",
    "#####.......#####",
    "#####.......#####",
    "#####.......#####",
    "#####.......#####",
    "#################",
]

# Orijinal RONGTA A (kirpilmis, 15 yukseklik)
MEGAL_A = [
    "......#########......",
    ".....###########.....",
    ".....#####.#####.....",
    "....#####...####.....",
    "....#####...#####....",
    "....#####...#####....",
    "...#####.....#####...",
    "...#####.....#####...",
    "...#####.....#####...",
    "..#####.......#####..",
    "..#####.###########..",
    ".######.......#####..",
    ".######........#####.",
    ".#####.........#####.",
    "######.........######",
]

MEGAL_L = [
    "#####...........",
    "#####...........",
    "#####...........",
    "#####...........",
    "#####...........",
    "#####...........",
    "#####...........",
    "#####...........",
    "#####...........",
    "#####...........",
    "#####...........",
    "#####...........",
    "#####...........",
    "################",
    "################",
]

LETTER_GAP = 2
ICON_MAX_W = 48
ICON_MAX_H = 34


def resolve_original_scr() -> Path:
    for path in ORIGINAL_SOURCES:
        if path.exists():
            return path
    raise FileNotFoundError(
        "Orijinal EN1_logo_OUT.scr bulunamadi: "
        + ", ".join(str(p) for p in ORIGINAL_SOURCES)
    )


def resolve_src_logo() -> Path:
    for path in SRC_LOGO_CANDIDATES:
        if path.exists():
            return path
    raise FileNotFoundError(
        "Kaynak logo bulunamadi: "
        + ", ".join(str(p) for p in SRC_LOGO_CANDIDATES)
    )


def backup_path(base: Path) -> Path:
    stamp = date.today().strftime("%Y%m%d")
    return base.with_name(f"{base.stem}_backup_{stamp}{base.suffix}")


def find_markers(data: bytes) -> list[int]:
    return [i for i in range(len(data) - 1) if data[i] == 0xFF and data[i + 1] == 0x00]


def blob_start(data: bytes) -> int:
    return find_markers(data)[6] + 2


def bitmap_base(data: bytes) -> int:
    return blob_start(data) + BITMAP_BLOB_START


def decode_bitmap(data: bytes) -> Image.Image:
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
            if (row[x // 8] >> (7 - (x % 8))) & 1:
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
    out = bytearray(base_scr)
    bb = bitmap_base(base_scr)
    for y in range(LABEL_H):
        dest = bb + y * ROW_BYTES
        if dest + ROW_BYTES > len(out):
            break
        out[dest : dest + ROW_BYTES] = encode_row(img, y)
    return bytes(out)


def clear_rect(img: Image.Image, x0: int, y0: int, x1: int, y1: int) -> None:
    px = img.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            if 0 <= x < LABEL_W and 0 <= y < LABEL_H:
                px[x, y] = 1


def paste_black(base: Image.Image, block: Image.Image, x: int, y: int) -> None:
    px = base.load()
    bpx = block.load()
    for by in range(block.height):
        for bx in range(block.width):
            if bpx[bx, by] == 0:
                nx, ny = x + bx, y + by
                if 0 <= nx < LABEL_W and 0 <= ny < LABEL_H:
                    px[nx, ny] = 0


def glyph_from_rows(rows: list[str]) -> Image.Image:
    h = len(rows)
    w = max(len(r) for r in rows)
    img = Image.new("1", (w, h), 1)
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == "#":
                px[x, y] = 0
    return img


def build_megal_text(_original: Image.Image | None = None) -> Image.Image:
    glyphs = [
        glyph_from_rows(MEGAL_M),
        glyph_from_rows(MEGAL_E),
        glyph_from_rows(MEGAL_G),
        glyph_from_rows(MEGAL_A),
        glyph_from_rows(MEGAL_L),
    ]
    total_w = sum(g.width for g in glyphs) + LETTER_GAP * (len(glyphs) - 1)
    out = Image.new("1", (total_w, RONGTA_H), 1)
    x = 0
    for i, gimg in enumerate(glyphs):
        # Tum glyph'ler 15 satir; yine de hizala
        canvas = Image.new("1", (gimg.width, RONGTA_H), 1)
        paste_black(canvas, gimg, 0, 0)
        paste_black(out, canvas, x, 0)
        x += gimg.width + (LETTER_GAP if i < len(glyphs) - 1 else 0)
    return out


def blacken_logo(src: Path) -> Image.Image:
    rgba = Image.open(src).convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    mono = Image.new("1", (w, h), 1)
    mpx = mono.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a >= 32 and (r < 200 or g < 200 or b < 200):
                mpx[x, y] = 0
    bbox = mono.getbbox()
    return mono.crop(bbox) if bbox else mono


def fit_icon(icon: Image.Image) -> Image.Image:
    iw, ih = icon.size
    scale = min(ICON_MAX_W / iw, ICON_MAX_H / ih, 1.0)
    nw = max(1, int(iw * scale))
    nh = max(1, int(ih * scale))
    return icon.resize((nw, nh), Image.Resampling.NEAREST)


def apply_branding(base_img: Image.Image, src_logo: Path) -> Image.Image:
    out = base_img.copy()

    # 1) Yalnizca logo kutusu + RONGTA metnini sil (diger alanlara dokunma)
    clear_rect(out, LOGO_X, LOGO_Y, LOGO_X + LOGO_W, LOGO_Y + LOGO_H)
    clear_rect(out, RONGTA_X0, RONGTA_Y0, RONGTA_X1, RONGTA_Y1)

    # 2) Megal ikon
    icon = fit_icon(blacken_logo(src_logo))
    ix = LOGO_X + (LOGO_W - icon.width) // 2
    iy = LOGO_Y + (LOGO_H - icon.height) // 2
    paste_black(out, icon, ix, iy)

    # 3) MEGAL metni — RONGTA yuva merkezine
    megal = build_megal_text()
    region_w = RONGTA_X1 - RONGTA_X0
    paste_x = RONGTA_X0 + max(0, (region_w - megal.width) // 2)
    paste_y = RONGTA_Y0
    paste_black(out, megal, paste_x, paste_y)

    # Debug crop
    debug = out.crop((60, 0, 220, 80)).convert("RGB")
    debug = debug.resize((debug.width * 4, debug.height * 4), Image.Resampling.NEAREST)
    debug.save(DEBUG_PNG)

    return out


def compare_with_base(patched: bytes, base: bytes) -> dict:
    bs = blob_start(base)
    meta_end = bs + BITMAP_BLOB_START
    diffs = [i for i, (a, b) in enumerate(zip(base, patched)) if a != b]
    return {
        "total": len(diffs),
        "metadata": sum(1 for i in diffs if i < meta_end),
        "bitmap": sum(1 for i in diffs if i >= meta_end),
        "same_size": len(base) == len(patched),
    }


def load_font(size: int):
    for name in ("arialbd.ttf", "arial.ttf", "segoeui.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def render_preview(img: Image.Image, title: str, scale: int = 2) -> Image.Image:
    w, h = LABEL_W * scale, LABEL_H * scale
    preview = img.convert("RGB").resize((w, h), Image.Resampling.NEAREST)
    canvas = Image.new("RGB", (w, h + 28), "#f4f4f4")
    canvas.paste(preview, (0, 0))
    ImageDraw.Draw(canvas).text((8, h + 6), title, fill="#333333", font=load_font(11))
    return canvas


def create_comparison(original: Image.Image, patched: Image.Image) -> Image.Image:
    scale = 2
    left = render_preview(original, "Orijinal EN1 (RT RONGTA)", scale)
    right = render_preview(patched, "retailex (Megal + MEGAL)", scale)
    w = LABEL_W * scale
    h = LABEL_H * scale + 28
    combined = Image.new("RGB", (w * 2 + 24, h + 8), "#f0f0f0")
    combined.paste(left, (8, 8))
    combined.paste(right, (w + 16, 8))
    return combined


def sync_outputs(patched: bytes) -> None:
    OUTPUT_LABELS.write_bytes(patched)
    OUTPUT_RONGTA.write_bytes(patched)
    if INSTALLER_RONGTA.exists():
        (INSTALLER_RONGTA / "retailex_logoluetiket.scr").write_bytes(patched)


def backup_outputs() -> list[Path]:
    created: list[Path] = []
    for path in (OUTPUT_LABELS, OUTPUT_RONGTA):
        if path.exists():
            dest = backup_path(path)
            if not dest.exists():
                shutil.copy2(path, dest)
            created.append(dest)
    return created


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    src_logo = resolve_src_logo()
    original_path = resolve_original_scr()
    base_bytes = original_path.read_bytes()
    backups = backup_outputs()

    original_bitmap = decode_bitmap(base_bytes)
    patched_bitmap = apply_branding(original_bitmap, src_logo)
    patched = patch_bitmap(base_bytes, patched_bitmap)

    stats = compare_with_base(patched, base_bytes)
    if not stats["same_size"]:
        raise RuntimeError("Dosya boyutu degisti.")
    if stats["metadata"] > 0:
        raise RuntimeError(f"Metadata degisti ({stats['metadata']} byte).")

    # Guvenlik: RONGTA disindaki bitmap bolgeleri ayni olmali (ornegin y=80+)
    diff_pixels = 0
    opx = original_bitmap.load()
    ppx = patched_bitmap.load()
    for y in range(80, LABEL_H):
        for x in range(LABEL_W):
            if opx[x, y] != ppx[x, y]:
                diff_pixels += 1
    if diff_pixels:
        raise RuntimeError(
            f"y>=80 bolgesinde {diff_pixels} piksel degisti — temizleme alani cok genis!"
        )

    sync_outputs(patched)
    render_preview(patched_bitmap, "retailex_logoluetiket.scr (MEGAL)").save(PREVIEW_PNG)
    create_comparison(original_bitmap, patched_bitmap).save(COMPARE_PNG)

    print("=== basarili ===")
    print("Kaynak:", original_path)
    print("Logo:", src_logo)
    for b in backups:
        print("Yedek:", b)
    print("SCR:", OUTPUT_LABELS)
    print("SCR:", OUTPUT_RONGTA)
    print("Onizleme:", PREVIEW_PNG)
    print("Debug brand:", DEBUG_PNG)
    print(
        f"Patch: metadata={stats['metadata']}, bitmap={stats['bitmap']}, "
        f"y>=80 diff={diff_pixels}"
    )


if __name__ == "__main__":
    main()
