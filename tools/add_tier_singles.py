"""Tier 1 town hall and stockade tiers from single large paintings (Tim 2026-11-22).

    python tools/add_tier_singles.py
    then: python tools/build_art_blockers.py

Sources in assets/environment (transparent, one building each, about 1500 px wide, made from
/mnt/project-files art_prompts hall_stockade_hd_prompts.md): townhall1.png, stockade1.png, stockade2.png, stockade3.png.
They replace the small pieces of upgrade_buildings_cut.png (tools/add_tier_art.py), which were only about
500 px wide and looked soft at close zoom. Each painting is cut to its outline and written twice:
  game/art/buildings/<name>.png     at the game width (500 / 520 px): cutouts.json anchors, glows and
                                    art.json blockShape are in these pixels
  game/art/buildings/<name>_hd.png  the same picture at twice that width (art.json "file"), drawn by the game
art.json blockShape is refit to the new outline (a ground diamond from the art's left and right edges down to its lowest point)
and "scale" is changed so the building keeps the width on the ground it had.
"""
import json, os
import numpy as np
from PIL import Image
import add_zone_variants_art as z

SINGLES = {'townhall1.png': ('town_hall_1', 500), 'stockade1.png': ('stockade_1', 520),
           'stockade2.png': ('stockade_2', 520), 'stockade3.png': ('stockade_3', 520)}
HD = 2.0          # hd width = game width x this (capped by the painting)
SLOPE = 0.45      # ground diamond side slope in art pixels, as the old hand-made blockShapes


def outline(im):
    return im.crop(im.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox())


def diamond(meta):
    """Ground outline [left, bottom, right, top] in art pixels from the art's extremes."""
    # symmetric about the art's middle, like the hand-made shapes it replaces (the whole compound blocks)
    l, r, by = meta['left'], meta['right'], meta['bottomY']
    bx = round((l + r) / 2)
    L, R, B = (l, round(by - (bx - l) * SLOPE)), (r, round(by - (r - bx) * SLOPE)), (bx, by)
    return [list(L), list(B), list(R), [L[0] + R[0] - B[0], L[1] + R[1] - B[1]]]


def main():
    cpath, apath = os.path.join(z.OUT, 'cutouts.json'), os.path.join(z.ROOT, 'game', 'data', 'art.json')
    cut = json.loads(open(cpath).read())
    art = open(apath, encoding='utf-8', newline='').read()
    lines = art.split('\n')
    for src, (name, width) in SINGLES.items():
        im = outline(Image.open(os.path.join(z.ENV, src)).convert('RGBA'))
        game = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        w = min(im.width, round(width * HD))
        hd = im.resize((w, round(game.height * w / width)), Image.LANCZOS)
        game.save(os.path.join(z.OUT, 'buildings', name + '.png'), optimize=True)
        hd.save(os.path.join(z.OUT, 'buildings', name + '_hd.png'), optimize=True)
        meta = z.anchor(game)
        key = 'buildings/' + name
        old = cut.get(key, {})
        cut[key] = {**meta, **({'blocks': old['blocks']} if 'blocks' in old else {})}
        i = next(i for i, s in enumerate(lines) if s.lstrip().startswith(f'"{name}": {{'))
        head, entry = lines[i].split(': ', 1)
        comma = entry.rstrip().endswith(',')
        e = json.loads(entry.rstrip().rstrip(','))
        shape = diamond(meta)
        if 'blockShape' in e:   # keep the building's width on the ground
            ow = e['blockShape'][2][0] - e['blockShape'][0][0]
            e['scale'] = round(e.get('scale', 1.3) * ow / (shape[2][0] - shape[0][0]), 3)
        e['blockShape'] = shape
        e['file'] = f'art/buildings/{name}_hd.png'
        e['_file'] = f'2x art for close zoom, same picture as {name}.png (tools/add_tier_singles.py)'
        lines[i] = head + ': ' + json.dumps(e, separators=(',', ':')) + (',' if comma else '') + ('\r' if entry.endswith('\r') else '')
        print(name, game.size, hd.size, 'scale', e.get('scale'), 'shape', shape)
    open(cpath, 'w').write(json.dumps(cut, indent=1, separators=(',', ': ')))
    art = '\n'.join(lines); json.loads(art)
    open(apath, 'w', encoding='utf-8', newline='').write(art)


if __name__ == '__main__':
    main()
