// Street pathfinding for crew: a walk grid built once from the blockers, A* on it,
// then the path is straightened so units walk in clean lines instead of zig-zags.
// Plain code, no three.js, so the server runs exactly the same paths.

// Rooms are small and full of furniture, so their grid is finer, and padded for the
// biggest crew body (brute 0.45) so a path found there is one every unit fits through
export const ROOM_NAV = { cell: 0.125, pad: 0.45 };

export function createNav(blockers, bounds, { cell = 0.5, pad = 0.4, allowed = null } = {}) {
  const x0 = bounds.minX, z0 = bounds.minZ;
  const W = Math.ceil((bounds.maxX - x0) / cell), H = Math.ceil((bounds.maxZ - z0) / cell);
  const blocked = new Uint8Array(W * H);
  for (const b of blockers) {
    const i0 = Math.max(0, Math.floor((b.minX - pad - x0) / cell)), i1 = Math.min(W - 1, Math.floor((b.maxX + pad - x0) / cell));
    const j0 = Math.max(0, Math.floor((b.minZ - pad - z0) / cell)), j1 = Math.min(H - 1, Math.floor((b.maxZ + pad - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      // a cell is blocked when its centre is inside the padded blocker
      const cx = x0 + (i + 0.5) * cell, cz = z0 + (j + 0.5) * cell;
      if (cx > b.minX - pad && cx < b.maxX + pad && cz > b.minZ - pad && cz < b.maxZ + pad) blocked[j * W + i] = 1;
    }
  }
  if (allowed) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++)
    if (!allowed(x0 + (i + .5) * cell, z0 + (j + .5) * cell)) blocked[j * W + i] = 1;
  const cellOf = (x, z) => [Math.floor((x - x0) / cell), Math.floor((z - z0) / cell)];
  const inside = (i, j) => i >= 0 && j >= 0 && i < W && j < H;
  const free = (i, j) => inside(i, j) && !blocked[j * W + i];
  const centre = (i, j) => [x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell];

  // The free cell nearest to a point (spiral search), or null
  function nearestFree(x, z, maxRing = 12) {
    const [ci, cj] = cellOf(x, z);
    if (free(ci, cj)) return [ci, cj];
    for (let r = 1; r <= maxRing; r++) {
      let best = null, bd = Infinity;
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !free(i, j)) continue;
        const [cx, cz] = centre(i, j), d = (cx - x) ** 2 + (cz - z) ** 2;
        if (d < bd) { bd = d; best = [i, j]; }
      }
      if (best) return best;
    }
    return null;
  }

  // Can a unit walk straight from a to b? (samples the grid along the line)
  function clearLine(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (cell * 0.5));
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0, [i, j] = cellOf(ax + (bx - ax) * t, az + (bz - az) * t);
      if (!free(i, j)) return false;
    }
    return true;
  }

  // Waypoints [[x, z], ...] from a to b, ending at b (or the nearest free spot); null if no way
  function* searchPath(ax, az, bx, bz) {
    // a goal inside a wall: back off toward the unit until the ground is free
    if (!free(...cellOf(bx, bz))) {
      const d = Math.hypot(ax - bx, az - bz), n = Math.ceil(d / (cell * 0.5));
      for (let k = 1; k <= n; k++) {
        const x = bx + (ax - bx) * k / n, z = bz + (az - bz) * k / n;
        if (free(...cellOf(x, z))) { bx = x; bz = z; break; }
      }
    }
    const goal = nearestFree(bx, bz);
    if (!goal) return null;
    const [gx, gz] = free(...cellOf(bx, bz)) ? [bx, bz] : centre(...goal);
    if (clearLine(ax, az, gx, gz)) return [[gx, gz]];
    const start = nearestFree(ax, az);
    if (!start) return null;
    const S = start[1] * W + start[0], G = goal[1] * W + goal[0];
    const g = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1);
    const closed = new Uint8Array(W * H);
    const h = k => { const di = Math.abs(k % W - goal[0]), dj = Math.abs(((k / W) | 0) - goal[1]); return Math.max(di, dj) + 0.414 * Math.min(di, dj); };
    // binary heap of [f, cell]
    const heap = [[h(S), S]];
    const push = e => { heap.push(e); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    g[S] = 0;
    let found = false;
    while (heap.length) {
      yield;
      const [, k] = pop();
      if (closed[k]) continue;
      if (k === G) { found = true; break; }
      closed[k] = 1;
      const i = k % W, j = (k / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (!free(ni, nj)) continue;
        if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;   // no cutting corners
        const n = nj * W + ni, ng = g[k] + (di && dj ? 1.414 : 1);
        if (ng < g[n]) { g[n] = ng; from[n] = k; push([ng + h(n), n]); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = G; k !== -1 && k !== S; k = from[k]) cells.push(centre(k % W, (k / W) | 0));
    cells.reverse();
    cells[cells.length - 1] = [gx, gz];
    // straighten: skip every waypoint that can be reached directly
    const out = [];
    let px = ax, pz = az, idx = 0;
    while (idx < cells.length) {
      let far = idx;
      for (let t = cells.length - 1; t > idx; t--) {yield;if (clearLine(px, pz, cells[t][0], cells[t][1])) { far = t; break; }}
      out.push(cells[far]);
      [px, pz] = cells[far];
      idx = far + 1;
    }
    return out;
  }

  function beginPath(...args){
    const iterator=searchPath(...args);let result={done:false},work=0;
    return {advance(budget=256){work=0;for(let i=0;i<budget&&!result.done;i++){work++;result=iterator.next();}return result.done;},get work(){return work;},get done(){return result.done;},get path(){return result.done?result.value:undefined;}};
  }
  function findPath(...args){const job=beginPath(...args);while(!job.advance(65536)){}return job.path;}
  return { beginPath, findPath, clearLine, free: (x, z) => free(...cellOf(x, z)), nearestFree: (x, z) => { const c = nearestFree(x, z); return c && centre(...c); } };
}
