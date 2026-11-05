// Placing and removing on the town grid, with the trap check (Loop 3, card L3.2).
// createPlacement({ state, data, world, construction }) -> { place, check, remove, trapped, footprint }.
// place(s, { kind, cells, by }) -> receipt { ok, reason, cost, cells }; check() is the same without
// changing anything (the build bar's ghost rectangle uses it). kind is road | wall | gate, or a
// building type with a `size` in frontier.json (1 = 1x1, 2 = 2x2; `cells` then holds the one anchor,
// the top-left cell). Roads, walls and gates are paid at once (data.placeCosts per cell); a building
// becomes a normal construction project (stock paid when it starts, as before).
// Trap check: a flood fill from outside the grid over free cells, roads and gates (walls and
// buildings block it). A placement is refused when it newly cuts a building, project or zoned cell
// off from that flood. "New" matters: a town founded in an awkward pocket is never frozen by it.
// A closed wall ring therefore needs a gate; the gate cell is passable and reaches outside.
// Overgrown ground is allowed: a project on it starts in phase 'clearing' (L3.3's work order clears it).
import { cellOffset, inCore, setUse, hallRoadCell, nearCliff } from './town_grid.js';
import { buildingSafety } from './building_safety.js';
import { coversResources } from './resource_clearance.js';
import { placedRoom } from './tiers.js';

const LINES = { road: 'r', wall: 'w', gate: 'g' };
const put = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);

export function createPlacement({ state, data, world, construction, resourceIndex }) {
  const sizeOf = kind => (data.buildings[kind]?.size) | 0;

  // Cells a placement covers: a line kind covers each listed cell, a building its 1x1 or 2x2 footprint.
  // Returns null when a footprint runs off the grid edge.
  function footprint(s, kind, cells) {
    if (LINES[kind]) return cells.slice();
    const { n } = s.grid, a = cells[0], size = sizeOf(kind);
    const out = [];
    for (let dz = 0; dz < size; dz++) for (let dx = 0; dx < size; dx++) {
      if ((a % n) + dx >= n || Math.floor(a / n) + dz >= n) return null;
      out.push(a + dz * n + dx);
    }
    return out;
  }

  const unit = s => {   // the things that must stay reachable: [{key, cells}]
    const out = [];
    for (const b of [...s.buildings, ...s.projects]) out.push({ key: `b:${b.id}`, cells: b.cells || [b.cell] });
    for (let i = 0; i < s.grid.zone.length; i++) if (s.grid.zone[i] !== '.') out.push({ key: `z:${i}`, cells: [i] });
    return out;
  };

  // Keys of things with no path to the outside under grid `g` (use string overridable for a what-if)
  function trapped(s, use = s.grid.use) {
    const g = s.grid, { n } = g, N = n * n, seen = new Uint8Array(N), stack = [];
    const outside = i => {
      const col = i % n, row = (i - col) / n;
      if (col === 0 || row === 0 || col === n - 1 || row === n - 1) return true;
      const [ox, oz] = cellOffset(s, i);
      return Math.hypot(ox, oz) > data.townGrid.radius + g.cell;   // beyond the town's range: open country
    };
    const passable = i => (use[i] === '.' || use[i] === 'r' || use[i] === 'g') && (g.ground[i] !== 'x' || outside(i));
    for (let i = 0; i < N; i++) if (outside(i) && passable(i)) { seen[i] = 1; stack.push(i); }
    while (stack.length) {
      const i = stack.pop(), col = i % n;
      for (const j of [col > 0 ? i - 1 : -1, col < n - 1 ? i + 1 : -1, i - n, i + n]) {
        if (j < 0 || j >= N || seen[j] || !passable(j)) continue;
        seen[j] = 1; stack.push(j);
      }
    }
    const reached = (c) => {   // a cell is reached if flooded, or any 4-neighbour is
      if (seen[c]) return true;
      const col = c % n;
      return (col > 0 && seen[c - 1]) || (col < n - 1 && seen[c + 1]) || (c - n >= 0 && seen[c - n]) || (c + n < N && seen[c + n]);
    };
    return new Set(unit(s).filter(u => !u.cells.some(reached)).map(u => u.key));
  }

  function costOf(kind, count) {
    const per = LINES[kind] ? data.placeCosts?.[kind] : data.buildings[kind]?.cost;
    const out = {};
    for (const [r, v] of Object.entries(per || {})) out[r] = v * (LINES[kind] ? count : 1);
    return out;
  }

  const bad = (reason, cells = []) => ({ ok: false, reason, cost: {}, cells });

  // Validates without changing anything. Returns a receipt; ok:true means place() would succeed.
  function check(s, { kind, cells }) {
    if (!s?.grid) return bad('no grid');
    const g = s.grid, { n } = g;
    const placed = LINES[kind] || (data.buildings[kind] && sizeOf(kind) > 0);
    if (!placed) return bad('unknown kind');
    if (!Array.isArray(cells) || !cells.length || !cells.every(i => Number.isInteger(i)) || new Set(cells).size !== cells.length) return bad('cells must list each cell once');
    if (!LINES[kind] && cells.length !== 1) return bad('a building takes one anchor cell');
    if (cells.some(i => i < 0 || i >= n * n)) return bad('outside grid', cells);
    const cover = footprint(s, kind, cells);
    if (!cover) return bad('outside grid', cells);
    if (!['road', 'gate'].includes(kind) && cover.some(i => hallRoadCell(s, i))) return bad('reserved for town hall road', cover);
    if (cover.some(i => g.ground[i] === 'x')) return bad('unbuildable', cover);
    if ((kind === 'road' || kind === 'gate') && cover.some(i => nearCliff(s, i, data))) return bad('too close to a cliff', cover);
    if(kind!=='road' && kind!=='gate' && coversResources(s,cover,resourceIndex,data.founding?.unitClearance))return bad('resource area: leave room to harvest',cover);
    if (cover.some(i => g.use[i] !== '.' || g.zone[i] !== '.')) return bad('occupied', cover);
    if(kind==='wall' || !LINES[kind]) {
      const reason=buildingSafety(s,cover,state,data.founding?.unitClearance);
      if(reason)return bad(reason,cover);
    }
    // B3: everything but roads and work camps stays inside the town hall tier's ring
    const needsRing = kind !== 'road' && !data.tiers?.camps?.includes(kind);
    if (needsRing && cover.some(i => !inCore(s, i, data))) return bad('outside the town ring', cover);
    if (!LINES[kind] && placedRoom(s, kind, data) < 1) return bad('town hall tier limit', cover);
    // what-if: would the town lose a path?
    let use = g.use;
    const mark = LINES[kind] || 'B';
    for (const i of cover) use = put(use, i, mark);
    const before = trapped(s), after = trapped(s, use);
    // a building's own footprint is judged as a unit below (it is not in s.buildings yet)
    for (const k of after) if (!before.has(k)) return bad('would trap', cover);
    if (!LINES[kind] && !cover.some(i => {   // the new building itself needs an open neighbour
      const col = i % n; return [col > 0 ? i - 1 : -1, col < n - 1 ? i + 1 : -1, i - n, i + n].some(j => j >= 0 && j < n * n && !cover.includes(j) && ['.', 'r', 'g'].includes(use[j]) && g.ground[j] !== 'x');
    })) return bad('would trap', cover);
    const cost = costOf(kind, cover.length);
    if (LINES[kind] && Object.entries(cost).some(([r, v]) => (s.stock[r] ?? 0) < v)) return { ok: false, reason: 'cannot afford', cost, cells: cover };
    return { ok: true, reason: '', cost, cells: cover };
  }

  function place(s, { kind, cells, by = 'p' }) {
    const r = check(s, { kind, cells });
    if (!r.ok) return r;
    const g = s.grid, mark = by === 'g' ? 'g' : 'p';
    const stamp = i => { g.by = put(g.by, i, mark); };
    if (LINES[kind]) {
      for (const [res, v] of Object.entries(r.cost)) world.change(s.id, res, -v, 'build');
      for (const i of r.cells) { setUse(s, i, LINES[kind]); stamp(i); }
      s.lineCosts ||= {};
      for(const i of r.cells)s.lineCosts[i]={...data.placeCosts[kind]};
      return r;
    }
    for (const i of r.cells) { setUse(s, i, 'B'); stamp(i); }
    const pid = construction.queue(s.id, kind, r.cells[0], { cells: r.cells });
    if (!pid) { for (const i of r.cells) setUse(s, i, '.'); return bad('could not queue it', r.cells); }
    if (by === 'p') construction.authorize?.(pid); // confirming a player placement is its build approval
    return { ...r, project: pid };
  }

  // Preview and execution share a de-duplicated plan. Eraser returns 100% of paid costs.
  function remove(s, { cells, dryRun = false }) {
    if (!s?.grid) return bad('no grid');
    const g = s.grid, { n } = g;
    if (!Array.isArray(cells) || !cells.length || !cells.every(i => Number.isInteger(i) && i >= 0 && i < n * n)) return bad('outside grid', cells || []);
    const plan = new Map(),refund={},covered=new Set();
    const addRefund=cost=>{for(const [r,n] of Object.entries(cost || {}))refund[r]=(refund[r] || 0)+n;};
    for (const i of new Set(cells)) {
      const hall = s.buildings.find(b => b.type === 'town_hall' && (b.cells || [b.cell]).includes(i));
      if (hall) return bad('town hall', cells);
      const building=s.buildings.find(b => (b.cells || [b.cell]).includes(i));
      if(building) {plan.set('b:'+building.id,{building});continue;}
      const proj = s.projects.find(p => (p.cells || [p.cell]).includes(i));
      if (proj) { plan.set('p:'+proj.id,{proj}); continue; }
      if ('rwg'.includes(g.use[i]) && g.use[i] !== '.') { plan.set('l:'+i,{line:i}); continue; }
      if (g.zone[i] !== '.') { plan.set('z:'+i,{zone:i}); continue; }
    }
    if(!plan.size)return bad('nothing there',cells);
    for(const p of plan.values()) {
      if(p.building) {addRefund(p.building.paidCost || data.buildings[p.building.type]?.cost);for(const i of p.building.cells || [p.building.cell])covered.add(i);}
      else if(p.proj) {if(p.proj.paid)addRefund(p.proj.cost);for(const i of p.proj.cells || [p.proj.cell])covered.add(i);}
      else if(p.line!==undefined) {addRefund(s.lineCosts?.[p.line] || data.placeCosts[({r:'road',w:'wall',g:'gate'})[g.use[p.line]]]);covered.add(p.line);}
      else covered.add(p.zone);
    }
    if(!dryRun) {
      for(const p of plan.values()) {
        if(p.proj)construction.cancel(p.proj.id,{refund:false});
        if(p.building)s.buildings.splice(s.buildings.indexOf(p.building),1);
      }
      for(const i of covered) {setUse(s,i,'.');g.zone=put(g.zone,i,'.');g.stage=put(g.stage,i,'0');g.by=put(g.by,i,'.');if(s.lineCosts)delete s.lineCosts[i];}
      for(const [r,n] of Object.entries(refund))world.change(s.id,r,n,'refund');
      world.recount?.(s.id);
    }
    return { ok: true, reason: '', cost: {}, refund, cells:[...covered] };
  }

  return { place, check, remove, trapped, footprint };
}
