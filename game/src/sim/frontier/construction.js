// Frontier construction projects (frontier plan F2.6).
// createConstruction({ state, data, world }) -> { queue, authorize, cancel, find, run, econTick }.
// A project is { id, type, cell, cost, paid, progress, need, authorized, replaces? }. Only the first
// authorized project in a town moves at a time: it pays its full cost once (world.change, reason
// 'build'), then gains `progress` equal to the town's builders each economy tick until `need`,
// and becomes a building. `replaces` (a building id) repairs or rebuilds that building on its spot.
// Plain data only, so a half-built project survives save/load and structuredClone.
import { freeCell, setUse, inCore, hallRoadCell,cellOffset } from './town_grid.js';
import { buildingSafety } from './building_safety.js';
import {coversResources} from './resource_clearance.js';
const EPS = 1e-9;

export function createConstruction({ state, data, world,resourceIndex }) {
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
    if(s.grid && !opts.cells && !opts.replaces) {
      const {n}=s.grid,size=t.size || 1;
      const cover=a=>{
        if(!Number.isInteger(a) || a<0 || a>=n*n || a%n+size>n || Math.floor(a/n)+size>n)return null;
        return Array.from({length:size*size},(_,i)=>a+Math.floor(i/size)*n+i%size);
      };
      const allowed=a=>{
        const cells=cover(a);
        return cells && cells.every(i=>s.grid.use[i]==='.' && s.grid.zone[i]==='.' && s.grid.ground[i]!=='x' && !hallRoadCell(s,i) && !s.railCells?.[i])
          && !coversResources(s,cells,resourceIndex,data.founding?.unitClearance) && !buildingSafety(s,cells,state,data.founding?.unitClearance) ? cells:null;
      };
      if(cell===null) {
        const candidates=[];
        for(let i=0;i<n*n;i++)if(s.grid.ground[i]==='c' && s.grid.use[i]==='.' && s.grid.zone[i]==='.' && inCore(s,i,data) && !hallRoadCell(s,i)) {
          const [x,z]=cellOffset(s,i);candidates.push({i,d:x*x+z*z});
        }
        candidates.sort((a,b)=>a.d-b.d || a.i-b.i);cell=candidates.find(c=>allowed(c.i))?.i ?? null;
      }
      const cells=allowed(cell);if(!cells)return null;
      opts={...opts,cells};
    }
    if (cell === null && s.grid) cell = freeCell(s, data);   // grid towns (L3.1): nearest free cleared core cell
    if (cell === null && s.grid) return null;                   // the core is full
    if (cell !== null && s.grid && s.grid.use[cell] === '.') setUse(s, cell, 'B');
    if (cell === null && s.x !== undefined) {   // towns not on a grid yet lay out on spiral slots (town_layout.js): first free one
      const used = new Set([...s.buildings, ...s.projects].map(b => b.cell));
      cell = 1; while (used.has(cell)) cell++;
    }
    const p = { id: world.newId('p'), type, cell, cost: { ...t.cost }, paid: false, progress: 0, need: t.buildTicks, authorized: false };
    if (opts.replaces) p.replaces = opts.replaces;
    if (opts.cells) {   // L3.2: a placed building may cover several cells (2x2); `cell` stays the anchor
      p.cells = opts.cells.slice();
      for (const i of p.cells) if (s.grid.use[i] === '.') setUse(s, i, 'B');
      p.phase = p.cells.every(i => s.grid.ground[i] === 'c') ? 'cleared' : 'clearing';   // cleared -> frame -> finished
    }
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
  function cancel(pid, { refund = true } = {}) {
    const hit = find(pid);
    if (!hit) return false;
    const { settlement: s, project: p, index } = hit;
    if (refund && p.paid && p.progress === 0) for (const [r, n] of Object.entries(p.cost)) world.change(s.id, r, n, 'refund');
    if (s.grid && p.cell !== null && !s.buildings.some(b => b.cell === p.cell)) for (const i of p.cells || [p.cell]) setUse(s, i, '.');
    s.projects.splice(index, 1);
    return true;
  }

  function finish(s, p) {
    const reason = buildingSafety(s,p.cells || [p.cell],state,data.founding?.unitClearance);
    if(reason) {wait(s,reason);return false;}
    const rebuilt = p.replaces && s.buildings.find(b => b.id === p.replaces);
    if (rebuilt) rebuilt.stage = 'built';
    else s.buildings.push({ id: world.newId('b'), type: p.type, cell: p.cell, ...(p.cells ? { cells: p.cells } : {}), stage: 'built', workers: 0, paidCost: {...p.cost} });
    s.projects.splice(s.projects.indexOf(p), 1);
    world.recount(s.id);
    return true;
  }

  function econTick(s) {
    // One project moves at a time: one already paid for, else the first that the stock can pay now,
    // else the first in line (which then waits for its materials). A costly project waiting for timber
    // must not block a cheap one that can be built (Tim's playtest 2026-11-04).
    const auth = s.projects.filter(x => x.authorized);
    const p = auth.find(x => x.paid) || auth.find(x => Object.entries(x.cost).every(([r, n]) => s.stock[r] + EPS >= n)) || auth[0];
    if (!p) return;
    if (p.phase === 'clearing') { wait(s, 'workers'); return; }   // L3.5 workers clear the footprint over time
    if (!p.paid) {
      const reserve = data.opening && !s.workers?.length && !s.workerTraining?.length ? data.workers.cost : 0;
      if (p.cost.ryo && s.stock.ryo - p.cost.ryo < reserve) { wait(s, 'ryo reserved for first worker'); return; }
      const missing = Object.entries(p.cost).filter(([r, n]) => s.stock[r] + EPS < n).map(([r]) => r);
      if (missing.length) { for (const r of missing) wait(s, r); return; }
      for (const [r, n] of Object.entries(p.cost)) world.change(s.id, r, -n, 'build');
      p.paid = true;
      if (p.phase) p.phase = 'frame';
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
