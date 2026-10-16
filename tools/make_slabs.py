# Cut white backgrounds from item images and build thin two-faced GLB slabs.
# Run: python tools/make_slabs.py assets/concepts/items assets/models/items katana.png rifle.png ...
# Needs Pillow, numpy and scipy (pip install pillow numpy scipy). Writes <name>.glb (and the cut <name>.png).
import sys, os, io, json, struct
import numpy as np
from PIL import Image
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
ROUND = {'folding_fan', 'shuriken', 'revolver'}   # keep as drawn, no straightening
HANDLE_RIGHT = {'katana', 'ninjato', 'jitte', 'tanto'}  # drawn hilt-first; mirror so the tip is at +X

def cutout(im):
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    white = (a.min(2) > 225) & (np.ptp(a, 2) < 25)
    lab, _ = ndimage.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # enclosed gaps (bow string, trigger guard, shuriken hole) are flat pure white
    pure = (a.min(2) > 242) & (np.ptp(a, 2) < 10)
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if i in border or sl is None: continue
        comp = lab[sl] == i
        if comp.sum() > 60 and pure[sl][comp].mean() > 0.9: bg[sl] |= comp
    # soften the edge: pixels next to the background fade with their whiteness
    near = ndimage.binary_dilation(bg, iterations=2) & ~bg
    alpha = np.where(bg, 0, 255).astype(np.float32)
    whit = (a.min(2) - 150) / 105.0
    alpha[near] = 255 * np.clip(1 - whit[near], 0.25, 1)
    rgba = np.dstack([a.astype(np.uint8), alpha.astype(np.uint8)])
    return Image.fromarray(rgba, 'RGBA')

def straighten(im):
    al = np.asarray(im)[:, :, 3] > 128
    ys, xs = np.nonzero(al)
    pts = np.stack([xs - xs.mean(), ys - ys.mean()])
    w, v = np.linalg.eigh(np.cov(pts))
    d = v[:, np.argmax(w)]
    if d[1] > 0: d = -d                 # point the long axis up-screen (tips are drawn top-right)
    ang = np.degrees(np.arctan2(-d[1], d[0]))  # screen angle of the tip
    return im.rotate(-ang, resample=Image.BICUBIC, expand=True)

def glb(img, name):
    w, h = img.size
    L = 1.0; H = h / w; t = 0.012     # length 1 along X, thickness as a slab
    pos, uv, idx = [], [], []
    for z, flip in ((t / 2, False), (-t / 2, True)):
        base = len(pos)
        for (x, y, u, vv) in ((-0.5, -H / 2, 0, 1), (0.5, -H / 2, 1, 1), (0.5, H / 2, 1, 0), (-0.5, H / 2, 0, 0)):
            pos.append((x * L, y, z)); uv.append((u, vv))
        idx += ([base, base + 1, base + 2, base, base + 2, base + 3] if not flip else [base, base + 2, base + 1, base, base + 3, base + 2])
    nrm = [(0, 0, 1)] * 4 + [(0, 0, -1)] * 4
    b = io.BytesIO(); img.save(b, 'PNG'); png = b.getvalue()
    P = np.array(pos, np.float32).tobytes(); N = np.array(nrm, np.float32).tobytes()
    U = np.array(uv, np.float32).tobytes(); I = np.array(idx, np.uint16).tobytes()
    pad = lambda x: x + b'\0' * (-len(x) % 4)
    parts = [pad(P), pad(N), pad(U), pad(I), pad(png)]
    views, off = [], 0
    for p, raw in zip(parts, [P, N, U, I, png]):
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(raw)}); off += len(p)
    pa = np.array(pos)
    gl = {
        'asset': {'version': '2.0', 'generator': 'infamy make_slabs'},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': name}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2}, 'indices': 3, 'material': 0}]}],
        'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.2, 'roughnessFactor': 0.6},
                       'alphaMode': 'MASK', 'alphaCutoff': 0.5}],
        'textures': [{'source': 0, 'sampler': 0}], 'samplers': [{'magFilter': 9729, 'minFilter': 9987}],
        'images': [{'bufferView': 4, 'mimeType': 'image/png'}],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': 8, 'type': 'VEC3', 'min': pa.min(0).tolist(), 'max': pa.max(0).tolist()},
            {'bufferView': 1, 'componentType': 5126, 'count': 8, 'type': 'VEC3'},
            {'bufferView': 2, 'componentType': 5126, 'count': 8, 'type': 'VEC2'},
            {'bufferView': 3, 'componentType': 5123, 'count': 12, 'type': 'SCALAR'}],
        'bufferViews': views, 'buffers': [{'byteLength': off}],
    }
    js = json.dumps(gl).encode(); js += b' ' * (-len(js) % 4)
    binb = b''.join(parts)
    return struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binb)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binb), 0x004E4942) + binb

os.makedirs(out, exist_ok=True)
for f in sys.argv[3:]:
    name = os.path.splitext(os.path.basename(f))[0]
    im = cutout(Image.open(os.path.join(src, f)))
    if name == 'shuriken':
        im = im.crop((0, 0, im.width // 2, im.height // 2))
    if name not in ROUND:
        im = straighten(im)
    if name in HANDLE_RIGHT:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 128 else 0).getbbox())
    im.thumbnail((1024, 1024))
    im.save(os.path.join(out, name + '.png'))
    open(os.path.join(out, name + '.glb'), 'wb').write(glb(im, name))
    print(name, im.size)
