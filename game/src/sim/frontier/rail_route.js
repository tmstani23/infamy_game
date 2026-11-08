// Railway route finder (train plan step 1, project files steam_trains/plan.md). Pure: no DOM, no randomness.
// The game picks the route; the player never places track. Cheapest 8-way path over the world terrain grid
// (world.json terrain, 50-unit cells) by railways.json route.cost; mountains are impassable, rivers and short
// water gaps are bridged (route.bridge, at most route.maxBridge units per crossing), cells that already carry
// your track cost route.reuse times as much (new links lean onto existing lines). The cell path is then
// straightened (within route.simplify units, never across impassable cells) and corner-rounded (route.smooth
// passes) into a polyline the train runs along and the renderer draws.
// createRailGrid(world, cfg) -> G ; routeRail(G, from, to, { reuse: [line, ...] }) -> line | null
// line = { points: [[x, z], ...], dist: [cumulative length per point], length, bridges: [[d0, d1], ...] }
// pointAt(line, d) -> { x, z, heading }  (heading = radians, atan2(dx, dz))

const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

export function createRailGrid(world, cfg = {}) {
  const t = world.terrain, cell = t.cell, rows = t.rows, nz = rows.length, nx = rows[0]?.length || 0;
  const costs = cfg.cost || {}, bridgeCodes = new Set(cfg.bridge || ['r', 'w']);
  const cost = new Float32Array(nx * nz), bridge = new Uint8Array(nx * nz);
  for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
    const c = rows[i][j], v = costs[c], k = i * nx + j;
    cost[k] = v == null ? Infinity : v;
    bridge[k] = bridgeCodes.has(c) ? 1 : 0;
  }
  return { cell, nx, nz, cost, bridge, cfg };
}

const cellAt = (G, x, z) => {
  const i = Math.floor(z / G.cell), j = Math.floor(x / G.cell);
  return (i < 0 || j < 0 || i >= G.nz || j >= G.nx) ? -1 : i * G.nx + j;
};
const centre = (G, k) => [((k % G.nx) + 0.5) * G.cell, (((k / G.nx) | 0) + 0.5) * G.cell];

// cells (as a Set of indices) that a polyline passes through, sampled every quarter cell
export function lineCells(G, line) {
  const out = new Set(), p = line.points || line, step = G.cell / 4;
  for (let n = 1; n < p.length; n++) {
    const [ax, az] = p[n - 1], [bx, bz] = p[n], len = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s <= m; s++) { const k = cellAt(G, ax + (bx - ax) * s / m, az + (bz - az) * s / m); if (k >= 0) out.add(k); }
  }
  return out;
}

// A* over cells. Water runs (bridge cells) longer than maxBridge are not allowed: the run length rides along
// with the search state (approximate, one label per cell), which is enough for the 50-unit grid.
function search(G, src, dst, reuse) {
  const N = G.nx * G.nz, g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), wet = new Float32Array(N);
  const maxWet = G.cfg.maxBridge ?? 300, factor = G.cfg.reuse ?? 0.35, cheapest = Math.min(factor, 1);
  const [tx, tz] = centre(G, dst), h = k => { const [x, z] = centre(G, k); return Math.hypot(x - tx, z - tz) / G.cell * cheapest; };
  const heap = [];
  const push = (f, k) => { heap.push([f, k]); let c = heap.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let c = 0;
      for (;;) { const l = 2 * c + 1, r = l + 1; let m = c;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } }
    return top; };
  g[src] = 0; push(h(src), src);
  while (heap.length) {
    const [f, k] = pop();
    if (k === dst) break;
    if (f - h(k) > g[k] + 1e-9) continue;
    const i = (k / G.nx) | 0, j = k % G.nx;
    for (const [di, dj, m] of STEPS) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= G.nz || b >= G.nx) continue;
      const n = a * G.nx + b;
      let c = G.cost[n];
      if (!Number.isFinite(c)) continue;
      if (di && dj && (!Number.isFinite(G.cost[i * G.nx + b]) || !Number.isFinite(G.cost[a * G.nx + j]))) continue;  // no corner cutting past a mountain
      const w = G.bridge[n] ? wet[k] + G.cell * m : 0;
      if (w > maxWet) continue;
      if (reuse?.has(n)) c *= factor;
      const nd = g[k] + c * m;
      if (nd < g[n]) { g[n] = nd; prev[n] = k; wet[n] = w; push(nd + h(n), n); }
    }
  }
  if (g[dst] === Infinity) return null;
  const path = [dst];
  while (path[path.length - 1] !== src) path.push(prev[path[path.length - 1]]);
  return path.reverse();
}

// may the straight segment a-b replace the cell path between them? It must stay on open ground and not
// add or move water (a bridge must stay where the search put it), and keep route.clearance world units
// (Tim 2026-11-07: one town cell) from mountains and other impassable cells
const RING = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071]];
function clear(G, a, b, wetAllowed, c = G.cfg.clearance ?? 0) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.ceil(len / (G.cell / 4)));
  for (let s = 0; s <= m; s++) {
    const x = a[0] + (b[0] - a[0]) * s / m, z = a[1] + (b[1] - a[1]) * s / m, k = cellAt(G, x, z);
    if (k < 0 || !Number.isFinite(G.cost[k])) return false;
    if (G.bridge[k] && !wetAllowed) return false;
    if (c > 0) for (const [ox, oz] of RING) { const q = cellAt(G, x + ox * c, z + oz * c); if (q >= 0 && !Number.isFinite(G.cost[q])) return false; }
  }
  return true;
}
// a straight piece on open ground with the clearance (or `c`); water allowed (corner rounding near a bridge)
export const openRun = (G, a, b, c) => clear(G, a, b, true, c);

// Rounds every corner of a polyline to a circular arc of radius R (Tim 2026-11-07: no turns a train could not
// take), smaller only where the straight pieces beside it are too short; ok(a, b) must accept each arc chord or
// the corner tries a smaller arc and else stays. `ok` may be a list of checks, strictest first: a corner that
// can't round under one tries again, full size, under the next. The ends stay put; an arc may use `endShare` of
// the first and last pieces (half of any other).
export function roundCorners(pts, R, ok = () => true, step = 3, endShare = 0.9) {
  if (!(R > 0) || pts.length < 3) return pts;
  const out = [pts[0]], oks = Array.isArray(ok) ? ok : [ok];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const la = Math.hypot(a[0] - b[0], a[1] - b[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (la < 1e-6 || lc < 1e-6) { out.push(b); continue; }
    const u = [(a[0] - b[0]) / la, (a[1] - b[1]) / la], v = [(c[0] - b[0]) / lc, (c[1] - b[1]) / lc];
    const inner = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));   // angle between the two pieces
    if (Math.PI - inner < 0.02) { out.push(b); continue; }   // straight on
    const tMax = Math.min(i === 1 ? la * endShare : la / 2, i === pts.length - 2 ? lc * endShare : lc / 2), tan = Math.tan(inner / 2);
    let done = false;
    for (const okk of oks) for (let r = Math.min(R, tMax * tan); r > Math.min(R, tMax * tan) * 0.3 && !done; r *= 0.7) {
      const t = r / tan, p1 = [b[0] + u[0] * t, b[1] + u[1] * t], p2 = [b[0] + v[0] * t, b[1] + v[1] * t];
      const bis = [u[0] + v[0], u[1] + v[1]], bl = Math.hypot(bis[0], bis[1]) || 1, d = r / Math.sin(inner / 2);
      const o = [b[0] + bis[0] / bl * d, b[1] + bis[1] / bl * d];
      let a1 = Math.atan2(p1[1] - o[1], p1[0] - o[0]), a2 = Math.atan2(p2[1] - o[1], p2[0] - o[0]), sweep = a2 - a1;
      while (sweep > Math.PI) sweep -= 2 * Math.PI; while (sweep < -Math.PI) sweep += 2 * Math.PI;
      const n = Math.max(2, Math.ceil(Math.abs(sweep) * r / step)), arc = [];
      for (let k = 0; k <= n; k++) { const ang = a1 + sweep * k / n; arc.push([o[0] + Math.cos(ang) * r, o[1] + Math.sin(ang) * r]); }
      if (arc.every((p, k) => !k || okk(arc[k - 1], p)) && okk(out[out.length - 1], arc[0])) { out.push(...arc); done = true; }
    }
    if (!done) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

// Douglas-Peucker within `tol`, keeping a point whenever the shortcut would cross a mountain or water
function simplify(G, pts, tol) {
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const wetBetween = (i0, i1) => { for (let i = i0; i <= i1; i++) { const k = cellAt(G, pts[i][0], pts[i][1]); if (k >= 0 && G.bridge[k]) return true; } return false; };
  const rec = (i0, i1) => {
    if (i1 <= i0 + 1) return;
    let worst = -1, at = -1;
    for (let i = i0 + 1; i < i1; i++) { const d = segDist(pts[i], pts[i0], pts[i1]); if (d > worst) { worst = d; at = i; } }
    if (worst > tol || !clear(G, pts[i0], pts[i1], wetBetween(i0, i1))) { keep[at] = 1; rec(i0, at); rec(at, i1); }
  };
  rec(0, pts.length - 1);
  return pts.filter((_, i) => keep[i]);
}

// Chaikin corner cutting, corner by corner: a corner is only cut when the cut stays on open ground (and only
// touches water where the corner already did); the ends stay put
function smooth(G, pts, passes) {
  const wetAt = q => { const k = cellAt(G, q[0], q[1]); return k >= 0 && !!G.bridge[k]; };
  let p = pts;
  for (let n = 0; n < passes && p.length > 2; n++) {
    const out = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      const [x, z] = p[i], q = [x * 0.75 + p[i - 1][0] * 0.25, z * 0.75 + p[i - 1][1] * 0.25], r = [x * 0.75 + p[i + 1][0] * 0.25, z * 0.75 + p[i + 1][1] * 0.25];
      if (clear(G, q, r, wetAt(p[i]) || wetAt(q) || wetAt(r))) out.push(q, r); else out.push(p[i]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

export function measure(G, points) {
  const dist = [0];
  for (let i = 1; i < points.length; i++) dist.push(dist[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const length = dist[dist.length - 1], bridges = [], step = G.cell / 5;
  let open = null;
  for (let d = 0; d <= length; d += step) {
    const p = pointAt({ points, dist, length }, d), k = cellAt(G, p.x, p.z), wet = k >= 0 && G.bridge[k];
    if (wet && open == null) open = Math.max(0, d - step);
    if (!wet && open != null) { bridges.push([open, d]); open = null; }
  }
  if (open != null) bridges.push([open, length]);
  return { points, dist, length, bridges };
}

export function routeRail(G, from, to, opts = {}) {
  const src = cellAt(G, from.x, from.z), dst = cellAt(G, to.x, to.z);
  if (src < 0 || dst < 0 || !Number.isFinite(G.cost[src]) || !Number.isFinite(G.cost[dst])) return null;
  let reuse = null;
  for (const l of opts.reuse || []) for (const k of lineCells(G, l)) (reuse ||= new Set()).add(k);
  const cells = search(G, src, dst, reuse);
  if (!cells) return null;
  const pts = cells.map(k => centre(G, k));
  pts[0] = [from.x, from.z]; pts[pts.length - 1] = [to.x, to.z];
  const simple = simplify(G, pts, G.cfg.simplify ?? 30);
  const line = measure(G, roundCorners(smooth(G, simple, G.cfg.smooth ?? 2), G.cfg.minRadius ?? 0, [(a, b) => openRun(G, a, b), (a, b) => openRun(G, a, b, 0)]).map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]));
  line.cost = cells.reduce((s, k) => s + G.cost[k], 0) * G.cell;
  return line;
}

// position and heading at distance d along a line (clamped to its ends)
export function pointAt(line, d) {
  const { points: p, dist } = line;
  if (p.length < 2) return { x: p[0]?.[0] ?? 0, z: p[0]?.[1] ?? 0, heading: 0 };
  d = Math.max(0, Math.min(line.length, d));
  let lo = 0, hi = dist.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (dist[m] <= d) lo = m; else hi = m; }
  const seg = dist[hi] - dist[lo] || 1, t = (d - dist[lo]) / seg;
  const [ax, az] = p[lo], [bx, bz] = p[hi];
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, bz - az) };
}
