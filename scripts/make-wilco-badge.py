import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
S = 512; C = S / 2
src = Image.open('assets/architects/src/wilco_photo.png').convert('RGB')
photo = src.crop((40, 0, 186, 146)).resize((330, 330), Image.LANCZOS)
photo = photo.filter(ImageFilter.UnsharpMask(radius=2, percent=80))
photo = ImageEnhance.Contrast(photo).enhance(1.08)

out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(out)
CREAM, NAVY, STEEL, GOLD, DARK = (233, 222, 196), (24, 36, 50), (79, 127, 160), (198, 160, 72), (14, 20, 28)
d.ellipse((6, 6, S - 6, S - 6), fill=CREAM)              # thin cream rim
d.ellipse((14, 14, S - 14, S - 14), fill=DARK)
d.ellipse((24, 24, S - 24, S - 24), fill=NAVY)           # lettering band
d.ellipse((92, 92, S - 92, S - 92), fill=STEEL)          # inner ring
mask = Image.new('L', (S, S), 0); ImageDraw.Draw(mask).ellipse((100, 100, S - 100, S - 100), fill=255)
ph = Image.new('RGBA', (S, S)); ph.paste(photo, (91, 91))
out.paste(ph, (0, 0), mask)
# side studs, like the Prime Rogue badge
for x in (58, S - 58):
    d.ellipse((x - 9, C - 9, x + 9, C + 9), fill=GOLD, outline=DARK, width=2)

def arc_text(text, radius, size, top=True, spacing=1.0, color=CREAM):
    f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', size)
    widths = [f.getlength(ch) * spacing for ch in text]
    total = sum(widths); ang_total = total / radius
    a = -math.pi / 2 - ang_total / 2 if top else math.pi / 2 + ang_total / 2
    for ch, w in zip(text, widths):
        mid = a + (w / 2 / radius) * (1 if top else -1)
        x, y = C + radius * math.cos(mid), C + radius * math.sin(mid)
        g = Image.new('RGBA', (size * 2, size * 2), (0, 0, 0, 0))
        ImageDraw.Draw(g).text((size, size), ch, font=f, fill=color, anchor='mm')
        rot = -math.degrees(mid) - 90 if top else -math.degrees(mid) + 90
        g = g.rotate(rot, resample=Image.BICUBIC)
        out.alpha_composite(g, (int(x - size), int(y - size)))
        a += (w / radius) * (1 if top else -1)

arc_text('WILCO CORPORATION', 198, 35, top=True, spacing=1.06)
arc_text('· WILL COMPLY ·', 200, 26, top=False, spacing=1.35, color=(214, 240, 138))
out.save('assets/architects/src/wilco_badge.png')
