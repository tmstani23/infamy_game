"""Cut war building sheet 2 (Tim 2026-11-12) into game/art/buildings.

    python tools/add_warcamp2_art.py [--preview out.png]

Source (transparent): assets/environment/warcampbuildings2.png, 3 x 2: town wall section, wall corner post, town
gate; town watchtower, armory, field clinic tent. The wall and the gate are joining pieces painted along the
z direction (rising to the right); the game mirrors them for walls along x. Anchors are appended to
game/art/cutouts.json and catalog entries to game/data/art.json (names already there are skipped), like
tools/add_ruins_art.py. Run tools/build_art_blockers.py afterwards for the armory and clinic. Needs Pillow and numpy.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from add_frontier_sheet3_art import anchor, cut   # noqa: E402
import add_ruins_art as ruins   # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'art')
COLS, ROWS = 3, 2
SHEET = [('town_wall', 330), ('town_wall_post', 150), ('town_gate', 400),
         ('town_watchtower', 300), ('war_armory', 400), ('field_clinic', 400)]


def main():
    im = Image.open(os.path.join(ROOT, 'assets', 'environment', 'warcampbuildings2.png')).convert('RGBA')
    F = ruins.F
    im = im.crop((0, 0, im.width // F * F, im.height // F * F))
    ruins.COLS, ruins.ROWS = COLS, ROWS
    made = [(name, cut(im, bbox, mask, F, width=width, factor=1)) for (name, width), (bbox, mask) in zip(SHEET, ruins.pieces(np.asarray(im)[..., 3] > 128))]
    path = os.path.join(OUT, 'cutouts.json')
    text = open(path).read().rstrip()
    meta = json.loads(text)
    lines = []
    for name, p in made:
        p.save(os.path.join(OUT, 'buildings', name + '.png'), optimize=True)
        print(name, p.size)
        if f'buildings/{name}' not in meta:
            lines.append(f' "buildings/{name}": {json.dumps(anchor(p), separators=(",", ":"))}')
    if lines:
        open(path, 'w').write(text[:-1].rstrip() + ',\n' + ',\n'.join(lines) + '\n}\n')
    art = os.path.join(ROOT, 'game', 'data', 'art.json')
    t = open(art, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in t else '\n'
    new = ''.join(f'    "{n}": {{"kind":"buildings"}},{nl}' for n, _ in made if f'"{n}": {{"kind"' not in t)
    if new:
        mark = f'    "burned_ruin": {{"kind":"buildings"}},{nl}'
        assert mark in t, 'art.json anchor line missing'
        t = t.replace(mark, mark + new, 1)
    json.loads(t); open(art, 'w', encoding='utf-8', newline='').write(t)
    if '--preview' in sys.argv:
        out = sys.argv[sys.argv.index('--preview') + 1]
        pw, ph = 520, 480
        sheet = Image.new('RGBA', (COLS * pw, ROWS * ph), (96, 110, 92, 255))
        d = ImageDraw.Draw(sheet)
        for i, (name, p) in enumerate(made):
            x, y = (i % COLS) * pw + 10, (i // COLS) * ph + 24
            sheet.paste(p, (x, y), p); d.text((x, y - 18), f'{name} {p.size}', fill=(255, 255, 255, 255))
        sheet.save(out)


if __name__ == '__main__':
    main()
