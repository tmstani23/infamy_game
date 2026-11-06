"""Cut the second frontier building sheet and the gates/walls sheet (Tim 2026-11-06) into game/art/buildings.

    python tools/add_frontier_sheet2_art.py [--preview out.png]

Sources (both already transparent): assets/environment/frontierbuildings2.png (3 x 2: stable, coach house,
watchtower; palisade, gatehouse, mine) and assets/environment/gates_walls_frontier.png (gate views in the top two
rows, palisade wall views in the bottom two; 4 x 2 each).
Pieces are found as connected alpha blobs (stray specks dropped), cropped, scaled and saved like
tools/add_frontier_building_art.py does, and their anchors appended to game/art/cutouts.json (names already there are skipped).
Pieces Tim called inaccurate or crooked are listed in DROP and not cut.
The angled views did not share one angle, so (Tim 2026-11-06, option B) the diagonal pieces are made from one master
each and its mirror, at the game's ground-grid angle on screen (GRID_DEG, 24.1 deg: ELEVATION atan(0.5), camera yaw 45).
A wall along world x falls to the right on screen, one along world z rises to the right. Straight-on views (v1, v5)
stand for walls along the world diagonal. A vertical shear sets a piece's ground slope and keeps its stakes upright.
Needs Pillow and numpy only.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = os.path.join(ROOT, 'assets', 'environment')
OUT = os.path.join(ROOT, 'game', 'art')

# sheet 2: reading order (rows top to bottom, left to right) -> name, width in px
SHEET2 = [('stable', 480), ('coach_house', 500), ('frontier_watchtower', 260),
          ('palisade', 400), ('gatehouse', 440), ('mine', 480)]
# gates/walls: 8 gate views then 8 wall views, reading order; all scaled by one factor so they stay in proportion
GATE_SCALE = 1.2
GATES = [f'gate_v{i}' for i in range(1, 9)]
WALLS = [f'palisade_wall_v{i}' for i in range(1, 9)]
DROP = {'gate_v3': 'skewed, perspective collapsed', 'gate_v7': 'skewed, narrow and leaning',
        'palisade_wall_v7': 'bent, curves out of line'}


GRID_DEG = 24.1
# angled views replaced by the mirrored masters below (cut but not saved)
REPLACED = ['gate_v2', 'gate_v4', 'gate_v6', 'gate_v8', 'palisade_wall_v2', 'palisade_wall_v3', 'palisade_wall_v4',
            'palisade_wall_v6', 'palisade_wall_v8']
# name -> (master piece, its measured ground slope in degrees, + = falls to the right, mirror?)
DERIVED = {'palisade_wall_z': ('palisade_wall_v4', -25.1, False), 'palisade_wall_x': ('palisade_wall_v4', -25.1, True),
           'gate_x': ('gate_v2', 12.1, False), 'gate_z': ('gate_v2', 12.1, True)}


def shear_to(im, from_deg, to_deg):
    """Vertical shear: moves each column up or down so the ground line goes from from_deg to to_deg."""
    import math
    k = math.tan(math.radians(to_deg)) - math.tan(math.radians(from_deg))
    w, h = im.size
    off = 0 if k > 0 else -k * w
    out = im.transform((w, h + int(abs(k) * w) + 2), Image.AFFINE, (1, 0, 0, -k, 1, -off), resample=Image.BICUBIC)
    return out.crop(out.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox())


def blobs(alpha, min_area=4000):
    """Connected blobs of a boolean mask (4x downscale, merging gaps), as (bbox, full-res mask)."""
    f = 4
    h, w = alpha.shape
    small = alpha[:h // f * f, :w // f * f].reshape(h // f, f, w // f, f).any(axis=(1, 3))
    # close small gaps (1 cell) so thin roof beams stay attached
    k = 1
    pad = np.pad(small, k)
    grown = np.zeros_like(pad)
    for dy in range(-k, k + 1):
        for dx in range(-k, k + 1):
            grown |= np.roll(np.roll(pad, dy, 0), dx, 1)
    grown = grown[k:-k, k:-k]
    lab = np.zeros(grown.shape, int)
    n = 0
    for y, x in zip(*np.nonzero(grown)):
        if lab[y, x]: continue
        n += 1
        stack = [(y, x)]; lab[y, x] = n
        while stack:
            cy, cx = stack.pop()
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < lab.shape[0] and 0 <= nx < lab.shape[1] and grown[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n; stack.append((ny, nx))
    out = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(ys) * f * f < min_area: continue
        out.append(((xs.min() * f, ys.min() * f, (xs.max() + 1) * f, (ys.max() + 1) * f), lab == i))
    return out, f


def pieces(path, count, grid=None):
    """Find the pieces of a sheet. With grid=(xsplits, ysplits) each cell holds one piece (the largest blob in it),
    for sheets whose neighbours touch."""
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im)[..., 3] > 128
    if grid is None:
        found, f = blobs(a)
    else:
        xs, ys = [0] + grid[0] + [im.width], [0] + grid[1] + [im.height]
        found, f = [], 4
        for y0, y1 in zip(ys, ys[1:]):
            for x0, x1 in zip(xs, xs[1:]):
                cell = np.zeros_like(a); cell[y0:y1, x0:x1] = a[y0:y1, x0:x1]
                b, _ = blobs(cell)
                if b: found.append(max(b, key=lambda t: t[1].sum()))
    assert len(found) == count, f'{os.path.basename(path)}: found {len(found)} pieces, expected {count}'
    return im, a, found, f


def reading_order(found, rows):
    ys = sorted(b[0][1] + b[0][3] for b in found)
    per = len(found) // rows
    bands = [sorted(found[i * per:(i + 1) * per], key=lambda b: b[0][0]) for i in range(rows)]
    return [b for band in bands for b in band]


def cut(im, bbox, mask, f, width=None, factor=None):
    x0, y0, x1, y1 = bbox
    m = np.kron(mask, np.ones((f, f), bool))[:im.height, :im.width]
    # keep only pixels within this blob (a little margin), so neighbours' fragments are dropped
    from PIL import ImageFilter
    mimg = Image.fromarray((m * 255).astype('uint8')).filter(ImageFilter.MaxFilter(9))
    piece = im.copy()
    alpha = np.minimum(np.asarray(piece.getchannel('A')), np.asarray(mimg))
    piece.putalpha(Image.fromarray(alpha))
    piece = piece.crop(bbox)
    piece = piece.crop(piece.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox())
    w = width or round(piece.width * factor)
    return piece.resize((w, round(piece.height * w / piece.width)), Image.LANCZOS)


def anchor(im):
    a = np.asarray(im)[..., 3] > 128
    ys, xs = np.nonzero(a)
    bottom = ys.max()
    return {'w': im.width, 'h': im.height, 'left': int(xs.min()), 'right': int(xs.max()),
            'bottomX': int(round(xs[ys >= bottom - 2].mean())), 'bottomY': int(bottom), 'glows': []}


def main():
    made = []
    im, a, found, f = pieces(os.path.join(ENV, 'frontierbuildings2.png'), 6)
    found = reading_order(found, 2)
    for (bbox, mask), (name, width) in zip(found, SHEET2):
        made.append((name, cut(im, bbox, mask, f, width=width)))
    im, a, found, f = pieces(os.path.join(ENV, 'gates_walls_frontier.png'), 16, ([420, 800, 1110], [266, 520, 752]))
    for (bbox, mask), name in zip(found, GATES + WALLS):
        if name in DROP: print('dropped', name, '-', DROP[name]); continue
        made.append((name, cut(im, bbox, mask, f, factor=GATE_SCALE)))
    pieces_by_name = dict(made)
    from PIL import ImageOps
    for name, (master, slope, mirror) in DERIVED.items():
        sign = -1 if slope < 0 else 1
        p = shear_to(pieces_by_name[master], slope, sign * GRID_DEG)
        made.append((name, ImageOps.mirror(p) if mirror else p))
    made = [(n, p) for n, p in made if n not in REPLACED]
    path = os.path.join(OUT, 'cutouts.json')
    text = open(path).read().rstrip()
    meta = json.loads(text)
    lines = []
    for name, p in made:
        key = f'buildings/{name}'
        p.save(os.path.join(OUT, 'buildings', name + '.png'), optimize=True)
        print(name, p.size)
        if key not in meta:
            lines.append(f' "{key}": {json.dumps(anchor(p), separators=(",", ":"))}')
    if lines:
        open(path, 'w').write(text[:-1].rstrip() + ',\n' + ',\n'.join(lines) + '\n}\n')
    if '--preview' in sys.argv:
        out = sys.argv[sys.argv.index('--preview') + 1]
        cols = 6; cw, ch = 330, 300
        sheet = Image.new('RGBA', (cols * cw, ((len(made) + cols - 1) // cols) * ch), (110, 110, 110, 255))
        from PIL import ImageDraw
        d = ImageDraw.Draw(sheet)
        for i, (name, p) in enumerate(made):
            t = p.copy(); t.thumbnail((cw - 20, ch - 40))
            x, y = (i % cols) * cw + 10, (i // cols) * ch + 24
            sheet.paste(t, (x, y), t); d.text((x, y - 18), name, fill=(255, 255, 255, 255))
        sheet.save(out)


if __name__ == '__main__':
    main()
