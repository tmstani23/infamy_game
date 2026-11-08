// Stable and omnibus station (Tim 2026-11-06, plan in project files omnibus_stable/plan.md): placed town
// buildings with a production bar, one job at a time, made by hand (nothing on its own, except one horse
// for a bot clan's boss). Costs are town stock, never ryo.
//  - stable (data.buildings.stable.stable): horses (kinds calico, black_beauty), rickshaws and omnibuses
//    (kinds with vehicle: true; Tim 2026-11-07, the omnibus station no longer makes them). How many a clan can
//    have is room(): the sum over its towns with a built stable of stable.room[category][town tier - 1]
//    (categories horse / rickshaw / omnibus); owned ones count, queued ones too, nothing is ever taken away.
//    A finished horse waits at the stable for sim/mounts.js to bring it out (born()); a finished vehicle comes
//    out empty and parks beside the stable (bornVehicles(), sim/omnibus.js).
// Command (through the frontier hub): { id: <hero id>, type: 'frontier', action: 'stable', town,
//   mode: 'horse' (kind) | 'rickshaw' | 'omnibus' | 'cancel' (the last job, refunded) | 'choose' (horse: id) }
// The capital stable (Tim 2026-11-07, stable.capital): { ..., town: 'capital', mode, kind?, count } buys for clan ryo,
//   no waiting, once the clan holds or has used a founding permit; it waits on the island side of the gate (capitalYard)
//   and the capital stable adds stable.capital.room to your room. It also stores what you recall (sim/vehicle_garage.js).
// createStable({ state, data, world, capitalYard }) -> { command, tick, of, born, bornVehicles, horsesOf, jobsOf, centre, parkedAt, room, have, category, capitalAt, capitalOk }
import { cellToWorld } from './town_grid.js';

export function createStable({ state, data, world, capitalYard = null }) {
  const R = (type = 'stable') => data.buildings?.[type]?.[type] || null;
  const of = (s, type = 'stable') => (s?.buildings || []).find(b => b.type === type && b.stage === 'built') || null;
  function centre(s, b) {
    const pts = (b.cells?.length ? b.cells : [b.cell]).map(i => cellToWorld(s, i));
    return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  }
  const horsesOf = (s, b) => Object.values(state.entities || {}).filter(e => e.type === 'horse' && e.stable === `${s.id}:${b.id}` && !e.dead).length
    + (state.frontier.bornHorses || []).filter(h => h.stable === `${s.id}:${b.id}`).length;
  const jobsOf = b => b.stableJobs ||= [];
  const ridden = v => Object.values(state.entities).some(u => u.aboard === v.id);
  // empty vehicles of a kind parked at a station
  const parkedAt = (s, b, kind) => { const [x, z] = centre(s, b), reach = (R('station')?.reach ?? 8) * 3;
    return Object.values(state.entities).filter(v => v.type === kind && v.omnibusOwner === s.owner && !v.dead && v.place === 'world' && !ridden(v) && Math.hypot(v.x - x, v.z - z) <= reach); };
  // what a kind counts as for the limits, and how many a clan has (alive, queued, or out of the door this tick)
  const category = kind => kind === 'rickshaw' || kind === 'omnibus' ? kind : 'horse';
  const towns = owner => Object.values(state.frontier.settlements || {}).filter(t => t.owner === owner && !t.capital);
  const queued = (owner, cat) => towns(owner).reduce((n, t) => n + (of(t)?.stableJobs || []).filter(j => category(j.kind) === cat).length, 0);
  function have(owner, cat) {
    const alive = Object.values(state.entities || {}).filter(e => !e.dead && (cat === 'horse' ? e.type === 'horse' && e.horseOwner === owner : e.type === cat && e.omnibusOwner === owner)).length;
    const born = cat === 'horse' ? (state.frontier.bornHorses || []).filter(h => h.owner === owner).length : (state.frontier.bornVehicles || []).filter(v => v.owner === owner && v.kind === cat).length;
    return alive + born + queued(owner, cat);
  }
  const tierRoom = (t, cat) => { const list = R()?.room?.[cat]; return Array.isArray(list) ? list[Math.min(list.length, Math.max(1, t.tier || 1)) - 1] ?? 0 : 0; };
  // the capital stable: a permit holder's (or a clan with a town); where it is: the island side of the gate
  const capitalOk = owner => !!(state.clans?.[owner]?.permit || towns(owner).length);
  const capitalAt = owner => R()?.capital && capitalYard && capitalOk(owner) ? capitalYard : null;
  const room = (owner, cat) => towns(owner).reduce((n, t) => n + (of(t) ? tierRoom(t, cat) : 0), 0) + (capitalAt(owner) ? R().capital.room?.[cat] ?? 0 : 0);
  const NAMES = { horse: 'horses', rickshaw: 'rickshaws', omnibus: 'omnibuses' };
  const receipt = (e, c, ok, reason = '') => {
    const fr = state.frontier;
    fr.receiptSeq = (fr.receiptSeq || 0) + 1;
    fr.receipts.push({ seq: fr.receiptSeq, tick: state.tick ?? 0, clan: e.owner ?? null, action: c.action, ok, reason });
    if (!ok && state.clans?.[e.owner]) state.clans[e.owner].notice = { tick: state.tick, text: reason };
    return true;
  };
  const afford = (s, cost) => Object.entries(cost || {}).every(([r, n]) => (s.stock[r] || 0) >= n);
  // stock only through world.change (the one door for stock, frontier/world.js)
  const pay = (s, cost, sign = -1) => { for (const [r, n] of Object.entries(cost || {})) world.change(s.id, r, sign * n, sign < 0 ? 'stable' : 'stable refund'); };
  const missing = (s, cost) => Object.entries(cost || {}).filter(([r, n]) => (s.stock[r] || 0) < n).map(([r, n]) => `${n - Math.floor(s.stock[r] || 0)} ${r}`).join(', ');

  function choose(e, c) {   // which horse the hero rides (H)
    const h = state.entities[c.horse], clan = state.clans?.[e.owner];
    if (!clan || !h || h.type !== 'horse' || h.horseOwner !== e.owner) return receipt(e, c, false, 'no such horse');
    clan.mount = h.id;
    clan.notice = { tick: state.tick, text: `${h.name || 'This horse'} is your mount now (H to ride)` };
    return receipt(e, c, true);
  }
  // the capital stable: paid in clan ryo, out at once on the island side of the gate
  function buyCapital(e, c) {
    if (c.mode === 'choose') return choose(e, c);
    const C = R(), P = C?.capital, clan = state.clans?.[e.owner];
    if (!P || !capitalYard || !clan) return receipt(e, c, false, 'There is no stable in the capital');
    if (!capitalOk(e.owner)) return receipt(e, c, false, 'The capital stable sells to permit holders: buy a founding permit at the Land Office first');
    const kind = c.mode === 'horse' ? c.kind : c.mode === 'rickshaw' || c.mode === 'omnibus' ? c.mode : null, spec = kind && C.kinds?.[kind], price = kind && P.prices?.[kind];
    if (!spec || !price || (c.mode === 'horse' && spec.vehicle)) return receipt(e, c, false, 'a horse, rickshaw or omnibus');
    const cat = category(kind), max = room(e.owner, cat), want = Math.max(1, Math.min(C.queue ?? 10, Math.floor(c.count) || 1));
    let made = 0, why = '';
    while (made < want) {
      if (have(e.owner, cat) >= max) { why = `Your stables have room for ${max} ${NAMES[cat]}: upgrade a town or build a stable in another`; break; }
      if ((clan.ryo || 0) < price) { why = `Not enough ryo (${price} each)`; break; }
      clan.ryo -= price;
      (state.ryoLosses ||= []).push({ clan: clan.id ?? e.owner, amount: price, reason: `Capital stable: ${spec.name}` });
      const [x, z] = capitalYard, n = have(e.owner, cat), at = { x: x + (n % 3) * 3 - 3, z: z + Math.floor(n / 3) % 3 * 3 };
      if (cat === 'horse') (state.frontier.bornHorses ||= []).push({ owner: e.owner, kind, ...at, stable: 'capital', town: 'capital' });
      else (state.frontier.bornVehicles ||= []).push({ owner: e.owner, kind, ...at, town: 'capital', stable: 'capital' });
      made++;
    }
    if (!made) return receipt(e, c, false, why);
    clan.notice = { tick: state.tick, text: `Capital stable: ${made === 1 ? spec.name : `${made} ${NAMES[cat]}`} bought, waiting outside the island gate${why ? ` (${why.split(':')[0].toLowerCase()})` : ''}` };
    return receipt(e, c, true);
  }

  function queue(b, spec, kind) {
    const ticks = Math.round(spec.seconds * 20);
    jobsOf(b).push({ kind, left: ticks, total: ticks, cost: spec.cost });
  }

  function command(e, c) {
    if (c.action !== 'stable' && c.action !== 'station') return false;
    if (c.action === 'station') return receipt(e, c, false, 'Rickshaws and omnibuses are made at the stable now');
    if (c.town === 'capital') return buyCapital(e, c);
    const type = 'stable', C = R(type), s = typeof c.town === 'string' ? world.settlement(c.town) : null;
    if (!C || !s || s.capital) return receipt(e, c, false, 'no such town');
    if (s.owner == null || s.owner !== e.owner) return receipt(e, c, false, 'not your town');
    const clan = state.clans?.[e.owner];
    if (type === 'stable' && c.mode === 'choose') return choose(e, c);
    const b = of(s, type);
    if (!b) return receipt(e, c, false, 'Build a stable first');
    const jobs = jobsOf(b);
    if (c.mode === 'cancel') {
      const j = jobs.pop();
      if (!j) return receipt(e, c, false, 'nothing to cancel');
      pay(s, j.cost, 1);
      return receipt(e, c, true);
    }
    const kind = c.mode === 'horse' ? c.kind : c.mode === 'rickshaw' || c.mode === 'omnibus' ? c.mode : null, spec = kind && C.kinds?.[kind];
    if (!spec || (c.mode === 'horse' && spec.vehicle)) return receipt(e, c, false, 'a horse, rickshaw or omnibus');
    // count (Tim 2026-11-07): queue several at once; as many as room, the queue and stock allow
    const cat = category(kind), max = room(e.owner, cat), want = Math.max(1, Math.min(C.queue ?? 10, Math.floor(c.count) || 1));
    let made = 0, why = '';
    while (made < want) {
      if (have(e.owner, cat) >= max) { why = max ? `Your stables have room for ${max} ${NAMES[cat]}: upgrade a town or build a stable in another` : `No room for ${NAMES[cat]} yet: upgrade this town`; break; }
      if (jobs.length >= (C.queue ?? 10)) { why = 'The stable queue is full'; break; }
      if (!afford(s, spec.cost)) { why = `Not enough stock (need ${missing(s, spec.cost)})`; break; }
      pay(s, spec.cost);
      queue(b, spec, kind);
      made++;
    }
    if (!made) return receipt(e, c, false, why);
    if (want > 1 && clan) clan.notice = { tick: state.tick, text: `Stable: ${made} ${made === 1 ? spec.name : NAMES[cat]} queued${why ? ` (${why.split(':')[0].toLowerCase()})` : ''}` };
    return receipt(e, c, true);
  }

  // every tick: the first job on each bar moves on; bot towns raise one horse for their boss
  function tick() {
    for (const s of Object.values(state.frontier?.settlements || {})) {
      if (!s.owner) continue;
      const clan = state.clans?.[s.owner];
      const C = R(), b = C && of(s);
      if (!b) continue;
      const jobs = jobsOf(b);
      // a bot clan raises one horse for its boss and keeps one rickshaw, room allowing
      if (clan?.bot && !jobs.length) {
        const want = !clan.mount && have(s.owner, 'horse') < room(s.owner, 'horse') ? 'black_beauty' : have(s.owner, 'rickshaw') < Math.min(1, room(s.owner, 'rickshaw')) ? 'rickshaw' : null;
        if (want && C.kinds[want] && afford(s, C.kinds[want].cost)) { pay(s, C.kinds[want].cost); queue(b, C.kinds[want], want); }
      }
      const j = jobs[0];
      if (!j || --j.left > 0) continue;
      jobs.shift();
      const [x, z] = centre(s, b), off = data.townGrid?.cellSize || 10;
      if (category(j.kind) === 'horse') (state.frontier.bornHorses ||= []).push({ owner: s.owner, kind: j.kind, x, z: z + off, stable: `${s.id}:${b.id}`, town: s.id });
      else (state.frontier.bornVehicles ||= []).push({ owner: s.owner, kind: j.kind, x: x + off * 0.6, z: z + off, town: s.id, stable: `${s.id}:${b.id}` });
    }
  }
  // finished horses / vehicles for sim/mounts.js and sim/omnibus.js to bring out (taken once)
  function born() { const out = state.frontier?.bornHorses || []; if (state.frontier) state.frontier.bornHorses = []; return out; }
  function bornVehicles() { const out = state.frontier?.bornVehicles || []; if (state.frontier) state.frontier.bornVehicles = []; return out; }
  return { command, tick, of, born, bornVehicles, horsesOf, jobsOf, centre, parkedAt, room, have, category, capitalAt, capitalOk };
}
