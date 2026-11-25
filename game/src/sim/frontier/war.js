// War (frontier plan F6, checkpoint 1): war records, the war circle, and planting the war camp
// banner, which IS the declaration of war (Tim 2026-11-10: one step, no separate Declare click).
// Rules only: no DOM, no randomness. All numbers live in data/frontier.json "war".
// State: state.frontier.wars = { list: { [id]: war }, cooldown: { [townId]: untilTick }, history: [] }
//   war = { id, town, attacker, defender, x, z, started, state: 'active' }   (x, z = the banner)
// Players and bots use the same command: { id: <hero id>, type: 'frontier', action: 'plantBanner', town, x, z }.
// Checkpoint 2: the war pack. Before setting out the hero packs ryo, timber and stone from the pot he
// stands in ({ action: 'warPack', ryo, timber, stone } sets the totals): in the city only ryo, from the
// Clan treasury (timber and stone must first reach a town, by rail from the capital if need be); inside
// one of the clan's own town rings everything comes from that town. Kept on the clan (clan.warPack) with
// where each part came from, so lowering it or unpacking ('warUnpack') puts it back exactly there.
// The pack is optional (the camp can start with nothing and gather); when there is one it becomes the camp:
// war.camp = { x, z, chest, stock: { timber, stone }, brought, workers, buildings }. The camp is sealed
// from the town economy: nothing in it ever flows back to a town.
// One war per town at a time; a clan may run several wars. When a war ends the town is under
// cooldown for war.cooldownDays game days before anyone can plant a banner on it again.
import { addCampStock } from './camp_stock.js';
import { modeRules } from '../modes/index.js';
import { buildable, passable } from '../world_data.js';
import { ringRadius } from './town_grid.js';
import { coversResources } from './resource_clearance.js';
import { debitRyo, creditRyo } from '../treasury.js';
import { createWarDefense } from './war_defense.js';
import { createWarArmory } from './war_armory.js';
import { castleBox } from './castle.js';
import { tierMax } from './town_military.js';
import { slipSpotWhy, circleShore } from './shipyard.js';

export function createWar({ state, data, world = null, worldData = null, resourceIndex = null, dayTicks = 12000, zones = null }) {
  const W = data.war || null;
  const f = () => state.frontier;
  // old saves have no war records: add the empty shape on first use
  function store() {
    const fr = f();
    if (!fr.wars) fr.wars = { list: {}, cooldown: {}, history: [] };
    return fr.wars;
  }
  // read-only helpers never create records (the screen's copy of the state is a snapshot)
  const active = () => Object.values(f()?.wars?.list || {});
  const warOn = townId => active().find(w => w.town === townId) || null;
  const byId = id => f()?.wars?.list?.[id] || null;   // a war by its own id (camp workers carry the war id as their town)
  const warsOf = clan => active().filter(w => w.attacker === clan || w.defender === clan);
  const town = id => f().settlements[id] || null;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // Z6 (2026-11-20): a castle can be besieged. Its banner band and ring are measured from its outer edge (the
  // blueprint's box), not from the keep deep inside it. Other capitals (the city end) are never war targets.
  const isCastle = s => !!s?.castle && !!data.castleBlueprint;
  const target = s => !!s && (!s.capital || isCastle(s));
  const boxOf = s => castleBox(data.castleBlueprint, s.x, s.z, s.castle.rot || 0, s.grid?.cell || data.townGrid?.cellSize || 11);
  function boxDist(s, p) {
    const b = boxOf(s);
    return Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(b.minZ - p.z, 0, p.z - b.maxZ));
  }
  // how far p is from what the band is measured from: the hall of a town, the outer edge of a castle
  const reachOf = (t, p) => isCastle(t) ? boxDist(t, p) : dist(t, p);
  // inside a settlement's ring (pad = the size of what stands at p)
  const inRingOf = (s, p, pad = 0) => isCastle(s) ? boxDist(s, p) - pad <= 0 : dist(p, s) - pad <= ringRadius(s, data);
  // points r out from what the band is measured from (a circle round a hall, a rounded box round a castle)
  function* around(t, r) {
    if (!isCastle(t)) { for (let a = 0; a < 32; a++) yield { x: t.x + Math.cos(a * Math.PI / 16) * r, z: t.z + Math.sin(a * Math.PI / 16) * r }; return; }
    const b = boxOf(t), step = 25;
    for (let x = b.minX; x <= b.maxX; x += step) { yield { x, z: b.minZ - r }; yield { x, z: b.maxZ + r }; }
    for (let z = b.minZ; z <= b.maxZ; z += step) { yield { x: b.minX - r, z }; yield { x: b.maxX + r, z }; }
    for (const [cx, cz, a0] of [[b.maxX, b.maxZ, 0], [b.minX, b.maxZ, 1], [b.minX, b.minZ, 2], [b.maxX, b.minZ, 3]])
      for (let k = 1; k < 4; k++) { const a = (a0 + k / 4) * Math.PI / 2; yield { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; }
  }

  // Active wars whose circle (radius war.circleRadius round the target's town hall) holds the point
  function warsAt(x, z) {
    if (!W) return [];
    return active().filter(w => { const t = town(w.town); return t && Math.hypot(x - t.x, z - t.z) <= W.circleRadius; });
  }
  // Whole game days of cooldown left on a town (0 = none)
  function cooldownDays(townId) {
    const until = f()?.wars?.cooldown?.[townId];
    if (!until || until <= (state.tick ?? 0)) return 0;
    return Math.ceil((until - (state.tick ?? 0)) / dayTicks);
  }

  const half = () => (data.townGrid?.cellSize || 10) / 2;
  function groundOk(x, z) {
    if (!worldData) return true;   // tests without an island: open ground
    const h = half();
    for (const dx of [-h, 0, h]) for (const dz of [-h, 0, h]) if (!buildable(worldData, x + dx, z + dz) || !passable(worldData, x + dx, z + dz)) return false;
    return true;
  }
  // Banner band for a town: [inner, outer] distance from the hall. Normally the build ring +
  // band.inner to + band.outer; when no ground in it can be built on, the outer edge widens in
  // band.widenStep steps as far as the war circle.
  function band(t) {
    const ring = isCastle(t) ? 0 : ringRadius(t, data), inner = ring + W.band.inner;   // a castle's band: from its outer edge
    let outer = ring + W.band.outer;
    if (!worldData) return [inner, outer];
    const any = (r0, r1) => { for (let r = r0; r <= r1; r += 25) for (const p of around(t, r)) if (groundOk(p.x, p.z)) return true; return false; };
    const step = Math.max(10, W.band.widenStep || 50);
    while (!any(inner, outer) && outer < W.circleRadius) outer = Math.min(W.circleRadius, outer + step);
    return [inner, outer];
  }

  // the line r out from what t's band is measured from, as world points for the screen: a circle round a town hall,
  // a rounded box round a castle
  function bandOutline(t, r) {
    if (!isCastle(t)) return Array.from({ length: 73 }, (_, i) => ({ x: t.x + Math.cos(i / 72 * Math.PI * 2) * r, z: t.z + Math.sin(i / 72 * Math.PI * 2) * r }));
    const b = boxOf(t), pts = [];
    for (const [cx, cz, a0] of [[b.maxX, b.maxZ, 0], [b.minX, b.maxZ, 1], [b.minX, b.minZ, 2], [b.maxX, b.minZ, 3]])
      for (let k = 0; k <= 8; k++) { const a = (a0 + k / 8) * Math.PI / 2; pts.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }); }
    pts.push(pts[0]);
    return pts;
  }
  // Why a banner cannot be planted, or null when it can.
  function whyNot(hero, t, point) {
    if (!W) return 'War is not available';
    if (!modeRules(state).founding) return 'Wars are fought in a campaign';
    if (!hero || hero.type !== 'hero') return 'Only a hero can plant a war banner';
    if (hero.dead || hero.downed || hero.place !== 'world') return 'Plant the banner out on the island';
    if (!t) return 'No such town';
    if (!target(t)) return 'A capital cannot be attacked';
    if (!Number.isFinite(t.x)) return 'No such town';
    if (t.owner == null) return 'Nobody holds this town';
    if (t.owner === hero.owner) return 'This is your own town';
    if (warOn(t.id)) return `${t.name} is already at war`;
    const days = cooldownDays(t.id);
    if (days) return `${t.name} is under truce for ${days} more ${days === 1 ? 'day' : 'days'}`;
    if (isCastle(t)) {   // the siege gate (Z6): 4 of 6 zones, one of them the castle's own or next to it; never lifts once a siege is on
      const g = zones?.siege?.(hero.owner, zones.zoneOfTown(t));
      if (!g) return 'A castle cannot be attacked here';
      if (!g.ok) return g.held < g.need ? `Hold ${g.need} of 6 zones to besiege a castle (you hold ${g.held})` : `Hold a zone next to ${t.name} to besiege it`;
    }
    if (dist(hero, t) > W.circleRadius) return `Come within ${W.circleRadius} of ${t.name}'s ${isCastle(t) ? 'keep' : 'town hall'}`;
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) return 'Choose a spot for the banner';
    if (dist(point, hero) > W.placeRange) return 'The banner is too far from the hero';
    const spot = spotWhy(t, point);
    if (spot) return spot;
    const pack = state.clans?.[hero.owner]?.warPack, P = W.pack;   // optional; a min above 0 in data makes it required
    if ((P?.min?.timber || P?.min?.stone) && ((pack?.timber || 0) < (P.min.timber || 0) || (pack?.stone || 0) < (P.min.stone || 0)))
      return `Pack for war first (at least ${P.min.timber || 0} timber and ${P.min.stone || 0} stone)`;
    return null;
  }
  // the ground rules for a banner spot by town t (band, other rings, other camps, ground, resources), or null
  function spotWhy(t, point) {
    const [inner, outer] = band(t), d = reachOf(t, point), from = isCastle(t) ? 'walls' : 'town hall';
    if (d < inner) return `Too close to ${t.name}: plant the banner ${Math.round(inner)} to ${Math.round(outer)} from its ${from}`;
    if (d > outer) return `Too far from ${t.name}: plant the banner ${Math.round(inner)} to ${Math.round(outer)} from its ${from}`;
    if (dist(point, t) > W.circleRadius) return `Stay inside ${t.name}'s war circle`;
    for (const s of Object.values(f().settlements)) {
      if (s === t || !target(s) || !Number.isFinite(s.x)) continue;
      if (inRingOf(s, point)) return isCastle(s) ? `Inside ${s.name}` : `Inside ${s.name}'s town ring`;
    }
    for (const w of active()) if (dist(point, w) < (W.campSpacing || 0)) return 'Too close to another war camp';
    if (!groundOk(point.x, point.z)) return 'This ground cannot be built on';
    if (resourceIndex && coversResources({ x: point.x, z: point.z, grid: { n: 1, cell: data.townGrid.cellSize } }, [0], resourceIndex, 1)) return 'The banner would cover a resource area';
    return null;
  }

  // Read-only check for the UI, bots and tests: { ok, reason, band: [inner, outer], point }
  function check(hero, townId, point = null) {
    const t = town(townId), p = point ? { x: Math.round(point.x), z: Math.round(point.z) } : null;
    const reason = whyNot(hero, t, p);
    return { ok: !reason, reason, band: W && t && Number.isFinite(t.x) ? band(t) : null, point: p };
  }

  // Plant the banner: the war starts now.
  function plant(hero, townId, point) {
    const r = check(hero, townId, point);
    if (!r.ok) return r;
    const clan = state.clans?.[hero.owner], war = start(hero.owner, town(townId), r.point, clan?.warPack || { ryo: 0, timber: 0, stone: 0 });
    if (clan) delete clan.warPack;
    return { ok: true, id: war.id, war };
  }
  // A new war record with its starting camp (the pack becomes the camp: sealed, camp stores never go back to a town)
  function start(attacker, t, point, pack) {
    const fr = f(), id = `war${fr.nextId++}`;
    const war = { id, town: t.id, attacker, defender: t.owner, x: point.x, z: point.z, started: state.tick ?? 0, state: 'active' };
    const brought = { ryo: pack.ryo || 0, timber: pack.timber || 0, stone: pack.stone || 0 };
    war.camp = { x: war.x, z: war.z, chest: brought.ryo, stock: { timber: brought.timber, stone: brought.stone }, brought,
      workers: Array.from({ length: W.camp?.startWorkers ?? 0 }, () => ({ id: world?.newId ? world.newId('w') : `w${fr.nextId++}`, spot: null, dropoff: null, phase: 0, carrying: 0, entity: null, elapsed: 0, trip: null })), workerTraining: [], buildings: [{ id: `${id}:hall`, type: 'camp_hall', stage: 'built', x: war.x, z: war.z }] };
    store().list[id] = war;
    const who = state.clans?.[attacker]?.name || attacker;
    if (state.clans?.[t.owner]) state.clans[t.owner].notice = { tick: state.tick, text: `${who} has declared war on ${t.name}!` };
    return war;
  }
  // Dev build only: start a war at once, the player's clan attacking a rival town (side 'attack') or a rival clan
  // attacking one of the player's towns (side 'defend'). The banner goes on the first good spot in the band; the
  // camp gets war.dev.camp as its pack (or the attacker's own pack).
  function devStart(e, c) {
    const t = town(c.town);
    if (!t || !target(t) || !Number.isFinite(t.x) || t.owner == null) return { ok: false, reason: 'No such town' };
    if (warOn(t.id)) return { ok: false, reason: `${t.name} is already at war` };
    let attacker = e.owner;
    if (c.side === 'defend') {
      if (t.owner !== e.owner) return { ok: false, reason: 'Defend one of your own towns' };
      attacker = state.clans?.[c.attacker] && c.attacker !== e.owner ? c.attacker : Object.keys(state.clans || {}).find(id => id !== e.owner && state.clans[id].bot);
      if (!attacker) return { ok: false, reason: 'No rival clan to attack you' };
    } else if (t.owner === e.owner) return { ok: false, reason: 'This is your own town' };
    const [inner, outer] = band(t);
    let point = null;
    for (let r = Math.ceil((inner + outer) / 2); !point && r <= outer; r += 25) for (const q of around(t, r)) {
      const p = { x: Math.round(q.x), z: Math.round(q.z) };
      if (!spotWhy(t, p)) { point = p; break; }
    }
    if (!point) return { ok: false, reason: 'No ground for a banner round that town' };
    const clan = state.clans?.[attacker], pack = clan?.warPack || W.dev?.camp || { ryo: 0, timber: 0, stone: 0 };
    const war = start(attacker, t, point, pack);
    if (clan?.warPack) delete clan.warPack;
    return { ok: true, id: war.id, war };
  }

  // End a war: result 'attackerWon' | 'defenderWon' | 'called off' etc. (later checkpoints decide it).
  // The record moves to the history and the town's cooldown starts.
  function end(warId, result = 'ended', days = null) {
    const st = store(), war = st.list[warId];
    if (!war) return false;
    defense?.settle(war);   // 8b-2: the defender's chest and queued ryo go back to the town coffers
    delete st.list[warId];
    Object.assign(war, { state: 'ended', result, ended: state.tick ?? 0 });
    // the history keeps only a head count of the camp workers (their units leave with the war; routes would bloat saves)
    if (Array.isArray(war.camp?.workers)) { war.camp.workers = war.camp.workers.length; delete war.camp.workerTraining; }
    st.history.push(war);
    const max = W?.historyMax ?? 20;
    if (st.history.length > max) st.history.splice(0, st.history.length - max);
    st.cooldown[war.town] = (state.tick ?? 0) + Math.round((days ?? W?.cooldownDays ?? 0) * dayTicks);   // days: 8c, after accepted terms
    return true;
  }

  // A town that changes hands or is wiped ends its war records cleanly (later checkpoints call this too).
  function econTick() {
    const st = store(), now = state.tick ?? 0;
    for (const [id, until] of Object.entries(st.cooldown)) if (until <= now) delete st.cooldown[id];
    for (const w of active()) if (!town(w.town)) end(w.id, 'town gone');
  }

  // ---- the war pack ----------------------------------------------------------------------
  const RES = ['ryo', 'timber', 'stone'];
  // The pot the hero stands in: the city (Clan treasury), or one of his clan's towns (its ring), else null
  function potAt(hero) {
    if (!hero || hero.dead || hero.downed) return null;
    if (hero.place && hero.place !== 'world') return { kind: 'city', id: 'treasury', name: 'Clan treasury' };
    for (const s of Object.values(f().settlements)) {
      if (s.capital || s.owner !== hero.owner || !Number.isFinite(s.x)) continue;
      if (dist(hero, s) <= ringRadius(s, data)) return { kind: 'town', id: s.id, name: s.name, town: s };
    }
    return null;
  }
  // What the pot has of each resource
  function potHas(pot, clan, r) {
    if (pot.kind === 'town') return pot.town.stock?.[r] ?? 0;
    return r === 'ryo' ? clan.ryo ?? 0 : 0;   // the city has no timber or stone to pack
  }
  // Read-only: { ok, reason, pot, limits } for the Pack for war window
  function packView(hero) {
    const clan = state.clans?.[hero?.owner], pot = potAt(hero), P = W?.pack || {};
    const pack = clan?.warPack || { ryo: 0, timber: 0, stone: 0 };
    const limits = Object.fromEntries(RES.map(r => [r, { min: P.min?.[r] ?? 0, max: P.max?.[r] ?? Infinity, has: pot && clan ? potHas(pot, clan, r) : 0 }]));
    const reason = !W ? 'War is not available' : !modeRules(state).founding ? 'Wars are fought in a campaign'
      : !hero || hero.type !== 'hero' ? 'Only a hero packs for war' : !pot ? 'Pack in the city or in one of your towns' : '';
    return { ok: !reason, reason, pot: pot && { kind: pot.kind, id: pot.id, name: pot.name }, pack, limits };
  }
  function take(clan, pot, r, n) {   // n > 0 out of the pot into the pack
    if (pot.kind === 'town') { world.change(pot.id, r, -n, 'war pack'); return { from: pot.id, res: r, amount: n }; }
    debitRyo(state, clan, n, 'War pack');
    world.syncCapital?.();
    return { from: 'treasury', res: r, amount: n };
  }
  function giveBack(clan, src, n) {   // n of one source back where it came from
    if (src.from === 'treasury') { creditRyo(state, clan, n, 'War pack returned'); world.syncCapital?.(); }
    else if (f().settlements[src.from]) world.change(src.from, src.res, n, 'war pack returned');
    // a town lost since packing: that part is simply gone
  }
  // Set the pack to the given totals. Raising takes from the pot the hero stands in; lowering returns
  // the newest parts first, each to where it came from (anywhere: no need to stand in that pot).
  function setPack(hero, want) {
    const v = packView(hero), clan = state.clans?.[hero?.owner];
    if (!clan) return { ok: false, reason: 'no clan' };
    const pack = clan.warPack || { ryo: 0, timber: 0, stone: 0, sources: [] };
    const goal = {};
    for (const r of RES) {
      const n = want?.[r] === undefined ? pack[r] || 0 : Number(want[r]);
      if (!Number.isFinite(n) || n < 0) return { ok: false, reason: `${r} must be 0 or more` };
      goal[r] = Math.floor(n);
      const L = v.limits[r];
      if (goal[r] > L.max) return { ok: false, reason: `Carry at most ${L.max} ${r}` };
      if (goal[r] > 0 && goal[r] < L.min) return { ok: false, reason: `Carry at least ${L.min} ${r}, or none` };
    }
    const raise = RES.filter(r => goal[r] > (pack[r] || 0));
    if (raise.length && !v.ok) return { ok: false, reason: v.reason };
    if (raise.length) {   // check the whole bill first, so a refusal changes nothing
      const extra = Object.fromEntries(raise.map(r => [r, goal[r] - (pack[r] || 0)]));
      if (v.pot.kind === 'city') {
        if (raise.some(r => r !== 'ryo')) return { ok: false, reason: 'Timber and stone are packed at one of your towns' };
        if (extra.ryo > (clan.ryo ?? 0)) return { ok: false, reason: `The Clan treasury has only ${Math.floor(clan.ryo ?? 0)} ryo` };
      } else for (const r of raise) if (extra[r] > (v.pot && f().settlements[v.pot.id]?.stock?.[r] || 0)) return { ok: false, reason: `${v.pot.name} has only ${Math.floor(f().settlements[v.pot.id]?.stock?.[r] || 0)} ${r}` };
    }
    const pot = potAt(hero);
    for (const r of RES) {
      let d = goal[r] - (pack[r] || 0);
      if (d > 0) pack.sources.push(take(clan, pot, r, d));
      while (d < 0) {
        const i = pack.sources.findLastIndex(x => x.res === r);
        if (i < 0) break;
        const src = pack.sources[i], n = Math.min(src.amount, -d);
        giveBack(clan, src, n); src.amount -= n; d += n;
        if (src.amount <= 0) pack.sources.splice(i, 1);
      }
      pack[r] = goal[r];
    }
    if (RES.every(r => !pack[r])) delete clan.warPack; else clan.warPack = pack;
    return { ok: true };
  }

  // ---- camp buildings (checkpoint 4) ------------------------------------------------------
  // Camp buildings are placed in a chain round the camp hall: each within war.chainDistance of another camp
  // building, inside the war circle, never inside a town ring. Paid in timber and stone from the camp stock at
  // once; camp workers then walk over and build the site (sim/frontier/workers.js campBuild).
  // building = { id, type, stage: 'site' | 'built', x, z, progress, need }; the camp hall upgrade is
  // hall.upgrade = { progress, need } until done, then hall.tier = 2.
  const BD = () => W?.buildings || {};
  const isResourceCamp = type => (data.workers?.gatherBuildings || []).includes(type);
  const radiusOf = type => BD()[type]?.radius ?? 8;
  const hallOf = camp => camp?.buildings?.find(b => b.type === 'camp_hall') || null;
  const upgraded = camp => (hallOf(camp)?.tier || 1) >= 2;
  const campMax = (camp, type) => tierMax(BD()[type], 'camp', hallOf(camp)?.tier || 1);
  const builtCount = (camp, type) => camp.buildings.filter(b => b.type === type && b.stage === 'built').length;
  const nice = t => (t || '').replace(/_/g, ' ');
  // what a building type still needs before it can be placed: [] when nothing
  function missing(camp, type) {
    const out = [];
    for (const n of BD()[type]?.campNeeds ?? BD()[type]?.needs ?? []) {   // ships S5: campNeeds, what a camp needs when it differs from a town (the cannon tower: nothing)
      if (n === 'upgrade' || n === 'tier2') { if (!upgraded(camp)) out.push('the camp hall upgrade'); }   // tier2: a camp has no tiers, the hall upgrade stands in (Tim 2026-11-15)
      else if (!builtCount(camp, n)) out.push(`a built ${nice(n)}`);
    }
    return out;
  }
  const costText = cost => Object.entries(cost || {}).filter(([, v]) => v).map(([r, v]) => `${v} ${r}`).join(', ');
  function canPay(camp, cost) {
    for (const [r, v] of Object.entries(cost || {})) {
      const has = r === 'ryo' ? camp.chest || 0 : camp.stock?.[r] || 0;
      if (has < v) return `Needs ${costText(cost)} (the camp has ${Math.floor(has)} ${r === 'ryo' ? 'ryo in the war chest' : r})`;
    }
    return null;
  }
  function pay(camp, cost, sign = -1) {
    for (const [r, v] of Object.entries(cost || {})) {
      if (r === 'ryo') camp.chest = Math.round(((camp.chest || 0) + sign * v) * 100) / 100;
      else addCampStock(camp, r, sign * v);
    }
  }
  // Why a camp building cannot go at x, z, or null
  function placeWhy(war, type, x, z, opts = {}) {
    const def = BD()[type], camp = war?.camp;
    if (!war || !camp) return 'No such war camp';
    if (!def || type === 'camp_hall' || !def.cost || def.where === 'town') return 'Not a camp building';   // ships S3: where town = a town building only (the shipyard)
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 'Choose a spot';
    const need = missing(camp, type);
    if (need.length) return `Needs ${need.join(' and ')}`;
    const max = campMax(camp, type);   // Tim 2026-11-21: supply tents unlock with the camp hall upgrade
    if (max && camp.buildings.filter(b => b.type === type && b.stage !== 'ruined').length + (opts.more || 0) >= max)   // Tim 2026-11-17: a ruin is only a look until erased; it takes no building slot
    return max < (BD()[type]?.max ?? Infinity) ? `A camp has at most ${max} ${nice(type)} before the camp hall upgrade` : `A camp has at most ${max} ${nice(type)}`;
    const t = town(war.town), r = radiusOf(type), p = { x, z };
    if (!t) return 'No such town';
    if (dist(p, t) + r > W.circleRadius) return 'Stay inside the war circle';
    for (const s of Object.values(f().settlements)) {
      if (!target(s) || !Number.isFinite(s.x)) continue;
      if (inRingOf(s, p, r)) return isCastle(s) ? `Inside ${s.name}` : `Inside ${s.name}'s town ring`;
    }
    // 7c-4 (Tim 2026-11-12): the build area is the ground within chainDistance of a normal camp building. A resource
    // camp (lumber camp, quarry) may also stand outside it, by its resource (within resourceCampReach of a spot it
    // takes); resource camps never extend the area.
    const chain = W.chainDistance ?? 120;
    // ships S3: an unchained building (the slipway) stands anywhere in the circle and does not widen the area either
    if (!opts.chained && !def.unchained && !camp.buildings.some(b => !isResourceCamp(b.type) && !BD()[b.type]?.unchained && dist(b, p) <= chain)) {
      if (!isResourceCamp(type)) return 'Outside the build area: place it nearer a camp building (resource camps do not extend the area)';
      const takes = data.workers?.campTakes?.[type] || [], reach = W.resourceCampReach ?? 45;
      const by = resourceIndex?.spotsNear ? resourceIndex.spotsNear(x, z, reach).some(sp => takes.includes(data.workers?.resources?.[sp.kind]) && Math.hypot(sp.x - x, sp.z - z) <= reach) : false;
      if (!by) return `Outside the build area a ${nice(type)} must stand by ${takes.join(' or ') || 'its resource'}`;
    }
    for (const w of active()) for (const b of w.camp?.buildings || []) {
      if (opts.replace === b || (Array.isArray(opts.replace) && opts.replace.includes(b))) continue;   // a gate takes the place of these palisade pieces
      // palisade and gate pieces stand end to end and meet at corners (centres 0.7 of a piece apart there), so only a real overlap is refused
      const gap = def.line && BD()[b.type]?.line && w === war ? (opts.step ?? Math.min(r, radiusOf(b.type))) * 0.6 : r + radiusOf(b.type);
      if (dist(b, p) < gap) return w === war ? b.stage === 'ruined' ? 'Erase the ruin first' : `Too close to the ${nice(b.type)}` : 'Too close to another war camp';
    }
    if (def.shore) { const why = slipSpotWhy(worldData, x, z, def); if (why) return why; }   // ships S3: on the shore, beside water big ships sail
    const k = def.shore ? 0 : r * 0.7;   // a shore building may lean out over the water's edge: only its middle must be buildable
    for (const [dx, dz] of [[0, 0], [k, 0], [-k, 0], [0, k], [0, -k]]) if (!groundOk(x + dx, z + dz)) return 'This ground cannot be built on';
    if (resourceIndex && coversResources({ x, z, grid: { n: 1, cell: r * 2 } }, [0], resourceIndex, 1)) return 'It would cover a resource area';
    return opts.free ? null : canPay(camp, def.cost);
  }
  // ---- palisade and gate (checkpoint 6-6) ------------------------------------------------------------------
  // A palisade is placed as a line: pieces every buildings.palisade.length from a to b, each a camp building
  // { type: 'palisade', rot: the line's angle } built by the camp workers like any site. Paid at once for the whole
  // run. A gate is one piece: placed on a palisade piece it takes its place and its angle; elsewhere it stands alone.
  // Read-only: { ok, reason, points: [{ x, z }], rot, cost }
  // ---- joints (Tim 2026-11-15): every palisade or gate piece has two ends; a new run or gate locks onto an end near the
  // cursor, so runs meet end to end and close at corners without hunting for the spot
  const lenOf = type => BD()[type]?.length || 5;
  const alongX = b => Math.abs(Math.cos(b.rot || 0)) >= Math.abs(Math.sin(b.rot || 0));
  const linePieces = camp => (camp?.buildings || []).filter(b => BD()[b.type]?.line && Number.isFinite(b.x));
  function jointsOf(camp) {
    const out = [];
    for (const b of linePieces(camp)) { const h = lenOf(b.type) / 2, x = alongX(b); out.push({ x: b.x - (x ? h : 0), z: b.z - (x ? 0 : h), b, alongX: x, out: -1 }, { x: b.x + (x ? h : 0), z: b.z + (x ? 0 : h), b, alongX: x, out: 1 }); }
    return out;
  }
  const r2 = v => Math.round(v * 100) / 100;
  function campLineCheck(warId, a, b) {
    const war = byId(warId), def = BD().palisade, camp = war?.camp;
    if (!camp || !def?.line) return { ok: false, reason: 'No such war camp', points: [] };
    if (war.terms) return { ok: false, reason: 'A ceasefire is on: nobody builds while terms are on the table', points: [] };   // Tim 2026-11-18
    if (![a?.x, a?.z, b?.x, b?.z].every(Number.isFinite)) return { ok: false, reason: 'Choose a start and an end', points: [] };
    const L = def.length || 5, snap = W.lineSnap ?? 4, joints = jointsOf(camp), locks = {};
    // the start locks onto the nearest piece end within reach
    { let best = null, bd = snap; for (const j of joints) { const d = Math.hypot(j.x - a.x, j.z - a.z); if (d <= bd) { bd = d; best = j; } } if (best) { a = { x: best.x, z: best.z }; locks.start = { x: r2(best.x), z: r2(best.z) }; } }
    // Tim 2026-11-15: a run follows world x or world z (the two diagonals the palisade and gate art is drawn for);
    // a drag at any other angle snaps to the nearer one, so the pieces never stair-step
    const onX = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z), sign = (onX ? b.x - a.x : b.z - a.z) < 0 ? -1 : 1;
    const dx = onX ? sign : 0, dz = onX ? 0 : sign, rot = Math.round(Math.atan2(dz, dx) * 1000) / 1000;
    // where the run starts: at the joint when locked, else half a piece before the clicked spot (the first piece stands on it)
    const s0 = locks.start ? a : { x: a.x - dx * L / 2, z: a.z - dz * L / 2 };
    let len = Math.abs(onX ? b.x - s0.x : b.z - s0.z), n = Math.max(1, Math.round(len / L)), step = L;
    // the end locks too: onto a piece end on the run's own line (the pieces close up to meet it exactly), or level with
    // one off the line (so the next run from here comes out square with it)
    { const along = j => (onX ? j.x - s0.x : j.z - s0.z) * sign, off = j => Math.abs(onX ? j.z - s0.z : j.x - s0.x);
      let best = null, bs = Infinity;
      for (const j of joints) { const t = along(j), d = Math.abs(t - len); if (t < L * 0.5 || d > snap) continue; const o = off(j), on = o <= 1.5, sc = d + (on ? 0 : 100) + o * 0.01; if (sc < bs) { bs = sc; best = { j, t, on }; } }
      if (best) { len = best.t; n = Math.max(1, Math.ceil(len / L - 0.03)); step = len / n; locks.end = { x: r2(best.j.x), z: r2(best.j.z), ...(best.on ? {} : { level: true }) }; } }
    const most = def.lineMax ?? 40;
    if (n > most) return { ok: false, reason: `At most ${most} pieces in one run`, points: [], rot, locks };
    const points = [];
    for (let k = 0; k < n; k++) { const t = step * (k + 0.5); points.push({ x: r2(s0.x + dx * t), z: r2(s0.z + dz * t) }); }
    const cost = Object.fromEntries(Object.entries(def.cost || {}).map(([r, v]) => [r, v * n]));
    const chain = W.chainDistance ?? 120;
    if (!points.some(p => camp.buildings.some(c => dist(c, p) <= chain))) return { ok: false, reason: `Start within ${chain} of another camp building`, points, rot, cost, locks };
    for (let k = 0; k < n; k++) { const why = placeWhy(war, 'palisade', points[k].x, points[k].z, { chained: true, free: true, more: k, step }); if (why) return { ok: false, reason: why, points, rot, cost, bad: k, locks }; }
    const pay = canPay(camp, cost);
    return { ok: !pay, reason: pay || '', points, rot, cost, locks };
  }
  function campLine(e, c) {
    const war = byId(c.war);
    if (!owns(e, war)) return { ok: false, reason: 'Not your war camp' };
    const r = campLineCheck(c.war, { x: c.x0, z: c.z0 }, { x: c.x1, z: c.z1 });
    if (!r.ok) return r;
    pay(war.camp, r.cost);
    const line = `${war.id}:line${f().nextId++}`;   // one run = one job: workers sent to a piece build on along it (workers.js)
    for (const p of r.points) war.camp.buildings.push({ id: `${war.id}:palisade${f().nextId++}`, type: 'palisade', stage: 'site', x: p.x, z: p.z, rot: r.rot, line, progress: 0, need: BD().palisade.buildTicks || 1 });
    return { ok: true };
  }
  // Where a gate goes (Tim 2026-11-15): { x, z, rot, replace: [pieces], lock } or null for open ground.
  //  - on a palisade: it takes the place of the piece under the cursor and the next one along (a gate is two pieces long),
  //    standing in the wall, never in front of or behind it;
  //  - by the free end of a run: it locks onto the end and carries the run on, or with turn (R) stands square to it;
  //  - elsewhere it stands alone, along world x, or world z with turn.
  function gateSpot(war, x, z, turn = false) {
    const camp = war?.camp, Lp = lenOf('palisade'), Lg = lenOf('gate'), snap = W.lineSnap ?? 4;
    let on = null, od = Infinity;
    for (const b of linePieces(camp)) {
      if (b.type !== 'palisade') continue;
      const ax = alongX(b), t = ax ? x - b.x : z - b.z, o = Math.abs(ax ? z - b.z : x - b.x);
      if (Math.abs(t) > Lp / 2 + 0.3 || o > snap) continue;
      const d = o + Math.abs(t) * 0.1; if (d < od) { od = d; on = { b, ax, t }; }
    }
    if (on) {
      const { b, ax, t } = on, same = q => q !== b && q.type === 'palisade' && alongX(q) === ax && Math.abs(ax ? q.z - b.z : q.x - b.x) <= 0.4;
      const next = dir => linePieces(camp).filter(same).find(q => { const d = (ax ? q.x - b.x : q.z - b.z) * dir; return d > Lp * 0.5 && d < Lp * 1.2; });
      const side = t >= 0 ? 1 : -1, n = next(side) || next(-side);
      if (n) return { x: r2((b.x + n.x) / 2), z: r2((b.z + n.z) / 2), rot: ax ? 0 : 1.571, replace: [b, n], lock: { x: r2((b.x + n.x) / 2), z: r2((b.z + n.z) / 2) } };
      const c = { x: b.x + (ax ? side * (Lg - Lp) / 2 : 0), z: b.z + (ax ? 0 : side * (Lg - Lp) / 2) };   // a lone piece: the gate covers it and reaches on toward the cursor
      return { x: r2(c.x), z: r2(c.z), rot: ax ? 0 : 1.571, replace: [b], lock: { x: r2(b.x), z: r2(b.z) } };
    }
    let best = null, bd = snap;
    for (const j of jointsOf(camp)) { const d = Math.hypot(j.x - x, j.z - z); if (d <= bd) { bd = d; best = j; } }
    if (best) {
      // carry the run on from its end, or (turned) stand square to it on the cursor's side
      const ax = turn ? !best.alongX : best.alongX;
      const dir = turn ? ((best.alongX ? z - best.z : x - best.x) < 0 ? -1 : 1) : best.out;
      return { x: r2(best.x + (ax ? dir * Lg / 2 : 0)), z: r2(best.z + (ax ? 0 : dir * Lg / 2)), rot: ax ? 0 : 1.571, replace: [], lock: { x: r2(best.x), z: r2(best.z) } };
    }
    return null;
  }
  // Read-only for the UI, bots and tests: { ok, reason, point, rot?, replaces?: [ids], lock? }; opts.turn = a gate turned with R
  function campCheck(warId, type, point, opts = {}) {
    const war = byId(warId), p = point && { x: Math.round(point.x), z: Math.round(point.z) };
    if (war?.terms) return { ok: false, reason: 'A ceasefire is on: nobody builds while terms are on the table', point: p };   // Tim 2026-11-18
    if (type === 'palisade') return { ok: false, reason: 'A palisade is placed as a line', point: p };
    if (type === 'gate' && p && war?.camp) {
      const g = gateSpot(war, point.x, point.z, !!opts.turn);
      if (g) { const reason = placeWhy(war, type, g.x, g.z, { replace: g.replace, chained: true, step: lenOf('palisade') }); return { ok: !reason, reason, point: { x: g.x, z: g.z }, replaces: g.replace.map(b => b.id), rot: g.rot, lock: g.lock }; }
      const reason = placeWhy(war, type, p.x, p.z);
      return { ok: !reason, reason, point: p, rot: opts.turn ? 1.571 : 0 };
    }
    const reason = placeWhy(war, type, p?.x, p?.z);
    return { ok: !reason, reason, point: p };
  }
  // The build list for a camp: [{ type, cost, need: [..], ok, reason, count, max }] (no point: everything but the ground)
  function campBuildList(warId) {
    const war = byId(warId), camp = war?.camp;
    if (!camp) return [];
    // (checkpoint 7: a building with clan: '<faction>' is only for that clan: the kennel, the hidden dojo)
    // (ships S3: town-only buildings are left out, and a shore building is offered only when the circle holds shore outside the town ring)
    return Object.entries(BD()).filter(([type, d]) => type !== 'camp_hall' && d && typeof d === 'object' && d.cost && d.where !== 'town' && (!d.clan || d.clan === factionOf(war.attacker)) && (!d.shore || circleShore(worldData, town(war.town), W.circleRadius, isCastle(town(war.town)) ? 0 : ringRadius(town(war.town), data), d))).map(([type, d]) => {
      const need = missing(camp, type), count = camp.buildings.filter(b => b.type === type && b.stage !== 'ruined').length;
      const max = campMax(camp, type);
      const reason = need.length ? `Needs ${need.join(' and ')}` : max && count >= max ? (max < (d.max ?? Infinity) ? `A camp has at most ${max} ${nice(type)} before the camp hall upgrade` : `A camp has at most ${max} ${nice(type)}`) : canPay(camp, d.cost);
      return { type, cost: d.cost, need, ok: !reason, reason: reason || '', count, max: max || null };
    });
  }
  function owns(e, war) { return !!war && !!e && e.owner === war.attacker; }
  function campPlace(e, c) {
    const war = byId(c.war);
    if (!owns(e, war)) return { ok: false, reason: 'Not your war camp' };
    if (BD()[c.kind]?.clan && BD()[c.kind].clan !== factionOf(war.attacker)) return { ok: false, reason: `Your clan does not build the ${nice(c.kind)}` };
    const r = campCheck(c.war, c.kind, { x: c.x, z: c.z }, { turn: !!c.turn });   // kind = the building type (type is the command's own)
    if (!r.ok) return r;
    const def = BD()[c.kind];
    pay(war.camp, def.cost);
    const gone = (r.replaces || []).map(id => war.camp.buildings.find(b => b.id === id)).filter(Boolean);
    const line = gone.find(b => b.line)?.line || null;   // a gate in a run is built with the run
    for (const b of gone) war.camp.buildings.splice(war.camp.buildings.indexOf(b), 1);
    war.camp.buildings.push({ id: `${war.id}:${c.kind}${f().nextId++}`, type: c.kind, stage: 'site', x: r.point.x, z: r.point.z, ...(r.rot !== undefined ? { rot: r.rot } : {}), ...(line ? { line } : {}), progress: 0, need: def.buildTicks || 1 });
    return { ok: true };
  }
  // Tim 2026-11-17: a ruined camp station or rail section is rebuilt where it stood (a site again, built by camp
  // workers like any site). Cost: the station's build cost; a section war.supply.sectionCost, sectionBuildTicks.
  // the camp's rail line only (Tim 2026-11-24: no rebuilding buildings in a war; the slipway, as every other camp
  // building, is erased and placed new; a station or section has no other way back)
  const REBUILD = new Set(['camp_station', 'rail_section']);
  const rebuildCost = b => b.type === 'rail_section' ? W.supply?.sectionCost || { timber: 60, stone: 20 } : BD()[b.type]?.cost || {};
  function campRebuildCheck(warId, id) {
    const war = byId(warId), b = war?.camp?.buildings.find(x => x.id === id);
    if (!b) return { ok: false, reason: 'No such camp building' };
    if (war.terms) return { ok: false, reason: 'A ceasefire is on: nobody builds while terms are on the table' };   // Tim 2026-11-18
    if (!REBUILD.has(b.type)) return { ok: false, reason: 'Erase the ruin, then build a new one' };
    if (b.stage !== 'ruined') return { ok: false, reason: 'It is not a ruin' };
    const cost = rebuildCost(b), why = canPay(war.camp, cost);
    return why ? { ok: false, reason: why, cost } : { ok: true, reason: '', cost, building: b.id };
  }
  function campRebuild(e, c) {
    const war = byId(c.war);
    if (!owns(e, war)) return { ok: false, reason: 'Not your war camp' };
    const r = campRebuildCheck(c.war, c.building);
    if (!r.ok) return r;
    const b = war.camp.buildings.find(x => x.id === c.building);
    pay(war.camp, r.cost);
    b.stage = 'site'; b.rebuild = true; b.progress = 0; b.need = b.type === 'rail_section' ? W.supply?.sectionBuildTicks ?? 400 : BD()[b.type]?.buildTicks || 1;
    delete b.hp; delete b.fire; delete b.repair;
    return { ok: true };
  }
  // Cancel a site: full refund while no work is done, nothing back after
  function campCancel(e, c) {
    const war = byId(c.war);
    if (!owns(e, war)) return { ok: false, reason: 'Not your war camp' };
    const i = war.camp.buildings.findIndex(b => b.id === c.building && b.stage === 'site');
    if (i < 0) return { ok: false, reason: 'No such building site' };
    const b = war.camp.buildings[i];
    if (b.rebuild) {   // a station or section being rebuilt goes back to its ruin
      if (!b.progress) pay(war.camp, rebuildCost(b), +1);
      b.stage = 'ruined'; delete b.progress; delete b.need; delete b.rebuild; return { ok: true };
    }
    if (!b.progress) pay(war.camp, BD()[b.type]?.cost, +1);
    war.camp.buildings.splice(i, 1);
    return { ok: true };
  }
  // The Eraser (Tim 2026-11-15): take down any camp building but the hall, as the town eraser does. Everything it cost
  // comes back to the war chest, for a site too; a ruin is cleared for nothing. Read-only check for the UI:
  // { ok, reason, building, refund } for the building under a point (or by id)
  function campEraseCheck(warId, at) {
    const war = byId(warId), camp = war?.camp;
    if (!camp) return { ok: false, reason: 'No such war camp' };
    let b = null;
    if (typeof at === 'string') b = camp.buildings.find(x => x.id === at) || null;
    else if (at && Number.isFinite(at.x) && Number.isFinite(at.z)) {
      let bd = Infinity;
      for (const x of camp.buildings) { if (!Number.isFinite(x.x)) continue; const d = Math.hypot(x.x - at.x, x.z - at.z), reach = BD()[x.type]?.line ? lenOf(x.type) / 2 + 0.6 : radiusOf(x.type); if (d <= reach && d < bd) { bd = d; b = x; } }
    }
    if (!b) return { ok: false, reason: 'Point at a camp building' };
    if (b.type === 'camp_hall') return { ok: false, reason: 'The camp hall cannot be erased', building: b.id };
    if (b.type === 'rail_section') return { ok: false, reason: 'A rail section cannot be erased: rebuild it from the camp station menu', building: b.id };
    if (b.type === 'camp_station' && (b.stage === 'ruined' || b.rebuild)) return { ok: false, reason: 'Rebuild the camp station from its menu, it cannot be erased', building: b.id };
    if (b.queue?.length) return { ok: false, reason: 'It is training troops: cancel them first', building: b.id };
    if (b.type === 'stable' && b.stage === 'built' && !camp.buildings.some(x => x !== b && x.type === 'stable' && x.stage === 'built')
      && Object.values(state.entities || {}).some(u => u.stored?.town === `war:${war.id}`)) return { ok: false, reason: 'Mounts are stored in it: take them out or recall them first', building: b.id };
    const refund = b.stage === 'ruined' ? {} : { ...(BD()[b.type]?.cost || {}) };
    return { ok: true, reason: '', building: b.id, type: b.type, refund };
  }
  function campErase(e, c) {
    const war = byId(c.war);
    if (!owns(e, war)) return { ok: false, reason: 'Not your war camp' };
    const r = campEraseCheck(c.war, typeof c.building === 'string' ? c.building : { x: c.x, z: c.z });
    if (!r.ok) return r;
    const i = war.camp.buildings.findIndex(b => b.id === r.building);
    pay(war.camp, r.refund, +1);
    war.camp.buildings.splice(i, 1);
    const fires = f().fires, key = `c|${war.id}|${r.building}`;
    if (fires?.[key]) { delete fires[key]; if (!Object.keys(fires).length) delete f().fires; }
    return { ok: true, refund: r.refund };
  }
  // The camp hall upgrade: materials and ryo at once, then workers build it like a site
  function campUpgrade(e, c) {
    const war = byId(c.war), U = W?.hallUpgrade;
    if (!owns(e, war)) return { ok: false, reason: 'Not your war camp' };
    if (war.terms) return { ok: false, reason: 'A ceasefire is on: nobody builds while terms are on the table' };   // Tim 2026-11-18
    const hall = hallOf(war.camp);
    if (!U || !hall || hall.stage !== 'built') return { ok: false, reason: 'No camp hall' };
    if (upgraded(war.camp)) return { ok: false, reason: 'The camp hall is already upgraded' };
    if (hall.upgrade) return { ok: false, reason: 'The upgrade is already under way' };
    const why = canPay(war.camp, U.cost);
    if (why) return { ok: false, reason: why };
    pay(war.camp, U.cost);
    hall.upgrade = { progress: 0, need: U.buildTicks || 1 };
    return { ok: true };
  }

  // ---- training queues and the troop cap (checkpoint 4) ----------------------------------
  // Each built building that trains has its own queue (building.queue = [{ unit, left }], the first one counts
  // down). Paid in ryo from the war chest when queued. Troops alive plus queued stay within the troop cap:
  // war.troopCap.base + each built supply tents' cap, never above war.troopCap.max. A finished troop appears at
  // its building as a unit of the attacker tagged warTroop: <war id> (not city crew: no crew cap, no clinic).
  let runtime = null, defense = null, armory = null;
  const UD = () => W?.units || {};
  const factionOf = clanId => state.clans?.[clanId]?.faction || 'yakuza';
  // clan bonus multiplier (war.clanBonus[faction][unit][key], checkpoint 5): ryo, trainTicks, hp, damage
  const bonus = (clanId, unit, key) => W?.clanBonus?.[factionOf(clanId)]?.[unit]?.[key] ?? 1;
  const ryoOf = (clanId, unit) => Math.round((UD()[unit]?.ryo || 0) * bonus(clanId, unit, 'ryo'));
  const ticksOf = (clanId, unit) => Math.max(1, Math.round((UD()[unit]?.trainTicks || 1) * bonus(clanId, unit, 'trainTicks')));
  // the side's hero crew standing in the war circle count toward the troop cap too (F6 phase 4; not the hero, workers or settlers)
  const crewIn = (war, clan) => { const t = town(war.town), R = W?.circleRadius ?? 900; if (!t) return 0;
    return Object.values(state.entities || {}).filter(e => e.owner === clan && e.place === 'world' && !e.dead && !e.warTroop && !e.worker && e.type !== 'hero' && e.type !== 'settler' && e.type !== 'civilian' && !e.guard && !e.captain && !e.guide && Math.hypot(e.x - t.x, e.z - t.z) <= R).length; };
  // troop places a unit takes (war.units[unit].slots, default 1; Tim 2026-11-21: Gatling 2, cannons 3, like RTS supply)
  const slotsOf = unit => Math.max(1, UD()[unit]?.slots ?? 1);
  const troopsOf = war => Object.values(state.entities || {}).filter(e => e.warTroop === war.id && e.owner === war.attacker && !e.dead).reduce((n, e) => n + slotsOf(e.warUnit), 0) + crewIn(war, war.attacker);
  const queuedOf = war => war.camp.buildings.reduce((n, b) => n + (b.queue || []).reduce((m, q) => m + slotsOf(q.unit), 0), 0);
  function troopCap(war) {
    const T = W?.troopCap || {}, tents = war.camp.buildings.filter(b => b.stage === 'built').reduce((n, b) => n + (BD()[b.type]?.cap || 0), 0);
    return Math.min(T.max ?? Infinity, (T.base ?? 0) + tents);
  }
  // { troops, queued, cap } for the UI and tests
  const troopView = warId => { const w = byId(warId); return w?.camp ? { troops: troopsOf(w), queued: queuedOf(w), cap: troopCap(w) } : null; };
  // which units a camp building trains: [unit ids]
  // (checkpoint 7: a unit with clan: '<faction>' is that clan's special; with a clan id given, other clans' specials are left out)
  const trainsAt = (type, clanId = null) => Object.entries(UD()).filter(([, u]) => u && typeof u === 'object' && (u.at || []).includes(type) && (!u.clan || clanId == null || u.clan === factionOf(clanId))).map(([id]) => id);
  function campTrain(e, c) {
    const war = byId(c.war);
    if (!owns(e, war)) return { ok: false, reason: 'Not your war camp' };
    if (war.terms) return { ok: false, reason: 'A ceasefire is on: the war is ending' };   // 8c
    const b = war.camp.buildings.find(x => x.id === c.building), u = UD()[c.unit];
    if (!b || b.stage !== 'built') return { ok: false, reason: 'No such finished camp building' };
    if (!u || !trainsAt(b.type, war.attacker).includes(c.unit)) return { ok: false, reason: `The ${nice(b.type)} does not train that` };
    const n = c.count;
    if (!Number.isSafeInteger(n) || n < 1) return { ok: false, reason: 'count must be a positive integer' };
    if ((b.queue?.length || 0) + n > (W.queueMax ?? 20)) return { ok: false, reason: `At most ${W.queueMax ?? 20} waiting at one building` };
    const left = troopCap(war) - troopsOf(war) - queuedOf(war), need = n * slotsOf(c.unit);
    if (need > left) return { ok: false, reason: left > 0 ? (need === n ? `Troop cap: room for ${left} more` : `Troop cap: ${need} places needed, ${left} free`) : `Troop cap reached (${troopCap(war)}): build supply tents for more` };
    const each = ryoOf(war.attacker, c.unit), cost = each * n;
    if ((war.camp.chest || 0) < cost) return { ok: false, reason: `Needs ${cost} ryo from the war chest (it has ${Math.floor(war.camp.chest || 0)})` };
    const wood = u.timber || 0, has = war.camp.stock?.timber || 0;   // ships S3: a ship also takes timber from the camp stock
    if (wood * n > has) return { ok: false, reason: `Needs ${wood * n} timber from the camp stock (it has ${Math.floor(has)})` };
    war.camp.chest = Math.round((war.camp.chest - cost) * 100) / 100;
    if (wood) addCampStock(war.camp, 'timber', -wood * n);
    b.queue ||= [];
    for (let i = 0; i < n; i++) b.queue.push({ unit: c.unit, left: ticksOf(war.attacker, c.unit), paid: each, ...(wood ? { timber: wood } : {}) });
    return { ok: true };
  }
  // Cancel the last queued troop at a building: its ryo goes back to the war chest
  function campUntrain(e, c) {
    const war = byId(c.war);
    if (!owns(e, war)) return { ok: false, reason: 'Not your war camp' };
    const b = war.camp.buildings.find(x => x.id === c.building), q = b?.queue?.pop();
    if (!q) return { ok: false, reason: 'Nothing waiting there' };
    if (!b.queue.length) delete b.queue;
    war.camp.chest = Math.round(((war.camp.chest || 0) + (q.paid ?? UD()[q.unit]?.ryo ?? 0)) * 100) / 100;
    if (q.timber) addCampStock(war.camp, 'timber', q.timber);   // ships S3
    return { ok: true };
  }
  // A trained troop of a roster unit: its clan's body, clan bonus hp and damage, and a cavalry unit comes already on
  // its horse (war.units cavalry: true, numbers in war.cavalry): it never gets off (sim/mounts.js skips cavalry), and rider and horse fall together.
  // (owner: the attacker's camp trains them; the Node benchmark and later the defender give their own side)
  function spawnTroop(war, unit, x, z, owner = war.attacker) {
    const u = UD()[unit], faction = factionOf(owner), type = typeof u.type === 'string' ? u.type : u.type?.[faction] || Object.values(u.type || {})[0];
    const extra = { owner, place: 'world', area: 'world', warTroop: war.id, warUnit: unit, order: { kind: 'stop', z: true } };   // placed passive until its first order (the camp gives a gather move at once)
    const hpMul = bonus(owner, unit, 'hp'), dmgMul = bonus(owner, unit, 'damage');
    if (dmgMul !== 1) extra.warDamage = dmgMul;
    const id = runtime.spawn(type, u.model?.[faction] || type, x, z, extra), e = state.entities[id];
    if (!e) return id;
    if (hpMul !== 1 && e.hp != null) { e.hp = e.maxHp = Math.round(e.maxHp * hpMul); }
    armory?.applyTo(e);   // 8e-9: the side's armory upgrades
    if (u.cavalry) {
      const C = W?.cavalry || {};
      const hid = runtime.spawn('horse', C.horse?.[faction] || 'mare_saddled', x, z, { horseOwner: owner, warTroop: war.id, cavalry: true, place: 'world', area: 'world', hp: e.maxHp, maxHp: e.maxHp, holdFire: true, vehicle: true });
      const horse = state.entities[hid];
      if (horse) {
        e.cavalry = true; e.mounted = true; e.ride = { kind: 'horse', speed: C.speed ?? 2, horse: hid };
        horse.rider = id;
      }
    }
    return id;
  }
  function tick() {
    armory?.tick();   // 8e-9: upgrades in the work
    // a war that is over takes its troops with it (they disband)
    if (runtime?.remove && (state.tick ?? 0) % 20 === 0) for (const e of Object.values(state.entities || {})) if (e.warTroop && !e.rout && !e.leave && !e.inShip && !byId(e.warTroop)) runtime.remove(e.id);   // routed troops run off first (war_end.js); a ship landing its people, and the troops in its hold, wait for it (ships S7)
    // 7c (Tim 2026-11-12): war troops cannot leave their war circle. One past the edge is set back on it and stops;
    // a move order to a spot outside ends at the edge.
    if ((state.tick ?? 0) % 5 === 0) for (const e of Object.values(state.entities || {})) {
      if (!e.warTroop || e.dead || e.place !== 'world') continue;
      const w = byId(e.warTroop), t = w && town(w.town); if (!t) continue;
      const R = W.circleRadius, pull = (x, z, r) => { const d = Math.hypot(x - t.x, z - t.z); return d > r ? [t.x + (x - t.x) * r / d, t.z + (z - t.z) * r / d] : null; };
      const o = e.order, goal = o && Number.isFinite(o.x) && Number.isFinite(o.z) && pull(o.x, o.z, R - 2);
      if (goal) { o.x = goal[0]; o.z = goal[1]; }
      const back = pull(e.x, e.z, R);
      if (back) { e.x = back[0]; e.z = back[1]; if (!goal) e.order = { kind: 'stop' }; }
    }
    // a cavalry horse whose rider fell goes with him (checkpoint 5)
    if (runtime?.remove && (state.tick ?? 0) % 5 === 0) for (const h of Object.values(state.entities || {})) {
      if (!h.cavalry || h.type !== 'horse') continue;
      const rider = state.entities[h.rider];
      if (!rider || rider.dead || rider.downed) runtime.remove(h.id);
    }
    for (const war of active()) for (const b of war.camp?.buildings || []) {
      const q = b.queue?.[0];
      if (!q || b.stage !== 'built') continue;
      if (q.left > 0) q.left--;
      if (q.left > 0 || !runtime?.spawn) continue;   // without the game (bare tests) a ready troop waits at the front
      // ships S3: a ship comes out on the water beside its slipway (it waits there while no water is found)
      if (UD()[q.unit]?.ship) { if (!runtime.ships?.launch(war, q.unit, b.x, b.z, war.attacker)) continue; f().nextId++; b.queue.shift(); if (!b.queue.length) delete b.queue; continue; }
      // Tim 2026-11-12: new troops come out on the side facing the town and gather in one spot there, a little spread
      const t = town(war.town), r = radiusOf(b.type) + 2, a = t ? Math.atan2(t.z - b.z, t.x - b.x) : 0;
      const gx = b.x + Math.cos(a) * (r + 6), gz = b.z + Math.sin(a) * (r + 6), k = b.rally = ((b.rally || 0) % 24) + 1;
      const id = spawnTroop(war, q.unit, b.x + Math.cos(a) * r, b.z + Math.sin(a) * r), e = state.entities[id];
      if (e) e.order = { kind: 'move', x: gx + Math.cos(k * 2.4) * 1.3 * Math.sqrt(k), z: gz + Math.sin(k * 2.4) * 1.3 * Math.sqrt(k) };
      f().nextId++;
      b.queue.shift();
      if (!b.queue.length) delete b.queue;
    }
    defense?.tick(runtime);   // 8b-2: the defending town's queues
    standIn();
  }
  // Stand-in defender (checkpoint 4; the bot general replaces it at 8d): a bot clan's town at war trains grunts
  // from its coffers, one every standIn.trainTicks up to standIn.max, at the town hall. They stand at the hall and
  // go for the nearest attacker unit inside the town ring (+ standIn.reach). A player defends his own town.
  function standIn() {
    const S = W?.standIn;
    if (!S || !runtime?.spawn || (state.tick ?? 0) % 20 !== 0) return;
    for (const war of active()) {
      const t = town(war.town), clan = state.clans?.[war.defender];
      if (!t || !clan?.bot || generalOn()) continue;   // 8d: the bot general defends bot towns (sim/war_general_brain.js); this stays for bare tests
      const mine = Object.values(state.entities).filter(e => e.warTroop === war.id && e.owner === war.defender && !e.dead);
      war.standIn ||= { next: (state.tick ?? 0) + (S.trainTicks || 0) };
      if (mine.length < S.max && (state.tick ?? 0) >= war.standIn.next && (t.stock?.ryo || 0) >= S.ryo) {
        world.change(t.id, 'ryo', -S.ryo, 'war troops');
        const faction = clan.faction || 'yakuza', a = (f().nextId % 12) * Math.PI / 6, r = S.hallDistance ?? 14;
        const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
        const ranged = S.ranged && ((war.standIn.n = (war.standIn.n || 0) + 1) % (S.ranged.every || 3) === 0);   // every few troops is an archer who holds a house
        const type = ranged ? S.ranged.type : (S.type?.[faction] || 'swordsman'), model = ranged ? (S.ranged.model || type) : (S.model?.[faction] || type);
        const id = runtime.spawn(type, model, x, z, { owner: war.defender, place: 'world', area: 'world', warTroop: war.id, home: [x, z], order: { kind: 'station', x, z } });
        if (id != null && state.entities[id]) { mine.push(state.entities[id]); if (ranged) state.entities[id].holdHouse = true; }
        f().nextId++;
        war.standIn.next = (state.tick ?? 0) + (S.trainTicks || 0);
      }
      const reach = ringRadius(t, data) + (S.reach ?? 50);
      const foes = Object.values(state.entities).filter(e => e.owner === war.attacker && e.place === 'world' && !e.dead && !e.downed && e.type !== 'civilian' && Math.hypot(e.x - t.x, e.z - t.z) <= reach);
      for (const d of mine) {
        if (d.downed || d.garrison || d.order?.garrisonKey) continue;
        if (d.holdHouse && garrisonHook?.defendIn?.(d, war.town)) continue;   // archers go into a house while one has room
        const foe = foes.map(e => ({ e, d: Math.hypot(e.x - d.x, e.z - d.z) })).sort((a, b) => a.d - b.d || (a.e.id < b.e.id ? -1 : 1))[0]?.e;
        if (foe) { if (d.order?.kind !== 'attack' || d.order.target !== foe.id) d.order = { kind: 'attack', target: foe.id }; }
        else if (d.order?.kind !== 'station' && d.home) d.order = { kind: 'station', x: d.home[0], z: d.home[1] };
      }
    }
  }
  let garrisonHook = null, generalOn = () => false;
  function attach(services) { runtime = services; }

  function receipt(e, c, ok, reason = '') {
    const fr = f();
    fr.receiptSeq = (fr.receiptSeq || 0) + 1;
    fr.receipts.push({ seq: fr.receiptSeq, tick: state.tick ?? 0, clan: e.owner ?? null, action: c.action, ok, reason });
    return true;
  }
  function command(e, c) {
    if (c.action === 'plantBanner') {
      const r = plant(e, c.town, { x: c.x, z: c.z });
      if (!r.ok && state.clans?.[e.owner]) state.clans[e.owner].notice = { tick: state.tick, text: r.reason };
      return receipt(e, c, r.ok, r.reason || '');
    }
    if (c.action === 'warPack' || c.action === 'warUnpack') {
      if (e.type !== 'hero') return receipt(e, c, false, 'Only a hero packs for war');
      const r = setPack(e, c.action === 'warUnpack' ? { ryo: 0, timber: 0, stone: 0 } : c);
      if (!r.ok && state.clans?.[e.owner]) state.clans[e.owner].notice = { tick: state.tick, text: r.reason };
      return receipt(e, c, r.ok, r.reason || '');
    }
    if (['campPlace', 'campLine', 'campCancel', 'campErase', 'campUpgrade', 'campTrain', 'campUntrain', 'campRebuild'].includes(c.action)) {
      const r = { campPlace, campLine, campCancel, campErase, campUpgrade, campTrain, campUntrain, campRebuild }[c.action](e, c);
      if (!r.ok && state.clans?.[e.owner]) state.clans[e.owner].notice = { tick: state.tick, text: r.reason };
      return receipt(e, c, r.ok, r.reason || '');
    }
    if (c.action === 'armoryUp' || c.action === 'armoryCancel') {   // 8e-9: armory upgrades (cancel: Tim 2026-11-18 queue)
      const r = armory.command(e, c);
      if (!r.ok && state.clans?.[e.owner]) state.clans[e.owner].notice = { tick: state.tick, text: r.reason };
      return receipt(e, c, r.ok, r.reason || '');
    }
    if (['warChestTown', 'townTrain', 'townUntrain'].includes(c.action)) {   // 8b-2: the defending town
      const r = defense.command(e, c);
      if (!r.ok && state.clans?.[e.owner]) state.clans[e.owner].notice = { tick: state.tick, text: r.reason };
      return receipt(e, c, r.ok, r.reason || '');
    }
    if (c.action === 'devStartWar') {   // dev build only (data.dev)
      if (!data.dev) return receipt(e, c, false, 'dev only');
      const r = devStart(e, c);
      if (state.clans?.[e.owner]) state.clans[e.owner].notice = { tick: state.tick, text: r.ok ? `Dev war: ${r.war.id} on ${town(r.war.town).name}` : r.reason };
      return receipt(e, c, r.ok, r.reason || '');
    }
    if (c.action === 'devEndWar') {   // dev build only (data.dev): end a war to try the cooldown
      if (!data.dev) return receipt(e, c, false, 'dev only');
      return receipt(e, c, end(c.war, c.result || 'dev'), '');
    }
    return false;
  }

  const api = { slotsOf, campMax, isResourceCamp, check, plant, end, command, econTick, band, bandOutline, packView, potAt, warsAt, warOn, byId, warsOf, active, cooldownDays, campCheck, campLineCheck, campEraseCheck, campRebuildCheck, campBuildList, upgraded, troopView, trainsAt, crewIn, ryoOf, ticksOf, spawnTroop, tick, attach, setGarrison: g => { garrisonHook = g; }, setGeneral: g => { generalOn = () => !!g?.enabled(); }, generalOn: () => generalOn(), get data() { return W; },
    get defense() { return defense; }, get armory() { return armory; }, settleDefense: w => defense.settle(w) };
  defense = createWarDefense({ state, data, war: api, world });   // 8b-2: the defending town's war chest and training
  armory = createWarArmory({ state, data, war: api, world });   // 8e-9: armory upgrades
  return api;
}
