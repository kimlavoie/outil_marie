import os
from PIL import Image, ImageDraw

input_path = r"C:\Users\kimla\.gemini\antigravity\brain\e1e7057c-dfb9-444e-87db-c8c8729b89a2\favicon_logo_transparent_1787412982989.jpg"
img = Image.open(input_path).convert("RGBA")

w, h = img.size
pixels = img.load()
min_x, min_y, max_x, max_y = w, h, 0, 0

for y in range(h):
    for x in range(w):
        r, g, b, _ = pixels[x, y]
        if r < 240 or g < 240 or b < 240:
            if x < min_x: min_x = x
            if x > max_x: max_x = x
            if y < min_y: min_y = y
            if y > max_y: max_y = y

padding = int(max(max_x - min_x, max_y - min_y) * 0.08)
crop_x1 = max(0, min_x - padding)
crop_y1 = max(0, min_y - padding)
crop_x2 = min(w, max_x + padding)
crop_y2 = min(h, max_y + padding)

cropped = img.crop((crop_x1, crop_y1, crop_x2, crop_y2))

cw, ch = cropped.size
max_dim = max(cw, ch)

square_img = Image.new("RGBA", (max_dim, max_dim), (255, 255, 255, 255))
offset_x = (max_dim - cw) // 2
offset_y = (max_dim - ch) // 2
square_img.paste(cropped, (offset_x, offset_y))

mask = Image.new("L", (max_dim, max_dim), 0)
draw = ImageDraw.Draw(mask)
corner_radius = int(max_dim * 0.18)
draw.rounded_rectangle((0, 0, max_dim, max_dim), radius=corner_radius, fill=255)

final_img = Image.new("RGBA", (max_dim, max_dim), (0, 0, 0, 0))
final_img.paste(square_img, (0, 0), mask)

os.makedirs(r"c:\Users\kimla\Documents\projets\outil_marie\src\assets", exist_ok=True)

final_img.save(r"c:\Users\kimla\Documents\projets\outil_marie\public\logo.png", "PNG")
final_img.save(r"c:\Users\kimla\Documents\projets\outil_marie\public\favicon.png", "PNG")
final_img.save(r"c:\Users\kimla\Documents\projets\outil_marie\src\assets\logo.png", "PNG")

ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
final_img.save(r"c:\Users\kimla\Documents\projets\outil_marie\public\favicon.ico", format="ICO", sizes=ico_sizes)

print("Maximized Favicon with solid background & Logo generated successfully!")
