// Ship guns and hull damage, drawn (ships plan S4; rules in sim/frontier/ships.js). Drawing only.
//  - Broadside ('shipBroadside' cast): the gun ports along the side facing the target fire in a ripple bow to stern:
//    a white-hot flash, a short flame tongue and a big pale smoke puff each, the puffs running together into a wall
//    of smoke that rolls off downwind. The balls are state.projectiles (render/crewfx.js draws them); where each lands
//    (c.spread, the same numbers the sim used) a hit throws splinters and a dark puff, a miss throws up a white
//    water column (a ship target) or a dust burst (a building).
//  - Bow cannon ('shipCannon', the transport): one bigger flash, flame and smoke from the bow, one ball.
//  - Deck Gatling ('gatlingShot' with deck: true): a small painted gun on the warship's after deck, turned to its aim,
//    with the land Gatling's flash and tracer at its muzzle.
//  - Damage stages (war.ships.stages): under smoke a thin dark smoke from the deck, under fire small flames and thick
//    smoke, under list the hull leans and sits lower.
//   createShipFx({ scene, stages }) -> { cast(c, state), update(state, sprites, dt, place) }
import * as THREE from 'three';
import { VIEW_DIR, CAM_RIGHT } from './iso.js';
import { createParticles, createCards, SHAPE } from './vfx.js';

const rand = (a, b) => a + Math.random() * (b - a), pick = l => l[Math.floor(Math.random() * l.length)];
const FLAME = [[1, 0.93, 0.7], [1, 0.72, 0.3], [1, 0.5, 0.16], [0.95, 0.33, 0.1]];
const SMOKE = [[0.68, 0.64, 0.57], [0.6, 0.57, 0.51], [0.53, 0.5, 0.46], [0.74, 0.7, 0.62]];   // black powder smoke: a warm pale grey
const DARK = [[0.16, 0.15, 0.15], [0.24, 0.23, 0.22], [0.3, 0.28, 0.27]];
const SPRAY = [[0.86, 0.91, 0.94], [0.72, 0.8, 0.86], [0.6, 0.7, 0.78]];
const FIRE = [[0.79, 0.5, 0.24], [0.7, 0.38, 0.15], [0.88, 0.6, 0.3], [0.6, 0.3, 0.12]];   // dull ochre flames, not glow
const WOOD = [[0.36, 0.24, 0.14], [0.27, 0.18, 0.1], [0.45, 0.32, 0.2]];
// the hull as drawn (world units): half length of the gun deck, ports above the water, deck height, gun deck spot
const HULL = { warship: { half: 4.4, port: 0.95, out: 1.15, deck: 2.1, gun: -2.9, ports: 8 }, transport: { half: 3.6, port: 1.1, out: 1, deck: 2, bow: 4.4 } };

export function createShipFx({ scene, stages = {} }) {
  const glow = createParticles(scene, { max: 1600 }), soot = createParticles(scene, { max: 4000, additive: false }), cards = createCards(scene);
  const later = [];   // [{ at (s), fn }]
  let clock = 0;
  const vg = new THREE.Vector3(VIEW_DIR.x, 0, VIEW_DIR.z).normalize();   // screen up on the ground
  const head = (h = 0) => [Math.sin(h), Math.cos(h)];

  // the spin that turns a tongue (it points up the screen at 0) to point along the ground direction (dx, dz)
  const turnTo = (dx, dz) => -Math.atan2(dx * CAM_RIGHT.x + dz * CAM_RIGHT.z, -(dx * vg.x + dz * vg.z));

  // one gun port firing outward along (nx, nz): a flame tongue out of the port, then its own puff of powder smoke
  function muzzle(x, y, z, nx, nz, big = 1, flash = 1) {
    const along = (sp, spread) => { const a = rand(-spread, spread); return [(nx * Math.cos(a) - nz * Math.sin(a)) * sp, (nz * Math.cos(a) + nx * Math.sin(a)) * sp]; };
    const rot = turnTo(nx, nz);
    glow.emit({ x: x + nx * 0.4, y, z: z + nz * 0.4, vx: nx * 2, vz: nz * 2, life: 0.08, size: 1 * flash, grow: 0.5, color: FLAME[1], alpha: 0.7, shape: SHAPE.tongue, rot });
    soot.emit({ x: x + nx * 0.5, y, z: z + nz * 0.5, vx: nx * 3, vz: nz * 3, life: 0.1, size: 0.85 * flash, grow: 0.6, color: FLAME[2], alpha: 0.9, shape: SHAPE.tongue, rot: rot + rand(-0.15, 0.15) });
    for (const sd of [-1, 1]) soot.emit({ x: x + nx * 0.35, y, z: z + nz * 0.35, vx: nx * 2 - nz * sd * 2, vz: nz * 2 + nx * sd * 2, life: 0.07, size: 0.5 * flash, color: FLAME[3], alpha: 0.8, shape: SHAPE.tongue, rot: rot + sd * 0.9 });
    for (let i = 0; i < 3; i++) soot.emit({ x: x + nx * 0.4, y: y + 0.05, z: z + nz * 0.4, vx: nx * rand(2, 5), vz: nz * rand(2, 5), life: rand(0.07, 0.12), size: rand(0.5, 0.8) * flash, grow: -0.3, color: FLAME[3], alpha: 0.8, shape: SHAPE.tongue, rot: rot + rand(-0.5, 0.5) });
    const n = Math.round(rand(5, 8) * big);   // a cone punched outboard, then rising and shearing downwind
    for (let i = 0; i < n; i++) { const [vx, vz] = along(rand(3, 10), 0.28);
      soot.emit({ x: x + nx * rand(0.3, 0.7), y: y + rand(0.1, 0.4), z: z + nz * rand(0.3, 0.7), vx: vx + 1, vz: vz - 0.4, vy: rand(0.5, 1), gravity: -0.4, drag: 1.8, sway: 0.25,
        life: rand(3, 4.8), size: rand(0.3, 1) * big, grow: rand(2, 3.4), color: pick(SMOKE), alpha: rand(0.4, 0.62), shape: SHAPE.puff, spin: rand(-0.25, 0.25), rot: rand(-0.3, 0.3) }); }
  }
  function splash(x, z) {   // a narrow white spout, its droplets falling back, and a flat foam ring left on the water
    for (let i = 0; i < 11; i++) soot.emit({ x: x + rand(-0.15, 0.15), y: 0.1 + i * 0.25, z: z + rand(-0.15, 0.15), vy: rand(4.5, 6.5) - i * 0.2, gravity: 11, drag: 0.5, life: rand(0.65, 0.9), size: rand(0.5, 0.75) * (1 - i * 0.04), grow: 0.6, color: SPRAY[i % 2], alpha: 0.8, shape: SHAPE.puff, rot: rand(-0.6, 0.6) });
    for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, out = rand(0.3, 1.3);
      soot.emit({ x: x + rand(-0.1, 0.1), y: rand(0.3, 2.2), z: z + rand(-0.1, 0.1), vx: Math.cos(a) * out, vz: Math.sin(a) * out, vy: rand(2.5, 6), gravity: 12, drag: 0.2, life: rand(0.8, 1.2), size: rand(0.09, 0.17), color: SPRAY[0], alpha: 0.85, shape: SHAPE.dot }); }
    for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2 + rand(-0.1, 0.1);
      soot.emit({ x, y: 0.04, z, vx: Math.cos(a) * rand(0.9, 1.4), vz: Math.sin(a) * rand(0.9, 1.4), vy: 0, drag: 1.6, life: rand(1.4, 1.9), size: rand(0.18, 0.28), grow: 0.6, color: [0.7, 0.78, 0.82], alpha: 0.4, shape: SHAPE.dot }); }
  }
  function impact(x, y, z, onShip) {   // a quick orange spark, dark splinters thrown out, and a brown-grey puff that hangs
    for (let i = 0; i < 4; i++) { const a = Math.random() * Math.PI * 2;
      soot.emit({ x, y, z, vx: Math.cos(a), vz: Math.sin(a), life: rand(0.08, 0.13), size: rand(0.8, 1.2), grow: 0.3, color: FLAME[1 + (i & 1)], alpha: 0.95, shape: SHAPE.tongue, rot: a }); }
    glow.emit({ x, y, z, life: 0.1, size: 1.3, grow: 0.4, color: FLAME[2], alpha: 0.5, shape: SHAPE.dot });
    for (let i = 0; i < 8; i++) glow.emit({ x, y, z, vx: rand(-3, 3), vz: rand(-3, 3), vy: rand(0.5, 3), gravity: 6, drag: 1.5, life: rand(0.2, 0.45), size: rand(0.08, 0.16), color: FLAME[1 + Math.floor(Math.random() * 2)], alpha: 0.9, shape: SHAPE.ember });
    for (let i = 0; i < 16; i++) soot.emit({ x, y, z, vx: rand(-3.4, 3.4), vz: rand(-3.4, 3.4), vy: rand(2, 5.5), gravity: 9, drag: 0.6, life: rand(0.8, 1.4), size: rand(0.3, 0.55), color: pick(onShip ? WOOD : [[0.5, 0.45, 0.38], [0.4, 0.36, 0.3]]), alpha: 1, shape: SHAPE.shard, spin: rand(-9, 9), rot: rand(0, 6.3) });
    for (let i = 0; i < 5; i++) soot.emit({ x: x + rand(-0.4, 0.4), y: y + rand(0, 0.4), z: z + rand(-0.4, 0.4), vx: rand(-0.5, 0.5) + 0.4, vz: rand(-0.5, 0.5) - 0.2, vy: rand(0.6, 1.2), drag: 1.4, sway: 0.25,
      life: rand(2.2, 3.4), size: rand(0.7, 1.1), grow: 2.4, color: pick(onShip ? [[0.42, 0.37, 0.31], [0.34, 0.3, 0.26]] : [[0.55, 0.5, 0.43], [0.47, 0.43, 0.37]]), alpha: 0.8, shape: SHAPE.puff, spin: rand(-0.3, 0.3), rot: rand(-0.3, 0.3) });
  }
  function dust(x, z) {
    for (let i = 0; i < 12; i++) { const a = Math.random() * Math.PI * 2;
      soot.emit({ x, y: 0.15, z, vx: Math.cos(a) * rand(0.6, 2), vz: Math.sin(a) * rand(0.6, 2), vy: rand(0.6, 2), gravity: 2, drag: 1.6, life: rand(0.9, 1.5), size: rand(0.5, 0.9), grow: 1.5, color: [0.56, 0.5, 0.41], alpha: 0.65, shape: SHAPE.puff, rot: rand(-1, 1) }); }
  }
  // where ball k lands: c.spread[k] = [across, along] of the line of fire, from the sim
  function landings(c, delay) {
    const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d, r = c.hitR ?? 4;
    (c.spread || [[0, 0]]).forEach(([a, b], k) => {
      const x = c.tx - uz * a + ux * b, z = c.tz + ux * a + uz * b, hit = Math.hypot(a, b) <= r;
      later.push({ at: clock + delay(k) + (c.flightTicks ?? 10) / 20, fn: () => hit ? impact(x, c.key ? 1.2 : 1.4, z, !c.key) : c.key ? dust(x, z) : splash(x, z) });
    });
  }
  function broadside(c) {
    const H = HULL.warship, [hx, hz] = head(c.heading), side = Math.sign((c.tx - c.x) * hz - (c.tz - c.z) * hx) || 1, nx = hz * side, nz = -hx * side;
    const n = Math.min(H.ports, Math.max(1, c.balls ?? 8)), gap = 0.06;
    for (let k = 0; k < n; k++) { const t = -H.half + (k + 0.5) * (2 * H.half / n), x = c.x + hx * -t + nx * H.out, z = c.z + hz * -t + nz * H.out;   // bow (front) first
      later.push({ at: clock + k * gap + rand(0, 0.02), fn: () => muzzle(x, H.port, z, nx, nz, 1) }); }
    landings(c, k => k * gap);
  }
  function bow(c) {
    const H = HULL.transport, [hx, hz] = head(c.heading), x = c.x + hx * H.bow, z = c.z + hz * H.bow, dx = c.tx - x, dz = c.tz - z, d = Math.hypot(dx, dz) || 1;
    muzzle(x, H.port + 0.3, z, dx / d, dz / d, 1.7, 1.1);
    landings(c, () => 0);
  }
  // the deck Gatling's shot: flash and tracer from the gun on the after deck, along its aim
  function deckShot(c) {
    const H = HULL.warship, [hx, hz] = head(c.heading), fx = Math.cos(c.ang ?? 0), fz = Math.sin(c.ang ?? 0);
    const mx = c.x + hx * H.gun + fx * 0.55, mz = c.z + hz * H.gun + fz * 0.55, y = H.deck + 0.2;
    const rot = turnTo(fx, fz);
    soot.emit({ x: mx + fx * 0.3, y, z: mz + fz * 0.3, vx: fx * 2, vz: fz * 2, life: 0.05, size: rand(0.45, 0.65), color: FLAME[1 + (Math.random() < 0.5)], alpha: 0.95, shape: SHAPE.tongue, rot: rot + rand(-0.2, 0.2) });
    const a = rand(-0.05, 0.05), bx = fx * Math.cos(a) - fz * Math.sin(a), bz = fz * Math.cos(a) + fx * Math.sin(a), V = 70, reach = (c.reach ?? 12) + rand(-0.6, 0.8);
    for (let k = 0; k < 8; k++)   // the round: a streak, as the land Gatling's
      glow.emit({ x: mx - bx * k * 0.16, y: y - k * 0.005, z: mz - bz * k * 0.16, vx: bx * V, vz: bz * V, vy: -y / (reach / V) * 0.9, life: reach / V, size: 0.2 - k * 0.018, color: [1, 0.86 - k * 0.05, 0.55 - k * 0.05], alpha: 1 - k * 0.1, shape: SHAPE.dot });
    later.push({ at: clock + reach / V, fn: () => { const ix = mx + bx * reach, iz = mz + bz * reach;   // a kick of dust at their feet
      for (let i = 0; i < 3; i++) soot.emit({ x: ix + rand(-0.3, 0.3), y: 0.1, z: iz + rand(-0.3, 0.3), vx: rand(-0.5, 0.5), vz: rand(-0.5, 0.5), vy: rand(1, 2), gravity: 2, drag: 1.4, life: rand(0.5, 0.9), size: rand(0.4, 0.65), grow: 1.4, color: [0.66, 0.58, 0.45], alpha: 0.75, shape: SHAPE.puff, rot: rand(-1, 1) }); } });
    soot.emit({ x: mx + rand(-0.2, 0.2), y: y + 0.05, z: mz + rand(-0.2, 0.2), vx: fx * 0.8 + 0.3, vz: fz * 0.8 - 0.1, vy: rand(0.2, 0.45), drag: 1.6, sway: 0.3, life: rand(1.6, 2.4), size: rand(0.2, 0.35), grow: 2.5, color: SMOKE[2], alpha: 0.38, shape: SHAPE.puff, spin: rand(-0.3, 0.3), rot: rand(-0.3, 0.3) });   // the burst's smoke hangs round the gun
  }

  // ---- the painted deck gun: a squat iron barrel cluster on a small carriage, turned to its aim on screen ----
  let gunTex = null;
  const gunMap = () => gunTex ||= (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    g.translate(32, 32);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(-2, 5, 13, 5, 0, 0, Math.PI * 2); g.fill();   // its shadow on the deck
    g.fillStyle = '#4a3a2a'; g.fillRect(-12, -1, 12, 8);   // the carriage
    g.fillStyle = '#2a2622'; g.beginPath(); g.arc(-9, 8, 4, 0, Math.PI * 2); g.arc(-1, 8, 4, 0, Math.PI * 2); g.fill();   // wheels
    g.fillStyle = '#25272a'; g.fillRect(-6, -5, 26, 7);   // the barrel bundle
    g.fillStyle = '#5c5f63'; g.fillRect(-6, -5, 26, 2);   // its lit top
    g.fillStyle = '#16171a'; g.fillRect(18, -6, 4, 9);   // the muzzle ring
    g.fillStyle = '#7a6a4a'; g.fillRect(-11, -8, 4, 7);   // the crank box
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const guns = new Map();   // ship id -> sprite
  const aims = new Map();   // ship id -> last aim angle
  function deckGun(s, e, place) {
    let m = guns.get(e.id);
    if (!m) { m = new THREE.Sprite(new THREE.SpriteMaterial({ map: gunMap(), transparent: true, depthWrite: false, depthTest: false })); m.scale.setScalar(1.35); m.renderOrder = 99700; scene.add(m); guns.set(e.id, m); }
    const H = HULL.warship, [hx, hz] = head(e.heading), ang = e.gat?.ang ?? aims.get(e.id) ?? Math.atan2(hz, hx);
    aims.set(e.id, ang);
    const p = s.pos || s.thing.mesh.position, lean = s.listY || 0;
    m.position.set(p.x + hx * H.gun, H.deck - lean, p.z + hz * H.gun);
    const dx = Math.cos(ang), dz = Math.sin(ang), sx = dx * CAM_RIGHT.x + dz * CAM_RIGHT.z, sy = -(dx * vg.x + dz * vg.z);   // the aim as seen on screen
    m.material.rotation = Math.atan2(sy, sx) + (s.listRoll || 0);
    m.visible = place === 'world' && s.thing.mesh.visible !== false;
  }

  // ---- damage stages ----
  const fires = new Map();   // ship id -> emit clock
  function stagesFor(e, s, dt) {
    const k = (e.hp ?? 1) / (e.maxHp || 1), H = HULL[e.warUnit] || HULL.warship, [hx, hz] = head(e.heading), p = s.pos || s.thing.mesh.position;
    const seed = String(e.id).split('').reduce((n, ch) => n * 31 + ch.charCodeAt(0) & 0xffff, 7);
    const spot = j => { const t = (((seed >> (j * 3)) & 7) / 7 - 0.5) * H.half * 1.4; return [p.x + hx * t, p.z + hz * t]; };
    let acc = (fires.get(e.id) || 0) + dt;
    if (k < (stages.smoke ?? 0.66)) {
      const sinking = k < 0.25, rate = sinking ? 28 : k < (stages.fire ?? 0.5) ? 16 : 6 + (0.66 - k) * 30;
      while (acc > 1 / rate) { acc -= 1 / rate; const [x, z] = spot(Math.floor(Math.random() * 3)), heavy = k < (stages.fire ?? 0.5);
        soot.emit({ x: x + rand(-0.15, 0.15), y: H.deck + 0.3 + rand(0, 0.2), z: z + rand(-0.15, 0.15), vx: rand(1, 1.6), vz: rand(-0.6, -0.3), vy: rand(1.2, 1.9), gravity: -0.15, drag: 0.35, sway: 0.35,
          life: rand(4, 5.5), size: rand(0.3, 0.6) * (sinking ? 1.4 : heavy ? 1.2 : 1), grow: rand(3, 4.5), color: sinking ? DARK[Math.floor(Math.random() * 2)] : pick(DARK), alpha: sinking ? 0.85 : heavy ? 0.7 : 0.45, shape: SHAPE.puff, spin: rand(-0.3, 0.3), rot: rand(-0.4, 0.4) }); }
      if (k < (stages.fire ?? 0.5)) for (let j = 0; j < (k < 0.25 ? 3 : 2); j++) { const fl = 0.55 + 0.45 * Math.sin(clock * (5 + j * 2.3) + j * 1.7) * Math.sin(clock * (3.1 + j) + j), big = [1.25, 0.8, 1][j];   // each fire its own size and flicker
        if (Math.random() > dt * 34 * fl) continue; const [x, z] = spot(j);
        const fx0 = x + rand(-0.35, 0.35), fz0 = z + rand(-0.35, 0.35), sz = rand(0.42, 0.7) * big * (0.7 + fl * 0.5), up = rand(1.4, 2.6);
        for (let t = 0; t < 3; t++) soot.emit({ x: fx0, y: H.deck - 0.1 + t * 0.18 * big, z: fz0, vx: rand(-0.15, 0.15) + 0.2, vz: rand(-0.15, 0.15), vy: up, drag: 2.2, life: rand(0.3, 0.55) * (1 - t * 0.2), size: sz * (1.5 - t * 0.35), grow: -0.5, color: FIRE[Math.min(3, t + Math.floor(Math.random() * 2))], alpha: 0.9, shape: SHAPE.tongue, rot: rand(-0.35, 0.35) + 0.15 });   // a tongue: wide at the foot, thin at the tip
        if (Math.random() < 0.5) glow.emit({ x, y: H.deck - 0.1, z, life: rand(0.2, 0.35), size: rand(1.6, 2.2) * big, color: FLAME[2], alpha: 0.16 * (0.6 + fl), shape: SHAPE.dot });   // its warm light on the deck
        if (Math.random() < 0.3) glow.emit({ x, y: H.deck + 0.4, z, vx: rand(-0.6, 0.6), vz: rand(-0.6, 0.6), vy: rand(1.5, 3), drag: 1, life: rand(0.6, 1.2), size: rand(0.05, 0.09), color: [1, 0.6, 0.2], alpha: 0.9, shape: SHAPE.ember }); }
    } else acc = 0;
    fires.set(e.id, acc);
    // listing: the hull leans toward the camera's right and sits lower (eased in)
    const want = k < (stages.list ?? 0.15) ? 1 : 0;
    s.listK = (s.listK ?? 0) + (want - (s.listK ?? 0)) * Math.min(1, dt * 1.5);
    s.roll = -0.2 * s.listK; s.listRoll = s.roll; s.listY = 1.1 * s.listK;   // roll: the sprite turns about its waterline (render/characters.js)
    if (s.listY > 0.001) s.thing.mesh.position.y -= s.listY;   // after the sprite's own update this frame
    if (s.listK > 0.3) {   // foam washing along the low side, wreckage spreading on the water
      const near = Math.sign(hz * vg.x - hx * vg.z) || 1;   // the hull side toward the camera: a broken line of churned foam hides where it meets the water
      for (let n = Math.floor(dt * 160 + Math.random()); n > 0; n--) { const t = rand(-1, 1) * H.half * (1 - Math.random() * 0.15), off = rand(0.8, 1.2), x = p.x + hx * t + hz * near * off, z = p.z + hz * t - hx * near * off;
        soot.emit({ x, y: rand(0.03, 0.12), z, vx: hz * near * rand(0.1, 0.4) + 0.2, vz: -hx * near * rand(0.1, 0.4), vy: rand(0, 0.15), drag: 1, life: rand(0.6, 1.1), size: rand(0.16, 0.3) * s.listK, grow: 0.8, color: SPRAY[1 + Math.floor(Math.random() * 2)], alpha: rand(0.3, 0.5), shape: SHAPE.dot }); }
      if (Math.random() < dt * 7) { const a = Math.random() * Math.PI * 2, r = rand(1.5, H.half), x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        soot.emit({ x, y: 0.04, z, vx: Math.cos(a) * 0.25, vz: Math.sin(a) * 0.25, vy: 0, drag: 0.3, life: rand(4, 6), size: rand(0.35, 0.6), color: pick(WOOD), alpha: 1, shape: SHAPE.shard, spin: rand(-0.5, 0.5) }); }
    }
  }

  return {
    cast(c) {
      if (c.kind === 'shipBroadside') broadside(c);
      else if (c.kind === 'shipCannon') bow(c);
      else if (c.kind === 'gatlingShot' && c.deck) deckShot(c);
    },
    update(state, sprites, dt, place) {
      clock += dt;
      for (let i = later.length - 1; i >= 0; i--) if (later[i].at <= clock) { const f = later[i].fn; later.splice(i, 1); f(); }
      const seen = new Set();
      if (place === 'world') for (const e of Object.values(state.entities)) {
        if (!e.ship || e.dead) continue;
        const s = sprites.get(e.id); if (!s?.thing?.mesh) continue;
        seen.add(e.id);
        stagesFor(e, s, dt);
        if (e.warUnit === 'warship') deckGun(s, e, place);
      }
      for (const [id, m] of guns) if (!seen.has(id)) { scene.remove(m); m.material.dispose(); guns.delete(id); aims.delete(id); }
      for (const id of [...fires.keys()]) if (!seen.has(id)) fires.delete(id);
      glow.update(dt); soot.update(dt); cards.update(dt);
    },
  };
}
