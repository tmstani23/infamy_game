"""Cut building sheet 6 (Tim 2026-11-10) into game/art.

    python tools/add_buildings6_art.py [--preview out.png]

Source (transparent): assets/environment/buildings6.png, 3 x 2: railway gate in the city wall, lieutenant's gate
post, cannon battery; siege workshop, burned ruin, trackside water tower (prompt in the project files,
art_prompts/frontier_buildings_sheet4_prompt.md).
The railway gate is a joining piece for the city wall drawn on the island (render/world_ground.js): it is sheared
from its painted ground slope to the wall's and saved, at sheet size, as game/art/props/rail_gate.png (art.json
gives it a scale and an anchor, like city_gate_se). The other five go to game/art/buildings like
tools/add_frontier_sheet3_art.py does. Anchors are appended to game/art/cutouts.json and catalog entries to
game/data/art.json (names already there are skipped). Needs Pillow and numpy only.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from add_frontier_sheet3_art import anchor, blobs, cut, shear_to, GRID_DEG   # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'art')
# reading order -> name, width in px (1 cell ~300-330, 2 cells ~480); the gate keeps its sheet size
SHEET = [('rail_gate', None), ('lieutenant_post', 300), ('cannon_battery', 480),
         ('siege_workshop', 480), ('burned_ruin', 480), ('water_tower', 320)]
PROPS = ('rail_gate', 'lieutenant_post')   # saved in game/art/props, with a scale in art.json
GATE_SLOPE = -15.0   # the painted wall's ground line, degrees (+ = falls to the right): it rises to the right
GATE_SCALE = 0.7    # art.json scale: big enough for a train (Tim 2026-11-10); its wall stubs stand a little taller than props/stone_wall at 0.55


def main():
    im = Image.open(os.path.join(ROOT, 'assets', 'environment', 'buildings6.png')).convert('RGBA')
    found, f = blobs(np.asarray(im)[..., 3] > 128)
    cw, ch = im.width / 3, im.height / 2
    cell = lambda b: int(((b[0][1] + b[0][3]) / 2) // ch) * 3 + int(((b[0][0] + b[0][2]) / 2) // cw)
    by = {}
    for b in found: by.setdefault(cell(b), []).append(b)
    assert sorted(by) == list(range(6)), f'pieces found in cells {sorted(by)}'
    made = []
    for k, (name, width) in enumerate(SHEET):
        bbox, mask = max(by[k], key=lambda b: b[1].sum())
        p = cut(im, bbox, mask, f, width=width, factor=1)
        if name == 'rail_gate': p = shear_to(p, GATE_SLOPE, -GRID_DEG)
        made.append((name, p))
    path = os.path.join(OUT, 'cutouts.json')
    text = open(path).read().rstrip()
    meta = json.loads(text)
    lines = []
    for name, p in made:
        kind = 'props' if name in PROPS else 'buildings'
        p.save(os.path.join(OUT, kind, name + '.png'), optimize=True)
        print(name, p.size)
        if f'{kind}/{name}' not in meta:
            lines.append(f' "{kind}/{name}": {json.dumps(anchor(p), separators=(",", ":"))}')
    if lines:
        open(path, 'w').write(text[:-1].rstrip() + ',\n' + ',\n'.join(lines) + '\n}\n')
    art = os.path.join(ROOT, 'game', 'data', 'art.json')
    t = open(art, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in t else '\n'
    new = ''.join(f'    "{n}": {{"kind":"buildings"}},{nl}' for n, _ in made if n not in PROPS and f'"{n}": {{"kind"' not in t)
    if new:
        mark = f'    "sawmill": {{"kind":"buildings"}},{nl}'
        assert mark in t, 'art.json anchor line missing'
        t = t.replace(mark, mark + new, 1)
    if '"rail_gate"' not in t:
        mark = '    "city_gate_se": {'
        assert mark in t, 'art.json city_gate_se line missing'
        # anchored on the ground in the middle of the opening (set by eye on the sheared cutout)
        if '"lieutenant_post"' not in t: t = t.replace(mark, f'    "lieutenant_post": {{"kind":"props","scale":0.6,"foot":[2.6,2],"solid":0.8}},{nl}' + mark, 1)
        t = t.replace(mark, f'    "rail_gate": {{"kind":"props","scale":{GATE_SCALE},"foot":[3,6],"solid":0,"artAnchor":[340,395],"_note":"Tim 2026-11-10, art-only: the railway opening in the city wall seen from the island (tools/add_buildings6_art.py)"}},{nl}' + mark, 1)
    json.loads(t); open(art, 'w', encoding='utf-8', newline='').write(t)
    if '--preview' in sys.argv:
        out = sys.argv[sys.argv.index('--preview') + 1]
        cols = 3; pw, ph = 700, 620
        sheet = Image.new('RGBA', (cols * pw, 2 * ph), (96, 110, 92, 255))
        d = ImageDraw.Draw(sheet)
        for i, (name, p) in enumerate(made):
            x, y = (i % cols) * pw + 10, (i // cols) * ph + 24
            sheet.paste(p, (x, y), p); d.text((x, y - 18), f'{name} {p.size}', fill=(255, 255, 255, 255))
        sheet.save(out)


if __name__ == '__main__':
    main()
