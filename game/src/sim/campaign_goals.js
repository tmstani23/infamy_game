import { modeRules } from './modes/index.js';
import { SHOP } from './gear_catalog.js';
import { cellToWorld } from './frontier/town_grid.js';
// Campaign goals (quest log, 2026-11-06). current() is read-only: it works out the clan's current goal
// from the state for the Goal card (src/goal_card.js). record(news) (campaign only, once a tick) keeps the
// milestones the starter goals need on clan.milestones: loot, gear and lanterns bought, raids, contracts, starters done.
// The permit rows come from landOffice.permitStatus(), the same check as the telegraph office blink.
// Chain (goals pass, 2026-11-18: no repeat for the 2nd and 3rd town):
//   starters (Yakuza: loot, gear up, 3 crew, first business, shakedown, win a raid; Kuroda: the same with a sweep;
//   Shinobi: loot, gear up, 3 ninja, a contract),
//   then permit -> settlers -> leave the city -> found -> first-town setup, then grow Influence to the 2nd town
//   permit, then rail: a station and a line, then a rail order and a shipment, then the one-time Land Office talk
//   on rival towns and war (land_office.rivalsTalk), then the 2nd town by war: pack a war chest (and keep coffers
//   for defence), then declare war on a rival town. Third town goals: later. Bots keep the old permit loop.
// current(id) -> null | { key, title, step, steps, rows: [{ icon, label, have, need, done, how, where }] }
// where (2026-11-06): { x, z, place } of the spot an unfinished row points to (the Goal ping on the minimap
// and the gold blink in the street), or null; read-only, from the state the clan can see.
export const MAIN_STEPS = ['permit', 'settlers', 'surveyor', 'lieutenant', 'orders', 'leave', 'mount', 'castleOut', 'found', 'layout', 'workers', 'stone', 'goods', 'governor', 'govorders', 'fund', 'strategy', 'quarter', 'barracks', 'foodcamp', 'storehouse', 'camps', 'infirmary', 'people', 'village', 'market', 'influence', 'rail', 'shipping', 'registrar', 'fieldguide', 'warpack', 'war', 'explore'];   // after the clan's starter goals
const ORDINAL = ['', '2nd ', '3rd ', '4th '];

export function createCampaignGoals({ state, clans, landOffice, influence, hidden = null, rules = {}, spotKind = () => null, foodSpotNear = () => null, data = {}, lieutenantGuide = null, surveyorAt = () => null, zones = null, harbourAt = () => null, hasCastle = () => false, castleApproach = () => null }) {
  // Z2 (2026-11-19): the war goals (news of rival towns, pack, declare) wait until a rival town stands in a zone
  // where this clan has a town, or in a zone touching one
  const rivalInReach = id => {
    if (!zones) return true;
    const all = Object.values(state.frontier?.settlements || {}).filter(s => s.founded !== undefined && !s.capital && s.owner != null);
    const mine = new Set(all.filter(s => s.owner === id).map(s => zones.zoneOfTown(s)).filter(Boolean));
    return all.some(s => s.owner !== id && state.clans?.[s.owner]?.bot && (z => z && (mine.has(z) || [...mine].some(m => zones.touches(m, z))))(zones.zoneOfTown(s)));
  };
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

  // --- starter goals (2026-11-06): teach the basics, every how line names the place and the key -----
  const marks = clan => (clan.milestones ||= { raids: 0, contractsTaken: 0, contractsDone: 0, loots: 0, gearBought: 0, lanterns: 0, starters: 0 });
  // the first town (by founding), or null
  const firstTown = id => Object.values(state.frontier?.settlements || {}).filter(s => s.owner === id && s.founded && s.grid)
    .sort((a, b) => (a.foundedTick ?? 0) - (b.foundedTick ?? 0))[0] || null;
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
    // Kuroda: as Yakuza, but a Sweep in place of the Shakedown (2026-11-06)
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
    const orders = Object.values(state.frontier.shipping?.orders || {});
    for (const clan of Object.values(state.clans || {})) {
      if (clan.bot) continue;
      const m = marks(clan), n = startersOf(clan).length;
      // rail goals (goals pass): a rail order of your own, and one that has brought cargo in (kept for good: done orders may go)
      for (const o of orders) if (o.owner === clan.id && !o.auto) { m.railOrder = 1; if (o.got > 0) m.shipped = 1; }
      // war goals (goals pass): a full pack (it is spent when the banner goes in), and a war of your own declared
      if (!m.packed && packDone(clan)) m.packed = 1;
      if (!m.warDeclared && Object.values(state.frontier.wars?.list || {}).some(w => w.attacker === clan.id)) m.warDeclared = 1;
      // the military quarter goal (2026-11-21): done once the hero has walked up to it
      if (!m.sawQuarter && goalOf(clan.id)?.key === 'quarter') {
        const q = quarterOf(firstTown(clan.id)), h = heroOf(clan.id);
        if (q && h?.place === 'world' && Math.hypot(h.x - q.x, h.z - q.z) <= (G.quarterLook ?? 60)) m.sawQuarter = 1;
      }
      // a loaded save that already meets the permit (or later) skips the starters
      if (m.starters < n && (clan.permit || townsOf(clan.id) || landOffice?.permitStatus(clan.id).rows.every(r => r.ok))) m.starters = n;
      while (m.starters < n && starterGoal(clan.id, clan, m.starters).rows.every(r => r.done)) m.starters++;
      // the gold mark over the old surveyor (render/banners.js) while his talk on rival towns is the goal
      clan.warTalkDue = !m.warTalk && townsOf(clan.id) > 0 && goalOf(clan.id)?.key === 'registrar';
    }
  }

  // the Find a site row of the Found card (2026-11-20): done once the boss stands near any open site (the surveyor's
  // picks or any other: he need not take theirs); points at the nearest pick; sites = the picks for the World map marks
  function siteGoal(id, clan) {
    const all = landOffice?.sites?.(id) || [], h = heroOf(id);
    if (!all.length) return null;
    const reach = D.siteReach ?? 300;
    const picks = (clan.survey?.sites || []).map(sid => all.find(s => s.id === sid)).filter(s => s && s.open);
    const near = !!h && h.place === 'world' && all.some(s => s.open && Math.hypot(s.x - h.x, s.z - h.z) <= reach);
    const at = picks.length && h ? picks.reduce((a, b) => Math.hypot(b.x - h.x, b.z - h.z) < Math.hypot(a.x - h.x, a.z - h.z) ? b : a) : null;
    return { sites: picks.map(s => ({ id: s.id, x: s.x, z: s.z })),
      row: { ...row('gate', 'Ride to a town site', near ? 1 : 0, 1, `${picks.length ? `Gold marks on the World map (M) are the surveyor's picks near your castle: hover one for its soil, water and resources. ` : ''}Look for good soil (food), forest and stone close by (faster camps and quarries), and no bandit camp near. Any open ground will do: ride out and found it yourself`),
        at: at ? spot(at.x, at.z, 'world') : null } };
  }
  // --- goal pings (2026-11-06): where each unfinished row points ---------------------------------
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

  // --- first-town setup (2026-11-06): lay out, workers, Village, Market; the capital-hold row rides along ---
  // the middle of the town's military quarter (the general's plot, else Military zone cells), as a goal mark, or null
  function quarterOf(town) {
    const MZ = data.zones?.military?.char, g = town?.grid; if (!g || !MZ) return null;
    const cells = town.milPlot?.cells?.length ? town.milPlot.cells.filter(i => g.zone[i] === MZ) : [...g.zone].map((c, i) => c === MZ ? i : -1).filter(i => i >= 0);
    if (!cells.length) return null;
    const pts = cells.map(i => cellToWorld(town, i));
    return { x: pts.reduce((a, p) => a + p[0], 0) / pts.length, z: pts.reduce((a, p) => a + p[1], 0) / pts.length, place: 'world' };
  }
  const count = (str, re) => (str?.match(re) || []).length;
  function holdRow(id) {
    const need = G.holdBusinesses ?? 6, have = landOffice.businessesHeld(id);
    // out on the island the boss cannot raid: the lieutenant does it (2026-11-10)
    const out = heroOf(id)?.place === 'world';
    return row('business', 'Capital businesses', have, need, out ? 'Your lieutenant raids for you while you are away (his Raid order); back in the city you can raid yourself at night'
      : 'Raid rival businesses at night: War Lantern from the moneylender (M), then Raid at a rival door');
  }
  function townSetupGoal(id, S0, steps) {
    const town = firstTown(id);
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
    // 2026-11-06: timber, stone, goods, storehouse, camps, people, then the Village upgrade
    const on = kind => (town.workers || []).filter(w => w.spot && spotKind(w.spot) === kind).length;
    const has = type => (town.buildings || []).some(b => b.type === type && b.stage !== 'ruined') || (town.projects || []).some(p => p.type === type);
    const tool = (name, what) => panel + `Build bar (gold), pick ${name} (gold) and ${what}`;
    if (on('timber') < 1) return { key: 'workers', title: 'Put workers to work', step: S0 + MAIN_STEPS.indexOf('workers'), steps, rows: [pin(row('crew', 'Workers on timber', on('timber'), 1,
      panel + 'Follow the gold flashes: Workers, click a worker card to select him, Spots tab, Look at the timber spot, then right-click the trees')), holdRow(id)] };
    if (on('stone') < 1) return { key: 'stone', title: 'Gather stone', step: S0 + MAIN_STEPS.indexOf('stone'), steps, rows: [pin(row('crew', 'Workers on stone', on('stone'), 1,
      panel + 'Follow the gold flashes: Workers, click a worker card to select him, Spots tab, Look at the stone spot, then right-click the rocks')), holdRow(id)] };
    const work = count(g.zone, /k/g);
    if (work < (G.workCells ?? 2)) return { key: 'goods', title: 'Make goods', step: S0 + MAIN_STEPS.indexOf('goods'), steps, rows: [pin(row('business', 'Work cells', work, G.workCells ?? 2,
      tool('Work', 'drag next to a road: workshops turn timber and stone into goods'))), holdRow(id)] };
    // the governor (2026-11-06): meet him beside the hall, then give him a focus and initiative or approve a suggestion
    const clan = state.clans?.[id], m = clan?.milestones || {};
    if (!m.metGovernor) return { key: 'governor', title: 'Meet your governor', step: S0 + MAIN_STEPS.indexOf('governor'), steps, rows: [
      pin(row('crew', 'Talk to your governor', 0, 1, 'Walk up to your town hall (gold) and press Space')), holdRow(id)] };
    // once given, his orders stay given (2026-11-21): Initiative turned Off later, or anything he built on his own (older saves), counts
    const ordered = town.autoBuild || town.approvedOnce || town.initiativeOnce || town.grid?.by?.includes('g');
    if (!town.focusSet || !ordered) return { key: 'govorders', title: 'Give him his orders', step: S0 + MAIN_STEPS.indexOf('govorders'), steps, rows: [
      pin(row('town', 'Pick a focus', town.focusSet ? 1 : 0, 1, panel + 'open the Governor tab and pick a Focus (gold): Grow, Produce, Trade or Fortify')),
      pin(row('office', 'Initiative On or a suggestion approved', ordered ? 1 : 0, 1, panel + 'set Governor takes initiative to On (gold), or press Approve on one of his suggestions')), holdRow(id)] };
    // the general (2026-11-21, town_plan_spec.md section 5), first town only; a save already past the Market goal skips them
    const marketDone = (town.buildings || []).some(b => b.type === 'market' && b.stage === 'built') && town.marketKeepSet;
    if (data.war?.general?.fund && !marketDone) {
      if (!town.fund?.set) return { key: 'fund', title: 'Fund your general', step: S0 + MAIN_STEPS.indexOf('fund'), steps, rows: [
        pin(row('ryo', 'Safety fund share typed', 0, 1, panel + 'open the Governor tab and type a share in the Safety fund box (gold). That share of the town timber, stone and ryo income is saved for your general, who builds military buildings only from it. 0 means none')), holdRow(id)] };
      if (!clan?.strategyPicked) return { key: 'strategy', title: 'Pick his strategy', step: S0 + MAIN_STEPS.indexOf('strategy'), steps, rows: [
        pin(row('crew', 'Strategy chosen', 0, 1, panel + 'press Military (gold), open the General tab and pick Rush, Siege or Raider, or click the chosen one to keep it. It sets what he builds and how he fights while you are away')), holdRow(id)] };
      const q = quarterOf(town), MZc = data.zones?.military?.char;
      const seen = m.sawQuarter || town.milPlot?.player || town.milPlot?.erased || [...(town.grid?.zone || '')].some((c, i) => c === MZc && town.grid.by[i] === 'p');   // he painted his own
      if (!seen) return { key: 'quarter', title: 'The military quarter', step: S0 + MAIN_STEPS.indexOf('quarter'), steps, rows: [q
        ? { ...row('town', 'Military quarter looked at', 0, 1, 'Walk to the gold mark: your general keeps this block for military buildings and lays its road. You can erase it and paint your own Military zone'), at: q }
        : pin(row('town', 'Military zone painted', 0, 1, tool('Military', 'paint a block by a road: your general builds there. With Governor initiative On he paints one himself'))), holdRow(id)] };
      const milBuilt = (town.buildings || []).some(b => b.stage === 'built' && data.buildings?.[b.type]?.military);
      if (!milBuilt) return { key: 'barracks', title: 'First barracks', step: S0 + MAIN_STEPS.indexOf('barracks'), steps, auto: !!town.autoBuild, rows: [
        pin(row('crew', 'Military building standing', 0, 1, town.autoBuild ? `Your general builds it from the safety fund${town.fund?.next ? `, saving for ${town.fund.next}` : ''}. A bigger share gets it sooner`
          : panel + 'press Military (gold) and place a barracks in the military zone, or set Governor initiative On and your general builds it from the fund')), holdRow(id)] };
    }
    // fix list 1 (2026-11-21): food before the storehouse; gold mark on the nearest fish or forage spot (none in reach: no card).
    // Camp tier only, so a save already past the Village upgrade is not sent back
    const food = data.buildings?.food_camp && !has('food_camp') && (town.tier || 1) < 2 && foodSpotNear(town.x, town.z, data.workers?.range ?? 600);
    if (food) return { key: 'foodcamp', title: 'Build a food camp', step: S0 + MAIN_STEPS.indexOf('foodcamp'), steps, rows: [
      { ...row('town', 'Food camp', 0, 1, tool('Food camp', 'place it near the fish or forage at the gold mark: steady food, so the town keeps growing')), at: { x: food.x, z: food.z, place: 'world' } }, holdRow(id)] };
    if (data.buildings?.storehouse && !has('storehouse')) return { key: 'storehouse', title: 'Build a storehouse', step: S0 + MAIN_STEPS.indexOf('storehouse'), steps, rows: [pin(row('town', 'Storehouse', 0, 1,
      tool('Storehouse', 'click a spot by a road: it holds the stock you need for the upgrade'))), holdRow(id)] };
    const camps = [['lumber_camp', 'Lumber camp', 'near trees'], ['quarry', 'Quarry', 'near rocks']].filter(([t]) => data.buildings?.[t]);
    if (camps.some(([t]) => !has(t))) return { key: 'camps', title: 'Build a lumber camp and a quarry', step: S0 + MAIN_STEPS.indexOf('camps'), steps, rows: [
      ...camps.map(([t, name, near]) => pin(row('town', name, has(t) ? 1 : 0, 1, tool(name, `place it ${near}: steady ${t === 'quarry' ? 'stone' : 'timber'} without picking spots`)))), holdRow(id)] };
    // 2026-11-06: an infirmary (stockade has no goal, only its tooltip)
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
    // 2026-11-07: then set how many goods it keeps, in the Governor tab, so new players see how the market works
    const market = (town.buildings || []).some(b => b.type === 'market' && b.stage === 'built');
    if ((!market || !town.marketKeepSet) && data.buildings?.market) return { key: 'market', title: 'Open a Market', step: S0 + MAIN_STEPS.indexOf('market'), steps, rows: [
      pin(row('ryo', 'Market built', market ? 1 : 0, 1, panel + 'Build bar, pick Market (gold) and place it; once built it sells goods for ryo and Influence')),
      pin(row('business', 'Goods to keep set', town.marketKeepSet ? 1 : 0, 1, panel + 'open the Governor tab (gold) and type in the Market box (gold) how many goods the town keeps; every goods above that is sold for ryo')), holdRow(id)] };
    return null;
  }

  const PACK = () => G.war?.pack || { ryo: 1200, timber: 400, stone: 200 };
  const packDone = clan => Object.entries(PACK()).every(([r, n]) => (clan.warPack?.[r] || 0) >= n);
  // --- after the first town's setup (goals pass, 2026-11-18): Influence to the 2nd permit, then rail ---------
  function laterGoal(id, clan, towns, max, S0, steps) {
    const step = k => S0 + MAIN_STEPS.indexOf(k);
    const st = influence?.status(id);
    if (towns >= max && st?.next) return { key: `influence${st.tier}`, title: `Grow Influence: ${st.next.label}`, step: step('influence'), steps,
      rows: [row('influence', 'Influence', st.value, st.next.at, 'Hold businesses (every dawn) and sell town goods at a Market')] };
    const town = firstTown(id);
    if (!town) return null;
    const at = { x: town.x, z: town.z, place: 'world' }, pin = r => ({ ...r, at });
    const panel = 'Walk to your town and press O (or click its hall), then ';
    const station = (town.buildings || []).some(b => b.type === 'station' && b.stage === 'built');
    const links = Object.values(state.frontier?.rail?.links || {}).filter(l => l.owner === id), laying = links.find(l => !l.done);
    const laid = links.some(l => l.done);
    if (!station || !laid) return { key: 'rail', title: 'Build a railway', step: step('rail'), steps, rows: [
      pin(row('town', 'Railway station', station ? 1 : 0, 1, panel + 'Build bar (gold), pick Station (gold) and place it by a road (R turns it)')),
      pin(row('gate', 'Railway line', laid ? 1 : 0, 1, laying ? `Track is being laid, ${Math.floor(100 * laying.built / Math.max(1, laying.length))} percent: the town pays timber and stone a stretch at a time`
        : 'Walk to your station on the island and press Space, then Lay track to the capital'))] };
    const m = clan.milestones || {};
    if (!m.railOrder || !m.shipped) return { key: 'shipping', title: 'Ship by rail', step: step('shipping'), steps, rows: [
      pin(row('office', 'Rail order placed', m.railOrder ? 1 : 0, 1, panel + 'open the Shipments tab (gold), type an amount on a row and press Order')),
      pin(row('business', 'Shipment delivered', m.shipped ? 1 : 0, 1, 'A train brings it in: see it on the Shipments tab, or the rail ledger on the World map (M)'))] };
    if (!m.warDeclared && !rivalInReach(id)) return null;   // no rival town in reach yet (Z2)
    if (!m.warTalk) { const d = surveyorAt();
      return { key: 'registrar', title: 'News of rival towns', step: step('registrar'), steps, rows: [{ ...row('office', 'Talk at the Land Office', 0, 1,
        'Back in the capital, the old surveyor outside the Land Office (telegraph office, gold mark) has news of the rival towns: stand beside him and press Space'), at: d ? spot(d.x, d.z) : null }] }; }
    // Field guide (2026-11-25): before the first war, open the Field guide to learn what beats what (its button flashes)
    if (!m.fieldGuide && !m.warDeclared) return { key: 'fieldguide', title: 'Learn what beats what', step: step('fieldguide'), steps, rows: [
      pin(row('office', 'Field guide read', 0, 1, 'Open the Field guide (the gold book button beside Ryo, or Shift+G): how much damage troops, buildings, stone walls and ships take from each weapon'))] };
    // the 2nd town by war (goals pass): pack a war chest while the first town keeps coffers for its defence
    if (towns !== 1) return null;
    const coffers = row('ryo', 'Town coffers for defence', Math.floor(town.stock?.ryo || 0), G.war?.defendCoffers ?? 600,
      'Ryo in a town\'s coffers fills its defenders\' war chest when it is attacked: send ryo by rail (Shipments tab) or tax its people (Governor tab)');
    if (!m.packed) {
      const icon = { ryo: 'ryo', timber: 'town', stone: 'town' };
      return { key: 'warpack', title: 'Pack a war chest', step: step('warpack'), steps, rows: [
        ...Object.entries(PACK()).map(([r, n]) => pin(row(icon[r] || 'ryo', `${r[0].toUpperCase() + r.slice(1)} packed`, Math.floor(clan.warPack?.[r] || 0), n,
          'In your town press the War banner on your action bar (gold) and type what to carry: ryo comes from the Clan treasury or the town coffers, timber and stone from the town'))),
        pin(coffers)] };
    }
    if (!m.warDeclared) {
      const hints = (clan.rivalHints || []).map(h => spot(h.x, h.z, 'world'));
      const home = { x: town.x, z: town.z };
      const near = hints.sort((a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z))[0] || null;
      return { key: 'war', title: 'Declare war on a rival town', step: step('war'), steps, rows: [
        { ...row('gate', 'War declared', 0, 1, 'Ride to a rival town (the question marks on your map, M) with your pack, step inside its war circle and press the War banner to plant your camp'), at: near },
        pin(coffers)] };
    }
    return null;
  }

  // --- hidden places (world variety P3, 2026-11-27: goal cards that send you to find one) -----------------
  // Shown whenever the main chain has nothing for the clan (waiting for a rival in reach, after a war is declared) and no
  // war of its own is on: hear a rumour, then ride to it. One more each time, until every place is found.
  function exploreGoal(id, clan, S0, steps) {
    if (!hidden?.enabled || clan.bot) return null;
    if (Object.values(state.frontier?.wars?.list || {}).some(w => w.attacker === id || w.defender === id)) return null;   // wars first: nothing to wander off for
    const found = hidden.found(id), total = hidden.total;
    if (found >= total) return null;
    const h = heroOf(id), open = hidden.nearestOpen(id, h?.x ?? 0, h?.z ?? 0);
    const at = open ? { x: open.at.x, z: open.at.z, place: 'world' } : null;
    return { key: `explore${found}`, title: found ? `Find another hidden place (${found} of ${total} found)` : 'Find a hidden place', step: S0 + MAIN_STEPS.indexOf('explore'), steps, rows: [
      { ...row('crew', 'Rumour heard', open ? 1 : 0, 1, 'Ride past wandering folk out on the island (they glow on your minimap) or by your own townsfolk: they tell of hidden places and mark the area on your World map (M)'), at: null },
      { ...row('renown', 'Hidden place found', 0, 1, open ? (open.state === 'near' ? `${open.name} is close: ride to its mark on your minimap`
        : `Ride into the marked area, ${open.where}: the place flashes on your minimap when you are close`) : 'Hear a rumour first, or just ride: a hidden place flashes on your minimap when you come near'), at }] };
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
    if (towns && !clan.bot) return townSetupGoal(id, S0, steps) || laterGoal(id, clan, towns, max, S0, steps) || exploreGoal(id, clan, S0, steps);
    if (towns < max) {
      if (!clan.permit) {
        const rows = permitRows(id, clan);
        const ready = rows.every(r => r.done);
        rows.push(row('office', 'Permit bought', 0, 1, ready ? 'Go to the telegraph office (East Ward, past Police HQ, gold marker) and press Space, then 1'
          : 'Then buy it at the telegraph office (East Ward, past Police HQ)'));
        return { key: `permit${towns}`, title: `Buy a ${nth}founding permit`, step: S0 + MAIN_STEPS.indexOf('permit'), steps, rows };
      }
      // settlers first, then the surveyor (2026-11-20)
      // settlers waiting safely at the HQ (a count) plus any already walking with the hero
      const need = D.minSettlers ?? 5, have = clans.settlersOf(id).length + (clan.settlersWaiting || 0);
      if (have < need)
        return { key: `settlers${towns}`, title: 'Hire settlers', step: S0 + MAIN_STEPS.indexOf('settlers'), steps,
          rows: [{ ...row('settler', 'Settlers', have, need, `Hire them at the telegraph office (gold marker): Space, then 2 hires all ${need - have}. They wait safely at your HQ`), at: ringOf(byKind('land_office')) }] };
      // the old surveyor's report on this permit (2026-11-10: he had no card and was easy to miss)
      // Z7: a player with no castle yet chooses his home with him first
      if (!clan.bot && clan.permit && landOffice?.needsHome?.(id)) { const d = surveyorAt();
        return { key: `home${towns}`, title: 'Choose your home', step: S0 + MAIN_STEPS.indexOf('surveyor'), steps,
          rows: [{ ...row('office', 'Castle site chosen', 0, 1, 'The old surveyor outside the telegraph office (gold mark) shows you the five castle sites: stand beside him and press Space (or click him), then pick one on his map'), at: d ? spot(d.x, d.z) : null }] }; }
      if (!clan.bot && clan.surveyPending) { const d = surveyorAt();
        return { key: `surveyor${towns}`, title: 'Talk to the old surveyor', step: S0 + MAIN_STEPS.indexOf('surveyor'), steps,
          rows: [{ ...row('office', 'Surveyor report', 0, 1, 'He stands outside the telegraph office with a gold mark over his head: stand beside him and press Space (or click him), then Show me on the map'), at: d ? spot(d.x, d.z) : null }] }; }
      const out = heroOf(id)?.place === 'world', cost = D.cost ?? 0;
      // the first town only (2026-11-06): meet the lieutenant at the gate, then give him his orders
      const m = clan.milestones || {};
      if (!out && towns === 0 && !clan.bot && !m.metLieutenant)
        return { key: 'lieutenant', title: 'Meet your lieutenant', step: S0 + MAIN_STEPS.indexOf('lieutenant'), steps,
          rows: [row('crew', 'Talk to your lieutenant', 0, 1, 'He waits on the road between the island gate (G on the minimap, east trail) and the railway station: stand beside him and press Space, or click him')] };
      if (!out && towns === 0 && !clan.bot && !m.budgetSet)
        return { key: 'orders', title: 'Give him his orders', step: S0 + MAIN_STEPS.indexOf('orders'), steps,
          rows: [row('office', 'Open While I’m away', m.ordersOpened ? 1 : 0, 1, 'Click Deployment (gold) in the icon menu, then the While I’m away tab (gold)'),
            row('ryo', 'Set his budget', 0, 1, 'Type what he may spend each day in the Budget box (gold) and press Set: 800 a day is a good start. Every order starts on')] };
      // Z7: with a castle, out by the ship from the harbour pier to the castle dock (the settlers at the HQ board with you)
      const pier = !out && hasCastle(id) && harbourAt();
      if (pier)
        return { key: `sail${towns}`, title: 'Sail to your castle', step: S0 + MAIN_STEPS.indexOf('leave'), steps,
          rows: [row('settler', 'Settlers ready', have, need, ''),
            { ...row('gate', 'Ship from the harbour', 0, 1, 'Your settlers wait at your HQ and board with you: go to the harbour pier (gold marker) and press Space'), at: spot(pier.x, pier.z) }] };
      if (!out)
        return { key: `leave${towns}`, title: 'Leave the city', step: S0 + MAIN_STEPS.indexOf('leave'), steps, gate: true,
          rows: [row('settler', 'Settlers ready', have, need, ''),
            row('gate', 'Out through the island gate', 0, 1, 'Your settlers wait at your HQ and join you outside the gate: go to the island gate (gold marker, east trail) and press Space')] };
      // landed at your castle (2026-11-20): mount up first at the horses and omnibuses outside its gate
      const cm = !clan.bot && towns === 0 && hasCastle(id) && clan.castleMounts;
      if (cm && !cm.rode)
        return { key: 'mount', title: 'Mount up', step: S0 + MAIN_STEPS.indexOf('mount'), steps,
          rows: [{ ...row('crew', 'Ride your horse', 0, 1, 'Your horse, 2 crew horses and 2 omnibuses wait by the dock (gold on the minimap): right-click your horse to ride. Crew and settlers: select them, then right-click a horse or an omnibus'), at: spot(cm.x, cm.z, 'world') }] };
      // then out through the castle's land gate (2026-11-20)
      const gateOut = cm && !cm.out && castleApproach(id);
      if (gateOut)
        return { key: 'castleOut', title: 'Ride out of your castle', step: S0 + MAIN_STEPS.indexOf('castleOut'), steps,
          rows: [{ ...row('gate', 'Through the land gate', 0, 1, 'Ride through your castle to its land gate (gold on the minimap) and out onto the open ground; your settlers follow you'), at: spot(gateOut.x, gateOut.z, 'world') }] };
      const rows = [row('settler', 'Settlers', have, need, '')];
      if (cost) rows.push(row('ryo', 'Ryo', Math.floor(clan.ryo || 0), cost, 'Collect business payouts at dawn'));
      // finding a spot (2026-11-20): the surveyor's picks marked on the World map, any open ground will do
      const site = siteGoal(id, clan);
      if (site) rows.push(site.row);
      rows.push(row('town', 'Town founded', 0, 1, 'With the settlers beside you, click the Found a town button, then click where the town hall goes'));
      return { key: `found${towns}`, title: `Found your ${nth}town`, step: S0 + MAIN_STEPS.indexOf('found'), steps, rows, ...(site?.sites.length ? { sites: site.sites } : {}) };
    }
    const st = influence?.status(id);
    if (st?.next) return { key: `influence${st.tier}`, title: `Grow Influence: ${st.next.label}`, step: S0 + MAIN_STEPS.indexOf('influence'), steps,
      rows: [row('influence', 'Influence', st.value, st.next.at, 'Hold businesses (every dawn) and sell town goods at a Market')] };
    return null;
  }
  return { current, record, rivalInReach, explore: id => state.clans?.[id] ? exploreGoal(id, state.clans[id], 0, MAIN_STEPS.length) : null };   // explore: for tests
}
