// Empty towns (Z6d, big picture plan 2026-11-19). When a clan is out (its castle fell, war_outcomes.js clanOut) its
// towns stand empty: no owner, buildings and stores kept, s.empty = { tick, from }. They count for nobody.
// Claim: any clan's hero stands within reach of the empty town's hall and channels for claimSeconds. Any hit on him
// (or loss of health) starts the count again; walking off, a new order, going down or leaving the island stops it.
// A clan may claim only within the zone cap (campaign_zones.json townCap). When it completes the town is the clan's.
// Decay: an empty town no one claims turns to ruins after ruinDays (every building ruined), and after decayDays it is
// gone (world.removeTown) and its site is free to found on again.
// Numbers: data.campaignZones.emptyTowns { claimSeconds, reach, moveCancel, ruinDays, decayDays } (placeholders).
//   { id: <hero id>, type: 'frontier', action: 'claimTown', town }   start claiming
//   { id: <hero id>, type: 'frontier', action: 'claimStop' }         stop
// hero.claimTown = { town, start, hp, x, z }   (saved with the hero)
// createEmptyTowns({ state, data, world, zones, hallPoint, dayTicks }) -> { command, tick, check, view, list }
export function createEmptyTowns({ state, data, world, zones = null, hallPoint = null, dayTicks = 12000 }) {
  const R = () => ({ claimSeconds: 60, reach: 8, moveCancel: 1.5, ruinDays: 2.5, decayDays: 5, ...data.campaignZones?.emptyTowns });
  const town = id => state.frontier?.settlements?.[id] || null;
  const isEmpty = s => !!s && s.owner == null && !!s.empty && !s.capital;
  const list = () => Object.values(state.frontier?.settlements || {}).filter(isEmpty);
  const say = (clan, text) => { const c = state.clans?.[clan]; if (c) c.notice = { tick: state.tick ?? 0, text }; };
  const news = n => (state.news ||= []).push(n);
  const hall = s => hallPoint?.({ town: s.id }, 'town') || { x: s.x, z: s.z, r: 8 };
  const near = (hero, s) => { const p = hall(s); return Math.hypot(hero.x - p.x, hero.z - p.z) <= p.r + R().reach; };

  // may this hero claim that town now: { ok, reason }
  function check(hero, townId) {
    const s = town(townId);
    if (!isEmpty(s)) return { ok: false, reason: 'Nobody can claim this town' };
    if (hero?.type !== 'hero' || hero.owner == null) return { ok: false, reason: 'Only a hero can claim a town' };
    if (state.clans?.[hero.owner]?.out) return { ok: false, reason: 'Your clan is out of the campaign' };
    if (hero.dead || hero.downed || hero.aboard || hero.place !== 'world') return { ok: false, reason: 'Your hero cannot do that now' };
    if (!near(hero, s)) return { ok: false, reason: `Walk up to ${s.name}'s town hall` };
    const zone = zones?.zoneOfTown?.(s);
    if (zone && zones.full(hero.owner, zone)) return { ok: false, reason: `You already have ${data.campaignZones?.townCap ?? 2} towns in ${zones.zone(zone)?.name || 'this zone'}` };
    if (Object.values(state.entities || {}).some(e => e.claimTown?.town === s.id && e.id !== hero.id && !e.dead)) return { ok: false, reason: 'Someone is claiming it already' };
    return { ok: true, reason: '' };
  }
  function start(hero, townId) {
    const r = check(hero, townId); if (!r.ok) return r;
    hero.claimTown = { town: townId, start: state.tick ?? 0, hp: hero.hp, x: hero.x, z: hero.z };
    delete hero.order; delete hero.attackTarget; delete hero.swing;
    const s = town(townId), p = hall(s);
    news({ kind: 'claimTown', town: townId, by: hero.id, clan: hero.owner, x: p.x, z: p.z });
    return { ok: true, reason: '' };
  }
  function stop(hero, why = '') {
    if (!hero?.claimTown) return;
    news({ kind: 'claimTownStop', town: hero.claimTown.town, by: hero.id, clan: hero.owner, why });
    delete hero.claimTown;
  }
  function finish(hero) {
    const s = town(hero.claimTown.town), clan = hero.owner;
    delete hero.claimTown;
    if (!isEmpty(s)) return;
    world.setOwner(s.id, clan);
    s.claimed = { tick: state.tick ?? 0, from: s.empty.from };
    delete s.empty;
    say(clan, `${s.name} is yours`);
    news({ kind: 'townClaimed', town: s.id, clan, by: hero.id, x: s.x, z: s.z });
  }

  function tick() {
    const now = state.tick ?? 0, P = R(), need = Math.max(1, Math.round(P.claimSeconds * 20));
    for (const u of Object.values(state.entities || {})) {
      const ch = u.claimTown; if (!ch) continue;
      if (u.dead || u.downed || u.aboard || u.place !== 'world' || !isEmpty(town(ch.town))) { stop(u, 'down'); continue; }
      if (Math.hypot(u.x - ch.x, u.z - ch.z) > P.moveCancel || u.order) { stop(u, 'moved'); continue; }
      if (u.hp < ch.hp - 1e-6 || (u.hitAt ?? -1) > ch.start) { ch.start = now; news({ kind: 'claimTownReset', town: ch.town, by: u.id, clan: u.owner }); }
      ch.hp = u.hp;
      if (now - ch.start >= need) finish(u);
    }
    if (now % 20 !== 7) return;   // decay: once a second is plenty
    for (const s of list()) {
      const age = (now - (s.empty.tick ?? now)) / dayTicks;
      if (age >= P.decayDays) {
        const name = s.name;
        for (const u of Object.values(state.entities || {})) if (u.claimTown?.town === s.id) delete u.claimTown;
        for (const k of Object.keys(state.frontier.fires || {})) if (k.startsWith(`t|${s.id}|`)) delete state.frontier.fires[k];
        world.removeTown(s.id);
        news({ kind: 'townDecayed', town: s.id, name, x: s.x, z: s.z });
      } else if (age >= P.ruinDays && !s.empty.ruined) {
        for (const b of s.buildings || []) if (b.stage === 'built') b.stage = 'ruined';
        s.empty.ruined = now;
      }
    }
  }
  // for the screen: the claim this hero is making, { town, name, frac, seconds }, or null
  function view(hero) {
    const ch = hero?.claimTown; if (!ch) return null;
    const n = Math.max(1, Math.round(R().claimSeconds * 20)), done = (state.tick ?? 0) - ch.start;
    return { town: ch.town, name: town(ch.town)?.name || '', frac: Math.min(1, done / n), seconds: Math.max(0, Math.ceil((n - done) / 20)) };
  }
  // the empty town whose hall this hero stands at, or null
  const at = hero => hero ? list().find(s => near(hero, s)) || null : null;

  function command(e, c) {
    if (c.action !== 'claimTown' && c.action !== 'claimStop') return false;
    let r;
    if (c.action === 'claimStop') { if (e?.claimTown) { stop(e, 'stopped'); r = { ok: true, reason: '' }; } else r = { ok: false, reason: 'Not claiming a town' }; }
    else r = start(e, c.town);
    if (!r.ok) say(e?.owner, r.reason);
    const fr = state.frontier; fr.receiptSeq = (fr.receiptSeq || 0) + 1;
    (fr.receipts ||= []).push({ seq: fr.receiptSeq, tick: state.tick ?? 0, clan: e?.owner ?? null, action: c.action, ok: r.ok, reason: r.reason });
    return true;
  }
  return { command, tick, check, view, list, at, isEmpty };
}
