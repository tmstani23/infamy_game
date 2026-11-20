// The ship's way round the island (Tim 2026-11-20: it sailed over land to the Northern Thaw castle). The island's
// coastline (world.json coast, and its islets) is laid on a coarse sea grid (cells margin / 3, a cell is sea only with
// open water round it, so no river mouth or shore); the crossing is the shortest way over it, straightened.
// Pure functions, used by the rules (sim/frontier/ferry.js) and the drawing (render/ferry_ships.js).
//   seaRoute(world, from, dest, { margin }) -> [[x, z], ...] from the start to the end
//   alongRoute(path, k) -> { x, z, dx, dz }: the point a share k (0..1) of the way along, and the heading there
import { onIsland } from '../world_data.js';

// open water all the way, `room` clear of land on each side (the first and last stretch excepted: the city's sea gate
// sits on its shore)
const wet = (world, x, z, room) => !onIsland(world, x, z) && (!room || [[room, 0], [-room, 0], [0, room], [0, -room], [room * 0.7, room * 0.7], [-room * 0.7, room * 0.7], [room * 0.7, -room * 0.7], [-room * 0.7, -room * 0.7]].every(([dx, dz]) => !onIsland(world, x + dx, z + dz)));
function clear(world, a, b, ends = 80, room = 0) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 40);
  for (let i = 1; i < n; i++) { const t = i / n, d = t * L;
    if (d < ends || L - d < ends) continue;
    if (!wet(world, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, d < ends * 4 || L - d < ends * 4 ? 0 : room)) return false; }
  return true;
}
const len = path => path.reduce((n, q, i) => i ? n + Math.hypot(q[0] - path[i - 1][0], q[1] - path[i - 1][1]) : 0, 0);
// a coarse sea grid (cell units, cached per world): a cell is sea when it and the ground round it are off the island
const grids = new WeakMap();
function gridOf(world, cell, wide) {
  const key = `${cell}:${wide}`, all = grids.get(world) || {}; if (all[key]) return all[key];
  const W = Math.ceil((world.size?.w ?? 14000) / cell), H = Math.ceil((world.size?.h ?? 8000) / cell), sea = new Uint8Array(W * H), r = cell * wide;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = (i + 0.5) * cell, z = (j + 0.5) * cell;
    sea[j * W + i] = wet(world, x, z, r) ? 1 : 0; }
  const g = { cell, W, H, sea }; all[key] = g; grids.set(world, all); return g;
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
function search(g, s0, t0) {
  if (s0 === null || t0 === null) return null;
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
  return done[t0] ? { prev, done } : null;
}
export function seaRoute(world, from, dest, { margin = 400 } = {}) {
  if (!world?.coast?.length || clear(world, from, dest, 80, margin * 0.4)) return [from, dest];
  // the widest berth from land that joins the two ends without a long way round (a castle dock can sit in a narrow
  // bay, and the strait between the north coast and the map's edge is narrow)
  const cell = Math.max(50, Math.round(margin / 4)), tries = [];
  for (const wide of [1.8, 1.0, 0.6]) {
    const g = gridOf(world, cell, wide), t0 = nearestSea(g, ...dest), r = search(g, nearestSea(g, ...from), t0);
    if (!r) continue;
    const cells = []; for (let k = t0; k !== -1; k = r.prev[k]) cells.unshift([(k % g.W + 0.5) * g.cell, (Math.floor(k / g.W) + 0.5) * g.cell]);
    tries.push({ cells, length: len(cells) });
  }
  if (!tries.length) return [from, dest];
  const best = Math.min(...tries.map(t => t.length)), { cells } = tries.find(t => t.length <= best * 1.25);
  // pull the string: from each point, the furthest point still in open water
  // (Tim 2026-11-20: it cut corners over headlands and islets) every straight keeps `room` of open water each side
  const room = margin * 0.4, pts = [from, ...cells, dest], out = [from];
  for (let i = 0; i < pts.length - 1;) { let j = pts.length - 1; while (j > i + 1 && !clear(world, pts[i], pts[j], i === 0 || j === pts.length - 1 ? 80 : 0, room)) j--; out.push(pts[j]); i = j; }
  // round the corners (Chaikin, three passes) so the ship turns smoothly; a pass that would touch land is dropped
  let path = out;
  for (let k = 0; k < 3; k++) {
    const next = [path[0]];
    for (let i = 0; i < path.length - 1; i++) { const [ax, az] = path[i], [bx, bz] = path[i + 1];
      if (i > 0) next.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25]);
      if (i < path.length - 2) next.push([ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]); }
    next.push(path.at(-1));
    if (next.every((q, i) => !i || clear(world, next[i - 1], q, i === 1 || i === next.length - 1 ? 80 : 0, i === 1 || i === next.length - 1 ? 0 : room * 0.5))) path = next; else break;
  }
  return path;
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
