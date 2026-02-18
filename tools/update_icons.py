from PIL import Image
import os

source_path = r"C:\Users\FERHAT\.gemini\antigravity\brain\48d8a7c4-11da-469f-b4bc-a0e093ee618f\retailex_modern_logo_1770658030637.png"
target_dir = r"d:\Exretailosv1\src-tauri\icons"

if not os.path.exists(source_path):
    print(f"Error: Source file not found: {source_path}")
    exit(1)

if not os.path.exists(target_dir):
    print(f"Error: Target directory not found: {target_dir}")
    exit(1)

print(f"Opening source image: {source_path}")
img = Image.open(source_path)

# Save ICO (Standard Windows Icon)
ico_path = os.path.join(target_dir, "icon.ico")
print(f"Saving icon.ico to {ico_path}")
# ICO format supports multiple sizes in one file. Providing 256x256 is good for high res.
img.save(ico_path, format='ICO', sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])

# Save Main PNG
png_path = os.path.join(target_dir, "icon.png")
print(f"Saving icon.png to {png_path}")
img.save(png_path, format='PNG')

# Save 32x32
path_32 = os.path.join(target_dir, "32x32.png")
print(f"Saving 32x32.png to {path_32}")
img.resize((32, 32)).save(path_32, format='PNG')

# Save 128x128
path_128 = os.path.join(target_dir, "128x128.png")
print(f"Saving 128x128.png to {path_128}")
img.resize((128, 128)).save(path_128, format='PNG')

# Save 128x128@2x (just 256x256 essentially, or same depending on dpi, but tauri treats it as filename)
path_128_2x = os.path.join(target_dir, "128x128@2x.png")
print(f"Saving 128x128@2x.png to {path_128_2x}")
img.resize((256, 256)).save(path_128_2x, format='PNG')

print("All icons updated successfully.")
