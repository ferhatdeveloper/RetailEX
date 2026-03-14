from PIL import Image
import os

src = r"d:\Exretailosv1\src-tauri\logo.png"
dest = r"d:\Exretailosv1\src-tauri\logo_fixed.png"

try:
    with Image.open(src) as img:
        img.save(dest, "PNG")
    print(f"Successfully converted {src} to {dest}")
except Exception as e:
    print(f"Error: {e}")
