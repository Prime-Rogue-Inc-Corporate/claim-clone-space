#!/usr/bin/env python3
"""Slice the generated sprite sheets in assets/src/ into assets/sprites/*.png + assets/sprites.json.

Sheets have transparent backgrounds. Sprites are found as connected components of opaque
pixels (after a small dilation so sparkles/smoke stay with their sprite), ordered row by row,
then named from the layout we asked the image model for.

Run:  python3 scripts/slice-assets.py
"""
import json
import os
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'assets/src'
OUT = 'assets/sprites'
os.makedirs(OUT, exist_ok=True)
manifest = {}


def components(a, dil, y0=0, y1=None, minarea=2500):
    m = a[..., 3] > 100
    m = m.copy()
    m[:y0] = False
    if y1 is not None:
        m[y1:] = False
    lab, _ = ndimage.label(ndimage.binary_dilation(m, iterations=dil))
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if sl is None:
            continue
        area = (m[sl] & (lab[sl] == i + 1)).sum()
        if area >= minarea:
            boxes.append((sl[0].start, sl[0].stop, sl[1].start, sl[1].stop, i + 1))
    boxes.sort(key=lambda b: ((b[0] + b[1]) // 2 // 150, b[2]))
    return boxes, lab, m


def save(name, a, box, lab, maxdim, inset=0.0, flame=False):
    y0, y1, x0, x1, li = box
    crop = a[y0:y1, x0:x1].copy()
    # keep only this component's pixels (neighbours' bits can poke into the box)
    keep = ndimage.binary_dilation(lab[y0:y1, x0:x1] == li, iterations=2)
    crop[..., 3] = np.where(keep, crop[..., 3], 0)
    if inset:
        h, w = crop.shape[:2]
        dy, dx = int(h * inset), int(w * inset)
        crop = crop[dy:h - dy, dx:w - dx]
    im = Image.fromarray(crop)
    scale = maxdim / max(im.size)
    size = (max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale)))
    im = im.resize(size, Image.LANCZOS)
    im.save(f'{OUT}/{name}.png', optimize=True)
    entry = {'w': size[0], 'h': size[1]}
    if flame:
        # Ships face right with a thruster flame baked in on the left.
        # Record where the flame ends so the game can hide it when not thrusting.
        r, g, b, al = [crop[..., i].astype(int) for i in range(4)]
        fl = (al > 100) & (r > 200) & (g > 70) & (b < 110) & (r - b > 120)
        flab, _ = ndimage.label(ndimage.binary_dilation(fl, iterations=1))
        maxx = -1
        for j, sl in enumerate(ndimage.find_objects(flab)):
            # flames are the orange blobs touching the left edge region (hazard stripes are mid-hull)
            if sl is not None and sl[1].start < crop.shape[1] * 0.12:
                maxx = max(maxx, sl[1].stop)
        if maxx > 0:
            entry['cut'] = round((maxx + 1) * scale)
    manifest[name] = entry


def sheet(fname):
    return np.array(Image.open(f'{SRC}/{fname}').convert('RGBA'))


# ---- ships: 4 skiffs, 4 haulers, interceptor, drone, eva, (flame strip unused)
a = sheet('sheet-ships.png')
boxes, lab, _ = components(a, 12)
names = ['skiff_slate', 'skiff_tan', 'skiff_red', 'skiff_olive',
         'hauler_slate', 'hauler_tan', 'hauler_red', 'hauler_olive',
         'interceptor', 'drone', 'eva']
for n, b in zip(names, boxes):
    save(n, a, b, lab, 128 if n != 'eva' else 64, flame=n != 'eva')

# ---- structures: 4 spine tiles, 6 roofs, 2 wall strips, empty lot
a = sheet('sheet-structures.png')
boxes, lab, _ = components(a, 8)
names = ['spine_plain', 'spine_hazard', 'spine_beacon', 'spine_cross',
         'roof_slate', 'roof_tan', 'roof_red', 'roof_olive', 'roof_rust', 'roof_steel',
         'wall_a', 'wall_b', 'lot_empty']
for n, b in zip(names, boxes):
    save(n, a, b, lab, 256 if n.startswith(('roof', 'lot', 'wall')) else 128)

# ---- sprawl: huts (3 tiers x 2), barrels x3, junk, dish, laundry, planter, fence, 4 ground tiles
a = sheet('sheet-sprawl.png')
boxes, lab, _ = components(a, 10)
names = ['hut0_a', 'hut0_b', 'hut1_a', 'hut1_b', 'hut2_a', 'hut2_b',
         'barrel_0', 'barrel_1', 'barrel_2', 'junk', 'dish', 'laundry',
         'planter', 'fence', 'ground_slag', 'ground_mud', 'ground_path', 'ground_plate']
for n, b in zip(names, boxes):
    if n.startswith('ground'):
        save(n, a, b, lab, 128, inset=0.08)
    else:
        save(n, a, b, lab, 128 if n.startswith('hut') else 96)

# ---- drops / props / UI icons (middle row needs a tighter dilation: neighbours sit close)
a = sheet('sheet-drops-props-ui.png')
top, lab_t, _ = components(a, 10, 0, 380)
mid, lab_m, _ = components(a, 3, 380, 700)
bot, lab_b, _ = components(a, 10, 700, None, minarea=1500)
for n, b in zip(['drop_turd', 'drop_whale', 'drop_drone', 'drop_cargo', 'drop_slag'], top):
    save(n, a, b, lab_t, 96)
for n, b in zip(['rock_1', 'rock_2', 'rock_3', 'rock_4', 'buoy_on', 'buoy_off', 'ring', 'pad'], mid):
    save(n, a, b, lab_m, 96)
for n, b in zip(['icon_cash', 'icon_credits', 'icon_scrap', 'icon_xp', 'icon_heat', 'icon_lock', 'icon_eye', 'icon_crate'], bot):
    save(n, a, b, lab_b, 32)

# ---- organization emblems: 6 one-row sheets (transparent). 13 org logos, 13 achievement-category
# icons, 5 spares. Order = left to right on each sheet.
EMBLEMS = [
    ['shame_cage', 'ach_scrounge', 'logo_lastmile', 'logo_cinder', 'extra_cannon'],
    ['ach_freight', 'logo_registry', 'ach_explore', 'logo_mercy', 'logo_vanta'],
    ['ach_flight', 'ach_civic', 'extra_flask', 'logo_bureau', 'logo_gavel'],
    ['extra_refinery', 'extra_drop', 'ach_jumping', 'ach_housing', 'extra_cryo', 'logo_ministry'],
    ['logo_gullet', 'ach_racing', 'ach_residency', 'ach_refit', 'ach_property'],
    ['logo_assessor', 'logo_kessler', 'logo_ashiron', 'logo_null', 'ach_heat'],
]
for i, names in enumerate(EMBLEMS, 1):
    a = sheet(f'sheet-emblems-{i}.png')
    boxes, lab, _ = components(a, 8, minarea=3000)
    boxes.sort(key=lambda b: b[2])
    assert len(boxes) == len(names), (i, len(boxes))
    for n, b in zip(names, boxes):
        save('ach_shame' if n == 'shame_cage' else n, a, b, lab, 128)

# ---- housing: Tenure Heights (2 variants x 4 tiers), Sprawl owner homes (4 tiers), 8 deck props.
# This sheet came back on a light background with grid lines: flood-fill the background out first.
a = sheet('sheet-housing.png').astype(int)
H, W = a.shape[:2]
transparent = (a[..., 3] < 20).mean() > 0.3  # re-generated sheet has a real transparent background
rgb = a[..., :3]
bgish = (rgb.min(-1) > 120) & ((rgb.max(-1) - rgb.min(-1)) < 16)  # background + soft drop shadow
blab, _ = ndimage.label(bgish)
edge = set(np.unique(np.concatenate([blab[0], blab[-1], blab[:, 0], blab[:, -1]])))
for k in range(1, 4):
    edge |= set(np.unique(blab[int(H * k / 4) - 2:int(H * k / 4) + 3].ravel()))
    edge |= set(np.unique(blab[:, int(W * k / 4) - 2:int(W * k / 4) + 3].ravel()))
edge.discard(0)
if not transparent:
    a[..., 3] = np.where(np.isin(blab, list(edge)), 0, 255)
a = a.astype(np.uint8)
boxes, lab, _ = components(a, 4, minarea=1500)
boxes.sort(key=lambda b: (int((b[0] + b[1]) / 2 // (H / 4)), b[2]))
names = [f'tenure_a{t}' for t in range(1, 5)] + [f'tenure_b{t}' for t in range(1, 5)] + [f'ownerhome{t}' for t in range(1, 5)] + \
        ['deck_tile', 'deck_grate', 'deck_garden', 'deck_scrubber', 'deck_wall', 'deck_gate', 'deck_camera', 'deck_statue']
assert len(boxes) == len(names), len(boxes)
for n, b in zip(names, boxes):
    save(n, a, b, lab, 256 if n.startswith(('tenure', 'ownerhome')) else 128)

with open('assets/sprites.json', 'w') as f:
    json.dump(manifest, f, indent=1, sort_keys=True)
print(f'{len(manifest)} sprites ->', OUT)
print('mid row count', len(mid), 'top', len(top), 'bot', len(bot))
