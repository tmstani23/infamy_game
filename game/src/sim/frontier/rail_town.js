// Track through a town (Tim 2026-11-07: "track is going right through buildings"). The world route runs on
// 50-unit cells and knows nothing of towns, so inside each end town the track takes a fine path over the
// town grid instead: out of the station, round buildings, houses and workshops (blocked), across roads and
// fields if it must (dearer), out to where the world route leaves the town. The cells under the finished
// route are then reserved (s.railCells) so nothing is built or zoned on the track later; roads may still cross.
// Pure: townExit(s, data, startCells, points) -> the route with its town part replaced (station first),
//       railCellsFor(s, points, halfWidth) -> [cell indices] (sim/frontier/rail.js reserves them)
import { cellToWorld, worldToCell, ringRadius } from './town_grid.js';

// cost to step onto cell i of town s (Infinity = blocked)
function cellCost(s, i, mine) {
  const g = s.grid;
  if (mine.has(i)) return 0.5;                       // the station itself
  if (g.ground[i] === 'x') return Infinity;          // water, cliffs
  const u = g.use[i], z = g.zone[i];
  if (u === 'B' || u === 'w') return Infinity;       // buildings, walls
  if (z === 'h' || z === 'k') return Infinity;       // houses, workshops
  if (s.railCells?.[i]) return 0.6;                  // share an existing line's corridor
  if (u === 'r' || u === 'g') return 3;              // level crossing
  if (z === 'f') return 4;                           // through a field
  return 1;
}

// A* over the town grid from the station cells to the cell nearest `goal`, 8-way, no corner cutting past blocked cells
function search(s, starts, goal) {
  const { n } = s.grid, N = n * n, mine = new Set(starts);
  const cost = new Float32Array(N), from = new Int32Array(N).fill(-1), g = new Float64Array(N).fill(Infinity), closed = new Uint8Array(N);
  for (let i = 0; i < N; i++) cost[i] = cellCost(s, i, mine);
  const gc = goal % n, gr = Math.floor(goal / n);
  const h = i => { const dc = Math.abs(i % n - gc), dr = Math.abs(Math.floor(i / n) - gr); return Math.max(dc, dr) + 0.414 * Math.min(dc, dr); };
  const open = [];   // binary heap of [f, i]
  const push = (f, i) => { open.push([f, i]); let k = open.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (open[p][0] <= open[k][0]) break; [open[p], open[k]] = [open[k], open[p]]; k = p; } };
  const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === k) break; [open[m], open[k]] = [open[k], open[m]]; k = m; } } return top; };
  for (const i of starts) { g[i] = 0; push(h(i), i); }
  while (open.length) {
    const [, i] = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === goal) break;
    const c = i % n, r = Math.floor(i / n);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= n || rr >= n) continue;
      const j = rr * n + cc;
      if (closed[j] || !Number.isFinite(cost[j])) continue;
      if (dr && dc && (!Number.isFinite(cost[r * n + cc]) || !Number.isFinite(cost[rr * n + c]))) continue;
      const step = (dr && dc ? 1.414 : 1) * cost[j], ng = g[i] + step;
      if (ng < g[j]) { g[j] = ng; from[j] = i; push(ng + h(j), j); }
    }
  }
  if (!closed[goal]) return null;
  const out = [];
  for (let i = goal; i >= 0; i = from[i]) { out.push(i); if (mine.has(i)) break; }
  return out.reverse();
}

// may a straight piece of track from a to b (world points) stay on cells it may use?
function clearRun(s, a, b, mine) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), step = s.grid.cell / 3;
  for (let d = 0; d <= L; d += step) {
    const t = L ? d / L : 0, i = worldToCell(s, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    if (i < 0) continue;
    if (!Number.isFinite(cellCost(s, i, mine))) return false;
  }
  return true;
}
// fewest points that still stay clear: from each point jump to the furthest one it can see
function straighten(s, pts, mine) {
  const out = [pts[0]];
  for (let k = 0; k < pts.length - 1;) {
    let j = pts.length - 1;
    while (j > k + 1 && !clearRun(s, pts[k], pts[j], mine)) j--;
    out.push(pts[j]); k = j;
  }
  return out;
}

// the world route `points` (station first) through town s: [new points] or null if the town is boxed in
export function townExit(s, data, startCells, points) {
  if (!s?.grid || !startCells?.length || points.length < 2) return null;
  const { n, cell } = s.grid, reach = Math.min((n - 1) / 2 * cell - 2 * cell, ringRadius(s, data) + 4 * cell);
  // where the world route leaves the town's reach
  let d = 0, k = 1, exit = null, rest = [];
  for (; k < points.length; k++) {
    const [x, z] = points[k];
    if (Math.hypot(x - s.x, z - s.z) > reach) {
      const [px, pz] = points[k - 1], seg = Math.hypot(x - px, z - pz);
      // walk back along the segment to the reach circle
      let t = 1; for (let q = 0; q < 40 && t > 0; q++) { const tx = px + (x - px) * t, tz = pz + (z - pz) * t; if (Math.hypot(tx - s.x, tz - s.z) <= reach) break; t -= 0.025; }
      exit = [px + (x - px) * t, pz + (z - pz) * t]; rest = points.slice(k);
      break;
    }
    d += 0;
  }
  if (!exit) { exit = points[points.length - 1]; rest = []; }   // the whole line stays in town (a very short link)
  let goal = worldToCell(s, exit[0], exit[1]);
  if (goal < 0) return null;
  const mine = new Set(startCells);
  if (!Number.isFinite(cellCost(s, goal, mine))) {   // the exit lands on a building: the nearest open cell to it
    let best = -1, bd = Infinity;
    for (let i = 0; i < n * n; i++) { if (!Number.isFinite(cellCost(s, i, mine))) continue; const [x, z] = cellToWorld(s, i), dd = Math.hypot(x - exit[0], z - exit[1]); if (dd < bd) { bd = dd; best = i; } }
    if (best < 0) return null; goal = best;
  }
  const cells = search(s, startCells, goal);
  if (!cells) return null;
  const fine = straighten(s, [points[0], ...cells.slice(1).map(i => cellToWorld(s, i))], mine);
  const end = cellToWorld(s, goal);
  if (Math.hypot(end[0] - exit[0], end[1] - exit[1]) > 1) fine.push(exit);
  return [...fine, ...rest];
}

// the town cells a track of half width `half` covers along `points`
export function railCellsFor(s, points, half = 2.5) {
  if (!s?.grid) return [];
  const out = new Set(), { cell } = s.grid, step = cell / 4, r = half + cell / 2;
  for (let k = 1; k < points.length; k++) {
    const [ax, az] = points[k - 1], [bx, bz] = points[k], L = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d <= L; d += step) {
      const x = ax + (bx - ax) * (L ? d / L : 0), z = az + (bz - az) * (L ? d / L : 0);
      for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
        const i = worldToCell(s, x + ox * 0.6, z + oz * 0.6);
        if (i >= 0) out.add(i);
      }
    }
  }
  return [...out];
}
