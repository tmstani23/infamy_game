"""Cut the six frontier buildings (Tim 2026-11-06) out of assets/environment/frontier_buildings1.png.

    python tools/add_frontier_building_art.py

The sheet is transparent, 3 x 2 buildings (top: fort, granary, sawmill; bottom: smithy, infirmary, pier and fish house).
Each is cropped to its painted pixels, scaled to a width, saved to game/art/buildings/<name>.png and its anchor appended
to game/art/cutouts.json (skips names already there). Needs Pillow and numpy only.
"""
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'environment', 'frontier_buildings1.png')
OUT = os.path.join(ROOT, 'game', 'art')
BANDS = [(0, 545), (545, 1024)]   # rows of the sheet
NAMES = [('fort', 520), ('granary', 400), ('sawmill', 440), ('smithy', 400), ('infirmary', 440), ('pier_fish_house', 440)]   # name, width in pixels

def runs(mask):
    out, s = [], None
    for x, v in enumerate(mask):
        if v and s is None: s = x
        if not v and s is not None: out.append((s, x)); s = None
    if s is not None: out.append((s, len(mask)))
    return out

def main():
    sheet = Image.open(SRC).convert('RGBA')
    alpha = np.asarray(sheet)[..., 3] > 30
    pieces = []
    for y0, y1 in BANDS:
        for x0, x1 in runs(alpha[y0:y1].any(axis=0)):
            pieces.append((x0, y0, x1, y1))
    assert len(pieces) == len(NAMES), f'found {len(pieces)} buildings, expected {len(NAMES)}'
    path = os.path.join(OUT, 'cutouts.json')
    text = open(path).read().rstrip()
    meta = json.loads(text)
    lines = []
    for (x0, y0, x1, y1), (name, width) in zip(pieces, NAMES):
        im = sheet.crop((x0, y0, x1, y1))
        im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox())
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        a = np.asarray(im)[..., 3] > 128
        ys, xs = np.nonzero(a)
        bottom = ys.max()
        info = {'w': im.width, 'h': im.height, 'left': int(xs.min()), 'right': int(xs.max()),
                'bottomX': int(round(xs[ys >= bottom - 2].mean())), 'bottomY': int(bottom), 'glows': []}
        lines.append(f' "buildings/{name}": {json.dumps(info, separators=(",", ":"))}')
        im.save(os.path.join(OUT, 'buildings', name + '.png'), optimize=True)
        print(name, im.size)
    lines = [l for l in lines if l.split('"')[1] not in meta]
    if lines:
        open(path, 'w').write(text[:-1].rstrip() + ',\n' + ',\n'.join(lines) + '\n}\n')

if __name__ == '__main__':
    main()
