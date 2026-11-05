"""Add the housing build-phase and abandoned art (Tim 2026-11-05) to game/art without rerunning the whole cutter.

    python tools/add_housing_stage_art.py

Reads the transparent PNGs in assets/environment/, crops each to its painted pixels, scales it to a width
like the other building cutouts, saves game/art/buildings/<name>.png and adds its anchor to game/art/cutouts.json.
Needs Pillow and numpy only (the full tools/cut_environment.py also needs scipy).
"""
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV, OUT = os.path.join(ROOT, 'assets', 'environment'), os.path.join(ROOT, 'game', 'art')
# name -> (source, target width in pixels)
PIECES = {
    'house_construction_1': ('house_building_step1.png', 400),
    'house_construction_2': ('house_building_step2.png', 400),
    'abandoned_housing': ('abandoned_house1_cut.png', 400),   # white background already cut out
    'abandoned_workshop': ('abandoned_workshop1_cut.png', 440),
}

def main():
    path = os.path.join(OUT, 'cutouts.json')
    text = open(path).read().rstrip()
    meta = json.loads(text)
    lines = []
    for name, (src, width) in PIECES.items():
        im = Image.open(os.path.join(ENV, src)).convert('RGBA')
        box = im.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox()
        im = im.crop(box)
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        a = np.asarray(im)[..., 3] > 128
        ys, xs = np.nonzero(a)
        bottom = ys.max()
        info = {'w': im.width, 'h': im.height, 'left': int(xs.min()), 'right': int(xs.max()),
                                     'bottomX': int(round(xs[ys >= bottom - 2].mean())), 'bottomY': int(bottom), 'glows': []}
        lines.append(f' "buildings/{name}": {json.dumps(info, separators=(",", ":"))}')
        im.save(os.path.join(OUT, 'buildings', name + '.png'), optimize=True)
        print(name, im.size)
    # append the new entries as text so the hand-formatted file keeps its layout (skips names already there)
    lines = [l for l in lines if l.split('"')[1] not in meta]
    if lines:
        open(path, 'w').write(text[:-1].rstrip() + ',\n' + ',\n'.join(lines) + '\n}\n')

if __name__ == '__main__':
    main()
