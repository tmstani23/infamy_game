// Railway track on the island (train plan step 2): a ribbon along each of your links, drawn from its first
// station up to how far the rail gang has got (link.built), with a plank deck under the rails where the line
// crosses water. Painted seamless strips (Tim 2026-11-07): art/ground/rail_track.png and rail_bridge.png,
// copied from assets/concepts/mounts_vehicles/*_tile.png at half size, rails along the image. Reads the frontier view only (state.frontier.rail.links); never changes the sim.
// Trains (Tim 2026-11-07): each car is a sprite from the Tencent models (train_engine, train_tender, train_carriage,
// train_goods, train_guard; 8 directions, wheels turning in 'run'), engine and tender first, then the train's
// consist (data/railways.json train.consist), coupled end to end along the track. Without carSprite (or for a
// car whose sheet has not loaded yet) the old code-built boxes stand in. Their position is predicted between
// the 4 Hz frontier views from the train's speed, so they glide instead of jumping.
// createRailTrack({ scene, carSprite }) -> { update(frontierView, show, dt), things(), dispose() }
import * as THREE from 'three';
import { spriteMaterial } from './shading.js';
import { pointAt } from '../sim/frontier/rail_route.js';
import { toScreen, CAM_UP } from './iso.js';
import { createTrainFx, carriageGlow } from './train_fx.js';

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

// Tim 2026-11-07 (track looked pasted on): round the corners a few more times (render only). fade = share of the
// width each side that fades out (0 = hard edges, as Tim preferred).
function smoothLine(l, passes = 3) {
  let p = l.points;
  for (let n = 0; n < passes && p.length > 2; n++) {
    const out = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      const [x, z] = p[i], a = p[i - 1], b = p[i + 1];
      out.push([x * 0.75 + a[0] * 0.25, z * 0.75 + a[1] * 0.25], [x * 0.75 + b[0] * 0.25, z * 0.75 + b[1] * 0.25]);
    }
    out.push(p[p.length - 1]); p = out;
  }
  const dist = [0];
  for (let i = 1; i < p.length; i++) dist.push(dist[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const length = dist[dist.length - 1];
  return { points: p, dist, length, k: l.length > 0 ? length / l.length : 1, bridges: (l.bridges || []).map(([a, b]) => [a * length / l.length, b * length / l.length]) };
}

function groundMaterial(tex, fade = 0) {
  const m = spriteMaterial(tex);
  // the ballast edge fade was taken back out (Tim 2026-11-07: the track looked less 3D); fade 0 keeps hard edges
  if (fade > 0) m.fragmentShader = m.fragmentShader.replace('float a = t.a * uOpacity;', `float a = t.a * uOpacity * smoothstep(0.0, ${fade.toFixed(2)}, vUv.x) * smoothstep(1.0, ${(1 - fade).toFixed(2)}, vUv.x);`);
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
// Tim 2026-11-07 (train not sitting on the rails): everything here is drawn as sprites without a depth test, in the
// order render/draw_order.js gives them, and the track ribbon is one of those. So the cars are drawn the same way
// (no depth test, back faces culled, so each box still looks solid) and take part in that sort as movers.
const carMaterial = () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false });
const CAR_SIZE = { engine: [2.4, 5.2, 3.4], tender: [2.2, 3.2, 1.6], carriage: [2.4, 6, 2.4], wagon: [2.4, 5, 1.2] };   // width, length, height
const corner = new THREE.Vector3();
// the sort record of a car: its footprint on the ground and its box on screen
function carThing(c) {
  const [w, len, h] = CAR_SIZE[c.kind], p = c.mesh.position, a = c.mesh.rotation.y, ca = Math.cos(a), sa = Math.sin(a);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = sx * w / 2, lz = sz * len / 2, x = p.x + lx * ca + lz * sa, z = p.z - lx * sa + lz * ca;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    for (const y of [0, h]) { const q = toScreen(corner.set(x, y, z)); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  }
  const t = c.thing ||= { mesh: c.mesh, extras: [] };
  t.foot = { minX, maxX, minZ, maxZ }; t.screen = { x0, x1, y0, y1 }; t.depth = (minX + maxX + minZ + maxZ) / 2;
  return t;
}

// sprite cars: the art key and the car's length in world units (the train sprite export, 2026-11-07)
const CAR_ART = { engine: ['train_engine', 6.4], tender: ['train_tender', 4.3], carriage: ['train_carriage', 6.3],
  goods: ['train_goods', 4.2], wagon: ['train_goods', 4.2], guard: ['train_guard', 5.4] };
const COUPLING = 0.35;   // buffer to buffer between two cars
const DEFAULT_CONSIST = ['carriage', 'carriage', 'goods', 'goods', 'guard'];
const BOGIE_IN = 1.0;    // a bogie's centre from the car's end
const SHED = 8, NOSE = 6.5;   // station: track inside it from its middle (the art is up to 17.6 wide); the engine's middle stands NOSE in
// The sheets only have so many turns (8 rows, maybe 16/32 later), so a car on a track between two of them is drawn
// from the nearest row and the picture turned in the screen plane by what is left, so its long side lies on the rails.
// Angles as in sim/geometry.js dirIndex: 0 = screen down (S), going round S, SW, W ...
const groundAngle = (dx, dz) => { const sx = (dx - dz) * Math.SQRT1_2, sy = (dx + dz) * Math.SQRT1_2; return Math.atan2(-sx, sy); };
const DOWN_UP = (CAM_UP.x + CAM_UP.z) * Math.SQRT1_2;   // how far screen-down on the ground goes up on screen (negative)
const screenAngle = a => Math.atan2(Math.cos(a) * DOWN_UP, -Math.sin(a));
const MAX_ROLL = 0.6;
const wrap = r => Math.atan2(Math.sin(r), Math.cos(r));
function carPose(sp, dx, dz) {
  // of the two rows either side, the one whose long side is nearest on screen (the turn left over is the smallest)
  const a = groundAngle(dx, dz), n = sp.dirs || 8, step = 2 * Math.PI / n, want = screenAngle(a);
  let row = 0, r = 9;
  for (const k of [Math.floor(a / step), Math.ceil(a / step)]) { const rk = wrap(want - screenAngle(k * step)); if (Math.abs(rk) < Math.abs(r)) { r = rk; row = ((k % n) + n) % n; } }
  sp.row = row; sp.heading = a; sp.roll = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, r));
}

export function createRailTrack({ scene, carSprite = null, hide = null }) {   // hide(x, z): behind the city wall, where cars are not drawn (Tim 2026-11-10)
  let track = null, bridge = null;
  const shown = new Map();   // link id -> { key, meshes: [{ mesh, d0, n }] }
  const mats = () => { track ||= groundMaterial(stripTexture('art/ground/rail_track.png')); bridge ||= groundMaterial(stripTexture('art/ground/rail_bridge.png')); };
  function build(l0) {
    mats();
    const l = l0.r;
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
  // sprite cars: middle of each car measured back from the engine's middle
  function spriteTrain(t) {
    const kinds = ['engine', 'tender', ...(Array.isArray(t.consist) && t.consist.length ? t.consist : DEFAULT_CONSIST)].filter(k => CAR_ART[k]);
    let off = 0;
    const cars = kinds.map((k, i) => { if (i) off += CAR_ART[kinds[i - 1]][1] / 2 + COUPLING + CAR_ART[k][1] / 2;
      const c = { kind: k, off, sprite: null, gone: false };
      carSprite(CAR_ART[k][0]).then(sp => { sp.thing.mesh.visible = sp.shadow.visible = false;   // shown once placed on the track
        if (c.gone) { scene.remove(sp.thing.mesh, sp.shadow); sp.dispose(); } else c.sprite = sp; });
      return c; });
    return { cars, sprites: true, key: kinds.join(','), d: t.d, snapD: t.d, snapAt: 0 };
  }
  function dropTrain(s) {
    s.fx?.dispose(); s.fx = null;
    for (const c of s.cars) { c.glow?.dispose(); c.glow = null; if (c.mesh) scene.remove(c.mesh); c.gone = true; if (c.sprite) { scene.remove(c.sprite.thing.mesh, c.sprite.shadow); c.sprite.dispose(); c.sprite = null; } }
  }
  function trainMeshes(t, gap) {
    if (carSprite) return spriteTrain(t);
    const G = carGeometries(); carMat ||= carMaterial();
    const kinds = ['engine', 'tender', ...Array.from({ length: t.cars ?? 3 }, (_, i) => i === (t.cars ?? 3) - 1 ? 'wagon' : 'carriage')];
    const cars = kinds.map(k => { const m = new THREE.Mesh(G[k], carMat); m.renderOrder = 0; scene.add(m); return { mesh: m, kind: k }; });
    return { cars, d: t.d, snapD: t.d, snapAt: 0, gap };
  }
  const smooths = new Map();   // link id -> { key, r }
  function smoothed(l) {
    const key = `${l.length}:${l.points.length}`, c = smooths.get(l.id);
    if (c && c.key === key) return c.r;
    const r = smoothLine(l); smooths.set(l.id, { key, r }); return r;
  }
  function moveTrains(frontier, links, dt, clock, night = 0) {
    const list = frontier?.rail?.trains || {};
    for (const [id, s] of trains) if (!list[id] || !links[list[id].link]) { dropTrain(s); trains.delete(id); }
    for (const t of Object.values(list)) {
      const l = links[t.link]; if (!l?.done) continue;
      const rl = smoothed(l), kk = rl.k;
      let s = trains.get(t.id);
      if (s?.sprites && s.key !== ['engine', 'tender', ...(Array.isArray(t.consist) && t.consist.length ? t.consist : DEFAULT_CONSIST)].filter(k => CAR_ART[k]).join(',')) { dropTrain(s); s = null; }   // the consist changed
      if (!s) trains.set(t.id, s = trainMeshes(t, 7));
      if (t.d !== s.snapD || t.wait !== s.wait) { s.snapD = t.d; s.wait = t.wait; s.snapAt = clock; }
      // predict from the last view: standing while it waits, otherwise on at its speed, never past the ends
      const since = clock - s.snapAt;
      const predicted = (t.wait ?? 0) > 0 ? s.snapD : Math.max(0, Math.min(l.length, s.snapD + t.dir * (t.v ?? t.speed ?? 36) * since));
      s.d += (predicted - s.d) * Math.min(1, dt * 8);
      // cars trail behind the engine, toward where it came from
      if (s.sprites) {
        const moving = (t.wait ?? 0) <= 0, L = l.length * kk, head = s.d * kk + t.dir * NOSE;
        let eng = null, tail = null;
        for (const c of s.cars) {
          if (!c.sprite) continue;
          // Tim 2026-11-07 (cars at odd diagonals, not coupled): each car rests on two bogies on the rails, so it sits on
          // the chord between them and faces along it, like a real coupled car going round a curve
          const mid = head - t.dir * c.off;
          // Tim 2026-11-07: a train in a station stands inside it with only the engine's nose out of the front; cars
          // go in and come out at the station (SHED of track at each end), the engine shows once it faces out
          const in0 = mid < SHED, inL = mid > L - SHED, out = c.kind === 'engine' && ((in0 && t.dir > 0) || (inL && t.dir < 0));
          if ((in0 || inL) && !out) { c.sprite.thing.mesh.visible = c.sprite.shadow.visible = false; c.glow?.hide(); continue; }
          const half = Math.max(0.5, CAR_ART[c.kind][1] / 2 - BOGIE_IN);
          const f = pointAt(rl, mid + t.dir * half), b = pointAt(rl, mid - t.dir * half);
          carPose(c.sprite, f.x - b.x, f.z - b.z);
          const x = (f.x + b.x) / 2, z = (f.z + b.z) / 2;
          if (hide?.(x, z)) { c.sprite.thing.mesh.visible = c.sprite.shadow.visible = false; c.glow?.hide(); continue; }
          c.sprite.update(dt, x, z, c.sprite.row, moving ? 'run' : 'idle', null, 1);
          c.sprite.thing.mesh.visible = c.sprite.shadow.visible = true;
          if (c.kind === 'carriage') (c.glow ||= carriageGlow(scene)).set(x, z, night);
          if (c.kind === 'engine' || c.kind === 'guard') { const n = Math.hypot(f.x - b.x, f.z - b.z) || 1, pose = { x, z, fx: (f.x - b.x) / n, fz: (f.z - b.z) / n }; if (c.kind === 'engine') eng = pose; else tail = pose; }
        }
        // steam from the chimney, and while it stands in a station a flashing badge and a bar running down to departure
        if (moving) s.waitFull = 0; else s.waitFull = Math.max(s.waitFull || 0, (t.wait ?? 0) / 20);
        const whistle = moving && s.wasMoving === false;
        s.wasMoving = moving;
        s.fx ||= createTrainFx(scene);
        s.focus = eng;   // the drawn engine: the camera rides along with it (render/view.js)
        s.fx.step(dt, eng, { mode: moving ? 'run' : 'idle', speed: t.v ?? t.speed ?? 36, whistle,
          wait: moving ? null : { left: Math.max(0, (t.wait ?? 0) / 20 - (clock - s.snapAt)), full: s.waitFull } });
        s.fx.lamps(eng, tail, night);
        continue;
      }
      s.cars.forEach((c, k) => {
        const off = k === 0 ? 0 : k === 1 ? 4.4 : 4.4 + (k - 1) * s.gap, p = pointAt(rl, (s.d - t.dir * off) * kk), ahead = pointAt(rl, (s.d - t.dir * off + t.dir * 0.5) * kk);
        c.mesh.position.set(p.x, 0.05, p.z);
        c.mesh.rotation.y = Math.atan2(ahead.x - p.x, ahead.z - p.z) || 0;
        c.mesh.visible = true;
        carThing(c);
      });
    }
  }
  let clock = 0;
  function update(frontier, show, dt = 1 / 60, night = 0) {
    clock += dt;
    const links = show ? frontier?.rail?.links || {} : {};
    moveTrains(show ? frontier : null, links, dt, clock, night);
    for (const id of [...shown.keys()]) if (!links[id]) drop(id);
    for (const l of Object.values(links)) {
      if (!l.points?.length || !(l.length > 0)) continue;
      const key = `${l.length}:${l.points.length}`;
      let s = shown.get(l.id);
      if (s && s.key !== key) { drop(l.id); s = null; }
      if (!s) shown.set(l.id, s = { key, meshes: build({ ...l, r: smoothed(l) }) });
      for (const p of s.meshes) {   // only what has been laid so far
        const quads = Math.max(0, Math.min(p.n, Math.floor((l.built * smoothed(l).k - p.d0) / STEP)));
        p.mesh.geometry.setDrawRange(0, quads * 6);
        p.mesh.visible = quads > 0;
      }
    }
  }
  // the cars to sort with the units this frame (render/view.js)
  const things = () => [...trains.values()].flatMap(s => s.sprites ? s.cars.filter(c => c.sprite?.thing.mesh.visible).map(c => c.sprite.thing) : s.cars.filter(c => c.mesh.visible && c.thing).map(c => c.thing));
  function dispose() { for (const id of [...shown.keys()]) drop(id); for (const s of trains.values()) dropTrain(s); trains.clear(); track?.dispose(); bridge?.dispose(); }
  const lights = () => [...trains.values()].flatMap(s => s.fx?.lights || []);
  const focus = id => trains.get(id)?.focus || null;   // where train id's engine is drawn, or null
  return { update, things, lights, focus, dispose };
}

// The capital's railway station (Tim 2026-11-07): a track out of the station's open east front over the edge of the city
// map, and the real trains of your lines to the capital, drawn as in a town station: they roll in from the edge, stand
// inside with only the engine's nose out (steam, flashing badge, wait bar), then pull out with their cars off the edge.
// The city stretch is drawn 1:1 with the line's distance from the capital end. Scenery only: no units move here.
// Once you have founded a frontier town and while no clan's line reaches the capital, a scenery train (nobody can
// board it) comes in every SCENERY.every seconds, stands, and leaves (Tim 2026-11-07); before that the station is empty.
// createCityStation({ scene, carSprite, station: { x, z }, edgeX }) -> { update(frontier, show, dt, owner), things(), dispose() }
const CITY_SHED = 4.6, CITY_NOSE = 4.6, CITY_RUN = 70;   // inside the station / the engine's middle standing / drawn track
const SCENERY = { every: 240, stand: 40, speed: 18 };
const LANE_GAP = TRACK_W + 0.4;      // seconds between scenery trains, seconds standing, units a second
// Tim 2026-11-07: the station's open front faces east (port_town.json flip), the first line's track runs out through it;
// further lines get a siding along the station's north side, where their train stands idling in the open. SIDE_BACK: how far
// west of the station's middle a siding starts (the telegraph office is beyond); SIDE_FIRST: the first siding off its middle.
const SIDE_LANES = 3, SIDE_BACK = 34, SIDE_FIRST = 4.1 + 0.6 + TRACK_W / 2;
export function createCityStation({ scene, carSprite, station, edgeX }) {
  // one track (lane) per line to the capital, side by side, so trains standing at once never stack (Tim 2026-11-07)
  const x1 = Math.max(station.x + 8, edgeX) + CITY_RUN, length = x1 - station.x, edgeU = Math.max(8, edgeX - station.x);
  const laneLine = i => { const back = i ? SIDE_BACK : 0, z = station.z - (i ? SIDE_FIRST + (i - 1) * LANE_GAP : 0), x0 = station.x - back;
    return { points: [[x0, z], [x1, z]], dist: [0, x1 - x0], length: x1 - x0, back }; };
  const tex = stripTexture('art/ground/rail_track.png'), mat = groundMaterial(tex);
  let lanes = [];   // [{ line, mesh }]
  function setLanes(n) {
    n = Math.min(n, 1 + SIDE_LANES);   // more lines than that share the sidings
    if (lanes.length === n) return;
    for (const l of lanes) { scene.remove(l.mesh); l.mesh.geometry.dispose(); }
    lanes = Array.from({ length: n }, (_, i) => { const line = laneLine(i), r = ribbon(line, 0, line.back + edgeU, TRACK_W, 0.03);
      const mesh = new THREE.Mesh(r.geo, mat); mesh.renderOrder = -0.4; mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh); return { line, mesh }; });
  }
  setLanes(1);
  const trains = new Map();   // train id -> { cars, key, d, snapD, snapAt, wait, fx, waitFull, wasMoving }
  let clock = 0;
  const kindsOf = t => ['engine', 'tender', ...(Array.isArray(t.consist) && t.consist.length ? t.consist : DEFAULT_CONSIST)].filter(k => CAR_ART[k]);
  function make(t) {
    const kinds = kindsOf(t); let off = 0;
    const cars = kinds.map((k, i) => { if (i) off += CAR_ART[kinds[i - 1]][1] / 2 + COUPLING + CAR_ART[k][1] / 2;
      const c = { kind: k, off, sprite: null, gone: false };
      carSprite(CAR_ART[k][0]).then(sp => { sp.thing.mesh.visible = sp.shadow.visible = false;
        if (c.gone) { scene.remove(sp.thing.mesh, sp.shadow); sp.dispose(); } else c.sprite = sp; });
      return c; });
    return { cars, key: kinds.join(','), d: t.d, snapD: t.d, snapAt: clock, wait: t.wait };
  }
  function drop(s) { s.fx?.dispose(); for (const c of s.cars) { c.glow?.dispose(); c.glow = null; c.gone = true; if (c.sprite) { scene.remove(c.sprite.thing.mesh, c.sprite.shadow); c.sprite.dispose(); c.sprite = null; } } }
  // the scenery train at this moment of its round, or null while it is away
  function sceneryTrain() {
    const run = (CITY_RUN + edgeU) / SCENERY.speed, ph = clock % SCENERY.every;
    const t = { id: 'scenery', link: 'scenery', speed: SCENERY.speed, consist: DEFAULT_CONSIST, scenery: true };
    if (ph < run) return { ...t, d: (CITY_RUN + edgeU) * (1 - ph / run), dir: -1, wait: 0 };
    if (ph < run + SCENERY.stand) return { ...t, d: 0, dir: 1, wait: Math.ceil((run + SCENERY.stand - ph) * 20) };
    if (ph < 2 * run + SCENERY.stand) return { ...t, d: (ph - run - SCENERY.stand) * SCENERY.speed, dir: 1, wait: 0 };
    return null;
  }
  function update(frontier, show, dt, owner = null, night = 0) {
    clock += dt;
    const links = { ...(frontier?.rail?.links || {}) }, list = show ? Object.values(frontier?.rail?.trains || {}) : [];
    const capital = Object.values(links).filter(l => l.done && (l.from === 'capital' || l.to === 'capital')).map(l => l.id).sort();
    setLanes(Math.max(1, capital.length));
    for (const l of lanes) l.mesh.visible = show;
    const founded = Object.values(frontier?.settlements || {}).some(t => t.owner === owner && t.founded);
    if (show && founded && !capital.length) {   // dummy trains until a real line reaches the capital (Tim 2026-11-07)
      links.scenery = { done: true, from: 'capital', to: 'scenery', length: 1e4 };
      const st = sceneryTrain(); if (st) list.push(st);
    }
    const here = new Set();
    for (const t of list) {
      const l = links[t.link]; if (!l?.done || (l.from !== 'capital' && l.to !== 'capital')) continue;
      const atStart = l.from === 'capital', line = lanes[Math.max(0, capital.indexOf(t.link)) % lanes.length].line, side = line.back > 0;
      let s = trains.get(t.id);
      if (s && s.key !== kindsOf(t).join(',')) { drop(s); trains.delete(t.id); s = null; }
      if (t.d !== s?.snapD || t.wait !== s?.wait) { if (s) { s.snapD = t.d; s.wait = t.wait; s.snapAt = clock; } }
      const since = s ? clock - s.snapAt : 0, base = s ? s.snapD : t.d;
      const predicted = (t.wait ?? 0) > 0 ? base : Math.max(0, Math.min(l.length, base + t.dir * (t.v ?? t.speed ?? 36) * since));
      const dc = atStart ? predicted : l.length - predicted;                       // from the capital end
      if (dc > CITY_RUN + edgeU) { if (s) { drop(s); trains.delete(t.id); } continue; }   // far out on the island
      if (!s) trains.set(t.id, s = make(t));
      here.add(t.id);
      s.dc ??= dc; s.dc += (dc - s.dc) * Math.min(1, dt * 8);   // eased toward the prediction
      const out = atStart ? t.dir > 0 : t.dir < 0, sgn = out ? 1 : -1;   // heading away from the capital = east here
      const moving = (t.wait ?? 0) <= 0, head = CITY_NOSE + s.dc;
      let eng = null, tail = null;
      for (const c of s.cars) {
        if (!c.sprite) continue;
        const mid = head - sgn * c.off;
        if ((side ? mid + line.back < 2 : mid < CITY_SHED && !(c.kind === 'engine' && out)) || mid > length - 4) { c.sprite.thing.mesh.visible = c.sprite.shadow.visible = false; c.glow?.hide(); continue; }
        const half = Math.max(0.5, CAR_ART[c.kind][1] / 2 - BOGIE_IN), f = pointAt(line, line.back + mid + sgn * half), b = pointAt(line, line.back + mid - sgn * half);
        carPose(c.sprite, f.x - b.x, f.z - b.z);
        const x = (f.x + b.x) / 2, z = (f.z + b.z) / 2;
        c.sprite.update(dt, x, z, c.sprite.row, moving ? 'run' : 'idle', null, 1);
        c.sprite.thing.mesh.visible = c.sprite.shadow.visible = true;
        if (c.kind === 'carriage') (c.glow ||= carriageGlow(scene)).set(x, z, night);
        if (c.kind === 'engine' && !side && mid < CITY_SHED + 4) {   // still in the station mouth: sorted as inside it, so the wall hides its back
          c.sprite.thing.foot = { minX: station.x - 1.2, maxX: station.x - 0.8, minZ: station.z - 1.2, maxZ: station.z - 0.8 };
          c.sprite.thing.updateScreen();
        }
        if (c.kind === 'engine' || c.kind === 'guard') { const n = Math.hypot(f.x - b.x, f.z - b.z) || 1, pose = { x, z, fx: (f.x - b.x) / n, fz: (f.z - b.z) / n }; if (c.kind === 'engine') eng = pose; else tail = pose; }
      }
      if (moving) s.waitFull = 0; else s.waitFull = Math.max(s.waitFull || 0, (t.wait ?? 0) / 20);
      const whistle = moving && s.wasMoving === false; s.wasMoving = moving;
      s.fx ||= createTrainFx(scene);
      s.fx.step(dt, eng, { mode: moving ? 'run' : 'idle', speed: t.v ?? t.speed ?? 36, whistle,
        wait: moving || t.scenery ? null : { left: Math.max(0, (t.wait ?? 0) / 20 - (clock - s.snapAt)), full: s.waitFull } });
      s.fx.lamps(eng, tail, night);
    }
    for (const [id, s] of trains) if (!here.has(id)) { drop(s); trains.delete(id); }
  }
  const things = () => [...trains.values()].flatMap(s => s.cars.filter(c => c.sprite?.thing.mesh.visible).map(c => c.sprite.thing));
  function dispose() { for (const s of trains.values()) drop(s); trains.clear(); for (const l of lanes) { scene.remove(l.mesh); l.mesh.geometry.dispose(); } lanes = []; mat.dispose(); tex.dispose(); }
  const lights = () => [...trains.values()].flatMap(s => s.fx?.lights || []);
  return { update, things, lights, dispose };
}
