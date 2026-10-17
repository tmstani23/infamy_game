// The game rules. Holds the state and advances it one fixed tick at a time from
// commands. No three.js and no DOM: in multiplayer a Colyseus server runs this
// same code, and browsers only send commands and draw the state they get back.
import { placeScenery, placePiece, dirIndex, SCREEN_RIGHT, SCREEN_DOWN } from './geometry.js';
import { buildRoom3d, INTERIOR_ORIGIN } from './interiors.js';
import { generateRoom } from './generate.js';
import { createClans } from './clans.js';
import { createNav } from './nav.js';

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

// Unit types: size and speeds in world units per second (the ronin is 2 tall)
export const UNITS = {
  hero: { radius: 0.35, walk: 1.7, run: 6.0 },
};

const DOOR_RADIUS = 1.5;
const title = s => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function createGame(options) {
  const { district, catalog, cutouts, interiors = {}, parts = null, recipes = {}, units = null } = options;
  const scenery = placeScenery(district, catalog, cutouts);

  // Rooms for buildings that have an interior, and the doors between them
  const rooms = [], doors = [], roomBlockers = [], roomOf = {};
  district.buildings.filter(b => b.interior && b.door).forEach((b, i) => {
    // "interior": "teahouse" names a hand-made room in interiors.json;
    // "interior": { "type": "gambling_den", "seed": 4 } is made by the room generator
    const name = b.interior.type || b.interior;
    const t = b.interior.type ? generateRoom(name, b.interior.seed, recipes, parts).template : interiors[name];
    if (!t) { console.warn(`No interior template "${name}"`); return; }
    const ox = INTERIOR_ORIGIN.x + i * INTERIOR_ORIGIN.spacing, oz = INTERIOR_ORIGIN.z;
    const room = buildRoom3d(name, t, parts, ox, oz);
    rooms.push(room);
    roomOf[district.buildings.indexOf(b)] = room.name;
    if (room.blockers) roomBlockers.push(...room.blockers);
    scenery.push(...room.pieces.map(p => placePiece(p, catalog, cutouts)).filter(Boolean));
    const [dx, dz] = b.door;
    doors.push({ x: dx, z: dz, to: room.spawn, place: room.name, label: `Enter the ${title(name)}` });
    doors.push({ x: room.exit.x, z: room.exit.z, to: { x: dx, z: dz }, place: 'street', label: 'Leave' });
  });

  const B = district.bounds, far = 1000;
  const blockers = [
    ...district.blockers.map(([x0, z0, x1, z1]) => ({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 })),
    ...scenery.filter(s => s.solid).map(s => s.solid),
    ...roomBlockers,
    // the edge of the street map (rooms lie beyond it, closed in by their own walls)
    { minX: -far, maxX: B.minX, minZ: -far, maxZ: far }, { minX: B.maxX, maxX: INTERIOR_ORIGIN.x - 20, minZ: -far, maxZ: far },
    { minX: -far, maxX: B.maxX, minZ: -far, maxZ: B.minZ }, { minX: -far, maxX: B.maxX, minZ: B.maxZ, maxZ: far },
  ];

  // Everything here is plain data, so it can be synced to other players as is
  // businesses: { b0: { kind: 'warehouse', x, z, door, owner: null } }, keyed by building index
  const state = { tick: 0, entities: {}, businesses: {}, hits: [], casts: [] };
  district.buildings.forEach((b, i) => {
    if (b.business) state.businesses[`b${i}`] = { id: `b${i}`, kind: b.business, x: b.x, z: b.z, door: b.door || null, room: roomOf[i] || null, owner: null };
  });
  const clans = units ? createClans(state, units) : null;
  const intents = {};     // latest move command per entity (server-side only)
  const nav = createNav(blockers, district.bounds);
  const paths = {};       // crew walking routes (server-side only, rebuilt when needed)
  let nextId = 1;

  function spawn(type, model, x, z, extra = {}) {
    const id = String(nextId++);
    state.entities[id] = { id, type, model, x, z, dir: 0, anim: 'idle', place: 'street', ...extra };
    const e = state.entities[id], hp = units?.types[type]?.hp;
    if (hp && e.hp === undefined) e.hp = hp;
    if (e.hp !== undefined) e.maxHp ??= e.hp;
    const o = e.order;
    if (o?.kind === 'follow' && o.slot === undefined) o.slot = freeSlot(o.target, id);
    return id;
  }

  // --- Crew orders ---------------------------------------------------------------
  // Places around a hero for followers: rings of 6, 12 and 18 (enough for 36 crew)
  function followOffset(k) {
    for (const [r, n] of [[1.5, 6], [2.7, 12], [3.9, 18]]) {
      if (k < n) { const a = k / n * 2 * Math.PI + (r > 2 ? Math.PI / n : 0); return [Math.cos(a) * r, Math.sin(a) * r]; }
      k -= n;
    }
    return [0, 0];
  }
  // The lowest ring place nobody following this hero uses yet
  function freeSlot(heroId, self) {
    const used = new Set(Object.values(state.entities)
      .filter(u => u.id !== self && u.order?.kind === 'follow' && u.order.target === heroId).map(u => u.order.slot));
    let k = 0;
    while (used.has(k)) k++;
    return k;
  }
  // A square block of places around a clicked point, one per unit
  function blockOffset(k, n) {
    const side = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / side), sp = 1.1;
    return [(k % side - (side - 1) / 2) * sp, (Math.floor(k / side) - (rows - 1) / 2) * sp];
  }

  // order command from a hero for some of its own crew on the street:
  // follow (the hero), move (go there and wait) or station (go there and hold it; defends later)
  function giveOrder(hero, c) {
    if (hero.type !== 'hero' || hero.dead || !Array.isArray(c.units) || !['follow', 'move', 'station', 'attack', 'attackmove', 'heal'].includes(c.kind)) return;
    if (c.kind === 'attack' && !hostile(hero, state.entities[c.target])) return;
    if (!['follow', 'attack', 'heal'].includes(c.kind) && !(Number.isFinite(c.x) && Number.isFinite(c.z))) return;
    const crew = c.units.map(id => state.entities[id])
      .filter(u => u && !u.dead && !u.downed && u.owner === hero.owner && u.type !== 'hero' && u.place === 'street');
    crew.forEach((u, k) => {
      delete paths[u.id];
      delete u.execute;
      if (fight[u.id]) delete fight[u.id].target;
      if (c.kind === 'follow') { u.order = { kind: 'follow', target: hero.id }; u.order.slot = freeSlot(hero.id, u.id); return; }
      if (c.kind === 'attack') { u.order = { kind: 'attack', target: c.target }; return; }
      if (c.kind === 'heal') {
        const b = clans?.clinicOf();
        if (!b || u.hp >= u.maxHp) return;
        const [x, z] = nav.nearestFree(...(b.door || [b.x, b.z])) || [b.x, b.z];
        u.order = { kind: 'heal', x, z };
        return;
      }
      const [ox, oz] = blockOffset(k, crew.length);
      const [x, z] = nav.nearestFree(c.x + ox, c.z + oz) || [c.x, c.z];
      u.order = { kind: c.kind, x, z };
    });
  }

  // Where a crew member wants to be right now, or null to stand still
  function crewGoal(e) {
    const o = e.order;
    if (!o) return null;
    if (o.kind === 'follow') {
      const h = state.entities[o.target];
      if (!h || h.place !== e.place || h.dead) return null;   // hero indoors or knocked out: wait
      const [ox, oz] = followOffset(o.slot);
      return { x: h.x + ox, z: h.z + oz, near: Math.hypot(e.x - h.x, e.z - h.z) < 2.2 + o.slot * 0.08 ? 0.6 : 0.3, walk: h.anim === 'walk' };
    }
    if (o.kind === 'attack') return null;
    return { x: o.x, z: o.z, near: 0.25, walk: false };
  }

  // Walk one tick toward (gx, gz) along a street path; false when there is no way
  function moveTo(e, unit, gx, gz, walk) {
    if (e.place !== 'street') paths[e.id] = { pts: [[gx, gz]], gx, gz };   // rooms: walk straight (the walk grid covers the street)
    let p = paths[e.id];
    if (!p || Math.hypot(p.gx - gx, p.gz - gz) > 1.2 || !p.pts.length) {
      p = paths[e.id] = { pts: nav.findPath(e.x, e.z, gx, gz) || [], gx, gz };
      if (!p.pts.length) return false;
    }
    // the last leg goes straight at the live goal (keeps up with a moving hero or enemy)
    let [wx, wz] = p.pts.length === 1 ? [gx, gz] : p.pts[0];
    if (p.pts.length > 1 && Math.hypot(wx - e.x, wz - e.z) < 0.35) { p.pts.shift(); [wx, wz] = p.pts.length === 1 ? [gx, gz] : p.pts[0]; }
    const dx = wx - e.x, dz = wz - e.z, len = Math.hypot(dx, dz);
    if (len < 1e-6) return true;
    e.anim = walk ? 'walk' : 'run';
    e.dir = dirIndex(dx, dz);
    const d = Math.min(unit[e.anim] * DT, len) / len;
    tryMove(e, unit.radius, dx * d, 0);
    tryMove(e, unit.radius, 0, dz * d);
    return true;
  }

  // --- Combat (RTS / Dota style) ----------------------------------------------------
  // Units of two different clans in the same place are enemies. Crew pick fights on
  // their own within AGGRO, but never wander more than LEASH from where they belong.
  const AGGRO = 6, LEASH = 10, CORPSE_SECONDS = 3, KNOCKOUT_SECONDS = 5;
  const fight = {};      // per unit: { cd: seconds to next hit, target } (server-side only)
  const hostile = (a, b) => b && a !== b && !b.dead && !b.downed && a.owner && b.owner && a.owner !== b.owner && a.place === b.place;
  const reachOf = (a, b) => (statsOf(a.type).attackRange || 1) + statsOf(b.type).radius;

  function nearestEnemy(e, x, z, range) {
    let best = null, bd = range;
    for (const t of Object.values(state.entities)) {
      if (!hostile(e, t)) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  // Where a crew member is tied to: its hero, its station, or where it is going
  function anchorOf(e) {
    const o = e.order || {};
    if (o.kind === 'follow') { const h = state.entities[o.target]; return h && !h.dead && h.place === e.place ? [h.x, h.z] : [e.x, e.z]; }
    if (o.kind === 'station' || o.kind === 'move' || o.kind === 'attackmove') return [o.x, o.z];
    return [e.x, e.z];
  }

  // Who this crew member should be fighting right now, if anyone
  function crewTarget(e) {
    const o = e.order || {};
    if (o.kind === 'attack') {
      const t = state.entities[o.target];
      if (hostile(e, t)) return t;
      e.order = { kind: 'move', x: e.x, z: e.z };      // target gone: stand there
      return null;
    }
    // a plain move ignores enemies until it arrives (RTS rule); everything else fights back
    if ((o.kind === 'move' || o.kind === 'heal') && Math.hypot(o.x - e.x, o.z - e.z) > 0.6) return null;
    // first stop anyone finishing off one of our downed crew nearby
    const executor = Object.values(state.entities).find(t => t.execute && hostile(e, t)
      && state.entities[t.execute.target]?.owner === e.owner && Math.hypot(t.x - e.x, t.z - e.z) < AGGRO);
    if (executor) return executor;
    const [ax, az] = anchorOf(e);
    const f = fight[e.id];
    const old = f && state.entities[f.target];
    if (hostile(e, old) && Math.hypot(old.x - ax, old.z - az) < LEASH) return old;
    return nearestEnemy(e, e.x, e.z, AGGRO);
  }

  // Close in on the target, then swing at it every attackSpeed seconds. A swing has a
  // wind-up and the damage lands on the strike (STRIKE of the way through), Dota-style;
  // e.swing is in the state so the renderer can time the animation to it.
  const STRIKE = 0.4;
  const swingTicks = unit => Math.max(4, Math.round(Math.min(unit.attackSpeed * 0.85, unit.swingSeconds || 0.7) / DT));
  function engage(e, unit, t, chase = true) {
    const f = fight[e.id] ||= { cd: 0 };
    f.target = t.id;
    if (e.swing) return;                                   // mid-swing: finish it (see swingStep)
    const d = Math.hypot(t.x - e.x, t.z - e.z);
    if (d > reachOf(e, t)) {
      if (chase) {
        // close in on a spot round the target so several attackers surround it instead of queueing
        const [sx, sz] = surroundSpot(e, t);
        if (moveTo(e, unit, sx, sz, false)) return;
      }
      e.anim = 'idle';
      return;
    }
    delete paths[e.id];
    // turn toward the target one eighth per tick instead of snapping round
    const want = dirIndex(t.x - e.x, t.z - e.z), diff = (want - e.dir + 8) % 8;
    if (diff) { e.dir = (e.dir + (diff <= 4 ? 1 : 7)) % 8; if (diff !== 1 && diff !== 7) { e.anim = 'idle'; return; } }
    if (f.cd > 0) { e.anim = 'idle'; return; }
    const speed = e.buffs?.rally ? unit.attackSpeed / (e.buffs.rally.boost || 1) : unit.attackSpeed;
    const len = swingTicks({ ...unit, attackSpeed: speed });
    e.swing = { start: state.tick, len, strike: state.tick + Math.round(len * STRIKE), target: t.id };
    e.anim = 'attack';
    f.cd = speed;
  }

  // Where an attacker should stand round its target: spread out by how many are on it
  function surroundSpot(e, t) {
    const on = Object.values(state.entities).filter(u => u.type !== 'hero' && !u.dead && fight[u.id]?.target === t.id).map(u => u.id).sort();
    const n = on.length, k = Math.max(0, on.indexOf(e.id));
    const r = reachOf(e, t) * 0.8, a = Math.atan2(e.z - t.z, e.x - t.x) + (n > 1 ? (k - (n - 1) / 2) * 0.9 : 0);
    const spot = [t.x + Math.cos(a) * r, t.z + Math.sin(a) * r];
    return t.place === 'street' ? nav.nearestFree(...spot) || [t.x, t.z] : spot;
  }

  // Swings in progress: land the hit on the strike tick (if the target is still in reach), end the swing
  function swingStep(e, unit) {
    const w = e.swing;
    if (!w) return false;
    if (state.tick === w.strike) {
      const t = state.entities[w.target];
      if (hostile(e, t) && Math.hypot(t.x - e.x, t.z - e.z) <= reachOf(e, t) + 0.6) {
        const crit = rng() < (unit.critChance || 0);
        hit(e, t, Math.round(unit.damage * damageScale(e) * (crit ? unit.critMultiplier || 2 : 1)), crit);
      }
    }
    if (state.tick >= w.start + w.len) { delete e.swing; return false; }
    e.anim = 'attack';
    return true;
  }

  // Small seeded random numbers, so a game replays the same way from the same seed
  let seed = (options.seed ?? 12345) >>> 0;
  function rng() {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let x = seed;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }

  function hit(a, t, damage, crit = false, kind = null) {
    t.hp = Math.max(0, t.hp - damage);
    t.hitAt = state.tick;
    delete t.execute;                // a hit breaks an execute channel
    // this tick's hits, for damage numbers and effects (cleared every tick)
    state.hits.push({ a: a.id, t: t.id, damage, crit, kill: t.hp <= 0, x: t.x, z: t.z, dir: a.dir, weapon: a.model, ...(kind ? { kind } : {}) });
    // Red Lantern: heal part of the damage dealt
    const steal = a.buffs?.lantern?.lifesteal;
    if (steal && !a.dead && a.maxHp) a.hp = Math.min(a.maxHp, a.hp + damage * steal);
    if (t.hp > 0) return;
    delete t.swing;
    delete t.dash;
    delete t.buffs;
    delete paths[t.id];
    delete fight[t.id];
    t.anim = 'death';
    // crew go down, not dead: an enemy can finish them with an execute (see executeStep)
    if (t.type !== 'hero') { t.downed = true; t.downedAt = state.tick; return; }
    t.dead = true;
    t.anim = 'death';
    t.diedAt = state.tick;
    delete paths[t.id];
    delete fight[t.id];
  }

  // Downed crew left alone (no standing enemy within carryRadius for carryAfterSeconds)
  // are carried to the clinic. e.threatAt = the last tick an enemy was close.
  function carryOffDowned() {
    const r = units?.rules || {}, wait = secs(r.carryAfterSeconds ?? 5), radius = r.carryRadius ?? 8;
    for (const e of Object.values(state.entities)) {
      if (!e.downed || e.dead) continue;
      e.threatAt ??= e.downedAt;
      if (Object.values(state.entities).some(o => hostile(o, { ...e, downed: false }) && !o.downed && Math.hypot(o.x - e.x, o.z - e.z) < radius)) e.threatAt = state.tick;
      if (state.tick - e.threatAt < wait || Object.values(state.entities).some(o => o.execute?.target === e.id)) continue;
      if (!clans?.carryOff(e)) continue;
      delete state.entities[e.id];
      delete intents[e.id];
      for (const u of Object.values(state.entities)) if (u.order?.target === e.id && u.order.kind === 'attack') u.order = { kind: 'move', x: u.x, z: u.z };
    }
  }

  // --- Downed crew and executes ----------------------------------------------------
  // A downed unit lies there and is skipped by attacks. Any unit of another clan can
  // finish it: walk up, then channel for executeSeconds; a hit, moving or a new order
  // breaks the channel. e.execute = { target, start (tick the channel began, or null), len }
  // is in the state so the renderer can draw the channel bar.
  const downedFoe = (a, t) => t && t.downed && !t.dead && a.owner && t.owner && a.owner !== t.owner && a.place === t.place;
  function startExecute(e, c) {
    let ex = e;
    if (Array.isArray(c.units) && c.units.length) {
      const t = state.entities[c.target];
      ex = c.units.map(id => state.entities[id])
        .filter(u => u && !u.dead && !u.downed && u.owner === e.owner && u.type !== 'hero' && u.place === e.place)
        .sort((a, b) => t ? Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z) : 0)[0];
    }
    if (!ex || ex.dead || ex.downed || !downedFoe(ex, state.entities[c.target])) return;
    delete ex.swing;
    delete ex.attackTarget;
    delete paths[ex.id];
    if (fight[ex.id]) delete fight[ex.id].target;
    ex.execute = { target: c.target, start: null, len: secs(units?.rules?.executeSeconds || 3) };
  }
  // One tick of an execute; false when there is nothing (left) to do
  function executeStep(e, unit) {
    const x = e.execute, t = state.entities[x.target];
    if (!downedFoe(e, t)) { delete e.execute; return false; }
    if (Math.hypot(t.x - e.x, t.z - e.z) > 1.3) {
      x.start = null;
      if (!moveTo(e, unit, t.x, t.z, false)) { delete e.execute; return false; }
      return true;
    }
    delete paths[e.id];
    e.anim = 'idle';
    e.dir = dirIndex(t.x - e.x, t.z - e.z);
    if (x.start === null) x.start = state.tick;
    if (state.tick - x.start < x.len) return true;
    delete t.downed;
    t.dead = true;
    t.diedAt = state.tick;
    state.casts.push({ a: e.id, kind: 'execute', target: t.id, x: t.x, z: t.z });
    delete e.execute;
    return true;
  }

  // Bots: once a second an idle bot crew member looks for a downed enemy within AGGRO of
  // where it belongs. It only goes when that is safe (no standing enemy within SAFE of the
  // downed unit). Whether the clan finishes a given unit is rolled once against its
  // aggression; pricier unit types are picked first.
  const SAFE = 5, botChoice = {};     // "clan:downedId" -> true / false (server-side only)
  function botExecute(e) {
    const clan = state.clans?.[e.owner];
    if (!clan?.bot || (state.tick + Number(e.id)) % TICK_RATE) return false;
    const [ax, az] = anchorOf(e);
    const price = t => units?.types[t.type]?.price || 0;
    const options = Object.values(state.entities).filter(t => downedFoe(e, t) && Math.hypot(t.x - ax, t.z - az) < AGGRO
      && !Object.values(state.entities).some(o => o.execute?.target === t.id)
      && !Object.values(state.entities).some(o => hostile(e, o) && Math.hypot(o.x - t.x, o.z - t.z) < SAFE));
    options.sort((a, b) => price(b) - price(a) || Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z));
    for (const t of options) {
      const key = `${clan.id}:${t.id}`;
      botChoice[key] ??= rng() < (clan.aggression ?? 0.5);
      if (!botChoice[key]) continue;
      startExecute(e, { target: t.id });
      return !!e.execute;
    }
    return false;
  }

  // Slow healing for anyone not hit for a while (stand-in until the hospital exists)
  function regen() {
    const r = units?.rules, rate = r?.regenPerSecond || 0, wait = (r?.regenAfterSeconds || 0) / DT;
    if (!rate) return;
    for (const e of Object.values(state.entities)) {
      if (e.dead || e.downed || !e.maxHp || e.hp >= e.maxHp || state.tick - (e.hitAt ?? -Infinity) < wait) continue;
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * rate * DT);
    }
  }


  // --- Hero abilities (Q / E / R / F) -----------------------------------------------
  // Defined per hero type in units.json ("abilities"), each with a kind the rules know:
  // dash, intimidate, rally, lantern. Cooldowns (e.cooldowns: slot -> tick it is ready)
  // and buffs (e.buffs: name -> { until, ... }) live in the state so the action bar can
  // draw them. Buffs and the dash are cleared when a unit goes down.
  const secs = s => Math.round(s / DT);
  function damageScale(a) {
    let k = 1;
    if (a.buffs?.lantern) k *= a.buffs.lantern.damage || 1;
    if (a.buffs?.intimidated) k *= a.buffs.intimidated.damage || 1;
    return k;
  }
  function addBuff(e, name, seconds, extra = {}) { (e.buffs ||= {})[name] = { until: state.tick + secs(seconds), ...extra }; }

  function useAbility(e, c) {
    const a = statsOf(e.type).abilities?.[c.slot];
    if (!a || e.type !== 'hero' || e.dead || e.dash) return;
    if ((e.cooldowns?.[c.slot] ?? 0) > state.tick) return;
    const aim = Number.isFinite(c.x) && Number.isFinite(c.z) ? [c.x, c.z] : null;
    if (a.kind === 'dash') {
      let dx = aim ? aim[0] - e.x : 0, dz = aim ? aim[1] - e.z : 0, len = Math.hypot(dx, dz);
      if (len < 0.2) {   // no aim: dash the way the hero faces
        const th = e.dir * Math.PI / 4, sx = -Math.sin(th), sy = Math.cos(th);
        dx = sx * SCREEN_RIGHT.x + sy * SCREEN_DOWN.x; dz = sx * SCREEN_RIGHT.z + sy * SCREEN_DOWN.z; len = Math.hypot(dx, dz);
      }
      const dist = Math.min(a.range, Math.max(len, 1.5)), ticks = Math.max(1, secs(a.seconds || 0.25));
      e.dash = { vx: dx / len * dist / ticks, vz: dz / len * dist / ticks, left: ticks, hit: [], start: state.tick, len: ticks };
      e.dir = dirIndex(dx, dz);
    } else if (a.kind === 'intimidate') {
      for (const t of Object.values(state.entities))
        if (hostile(e, t) && Math.hypot(t.x - e.x, t.z - e.z) <= a.radius) addBuff(t, 'intimidated', a.seconds, { damage: a.enemyDamage });
    } else if (a.kind === 'rally') {
      for (const u of Object.values(state.entities)) {
        if (u.dead || u.owner !== e.owner || u.type === 'hero' || u.place !== e.place || Math.hypot(u.x - e.x, u.z - e.z) > a.radius) continue;
        addBuff(u, 'rally', a.seconds, { boost: a.attackSpeed });
        if (u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * a.heal);
      }
    } else if (a.kind === 'lantern') {
      addBuff(e, 'lantern', a.seconds, { damage: a.damage, lifesteal: a.lifesteal });
    } else return;
    delete e.swing;
    (e.cooldowns ||= {})[c.slot] = state.tick + secs(a.cooldown);
    state.casts.push({ a: e.id, slot: c.slot, kind: a.kind, x: e.x, z: e.z, ...(a.radius ? { radius: a.radius } : {}) });
  }

  // One tick of a dash: slide toward the aim, cut every enemy passed (once each)
  function dashStep(e, unit) {
    const d = e.dash, a = unit.abilities?.Q;
    e.anim = 'run';
    tryMove(e, unit.radius, d.vx, 0);
    tryMove(e, unit.radius, 0, d.vz);
    for (const t of Object.values(state.entities)) {
      if (!hostile(e, t) || d.hit.includes(t.id) || Math.hypot(t.x - e.x, t.z - e.z) > statsOf(t.type).radius + 0.9) continue;
      d.hit.push(t.id);
      hit(e, t, Math.round(unit.damage * (a?.damageMultiplier || 1) * damageScale(e)), false, 'dash');
    }
    if (--d.left <= 0) delete e.dash;
  }

  function expireBuffs() {
    for (const e of Object.values(state.entities)) {
      if (!e.buffs) continue;
      for (const [k, b] of Object.entries(e.buffs)) if (state.tick >= b.until) delete e.buffs[k];
      if (!Object.keys(e.buffs).length) delete e.buffs;
    }
  }

  // Dead crew are removed after their fall; a knocked-out hero gets up at home with full health
  function cleanUpDead() {
    for (const e of Object.values(state.entities)) {
      if (!e.dead) continue;
      const secs = (state.tick - e.diedAt) * DT;
      if (e.type !== 'hero' && secs >= CORPSE_SECONDS) {
        delete state.entities[e.id];
        delete intents[e.id];
        for (const u of Object.values(state.entities)) if (u.order?.target === e.id && u.order.kind === 'attack') u.order = { kind: 'move', x: u.x, z: u.z };
      }
      if (e.type === 'hero' && secs >= KNOCKOUT_SECONDS) {
        const [hx, hz] = e.home || [e.x, e.z];
        Object.assign(e, { x: hx, z: hz, place: e.home ? 'street' : e.place, hp: e.maxHp, dead: false, anim: 'idle' });
        delete e.diedAt;
      }
    }
  }

  function crewStep(e, unit) {
    if (e.dead || e.downed) return;
    if (e.execute && executeStep(e, unit)) return;
    if (swingStep(e, unit)) return;
    const t = crewTarget(e);
    if (t) { engage(e, unit, t); return; }
    if (fight[e.id]) delete fight[e.id].target;
    if (botExecute(e)) return;
    const goal = crewGoal(e);
    const dist = goal ? Math.hypot(goal.x - e.x, goal.z - e.z) : 0;
    if (!goal || dist < goal.near) {
      e.anim = 'idle'; delete paths[e.id];
      if (e.order?.kind === 'attackmove') e.order = { kind: 'move', x: e.order.x, z: e.order.z };   // arrived: hold there
      if (e.order?.kind === 'heal') {                                       // at the clinic door: go in (or wait if broke)
        if (clans?.checkIn(e)) { delete state.entities[e.id]; delete intents[e.id]; delete fight[e.id]; return; }
        e.order = { kind: 'move', x: e.order.x, z: e.order.z };
      }
      return;
    }
    if (!moveTo(e, unit, goal.x, goal.z, goal.walk && dist < 4)) e.anim = 'idle';
  }

  // Crew standing on each other get nudged apart a little every tick
  function separate() {
    const crew = Object.values(state.entities).filter(e => e.type !== 'hero' && e.place === 'street' && !e.dead && !e.downed);
    for (let i = 0; i < crew.length; i++) for (let j = i + 1; j < crew.length; j++) {
      const a = crew[i], b = crew[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      const min = (statsOf(a.type).radius + statsOf(b.type).radius) * 1.1;
      if (d >= min) continue;
      const [ux, uz] = d > 1e-4 ? [dx / d, dz / d] : [1, 0], push = Math.min(0.06, (min - d) / 2);
      for (const [u, s] of [[a, -1], [b, 1]]) {
        const r = statsOf(u.type).radius;
        tryMove(u, r, ux * push * s, 0);
        tryMove(u, r, 0, uz * push * s);
      }
    }
  }

  // Spawn a unit just outside a building's door, on a spot that is free of walls and
  // other units (new crew step out in a little fan instead of stacking on the door)
  function spawnOutside(type, model, b, extra) {
    const [dx, dz] = b.door || [b.x, b.z];
    let ox = dx - b.x, oz = dz - b.z;
    const len = Math.hypot(ox, oz) || 1; ox /= len; oz /= len;
    const r = statsOf(type)?.radius || 0.35;
    const clear = (x, z) => !blockers.some(k => x + r > k.minX && x - r < k.maxX && z + r > k.minZ && z - r < k.maxZ) &&
      !Object.values(state.entities).some(e => e.place === 'street' && Math.hypot(e.x - x, e.z - z) < 0.9);
    for (let ring = 1; ring <= 4; ring++) {
      for (const side of [0, 1, -1, 2, -2]) {
        const x = dx + ox * ring * 1.1 - oz * side * 0.9, z = dz + oz * ring * 1.1 + ox * side * 0.9;
        if (clear(x, z)) return spawn(type, model, x, z, extra);
      }
    }
    return spawn(type, model, dx, dz, extra);
  }

  // The door a unit is standing at, if any
  function doorNear(id) {
    const e = state.entities[id];
    return e ? doors.find(d => Math.hypot(d.x - e.x, d.z - e.z) < DOOR_RADIUS) || null : null;
  }

  // Speeds and size: the hero from UNITS, crew from units.json
  const statsOf = type => ({ ...units?.types[type], ...UNITS[type] });

  // commands: [{ id, type: 'move', right, down, walk }] with right/down from -1 to 1 on screen,
  // [{ id, type: 'use' }] to go through the door the unit stands at,
  // [{ id, type: 'hire', business, unit }] sent by a hero inside a teahouse (players and bots alike),
  // [{ id, type: 'attack', target }] makes a hero chase and hit an enemy until it moves with WASD,
  // [{ id, type: 'execute', target, units? }] finishes off a downed enemy: the hero, or the nearest of `units` (its crew),
  // [{ id, type: 'ability', slot: 'Q' | 'E' | 'R' | 'F', x, z }] uses a hero ability (x, z = aim on the ground),
  // or [{ id, type: 'order', units: [ids], kind: 'follow' | 'move' | 'station' | 'attackmove', x, z }]
  // and [{ id, type: 'order', units: [ids], kind: 'attack', target }] sent by a hero
  function step(commands = []) {
    state.hits = [];      // this tick's hits and ability uses, for the renderer
    state.casts = [];
    for (const c of commands) {
      const e = state.entities[c.id];
      if (!e) continue;
      if (c.type === 'move') intents[c.id] = c;
      if (c.type === 'use') {
        const d = doorNear(c.id);
        if (d) { e.x = d.to.x; e.z = d.to.z; e.place = d.place; }
      }
      if (c.type === 'hire' && clans) clans.hire(e, c.business, c.unit);
      if (c.type === 'order') giveOrder(e, c);
      if (c.type === 'ability') useAbility(e, c);
      if (c.type === 'execute' && e.type === 'hero' && !e.dead) startExecute(e, c);
      if (c.type === 'attack' && e.type === 'hero' && !e.dead && hostile(e, state.entities[c.target])) { e.attackTarget = c.target; delete e.execute; }
    }
    clans?.tick(DT, spawnOutside);
    for (const f of Object.values(fight)) f.cd = Math.max(0, f.cd - DT);
    for (const e of Object.values(state.entities)) {
      const unit = statsOf(e.type);
      if (e.type !== 'hero') { crewStep(e, unit); continue; }
      if (e.dead) continue;
      if (e.dash) { dashStep(e, unit); continue; }
      const c = intents[e.id];
      let dx = 0, dz = 0;
      if (c) {
        dx = SCREEN_RIGHT.x * c.right + SCREEN_DOWN.x * c.down;
        dz = SCREEN_RIGHT.z * c.right + SCREEN_DOWN.z * c.down;
      }
      const len = Math.hypot(dx, dz);
      if (len < 0.1) {
        if (e.execute && executeStep(e, unit)) continue;
        if (swingStep(e, unit)) continue;
        // a clicked enemy: chase it and keep hitting it (Dota right-click)
        const target = state.entities[e.attackTarget];
        if (hostile(e, target)) { engage(e, unit, target, true); continue; }
        delete e.attackTarget;
        // otherwise standing still: hit the nearest enemy in reach
        const t = unit.damage && nearestEnemy(e, e.x, e.z, (unit.attackRange || 1) + 0.6);
        if (t) engage(e, unit, t, false); else e.anim = 'idle';
        continue;
      }
      // moving with WASD cancels a swing, a chase and an execute
      delete e.swing;
      delete e.execute;
      delete e.attackTarget;
      e.anim = c.walk ? 'walk' : 'run';
      e.dir = dirIndex(dx, dz);
      const d = unit[e.anim] * DT / len;
      tryMove(e, unit.radius, dx * d, 0);
      tryMove(e, unit.radius, 0, dz * d);
    }
    separate();
    cleanUpDead();
    carryOffDowned();
    expireBuffs();
    regen();
    state.tick++;
  }

  // Move along one axis, stopping flush against the first thing in the way
  function tryMove(e, r, dx, dz) {
    let x = e.x + dx, z = e.z + dz;
    for (const b of blockers) {
      if (!(x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ)) continue;
      if (dx > 0) x = Math.min(x, b.minX - r - 1e-4);
      else if (dx < 0) x = Math.max(x, b.maxX + r + 1e-4);
      else if (dz > 0) z = Math.min(z, b.minZ - r - 1e-4);
      else z = Math.max(z, b.maxZ + r + 1e-4);
    }
    // never step backwards (when already overlapping something)
    if (dx ? Math.sign(x - e.x) === Math.sign(dx) : Math.sign(z - e.z) === Math.sign(dz)) { e.x = x; e.z = z; }
  }

  return { state, step, spawn, scenery, blockers, rooms, doors, doorNear, clans, nav };
}
