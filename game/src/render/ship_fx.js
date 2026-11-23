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
//  - S6: repair at the yard (s.mending): hammer sparks along the deck. A sunk ship goes under: it lurches, the sea
//    closes over it from the waterline up (render/shading.js uSea), steam, foam, bubbles, wreckage. The troops in its
//    hold (drowned) bob half under in splash rings, then go under; the hero and crew (washed) come up the shore on a wave.
//   createShipFx({ scene, stages }) -> { cast(c, state), update(state, sprites, dt, place) }
import * as THREE from 'three';
import { VIEW_DIR, CAM_RIGHT, CAM_UP } from './iso.js';
import { createFoam } from './ship_marks.js';
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
    if (s.listY > 0.001) { s.thing.mesh.position.y -= s.listY; sea(s, p.x, p.z, keel(e.heading, s.roll), 0.4); }   // after the sprite's own update this frame; S6: the sea hides the low hull
    else dry(s);
    if (s.listK > 0.3) {   // foam washing along the low side, wreckage spreading on the water
      const near = Math.sign(hz * vg.x - hx * vg.z) || 1;   // the hull side toward the camera: a broken line of churned foam hides where it meets the water
      for (let n = Math.floor(dt * 160 + Math.random()); n > 0; n--) { const t = rand(-1, 1) * H.half * (1 - Math.random() * 0.15), off = rand(0.8, 1.2), x = p.x + hx * t + hz * near * off, z = p.z + hz * t - hx * near * off;
        soot.emit({ x, y: rand(0.03, 0.12), z, vx: hz * near * rand(0.1, 0.4) + 0.2, vz: -hx * near * rand(0.1, 0.4), vy: rand(0, 0.15), drag: 1, life: rand(0.6, 1.1), size: rand(0.16, 0.3) * s.listK, grow: 0.8, color: SPRAY[1 + Math.floor(Math.random() * 2)], alpha: rand(0.3, 0.5), shape: SHAPE.dot }); }
      if (Math.random() < dt * 7) { const a = Math.random() * Math.PI * 2, r = rand(1.5, H.half), x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        soot.emit({ x, y: 0.04, z, vx: Math.cos(a) * 0.25, vz: Math.sin(a) * 0.25, vy: 0, drag: 0.3, life: rand(4, 6), size: rand(0.35, 0.6), color: pick(WOOD), alpha: 1, shape: SHAPE.shard, spin: rand(-0.5, 0.5) }); }
    }
  }

  // ---- S6: repair, going under, drowning, washed ashore (sim/frontier/ships.js sink(), mend()) ----------------
  // on the water, under the ships (render/ship_marks.js foam flecks): foam, a dark hole where a hull goes down, the
  // sheet of a wave running up the sand and the wet sand it leaves
  const paint = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t; };
  const blot = (g, x, y, rx, ry, a, rot = 0) => { g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, ry / rx); const q = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    q.addColorStop(0, `rgba(255,255,255,${a})`); q.addColorStop(0.7, `rgba(255,255,255,${a * 0.85})`); q.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = q; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore(); };
  // broken streaks of foam, lying flat (squashed 2:1 on the iso ground), with fairly hard painted edges
  const STREAK = paint(64, 64, g => { for (const [x, y, rx, a] of [[30, 30, 22, 0.8], [20, 36, 12, 0.7], [42, 26, 13, 0.75], [36, 38, 9, 0.6], [16, 27, 7, 0.55]]) blot(g, x, y, rx, rx * 0.32, a, -0.12); });
  // timbers on the water: weathered planks and a spar, flat, each with a thin rim of foam (two sets, for variety)
  const planks = set => paint(64, 64, g => { for (const [x, y, w, h, r] of set) { g.save(); g.translate(x, y); g.rotate(r); g.scale(1, 0.5);
      blot(g, -w / 2, 0, 5, 3, 0.35); blot(g, w / 2, 0, 6, 3, 0.4);   // a little foam where the water breaks on its ends
      g.fillStyle = '#2a2119'; g.fillRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
      g.fillStyle = '#3e3125'; g.fillRect(-w / 2, -h / 2, w, h); g.fillStyle = '#54432f'; g.fillRect(-w / 2, -h / 2, w, h * 0.35); g.restore(); } });
  const PLANK_A = planks([[32, 32, 44, 6, 0.25]]), PLANK_B = planks([[30, 34, 22, 9, -0.6]]);
  const SAIL = paint(64, 64, g => { g.translate(32, 32); g.scale(1, 0.5); g.rotate(0.4); g.fillStyle = 'rgba(120,110,92,0.85)'; g.beginPath(); g.moveTo(-18, -10); g.lineTo(14, -14); g.lineTo(20, 8); g.lineTo(-6, 16); g.lineTo(-20, 6); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(70,60,48,0.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-16, -2); g.lineTo(18, -4); g.stroke(); });
  const foam = createFoam(scene, 3000, [0.78, 0.83, 0.85], 2, STREAK), lip = createFoam(scene, 600, [0.92, 0.95, 0.96], 2.02, STREAK);
  const deep = createFoam(scene, 600, [0.04, 0.08, 0.12], 1.9), sheet = createFoam(scene, 900, [0.36, 0.47, 0.54], 1.95);
  const wreckA = createFoam(scene, 120, [1, 1, 1], 2.01, PLANK_A), wreckB = createFoam(scene, 120, [1, 1, 1], 2.01, PLANK_B), wreckC = createFoam(scene, 40, [1, 1, 1], 2.005, SAIL);
  // marks lying flat on the water: a broken ring of foam spreading and thinning; a band of wet sand drying
  const RING = paint(128, 128, g => { let a = Math.random() * 6.3; const stop = a + Math.PI * 2 * (0.55 + Math.random() * 0.25);   // a broken rim of foam: a few eroded arcs, gaps between
    while (a < stop) { const n = 1 + Math.floor(Math.random() * 4), r = 50 + Math.sin(a * 3) * 3 + Math.random() * 4;
      for (let i = 0; i < n; i++, a += 0.06) if (Math.random() < 0.8) blot(g, 64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 2 + Math.random() * 5, 1.2 + Math.random() * 2.2, 0.3 + Math.random() * 0.6, a + Math.PI / 2);
      a += 0.2 + Math.random() * 0.7; } });
  // a scalloped line of foam (a wave's lip, the edge it leaves on the sand), the length along x
  const LINE = paint(256, 32, g => { for (let x = 4; x < 252; x += 3 + Math.random() * 4) { const y = 16 + Math.sin(x * 0.11) * 3 + Math.sin(x * 0.37) * 1.5, e = Math.min(1, x / 40, (256 - x) / 40);
      blot(g, x, y, 5 + Math.random() * 6, 2 + Math.random() * 2.5, (0.55 + Math.random() * 0.4) * e, Math.random() * 0.4 - 0.2); } });
  const EDGE = paint(256, 32, g => { for (let x = 4; x < 252; x += 2 + Math.random() * 5) { if (Math.sin(x * 0.05) + Math.random() * 0.8 < -0.2) { x += 6; continue; }   // gaps
      blot(g, x, 16 + Math.sin(x * 0.09) * 4, 3 + Math.random() * 7, 1 + Math.random() * 3, 0.4 + Math.random() * 0.5, Math.random() * 0.5 - 0.25); } });
  // shallow water running in, and the wet sand it leaves (Tim 2026-11-23: no square edges): a lumpy band of soft blots whose
  // edges undulate all the way round, three variants so the patches of one wave differ
  const lumpy = (rgb, a) => paint(128, 64, g => { const ph = Math.random() * 6.3, ph2 = Math.random() * 6.3;
      for (let k = 0; k < 46; k++) { const x = 14 + Math.random() * 100, end = Math.min(1, (x - 8) / 26, (120 - x) / 26), y = 32 + Math.sin(x * 0.07 + ph) * 6 + Math.sin(x * 0.19 + ph2) * 3 + (Math.random() - 0.5) * 10 * end;
        const r = (7 + Math.random() * 9) * (0.55 + 0.45 * end), q = g.createRadialGradient(x, y, 0, x, y, r);
        q.addColorStop(0, `rgba(${rgb},${a * (0.5 + 0.5 * end)})`); q.addColorStop(0.6, `rgba(${rgb},${a * 0.6 * (0.5 + 0.5 * end)})`); q.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = q; g.beginPath(); g.ellipse(x, y, r * 1.3, r, (Math.random() - 0.5) * 0.6, 0, Math.PI * 2); g.fill(); } });
  const BODYS = [0, 1, 2].map(() => lumpy('58,80,94', 0.42)), WETS = [0, 1, 2].map(() => lumpy('30,27,20', 0.5));
  const FLAT = new THREE.PlaneGeometry(1, 1), flats = [];
  function flat(map, x, z, { r0 = 1, r1 = 1, len = 1, life = 1, alpha = 0.6, rot = Math.random() * 6.3, color = [0.68, 0.75, 0.78], order = 2.01, y = 0.035, vx = 0, vz = 0, drag = 0, fadeIn = 0.08 }) {
    const m = new THREE.Mesh(FLAT, new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, color: new THREE.Color(...color), opacity: 0 }));
    m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, y, z); m.renderOrder = order; scene.add(m);
    flats.push({ m, t: 0, r0, r1, len, life, alpha, vx, vz, drag, fadeIn });
  }
  function flatsUpdate(dt) {
    for (let i = flats.length - 1; i >= 0; i--) { const f = flats[i]; f.t += dt; const k = Math.min(1, f.t / f.life);
      if (k >= 1) { scene.remove(f.m); f.m.material.dispose(); flats.splice(i, 1); continue; }
      const d = Math.exp(-f.drag * dt); f.vx *= d; f.vz *= d; f.m.position.x += f.vx * dt; f.m.position.z += f.vz * dt;
      const r = f.r0 + (f.r1 - f.r0) * (1 - (1 - k) ** 2); f.m.scale.set(r * 2 * f.len, r * 2, 1); f.m.material.opacity = f.alpha * Math.min(1, f.t / f.fadeIn) * (1 - k) ** 1.3; }
  }
  // a waterline on a sprite (render/shading.js uSea): what lies below the line through (x, 0, z) along slope on
  // screen is under water and not drawn; a band just above it darkens toward the sea
  const uni = s => s.material?.uniforms || s.thing?.mesh?.material?.uniforms;
  const sea = (s, x, z, slope = 0, band = 0.4) => { const u = uni(s); if (u?.uSea) { u.uSea.value.set(x, 0, z, band); u.uSeaSlope.value = slope; } return u; };
  const dry = s => { const u = uni(s); if (u?.uSea && u.uSea.value.w) u.uSea.value.w = 0; };
  const fade = (s, k) => { const u = uni(s); if (u?.uOpacity) u.uOpacity.value *= Math.max(0, Math.min(1, k)); if (s.shadow) s.shadow.visible = false; };
  const UPY = Math.max(0.3, CAM_UP.y);   // screen up per unit of world height
  const hash = id => (String(id).split('').reduce((n, ch) => n * 31 + ch.charCodeAt(0) >>> 0, 7) % 1000) / 1000;
  // the hull's long axis as a slope on screen; a rolled hull tilts its waterline with it, so it goes down along its own line
  const keel = (h, roll = 0) => { const [hx, hz] = head(h), sx = hx * CAM_RIGHT.x + hz * CAM_RIGHT.z, sy = hx * CAM_UP.x + hz * CAM_UP.z; return Math.max(-0.7, Math.min(0.7, (Math.abs(sx) < 0.05 ? 0 : sy / sx) + Math.tan(roll))); };
  const ring = (x, z, r0, r1, life, alpha = 0.6) => flat(RING, x, z, { r0: r0 * rand(0.85, 1.2), r1: r1 * rand(0.8, 1.25), life, alpha: alpha * 0.6, color: [0.5, 0.58, 0.63] });   // a broken ring of foam spreading and thinning
  const wreck = p => (Math.random() < 0.15 ? wreckC : Math.random() < 0.55 ? wreckA : wreckB).emit(p);
  function spray(x, y, z, n, up = 3, out = 0.8, size = 0.3) {   // water thrown up: small grey-blue tufts, falling back
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, o = rand(0.2, 1) * out;
      soot.emit({ x, y, z, vx: Math.cos(a) * o, vz: Math.sin(a) * o, vy: rand(0.6, 1) * up, gravity: 10, drag: 0.6, life: rand(0.45, 0.7), size: size * rand(0.7, 1.2), grow: 0.8, color: SPRAY[1 + (i % 2)], alpha: 0.38, shape: SHAPE.puff, rot: rand(-1, 1) }); }
  }
  // repair at the yard: carpenters at three or four places along the deck, each a burst of sparks under the hammer,
  // a little smoke from the work, the yard lamp-light on the planks; the health bar's end pulses (render/ship_marks.js)
  const taps = new Map();   // ship id -> [{ next, t }]
  function mending(e, s, dt) {
    const H = HULL[e.warUnit] || HULL.warship, [hx, hz] = head(e.heading), p = s.pos || s.thing.mesh.position, near = Math.sign(hz * vg.x - hx * vg.z) || 1;
    const T = taps.get(e.id) || [-0.7, -0.2, 0.3, 0.72].map((t, k) => ({ t, next: clock + k * 0.17 + rand(0, 0.1), n: 0 }));
    taps.set(e.id, T);
    for (const c of T) {
      if (clock < c.next) continue;
      c.next = clock + (++c.n % 4 ? rand(0.26, 0.36) : rand(0.8, 1.3));   // three or four blows, then a pause
      const t = c.t * H.half, x = p.x + hx * t + hz * near * 0.6, z = p.z + hz * t - hx * near * 0.6, y = H.deck - 0.1 - (s.listY || 0);
      glow.emit({ x, y, z, life: 0.08, size: 0.9, color: FLAME[0], alpha: 1, shape: SHAPE.sparkle, rot: Math.random() });   // the blow
      const a0 = Math.random() * Math.PI * 2;   // the sparks fly off the hammer one way, a short fan of bright streaks
      for (let i = 0, n = Math.round(rand(4, 7)); i < n; i++) { const a = a0 + rand(-0.5, 0.5), o = rand(5, 8), dx = Math.cos(a), dz = Math.sin(a);
        for (let k = 0; k < 3; k++) glow.emit({ x: x + dx * (0.1 - k * 0.07), y: y + 0.1, z: z + dz * (0.1 - k * 0.07), vx: dx * o, vz: dz * o, vy: rand(1.5, 3), gravity: 9, drag: 2, life: rand(0.25, 0.35), size: 0.14 - k * 0.03, color: FLAME[k ? 1 : 0], alpha: 1 - k * 0.25, shape: SHAPE.dot }); }
    }
  }
  // going under (sim: dead, diedAt): it lurches over, then goes down along its own waterline with the masts last, in a
  // dark hole of churned water; the fires die in steam, foam rings it, timbers and spars drift off
  const SINK = 6.5;   // seconds
  const sunk = new Map();   // ship id -> { at, y, roll }
  function goingDown(e, x, z) {
    const H = HULL[e.warUnit] || HULL.warship, [hx, hz] = head(e.heading);
    for (let i = 0; i < 12; i++) { const t = rand(-1, 1) * H.half, sd = Math.random() < 0.5 ? -1 : 1;
      spray(x + hx * t + hz * sd * 1.2, 0.3, z + hz * t - hx * sd * 1.2, 2, 4, 1.4, 0.5); }
    for (let i = 0; i < 7; i++) { const a = Math.random() * Math.PI * 2;   // timbers thrown off as she breaks
      soot.emit({ x: x + Math.cos(a) * 2, y: rand(1, 2.2), z: z + Math.sin(a) * 1.2, vx: Math.cos(a) * rand(1.5, 3), vz: Math.sin(a) * rand(1.5, 3), vy: rand(2.5, 4), gravity: 9, drag: 0.4, life: rand(1, 1.3), size: rand(0.6, 1), color: pick(WOOD), alpha: 1, shape: SHAPE.shard, spin: rand(-6, 6), rot: rand(0, 6.3) }); }
  }
  function sinking(e, s, dt, tick) {
    const p = s.pos || s.thing.mesh.position;
    if (!sunk.has(e.id)) { const ago = Math.max(0, (tick - (e.diedAt ?? tick)) / 20); sunk.set(e.id, { at: clock - ago, y: s.listY || 0, roll: s.roll || 0, drift: 0 }); if (ago < 0.6) goingDown(e, p.x, p.z); }
    const S0 = sunk.get(e.id), t = clock - S0.at, k = Math.min(1, t / SINK), H = HULL[e.warUnit] || HULL.warship, [hx, hz] = head(e.heading), CW = s.cellWorld ?? 16;
    const lurch = Math.min(1, t / 0.55) ** 0.7, under = Math.min(1, Math.max(0, (t - 0.6) / (SINK - 0.9)) ** 1.3);
    s.roll = S0.roll + (-0.28 - S0.roll) * lurch - 0.36 * under; s.listRoll = s.roll;   // she goes down by the stern, the bow rising
    s.listY = S0.y + 0.7 * lurch + CW * 0.29 / UPY * under;   // the masthead goes under at the end
    s.thing.mesh.position.y -= s.listY;
    sea(s, p.x, p.z, keel(e.heading, s.roll * 0.4), 0.5 + 10 * under);   // what is left above goes dark with the sea as she goes
    fade(s, (SINK + 0.3 - t) / 0.6);
    if (k >= 1) return;
    const r = H.half * (1 - under * 0.5);
    if ((S0.drift -= dt) <= 0) { S0.drift = 0.25;   // the dark hole of disturbed water round the hull
      for (let j = 0; j < 3; j++) { const u = rand(-0.8, 0.8) * r; deep.emit({ x: p.x + hx * u, y: 0.02, z: p.z + hz * u, vx: 0, vz: 0, drag: 1, life: 1.4, size: rand(4.5, 6.5) * (1 - under * 0.4), grow: 1.15, alpha: 0.32 }); } }
    for (let n = Math.floor(dt * 60 * (1 - under * 0.6) + Math.random()); n > 0; n--) {   // a broken collar of foam where the sea meets the hull
      const u = rand(-1.05, 1.05) * H.half * (1 - under * 0.4); foam.emit({ x: p.x + hx * u + vg.x * rand(0.1, 0.5), y: 0.03, z: p.z + hz * u + vg.z * rand(0.1, 0.5), vx: vg.x * 0.2, vz: vg.z * 0.2, drag: 1, life: rand(0.5, 0.9), size: rand(0.5, 0.9), grow: 1.3, alpha: rand(0.4, 0.65) }); }
    for (let n = Math.floor(dt * 25 * (1 - under * 0.5) + Math.random()); n > 0; n--) {   // foam boiling along the waterline and round the hull
      const u = rand(-1.1, 1.1) * r, sd = Math.random() < 0.5 ? -1 : 1, off = rand(0, 1.5), x = p.x + hx * u + hz * sd * off, z = p.z + hz * u - hx * sd * off;
      foam.emit({ x, y: 0.03, z, vx: hz * sd * rand(0.2, 0.7), vz: -hx * sd * rand(0.2, 0.7), drag: 0.7, life: rand(1, 1.8), size: rand(0.9, 1.6), grow: 1.4, alpha: rand(0.3, 0.5) }); }
    if (Math.random() < dt * 6) { const u = rand(-0.9, 0.9) * r, sd = Math.random() < 0.5 ? -1 : 1, x = p.x + hx * u + hz * sd * rand(0.4, 1.2), z = p.z + hz * u - hx * sd * rand(0.4, 1.2);   // air bursting up
      ring(x, z, 0.3, 1.6, 1.1, 0.55); spray(x, 0.1, z, 3, 2.4, 0.4, 0.25); }
    if (t < 3.4 && Math.random() < dt * 8) { const u = (Math.random() - 0.5) * H.half * 1.2;   // the fires meet the sea: steam
      soot.emit({ x: p.x + hx * u, y: Math.max(0.4, H.deck - s.listY * 0.6), z: p.z + hz * u, vx: rand(0.6, 1.2), vz: rand(-0.4, -0.1), vy: rand(1.6, 2.6), gravity: -0.2, drag: 0.6, sway: 0.4, life: rand(1.8, 2.6), size: rand(0.5, 0.8), grow: 2.6, color: [0.6, 0.63, 0.64], alpha: 0.24, shape: SHAPE.puff, spin: rand(-0.3, 0.3), rot: rand(-0.4, 0.4) }); }
    if (Math.random() < dt * 0.7) { const u = rand(-0.9, 0.9) * H.half, cx = p.x + hx * u + rand(0.5, 2), cz = p.z + hz * u - rand(0.2, 1.2), vx = rand(0.3, 0.6), vz = rand(-0.3, -0.05);   // a clump of timbers and rag breaking free, drifting off downwind
      for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) wreck({ x: cx + rand(-0.9, 0.9), y: 0.04, z: cz + rand(-0.6, 0.6), vx: vx * rand(0.7, 1.3), vz: vz * rand(0.7, 1.3), drag: 0.1, life: rand(8, 11), size: rand(0.7, 2.4), grow: 1, alpha: 0.8 }); }
    if (t - dt < SINK - 0.4 && t >= SINK - 0.4) { ring(p.x, p.z, 2, 9, 2.6, 0.7); ring(p.x, p.z, 1, 5, 2, 0.55); spray(p.x, 0.3, p.z, 8, 4, 0.6, 0.55); }   // the sea closes over the mastheads
  }
  // the troops in its hold (sim: dead, drowned = the ship): heads and shoulders in the sea round the wreck, bobbing in
  // rings of foam they beat up, then one by one they go under
  const drown = new Map();   // unit id -> { at (clock), end (s), ring (next) }
  function drowning(e, s, dt, tick) {
    const p = s.pos || s.thing.mesh.position;
    let D = drown.get(e.id);
    if (!D) { const h = hash(e.id); D = { at: clock - Math.max(0, (tick - (e.diedAt ?? tick)) / 20), end: 2.4 + h * 2.6, ring: 0, seed: h * 40 }; drown.set(e.id, D); }
    const t = clock - D.at, go = Math.max(0, (t - D.end) / 0.7);
    const half = 1.2, bob = Math.sin(clock * 5.5 + D.seed) * 0.1 + Math.sin(clock * 9 + D.seed * 2) * 0.05;
    s.roll = (D.seed % 2 < 1 ? 0.35 : -0.35) + Math.sin(clock * 3.2 + D.seed) * 0.12;   // thrown over, struggling
    s.thing.mesh.position.y -= (half + bob + go * 1.6) / UPY;
    sea(s, p.x, p.z, 0, 0.3);
    fade(s, Math.min(t / 0.35, 1 - go));
    if (go >= 1) return;
    const u = uni(s); if (u?.uFlash) u.uFlash.value = Math.max(u.uFlash.value, 0.08 + 0.06 * Math.max(0, bob * 8));   // wet, catching the light
    if (D.up !== (bob > 0.06)) { D.up = bob > 0.06; if (D.up && go < 0.3) spray(p.x + rand(-0.3, 0.3), 0.35, p.z, 3, 2.6, 0.5, 0.2); }   // a flick of water as he heaves up
    if (Math.random() < dt * 12) foam.emit({ x: p.x + rand(-0.4, 0.4), y: 0.03, z: p.z + rand(-0.3, 0.3), vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), drag: 1, life: rand(0.8, 1.2), size: rand(0.7, 1.1), grow: 1.4, alpha: 0.55 });   // the foam round him
    if (clock >= D.ring) { D.ring = clock + rand(0.45, 0.75); ring(p.x, p.z, 0.4, 1.5, 0.9, 0.6); if (go < 0.2 && Math.random() < 0.7) spray(p.x, 0.5, p.z, 4, 3, 0.6, 0.22); }   // arms beating the water
    if (go > 0 && !D.last) { D.last = true; ring(p.x, p.z, 0.4, 2.2, 1.3, 0.65); spray(p.x, 0.3, p.z, 5, 3.5, 0.7, 0.3); }
  }
  // the hero and crew (sim: washed = tick): a wave runs up the sand and breaks, and leaves them lying there as it runs
  // back, the sand dark where it reached
  const WASH_AT = 2.1;   // seconds after the sinking, as the camera arrives (render/view.js panTo)
  function wave(c) {
    // the wave that brings them ashore (Tim 2026-11-23: wide, broken and see-through, not one even band like a wiper):
    // overlapping patches of shallow water and ragged stretches of foam, each its own size, lag and pace
    const L = c.ashore, B = c.berth || { x: c.x, z: c.z }, d = Math.hypot(L.x - B.x, L.z - B.z) || 1, ux = (L.x - B.x) / d, uz = (L.z - B.z) / d, sx = -uz, sz = ux;
    const at = clock + WASH_AT - 1.25, W = 11.5, rot = Math.atan2(-sz, sx);   // a flat mark's long side along the shore
    later.push({ at, fn: () => {   // the body of shallow water running in, its broken lip in front
      const x = L.x - ux * 4, z = L.z - uz * 4, V = 4.4;
      for (let i = 0; i < 10; i++) { const w = rand(-W, W) * 0.8, lag = rand(0, 1.4), v = V * rand(0.88, 1.08);
        flat(pick(BODYS), x + sx * w - ux * (1.4 + lag), z + sz * w - uz * (1.4 + lag), { r0: rand(1.4, 2), r1: rand(1.8, 2.4), len: rand(1.1, 1.8), life: rand(1.75, 2.2), alpha: rand(0.3, 0.5), rot: rot + rand(-0.15, 0.15), color: [1, 1, 1], order: 1.95, y: 0.03, vx: ux * v, vz: uz * v, drag: 0.6, fadeIn: 0.3 }); }
      for (let i = 0; i < 11; i++) { const w = (i / 10 - 0.5) * 2 * W * 0.85 + rand(-1.2, 1.2), lag = rand(-0.5, 0.9), v = V * rand(0.84, 1.1), f = 1 - (Math.abs(w) / (W + 2)) ** 2;
        flat(LINE, x + sx * w - ux * lag, z + sz * w - uz * lag, { r0: rand(0.4, 0.6), r1: rand(0.55, 0.8), len: rand(2.2, 4.4), life: rand(1.4, 1.85), alpha: rand(0.38, 0.62) * f, rot: rot + rand(-0.14, 0.14), color: [0.9, 0.93, 0.94], order: 2.02, y: 0.04, vx: ux * v, vz: uz * v, drag: 0.6, fadeIn: 0.2 }); }
      for (let i = 0; i < 120; i++) { const w = rand(-W, W), f = 1 - (Math.abs(w) / (W + 1)) ** 2, v = V * rand(0.82, 1.1) * f;
        lip.emit({ x: x + sx * w - ux * rand(-0.6, 1.2), y: 0.03, z: z + sz * w - uz * rand(-0.6, 1.2), vx: ux * v * 0.95, vz: uz * v * 0.95, drag: 0.6, life: rand(1.2, 1.7), size: rand(0.4, 1.1), grow: 1.3, alpha: rand(0.25, 0.5) * f }); } } });
    later.push({ at: at + 1.3, fn: () => {   // it breaks on them: spray, then the water draws back leaving wet sand and a broken foam line
      for (let i = 0; i < 16; i++) { const w = rand(-W, W) * 0.75; spray(L.x + sx * w, 0.3, L.z + sz * w, 2, 3, 0.8, 0.35); }
      for (let i = 0; i < 4; i++) { const w = (i - 1.5) * W * 0.45 + rand(-1, 1);
        flat(pick(WETS), L.x + sx * w + ux * rand(-0.3, 0.5), L.z + sz * w + uz * rand(-0.3, 0.5), { r0: rand(1.6, 2), r1: 2, len: rand(1.5, 2.2), life: 8, alpha: rand(0.45, 0.65), rot: rot + rand(-0.1, 0.1), color: [1, 1, 1], order: 1.9, y: 0.025 }); }
      for (let i = 0; i < 6; i++) { const w = (i / 5 - 0.5) * 2 * W * 0.75 + rand(-1, 1);
        flat(EDGE, L.x + sx * w + ux * rand(1.2, 2.2), L.z + sz * w + uz * rand(1.2, 2.2), { r0: 0.45, r1: 0.5, len: rand(2.6, 4.2), life: rand(2, 2.6), alpha: rand(0.45, 0.65), rot: rot + rand(-0.12, 0.12), color: [0.85, 0.89, 0.9], order: 2.02, y: 0.04, vx: -ux * rand(1.2, 1.8), vz: -uz * rand(1.2, 1.8), drag: 0.5 }); }   // the edge it leaves, drawn back down the sand
    } });
  }
  const washed = new Map();   // unit id -> { tick, at }
  function ashore(e, s, tick) {
    if (washed.get(e.id)?.tick !== e.washed) washed.set(e.id, { tick: e.washed, at: clock - Math.max(0, (tick - e.washed) / 20) });
    const t = clock - washed.get(e.id).at, u = uni(s);
    if (t < WASH_AT + 0.6) fade(s, (t - WASH_AT) / 0.3);
    if (u?.uFlash) u.uFlash.value = Math.max(u.uFlash.value, 0.22 * Math.max(0, 1 - Math.abs(t - WASH_AT - 0.3) / 0.6));   // wet, catching the light as the water leaves them
  }

  return {
    cast(c) {
      if (c.kind === 'shipBroadside') broadside(c);
      else if (c.kind === 'shipCannon') bow(c);
      else if (c.kind === 'gatlingShot' && c.deck) deckShot(c);
      else if (c.kind === 'shipSunk' && c.ashore && c.washed) wave(c);
    },
    update(state, sprites, dt, place) {
      clock += dt;
      for (let i = later.length - 1; i >= 0; i--) if (later[i].at <= clock) { const f = later[i].fn; later.splice(i, 1); f(); }
      const seen = new Set();
      if (place === 'world') for (const e of Object.values(state.entities)) {
        if ((e.ship && e.dead) || (e.drowned && e.dead) || (e.washed != null && state.tick - e.washed < (WASH_AT + 1) * 20)) {   // S6
          const s = sprites.get(e.id);
          if (s?.thing?.mesh) { if (e.ship) sinking(e, s, dt, state.tick); else if (e.drowned) drowning(e, s, dt, state.tick); else ashore(e, s, state.tick); }
        }
        if (!e.ship || e.dead) continue;
        const s = sprites.get(e.id); if (!s?.thing?.mesh) continue;
        seen.add(e.id);
        stagesFor(e, s, dt);
        if (e.warUnit === 'warship') deckGun(s, e, place);
        if (e.mending) mending(e, s, dt);
      }
      for (const [id, m] of guns) if (!seen.has(id)) { scene.remove(m); m.material.dispose(); guns.delete(id); aims.delete(id); }
      for (const id of [...fires.keys()]) if (!seen.has(id)) fires.delete(id);
      foam.update(dt); lip.update(dt); deep.update(dt); sheet.update(dt); wreckA.update(dt); wreckB.update(dt); wreckC.update(dt); flatsUpdate(dt);
      for (const m of [taps, sunk, drown, washed]) for (const id of [...m.keys()]) if (!state.entities[id] || (m === taps && !state.entities[id].mending)) m.delete(id);
      glow.update(dt); soot.update(dt); cards.update(dt);
    },
  };
}
