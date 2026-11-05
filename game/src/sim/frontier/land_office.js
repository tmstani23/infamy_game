import { modeRules } from '../modes/index.js';
import { siteTraits } from './founding.js';
// The Land Office and the expedition out of the city (frontier plan E1, Tim 2026-11-05).
// Campaign only. Pure rules, no DOM: the screen opens the menus and sends commands.
//  - { id, type: 'landOffice', action: 'permit' } at the Land Office door (the telegraph office) buys a
//    founding permit. Players need Renown, crew and businesses held (frontier.json founding.permit);
//    bots need none of them. One permit at a time; the next founding uses it up.
//  - Settlers are hired with the normal 'hire' command at the Land Office (sim/clans.js).
//  - { id, type: 'expedition', action: 'site', site, units } at the island gate: the hero and the settlers
//    (only settlers: crew stay in the city) appear at a chosen open site. action 'walk' = Walk out:
//    through the gate on foot, again with settlers only.
// Sites are claimed when chosen, so no two clans pick the same one. A new town has a grace of
// founding.graceDays in which camp bandits leave its people alone.
export function createLandOffice({ state, data, worldData, units, clans, doorNear, dayTicks = 12000, seed = () => state.campaignSeed ?? 1, maxTowns = (id, base) => base }) {
  const D = data.founding, P = D.permit || {}, U = units?.rules || {};
  const say = (clan, text) => { if (clan) clan.notice = { tick: state.tick, text }; return null; };
  const fr = () => state.frontier;
  const claims = () => (fr().siteClaims ||= {});
  const on = () => modeRules(state).founding && !!fr();

  const office = () => Object.values(state.businesses).find(b => b.kind === 'land_office') || null;
  const atOffice = e => e?.type === 'hero' && e.place === 'street' && doorNear(e.id)?.menu === 'land_office';
  const atGate = e => e?.type === 'hero' && e.place === 'street' && !!doorNear(e.id)?.gate;
  const standing = e => e && !e.dead && !e.downed && !e.jailed;
  const businessesHeld = id => Object.values(state.businesses).filter(b => b.owner === id && !b.hideout && U.businesses?.[b.kind]).length;
  const townsOf = id => Object.values(fr()?.settlements || {}).filter(s => s.owner === id && s.founded).length;

  // { ok, reason, rows: [{ label, have, need, ok }], ryo } for the menu and the command alike
  function permitStatus(id) {
    const clan = state.clans?.[id];
    if (!clan) return { ok: false, reason: 'no clan', rows: [], ryo: P.ryo || 0 };
    if (!on()) return { ok: false, reason: 'The Land Office deals in campaign games only', rows: [], ryo: P.ryo || 0 };
    const rows = clan.bot ? [] : [
      { label: 'Renown', have: Math.floor(clan.renown || 0), need: P.renown || 0 },
      { label: 'Crew', have: clans.crewCount(id), need: P.crew || 0 },
      { label: 'Businesses held', have: businessesHeld(id), need: P.businesses || 0 },
    ].map(r => ({ ...r, ok: r.have >= r.need }));
    let reason = null;
    const towns = clan.bot ? (P.maxTowns ?? 1) : maxTowns(id, P.maxTowns ?? 1);   // C4: Influence unlocks the 2nd and 3rd town
    if (clan.permit) reason = 'You already hold a founding permit';
    else if (townsOf(id) >= towns) reason = `No more permits for now (${towns} town${towns === 1 ? '' : 's'}; Influence unlocks more)`;
    else if (rows.some(r => !r.ok)) reason = 'Requirements not met';
    else if (clan.ryo < (P.ryo || 0)) reason = `A permit costs ${P.ryo} ryo`;
    return { ok: !reason, reason, rows, ryo: P.ryo || 0, held: !!clan.permit };
  }

  function buyPermit(e) {
    const clan = state.clans?.[e?.owner];
    if (!clan || !standing(e)) return null;
    if (!atOffice(e)) return say(clan, 'Buy a permit at the Land Office');
    const st = permitStatus(clan.id);
    if (!st.ok) return say(clan, st.reason);
    if (st.ryo) { clan.ryo -= st.ryo; (state.ryoLosses ||= []).push({ clan: clan.id, amount: st.ryo, reason: 'Founding permit' }); }
    clan.permit = true;
    return say(clan, 'Founding permit bought: take settlers through the island gate');
  }

  // --- sites -----------------------------------------------------------------------------------
  const traitCache = new Map();
  const traitsOf = si => {
    if (!traitCache.has(si.id)) traitCache.set(si.id, si.traits ? { ...si.traits } : siteTraits(worldData, si.x, si.z, D.traits));
    return traitCache.get(si.id);
  };
  const campNear = si => {
    let best = Infinity;
    for (const c of worldData?.camps || []) if (c.kind === 'bandit') best = Math.min(best, Math.hypot(c.x - si.x, c.z - si.z));
    return best;
  };
  // why a site can't be chosen by clan `id`, or null
  function siteBlocked(si, id) {
    const by = claims()[si.id];
    if (by && by !== id) return `${state.clans?.[by]?.name || 'Another clan'} has claimed it`;
    if (worldData?.capital && Math.hypot(si.x - worldData.capital.x, si.z - worldData.capital.z) < D.minSpacing) return 'Too close to the capital';
    for (const s of Object.values(fr().settlements)) {
      if (s.site === si.id) return `${s.name} stands here`;
      if (s.x !== undefined && Math.hypot(si.x - s.x, si.z - s.z) < D.minSpacing) return `Too close to ${s.name}`;
    }
    return null;
  }
  // every site with what the menu needs: { id, x, z, region, terrain, tags, traits, open, why, campDistance, campWarn }
  function sites(id) {
    if (!on() || !worldData) return [];
    const warn = D.siteMenu?.campWarn ?? 700;
    return (worldData.sites || []).map(si => {
      const why = siteBlocked(si, id), camp = campNear(si), region = (worldData.regions || []).find(r => r.id === si.region);
      return { id: si.id, x: si.x, z: si.z, region: region?.name || si.region, terrain: si.terrain, tags: si.tags || [],
        traits: traitsOf(si), open: !why, why, campDistance: Math.round(camp), campWarn: camp <= warn, claimed: claims()[si.id] === id,
        travel: si.travelCostToCapital ?? null };
    });
  }

  // settlers of the hero's clan who go with him through the gate: near it, and selected or following him
  function partyAtGate(e, ids = [], radius = 14) {
    return Object.values(state.entities).filter(u => u.owner === e.owner && u.type === 'settler' && standing(u) && u.place === e.place
      && Math.hypot(u.x - e.x, u.z - e.z) < radius && ((ids || []).includes(u.id) || (u.order?.kind === 'follow' && u.order.target === e.id)));
  }
  // { ok, reason, settlers, site } for 'expedition' (validation only; game.js moves the party)
  function expeditionCheck(e, c) {
    const clan = state.clans?.[e?.owner];
    if (!clan || !standing(e)) return { ok: false, reason: 'no hero' };
    if (!on() || !modeRules(state).island) return { ok: false, reason: 'Expeditions leave in campaign games only' };
    if (!atGate(e)) return { ok: false, reason: 'Stand at the island gate' };
    const settlers = partyAtGate(e, c.units);
    if (c.action === 'walk') return { ok: true, settlers };
    if (!clan.permit) return { ok: false, reason: 'Buy a founding permit at the Land Office first' };
    if (settlers.length < D.minSettlers) return { ok: false, reason: `Bring at least ${D.minSettlers} settlers (${settlers.length} with you)` };
    const si = (worldData?.sites || []).find(s => s.id === c.site);
    if (!si) return { ok: false, reason: 'No such site' };
    const why = siteBlocked(si, clan.id);
    if (why) return { ok: false, reason: why };
    return { ok: true, settlers, site: si };
  }
  function claim(id, siteId) {
    const all = claims();
    for (const [k, v] of Object.entries(all)) if (v === id) delete all[k];
    if (siteId) all[siteId] = id;
  }
  // after a found: the clan's claim turns into the town (founding.js keeps town.site)
  function founded(id) {
    claim(id, null);
    const clan = state.clans?.[id];
    if (clan && !clan.bot && fr().firstPlayerTownDay == null) fr().firstPlayerTownDay = day();
  }

  // --- grace: camp bandits leave a new town's people alone -------------------------------------
  function inGrace(u) {
    if (!u || u.place !== 'world' || !fr()) return false;
    const span = (D.graceDays ?? 0) * dayTicks, R = D.graceRadius ?? 600;
    if (span <= 0) return false;
    for (const s of Object.values(fr().settlements)) {
      if (s.owner !== u.owner || s.foundedTick == null || state.tick - s.foundedTick >= span || s.x === undefined) continue;
      if (Math.hypot(u.x - s.x, u.z - s.z) <= R) return true;
    }
    return false;
  }

  // --- bots (E6) -------------------------------------------------------------------------------
  // day bots may leave: the player's first town or fallbackDay, plus staggerDays per bot (`order` 0, 1, ...)
  const day = () => state.clock?.day ?? (1 + Math.floor(state.tick / dayTicks));
  function botDue(id, order = 0) {
    const B = D.bots || {}, clan = state.clans?.[id];
    if (!on() || !clan?.bot || townsOf(id) >= (P.maxTowns ?? 1)) return false;
    const startDay = fr().firstPlayerTownDay ?? (B.fallbackDay ?? 30);
    return day() >= Math.min(startDay, B.fallbackDay ?? 30) + order * (B.staggerDays ?? 2);
  }
  const settlerPrice = () => units?.types?.settler?.price ?? 0;
  const botBudget = () => (P.ryo || 0) + D.minSettlers * settlerPrice() + D.cost + (D.bots?.reserve ?? 0);
  // a seeded per-game pick among the best free sites for this clan's taste
  function botSite(id) {
    const B = D.bots || {}, clan = state.clans?.[id], taste = B.taste?.[clan?.faction || clan?.kind || id] || B.taste?.[id] || {};
    const mine = Object.entries(claims()).find(([, v]) => v === id)?.[0];
    if (mine) return mine;
    let r = (Math.abs(seed() | 0) ^ [...id].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7)) % 2147483646 + 1;
    const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const scored = (worldData?.sites || []).filter(si => !siteBlocked(si, id)).map(si => {
      const t = traitsOf(si);
      let s = (t.soil || 0) + (t.water || 0) + (t.defense || 0);
      for (const g of si.tags || []) s += taste.tags?.[g] || 0;
      s += taste.terrain?.[si.terrain] || 0;
      for (const [k, w] of Object.entries(taste.traits || {})) s += (t[k] || 0) * w;
      s -= (si.travelCostToCapital || 0) / (B.travelScale || 6000);
      return { id: si.id, s: s + rnd() * (B.randomRoll ?? 3) };
    }).sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
    const top = scored.slice(0, Math.max(1, B.topPick ?? 3));
    return top.length ? top[Math.floor(rnd() * top.length)].id : null;
  }

  return { office, atOffice, atGate, businessesHeld, townsOf, permitStatus, buyPermit, sites, siteBlocked, partyAtGate,
    expeditionCheck, claim, founded, inGrace, botDue, botBudget, botSite, settlerPrice, day };
}
