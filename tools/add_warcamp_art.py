"""Cut the war camp building sheet (Tim 2026-11-09/10) into game/art/buildings.

    python tools/add_warcamp_art.py [--preview out.png]

Source (white background): assets/environment/warcampbuildings1.png, 3 x 2: camp hall, camp barracks, rifle range;
clan hall, supply tents, kennel (prompt 8 in the project files, art_prompts/war_concept_prompts.md).
Also the planted war camp banner, an upright cutout of assets/concepts/items/war_banner.png (the same picture is the
sashimono item slab, tools/make_slabs.py).
The white background is flooded away from the sheet's border (plus enclosed pure-white gaps such as between fence
rails), then each grid cell keeps its biggest blob, cropped and scaled like tools/add_frontier_sheet3_art.py.
Anchors are appended to game/art/cutouts.json and catalog entries to game/data/art.json (names already there are
skipped). Needs Pillow, numpy and scipy (like tools/make_slabs.py).
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from add_frontier_sheet3_art import anchor   # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'art')

# reading order -> name, width in px (1 cell ~300-330, 2 cells ~480-500, the 3-cell camp hall ~560)
SHEET = [('camp_hall', 560), ('camp_barracks', 500), ('rifle_range', 500),
         ('clan_hall', 480), ('supply_tents', 320), ('kennel', 330)]
BANNER_H = 240   # px tall: about twice a person, a little over half the frontier watchtower


def unwhite(im, lo=225, spread=25):
    """RGBA copy with the white background removed (border flood + enclosed pure-white gaps), soft 2 px edge."""
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    white = (a.min(2) > lo) & (np.ptp(a, 2) < spread)
    pure = (a.min(2) > 242) & (np.ptp(a, 2) < 10)
    from scipy import ndimage   # as tools/make_slabs.py
    lab, _ = ndimage.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # enclosed gaps (between fence rails, under tent flaps) are flat pure white
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if i in border or sl is None: continue
        comp = lab[sl] == i
        if comp.sum() > 60 and pure[sl][comp].mean() > 0.9: bg[sl] |= comp
    near = np.asarray(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    near &= ~bg
    alpha = np.where(bg, 0, 255).astype(np.float32)
    whit = (a.min(2) - 150) / 105.0
    alpha[near] = 255 * np.clip(1 - whit[near], 0.25, 1)
    return Image.fromarray(np.dstack([a.astype(np.uint8), alpha.astype(np.uint8)]), 'RGBA')


def main():
    made = []
    im = unwhite(Image.open(os.path.join(ROOT, 'assets', 'environment', 'warcampbuildings1.png')))
    # pieces overhang their grid cell (the camp hall's curtain wall reaches into the barracks' cell), so each cell
    # takes every opaque component whose centre lies inside it instead of cutting at the cell edge
    from scipy import ndimage
    alpha = np.asarray(im)[..., 3]
    lab, n = ndimage.label(alpha > 30)
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    cents = ndimage.center_of_mass(np.ones_like(lab), lab, range(1, n + 1))
    cw, ch = im.width / 3, im.height / 2
    for k, (name, width) in enumerate(SHEET):
        cx, cy = k % 3, k // 3
        ids = [i + 1 for i, ((y, x), sz) in enumerate(zip(cents, sizes)) if sz > 150 and int(x // cw) == cx and int(y // ch) == cy]
        mask = np.isin(lab, ids)
        piece = im.copy()
        piece.putalpha(Image.fromarray(np.where(mask, alpha, 0).astype(np.uint8)))
        piece = piece.crop(Image.fromarray((mask * 255).astype(np.uint8)).getbbox())
        made.append((name, piece.resize((width, round(piece.height * width / piece.width)), Image.LANCZOS)))
    # the banner cloth is off-white: only the near-pure white background goes
    b = unwhite(Image.open(os.path.join(ROOT, 'assets', 'concepts', 'items', 'war_banner.png')), lo=246, spread=8)
    # keep the banner itself (largest opaque piece): the picture has grey specks along its right border
    from scipy import ndimage
    ba = np.asarray(b)[..., 3]
    blab, bn = ndimage.label(ba > 30)
    big = 1 + int(np.argmax(ndimage.sum(np.ones_like(blab), blab, range(1, bn + 1))))
    b.putalpha(Image.fromarray(np.where(ndimage.binary_dilation(blab == big, iterations=2), ba, 0).astype(np.uint8)))
    b = b.crop(b.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox())
    made.append(('war_banner', b.resize((round(b.width * BANNER_H / b.height), BANNER_H), Image.LANCZOS)))
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
    art = os.path.join(ROOT, 'game', 'data', 'art.json')
    t = open(art, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in t else '\n'
    new = ''.join(f'    "{n}": {{"kind":"buildings"}},{nl}' for n, _ in made if f'"{n}": {{"kind"' not in t)
    if new:
        mark = f'    "sawmill": {{"kind":"buildings"}},{nl}'
        assert mark in t, 'art.json anchor line missing'
        t = t.replace(mark, mark + new, 1); json.loads(t); open(art, 'w', encoding='utf-8', newline='').write(t)
    if '--preview' in sys.argv:
        out = sys.argv[sys.argv.index('--preview') + 1]
        cols = 4; cw, ch = 580, 440
        sheet = Image.new('RGBA', (cols * cw, ((len(made) + cols - 1) // cols) * ch), (96, 110, 92, 255))
        d = ImageDraw.Draw(sheet)
        for i, (name, p) in enumerate(made):
            x, y = (i % cols) * cw + 10, (i // cols) * ch + 24
            sheet.paste(p, (x, y), p); d.text((x, y - 18), name, fill=(255, 255, 255, 255))
        sheet.save(out)


if __name__ == '__main__':
    main()
