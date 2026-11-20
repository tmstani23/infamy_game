// The ship's way round the island (Tim 2026-11-20: it sailed over land to the Northern Thaw castle). The island's
// coastline (world.json coast, and its islets) is laid on a coarse sea grid (cells margin / 3, a cell is sea only with
// open water round it, so no river mouth or shore); the crossing is the shortest way over it, straightened.
// Pure functions, used by the rules (sim/frontier/ferry.js) and the drawing (render/ferry_ships.js).
//   seaRoute(world, from, dest, { margin }) -> [[x, z], ...] from the start to the end
//   alongRoute(path, k) -> { x, z, dx, dz }: the point a share k (0..1) of the way along, and the heading there
import { onIsland } from '../world_data.js';

// open water all the way, the first and last stretch excepted (the city's sea gate sits on its shore)
function clear(world, a, b, ends = 80) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 40);
  for (let i = 1; i < n; i++) { const t = i / n, d = t * L;
    if (d < ends || L - d < ends) continue;
    if (onIsland(world, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false; }
  return true;
}
const len = path => path.reduce((n, q, i) => i ? n + Math.hypot(q[0] - path[i - 1][0], q[1] - path[i - 1][1]) : 0, 0);
// a coarse sea grid (cell units, cached per world): a cell is sea when it and the ground round it are off the island
const grids = new WeakMap();
function gridOf(world, cell) {
  const had = grids.get(world); if (had?.cell === cell) return had;
  const W = Math.ceil((world.size?.w ?? 14000) / cell), H = Math.ceil((world.size?.h ?? 8000) / cell), sea = new Uint8Array(W * H), r = cell * 0.6;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = (i + 0.5) * cell, z = (j + 0.5) * cell;
    sea[j * W + i] = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => !onIsland(world, x + dx, z + dz)) ? 1 : 0; }
  const g = { cell, W, H, sea }; grids.set(world, g); return g;
}
function nearestSea(g, x, z) {
  const ci = Math.floor(x / g.cell), cj = Math.floor(z / g.cell);
  for (let ring = 0; ring < 40; ring++) { let best = null, bd = Infinity;
    for (let j = cj - ring; j <= cj + ring; j++) for (let i = ci - ring; i <= ci + ring; i++) {
      if (i < 0 || j < 0 || i >= g.W || j >= g.H || !g.sea[j * g.W + i]) continue;
      const d = Math.hypot(i - ci, j - cj); if (d < bd) { bd = d; best = j * g.W + i; } }
    if (best !== null) return best; }
  return null;
}
export function seaRoute(world, from, dest, { margin = 300 } = {}) {
  if (!world?.coast?.length || clear(world, from, dest)) return [from, dest];
  const g = gridOf(world, Math.max(50, Math.round(margin / 3))), s0 = nearestSea(g, ...from), t0 = nearestSea(g, ...dest);
  if (s0 === null || t0 === null) return [from, dest];
  // A* over the sea cells, eight ways
  const N = g.W * g.H, cost = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const h = k => Math.hypot(k % g.W - t0 % g.W, Math.floor(k / g.W) - Math.floor(t0 / g.W));
  const open = [[h(s0), s0]]; cost[s0] = 0;
  const push = (f, k) => { let i = open.length; open.push([f, k]); while (i) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
  const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0;
    for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
  while (open.length) {
    const [, k] = pop(); if (done[k]) continue; done[k] = 1; if (k === t0) break;
    const i = k % g.W, j = Math.floor(k / g.W);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ni = i + di, nj = j + dj; if ((!di && !dj) || ni < 0 || nj < 0 || ni >= g.W || nj >= g.H) continue;
      const n = nj * g.W + ni; if (!g.sea[n] || done[n]) continue;
      if (di && dj && (!g.sea[j * g.W + ni] || !g.sea[nj * g.W + i])) continue;   // no cutting a corner of land
      const c = cost[k] + (di && dj ? Math.SQRT2 : 1); if (c < cost[n]) { cost[n] = c; prev[n] = k; push(c + h(n), n); }
    }
  }
  if (!done[t0]) return [from, dest];
  const cells = []; for (let k = t0; k !== -1; k = prev[k]) cells.unshift([(k % g.W + 0.5) * g.cell, (Math.floor(k / g.W) + 0.5) * g.cell]);
  // pull the string: from each point, the furthest point still in open water
  const pts = [from, ...cells, dest], out = [from];
  for (let i = 0; i < pts.length - 1;) { let j = pts.length - 1; while (j > i + 1 && !clear(world, pts[i], pts[j], i === 0 || j === pts.length - 1 ? 80 : 0)) j--; out.push(pts[j]); i = j; }
  return out;
}
export function alongRoute(path, k) {
  const total = len(path), want = Math.min(1, Math.max(0, k)) * total;
  let d = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i], l = Math.hypot(bx - ax, bz - az);
    if (d + l >= want || i === path.length - 1) { const t = l ? Math.min(1, (want - d) / l) : 1; return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: bx - ax, dz: bz - az }; }
    d += l;
  }
  return { x: path[0][0], z: path[0][1], dx: 1, dz: 0 };
}
