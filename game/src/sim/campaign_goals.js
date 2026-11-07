import { modeRules } from './modes/index.js';
import { SHOP } from './gear_catalog.js';
// Campaign goals (quest log, Tim 2026-11-06). current() is read-only: it works out the clan's current goal
// from the state for the Goal card (src/goal_card.js). record(news) (campaign only, once a tick) keeps the
// milestones the starter goals need on clan.milestones: loot, gear and lanterns bought, raids, contracts, starters done.
// The permit rows come from landOffice.permitStatus(), the same check as the telegraph office blink.
// Chain, repeated for each town the clan may found (Influence unlocks the 2nd and 3rd):
//   starters (Yakuza: loot, gear up, 3 crew, first business, shakedown, win a raid; Kuroda: the same with a sweep;
//   Shinobi: loot, gear up, 3 ninja, a contract),
//   then permit -> settlers -> leave the city -> found, then grow Influence to the next tier.
// current(id) -> null | { key, title, step, steps, rows: [{ icon, label, have, need, done, how, where }] }
// where (Tim 2026-11-06): { x, z, place } of the spot an unfinished row points to (the Goal ping on the minimap
// and the gold blink in the street), or null; read-only, from the state the clan can see.
export const MAIN_STEPS = ['permit', 'settlers', 'lieutenant', 'orders', 'leave', 'found', 'layout', 'workers', 'stone', 'goods', 'governor', 'govorders', 'storehouse', 'camps', 'infirmary', 'people', 'village', 'market', 'influence'];   // after the clan's starter goals
const ORDINAL = ['', '2nd ', '3rd ', '4th '];

export function createCampaignGoals({ state, clans, landOffice, influence, rules = {}, spotKind = () => null, data = {}, lieutenantGuide = null }) {
  const D = data.founding || {}, P = D.permit || {}, G = data.goals || {};
  const townsOf = id => Object.values(state.frontier?.settlements || {}).filter(s => s.owner === id && s.founded).length;
  const heroOf = id => Object.values(state.entities).find(e => e.type === 'hero' && e.owner === id);
  const row = (icon, label, have, need, how) => ({ icon, label, have, need, done: have >= need, how: have >= need ? '' : how });

  function permitRows(id, clan) {
    const ninja = clan.kind === 'ninja', full = clans.crewCount(id) >= clans.crewCap(id);
    const how = {
      Renown: ninja ? 'Finish contracts at the village shrine (Space) and beat rival crew'
        : 'Win raids, shakedowns and sweeps',
      Crew: full ? 'Your crew limit is full: hold more businesses to raise it'
        : ninja ? 'Hire ninja in the village dojo or your longhouse (H)' : 'Hire in a teahouse or your hideout (H)',
      'Businesses held': 'Buy or take a business: left-click it at its door ring, then Buy or Attack',
      'Town tier': 'Grow one of your towns: more housing and food, then Upgrade at its town hall (O)',
      Ryo: ninja ? 'Finish contracts at the village shrine (Space)' : 'Collect business payouts at dawn',
    };
    const icons = { Renown: 'renown', Crew: 'crew', 'Businesses held': 'business', Ryo: 'ryo', 'Town tier': 'town' };
    return landOffice.permitStatus(id).rows.map(r => row(icons[r.label] || 'renown', r.label === 'Businesses held' ? 'Businesses' : r.label, r.have, r.need, how[r.label] || ''));
  }

  // --- starter goals (Tim 2026-11-06): teach the basics, every how line names the place and the key -----
  const marks = clan => (clan.milestones ||= { raids: 0, contractsTaken: 0, contractsDone: 0, loots: 0, gearBought: 0, lanterns: 0, starters: 0 });
  const equipped = clan => Object.values(clan.inventory?.equipment || {}).some(Boolean);
  const STARTERS = {
    yakuza: [
      (id, c, m) => ({ title: 'Loot a bandit', rows: [row('ryo', 'Bandit looted', m.loots ? 1 : 0, 1,
        'Bandit camps are marked B on the map (M). Beat a bandit, then right-click its glinting body to take its ryo')] }),
      (id, c, m) => ({ title: 'Gear up', rows: [
        row('business', 'Gear bought', m.gearBought ? 1 : 0, 1, 'Walk to the blacksmith and press Space at its door (or click the ⚒ Shop button), then pick an item and Buy'),
        row('crew', 'Gear equipped', equipped(c) ? 1 : 0, 1, 'Press I to open your bag, then right-click the item to wear it')] }),
      (id, c) => ({ title: 'Build a crew', rows: [row('crew', 'Crew', clans.crewCount(id), 3,
        'Go inside a teahouse (T on the minimap) or your hideout (H) and press H to hire')] }),
      (id) => ({ title: 'Own your first business', rows: [row('business', 'Businesses', landOffice.businessesHeld(id), 1,
        'Walk to a business nobody owns (letters on the minimap), left-click it and press Buy; or Attack it at night and beat the police')] }),
      (id, c, m) => ({ title: 'Run a shakedown', rows: [row('renown', 'Shakedown done', m.shakedowns ? 1 : 0, 1,
        'At night click the Deployment button (▧, flashing gold), pick a sector that has crew (gold border on the map), choose a rival business and press Start Shakedown (gold)')] }),
      (id, c, m) => ({ title: 'Win a raid', rows: [
        row('ryo', 'War Lantern', (c.lanterns || m.lanterns || m.raids) ? 1 : 0, 1, 'Buy one at the moneylender (M on the minimap): Space at the door'),
        row('renown', 'Raid won', m.raids ? 1 : 0, 1, 'At night stand at a rival business door, left-click it, press Raid, then hold its back room with your crew')] }),
    ],
    // Kuroda: as Yakuza, but a Sweep in place of the Shakedown (Tim 2026-11-06)
    kuroda: null,
    shinobi: [
      (id, c, m) => STARTERS.yakuza[0](id, c, m),
      (id, c, m) => STARTERS.yakuza[1](id, c, m),
      (id, c) => ({ title: 'Gather your ninja', rows: [row('crew', 'Crew', clans.crewCount(id), 3,
        'Go inside the village dojo (J on the minimap) or your longhouse and press H to hire')] }),
      (id, c, m) => ({ title: 'Finish a contract', rows: [
        row('office', 'Contract taken', m.contractsTaken ? 1 : 0, 1, 'Go to the shrine in the forest village (west, over the stream bridges), press Space and pick a job'),
        row('renown', 'Contract done', m.contractsDone ? 1 : 0, 1, 'Do the job shown at the top of the screen (its ping is on the map) before dawn')] }),
    ],
  };
  STARTERS.kuroda = STARTERS.yakuza.map((f, i) => i !== 4 ? f : (id, c, m) => ({ title: 'Run a sweep', rows: [row('renown', 'Sweep done', m.sweeps ? 1 : 0, 1,
    'Click the Deployment button (▧, flashing gold), pick a sector that has crew (gold border on the map), choose a rival clan and the sector next to it, then press Dispatch Sweep (gold)')] }));
  const startersOf = clan => STARTERS[clan.kind === 'ninja' ? 'shinobi' : clan.faction === 'kuroda' ? 'kuroda' : 'yakuza'];
  const starterGoal = (id, clan, i) => startersOf(clan)[i](id, clan, clan.milestones || {});
  // once a tick in campaign games, after the tick: milestones from this tick's news, loot and purchases,
  // then starters ticked off for good
  function record(news = [], casts = [], losses = []) {
    if (!modeRules(state).founding || !state.frontier) return;
    const C = id => state.clans?.[id];
    for (const n of news) {
      if (n.kind === 'raidWon' && !n.hq && C(n.raider)) marks(C(n.raider)).raids++;
      else if (n.kind === 'contractTaken' && C(n.clan)) marks(C(n.clan)).contractsTaken++;
      else if (n.kind === 'contractDone' && C(n.clan)) marks(C(n.clan)).contractsDone++;
      else if (n.kind === 'shakedownSuccess' && C(n.clan)) marks(C(n.clan)).shakedowns = (marks(C(n.clan)).shakedowns || 0) + 1;
      else if (n.kind === 'sweepSuccess' && C(n.clan)) marks(C(n.clan)).sweeps = (marks(C(n.clan)).sweeps || 0) + 1;
    }
    for (const k of casts) if (k.kind === 'loot') { const c = C(state.entities[k.a]?.owner); if (c) marks(c).loots++; }
    for (const l of losses) if (l.reason === 'Shop purchase' && C(l.clan)) {
      if (l.target === 'war_lantern') marks(C(l.clan)).lanterns++;
      else if (l.target !== 'bandage') marks(C(l.clan)).gearBought++;
    }
    if (state.tick % 10) return;   // starters: twice a second is plenty
    for (const clan of Object.values(state.clans || {})) {
      if (clan.bot) continue;
      const m = marks(clan), n = startersOf(clan).length;
      // a loaded save that already meets the permit (or later) skips the starters
      if (m.starters < n && (clan.permit || townsOf(clan.id) || landOffice?.permitStatus(clan.id).rows.every(r => r.ok))) m.starters = n;
      while (m.starters < n && starterGoal(clan.id, clan, m.starters).rows.every(r => r.done)) m.starters++;
    }
  }

  // --- goal pings (Tim 2026-11-06): where each unfinished row points ---------------------------------
  const spot = (x, z, place = 'street') => ({ x, z, place });
  const ringOf = b => b?.ring ? spot(b.ring[0], b.ring[1]) : null;
  const byKind = kind => Object.values(state.businesses || {}).find(b => b.kind === kind && b.ring);
  function nearest(id, list) {
    const h = heroOf(id);
    if (!h || !list.length) return list[0] || null;
    return list.reduce((a, b) => Math.hypot(b.x - h.x, b.z - h.z) < Math.hypot(a.x - h.x, a.z - h.z) ? b : a);
  }
  const ownable = b => b.ring && !b.hideout && rules.businesses?.[b.kind];
  function placeFor(id, clan, label) {
    const ninja = clan.kind === 'ninja';
    switch (label) {
      case 'Bandit looted': {
        const bodies = Object.values(state.entities).filter(e => e.wild && e.dead && e.loot > 0 && e.place === 'street').map(e => spot(e.x, e.z));
        if (bodies.length) return nearest(id, bodies);
        return nearest(id, (state.banditCamps || []).filter(c => !c.clearedAt && Number.isFinite(c.x)).map(c => spot(c.x, c.z)));
      }
      case 'Gear bought': return spot(SHOP.x, SHOP.z);
      case 'Crew': return ringOf(byKind(ninja ? 'dojo' : 'teahouse'));
      case 'Capital businesses': return (clan.lanterns || clan.milestones?.lanterns) ? nearest(id, Object.values(state.businesses || {}).filter(b => b.owner && b.owner !== id && ownable(b)).map(ringOf)) : ringOf(byKind('moneylender'));
      case 'Businesses': return nearest(id, Object.values(state.businesses || {}).filter(b => !b.owner && ownable(b)).map(ringOf));
      case 'War Lantern': return ringOf(byKind('moneylender'));
      case 'Raid won': return nearest(id, Object.values(state.businesses || {}).filter(b => b.owner && b.owner !== id && ownable(b)).map(ringOf));
      case 'Contract taken': return ringOf(byKind('contract_board'));
      case 'Permit bought': return ringOf(landOffice?.office());
      case 'Talk to your lieutenant': { const g = lieutenantGuide?.(id); return g ? spot(g.x, g.z) : null; }
      default: return null;
    }
  }

  // --- first-town setup (Tim 2026-11-06): lay out, workers, Village, Market; the capital-hold row rides along ---
  const count = (str, re) => (str?.match(re) || []).length;
  function holdRow(id) {
    const need = G.holdBusinesses ?? 6, have = landOffice.businessesHeld(id);
    return row('business', 'Capital businesses', have, need, 'Raid rival businesses at night: War Lantern from the moneylender (M), then Raid at a rival door');
  }
  function townSetupGoal(id, S0, steps) {
    const town = Object.values(state.frontier?.settlements || {}).filter(s => s.owner === id && s.founded && s.grid)
      .sort((a, b) => (a.foundedTick ?? 0) - (b.foundedTick ?? 0))[0];
    if (!town) return null;
    const L = G.layout || {}, at = { x: town.x, z: town.z, place: 'world' }, g = town.grid;
    const pin = r => ({ ...r, at });
    const panel = 'Walk to your town and press O (or click its hall), then ';
    const layout = [
      pin(row('town', 'Road cells', count(g.use, /[rg]/g), L.road ?? 3, panel + 'Build bar, pick Road (gold) and drag from the hall')),
      pin(row('settler', 'Housing cells', count(g.zone, /h/g), L.housing ?? 4, panel + 'Build bar, pick Housing (gold) and drag next to the road')),
      pin(row('ryo', 'Farm cells', count(g.zone, /f/g), L.farm ?? 4, panel + 'Build bar, pick Farm (gold) and drag on open ground near a road')),
    ];
    if (layout.some(r => !r.done)) return { key: 'layout', title: 'Lay out your town', step: S0 + MAIN_STEPS.indexOf('layout'), steps, rows: [...layout, holdRow(id)] };
    // Tim 2026-11-06: timber, stone, goods, storehouse, camps, people, then the Village upgrade
    const on = kind => (town.workers || []).filter(w => w.spot && spotKind(w.spot) === kind).length;
    const has = type => (town.buildings || []).some(b => b.type === type && b.stage !== 'ruined') || (town.projects || []).some(p => p.type === type);
    const tool = (name, what) => panel + `Build bar (gold), pick ${name} (gold) and ${what}`;
    if (on('timber') < 1) return { key: 'workers', title: 'Put workers to work', step: S0 + MAIN_STEPS.indexOf('workers'), steps, rows: [pin(row('crew', 'Workers on timber', on('timber'), 1,
      panel + 'Workers (gold), click the timber spot (gold) to look there, select a worker, then right-click the trees')), holdRow(id)] };
    if (on('stone') < 1) return { key: 'stone', title: 'Gather stone', step: S0 + MAIN_STEPS.indexOf('stone'), steps, rows: [pin(row('crew', 'Workers on stone', on('stone'), 1,
      panel + 'Workers (gold), click the stone spot (gold) to look there, select a worker, then right-click the rocks')), holdRow(id)] };
    const work = count(g.zone, /k/g);
    if (work < (G.workCells ?? 2)) return { key: 'goods', title: 'Make goods', step: S0 + MAIN_STEPS.indexOf('goods'), steps, rows: [pin(row('business', 'Work cells', work, G.workCells ?? 2,
      tool('Work', 'drag next to a road: workshops turn timber and stone into goods'))), holdRow(id)] };
    // the governor (Tim 2026-11-06): meet him beside the hall, then give him a focus and initiative or approve a suggestion
    const clan = state.clans?.[id], m = clan?.milestones || {};
    if (!m.metGovernor) return { key: 'governor', title: 'Meet your governor', step: S0 + MAIN_STEPS.indexOf('governor'), steps, rows: [
      pin(row('crew', 'Talk to your governor', 0, 1, 'Walk up to your town hall (gold) and press Space')), holdRow(id)] };
    if (!town.focusSet || !(town.autoBuild || town.approvedOnce)) return { key: 'govorders', title: 'Give him his orders', step: S0 + MAIN_STEPS.indexOf('govorders'), steps, rows: [
      pin(row('town', 'Pick a focus', town.focusSet ? 1 : 0, 1, panel + 'under Steer pick a Focus (gold): Grow, Produce, Trade or Fortify')),
      pin(row('office', 'Initiative On or a suggestion approved', town.autoBuild || town.approvedOnce ? 1 : 0, 1, panel + 'set Governor takes initiative to On (gold), or press Approve on one of his suggestions')), holdRow(id)] };
    if (data.buildings?.storehouse && !has('storehouse')) return { key: 'storehouse', title: 'Build a storehouse', step: S0 + MAIN_STEPS.indexOf('storehouse'), steps, rows: [pin(row('town', 'Storehouse', 0, 1,
      tool('Storehouse', 'click a spot by a road: it holds the stock you need for the upgrade'))), holdRow(id)] };
    const camps = [['lumber_camp', 'Lumber camp', 'near trees'], ['quarry', 'Quarry', 'near rocks']].filter(([t]) => data.buildings?.[t]);
    if (camps.some(([t]) => !has(t))) return { key: 'camps', title: 'Build a lumber camp and a quarry', step: S0 + MAIN_STEPS.indexOf('camps'), steps, rows: [
      ...camps.map(([t, name, near]) => pin(row('town', name, has(t) ? 1 : 0, 1, tool(name, `place it ${near}: steady ${t === 'quarry' ? 'stone' : 'timber'} without picking spots`)))), holdRow(id)] };
    // Tim 2026-11-06: an infirmary (stockade has no goal, only its tooltip)
    if (data.buildings?.infirmary && !has('infirmary')) return { key: 'infirmary', title: 'Build an infirmary', step: S0 + MAIN_STEPS.indexOf('infirmary'), steps, rows: [
      pin(row('town', 'Infirmary', 0, 1, tool('Infirmary', 'place it near the hall: your people heal faster beside it, and anyone knocked out on the island wakes there'))), holdRow(id)] };
    const tier = town.tier || 1, wantTier = G.tier ?? 2, next = (data.tiers?.list || [])[wantTier - 1];
    if (next && tier < wantTier) {
      const people = (town.pop || 0) + (town.workers?.length || 0) + (town.workerTraining?.length || 0), needP = next.upgrade?.pop || 0;
      if (people < needP) return { key: 'people', title: 'Grow your people', step: S0 + MAIN_STEPS.indexOf('people'), steps, rows: [pin(row('settler', 'People', people, needP,
        tool('Housing', 'zone more cells by a road; houses fill up while there is food (farms)'))), holdRow(id)] };
      const cost = next.upgrade?.cost || {}, icon = { timber: 'town', stone: 'town', goods: 'business' };
      return { key: 'village', title: `Grow to ${next.name}`, step: S0 + MAIN_STEPS.indexOf('village'), steps, rows: [
        ...Object.entries(cost).map(([k, n]) => pin(row(icon[k] || 'ryo', k[0].toUpperCase() + k.slice(1), Math.floor(town.stock?.[k] || 0), n,
          k === 'goods' ? 'Workshops (Work cells) make goods from timber and stone' : `Workers, the ${k === 'stone' ? 'quarry' : 'lumber camp'} and more workers bring it in`))),
        pin(row('town', `Town hall: ${next.name}`, tier >= wantTier ? 1 : 0, 1, town.tierUpgrade ? 'Upgrade under way' : panel + `press Upgrade to ${next.name} (gold)`)),
        holdRow(id)] };
    }
    const market = (town.buildings || []).some(b => b.type === 'market' && b.stage !== 'ruined');
    if (!market && data.buildings?.market) return { key: 'market', title: 'Open a Market', step: S0 + MAIN_STEPS.indexOf('market'), steps, rows: [
      pin(row('ryo', 'Market built', 0, 1, panel + 'Build bar, pick Market (gold) and place it; it sells goods above the keep level for ryo and Influence')), holdRow(id)] };
    return null;
  }

  function current(id) {
    const g = goalOf(id), clan = state.clans?.[id];
    // the office is pointed at only once everything else for the permit is done (same as the telegraph blink)
    const blocked = r => r.label === 'Permit bought' && g.rows.some(o => o !== r && !o.done);
    return g && { ...g, rows: g.rows.map(({ at, ...r }) => ({ ...r, where: r.done || blocked(r) ? null : at || placeFor(id, clan, r.label) })) };
  }

  function goalOf(id) {
    const clan = state.clans?.[id];
    if (!clan || !landOffice || !modeRules(state).founding || !state.frontier) return null;
    const towns = townsOf(id), max = influence ? influence.maxTowns(id, P.maxTowns ?? 1) : (P.maxTowns ?? 1);
    const nth = ORDINAL[towns] ?? `${towns + 1}th `;
    const started = clan.milestones?.starters ?? 0, S0 = clan.bot ? 0 : startersOf(clan).length, steps = S0 + MAIN_STEPS.length;
    if (towns === 0 && !clan.permit && started < S0) {
      const g = starterGoal(id, clan, started);
      return { key: `starter${started}`, title: g.title, step: started, steps, rows: g.rows };
    }
    if (towns && !clan.bot) { const setup = townSetupGoal(id, S0, steps); if (setup) return setup; }
    if (towns < max) {
      if (!clan.permit) {
        const rows = permitRows(id, clan);
        const ready = rows.every(r => r.done);
        rows.push(row('office', 'Permit bought', 0, 1, ready ? 'Go to the telegraph office (East Ward, past Police HQ, gold marker) and press Space, then 1'
          : 'Then buy it at the telegraph office (East Ward, past Police HQ)'));
        return { key: `permit${towns}`, title: `Buy a ${nth}founding permit`, step: S0 + MAIN_STEPS.indexOf('permit'), steps, rows };
      }
      // settlers waiting safely at the HQ (a count) plus any already walking with the hero
      const need = D.minSettlers ?? 5, have = clans.settlersOf(id).length + (clan.settlersWaiting || 0);
      if (have < need)
        return { key: `settlers${towns}`, title: 'Hire settlers', step: S0 + MAIN_STEPS.indexOf('settlers'), steps,
          rows: [row('settler', 'Settlers', have, need, 'Hire them at the telegraph office: Space, then 2 (one) or 3 (five). They wait safely at your HQ')] };
      const out = heroOf(id)?.place === 'world', cost = D.cost ?? 0;
      // the first town only (Tim 2026-11-06): meet the lieutenant at the gate, then give him his orders
      const m = clan.milestones || {};
      if (!out && towns === 0 && !clan.bot && !m.metLieutenant)
        return { key: 'lieutenant', title: 'Meet your lieutenant', step: S0 + MAIN_STEPS.indexOf('lieutenant'), steps,
          rows: [row('crew', 'Talk to your lieutenant', 0, 1, 'He waits by the island gate (G on the minimap, east trail): stand beside him and press Space')] };
      if (!out && towns === 0 && !clan.bot && !m.budgetSet)
        return { key: 'orders', title: 'Give him his orders', step: S0 + MAIN_STEPS.indexOf('orders'), steps,
          rows: [row('office', 'Open While I’m away', m.ordersOpened ? 1 : 0, 1, 'Click Deployment (gold) in the icon menu, then the While I’m away tab (gold)'),
            row('ryo', 'Set his budget', 0, 1, 'Move the Budget slider (gold) to what he may spend each day; every order starts on')] };
      if (!out)
        return { key: `leave${towns}`, title: 'Leave the city', step: S0 + MAIN_STEPS.indexOf('leave'), steps, gate: true,
          rows: [row('settler', 'Settlers ready', have, need, ''),
            row('gate', 'Out through the island gate', 0, 1, 'Your settlers wait at your HQ and join you outside the gate: go to the island gate (gold marker, east trail) and press Space')] };
      const rows = [row('settler', 'Settlers', have, need, '')];
      if (cost) rows.push(row('ryo', 'Ryo', Math.floor(clan.ryo || 0), cost, 'Collect business payouts at dawn'));
      rows.push(row('town', 'Town founded', 0, 1, 'With the settlers beside you, click Found a town here'));
      return { key: `found${towns}`, title: `Found your ${nth}town`, step: S0 + MAIN_STEPS.indexOf('found'), steps, rows };
    }
    const st = influence?.status(id);
    if (st?.next) return { key: `influence${st.tier}`, title: `Grow Influence: ${st.next.label}`, step: S0 + MAIN_STEPS.indexOf('influence'), steps,
      rows: [row('influence', 'Influence', st.value, st.next.at, 'Hold businesses (every dawn) and sell town goods at a Market')] };
    return null;
  }
  return { current, record };
}
