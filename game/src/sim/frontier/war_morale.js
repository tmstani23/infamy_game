// War morale (frontier plan F6, checkpoint 8a-1, Tim 2026-11-14): the progress bar of a war, one per side.
// Rules only: no DOM, no randomness. Numbers: data.war.morale.
// A side's bar counts buildings only, each with a weight (morale.weights[type]; no weight = not counted):
//   the town:  its town hall and its military buildings (today the stockade; 8b adds the rest)
//   the camp:  its camp hall, training buildings and watchtowers
// Walls, palisades, gates, supply tents, the field clinic and gather camps never count.
// Bar = weight still standing over the weight of every counted building that has stood during this war, so a
// repaired or newly built one raises it again. A building counts from the moment it is first seen built; the
// hall counts from the start whatever its state.
// Kept on the war record (saved with it): war.morale = { town: { seen }, camp: { seen }, last }
//   seen[id] = { type, up }   id = the building's first cell (town) or its id (camp)
//   last = { side, type, amount, pct, tick }   the latest drop, for the war bar's line
// A drop also goes out as news for the screen: { kind: 'moraleDrop', war, side, type, amount, pct }.
// ready(side): every counted building of that side is down and its hall is a ruin: the other side's hero may
// channel there (8a-3).
// createWarMorale({ state, data, war }) -> { tick, view, ready, pct }
export function createWarMorale({ state, data, war }) {
  const M = () => data.war?.morale || null;
  const weightOf = type => M()?.weights?.[type] || 0;
  const HALL = { town: 'town_hall', camp: 'camp_hall' };
  const town = id => state.frontier?.settlements?.[id] || null;
  // the counted buildings of a side as they are now: [{ id, type, up }]
  function now(w, side) {
    const list = side === 'town' ? town(w.town)?.buildings || [] : w.camp?.buildings || [];
    const out = [];
    for (const b of list) {
      if (!weightOf(b.type) || (b.stage !== 'built' && b.stage !== 'ruined')) continue;
      out.push({ id: String(side === 'town' ? b.cells?.[0] ?? b.cell : b.id), type: b.type, up: b.stage === 'built' });
    }
    return out;
  }
  const sums = seen => { let total = 0, standing = 0; for (const v of Object.values(seen)) { const n = weightOf(v.type); total += n; if (v.up) standing += n; } return { total, standing }; };
  const pctOf = seen => { const { total, standing } = sums(seen); return total ? Math.round(100 * standing / total) : 0; };
  function sideTick(w, side) {
    const m = (w.morale ||= {}), rec = (m[side] ||= { seen: {} }), seen = rec.seen, here = new Map(now(w, side).map(b => [b.id, b]));
    const before = pctOf(seen), fell = [];
    for (const [id, b] of here) {
      const was = seen[id];
      if (!was) { if (b.up || b.type === HALL[side]) seen[id] = { type: b.type, up: b.up }; }
      else { if (was.up && !b.up) fell.push(b.type); was.up = b.up; was.type = b.type; }
    }
    for (const [id, v] of Object.entries(seen)) if (v.up && !here.has(id)) { v.up = false; fell.push(v.type); }   // gone altogether
    if (!fell.length) return;
    const after = pctOf(seen), amount = before - after;
    for (const type of fell) {
      const share = fell.length > 1 ? Math.round(amount * weightOf(type) / Math.max(1, fell.reduce((n, t) => n + weightOf(t), 0))) : amount;
      m.last = { side, type, amount: share, pct: after, tick: state.tick ?? 0 };
      (state.news ||= []).push({ kind: 'moraleDrop', war: w.id, side, type, amount: share, pct: after });
    }
  }
  function tick() {
    if (!M()) return;
    for (const w of war.active()) { sideTick(w, 'town'); sideTick(w, 'camp'); }
  }
  // what the war bar shows for one side (read-only: never creates records)
  function sideView(w, side) {
    const seen = w.morale?.[side]?.seen || {}, { total, standing } = sums(seen), group = up => {
      const by = {};
      for (const v of Object.values(seen)) if (v.up === up) (by[v.type] ||= { type: v.type, n: 0, weight: weightOf(v.type) }).n++;
      return Object.values(by).sort((a, b) => b.weight - a.weight || (a.type < b.type ? -1 : 1));
    };
    return { pct: total ? Math.round(100 * standing / total) : 0, total, standing, ready: total > 0 && standing === 0, up: group(true), down: group(false) };
  }
  function view(warId) {
    const w = war.byId(warId);
    return w ? { town: sideView(w, 'town'), camp: sideView(w, 'camp'), last: w.morale?.last || null } : null;
  }
  const ready = (warId, side) => !!view(warId)?.[side]?.ready;
  const pct = (warId, side) => view(warId)?.[side]?.pct ?? 0;
  return { tick, view, ready, pct };
}
