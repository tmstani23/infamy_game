# Turns the split Tencent train pieces (OBJ + texture) into .glb files for the sprite exporter
# (MOUNTS in tools/export_sprites.mjs). Plain Python: numpy + Pillow, no Blender.
#   python tools/train_to_glb.py          (writes assets/models/mounts/train_*.glb)
# The pieces are turned so the front points to glTF -Z (what the exporter expects), keep their true size,
# and get a 1024 px colour map and normal map. Each file has two do-nothing clips, 'walk' and 'run'
# (1 s long), because the exporter needs a clip to render; the wheels are cut out and spun by the
# sprite page (MOUNTS wheels). Vertex normals are computed (the OBJ has none).
import numpy as np, json, struct, io, os, sys, zipfile
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SPLIT = f'{ROOT}/assets/models/source/train/split'
OUT = f'{ROOT}/assets/models/mounts'
GUARD_ZIP = f'{ROOT}/assets/models/source/train/guard_car_trainobj1.zip'
# name: (folder or zip, obj name or None, turn): turn maps OBJ (x,y,z) to the glb's
PIECES = {
    'train_engine':   (f'{SPLIT}/engine_tender', 'engine', lambda p: np.stack([-p[:, 0], p[:, 1], -p[:, 2]], 1)),   # chimney (+z) to -z
    'train_tender':   (f'{SPLIT}/engine_tender', 'tender', lambda p: np.stack([-p[:, 0], p[:, 1], -p[:, 2]], 1)),
    'train_carriage': (f'{SPLIT}/carriage_goods', 'carriage', lambda p: np.stack([p[:, 2], p[:, 1], -p[:, 0]], 1)),   # +x to -z
    'train_goods':    (f'{SPLIT}/carriage_goods', 'goods_wagon', lambda p: np.stack([p[:, 2], p[:, 1], -p[:, 0]], 1)),
    'train_guard':    (GUARD_ZIP, None, lambda p: np.stack([p[:, 2], p[:, 1], -p[:, 0]], 1)),
}

def load_obj(text):
    V, T, F = [], [], []
    for line in text.splitlines():
        if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '): T.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('f '):
            corners = [[int(i) - 1 for i in p.split('/')[:2]] for p in line.split()[1:]]
            for k in range(1, len(corners) - 1): F.append([corners[0], corners[k], corners[k + 1]])
    return np.array(V), np.array(T), np.array(F)

def tex_bytes(img, kind):
    img = img.convert('RGB').resize((1024, 1024), Image.LANCZOS)
    b = io.BytesIO()
    if kind == 'color': img.save(b, 'JPEG', quality=88)
    else: img.save(b, 'PNG')
    return b.getvalue()

def build(name, src, objname, turn, color_img, normal_img, mesh_name):
    if src.endswith('.zip'):
        z = zipfile.ZipFile(src)
        obj = next(n for n in z.namelist() if n.endswith('.obj'))
        V, T, F = load_obj(z.read(obj).decode())
    else:
        V, T, F = load_obj(open(f'{src}/{objname}.obj').read())
    V = turn(V)
    corner_v, corner_t = F[:, :, 0].reshape(-1), F[:, :, 1].reshape(-1)
    key = corner_v.astype(np.int64) * (len(T) + 1) + corner_t
    uniq, inv = np.unique(key, return_inverse=True)
    uv_v, uv_t = uniq // (len(T) + 1), uniq % (len(T) + 1)
    P = V[uv_v].astype(np.float32); UV = T[uv_t].astype(np.float32); UV[:, 1] = 1 - UV[:, 1]
    idx = inv.reshape(-1, 3).astype(np.uint32)
    # swap winding when the turn mirrors (it does not: all turns here are proper rotations)
    fn = np.cross(P[idx[:, 1]] - P[idx[:, 0]], P[idx[:, 2]] - P[idx[:, 0]])
    N = np.zeros_like(P)
    for k in range(3): np.add.at(N, idx[:, k], fn)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    N = N.astype(np.float32)
    bufs, views = [], []
    def add(data, target=None):
        pad = (-sum(len(b) for b in bufs)) % 4
        if pad: bufs.append(b'\0' * pad)
        views.append({'buffer': 0, 'byteOffset': sum(len(b) for b in bufs), 'byteLength': len(data), **({'target': target} if target else {})})
        bufs.append(data); return len(views) - 1
    vp, vn, vt, vi = add(P.tobytes(), 34962), add(N.tobytes(), 34962), add(UV.tobytes(), 34962), add(idx.tobytes(), 34963)
    ic, inrm = add(tex_bytes(color_img, 'color')), add(tex_bytes(normal_img, 'normal'))
    t = np.array([0, 1], np.float32).tobytes(); z3 = np.zeros((2, 3), np.float32).tobytes()
    vtime, vz = add(t), add(z3)
    acc = [
        {'bufferView': vp, 'componentType': 5126, 'count': len(P), 'type': 'VEC3', 'min': P.min(0).tolist(), 'max': P.max(0).tolist()},
        {'bufferView': vn, 'componentType': 5126, 'count': len(P), 'type': 'VEC3'},
        {'bufferView': vt, 'componentType': 5126, 'count': len(P), 'type': 'VEC2'},
        {'bufferView': vi, 'componentType': 5125, 'count': idx.size, 'type': 'SCALAR'},
        {'bufferView': vtime, 'componentType': 5126, 'count': 2, 'type': 'SCALAR', 'min': [0], 'max': [1]},
        {'bufferView': vz, 'componentType': 5126, 'count': 2, 'type': 'VEC3'},
    ]
    anims = [{'name': n, 'samplers': [{'input': 4, 'output': 5, 'interpolation': 'LINEAR'}],
              'channels': [{'sampler': 0, 'target': {'node': 1, 'path': 'translation'}}]} for n in ('walk', 'run')]
    j = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
         'nodes': [{'name': name + '_root', 'children': [1]}, {'name': mesh_name, 'mesh': 0}],
         'meshes': [{'name': mesh_name, 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2}, 'indices': 3, 'material': 0}]}],
         'materials': [{'name': 'train', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 0.9}, 'normalTexture': {'index': 1}}],
         'textures': [{'source': 0}, {'source': 1}],
         'images': [{'bufferView': ic, 'mimeType': 'image/jpeg'}, {'bufferView': inrm, 'mimeType': 'image/png'}],
         'accessors': acc, 'bufferViews': views, 'animations': anims}
    binb = b''.join(bufs); binb += b'\0' * ((-len(binb)) % 4)
    j['buffers'] = [{'byteLength': len(binb)}]
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
    glb = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(binb)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(binb), b'BIN\0') + binb
    return glb, P

if __name__ == '__main__':
    only = sys.argv[1:]
    os.makedirs(OUT, exist_ok=True)
    for name, (src, objname, turn) in PIECES.items():
        if only and name not in only: continue
        if src.endswith('.zip'):
            z = zipfile.ZipFile(src)
            col = Image.open(io.BytesIO(z.read('texture_pbr_20250901.png'))); nor = Image.open(io.BytesIO(z.read('texture_pbr_20250901_normal.png')))
        else:
            col = Image.open(f'{src}/texture_pbr_20250901.png'); nor = Image.open(f'{src}/texture_pbr_20250901_normal.png')
        glb, P = build(name, src, objname, turn, col, nor, name)
        open(f'{OUT}/{name}.glb', 'wb').write(glb)
        e = P.max(0) - P.min(0)
        print(f'{name}.glb {len(glb) / 1e6:.1f} MB  size x{e[0]:.3f} y{e[1]:.3f} z{e[2]:.3f}  min {P.min(0).round(3)}')
