"""Sharper town hall art for close zoom (2026-11-22).

    python tools/add_hall_hd.py

The town halls are drawn about twice as big per art pixel as houses (art.json scale 2.15 to 2.5), and
tools/add_tier_art.py cuts them only 500 px wide, so up close they look softer than the houses round them.
This cuts the same pieces again from their sources at up to twice that width, into
game/art/buildings/<name>_hd.png. The crop is the same as the 500 px cut, so cutouts.json anchors, glows and
art.json blockShape keep working in 500 px units; art.json "file" points the game at the _hd image.
town_hall_1 and the stockades are left: their source pieces are only about 500 px wide already.
"""
import os
import numpy as np
from PIL import Image
import add_tier_art as tier
import add_zone_variants_art as z

HD = {'town_hall_2': 2.0, 'town_hall_3': 2.0}   # most times the game width, capped by the source piece


def main():
    for src, (cols, rows, names) in tier.SHEETS.items():
        sheet = None
        for (name, width, _), (bbox, mask) in zip(names, z.pieces(Image.open(os.path.join(z.ENV, src)).convert('RGBA'), cols * rows)):
            if name not in HD: continue
            sheet = sheet or Image.open(os.path.join(z.ENV, src)).convert('RGBA')
            arr = np.asarray(sheet).copy(); arr[..., 3] = np.where(mask, arr[..., 3], 0)
            im = Image.fromarray(arr).crop(bbox)
            im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox())
            game = Image.open(os.path.join(z.OUT, 'buildings', name + '.png'))
            w = min(im.width, round(game.width * HD[name]))
            h = round(game.height * w / game.width)   # same shape as the game art, so its pixels map 1:1 scaled
            out = im.resize((w, h), Image.LANCZOS)
            out.save(os.path.join(z.OUT, 'buildings', name + '_hd.png'), optimize=True)
            print(name, game.size, '->', out.size)


if __name__ == '__main__':
    main()
