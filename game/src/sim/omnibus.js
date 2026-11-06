// The omnibus (Tim 2026-11-06, plan in project files omnibus_stable/plan.md). Going out on the island
// (the gate on foot or gate travel to a site) the hero arrives driving an omnibus with his settlers and
// Hero group inside: rules.omnibus.seats each, a second one when more go (at most rules.omnibus.max,
// while the clan still has them: clan.omnibusFree, rules.omnibus.max at the start, none after founding;
// the stable rebuilds them). The hero drives at rules.omnibus.speed x his run speed; a second omnibus
// follows his track. Nobody inside can attack. Hits on anyone inside go to their omnibus instead
// (stockade rule): at 0 it is wrecked and everyone piles out.
// Commands: { id: <hero id>, type: 'omnibus', action: 'deploy' } (everyone steps out, the omnibuses park)
//           { id: <hero id>, type: 'omnibus', action: 'board', omnibus?: <id>, units?: [ids] } (hero and
//           units in reach get in; no omnibus = the nearest parked one; no units = the hero and his followers)
// Rickshaws (Tim 2026-11-06 20:24) work the same way: rules.rickshaw seats (2) and speed (3.5x). Both are built
// empty at an omnibus station (sim/frontier/stable.js) and park there (park()); stationTrip() moves parked
// rickshaws with their riders for the station's instant travel.
// createOmnibus({ state, rules, spawn, remove, nav, freeSlot, followOffset, forget, say })
//   -> { ride, deploy, board, command, tick, shelter, consume, of, riders, near, park, isVehicle }
import { steer } from './vehicle_steer.js';

export function createOmnibus({ state, rules, spawn, remove, nav, freeSlot, followOffset, forget, say }) {
  const KINDS = ['omnibus', 'rickshaw'], isVehicle = e => !!e && KINDS.includes(e.type);
  const R = (kind = 'omnibus') => rules?.[kind] || {};
  const seats = () => R().seats ?? 8;
  const seatsOf = b => R(b.type).seats ?? (b.type === 'rickshaw' ? 2 : 8);
  const mine = owner => Object.values(state.entities).filter(e => isVehicle(e) && e.omnibusOwner === owner && !e.dead);
  const of = u => (u?.aboard && isVehicle(state.entities[u.aboard])) ? state.entities[u.aboard] : null;
  const riders = bus => Object.values(state.entities).filter(u => u.aboard === bus.id);
  const heroOf = owner => Object.values(state.entities).find(e => e.type === 'hero' && e.owner === owner);
  const clanOf = owner => state.clans?.[owner];
  const free = owner => { const c = clanOf(owner); if (!c) return 0; c.omnibusFree ??= R().max ?? 2; return c.omnibusFree; };

  function make(owner, x, z, dir = 0, kind = 'omnibus') {
    const r = R(kind);
    const id = spawn(kind, r.model || kind, x, z, { omnibusOwner: owner, place: 'world', hp: r.hp ?? 800, maxHp: r.hp ?? 800, holdFire: true, vehicle: true, dir, trail: [] });
    return state.entities[id];
  }
  // built at a station: parked there, empty
  function park(owner, kind, x, z) { const [px, pz] = nav()?.nearestFree(x, z) || [x, z]; return make(owner, px, pz, 0, kind); }
  // put a group into vehicles in order, filling each one's seats (the hero first, as driver of the first)
  function fill(hero, group, buses) {
    seat(hero, buses[0]);
    let k = 0, used = 1;
    for (const u of group) {
      while (buses[k] && used >= seatsOf(buses[k])) { k++; used = 0; }
      if (!buses[k]) break;
      seat(u, buses[k]); used++;
    }
  }
  function seat(u, bus) {
    u.aboard = bus.id;
    delete u.order; delete u.attackTarget; delete u.swing; delete u.execute; forget(u.id);
    Object.assign(u, { x: bus.x, z: bus.z, place: 'world', anim: 'idle' });
    if (u.type === 'hero') { u.ride = { kind: 'omnibus', speed: R(bus.type).speed ?? 3 }; bus.driver = u.id; u.heading = bus.heading ?? u.heading; }
  }
  function unseat(u, k, bus) {
    delete u.aboard; if (u.ride?.kind === 'omnibus') delete u.ride;
    if (bus.driver === u.id) { delete bus.driver; bus.heading = u.heading; delete u.heading; }
    const [ox, oz] = followOffset(k % 36);
    const [x, z] = nav()?.nearestFree(bus.x + ox * 1.2, bus.z + oz * 1.2) || [bus.x, bus.z];
    Object.assign(u, { x, z, anim: 'idle' });
  }

  // out on the island: the hero and his group into fresh omnibuses (expedition, sim/game.js)
  function ride(hero, group) {
    const n = Math.min(free(hero.owner), Math.ceil((group.length + 1) / seats()));
    if (!n || !group.some(u => u.type === 'settler')) return 0;
    const buses = [];
    for (let k = 0; k < n; k++) {
      const [x, z] = k ? (nav()?.nearestFree(hero.x - (R().gap ?? 6) * k, hero.z) || [hero.x, hero.z]) : [hero.x, hero.z];
      buses.push(make(hero.owner, x, z, hero.dir || 0));
    }
    clanOf(hero.owner).omnibusFree -= n;
    fill(hero, group, buses);
    return n;
  }

  // everyone out of every omnibus of this clan (they stay parked); followers fall in behind the hero again
  function deploy(hero) {
    const buses = mine(hero.owner).filter(b => riders(b).length);
    if (!buses.length) return false;
    let k = 0;
    for (const b of buses) {
      for (const u of riders(b)) {
        unseat(u, k++, b);
        if (u.type !== 'hero') { u.order = { kind: 'follow', target: hero.id }; u.order.slot = freeSlot(hero.id, u.id); }
      }
      b.anim = 'idle'; b.trail = [];
    }
    say(hero.owner, 'Everyone steps out');
    return true;
  }

  const near = (hero, reach = R().boardRange ?? 6) => mine(hero.owner).filter(b => b.place === hero.place && Math.hypot(b.x - hero.x, b.z - hero.z) <= reach)
    .sort((a, b) => Math.hypot(a.x - hero.x, a.z - hero.z) - Math.hypot(b.x - hero.x, b.z - hero.z));

  // into a parked omnibus: the hero (drives it) and the chosen units, overflow into the next one in reach
  function board(hero, c = {}) {
    if (hero.aboard) return false;
    if (hero.mounted) { say(hero.owner, 'Get off your horse first (H)'); return false; }
    const reach = R().boardRange ?? 6;
    let buses = near(hero, reach * 2).filter(b => !riders(b).length);
    if (c.omnibus) { const b = state.entities[c.omnibus]; if (b?.type === 'omnibus' && b.omnibusOwner === hero.owner) buses = [b, ...buses.filter(x => x !== b)]; }
    if (!buses.length) { say(hero.owner, 'No parked omnibus close enough'); return false; }
    if (Math.hypot(buses[0].x - hero.x, buses[0].z - hero.z) > reach) { say(hero.owner, 'Walk up to the omnibus to get in'); return false; }
    const ids = Array.isArray(c.units) && c.units.length ? c.units : Object.values(state.entities).filter(u => u.owner === hero.owner && u.order?.kind === 'follow' && u.order.target === hero.id).map(u => u.id);
    const group = ids.map(id => state.entities[id]).filter(u => u && u !== hero && u.owner === hero.owner && u.type !== 'hero' && u.type !== 'omnibus' && !u.dead && !u.downed && !u.jailed && !u.garrison && !u.aboard && u.place === hero.place && Math.hypot(u.x - hero.x, u.z - hero.z) <= reach * 2.5);
    fill(hero, group, buses);
    for (const b of buses.slice(1)) b.trail = [];
    return true;
  }

  function command(e, c) {
    if (e.type !== 'hero' || e.dead || e.downed || e.jailed) return;
    if (c.action === 'deploy') deploy(e);
    else if (c.action === 'board') board(e, c);
  }

  // founding a town takes the clan's omnibuses (the stable builds new ones)
  function consume(owner) {
    for (const b of mine(owner)) { for (const u of riders(b)) delete u.aboard; remove(b.id); }
    const c = clanOf(owner); if (c) c.omnibusFree = 0;
  }

  function wreck(b) {
    const list = riders(b), hero = list.find(u => u.type === 'hero') || heroOf(b.omnibusOwner);
    list.forEach((u, k) => { unseat(u, k, b); if (u.type !== 'hero' && hero) { u.order = { kind: 'follow', target: hero.id }; u.order.slot = freeSlot(hero.id, u.id); } });
    say(b.omnibusOwner, `The ${b.type} is wrecked! Everyone piles out`);
    remove(b.id);
  }

  // a hit on someone inside: the omnibus takes it (true when absorbed)
  function shelter(u, damage) {
    const b = of(u);
    if (!b) return false;
    b.hp = Math.max(0, (b.hp ?? 0) - Math.max(0, damage || 0));
    b.hitAt = state.tick ?? 0;
    if (b.hp <= 0) wreck(b);
    return true;
  }

  // the track a follower drives along: the point `gap` back along the lead's trail
  function back(trail, gap) {
    let left = gap;
    for (let i = trail.length - 1; i > 0; i--) {
      const [x1, z1] = trail[i], [x0, z0] = trail[i - 1], d = Math.hypot(x1 - x0, z1 - z0);
      if (d >= left) { const t = left / d; return [x1 + (x0 - x1) * t, z1 + (z0 - z1) * t]; }
      left -= d;
    }
    return null;
  }

  function tick() {
    const byOwner = {};
    for (const b of Object.values(state.entities)) if (isVehicle(b)) (byOwner[b.omnibusOwner] ||= []).push(b);
    for (const list of Object.values(byOwner)) {
      const lead = list.find(b => b.driver && state.entities[b.driver]?.aboard === b.id);
      if (lead) {
        const h = state.entities[lead.driver], last = lead.trail[lead.trail.length - 1];
        const moved = !last || Math.hypot(h.x - lead.x, h.z - lead.z) > 0.01;
        Object.assign(lead, { x: h.x, z: h.z, place: h.place, dir: h.dir ?? lead.dir, heading: h.heading ?? lead.heading, anim: moved && h.anim !== 'idle' ? 'walk' : 'idle' });
        if (!last || Math.hypot(h.x - last[0], h.z - last[1]) > 0.5) { lead.trail.push([h.x, h.z]); if (lead.trail.length > 80) lead.trail.shift(); }
        // the others with riders drive behind it along its track
        let gap = R().gap ?? 6;
        for (const b of list) {
          if (b === lead || !riders(b).length) continue;
          const p = back(lead.trail, gap); gap += R().gap ?? 6;
          if (!p) { b.anim = 'idle'; continue; }
          const dx = p[0] - b.x, dz = p[1] - b.z, d = Math.hypot(dx, dz);
          if (d > 0.01) { steer(b, Math.atan2(dx, dz), { turnDegrees: (R(b.type).turnDegrees ?? 120) * 2 }, 1 / 20); b.anim = 'walk'; } else b.anim = 'idle';   // the row sweeps round (sim/vehicle_steer.js)
          Object.assign(b, { x: p[0], z: p[1], place: lead.place });
        }
      } else for (const b of list) if (b.driver && !state.entities[b.driver]?.aboard) delete b.driver;
      for (const b of list) for (const u of riders(b)) {   // riders sit inside
        if (u.dead || u.jailed) { delete u.aboard; if (u.ride?.kind === 'omnibus') delete u.ride; continue; }
        if (u.type === 'hero') { delete u.attackTarget; delete u.swing; continue; }
        Object.assign(u, { x: b.x, z: b.z, place: b.place, anim: 'idle' });
        delete u.order; delete u.attackTarget; delete u.swing; forget(u.id);
      }
    }
  }

  return { ride, deploy, board, command, tick, shelter, consume, of, riders, near, free, park, isVehicle, seatsOf, make };
}
