"""Cut the painted environment sheets into one transparent PNG per building,
prop and ground tile, for the game in game/.

    python tools/cut_environment.py

Reads assets/environment/*.png and writes game/art/{buildings,props,ground}/
plus game/art/cutouts.json (size and ground anchor of each cutout).
To swap art: replace a sheet (same grid) and rerun, or drop a new PNG into
game/art/... with the same name. Needs Pillow, numpy and scipy.
"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = os.path.join(ROOT, 'assets', 'environment')
OUT = os.path.join(ROOT, 'game', 'art')

# sheet -> (kind, columns, rows, names left to right, top to bottom; None = skip[, background])
# background: 'white' (default for sheets without transparency) or 'checker' (a painted-in checkerboard)
SHEETS = {
    'buildings1.png': ('buildings', 3, 3, [
        'teahouse', 'gambling_den', 'warehouse',
        'townhouse', 'shop', 'shrine',
        'sake_brewery', 'abandoned_house', 'western_office']),
    'buildings2.png': ('buildings', 3, 3, [
        'watch_post', 'dock_warehouse', 'manor',
        'inn', 'blacksmith', 'bathhouse',
        'forest_hut', 'bandit_camp', 'bridge']),
    'buildings4.png': ('buildings', 3, 3, [
        'clinic', 'pawnshop', 'rice_storehouse',
        'izakaya', 'fish_market', 'geisha_house',
        'customs_house', 'boatbuilder', 'tenements']),
    'props1_cut.png': ('props', 4, 4, [
        'lantern_post', 'stone_lantern', 'barrels', 'sake_barrels',
        'crates', 'handcart', 'rickshaw', 'well',
        'market_stall', 'notice_board', 'cherry_tree', 'pine_tree',
        'dead_tree', 'bush', 'bamboo', 'gas_lamp']),
    'props2.png': ('props', 4, 4, [
        'iron_chest', 'weapon_rack', 'dynamite_crate', 'spike_barricade',
        'clan_banner', 'brazier', 'campfire', 'firewood',
        'haystack', 'rowboat', 'rope_bollard', 'bamboo_fence',
        'stone_wall', 'boulder', 'rotten_log', 'dice_table']),
    # Interior pieces. Every wall runs from lower left to upper right; the game mirrors them for the other direction.
    'interiors1.jpg': ('interior', 4, 4, [
        'wall_plain', 'wall_shoji_door', 'wall_doorway', 'wall_window',
        'wall_corner', 'wall_planks', 'wall_cargo_door', 'wall_den',
        'shoji_partition', 'pillar', 'stairs', 'floor_step',
        'tokonoma', 'wall_low_plaster', 'wall_low_planks', 'counter']),
    # This one came out with a fake checkerboard painted in instead of transparency
    'interiors2.jpg': ('interior', 4, 4, [
        'tea_table', 'tea_set', 'futon', 'irori',
        'hibachi', 'andon', 'red_lantern', 'gambling_mat',
        'cash_box', 'tansu', 'byobu', 'sake_shelf',
        'warehouse_shelves', 'rice_sacks', 'vase', 'sake_keg'], 'checker'),
}
# Ground tiles: sheet -> {name: (col, row)} on a 4x4 grid
# Buildings already cut one by one (sheets that are not an even grid, such as buildings5.png):
# 'kind/name' -> transparent PNG under assets/environment/, run through cut() for the anchor
SINGLES = {
    'buildings/police_box': 'buildings/town/police_box.png',
    'buildings/police_hq': 'buildings/town/police_hq.png',
    'buildings/kabuki_theatre': 'buildings/town/kabuki_theatre.png',
    'buildings/temple': 'buildings/town/temple.png',
    'buildings/rickshaw_station': 'buildings/town/rickshaw_station.png',
    'buildings/food_stalls': 'buildings/town/food_stalls.png',
    'buildings/moneylender_house': 'buildings/town/moneylender_house.png',
    'buildings/lighthouse': 'buildings/waterfront/lighthouse.png',
    'buildings/telegraph_office': 'buildings/town/telegraph_office.png',
    # the Shinobi village (ninja build phase 2)
    'buildings/village_gate': 'ninja_village/village_gate.png',
    'buildings/dojo': 'ninja_village/dojo.png',
    'buildings/longhouse': 'ninja_village/longhouse.png',
    'buildings/ninja_shrine': 'ninja_village/shrine.png',
    'buildings/storehouse': 'ninja_village/storehouse.png',
    'buildings/thatched_hut': 'ninja_village/thatched_hut.png',
    'buildings/training_yard': 'ninja_village/training_yard.png',
    'buildings/watchtower': 'ninja_village/watchtower.png',
    'buildings/rope_bridge': 'ninja_village/rope_bridge.png',
}

GROUND = {
    'textures2.png': {'grass': (0, 0), 'mud': (0, 1), 'gravel': (2, 1), 'stone_steps': (3, 1),
                      'planks': (0, 2), 'pond': (1, 2), 'water': (2, 2), 'sand': (3, 2),
                      'paving': (2, 3), 'dry_grass': (3, 3)},
    'textures1.png': {'cobbles': (0, 1), 'dirt': (1, 1), 'tatami': (1, 2), 'floorboards': (0, 3)},
}


def enclosed_background(rgb, m):
    """Leftover sheet background trapped inside an object (between branches, under eaves, between posts).
    Only flat, near-pure white patches count, so plaster walls, paper screens and dark shadows stay."""
    lo, hi = rgb.min(-1), rgb.max(-1)
    sat = hi - lo
    cand = m & (lo > 228) & (sat < 16)
    lab, n = ndi.label(cand)
    idx = range(1, n + 1)
    size = ndi.sum(cand, lab, idx)
    spread = ndi.standard_deviation(lo, lab, idx)
    found = np.isin(lab, [i + 1 for i in range(n) if size[i] >= 3 and spread[i] < 12]) if n else cand
    # then peel pale, grey specks off every edge that now touches the background (halos, slivers between leaves)
    pale = m & (lo > 200) & (sat < 26)
    for _ in range(3):
        found |= ndi.binary_dilation(found | ~m) & pale
    return found


def object_mask(cell, has_alpha, bg='white'):
    rgb = cell[..., :3].astype(np.int16)
    if has_alpha:
        m = cell[..., 3] > 40
        return m & ~enclosed_background(rgb, m)
    grey = (rgb.max(-1) - rgb.min(-1)) < (16 if bg == 'checker' else 24)
    white = grey & (rgb.min(-1) > (168 if bg == 'checker' else 212))
    lab, n = ndi.label(white)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    outside = np.isin(lab, edge[edge > 0])
    if bg != 'checker':
        m = ndi.binary_fill_holes(~outside)
        return m & ~enclosed_background(rgb, m)
    # enclosed gaps (between legs, inside frames) are background too when they hold
    # both checker colours, light grey and white
    lo = rgb.min(-1)
    for i in range(1, n + 1):
        part = lab == i
        if outside[part].any() or part.sum() < 30:
            continue
        v = lo[part]
        if (v < 200).mean() > 0.15 and (v > 235).mean() > 0.15:
            outside |= part
    # a glow painted over the checkerboard: grow the background into pale, washed-out pixels
    pale = (lo > 140) & ((rgb.max(-1) - lo) < 45)
    for _ in range(40):
        grown = ndi.binary_dilation(outside) & pale
        if (grown & ~outside).sum() == 0:
            break
        outside |= grown
    return ~outside


def cut(cell, has_alpha, bg='white'):
    m = object_mask(cell, has_alpha, bg)
    lab, n = ndi.label(ndi.binary_dilation(m, iterations=3))
    if n == 0:
        return None
    sizes = ndi.sum(m, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > max(400, sizes.max() * 0.01)])
    m &= keep
    rgba = cell.astype(np.float32).copy()
    if has_alpha:
        rgba[..., 3] *= m
    elif bg == 'checker':
        rgba[..., 3] = ndi.binary_erosion(m, iterations=1) * 255.0
    else:
        # soft edge: un-blend the white background out of a thin rim
        rim = m & ~ndi.binary_erosion(m, iterations=2)
        lum = rgba[..., :3].mean(-1)
        a = np.where(rim, np.clip((255 - lum) / 70, 0, 1), m.astype(np.float32))
        safe = np.maximum(a, 1e-3)[..., None]
        rgba[..., :3] = np.where(rim[..., None], np.clip((rgba[..., :3] - (1 - a[..., None]) * 255) / safe, 0, 255), rgba[..., :3])
        rgba[..., 3] = a * 255
    ys, xs = np.nonzero(rgba[..., 3] > 30)
    y0, y1, x0, x1 = max(ys.min() - 2, 0), ys.max() + 3, max(xs.min() - 2, 0), xs.max() + 3
    img = rgba[y0:y1, x0:x1].round().astype(np.uint8)
    # copy edge colours into the transparent area so filtering leaves no white or black fringe
    clear = img[..., 3] < 128
    if clear.any() and (~clear).any():
        _, (iy, ix) = ndi.distance_transform_edt(clear, return_indices=True)
        img[..., :3] = img[iy, ix, :3]
    a = img[..., 3] > 128
    ys, xs = np.nonzero(a)
    bottom = ys.max()
    # ground anchor: leftmost/rightmost opaque columns and the lowest point
    info = {'w': int(img.shape[1]), 'h': int(img.shape[0]),
            'left': int(xs.min()), 'right': int(xs.max()),
            'bottomX': int(round(xs[ys >= bottom - 2].mean())), 'bottomY': int(bottom),
            'glows': glows(img)}
    return img, info


def glows(img):
    """Warm, bright painted lights (lanterns, lit windows, fires): [x, y, area], largest first."""
    f = img.astype(np.float32) / 255
    r, g, b, a = f[..., 0], f[..., 1], f[..., 2], f[..., 3]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    hot = (a > 0.8) & (lum > 0.5) & (r - b > 0.22) & (r > 0.7)
    lab, n = ndi.label(ndi.binary_closing(hot, iterations=2))
    out = []
    for i, s in enumerate(ndi.find_objects(lab)):
        area = int((lab[s] == i + 1).sum())
        if area >= 25:
            cy, cx = ndi.center_of_mass(lab == i + 1)
            out.append([int(cx), int(cy), area])
    return sorted(out, key=lambda g: -g[2])[:8]


# Every wall piece is reshaped to the same length, height and slope so pieces join cleanly.
WALL_W, WALL_H = 145, 112            # art pixels along the wall, and wall height in pixels
WALL_SLOPE = 0.4472136              # screen slope of a ground edge: sin(atan(0.5))

def square_wall(img):
    """Resample a painted wall (lowest end at the left) so its base and top are exact straight lines."""
    a = img[..., 3] > 128
    cols = np.nonzero(a.any(0))[0]
    if len(cols) < 10:
        return img, None
    flip = False
    def edges(m):
        c = np.nonzero(m.any(0))[0]
        return c, np.array([np.nonzero(m[:, x])[0].max() for x in c]), np.array([np.nonzero(m[:, x])[0].min() for x in c])
    c, bot, top = edges(a)
    if bot[: len(c) // 5].mean() < bot[-len(c) // 5:].mean():   # lowest end on the right: mirror it
        img, a, flip = img[:, ::-1], a[:, ::-1], True
        c, bot, top = edges(a)
    mid = slice(len(c) // 10, len(c) - len(c) // 10)            # skip the end posts when fitting
    fb, ft = np.polyfit(c[mid], bot[mid], 1), np.polyfit(c[mid], top[mid], 1)
    c0, c1 = c[0], c[-1]
    H = int(np.ceil(WALL_H + WALL_SLOPE * (WALL_W - 1))) + 4
    ox = np.arange(WALL_W)
    sx = c0 + ox * (c1 - c0) / (WALL_W - 1)
    bt = H - 2 - WALL_SLOPE * ox                                # target base line
    oy = np.arange(H)[:, None]
    src_top, src_bot = np.polyval(ft, sx), np.polyval(fb, sx)
    sy = src_top + (oy - (bt - WALL_H)) * (src_bot - src_top) / WALL_H
    sxx = np.broadcast_to(sx, sy.shape)
    out = np.stack([ndi.map_coordinates(img[..., ch].astype(np.float32), [sy, sxx], order=1, mode='nearest') for ch in range(4)], -1)
    inside = (sy >= -0.5) & (sy <= img.shape[0] - 0.5)
    out[..., 3] *= inside
    out = out.round().clip(0, 255).astype(np.uint8)
    info = {'w': WALL_W, 'h': H, 'left': 0, 'right': WALL_W - 1, 'bottomX': 0, 'bottomY': int(round(bt[0])), 'glows': []}
    return out, info


# Foliage where the sheet background shows through as specks between leaves: every pale grey pixel goes.
SPECKLY = {'bamboo', 'pine_tree', 'dead_tree'}

def clear_specks(img):
    rgb = img[..., :3].astype(np.int16)
    lo = rgb.min(-1)
    img[..., 3][(lo > 190) & ((rgb.max(-1) - lo) < 30)] = 0
    return img


# Flat floor pieces (rugs, mats) are warped so their four corners sit on an exact floor diamond.
FLAT = {'gambling_mat'}

def square_flat(img):
    a = img[..., 3] > 128
    ys, xs = np.nonzero(a)
    pick = lambda i: (float(xs[i]), float(ys[i]))
    src = [pick(xs.argmin()), pick(ys.argmin()), pick(xs.argmax()), pick(ys.argmax())]   # left, top, right, bottom
    w = src[2][0] - src[0][0]
    h = w * WALL_SLOPE
    W, H = int(np.ceil(w)) + 5, int(np.ceil(h)) + 5
    dst = [(2, 2 + h / 2), (2 + w / 2, 2), (2 + w, 2 + h / 2), (2 + w / 2, 2 + h)]
    # perspective transform from output pixels back to the source
    A, b = [], []
    for (X, Y), (x, y) in zip(dst, src):
        A += [[X, Y, 1, 0, 0, 0, -x * X, -x * Y], [0, 0, 0, X, Y, 1, -y * X, -y * Y]]
        b += [x, y]
    coef = np.linalg.solve(np.array(A), np.array(b))
    out = np.asarray(Image.fromarray(img).transform((W, H), Image.PERSPECTIVE, tuple(coef), Image.BICUBIC))
    a = out[..., 3] > 128
    ys, xs = np.nonzero(a)
    info = {'w': W, 'h': H, 'left': int(xs.min()), 'right': int(xs.max()),
            'bottomX': int(round(2 + w / 2)), 'bottomY': int(round(2 + h)), 'glows': glows(out)}
    return out, info


# Tables: the painted top's corners [left, back, right, front] in the cut image, warped onto the floor grid.
# The top becomes an exact rectangle on the grid, keeping its two side lengths.
TOPS = {
    'tea_table': [(44, 43), (127, 3), (209, 40), (130, 82)],
    'dice_table': [(18, 61), (168, 6), (326, 82), (176, 137)],
}

def homography(src, dst):
    """3x3 matrix taking each src point to its dst point."""
    A, b = [], []
    for (x, y), (X, Y) in zip(src, dst):
        A += [[x, y, 1, 0, 0, 0, -X * x, -X * y], [0, 0, 0, x, y, 1, -Y * x, -Y * y]]
        b += [X, Y]
    return np.append(np.linalg.solve(np.array(A, float), np.array(b, float)), 1).reshape(3, 3)

def square_top(img, corners):
    L, B, R, F = [np.array(c, float) for c in corners]
    a = ((F - L)[0] + (R - B)[0]) / 2            # screen width of the front-left side
    b = ((R - F)[0] + (B - L)[0]) / 2            # and of the front-right side
    s = WALL_SLOPE
    l = np.array([0, 0.0]); f = l + (a, a * s); r = f + (b, -b * s); bk = l + (b, -b * s)
    dst = np.array([l, bk, r, f])
    dst += np.mean([L, B, R, F], 0) - dst.mean(0)
    M = homography([L, B, R, F], dst)
    h, w = img.shape[:2]
    box = np.array([[0, 0, 1], [w, 0, 1], [0, h, 1], [w, h, 1]], float) @ M.T
    box = box[:, :2] / box[:, 2:]
    off = box.min(0) - 2
    W, H = (np.ceil(box.max(0) - off) + 2).astype(int)
    T = np.array([[1, 0, -off[0]], [0, 1, -off[1]], [0, 0, 1]]) @ M
    inv = np.linalg.inv(T); inv /= inv[2, 2]
    out = np.asarray(Image.fromarray(img).transform((int(W), int(H)), Image.PERSPECTIVE, tuple(inv.flatten()[:8]), Image.BICUBIC)).copy()
    a_ = out[..., 3] > 128
    ys, xs = np.nonzero(a_)
    y0, y1, x0, x1 = max(ys.min() - 2, 0), ys.max() + 3, max(xs.min() - 2, 0), xs.max() + 3
    out = out[y0:y1, x0:x1]
    a_ = out[..., 3] > 128
    ys, xs = np.nonzero(a_)
    bottom = ys.max()
    info = {'w': int(out.shape[1]), 'h': int(out.shape[0]), 'left': int(xs.min()), 'right': int(xs.max()),
            'bottomX': int(round(xs[ys >= bottom - 2].mean())), 'bottomY': int(bottom), 'glows': glows(out)}
    return out, info


def cut_singles(meta):
    for key, src in SINGLES.items():
        a = np.asarray(Image.open(os.path.join(ENV, src)).convert('RGBA'))
        res = cut(a, True)
        if res is None:
            continue
        img, info = res
        kind, name = key.split('/')
        os.makedirs(os.path.join(OUT, kind), exist_ok=True)
        Image.fromarray(img).save(os.path.join(OUT, kind, name + '.png'), optimize=True)
        meta[key] = info


def main():
    meta = {}
    for sheet, (kind, cols, rows, names, *bg) in SHEETS.items():
        bg = bg[0] if bg else 'white'
        path = os.path.join(ENV, sheet)
        if not os.path.exists(path):
            print('missing', sheet)
            continue
        im = Image.open(path)
        has_alpha = im.mode == 'RGBA' and (np.asarray(im)[..., 3] < 10).mean() > 0.2
        a = np.asarray(im.convert('RGBA'))
        H, W = a.shape[:2]
        os.makedirs(os.path.join(OUT, kind), exist_ok=True)
        for i, name in enumerate(names):
            if not name:
                continue
            c, r = i % cols, i // cols
            x0, x1 = round(c * W / cols) + 4, round((c + 1) * W / cols) - 4
            y0, y1 = round(r * H / rows) + 4, round((r + 1) * H / rows) - 4
            res = cut(a[y0:y1, x0:x1], has_alpha, bg)
            if res is None:
                continue
            img, info = res
            if kind == 'interior' and name.startswith('wall_') and name != 'wall_corner':
                img, info = square_wall(img)
            if name in SPECKLY:
                img = clear_specks(img)
            if name in FLAT:
                img, info = square_flat(img)
            if name in TOPS:
                img, info = square_top(img, TOPS[name])
            Image.fromarray(img).save(os.path.join(OUT, kind, name + '.png'), optimize=True)
            meta[f'{kind}/{name}'] = info
    cut_singles(meta)
    os.makedirs(os.path.join(OUT, 'ground'), exist_ok=True)
    for sheet, tiles in GROUND.items():
        a = Image.open(os.path.join(ENV, sheet)).convert('RGB')
        W, H = a.size
        for name, (c, r) in tiles.items():
            box = (round(c * W / 4) + 8, round(r * H / 4) + 8, round((c + 1) * W / 4) - 8, round((r + 1) * H / 4) - 8)
            a.crop(box).save(os.path.join(OUT, 'ground', name + '.jpg'), quality=90)
    with open(os.path.join(OUT, 'cutouts.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print(f'{len(meta)} cutouts written to {OUT}')


if __name__ == '__main__':
    main()
