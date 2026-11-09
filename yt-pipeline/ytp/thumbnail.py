import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def make_thumbnail(base: Path, title: str, out: Path):
    im = Image.open(base).convert("RGB").resize((1280, 720))
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 88)
    except OSError:
        font = ImageFont.load_default()
    text = "\n".join(textwrap.wrap(title.upper(), 18)[:3])
    for dx in range(-4, 5, 2):
        for dy in range(-4, 5, 2):
            d.multiline_text((50 + dx, 380 + dy), text, font=font, fill="black", spacing=8)
    d.multiline_text((50, 380), text, font=font, fill="#FFD400", spacing=8)
    im.save(out, "JPEG", quality=90)
