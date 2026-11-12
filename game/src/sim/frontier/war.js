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

export function createWar({ state, data, world = null, worldData = null, resourceIndex = null, dayTicks = 12000 }) {
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
    const ring = ringRadius(t, data), inner = ring + W.band.inner;
    let outer = ring + W.band.outer;
    if (!worldData) return [inner, outer];
    const any = (r0, r1) => { for (let r = r0; r <= r1; r += 25) for (let a = 0; a < 32; a++) if (groundOk(t.x + Math.cos(a * Math.PI / 16) * r, t.z + Math.sin(a * Math.PI / 16) * r)) return true; return false; };
    const step = Math.max(10, W.band.widenStep || 50);
    while (!any(inner, outer) && outer < W.circleRadius) outer = Math.min(W.circleRadius, outer + step);
    return [inner, outer];
  }

  // Why a banner cannot be planted, or null when it can.
  function whyNot(hero, t, point) {
    if (!W) return 'War is not available';
    if (!modeRules(state).founding) return 'Wars are fought in a campaign';
    if (!hero || hero.type !== 'hero') return 'Only a hero can plant a war banner';
    if (hero.dead || hero.downed || hero.place !== 'world') return 'Plant the banner out on the island';
    if (!t) return 'No such town';
    if (t.capital) return 'A capital cannot be attacked yet';
    if (!Number.isFinite(t.x)) return 'No such town';
    if (t.owner == null) return 'Nobody holds this town';
    if (t.owner === hero.owner) return 'This is your own town';
    if (warOn(t.id)) return `${t.name} is already at war`;
    const days = cooldownDays(t.id);
    if (days) return `${t.name} is under truce for ${days} more ${days === 1 ? 'day' : 'days'}`;
    if (dist(hero, t) > W.circleRadius) return `Come within ${W.circleRadius} of ${t.name}'s town hall`;
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
    const [inner, outer] = band(t), d = dist(point, t);
    if (d < inner) return `Too close to ${t.name}: plant the banner ${Math.round(inner)} to ${Math.round(outer)} from its town hall`;
    if (d > outer) return `Too far from ${t.name}: plant the banner ${Math.round(inner)} to ${Math.round(outer)} from its town hall`;
    for (const s of Object.values(f().settlements)) {
      if (s === t || s.capital || !Number.isFinite(s.x)) continue;
      if (dist(point, s) <= ringRadius(s, data)) return `Inside ${s.name}'s town ring`;
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
    if (!t || t.capital || !Number.isFinite(t.x) || t.owner == null) return { ok: false, reason: 'No such town' };
    if (warOn(t.id)) return { ok: false, reason: `${t.name} is already at war` };
    let attacker = e.owner;
    if (c.side === 'defend') {
      if (t.owner !== e.owner) return { ok: false, reason: 'Defend one of your own towns' };
      attacker = state.clans?.[c.attacker] && c.attacker !== e.owner ? c.attacker : Object.keys(state.clans || {}).find(id => id !== e.owner && state.clans[id].bot);
      if (!attacker) return { ok: false, reason: 'No rival clan to attack you' };
    } else if (t.owner === e.owner) return { ok: false, reason: 'This is your own town' };
    const [inner, outer] = band(t);
    let point = null;
    for (let r = Math.ceil((inner + outer) / 2); !point && r <= outer; r += 25) for (let a = 0; !point && a < 32; a++) {
      const p = { x: Math.round(t.x + Math.cos(a * Math.PI / 16) * r), z: Math.round(t.z + Math.sin(a * Math.PI / 16) * r) };
      if (!spotWhy(t, p)) point = p;
    }
    if (!point) return { ok: false, reason: 'No ground for a banner round that town' };
    const clan = state.clans?.[attacker], pack = clan?.warPack || W.dev?.camp || { ryo: 0, timber: 0, stone: 0 };
    const war = start(attacker, t, point, pack);
    if (clan?.warPack) delete clan.warPack;
    return { ok: true, id: war.id, war };
  }

  // End a war: result 'attackerWon' | 'defenderWon' | 'called off' etc. (later checkpoints decide it).
  // The record moves to the history and the town's cooldown starts.
  function end(warId, result = 'ended') {
    const st = store(), war = st.list[warId];
    if (!war) return false;
    delete st.list[warId];
    Object.assign(war, { state: 'ended', result, ended: state.tick ?? 0 });
    // the history keeps only a head count of the camp workers (their units leave with the war; routes would bloat saves)
    if (Array.isArray(war.camp?.workers)) { war.camp.workers = war.camp.workers.length; delete war.camp.workerTraining; }
    st.history.push(war);
    const max = W?.historyMax ?? 20;
    if (st.history.length > max) st.history.splice(0, st.history.length - max);
    st.cooldown[war.town] = (state.tick ?? 0) + Math.round((W?.cooldownDays ?? 0) * dayTicks);
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
  const radiusOf = type => BD()[type]?.radius ?? 8;
  const hallOf = camp => camp?.buildings?.find(b => b.type === 'camp_hall') || null;
  const upgraded = camp => (hallOf(camp)?.tier || 1) >= 2;
  const builtCount = (camp, type) => camp.buildings.filter(b => b.type === type && b.stage === 'built').length;
  const nice = t => (t || '').replace(/_/g, ' ');
  // what a building type still needs before it can be placed: [] when nothing
  function missing(camp, type) {
    const out = [];
    for (const n of BD()[type]?.needs || []) {
      if (n === 'upgrade') { if (!upgraded(camp)) out.push('the camp hall upgrade'); }
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
    if (!def || type === 'camp_hall' || !def.cost) return 'Not a camp building';
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 'Choose a spot';
    const need = missing(camp, type);
    if (need.length) return `Needs ${need.join(' and ')}`;
    if (def.max && camp.buildings.filter(b => b.type === type).length + (opts.more || 0) >= def.max) return `A camp has at most ${def.max} ${nice(type)}`;
    const t = town(war.town), r = radiusOf(type), p = { x, z };
    if (!t) return 'No such town';
    if (dist(p, t) + r > W.circleRadius) return 'Stay inside the war circle';
    for (const s of Object.values(f().settlements)) {
      if (s.capital || !Number.isFinite(s.x)) continue;
      if (dist(p, s) - r <= ringRadius(s, data)) return `Inside ${s.name}'s town ring`;
    }
    const chain = W.chainDistance ?? 120;
    if (!opts.chained && !camp.buildings.some(b => dist(b, p) <= chain)) return `Place it within ${chain} of another camp building`;
    for (const w of active()) for (const b of w.camp?.buildings || []) {
      if (opts.replace === b) continue;                                   // a gate takes the place of this palisade piece
      const gap = def.line && BD()[b.type]?.line && w === war ? (opts.step ?? Math.min(r, radiusOf(b.type))) * 0.9 : r + radiusOf(b.type);   // palisade pieces stand side by side
      if (dist(b, p) < gap) return w === war ? `Too close to the ${nice(b.type)}` : 'Too close to another war camp';
    }
    const k = r * 0.7;
    for (const [dx, dz] of [[0, 0], [k, 0], [-k, 0], [0, k], [0, -k]]) if (!groundOk(x + dx, z + dz)) return 'This ground cannot be built on';
    if (resourceIndex && coversResources({ x, z, grid: { n: 1, cell: r * 2 } }, [0], resourceIndex, 1)) return 'It would cover a resource area';
    return opts.free ? null : canPay(camp, def.cost);
  }
  // ---- palisade and gate (checkpoint 6-6) ------------------------------------------------------------------
  // A palisade is placed as a line: pieces every buildings.palisade.length from a to b, each a camp building
  // { type: 'palisade', rot: the line's angle } built by the camp workers like any site. Paid at once for the whole
  // run. A gate is one piece: placed on a palisade piece it takes its place and its angle; elsewhere it stands alone.
  // Read-only: { ok, reason, points: [{ x, z }], rot, cost }
  function campLineCheck(warId, a, b) {
    const war = byId(warId), def = BD().palisade, camp = war?.camp;
    if (!camp || !def?.line) return { ok: false, reason: 'No such war camp', points: [] };
    if (![a?.x, a?.z, b?.x, b?.z].every(Number.isFinite)) return { ok: false, reason: 'Choose a start and an end', points: [] };
    const L = def.length || 5, len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.round(len / L) + 1), rot = Math.round(Math.atan2(b.z - a.z, b.x - a.x) * 1000) / 1000;
    const most = def.lineMax ?? 40;
    if (n > most) return { ok: false, reason: `At most ${most} pieces in one run`, points: [], rot };
    const points = [];
    for (let k = 0; k < n; k++) { const t = n === 1 ? 0 : k / (n - 1); points.push({ x: Math.round((a.x + (b.x - a.x) * t) * 10) / 10, z: Math.round((a.z + (b.z - a.z) * t) * 10) / 10 }); }
    const cost = Object.fromEntries(Object.entries(def.cost || {}).map(([r, v]) => [r, v * n]));
    const chain = W.chainDistance ?? 120;
    if (!points.some(p => camp.buildings.some(c => dist(c, p) <= chain))) return { ok: false, reason: `Start within ${chain} of another camp building`, points, rot, cost };
    for (let k = 0; k < n; k++) { const why = placeWhy(war, 'palisade', points[k].x, points[k].z, { chained: true, free: true, more: k, step: n > 1 ? len / (n - 1) : L }); if (why) return { ok: false, reason: why, points, rot, cost, bad: k }; }
    const pay = canPay(camp, cost);
    return { ok: !pay, reason: pay || '', points, rot, cost };
  }
  function campLine(e, c) {
    const war = byId(c.war);
    if (!owns(e, war)) return { ok: false, reason: 'Not your war camp' };
    const r = campLineCheck(c.war, { x: c.x0, z: c.z0 }, { x: c.x1, z: c.z1 });
    if (!r.ok) return r;
    pay(war.camp, r.cost);
    for (const p of r.points) war.camp.buildings.push({ id: `${war.id}:palisade${f().nextId++}`, type: 'palisade', stage: 'site', x: p.x, z: p.z, rot: r.rot, progress: 0, need: BD().palisade.buildTicks || 1 });
    return { ok: true };
  }
  // the palisade piece a gate at this point would replace, or null
  function gateSpot(war, x, z) {
    const L = (BD().palisade?.length || 5) * 0.75;
    return (war?.camp?.buildings || []).filter(b => b.type === 'palisade' && Math.hypot(b.x - x, b.z - z) <= L).sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z) || (p.id < q.id ? -1 : 1))[0] || null;
  }
  // Read-only for the UI, bots and tests: { ok, reason, point }
  function campCheck(warId, type, point) {
    const war = byId(warId), p = point && { x: Math.round(point.x), z: Math.round(point.z) };
    if (type === 'palisade') return { ok: false, reason: 'A palisade is placed as a line', point: p };
    // a gate on a palisade piece takes its place
    const on = type === 'gate' && p ? gateSpot(war, p.x, p.z) : null;
    if (on) { const reason = placeWhy(war, type, on.x, on.z, { replace: on, chained: true }); return { ok: !reason, reason, point: { x: on.x, z: on.z }, replaces: on.id, rot: on.rot || 0 }; }
    const reason = placeWhy(war, type, p?.x, p?.z);
    return { ok: !reason, reason, point: p };
  }
  // The build list for a camp: [{ type, cost, need: [..], ok, reason, count, max }] (no point: everything but the ground)
  function campBuildList(warId) {
    const war = byId(warId), camp = war?.camp;
    if (!camp) return [];
    // (checkpoint 7: a building with clan: '<faction>' is only for that clan: the kennel, the hidden dojo)
    return Object.entries(BD()).filter(([type, d]) => type !== 'camp_hall' && d && typeof d === 'object' && d.cost && (!d.clan || d.clan === factionOf(war.attacker))).map(([type, d]) => {
      const need = missing(camp, type), count = camp.buildings.filter(b => b.type === type).length;
      const reason = need.length ? `Needs ${need.join(' and ')}` : d.max && count >= d.max ? `A camp has at most ${d.max} ${nice(type)}` : canPay(camp, d.cost);
      return { type, cost: d.cost, need, ok: !reason, reason: reason || '', count, max: d.max || null };
    });
  }
  function owns(e, war) { return !!war && !!e && e.owner === war.attacker; }
  function campPlace(e, c) {
    const war = byId(c.war);
    if (!owns(e, war)) return { ok: false, reason: 'Not your war camp' };
    if (BD()[c.kind]?.clan && BD()[c.kind].clan !== factionOf(war.attacker)) return { ok: false, reason: `Your clan does not build the ${nice(c.kind)}` };
    const r = campCheck(c.war, c.kind, { x: c.x, z: c.z });   // kind = the building type (type is the command's own)
    if (!r.ok) return r;
    const def = BD()[c.kind];
    pay(war.camp, def.cost);
    if (r.replaces) war.camp.buildings.splice(war.camp.buildings.findIndex(b => b.id === r.replaces), 1);
    war.camp.buildings.push({ id: `${war.id}:${c.kind}${f().nextId++}`, type: c.kind, stage: 'site', x: r.point.x, z: r.point.z, ...(r.rot !== undefined ? { rot: r.rot } : {}), progress: 0, need: def.buildTicks || 1 });
    return { ok: true };
  }
  // Cancel a site: full refund while no work is done, nothing back after
  function campCancel(e, c) {
    const war = byId(c.war);
    if (!owns(e, war)) return { ok: false, reason: 'Not your war camp' };
    const i = war.camp.buildings.findIndex(b => b.id === c.building && b.stage === 'site');
    if (i < 0) return { ok: false, reason: 'No such building site' };
    const b = war.camp.buildings[i];
    if (!b.progress) pay(war.camp, BD()[b.type]?.cost, +1);
    war.camp.buildings.splice(i, 1);
    return { ok: true };
  }
  // The camp hall upgrade: materials and ryo at once, then workers build it like a site
  function campUpgrade(e, c) {
    const war = byId(c.war), U = W?.hallUpgrade;
    if (!owns(e, war)) return { ok: false, reason: 'Not your war camp' };
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
  let runtime = null;
  const UD = () => W?.units || {};
  const factionOf = clanId => state.clans?.[clanId]?.faction || 'yakuza';
  // clan bonus multiplier (war.clanBonus[faction][unit][key], checkpoint 5): ryo, trainTicks, hp, damage
  const bonus = (clanId, unit, key) => W?.clanBonus?.[factionOf(clanId)]?.[unit]?.[key] ?? 1;
  const ryoOf = (clanId, unit) => Math.round((UD()[unit]?.ryo || 0) * bonus(clanId, unit, 'ryo'));
  const ticksOf = (clanId, unit) => Math.max(1, Math.round((UD()[unit]?.trainTicks || 1) * bonus(clanId, unit, 'trainTicks')));
  const troopsOf = war => Object.values(state.entities || {}).filter(e => e.warTroop === war.id && e.owner === war.attacker && !e.dead).length;
  const queuedOf = war => war.camp.buildings.reduce((n, b) => n + (b.queue?.length || 0), 0);
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
    const b = war.camp.buildings.find(x => x.id === c.building), u = UD()[c.unit];
    if (!b || b.stage !== 'built') return { ok: false, reason: 'No such finished camp building' };
    if (!u || !trainsAt(b.type, war.attacker).includes(c.unit)) return { ok: false, reason: `The ${nice(b.type)} does not train that` };
    const n = c.count;
    if (!Number.isSafeInteger(n) || n < 1) return { ok: false, reason: 'count must be a positive integer' };
    if ((b.queue?.length || 0) + n > (W.queueMax ?? 20)) return { ok: false, reason: `At most ${W.queueMax ?? 20} waiting at one building` };
    const left = troopCap(war) - troopsOf(war) - queuedOf(war);
    if (n > left) return { ok: false, reason: left > 0 ? `Troop cap: room for ${left} more` : `Troop cap reached (${troopCap(war)}): build supply tents for more` };
    const each = ryoOf(war.attacker, c.unit), cost = each * n;
    if ((war.camp.chest || 0) < cost) return { ok: false, reason: `Needs ${cost} ryo from the war chest (it has ${Math.floor(war.camp.chest || 0)})` };
    war.camp.chest = Math.round((war.camp.chest - cost) * 100) / 100;
    b.queue ||= [];
    for (let i = 0; i < n; i++) b.queue.push({ unit: c.unit, left: ticksOf(war.attacker, c.unit), paid: each });
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
    return { ok: true };
  }
  // A trained troop of a roster unit: its clan's body, clan bonus hp and damage, and a cavalry unit comes already on
  // its horse (war.units cavalry: true, numbers in war.cavalry): it never gets off (sim/mounts.js skips cavalry), and rider and horse fall together.
  // (owner: the attacker's camp trains them; the Node benchmark and later the defender give their own side)
  function spawnTroop(war, unit, x, z, owner = war.attacker) {
    const u = UD()[unit], faction = factionOf(owner), type = typeof u.type === 'string' ? u.type : u.type?.[faction] || Object.values(u.type || {})[0];
    const extra = { owner, place: 'world', area: 'world', warTroop: war.id, warUnit: unit, order: { kind: 'stop' } };
    const hpMul = bonus(owner, unit, 'hp'), dmgMul = bonus(owner, unit, 'damage');
    if (dmgMul !== 1) extra.warDamage = dmgMul;
    const id = runtime.spawn(type, u.model?.[faction] || type, x, z, extra), e = state.entities[id];
    if (!e) return id;
    if (hpMul !== 1 && e.hp != null) { e.hp = e.maxHp = Math.round(e.maxHp * hpMul); }
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
    // a war that is over takes its troops with it (they disband)
    if (runtime?.remove && (state.tick ?? 0) % 20 === 0) for (const e of Object.values(state.entities || {})) if (e.warTroop && !byId(e.warTroop)) runtime.remove(e.id);
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
      const r = radiusOf(b.type) + 2, a = (f().nextId % 12) * Math.PI / 6;
      spawnTroop(war, q.unit, b.x + Math.cos(a) * r, b.z + Math.sin(a) * r);
      f().nextId++;
      b.queue.shift();
      if (!b.queue.length) delete b.queue;
    }
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
      if (!t || !clan?.bot) continue;
      const mine = Object.values(state.entities).filter(e => e.warTroop === war.id && e.owner === war.defender && !e.dead);
      war.standIn ||= { next: (state.tick ?? 0) + (S.trainTicks || 0) };
      if (mine.length < S.max && (state.tick ?? 0) >= war.standIn.next && (t.stock?.ryo || 0) >= S.ryo) {
        world.change(t.id, 'ryo', -S.ryo, 'war troops');
        const faction = clan.faction || 'yakuza', a = (f().nextId % 12) * Math.PI / 6, r = S.hallDistance ?? 14;
        const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r, type = S.type?.[faction] || 'swordsman';
        const id = runtime.spawn(type, S.model?.[faction] || type, x, z, { owner: war.defender, place: 'world', area: 'world', warTroop: war.id, home: [x, z], order: { kind: 'station', x, z } });
        if (id != null && state.entities[id]) mine.push(state.entities[id]);
        f().nextId++;
        war.standIn.next = (state.tick ?? 0) + (S.trainTicks || 0);
      }
      const reach = ringRadius(t, data) + (S.reach ?? 50);
      const foes = Object.values(state.entities).filter(e => e.owner === war.attacker && e.place === 'world' && !e.dead && !e.downed && e.type !== 'civilian' && Math.hypot(e.x - t.x, e.z - t.z) <= reach);
      for (const d of mine) {
        if (d.downed) continue;
        const foe = foes.map(e => ({ e, d: Math.hypot(e.x - d.x, e.z - d.z) })).sort((a, b) => a.d - b.d || (a.e.id < b.e.id ? -1 : 1))[0]?.e;
        if (foe) { if (d.order?.kind !== 'attack' || d.order.target !== foe.id) d.order = { kind: 'attack', target: foe.id }; }
        else if (d.order?.kind !== 'station' && d.home) d.order = { kind: 'station', x: d.home[0], z: d.home[1] };
      }
    }
  }
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
    if (['campPlace', 'campLine', 'campCancel', 'campUpgrade', 'campTrain', 'campUntrain'].includes(c.action)) {
      const r = { campPlace, campLine, campCancel, campUpgrade, campTrain, campUntrain }[c.action](e, c);
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

  return { check, plant, end, command, econTick, band, packView, potAt, warsAt, warOn, byId, warsOf, active, cooldownDays, campCheck, campLineCheck, campBuildList, upgraded, troopView, trainsAt, ryoOf, ticksOf, spawnTroop, tick, attach, get data() { return W; } };
}
