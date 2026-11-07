// Railway track on the island (train plan step 2): a ribbon along each of your links, drawn from its first
// station up to how far the rail gang has got (link.built), with a plank deck under the rails where the line
// crosses water. Painted seamless strips (Tim 2026-11-07): art/ground/rail_track.png and rail_bridge.png,
// copied from assets/concepts/mounts_vehicles/*_tile.png at half size, rails along the image. Reads the frontier view only (state.frontier.rail.links); never changes the sim.
// Trains (step 3) are simple code-built boxes until the Tencent train models are exported: a black engine
// with a smokestack and coal tender, then brown carriages, each car turned along the track. Their position
// is predicted between the 4 Hz frontier views from the train's speed, so they glide instead of jumping.
// createRailTrack({ scene }) -> { update(frontierView, show, dt), dispose() }
import * as THREE from 'three';
import { spriteMaterial } from './shading.js';
import { pointAt } from '../sim/frontier/rail_route.js';

// world units. The strips are scaled so the rails sit GAUGE apart (153 of the image's 362 px); both strips share
// the scale so the rails line up where track meets bridge. One image = TILE units along the track.
const IMG_W = 362, IMG_H = 1026, RAILS_PX = 153, GAUGE = 1.4;
const TRACK_W = IMG_W / RAILS_PX * GAUGE, BRIDGE_W = TRACK_W, TILE = TRACK_W * IMG_H / IMG_W, STEP = 2;

function stripTexture(url) {
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// a flat strip `width` wide along `line` between distances d0 and d1, uv.y in tiles of TILE units
function ribbon(line, d0, d1, width, y) {
  const n = Math.max(1, Math.ceil((d1 - d0) / STEP)), pos = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), idx = [];
  for (let i = 0; i <= n; i++) {
    const d = Math.min(d1, d0 + i * STEP), p = pointAt(line, d), nx = Math.cos(p.heading) * width / 2, nz = -Math.sin(p.heading) * width / 2;
    pos.set([p.x - nx, y, p.z - nz, p.x + nx, y, p.z + nz], i * 6);
    uv.set([0, d / TILE, 1, d / TILE], i * 4);
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return { geo, n };
}

function groundMaterial(tex) {
  const m = spriteMaterial(tex);
  m.fragmentShader = m.fragmentShader.replace('grade(t.rgb, vWorld, true, uSelfLight)', 'grade(t.rgb, vWorld, false, uSelfLight)');
  m.depthWrite = false; m.transparent = true; m.side = THREE.DoubleSide;
  return m;
}

// a box lit by face direction (the scene has no lights): tops bright, sides darker
function shadedBox(w, h, l, hex) {
  const geo = new THREE.BoxGeometry(w, h, l), n = geo.attributes.normal, col = new Float32Array(n.count * 3), c = new THREE.Color(hex);
  for (let i = 0; i < n.count; i++) { const k = n.getY(i) > 0.5 ? 1.15 : n.getY(i) < -0.5 ? 0.4 : n.getX(i) + n.getZ(i) > 0 ? 0.85 : 0.6; col.set([c.r * k, c.g * k, c.b * k], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.translate(0, h / 2, 0);
  return geo;
}
let CARS = null;
function carGeometries() {
  if (CARS) return CARS;
  const engine = shadedBox(2.2, 2.2, 5.2, 0x24242a), stack = shadedBox(0.7, 1.6, 0.7, 0x1a1a1e), dome = shadedBox(0.8, 0.6, 0.8, 0xb08a3a), cab = shadedBox(2.3, 1.2, 1.6, 0x2e2e34), buffer = shadedBox(2.4, 0.5, 0.3, 0x8a2a20);
  stack.translate(0, 2.2, 1.8); dome.translate(0, 2.2, 0.2); cab.translate(0, 2.2, -1.8); buffer.translate(0, 0.4, 2.65);
  const merge = parts => { const g = new THREE.BufferGeometry(), pos = [], col = [], idx = []; let base = 0;
    for (const p of parts) { const q = p.toNonIndexed(); pos.push(...q.attributes.position.array); col.push(...q.attributes.color.array); for (let i = 0; i < q.attributes.position.count; i++) idx.push(base + i); base += q.attributes.position.count; }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g; };
  CARS = { engine: merge([engine, stack, dome, cab, buffer]), tender: shadedBox(2.2, 1.6, 3.2, 0x2a2622), carriage: shadedBox(2.4, 2.4, 6, 0x6b4630), wagon: shadedBox(2.4, 1.2, 5, 0x5a4a3a) };
  return CARS;
}
const carMaterial = () => new THREE.MeshBasicMaterial({ vertexColors: true });

export function createRailTrack({ scene }) {
  let track = null, bridge = null;
  const shown = new Map();   // link id -> { key, meshes: [{ mesh, d0, n }] }
  const mats = () => { track ||= groundMaterial(stripTexture('art/ground/rail_track.png')); bridge ||= groundMaterial(stripTexture('art/ground/rail_bridge.png')); };
  function build(l) {
    mats();
    const parts = [];
    // ballast track everywhere except over the bridges (spans widened a little onto the banks)
    const spans = (l.bridges || []).map(([b0, b1]) => [Math.max(0, b0 - 3), Math.min(l.length, b1 + 3)]).sort((a, b) => a[0] - b[0]);
    let from = 0;
    for (const [a, b] of [...spans, [l.length, l.length]]) {
      if (a - from > 0.5) { const t = ribbon(l, from, a, TRACK_W, 0.03), tm = new THREE.Mesh(t.geo, track); tm.renderOrder = -0.4; tm.frustumCulled = false; parts.push({ mesh: tm, d0: from, n: t.n }); }
      from = Math.max(from, b);
    }
    for (const [a, b] of spans) {
      const r = ribbon(l, a, b, BRIDGE_W, 0.032), m = new THREE.Mesh(r.geo, bridge);
      m.renderOrder = -0.41; m.frustumCulled = false;
      parts.push({ mesh: m, d0: a, n: r.n });
    }
    for (const p of parts) scene.add(p.mesh);
    return parts;
  }
  function drop(id) { const s = shown.get(id); if (!s) return; for (const p of s.meshes) { scene.remove(p.mesh); p.mesh.geometry.dispose(); } shown.delete(id); }
  const trains = new Map();   // train id -> { group, cars: [mesh], d, snapD, snapAt, len }
  let carMat = null;
  function trainMeshes(t, gap) {
    const G = carGeometries(); carMat ||= carMaterial();
    const kinds = ['engine', 'tender', ...Array.from({ length: t.cars ?? 3 }, (_, i) => i === (t.cars ?? 3) - 1 ? 'wagon' : 'carriage')];
    const cars = kinds.map(k => { const m = new THREE.Mesh(G[k], carMat); m.renderOrder = 0; scene.add(m); return { mesh: m, kind: k }; });
    return { cars, d: t.d, snapD: t.d, snapAt: 0, gap };
  }
  function moveTrains(frontier, links, dt, clock) {
    const list = frontier?.rail?.trains || {};
    for (const [id, s] of trains) if (!list[id] || !links[list[id].link]) { for (const c of s.cars) scene.remove(c.mesh); trains.delete(id); }
    for (const t of Object.values(list)) {
      const l = links[t.link]; if (!l?.done) continue;
      let s = trains.get(t.id);
      if (!s) trains.set(t.id, s = trainMeshes(t, 7));
      if (t.d !== s.snapD || t.wait !== s.wait) { s.snapD = t.d; s.wait = t.wait; s.snapAt = clock; }
      // predict from the last view: standing while it waits, otherwise on at its speed, never past the ends
      const since = clock - s.snapAt;
      const predicted = (t.wait ?? 0) > 0 ? s.snapD : Math.max(0, Math.min(l.length, s.snapD + t.dir * (t.v ?? t.speed ?? 36) * since));
      s.d += (predicted - s.d) * Math.min(1, dt * 8);
      // cars trail behind the engine, toward where it came from
      s.cars.forEach((c, k) => {
        const off = k === 0 ? 0 : k === 1 ? 4.4 : 4.4 + (k - 1) * s.gap, p = pointAt(l, s.d - t.dir * off), ahead = pointAt(l, s.d - t.dir * off + t.dir * 0.5);
        c.mesh.position.set(p.x, 0.05, p.z);
        c.mesh.rotation.y = Math.atan2(ahead.x - p.x, ahead.z - p.z) || 0;
        c.mesh.visible = true;
      });
    }
  }
  let clock = 0;
  function update(frontier, show, dt = 1 / 60) {
    clock += dt;
    const links = show ? frontier?.rail?.links || {} : {};
    moveTrains(show ? frontier : null, links, dt, clock);
    for (const id of [...shown.keys()]) if (!links[id]) drop(id);
    for (const l of Object.values(links)) {
      if (!l.points?.length || !(l.length > 0)) continue;
      const key = `${l.length}:${l.points.length}`;
      let s = shown.get(l.id);
      if (s && s.key !== key) { drop(l.id); s = null; }
      if (!s) shown.set(l.id, s = { key, meshes: build(l) });
      for (const p of s.meshes) {   // only what has been laid so far
        const quads = Math.max(0, Math.min(p.n, Math.floor((l.built - p.d0) / STEP)));
        p.mesh.geometry.setDrawRange(0, quads * 6);
        p.mesh.visible = quads > 0;
      }
    }
  }
  function dispose() { for (const id of [...shown.keys()]) drop(id); for (const s of trains.values()) for (const c of s.cars) scene.remove(c.mesh); trains.clear(); track?.dispose(); bridge?.dispose(); }
  return { update, dispose };
}
