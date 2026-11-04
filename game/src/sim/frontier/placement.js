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
import { cellOffset, inCore, setUse } from './town_grid.js';

const LINES = { road: 'r', wall: 'w', gate: 'g' };
const put = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);

export function createPlacement({ state, data, world, construction }) {
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
    if (cover.some(i => g.ground[i] === 'x')) return bad('unbuildable', cover);
    if (cover.some(i => g.use[i] !== '.' || g.zone[i] !== '.')) return bad('occupied', cover);
    const needsCore = !LINES[kind] && data.buildings[kind].coreOnly;
    if (needsCore && cover.some(i => !inCore(s, i, data))) return bad('core only', cover);
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
      return r;
    }
    for (const i of r.cells) { setUse(s, i, 'B'); stamp(i); }
    const pid = construction.queue(s.id, kind, r.cells[0], { cells: r.cells });
    if (!pid) { for (const i of r.cells) setUse(s, i, '.'); return bad('could not queue it', r.cells); }
    return { ...r, project: pid };
  }

  // The eraser: roads, walls, gates and zones go at once; an unbuilt project is cancelled (refund
  // rule of construction.cancel). Never the town hall, never a finished building.
  function remove(s, { cells }) {
    if (!s?.grid) return bad('no grid');
    const g = s.grid, { n } = g;
    if (!Array.isArray(cells) || !cells.length || !cells.every(i => Number.isInteger(i) && i >= 0 && i < n * n)) return bad('outside grid', cells || []);
    const plan = [];   // validate everything first so a refusal changes nothing
    for (const i of cells) {
      const hall = s.buildings.find(b => b.type === 'town_hall' && (b.cells || [b.cell]).includes(i));
      if (hall) return bad('town hall', cells);
      if (s.buildings.some(b => (b.cells || [b.cell]).includes(i))) return bad('built building', cells);
      const proj = s.projects.find(p => (p.cells || [p.cell]).includes(i));
      if (proj) { plan.push({ proj }); continue; }
      if ('rwg'.includes(g.use[i]) && g.use[i] !== '.') { plan.push({ line: i }); continue; }
      if (g.zone[i] !== '.') { plan.push({ zone: i }); continue; }
      return bad('nothing there', cells);
    }
    for (const p of plan) {
      if (p.proj) construction.cancel(p.proj.id);
      else if (p.line !== undefined) { setUse(s, p.line, '.'); g.by = put(g.by, p.line, '.'); }
      else { g.zone = put(g.zone, p.zone, '.'); g.stage = put(g.stage, p.zone, '0'); g.by = put(g.by, p.zone, '.'); }
    }
    return { ok: true, reason: '', cost: {}, cells };
  }

  return { place, check, remove, trapped, footprint };
}
