// Builds 3D rooms (walls, floor, furniture) from the layout made by sim/interiors.js
// buildRoom3d(). Shapes are simple boxes and turned profiles painted with textures cut
// from the art sheets (tools/make_interior_textures.py), so every edge sits exactly on
// the grid and at the camera's one angle.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { solidMaterial, roomFloorMaterial, glowMaterial } from './shading.js';
import { loadTex } from './scenery.js';
import { CAM_QUAT, CAM_RIGHT, CAM_UP } from './iso.js';

const texCache = {};
async function texture(file, renderer) {
  if (!texCache[file]) texCache[file] = loadTex(`art/interior3d/${file}.png`).then(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  });
  return texCache[file];
}

// Every material named in interior_parts.json, loaded once
async function loadMaterials(parts, renderer) {
  const mats = {};
  await Promise.all(Object.entries(parts.materials).map(async ([name, m]) => {
    const map = await texture(m.file, renderer);
    // gain brightens a dark texture past its own colours (tint alone can only darken)
    mats[name] = (opts = {}) => solidMaterial({ map, tile: m.uv === 'mesh' ? null : m.tile, detail: m.detail, glow: m.glow, ...opts,
      tint: new THREE.Color(opts.tint || m.tint || '#ffffff').multiplyScalar(opts.gain ?? m.gain ?? 1) });
  }));
  return mats;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);

// A box from corner (x0, y0, z0) to (x1, y1, z1) in the parent's frame
function box(mat, x0, y0, z0, x1, y1, z1, geo = unitBox) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(x1 - x0, y1 - y0, z1 - z0);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
}

// ---------- walls ----------
// Each wall is built in its own frame: u along the wall, v up, w into the room.
// Wall frames: where (u, w) = (0, 0) sits and which way u and w point.
function wallFrame(side, X, Z) {
  const g = new THREE.Group();
  if (side === 'north') { /* u = +x, w = +z */ }
  if (side === 'west') { g.rotation.y = -Math.PI / 2; g.scale.z = -1; }       // u = +z, w = +x
  if (side === 'south') { g.position.z = Z; g.scale.z = -1; }                  // u = +x, w = -z
  if (side === 'east') { g.position.x = X; g.rotation.y = -Math.PI / 2; }      // u = +z, w = -x
  return g;
}

function buildWall(wall, parts, mats, X, Z, finish) {
  const W = parts.wall, g = wallFrame(wall.side, X, Z);
  const L = wall.length, t = W.thickness, H = wall.height, post = W.post;
  // timber frame: grain runs up the posts and along the beams
  const wood = mats.timber(), dark = mats.timber({ swap: true, tint: '#b89c80' }), beam = mats.timber({ swap: true });
  // the far walls reach over the corners so the frame closes up
  const u0 = wall.side === 'north' ? -t : 0, u1 = wall.side === 'north' || wall.side === 'south' ? L + t : L;
  const add = m => { g.add(m); return m; };

  if (wall.low) {
    // near walls: cut down so the room shows, with a wooden cap along the cut
    add(box(mats[finish || parts.bays[wall.bays[0]].fill]({ shadeLow: 0.9 }), wall.side === 'south' ? -t : 0, 0, -t, u1, H, 0));
    add(box(dark, wall.side === 'south' ? -t - 0.03 : -0.03, H, -t - 0.03, u1 + 0.03, H + 0.07, 0.03));
    for (let i = 0; i <= wall.bays.length; i++) add(box(wood, i * W.bay - post / 2, 0, -t, i * W.bay + post / 2, H + 0.04, 0.05));
    return g;
  }

  wall.bays.forEach((type, i) => {
    const bay = parts.bays[type], a = i * W.bay, b = a + W.bay;
    const fill = mats[finish || bay.fill || 'plaster']({ shadeLow: 0.85 });
    const panel = (v0, v1) => add(box(fill, a, v0, -t, b, v1, -0.03));
    if (bay.door) {
      panel(W.lintel, H);
      if (bay.slab) {
        // a heavy sliding cargo door: two plank leaves with cross battens
        const leaf = mats[bay.slab](), mid = a + W.bay / 2;
        add(box(leaf, a + post / 2, 0.06, -0.12, mid + 0.04, W.lintel, -0.07));
        add(box(leaf, mid - 0.04, 0.06, -0.09, b - post / 2, W.lintel, -0.04));
        for (const y of [0.45, 1.6]) add(box(beam, a + post / 2, y, -0.07, b - post / 2, y + 0.12, -0.0));
        add(box(mats.iron({ gain: 1.3 }), mid - 0.18, 1.0, -0.04, mid - 0.08, 1.12, 0.0));        // handle
        add(box(dark, a, 0, -t, b, 0.06, 0.02));
      } else if (bay.open) {
        // open doorway: night beyond, a short curtain hanging from the beam
        add(box(mats.wood({ tint: '#1a1c24', detail: 0 }), a, 0, -t - 0.4, b, W.lintel, -t - 0.38));
        if (bay.curtain) add(box(mats[bay.curtain](), a + post / 2, W.lintel - 0.9, -0.06, b - post / 2, W.lintel, -0.04));
      } else {
        // a pair of sliding paper doors, slightly overlapped
        const mid = a + W.bay / 2;
        add(box(mats[bay.pane]({ uvRect: [0, 0, 0.5, 1] }), a + post / 2, 0.06, -0.12, mid + 0.04, W.lintel, -0.09));
        add(box(mats[bay.pane]({ uvRect: [0.5, 0, 1, 1] }), mid - 0.04, 0.06, -0.08, b - post / 2, W.lintel, -0.05));
        add(box(dark, a, 0, -t, b, 0.06, 0.02));                        // sill track
      }
    } else if (bay.window) {
      const [w0, w1] = bay.window;
      panel(0, w0); panel(w1, H);
      add(box(mats[bay.pane]({ uvRect: bay.paneRect || [0, 0.5, 1, 1] }), a, w0, -t + 0.02, b, w1, -0.07));
      add(box(beam, a, w0 - 0.06, -t, b, w0, 0.04));                     // sill
      add(box(beam, a, w1, -t, b, w1 + 0.06, 0.02));                     // head
    } else {
      panel(0, H);
      if (bay.art) add(box(mats[bay.art](), a + post, 0.3, -0.028, b - post, W.lintel - 0.12, -0.018));
    }
  });
  // frame: posts at every bay edge, base board, the door-height beam and the top beam
  for (let i = 0; i <= wall.bays.length; i++) {
    if (i === 0 && wall.side === 'west') continue;          // the north wall already has the corner post
    add(box(wood, i * W.bay - post / 2, 0, -t, i * W.bay + post / 2, H, 0.06));
  }
  add(box(dark, u0, 0, -t, u1, 0.1, 0.03));
  add(box(beam, u0, W.lintel, -t, u1, W.lintel + 0.13, 0.05));
  add(box(beam, u0, H - 0.14, -t, u1, H, 0.05));
  return g;
}

// Inner walls: cut low like the front walls, with a wooden cap, posts at the bay edges
// and a low threshold in the open doorway bay.
function buildInnerWall(w, parts, mats, finish) {
  const W = parts.wall, g = new THREE.Group(), t = W.thickness / 2, H = W.low;
  const wood = mats.timber(), dark = mats.timber({ swap: true, tint: '#b89c80' });
  const fill = mats[finish || parts.bays[w.fill]?.fill || w.fill] || mats.plaster;
  // (u along the wall, v up, w across it) -> room cells
  const b = (m, u0, v0, w0, u1, v1, w1) => g.add(w.along === 'x'
    ? box(m, u0, v0, w.at + w0, u1, v1, w.at + w1)
    : box(m, w.at + w0, v0, u0, w.at + w1, v1, u1));
  const d0 = w.door * W.bay, d1 = d0 + W.bay, post = W.post;
  for (const [u0, u1] of [[0, d0], [d1, w.length]]) {
    if (u1 - u0 < 1e-6) continue;
    b(fill({ shadeLow: 0.9 }), u0, 0, -t, u1, H, t);
    b(dark, u0 - 0.03, H, -t - 0.03, u1 + 0.03, H + 0.07, t + 0.03);
  }
  for (let i = 0; i <= w.bays; i++) {
    const u = i * W.bay;
    if (u > d0 && u < d1) continue;
    b(wood, Math.max(0, u - post / 2), 0, -t - 0.02, Math.min(w.length, u + post / 2), H + 0.04, t + 0.02);
  }
  b(dark, d0, 0, -t, d1, 0.04, t);                                   // threshold
  return g;
}

// Full-height, finite blueprint walls. Each run owns its materials so it can
// ghost independently when it obscures the followed character.
function buildPartition(w, parts, mats, finish) {
  const W = parts.wall, t = W.thickness / 2, H = W.height;
  const walls = [], doors = [];
  const place = (g, material, a, y0, d0, b, y1, d1) => g.add(w.along === 'z'
    ? box(material, w.at + d0, y0, a, w.at + d1, y1, b)
    : box(material, a, y0, w.at + d0, b, y1, w.at + d1));
  const materials = () => ({
    fill: mats[finish || 'painted_plaster']({ shadeLow: 0.9, transparent: true }),
    wood: mats.timber({ transparent: true }),
    beam: mats.timber({ swap: true, transparent: true }),
  });
  for (const { span: [a, b] } of w.segments) {
    const g = new THREE.Group(), m = materials();
    place(g, m.fill, a, 0, -t, b, H, t);
    for (const u of [a, b]) place(g, m.wood, u - W.post / 2, 0, -t - 0.025, u + W.post / 2, H, t + 0.025);
    place(g, m.beam, a, H - 0.12, -t - 0.03, b, H, t + 0.03);
    walls.push({ group: g, materials: Object.values(m), along: w.along, at: w.at, a, b });
  }
  for (const door of w.doors) {
    const [a, b] = door.span, g = new THREE.Group(), m = materials();
    const pane = mats.shoji({ transparent: true });
    place(g, m.beam, a, W.lintel, -t, b, H, t);
    place(g, m.wood, a, 0, -t - 0.03, a + W.post, W.lintel, t + 0.03);
    place(g, m.wood, b - W.post, 0, -t - 0.03, b, W.lintel, t + 0.03);
    const leaf = new THREE.Group();
    place(leaf, pane, a + W.post, 0.06, -t / 2, b - W.post, W.lintel - 0.04, t / 2);
    g.add(leaf);
    doors.push({ group: g, leaf, id: door.id, materials: [...Object.values(m), pane], along: w.along, at: w.at, a, b });
  }
  return { walls, doors };
}

// ---------- props: each built centred on the origin, back toward -z, length along x ----------
const lathe = (pts, segs = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);

// small pieces shared by several props
function bottle(mats, s = 1, k = 0) {
  const m = new THREE.Mesh(lathe([[0.001, 0], [0.05, 0], [0.06, 0.1], [0.055, 0.17], [0.022, 0.22], [0.02, 0.28], [0.001, 0.28]], 12),
    k % 2 ? mats.ceramic({ gain: 1.4 }) : mats.wood({ tint: '#4a5a40', gain: 1.8, detail: 0.2 }));
  m.scale.setScalar(s);
  return m;
}
function cupStack(mats) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) g.add(new THREE.Mesh(lathe([[0.001, 0], [0.04, 0], [0.05, 0.05], [0.045, 0.05]], 10), mats.ceramic()).translateY(i * 0.045));
  return g;
}
function crate(mats, s) {
  // a plank box with darker edge battens, sitting on y = 0
  const g = new THREE.Group(), h = s / 2;
  g.add(box(mats.planks(), -h, 0, -h, h, s, h));
  const edge = mats.timber({ swap: true, tint: '#a88c70' });
  for (const y of [0, s - 0.06]) for (const z of [-h, h]) g.add(box(edge, -h - 0.01, y, z - 0.03, h + 0.01, y + 0.06, z + 0.03));
  for (const x of [-h, h]) for (const z of [-h, h]) g.add(box(mats.timber({ tint: '#a88c70' }), x - 0.03, 0, z - 0.03, x + 0.03, s, z + 0.03));
  return g;
}
function barrel(mats) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(lathe([[0.001, 0], [0.3, 0], [0.35, 0.2], [0.37, 0.45], [0.35, 0.7], [0.3, 0.9], [0.001, 0.9]], 20), mats.planks()));
  const iron = mats.iron({ gain: 1.3 });
  for (const [y, r] of [[0.12, 0.33], [0.45, 0.375], [0.78, 0.33]]) { const b = new THREE.Mesh(new THREE.TorusGeometry(r, 0.015, 5, 28), iron); b.rotation.x = Math.PI / 2; b.position.y = y; g.add(b); }
  return g;
}

const MODELS = {
  tea_table(mats, room, parts, withoutSeats = false) {
    const g = new THREE.Group(), wood = mats.wood_warm(), dark = mats.wood({ tint: '#4a3a2e' });
    g.add(box(wood, -0.7, 0.36, -0.45, 0.7, 0.42, 0.45, new RoundedBoxGeometry(1, 1, 1, 2, 0.04)));
    g.add(box(dark, -0.62, 0.29, -0.37, 0.62, 0.36, 0.37));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(dark, sx * 0.6 - 0.05, 0, sz * 0.35 - 0.05, sx * 0.6 + 0.05, 0.36, sz * 0.35 + 0.05));
    if (!withoutSeats) for (const sz of [-1, 1]) g.add(MODELS.zabuton(mats).translateZ(sz * 1.05));
    return g;
  },
  teahouse_tea_table(mats) {
    // The teahouse seats use approved cutout art instead of the two baked-in cushions.
    return MODELS.tea_table(mats, null, null, true);
  },
  zabuton(mats) {
    const g = new THREE.Group();
    g.add(box(mats.cushion(), -0.36, 0, -0.36, 0.36, 0.1, 0.36, new RoundedBoxGeometry(1, 1, 1, 3, 0.35)));
    return g;
  },
  tokonoma(mats, room, parts) {
    // a raised alcove against the wall with a hanging scroll
    const g = new THREE.Group(), wood = mats.timber(), beam = mats.timber({ swap: true }), warm = mats.wood_warm({ tint: '#8a6a50' });
    g.add(box(mats.plaster(), -1.95, 0.16, -0.5, 1.95, 2.05, -0.42));              // back panel inside the alcove
    g.add(box(warm, -1.95, 0, -0.5, 1.95, 0.16, 0.42));                              // raised floor
    g.add(box(beam, -1.95, 0.12, 0.38, 1.95, 0.18, 0.46));                           // front edge
    for (const s of [-1, 1]) {
      g.add(box(mats.plaster(), s * 2 - 0.05, 0, -0.5, s * 2 + 0.05, 2.2, 0.36));    // side walls
      g.add(box(wood, s * 2 - 0.07, 0, 0.34, s * 2 + 0.07, 2.2, 0.46));            // front posts
    }
    g.add(box(beam, -2, 1.98, 0.32, 2, 2.2, 0.46));                                  // lintel
    const backing = parts.props.tokonoma.backing;
    if (backing) {
      g.add(box(mats[backing](), -0.6, 0.25, -0.419, 0.6, 1.95, -0.4));
    } else {
      g.add(box(mats.scroll(), -0.3, 0.55, -0.42, 0.3, 1.85, -0.4));
      g.add(box(mats.wood({ tint: '#3a3028' }), -0.34, 1.83, -0.42, 0.34, 1.88, -0.38));
    }
    return g;
  },
  byobu(mats) {
    // six panels folded in a zigzag; each shows its part of the painted screen
    const g = new THREE.Group(), n = 6, w = 0.48, h = 1.55, ang = THREE.MathUtils.degToRad(28);
    const span = n * w * Math.cos(ang);
    let x = -span / 2, z = 0;
    for (let i = 0; i < n; i++) {
      const a = i % 2 ? -ang : ang;
      const dx = w * Math.cos(a), dz = -w * Math.sin(a);
      const p = box(mats.byobu({ uvRect: [i / n, 0, (i + 1) / n, 1], side: THREE.DoubleSide }), -w / 2, 0.04, -0.015, w / 2, 0.04 + h, 0.015);
      const holder = new THREE.Group();
      holder.position.set(x + dx / 2, 0, z + dz / 2);
      holder.rotation.y = a;
      holder.add(p);
      g.add(holder);
      x += dx; z += dz;
    }
    g.position.z = 0.1;
    return g;
  },
  teahouse_byobu(mats) { return MODELS.byobu(mats); },
  shoji_partition(mats) {
    const g = new THREE.Group(), upright = mats.timber(), beam = mats.timber({ swap: true });
    g.add(box(mats.painted_shoji({ side: THREE.DoubleSide }), -1.42, 0.35, -0.025, 1.42, 1.65, 0.025));
    for (const x of [-1.46, 1.46]) {
      g.add(box(upright, x - 0.04, 0, -0.05, x + 0.04, 1.75, 0.05));
      g.add(box(beam, x - 0.09, 0, -0.2, x + 0.09, 0.08, 0.2));
    }
    for (const y of [0.12, 1.67]) g.add(box(beam, -1.5, y, -0.05, 1.5, y + 0.08, 0.05));
    g.add(box(mats.painted_wood(), -1.42, 0.2, -0.035, 1.42, 0.35, 0.035));
    return g;
  },
  andon(mats) {
    const g = new THREE.Group(), wood = mats.wood({ tint: '#5a4a3c' }), s = 0.21;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(wood, sx * s - 0.025, 0, sz * s - 0.025, sx * s + 0.025, 1.0, sz * s + 0.025));
    g.add(box(mats.andon(), -s + 0.02, 0.32, -s + 0.02, s - 0.02, 0.9, s - 0.02));
    for (const y of [0.3, 0.9]) {
      g.add(box(wood, -s, y, -s - 0.02, s, y + 0.035, -s + 0.02)); g.add(box(wood, -s, y, s - 0.02, s, y + 0.035, s + 0.02));
      g.add(box(wood, -s - 0.02, y, -s, -s + 0.02, y + 0.035, s)); g.add(box(wood, s - 0.02, y, -s, s + 0.02, y + 0.035, s));
    }
    return g;
  },
  hibachi(mats) {
    const g = new THREE.Group(), iron = mats.iron({ side: THREE.DoubleSide });
    g.add(new THREE.Mesh(lathe([[0.16, 0], [0.18, 0.05], [0.24, 0.12], [0.3, 0.26], [0.31, 0.4], [0.27, 0.43], [0.26, 0.36]]), iron));
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.265, 24), mats.coals());
    coals.rotation.x = -Math.PI / 2; coals.position.y = 0.36;
    g.add(coals);
    return g;
  },
  red_lantern(mats, room, parts) {
    // hangs on a thin cord all the way up to the top of the walls
    const g = new THREE.Group(), cap = mats.wood({ tint: '#2e2622' });
    const body = new THREE.Mesh(lathe([[0.1, -0.27], [0.19, -0.2], [0.23, -0.05], [0.23, 0.05], [0.19, 0.2], [0.1, 0.27]]), mats.lantern({ uvRect: [0, 0, 3, 1] }));
    g.add(body);
    g.add(box(cap, -0.11, -0.31, -0.11, 0.11, -0.26, 0.11, new THREE.CylinderGeometry(0.5, 0.5, 1, 16)));
    g.add(box(cap, -0.11, 0.26, -0.11, 0.11, 0.31, 0.11, new THREE.CylinderGeometry(0.5, 0.5, 1, 16)));
    const top = parts.wall.height - (parts.props.red_lantern.light?.y ?? 1.75), cord = mats.wood({ tint: '#a08a70', gain: 2.4, detail: 0 });
    g.add(box(cord, -0.011, 0.31, -0.011, 0.011, top, 0.011));
    g.add(box(cord, -0.05, top - 0.05, -0.05, 0.05, top, 0.05));             // hook where the ceiling would be
    return g;
  },
  tea_set(mats) {
    // a lacquered tray with a teapot and cups, sized to read from the camera
    const g = new THREE.Group(), clay = mats.ceramic(), tray = mats.wood({ tint: '#8a3a2a', gain: 2.2 });
    g.add(box(tray, -0.36, 0, -0.24, 0.36, 0.04, 0.24));
    g.add(box(mats.wood({ tint: '#5a2418', gain: 2 }), -0.38, 0, -0.26, 0.38, 0.03, 0.26));
    const pot = new THREE.Mesh(lathe([[0.001, 0], [0.07, 0.01], [0.1, 0.06], [0.09, 0.12], [0.05, 0.15], [0.001, 0.16]], 16), clay);
    pot.position.set(-0.15, 0.04, 0);
    pot.scale.setScalar(1.45);
    g.add(pot);
    const spout = box(clay, -0.02, 0, -0.02, 0.02, 0.13, 0.02, new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
    spout.position.set(0.0, 0.17, 0); spout.rotation.z = -0.9;
    g.add(spout);
    for (const [x, z] of [[0.14, -0.12], [0.24, 0.06], [0.08, 0.13]]) {
      const c = new THREE.Mesh(lathe([[0.001, 0], [0.028, 0], [0.036, 0.06], [0.032, 0.06]], 12), clay);
      c.position.set(x, 0.04, z);
      c.scale.setScalar(1.4);
      g.add(c);
    }
    return g;
  },
  // ---------- gambling den ----------
  gambling_mat(mats) {
    // a raised mat with cards and coins, four cushions around it
    const g = new THREE.Group();
    g.add(box(mats.wood({ tint: '#8a7258', gain: 2.8 }), -1.22, 0, -1.22, 1.22, 0.05, 1.22));
    g.add(box(mats.gambling_mat(), -1.15, 0.05, -1.15, 1.15, 0.07, 1.15));
    const cup = mats.wood({ tint: '#5a2418', gain: 2 });
    g.add(box(cup, -0.12, 0.07, -0.1, 0.06, 0.23, 0.08, new THREE.CylinderGeometry(0.42, 0.5, 1, 14)));   // dice cup
    for (const [x, z] of [[0.18, 0.05], [0.26, -0.08]]) g.add(box(mats.ceramic({ gain: 1.5 }), x - 0.03, 0.07, z - 0.03, x + 0.03, 0.13, z + 0.03));
    for (const [x, z] of [[0, -1.6], [0, 1.6], [-1.6, 0], [1.6, 0]]) g.add(MODELS.zabuton(mats).translateX(x).translateZ(z));
    return g;
  },
  counter(mats) {
    // a long serving counter; the space behind it (toward the wall) is for whoever runs the place
    const g = new THREE.Group(), body = mats.wood({ tint: '#6c5040', gain: 2.8 }), top = mats.wood_warm({ tint: '#7a5238' });
    g.add(box(body, -1.85, 0, 0.15, 1.85, 0.95, 0.85));
    g.add(box(top, -1.95, 0.95, 0.08, 1.95, 1.03, 0.95, new RoundedBoxGeometry(1, 1, 1, 2, 0.02)));
    const beam = mats.timber({ swap: true }), wood = mats.timber();
    g.add(box(beam, -1.85, 0, 0.83, 1.85, 0.08, 0.88));                                   // kick board
    for (const x of [-1.85, -0.62, 0.62, 1.85]) g.add(box(wood, x - 0.05, 0, 0.83, x + 0.05, 0.95, 0.89));
    for (const [x, s] of [[-1.2, 1], [-0.9, 0.8], [1.3, 1.1]]) g.add(bottle(mats, s).translateX(x).translateY(1.03).translateZ(0.5));
    return g;
  },
  sake_shelf(mats) {
    const g = new THREE.Group(), wood = mats.timber(), beam = mats.timber({ swap: true }), back = mats.wood({ tint: '#4e3e32', gain: 1.8 });
    g.add(box(back, -0.9, 0, -0.5, 0.9, 1.9, -0.46));
    for (const x of [-0.9, 0, 0.9]) g.add(box(wood, x - 0.04, 0, -0.5, x + 0.04, 1.95, -0.06));
    for (const y of [0.08, 0.62, 1.16, 1.7]) g.add(box(beam, -0.9, y - 0.04, -0.5, 0.9, y, -0.06));
    g.add(box(beam, -0.95, 1.9, -0.52, 0.95, 1.96, -0.04));
    let k = 0;
    for (const y of [0.08, 0.62, 1.16]) for (let x = -0.78; x < 0.8; x += 0.26) {
      if (Math.abs(x) < 0.08) continue;
      g.add((k++ % 3 === 2 ? cupStack(mats) : bottle(mats, 0.8 + (k % 2) * 0.25, k)).translateX(x).translateY(y).translateZ(-0.28));
    }
    return g;
  },
  cash_box(mats) {
    // an iron-bound strongbox
    const g = new THREE.Group(), wood = mats.wood_warm({ tint: '#9a7050' }), iron = mats.iron({ gain: 1.8 });
    g.add(box(wood, -0.38, 0, -0.27, 0.38, 0.42, 0.27, new RoundedBoxGeometry(1, 1, 1, 2, 0.03)));
    for (const x of [-0.25, 0.25]) g.add(box(iron, x - 0.03, -0.005, -0.285, x + 0.03, 0.43, 0.285));
    g.add(box(iron, -0.39, 0.3, -0.28, 0.39, 0.34, 0.28));
    g.add(box(iron, -0.07, 0.16, 0.27, 0.07, 0.3, 0.3));                                      // lock plate
    return g;
  },
  sake_keg(mats) {
    // a straw-wrapped keg on a low stand
    const g = new THREE.Group(), wood = mats.timber(), beam = mats.timber({ swap: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(wood, sx * 0.3 - 0.04, 0, sz * 0.3 - 0.04, sx * 0.3 + 0.04, 0.32, sz * 0.3 + 0.04));
    for (const s of [-1, 1]) { g.add(box(beam, -0.36, 0.28, s * 0.3 - 0.04, 0.36, 0.34, s * 0.3 + 0.04)); g.add(box(beam, s * 0.3 - 0.04, 0.28, -0.36, s * 0.3 + 0.04, 0.34, 0.36)); }
    const keg = new THREE.Mesh(lathe([[0.001, 0], [0.3, 0], [0.34, 0.12], [0.35, 0.3], [0.34, 0.48], [0.3, 0.6], [0.001, 0.6]]), mats.straw());
    keg.position.y = 0.34; g.add(keg);
    const rope = mats.wood({ tint: '#a08a70', gain: 2.4, detail: 0 });
    for (const y of [0.12, 0.48]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.018, 6, 28), rope); r.rotation.x = Math.PI / 2; r.position.y = 0.34 + y; g.add(r); }
    g.add(box(mats.ceramic({ tint: '#e8e0cc', gain: 1.3 }), -0.13, 0.48, 0.3, 0.13, 0.8, 0.33));   // paper label
    return g;
  },
  tansu(mats) {
    // a chest of drawers with iron handles
    const g = new THREE.Group(), body = mats.wood_warm({ tint: '#a07050' }), front = mats.wood_warm({ tint: '#b88058' }), iron = mats.iron({ gain: 1.8 });
    g.add(box(body, -0.8, 0, -0.5, 0.8, 1.2, 0.08));
    const rows = [[0.06, 0.36, 2], [0.4, 0.7, 2], [0.74, 1.14, 1]];
    for (const [y0, y1, n] of rows) for (let i = 0; i < n; i++) {
      const x0 = -0.74 + i * 1.48 / n + 0.02, x1 = -0.74 + (i + 1) * 1.48 / n - 0.02;
      g.add(box(front, x0, y0, 0.08, x1, y1, 0.11));
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      g.add(box(iron, cx - 0.09, cy - 0.02, 0.11, cx + 0.09, cy + 0.02, 0.14));
    }
    for (const x of [-0.8, 0.7]) for (const y of [0, 1.1]) g.add(box(iron, x, y, 0.07, x + 0.1, y + 0.1, 0.12));      // corner plates
    return g;
  },

  // ---------- warehouse ----------
  rice_sacks(mats) {
    // straw rice bales stacked in a pyramid
    const g = new THREE.Group(), straw = mats.straw();
    const bale = (x, y, z) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.4, 4, 12), straw); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); g.add(m); };
    for (const x of [-0.42, 0.42]) {
      for (const z of [-0.5, 0, 0.5]) bale(x, 0.21, z);
      for (const z of [-0.25, 0.25]) bale(x, 0.58, z);
    }
    bale(0, 0.95, 0);
    return g;
  },
  warehouse_shelves(mats) {
    const g = new THREE.Group(), wood = mats.timber(), beam = mats.timber({ swap: true }), shelf = mats.planks();
    for (const x of [-1.9, -0.63, 0.63, 1.9]) for (const z of [-0.48, -0.08]) g.add(box(wood, x - 0.05, 0, z - 0.04, x + 0.05, 2.1, z + 0.04));
    for (const y of [0.1, 0.8, 1.5, 2.1]) g.add(box(shelf, -1.92, y - 0.05, -0.5, 1.92, y, -0.06));
    let k = 0;
    for (const y of [0.1, 0.8, 1.5]) for (const x of [-1.27, 0, 1.27]) {
      const t = (k++ * 7 + 3) % 4;
      if (t === 0) g.add(crate(mats, 0.5).translateX(x - 0.25).translateY(y).translateZ(-0.27)), g.add(crate(mats, 0.38).translateX(x + 0.3).translateY(y).translateZ(-0.27));
      else if (t === 1) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.6, 4, 10), mats.straw()); m.rotation.z = Math.PI / 2; m.position.set(x, y + 0.16, -0.27); g.add(m); }
      else if (t === 2) g.add(crate(mats, 0.55).translateX(x).translateY(y).translateZ(-0.27));
    }
    return g;
  },
  crates(mats) {
    const g = new THREE.Group();
    g.add(crate(mats, 0.8).translateX(-0.42).translateZ(-0.3));
    g.add(crate(mats, 0.75).translateX(0.45).translateZ(-0.25));
    g.add(crate(mats, 0.7).translateX(-0.1).translateZ(0.5));
    g.add(crate(mats, 0.65).translateX(-0.3).translateY(0.8).translateZ(-0.3));
    return g;
  },
  barrels(mats) {
    const g = new THREE.Group();
    for (const [x, z] of [[-0.4, -0.35], [0.42, -0.3], [0, 0.42]]) g.add(barrel(mats).translateX(x).translateZ(z));
    return g;
  },
  dynamite_crate(mats) {
    // an open crate of red sticks with their fuses; loud when it goes
    const g = new THREE.Group(), side = mats.planks(), edge = mats.timber({ swap: true });
    g.add(box(side, -0.38, 0, -0.27, 0.38, 0.06, 0.27));
    for (const s of [-1, 1]) { g.add(box(side, -0.38, 0, s * 0.27 - 0.03, 0.38, 0.36, s * 0.27 + 0.03)); g.add(box(side, s * 0.38 - 0.03, 0, -0.27, s * 0.38 + 0.03, 0.36, 0.27)); }
    for (const s of [-1, 1]) g.add(box(edge, -0.4, 0.33, s * 0.27 - 0.04, 0.4, 0.38, s * 0.27 + 0.04));
    const red = mats.wood({ tint: '#b8402c', gain: 2.6, detail: 0.2 }), fuse = mats.wood({ tint: '#a08a70', gain: 2.4, detail: 0 });
    for (let i = 0; i < 6; i++) {
      const z = -0.19 + i * 0.076, y = 0.3 + (i % 2) * 0.05;
      const st = box(red, -0.3, y - 0.035, z - 0.035, 0.3, y + 0.035, z + 0.035, new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
      st.rotation.z = Math.PI / 2; st.scale.set(0.07, 0.6, 0.07); g.add(st);
      g.add(box(fuse, 0.3, y - 0.008, z - 0.008, 0.42, y + 0.008, z + 0.008));
    }
    return g;
  },
};

// ---------- the whole room ----------
export async function buildRoom3d(room, parts, renderer) {
  const mats = await loadMaterials(parts, renderer);
  const layout = room.renderLayout || room;
  const scale = room.worldScale || 1;
  const [X, Z] = layout.size;
  const group = new THREE.Group();
  group.position.set(room.origin.x, 0, room.origin.z);
  group.scale.setScalar(scale);

  // floor, with soft shadows under the furniture
  const fl = parts.floors[room.template.floor] || parts.floors.tatami;
  const shadows = layout.props.filter(p => p.stands && p.def.rule !== 'ceiling' && p.def.floor_shadow !== false).map(p => {
    const [sx, sz] = p.def.solid ? ((p.rot / 90) % 2 ? [p.def.solid[1], p.def.solid[0]] : p.def.solid) : [0.6, 0.6];
    const ox = room.origin.x + p.cx * scale, oz = room.origin.z + p.cz * scale;
    return [ox - sx * scale / 2, oz - sz * scale / 2, ox + sx * scale / 2, oz + sz * scale / 2, p.def.rule === 'wall' ? 0.25 : 0.4];
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(X, Z),
    roomFloorMaterial(await texture(fl.file, renderer), { origin: room.origin, size: room.size, pattern: fl.pattern, tint: new THREE.Color(fl.tint || "#ffffff").multiplyScalar(fl.gain ?? 1), shadows }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(X / 2, 0, Z / 2);
  floor.renderOrder = 0;
  group.add(floor);

  // The inn's approved furniture painting is registered to one fixed camera
  // frame. Keep the room's real walls and door leaves as separate 3D meshes.
  const painting = room.template.scenePainting;
  const paintedLayers = [];
  if (painting) {
    for (const [file, half, order] of [
      [painting.floor, painting.floorCameraHalf, 0.5],
      [painting.props, painting.propsCameraHalf, 1.5],
    ]) {
      const map = await loadTex(file);
      map.minFilter = THREE.LinearMipmapLinearFilter;
      map.magFilter = THREE.LinearFilter;
      map.generateMipmaps = true;
      const height = half * 2;
      const width = height * painting.width / painting.height;
      const material = new THREE.MeshBasicMaterial({ map, transparent: order > 1,
        depthTest: false, depthWrite: false, toneMapped: false });
      if (order > 1 && painting.baseExcludeRegions?.length) {
        // Hide painted objects that belong behind a partition, even where that
        // partition is translucent. Foreground furniture is drawn below.
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = painting.width;
        maskCanvas.height = painting.height;
        const ctx = maskCanvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, painting.width, painting.height);
        ctx.fillStyle = '#000';
        for (const [x0, y0, x1, y1] of painting.baseExcludeRegions) {
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
        material.alphaMap = new THREE.CanvasTexture(maskCanvas);
      }
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
        material);
      mesh.quaternion.copy(CAM_QUAT);
      mesh.position.set(X / 2, 1.25, Z / 2);
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      group.add(mesh);
      paintedLayers.push(mesh);
      if (order > 1 && painting.aboveWallRegions?.length) {
        // A second pass shows only selected foreground furniture over the walls.
        // The original transparent painting remains in one piece behind them.
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = painting.width;
        maskCanvas.height = painting.height;
        const ctx = maskCanvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, painting.width, painting.height);
        ctx.fillStyle = '#fff';
        for (const region of painting.aboveWallRegions) {
          if (Array.isArray(region[0])) {
            ctx.beginPath();
            ctx.moveTo(...region[0]);
            for (const point of region.slice(1)) ctx.lineTo(...point);
            ctx.closePath();
            ctx.fill();
          } else {
            const [x0, y0, x1, y1] = region;
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          }
        }
        const mask = new THREE.CanvasTexture(maskCanvas);
        const foreground = new THREE.Mesh(mesh.geometry,
          new THREE.MeshBasicMaterial({ map, alphaMap: mask, transparent: true,
            depthTest: false, depthWrite: false, toneMapped: false }));
        foreground.quaternion.copy(CAM_QUAT);
        foreground.position.copy(mesh.position);
        foreground.renderOrder = 3;
        foreground.frustumCulled = false;
        group.add(foreground);
        paintedLayers.push(foreground);
      }
    }
  }

  // One wall surface per building type, including window/door surrounds and low walls.
  const finish = parts.roomFinishes?.[room.template.generated?.type || room.name];
  for (const wall of layout.walls) group.add(buildWall(wall, parts, mats, X, Z, finish));
  for (const w of layout.inner || []) group.add(buildInnerWall(w, parts, mats, finish));
  const partitionWalls = [], partitionDoors = [];
  for (const w of layout.partitions || []) {
    const built = buildPartition(w, parts, mats, finish);
    for (const item of built.walls) { group.add(item.group); partitionWalls.push(item); }
    for (const item of built.doors) { group.add(item.group); partitionDoors.push(item); }
  }

  const lights = [], glows = [];
  for (const p of layout.props) {
    const make = MODELS[p.type];
    if (make && !p.cutout && !painting) {
      const m = make(mats, room, parts);
      m.position.set(p.cx, p.y, p.cz);
      m.rotation.y = THREE.MathUtils.degToRad(p.rot);
      group.add(m);
    } else if (!p.cutout && !painting) console.warn(`No 3D model for "${p.type}"`);
    const L = p.def.light;
    if (L) {
      const pos = new THREE.Vector3(room.origin.x + p.cx, p.def.rule === 'ceiling' ? p.y : p.y + L.y, room.origin.z + p.cz);
      if (painting && p.lightPixel) {
        const frame = new THREE.Vector3(room.origin.x + X / 2, 1.25, room.origin.z + Z / 2);
        const pixelWorld = painting.propsCameraHalf * 2 / painting.height;
        const relative = pos.clone().sub(frame);
        const currentX = painting.width / 2 + relative.dot(CAM_RIGHT) / pixelWorld;
        const currentY = painting.height / 2 - relative.dot(CAM_UP) / pixelWorld;
        pos.addScaledVector(CAM_RIGHT, (p.lightPixel[0] - currentX) * pixelWorld);
        pos.addScaledVector(CAM_UP, (currentY - p.lightPixel[1]) * pixelWorld);
      }
      pos.sub(new THREE.Vector3(room.origin.x, 0, room.origin.z)).multiplyScalar(scale).add(new THREE.Vector3(room.origin.x, 0, room.origin.z));
      lights.push({ pos, radius: L.radius * scale, color: new THREE.Color(L.color), fire: !!L.fire, seed: Math.random() * 10 });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMaterial(new THREE.Color(L.color), Math.random() * 10, true));
      glow.quaternion.copy(CAM_QUAT);
      const s = Math.min(L.radius * 0.3, 1.8) * scale;
      glow.scale.set(s, s, 1);
      glow.position.copy(pos);
      glow.renderOrder = 99000;
      glow.frustumCulled = false;
      glows.push(glow);
    }
  }
  group.traverse(o => {
    if (!o.isMesh || o === floor || paintedLayers.includes(o)) return;
    o.renderOrder = 2;
    if (painting) {
      // The room painting sits behind these translucent 3D walls.
      o.material.transparent = true;
      o.material.depthWrite = false;
      if (o.material.uniforms?.uOpacity) o.material.uniforms.uOpacity.value = 0.8;
      o.material.needsUpdate = true;
    }
  });
  return { group, lights, glows, partitionWalls, partitionDoors };
}
