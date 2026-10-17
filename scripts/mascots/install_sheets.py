"""Install built mascot atlases into the app and rewrite the manifest.

Takes the WebP atlases page-mascot's build writes (<id>-<sheet>.webp, where sheet is
`directions` or an expressions sheet such as `reactions` or `game`) and copies them to
static/mascots/<id>/<outfit>/<sheet>.webp, then lists everything installed in
static/mascots/manifest.json for the client.

Image models draw each friend at a slightly different size, so every character is scaled
to the same head width and stood on the same line (measured on the straight-ahead cell of
its directions sheet). One factor per character, applied to every cell of every sheet,
keeps the head turns and expressions aligned with each other. Needs Pillow and NumPy.

    python3 scripts/mascots/install_sheets.py <build-dir> [--outfit signature]
"""
import argparse
import json
import os
import re
import numpy as np
from PIL import Image

# Fractions of a cell, taken from the friend whose size reads best at the table.
HEAD_WIDTH = 0.453
FOOT_LINE = 0.739

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'static', 'mascots')

parser = argparse.ArgumentParser()
parser.add_argument('build_dir')
parser.add_argument('--outfit', default='signature')
args = parser.parse_args()

def measure(directions):
    """Head width and lowest row of the straight-ahead cell, as fractions of a cell."""
    image = Image.open(directions).convert('RGBA')
    cell = image.width // 3
    alpha = np.asarray(image)[cell:2 * cell, cell:2 * cell, 3] > 40
    ys, xs = np.nonzero(alpha)
    top, bottom = ys.min(), ys.max()
    head = max(np.ptp(xs[ys == y]) for y in range(top, top + int((bottom - top) * 0.55)) if (ys == y).any())
    return head / cell, bottom / cell


def normalize(src, dst, scale, bottom):
    """Scale every cell about its bottom centre and stand it on FOOT_LINE."""
    sheet = Image.open(src).convert('RGBA')
    cell = sheet.width // 3
    out = Image.new('RGBA', sheet.size, (0, 0, 0, 0))
    size = round(cell * scale)
    for index in range(9):
        x, y = (index % 3) * cell, (index // 3) * cell
        frame = sheet.crop((x, y, x + cell, y + cell)).resize((size, size), Image.LANCZOS)
        left = x + (cell - size) // 2
        top = y + round(FOOT_LINE * cell - bottom * size)
        piece = frame.crop((max(0, x - left), max(0, y - top), min(size, x + cell - left), min(size, y + cell - top)))
        out.alpha_composite(piece, (max(left, x), max(top, y)))
    out.save(dst, 'WEBP', quality=88, alpha_quality=95, method=6)


atlases = {}
for name in sorted(os.listdir(args.build_dir)):
    match = re.fullmatch(r'([a-z]+)-([a-z]+)\.webp', name)
    if match:
        atlases.setdefault(match.group(1), {})[match.group(2)] = os.path.join(args.build_dir, name)
for friend, sheets in atlases.items():
    if 'directions' not in sheets:
        continue
    head, bottom = measure(sheets['directions'])
    scale = HEAD_WIDTH / head
    dest = os.path.join(OUT, friend, args.outfit)
    os.makedirs(dest, exist_ok=True)
    for sheet, path in sheets.items():
        normalize(path, os.path.join(dest, f'{sheet}.webp'), scale, bottom)
    print(f'{friend}: scaled {scale:.2f}')

manifest = {}
for friend in sorted(os.listdir(OUT)):
    if not os.path.isdir(os.path.join(OUT, friend)):
        continue
    for outfit in sorted(os.listdir(os.path.join(OUT, friend))):
        sheets = sorted(f[:-5] for f in os.listdir(os.path.join(OUT, friend, outfit)) if f.endswith('.webp'))
        if 'directions' in sheets:
            manifest.setdefault(friend, {})[outfit] = sheets
with open(os.path.join(OUT, 'manifest.json'), 'w') as file:
    json.dump(manifest, file, separators=(',', ':'))
print(json.dumps(manifest))
