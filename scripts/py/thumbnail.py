#!/usr/bin/env python3
"""ClipCraft AI - Thumbnail generator: keyframe + bold text overlay.

Usage: thumbnail.py <image_path> <headline> <output_path> [accent_hex]
Renders a 1280x720 thumbnail with a dark gradient at the bottom
and the headline in a bold sans font with shadow.
"""
import sys
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1280, 720

FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/segoeuib.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
]


def load_font(size):
    for p in FONT_PATHS:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def wrap_text(draw, text, font, max_width):
    words = text.split()
    lines = []
    cur = []
    for word in words:
        trial = " ".join(cur + [word])
        if draw.textlength(trial, font=font) <= max_width:
            cur.append(word)
        else:
            if cur:
                lines.append(" ".join(cur))
            cur = [word]
    if cur:
        lines.append(" ".join(cur))
    return lines


def main():
    image_path = sys.argv[1]
    headline = sys.argv[2].upper()
    output_path = sys.argv[3]
    accent = sys.argv[4] if len(sys.argv) > 4 else "#8B5CF6"

    img = Image.open(image_path).convert("RGB")
    # cover-fit to WxH
    scale = max(W / img.width, H / img.height)
    nw, nh = int(img.width * scale), int(img.height * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - W) // 2, (nh - H) // 2
    img = img.crop((left, top, left + W, top + H))

    # darken overall slightly for text readability
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(overlay)
    # bottom gradient
    grad_top = int(H * 0.52)
    for y in range(grad_top, H):
        t = (y - grad_top) / (H - grad_top)
        alpha = int(210 * (t ** 1.3))
        dr.line([(0, y), (W, y)], fill=(8, 10, 20, alpha))
    # top-left subtle gradient
    for y in range(0, int(H * 0.28)):
        t = 1 - y / (H * 0.28)
        alpha = int(110 * t)
        dr.line([(0, y), (W, y)], fill=(8, 10, 20, alpha))

    img = Image.alpha_composite(img.convert("RGBA"), overlay)

    draw = ImageDraw.Draw(img)

    # headline text block
    font_size = 74
    font = load_font(font_size)
    max_w = W - 140
    lines = wrap_text(draw, headline, font, max_w)
    while len(lines) > 3 and font_size > 44:
        font_size -= 6
        font = load_font(font_size)
        lines = wrap_text(draw, headline, font, max_w)

    line_h = int(font_size * 1.14)
    block_h = line_h * len(lines)
    y = H - 96 - block_h

    # accent bar
    bar_h = 6
    try:
        r = int(accent[1:3], 16)
        g = int(accent[3:5], 16)
        b = int(accent[5:7], 16)
    except Exception:
        r, g, b = 139, 92, 246
    draw.rounded_rectangle([70, y - 26, 70 + 92, y - 26 + bar_h], radius=3, fill=(r, g, b, 255))

    # text with shadow
    for line in lines:
        shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow_layer)
        sd.text((76, y + 5), line, font=font, fill=(0, 0, 0, 220))
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(4))
        img = Image.alpha_composite(img, shadow_layer)
        d2 = ImageDraw.Draw(img)
        d2.text((70, y), line, font=font, fill=(255, 255, 255, 255))
        y += line_h

    img.convert("RGB").save(output_path, "JPEG", quality=90)
    print(output_path)


if __name__ == "__main__":
    main()
