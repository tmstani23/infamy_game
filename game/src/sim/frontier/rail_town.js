// Track through a town (Tim 2026-11-07: "track is going right through buildings"). The world route runs on
// 50-unit cells and knows nothing of towns, so inside each end town the track takes a fine path over the
// town grid instead: out of the station, round buildings, houses and workshops (blocked), across roads and
// fields if it must (dearer), out to where the world route leaves the town. The cells under the finished
// route are then reserved (s.railCells) so nothing is built or zoned on the track later; roads may still cross.
// Pure: townExit(s, data, startCells, points, { dir }) -> the route with its town part replaced (station first;
//       dir = the way the track leaves a 3x2 station, kept one cell clear of water and cliffs where it can),
//       clearRun(s, a, b, mine, clear) -> may a straight piece run there,
//       railCellsFor(s, points, halfWidth) -> [cell indices] (sim/frontier/rail.js reserves them)
import { cellToWorld, worldToCell, ringRadius } from './town_grid.js';

// cost to step onto cell i of town s (Infinity = blocked). With `clear` a cell next to water or cliffs is blocked
// too (Tim 2026-11-08: the track keeps one cell from mountains), except the station's own cells.
function cellCost(s, i, mine, clear = false) {
  const g = s.grid;
  if (mine.has(i)) return 0.5;                       // the station itself
  if (g.ground[i] === 'x') return Infinity;          // water, cliffs
  const u = g.use[i], z = g.zone[i];
  if (u === 'B' || u === 'w') return Infinity;       // buildings, walls
  if (z === 'h' || z === 'k') return Infinity;       // houses, workshops
  if (clear && nextToRock(s, i)) return Infinity;
  if (s.railCells?.[i]) return 0.6;                  // share an existing line's corridor
  if (u === 'r' || u === 'g') return 3;              // level crossing
  if (z === 'f') return 4;                           // through a field
  return 1;
}
function nextToRock(s, i) {
  const { n, ground } = s.grid, c = i % n, r = Math.floor(i / n);
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const cc = c + dc, rr = r + dr;
    if (cc >= 0 && rr >= 0 && cc < n && rr < n && ground[rr * n + cc] === 'x') return true;
  }
  return false;
}

// the 8 headings, as [dc, dr] steps; a step may turn at most 45 degrees (Tim 2026-11-08: no turn a train couldn't take)
const HEAD = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const TURN = 0.35;   // extra cost of each 45 degree bend, so the line keeps straight where it can
export const headingOf = dir => { const k = HEAD.findIndex(([c, r]) => c === Math.sign(Math.round(dir[0])) && r === Math.sign(Math.round(dir[1]))); return k; };

// A* over (cell, heading, may-turn) from the station cells to the cell nearest `goal`, no corner cutting past blocked
// cells. A step may bend 45 degrees, and only after a straight step, so curves are about two cells round.
// `head0` (0..7) makes the first step leave the station that way (the 3x2 station's track mouth); -1 = any way.
// `out` ([dx, dz]) makes the path end on or next to the goal facing within 45 degrees of it (on toward the world route).
function search(s, starts, goal, head0 = -1, clear = false, out = null) {
  const { n } = s.grid, N = n * n, mine = new Set(starts);
  const cost = new Float32Array(N);
  for (let i = 0; i < N; i++) cost[i] = cellCost(s, i, mine, clear);
  const S = 16, from = new Int32Array(N * S).fill(-1), g = new Float64Array(N * S).fill(Infinity), closed = new Uint8Array(N * S);
  const gc = goal % n, gr = Math.floor(goal / n), ol = out && Math.hypot(out[0], out[1]);
  const facing = d => !out || !ol || (HEAD[d][0] * out[0] + HEAD[d][1] * out[1]) / (Math.hypot(...HEAD[d]) * ol) > 0.7;
  const h = i => { const dc = Math.abs(i % n - gc), dr = Math.abs(Math.floor(i / n) - gr); return Math.max(dc, dr) + 0.414 * Math.min(dc, dr); };
  const open = [];   // binary heap of [f, state]
  const push = (f, q) => { open.push([f, q]); let k = open.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (open[p][0] <= open[k][0]) break; [open[p], open[k]] = [open[k], open[p]]; k = p; } };
  const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === k) break; [open[m], open[k]] = [open[k], open[m]]; k = m; } } return top; };
  // a start state's heading is the way it leaves; with head0 every station cell faces the track mouth.
  // state q = cell * 16 + heading * 2 + (may turn)
  for (const i of starts) for (let d = 0; d < 8; d++) if (head0 < 0 || d === head0) { const q = i * S + d * 2; g[q] = 0; push(h(i), q); }
  let end = -1;
  while (open.length) {
    const [, q] = pop();
    if (closed[q]) continue;
    closed[q] = 1;
    const i = Math.floor(q / S), d = (q % S) >> 1, may = q & 1;
    if (out ? Math.max(Math.abs(i % n - gc), Math.abs(Math.floor(i / n) - gr)) <= 1 && facing(d) : i === goal) { end = q; break; }
    const c = i % n, r = Math.floor(i / n);
    for (const t of may ? [-1, 0, 1] : [0]) {
      const nd = (d + t + 8) & 7, [dc, dr] = HEAD[nd], cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= n || rr >= n) continue;
      const j = rr * n + cc, nq = j * S + nd * 2 + (t ? 0 : 1);
      if (closed[nq] || !Number.isFinite(cost[j])) continue;
      if (dr && dc && (!Number.isFinite(cost[r * n + cc]) || !Number.isFinite(cost[rr * n + c]))) continue;
      const ng = g[q] + (dr && dc ? 1.414 : 1) * cost[j] + (t ? TURN : 0);
      if (ng < g[nq]) { g[nq] = ng; from[nq] = q; push(ng + h(j), nq); }
    }
  }
  if (end < 0) return null;
  const path = [];
  for (let q = end; q >= 0; q = from[q]) { path.push(Math.floor(q / S)); if (from[q] < 0) break; }
  return path.reverse();
}

// may a straight piece of track from a to b (world points) stay on cells it may use?
export function clearRun(s, a, b, mine, clear = false) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), step = s.grid.cell / 3;
  for (let d = 0; d <= L; d += step) {
    const t = L ? d / L : 0, i = worldToCell(s, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    if (i < 0) continue;
    if (!Number.isFinite(cellCost(s, i, mine, clear))) return false;
  }
  return true;
}
// fewest points that still stay clear: from each point jump to the furthest one it can see, turning no more
// than the search did (45 degrees) at each kept point so straightening can't make a sharp corner
// (dir0 = the way the track already runs at the first point, the station's track mouth)
function straighten(s, pts, mine, clear, dir0 = null) {
  const out = [pts[0]], back = dir0 && [pts[0][0] - dir0[0], pts[0][1] - dir0[1]];
  const bend = (p, q, r) => { const a = Math.atan2(q[1] - p[1], q[0] - p[0]), b = Math.atan2(r[1] - q[1], r[0] - q[0]); let x = Math.abs(b - a); if (x > Math.PI) x = 2 * Math.PI - x; return x; };
  for (let k = 0; k < pts.length - 1;) {
    let j = pts.length - 1;
    while (j > k + 1 && (!clearRun(s, pts[k], pts[j], mine, clear)
      || ((out.length > 1 || back) && bend(out.length > 1 ? out[out.length - 2] : back, pts[k], pts[j]) > Math.PI / 4 + 0.01))) j--;
    out.push(pts[j]); k = j;
  }
  return out;
}

// the world route `points` (station first) through town s: [new points] or null if the town is boxed in
export function townExit(s, data, startCells, points, opts = {}) {
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
  const mine = new Set(startCells), head0 = opts.dir ? headingOf(opts.dir) : -1, cell0 = goal;
  // keep a cell clear of water and cliffs when the town allows it, else take the old tighter way
  for (const clear of [true, false]) {
    goal = cell0;
    if (!Number.isFinite(cellCost(s, goal, mine, clear))) {   // the exit lands on a building: the nearest open cell to it
      let best = -1, bd = Infinity;
      for (let i = 0; i < n * n; i++) { if (!Number.isFinite(cellCost(s, i, mine, clear))) continue; const [x, z] = cellToWorld(s, i), dd = Math.hypot(x - exit[0], z - exit[1]); if (dd < bd) { bd = dd; best = i; } }
      if (best < 0) continue; goal = best;
    }
    const on = rest.length ? [rest[0][0] - exit[0], rest[0][1] - exit[1]] : null;
    // a 3x2 station's track always leaves through its mouth: no way round from there means none at all (turn it)
    const cells = (on && search(s, startCells, goal, head0, clear, on)) || search(s, startCells, goal, head0, clear);
    if (!cells) continue;
    const fine = straighten(s, [points[0], ...cells.slice(1).map(i => cellToWorld(s, i))], mine, clear, opts.dir);
    const end = cellToWorld(s, goal);
    if (Math.hypot(end[0] - exit[0], end[1] - exit[1]) > 1) fine.push(exit);
    return [...fine, ...rest];
  }
  return null;
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
