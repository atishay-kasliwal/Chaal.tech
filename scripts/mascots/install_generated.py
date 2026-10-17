"""Pack generated 3x3 expression sheets at the approved head width and shoulder baseline.

Keeps approved directions/reactions unchanged. Archives source PNGs in design/mascots/generated
and writes deployable WebPs to static/mascots. Requires Pillow and NumPy.
"""
import argparse
import json
import shutil
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCES = Path(__file__).with_name('generated-sources.json')
CELL = 360
HEAD = 0.453 * CELL
BASELINE = round(0.739 * CELL)


def width_and_baseline(frame):
    alpha = np.asarray(frame)[:, :, 3] > 40
    ys, xs = np.nonzero(alpha)
    if not len(ys):
        raise ValueError('Empty sprite cell')
    top, bottom = int(ys.min()), int(ys.max())
    widths = []
    for row in alpha[top:top + round((bottom - top) * 0.55)]:
        edges = np.diff(np.r_[False, row, False].astype(int))
        starts, ends = np.where(edges == 1)[0], np.where(edges == -1)[0]
        if len(starts):
            widths.append(int(max(ends - starts)))
    return max(widths), bottom


def install(entry):
    src = ROOT / entry['path']
    archived = ROOT / 'design/mascots/generated' / entry['id'] / (entry['sheet'] + '.png')
    archived.parent.mkdir(parents=True, exist_ok=True)
    if src.resolve() != archived.resolve():
        shutil.copy2(src, archived)
    image = Image.open(src).convert('RGBA')
    if image.width != image.height:
        raise ValueError(f'Expected square atlas: {src}')
    if image.getchannel('A').getextrema() != (0, 255):
        raise ValueError(f'Expected transparent background: {src}')
    bounds = [round(i * image.width / 3) for i in range(4)]
    frames = [image.crop((bounds[i % 3], bounds[i // 3], bounds[i % 3 + 1], bounds[i // 3 + 1])) for i in range(9)]
    measured = [width_and_baseline(frame) for frame in frames]
    scale = HEAD / float(np.median([m[0] for m in measured]))
    baseline = float(np.median([m[1] for m in measured]))
    out = Image.new('RGBA', (CELL * 3, CELL * 3))
    for i, frame in enumerate(frames):
        resized = frame.resize((round(frame.width * scale), round(frame.height * scale)), Image.Resampling.LANCZOS)
        cell = Image.new('RGBA', (CELL, CELL))
        cell.alpha_composite(resized, (round((CELL - frame.width * scale) / 2), round(BASELINE - baseline * scale)))
        # Keep every expression on the approved shoulder line; discard generation debris below it.
        cell.paste((0, 0, 0, 0), (0, BASELINE + 3, CELL, CELL))
        out.alpha_composite(cell, ((i % 3) * CELL, (i // 3) * CELL))
    dest = ROOT / 'static/mascots' / entry['id'] / 'signature' / (entry['sheet'] + '.webp')
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, 'WEBP', quality=88, alpha_quality=95, method=6)
    print(f"{entry['id']}/{entry['sheet']}: installed, scale {scale:.3f}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sources', type=Path, default=SOURCES)
    args = parser.parse_args()
    for entry in json.loads(args.sources.read_text())['assets']:
        install(entry)
    manifest = {}
    for directions in sorted((ROOT / 'static/mascots').glob('*/*/directions.webp')):
        folder = directions.parent
        manifest.setdefault(folder.parent.name, {})[folder.name] = sorted(p.stem for p in folder.glob('*.webp'))
    (ROOT / 'static/mascots/manifest.json').write_text(json.dumps(manifest, separators=(',', ':')) + '\n')
