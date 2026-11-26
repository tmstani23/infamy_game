// Crows out on the island (wildlife W1, 2026-11-24). Presentation only: src/crow_flock.js moves the birds,
// this draws them and feeds it what the camera shows. Video setting "Wildlife" turns it off.
// - Flying crows: code-drawn silhouettes (crowOutline, the flock mock approved), pure black, one mesh for all,
//   drawn over the sprites, each with a soft blob shadow on the ground under it.
// - Crows sitting on roofs, trees, walls, fences and the ground: the Blender crow sprite sheet (art/wildlife/crow.png,
//   war_build/wildlife/crow/crow_render.py + w1/pack.py: idle, peck, hop, caw and fly, 8 directions), each a sprite
//   sorted with the buildings and units. A roof or tree crow sits on the top edge of its host's picture.
// - Gunfire, cannon and blasts scatter them (crow_scatter_1-3), so do people walking up and riders charging; they
//   circle over fights and come down by the dead afterwards, trail big columns on the march and roost in the trees
//   at night. Soft cawing (crow_caw_1-2). Sounds go out through wildSounds() to render/sound.js.
//   createCrowFx({ scene, world, groundY, isBuilding, cfg }) -> { update(...), hits(list, state), casts(list, state),
//     things(), sounds(), clear() }
import * as THREE from 'three';
import { CAM_RIGHT, CAM_UP, CAM_QUAT } from './iso.js';
import { Thing } from './scenery.js';
import { spriteMaterial, shared } from './shading.js';
import { terrainAt } from '../sim/world_data.js';
import { createCrowFlocks, crowOutline, CROW_FPS, CROW_DEFAULTS } from '../crow_flock.js';

// the sheet: rows clip x 8 directions (0 = facing the camera, then SW, W, NW, N, NE, E, SE on screen), columns frames
const CLIPS = { idle: [0, 12], peck: [1, 10], hop: [2, 8], caw: [3, 10], fly: [4, 8] };
const CELL_W = 112, CELL_H = 80, SHEET_W = 1344, SHEET_H = 3200, FEET_ROW = 57;
const PX = 64 / 0.8;                                   // sheet pixels per world unit (Blender: 64 px per unit, shown at 0.8)
const SPR_W = CELL_W / PX, SPR_H = CELL_H / PX, SPR_UP = (FEET_ROW - CELL_H / 2) / PX;
const FLY_ORDER = 99060, SHADOW_ORDER = -0.3, MAX = 90;
const TREE = /tree|pine|cedar|willow|banyan|broadleaf|bamboo$/, PERCH = /fence|wall|palisade|dead_tree|post|torii|gate/;
// gunfire and blasts that scatter crows, and how far (world units)
const SCARE = { rifleshot: 22, bullet: 22, gatlingShot: 22, cannonFire: 34, shipBroadside: 34, shipCannon: 30, dynamiteBlast: 30, railBlast: 34, firebombBurst: 18, folkPop: 12 };   // folkPop: the hermit's brew going off

const screenDir = h => {   // a ground heading -> the sprite direction 0..7
  const dx = Math.cos(h), dz = Math.sin(h), sx = dx * CAM_RIGHT.x + dz * CAM_RIGHT.z, sy = dx * CAM_UP.x + dz * CAM_UP.z;
  return ((Math.round(Math.atan2(-sx, -sy) / (Math.PI / 4)) % 8) + 8) % 8;
};

export function createCrowFx({ scene, world, groundY = () => 0, isBuilding = () => false, cfg = {} }) {
  const flocks = createCrowFlocks(cfg);
  const sheet = new THREE.TextureLoader().load('art/wildlife/crow.png');
  sheet.colorSpace = THREE.SRGBColorSpace;

  // ---- flying silhouettes: one mesh, rebuilt each frame (a centre fan per outline polygon)
  const TRIS = crowOutline(0, false).reduce((n, [p]) => n + p.length, 0);
  const flyGeo = new THREE.BufferGeometry();
  const flyPos = new Float32Array(MAX * TRIS * 9);
  const flyCol = new Float32Array(MAX * TRIS * 9);
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3).setUsage(THREE.DynamicDrawUsage));
  flyGeo.setAttribute('color', new THREE.BufferAttribute(flyCol, 3).setUsage(THREE.DynamicDrawUsage));
  // very dark blue-black, a faint cool edge along the top of the body and the raised wings (2026-11-24: "ok lets try")
  const BASE = new THREE.Color().setRGB(0.038, 0.043, 0.062, THREE.SRGBColorSpace), EDGE = new THREE.Color().setRGB(0.2, 0.235, 0.31, THREE.SRGBColorSpace);
  const tone = f => [BASE.r + (EDGE.r - BASE.r) * f, BASE.g + (EDGE.g - BASE.g) * f, BASE.b + (EDGE.b - BASE.b) * f];
  const flyMesh = new THREE.Mesh(flyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  flyMesh.renderOrder = FLY_ORDER; flyMesh.frustumCulled = false; flyMesh.visible = false;
  scene.add(flyMesh);

  // ---- soft blob shadows on the ground (flying birds and those on the ground)
  const blob = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(0,0,0,0.62)'); r.addColorStop(0.5, 'rgba(0,0,0,0.3)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
  })();
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthTest: false, depthWrite: false }), MAX);
  shadows.renderOrder = SHADOW_ORDER; shadows.frustumCulled = false; shadows.count = 0;
  scene.add(shadows);

  // ---- sitting crows: one sprite each, sorted with everything else (render/draw_order.js)
  const pool = [], used = [];
  function sprite() {
    let s = pool.pop();
    if (!s) {
      const mat = spriteMaterial(sheet);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.quaternion.copy(CAM_QUAT); mesh.scale.set(SPR_W, SPR_H, 1); mesh.frustumCulled = false;
      scene.add(mesh);
      s = { mesh, mat, thing: new Thing(mesh, { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }) };
    }
    s.mesh.visible = true; used.push(s); return s;
  }

  // ---- perch spots along the top edge of a host's picture (its roof, crown, wall or fence top)
  const lineCache = new WeakMap();
  // only a host's own mask (render/scenery.js big things); reading the picture back drew whole atlas pages per
  // tree and froze the game on the island (2026-11-24), so a host without one gets no mask
  function maskOf(t) { return t.mask || null; }
  // offsets [right, up] from the host's centre (world units on screen) of points along its top edge, about 0.45 apart
  function topLine(t, kind) {
    let line = lineCache.get(t);
    if (line) return line;
    const m = maskOf(t);
    if (!m) {   // no mask: a tree's crows sit along its crown, a little below the top of its picture; roofs need a mask
      const sx = t.mesh.scale.x, sy = t.mesh.scale.y;
      line = kind === 'tree' ? [-0.18, -0.06, 0.06, 0.18].map(k => [k * sx, sy * 0.28]) : [];
      lineCache.set(t, line);
      return line;
    }
    const sx = t.mesh.scale.x, sy = t.mesh.scale.y, shear = t.shear || 0, top = t.topShear || 0;
    const step = Math.max(1, Math.round(0.45 / sx * m.w)), lo = Math.floor(m.w * (kind === 'tree' ? 0.25 : 0.12)), hi = Math.ceil(m.w * (kind === 'tree' ? 0.75 : 0.88));
    line = [];
    for (let i = lo; i < hi; i += step) {
      let j = 0;
      while (j < m.h - 3 && !(m.data[j * m.w + i] && m.data[(j + 2) * m.w + i])) j++;
      if (j >= m.h - 3) continue;
      const x = ((i + 0.5) / m.w - 0.5) * sx, y0 = (0.5 - (j + 1) / m.h) * sy;
      const y = y0 + (shear + top * (y0 / sy + 0.5)) * x - (kind === 'tree' ? 0.25 : 0.05);   // a tree crow sits a little into the crown
      line.push([x, y]);
    }
    lineCache.set(t, line);
    return line;
  }

  let hosts = [], hostSet = new Set(), hostT = 0;
  function gatherHosts(things, cam) {
    hosts = []; hostSet = new Set();
    for (const t of things || []) {
      if (!t.art || !t.at || !t.mesh?.visible) continue;
      if (Math.abs(t.at[0] - cam.x) > cam.r * 2.2 || Math.abs(t.at[1] - cam.z) > cam.r * 2.2) continue;
      const kind = TREE.test(t.art) ? 'tree' : PERCH.test(t.art) ? 'perch' : isBuilding(t.art) ? 'roof' : null;
      if (!kind) continue;
      hosts.push({ t, kind, x: t.at[0], z: t.at[1] }); hostSet.add(t);
    }
  }
  const taken = () => { const s = new Set(); for (const b of flocks.birds()) if (b.spot?.key) s.add(b.spot.key); return s; };
  function spots(kind, x, z, r, n) {
    const out = [], busy = taken();
    if (kind === 'ground') {   // open ground: not water, river, cliffs or under a building or tree
      for (let i = 0; i < n * 6 && out.length < n; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (world && 'wmr'.includes(terrainAt(world, px, pz))) continue;
        if (hosts.some(h => { const f = h.t.foot; return f && px > f.minX - 0.6 && px < f.maxX + 0.6 && pz > f.minZ - 0.6 && pz < f.maxZ + 0.6; })) continue;
        if (out.some(s => Math.hypot(s.x - px, s.z - pz) < 0.6)) continue;
        out.push({ x: px, y: groundY(px, pz), z: pz, ground: true, key: null });
      }
      return out;
    }
    const near = hosts.filter(h => (h.kind === kind || (kind === 'perch' && h.t.art === 'dead_tree')) && Math.hypot(h.x - x, h.z - z) < r)
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    for (const h of near) {
      const line = topLine(h.t, kind), c = h.t.mesh.position;
      // a few birds per roof, spread along it, not shoulder to shoulder
      const pick = line.map((p, i) => i).sort(() => Math.random() - 0.5).slice(0, kind === 'tree' ? 5 : 4);
      for (const i of pick) {
        const key = `${h.t.mesh.id}:${i}`;
        if (busy.has(key)) continue;
        const [ox, oy] = line[i];
        out.push({ x: c.x + CAM_RIGHT.x * ox + CAM_UP.x * oy, y: c.y + CAM_UP.y * oy, z: c.z + CAM_RIGHT.z * ox + CAM_UP.z * oy, host: h.t, tree: kind === 'tree', key });
        if (out.length >= n) return out;
      }
    }
    return out;
  }

  // ---- what the sim tells us: fights (hits) and gunfire (casts), the frames since the last look
  const fights = new Map(), scares = [];
  let clock = 0;
  function hits(list, state) {
    for (const h of list) {
      const t = state.entities[h.t];
      if (t?.place !== 'world' || h.x === undefined) continue;
      const key = `${Math.floor(h.x / 20)},${Math.floor(h.z / 20)}`;
      const f = fights.get(key) || fights.set(key, { x: h.x, z: h.z, last: 0, n: 0, kills: [] }).get(key);
      f.x += (h.x - f.x) * 0.2; f.z += (h.z - f.z) * 0.2; f.n = clock - f.last < 6 ? f.n + 1 : 1; f.last = clock;
      if (h.kill && f.kills.length < 8) f.kills.push({ x: h.x, z: h.z });
    }
  }
  function casts(list, state) {
    for (const c of list) {
      const r = SCARE[c.kind];
      if (!r || c.x === undefined) continue;
      if ((c.place || state.entities[c.a]?.place) !== 'world') continue;
      scares.push({ x: c.x, z: c.z, r });
    }
  }
  // big columns on the march, matched to last look's so a trailing flock keeps its column
  let armies = [], armyT = 0, armyId = 1;
  // birds burst out of the trees round troops and shinobi on the move, hidden or not (wildlife W3: it can give
  // a hidden army away); each tree and each unit rests a while after, and one burst at a time
  const flushRest = new Map(), unitRest = new Map(); let flushT = 0, lastFlush = -99;
  function findFlushes(state, prev, cam) {
    const F = { ...CROW_DEFAULTS.flush, ...(cfg.flush || {}) }, out = [];
    if (clock - lastFlush < F.gap) return out;
    for (const e of Object.values(state.entities)) {
      if (e.place !== 'world' || e.dead || e.downed || e.wildlife || e.type === 'civilian' || e.worker || e.ship || e.aboard || e.garrison || !state.clans?.[e.owner]) continue;
      if (Math.abs(e.x - cam.x) > cam.r * 1.3 || Math.abs(e.z - cam.z) > cam.r * 1.3) continue;
      const p = prev?.entities?.[e.id];
      if (!p || Math.hypot(e.x - p.x, e.z - p.z) < 0.02 || (unitRest.get(e.id) ?? -99) > clock || Math.random() > F.chance) continue;
      const tree = hosts.find(h => h.kind === 'tree' && Math.hypot(h.x - e.x, h.z - e.z) < F.reach && (flushRest.get(h.t.mesh.id) ?? -99) < clock);
      if (!tree) continue;
      const top = topLine(tree.t, 'tree'), c = tree.t.mesh.position, [ox, oy] = top[Math.floor(top.length / 2)] || [0, 2];
      flushRest.set(tree.t.mesh.id, clock + F.treeRest); unitRest.set(e.id, clock + F.unitRest); lastFlush = clock;
      out.push({ x: c.x + CAM_RIGHT.x * ox + CAM_UP.x * oy, y: c.y + CAM_UP.y * oy, z: c.z + CAM_RIGHT.z * ox + CAM_UP.z * oy, fx: e.x, fz: e.z });
      break;
    }
    if (flushRest.size > 400) for (const [k, t] of flushRest) if (t < clock) flushRest.delete(k);
    if (unitRest.size > 400) for (const [k, t] of unitRest) if (t < clock) unitRest.delete(k);
    return out;
  }
  function findArmies(state, prev) {
    const cells = new Map();
    for (const e of Object.values(state.entities)) {
      if (e.place !== 'world' || e.dead || e.downed || e.worker || e.ship || e.cannon || !e.owner || !e.maxHp) continue;
      const p = prev?.entities?.[e.id];
      if (!p || Math.hypot(e.x - p.x, e.z - p.z) < 0.02) continue;
      const k = `${Math.floor(e.x / 16)},${Math.floor(e.z / 16)}`, c = cells.get(k) || cells.set(k, { n: 0, x: 0, z: 0, vx: 0, vz: 0 }).get(k);
      c.n++; c.x += e.x; c.z += e.z; c.vx += e.x - p.x; c.vz += e.z - p.z;
    }
    const next = [];
    for (const c of cells.values()) {
      if (c.n < (cfg.trailCount ?? 12)) continue;
      const a = { x: c.x / c.n, z: c.z / c.n, vx: c.vx / c.n, vz: c.vz / c.n };
      a.id = armies.find(o => Math.hypot(o.x - a.x, o.z - a.z) < 24)?.id ?? armyId++;
      next.push(a);
    }
    armies = next;
  }

  const queue = [];
  let lastCaw = 0, lastScatter = 0;
  let broken = false;
  function update(args) {
    if (broken) return;
    try { step(args); } catch (e) { broken = true; clear(); console.error('Crows switched off after an error:', e); }   // never stops the frame
  }
  function step({ state, prev, show, on, dt, cam, things, hear }) {
    const visible = show && on;
    if (!visible) { if (flocks.flocks().length) clear(); return; }
    clock += dt;
    if ((hostT -= dt) <= 0) { hostT = 0.5; gatherHosts(things, cam); }
    if ((armyT -= dt) <= 0) { armyT = 1; findArmies(state, prev); }
    for (const [k, f] of fights) if (clock - f.last > 120) fights.delete(k);
    // people near the crows: walkers make the ones on the ground hop off, riders at a gallop scatter them
    const people = [], feeders = [];   // feeders: the wandering hermit the crows come down by and do not mind
    for (const e of Object.values(state.entities)) {
      if (e.place !== 'world' || e.dead || e.ship || e.cannon || Math.abs(e.x - cam.x) > cam.r * 1.4 || Math.abs(e.z - cam.z) > cam.r * 1.4) continue;
      if (e.crowFriend) { feeders.push({ x: e.x, z: e.z }); continue; }
      const p = prev?.entities?.[e.id];
      people.push({ x: e.x, z: e.z, fast: !!e.mounted && !!p && Math.hypot(e.x - p.x, e.z - p.z) > 0.15 });
    }
    // crows on something that is no longer drawn (its chunk unloaded) fly off
    for (const f of flocks.flocks()) if (f.birds.some(b => b.spot?.host && !hostSet.has(b.spot.host))) for (const b of f.birds) if (b.spot?.host && !hostSet.has(b.spot.host)) { b.spot = null; if (b.mode === 'sit') { b.mode = 'takeoff'; b.t = 0; b.wait = 0; } else b.mode = 'fly'; }
    let flushes = [];
    if ((flushT -= dt) <= 0) { flushT = 0.5; flushes = findFlushes(state, prev, cam); }
    const env = { cam, night: shared.uNight.value, groundY, spots, scatters: scares.splice(0), people, feeders, flushes,
      battles: [...fights.values()].map(f => ({ x: f.x, z: f.z, active: clock - f.last < 6 && f.n >= 3, kills: f.kills })), armies };
    const heard = flocks.update(env, Math.min(dt, 0.1));
    const loud = (x, z) => Math.max(0, 1 - Math.hypot(x - cam.x, z - cam.z) / hear);
    for (const s of heard.scattered) if (clock - lastScatter > 1 && loud(s.x, s.z) > 0.05) { lastScatter = clock; queue.push(['crow_scatter_1', 0.55 * loud(s.x, s.z), 1]); }
    for (const c of heard.caws) if (clock - lastCaw > 1.4 && loud(c.x, c.z) > 0.05) { lastCaw = clock; queue.push(['crow_caw_1', 0.22 * loud(c.x, c.z), 0.92 + Math.random() * 0.16]); }
    draw(env.night);
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  function draw(night) {
    for (const s of used) { s.mesh.visible = false; pool.push(s); }
    used.length = 0;
    let n = 0, nShadow = 0;
    const shadowAt = (x, z, w, d) => { if (nShadow >= MAX) return; m4.compose(v3.set(x, groundY(x, z) + 0.03, z), q, s3.set(w, 1, d)); shadows.setMatrixAt(nShadow++, m4); };
    for (const b of flocks.birds()) {
      const spriteNow = b.mode === 'sit' || b.mode === 'takeoff' || (b.mode === 'land' && b.near);
      if (!spriteNow) {   // a silhouette: the outline turned to its heading on screen (as the mock drew it)
        if (n >= MAX) continue;
        const dx = Math.cos(b.h), dz = Math.sin(b.h), sx = dx * CAM_RIGHT.x + dz * CAM_RIGHT.z, sy = dx * CAM_UP.x + dz * CAM_UP.z;
        const hs = Math.atan2(-sx, sy), c = Math.cos(hs), s = Math.sin(hs);
        let o = n * TRIS * 9;
        const kk = b.k * (1 + (b.y - groundY(b.x, b.z) - 4.6) * 0.06);   // higher birds a touch bigger, so the flock has depth
        for (const [pts] of crowOutline(b.ph, b.gliding, b.bank || 0)) {
          const T = [], lift = Y => Math.min(1, Math.max(0, Y / (0.3 * b.k))) * 0.3;   // each point's tone: lighter the higher it sits on the bird on screen
          let Ym = 0;
          const P = pts.map(([x, y, z]) => { const rx = x * c - y * s, ry = x * s + y * c, X = rx * kk, Y = (ry * 0.92 + z * 0.45) * kk;
            T.push(tone(lift(Y))); Ym += Y / pts.length;
            return [b.x + CAM_RIGHT.x * X + CAM_UP.x * Y, b.y + CAM_UP.y * Y, b.z + CAM_RIGHT.z * X + CAM_UP.z * Y]; });
          const m = P.reduce((a, p) => [a[0] + p[0] / P.length, a[1] + p[1] / P.length, a[2] + p[2] / P.length], [0, 0, 0]);
          const mid = tone(lift(Ym));
          for (let i = 0; i < P.length; i++) { const j = (i + 1) % P.length; flyPos.set(m, o); flyPos.set(P[i], o + 3); flyPos.set(P[j], o + 6); flyCol.set(mid, o); flyCol.set(T[i], o + 3); flyCol.set(T[j], o + 6); o += 9; }
        }
        n++;
        const above = b.y - groundY(b.x, b.z);
        // the shadow falls away from the bird with height (the sun from the upper left), so it shows how high it flies
        shadowAt(b.x + (CAM_RIGHT.x - CAM_UP.x) * above * 0.12, b.z + (CAM_RIGHT.z - CAM_UP.z) * above * 0.12, 1.1 * b.k, 0.62 * b.k);
        continue;
      }
      // a sprite: sitting, taking off or settling on
      const sp = sprite(), u = sp.mat.uniforms;
      const clip = b.mode === 'sit' ? b.anim : 'fly', [row, frames] = CLIPS[clip];
      const f = Math.floor(b.t * CROW_FPS / (b.flock.sleeping ? 3 : 1) + (clip === 'fly' ? b.id : 0)) % frames;
      u.uFrame.value.set(f * CELL_W / SHEET_W, 1 - ((row * 8 + screenDir(b.h)) + 1) * CELL_H / SHEET_H, CELL_W / SHEET_W, CELL_H / SHEET_H);
      u.uFogAt.value.set(b.x, b.z, 0, 1);
      const sc = b.k / 0.72;   // the flock's own size spread
      sp.mesh.scale.set(SPR_W * sc, SPR_H * sc, 1);
      sp.mesh.position.set(b.x, b.y, b.z).addScaledVector(CAM_UP, SPR_UP * sc);
      // drawn just after the roof or tree it sits on, else as a small thing on the ground
      const host = b.spot?.host && b.mode === 'sit' ? b.spot.host.foot : null, e = 0.004;
      sp.thing.foot = host ? { minX: host.minX + e, maxX: host.maxX + e, minZ: host.minZ + e, maxZ: host.maxZ + e } : { minX: b.x - 0.15, maxX: b.x + 0.15, minZ: b.z - 0.15, maxZ: b.z + 0.15 };
      sp.thing.updateScreen();
      if (b.spot?.ground || (!b.spot?.host && b.mode !== 'sit')) { shadowAt(b.x, b.z, 0.6 * sc, 0.32 * sc); shadowAt(b.x, b.z, 0.34 * sc, 0.18 * sc); }   // a soft contact shadow, darker under the feet
    }
    flyGeo.setDrawRange(0, n * TRIS * 3);
    flyGeo.attributes.position.needsUpdate = true; flyGeo.attributes.color.needsUpdate = true;
    flyMesh.visible = n > 0;
    shadows.count = nShadow; shadows.instanceMatrix.needsUpdate = true;
    shadows.material.opacity = 1 - 0.75 * night;
  }

  function clear() {
    flocks.clear();
    for (const s of used) { s.mesh.visible = false; pool.push(s); }
    used.length = 0; flyMesh.visible = false; shadows.count = 0; scares.length = 0; fights.clear(); armies = [];
  }
  return { update, hits, casts, things: () => used.map(s => s.thing), sounds: () => queue.splice(0), clear };
}
