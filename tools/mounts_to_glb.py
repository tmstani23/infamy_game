# Converts a Blender rig scene to a .glb for the sprite exporter (MOUNTS in tools/export_sprites.mjs).
# Usage (pip bpy 5.2.3, Python 3.13): python mounts_to_glb.py -- in.blend out.glb ACTIONS|SCENE|NLA
#   ACTIONS = one armature, one clip per action (mare, calico, ox); SCENE = grouped scene, clips play together.
# Textures: unzip each Tencent *obj1.zip into TEX/<key>/ and add *_1k.png (1024 px) copies;
# keys: wh warhorse, tosa Tosa dog, bb black_beauty, calico, ox, om omnibus, sd saddle, oc ox cart, rk rickshaw, cn_field, cn_wooden, bt_riverboat, bt_coastalship, bt_warship.
import bpy, sys, os, re
args = sys.argv[sys.argv.index('--')+1:]
src, out, mode = args[0], args[1], args[2]
TEX = os.environ.get('TEX', os.path.expanduser('~/work/tex'))
bpy.ops.wm.open_mainfile(filepath=src)
# Muzzle flash and smoke are separate effects in the game (Tim 2026-11-06): leave them out
for o in [o for o in bpy.data.objects if re.search(r'_(flash|smoke\d*)$', o.name)]:
    bpy.data.objects.remove(o, do_unlink=True)
for img in bpy.data.images:
    if img.packed_file: continue
    m = re.search(r'/(bb|calico|ox|om|sd|oc|rk|cn_field|cn_wooden|bt_riverboat|bt_coastalship|bt_warship|wh|tosa)/(texture_pbr_20250901(_normal|_metallic|_roughness)?)\.png$', img.filepath.replace('\\','/'))
    if not m: print('  unmatched image', img.name, img.filepath); continue
    key, kind = m.group(1), m.group(3) or ''
    if kind in ('_metallic', '_roughness'): continue
    img.filepath = f'{TEX}/{key}/texture_pbr_20250901{kind}_1k.png'; img.reload()
    print('  image', img.name, '->', key + kind, img.has_data)
# Drop metallic/roughness maps: the sprite page only uses colour and normal
for mat in bpy.data.materials:
    if not mat.use_nodes: continue
    nt = mat.node_tree
    for l in list(nt.links):
        if l.to_node.type == 'BSDF_PRINCIPLED' and l.to_socket.name in ('Metallic', 'Roughness'):
            nt.links.remove(l)
kw = dict(filepath=out, export_format='GLB', export_animations=True, export_image_format='JPEG', export_jpeg_quality=88,
          export_yup=True, export_apply=False, export_skins=True, export_force_sampling=True)
if mode == 'NLA':   # one clip per NLA track (the boats)
    kw.update(export_animation_mode='NLA_TRACKS')
elif mode == 'ACTIONS':
    kw.update(export_animation_mode='ACTIONS')
else:
    kw.update(export_animation_mode='SCENE', export_frame_range=True)
bpy.ops.export_scene.gltf(**kw)
print('WROTE', out, os.path.getsize(out))
