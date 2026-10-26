// Shared client-side AI tools. Knowledge comes from public map sites, the clan's
// own units and visible entities; commands still go through the normal sim rules.
import { SCREEN_RIGHT, SCREEN_DOWN } from './geometry.js';
import { createNav, ROOM_NAV } from './nav.js';
import { inHeroParty } from './deployment_ai.js';

const DET = SCREEN_RIGHT.x * SCREEN_DOWN.z - SCREEN_DOWN.x * SCREEN_RIGHT.z;
const intent = (dx, dz) => ({ right: (dx * SCREEN_DOWN.z - dz * SCREEN_DOWN.x) / DET, down: (SCREEN_RIGHT.x * dz - SCREEN_RIGHT.z * dx) / DET });
export const standing = e => e && !e.dead && !e.downed && !e.jailed;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createAISupport(game, clan, hero, rules = {}) {
  const riskRatio = rules.riskRatio ?? 0.8;
  const S = game.state, me = () => S.entities[hero];
  const all = () => Object.values(S.entities);
  const crew = () => all().filter(e => e.owner === clan && e.type !== 'hero' && !e.guard && standing(e) && inHeroParty(game, e));
  const sees = e => game.vision.canSee(clan, e);
  const rooms = new Map(), routes = new Map(), cooldowns = new Map(), camps = new Map();
  const exiting = new Set();
  const cycle = () => (S.contracts?.day ?? 0) * 2 + Number(S.night);
  let path = null, failed = false, campCycle = cycle();
  const blocked = key => (cooldowns.get(key) ?? 0) > S.tick;
  const avoid = (key, seconds = rules.goalCooldownSeconds ?? 60) => cooldowns.set(key, S.tick + seconds * 20);
  const reset = () => { path = null; failed = false; };
  const known = b => b.owner === clan || sees({ x: b.x, z: b.z, place: 'street' })
    || !!game.vision.grid(clan).explored[game.vision.cellOf(b.x, b.z)];
  function grid(place) {
    if (place === 'street') return game.nav;
    const r = game.rooms.find(r => r.name === place);
    if (!r) return null;
    if (!rooms.has(place)) rooms.set(place, createNav(r.blockers, {
      minX: r.origin.x, minZ: r.origin.z, maxX: r.origin.x + r.size[0], maxZ: r.origin.z + r.size[1],
    }, ROOM_NAV));
    return rooms.get(place);
  }
  function walk(out, x, z, near = 1) {
    const h = me();
    if (Math.hypot(x - h.x, z - h.z) <= near) { path = null; return true; }
    if (!path || path.place !== h.place || Math.hypot(path.x - x, path.z - z) > 0.5) {
      const pts = grid(h.place)?.findPath(h.x, h.z, x, z);
      path = { x, z, place: h.place, pts };
    }
    if (!path.pts?.length) { failed = true; return false; }
    while (path.pts.length > 1) {
      const d = Math.hypot(path.pts[0][0] - h.x, path.pts[0][1] - h.z);
      if (!(d < 0.09 || (d < 0.35 && grid(h.place).clearLine(h.x, h.z, ...path.pts[1])))) break;
      path.pts.shift();
    }
    const [wx, wz] = path.pts[0];
    // A* may back a destination out of a wall. Never keep pushing into that wall.
    if (path.pts.length === 1 && Math.hypot(wx - h.x, wz - h.z) < 0.15) { failed = true; return false; }
    // Hero WASD movement has a fixed stride. Walk into tight corners so it can
    // reach the waypoint tolerance instead of running back and forth over it.
    out.push({ id: hero, type: 'move', ...intent(wx - h.x, wz - h.z),
      ...(path.pts.length > 1 && Math.hypot(wx - h.x, wz - h.z) < 0.8 ? { walk: true } : {}) });
    return false;
  }
  function route(x, z) {
    const h = me(), room = game.rooms.find(r => r.name === h.place);
    const b = Object.values(S.businesses).find(b => b.room === h.place);
    const [sx, sz] = h.place === 'street' ? [h.x, h.z] : b?.ring || [x, z];
    const key = `${Math.floor(sx / 6)},${Math.floor(sz / 6)}:${x},${z}`;
    let entry = routes.get(key);
    if (!entry || S.tick - entry.tick > 100) {
      const pts = game.nav.findPath(sx, sz, x, z);
      let d = Infinity;
      if (pts?.length && Math.hypot(pts.at(-1)[0] - x, pts.at(-1)[1] - z) < 2) {
        d = 0; let px = sx, pz = sz;
        for (const [nx, nz] of pts) { d += Math.hypot(nx - px, nz - pz); px = nx; pz = nz; }
      }
      entry = { tick: S.tick, d }; routes.set(key, entry);
      if (routes.size > 128) routes.delete(routes.keys().next().value);
    }
    return entry.d + (room ? distance(h, room.exit) + 2 : 0);
  }
  function recall(out, mobileOnly = false) {
    const units = crew().filter(u => !['follow', 'heal'].includes(u.order?.kind)
      && (!mobileOnly || (u.place === 'street' && u.order?.kind !== 'enter')));
    if (units.length) {
      const nearby = units.filter(u => u.place === me().place);
      if (nearby.length) out.push({ id: hero, type: 'order', units: nearby.map(u => u.id), kind: 'follow' });
      if (me().place === 'street') moveCrewOut(out, units.filter(u => u.place !== 'street'), me());
    }
  }
  function moveCrewOut(out, units, destination) {
    const ids = units.filter(u => !exiting.has(u.id)).map(u => u.id);
    if (ids.length) {
      out.push({ id: hero, type: 'order', units: ids, kind: 'move', x: destination.x, z: destination.z });
      ids.forEach(id => exiting.add(id));
    }
  }
  function toStreet(out, units) {
    const h = me();
    if (h.place === 'street') {
      const arrived = [...exiting].map(id => S.entities[id]).filter(u => standing(u) && u.place === 'street');
      const follow = arrived.filter(u => u.order?.kind === 'move' && u.order.place === 'street');
      if (follow.length) out.push({ id: hero, type: 'order', units: follow.map(u => u.id), kind: 'follow' });
      for (const id of exiting) if (!standing(S.entities[id]) || S.entities[id].place === 'street') exiting.delete(id);
      return true;
    }
    const rm = game.rooms.find(r => r.name === h.place);
    if (!rm) { failed = true; return false; }
    const ids = units ?? crew().filter(u => u.place === h.place && u.order?.kind !== 'heal').map(u => u.id);
    if (walk(out, rm.exit.x, rm.exit.z, 0.6)) {
      const door = game.doors.find(d => d.place === 'street' && d.x === rm.exit.x && d.z === rm.exit.z);
      out.push({ id: hero, type: 'use', units: [] });
      if (door?.to) moveCrewOut(out, ids.map(id => S.entities[id]).filter(u => standing(u) && u.place === h.place), door.to);
    }
    return false;
  }
  const stats = e => ({ ...game.settings.units.types[e.type], ...game.settings.units.models?.[e.model],
    ...(e.wild && !e.camp ? game.settings.bandits?.types?.[e.type]?.roamerStats : {}) });
  function power(e) {
    const t = stats(e);
    return Math.sqrt(Math.max(0, e.hp) * (t.damage || 8) / (t.attackSpeed || 1));
  }
  const party = () => [me(), ...crew().filter(u => u.place === me().place && u.order?.kind !== 'heal' && distance(u, me()) < 14)];
  const strength = () => party().reduce((n, u) => n + power(u), 0);
  const wild = () => all().filter(e => e.wild && standing(e) && e.place === 'street' && sees(e));
  function safe(targets, ratio = riskRatio) { return targets.reduce((n, e) => n + power(e), 0) < strength() * ratio; }
  function observe() {
    const currentCycle = cycle();
    if (currentCycle !== campCycle) { camps.clear(); campCycle = currentCycle; }
    for (const c of S.banditCamps || []) {
      // Runtime resident IDs/clearedAt are deliberately never consulted here.
      if (!sees({ x: c.x, z: c.z, place: 'street' })) continue;
      const residents = wild().filter(e => e.camp === c.id);
      const old = camps.get(c.id);
      camps.set(c.id, { empty: !residents.length, tick: S.tick, count: residents.length, seen: old?.seen ?? S.tick });
    }
  }
  function pickHunt() {
    observe();
    const h = me();
    const bodies = all().filter(e => e.dead && e.loot > 0 && e.place === 'street' && sees(e)
      && !blocked(`loot:${e.id}`) && !wild().some(w => distance(w, e) < 8 && !safe(wild().filter(v => distance(v, w) < 8))));
    const body = bodies.sort((a, b) => distance(h, a) - distance(h, b))[0];
    if (body && route(body.x, body.z) < 40) return { kind: 'hunt', body: body.id };
    const visible = wild().filter(e => distance(h, e) < 18 && !blocked(`wild:${e.id}`) && safe(wild().filter(v => distance(v, e) < 8)))
      .sort((a, b) => distance(h, a) - distance(h, b))[0];
    if (visible) return { kind: 'hunt', target: visible.id };
    const options = (S.banditCamps || []).filter(c => !blocked(`camp:${c.id}`) && !camps.get(c.id)?.empty)
      .map(c => {
        const count = camps.get(c.id)?.count ?? c.members.length;
        const danger = c.members.reduce((n, type) => n + power({ type, hp: game.settings.units.types[type].hp }), 0) * count / c.members.length;
        return { c, score: danger < strength() * riskRatio ? count * 25 / (15 + route(c.x, c.z)) : -1 };
      }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    return options[0] ? { kind: 'hunt', camp: options[0].c.id } : null;
  }
  function engage(out, target) {
    const h = me();
    if (!standing(target) || !sees(target) || target.place !== h.place) return false;
    const units = crew().filter(u => u.place === h.place && u.order?.kind !== 'heal'
      && !(u.order?.kind === 'attack' && u.order.target === target.id));
    if (units.length) {
      out.push({ id: hero, type: 'order', units: units.map(u => u.id), kind: 'attack', target: target.id, resume: true });
    }
    if (h.attackTarget !== target.id) out.push({ id: hero, type: 'attack', target: target.id });
    const range = (stats(h).attackRange || 2.5) * 0.8;
    walk(out, target.x, target.z, range);
    return true;
  }
  function hunt(out, goal) {
    if (!goal.called) { recall(out, true); goal.called = true; }
    if (!toStreet(out)) return false;
    observe();
    const h = me(), c = (S.banditCamps || []).find(c => c.id === goal.camp);
    const targets = wild().filter(e => c ? e.camp === c.id
      || (distance(e, h) < 6 && (!e.camp || (e.angry?.[clan] ?? 0) > S.tick))
      : e.id === goal.target || distance(e, h) < 6)
      .sort((a, b) => (a.id === h.attackTarget ? -1 : 0) - (b.id === h.attackTarget ? -1 : 0) || a.hp - b.hp);
    if (targets.length) {
      const group = wild().filter(e => distance(e, targets[0]) < 8);
      // Optional hunts need a safety margin. Once spotted, defend against a
      // winnable group instead of repeatedly cancelling work while it hits us.
      const defending = group.some(e => (e.angry?.[clan] ?? 0) > S.tick && distance(e, h) < 6);
      if (!safe(group, defending ? 1 : riskRatio)) { avoid(targets[0].camp ? `camp:${targets[0].camp}` : `wild:${targets[0].id}`); return true; }
      return !engage(out, targets[0]);
    }
    const body = all().filter(e => e.dead && e.loot > 0 && e.place === 'street' && sees(e)
      && (c ? e.camp === c.id : e.id === goal.body || e.id === goal.target || distance(e, h) < 10))
      .sort((a, b) => distance(a, h) - distance(b, h))[0];
    if (body) {
      if (h.lootTarget !== body.id) out.push({ id: hero, type: 'loot', target: body.id });
      return false;
    }
    if (c && distance(h, c) > 5) { walk(out, c.x, c.z, 4); return false; }
    return true;
  }
  const key = g => g?.camp ? `camp:${g.camp}` : g?.body ? `loot:${g.body}` : g?.target ? `wild:${g.target}` : `${g?.kind}:${g?.business ?? g?.job ?? ''}`;
  return { walk, toStreet, route, recall, known, crew, sees, power, safe, wild, pickHunt, hunt, engage, reset,
    blocked, avoid, key, failed: () => failed, camps };
}
