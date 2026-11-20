// Rival campaign (Z2, Tim 2026-11-19): each rival bot clan's home zone and hidden campaign strategy, and how it founds
// its towns after the first. Rolled once a game from the campaign seed and saved: state.frontier.rivals[clan] =
// { home, strategy, founded, nextDay, party }. Data: campaign_zones.json `rivals` (placeholders, Tim to tune).
//  - The first town is the boss's own trip (bot_expedition.js). Every later one is the lieutenant's: when the clan is
//    due (strategy everyDays after its last founding, under the strategy's maxTowns, the zone cap and a free site in
//    reach) and can pay, it pays for the permit, the settlers and the founding, and the settlers land at the clan's
//    home harbour (the castle spot of its home zone). They walk to the site (land_office.botSite: home zone first, then
//    the zones touching it, then onward) and found the town there with the real founding rules. They are real units
//    on the island: if fewer than founding.minSettlers arrive, the trip is lost.
//  - A clan that lost every town founds again the same way.
//  - mayWar(clan) and knows(clan, town) are the strategy's say in the bot general (war_general_brain.js):
//    Expander: no war while it may still found; Fortress: no war under strategy.warRyo in the treasury;
//    a rival knows the towns in the zones where it has a town or its home, the zones touching those, and the towns
//    of any clan that attacked it.
// createRivalCampaign({ state, data, worldData, zones, founding, world, construction, dayTicks }) -> see the return line
import { modeRules } from '../modes/index.js';
import { dirIndex } from '../geometry.js';

export function createRivalCampaign({ state, data, worldData, zones, founding, world, construction, dayTicks = 12000, seed = () => state.campaignSeed ?? 1 }) {
  const R = () => data.campaignZones?.rivals || {}, D = data.founding || {};
  let runtime = null, L = null, settler = null, castles = null;
  const price = () => settler?.price ?? 0;
  let lastRec = null;
  const paths = new Map();   // clan -> { pts, cum } for the party on the way (worked out again after a load)
  const fr = () => state.frontier;
  const on = () => !!zones && !!fr() && modeRules(state).founding;
  const bots = () => Object.values(state.clans || {}).filter(c => c.bot && !c.out).sort((a, b) => (a.id < b.id ? -1 : 1));
  const day = () => state.clock?.day ?? (1 + Math.floor((state.tick || 0) / dayTicks));
  const say = (clan, text) => { if (clan) clan.notice = { tick: state.tick, text }; };
  const rng = salt => { let r = Math.abs((seed() | 0) ^ [...salt].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) | 0, 17)) % 2147483646 + 1; return () => (r = (r * 16807) % 2147483647) / 2147483647; };

  // roll a home and a strategy for every bot clan that has none yet
  function ensure() {
    if (!on()) return null;
    const rec = (fr().rivals ||= {}), need = bots().filter(c => !rec[c.id]);
    if (!need.length) return placeHomes(rec);
    // Z7: rivals choose after the player has chosen his home with the surveyor, or from founding.bots.fallbackDay anyway
    if (castles && Object.values(state.clans || {}).some(c => !c.bot && !c.out && !castles.castleOf(c.id)) && day() < (D.bots?.fallbackDay ?? 10)) return null;
    const taken = new Set(Object.values(rec).map(r => r.home)), kinds = Object.keys(R().strategies || {});
    const castleAt = z => !!fr().settlements?.[`castle_${z}`];   // a site with a castle on it already (sim/castles.js place)
    const homes = zones.castles().map(c => c.zone).filter(z => !castleAt(z) && !taken.has(z) && (castles || z !== (R().playerHome ?? 'east_plains')));
    for (const c of need) {
      const rnd = rng(`rival:${c.id}`);
      const home = homes.length ? homes.splice(Math.floor(rnd() * homes.length), 1)[0] : null;
      rec[c.id] = { home, strategy: kinds.length ? kinds[Math.floor(rnd() * kinds.length)] : null };
    }
    return placeHomes(rec);
  }
  // Z5: every rival's castle stands at its home from the start (an older save gets it on its first tick)
  function placeHomes(rec) {
    if (castles) for (const c of bots()) if (rec[c.id]?.home && !rec[c.id].castle) { rec[c.id].castle = castles.place(c.id, rec[c.id].home)?.id || 'none'; }
    return rec;
  }
  const of = id => ensure()?.[id] || null;
  const strategy = id => R().strategies?.[of(id)?.strategy] || {};
  // where its settlers land: the open ground before its castle's drawbridge, else the castle spot of its home zone
  const homePoint = id => { const h = of(id)?.home, c = h && zones.castles().find(x => x.zone === h); return castles?.approach(id) || (c && Number.isFinite(c.x) ? c : null); };
  const townsOf = id => Object.values(fr()?.settlements || {}).filter(s => s.owner === id && s.founded !== undefined && !s.capital);
  const budget = () => (D.permit?.ryo || 0) + (D.minSettlers || 0) * price() + (D.cost || 0) + (D.bots?.reserve ?? 0);
  const mayFound = id => { const S = strategy(id); return (L?.townsOf(id) ?? 0) < (S.maxTowns ?? 1) && !!L?.botSite(id, of(id)?.skip || []); };

  // --- the bot general's questions ------------------------------------------------------------------------
  function mayWar(id) {
    const r = of(id), S = strategy(id), clan = state.clans?.[id];
    if (!r || !clan) return true;
    if (S.noWarWhileLand && (r.party || mayFound(id))) return false;
    if ((S.warRyo ?? 0) > (clan.ryo || 0)) return false;
    return true;
  }
  function knows(id, town) {
    const r = of(id);
    if (!r || !town) return true;
    const mine = new Set([r.home, ...townsOf(id).map(s => zones.zoneOfTown(s))].filter(Boolean)), z = zones.zoneOfTown(town);
    if (z && (mine.has(z) || [...mine].some(m => zones.touches(m, z)))) return true;
    const wars = fr().wars || {};
    return [...Object.values(wars.list || {}), ...(wars.history || [])].some(w => w.attacker === town.owner && w.defender === id);
  }

  // --- the settlers' walk -----------------------------------------------------------------------------------
  const alive = p => (p.ids || []).map(i => state.entities?.[i]).filter(u => u && !u.dead && !u.downed);
  function route(id, from, to) {
    const raw = runtime?.areas?.nav?.workerPath?.(from[0], from[1], to[0], to[1]);
    if (!raw?.length) return null;
    const pts = [raw[0]]; for (const q of raw) { const l = pts[pts.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.5) pts.push(q); }
    const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const P = { pts, cum, length: cum[cum.length - 1] };
    paths.set(id, P);
    return P;
  }
  function pointAt(P, d) {
    d = Math.max(0, Math.min(P.length, d));
    let lo = 0, hi = P.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.cum[m] <= d) lo = m; else hi = m; }
    const a = P.pts[lo], b = P.pts[hi] || a, span = (P.cum[hi] ?? d) - P.cum[lo], t = span > 0 ? (d - P.cum[lo]) / span : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  function launch(clan, r) {
    const S = strategy(clan.id), home = homePoint(clan.id), siteId = L.botSite(clan.id, r.skip || []);
    const si = siteId && (worldData?.sites || []).find(s => s.id === siteId), nav = runtime?.areas?.nav, st = settler;
    if (!home || !si || !nav || !st) return false;
    // (the planner finds the nearest dry ground itself, whether or not that part of the island is awake)
    const P = route(clan.id, [home.x, home.z], [si.x, si.z]), start = P?.pts[1] || P?.pts[0];
    if (!P) { (r.skip ||= []).push(siteId); return false; }   // no way there on foot: another site next time
    const n = D.minSettlers || 1, cost = (D.permit?.ryo || 0) + n * price(), held = D.cost || 0;
    clan.ryo -= cost + held;
    (state.ryoLosses ||= []).push({ clan: clan.id, amount: cost, reason: 'Founding permit and settlers' });
    L.claim(clan.id, si.id);
    const ids = [];
    for (let k = 0; k < n; k++) ids.push(runtime.spawn('settler', st.sprite, start[0], start[1], { owner: clan.id, hp: st.hp, holdFire: true, place: 'world', settleParty: clan.id }));
    r.party = { site: si.id, ids, d: 0, tick: state.tick || 0, held, tries: 0 };
    runtime.areas?.update?.(Object.values(state.entities));
    return true;
  }
  function fail(clan, r, why) {
    const p = r.party;
    for (const u of alive(p)) runtime?.remove?.(u.id);
    clan.ryo += p.held || 0; clan.permit = false;
    L.claim(clan.id, null); paths.delete(clan.id);
    r.party = null; r.nextDay = day() + (strategy(clan.id).everyDays ?? 3);
    r.lost = (r.lost || 0) + 1; r.lastLoss = why;
  }
  // a hall spot by the site that the founding rules accept (as the boss's own trip does, bot_expedition.js)
  function hallSpot(lead, si) {
    const cell = data.townGrid.cellSize;
    for (const rr of [2, 2.5, 3, 1.6]) for (let a = 0; a < 8; a++) {
      const x = Math.round(lead.x + Math.cos(a * Math.PI / 4) * rr * cell), z = Math.round(lead.z + Math.sin(a * Math.PI / 4) * rr * cell);
      if (Math.hypot(x - si.x, z - si.z) > (D.botSiteRadius ?? 80) - 1) continue;
      if (founding.check(lead, undefined, { x, z }).ok) return { x, z };
    }
    return null;
  }
  function walk(clan, r) {
    const p = r.party, living = alive(p), si = (worldData?.sites || []).find(s => s.id === p.site);
    if (!si || living.length < (D.minSettlers || 1)) return fail(clan, r, 'settlers lost');
    let P = paths.get(clan.id);
    if (!P) { P = route(clan.id, [living[0].x, living[0].z], [si.x, si.z]); p.d = 0; if (!P) return fail(clan, r, 'no way'); }
    if (p.d < P.length) {
      p.d = Math.min(P.length, p.d + (R().trekSpeed ?? 5.4) / 20);
      living.forEach((u, k) => {
        const [x, z] = pointAt(P, p.d - k * 1.5);
        if (x !== u.x || z !== u.z) u.dir = dirIndex(x - u.x, z - u.z);
        u.x = x; u.z = z; u.anim = p.d - k * 1.5 > 0 ? 'run' : 'idle';
      });
      return;
    }
    // at the site: found with the real rules, the first settler standing in for the boss
    if ((state.tick || 0) % 10) return;
    const lead = living[0];
    for (const u of living) u.anim = 'idle';
    clan.permit = true; clan.ryo += p.held || 0; p.held = 0;
    const spot = hallSpot(lead, si), res = spot && founding.found(lead, undefined, worldData, world(), construction, spot);
    if (res?.ok) { paths.delete(clan.id); r.party = null; r.nextDay = day() + (strategy(clan.id).everyDays ?? 3); r.sent = (r.sent || 0) + 1; return; }
    p.held = D.cost || 0; clan.ryo -= p.held; clan.permit = false;
    if (++p.tries > 40) fail(clan, r, 'no hall spot');
  }

  function tick() {
    const rec = ensure();
    if (rec !== lastRec) { paths.clear(); lastRec = rec; }   // a loaded game: the walks are worked out again from where the settlers stand
    if (!rec || !L || !runtime?.spawn) return;
    for (const clan of bots()) {
      const r = rec[clan.id];
      if (!r) continue;
      if (r.party) { walk(clan, r); continue; }
      if ((state.tick || 0) % 20) continue;
      if (!r.founded) { if (L.townsOf(clan.id) > 0) { r.founded = true; r.nextDay = day() + (strategy(clan.id).everyDays ?? 3); } continue; }
      if (day() < (r.nextDay ?? 0) || clan.ryo < budget() || !mayFound(clan.id)) continue;
      if (Object.values(fr().wars?.list || {}).some(w => w.defender === clan.id)) continue;   // not while one of its towns is under attack
      if (!launch(clan, r)) r.nextDay = day() + 1;
    }
  }

  return { tick, ensure, of, strategy, homePoint, mayWar, knows, mayFound, budget,
    attach(services) { runtime = services; }, setCastles(c) { castles = c; }, setLandOffice(l, settlerType) { L = l; settler = settlerType || null; } };
}
