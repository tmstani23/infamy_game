// Fishing poles (2026-11-23): a worker harvesting a fish spot holds a bamboo pole and casts a line into the
// water. Presentation only: the sim puts e.fishing = [x, z] (the water point to cast at) on the worker while it
// harvests a fish spot (sim/frontier/workers.js); this draws the pole, the line, a float and soft rings on the water.
// One loop per worker, about 9 s: raise the pole back, flick it forward, the float arcs out and lands with a ring,
// sits bobbing (now and then a nibble dips it), then the line is reeled in and it starts again. All of it is a little
// see-through (2026-11-23: every effect somewhat see-through).
// It also ties each fish spot's bollards to its boats with a slack mooring rope and darkens the water under each boat
// (2026-11-24), from the spot pieces (world_spots.json: variant 0 = rowboat on the water, 1 = bollard on the bank).
//   createFishingFx({ scene }) -> { update(list, dt), moor(spots), clear() }
//   list: [{ id, x, y, z, tx, tz, order }]  x/y/z = the worker's feet, tx/tz = the cast point, order = its sprite's renderOrder
//   spots: the fish spots in view ({ id, x, z, pieces }); rebuilt only when the set changes
import * as THREE from 'three';
import { VIEW_DIR } from './iso.js';

const POLE_N = 6, LINE_N = 16;
const POLE_LEN = 2.6, HAND_Y = 0.74, HAND_OUT = 0.3;
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const ease = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.max(0, Math.min(1, t));

// a flat strip turned to face the camera, one quad per segment, with per-vertex colour and alpha
function strip(n, opacity) {
  const geo = new THREE.BufferGeometry(), idx = [];
  for (let i = 0; i < n; i++) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 6), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array((n + 1) * 8), 4));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, depthTest: true, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  return m;
}
const tan = new THREE.Vector3(), side = new THREE.Vector3();
function setStrip(m, pts, width, colour, lit = 1.15) {
  const a = m.geometry.attributes.position, c = m.geometry.attributes.color, n = pts.length - 1;
  for (let i = 0; i <= n; i++) {
    const p = pts[i], q = pts[Math.min(n, i + 1)], o = pts[Math.max(0, i - 1)];
    tan.subVectors(q, o).normalize();
    side.crossVectors(tan, VIEW_DIR).normalize().multiplyScalar(width(i / n) / 2);
    a.setXYZ(i * 2, p.x + side.x, p.y + side.y, p.z + side.z); a.setXYZ(i * 2 + 1, p.x - side.x, p.y - side.y, p.z - side.z);
    const col = colour(i / n), al = col[3] ?? 1; c.setXYZW(i * 2, Math.min(1, col[0] * lit), Math.min(1, col[1] * lit), Math.min(1, col[2] * lit), al);   // the lit edge
    c.setXYZW(i * 2 + 1, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, al);
  }
  a.needsUpdate = true; c.needsUpdate = true;
}
// pole colours: a cord-wrapped grip (dull red, after the rod in assets/concepts/items/fishing_rod.png), then
// weathered bamboo with darker joints, thinning to the tip
const lin = (r, g, b) => { const c = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace); return [c.r, c.g, c.b]; };   // colours below are as seen on screen
const GRIP = lin(0.3, 0.12, 0.09), GRIP2 = lin(0.2, 0.08, 0.06), CANE = lin(0.36, 0.26, 0.15), JOINT = lin(0.16, 0.11, 0.07);
const poleColour = f => f < 0.16 ? (Math.floor(f * 60) % 2 ? GRIP : GRIP2) : (Math.abs(((f - 0.16) * 5.5) % 1 - 0.5) > 0.45 ? JOINT : CANE.map(v => v * (1 - f * 0.25)));
const LINE = lin(0.46, 0.42, 0.35), WARM = lin(0.66, 0.52, 0.34), lineColour = f => [...LINE.map((v, k) => v + (WARM[k] - v) * Math.max(0, 1 - f * 4)), 1 - f * 0.2];   // lantern-warm by the tip, fading toward the float

// the float: a slim lacquered uki, dark body with a red tip, a sprite so it always faces the camera
const FLOAT = (() => {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 32; const g = cv.getContext('2d');
  g.fillStyle = 'rgba(10,8,6,.7)'; g.beginPath(); g.ellipse(8, 17, 4, 12, 0, 0, Math.PI * 2); g.fill();   // dark outline
  g.fillStyle = 'rgba(46,34,24,.95)'; g.beginPath(); g.ellipse(8, 20, 2.6, 8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(186,52,32,.95)'; g.beginPath(); g.ellipse(8, 9, 2.2, 4.4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(214,190,140,.75)'; g.fillRect(5.5, 13, 5, 1.2);   // a pale band where the colours meet
  g.fillStyle = 'rgba(255,200,130,.9)'; g.fillRect(6.2, 6, 1.4, 4);   // a warm glint on the tip
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
// a soft ring lying on the water, faint and blurred so it reads as water, not as a marker
const RING = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  const r = g.createRadialGradient(32, 32, 12, 32, 32, 31);
  r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, 'rgba(255,255,255,.18)'); r.addColorStop(0.72, 'rgba(255,255,255,.55)'); r.addColorStop(0.86, 'rgba(255,255,255,.2)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = 'destination-out';   // break the ring in a few places so it reads as water, not a drawn circle
  for (const [a0, a1, k] of [[0.3, 0.9, 0.8], [2.1, 2.5, 0.6], [3.6, 4.4, 0.9], [5.2, 5.5, 0.5]]) { g.strokeStyle = `rgba(0,0,0,${k})`; g.lineWidth = 9; g.beginPath(); g.arc(32, 32, 26, a0, a1); g.stroke(); }
  return new THREE.CanvasTexture(cv);
})();
// a small dark patch on the water where the float sits
const WET = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 32; const g = cv.getContext('2d');
  const r = g.createRadialGradient(16, 16, 2, 16, 16, 15); r.addColorStop(0, 'rgba(4,10,14,.9)'); r.addColorStop(1, 'rgba(4,10,14,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(cv);
})();
const RING_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const HULL_GEO = new THREE.PlaneGeometry(4.2, 2.2).rotateX(-Math.PI / 2).rotateY(-0.8);   // under a rowboat, along its hull as drawn

export function createFishingFx({ scene }) {
  const anglers = new Map();
  const pole = [], line = [];
  for (let i = 0; i <= POLE_N; i++) pole.push(new THREE.Vector3());
  for (let i = 0; i <= LINE_N; i++) line.push(new THREE.Vector3());
  const hand = new THREE.Vector3(), tip = new THREE.Vector3(), bob = new THREE.Vector3(), flyFrom = new THREE.Vector3();

  function make(id) {
    const r = hash(id);
    const A = { seed: r, clock: r * 9, period: 8.5 + r * 2.5, rings: [], tilt: (hash(id + '|t') - 0.5) * 0.34, len: POLE_LEN * (0.9 + hash(id + '|l') * 0.22),
      pole: strip(POLE_N, 0.9), line: strip(LINE_N, 0.55),
      float: new THREE.Sprite(new THREE.SpriteMaterial({ map: FLOAT, transparent: true, opacity: 0.88, depthTest: false, depthWrite: false })) };
    A.float.scale.set(0.3, 0.6, 1);
    A.wet = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ map: WET, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
    A.wet.scale.set(0.5, 1, 0.32); A.wet.renderOrder = -0.29; scene.add(A.wet);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ map: RING, color: 0x8fb0b8, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
      m.renderOrder = -0.3; m.visible = false; A.rings.push({ m, age: 9, size: 1 }); scene.add(m);
    }
    scene.add(A.pole, A.line, A.float);
    anglers.set(id, A); return A;
  }
  function drop(id, A) {
    for (const m of [A.pole, A.line]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    scene.remove(A.float, A.wet); A.float.material.dispose(); A.wet.material.dispose();
    for (const r of A.rings) { scene.remove(r.m); r.m.material.dispose(); }
    anglers.delete(id);
  }
  const ring = (A, x, z, size) => { const r = A.rings.reduce((a, b) => (b.age > a.age ? b : a)); r.age = 0; r.size = size; r.m.position.set(x, 0.03, z); };

  function update(list, dt) {
    const seen = new Set();
    for (const w of list) {
      seen.add(w.id);
      const A = anglers.get(w.id) || make(w.id);
      A.clock += dt;
      const P = A.period, t = A.clock % P, cycle = Math.floor(A.clock / P);
      const dx = w.tx - w.x, dz = w.tz - w.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
      const sx = -uz, sz = ux;   // the worker's right side
      hand.set(w.x + ux * HAND_OUT + sx * 0.16, w.y + HAND_Y, w.z + uz * HAND_OUT + sz * 0.16);   // held at the hip in the working hand, the grip over the hammer's handle
      // the cast point wanders a little each cycle so the rings don't stack
      const reach = Math.min(d, 16), jr = hash(`${w.id}|${cycle}`);   // a worker pushed far up the bank still casts no more than 16 units
      const tx = w.x + ux * reach + sx * (jr - 0.5) * 2.2 + ux * (jr - 0.5) * 1.2, tz = w.z + uz * reach + sz * (jr - 0.5) * 2.2 + uz * (jr - 0.5) * 1.2;
      // pole pitch: 0.62 rad while fishing; raised back to 1.45 on the wind-up, whipped through on the cast
      const BACK = 0.7, FLICK = 1.25, REEL = P - 1.1;
      let pitch = 0.82, bend = 0.3, nib = 0;
      if (t < BACK) pitch = 0.78 + (1.5 - 0.78) * ease(t / BACK);
      else if (t < FLICK) { const k = (t - BACK) / (FLICK - BACK); pitch = 1.5 - (1.5 - 0.62) * ease(k); bend = 0.22 + Math.sin(k * Math.PI) * 0.35; }
      else if (t < REEL) {
        pitch = 0.78 + Math.sin((t - FLICK) * 1.3 + A.seed * 6) * 0.025;
        const nibAt = 2.4 + A.seed * (REEL - FLICK - 3.2);   // one nibble per cycle, at a different moment for each worker
        const k = (t - FLICK - nibAt) / 0.9; if (k > 0 && k < 1) nib = Math.sin(k * Math.PI * 3) * (1 - k);
        pitch -= Math.max(0, nib) * 0.12; bend += Math.max(0, nib) * 0.2;
      } else pitch = 0.78 + ease((t - REEL) / (P - REEL)) * 0.25;
      for (let i = 0; i <= POLE_N; i++) {
        const f = i / POLE_N, L = A.len * f, sag = bend * f * f * A.len * 0.5, p = pitch + A.tilt;
        pole[i].set(hand.x + ux * Math.cos(p) * L, hand.y + Math.sin(p) * L - sag, hand.z + uz * Math.cos(p) * L);
      }
      tip.copy(pole[POLE_N]);
      // the float: hangs from the tip on the wind-up, flies out on the cast, rides the water, then comes in on the reel
      let fly = 1, onWater = true, reel = 0;
      if (t < FLICK - 0.15) { onWater = false; fly = 0; }
      else if (t < FLICK + 0.55) { fly = clamp01((t - (FLICK - 0.15)) / 0.7); onWater = fly >= 1; }
      if (t >= REEL) reel = ease((t - REEL) / (P - REEL));
      const wx = tx + (w.x + ux * 2.2 - tx) * reel, wz = tz + (w.z + uz * 2.2 - tz) * reel;
      if (!fly) { const sw = Math.sin(t * 7) * 0.25 - clamp01(t / BACK) * 0.35; bob.set(tip.x + ux * sw, tip.y - 0.5, tip.z + uz * sw); }   // swings under the tip on the wind-up
      else if (!onWater) { flyFrom.copy(tip); bob.set(flyFrom.x + (wx - flyFrom.x) * fly, flyFrom.y + (0.02 - flyFrom.y) * fly + Math.sin(fly * Math.PI) * 1.6, flyFrom.z + (wz - flyFrom.z) * fly); }
      else bob.set(wx, 0.04 + Math.sin(A.clock * 2.1 + A.seed * 9) * 0.025 - Math.max(0, nib) * 0.09, wz);
      if (fly >= 1 && !A.landed) { A.landed = true; ring(A, wx, wz, 1.4); A.second = 0.25; }
      if (A.second > 0 && (A.second -= dt) <= 0) ring(A, wx, wz, 0.9);   // a second, smaller ring just after the splash
      if (t < BACK) A.landed = false;
      if (onWater && nib > 0.6 && !A.nibRing) { A.nibRing = true; ring(A, wx, wz, 0.9); }
      if (nib <= 0) A.nibRing = false;
      if (onWater && !reel && (A.clock * 0.4 + A.seed) % 1 < dt * 0.4) ring(A, wx, wz, 0.75);   // now and then a lazy ring
      // the line: straight-ish while flying, a gentle sag while it rests on the water
      const sagL = onWater ? 0.6 + Math.sin(A.clock * 1.1) * 0.06 - Math.max(0, nib) * 0.4 : 0.08;
      for (let i = 0; i <= LINE_N; i++) {
        const f = i / LINE_N;
        line[i].set(tip.x + (bob.x - tip.x) * f, tip.y + (bob.y - tip.y) * f - Math.sin(Math.PI * f) * sagL * Math.min(1, Math.hypot(bob.x - tip.x, bob.z - tip.z) / 4), tip.z + (bob.z - tip.z) * f);
        line[i].y -= Math.sin(Math.PI * f * f) * sagL * 0.35 * (onWater ? 1 : 0);   // the belly sits past the middle
        line[i].y = Math.max(line[i].y, w.y + 0.035);   // never under the water, or the ground hides it
      }
      setStrip(A.pole, pole, f => 0.075 - f * 0.05, poleColour, 1.6);
      setStrip(A.line, line, f => 0.028 - f * 0.008, lineColour);
      A.float.position.set(bob.x, bob.y + 0.1, bob.z);
      A.wet.visible = onWater; A.wet.position.set(bob.x, 0.03, bob.z);
      // draw order: in front of the worker's sprite when the pole points toward the camera, behind it when it points away
      const away = ux * VIEW_DIR.x + uz * VIEW_DIR.z < -0.05;
      A.pole.renderOrder = A.line.renderOrder = (w.order ?? 10) + (away ? -0.5 : 0.5);
      A.float.renderOrder = 99000;
      for (const r of A.rings) {
        r.age += dt; const k = r.age / 1.6; r.m.visible = k < 1;
        if (k < 1) { const s = r.size * (0.35 + k * 1.4); r.m.scale.set(s * 1.3, 1, s); r.m.material.opacity = 0.4 * (1 - k); }
      }
    }
    for (const [id, A] of anglers) if (!seen.has(id)) drop(id, A);
  }
  // ---- moorings: a slack rope from each bollard to the nearest boat, a dark patch on the water under each boat ----
  const moored = new Map();   // spot id -> [meshes]
  const ROPE = lin(0.34, 0.27, 0.17), ropeColour = () => [...ROPE, 0.85], rope = [];
  for (let i = 0; i <= 10; i++) rope.push(new THREE.Vector3());
  function mooring(s) {
    const made = [], boats = s.pieces.filter(p => p[2] === 0).map(([dx, dz]) => [s.x + dx, s.z + dz]);
    for (const [bx, bz] of boats) {
      const m = new THREE.Mesh(HULL_GEO, new THREE.MeshBasicMaterial({ map: WET, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false }));
      m.position.set(bx, 0.02, bz); m.renderOrder = -0.31; made.push(m);
    }
    for (const [dx, dz, v] of s.pieces) {
      if (v !== 1 || !boats.length) continue;
      const px = s.x + dx, pz = s.z + dz, [bx, bz] = boats.reduce((a, b) => (Math.hypot(b[0] - px, b[1] - pz) < Math.hypot(a[0] - px, a[1] - pz) ? b : a));
      const L = Math.hypot(bx - px, bz - pz); if (L > 12 || L < 1) continue;
      const ex = bx + (px - bx) / L * 1.3, ez = bz + (pz - bz) / L * 1.3;   // to the boat's near end
      for (let i = 0; i <= 10; i++) { const f = i / 10; rope[i].set(px + (ex - px) * f, 0.42 + (0.28 - 0.42) * f - Math.sin(Math.PI * f) * Math.min(0.5, L * 0.08), pz + (ez - pz) * f); rope[i].y = Math.max(rope[i].y, 0.05); }
      const m = strip(10, 0.75); setStrip(m, rope, () => 0.05, ropeColour); m.renderOrder = 9.5; made.push(m);
    }
    for (const m of made) scene.add(m);
    return made;
  }
  function moor(spots) {
    const want = new Set();
    for (const s of spots) { if (s.kind !== 'fish') continue; want.add(s.id); if (!moored.has(s.id)) moored.set(s.id, mooring(s)); }
    for (const [id, made] of moored) if (!want.has(id)) { for (const m of made) { scene.remove(m); if (m.geometry !== HULL_GEO) m.geometry.dispose(); m.material.dispose(); } moored.delete(id); }
  }
  return { update, moor, clear: () => { for (const [id, A] of anglers) drop(id, A); moor([]); } };
}
