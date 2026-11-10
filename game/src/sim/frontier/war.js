// War (frontier plan F6, checkpoint 1): war records, the war circle, and planting the war camp
// banner, which IS the declaration of war (Tim 2026-11-10: one step, no separate Declare click).
// Rules only: no DOM, no randomness. All numbers live in data/frontier.json "war".
// State: state.frontier.wars = { list: { [id]: war }, cooldown: { [townId]: untilTick }, history: [] }
//   war = { id, town, attacker, defender, x, z, started, state: 'active' }   (x, z = the banner)
// Players and bots use the same command: { id: <hero id>, type: 'frontier', action: 'plantBanner', town, x, z }.
// One war per town at a time; a clan may run several wars. When a war ends the town is under
// cooldown for war.cooldownDays game days before anyone can plant a banner on it again.
import { modeRules } from '../modes/index.js';
import { buildable, passable } from '../world_data.js';
import { ringRadius } from './town_grid.js';
import { coversResources } from './resource_clearance.js';

export function createWar({ state, data, worldData = null, resourceIndex = null, dayTicks = 12000 }) {
  const W = data.war || null;
  const f = () => state.frontier;
  // old saves have no war records: add the empty shape on first use
  function store() {
    const fr = f();
    if (!fr.wars) fr.wars = { list: {}, cooldown: {}, history: [] };
    return fr.wars;
  }
  const active = () => Object.values(store().list);
  const warOn = townId => active().find(w => w.town === townId) || null;
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
    const until = store().cooldown[townId];
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
    if (c.action === 'devEndWar') {   // dev build only (data.dev): end a war to try the cooldown
      if (!data.dev) return receipt(e, c, false, 'dev only');
      return receipt(e, c, end(c.war, c.result || 'dev'), '');
    }
    return false;
  }

  return { check, plant, end, command, econTick, band, warsAt, warOn, warsOf, active, cooldownDays, get data() { return W; } };
}
