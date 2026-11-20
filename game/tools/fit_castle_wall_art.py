# Castle wall and gate art fitted to the island's ground diagonal by measurement, not by eye (Tim 2026-11-19).
# The view looks down at ELEVATION = atan(0.5) from a 45 degree turn, so a wall run along a cell row climbs
# s = sin(ELEVATION) screen units per unit across, and one cell (11 units) spans 11 * sqrt(1/2) units across.
# 1. town_wall.png: the base line and the roof line of the painting are fitted (least squares over the middle
#    columns) and each column is stretched so both lines climb exactly s; a stretch of the middle, one roof
#    pattern long, is cut out so pieces repeat end to end; its scale makes it exactly half a cell across.
# 2. town_gate.png: its base is fitted and sheared to climb s, the wall stubs beside the gatehouse are cut off.
# Writes art/buildings/castle_wall.png and castle_gate.png and prints the art.json and cutouts.json entries.
# Run from game/: python tools/fit_castle_wall_art.py
import json, math
import numpy as np
from PIL import Image

S = math.sqrt(0.5); s = math.sin(math.atan(0.5)); PPU = 160 / 3; BASE_SCALE = 1.3; CELL = 11
HALF = CELL / 2 * S * PPU / BASE_SCALE          # art pixels across half a cell at the building scale (159.55)

def load(name):
    a = np.asarray(Image.open(f'art/buildings/{name}.png').convert('RGBA')).astype(np.float32)
    return a

def edges(a, x0, x1):
    al = a[:, :, 3] > 128; xs, top, bot = [], [], []
    for x in range(x0, x1):
        ys = np.nonzero(al[:, x])[0]
        if len(ys): xs.append(x); top.append(ys[0]); bot.append(ys[-1])
    return np.array(xs), np.array(top, float), np.array(bot, float)

def robust_line(xs, ys, keep=0.7):
    m, c = np.polyfit(xs, ys, 1)
    for _ in range(3):   # drop the worst outliers (roof end ornaments, pebbles) and fit again
        r = np.abs(ys - (m * xs + c)); ok = r <= np.quantile(r, keep)
        m, c = np.polyfit(xs[ok], ys[ok], 1)
    return m, c

def sample(a, xs_src, ys_src):
    # bilinear sampling of a (h, w, 4) at float source coordinates (premultiplied so edges stay clean)
    h, w = a.shape[:2]
    pm = a.copy(); pm[:, :, :3] *= pm[:, :, 3:4] / 255
    x0 = np.floor(xs_src).astype(int); y0 = np.floor(ys_src).astype(int); fx = xs_src - x0; fy = ys_src - y0
    def px(x, y):
        inside = (x >= 0) & (x < w) & (y >= 0) & (y < h)
        out = np.zeros(x.shape + (4,), np.float32)
        out[inside] = pm[y[inside], x[inside]]
        return out
    v = (px(x0, y0) * ((1 - fx) * (1 - fy))[..., None] + px(x0 + 1, y0) * (fx * (1 - fy))[..., None]
         + px(x0, y0 + 1) * ((1 - fx) * fy)[..., None] + px(x0 + 1, y0 + 1) * (fx * fy)[..., None])
    al = v[:, :, 3:4]; rgb = np.where(al > 0, v[:, :, :3] * 255 / np.maximum(al, 1e-6), 0)
    return np.concatenate([np.clip(rgb, 0, 255), al], axis=2)

def meta(img):
    al = np.asarray(img)[:, :, 3] > 128; ys, xs = np.nonzero(al)
    by = ys.max(); bx = int(np.round(xs[ys == by].mean()))
    return {'w': img.width, 'h': img.height, 'left': int(xs.min()), 'right': int(xs.max()), 'bottomX': bx, 'bottomY': int(by), 'glows': []}

# --- wall ---------------------------------------------------------------------------------------------------
a = load('town_wall'); h, w = a.shape[:2]
xs, top, bot = edges(a, 50, 300)
mb, cb = robust_line(xs, bot); mt, ct = robust_line(xs, top)
xm = 165.0
yb = lambda x: mb * x + cb; yt = lambda x: mt * x + ct
ybT = lambda x: yb(xm) - s * (x - xm); ytT = lambda x: yt(xm) - s * (x - xm)
PAD = 80; H = h + 2 * PAD   # room for the columns to move up and down
X, Y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(H, dtype=np.float32) - PAD)
f = (Y - ytT(X)) / (ybT(X) - ytT(X))                   # 0 on the roof line, 1 on the base line, straight through
warped = sample(a, X, yt(X) + f * (yb(X) - yt(X)))
# the roof pattern's period: compare the band above the base line with itself shifted along the run
def band(x0, n):
    rows = []
    for x in range(x0, x0 + n):
        y = int(round(ybT(x))) + PAD
        rows.append(warped[y - 150:y + 1, x, :3])
    return np.stack(rows)
P = int(round(HALF))                                   # one piece = half a cell at the building scale, no stretching
# where to cut: the start column whose 3 columns match the columns one piece on best, so the joins hardly show
best = min((float(np.mean(np.abs(band(x, 3) - band(x + P, 3)))), x) for x in range(55, 300 - P - 4))
x0 = best[1]; OV = 2              # cut [x0 - OV, x0 + P + OV): pieces overlap OV pixels each end
cut = warped[:, x0 - OV:x0 + P + OV]
al = cut[:, :, 3] > 8; rows = np.nonzero(al.any(axis=1))[0]
cut = cut[rows.min() - 1:rows.max() + 2]
img = Image.fromarray(cut.astype(np.uint8), 'RGBA'); img.save('art/buildings/castle_wall.png')
top_row = rows.min() - 1 - PAD
anchor_x = img.width / 2; anchor_y = ybT(x0 + P / 2) - top_row
wall_scale = BASE_SCALE * HALF / P
print('wall fit: base slope', round(-mb, 4), 'roof slope', round(-mt, 4), '-> both', round(s, 4), '; piece', P, 'px from column', x0, ', join difference', round(best[0], 2))
wall_meta = meta(img)

# --- gate -----------------------------------------------------------------------------------------------------
g = load('town_gate'); gh, gw = g.shape[:2]
xs, top, bot = edges(g, 10, 395)
mg, cg = robust_line(xs, bot, 0.6)
c = -s - mg                                            # extra climb per pixel across
xg = 228.0                                             # the middle of the doors (measured once on the painting)
X, Y = np.meshgrid(np.arange(gw, dtype=np.float32), np.arange(gh + 2 * PAD, dtype=np.float32) - PAD)
gw2 = sample(g, X, Y - c * (X - xg))                   # pixel (x, y) comes from (x, y - c (x - xg)): climbs s now
L, R = 62, 352                                          # the gatehouse with its roof; the wall stubs are left to the wall
cutg = gw2[:, L:R]
al = cutg[:, :, 3] > 8; rows = np.nonzero(al.any(axis=1))[0]
cutg = cutg[rows.min() - 1:rows.max() + 2]
gimg = Image.fromarray(cutg.astype(np.uint8), 'RGBA'); gimg.save('art/buildings/castle_gate.png')
gate_anchor = [xg - L, (mg * xg + cg) - (rows.min() - 1 - PAD)]
print('gate fit: base slope', round(-mg, 4), 'sheared by', round(c, 4))
out = {'art': {'castle_wall': {'kind': 'buildings', 'scale': round(wall_scale, 5), 'artAnchor': [round(anchor_x, 2), round(anchor_y, 2)], 'solid': 0},
               'castle_gate': {'kind': 'buildings', 'artAnchor': [round(gate_anchor[0], 2), round(gate_anchor[1], 2)], 'solid': 0}},
       'cutouts': {'buildings/castle_wall': wall_meta, 'buildings/castle_gate': meta(gimg)}}
print(json.dumps(out))
