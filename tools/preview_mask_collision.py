"""Preview: blocking taken from the art's own outline (war collision checkpoint 5b-0, Tim 2026-11-11).

Tim's idea: select the background, invert, fill: everything inside the outline. The filled outline also holds
the walls and roof, which stand above the ground, so the building's height is cut off the top of every column:
what is left is the ground the building stands on, and it can never reach outside the art.
Height: read from the outline at its left and right ends (a column there is one wall high), or art data.

  python tools/preview_mask_collision.py [art names]  -> to_delete/_collision_preview/mask_collision_*.png
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def _pil(a): return Image.fromarray((a * 255).astype(np.uint8))
def erode(a, n):
    im = _pil(a)
    for _ in range(n): im = im.filter(ImageFilter.MinFilter(3))
    return np.array(im) > 127
def dilate(a, n):
    im = _pil(a)
    for _ in range(n): im = im.filter(ImageFilter.MaxFilter(3))
    return np.array(im) > 127
def fill_holes(a):
    free = ~np.pad(a, 1)
    reach = np.zeros_like(free); reach[0, :] = reach[-1, :] = reach[:, 0] = reach[:, -1] = True
    while True:                                     # the background, reached from outside
        grow = reach.copy()
        grow[1:, :] |= reach[:-1, :]; grow[:-1, :] |= reach[1:, :]; grow[:, 1:] |= reach[:, :-1]; grow[:, :-1] |= reach[:, 1:]
        grow &= free
        if (grow == reach).all():
            break
        reach = grow
    return ~reach[1:-1, 1:-1]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'game', 'art')
SLOPE = math.sin(math.atan(0.5))   # ground slope on screen (geometry.js ELEVATION)
HEIGHT = {'townhouse': 0.5}          # per-art wall height as a share of the art's height, where the automatic reading is off


def ground_mask(img, name):
    a = np.array(img)[:, :, 3] > 60
    a = dilate(erode(a, 2), 2)                                  # drop wisps (smoke, twigs, flag poles)
    a = fill_holes(a)                                           # "select the background, invert"
    h, w = a.shape
    cols = np.where(a.any(axis=0))[0]
    top = np.array([np.argmax(a[:, x]) if a[:, x].any() else -1 for x in range(w)])
    low = np.array([h - 1 - np.argmax(a[::-1, x]) if a[:, x].any() else -1 for x in range(w)])
    thick = low - top
    if name in HEIGHT:
        wall = HEIGHT[name] * h
    else:
        n_edge = max(4, int(len(cols) * 0.07))
        wall = float(max(np.median(thick[cols[:n_edge]]), np.median(thick[cols[-n_edge:]])))
    g = np.zeros_like(a)
    for x in cols:
        y0 = int(top[x] + wall)
        if y0 <= low[x]:
            g[y0:low[x] + 1, x] = a[y0:low[x] + 1, x]
    # straight back edges (Tim OK 2026-11-11): the cut edge copies the roofline, so chimneys and towers leave
    # spikes. Two straight lines at the ground slope, one over each half, set at the middle height of that
    # half's back edge, cut the spikes off. The shape only ever shrinks, so it stays inside the art.
    gc = np.where(g.any(axis=0))[0]
    if len(gc) > 8:
        gtop = np.array([np.argmax(g[:, x]) for x in gc])
        mid = gc[len(gc) // 2]
        yy, xx = np.mgrid[0:h, 0:w]
        lh, rh = gc <= mid, gc >= mid
        c1 = np.percentile(gtop[lh] + SLOPE * gc[lh], 65)       # left half: the back edge rises to the right
        c2 = np.percentile(gtop[rh] - SLOPE * gc[rh], 65)       # right half: it falls to the right
        g &= (yy >= c1 - SLOPE * xx - 2) & (yy >= c2 + SLOPE * xx - 2)
    g = erode(g, 3)                 # a little inside the outline
    return g, wall


def card(label, img, name, cell=440):
    g, wall = ground_mask(img, name)
    pad = 14
    sc = min((cell - 2 * pad) / img.width, (cell - 44 - 2 * pad) / img.height)
    over = np.zeros((img.height, img.width, 4), np.uint8)
    over[g] = (60, 220, 255, 120)
    edge = g & ~erode(g, 2)
    over[edge] = (60, 240, 255, 255)
    both = Image.alpha_composite(img, Image.fromarray(over))
    im = both.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))), Image.LANCZOS)
    tile = Image.new('RGBA', (cell, cell), (58, 62, 54, 255))
    tile.alpha_composite(im, ((cell - im.width) // 2, pad))
    d = ImageDraw.Draw(tile)
    d.text((8, cell - 40), label, fill=(240, 232, 205, 255))
    d.text((8, cell - 24), f'wall height read as {int(100 * wall / img.height)}% of the art', fill=(190, 200, 180, 255))
    return tile


def main():
    fr = json.load(open(os.path.join(ROOT, 'game', 'data', 'frontier.json')))
    ta = fr['townArt']
    names, seen = [], set()
    for t, v in ta.items():
        if isinstance(v, str) and v not in seen and os.path.exists(os.path.join(ART, 'buildings', v + '.png')):
            seen.add(v); names.append((t.replace('zone:', 'zone '), v))
    only = sys.argv[1:]
    if only:
        names = [(t, v) for t, v in names if v in only]
    out = os.path.join(ROOT, 'to_delete', '_collision_preview')
    cell = 620 if only else 440
    cards = [card(f'{t} ({v})', Image.open(os.path.join(ART, 'buildings', v + '.png')).convert('RGBA'), v, cell) for t, v in names]
    cols, rows = (len(cards), 1) if only else (4, 3)
    for p in range(0, len(cards), cols * rows):
        sheet = Image.new('RGB', (cols * cell, rows * cell), (40, 43, 38))
        for i, c in enumerate(cards[p:p + cols * rows]):
            sheet.paste(c.convert('RGB'), ((i % cols) * cell, (i // cols) * cell))
        sheet.save(os.path.join(out, f"mask_collision_{'pick' if only else p // (cols * rows) + 1}.png"))
    print(len(cards), 'cards')


if __name__ == '__main__':
    main()
