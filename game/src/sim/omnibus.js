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
  function park(owner, kind, x, z) { const [px, pz] = spotFor(kind, x, z); return make(owner, px, pz, 0, kind); }
  // a free parking spot near (x, z) clear of other vehicles (Tim 2026-11-07: new ones came out on top of each other)
  function spotFor(kind, x, z) {
    const len = R(kind).length ?? 6, others = Object.values(state.entities).filter(v => isVehicle(v) && !v.dead && v.place === 'world');
    for (let ring = 0; ring < 8; ring++) for (let k = 0; k < Math.max(1, ring * 6); k++) {
      const a = k / Math.max(1, ring * 6) * Math.PI * 2, r = ring * len * 0.9;
      const [px, pz] = nav()?.nearestFree(x + Math.cos(a) * r, z + Math.sin(a) * r) || [x + Math.cos(a) * r, z + Math.sin(a) * r];
      if (others.every(v => Math.hypot(v.x - px, v.z - pz) >= ((R(v.type).length ?? 6) + len) / 2 * 0.8)) return [px, pz];
    }
    return nav()?.nearestFree(x, z) || [x, z];
  }
  // put a group into vehicles in order, filling each one's seats (the hero first, as driver of the first)
  function fill(hero, group, buses) {
    seat(hero, buses[0]);
    let k = 0, used = riders(buses[0]).length;   // those already aboard keep their seats
    for (const u of group) {
      while (buses[k] && used >= seatsOf(buses[k])) { k++; used = buses[k] ? riders(buses[k]).length : 0; }
      if (!buses[k]) break;
      seat(u, buses[k]); used++;
    }
  }
  function seat(u, bus) {
    if (u.mounted) { delete u.mounted; if (u.ride?.kind === 'horse') delete u.ride; }   // the horse stays where it is (the boss's too: a stale mounted flag kept him from riding again)
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

  // everyone out of every omnibus of this clan (they stay parked); the crew wait beside it
  function deploy(hero, only = null, units = null, heroToo = false) {
    // Q with vehicles selected empties just those (Tim 2026-11-07); otherwise every one of the clan's
    // units: only these riders step out (right-click one seat on a vehicle card, Tim 2026-11-08); never the hero
    const pick = Array.isArray(only) && only.length ? new Set(only) : null;
    const who = Array.isArray(units) && units.length ? new Set(units) : null;
    const buses = mine(hero.owner).filter(b => riders(b).length && (!pick || pick.has(b.id) || b.id === hero.aboard));
    if (!buses.length) return false;
    let k = 0;
    let out = 0;
    for (const b of buses) {
      for (const u of riders(b)) {
        if (who && (!who.has(u.id) || (u.type === 'hero' && !heroToo))) continue;   // heroToo: his own seat was right-clicked, only he steps out (Tim 2026-11-10)
        unseat(u, k++, b); out++;
        // crew stand where they stepped out until told to follow (V) or sent somewhere (Tim 2026-11-08); settlers keep with the hero
        if (u.type === 'settler') { u.order = { kind: 'follow', target: hero.id }; u.order.slot = freeSlot(hero.id, u.id); }
        else if (u.type !== 'hero') { u.order = { kind: 'stop' }; u.anim = 'idle'; }
      }
      if (!riders(b).length) { b.anim = 'idle'; b.trail = []; }
      else if (heroToo && who) b.vorder = { kind: 'stay' };   // he got out alone: it waits there with the rest aboard
    }
    if (!out) return false;
    say(hero.owner, who ? (out === 1 ? 'One steps out' : `${out} step out`) : 'Everyone steps out');
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
    if (room <= 0) { state.casts?.push({ kind: 'refuseMount', a: bus.id, x: bus.x, z: bus.z, place: bus.place, text: 'Full' }); return false; }   // on the vehicle, like the boss's horse
    const group = (c.units || []).map(id => state.entities[id]).filter(u => u && u !== hero && u.owner === hero.owner && u.type !== 'hero' && !isVehicle(u) && u.type !== 'horse' && !u.dead && !u.downed && !u.jailed && !u.garrison && !u.aboard && u.place === bus.place);
    if (!group.length) return false;
    group.sort((a, b) => Math.hypot(a.x - bus.x, a.z - bus.z) - Math.hypot(b.x - bus.x, b.z - bus.z));   // a whole group: the nearest fill the seats
    // crew within popRange (10, Tim 2026-11-10; was 40) get straight in, the vehicle flashes gold (render: boarded); further ones run over first
    let popped = 0;
    for (const u of group.slice(0, room)) {
      if (Math.hypot(u.x - bus.x, u.z - bus.z) <= (R().popRange ?? 10)) { seat(u, bus); bus.vorder = { kind: 'stay' }; popped++; continue; }
      if (u.mounted) { delete u.mounted; delete u.ride; }
      u.boardBus = bus.id; u.order = { kind: 'move', x: bus.x, z: bus.z, place: bus.place }; forget(u.id);
    }
    if (popped) state.casts?.push({ kind: 'boarded', a: bus.id, x: bus.x, z: bus.z, n: popped, place: bus.place });
    if (group.length > room) say(hero.owner, `Room for ${room} in the ${bus.type}`);
    return true;
  }
  function board(hero, c = {}) {
    if (hero.aboard) return false;
    if (c.crewOnly) return crewBoard(hero, c);
    if (hero.mounted) { say(hero.owner, 'Get off your horse first (H)'); return false; }
    const reach = R().boardRange ?? 6;
    // any of his with a seat free, crew already aboard or not (Tim 2026-11-10: he could not get into a loaded omnibus)
    let buses = near(hero, reach * 2).filter(b => riders(b).length < seatsOf(b) && !b.driver);
    if (c.omnibus) { const b = state.entities[c.omnibus]; if (isVehicle(b) && b.omnibusOwner === hero.owner && !b.dead && riders(b).length < seatsOf(b)) buses = [b, ...buses.filter(x => x !== b)]; }
    if (!buses.length) { say(hero.owner, 'No parked omnibus close enough'); return false; }
    if (Math.hypot(buses[0].x - hero.x, buses[0].z - hero.z) > reach) { say(hero.owner, 'Walk up to the omnibus to get in'); return false; }
    // nobody selected: those following him, and crew standing by him (Tim 2026-11-10: a man who had stepped out and
    // waited there was left behind, only the hero got in)
    const picked = Array.isArray(c.units) && c.units.length;
    const ids = picked ? c.units : Object.values(state.entities).filter(u => u.owner === hero.owner && ((u.order?.kind === 'follow' && u.order.target === hero.id) || ((!u.order || u.order.kind === 'stop') && !u.guard && !u.guide && !u.worker && u.type !== 'worker'))).map(u => u.id);
    const able = ids.map(id => state.entities[id]).filter(u => u && u !== hero && u.owner === hero.owner && u.type !== 'hero' && !isVehicle(u) && u.type !== 'horse' && !u.dead && !u.downed && !u.jailed && !u.garrison && !u.aboard && u.place === hero.place)
      .sort((p, q) => Math.hypot(p.x - hero.x, p.z - hero.z) - Math.hypot(q.x - hero.x, q.z - hero.z));
    const group = able.filter(u => Math.hypot(u.x - hero.x, u.z - hero.z) <= reach * 2.5);
    fill(hero, group, buses);
    // selected crew too far to get in with him run over and take the seats left in his vehicle
    const late = picked ? able.filter(u => !u.aboard) : [];
    if (late.length && riders(buses[0]).length < seatsOf(buses[0])) for (const u of late.slice(0, seatsOf(buses[0]) - riders(buses[0]).length)) {
      if (u.mounted) { delete u.mounted; delete u.ride; }
      u.boardBus = buses[0].id; u.order = { kind: 'move', x: buses[0].x, z: buses[0].z, place: buses[0].place }; forget(u.id);
    }
    for (const b of buses.slice(1)) b.trail = [];
    return true;
  }

  // Vehicles work like crew (Tim 2026-11-07): a loaded one follows the hero by default; selected, it takes the
  // crew 'order' kinds: follow, move (drives there and stays), station / stop (stays). Empty ones stay parked.
  function orderVehicles(hero, c) {
    if (!Array.isArray(c.units)) return;
    const list = c.units.map(id => state.entities[id]).filter(b => isVehicle(b) && b.omnibusOwner === hero.owner && !b.dead && riders(b).length && !b.driver);
    const move = (c.kind === 'move' || c.kind === 'attackmove' || c.kind === 'station') && Number.isFinite(c.x) && Number.isFinite(c.z);
    if (move && list.length > 1) {   // several sent to one spot (Tim 2026-11-07: they crashed): a line back from it, nearest first, each at its spacing
      list.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
      const cx = list.reduce((s, b) => s + b.x, 0) / list.length, cz = list.reduce((s, b) => s + b.z, 0) / list.length;
      let dx = c.x - cx, dz = c.z - cz, d = Math.hypot(dx, dz); if (d < 0.01) { dx = 1; dz = 0; d = 1; }
      let back = 0, prev = null;
      for (const b of list) {
        if (prev) back += spacing(prev, b);
        prev = b;
        const tx = c.x - dx / d * back, tz = c.z - dz / d * back, [fx, fz] = nav()?.nearestFree(tx, tz) || [tx, tz];
        b.vorder = { kind: 'move', x: fx, z: fz };
      }
      return;
    }
    for (const b of list) {
      if (c.kind === 'follow' || c.kind === 'resume') b.vorder = { kind: 'follow' };
      else if (move) b.vorder = { kind: 'move', x: c.x, z: c.z };
      else if (c.kind === 'stop') b.vorder = { kind: 'stay' };
    }
  }
  const HERO_RUN = rules?.mount?.heroRun ?? 6;
  // one step of a vehicle driving itself toward (tx, tz); true while it still moves
  function drive(b, tx, tz, stopAt, dt) {
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    if (d <= stopAt + 0.02) { b.anim = 'idle'; return false; }
    const r = steer(b, Math.atan2(dx, dz), { turnDegrees: R(b.type).turnDegrees ?? 120 }, dt);
    // smoother self-driving (Tim 2026-11-10: clunky on move orders): it pulls away and draws up over a moment, and
    // turns nearly on the spot when the way is behind it, so it never circles a spot it cannot turn into
    const D = R().drive || {}, turn = Math.abs(r.diff) > (D.pivotDegrees ?? 70) * Math.PI / 180 ? D.pivotSpeed ?? 0.15 : r.slow ?? 1;
    b.pace = state.tick - (b.paceAt ?? -99) > 3 ? D.startPace ?? 0.25 : Math.min(1, (b.pace ?? 0) + dt / (D.pullAwaySeconds ?? 0.7)); b.paceAt = state.tick;
    const ease = () => Math.min(1, (D.startPace ?? 0.25) + (d - stopAt) / (D.drawUp ?? 8));
    const step = Math.min(d - stopAt, (R(b.type).speed ?? 3) * HERO_RUN * dt * turn * b.pace * (b.vorder?.last === false ? 1 : ease()));
    // free ground keeps the exact spot (nearestFree answers a cell centre: the drive went in 1-step jumps, Tim 2026-11-10 'clunky')
    const nx = b.x + r.hx * step, nz = b.z + r.hz * step, nvg = nav(), [fx, fz] = !nvg || nvg.free?.(nx, nz) ? [nx, nz] : nvg.nearestFree(nx, nz) || [nx, nz];
    if (Math.hypot(fx - nx, fz - nz) > 2) { b.anim = 'idle'; return false; }   // blocked: wait there
    // never drive into another vehicle that is on the move: the later one (by id) waits for it to pass
    if (Object.values(state.entities).some(o => o !== b && isVehicle(o) && !o.dead && o.place === b.place && (o.anim === 'run' || o.anim === 'trot' || o.driver) && o.id < b.id
      && Math.hypot(o.x - fx, o.z - fz) < ((R(o.type).length ?? 6) + (R(b.type).length ?? 6)) / 2 && Math.hypot(o.x - fx, o.z - fz) < Math.hypot(o.x - b.x, o.z - b.z))) { b.anim = 'idle'; return true; }
    Object.assign(b, { x: fx, z: fz, anim: 'run' }); b.trail = [];   // vehicles move at gallop pace: gallop sheets (art.json run)
    return true;
  }

  // Drive back to the gate was taken out (Tim 2026-11-07): drive or walk back, or take the train
  function command(e, c) {
    if (e.type !== 'hero' || e.dead || e.downed || e.jailed) return;
    if (c.action === 'deploy') deploy(e, c.vehicles, c.units, c.hero === true);
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

  // room between two vehicles in a line, centre to centre (Tim 2026-11-07: they followed too close): half of each
  // one's length (rules.<type>.length) plus rules.omnibus.followClearance; `a` null = the hero on foot or horseback
  const spacing = (a, b) => (a ? (R(a.type).length ?? 6) / 2 : 1.5) + (R(b.type).length ?? 6) / 2 + (R().followClearance ?? 3);
  // would moving b to point p put it into the vehicle ahead (sharp turns, catching up)?
  const tooClose = (a, b, p) => Math.hypot(p[0] - a.x, p[1] - a.z) < ((R(a.type).length ?? 6) + (R(b.type).length ?? 6)) / 2 + 0.5
    && Math.hypot(p[0] - a.x, p[1] - a.z) < Math.hypot(b.x - a.x, b.z - a.z);
  // parked or standing vehicles never sit on top of each other (Tim 2026-11-07: a rickshaw hid on an omnibus):
  // two that overlap are eased apart a little each tick; one being driven or moving keeps its place, the other gives way
  function separate(list) {
    const v = list.filter(b => b.place === 'world' && !b.dead && !b.stored);
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
      const a = v[i], b = v[j], need = ((R(a.type).length ?? 6) + (R(b.type).length ?? 6)) / 2 * 0.7;
      let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= need) continue;
      if (d < 0.01) { dx = 1; dz = 0; d = 1; }
      const busy = e => !!e.driver || e.anim === 'run' || e.anim === 'trot';
      // the one the hero drives is never the one pushed (Tim 2026-11-10: driving up close to another he was shoved back
      // every tick and could not move); free ground keeps the exact spot, no jump to a cell centre
      const mover = b.driver && !a.driver ? a : a.driver && !b.driver ? b : busy(b) && !busy(a) ? a : b, sign = mover === b ? 1 : -1, step = Math.min(0.4, need - d);
      if (mover.driver) continue;
      const nx = mover.x + sign * dx / d * step, nz = mover.z + sign * dz / d * step, nvg = nav(), [fx, fz] = !nvg || nvg.free?.(nx, nz) ? [nx, nz] : nvg.nearestFree(nx, nz) || [nx, nz];
      if (Math.hypot(fx - nx, fz - nz) > 2) continue;
      Object.assign(mover, { x: fx, z: fz });
      for (const u of riders(mover)) Object.assign(u, { x: fx, z: fz });
    }
  }
  const heroTrails = {};   // hero id -> his recent positions on the island, for vehicles following him on foot or horseback
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

  // a follower closes on its place in the line at a pace that grows with how far behind it is, full speed from about
  // 2 back (Tim 2026-11-10: at a trot it raced up at full speed, jumped onto the spot and twitched back and forth)
  function closeOn(b, p) {
    const dx = p[0] - b.x, dz = p[1] - b.z, far = Math.hypot(dx, dz);
    if (far <= 0.03) { b.anim = 'idle'; return; }
    const top = (R(b.type).speed ?? 3) * HERO_RUN / 20, step = Math.min(far, top * Math.min(1, 0.2 + far / 2.5));
    steer(b, Math.atan2(dx, dz), { turnDegrees: (R(b.type).turnDegrees ?? 120) * 2 }, 1 / 20);
    const nx = b.x + dx / far * step, nz = b.z + dz / far * step, nvg = nav(), [fx, fz] = !nvg || nvg.free?.(nx, nz) ? [nx, nz] : nvg.nearestFree(nx, nz) || [nx, nz];
    if (Math.hypot(fx - nx, fz - nz) > 2) { b.anim = 'idle'; return; }   // blocked: wait there
    b.anim = step < 0.04 ? 'idle' : step > top * 0.6 ? 'run' : 'trot';
    Object.assign(b, { x: fx, z: fz });
  }
  function selfDrive(b) {
    const o = b.vorder;
    if (o.kind === 'move') {
      // along a planned way round buildings and water (Tim 2026-11-10: it drove straight at the spot and stuck)
      const n = nav(), plan = () => { const pts = n?.findPath?.(b.x, b.z, o.x, o.z); o.pts = pts?.length ? [...pts] : null; o.replanAt = pts?.replanAt; o.planned = state.tick; };
      if (o.planned == null || (o.replanAt && o.pts && o.pts.length <= o.replanAt && state.tick - o.planned > 20)) plan();
      while (o.pts?.length > 1 && Math.hypot(o.pts[0][0] - b.x, o.pts[0][1] - b.z) < (R(b.type).length ?? 6) * 0.7) o.pts.shift();
      // a later corner in plain sight: cut to it, so the drive is a sweep, not cell by cell
      while (o.pts?.length > 1 && n?.clearLine?.(b.x, b.z, o.pts[1][0], o.pts[1][1])) o.pts.shift();
      const last = !o.pts || o.pts.length <= 1, [tx, tz] = last ? [o.x, o.z] : o.pts[0];
      o.last = last;
      const going = drive(b, tx, tz, last ? 1 : 0, 1 / 20);
      if (!going && Math.hypot(o.x - b.x, o.z - b.z) <= 1.5) b.vorder = { kind: 'stay' };
      else if (!going && state.tick - o.planned > 20) plan();   // held up: look for another way, once a second
    }
    if (b.vorder.kind === 'stay') b.anim = 'idle';
  }
  function tick() {
    for (const u of Object.values(state.entities)) {   // crew walking over to get in (crewBoard)
      if (!u.boardBus) continue;
      const bus = state.entities[u.boardBus];
      if (!bus || bus.dead || u.dead || u.downed || u.aboard || u.order?.kind !== 'move' || riders(bus).length >= seatsOf(bus)) { delete u.boardBus; continue; }   // one the hero sits in is fine too (he got in first, Tim 2026-11-10)
      if (Math.hypot(bus.x - u.x, bus.z - u.z) > (R().popRange ?? 10)) continue;   // they run up to within popRange, then get in (Tim 2026-11-10: no popping in from far off)
      delete u.boardBus; seat(u, bus); if (!bus.driver) bus.vorder = { kind: 'stay' };
    }
    const byOwner = {};
    for (const b of Object.values(state.entities)) if (isVehicle(b)) (byOwner[b.omnibusOwner] ||= []).push(b);
    separate(Object.values(byOwner).flat());
    // an empty vehicle stands still (Tim 2026-11-10: a rickshaw kept running on the spot after its riders left by train)
    for (const b of Object.values(byOwner).flat()) {
      if (b.driver && state.entities[b.driver]?.aboard !== b.id) delete b.driver;
      if (!riders(b).length && !b.driver && !b.recall && b.anim !== 'idle') b.anim = 'idle';
    }
    for (const list of Object.values(byOwner)) {
      const lead = list.find(b => b.driver && state.entities[b.driver]?.aboard === b.id);
      if (lead) {
        const h = state.entities[lead.driver], last = lead.trail[lead.trail.length - 1];
        const moved = !last || Math.hypot(h.x - lead.x, h.z - lead.z) > 0.01;
        Object.assign(lead, { x: h.x, z: h.z, place: h.place, dir: h.dir ?? lead.dir, heading: h.heading ?? lead.heading, anim: moved && h.anim !== 'idle' ? (h.gallop ? 'run' : 'trot') : 'idle' });
        if (!last || Math.hypot(h.x - last[0], h.z - last[1]) > 0.5) { lead.trail.push([h.x, h.z]); if (lead.trail.length > 160) lead.trail.shift(); }
        // the others with riders drive behind it along its track
        let gap = 0, prev = lead;
        for (const b of list) {
          if (b === lead || !riders(b).length) continue;
          if (b.vorder && b.vorder.kind !== 'follow') { selfDrive(b); continue; }
          const ahead = prev; gap += spacing(prev, b); prev = b;
          const p = back([...lead.trail, [h.x, h.z]], gap);   // measured from where he is now, not his last crumb (it moved in half-step jumps)
          if (p && tooClose(ahead, b, p)) { b.anim = 'idle'; continue; }   // never into the one ahead
          if (!p) { b.anim = 'idle'; continue; }
          b.place = lead.place; closeOn(b, p);   // the row sweeps round (sim/vehicle_steer.js)
        }
      } else {
        for (const b of list) if (b.driver && !state.entities[b.driver]?.aboard) delete b.driver;
        // the hero is on foot or horseback: loaded vehicles follow him in a line, or do as told
        // (Tim 2026-11-07: they cut corners) they drive his breadcrumb trail snake-style, each at its spacing
        const hero = heroOf(list[0].omnibusOwner), ht = hero && (heroTrails[hero.id] ||= []), hl = ht?.[ht.length - 1];
        if (hero && (hero.place !== 'world' || hero.dead)) ht.length = 0;
        else if (hero && (!hl || Math.hypot(hero.x - hl[0], hero.z - hl[1]) > 0.5)) { if (hl && Math.hypot(hero.x - hl[0], hero.z - hl[1]) > 12) ht.length = 0; ht.push([hero.x, hero.z]); if (ht.length > 160) ht.shift(); }
        let gap = 0, prev = null;
        for (const b of list) {
          if (!riders(b).length || b.driver) continue;
          if (b.vorder && b.vorder.kind !== 'follow') { selfDrive(b); continue; }
          if (!hero || hero.place !== b.place || hero.dead) { b.anim = 'idle'; continue; }
          const ahead = prev; gap += spacing(prev, b); prev = b;
          const p = ht.length && back([...ht, [hero.x, hero.z]], gap);
          if (ahead && tooClose(ahead, b, p || [hero.x, hero.z])) { b.anim = 'idle'; continue; }   // never into the one ahead
          if (!p) { drive(b, hero.x, hero.z, gap, 1 / 20); continue; }
          // it closes on its place in the line at a pace that grows with how far behind it is (Tim 2026-11-10: at a
          // trot it raced up at full speed, jumped onto the spot and twitched back and forth); full speed from about 2 back
          closeOn(b, p);
        }
      }
      for (const b of list) for (const u of riders(b)) {   // riders sit inside
        if (u.dead || u.jailed) { delete u.aboard; if (u.ride?.kind === 'omnibus') delete u.ride; continue; }
        if (u.type === 'hero') { delete u.attackTarget; delete u.swing; continue; }
        Object.assign(u, { x: b.x, z: b.z, place: b.place, anim: 'idle' });
        delete u.order; delete u.attackTarget; delete u.swing; forget(u.id);
      }
    }
    // not really getting anywhere (held by the one beside it, a wall, or nudged on the spot): it stands still
    // (Tim 2026-11-10: stopped vehicles with crew kept their wheels running)
    for (const b of Object.values(byOwner).flat()) {
      const w = b.was;
      if (w && Math.hypot(b.x - w[0], b.z - w[1]) > (R().moveStep ?? 0.02)) b.wentAt = state.tick;
      b.was = [b.x, b.z];
      if (b.anim !== 'idle' && !(b.wentAt != null && state.tick - b.wentAt <= 2)) b.anim = 'idle';
    }
  }

  return { ride, deploy, board, command, orderVehicles, tick, shelter, consume, of, riders, near, free, park, spotFor, isVehicle, seatsOf, make };
}
