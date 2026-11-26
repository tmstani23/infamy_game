"""Cut the zone variant sheet and the second ruin sheet (2026-11-18) into game/art/buildings.

    python tools/add_zone_variants_art.py [--preview out.png]

Sources (transparent, made from art_prompts zone_variants_and_ruins_prompts.md):
  assets/environment/zone_variants1.png, 3 x 2: tenements_b, tenements_c, townhouse_b / townhouse_c, smithy_b, smithy_c
  assets/environment/ruined_buildings2.png, 2 x 2: ruin_storehouse, ruin_barracks / ruin_workshop, ruin_station
The biggest blobs are the pieces, in reading order; loose bits join the nearest one. Anchors (and painted lights, as tools/cut_environment.py finds them) are appended
to game/art/cutouts.json, catalog entries to game/data/art.json (names already there are skipped). Then run
tools/build_art_blockers.py so the new zone houses block like the old ones. Needs Pillow and numpy only.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV, OUT = os.path.join(ROOT, 'assets', 'environment'), os.path.join(ROOT, 'game', 'art')
# sheet -> (cols, rows, [(name, target width px, art.json entry)] in reading order); widths match the art they vary
SHEETS = {
    'zone_variants1.png': (3, 2, [('tenements_b', 449, {'glows': True}), ('tenements_c', 449, {'glows': True}),
                                  ('townhouse_b', 355, {'glows': True, 'blockWall': 0.5}),
                                  ('townhouse_c', 355, {'glows': True, 'blockWall': 0.5}),
                                  ('smithy_b', 400, {}), ('smithy_c', 400, {})]),
    'ruined_buildings2.png': (2, 2, [('ruin_storehouse', 340, {}), ('ruin_barracks', 500, {}),
                                     ('ruin_workshop', 400, {}), ('ruin_station', 480, {})]),
}


def label(mask):
    """Connected 4-neighbour blobs of a small boolean mask: list of pixel index arrays (ys, xs)."""
    seen = np.zeros(mask.shape, bool); out = []
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]: continue
        stack, ys, xs = [(y, x)], [], []
        seen[y, x] = True
        while stack:
            cy, cx = stack.pop(); ys.append(cy); xs.append(cx)
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; stack.append((ny, nx))
        out.append((np.array(ys), np.array(xs)))
    return out


def glows(im):
    """Warm, bright painted lights: [x, y, area], largest first (same test as tools/cut_environment.py)."""
    f = np.asarray(im).astype(np.float32) / 255
    r, g, b, a = f[..., 0], f[..., 1], f[..., 2], f[..., 3]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    hot = (a > 0.8) & (lum > 0.5) & (r - b > 0.22) & (r > 0.7)
    out = [[int(xs.mean()), int(ys.mean()), len(ys)] for ys, xs in label(hot) if len(ys) >= 25]
    return sorted(out, key=lambda v: -v[2])[:8]


def pieces(sheet, count):
    """The count biggest blobs of the sheet in reading order, each with the loose bits nearest to it (rubble,
    a fence that strays over the grid line); tiny specks far from everything are dropped. [(bbox, mask)]"""
    a = np.asarray(sheet)[..., 3] > 30
    h, w = a.shape[0] // 4 * 4, a.shape[1] // 4 * 4
    small = a[:h, :w].reshape(h // 4, 4, w // 4, 4).any(axis=(1, 3))
    blobs = sorted(label(small), key=lambda b: -len(b[0]))
    big, rest = blobs[:count], blobs[count:]
    box = lambda b: (b[0].min(), b[0].max(), b[1].min(), b[1].max())
    def gap(p, q):
        (a0, a1, b0, b1), (c0, c1, d0, d1) = box(p), box(q)
        return max(0, c0 - a1, a0 - c1) + max(0, d0 - b1, b0 - d1)
    masks = [np.zeros(small.shape, bool) for _ in big]
    for i, b in enumerate(big): masks[i][b] = True
    for r in rest:
        d = [gap(r, b) for b in big]; i = int(np.argmin(d))
        if d[i] <= 12 or len(r[0]) >= 40: masks[i][r] = True
    out = []
    for m in masks:
        full = np.zeros(a.shape, bool); full[:h, :w] = np.kron(m, np.ones((4, 4), bool))
        ys, xs = np.nonzero(m)
        out.append(((xs.min() * 4, ys.min() * 4, (xs.max() + 1) * 4, (ys.max() + 1) * 4), full))
    return sorted(out, key=lambda o: (int((o[0][1] + o[0][3]) / 2 // (a.shape[0] / ROWS_OF[count])), o[0][0]))


ROWS_OF = {6: 2, 4: 2}


def cut(sheet, bbox, mask, width):
    arr = np.asarray(sheet).copy(); arr[..., 3] = np.where(mask, arr[..., 3], 0)
    im = Image.fromarray(arr).crop(bbox)
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox())
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def anchor(im):
    a = np.asarray(im)[..., 3] > 128
    ys, xs = np.nonzero(a)
    bottom = ys.max()
    return {'w': im.width, 'h': im.height, 'left': int(xs.min()), 'right': int(xs.max()),
            'bottomX': int(round(xs[ys >= bottom - 2].mean())), 'bottomY': int(bottom), 'glows': glows(im)}


def main(sheets=None):
    """sheets: like SHEETS (default); a name of None skips that piece (tools/add_tier_art.py)"""
    made = []
    for src, (cols, rows, names) in (sheets or SHEETS).items():
        sheet = Image.open(os.path.join(ENV, src)).convert('RGBA')
        for (name, width, entry), (bbox, mask) in zip(names, pieces(sheet, cols * rows)):
            if name: made.append((name, entry, cut(sheet, bbox, mask, width)))
    path = os.path.join(OUT, 'cutouts.json')
    text = open(path).read().rstrip()
    meta = json.loads(text)
    lines = []
    for name, _, p in made:
        p.save(os.path.join(OUT, 'buildings', name + '.png'), optimize=True)
        print(name, p.size)
        if f'buildings/{name}' not in meta:
            lines.append(f' "buildings/{name}": {json.dumps(anchor(p), separators=(",", ":"))}')
    if lines:
        open(path, 'w').write(text[:-1].rstrip() + ',\n' + ',\n'.join(lines) + '\n}\n')
    art = os.path.join(ROOT, 'game', 'data', 'art.json')
    t = open(art, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in t else '\n'
    new = ''.join(f'    "{n}": {json.dumps({"kind": "buildings", **e}, separators=(",", ":"))},{nl}' for n, e, _ in made if f'"{n}": {{"kind"' not in t)
    if new:
        mark = f'    "burned_ruin": {{"kind":"buildings"}},{nl}'
        assert mark in t, 'art.json anchor line missing'
        t = t.replace(mark, mark + new, 1)
    json.loads(t); open(art, 'w', encoding='utf-8', newline='').write(t)
    if '--preview' in sys.argv:
        out = sys.argv[sys.argv.index('--preview') + 1]
        pw, ph, cols = 520, 440, 5
        sheet = Image.new('RGBA', (cols * pw, 2 * ph), (96, 110, 92, 255))
        d = ImageDraw.Draw(sheet)
        for i, (name, _, p) in enumerate(made):
            x, y = (i % cols) * pw + 10, (i // cols) * ph + 24
            sheet.paste(p, (x, y), p); d.text((x, y - 18), f'{name} {p.size}', fill=(255, 255, 255, 255))
        sheet.save(out)


if __name__ == '__main__':
    main()
