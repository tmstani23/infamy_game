// Frontier world records (frontier plan F2.2, F2.2b). Builds state.frontier from data/frontier.json
// and is the ONE door for stock and ownership: stock changes only through change(), which also
// writes the running totals and the display ledger. Nothing else assigns .stock or .owner on
// frontier records (game/tools/test_frontier_guards.mjs scans for it).
// All state is plain data (no functions, Maps or Sets), so save/load and the worker carry it as is.
// Ids: `${prefix}${state.frontier.nextId++}`, e.g. 'p1' project, 'b2' building, 'h3' shipment.
// Data keys that start with '_' are notes and are ignored.
import { debitRyo, creditRyo } from '../treasury.js';
import { ensureWorkers } from './workers.js';
import { storageCap } from './storage.js';
import { noteFlow } from './flow.js';
const LEDGER_MAX = 500;
const EPS = 1e-6;
const plain = o => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));

export function createFrontierWorld({ state, data }) {
  if (!state.frontier) state.frontier = build(data);
  const f = state.frontier;
  f.version=Math.max(f.version || 1,data.version || 1); // additive worker-order support; retain all saved records
  for (const s of Object.values(f.settlements)) {
    ensureWorkers(s);
    // Reserve future placement without deleting anything from an existing town.
    if (s.founded !== undefined) s.roadReserve ??= data.townGrid?.hallRoadReserve || 0;
  }

  function build(d) {
    const fr = { version: 1, nextId: 1, econTick: 0, settlements: {}, roads: {}, shipments: {}, armies: {}, totals: {}, ledger: [], receipts: [] };
    for (const [id, s] of Object.entries(d.settlements || {})) {
      const rec = {
        id, name: s.name, region: s.region, owner: s.owner ?? null, site: s.site ?? null, capital: !!s.capital,
        pop: s.pop || 0, housing: 0, workforce: s.pop || 0,
        stock: Object.fromEntries(d.resources.map(r => [r, s.stock?.[r] || 0])),
        buildings: (s.buildings || []).map((b, i) => ({ id: `${id}:${i}`, type: b.type, cell: b.cell ?? null, stage: b.stage || 'built', workers: 0 })),
        projects: [], workers: [], workerTraining: [], priority: s.priority || 'grow', budget: { ryo: 0 },
        report: { doing: '', next: '', waiting: [] }, grid: null
      };
      rec.housing = housingOf(rec, d);
      fr.settlements[id] = rec;
      fr.totals[id] = Object.fromEntries(d.resources.map(r => [r, { in: 0, out: 0, start: rec.stock[r] }]));
    }
    for (const [id, r] of Object.entries(d.roads || {})) {
      fr.roads[id] = { id, from: r.from, to: r.to, length: r.length, state: 'working', blockedAt: null };
    }
    return fr;
  }

  function housingOf(s, d = data) {
    let n = 0;
    for (const b of s.buildings) if (b.stage === 'built') n += d.buildings[b.type]?.housing || 0;
    return n + (s.zoneHousing || 0);   // L3.3: housing zones (zones.js keeps zoneHousing)
  }
  // A town founded in play (E3): the one door for new settlement records. Starts with the given
  // stock, so the totals invariant (start + in - out = stock) holds from the first tick.
  function addTown({ id, name, region, owner, x, z, site, traits, pop, stock, buildings, roadReserve = 0 }) {
    if (f.settlements[id]) throw new Error(`[frontier] addTown: ${id} exists`);
    const rec = {
      id, name, region, owner, site: site ?? null, capital: false, x, z, traits, founded: state.tick ?? 0, roadReserve,
      pop, housing: 0, workforce: pop,
      stock: Object.fromEntries(data.resources.map(r => [r, stock?.[r] || 0])),
      buildings: buildings.map((b, i) => ({ id: `${id}:${i}`, type: b.type, cell: b.cell ?? null, stage: b.stage || 'built', workers: 0 })),
      projects: [], workers: [], workerTraining: [], priority: 'grow', budget: { ryo: 0 },
      report: { doing: '', next: '', waiting: [] }, grid: null
    };
    rec.housing = housingOf(rec, data);
    f.settlements[id] = rec;
    f.totals[id] = Object.fromEntries(data.resources.map(r => [r, { in: 0, out: 0, start: rec.stock[r] }]));
    return rec;
  }
  // The founding fee comes out of the clan's treasury (the capital's ryo mirrors it).
  function payFounding(clan, cost, sid) {
    debitRyo(state, clan, cost, `Founded ${sid}`);
    syncCapital();
  }
  const nameOf = s => (typeof s === 'string' ? s : s.id);
  const settlement = id => f.settlements[nameOf(id)] || null;
  const newId = prefix => `${prefix}${f.nextId++}`;

  // Display log (last LEDGER_MAX entries) plus the running totals the invariant check uses.
  function ledgerAdd({ settlement: sid, resource, delta, reason }) {
    const id = nameOf(sid), t = f.totals[id]?.[resource];
    if (!t) throw new Error(`[frontier] ledgerAdd: unknown ${id}/${resource}`);
    if (delta > 0) t.in += delta; else t.out -= delta;
    f.ledger.push({ tick: state.tick ?? 0, settlement: id, resource, delta, reason });
    if (f.ledger.length > LEDGER_MAX) f.ledger.splice(0, f.ledger.length - LEDGER_MAX);
  }

  // The only stock writer. A change that would take stock below zero is a bug in the caller.
  function change(sid, resource, delta, reason) {
    const s = settlement(sid);
    if (!s || !(resource in s.stock)) throw new Error(`[frontier] change: unknown ${nameOf(sid)}/${resource}`);
    if (!Number.isFinite(delta)) throw new Error('[frontier] change: delta must be a number');
    if (delta === 0) return s.stock[resource];
    const clan = capitalClan(s, resource);
    if (clan) {   // the capital's ryo IS the owner clan's city treasury (F2.9)
      if (clan.ryo + delta < -EPS) throw new Error(`[frontier] change: ${s.id} ryo would go negative`);
      if (delta < 0) debitRyo(state, clan, -delta, `frontier ${reason}`); else creditRyo(state, clan, delta, `frontier ${reason}`);
      s.stock.ryo = clan.ryo;
      ledgerAdd({ settlement: s.id, resource, delta, reason });
      return s.stock.ryo;
    }
    if (s.stock[resource] + delta < -EPS) throw new Error(`[frontier] change: ${s.id} ${resource} would go negative`);
    // B2 storage caps: a gain stops at the cap (stock already above it stays); the rest is lost as overflow.
    if (delta > 0) {
      const room = Math.max(0, storageCap(s, data, resource) - s.stock[resource]);
      if (delta > room) { (s.overflow ||= {})[resource] = (s.overflow[resource] || 0) + delta - room; delta = room; }
      if (delta <= 0) return s.stock[resource];
    }
    s.stock[resource] = Math.max(0, s.stock[resource] + delta);
    noteFlow(s, resource, delta, reason);   // Usage page per-minute flows
    ledgerAdd({ settlement: s.id, resource, delta, reason });
    return s.stock[resource];
  }

  // The capital's ryo mirrors its owner's clan treasury; any other settlement keeps its own stock.
  function capitalClan(s, resource) {
    return s.capital && resource === 'ryo' && s.owner ? state.clans?.[s.owner] || null : null;
  }
  // Keeps the mirror fresh when the treasury changed elsewhere (shops, payouts); the hub calls it each tick.
  function syncCapital() {
    for (const s of Object.values(f.settlements)) {
      const clan = capitalClan(s, 'ryo');
      if (clan) s.stock.ryo = clan.ryo;
    }
  }
  // Fixture towns only (tests and the dev_frontier save): data flag startOwner 'player' | 'bot' becomes a clan id.
  function assignStartOwners({ player, bot }) {
    for (const [id, d] of Object.entries(data.settlements || {})) {
      const clan = d.startOwner === 'player' ? player : d.startOwner === 'bot' ? bot : null;
      if (clan && f.settlements[id]) setOwner(id, clan);
    }
    syncCapital();
  }

  // The only owner writer (ownership has one door, like stock).
  function setOwner(sid, clan) {
    const s = settlement(sid);
    if (!s) throw new Error(`[frontier] setOwner: unknown ${nameOf(sid)}`);
    s.owner = clan ?? null;
  }

  // The only road-state writer ('working' | 'threatened' | 'blocked'); F3 raids and the dev helper use it.
  function setRoadState(rid, st) {
    const r = f.roads[rid];
    if (!r) throw new Error(`[frontier] setRoadState: unknown road ${rid}`);
    if (!['working', 'threatened', 'blocked'].includes(st)) throw new Error('[frontier] setRoadState: bad state');
    r.state = st; r.blockedAt = st === 'blocked' ? state.tick ?? 0 : null;
  }

  // Town priority list (F4.4b): the order decides who gets capital supplies, imports and recruits first.
  // townOrder(clan) always lists exactly the clan's non-capital towns (saved order first, new towns last).
  function townOrder(clan) {
    const own = Object.values(f.settlements).filter(s => s.owner === clan && !s.capital).map(s => s.id);
    const saved = (f.townOrder?.[clan] || []).filter(id => own.includes(id));
    return [...saved, ...own.filter(id => !saved.includes(id))];
  }
  // Only call with a full permutation of townOrder(clan); the command checks that.
  function setTownOrder(clan, ids) {
    (f.townOrder ||= {})[clan] = [...ids];
  }

  // The only pop writer. People arrive or leave, never die; logged in the display ledger as 'pop'.
  function changePop(sid, delta, reason) {
    const s = settlement(sid);
    if (!s) throw new Error(`[frontier] changePop: unknown ${nameOf(sid)}`);
    if (!Number.isInteger(delta)) throw new Error('[frontier] changePop: delta must be a whole number');
    if (s.pop + delta < 0) throw new Error(`[frontier] changePop: ${s.id} pop would go negative`);
    s.pop += delta;
    s.workforce = s.pop;
    f.ledger.push({ tick: state.tick ?? 0, settlement: s.id, resource: 'pop', delta, reason });
    if (f.ledger.length > LEDGER_MAX) f.ledger.splice(0, f.ledger.length - LEDGER_MAX);
    return s.pop;
  }

  // Housing and workforce are derived from the buildings and the population.
  function recount(sid) {
    const s = settlement(sid);
    s.housing = housingOf(s);
    s.workforce = s.pop;
    return s;
  }

  // Throws in tests; the game calls logInvariants() instead (console only).
  function checkInvariants() {
    const bad = m => { throw new Error(`[frontier invariant] ${m}`); };
    const seen = new Set();
    for (const s of Object.values(f.settlements)) {
      if (!Number.isInteger(s.pop) || s.pop < 0) bad(`${s.id} pop ${s.pop}`);
      for (const [r, v] of Object.entries(s.stock)) {
        if (!Number.isFinite(v) || v < -EPS) bad(`${s.id} ${r} stock ${v}`);
        const t = f.totals[s.id]?.[r];
        if (!t) bad(`${s.id} ${r} has no totals`);
        const clan = capitalClan(s, r);
        if (clan) { if (Math.abs(clan.ryo - v) > EPS * Math.max(1, Math.abs(v))) bad(`${s.id} ryo ${v} != treasury ${clan.ryo}`); continue; }
        const expect = t.start + t.in - t.out;
        if (Math.abs(expect - v) > EPS * Math.max(1, Math.abs(expect))) bad(`${s.id} ${r} stock ${v} != start+in-out ${expect}`);
      }
      for (const b of s.buildings) {
        if (seen.has(b.id)) bad(`building id ${b.id} twice`);
        seen.add(b.id);
      }
    }
    for (const r of Object.values(f.roads)) if (!f.settlements[r.from] || !f.settlements[r.to]) bad(`road ${r.id} has a missing end`);
    return true;
  }
  function logInvariants() {
    try { return checkInvariants(); } catch (err) { console.error(err.message); return false; }
  }

  return { frontier: f, newId, addTown, payFounding, settlement, ledgerAdd, change, changePop, setOwner, setRoadState, townOrder, setTownOrder, assignStartOwners, syncCapital, recount, checkInvariants, logInvariants };
}
