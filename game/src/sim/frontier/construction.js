// Frontier construction projects (frontier plan F2.6).
// createConstruction({ state, data, world }) -> { queue, authorize, cancel, find, run, econTick }.
// A project is { id, type, cell, cost, paid, progress, need, authorized, replaces? }. Only the first
// authorized project in a town moves at a time: it pays its full cost once (world.change, reason
// 'build'), then gains `progress` equal to the town's builders each economy tick until `need`,
// and becomes a building. `replaces` (a building id) repairs or rebuilds that building on its spot.
// Plain data only, so a half-built project survives save/load and structuredClone.
const EPS = 1e-9;

export function createConstruction({ state, data, world }) {
  const f = () => state.frontier;
  const wait = (s, what) => { if (!s.report.waiting.includes(what)) s.report.waiting.push(what); };

  function find(pid) {
    for (const s of Object.values(f().settlements)) {
      const i = s.projects.findIndex(p => p.id === pid);
      if (i >= 0) return { settlement: s, project: s.projects[i], index: i };
    }
    return null;
  }

  // Adds an unauthorized, unpaid project. Returns its id, or null for an unknown town or building.
  function queue(sid, type, cell = null, opts = {}) {
    const s = world.settlement(sid), t = data.buildings[type];
    if (!s || !t) return null;
    if (cell === null && s.x !== undefined) {   // founded towns lay out on slots (town_layout.js): first free one
      const used = new Set([...s.buildings, ...s.projects].map(b => b.cell));
      cell = 1; while (used.has(cell)) cell++;
    }
    const p = { id: world.newId('p'), type, cell, cost: { ...t.cost }, paid: false, progress: 0, need: t.buildTicks, authorized: false };
    if (opts.replaces) p.replaces = opts.replaces;
    s.projects.push(p);
    return p.id;
  }

  function authorize(pid) {
    const hit = find(pid);
    if (!hit) return false;
    hit.project.authorized = true;
    return true;
  }

  // First slice: refund everything if nothing has been built yet (progress 0), else nothing.
  function cancel(pid) {
    const hit = find(pid);
    if (!hit) return false;
    const { settlement: s, project: p, index } = hit;
    if (p.paid && p.progress === 0) for (const [r, n] of Object.entries(p.cost)) world.change(s.id, r, n, 'refund');
    s.projects.splice(index, 1);
    return true;
  }

  function finish(s, p) {
    const rebuilt = p.replaces && s.buildings.find(b => b.id === p.replaces);
    if (rebuilt) rebuilt.stage = 'built';
    else s.buildings.push({ id: world.newId('b'), type: p.type, cell: p.cell, stage: 'built', workers: 0 });
    s.projects.splice(s.projects.indexOf(p), 1);
    world.recount(s.id);
  }

  function econTick(s) {
    const p = s.projects.find(x => x.authorized);
    if (!p) return;
    if (!p.paid) {
      const missing = Object.entries(p.cost).filter(([r, n]) => s.stock[r] + EPS < n).map(([r]) => r);
      if (missing.length) { for (const r of missing) wait(s, r); return; }
      for (const [r, n] of Object.entries(p.cost)) world.change(s.id, r, -n, 'build');
      p.paid = true;
      return;
    }
    if (!s.builders) { wait(s, 'builders'); return; }
    p.progress = Math.min(p.need, p.progress + s.builders);
    if (p.progress >= p.need) finish(s, p);
  }

  function run() {
    for (const s of Object.values(f().settlements)) if (!s.capital) econTick(s);
  }

  return { queue, authorize, cancel, find, run, econTick };
}
