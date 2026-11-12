"""Preview of building blocking against the art (war collision checkpoint 5b-0, Tim 2026-11-11).

Frontier town and war camp buildings: today a placed building blocks a square share of its grid tiles
(townGrid.buildingCollide), whatever the shape of its art, so long buildings block empty ground beside them.
Proposed: block the art's own ground footprint as drawn (the same rule city buildings use: the painting's
left, bottom and right ground corners, times the art's solid share).

  python tools/measure_footprints.py   -> preview sheets in to_delete/_collision_preview/ (nothing in the game changes)
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'game', 'art')
SLOPE = math.sin(math.atan(0.5))      # screen rise per pixel along a ground edge (geometry.js ELEVATION)
ALPHA = 60                            # a pixel counts as painted above this alpha


S = math.sqrt(0.5)
# Proposed per-art blocked boxes (Tim 2026-11-11): one or more boxes per art, each [a0, a1, b0, b1] in shares of the
# art's half footprint measured from its centre: a runs from the lower right edge (-1) to the upper left edge (+1),
# b from the lower left edge (-1) to the upper right edge (+1). Missing = one box at the art's solid share.
# Would live in art.json as "solidBoxes".
BOXES = {'manor': [[-0.82, 1.0, -0.82, 0.82]], 'townhouse': [[-0.82, 1.0, -0.82, 0.82]],
         'fort': [[-0.95, 1.1, -0.95, 1.4], [-0.2, 0.95, 1.4, 3.6]],
         'sawmill': [[-0.45, 1.0, -0.6, 1.0], [-1.3, -0.5, 0.5, 1.3]]}
PPU = 160 / 3


def card(name, label, img, meta, item, cells, fitcells, cell_world, collide, building_scale, cell=440):
    """cells: grid tiles a side the building takes (None = nothing blocks today); fitcells: _placedFootprint."""
    scale_item = item.get('scale', building_scale)
    k0 = scale_item / PPU                                   # world units per art pixel, unfitted
    fa, fb = (meta['bottomX'] - meta['left']) * k0 / S, (meta['right'] - meta['bottomX']) * k0 / S
    fit = min(1, cell_world * fitcells / (2 * max(fa, fb))) if fitcells else 1
    fa, fb, k = fa * fit, fb * fit, k0 * fit                # as drawn in a town
    u, v = (-S / k, -S * SLOPE / k), (S / k, -S * SLOPE / k)   # art pixels per world unit toward the left and right corners
    cx, cy = meta['bottomX'] + (fa * u[0] + fb * v[0]) / 2, meta['bottomY'] + (fa * u[1] + fb * v[1]) / 2
    box = lambda a, b: [(cx + sa * a / 2 * u[0] + sb * b / 2 * v[0], cy + sa * a / 2 * u[1] + sb * b / 2 * v[1]) for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    solid = item.get('solid', 0.82)
    P = lambda a, b: (cx + a * fa / 2 * u[0] + b * fb / 2 * v[0], cy + a * fa / 2 * u[1] + b * fb / 2 * v[1])
    news = [[P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)] for a0, a1, b0, b1 in BOXES.get(name, [[-solid, solid, -solid, solid]])]
    new = [p for q in news for p in q]
    old = box(cells * cell_world * collide, cells * cell_world * collide) if cells else None
    pts = new + (old or [])
    minx, maxx = min(0, *(p[0] for p in pts)), max(img.width, *(p[0] for p in pts))
    miny, maxy = min(0, *(p[1] for p in pts)), max(img.height, *(p[1] for p in pts))
    pad = 14
    sc = min((cell - 2 * pad) / (maxx - minx), (cell - 44 - 2 * pad) / (maxy - miny))
    im = img.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))), Image.LANCZOS)
    ox, oy = pad - minx * sc + (cell - 2 * pad - (maxx - minx) * sc) / 2, pad - miny * sc
    to = lambda ps: [(ox + x * sc, oy + y * sc) for x, y in ps]
    tile = Image.new('RGBA', (cell, cell), (58, 62, 54, 255))
    tile.alpha_composite(im, (int(ox), int(oy)))
    layer = Image.new('RGBA', (cell, cell), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if old:
        d.polygon(to(old), fill=(235, 60, 50, 70), outline=(255, 80, 60, 255))
    for q in news:
        d.polygon(to(q), fill=(60, 220, 255, 95), outline=(60, 240, 255, 255))
    tile.alpha_composite(layer)
    d = ImageDraw.Draw(tile)
    area = f"{int(100 * fa * solid * fb * solid / (cells * cell_world * collide) ** 2)}% of today's blocked area" if cells else 'nothing blocks today'
    d.text((8, cell - 40), label, fill=(240, 232, 205, 255))
    d.text((8, cell - 24), area, fill=(190, 200, 180, 255))
    return tile


def main():
    cut = json.load(open(os.path.join(ART, 'cutouts.json')))
    art = json.load(open(os.path.join(ROOT, 'game', 'data', 'art.json')))
    fr = json.load(open(os.path.join(ROOT, 'game', 'data', 'frontier.json')))
    ta, fits, cellw = fr['townArt'], fr['townArt']['_placedFootprint'], fr['townGrid']['cellSize']
    collide, zf = fr['townGrid']['buildingCollide'], 0.8
    rows = []
    for t, b in fr['buildings'].items():
        if isinstance(b, dict) and isinstance(ta.get(t), str):
            rows.append((f'Town: {t} ({ta[t]})', ta[t], b.get('size', 1), fits.get(t), collide))
    rows.append((f"Zone house ({ta['zone:h']})", ta['zone:h'], None, zf, 1))
    rows.append((f"Zone workshop ({ta['zone:k']})", ta['zone:k'], None, zf, 1))
    for t in fr['war']['buildings']:
        if isinstance(ta.get(t), str):
            rows.append((f'War camp: {t} ({ta[t]})', ta[t], None, fits.get(t), collide))
    out = os.path.join(ROOT, 'to_delete', '_collision_preview')
    os.makedirs(out, exist_ok=True)
    cards = []
    only = sys.argv[1:]
    for label, name, cells, fitcells, col in rows:
        if only and name not in only: continue
        meta, path = cut.get('buildings/' + name), os.path.join(ART, 'buildings', name + '.png')
        item = art['items'].get(name, {})
        if not meta or not os.path.exists(path) or item.get('foot'):
            print('skipped', label); continue
        cards.append(card(name, label, Image.open(path).convert('RGBA'), meta, item, cells, fitcells, cellw, col, art['buildingScale'], cell=620 if only else 440))
    cols, nrows, cell = (len(cards), 1, 620) if only else (4, 3, 440)
    for p in range(0, len(cards), cols * nrows):
        sheet = Image.new('RGB', (cols * cell, nrows * cell), (40, 43, 38))
        for i, c in enumerate(cards[p:p + cols * nrows]):
            sheet.paste(c.convert('RGB'), ((i % cols) * cell, (i // cols) * cell))
        sheet.save(os.path.join(out, f"town_collision_{'edges' if only else p // (cols * nrows) + 1}.png"))
    print(f'{len(cards)} buildings, {math.ceil(len(cards) / (cols * nrows))} sheets in {out}')


if __name__ == '__main__':
    main()
