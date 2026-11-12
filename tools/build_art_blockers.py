"""Blocking shapes from the art's own outline (war collision checkpoint 5b-0, Tim 2026-11-11).

For every building cut-out a frontier town or war camp draws (data/frontier.json townArt), the ground the
building stands on is read from its outline (tools/preview_mask_collision.py ground_mask: fill the outline,
cut the wall height off the top, straighten the back edge) and turned into a few boxes on the ground.
They are stored with the cut-out, game/art/cutouts.json "blocks": [[x0, z0, x1, z1], ...] in art pixels on
the ground, measured from the centre of the art's footprint (sim/geometry.js footprint). The sim scales them
to the size the art is drawn at (sim/frontier/art_blocks.js). A box is kept only where the outline covers
all of it, so no blocked edge reaches beyond the art.

Per-art settings in data/art.json: "blockWall" = wall height as a share of the art's height, where the
automatic reading is off; "blockShape" = a hand-made ground outline, [[x, y], ...] in art pixels, for art the
outline method reads badly (the stockade, Tim 2026-11-11: the whole of it blocks, not only the front). It is still
cut to the art's own outline. Art with a hand-set "foot" keeps it. frontier.json townArt._noBlock lists art
that blocks nothing.

  python tools/build_art_blockers.py            -> writes cutouts.json "blocks"
  python tools/build_art_blockers.py --preview  -> also to_delete/_collision_preview/blocks_*.png
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
import preview_mask_collision as pm

ROOT = pm.ROOT
S = math.sqrt(0.5)
SL = math.sin(math.atan(0.5))


def art_names(fr):
    ta, names = fr['townArt'], []
    def add(v):
        if isinstance(v, str) and v not in names: names.append(v)
    for t, v in ta.items():
        if not t.startswith('_'): add(v)
    for z in ta.get('_zones', {}).values():
        if isinstance(z, dict):
            for v in z.get('stages', []): add(v)
            add(z.get('abandoned'))
    P = ta.get('_stationParts', {}); add(P.get('hall')); add(P.get('shed'))
    return names


def centre(m):
    fa, fb = (m['bottomX'] - m['left']) / S, (m['right'] - m['bottomX']) / S
    return fa, fb, m['bottomX'] + S * (fb - fa) / 2, m['bottomY'] - SL * S * (fa + fb) / 2


def to_px(cx, cy, p, q):
    return cx + (p - q) * S, cy + (p + q) * S * SL


def sheared(img, sh):
    """The art as the game draws it: art.json "shear" slides every column up or down round the middle of the art
    (render/scenery.js spriteQuad). Returns the image, padded top and bottom, and the padding."""
    if not sh: return img, 0
    a = np.array(img); h, w = a.shape[:2]; pad = int(math.ceil(abs(sh) * w / 2)) + 1
    out = np.zeros((h + 2 * pad, w, 4), np.uint8)
    for x in range(w):
        d = pad - int(round(sh * (x - w / 2)))
        out[d:d + h, x] = a[:, x]
    return Image.fromarray(out), pad


def blocks(img, name, m, shape=None, sh=0):
    fa, fb, cx, cy = centre(m)
    w0 = img.width
    img, pad = sheared(img, sh)
    cy += pad
    if shape: shape = [(x, y - sh * (x - w0 / 2) + pad) for x, y in shape]
    P0, Q0, N = -fa / 2, -fb / 2, 12
    if shape:
        # a hand-made outline: filled, kept inside the art, and gridded over its own ground box (finer: it may be turned)
        a = np.array(img)[:, :, 3] > 60
        poly = Image.new('L', img.size, 0); ImageDraw.Draw(poly).polygon([tuple(v) for v in shape], fill=255)
        g = pm.fill_holes(a) & (np.array(poly) > 0)
        gp = [(((x - cx) / S + (y - cy) / (S * SL)) / 2, ((y - cy) / (S * SL) - (x - cx) / S) / 2) for x, y in shape]
        P0, Q0 = min(p for p, q in gp), min(q for p, q in gp)
        fa, fb, N = max(p for p, q in gp) - P0, max(q for p, q in gp) - Q0, 28
    else:
        g, _ = pm.ground_mask(img, name)
    h, w = g.shape
    inside = lambda p, q: (lambda x, y: 0 <= int(x) < w and 0 <= int(y) < h and g[int(y), int(x)])(*to_px(cx, cy, p, q))
    dp, dq = fa / N, fb / N
    on = np.zeros((N, N), bool)
    for j in range(N):
        for i in range(N):
            p0, q0 = P0 + i * dp, Q0 + j * dq
            pts = [(p0 + a * dp, q0 + b * dq) for a in (0.04, 0.5, 0.96) for b in (0.04, 0.5, 0.96)]
            on[j, i] = all(inside(p, q) for p, q in pts)
    out, open_ = [], {}
    for j in range(N):
        runs, start = [], -1
        for i in range(N + 1):
            v = i < N and on[j, i]
            if v and start < 0: start = i
            if not v and start >= 0: runs.append((start, i)); start = -1
        nxt = {}
        for r in runs:
            if r in open_: open_[r][3] = Q0 + (j + 1) * dq; nxt[r] = open_[r]
            else:
                b = [P0 + r[0] * dp, Q0 + j * dq, P0 + r[1] * dp, Q0 + (j + 1) * dq]
                out.append(b); nxt[r] = b
        open_ = nxt
    return [[round(v, 1) for v in b] for b in out]


def card(label, img, m, bs, cell=440, sh=0):
    img, pad = sheared(img, sh)
    over = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(over)
    _, _, cx, cy = centre(m); cy += pad
    for p0, q0, p1, q1 in bs:
        d.polygon([to_px(cx, cy, p, q) for p, q in ((p0, q0), (p1, q0), (p1, q1), (p0, q1))], fill=(60, 220, 255, 120), outline=(60, 240, 255, 255))
    both = Image.alpha_composite(img, over)
    sc = min((cell - 28) / img.width, (cell - 72) / img.height)
    im = both.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))), Image.LANCZOS)
    tile = Image.new('RGBA', (cell, cell), (58, 62, 54, 255))
    tile.alpha_composite(im, ((cell - im.width) // 2, 14))
    ImageDraw.Draw(tile).text((8, cell - 28), f'{label}: {len(bs)} boxes', fill=(240, 232, 205, 255))
    return tile


def main():
    fr = json.load(open(os.path.join(ROOT, 'game', 'data', 'frontier.json')))
    art = json.load(open(os.path.join(ROOT, 'game', 'data', 'art.json')))['items']
    cpath = os.path.join(ROOT, 'game', 'art', 'cutouts.json')
    cut = json.load(open(cpath))
    skip = set(fr['townArt'].get('_noBlock', []))
    pm.HEIGHT = {n: a['blockWall'] for n, a in art.items() if 'blockWall' in a}
    cards = []
    only = [v for v in sys.argv[1:] if not v.startswith('--')]
    for name in art_names(fr):
        a, key = art.get(name, {}), 'buildings/' + name
        if key in cut: cut[key].pop('blocks', None)
        if name in skip or a.get('foot') or a.get('kind') != 'buildings' or key not in cut: continue
        img = Image.open(os.path.join(ROOT, 'game', 'art', 'buildings', name + '.png')).convert('RGBA')
        bs = blocks(img, name, cut[key], a.get('blockShape'), a.get('shear', 0))
        cut[key]['blocks'] = bs
        print(name, len(bs))
        if '--preview' in sys.argv and (not only or name in only): cards.append(card(name, img, cut[key], bs, 760 if only else 440, a.get('shear', 0)))
    with open(cpath, 'w') as f: json.dump(cut, f, indent=1)
    if cards:
        out = os.path.join(ROOT, 'to_delete', '_collision_preview'); cell = 440
        if only:
            cards[0].convert('RGB').save(os.path.join(out, f'blocks_{only[0]}.png')); return
        for p in range(0, len(cards), 12):
            sheet = Image.new('RGB', (4 * cell, 3 * cell), (40, 43, 38))
            for i, c in enumerate(cards[p:p + 12]): sheet.paste(c.convert('RGB'), ((i % 4) * cell, (i // 4) * cell))
            sheet.save(os.path.join(out, f'blocks_{p // 12 + 1}.png'))


if __name__ == '__main__':
    main()
