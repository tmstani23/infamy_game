"""Cut the third frontier building sheet (Tim 2026-11-07) into game/art/buildings.

    python tools/add_frontier_sheet3_art.py [--preview out.png]

Source (transparent): assets/environment/frbuilds3.png (3 x 2: fishing and foraging camp, railway station, barracks;
artillery shed, ironworks, market hall; prompt in the project files, art_prompts/frontier_buildings_sheet3_prompt.md).
Pieces are found as connected alpha blobs, cropped, scaled and saved like tools/add_frontier_sheet2_art.py does;
anchors are appended to game/art/cutouts.json and catalog entries to game/data/art.json (names already there are skipped).
Needs Pillow and numpy only.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = os.path.join(ROOT, 'assets', 'environment')
OUT = os.path.join(ROOT, 'game', 'art')

# sheet 3: reading order (rows top to bottom, left to right) -> name, width in px (1 cell ~300, 2 cells ~480)
SHEET3 = [('forage_camp', 320), ('railway_station', 500), ('barracks', 500),
          ('artillery_shed', 480), ('ironworks', 470), ('market_hall', 330)]


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
    # two buildings on this sheet touch, so the alpha blobs merge: cut by the 3 x 2 grid instead, keeping the
    # biggest blob of each grid cell (neighbours' overhangs into the cell are dropped)
    im = Image.open(os.path.join(ENV, 'frbuilds3.png')).convert('RGBA')
    cw, ch = im.width // 3, im.height // 2
    for k, (name, width) in enumerate(SHEET3):
        x0, y0 = (k % 3) * cw, (k // 3) * ch
        cell = im.crop((x0, y0, x0 + cw, y0 + ch))
        found, f = blobs(np.asarray(cell)[..., 3] > 128)
        bbox, mask = max(found, key=lambda b: b[1].sum())
        made.append((name, cut(cell, bbox, mask, f, width=width)))
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
    # catalog entries in game/data/art.json, after the last building entry ("sawmill" line keeps the file's style)
    art = os.path.join(ROOT, 'game', 'data', 'art.json')
    t = open(art, encoding='utf-8').read()
    new = ''.join(f'    "{n}": {{"kind":"buildings"}},\n' for n, _ in made if f'"{n}": {{"kind"' not in t)
    if new:
        mark = '    "sawmill": {"kind":"buildings"},\n'
        assert mark in t, 'art.json anchor line missing'
        t = t.replace(mark, mark + new, 1); json.loads(t); open(art, 'w', encoding='utf-8').write(t)
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
