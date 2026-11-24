// Crows (wildlife W1, Tim 2026-11-24): where the crows are and what they do. Presentation only: never part of the
// game rules or saves, so every client may show different crows. render/crow_fx.js feeds this what the camera
// shows (perch spots, people, gunfire, fights, marching troops, night) and draws the birds it moves.
// Numbers in data/wildlife.json "crows" (placeholders, tuned in play).
//   createCrowFlocks(cfg, rnd) -> { update(env, dt), birds(), flocks(), clear() }
//   env: { cam: { x, z, r }, night 0..1, groundY(x, z), spots(kind, x, z, r, n) -> [{ x, y, z, host, ground }],
//          scatters: [{ x, z, r }], people: [{ x, z, fast }], battles: [{ x, z, active, kills: [{ x, z }] }],
//          armies: [{ id, x, z, vx, vz }] }
//   update returns { scattered: [{ x, z }], caws: [{ x, z, sleepy }] } for the sounds.
// A bird: mode 'fly' (drawn as a code silhouette), 'land' (gliding down to its spot), 'sit' (a sprite on a roof, tree,
// wall or the ground: idle, peck, hop, caw) or 'takeoff' (a sprite flapping up, then a silhouette again).

export const CROW_DEFAULTS = {
  flockSize: [6, 15], flocksDay: 2, flocksNight: 1, maxBirds: 48, follow: 0.2,
  speed: [4, 6], height: [3.4, 5.8], fleeHeight: [6.5, 8.5],
  flap: [1.5, 3.5], glide: [0.5, 1.3], beat: [2.8, 3.4], size: [0.64, 0.8],
  scatter: { person: 2.4, rider: 7 },
  cawEvery: [5, 14], sit: [10, 28], wander: [6, 14], flee: [6, 9],
  battleReach: 120, trailCount: 12, landRoof: 0.45, landTree: 0.15,
  // birds bursting out of the trees round troops and shinobi on the move (render/crow_fx.js picks the trees)
  flush: { chance: 0.08, reach: 7, size: [4, 8], treeRest: 90, unitRest: 15, gap: 1.2 },
};
const CLIP_FRAMES = { idle: 12, peck: 10, hop: 8, caw: 10, fly: 8 };
export const CROW_FPS = 12;

export function createCrowFlocks(cfgIn = {}, rnd = Math.random) {
  const cfg = { ...CROW_DEFAULTS, ...cfgIn, scatter: { ...CROW_DEFAULTS.scatter, ...(cfgIn.scatter || {}) } };
  const R = ([a, b]) => a + rnd() * (b - a);
  let flocks = [], time = 0, nextId = 1;
  const birdsOf = () => flocks.flatMap(f => f.birds);

  function newBird(f, x, y, z, mode) {
    return { id: nextId++, flock: f, mode, x, y, z, h: rnd() * Math.PI * 2, turn: 0, v: R(cfg.speed), ph: rnd(), rate: R(cfg.beat),
      gliding: false, glideT: R(cfg.flap), k: R(cfg.size), alt: R(cfg.height), spot: null, anim: 'idle', t: rnd() * 0.8, loops: 1, wait: 0 };
  }
  function spawn(env, sitting) {
    const { cam } = env, f = { id: nextId++, birds: [], goal: null, cawT: R(cfg.cawEvery), sleeping: false, trail: null };
    const n = Math.round(R(cfg.flockSize)), room = cfg.maxBirds - birdsOf().length;
    if (room < cfg.flockSize[0]) return null;
    const a = rnd() * Math.PI * 2;
    if (sitting) {   // already on a roof, a tree or the ground somewhere near (at night: asleep in the trees)
      const d = cam.r * (0.95 + rnd() * 0.45), cx = cam.x + Math.cos(a) * d, cz = cam.z + Math.sin(a) * d;
      const kinds = env.night > 0.5 ? ['tree'] : [rnd() < cfg.landRoof ? 'roof' : 'ground', 'tree', 'ground'];
      let spots = [];
      for (const k of kinds) { spots = env.spots(k, cx, cz, 18, Math.min(n, room)); if (spots.length >= cfg.flockSize[0]) break; }
      if (spots.length < cfg.flockSize[0]) return null;
      for (const s of spots) { const b = newBird(f, s.x, s.y, s.z, 'sit'); b.spot = s; f.birds.push(b); }
      f.goal = { kind: 'sit', until: time + R(cfg.sit) };
      f.sleeping = env.night > 0.5;
    } else {   // flying in from beyond the edge of the view, toward somewhere on screen
      const d = cam.r * 1.25, cx = cam.x + Math.cos(a) * d, cz = cam.z + Math.sin(a) * d;
      const h = Math.atan2(cam.z - cz, cam.x - cx) + (rnd() - 0.5) * 1.2;
      for (let i = 0; i < Math.min(n, room); i++) {
        const b = newBird(f, cx + (rnd() - 0.5) * 6, 0, cz + (rnd() - 0.5) * 6, 'fly');
        b.y = env.groundY(b.x, b.z) + b.alt; b.h = h + (rnd() - 0.5) * 0.5; f.birds.push(b);
      }
      f.goal = { kind: 'wander', x: cam.x + (rnd() - 0.5) * cam.r, z: cam.z + (rnd() - 0.5) * cam.r, until: time + R(cfg.wander) };
    }
    flocks.push(f);
    return f;
  }
  const centre = f => { let x = 0, z = 0, hx = 0, hz = 0; for (const b of f.birds) { x += b.x; z += b.z; if (b.mode === 'fly') { hx += Math.cos(b.h); hz += Math.sin(b.h); } } return { x: x / f.birds.length, z: z / f.birds.length, hx, hz }; };

  // a few birds burst out of a tree (fl: { x, y, z } the tree top, fx, fz: who startled them) and fly off for good
  function flush(fl, out) {
    const F = { ...CROW_DEFAULTS.flush, ...(cfg.flush || {}) }, room = cfg.maxBirds - birdsOf().length, n = Math.min(Math.round(R(F.size)), room);
    if (n < 2) return;
    const d = Math.hypot(fl.x - fl.fx, fl.z - fl.fz) || 1, ax = (fl.x - fl.fx) / d, az = (fl.z - fl.fz) / d, h = Math.atan2(az, ax);
    const f = { id: nextId++, birds: [], goal: { kind: 'flee', x: fl.x + ax * 30, z: fl.z + az * 30, until: time + R(cfg.flee) }, cawT: 1e9, sleeping: false, trail: null, flush: [ax, az] };
    for (let i = 0; i < n; i++) {
      const b = newBird(f, fl.x + (rnd() - 0.5) * 1.6, fl.y + (rnd() - 0.5) * 0.8, fl.z + (rnd() - 0.5) * 1.6, 'takeoff');
      b.wait = rnd() * 0.3; b.t = 0; b.h = h + (rnd() - 0.5) * 0.9; b.alt = R(cfg.fleeHeight); b.k *= 0.85; f.birds.push(b);
    }
    flocks.push(f);
    out.scattered.push({ x: fl.x, z: fl.z });
  }
  function takeOff(f, stagger = 0.6) {
    for (const b of f.birds) if (b.mode === 'sit' || b.mode === 'land') { b.mode = 'takeoff'; b.wait = rnd() * stagger; b.t = 0; b.alt = R(cfg.height); b.spot = null; }
      else b.spot = null;
    f.sleeping = false;
  }
  // a flock lands: a spot for each bird near (x, z), on the kind of place asked, else whatever is there
  function land(env, f, x, z, kinds) {
    let spots = [];
    for (const k of kinds) { spots = env.spots(k, x, z, k === 'ground' ? 10 : 16, f.birds.length); if (spots.length >= Math.min(f.birds.length, 4)) break; }
    if (!spots.length) return false;
    // more birds than places up there: the rest look further round, then come down on the ground below
    if (spots.length < f.birds.length && !spots[0].ground) spots.push(...env.spots(spots[0].tree ? 'tree' : 'roof', x, z, 40, f.birds.length - spots.length).filter(s => !spots.some(o => o.key && o.key === s.key)));
    if (spots.length < f.birds.length && !(env.night > 0.5)) spots.push(...env.spots('ground', x, z, 10, f.birds.length - spots.length));
    f.birds.forEach((b, i) => {
      b.spot = spots[i % spots.length];
      if (b.mode === 'sit') { b.mode = 'takeoff'; b.wait = rnd() * 0.6; b.t = 0; }   // over to the new spot
      else if (b.mode === 'fly') b.mode = 'land';
    });
    f.goal = { kind: 'land', x, z, until: time + 6 + R(cfg.sit) };
    return true;
  }
  function flee(f, x, z, reach = 30) {
    const c = centre(f), d = Math.hypot(c.x - x, c.z - z) || 1;
    f.goal = { kind: 'flee', x: c.x + (c.x - x) / d * reach, z: c.z + (c.z - z) / d * reach, until: time + R(cfg.flee) };
    takeOff(f, 0.35);
    for (const b of f.birds) b.alt = R(cfg.fleeHeight);
  }

  // what a flock does next, when its goal runs out
  function decide(env, f) {
    const c = centre(f), cam = env.cam;
    if (f.flush) { f.goal = { kind: 'leave', x: c.x + f.flush[0] * 200, z: c.z + f.flush[1] * 200, until: time + 60 }; return; }   // flushed birds keep going
    if (env.night > 0.5) {   // dusk: to roost in the trees, or away out of sight
      if (!f.sleeping && !land(env, f, c.x, c.z, ['tree'])) {
        const t = env.spots('tree', c.x, c.z, 60, 1)[0];
        f.goal = t ? { kind: 'roost', x: t.x, z: t.z, until: time + 30 } : { kind: 'leave', x: c.x + (c.x - cam.x) * 3, z: c.z + (c.z - cam.z) * 3, until: time + 60 };
        takeOff(f, 1.5);
      }
      return;
    }
    if (f.sleeping) { takeOff(f, 3); }
    // a fight nearby: circle over it while it goes on, then come down by the dead
    const fight = env.battles.filter(b => Math.hypot(b.x - c.x, b.z - c.z) < cfg.battleReach).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
    if (fight?.active) { f.goal = { kind: 'circle', x: fight.x, z: fight.z, r: 9 + rnd() * 5, until: time + 8 }; return; }
    if (fight?.kills.length && rnd() < 0.7) { const k = fight.kills[Math.floor(rnd() * fight.kills.length)]; if (land(env, f, k.x, k.z, ['ground'])) { f.goal.until = time + R(cfg.sit) * 1.5; return; } }
    // a big column on the march: one flock trails it
    const army = env.armies.find(a => Math.hypot(a.x - c.x, a.z - c.z) < cfg.battleReach && !flocks.some(o => o !== f && o.trail === a.id));
    // (Tim 2026-11-24: not all the time, just sometimes for a little bit; a flock that trailed once goes its own way after)
    if (army && !f.trailed && rnd() < (cfg.follow ?? 0.2)) { f.trail = army.id; f.trailed = true; f.goal = { kind: 'trail', until: time + R(cfg.wander) }; return; }
    f.trail = null;
    const sitting = f.birds.some(b => b.mode === 'sit');
    if (!sitting && rnd() < 0.55) {   // come down somewhere near: roofs first in a town, else fields, walls or trees
      const x = c.x + (rnd() - 0.5) * 30, z = c.z + (rnd() - 0.5) * 30, r = rnd();
      const kinds = r < cfg.landRoof ? ['roof', 'perch', 'ground'] : r < cfg.landRoof + cfg.landTree ? ['tree', 'ground'] : ['ground', 'perch'];
      if (land(env, f, x, z, kinds)) return;
    }
    if (sitting) takeOff(f);
    // wander, now and then drifting back toward the view when far from it (else it drifts off and a new flock comes)
    const far = Math.hypot(c.x - cam.x, c.z - cam.z) > cam.r && rnd() < (cfg.follow ?? 0.2);
    const gx = far ? cam.x + (rnd() - 0.5) * cam.r : c.x + (rnd() - 0.5) * 60, gz = far ? cam.z + (rnd() - 0.5) * cam.r : c.z + (rnd() - 0.5) * 60;
    f.goal = { kind: 'wander', x: gx, z: gz, until: time + R(cfg.wander) };
  }

  function steer(env, f, b, dt, c) {
    const g = f.goal || {};
    let tx = g.x ?? c.x, tz = g.z ?? c.z, circle = g.kind === 'circle' ? g.r : 0;
    if (g.kind === 'trail') { const a = env.armies.find(a => a.id === f.trail); if (a) { const sp = Math.hypot(a.vx, a.vz) || 1; tx = a.x - a.vx / sp * 6; tz = a.z - a.vz / sp * 6; circle = 8; } }
    if (b.mode === 'land' && b.spot) { tx = b.spot.x; tz = b.spot.z; circle = 0; }
    // each bird on its own clock: a wandering turn, pulled toward the flock and its goal, circling when there
    b.turn = (b.turn + (rnd() - 0.5) * 6 * dt * 15) * Math.pow(0.93, dt * 15);
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    // toward the goal, and along the way the rest of the flock is flying (one shared line, each bird still wandering)
    const hl = Math.hypot(c.hx || 0, c.hz || 0) || 1, al = g.kind === 'flee' ? 0.4 : 1.3;   // fleeing: away first
    let want = b.mode === 'land' || !c.hx ? Math.atan2(dz, dx) : Math.atan2(dz / (d || 1) + c.hz / hl * al, dx / (d || 1) + c.hx / hl * al);
    if (circle && d < circle * 1.6) want += Math.PI / 2 * Math.min(1, (circle * 1.6 - d) / circle) * (f.id % 2 ? 1 : -1);
    const cd = Math.hypot(c.x - b.x, c.z - b.z);
    if (cd > 3.5 && b.mode !== 'land') want = Math.atan2((c.z - b.z) * 0.6 + dz / (d || 1) * 4, (c.x - b.x) * 0.6 + dx / (d || 1) * 4);
    const diff = ((want - b.h + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const k = b.mode === 'land' ? 3 : 0.9;
    b.bank = Math.max(-0.45, Math.min(0.45, -(b.turn * 0.04 + diff * 0.3)));
    b.h += (b.turn * 0.5 * Math.PI / 180 * 15 + diff * k) * dt;
  }

  function flyStep(env, f, b, dt, c) {
    steer(env, f, b, dt, c);
    b.glideT -= dt;
    if (b.glideT <= 0) { b.gliding = !b.gliding; b.glideT = b.gliding ? R(cfg.glide) : R(cfg.flap); }
    const land = b.mode === 'land' && b.spot;
    const sp = b.v * (b.gliding ? 0.92 : 1) * (land ? Math.min(1, 0.3 + Math.hypot(b.spot.x - b.x, b.spot.z - b.z) / 8) : 1);
    b.x += Math.cos(b.h) * sp * dt; b.z += Math.sin(b.h) * sp * dt;
    const floor = env.groundY(b.x, b.z);
    if (land) {
      const d = Math.hypot(b.spot.x - b.x, b.spot.z - b.z);
      const target = d < 6 ? b.spot.y + Math.max(0, d - 0.3) / 6 * b.alt : Math.max(b.spot.y, floor) + b.alt;   // a long glide down onto the spot
      b.y += (target - b.y) * Math.min(1, dt * 5);
      if (d < 3) { b.x += (b.spot.x - b.x) * Math.min(1, dt * 4); b.z += (b.spot.z - b.z) * Math.min(1, dt * 4); }
      b.near = d < 1.6 && b.y - b.spot.y < 1.2;   // close in: drawn as the flapping sprite settling on
      if (d < 0.3 && Math.abs(b.y - b.spot.y) < 0.3) { b.mode = 'sit'; b.x = b.spot.x; b.y = b.spot.y; b.z = b.spot.z; b.anim = 'idle'; b.t = 0; b.loops = 1 + Math.floor(rnd() * 2); }
      b.gliding = d < 6 || b.gliding;
    } else b.near = false, b.y += (floor + b.alt - b.y) * Math.min(1, dt * (b.gliding ? 0.4 : 0.8));
    b.ph = b.gliding ? 0 : (b.ph + b.rate * dt) % 1;
  }

  function sitStep(b, dt, env) {
    b.t += dt;
    const n = CLIP_FRAMES[b.anim] / CROW_FPS * (b.flock.sleeping ? 3 : 1);
    if (b.anim === 'hop') { const s = 0.4 * dt / n; b.x += Math.cos(b.h) * s; b.z += Math.sin(b.h) * s; b.y = env.groundY(b.x, b.z); }
    if (b.t < n) return;
    b.t = 0;
    if (--b.loops > 0) return;
    const ground = b.spot?.ground, r = rnd();
    b.anim = b.flock.sleeping ? 'idle' : ground && r < 0.45 ? 'peck' : ground && r < 0.6 ? 'hop' : r < 0.68 ? 'caw' : 'idle';
    b.loops = b.anim === 'idle' ? 1 + Math.floor(rnd() * 3) : b.anim === 'peck' ? 1 + Math.floor(rnd() * 2) : 1;
    if (rnd() < 0.3) b.h += (rnd() < 0.5 ? -1 : 1) * Math.PI / 4 * (1 + Math.floor(rnd() * 2));
    if (b.anim === 'caw' && rnd() < 0.3) b.cawNow = true;   // most caws are silent beaks, so the cawing stays soft
  }

  function update(env, dt) {
    time += dt;
    const out = { scattered: [], caws: [] }, cam = env.cam;
    for (const fl of env.flushes || []) flush(fl, out);
    // gunfire, blasts and cannon: every flock in reach bursts up and away (a riding charge and people walking up too)
    for (const s of env.scatters) for (const f of flocks) if (f.birds.some(b => Math.hypot(b.x - s.x, b.z - s.z) < s.r && (b.mode !== 'fly' || b.y - env.groundY(b.x, b.z) < 9))) {
      if (f.goal?.kind === 'flee' && f.goal.until - time > 3) continue;
      flee(f, s.x, s.z, 25 + s.r); const c = centre(f); out.scattered.push({ x: c.x, z: c.z });
    }
    for (const p of env.people) for (const f of flocks) {
      if (f.goal?.kind === 'flee') continue;
      const r = p.fast ? cfg.scatter.rider : cfg.scatter.person;
      if (f.birds.some(b => (b.mode === 'sit' || b.mode === 'land') && b.spot?.ground && Math.hypot(b.x - p.x, b.z - p.z) < r)) { flee(f, p.x, p.z, p.fast ? 30 : 14); if (p.fast) { const c = centre(f); out.scattered.push({ x: c.x, z: c.z }); } }
    }
    for (const f of flocks) {
      if (f.goal?.kind === 'land' && f.birds.every(b => b.mode === 'sit')) f.goal.kind = 'sit';
      if (!f.goal || time > f.goal.until) decide(env, f);
      if (f.goal?.kind === 'roost' && Math.hypot(centre(f).x - f.goal.x, centre(f).z - f.goal.z) < 12 && land(env, f, f.goal.x, f.goal.z, ['tree'])) f.goal.until = time + 1e9;
      if (env.night > 0.5 && !f.sleeping && (f.goal?.kind === 'land' || f.goal?.kind === 'sit') && f.birds.every(b => b.mode === 'sit') && f.birds.every(b => b.spot?.tree)) { f.sleeping = true; f.goal.until = time + 1e9; }
      if (f.sleeping && env.night < 0.3) { f.goal = { kind: 'wander', until: 0 }; decide(env, f); }
      const c = centre(f);
      for (const b of f.birds) {
        if (b.mode === 'takeoff') {
          if ((b.wait -= dt) > 0) continue;
          b.t += dt; b.y += 2.6 * dt; b.x += Math.cos(b.h) * 2 * dt; b.z += Math.sin(b.h) * 2 * dt;
          if (b.t > 0.6) { b.mode = b.spot ? 'land' : 'fly'; b.gliding = false; b.glideT = R(cfg.flap); }
        } else if (b.mode === 'fly' || b.mode === 'land') { if (b.mode === 'land' && !b.spot) b.mode = 'fly'; flyStep(env, f, b, dt, c); }
        else sitStep(b, dt, env);
        if (b.cawNow) { b.cawNow = false; if (Math.hypot(b.x - cam.x, b.z - cam.z) < cam.r * 1.2) out.caws.push({ x: b.x, z: b.z }); }
      }
      // a caw from a flock now and then, flying or sitting (not when asleep)
      if (!f.sleeping && (f.cawT -= dt) <= 0) { f.cawT = R(cfg.cawEvery); const b = f.birds[Math.floor(rnd() * f.birds.length)]; if (b.mode === 'sit') { b.anim = 'caw'; b.t = 0; b.loops = 1; b.cawNow = true; } else if (Math.hypot(b.x - cam.x, b.z - cam.z) < cam.r * 1.2) out.caws.push({ x: b.x, z: b.z }); }
    }
    // flocks far out of view are dropped; new ones come in (fewer at night, and those asleep in the trees)
    flocks = flocks.filter(f => f.birds.some(b => Math.hypot(b.x - cam.x, b.z - cam.z) < cam.r * 1.9));
    const want = env.night > 0.5 ? cfg.flocksNight : cfg.flocksDay;
    if (flocks.length < want && rnd() < dt * (flocks.length ? 0.15 : 2)) spawn(env, env.night > 0.5 || rnd() < 0.5);
    return out;
  }
  return { update, birds: birdsOf, flocks: () => flocks, flush: fl => { const out = { scattered: [] }; flush(fl, out); return out; }, clear() { flocks = []; } };
}

// The flying crow's outline (from crow/crow_flock_anim.py, the flock mock Tim approved 2026-11-24), in units:
// x right, y forward, z up, before turning to the heading. phase 0..1 of the wingbeat; glide holds a shallow V.
// Returns [[points, shade]], shade 0 body, 1 arm and palm, 2 primaries.
export function crowOutline(phase, glide, bank = 0, span = 0.6) {
  let up, fold;
  if (glide) { up = 0.16; fold = 0.22; }
  else { up = 0.6 * Math.sin(2 * Math.PI * phase); fold = Math.max(0, Math.sin(2 * Math.PI * phase + 1.2)) * 0.45; }
  const P = (x, y, hand = false) => { const r = Math.abs(x), a = up * (hand ? 1.25 : 1) + bank * (x > 0 ? 1 : -1); return [Math.sign(x) * r * Math.cos(a), y, r * Math.sin(a)]; };
  const polys = [];
  for (const sd of [1, -1]) {
    const hs = span * (1 - 0.35 * fold), wx = 0.27 * sd, wy = 0.16 - 0.05 * fold;
    polys.push([[P(0.03 * sd, 0.10), P(wx, wy), P(wx + 0.05 * sd, wy - 0.02), P(wx + 0.03 * sd, -0.15), P(0.03 * sd, -0.15)], 1]);
    polys.push([[P(wx, wy), P(wx + 0.10 * sd, wy - 0.01, true), P(wx + 0.12 * sd, -0.10, true), P(wx + 0.02 * sd, -0.15, true)], 1]);
    for (let k = 0; k < 5; k++) {
      const t = k / 4, ang = (2 - 26 * t - 15 * fold) * Math.PI / 180, L = (hs - 0.29) * (1 - 0.10 * t);
      const rx = wx + (0.10 + 0.02 * t) * sd, ry = wy - 0.02 - 0.12 * t, tx = rx + sd * L * Math.cos(ang), ty = ry + L * Math.sin(ang), w = 0.032;
      polys.push([[P(rx, ry + w, true), P(tx, ty + 0.006, true), P(tx + sd * 0.004, ty - 0.008, true), P(rx, ry - w * 1.3, true)], 2]);
    }
  }
  const flat = pts => pts.map(([x, y]) => [x, y, 0]);
  const tail = [[0.05, -0.15], [0.11, -0.36]];
  for (let i = 0; i <= 8; i++) { const t = i * Math.PI / 8; tail.push([0.115 * Math.cos(t), -0.36 - 0.045 * Math.sin(t)]); }
  tail.push([-0.11, -0.36], [-0.05, -0.15]);
  polys.push([flat(tail), 0]);
  polys.push([flat([[0, 0.37], [0.035, 0.35], [0.048, 0.31], [0.04, 0.25], [0.075, 0.17], [0.085, 0], [0.065, -0.16], [-0.065, -0.16], [-0.085, 0], [-0.075, 0.17], [-0.04, 0.25], [-0.048, 0.31], [-0.035, 0.35]]), 0]);
  polys.push([flat([[0, 0.48], [0.036, 0.35], [-0.036, 0.35]]), 0]);   // a jungle crow's heavy bill
  return polys;
}
