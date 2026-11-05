"""Builds the town road autotiles (16 masks) and the field texture from Tim's generated art.
Usage: python3 build_road_tiles.py <environment dir> <out art/ground dir>
Mask bits (connected neighbours): W=1 E=2 N=4 S=8. Image top = north (-z), left = west (-x)."""
import sys, os
import numpy as np
from PIL import Image
env, out = sys.argv[1], sys.argv[2]
T = 320
def load(n): return Image.open(os.path.join(env, n)).convert('RGBA')
def seamless(a):
    h, w = a.shape[:2]
    wx = 1 - np.abs(2 * np.arange(w) / w - 1); wy = 1 - np.abs(2 * np.arange(h) / h - 1)
    m = (wy[:, None] * wx[None, :])[..., None]
    return a * m + np.roll(a, (h // 2, w // 2), (0, 1)) * (1 - m)
# road surface: gravel, rim cut, made seamless
g = load('Meiji-Era Gravel Road Texture.png').convert('RGB').crop((30, 30, 30 + 960, 30 + 960))
surf = Image.fromarray(seamless(np.asarray(g, float)).astype('uint8')).resize((T, T), Image.LANCZOS).convert('RGBA')
surf_rot = surf.rotate(90)
# kerb band from road_edge1 (outer edge at row 0), scale so stones match the corner piece (1254px tile)
e = load('road_edge1.png'); k0, k1, k2 = 217, 300, 360
band = np.asarray(e.crop((0, k0, e.width, k2)), float)
W = 1254 + 160
band = band[:, :W]
a = band[..., 3:4].copy()
wrap = np.zeros((band.shape[0], 1254, 4))
ov = 160; ramp = np.linspace(0, 1, ov)[None, :, None]
wrap[:, :1254 - ov] = band[:, ov:1254]
wrap[:, :ov] = band[:, 1254:1254 + ov] * (1 - ramp) + band[:, :ov] * ramp   # crossfade so the strip tiles
wrap[:, ov:1254] = band[:, ov:1254]
# fade the shoulder (below kerb) into the road surface
fade = np.ones(band.shape[0]); fade[k1 - k0 + 10:] = np.linspace(1, 0, band.shape[0] - (k1 - k0 + 10))
wrap[..., 3] *= fade[:, None]
sc = T / 1254
bandimg = Image.fromarray(wrap.astype('uint8'), 'RGBA')
bandimg = bandimg.resize((T, max(1, round(bandimg.height * sc))), Image.LANCZOS)
off = round(20 * sc)
corner = load('Weathered Curved Stone Curb Road Tile.png').resize((T, T), Image.LANCZOS)   # open W + S, connected N + E
def kerb(side):
    layer = Image.new('RGBA', (T, T)); layer.paste(bandimg, (0, off)); a = np.asarray(layer)
    return Image.fromarray(np.rot90(a, {'N': 0, 'W': 1, 'S': 2, 'E': 3}[side]).copy())
os.makedirs(out, exist_ok=True)
for mask in range(16):
    c = {'W': mask & 1, 'E': mask & 2, 'N': mask & 4, 'S': mask & 8}
    open_ = [s for s in 'WENS' if not c[s]]
    if len(open_) == 2 and open_[0] in 'WE' and open_[1] in 'NS':
        a = np.asarray(corner)
        if 'N' in open_: a = a[::-1]
        if 'E' in open_: a = a[:, ::-1]
        im = Image.fromarray(a.copy())
    else:
        im = (surf_rot if (c['N'] or c['S']) and not (c['W'] or c['E']) else surf).copy()
        for s in open_: im.alpha_composite(kerb(s))
    im.save(os.path.join(out, f'road_{mask}.png'), optimize=True)
# field texture: seedling rows, rim cut, seamless
f = load('Seamless Sage Seedling Rows.png').convert('RGB').crop((40, 60, 40 + 960, 60 + 960))
Image.fromarray(seamless(np.asarray(f, float)).astype('uint8')).resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'field_rows.jpg'), quality=85)
print('ok')
