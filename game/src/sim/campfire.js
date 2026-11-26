// Campfires (world variety P1, Tim 2026-11-25, plan in project files war_build/world_variety/plan.md part F). Island only.
// Make camp ({ id: <hero id>, type: 'campfire', units?: [ids] }, key N): the hero lights a fire a step ahead of him and
// sits down; his selected crew (else the crew following him) walk to seats round it and sit. Everyone seated heals
// rules.campfire.healPerSecond of their max health a second (sim/stats.js regeneration). Refused inside a war circle,
// in a town ring, on a horse, aboard, or within calmSeconds of a hit or a blow. The camp ends when the hero stands up
// (moves off his seat, any order, Shift+N again), when anyone at it is hit, or when a war circle comes over it. A crew member
// given another order just gets up and goes. The fire burns down for emberSeconds after (drawn only, render/campfire_fx.js).
// A lit fire is a light for island sight (sim/vision.js lightsNear) and stealth (sim/game.js islandLit).
// state.campfires: { [id]: { id, owner, hero, x, z, lit, seats: [{ x, z, unit }], out? } }; on units: e.campfire (the fire's
// id), e.sitting (seated now, render/view.js plays 'sit' on a log).
// createCampfires({ state, rules, nav, inWarCircle, inTown, dismount, say, moveTo }) -> { command, tick, backStep, lightsNear, litAt, at }
import { dirIndex } from './geometry.js';

export function createCampfires({ state, rules, nav = () => null, inWarCircle = () => false, inTown = () => false, dismount = () => {}, say = () => {}, moveTo = () => false }) {
  const R = () => rules?.campfire || {};
  const fires = () => (state.campfires ||= {});
  const T = s => Math.round(s * 20);
  // who sits with the hero: his crew, not workers, settlers' wagons, guides, vehicles, horses, ships or war troops
  const sitter = (u, owner) => u && u.owner === owner && u.type !== 'hero' && !u.dead && !u.downed && !u.jailed && !u.garrison && !u.aboard && !u.shipRide
    && !u.worker && u.type !== 'worker' && !u.guide && !u.captain && !u.civilian && !u.railGang && !u.vehicle && !u.ship && !u.cannon && !u.warTroop
    && u.type !== 'horse' && !['omnibus', 'rickshaw'].includes(u.type) && u.place === 'world';
  const fought = (u, calm) => state.tick - Math.max(u.hitAt ?? -Infinity, u.foughtAt ?? -Infinity) < calm;
  const at = e => { const f = e?.campfire && fires()[e.campfire]; return f && !f.out ? f : null; };

  // the camp rules, checked when Shift+N starts the cast and again when the fire catches: the group that sits, or null (said why)
  function ready(e, c) {
    const r = R(), calm = T(r.calmSeconds ?? 10);
    if (e.place !== 'world') return say(e.owner, 'Make camp out on the island');
    if (e.dead || e.downed || e.jailed) return say(e.owner, 'Your hero cannot make camp now');
    if (e.aboard || e.shipRide) return say(e.owner, 'Get ashore to make camp');
    if (inWarCircle(e.x, e.z)) return say(e.owner, 'No camp inside a war circle');
    if (inTown(e.x, e.z)) return say(e.owner, 'Make camp out in the wild, not in a town');
    const ids = Array.isArray(c.units) && c.units.length ? c.units : Object.values(state.entities).filter(u => u.order?.kind === 'follow' && u.order.target === e.id).map(u => u.id);
    const group = ids.map(id => state.entities[id]).filter(u => sitter(u, e.owner) && Math.hypot(u.x - e.x, u.z - e.z) <= (r.groupRange ?? 30));
    if ([e, ...group].some(u => fought(u, calm))) return say(e.owner, 'Not while there is fighting');
    return group;
  }
  // Shift+N starts "Preparing fire" (Tim 2026-11-26: a short cast with a cast bar): castSeconds standing still; moving,
  // a hit, going down or Shift+N again stops it. e.campCast = { start, until, x, z (where he stands), units } for the bar
  function cast(e, c) {
    if (!ready(e, c)) return;
    if (e.mounted) dismount(e);
    e.campCast = { start: state.tick, until: state.tick + Math.max(1, T(R().castSeconds ?? 2)), x: e.x, z: e.z, units: Array.isArray(c.units) ? c.units.slice() : [] };
    (state.campCasts ||= {})[e.id] = 1;
  }
  function stopCast(e, why) {
    if (!e) return;
    delete e.campCast; delete state.campCasts?.[e.id];
    if (why) say(e.owner, why);
  }
  function make(e, c) {
    const r = R(), group = ready(e, c);
    if (!group) return;
    // one camp per clan (Tim 2026-11-26: no spamming fires all over): the old one goes out and is cleared first
    for (const old of Object.values(fires())) if (old.owner === e.owner) { end(old); delete fires()[old.id]; }
    if (e.mounted) dismount(e);
    for (const u of group) if (u.mounted) dismount(u);
    // the fire a step ahead of the hero (his facing), on open ground
    const a = dirAngle(e.dir ?? 0), ahead = r.fireAhead ?? 2.4;
    const [fx, fz] = nav()?.nearestFree(e.x + Math.sin(a) * ahead, e.z + Math.cos(a) * ahead) || [e.x + Math.sin(a) * ahead, e.z + Math.cos(a) * ahead];
    const id = `${e.owner}:${state.tick}`, seats = [];
    // seats on a ring round the fire, the hero's first (where he is, pulled onto the ring), the rest spaced evenly
    const n = group.length + 1, rad = r.seatRadius ?? 2.6, a0 = Math.atan2(e.x - fx, e.z - fz);
    for (let i = 0; i < n; i++) {
      const b = a0 + i * 2 * Math.PI / Math.max(n, r.seatsMin ?? 3), x = fx + Math.sin(b) * rad, z = fz + Math.cos(b) * rad;
      const [sx, sz] = i ? nav()?.nearestFree(x, z) || [x, z] : [e.x, e.z];
      seats.push({ x: sx, z: sz, unit: i ? group[i - 1].id : e.id });
    }
    const f = fires()[id] = { id, owner: e.owner, hero: e.id, x: fx, z: fz, lit: state.tick, seats };
    e.campfire = id; e.sitting = true; e.dir = dirIndex(fx - e.x, fz - e.z);
    group.forEach((u, i) => {
      const s = seats[i + 1];
      u.campfire = id; delete u.sitting;
      u.campPrev = u.order?.kind === 'follow' ? { kind: 'follow', target: u.order.target } : null;
      u.order = { kind: 'move', x: s.x, z: s.z, place: 'world', campfire: id };
    });
    state.casts?.push({ kind: 'campfire', x: fx, z: fz, place: 'world', a: e.id });
    say(e.owner, group.length ? 'You make camp. Your crew sit down by the fire' : 'You make camp', true);
    return f;
  }

  // a unit leaves the fire: up on its feet; crew go back to following when that is what they did
  function leave(u, f, restore) {
    if (!u) return;
    delete u.sitting; delete u.campfire;
    if (u.type !== 'hero' && restore && u.order?.campfire === f.id) u.order = u.campPrev && state.entities[u.campPrev.target] && !state.entities[u.campPrev.target].dead ? u.campPrev : { kind: 'move', x: u.x, z: u.z, place: 'world', arrived: true };
    delete u.campPrev;
  }
  function end(f, why, good = false) {
    if (f.out) return;
    f.out = state.tick;
    for (const s of f.seats) leave(state.entities[s.unit], f, true);
    if (why) say(f.owner, why, good);
  }

  // right-click your own fire, lit or burning down (Tim 2026-11-26): the hero walks back to his seat, sits, and the fire
  // keeps going; the crew who sat there come back to their seats. e.campBack = fire id while he walks (WASD ends it)
  function back(e, fireId) {
    const f = fires()[fireId];
    if (!f || f.owner !== e.owner || e.place !== 'world' || at(e) === f) return;
    if (e.campCast) stopCast(e);
    f.back = e.id; e.campBack = f.id;
  }
  function stopBack(e) { const f = fires()[e.campBack]; if (f?.back === e.id) delete f.back; delete e.campBack; }
  // one tick of the walk back; true while still walking
  function backStep(e, unit) {
    const f = fires()[e.campBack], s = f?.seats[0];
    if (!s || f.back !== e.id || e.dead || e.downed || e.jailed || e.place !== 'world' || e.aboard) { stopBack(e); return false; }
    if (Math.hypot(e.x - s.x, e.z - s.z) > 0.3 && moveTo(e, unit, s.x, s.z, false)) return true;
    stopBack(e);
    if (Math.hypot(e.x - s.x, e.z - s.z) <= 1) relight(e, f);
    e.anim = 'idle';
    return false;
  }
  function relight(e, f) {
    const seatOf = u => f.seats.find(s => s.unit === u.id);
    const group = ready(e, { units: f.seats.slice(1).map(s => s.unit) });
    if (!group) return;
    for (const old of Object.values(fires())) if (old !== f && old.owner === e.owner) { end(old); delete fires()[old.id]; }
    if (e.mounted) dismount(e);
    delete f.out; f.lit = state.tick;
    const s0 = f.seats[0]; e.x = s0.x; e.z = s0.z;
    e.campfire = f.id; e.sitting = true; e.dir = dirIndex(f.x - e.x, f.z - e.z);
    const crew = group.filter(seatOf);
    for (const u of crew) {
      const s = seatOf(u);
      if (u.mounted) dismount(u);
      u.campfire = f.id; delete u.sitting;
      u.campPrev = u.order?.kind === 'follow' ? { kind: 'follow', target: u.order.target } : null;
      u.order = { kind: 'move', x: s.x, z: s.z, place: 'world', campfire: f.id };
    }
    say(e.owner, crew.length ? 'Back by the fire. Your crew sit down again' : 'Back by the fire', true);
  }

  function command(e, c) {
    if (e.type !== 'hero') return;
    if (c.action === 'back') return back(e, c.fire);
    const f = at(e);
    if (f) return end(f, 'You break camp', true);
    if (e.campCast) return stopCast(e, 'You stop preparing the fire');
    cast(e, c);
  }

  function tick() {
    const r = R(), ember = T(r.emberSeconds ?? 20), sit = r.seatSnap ?? 0.8;
    for (const id of Object.keys(state.campCasts || {})) {
      const e = state.entities[id], k = e?.campCast;
      if (!k) { delete state.campCasts[id]; continue; }
      if (e.dead || e.downed || e.jailed || e.place !== 'world' || e.mounted || e.aboard) { stopCast(e); continue; }
      if (Math.hypot(e.x - k.x, e.z - k.z) > (r.standRange ?? 0.6)) { stopCast(e, 'You moved: no fire'); continue; }
      if ((e.hitAt ?? -Infinity) > k.start) { stopCast(e, 'You were hit: no fire'); continue; }
      if (state.tick < k.until) continue;
      stopCast(e);
      make(e, { units: k.units });
    }
    for (const f of Object.values(fires())) {
      if (f.out) { if (state.tick - f.out > ember && state.entities[f.back]?.campBack !== f.id) delete fires()[f.id]; continue; }   // not while he walks back to it
      const hero = state.entities[f.hero], seat0 = f.seats[0];
      if (!hero || hero.dead || hero.downed || hero.jailed || hero.place !== 'world' || hero.mounted || hero.campfire !== f.id) { end(f); continue; }
      if (Math.hypot(hero.x - seat0.x, hero.z - seat0.z) > (r.standRange ?? 0.6)) { end(f); continue; }   // he walked off: up and away
      const there = f.seats.map(s => state.entities[s.unit]).filter(u => u && u.campfire === f.id);
      if (there.some(u => (u.hitAt ?? -Infinity) > f.lit)) { end(f, 'Your camp is attacked!'); continue; }
      if (inWarCircle(f.x, f.z)) { end(f, 'A war circle covers your camp: you break camp'); continue; }
      for (const s of f.seats) {
        const u = state.entities[s.unit];
        if (!u || u.campfire !== f.id) continue;
        if (u.type !== 'hero' && (u.dead || u.downed || u.order?.campfire !== f.id)) { leave(u, f, false); continue; }   // told to go elsewhere
        if (u.type !== 'hero' && !u.sitting && u.order.arrived && Math.hypot(u.x - s.x, u.z - s.z) <= sit) u.sitting = true;
        if (u.sitting) u.dir = dirIndex(f.x - u.x, f.z - u.z);
      }
    }
  }

  // lit fires near a point (island sight and stealth treat them like the lit campfires of the map)
  function lightsNear(x, z, r) {
    const out = [];
    for (const f of Object.values(state.campfires || {})) if (!f.out && Math.hypot(f.x - x, f.z - z) <= r) out.push({ x: f.x, z: f.z, light: true, campfire: f.id });
    return out;
  }
  return { command, tick, backStep, lightsNear, litAt: (x, z, r) => lightsNear(x, z, r).length > 0, at, end };
}

// the facing of a sprite row (0..7 = S, SW, W, NW, N, NE, E, SE, sim/geometry.js dirIndex) as a ground angle for sin/cos
function dirAngle(d) {
  for (const k of [0, 1, 2, 3, 4, 5, 6, 7]) { const a = k * Math.PI / 4; if (dirIndex(Math.sin(a), Math.cos(a)) === d) return a; }
  return 0;
}
