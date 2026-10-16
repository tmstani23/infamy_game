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

export function createGame({ district, catalog, cutouts, interiors = {}, parts = null, recipes = {}, units = null }) {
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
  const state = { tick: 0, entities: {}, businesses: {} };
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
    const o = state.entities[id].order;
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
    if (hero.type !== 'hero' || !Array.isArray(c.units) || !['follow', 'move', 'station'].includes(c.kind)) return;
    if (c.kind !== 'follow' && !(Number.isFinite(c.x) && Number.isFinite(c.z))) return;
    const crew = c.units.map(id => state.entities[id])
      .filter(u => u && u.owner === hero.owner && u.type !== 'hero' && u.place === 'street');
    crew.forEach((u, k) => {
      delete paths[u.id];
      if (c.kind === 'follow') { u.order = { kind: 'follow', target: hero.id }; u.order.slot = freeSlot(hero.id, u.id); return; }
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
      if (!h || h.place !== e.place) return null;          // hero went indoors: wait outside
      const [ox, oz] = followOffset(o.slot);
      return { x: h.x + ox, z: h.z + oz, near: Math.hypot(e.x - h.x, e.z - h.z) < 2.2 + o.slot * 0.08 ? 0.6 : 0.3, walk: h.anim === 'walk' };
    }
    return { x: o.x, z: o.z, near: 0.25, walk: false };
  }

  function crewStep(e, unit) {
    const goal = crewGoal(e);
    const dist = goal ? Math.hypot(goal.x - e.x, goal.z - e.z) : 0;
    if (!goal || dist < goal.near) { e.anim = 'idle'; delete paths[e.id]; return; }
    let p = paths[e.id];
    if (!p || Math.hypot(p.gx - goal.x, p.gz - goal.z) > 1.2 || !p.pts.length) {
      p = paths[e.id] = { pts: nav.findPath(e.x, e.z, goal.x, goal.z) || [], gx: goal.x, gz: goal.z };
      if (!p.pts.length) { e.anim = 'idle'; return; }
    }
    // the last leg goes straight at the live goal (a follower keeps up with a moving hero)
    let [wx, wz] = p.pts.length === 1 ? [goal.x, goal.z] : p.pts[0];
    if (p.pts.length > 1 && Math.hypot(wx - e.x, wz - e.z) < 0.35) { p.pts.shift(); [wx, wz] = p.pts.length === 1 ? [goal.x, goal.z] : p.pts[0]; }
    const dx = wx - e.x, dz = wz - e.z, len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    e.anim = goal.walk && dist < 4 ? 'walk' : 'run';
    e.dir = dirIndex(dx, dz);
    const d = Math.min(unit[e.anim] * DT, len) / len;
    tryMove(e, unit.radius, dx * d, 0);
    tryMove(e, unit.radius, 0, dz * d);
  }

  // Crew standing on each other get nudged apart a little every tick
  function separate() {
    const crew = Object.values(state.entities).filter(e => e.type !== 'hero' && e.place === 'street');
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
  const statsOf = type => UNITS[type] || units?.types[type];

  // commands: [{ id, type: 'move', right, down, walk }] with right/down from -1 to 1 on screen,
  // [{ id, type: 'use' }] to go through the door the unit stands at,
  // [{ id, type: 'hire', business, unit }] sent by a hero inside a teahouse (players and bots alike),
  // or [{ id, type: 'order', units: [ids], kind: 'follow' | 'move' | 'station', x, z }] sent by a hero
  function step(commands = []) {
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
    }
    clans?.tick(DT, spawnOutside);
    for (const e of Object.values(state.entities)) {
      const unit = statsOf(e.type);
      if (e.type !== 'hero') { crewStep(e, unit); continue; }
      const c = intents[e.id];
      let dx = 0, dz = 0;
      if (c) {
        dx = SCREEN_RIGHT.x * c.right + SCREEN_DOWN.x * c.down;
        dz = SCREEN_RIGHT.z * c.right + SCREEN_DOWN.z * c.down;
      }
      const len = Math.hypot(dx, dz);
      if (len < 0.1) { e.anim = 'idle'; continue; }
      e.anim = c.walk ? 'walk' : 'run';
      e.dir = dirIndex(dx, dz);
      const d = unit[e.anim] * DT / len;
      tryMove(e, unit.radius, dx * d, 0);
      tryMove(e, unit.radius, 0, dz * d);
    }
    separate();
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
