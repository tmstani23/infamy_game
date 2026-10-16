"""Cuts the textures for the 3D interiors out of the art sheets.

    python tools/make_interior_textures.py

Writes game/art/interior3d/<name>.png. To swap art, either replace one of those
PNGs by hand or point its entry below at a different sheet and box.
Boxes are (left, top, right, bottom) in sheet pixels.
"""
import os
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = os.path.join(ROOT, 'assets', 'environment')
OUT = os.path.join(ROOT, 'game', 'art', 'interior3d')

T1 = 'textures1.png'          # 4x4 grid of 384x256 tiles
T2 = 'textures2.png'          # same grid
I2 = 'interiors2.jpg'         # props on a painted checkerboard


def tile(col, row, inset=6):
    return (384 * col + inset, 256 * row + inset, 384 * (col + 1) - inset, 256 * (row + 1) - inset)


# name: (sheet, box, output size or None to keep)
CROPS = {
    'plaster':       (T1, (452, 92, 632, 198), (256, 160)),   # the smooth middle of the tile, without the bare-stone patches
    'wood':          (T1, tile(0, 3), (384, 256)),
    'timber':        (T2, tile(0, 2), (384, 256)),
    'shoji':         (T1, tile(3, 0), (384, 256)),
    'noren':         (T1, tile(0, 2), (384, 256)),
    'red_planks':    (T1, tile(3, 1), (384, 256)),
    'tatami':        ('../../game/art/ground/tatami.jpg', (22, 4, 346, 236), (256, 192)),
    'andon_paper':   (I2, (370, 205, 396, 288), (64, 160)),
    'lantern_paper': (I2, (620, 235, 660, 290), (64, 96)),
    'coals':         (I2, (112, 220, 156, 240), (96, 48)),
    'cushion':       (I2, (40, 115, 85, 140), (64, 64)),
}


def straighten_columns(img):
    """Makes an upright painted object (a folding screen) into a flat strip: every
    column of pixels is stretched from its own top to its own bottom."""
    a = img.split()[3].load()
    w, h = img.size
    tops, bottoms = [], []
    for x in range(w):
        ys = [y for y in range(h) if a[x, y] > 128]
        tops.append(ys[0] if ys else None)
        bottoms.append(ys[-1] if ys else None)
    xs = [x for x in range(w) if tops[x] is not None and bottoms[x] - tops[x] > h * 0.5]
    x0, x1 = xs[0] + 1, xs[-1] - 1
    H = max(bottoms[x] - tops[x] for x in xs)
    out = Image.new('RGBA', (x1 - x0, H))
    for x in range(x0, x1):
        col = img.crop((x, tops[x], x + 1, bottoms[x] + 1)).resize((1, H), Image.BICUBIC)
        out.paste(col, (x - x0, 0))
    return out.convert('RGB')


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (sheet, box, size) in CROPS.items():
        im = Image.open(os.path.join(ENV, sheet)).convert('RGB').crop(box)
        if size:
            im = im.resize(size, Image.LANCZOS)
        im.save(os.path.join(OUT, f'{name}.png'))
        print('wrote', name, im.size)

    # Folding screen: the cut-out from tools/cut_environment.py, straightened into a strip
    byobu = Image.open(os.path.join(ROOT, 'game', 'art', 'interior', 'byobu.png')).convert('RGBA')
    strip = straighten_columns(byobu)
    strip = strip.resize((strip.width * 3, strip.height * 3), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.5, 40))
    strip.save(os.path.join(OUT, 'byobu.png'))
    print('wrote byobu', strip.size)

    # Timber grain for posts and beams: clean stretches of three planks from the 'timber' tile,
    # between the nail rows, side by side and stretched along the grain
    timber = Image.open(os.path.join(OUT, 'timber.png')).convert('RGB')
    strips = [timber.crop(b) for b in [(46, 20, 84, 112), (137, 20, 184, 112), (256, 20, 308, 112)]]
    grain = Image.new('RGB', (sum(s.width for s in strips), strips[0].height))
    x = 0
    for s in strips:
        grain.paste(s, (x, 0)); x += s.width
    grain.resize((128, 384), Image.LANCZOS).save(os.path.join(OUT, 'grain.png'))
    print('wrote grain')

    # Gambling mat: the painted diamond from the old cut-out, unwarped into a square
    mat = Image.open(os.path.join(ROOT, 'game', 'art', 'interior', 'gambling_mat.png')).convert('RGB')
    quad = (5, 54.5, 119.5, 102, 232, 55, 120.5, 5)   # left, bottom, right, top corners of the mat's top face
    mat = mat.transform((256, 256), Image.QUAD, quad, Image.BICUBIC).filter(ImageFilter.UnsharpMask(1.2, 50))
    # the mat's dark borders become muted brown, like the tatami borders (no black lines)
    px = mat.load()
    for y in range(mat.height):
        for x in range(mat.width):
            r, g, b = px[x, y]
            k = max(0.0, min(1.0, (110 - (r + g + b) / 3) / 60))
            px[x, y] = tuple(int(c * (1 - k) + m * k) for c, m in zip((r, g, b), (104, 86, 62)))
    mat.save(os.path.join(OUT, 'gambling_mat.png'))
    print('wrote gambling_mat')

    # Hanging scroll from the alcove art in interiors1.jpg
    scroll = Image.open(os.path.join(ENV, 'interiors1.jpg')).convert('RGB').crop((150, 562, 174, 620))
    scroll.resize((72, 174), Image.LANCZOS).save(os.path.join(OUT, 'scroll.png'))
    print('wrote scroll')


if __name__ == '__main__':
    main()
