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
    const pack = state.clans?.[hero.owner]?.warPack, P = W.pack;   // optional; a min above 0 in data makes it required
    if ((P?.min?.timber || P?.min?.stone) && ((pack?.timber || 0) < (P.min.timber || 0) || (pack?.stone || 0) < (P.min.stone || 0)))
      return `Pack for war first (at least ${P.min.timber || 0} timber and ${P.min.stone || 0} stone)`;
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
    const t = town(townId), fr = f(), id = `war${fr.nextId++}`;
    const war = { id, town: t.id, attacker: hero.owner, defender: t.owner, x: r.point.x, z: r.point.z, started: state.tick ?? 0, state: 'active' };
    // the pack becomes the camp (sealed: camp stores never go back to a town)
    const clan = state.clans?.[hero.owner], pack = clan?.warPack || { ryo: 0, timber: 0, stone: 0 };
    const brought = { ryo: pack.ryo || 0, timber: pack.timber || 0, stone: pack.stone || 0 };
    war.camp = { x: war.x, z: war.z, chest: brought.ryo, stock: { timber: brought.timber, stone: brought.stone }, brought,
      workers: Array.from({ length: W.camp?.startWorkers ?? 0 }, () => ({ id: world?.newId ? world.newId('w') : `w${fr.nextId++}`, spot: null, dropoff: null, phase: 0, carrying: 0, entity: null, elapsed: 0, trip: null })), workerTraining: [], buildings: [{ id: `${id}:hall`, type: 'camp_hall', stage: 'built', x: war.x, z: war.z }] };
    if (clan) delete clan.warPack;
    store().list[id] = war;
    const who = state.clans?.[hero.owner]?.name || hero.owner;
    if (state.clans?.[t.owner]) state.clans[t.owner].notice = { tick: state.tick, text: `${who} has declared war on ${t.name}!` };
    return { ok: true, id, war };
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
    if (c.action === 'devEndWar') {   // dev build only (data.dev): end a war to try the cooldown
      if (!data.dev) return receipt(e, c, false, 'dev only');
      return receipt(e, c, end(c.war, c.result || 'dev'), '');
    }
    return false;
  }

  return { check, plant, end, command, econTick, band, packView, potAt, warsAt, warOn, byId, warsOf, active, cooldownDays, get data() { return W; } };
}
