"""Island ground preview: today's method vs the layered "hand-painted" method (W3.10 mock).
Iso view like the game: camera from the south-east, 2:1, screen right = (+x, -z)."""
import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageFont
import sys, os

IN = sys.argv[1]; OUT = sys.argv[2]
W, H = 1200, 760          # output per panel
PX = 15.0                 # screen px per world unit (game: ~38 at normal zoom; zoomed out for the mock)
rng = np.random.default_rng(7)

def img(n): return np.asarray(Image.open(os.path.join(IN, n)).convert('RGB'), dtype=np.float32) / 255
def spr(n): return Image.open(os.path.join(IN, n)).convert('RGBA')

# screen pixel -> world (x, z); screen x = (x - z)/sqrt2, screen y = (x + z)/sqrt2 * 0.5
sy, sx = np.mgrid[0:H, 0:W].astype(np.float32)
u = (sx - W / 2) / PX; v = (sy - H / 2) / PX / 0.5
X = (u + v) / np.sqrt(2) + 60; Z = (v - u) / np.sqrt(2) + 60

# --- the scene: forest cells (50-unit terrain grid) west/north, plain east, a corridor trail -------
def forest_cell(x, z):   # terrain codes per 50-unit cell: an L of forest
    cx, cz = np.floor(x / 50), np.floor(z / 50)
    return ((cx <= 0) | ((cx == 1) & (cz <= 0))).astype(np.float32)
trail = [(-40, 95), (20, 70), (60, 64), (95, 30), (160, 10)]
def seg_dist(x, z):
    d = np.full(x.shape, 1e9, np.float32)
    for (ax, az), (bx, bz) in zip(trail, trail[1:]):
        abx, abz = bx - ax, bz - az; t = np.clip(((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz), 0, 1)
        d = np.minimum(d, np.hypot(x - ax - t * abx, z - az - t * abz))
    return d

def sample(T, x, z, tile, rot=0, off=(0, 0)):
    h, w = T.shape[:2]
    a, b = x / tile + off[0], z / tile + off[1]
    if rot % 2: a, b = b, -a
    if rot >= 2: a, b = -a, -b
    i = (np.floor((b % 1) * h).astype(int)) % h; j = (np.floor((a % 1) * w).astype(int)) % w
    return T[i, j]

def value_noise(x, z, scale, seed):
    r = np.random.default_rng(seed); g = r.random((64, 64)).astype(np.float32)
    fx, fz = x / scale, z / scale; x0, z0 = np.floor(fx), np.floor(fz); tx, tz = fx - x0, fz - z0
    tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz)
    i0, j0 = (z0.astype(int)) % 64, (x0.astype(int)) % 64; i1, j1 = (i0 + 1) % 64, (j0 + 1) % 64
    return (g[i0, j0] * (1 - tx) + g[i0, j1] * tx) * (1 - tz) + (g[i1, j0] * (1 - tx) + g[i1, j1] * tx) * tz
def fbm(x, z, scale, seed, oct=3):
    s, a, t = 0, 1, 0
    for o in range(oct): s += a * value_noise(x, z, scale / 2 ** o, seed + o); t += a; a *= 0.5
    return s / t

# ===================== BEFORE: today's method =====================
grass, mud, dirt = img('grass.png'), img('mud.png'), img('dirt.png')
TILE_CITY = 8.0
fw = np.zeros_like(X)
for dx in (-9, 0, 9):
    for dz in (-9, 0, 9): fw += forest_cell(X + dx, Z + dz) / 9
wg = (1 - fw) * 1 + fw * 0.45; wm = fw * 0.15; wd = 1 - wg - wm
before = sample(grass, X, Z, TILE_CITY) * wg[..., None] + sample(mud, X, Z, TILE_CITY) * wm[..., None] + sample(dirt, X, Z, TILE_CITY) * wd[..., None]
tr = np.clip(1 - (seg_dist(X, Z) - 2.0), 0, 1)[..., None]
before = before * (1 - tr) + sample(dirt, X, Z, TILE_CITY) * tr

# ===================== AFTER: layered method =====================
# 1. wandering borders: blur the cell mask, then warp it with noise
wx = (fbm(X, Z, 22, 11) - 0.5) * 34; wz = (fbm(X, Z, 22, 23) - 0.5) * 34
fm = np.zeros_like(X)
for dx in (-12, -6, 0, 6, 12):
    for dz in (-12, -6, 0, 6, 12): fm += forest_cell(X + wx + dx, Z + wz + dz) / 25
forest = np.clip((fm - 0.5) * 3 + 0.5 + (fbm(X, Z, 9, 5) - 0.5) * 0.8, 0, 1)

# 2. stochastic tiling: each 10-unit cell samples with its own offset and rotation, blended smoothly
def stoch(T, tile, seed, cell=10.0):
    r = np.random.default_rng(seed); offs = r.random((32, 32, 2)); rots = r.integers(0, 4, (32, 32))
    fx, fz = X / cell - 0.5, Z / cell - 0.5; x0, z0 = np.floor(fx), np.floor(fz); tx, tz = fx - x0, fz - z0
    tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz)
    out = np.zeros(X.shape + (3,), np.float32)
    for di, dj, wgt in ((0, 0, (1 - tx) * (1 - tz)), (0, 1, tx * (1 - tz)), (1, 0, (1 - tx) * tz), (1, 1, tx * tz)):
        ci = ((z0 + di).astype(int)) % 32; cj = ((x0 + dj).astype(int)) % 32
        o = offs[ci, cj]; ro = rots[ci, cj]
        s = np.zeros_like(out)
        for k in range(4):
            m = ro == k
            if m.any(): s[m] = sample(T, X[m], Z[m], tile, k, (o[m][:, 0], o[m][:, 1]))
        out += s * wgt[..., None]
    return out

# 3. ground mosaic: several forest textures by low-frequency noise, blended by texture height
F = {n: img(n + '_tile.png') for n in ['forest_floor', 'pine_needles', 'moss', 'leaf_litter', 'ferns', 'mossy_stones', 'bracken']}
P = {'grass': grass, 'pebbles_soil': img('pebbles_soil_tile.png'), 'moss': F['moss']}
def mosaic(texs, weights, seed):
    cols = [stoch(T, 9.0, seed + i) for i, T in enumerate(texs)]
    hts = [c.mean(-1) for c in cols]
    score = [w + h * 0.35 for w, h in zip(weights, hts)]   # height-based blend: bright/raised texels win
    mx = np.maximum.reduce(score)
    ws = [np.clip(s - mx + 0.12, 0, None) for s in score]
    tot = sum(ws) + 1e-6
    return sum(c * (w / tot)[..., None] for c, w in zip(cols, ws))
fnames = list(F)
fw_noise = [fbm(X, Z, 22, 100 + i) * (1.25 if n in ('forest_floor', 'pine_needles') else 1.0) for i, n in enumerate(fnames)]
forest_col = mosaic([F[n] for n in fnames], fw_noise, 300)
pw = [fbm(X, Z, 30, 200) + 0.35, fbm(X, Z, 18, 201) * 0.8, fbm(X, Z, 25, 202) * 0.75]
plain_col = mosaic(list(P.values()), pw, 400)
# soft height blend at the forest edge
edge_h = forest + (forest_col.mean(-1) - plain_col.mean(-1)) * 0.9 + (fbm(X, Z, 3, 31) - 0.5) * 0.5
fb = np.clip((edge_h - 0.5) * 1.6 + 0.5, 0, 1)[..., None]
after = plain_col * (1 - fb) + forest_col * fb

# 4. trail: noisy width, worn edges, roots inside the forest
d = seg_dist(X + (fbm(X, Z, 6, 9) - 0.5) * 3, Z + (fbm(X, Z, 6, 10) - 0.5) * 3)
width = 2.2 + fbm(X, Z, 15, 12) * 1.6
trail_col = stoch(img('dirt_trail_tile.png'), 7.0, 500) * (1 - 0.5 * fb) + stoch(img('trail_roots_tile.png'), 7.0, 501) * (0.5 * fb)
tw = np.clip((width - d) / 1.2 + (trail_col.mean(-1) - 0.45), 0, 1)[..., None]
after = after * (1 - tw) + trail_col * tw
wear = np.clip((width + 2.5 - d) / 2.5, 0, 1) * (1 - tw[..., 0])          # trampled verge
after = after * (1 - 0.18 * wear[..., None]) + stoch(img('pebbles_soil_tile.png'), 8.0, 502) * (0.18 * wear[..., None])

# 5. macro variation: slow light/colour drift
macro = (fbm(X, Z, 70, 77) - 0.5)
after = after * (1 + macro[..., None] * np.array([0.22, 0.18, 0.12], np.float32))

def to_img(a): return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
B, A = to_img(before), to_img(after)

# --- props -----------------------------------------------------------------------------------------
def to_screen(x, z): return (W / 2 + (x - 60 - (z - 60)) / np.sqrt(2) * PX, H / 2 + (x - 60 + (z - 60)) / np.sqrt(2) * 0.5 * PX)
def draw_props(base, items):
    im = base.convert('RGBA')
    for x, z, s, n in sorted(items, key=lambda t: t[0] + t[1]):
        sp = SPR[n]; tw_ = UNITS[n] * s * PX; k = tw_ / sp.width
        sp2 = sp.resize((max(1, int(sp.width * k)), max(1, int(sp.height * k))), Image.LANCZOS)
        px, py = to_screen(x, z)
        if -200 < px < W + 200 and -50 < py < H + 300: im.alpha_composite(sp2, (int(px - sp2.width / 2), int(py - sp2.height * 0.92)))
    return im.convert('RGB')
UNITS = {'pine': 5.5, 'cedar': 4.2, 'bush': 3.6, 'ferns': 3.0, 'small_rocks': 3.0, 'boulder': 3.6, 'stump': 2.0, 'fallen_log': 5.0}
SPR = {n: spr('prop_' + n + '.png') for n in ['pine', 'cedar', 'bush', 'ferns', 'small_rocks', 'boulder', 'stump', 'fallen_log']}
xs = np.linspace(-80, 200, 1); # unused
area = (-60, 200, -60, 200)
def fcell(x, z): return forest_cell(np.array([x]), np.array([z]))[0]
def sd(x, z): return seg_dist(np.array([x], np.float32), np.array([z], np.float32))[0]
# before: uniform random in forest cells
bitems = []
for _ in range(1400):
    x, z = rng.uniform(*area[:2]), rng.uniform(*area[2:])
    if fcell(x, z) > 0 and sd(x, z) > 4 and rng.random() < 0.55: bitems.append((x, z, 1.0, 'pine' if rng.random() < 0.5 else 'cedar'))
    elif fcell(x, z) == 0 and rng.random() < 0.02: bitems.append((x, z, 1.0, 'bush'))
# after: Poisson-disc candidates, density from the warped forest mask and noise (groves, clearings),
# thinned near the trail, edge trees along the border, undergrowth and rocks in clearings
def at(arr_fn, x, z): return arr_fn(np.array([x], np.float32), np.array([z], np.float32))[0]
def forest_at(x, z):
    wx_ = (fbm(np.array([x]), np.array([z]), 22, 11)[0] - 0.5) * 34; wz_ = (fbm(np.array([x]), np.array([z]), 22, 23)[0] - 0.5) * 34
    s = 0
    for dx in (-12, -6, 0, 6, 12):
        for dz in (-12, -6, 0, 6, 12): s += fcell(x + wx_ + dx, z + wz_ + dz) / 25
    return np.clip((s - 0.5) * 3 + 0.5 + (fbm(np.array([x]), np.array([z]), 9, 5)[0] - 0.5) * 0.8, 0, 1)
pts = []
for _ in range(9000):
    x, z = rng.uniform(*area[:2]), rng.uniform(*area[2:])
    if all((x - a) ** 2 + (z - b) ** 2 > 3.4 ** 2 for a, b in pts[-400:]): pts.append((x, z))
aitems = []
for x, z in pts:
    f = forest_at(x, z); grove = fbm(np.array([x]), np.array([z]), 26, 61)[0]; dtr = sd(x, z)
    near_trail = np.clip((dtr - 3) / 6, 0, 1)
    p_tree = f * np.clip((grove - 0.42) * 2.2, 0, 1) * near_trail * 0.8
    edge = f > 0.12 and f < 0.6
    if rng.random() < p_tree or (edge and rng.random() < 0.22 * near_trail):
        aitems.append((x, z, rng.uniform(0.8, 1.15), 'cedar' if grove > 0.55 else 'pine'))
    elif f > 0.4 and rng.random() < 0.10 * near_trail: aitems.append((x, z, rng.uniform(0.8, 1.2), rng.choice(['ferns', 'bush', 'ferns', 'stump'])))
    elif 0.04 < f < 0.3 and rng.random() < 0.10 * near_trail: aitems.append((x, z, rng.uniform(0.8, 1.2), rng.choice(['bush', 'ferns', 'pine'])))
    elif f < 0.3 and rng.random() < 0.012: aitems.append((x, z, rng.uniform(0.8, 1.2), rng.choice(['bush', 'small_rocks', 'ferns'])))
for x, z in [(30, 82), (100, 40)]: aitems.append((x, z, 1.0, 'fallen_log'))
aitems.append((70, 52, 1.0, 'boulder'))
B = draw_props(B, bitems); A = draw_props(A, aitems)

# --- side by side with labels --------------------------------------------------------------------
sheet = Image.new('RGB', (W * 2 + 30, H + 70), (18, 20, 24))
sheet.paste(B, (0, 70)); sheet.paste(A, (W + 30, 70))
dr = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 30)
except Exception: font = ImageFont.load_default()
dr.text((20, 18), 'Today: city textures, grid-shaped blend, even tree spread', fill=(240, 225, 190), font=font)
dr.text((W + 50, 18), 'Layered: wandering edge, texture mosaic, groves + clearings', fill=(240, 225, 190), font=font)
sheet.save(OUT, quality=90)
A.save(OUT.replace('.jpg', '_after.jpg'), quality=92)
print('ok', len(bitems), len(aitems))
