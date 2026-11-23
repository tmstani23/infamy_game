// Water for ships (ships plan S1, Tim 2026-11-22). A fine grid over the whole island (cell `cell`, 20 by default) says
// for each spot whether it is land or which water, and two masks say where ships may sail:
//   big   = warships and transports: the sea and the four main rivers (world.json rivers), never through a bridge or
//           ford (world.json fords); a lake only when a main river runs into it
//   small = fishing boats: all of that, plus the streams (world.json streams), the lakes, and under bridges and over fords
// Landable shore = a walkable land spot (world_data passable: not mountain or cliff coast, not river) touching water of
// the mask. Ships find their way with A* on the grid (8 ways, no cutting a corner of land, a little dearer beside the
// shore so they keep off it), limited to a box when one is given (a war circle), then the string is pulled straight.
// Pure functions of the world data, cached per world: the rules (S2 ships) and the drawing (S6 shore line) share them.
//   waterGrid(world, { cell }) -> grid
//   waterAt(g, x, z) -> 'sea' | 'river' | 'lake' | 'stream' | 'crossing' | null (land)
//   sailable(g, x, z, water = 'big') ; landable(g, x, z, water) ; nearestSailable(g, x, z, water, maxR)
//   landingFor(g, x, z, water, { maxR, box }) -> { land: {x,z}, berth: {x,z}, blocked } | null
//   shipPath(g, from, to, { water, box, ends }) -> [[x, z], ...] | null
//   shoreCells(g, box, water) -> [cell index, ...] (landable land cells, for the S6 shore line)
import { passable, terrainAt } from '../world_data.js';
import { oceanTopology } from '../shoreline.js';

export const LAND = 0, SEA = 1, RIVER = 2, LAKE = 3, STREAM = 4, CROSSING = 5;
const NAMES = [null, 'sea', 'river', 'lake', 'stream', 'crossing'];
const RIVERISH = [0, 0, 1, 0, 1, 1];   // river, stream and crossing cells

const grids = new WeakMap();
const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l)); return Math.hypot(a[0] + t * dx - x, a[1] + t * dz - z); };

export function waterGrid(world, { cell = 20, streamHalf = 8 } = {}) {
  const all = grids.get(world) || {}; if (all[cell]) return all[cell];
  const W = Math.ceil((world.size?.w ?? 14000) / cell), H = Math.ceil((world.size?.h ?? 8000) / cell), N = W * H;
  const kind = new Uint8Array(N), walk = new Uint8Array(N), top = oceanTopology(world);
  const cx = i => (i % W + 0.5) * cell, cz = i => (Math.floor(i / W) + 0.5) * cell;
  for (let i = 0; i < N; i++) {
    const x = cx(i), z = cz(i), c = terrainAt(world, x, z);   // the drawn shore (fillets), as units meet it
    if (c === 'w') kind[i] = top.waterKindAt(x, z) === 'lake' ? LAKE : SEA;
    else if (c === 'r') kind[i] = RIVER;
    else walk[i] = passable(world, x, z) ? 1 : 0;
  }
  // bridges and fords: a band across the river, along the flow `along` each side of the crossing (as world_data)
  const R = world.rules || {};
  for (const f of world.fords || []) {
    const r = (world.rivers || []).find(v => v.id === f.river); if (!r) continue;
    let best = Infinity, tx = 1, tz = 0;
    for (let k = 0; k < r.points.length - 1; k++) { const d = segDist(f.x, f.z, r.points[k], r.points[k + 1]);
      if (d < best) { best = d; const dx = r.points[k + 1][0] - r.points[k][0], dz = r.points[k + 1][1] - r.points[k][1], n = Math.hypot(dx, dz) || 1; tx = dx / n; tz = dz / n; } }
    // across the river from bank to bank (river cells), plus a margin, as world_data crossingBands
    const nx = -tz, nz = tx, isRiver = (x, z) => { const k = Math.floor(z / cell) * W + Math.floor(x / cell); return x >= 0 && z >= 0 && x < W * cell && z < H * cell && (kind[k] === RIVER || kind[k] === CROSSING); };
    const edge = sign => { let s = 0; while (s < 400 && isRiver(f.x + nx * (s + 5) * sign, f.z + nz * (s + 5) * sign)) s += 5; return s + 15 + cell * 0.75; };
    const along = (f.kind === 'bridge' ? (R.bridgeHalfWidth ?? 10.5) : (R.fordAlong ?? 80)) + cell * 0.75, lo = edge(-1), hi = edge(1), reach = along + Math.max(lo, hi);
    for (let j = Math.max(0, Math.floor((f.z - reach) / cell)); j <= Math.min(H - 1, Math.floor((f.z + reach) / cell)); j++)
      for (let i = Math.max(0, Math.floor((f.x - reach) / cell)); i <= Math.min(W - 1, Math.floor((f.x + reach) / cell)); i++) {
        const k = j * W + i; if (kind[k] !== RIVER) continue;
        const dx = cx(k) - f.x, dz = cz(k) - f.z, u = dx * tx + dz * tz, v = dx * nx + dz * nz;
        if (Math.abs(u) <= along && v >= -lo && v <= hi) kind[k] = CROSSING; }
  }
  // streams: a strip either side of each stream line, on land only (fishing boats; they never block anything)
  for (const s of world.streams || []) for (let k = 0; k < s.points.length - 1; k++) {
    const a = s.points[k], b = s.points[k + 1], h = streamHalf + cell * 0.5;
    for (let j = Math.max(0, Math.floor((Math.min(a[1], b[1]) - h) / cell)); j <= Math.min(H - 1, Math.floor((Math.max(a[1], b[1]) + h) / cell)); j++)
      for (let i = Math.max(0, Math.floor((Math.min(a[0], b[0]) - h) / cell)); i <= Math.min(W - 1, Math.floor((Math.max(a[0], b[0]) + h) / cell)); i++) {
        const q = j * W + i; if (kind[q] === LAND && segDist(cx(q), cz(q), a, b) <= streamHalf + cell * 0.25) kind[q] = STREAM; }
  }
  // which lakes a main river runs into (a river cell beside one): those are big water
  const lakeBig = new Uint8Array(N), seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (kind[s] !== LAKE || seen[s]) continue;
    const body = [s]; seen[s] = 1; let fed = false;
    for (let h = 0; h < body.length; h++) { const k = body[h], i = k % W, j = Math.floor(k / W);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const n = nj * W + ni; if (kind[n] === RIVER) fed = true; if (kind[n] === LAKE && !seen[n]) { seen[n] = 1; body.push(n); } } }
    if (fed) for (const k of body) lakeBig[k] = 1;
  }
  const big = new Uint8Array(N), small = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    const t = kind[k];
    big[k] = t === SEA || t === RIVER || (t === LAKE && lakeBig[k]) ? 1 : 0;
    small[k] = t !== LAND ? 1 : 0;
  }
  // shore beside water (dearer to sail on, so routes keep off the land)
  const nearLand = new Uint8Array(N);
  for (let k = 0; k < N; k++) { if (kind[k] === LAND || kind[k] === STREAM) continue; const i = k % W, j = Math.floor(k / W);
    for (let dj = -1; dj <= 1 && !nearLand[k]; dj++) for (let di = -1; di <= 1; di++) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue; if (kind[nj * W + ni] === LAND) { nearLand[k] = 1; break; } } }
  const g = { cell, W, H, kind, walk, big, small, nearLand };
  all[cell] = g; grids.set(world, all);
  return g;
}

const idx = (g, x, z) => { const i = Math.floor(x / g.cell), j = Math.floor(z / g.cell); return i < 0 || j < 0 || i >= g.W || j >= g.H ? -1 : j * g.W + i; };
const centre = (g, k) => [(k % g.W + 0.5) * g.cell, (Math.floor(k / g.W) + 0.5) * g.cell];
const maskOf = (g, water) => water === 'small' ? g.small : g.big;
export const waterAt = (g, x, z) => { const k = idx(g, x, z); return k < 0 ? 'sea' : NAMES[g.kind[k]]; };
export const sailable = (g, x, z, water = 'big') => { const k = idx(g, x, z); return k < 0 ? false : !!maskOf(g, water)[k]; };
// a walkable land cell touching (8 ways) water of the mask
function landableCell(g, k, mask) {
  if (k < 0 || g.kind[k] !== LAND || !g.walk[k]) return false;
  const i = k % g.W, j = Math.floor(k / g.W);
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ni = i + di, nj = j + dj; if ((di || dj) && ni >= 0 && nj >= 0 && ni < g.W && nj < g.H && mask[nj * g.W + ni]) return true; }
  return false;
}
export const landable = (g, x, z, water = 'big') => landableCell(g, idx(g, x, z), maskOf(g, water));
const inBox = (g, k, box) => { if (!box) return true; const [x, z] = centre(g, k); return box.r != null ? Math.hypot(x - box.x, z - box.z) <= box.r : x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ; };
// the nearest cell (by rings) that passes test, within maxR world units
function nearestCell(g, x, z, maxR, test) {
  const ci = Math.floor(x / g.cell), cj = Math.floor(z / g.cell), rings = Math.ceil(maxR / g.cell);
  let best = -1, bd = Infinity;
  for (let ring = 0; ring <= rings; ring++) {
    for (let j = cj - ring; j <= cj + ring; j++) for (let i = ci - ring; i <= ci + ring; i++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring || i < 0 || j < 0 || i >= g.W || j >= g.H) continue;
      const k = j * g.W + i; if (!test(k)) continue;
      const [px, pz] = centre(g, k), d = Math.hypot(px - x, pz - z); if (d < bd && d <= maxR) { bd = d; best = k; } }
    if (best >= 0 && bd <= (ring + 0.5) * g.cell) break;   // nothing in a further ring can be nearer
  }
  return best;
}
export function nearestSailable(g, x, z, water = 'big', maxR = 200, box = null) {
  const m = maskOf(g, water), k = nearestCell(g, x, z, maxR, k => !!m[k] && inBox(g, k, box));
  return k < 0 ? null : { x: centre(g, k)[0], z: centre(g, k)[1] };
}
// Where a ship lands for a click at (x, z): the landable shore spot nearest the click (blocked = the click itself was not
// landable shore, so the ship goes to the nearest that is: plan 1.5 helper 2), and the water spot beside it the ship
// stops at (berth). Inside box when given (the war circle). null when no landable shore is within maxR.
export function landingFor(g, x, z, water = 'big', { maxR = 300, box = null } = {}) {
  const m = maskOf(g, water), here = idx(g, x, z), ok = landableCell(g, here, m) && inBox(g, here, box);
  const k = ok ? here : nearestCell(g, x, z, maxR, k => landableCell(g, k, m) && inBox(g, k, box));
  if (k < 0) return null;
  const [lx, lz] = centre(g, k), i = k % g.W, j = Math.floor(k / g.W);
  let berth = null, bd = Infinity;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= g.W || nj >= g.H) continue;
    const n = nj * g.W + ni; if (!m[n]) continue; const [bx, bz] = centre(g, n), d = Math.hypot(bx - x, bz - z) + (di && dj ? 0.5 : 0); if (d < bd) { bd = d; berth = { x: bx, z: bz }; } }
  return { land: { x: lx, z: lz }, berth, blocked: !ok };
}

// grid line of sight over the mask (samples a third of a cell apart)
function clearLine(g, m, ax, az, bx, bz) {
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (g.cell / 3)));
  for (let s = 1; s < n; s++) { const t = s / n, k = idx(g, ax + (bx - ax) * t, az + (bz - az) * t); if (k < 0 || !m[k]) return false; }
  return true;
}
// A ship's way from `from` to `to` ([x, z] each) over water of its mask, inside box (null = anywhere), or null when the
// two are not joined by water. The ends are moved to the nearest water within `ends` (a click on the shore, a
// ship a little off its cell). The path starts at from and ends at the water spot for to.
export function shipPath(g, from, to, { water = 'big', box = null, ends = 60, shoreCost = 0.6, maxNodes = 400000 } = {}) {
  const m = maskOf(g, water), snap = p => { const k = idx(g, p[0], p[1]); if (k >= 0 && m[k] && inBox(g, k, box)) return k; return nearestCell(g, p[0], p[1], ends, q => !!m[q] && inBox(g, q, box)); };
  const s0 = snap(from), t0 = snap(to);
  if (s0 < 0 || t0 < 0) return null;
  const end = t0 === idx(g, to[0], to[1]) ? [to[0], to[1]] : centre(g, t0);
  if (s0 === t0 || clearLine(g, m, from[0], from[1], end[0], end[1])) return [[from[0], from[1]], end];
  const W = g.W, N = W * g.H, cost = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const ti = t0 % W, tj = Math.floor(t0 / W), h = k => { const di = Math.abs(k % W - ti), dj = Math.abs(Math.floor(k / W) - tj); return Math.max(di, dj) + (Math.SQRT2 - 1) * Math.min(di, dj); };
  const heap = [], push = (f, k) => { let i = heap.length; heap.push([f, k]); while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0;
    for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
  cost[s0] = 0; push(h(s0), s0);
  let expanded = 0;
  while (heap.length) {
    const [, k] = pop(); if (done[k]) continue; done[k] = 1; if (k === t0 || ++expanded > maxNodes) break;
    const i = k % W, j = Math.floor(k / W);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ni = i + di, nj = j + dj; if ((!di && !dj) || ni < 0 || nj < 0 || ni >= W || nj >= g.H) continue;
      const n = nj * W + ni; if (!m[n] || done[n] || !inBox(g, n, box)) continue;
      // no cutting a corner of land, but a river's steps (its 50-unit terrain cells meet corner to corner) are one water
      if (di && dj && (!m[j * W + ni] || !m[nj * W + i]) && !(RIVERISH[g.kind[k]] && RIVERISH[g.kind[n]])) continue;
      const c = cost[k] + (di && dj ? Math.SQRT2 : 1) + (g.nearLand[n] ? shoreCost : 0);
      if (c < cost[n]) { cost[n] = c; prev[n] = k; push(c + h(n), n); }
    }
  }
  if (!done[t0]) return null;
  const cells = []; for (let k = prev[t0]; k !== -1 && k !== s0; k = prev[k]) cells.unshift(centre(g, k));
  const pts = [[from[0], from[1]], ...cells, end], out = [pts[0]];
  for (let i = 0; i < pts.length - 1;) { let j = pts.length - 1; while (j > i + 1 && !clearLine(g, m, pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--; out.push(pts[j]); i = j; }
  return out;
}

// landable land cells inside box (S6 draws the pale shore line on them)
export function shoreCells(g, box, water = 'big') {
  const m = maskOf(g, water), out = [];
  const x0 = box.r != null ? box.x - box.r : box.minX, x1 = box.r != null ? box.x + box.r : box.maxX, z0 = box.r != null ? box.z - box.r : box.minZ, z1 = box.r != null ? box.z + box.r : box.maxZ;
  for (let j = Math.max(0, Math.floor(z0 / g.cell)); j <= Math.min(g.H - 1, Math.floor(z1 / g.cell)); j++)
    for (let i = Math.max(0, Math.floor(x0 / g.cell)); i <= Math.min(g.W - 1, Math.floor(x1 / g.cell)); i++) { const k = j * g.W + i; if (inBox(g, k, box) && landableCell(g, k, m)) out.push(k); }
  return out;
}
export const cellCentre = centre;
