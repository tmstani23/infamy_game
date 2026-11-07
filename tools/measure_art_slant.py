"""Measure how far each building's painted base is rotated off the 2:1 ground diagonal (Tim 2026-11-07: frontier
buildings like the town hall look slightly turned because the concept art doesn't hold a perfect diagonal).

    python tools/measure_art_slant.py [name ...] [--write]

For each art (default: every frontier townArt building in game/data/frontier.json) it takes the lowest opaque pixel
of every column (the base outline), fits a line to the left run and the right run of that V (Theil-Sen, so baskets
and fences don't skew it), and reports the slopes. On true 2:1 art the left run falls at +0.5 and the right at -0.5
(image y down); a rotated painting tilts both the same way by e = (left + right) / 2. The renderer can undo that with
a vertical shear of the sprite (render/scenery.js spriteQuad: verticals stay upright), so --write stores
"shear": e in the art's game/data/art.json entry (only when both runs look like real ground edges and |e| >= 0.015).
Needs Pillow and numpy only.
"""
import json, os, sys, re
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'game', 'art', 'buildings')
CATALOG = os.path.join(ROOT, 'game', 'data', 'art.json')


def theil_sen(xs, ys):
    xs, ys = np.asarray(xs, float), np.asarray(ys, float)
    if len(xs) < 8: return None
    idx = np.linspace(0, len(xs) - 1, min(len(xs), 60)).astype(int)
    x, y = xs[idx], ys[idx]
    s = [(y[j] - y[i]) / (x[j] - x[i]) for i in range(len(x)) for j in range(i + 1, len(x)) if x[j] - x[i] > 4]
    return float(np.median(s)) if s else None


def measure(name):
    a = np.asarray(Image.open(os.path.join(ART, name + '.png')).convert('RGBA'))[..., 3] > 128
    h, w = a.shape
    cols = [x for x in range(w) if a[:, x].any()]
    bottom = {x: int(np.nonzero(a[:, x])[0].max()) for x in cols}
    by = max(bottom.values())
    bx = int(round(np.mean([x for x in cols if bottom[x] >= by - 2])))
    left, right = min(cols), max(cols)
    # the middle 70% of each run: skip the corner itself and the outer eaves
    L = [x for x in cols if left + 0.15 * (bx - left) <= x <= bx - 0.15 * (bx - left)]
    R = [x for x in cols if bx + 0.15 * (right - bx) <= x <= right - 0.15 * (right - bx)]
    aL = theil_sen(L, [bottom[x] for x in L]); aR = theil_sen(R, [bottom[x] for x in R])
    return aL, aR


def frontier_arts():
    f = json.load(open(os.path.join(ROOT, 'game', 'data', 'frontier.json'), encoding='utf-8'))
    names = {v for k, v in f['townArt'].items() if not k.startswith('_') and isinstance(v, str)}
    return sorted(n for n in names if os.path.exists(os.path.join(ART, n + '.png')))


def main():
    names = [n for n in sys.argv[1:] if not n.startswith('--')] or frontier_arts()
    write = '--write' in sys.argv
    text = open(CATALOG, encoding='utf-8').read()
    for n in names:
        aL, aR = measure(n)
        ok = aL is not None and aR is not None and 0.2 <= aL <= 0.8 and -0.8 <= aR <= -0.2
        e = (aL + aR) / 2 if ok else None
        print(f'{n:28s} left {aL if aL is None else round(aL, 3)!s:>7} right {aR if aR is None else round(aR, 3)!s:>7}  tilt {"skip" if e is None else round(e, 3)}')
        if write and e is not None and abs(e) >= 0.015:
            pat = re.compile(r'("' + re.escape(n) + r'": \{)([^}]*)\}')
            m = pat.search(text)
            if not m: print('  no art.json entry for', n); continue
            body = re.sub(r',\s*"shear":\s*-?[0-9.]+', '', m.group(2))
            text = text[:m.start()] + m.group(1) + body + f',"shear":{round(e, 3)}' + '}' + text[m.end():]
    if write:
        json.loads(text); open(CATALOG, 'w', encoding='utf-8').write(text); print('wrote', CATALOG)


if __name__ == '__main__':
    main()
