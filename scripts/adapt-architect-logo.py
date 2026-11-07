# Usage: python3 scripts/adapt-architect-logo.py <logo.png> assets/architects/<id>.png assets/architects/<id>_card.png
# Roof version: desaturated, smog-tinted, flattened palette, grime + chipped outer ring. Card version: the real logo.
import sys, random
from PIL import Image, ImageEnhance, ImageFilter, ImageDraw, ImageChops
src, out_roof, out_card = sys.argv[1:4]
im = Image.open(src).convert('RGBA')
# card: the real logo, just sized
im.resize((256, 256), Image.LANCZOS).save(out_card, optimize=True)

# roof: weathered paint job, matched to the emblem sheets (flat, limited palette, grime)
S = 256
base = im.resize((S, S), Image.LANCZOS)
rgb = base.convert('RGB'); a = base.getchannel('A')
rgb = ImageEnhance.Color(rgb).enhance(0.82)          # desaturate toward the smog palette
rgb = ImageEnhance.Contrast(rgb).enhance(1.12)
warm = Image.new('RGB', (S, S), (120, 82, 40))
rgb = Image.blend(rgb, warm, 0.07)                    # sodium-lamp / rust tint
rgb = rgb.quantize(colors=20, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
rgb = rgb.filter(ImageFilter.SMOOTH_MORE)
# grime: soft dark blotches multiplied in
random.seed(13)
grime = Image.new('L', (S, S), 255); g = ImageDraw.Draw(grime)
for _ in range(90):
    x, y, r = random.randint(0, S), random.randint(0, S), random.randint(4, 26)
    g.ellipse((x - r, y - r, x + r, y + r), fill=random.randint(175, 235))
grime = grime.filter(ImageFilter.GaussianBlur(7))
rgb = ImageChops.multiply(rgb, Image.merge('RGB', (grime, grime, grime)))
# wear: paint chipped off in specks + a few scratches (alpha holes, rust shows through on the roof)
wear = Image.new('L', (S, S), 255); w = ImageDraw.Draw(wear)
import math
n = 0
while n < 90:  # chips mostly on the outer ring, where boots and cargo scrape; the face stays clean
    ang, rad = random.uniform(0, 6.283), random.uniform(0.62, 0.98) * S / 2
    x, y = S / 2 + math.cos(ang) * rad, S / 2 + math.sin(ang) * rad; r = random.choice([1, 1, 2, 2, 3])
    w.ellipse((x - r, y - r, x + r, y + r), fill=random.randint(40, 170)); n += 1
for _ in range(4):
    ang = random.uniform(0, 6.283); rad = random.uniform(0.7, 0.92) * S / 2
    x, y = S / 2 + math.cos(ang) * rad, S / 2 + math.sin(ang) * rad
    w.line((x, y, x + random.randint(-30, 30), y + random.randint(-8, 8)), fill=150, width=1)
a = ImageChops.multiply(a, wear)
out = Image.merge('RGBA', (*rgb.split(), a))
out.save(out_roof, optimize=True)
