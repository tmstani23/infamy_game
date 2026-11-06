// Stable and omnibus station (Tim 2026-11-06, plan in project files omnibus_stable/plan.md): placed town
// buildings with a production bar, one job at a time, made by hand (nothing on its own, except one horse
// for a bot clan's boss). Costs are town stock, never ryo.
//  - stable (data.buildings.stable.stable): horses (kinds calico, black_beauty), at most maxHorses per stable.
//    A finished horse waits at the stable for sim/mounts.js to bring it out (born()).
//  - station (data.buildings.station.station): rickshaws (up to maxRickshaws parked at it) and omnibuses
//    (at most maxOmnibuses per clan). They come out empty and park at the station (bornVehicles(),
//    sim/omnibus.js park()). Space at a station is rickshaw travel (sim/station_travel.js).
// Command (through the frontier hub): { id: <hero id>, type: 'frontier', action: 'stable' | 'station', town,
//   mode: 'horse' (kind) | 'rickshaw' | 'omnibus' | 'cancel' (the last job, refunded) | 'choose' (horse: id) }
// createStable({ state, data, world }) -> { command, tick, of, born, bornVehicles, horsesOf, jobsOf, centre, parkedAt }
import { cellToWorld } from './town_grid.js';

export function createStable({ state, data, world }) {
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
  const queuedAll = (owner, kind) => Object.values(state.frontier.settlements || {}).reduce((n, t) => n + (t.owner === owner ? (of(t, 'station')?.stableJobs || []).filter(j => j.kind === kind).length : 0), 0);
  const receipt = (e, c, ok, reason = '') => {
    const fr = state.frontier;
    fr.receiptSeq = (fr.receiptSeq || 0) + 1;
    fr.receipts.push({ seq: fr.receiptSeq, tick: state.tick ?? 0, clan: e.owner ?? null, action: c.action, ok, reason });
    if (!ok && state.clans?.[e.owner]) state.clans[e.owner].notice = { tick: state.tick, text: reason };
    return true;
  };
  const afford = (s, cost) => Object.entries(cost || {}).every(([r, n]) => (s.stock[r] || 0) >= n);
  const pay = (s, cost, sign = -1) => { for (const [r, n] of Object.entries(cost || {})) s.stock[r] = (s.stock[r] || 0) + sign * n; };
  const missing = (s, cost) => Object.entries(cost || {}).filter(([r, n]) => (s.stock[r] || 0) < n).map(([r, n]) => `${n - Math.floor(s.stock[r] || 0)} ${r}`).join(', ');

  function queue(b, spec, kind) {
    const ticks = Math.round(spec.seconds * 20);
    jobsOf(b).push({ kind, left: ticks, total: ticks, cost: spec.cost });
  }

  function command(e, c) {
    if (c.action !== 'stable' && c.action !== 'station') return false;
    const type = c.action, C = R(type), s = typeof c.town === 'string' ? world.settlement(c.town) : null;
    if (!C || !s || s.capital) return receipt(e, c, false, 'no such town');
    if (s.owner == null || s.owner !== e.owner) return receipt(e, c, false, 'not your town');
    const clan = state.clans?.[e.owner];
    if (type === 'stable' && c.mode === 'choose') {   // which horse the hero rides (H)
      const h = state.entities[c.horse];
      if (!h || h.type !== 'horse' || h.horseOwner !== e.owner) return receipt(e, c, false, 'no such horse');
      clan.mount = h.id;
      clan.notice = { tick: state.tick, text: `${h.name || 'This horse'} is your mount now (H to ride)` };
      return receipt(e, c, true);
    }
    const b = of(s, type);
    if (!b) return receipt(e, c, false, type === 'stable' ? 'Build a stable first' : 'Build an omnibus station first');
    const jobs = jobsOf(b);
    if (c.mode === 'cancel') {
      const j = jobs.pop();
      if (!j) return receipt(e, c, false, 'nothing to cancel');
      pay(s, j.cost, 1);
      return receipt(e, c, true);
    }
    if (jobs.length >= (C.queue ?? 3)) return receipt(e, c, false, `The ${type} is busy (too many jobs waiting)`);
    const kind = type === 'stable' ? (c.mode === 'horse' ? c.kind : null) : c.mode, spec = kind && C.kinds?.[kind];
    if (!spec) return receipt(e, c, false, type === 'stable' ? 'no such horse' : 'rickshaw or omnibus');
    if (type === 'stable' && horsesOf(s, b) + jobs.length >= (C.maxHorses ?? 3)) return receipt(e, c, false, `This stable holds ${C.maxHorses ?? 3} horses`);
    if (kind === 'rickshaw' && parkedAt(s, b, 'rickshaw').length + jobs.filter(j => j.kind === 'rickshaw').length >= (C.maxRickshaws ?? 3)) return receipt(e, c, false, `This station holds ${C.maxRickshaws ?? 3} rickshaws`);
    if (kind === 'omnibus') {
      const have = Object.values(state.entities).filter(v => v.type === 'omnibus' && v.omnibusOwner === e.owner && !v.dead).length + queuedAll(e.owner, 'omnibus');
      if (have >= (C.maxOmnibuses ?? 2)) return receipt(e, c, false, `You can keep ${C.maxOmnibuses ?? 2} omnibuses`);
    }
    if (!afford(s, spec.cost)) return receipt(e, c, false, `Not enough stock (need ${missing(s, spec.cost)})`);
    pay(s, spec.cost);
    queue(b, spec, kind);
    return receipt(e, c, true);
  }

  // every tick: the first job on each bar moves on; bot towns raise one horse for their boss
  function tick() {
    for (const s of Object.values(state.frontier?.settlements || {})) {
      if (!s.owner) continue;
      const clan = state.clans?.[s.owner];
      for (const type of ['stable', 'station']) {
        const C = R(type), b = C && of(s, type);
        if (!b) continue;
        const jobs = jobsOf(b);
        if (type === 'stable' && clan?.bot && !jobs.length && !clan.mount && !(state.frontier.bornHorses || []).some(h => h.owner === s.owner)
          && !Object.values(state.entities).some(e => e.type === 'horse' && e.horseOwner === s.owner) && C.kinds.black_beauty && afford(s, C.kinds.black_beauty.cost)) { pay(s, C.kinds.black_beauty.cost); queue(b, C.kinds.black_beauty, 'black_beauty'); }
        if (type === 'station' && clan?.bot && !jobs.length && C.kinds.rickshaw && !parkedAt(s, b, 'rickshaw').length && afford(s, C.kinds.rickshaw.cost)) { pay(s, C.kinds.rickshaw.cost); queue(b, C.kinds.rickshaw, 'rickshaw'); }
        const j = jobs[0];
        if (!j || --j.left > 0) continue;
        jobs.shift();
        const [x, z] = centre(s, b), off = data.townGrid?.cellSize || 10;
        if (type === 'stable') (state.frontier.bornHorses ||= []).push({ owner: s.owner, kind: j.kind, x, z: z + off, stable: `${s.id}:${b.id}`, town: s.id });
        else (state.frontier.bornVehicles ||= []).push({ owner: s.owner, kind: j.kind, x: x + off * 0.6, z: z + off, town: s.id });
      }
    }
  }
  // finished horses / vehicles for sim/mounts.js and sim/omnibus.js to bring out (taken once)
  function born() { const out = state.frontier?.bornHorses || []; if (state.frontier) state.frontier.bornHorses = []; return out; }
  function bornVehicles() { const out = state.frontier?.bornVehicles || []; if (state.frontier) state.frontier.bornVehicles = []; return out; }
  return { command, tick, of, born, bornVehicles, horsesOf, jobsOf, centre, parkedAt };
}
