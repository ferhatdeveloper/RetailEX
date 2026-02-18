from PIL import Image, ImageDraw

def create_gradient_image(width, height, color1, color2):
    base = Image.new('RGB', (width, height), color1)
    top = Image.new('RGB', (width, height), color2)
    mask = Image.new('L', (width, height))
    mask_data = []
    for y in range(height):
        mask_data.extend([int(255 * (y / height))] * width)
    mask.putdata(mask_data)
    base.paste(top, (0, 0), mask)
    return base

# Colors
NAVY = (15, 23, 42)    # #0F172A
CYAN = (6, 182, 212)   # #06B6D4

try:
    logo = Image.open('logo_fixed.png').convert('RGBA')
    
    # Sidebar: 164x314
    sidebar = create_gradient_image(164, 314, NAVY, (30, 41, 59))
    logo_side = logo.resize((120, 120), Image.Resampling.LANCZOS)
    sidebar.paste(logo_side, (22, 50), logo_side)
    sidebar.save('branding/sidebar.bmp')
    
    # Header: 150x57
    header = Image.new('RGB', (150, 57), (255, 255, 255))
    logo_head = logo.resize((45, 45), Image.Resampling.LANCZOS)
    header.paste(logo_head, (100, 6), logo_head)
    # Add some cyan line for accent
    draw = ImageDraw.Draw(header)
    draw.line([(0, 56), (150, 56)], fill=CYAN, width=2)
    header.save('branding/header.bmp')
    
    print("Branding images created successfully.")
except Exception as e:
    print(f"Error: {e}")
