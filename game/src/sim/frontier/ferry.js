// The ship between the city harbour and your castle dock (Tim 2026-11-19, zones build): a skippable sail like the
// train ride. The boss stands on the city's harbour pier (or on his castle's dock) and presses Use: he and his party
// nearby go aboard, the ship sails, and they step off at the other end. Space again skips the crossing after a moment.
//   { id, type: 'frontier', action: 'ferry', mode: 'board' | 'skip' }
// Riders carry e.aboard = 'ship:<owner>' (hidden, like train riders) and e.shipRide = { to, since, until, from, dest }.
// Numbers: data/campaign_zones.json `ship` (placeholders). Only a clan with a castle sails; bots do not use it.
// waiting(e) -> the settlers held at the HQ, called out to board with him (Z7: as they join him at the island gate)
export function createFerry({ state, rules, pier, seaGate, castles, navOf, followOffset, freeSlot, forget, areas, mounts, waiting = null }) {
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
    if (e.place === 'world' && Math.hypot(e.x - d.land.x, e.z - d.land.z) <= r * 2) return 'castle';
    return null;
  }
  // the boss's party around him: on foot or on horseback, never workers, vehicles, sector crew or reserves in the city
  function party(e) {
    const r = S().radius ?? 16;
    const mine = u => u.place !== 'street' || !u.deployment || (!u.deployment.transfer && (u.deployment.group || 'hero') === 'hero');
    return Object.values(state.entities).filter(u => u.owner === e.owner && u.type !== 'hero' && !u.dead && !u.downed && !u.jailed && !u.garrison && !u.aboard
      && !u.worker && !u.railGang && !u.vehicle && u.type !== 'horse' && u.type !== 'rickshaw' && u.type !== 'omnibus' && mine(u)
      && u.place === e.place && Math.hypot(u.x - e.x, u.z - e.z) <= r)
      .sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z));
  }
  function board(e) {
    const here = at(e);
    if (!here) return say(e.owner, riding(e) ? 'Already at sea' : 'The ship lies at the city harbour pier and at your castle dock');
    const d = castles.dock(e.owner), now = state.tick ?? 0, to = here === 'city' ? 'castle' : 'city';
    const group = [...party(e), ...(to === 'castle' ? waiting?.(e) || [] : [])], crew = [e, ...group].slice(0, S().seats ?? 40);
    const from = to === 'castle' ? [seaGate.x, seaGate.z] : [d.sea.x, d.sea.z], dest = to === 'castle' ? [d.sea.x, d.sea.z] : [seaGate.x, seaGate.z];
    for (const u of crew) {
      if (u.mounted) { if (mounts?.dismount) mounts.dismount(u); else { delete u.mounted; delete u.ride; } }   // horses stay ashore
      delete u.order; delete u.attackTarget; delete u.swing; delete u.execute; forget?.(u.id);
      Object.assign(u, { aboard: `ship:${e.owner}`, shipRide: { to, since: now, until: now + Math.round((S().seconds ?? 20) * 20), from, dest }, place: 'world', x: from[0], z: from[1], anim: 'idle' });
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
    return board(e);
  }
  function tick() {
    const now = state.tick ?? 0, done = new Set();
    for (const u of Object.values(state.entities)) {
      if (!u.shipRide || !riding(u)) continue;
      const r = u.shipRide, k = Math.min(1, (now - r.since) / Math.max(1, r.until - r.since));
      u.x = r.from[0] + (r.dest[0] - r.from[0]) * k; u.z = r.from[1] + (r.dest[1] - r.from[1]) * k;
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
    const here = at(e);
    return here ? { text: here === 'city' ? 'Space  Ship to your castle' : 'Space  Ship to the city' } : null;
  }
  return { command, tick, at, riding, prompt, pier };
}
