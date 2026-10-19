// The game rules. Holds the state and advances it one fixed tick at a time from
// commands. No three.js and no DOM: in multiplayer a Colyseus server runs this
// same code, and browsers only send commands and draw the state they get back.
import { placeScenery, placePiece, dirIndex, SCREEN_RIGHT, SCREEN_DOWN, shapeBlockers } from './geometry.js';
import { buildRoom3d, INTERIOR_ORIGIN } from './interiors.js';
import { generateRoom } from './generate.js';
import { createClans } from './clans.js';
import { createNav, ROOM_NAV } from './nav.js';
import { createCivilians } from './civilians.js';
import { createBandits, WILD } from './bandits.js';
import { createVision } from './vision.js';
import { createPolice, POLICE } from './police.js';
import { applySettings } from './settings.js';
import { createBusinesses } from './businesses.js';

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

// Unit types: size and speeds in world units per second (the ronin is 2 tall)
export const UNITS = {
  hero: { radius: 0.35, walk: 1.7, run: 6.0 },
  civilian: { radius: 0.3, walk: 1.1, run: 2.6 },   // townsfolk (sim/civilians.js); run = fleeing
};

const DOOR_RADIUS = 1.5;
const title = s => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function createGame(options) {
  const { district, catalog, cutouts, interiors = {}, parts = null, recipes = {} } = options;
  // options.settings (data/settings.json) is laid over the detail files; without it they are used as they are
  const S = options.settings ? applySettings(options, options.settings) : { ...options, dayNight: null };
  const { units = null, civilians: civData = null, bandits: banditData = null, police: policeData = null, dayNight } = S;
  const scenery = placeScenery(district, catalog, cutouts);

  // Rooms for buildings that have an interior, and the doors between them
  const rooms = [], doors = [], roomBlockers = [], roomOf = {};
  // A street door's ring sits RING_OUT out from the wall (away from the building's middle),
  // so it reads as a spot in the street rather than sinking into the building
  const RING_OUT = 1;
  const ringAt = b => {
    const [dx, dz] = b.door, ox = dx - b.x, oz = dz - b.z, len = Math.hypot(ox, oz) || 1;
    return [dx + ox / len * RING_OUT, dz + oz / len * RING_OUT];
  };
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
    const [dx, dz] = ringAt(b);
    doors.push({ x: dx, z: dz, to: room.spawn, place: room.name, label: `Enter the ${title(name)}` });
    doors.push({ x: room.exit.x, z: room.exit.z, to: { x: dx, z: dz }, place: 'street', label: 'Leave' });
  });

  // Buildings with a menu instead of a room (the clinic): a door ring that opens it.
  // Nothing happens in the rules at that door; the screen opens the menu, which sends commands.
  district.buildings.forEach((b, i) => {
    if (b.business === 'clinic' && b.door) doors.push({ x: ringAt(b)[0], z: ringAt(b)[1], menu: 'clinic', business: `b${i}`, place: 'street', label: 'Open the clinic' });
    // the police box (bribes) and the police HQ (bail), sim/police.js
    if (b.business === 'police_box' && b.door) doors.push({ x: ringAt(b)[0], z: ringAt(b)[1], menu: 'police_box', business: `b${i}`, place: 'street', label: 'Talk to the police box' });
    if (b.business === 'police_hq' && b.door) doors.push({ x: ringAt(b)[0], z: ringAt(b)[1], menu: 'police_hq', business: `b${i}`, place: 'street', label: 'Open the police HQ' });
  });

  const B = district.bounds, far = 1000;
  const blockers = [
    ...district.blockers.map(([x0, z0, x1, z1]) => ({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 })),
    ...shapeBlockers(district),       // water and the canal drawn as shapes
    ...scenery.filter(s => s.solid).map(s => s.solid),
    ...roomBlockers,
    // the edge of the street map (rooms lie beyond it, closed in by their own walls)
    { minX: -far, maxX: B.minX, minZ: -far, maxZ: far }, { minX: B.maxX, maxX: INTERIOR_ORIGIN.x - 20, minZ: -far, maxZ: far },
    { minX: -far, maxX: B.maxX, minZ: -far, maxZ: B.minZ }, { minX: -far, maxX: B.maxX, minZ: B.maxZ, maxZ: far },
  ];

  // Everything here is plain data, so it can be synced to other players as is
  // businesses: { b0: { kind: 'warehouse', x, z, door, ring, owner: null } }, keyed by building index (ring = door ring spot)
  // night: the sim clock (townsfolk follow it; the 'time' command flips it)
  // clock: the day/night cycle when settings turn it on (auto); left = ticks to the next flip, day = count of days so far;
  // dawn / dusk = true on the tick night turns to day / day to night, from the clock or the 'time' command alike (payouts at dawn)
  const state = { tick: 0, night: !!dayNight?.startAtNight, dawn: false, dusk: false, clock: null, entities: {}, businesses: {}, hits: [], casts: [], heatGains: [], ryoGains: [], policeNews: [] };
  const halfTicks = night => Math.round((night ? dayNight.nightSeconds : dayNight.daySeconds) * TICK_RATE);
  if (dayNight?.auto) state.clock = { day: 1, left: halfTicks(state.night) };
  const setNight = night => {
    if (state.night && !night) { state.dawn = true; if (state.clock) state.clock.day++; }
    if (!state.night && night) state.dusk = true;
    state.night = night;
    if (state.clock) state.clock.left = halfTicks(night);
  };
  district.buildings.forEach((b, i) => {
    if (b.business) state.businesses[`b${i}`] = { id: `b${i}`, kind: b.business, x: b.x, z: b.z, door: b.door || null, ring: b.door ? ringAt(b) : null, room: roomOf[i] || null, owner: null };
  });
  // at Wanted and up the clinic charges more (police.clinicScale); police is made further down
  const clans = units ? createClans(state, units, { clinicScale: id => police?.clinicScale(id) ?? 1 }) : null;
  const vision = createVision(state, district.bounds, units?.rules?.vision);
  const intents = {};     // latest move command per entity (server-side only)
  const nav = createNav(blockers, district.bounds);
  // a walk grid per room too, so units path round the furniture indoors instead of snagging on it
  const roomNavs = Object.fromEntries(rooms.map(r => [r.name, createNav(r.blockers, { minX: r.origin.x, minZ: r.origin.z, maxX: r.origin.x + r.size[0], maxZ: r.origin.z + r.size[1] }, ROOM_NAV)]));
  const navOf = place => place === 'street' ? nav : roomNavs[place];
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

  // order command from a hero for some of its own crew in the same place (street or room):
  // follow (the hero), move (go there and wait) or station (go there and hold it; defends later)
  function giveOrder(hero, c) {
    if (hero.type !== 'hero' || hero.dead || !Array.isArray(c.units) || !['follow', 'move', 'station', 'attack', 'attackmove', 'heal', 'stop', 'enter', 'resume'].includes(c.kind)) return;
    // enter (right-click your own business, checkpoint 5): walk to its door, go in and hold the room
    const door = c.kind === 'enter' && state.businesses[c.business]?.owner === hero.owner && doors.find(d => d.to && d.place === state.businesses[c.business].room);
    if (c.kind === 'enter' && !door) return;
    if (c.kind === 'attack' && !(fair(hero, state.entities[c.target]) && sees(hero, state.entities[c.target]))) return;
    if (!['follow', 'attack', 'heal', 'stop', 'enter', 'resume'].includes(c.kind) && !(Number.isFinite(c.x) && Number.isFinite(c.z))) return;
    const crew = c.units.map(id => state.entities[id])
      .filter(u => u && !u.dead && !u.downed && u.owner === hero.owner && u.type !== 'hero' && !u.guard && u.place === hero.place);
    crew.forEach((u, k) => {
      delete paths[u.id];
      delete u.execute;
      if (fight[u.id]) delete fight[u.id].target;
      // stop (Z, Tim 2026-10-18): stand still and stay passive, no auto attack even when hit,
      // until the next order of any kind replaces this one
      // resume (a second T, Tim 2026-10-19): call off the T attack, back to the order before it
      if (c.kind === 'resume') { if (u.order?.kind === 'attack') { delete u.swing; endAttack(u); } return; }
      if (c.kind === 'stop') { delete u.swing; u.order = { kind: 'stop' }; u.anim = 'idle'; return; }
      if (c.kind === 'follow') { u.order = { kind: 'follow', target: hero.id }; u.order.slot = freeSlot(hero.id, u.id); return; }
      // resume (T, Tim 2026-10-19): when the attack ends they go back to what they were doing
      if (c.kind === 'attack') { u.order = { kind: 'attack', target: c.target, ...(c.resume ? { prev: resumable(u) } : {}) }; return; }
      if (c.kind === 'heal') {
        const b = clans?.clinicOf();
        if (!b || u.hp >= u.maxHp || u.place !== 'street') return;   // from the street only
        const [x, z] = nav.nearestFree(...(b.door || [b.x, b.z])) || [b.x, b.z];
        u.order = { kind: 'heal', x, z };
        return;
      }
      if (c.kind === 'enter') {
        if (u.place !== 'street') return;
        const [x, z] = nav.nearestFree(door.x, door.z) || [door.x, door.z];
        u.order = { kind: 'enter', room: door.place, x, z, k, n: crew.length };
        return;
      }
      const [ox, oz] = blockOffset(k, crew.length);
      const [x, z] = navOf(u.place)?.nearestFree(c.x + ox, c.z + oz) || [c.x, c.z];
      u.order = { kind: c.kind, x, z };
    });
  }

  // Where a crew member wants to be right now, or null to stand still
  function crewGoal(e) {
    const o = e.order;
    if (!o || o.kind === 'stop') return null;
    if (o.kind === 'follow') {
      const h = state.entities[o.target];
      if (!h || h.place !== e.place || h.dead) return null;   // hero indoors or knocked out: wait
      const [ox, oz] = followOffset(o.slot);
      return { x: h.x + ox, z: h.z + oz, near: Math.hypot(e.x - h.x, e.z - h.z) < 2.2 + o.slot * 0.08 ? 0.6 : 0.3, walk: h.anim === 'walk' };
    }
    if (o.kind === 'attack') return null;
    return { x: o.x, z: o.z, near: 0.25, walk: !!o.patrol, stroll: !!o.patrol };   // patrol (house guards): walk the whole way
  }

  // Walk one tick toward (gx, gz) along a street path; false when there is no way
  function moveTo(e, unit, gx, gz, walk) {
    const grid = navOf(e.place);
    if (!grid) paths[e.id] = { pts: [[gx, gz]], gx, gz };   // a place with no walk grid: walk straight
    let p = paths[e.id];
    if (!p || Math.hypot(p.gx - gx, p.gz - gz) > 1.2 || !p.pts.length) {
      p = paths[e.id] = { pts: grid.findPath(e.x, e.z, gx, gz) || [], gx, gz };
      if (!p.pts.length) return false;
    }
    // the last leg goes straight at the live goal (keeps up with a moving hero or enemy)
    let [wx, wz] = p.pts.length === 1 ? [gx, gz] : p.pts[0];
    // a waypoint counts as reached when close and the next one is in clear view (else cutting
    // the corner snags a wide body on the furniture), or when right on it
    const near = Math.hypot(wx - e.x, wz - e.z);
    if (p.pts.length > 1 && (near < 0.05 || (near < 0.35 && grid?.clearLine(e.x, e.z, ...p.pts[1])))) { p.pts.shift(); [wx, wz] = p.pts.length === 1 ? [gx, gz] : p.pts[0]; }
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
  const AGGRO = 6, LEASH = 10, CORPSE_SECONDS = 3, LOCK_RANGE = 14;
  const fight = {};      // per unit: { cd: seconds to next hit, target } (server-side only)
  // Night bandits (sim/bandits.js) are only enemies of a clan that has made them angry
  const wild = t => t?.owner === WILD;
  // Police officers (sim/police.js) are only enemies of a clan they are after (o.angry, like bandits)
  const cop = t => t?.owner === POLICE;
  const angryAt = (w, o) => (w.angry?.[o.owner] ?? -1) > state.tick;
  // a jailed hero (sim/police.js) stands greyed out at the HQ: nobody can touch him
  const hostile = (a, b) => b && a !== b && !b.dead && !b.downed && !b.jailed && a.owner && b.owner && a.owner !== b.owner && a.place === b.place
    && (!wild(a) || angryAt(a, b)) && (!wild(b) || angryAt(b, a)) && (!cop(a) || angryAt(a, b)) && (!cop(b) || angryAt(b, a));
  // Townsfolk belong to no clan: never picked as a fight on their own, but anyone in a clan
  // can be told to attack (and finish off) one. That is what makes heat.
  const civ = t => t?.type === 'civilian';
  // anyone in a clan can also go for an officer (that is +heat and makes the police angry)
  const fair = (a, b) => hostile(a, b) || ((civ(b) || ((wild(b) || cop(b)) && !wild(a) && !cop(a))) && a !== b && !b.dead && !b.downed && !b.jailed && !!a.owner && a.place === b.place);
  // Fog of war (sim/vision.js): a clan only fights what it can see. Units outside any clan
  // (night bandits) are not limited.
  const sees = (a, b) => !state.clans?.[a.owner] || vision.canSee(a.owner, b);
  const reachOf = (a, b) => (statsOf(a.type).attackRange || 1) + statsOf(b.type).radius;

  // Officers are never picked on their own: hitting police (+heat) is always the player's
  // (or bot's) own order, so standing still next to a squad doesn't spiral the heat.
  // Except officers defending a business your clan is attacking (e.wave, sim/businesses.js)
  function nearestEnemy(e, x, z, range) {
    let best = null, bd = range;
    for (const t of Object.values(state.entities)) {
      if (!hostile(e, t) || !sees(e, t) || (cop(t) && !cop(e) && !t.wave)) continue;   // police defending a business you attack: fair game
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

  // the order a T attack goes back to afterwards: follow, hold / station / move spot, passive stop,
  // or one still on its way (attack-move, going into a business, off to the clinic)
  function resumable(u) {
    const o = u.order?.kind === 'attack' ? u.order.prev : u.order;
    return o && ['follow', 'move', 'station', 'stop', 'attackmove', 'enter', 'heal'].includes(o.kind) ? { ...o } : null;
  }
  // an attack order is over (target gone, down or out of reach): back to the order before a T,
  // else stand where it is
  function endAttack(u) {
    const p = u.order?.prev;
    if (p?.kind === 'follow') p.slot = freeSlot(p.target, u.id);
    u.order = p || { kind: 'move', x: u.x, z: u.z };
  }

  // Who this crew member should be fighting right now, if anyone
  function crewTarget(e) {
    const o = e.order || {};
    if (o.kind === 'stop') return null;                  // passive (Z): never picks a fight
    if (o.kind === 'attack') {
      const t = state.entities[o.target];
      if (fair(e, t)) return t;
      endAttack(e);                                    // target gone: back to the old order, or stand there
      return null;
    }
    // a plain move ignores enemies until it arrives (RTS rule); everything else fights back
    if ((o.kind === 'move' || o.kind === 'heal' || o.kind === 'enter') && Math.hypot(o.x - e.x, o.z - e.z) > 0.6) return null;
    // first stop anyone finishing off one of our downed crew nearby
    const executor = Object.values(state.entities).find(t => t.execute && hostile(e, t) && !cop(t)
      && state.entities[t.execute.target]?.owner === e.owner && Math.hypot(t.x - e.x, t.z - e.z) < AGGRO);
    if (executor) return executor;
    const [ax, az] = anchorOf(e);
    const f = fight[e.id];
    const old = f && state.entities[f.target];
    if (hostile(e, old) && (!cop(old) || old.wave) && Math.hypot(old.x - ax, old.z - az) < LEASH) return old;
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
    // a townsperson running away gets away during the wind-up: get right up close first
    const running = chase && civ(t) && t.flee;
    if (d > reachOf(e, t) * (running ? 0.5 : 1)) {
      if (chase) {
        // close in on a spot round the target so several attackers surround it instead of queueing
        const [sx, sz] = running ? [t.x, t.z] : surroundSpot(e, t);
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
      if (fair(e, t) && Math.hypot(t.x - e.x, t.z - e.z) <= reachOf(e, t) + 0.6) {
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

  // Heat: a number per clan for trouble caused in the street (townsfolk hurt or killed),
  // cooling by 1 every heatCoolSeconds. Nothing reacts to it yet.
  const heatFor = k => units?.rules?.civilianHeat?.[k] || 0;
  // state.heatGains = this tick's rises ({ clan, amount, reason }), for the heat pop-ups
  // c.infamy = lifetime heat (stand-in until the infamy board); the top-infamy clan gains more (police.heatScale)
  function addHeat(owner, n, reason) {
    const c = state.clans?.[owner];
    if (!c || !n) return;
    c.infamy = (c.infamy || 0) + n;
    n = Math.round(n * (police?.heatScale(owner) ?? 1));
    c.heat = (c.heat || 0) + n;
    state.heatGains.push({ clan: owner, amount: n, reason });
  }
  function coolHeat() {
    const every = secs(units?.rules?.heatCoolSeconds || 10);
    if (!state.clans || state.tick % every) return;
    for (const c of Object.values(state.clans)) if (c.heat > 0) c.heat = Math.max(0, c.heat - 1);
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
    if (civ(t)) addHeat(a.owner, heatFor('hit'), 'Assault');
    if (civ(t) && t.hp <= 0) addHeat(a.owner, heatFor('down'), 'Townsperson beaten down');
    if (wild(t)) bandits.provoke(t, a.owner);
    if (cop(a)) t.copHitAt = state.tick;     // the police box won't take a bribe right after (sim/police.js)
    // who fought where, for the police (a patrol goes to a clan's last fight, and for units seen fighting)
    if (state.clans?.[a.owner]) {
      a.foughtAt = state.tick;
      if (a.place === 'street') state.clans[a.owner].lastFight = { x: a.x, z: a.z, tick: state.tick };
      // officers defending a business you attack (e.wave) give attack.hitHeat instead: the attack already costs heat when won
      if (cop(t)) { addHeat(a.owner, t.wave ? units?.rules?.attack?.hitHeat ?? 0 : police.rules.hitPoliceHeat, 'Assaulting police'); police.provoke(t, a.owner); }
    }
    if (t.hp > 0) return;
    delete t.swing;
    delete t.dash;
    delete t.buffs;
    delete paths[t.id];
    delete fight[t.id];
    t.anim = 'death';
    // bandits die outright and pay the killer's clan
    if (wild(t)) { t.dead = true; t.diedAt = state.tick; bandits.killed(a, t); return; }
    // an officer knocked out is taken away (the HQ sends another)
    if (cop(t)) { t.dead = true; t.diedAt = state.tick; police.knockedOut(t); return; }
    // house guards (sim/businesses.js) die outright; the business sends a new one later
    if (t.guard) { t.dead = true; t.diedAt = state.tick; return; }
    // crew go down, not dead: an enemy can finish them with an execute (see executeStep)
    if (t.type !== 'hero') { t.downed = true; t.downedAt = state.tick; return; }
    // the police knock the hero down instead, and an officer arrests him (a channel only his crew can break)
    if (cop(a) && police) { t.downed = true; t.downedAt = state.tick; return; }
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
      // townsfolk fear anyone in a clan; crew only their enemies
      const threat = civ(e) ? o => o.owner && !o.dead && o.place === e.place
        : o => hostile(o, { ...e, downed: false }) || (cop(o) && !o.dead && police?.tierOf(e.owner) > 0);   // police come to arrest
      if (Object.values(state.entities).some(o => threat(o) && !o.downed && Math.hypot(o.x - e.x, o.z - e.z) < radius)) e.threatAt = state.tick;
      if (state.tick - e.threatAt < wait || Object.values(state.entities).some(o => o.execute?.target === e.id)) continue;
      // a hero the police knocked down but nobody arrested: knocked out as usual (up at the clinic)
      if (e.type === 'hero') { delete e.downed; e.dead = true; e.diedAt = state.tick; continue; }
      if (!civ(e) && !clans?.carryOff(e)) continue;      // townsfolk are helped home (sim/civilians.js sends a new one out later)
      delete state.entities[e.id];
      delete intents[e.id];
      for (const u of Object.values(state.entities)) if (u.order?.target === e.id && u.order.kind === 'attack') endAttack(u);
    }
  }

  // --- Downed crew and executes ----------------------------------------------------
  // A downed unit lies there and is skipped by attacks. Any unit of another clan can
  // finish it: walk up, then channel for executeSeconds; a hit, moving or a new order
  // breaks the channel. e.execute = { target, start (tick the channel began, or null), len }
  // is in the state so the renderer can draw the channel bar.
  // a downed hero (only the police knock one down) can only be arrested, never executed
  const downedFoe = (a, t) => t && t.downed && !t.dead && a.owner && a.place === t.place && (civ(t) || (t.owner && a.owner !== t.owner))
    && (t.type !== 'hero' || cop(a));
  // --- Looting (Tim 2026-10-19) -------------------------------------------------------
  // A bandit's body carries its ryo (body.loot). Right-click: the hero walks to it and takes it;
  // Ctrl + right-click: the nearest selected crew member does. The ryo goes to the looter's clan.
  const LOOT_REACH = 1.6;
  const lootable = (e, b) => !!b && b.dead && b.loot > 0 && b.place === e.place && sees(e, b);
  function startLoot(e, c) {
    const body = state.entities[c.target];
    if (e.type !== 'hero' || e.dead || e.downed || e.jailed) return;
    if (Array.isArray(c.units) && c.units.length) {
      const u = c.units.map(id => state.entities[id])
        .filter(u => u && !u.dead && !u.downed && u.owner === e.owner && u.type !== 'hero' && !u.guard && u.place === e.place && lootable(u, body))
        .sort((a, b) => Math.hypot(a.x - body.x, a.z - body.z) - Math.hypot(b.x - body.x, b.z - body.z))[0];
      if (!u) return;
      delete paths[u.id]; delete u.execute; delete u.swing;
      if (fight[u.id]) delete fight[u.id].target;
      u.order = { kind: 'loot', target: body.id };
      return;
    }
    if (!lootable(e, body)) return;
    delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id];
    e.lootTarget = body.id;
  }
  // One tick of walking to a body; true while busy with it (takes the ryo once in reach)
  function lootStep(e, unit, id) {
    const body = state.entities[id];
    if (!lootable(e, body)) return false;
    if (Math.hypot(body.x - e.x, body.z - e.z) <= LOOT_REACH) {
      const clan = state.clans?.[e.owner];
      if (clan) {
        clan.ryo += body.loot;
        state.ryoGains.push({ clan: clan.id, amount: body.loot, reason: `${body.type === 'night_brute' ? 'Night brute' : 'Bandit'} looted` });
        state.casts.push({ kind: 'loot', a: e.id, x: body.x, z: body.z, ryo: body.loot });
      }
      delete body.loot;   // the body then fades like any other
      e.anim = 'idle';
      return false;
    }
    if (!moveTo(e, unit, body.x, body.z, false)) return false;
    return true;
  }

  function startExecute(e, c) {
    let ex = e;
    if (Array.isArray(c.units) && c.units.length) {
      const t = state.entities[c.target];
      ex = c.units.map(id => state.entities[id])
        .filter(u => u && !u.dead && !u.downed && u.owner === e.owner && u.type !== 'hero' && !u.guard && u.place === e.place)
        .sort((a, b) => t ? Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z) : 0)[0];
    }
    if (!ex || ex.dead || ex.downed || !downedFoe(ex, state.entities[c.target]) || !sees(ex, state.entities[c.target])) return;
    delete ex.swing;
    delete ex.attackTarget;
    delete paths[ex.id];
    if (fight[ex.id]) delete fight[ex.id].target;
    ex.execute = { target: c.target, start: null, len: secs(units?.rules?.executeSeconds || 3) };
  }
  // An executed enemy (not townsfolk) pays the executor's clan its type's executeRyo, ±executeRyoSpread
  // (state.ryoGains for the badge notice; cast.ryo tells the view to burst coins)
  function payExecute(e, t, cast) {
    const clan = state.clans?.[e.owner], base = units?.types?.[t.type]?.executeRyo || 0;
    if (!clan || !base) return;
    const k = units.rules.executeRyoSpread ?? 0, amount = Math.round(base * (1 - k + rng() * 2 * k));
    clan.ryo += amount;
    cast.ryo = amount;
    const name = units.types[t.type].name || t.type[0].toUpperCase() + t.type.slice(1);
    state.ryoGains.push({ clan: clan.id, amount, reason: `${name} executed` });
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
    // police arrest instead: the unit goes to jail (sim/police.js), nobody dies
    if (cop(e)) {
      state.casts.push({ a: e.id, kind: 'arrest', target: t.id, x: t.x, z: t.z });
      if (t.type === 'hero') police.jailHero(t);
      else { police.jail(t); removeUnit(t.id); }
      delete e.execute;
      return true;
    }
    delete t.downed;
    t.dead = true;
    t.diedAt = state.tick;
    state.casts.push({ a: e.id, kind: 'execute', target: t.id, x: t.x, z: t.z });
    if (civ(t)) addHeat(e.owner, heatFor('kill'), 'Townsperson killed');
    else payExecute(e, t, state.casts[state.casts.length - 1]);
    delete e.execute;
    return true;
  }

  // Bots: once a second an idle bot crew member looks for a downed enemy within AGGRO of
  // where it belongs, or within carryRadius of itself (so nothing it keeps from being
  // carried off is out of its reach). It only goes when that is safe (no standing enemy
  // within SAFE of the downed unit), and then on a roll against its clan's aggression,
  // made again every second (a once-only "no" left crew lying there for good); pricier
  // unit types are picked first.
  const SAFE = 5;
  function botExecute(e) {
    const clan = state.clans?.[e.owner];
    if (!clan?.bot || (state.tick + Number(e.id)) % TICK_RATE) return false;
    const [ax, az] = anchorOf(e), reach = units?.rules?.carryRadius ?? 8;
    const price = t => units?.types[t.type]?.price || 0;
    const options = Object.values(state.entities).filter(t => downedFoe(e, t) && !civ(t)
      && (Math.hypot(t.x - ax, t.z - az) < AGGRO || Math.hypot(t.x - e.x, t.z - e.z) < reach)
      && !Object.values(state.entities).some(o => o.execute?.target === t.id)
      && !Object.values(state.entities).some(o => hostile(e, o) && Math.hypot(o.x - t.x, o.z - t.z) < SAFE));
    if (!options.length || rng() >= (clan.aggression ?? 0.5)) return false;
    options.sort((a, b) => price(b) - price(a) || Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z));
    startExecute(e, { target: options[0].id });
    return !!e.execute;
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
        if (u.dead || u.owner !== e.owner || u.place !== e.place || Math.hypot(u.x - e.x, u.z - e.z) > a.radius) continue;
        // heal over time (Tim 2026-10-19): a.heal in all, in healTicks equal parts, the first at once, then one a second
        const n = a.healTicks || 1;
        addBuff(u, 'rally', a.seconds, { boost: a.attackSpeed, heal: a.heal / n, ticksLeft: n, nextHeal: state.tick });
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
      if (!(hostile(e, t) || (wild(t) && fair(e, t))) || d.hit.includes(t.id) || Math.hypot(t.x - e.x, t.z - e.z) > statsOf(t.type).radius + 0.9) continue;
      d.hit.push(t.id);
      hit(e, t, Math.round(unit.damage * (a?.damageMultiplier || 1) * damageScale(e)), false, 'dash');
    }
    if (--d.left <= 0) delete e.dash;
  }

  // Buffs that heal in ticks (Rally): heal share of max health each second while they last
  function healBuffs() {
    for (const e of Object.values(state.entities)) {
      const b = e.buffs?.rally;
      if (!b?.ticksLeft || state.tick < b.nextHeal || e.dead || e.downed) continue;
      if (e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * b.heal);
      b.ticksLeft--; b.nextHeal = state.tick + secs(1);
    }
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
      if (e.type !== 'hero' && secs >= (e.loot ? (banditData?.rules?.lootSeconds ?? 60) : CORPSE_SECONDS)) {
        delete state.entities[e.id];
        delete intents[e.id];
        for (const u of Object.values(state.entities)) if (u.order?.target === e.id && (u.order.kind === 'attack' || u.order.kind === 'loot')) { if (u.order.kind === 'attack') endAttack(u); else u.order = { kind: 'move', x: u.x, z: u.z }; }
      }
      // a knocked-out hero comes round at the clinic's door ring after heroRespawnSeconds (Tim 2026-10-17),
      // or at home when the map has no clinic
      if (e.type === 'hero' && secs >= (units?.rules?.heroRespawnSeconds ?? 20)) {
        const clinic = doors.find(d => d.menu === 'clinic');
        const [hx, hz] = clinic ? [clinic.x, clinic.z] : e.home || [e.x, e.z];
        Object.assign(e, { x: hx, z: hz, place: clinic || e.home ? 'street' : e.place, hp: e.maxHp, dead: false, anim: 'idle' });
        delete e.diedAt;
      }
    }
  }

  function crewStep(e, unit) {
    if (e.dead || e.downed) return;
    if (e.execute && executeStep(e, unit)) return;
    if (swingStep(e, unit)) return;
    if (e.order?.kind === 'loot') {   // Ctrl + right-click on a body: walk there and take its ryo
      if (lootStep(e, unit, e.order.target)) return;
      e.order = { kind: 'move', x: e.x, z: e.z };
    }
    if (e.order?.kind === 'enter' && enterStep(e)) return;
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
    if (!moveTo(e, unit, goal.x, goal.z, goal.walk && (goal.stroll || dist < 4))) e.anim = 'idle';
  }

  // At the door of the business they were sent into: step inside and hold a spot near the way in
  // (a station order: they fight whoever comes in, then go back to it)
  function enterStep(e) {
    const o = e.order, d = doors.find(d => d.to && d.place === o.room);
    if (!d) { e.order = { kind: 'move', x: e.x, z: e.z }; return false; }
    if (Math.hypot(d.x - e.x, d.z - e.z) >= DOOR_RADIUS || (businesses && !businesses.mayEnter(e, d.place))) return false;
    const [ox, oz] = blockOffset(o.k, o.n);
    const [x, z] = navOf(d.place)?.nearestFree(d.to.x + ox, d.to.z + oz) || [d.to.x, d.to.z];
    Object.assign(e, { x, z, place: d.place, anim: 'idle' });
    delete paths[e.id]; delete e.swing;
    if (fight[e.id]) delete fight[e.id].target;
    e.order = { kind: 'station', x, z };
    return true;
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

  // Crew through a door with their hero (Tim 2026-10-17): going in, the crew listed in the
  // 'use' command (the player's selection) who are near the hero come along; the rest stay
  // outside. Coming out works the same way (Tim 2026-10-18): the selected crew in that room come
  // out with him, the rest stay inside and hold the room.
  // Whoever comes along lands in a little ring round the hero and follows him.
  const BRING_RADIUS = 12;
  function bringCrew(hero, from, d, ids = []) {
    const out = d.place === 'street';
    const crew = Object.values(state.entities).filter(u => u.owner === hero.owner && u.type !== 'hero' && !u.guard && !u.dead && !u.downed && u.place === from
      && (ids || []).includes(u.id) && (out || Math.hypot(u.x - d.x, u.z - d.z) < BRING_RADIUS))
      .slice(0, out ? Infinity : businesses?.crewSlots(hero.owner, d.place) ?? Infinity);   // a raid takes at most maxCrewInside crew in
    const r0 = 0.3;
    const clear = (x, z) => !blockers.some(k => x + r0 > k.minX && x - r0 < k.maxX && z + r0 > k.minZ && z - r0 < k.maxZ);
    crew.forEach((u, k) => {
      let [x, z] = [hero.x, hero.z];
      for (let n = k; n < k + 36; n++) {
        const [ox, oz] = followOffset(n % 36);
        if (clear(hero.x + ox * 0.8, hero.z + oz * 0.8)) { [x, z] = [hero.x + ox * 0.8, hero.z + oz * 0.8]; break; }
      }
      if (out) [x, z] = nav.nearestFree(x, z) || [x, z];
      Object.assign(u, { x, z, place: d.place, anim: 'idle' });
      delete paths[u.id]; delete u.execute; delete u.swing;
      if (fight[u.id]) delete fight[u.id].target;
      u.order = { kind: 'follow', target: hero.id };
      u.order.slot = freeSlot(hero.id, u.id);
    });
  }

  // The door a unit is standing at, if any
  function doorNear(id) {
    const e = state.entities[id];
    return e ? doors.find(d => Math.hypot(d.x - e.x, d.z - e.z) < DOOR_RADIUS) || null : null;
  }

  // Speeds and size: the hero and townsfolk from UNITS, crew from units.json
  const statsOf = type => ({ ...units?.types[type], ...UNITS[type] });

  const civilians = createCivilians({
    state, data: civData, pois: district.pois, nav, spawn, moveTo, statsOf,
    stopPath: e => { delete paths[e.id]; }, seed: (options.seed ?? 12345) ^ 0x5eed,
  });

  // A bandit's fighting, one tick: finish a swing, or go for the nearest clan it is angry at
  // within range; false when there is nobody to fight
  function fightStep(e, range) {
    const unit = statsOf(e.type);
    if (swingStep(e, unit)) return true;
    const t = e.angry && nearestEnemy(e, e.x, e.z, range);
    if (t) { engage(e, unit, t); return true; }
    if (fight[e.id]) delete fight[e.id].target;
    return false;
  }
  const bandits = createBandits({
    state, data: banditData, units, pois: district.pois, edges: district.edges, nav, spawn, moveTo, fightStep, statsOf,
    stopPath: e => { delete paths[e.id]; },
    remove: id => { delete state.entities[id]; delete paths[id]; delete fight[id]; delete intents[id]; },
    seed: (options.seed ?? 12345) ^ 0xba7d,
  });

  // Take a unit off the map (arrested, gone home), and stop anyone's attack order on it
  function removeUnit(id) {
    delete state.entities[id]; delete paths[id]; delete fight[id]; delete intents[id];
    for (const u of Object.values(state.entities)) if (u.order?.target === id && u.order.kind === 'attack') endAttack(u);
  }
  // Police (sim/police.js): they move and fight through the same rules as crew
  const police = units && policeData ? createPolice({
    state, data: policeData, units, district, nav, doors, spawn, spawnOutside, moveTo, statsOf, remove: removeUnit,
    stopPath: e => { delete paths[e.id]; },
    act: {
      swing: e => swingStep(e, statsOf(e.type)),
      arresting: e => !!e.execute && executeStep(e, statsOf(e.type)),
      arrest: (e, t) => startExecute(e, { target: t.id }),
      engage: (e, t) => engage(e, statsOf(e.type), t),
      hostile,
    },
    seed: (options.seed ?? 12345) ^ 0xc095,
  }) : null;

  // buying businesses and dawn payouts (sim/businesses.js); the police cut payouts in a Manhunt
  // house guards stand just inside the front room, either side of the way in (on the street at its ring if it has no room)
  const guardSpots = b => {
    const r = rooms.find(r => r.name === b.room);
    if (!r) return b.ring ? [-1, 1].map(k => ({ x: b.ring[0] + k, z: b.ring[1], place: 'street' })) : [];
    const mx = r.origin.x + r.size[0] / 2, mz = r.origin.z + r.size[1] / 2;
    const dx = mx - r.spawn.x, dz = mz - r.spawn.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
    const step = Math.min(2.5, len * 0.6);
    const grid = roomNavs[r.name];
    return [-1, 1].map(k => {
      // where a path from the way in toward that spot ends (backs off furniture in the way)
      const x = r.spawn.x + ux * step - uz * k * 1.2, z = r.spawn.z + uz * step + ux * k * 1.2;
      const way = grid?.findPath(r.spawn.x, r.spawn.z, x, z), p = way?.[way.length - 1] || [r.spawn.x, r.spawn.z];
      return { x: p[0], z: p[1], place: r.name };
    });
  };
  // spots a house guard walks between: a spread over the building's rooms, on free floor
  // (only spots a path from the way in reaches, worked out once per room)
  const patrolCache = {};
  const patrolSpots = b => {
    if (patrolCache[b.room]) return patrolCache[b.room];
    const r = rooms.find(r => r.name === b.room), grid = r && roomNavs[r.name];
    if (!grid) return [];
    const out = [];
    for (const [fx, fz] of [[0.2, 0.2], [0.5, 0.2], [0.8, 0.2], [0.8, 0.5], [0.8, 0.8], [0.5, 0.8], [0.2, 0.8], [0.2, 0.5], [0.5, 0.5]]) {
      const p = grid.nearestFree(r.origin.x + r.size[0] * fx, r.origin.z + r.size[1] * fz);
      const way = p && grid.findPath(r.spawn.x, r.spawn.z, p[0], p[1]);
      const end = way?.[way.length - 1];
      if (end && Math.hypot(end[0] - p[0], end[1] - p[1]) < 0.5) out.push({ x: p[0], z: p[1] });
    }
    return (patrolCache[b.room] = out);
  };
  const roomOfBusiness = b => rooms.find(r => r.name === b.room) || null;
  const businesses = clans ? createBusinesses({ state, units, clans, payoutShare: id => police?.payoutShare(id) ?? 1, tierOf: id => police?.tierOf(id) ?? 0,
    spawn, guardSpots, patrolSpots, roomOf: roomOfBusiness, remove: removeUnit, addHeatGain: (clan, amount, reason) => state.heatGains.push({ clan, amount, reason }) }) : null;

  // commands: [{ id, type: 'move', right, down, walk }] with right/down from -1 to 1 on screen,
  // [{ id, type: 'use', units? }] to go through the door the unit stands at (a hero brings `units`,
  //   its selected crew, inside with it; coming out, its crew in the room come too),
  // [{ id, type: 'hire', business, unit }] sent by a hero inside a teahouse (players and bots alike),
  // [{ id, type: 'attack', target }] makes a hero chase and hit an enemy until it moves with WASD,
  // [{ id, type: 'execute', target, units? }] finishes off a downed enemy: the hero, or the nearest of `units` (its crew),
  // [{ id, type: 'ability', slot: 'Q' | 'E' | 'R' | 'F', x, z }] uses a hero ability (x, z = aim on the ground),
  // [{ type: 'time', night? }] sets night on or off (no night given: flips it),
  // [{ id, type: 'business', action: 'buy' | 'attack' | 'raid' | 'lantern', business }] from a hero at a business's door ring (sim/businesses.js),
  // [{ id, type: 'police', action: 'bribe' }] at the police box, [{ id, type: 'police', action: 'bail', prisoner }] at the HQ,
  // [{ id, type: 'clinic', action: 'revive', patient } | { id, type: 'clinic', action: 'heal' }] from a hero
  //   at the clinic door: get a carried-off crew member out now, or heal the hero and nearby crew,
  // or [{ id, type: 'order', units: [ids], kind: 'follow' | 'move' | 'station' | 'attackmove', x, z }]
  // and [{ id, type: 'order', units: [ids], kind: 'attack', target }] sent by a hero
  function step(commands = []) {
    state.hits = [];      // this tick's hits and ability uses, for the renderer
    state.casts = [];
    state.heatGains = [];
    state.ryoGains = [];
    state.policeNews = [];   // this tick's police news per clan ({ clan, kind: 'lost' }), for the screen
    state.dawn = state.dusk = false;
    if (state.clock && --state.clock.left <= 0) setNight(!state.night);
    for (const c of commands) {
      if (c.type === 'time') { setNight(typeof c.night === 'boolean' ? c.night : !state.night); continue; }
      const e = state.entities[c.id];
      if (!e) continue;
      // a hero lying down or in jail can still order his crew, nothing else
      if ((e.downed || e.jailed) && c.type !== 'order' && c.type !== 'move') continue;
      if (c.type === 'move') intents[c.id] = c;
      if (c.type === 'use') {
        const d = doorNear(c.id);
        // raiders wait outside a raided business until the warm-up ends (sim/businesses.js)
        if (d?.to && (!businesses || businesses.mayEnter(e, d.place))) {   // menu doors (the clinic) have no room
          const from = e.place;
          e.x = d.to.x; e.z = d.to.z; e.place = d.place;
          if (e.type === 'hero') bringCrew(e, from, d, c.units);
        }
      }
      if (c.type === 'hire' && clans) clans.hire(e, c.business, c.unit);
      if (c.type === 'business' && businesses && e.type === 'hero') businesses.command(e, c);
      if (c.type === 'order') giveOrder(e, c);
      if (c.type === 'ability') useAbility(e, c);
      if (c.type === 'execute' && e.type === 'hero' && !e.dead) startExecute(e, c);
      if (c.type === 'loot') startLoot(e, c);
      if (c.type === 'attack' && e.type === 'hero' && !e.dead && fair(e, state.entities[c.target]) && sees(e, state.entities[c.target])) { e.attackTarget = c.target; delete e.execute; }
      // left-click elsewhere (Tim 2026-10-18): the hero drops his locked target and stops swinging at it
      if (c.type === 'stopattack' && e.type === 'hero') { if (e.swing?.target === e.attackTarget) delete e.swing; delete e.attackTarget; }
      if (c.type === 'clinic' && clans) clans.clinicMenu(e, c, doorNear(c.id), spawnOutside);
      if (c.type === 'police' && police) police.menu(e, c, doorNear(c.id));
    }
    clans?.tick(DT, spawnOutside);
    for (const f of Object.values(fight)) f.cd = Math.max(0, f.cd - DT);
    for (const e of Object.values(state.entities)) {
      const unit = statsOf(e.type);
      if (e.type === 'civilian' || e.wild || e.cop) continue;   // townsfolk, bandits and police move in their own ticks below
      if (e.type !== 'hero') { crewStep(e, unit); continue; }
      if (e.dead || e.downed || e.jailed) continue;      // knocked down by the police, or in jail (sim/police.js)
      if (e.dash) { dashStep(e, unit); continue; }
      const c = intents[e.id];
      let dx = 0, dz = 0;
      if (c) {
        dx = SCREEN_RIGHT.x * c.right + SCREEN_DOWN.x * c.down;
        dz = SCREEN_RIGHT.z * c.right + SCREEN_DOWN.z * c.down;
      }
      const len = Math.hypot(dx, dz);
      if (len < 0.1) {
        // knocking down a War Lantern (sim/businesses.js): busy, no auto attack (it only drew hits back)
        if (Object.values(state.attacks || {}).some(a => a.knock?.by === e.id)) { e.anim = 'idle'; continue; }
        if (e.lootTarget) { if (lootStep(e, unit, e.lootTarget)) continue; delete e.lootTarget; delete paths[e.id]; }
        if (e.execute && executeStep(e, unit)) continue;
        if (swingStep(e, unit)) continue;
        // a locked target (Ctrl + right-click): no chasing (Tim 2026-10-17), the hero hits it
        // whenever it is in reach and the player keeps him there with WASD; the lock drops when
        // the target is down or gone, or more than LOCK_RANGE away
        const target = state.entities[e.attackTarget];
        if (!fair(e, target) || Math.hypot(target.x - e.x, target.z - e.z) > LOCK_RANGE) delete e.attackTarget;
        else if (Math.hypot(target.x - e.x, target.z - e.z) <= reachOf(e, target)) { engage(e, unit, target, false); continue; }
        // otherwise standing still: hit the nearest enemy in reach
        const t = unit.damage && nearestEnemy(e, e.x, e.z, (unit.attackRange || 1) + 0.6);
        if (t) engage(e, unit, t, false); else e.anim = 'idle';
        continue;
      }
      // moving with WASD cancels a swing and an execute, but keeps the locked target
      delete e.swing;
      delete e.execute;
      delete e.lootTarget;
      e.anim = c.walk ? 'walk' : 'run';
      e.dir = dirIndex(dx, dz);
      const d = unit[e.anim] * DT / len;
      tryMove(e, unit.radius, dx * d, 0);
      tryMove(e, unit.radius, 0, dz * d);
    }
    civilians.tick();
    bandits.tick();
    police?.tick();
    businesses?.tick();
    separate();
    cleanUpDead();
    carryOffDowned();
    coolHeat();
    healBuffs();
    expireBuffs();
    regen();
    vision.tick();
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

  return { state, step, spawn, scenery, settings: { units, civilians: civData, bandits: banditData, police: policeData, dayNight }, blockers, rooms, doors, doorNear, clans, nav, civilians, bandits, police, businesses, vision };
}
