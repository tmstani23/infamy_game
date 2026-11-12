"""Cut the ruin sheet (Tim 2026-11-12, war checkpoint 6) into game/art/buildings.

    python tools/add_ruins_art.py [--preview out.png]

Source: assets/environment/ruined_buildings1_cut.png, 4 x 2: broken town wall, broken town gate, broken palisade,
broken palisade gate; burned house, burned hall, fallen watchtower, burned tent. The sheet came with a painted
checkerboard; tools/key_checker_sheet.py made the transparent _cut copy from ruined_buildings1.png (needs scipy).
Anchors are appended to game/art/cutouts.json and catalog entries to game/data/art.json (names already there are
skipped), like tools/add_buildings6_art.py. Needs Pillow and numpy only.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from add_frontier_sheet3_art import anchor, cut   # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'art')
COLS, ROWS = 4, 2
# reading order -> name, width in px (1 cell ~300-330, 2 cells ~480)
SHEET = [('ruin_wall', 320), ('ruin_gate', 340), ('ruin_palisade', 300), ('ruin_palisade_gate', 340),
         ('ruin_house', 320), ('ruin_hall', 480), ('ruin_watchtower', 300), ('ruin_tent', 320)]


F = 2   # the pieces sit closer than the shared blob finder (4x, gaps closed) can tell apart


def pieces(alpha):
    """The 8 biggest connected blobs in reading order, each with the loose debris nearest to it: (bbox, mask at 1/F)."""
    h, w = alpha.shape
    small = alpha[:h // F * F, :w // F * F].reshape(h // F, F, w // F, F).any(axis=(1, 3))
    lab = np.zeros(small.shape, int)
    n = 0
    for y, x in zip(*np.nonzero(small)):
        if lab[y, x]: continue
        n += 1
        stack = [(y, x)]; lab[y, x] = n
        while stack:
            cy, cx = stack.pop()
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < lab.shape[0] and 0 <= nx < lab.shape[1] and small[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n; stack.append((ny, nx))
    size = np.bincount(lab.ravel(), minlength=n + 1); size[0] = 0
    big = sorted(np.argsort(size)[-COLS * ROWS:])
    assert len(big) == COLS * ROWS and size[big].min() > 2000, f'pieces found: {sorted(size[big])}'
    ys, xs = np.nonzero(lab)
    ids = lab[ys, xs]
    cy = np.bincount(ids, ys, n + 1) / np.maximum(1, size); cx = np.bincount(ids, xs, n + 1) / np.maximum(1, size)
    owner = np.zeros(n + 1, int)
    for i in range(1, n + 1):
        owner[i] = i if i in big else min(big, key=lambda b: (cy[b] - cy[i]) ** 2 + (cx[b] - cx[i]) ** 2)
    own = owner[lab]
    out = []
    for b in big:
        m = own == b
        yy, xx = np.nonzero(m)
        out.append(((xx.min() * F, yy.min() * F, (xx.max() + 1) * F, (yy.max() + 1) * F), m))
    out.sort(key=lambda o: (int((o[0][1] + o[0][3]) / 2 // (h / ROWS)), o[0][0]))
    return out


def main():
    im = Image.open(os.path.join(ROOT, 'assets', 'environment', 'ruined_buildings1_cut.png')).convert('RGBA')
    im = im.crop((0, 0, im.width // F * F, im.height // F * F))
    made = [(name, cut(im, bbox, mask, F, width=width, factor=1)) for (name, width), (bbox, mask) in zip(SHEET, pieces(np.asarray(im)[..., 3] > 128))]
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
