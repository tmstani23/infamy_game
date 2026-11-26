// The ship between the city harbour and your castle dock (2026-11-19, zones build): a skippable sail like the
// train ride. The boss stands on the city's harbour pier (or on his castle's dock) and presses Use: All aboard is called
// (2026-11-20, as the trains): a zone of ship.zoneRadius round him for ship.callSeconds, then everyone of his in it
// goes aboard, the ship sails, and they step off at the other end. Use again during the call boards at once; Use at sea
// skips the crossing after a moment.
//   { id, type: 'frontier', action: 'ferry', mode: 'board' | 'skip' }
// The call: hero.shipCall = { x, z, place, from: 'city' | 'castle', r, until, ticks }. The zone lies at the ship (zoneAt).
// Riders carry e.aboard = 'ship:<owner>' (hidden, like train riders) and e.shipRide = { to, since, until, from, dest }.
// Numbers: data/campaign_zones.json `ship` (placeholders). Only a clan with a castle sails; bots do not use it.
// waiting(e) -> the settlers held at the HQ, called out to board with him (Z7: as they join him at the island gate)
function segDist(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L)) : 0;
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}
import { seaRoute, alongRoute } from './sea_route.js';
export function createFerry({ state, rules, world = null, pier, seaGate, castles, navOf, followOffset, freeSlot, forget, areas, mounts, waiting = null }) {
  const S = () => rules?.ship || {};
  const say = (owner, text) => { const c = state.clans?.[owner]; if (c) c.notice = { tick: state.tick, text }; return true; };
  const riding = e => String(e?.aboard || '').startsWith('ship:');
  const ridersOf = owner => Object.values(state.entities).filter(u => u.aboard === `ship:${owner}`);
  // where the hero stands: 'city' on the harbour pier, 'castle' on his dock, else null
  function at(e) {
    if (!e || e.type !== 'hero' || e.dead || e.downed || e.jailed || e.aboard) return null;
    const d = castles?.dock(e.owner); if (!d) return null;
    const r = S().reach ?? 7;
    if (e.place === 'street' && Math.hypot(e.x - pier[0], e.z - pier[1]) <= r) return 'city';
    // anywhere on the dock's planks, from where the ship lands out to the sea end (2026-11-20)
    if (e.place === 'world' && segDist(e.x, e.z, d.land, d.end ?? d.land) <= (S().dockReach ?? 20)) return 'castle';
    return null;
  }
  // who boards with him: his units in the zone, on foot or on horseback, never workers, vehicles, sector crew or reserves
  // in the city. c = { x, z, place, r } (the All aboard call); nearest first
  function inZone(e, c = e?.shipCall) {
    if (!e || !c) return [];
    const mine = u => u.place !== 'street' || !u.deployment || (!u.deployment.transfer && (u.deployment.group || 'hero') === 'hero');
    return Object.values(state.entities).filter(u => u.owner === e.owner && u.type !== 'hero' && !u.dead && !u.downed && !u.jailed && !u.garrison && !u.aboard
      && !u.worker && !u.railGang && !u.vehicle && u.type !== 'horse' && u.type !== 'rickshaw' && u.type !== 'omnibus' && mine(u)
      && u.place === c.place && Math.hypot(u.x - c.x, u.z - c.z) <= c.r)
      .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
  }
  // where the zone lies (2026-11-20): on the city pier, or at the sea end of the castle dock, ship.zoneInset back
  // along the dock so its far edge just reaches the moored ship
  function zoneAt(e, here) {
    const d = here === 'castle' && castles?.dock(e.owner);
    if (!d?.end) return { x: pier[0], z: pier[1] };
    const dx = d.end.x - d.land.x, dz = d.end.z - d.land.z, L = Math.hypot(dx, dz) || 1, k = (S().zoneInset ?? 9) / L;
    return { x: d.end.x - dx * k, z: d.end.z - dz * k };
  }
  // Use at the pier or the dock: call All aboard (the zone lies at the ship); Use again during the call: aboard at once
  function call(e) {
    if (e.chest) return say(e.owner, 'No stolen chest on the ship: ride or run it home');   // train robbery (2026-11-20)
    if (e.shipCall) return allAboard(e);
    const here = at(e);
    if (!here) return say(e.owner, riding(e) ? 'Already at sea' : 'The ship lies at the city harbour pier and at your castle dock');
    const ticks = Math.max(1, Math.round((S().callSeconds ?? 10) * 20)), z = zoneAt(e, here);
    e.shipCall = { x: z.x, z: z.z, place: e.place, from: here, r: S().zoneRadius ?? 20, until: (state.tick ?? 0) + ticks, ticks };
    return say(e.owner, 'All aboard! Get your crew into the zone (Space sails now)');
  }
  // the call runs out (or Use again): he and everyone of his in the zone go aboard, and the settlers waiting at the HQ
  function allAboard(e) {
    const c = e.shipCall; delete e.shipCall;
    if (!c || riding(e)) return true;
    const here = at(e);
    if (!here || here !== (c.from ?? here)) return say(e.owner, `Boarding called off: you left the ${c.from === 'castle' ? 'dock' : 'pier'}`);   // he may stand anywhere on the pier or dock
    const d = castles.dock(e.owner), now = state.tick ?? 0, to = here === 'city' ? 'castle' : 'city';
    const group = [...inZone(e, c), ...(to === 'castle' ? waiting?.(e) || [] : [])], crew = [e, ...group].slice(0, S().seats ?? 40);
    const from = to === 'castle' ? [seaGate.x, seaGate.z] : [d.sea.x, d.sea.z], dest = to === 'castle' ? [d.sea.x, d.sea.z] : [seaGate.x, seaGate.z];
    const path = seaRoute(world, from, dest, { margin: S().seaMargin ?? 400 });   // round the island by sea (2026-11-20)
    // a steady speed along the route (2026-11-20: too fast, about 40% slower)
    const routeLen = path.reduce((n, q, i) => i ? n + Math.hypot(q[0] - path[i - 1][0], q[1] - path[i - 1][1]) : 0, 0);
    const sailTicks = Math.round((S().speed ? Math.max(S().minSeconds ?? 8, routeLen / S().speed) : S().seconds ?? 20) * 20);
    for (const u of crew) {
      if (u.mounted) { if (mounts?.dismount) mounts.dismount(u); else { delete u.mounted; delete u.ride; } }   // horses stay ashore
      delete u.order; delete u.attackTarget; delete u.swing; delete u.execute; forget?.(u.id);
      Object.assign(u, { aboard: `ship:${e.owner}`, shipRide: { to, since: now, until: now + sailTicks, from, dest, path }, place: 'world', x: from[0], z: from[1], anim: 'idle' });
    }
    const left = group.length + 1 - crew.length;
    return say(e.owner, `${to === 'castle' ? 'Sailing for your castle' : 'Sailing for the city'}${left ? ` (${left} could not fit and stayed)` : ''}`);
  }
  function land(owner) {
    const riders = ridersOf(owner); if (!riders.length) return;
    const hero = riders.find(u => u.type === 'hero') || riders[0], to = hero.shipRide?.to || 'city', d = castles?.dock(owner);
    const place = to === 'castle' && d ? 'world' : 'street', [px, pz] = place === 'world' ? [d.land.x, d.land.z] : pier;
    const grid = navOf?.(place);
    riders.forEach((u, k) => {
      const [ox, oz] = k ? (followOffset?.(k % 36) || [k, 0]) : [0, 0];
      const [x, z] = grid?.nearestFree?.(px + ox * 0.8, pz + oz * 0.8) || [px, pz];
      delete u.aboard; delete u.shipRide;
      Object.assign(u, { x, z, place, anim: 'idle' }); forget?.(u.id);
      if (u !== hero) { u.order = { kind: 'follow', target: hero.id }; u.order.slot = freeSlot?.(hero.id, u.id); }
    });
    if (place === 'world') areas?.update?.(Object.values(state.entities));
    say(owner, to === 'castle' ? 'Landed at your castle dock' : 'Landed at the city harbour');
  }
  function skip(e) {
    if (!riding(e) || !e.shipRide) return say(e.owner, 'Not on the ship');
    if ((state.tick ?? 0) - e.shipRide.since < (S().skipSeconds ?? 3) * 20) return say(e.owner, 'Skip in a moment');
    land(e.owner); return true;
  }
  function command(e, c) {
    if (c.action !== 'ferry') return false;
    if (e.type !== 'hero') return true;
    if (c.mode === 'skip') return skip(e);
    return call(e);
  }
  function tick() {
    const now = state.tick ?? 0, done = new Set();
    for (const u of Object.values(state.entities)) {
      if (u.shipCall && (u.dead || u.downed || u.jailed || u.aboard)) delete u.shipCall;
      else if (u.shipCall && now >= u.shipCall.until) allAboard(u);   // the call ran out
      if (!u.shipRide || !riding(u)) continue;
      const r = u.shipRide, k = Math.min(1, (now - r.since) / Math.max(1, r.until - r.since));
      const p = alongRoute(r.path || [r.from, r.dest], k); u.x = p.x; u.z = p.z;
      if (now >= r.until) done.add(u.owner);
    }
    for (const owner of done) land(owner);
  }
  // for the prompt line (main.js): what Use does here, or how the crossing stands
  function prompt(e) {
    if (riding(e) && e.shipRide) {
      const now = state.tick ?? 0, left = Math.max(0, Math.ceil((e.shipRide.until - now) / 20)), wait = Math.max(0, Math.ceil(((S().skipSeconds ?? 3) * 20 - (now - e.shipRide.since)) / 20));
      return { riding: true, text: `${e.shipRide.to === 'castle' ? 'Sailing to your castle' : 'Sailing to the city'}: ${left} s${wait ? '' : ' (Space skips)'}` };
    }
    if (e?.shipCall) {
      const left = Math.max(0, Math.ceil((e.shipCall.until - (state.tick ?? 0)) / 20));
      return { calling: true, text: `Space  All aboard now: ${inZone(e).length} crew in the zone, sailing in ${left} s` };
    }
    const here = at(e);
    return here ? { text: here === 'city' ? 'Space  Ship to your castle' : 'Space  Ship to the city' } : null;
  }
  return { command, tick, at, riding, prompt, inZone, pier };
}
