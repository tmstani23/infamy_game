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
// empty at a stable (sim/frontier/stable.js, Tim 2026-11-07) and park there (park()); stationTrip() moves parked
// rickshaws with their riders for the station's instant travel.
// createOmnibus({ state, rules, spawn, remove, nav, freeSlot, followOffset, forget, say })
//   -> { ride, deploy, board, command, tick, shelter, consume, of, riders, near, park, isVehicle }
import { steer } from './vehicle_steer.js';

export function createOmnibus({ state, rules, spawn, remove, nav, freeSlot, followOffset, forget, say, homeAt = () => null, danger = () => false }) {
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
    if (u.mounted && u.type !== 'hero') { delete u.mounted; delete u.ride; }   // a crew horse stays where it is
    u.aboard = bus.id; if (!bus.vorder) bus.vorder = { kind: 'follow' };
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
  function deploy(hero, only = null) {
    // Q with vehicles selected empties just those (Tim 2026-11-07); otherwise every one of the clan's
    const pick = Array.isArray(only) && only.length ? new Set(only) : null;
    const buses = mine(hero.owner).filter(b => riders(b).length && (!pick || pick.has(b.id) || b.id === hero.aboard));
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
  // selected crew into a parked vehicle without the hero (Tim 2026-11-07: "garrison" a crew member in it): they walk
  // over and get in, as many as it seats; it then stays put and takes crew orders like a loaded one
  function crewBoard(hero, c) {
    const bus = state.entities[c.omnibus];
    if (!isVehicle(bus) || bus.omnibusOwner !== hero.owner || bus.dead || bus.driver) return false;
    const room = seatsOf(bus) - riders(bus).length - Object.values(state.entities).filter(u => u.boardBus === bus.id).length;
    if (room <= 0) { say(hero.owner, `The ${bus.type} is full`); return false; }
    const group = (c.units || []).map(id => state.entities[id]).filter(u => u && u !== hero && u.owner === hero.owner && u.type !== 'hero' && !isVehicle(u) && u.type !== 'horse' && !u.dead && !u.downed && !u.jailed && !u.garrison && !u.aboard && u.place === bus.place);
    if (!group.length) return false;
    for (const u of group.slice(0, room)) {
      if (u.mounted) { delete u.mounted; delete u.ride; }
      u.boardBus = bus.id; u.order = { kind: 'move', x: bus.x, z: bus.z, place: bus.place }; forget(u.id);
    }
    if (group.length > room) say(hero.owner, `Room for ${room} in the ${bus.type}`);
    return true;
  }
  function board(hero, c = {}) {
    if (hero.aboard) return false;
    if (c.crewOnly) return crewBoard(hero, c);
    if (hero.mounted) { say(hero.owner, 'Get off your horse first (H)'); return false; }
    const reach = R().boardRange ?? 6;
    let buses = near(hero, reach * 2).filter(b => !riders(b).length);
    if (c.omnibus) { const b = state.entities[c.omnibus]; if (b?.type === 'omnibus' && b.omnibusOwner === hero.owner) buses = [b, ...buses.filter(x => x !== b)]; }
    if (!buses.length) { say(hero.owner, 'No parked omnibus close enough'); return false; }
    if (Math.hypot(buses[0].x - hero.x, buses[0].z - hero.z) > reach) { say(hero.owner, 'Walk up to the omnibus to get in'); return false; }
    const ids = Array.isArray(c.units) && c.units.length ? c.units : Object.values(state.entities).filter(u => u.owner === hero.owner && u.order?.kind === 'follow' && u.order.target === hero.id).map(u => u.id);
    const group = ids.map(id => state.entities[id]).filter(u => u && u !== hero && u.owner === hero.owner && u.type !== 'hero' && !isVehicle(u) && !u.dead && !u.downed && !u.jailed && !u.garrison && !u.aboard && u.place === hero.place && Math.hypot(u.x - hero.x, u.z - hero.z) <= reach * 2.5);
    fill(hero, group, buses);
    for (const b of buses.slice(1)) b.trail = [];
    return true;
  }

  // Vehicles work like crew (Tim 2026-11-07): a loaded one follows the hero by default; selected, it takes the
  // crew 'order' kinds: follow, move (drives there and stays), station / stop (stays). Empty ones stay parked.
  function orderVehicles(hero, c) {
    if (!Array.isArray(c.units)) return;
    for (const id of c.units) {
      const b = state.entities[id];
      if (!isVehicle(b) || b.omnibusOwner !== hero.owner || b.dead || !riders(b).length || b.driver) continue;
      if (c.kind === 'follow' || c.kind === 'resume') b.vorder = { kind: 'follow' };
      else if ((c.kind === 'move' || c.kind === 'attackmove' || c.kind === 'station') && Number.isFinite(c.x) && Number.isFinite(c.z)) b.vorder = { kind: 'move', x: c.x, z: c.z };
      else if (c.kind === 'stop') b.vorder = { kind: 'stay' };
    }
  }
  const HERO_RUN = rules?.mount?.heroRun ?? 6;
  // one step of a vehicle driving itself toward (tx, tz); true while it still moves
  function drive(b, tx, tz, stopAt, dt) {
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    if (d <= stopAt) { b.anim = 'idle'; return false; }
    const r = steer(b, Math.atan2(dx, dz), { turnDegrees: R(b.type).turnDegrees ?? 120 }, dt);
    const step = Math.min(d - stopAt, (R(b.type).speed ?? 3) * HERO_RUN * dt * (r.slow ?? 1));
    const nx = b.x + r.hx * step, nz = b.z + r.hz * step, [fx, fz] = nav()?.nearestFree(nx, nz) || [nx, nz];
    if (Math.hypot(fx - nx, fz - nz) > 2) { b.anim = 'idle'; return false; }   // blocked: wait there
    Object.assign(b, { x: fx, z: fz, anim: 'walk' }); b.trail = [];
    return true;
  }

  // Drive back to the gate (Tim 2026-11-06 20:42): from beside or inside your omnibus, at once; it parks outside
  // the gate with everyone still inside (Space at the gate steps out and goes through). Not with a fight on.
  function home(hero) {
    const at = homeAt();
    if (!at || hero.place !== 'world') return false;
    const bus = of(hero) || near(hero)[0];
    if (!bus) { say(hero.owner, 'Stand by your omnibus'); return false; }
    if (danger(hero)) { say(hero.owner, 'Not with a fight on'); return false; }
    if (!hero.aboard && !board(hero, { omnibus: bus.id })) return false;
    const list = mine(hero.owner).filter(b => b === of(hero) || riders(b).length);
    list.forEach((b, k) => {
      const [x, z] = nav()?.nearestFree(at[0] + k * 3, at[1] + k * 1.5) || at;
      Object.assign(b, { x, z, trail: [] });
      for (const u of riders(b)) { Object.assign(u, { x, z }); forget(u.id); }
    });
    say(hero.owner, 'Back at the island gate: Space at the gate to go into the city');
    return true;
  }

  function command(e, c) {
    if (e.type !== 'hero' || e.dead || e.downed || e.jailed) return;
    if (c.action === 'deploy') deploy(e, c.vehicles);
    else if (c.action === 'board') board(e, c);
    else if (c.action === 'home') home(e);
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

  function selfDrive(b) {
    const o = b.vorder;
    if (o.kind === 'move' && !drive(b, o.x, o.z, 1, 1 / 20) && Math.hypot(o.x - b.x, o.z - b.z) <= 1.5) b.vorder = { kind: 'stay' };
    if (o.kind === 'stay') b.anim = 'idle';
  }
  function tick() {
    for (const u of Object.values(state.entities)) {   // crew walking over to get in (crewBoard)
      if (!u.boardBus) continue;
      const bus = state.entities[u.boardBus];
      if (!bus || bus.dead || u.dead || u.downed || u.aboard || bus.driver || u.order?.kind !== 'move' || riders(bus).length >= seatsOf(bus)) { delete u.boardBus; continue; }
      if (Math.hypot(bus.x - u.x, bus.z - u.z) > (R().boardRange ?? 6) * 0.6) continue;
      delete u.boardBus; seat(u, bus); bus.vorder = { kind: 'stay' };
    }
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
          if (b.vorder && b.vorder.kind !== 'follow') { selfDrive(b); continue; }
          const p = back(lead.trail, gap); gap += R().gap ?? 6;
          if (!p) { b.anim = 'idle'; continue; }
          const dx = p[0] - b.x, dz = p[1] - b.z, d = Math.hypot(dx, dz);
          if (d > 0.01) { steer(b, Math.atan2(dx, dz), { turnDegrees: (R(b.type).turnDegrees ?? 120) * 2 }, 1 / 20); b.anim = 'walk'; } else b.anim = 'idle';   // the row sweeps round (sim/vehicle_steer.js)
          Object.assign(b, { x: p[0], z: p[1], place: lead.place });
        }
      } else {
        for (const b of list) if (b.driver && !state.entities[b.driver]?.aboard) delete b.driver;
        // the hero is on foot or horseback: loaded vehicles follow him in a line, or do as told
        const hero = heroOf(list[0].omnibusOwner);
        let k = 0;
        for (const b of list) {
          if (!riders(b).length || b.driver) continue;
          if (b.vorder && b.vorder.kind !== 'follow') { selfDrive(b); continue; }
          if (!hero || hero.place !== b.place || hero.dead) { b.anim = 'idle'; continue; }
          k++; drive(b, hero.x, hero.z, (R(b.type).gap ?? 6) * k, 1 / 20);
        }
      }
      for (const b of list) for (const u of riders(b)) {   // riders sit inside
        if (u.dead || u.jailed) { delete u.aboard; if (u.ride?.kind === 'omnibus') delete u.ride; continue; }
        if (u.type === 'hero') { delete u.attackTarget; delete u.swing; continue; }
        Object.assign(u, { x: b.x, z: b.z, place: b.place, anim: 'idle' });
        delete u.order; delete u.attackTarget; delete u.swing; forget(u.id);
      }
    }
  }

  return { ride, deploy, board, home, command, orderVehicles, tick, shelter, consume, of, riders, near, free, park, isVehicle, seatsOf, make };
}
