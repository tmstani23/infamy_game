// Areas (frontier W3.2): the island as one more walkable place, e.place === 'world'.
// The city ('street') and the rooms keep their own grids exactly as before (sim/game.js); this
// module only serves units standing on the island. Design note: to_delete/_chk/chunk_design.md.
//
// - The island is cut into square chunks (data/world_chunks.json `chunk`). A chunk is built from
//   world.json alone (sim/chunk_gen.js), so nothing about chunks is saved.
// - Active chunks: every chunk a unit on the island stands in or next to (`loadRadius`). Only
//   those take part in walking and sight; the rest sleep. Recently used chunks stay cached up to
//   `keepChunks`, so walking back and forth does not rebuild them. Cost follows units, not map size.
// - Walking: each chunk has a fine walk grid (`navCell`). Short trips search the fine grids of the
//   active chunks. Long trips first find a route on a small island-wide graph (hierarchical
//   pathfinding, HPA*): portals where the terrain crosses chunk borders, with walking costs between
//   the portals inside each chunk, built from the terrain data alone, so far chunks never load.
//   Only the first `refineAhead` units of a long route are walked on the fine grid; the path says
//   when to ask again (`replanAt`), and by then the unit's new neighbours are active.
// - nav: the same calls the city grid answers (sim/nav.js): findPath, beginPath, clearLine, free,
//   nearestFree, so crew orders, combat and AI work on the island unchanged.
import { buildChunk, chunkId } from './chunk_gen.js';
import { passable } from './world_data.js';

const SQ2 = Math.SQRT2;

function heap() {
  const a = [];
  return {
    get size() { return a.length; },
    push(f, k) { a.push([f, k]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } },
    pop() { const top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; },
  };
}

export function createAreas({ world, cfg, seed = 1, city = null }) {
  const S = cfg.chunk, CELL = cfg.navCell, N = Math.round(S / CELL), PAD = cfg.navPad ?? 0.4;
  const TC = world.terrain.cell, K = Math.round(S / TC);
  const NX = world.terrain.rows[0].length, NZ = world.terrain.rows.length;
  const CX = Math.ceil(NX / K), CZ = Math.ceil(NZ / K);
  const R = cfg.loadRadius ?? 1, KEEP = Math.max(cfg.keepChunks ?? 50, (2 * R + 1) ** 2);
  const B = 10, NB = Math.ceil(S / B);   // blocker buckets for tryMove, B units square
  const cache = new Map();               // chunk key -> { key, cx, cz, gen, grid, buckets, used }
  let active = new Map();                // chunk key -> cached chunk, for chunks units stand in or next to
  let planning = null;                   // L3.6: temporary fine grids; planning never activates chunks
  let clock = 0, stats = { built: 0, buildMs: 0, worstMs: 0 };
  const keyOf = (cx, cz) => cz * CX + cx;
  const inRange = (cx, cz) => cx >= 0 && cz >= 0 && cx < CX && cz < CZ;

  // ---------- chunks ----------
  function build(cx, cz) {
    const t0 = performance.now();
    const gen = buildChunk(world, cfg, cx, cz, seed, { city });
    const grid = new Uint8Array(N * N), x0 = gen.x0, z0 = gen.z0;
    const buckets = Array.from({ length: NB * NB }, () => []);
    gen.blockers.forEach((b, n) => {
      const i0 = Math.max(0, Math.floor((b.minX - PAD - x0) / CELL)), i1 = Math.min(N - 1, Math.floor((b.maxX + PAD - x0) / CELL));
      const j0 = Math.max(0, Math.floor((b.minZ - PAD - z0) / CELL)), j1 = Math.min(N - 1, Math.floor((b.maxZ + PAD - z0) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cxw = x0 + (i + 0.5) * CELL, czw = z0 + (j + 0.5) * CELL;
        if (cxw > b.minX - PAD && cxw < b.maxX + PAD && czw > b.minZ - PAD && czw < b.maxZ + PAD) grid[j * N + i] = 1;
      }
      const bi0 = Math.max(0, Math.floor((b.minX - x0) / B)), bi1 = Math.min(NB - 1, Math.floor((b.maxX - x0) / B));
      const bj0 = Math.max(0, Math.floor((b.minZ - z0) / B)), bj1 = Math.min(NB - 1, Math.floor((b.maxZ - z0) / B));
      for (let j = bj0; j <= bj1; j++) for (let i = bi0; i <= bi1; i++) buckets[j * NB + i].push(n);
    });
    const ms = performance.now() - t0;
    stats.built++; stats.buildMs += ms; stats.worstMs = Math.max(stats.worstMs, ms);
    return { key: keyOf(cx, cz), id: gen.id, cx, cz, gen, grid, buckets, used: 0 };
  }
  function ensure(cx, cz) {
    if (!inRange(cx, cz)) return null;
    const k = keyOf(cx, cz);
    let c = cache.get(k);
    if (!c) cache.set(k, c = build(cx, cz));
    c.used = ++clock;
    return c;
  }

  // Which chunks are active: those within loadRadius of any standing unit on the island.
  // Deterministic from the units' positions, so a loaded save activates the same chunks.
  function update(entities) {
    const want = new Map();
    for (const e of entities) {
      if (e.place !== 'world' || e.dead || e.worldCamp || e.worker) continue;
      const ecx = Math.floor(e.x / S), ecz = Math.floor(e.z / S);
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const cx = ecx + dx, cz = ecz + dz, k = keyOf(cx, cz);
        if (!want.has(k) && inRange(cx, cz)) want.set(k, null);
      }
    }
    for (const k of [...want.keys()].sort((a, b) => a - b)) want.set(k, ensure(k % CX, Math.floor(k / CX)));
    active = want;
    if (cache.size > KEEP) {
      const idle = [...cache.values()].filter(c => !active.has(c.key)).sort((a, b) => a.used - b.used);
      for (const c of idle.slice(0, cache.size - KEEP)) cache.delete(c.key);
    }
  }

  // ---------- fine walk grid over the active chunks ----------
  const cellOf = (x, z) => [Math.floor(x / CELL), Math.floor(z / CELL)];
  const centre = (i, j) => [(i + 0.5) * CELL, (j + 0.5) * CELL];
  function free(i, j) {
    const cx = Math.floor(i / N), cz = Math.floor(j / N);
    if (!inRange(cx, cz)) return false;
    const key = keyOf(cx, cz);
    if (planning && !planning.has(key)) planning.set(key, cache.get(key) || build(cx, cz));
    const c = planning ? planning.get(key) : active.get(key);
    if (!c || !inRange(cx, cz)) return false;
    return !c.grid[(j - cz * N) * N + (i - cx * N)];
  }
  function nearestFreeCell(x, z, maxRing = 12) {
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
  function clearLine(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5));
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0, [i, j] = cellOf(ax + (bx - ax) * t, az + (bz - az) * t);
      if (!free(i, j)) return false;
    }
    return true;
  }
  // bounds of the active chunks, in fine cells
  function activeBox() {
    if (planning) return [0, 0, CX * N - 1, CZ * N - 1];
    let i0 = Infinity, j0 = Infinity, i1 = -Infinity, j1 = -Infinity;
    for (const c of active.values()) { i0 = Math.min(i0, c.cx * N); j0 = Math.min(j0, c.cz * N); i1 = Math.max(i1, c.cx * N + N - 1); j1 = Math.max(j1, c.cz * N + N - 1); }
    return [i0, j0, i1, j1];
  }

  // A* on the fine cells inside a window (cells i0..i1, j0..j1); yields once per step like sim/nav.js
  function* fineSearch(start, goal, win) {
    const [wi0, wj0, wi1, wj1] = win, W = wi1 - wi0 + 1, H = wj1 - wj0 + 1;
    const local = (i, j) => (i < wi0 || j < wj0 || i > wi1 || j > wj1) ? -1 : (j - wj0) * W + (i - wi0);
    const S0 = local(...start), G = local(...goal);
    if (S0 < 0 || G < 0) return null;
    const g = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1), closed = new Uint8Array(W * H);
    const h = k => { const di = Math.abs(k % W - (goal[0] - wi0)), dj = Math.abs(((k / W) | 0) - (goal[1] - wj0)); return Math.max(di, dj) + 0.414 * Math.min(di, dj); };
    const open = heap();
    g[S0] = 0; open.push(h(S0), S0);
    let found = false, budget = cfg.maxSearchSteps ?? 20000;   // a goal round a long detour: give up here, the island route finds it
    while (open.size) {
      yield;
      if (--budget < 0) return null;
      const [, k] = open.pop();
      if (closed[k]) continue;
      if (k === G) { found = true; break; }
      closed[k] = 1;
      const i = k % W + wi0, j = ((k / W) | 0) + wj0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj, n = local(ni, nj);
        if (n < 0 || !free(ni, nj)) continue;
        if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
        const ng = g[k] + (di && dj ? SQ2 : 1);
        if (ng < g[n]) { g[n] = ng; from[n] = k; open.push(ng + h(n), n); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = G; k !== -1 && k !== S0; k = from[k]) cells.push(centre(k % W + wi0, ((k / W) | 0) + wj0));
    return cells.reverse();
  }

  // straighten a cell path: skip every waypoint that can be reached directly
  function* straighten(ax, az, cells) {
    const out = [];
    let px = ax, pz = az, idx = 0;
    while (idx < cells.length) {
      let far = idx;
      for (let t = cells.length - 1; t > idx; t--) { yield; if (clearLine(px, pz, cells[t][0], cells[t][1])) { far = t; break; } }
      out.push(cells[far]); [px, pz] = cells[far]; idx = far + 1;
    }
    return out;
  }

  // fine path from a to b inside the active chunks, or null
  function* localPath(ax, az, bx, bz) {
    if (!free(...cellOf(bx, bz))) {   // a goal inside a wall: back off toward the unit
      const d = Math.hypot(ax - bx, az - bz), n = Math.ceil(d / (CELL * 0.5));
      for (let k = 1; k <= n; k++) { const x = bx + (ax - bx) * k / n, z = bz + (az - bz) * k / n; if (free(...cellOf(x, z))) { bx = x; bz = z; break; } }
    }
    const goal = nearestFreeCell(bx, bz);
    if (!goal) return null;
    const [gx, gz] = free(...cellOf(bx, bz)) ? [bx, bz] : centre(...goal);
    if (clearLine(ax, az, gx, gz)) return [[gx, gz]];
    const start = nearestFreeCell(ax, az);
    if (!start) return null;
    const [A0, B0, A1, B1] = activeBox();
    for (const margin of [32]) {
      const win = [Math.max(A0, Math.min(start[0], goal[0]) - margin), Math.max(B0, Math.min(start[1], goal[1]) - margin),
        Math.min(A1, Math.max(start[0], goal[0]) + margin), Math.min(B1, Math.max(start[1], goal[1]) + margin)];
      if ((win[2] - win[0] + 1) * (win[3] - win[1] + 1) > (cfg.maxSearchCells ?? 250000) && margin > 32) break;
      const cells = yield* fineSearch(start, goal, win);
      if (cells) { cells[cells.length - 1] = [gx, gz]; return yield* straighten(ax, az, cells); }
    }
    return null;
  }

  // point at distance d along a polyline starting at (ax, az); returns [x, z, index of the next point]
  function along(ax, az, pts, d) {
    let px = ax, pz = az;
    for (let k = 0; k < pts.length; k++) {
      const [x, z] = pts[k], l = Math.hypot(x - px, z - pz);
      if (l >= d) { const t = l ? d / l : 0; return [px + (x - px) * t, pz + (z - pz) * t, k]; }
      d -= l; px = x; pz = z;
    }
    return null;
  }

  // Waypoints [[x, z], ...] from a to b. A long trip is refined only for its first refineAhead units;
  // the returned array then carries replanAt = how many coarse waypoints follow (sim/crew_orders.js
  // asks again when only those are left).
  function* searchPath(ax, az, bx, bz) {
    const far = Math.hypot(bx - ax, bz - az) > (cfg.refineAhead ?? 200) || !active.has(keyOf(Math.floor(bx / S), Math.floor(bz / S)));
    if (!far) { const p = yield* localPath(ax, az, bx, bz); if (p) return p; }
    const r = route(ax, az, bx, bz);
    if (!r) return null;
    const cut = along(ax, az, r.points, cfg.refineAhead ?? 200);
    if (!cut) return yield* localPath(ax, az, bx, bz);
    const [sx, sz, next] = cut, rest = r.points.slice(next);
    const head = yield* localPath(ax, az, sx, sz);
    if (!head) return null;
    const out = [...head, ...rest];
    out.replanAt = rest.length;
    return out;
  }
  function beginPath(...args) {
    const iterator = searchPath(...args); let result = { done: false }, work = 0, steps = 0;
    return { advance(budget = 256) { work = 0; for (let i = 0; i < budget && !result.done; i++) { work++; steps++; result = iterator.next(); } return result.done; },
      get work() { return work; }, get steps() { return steps; }, get done() { return result.done; }, get path() { return result.done ? result.value : undefined; } };
  }
  function findPath(...args) { const job = beginPath(...args); while (!job.advance(65536)) {} return job.path; }

  // ---------- island-wide route graph (HPA*) on the terrain cells ----------
  let graph = null;   // { pass, borders: Map, cross: Map, intra: Map }
  const tIdx = (i, j) => i * NX + j;   // terrain cell (row i = z, column j = x)
  const chunkOfT = t => keyOf(Math.floor((t % NX) / K), Math.floor(Math.floor(t / NX) / K));
  function cellsOfChunk(cx, cz) { return [cz * K, Math.min(NZ, cz * K + K) - 1, cx * K, Math.min(NX, cx * K + K) - 1]; }
  // walking costs inside one chunk from terrain cell s to every cell of that chunk
  function chunkDijkstra(pass, s, cx, cz) {
    const [i0, i1, j0, j1] = cellsOfChunk(cx, cz), dist = new Map([[s, 0]]), prev = new Map(), open = heap();
    open.push(0, s);
    while (open.size) {
      const [d, t] = open.pop();
      if (d > dist.get(t)) continue;
      const i = Math.floor(t / NX), j = t % NX;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < i0 || ni > i1 || nj < j0 || nj > j1 || !pass[tIdx(ni, nj)]) continue;
        if (di && dj && (!pass[tIdx(i + di, j)] || !pass[tIdx(i, j + dj)])) continue;
        const n = tIdx(ni, nj), nd = d + (di && dj ? SQ2 : 1);
        if (nd < (dist.get(n) ?? Infinity)) { dist.set(n, nd); prev.set(n, t); open.push(nd, n); }
      }
    }
    return { dist, prev };
  }
  // portals on one border: 'E' between (cx, cz) and (cx+1, cz), 'S' between (cx, cz) and (cx, cz+1)
  function borderPortals(pass, side, cx, cz) {
    const out = [];
    const pairs = [];
    if (side === 'E') { const j = cx * K + K - 1; if (j + 1 >= NX) return out; for (let i = cz * K; i < Math.min(NZ, cz * K + K); i++) pairs.push([tIdx(i, j), tIdx(i, j + 1)]); }
    else { const i = cz * K + K - 1; if (i + 1 >= NZ) return out; for (let j = cx * K; j < Math.min(NX, cx * K + K); j++) pairs.push([tIdx(i, j), tIdx(i + 1, j)]); }
    let run = [];
    for (const p of [...pairs, null]) {
      if (p && pass[p[0]] && pass[p[1]]) { run.push(p); continue; }
      if (run.length) out.push(run[Math.floor((run.length - 1) / 2)]);
      run = [];
    }
    return out;
  }
  function nodesOf(cx, cz) {
    const g = graph, set = new Set();
    for (const [a] of g.borders.get(`E${cx},${cz}`) || []) set.add(a);
    for (const [, b] of g.borders.get(`E${cx - 1},${cz}`) || []) set.add(b);
    for (const [a] of g.borders.get(`S${cx},${cz}`) || []) set.add(a);
    for (const [, b] of g.borders.get(`S${cx},${cz - 1}`) || []) set.add(b);
    return [...set].sort((a, b) => a - b);
  }
  function setBorder(side, cx, cz) {
    const g = graph, k = `${side}${cx},${cz}`;
    for (const [a, b] of g.borders.get(k) || []) { g.cross.get(a)?.delete(b); g.cross.get(b)?.delete(a); }
    const list = inRange(cx, cz) ? borderPortals(g.pass, side, cx, cz) : [];
    g.borders.set(k, list);
    for (const [a, b] of list) { (g.cross.get(a) || g.cross.set(a, new Set()).get(a)).add(b); (g.cross.get(b) || g.cross.set(b, new Set()).get(b)).add(a); }
  }
  function setIntra(cx, cz) {
    if (!inRange(cx, cz)) return;
    const g = graph, nodes = nodesOf(cx, cz), edges = new Map();
    for (const n of nodes) {
      const { dist } = chunkDijkstra(g.pass, n, cx, cz);
      edges.set(n, nodes.filter(m => m !== n && dist.has(m)).map(m => [m, dist.get(m)]));
    }
    g.intra.set(keyOf(cx, cz), edges);
  }
  function ensureGraph() {
    if (graph) return graph;
    const t0 = performance.now();
    const pass = new Uint8Array(NX * NZ);
    for (let i = 0; i < NZ; i++) for (let j = 0; j < NX; j++) {
      const x = (j + 0.5) * TC, z = (i + 0.5) * TC;
      pass[tIdx(i, j)] = passable(world, x, z) && !(city && x > city.minX && x < city.maxX && z > city.minZ && z < city.maxZ) ? 1 : 0;
    }
    graph = { pass, borders: new Map(), cross: new Map(), intra: new Map(), ms: 0 };
    for (let cz = 0; cz < CZ; cz++) for (let cx = 0; cx < CX; cx++) { setBorder('E', cx, cz); setBorder('S', cx, cz); }
    for (let cz = 0; cz < CZ; cz++) for (let cx = 0; cx < CX; cx++) setIntra(cx, cz);
    graph.ms = performance.now() - t0;
    return graph;
  }
  function nearestPassT(x, z) {
    const g = ensureGraph(), ci = Math.floor(z / TC), cj = Math.floor(x / TC);
    for (let r = 0; r <= 4; r++) {
      let best = null, bd = Infinity;
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= NZ || j >= NX || !g.pass[tIdx(i, j)]) continue;
        const d = ((j + 0.5) * TC - x) ** 2 + ((i + 0.5) * TC - z) ** 2;
        if (d < bd) { bd = d; best = tIdx(i, j); }
      }
      if (best != null) return best;
    }
    return null;
  }
  const tCentre = t => [(t % NX + 0.5) * TC, (Math.floor(t / NX) + 0.5) * TC];
  function coarseClear(pass, [ax, az], [bx, bz]) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (TC * 0.25));
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0, x = ax + (bx - ax) * t, z = az + (bz - az) * t, i = Math.floor(z / TC), j = Math.floor(x / TC);
      if (i < 0 || j < 0 || i >= NZ || j >= NX || !pass[tIdx(i, j)]) return false;
    }
    return true;
  }
  // terrain cells from s to t inside one chunk (both in it)
  function chunkCells(pass, s, t) {
    const cx = Math.floor((s % NX) / K), cz = Math.floor(Math.floor(s / NX) / K);
    const { prev } = chunkDijkstra(pass, s, cx, cz), out = [];
    for (let c = t; c !== undefined && c !== s; c = prev.get(c)) out.push(c);
    return out.reverse();
  }

  // Island route from a to b on the terrain cells, without loading any chunk:
  // { points: [[x, z], ...] ending at b, cost (in terrain cells), nodes (abstract nodes searched) } or null.
  // Recent routes by goal cell: a unit asking again on the way (replanAt) or a crew sent to the same
  // spot picks up the rest of a route already found instead of searching the island again.
  const recent = new Map();
  function route(ax, az, bx, bz) {
    const g = ensureGraph(), s = nearestPassT(ax, az), t = nearestPassT(bx, bz);
    if (s == null || t == null) return null;
    const hit = recent.get(t);
    if (hit) {
      let best = -1, bd = S * S;
      hit.points.forEach(([x, z], k) => { const d = (x - ax) ** 2 + (z - az) ** 2; if (d < bd && coarseClear(g.pass, [ax, az], [x, z])) { bd = d; best = k; } });
      if (best >= 0) {
        const points = [...hit.points.slice(best).map(p => [...p])];
        points[points.length - 1] = [bx, bz];
        return { points, cost: hit.cost, searched: 0, reused: true };
      }
    }
    const sc = chunkOfT(s), tc = chunkOfT(t);
    const scx = sc % CX, scz = Math.floor(sc / CX), tcx = tc % CX, tcz = Math.floor(tc / CX);
    let seq = null, cost = 0, searched = 0;
    if (sc === tc) { const d = chunkDijkstra(g.pass, s, scx, scz).dist; if (d.has(t)) { seq = [s, t]; cost = d.get(t); } }
    if (!seq) {
      const fromS = chunkDijkstra(g.pass, s, scx, scz).dist, toT = chunkDijkstra(g.pass, t, tcx, tcz).dist;
      const START = -1, GOAL = -2;
      const [tx, tz] = [t % NX, Math.floor(t / NX)];
      const h = n => { const dx = Math.abs(n % NX - tx), dz = Math.abs(Math.floor(n / NX) - tz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
      const dist = new Map([[START, 0]]), prev = new Map(), open = heap(), done = new Set();
      open.push(0, START);
      const tNodes = new Set(nodesOf(tcx, tcz).filter(n => toT.has(n)));
      while (open.size) {
        const [, n] = open.pop();
        if (done.has(n)) continue;
        done.add(n); searched++;
        if (n === GOAL) break;
        const d = dist.get(n), edges = [];
        if (n === START) for (const m of nodesOf(scx, scz)) { if (fromS.has(m)) edges.push([m, fromS.get(m)]); }
        else {
          for (const e of g.intra.get(chunkOfT(n))?.get(n) || []) edges.push(e);
          for (const m of g.cross.get(n) || []) edges.push([m, 1]);
          if (tNodes.has(n)) edges.push([GOAL, toT.get(n)]);
        }
        for (const [m, c] of edges) {
          const nd = d + c;
          if (nd < (dist.get(m) ?? Infinity)) { dist.set(m, nd); prev.set(m, n); open.push(nd + (m === GOAL ? 0 : h(m)), m); }
        }
      }
      if (!dist.has(GOAL)) return null;
      cost = dist.get(GOAL);
      seq = [];
      for (let n = GOAL; n !== undefined; n = prev.get(n)) seq.push(n === GOAL ? t : n === START ? s : n);
      seq.reverse();
    }
    // expand the node chain into terrain cells, then straighten on the terrain grid
    const cells = [s];
    for (let k = 1; k < seq.length; k++) {
      const a = seq[k - 1], b = seq[k];
      if (a === b) continue;
      if (chunkOfT(a) === chunkOfT(b)) cells.push(...chunkCells(g.pass, a, b));
      else cells.push(b);
    }
    const pts = cells.map(tCentre);
    const out = [];
    let p = [ax, az], idx = 1;
    while (idx < pts.length) {
      let far = idx;
      for (let q = pts.length - 1; q > idx; q--) if (coarseClear(g.pass, p, pts[q])) { far = q; break; }
      out.push(pts[far]); p = pts[far]; idx = far + 1;
    }
    out.push([bx, bz]);
    recent.delete(t); recent.set(t, { points: out.map(p => [...p]), cost });
    if (recent.size > 16) recent.delete(recent.keys().next().value);
    return { points: out, cost, searched };
  }

  // Edit the terrain passability inside one chunk (later: walls, buildings, bridges) and rebuild only
  // that chunk's portals and the walking costs of it and its four neighbours.
  // fn(set) with set(i, j, passable) for terrain cells (row i, column j) inside the chunk.
  function editChunk(cx, cz, fn) {
    const g = ensureGraph(), [i0, i1, j0, j1] = cellsOfChunk(cx, cz);
    recent.clear();
    fn((i, j, v) => { if (i >= i0 && i <= i1 && j >= j0 && j <= j1) g.pass[tIdx(i, j)] = v ? 1 : 0; });
    setBorder('E', cx, cz); setBorder('S', cx, cz); setBorder('E', cx - 1, cz); setBorder('S', cx, cz - 1);
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) setIntra(cx + dx, cz + dz);
    const c = cache.get(keyOf(cx, cz));
    if (c) { cache.delete(c.key); if (active.has(c.key)) active.set(c.key, ensure(cx, cz)); }
  }
  // the portals on a chunk's four borders, for tests and the design note
  const portalsOf = (cx, cz) => { ensureGraph(); return ['E' + cx + ',' + cz, 'E' + (cx - 1) + ',' + cz, 'S' + cx + ',' + cz, 'S' + cx + ',' + (cz - 1)].map(k => graph.borders.get(k) || []); };

  // ---------- for tryMove and sight ----------
  function blockersNear(x0, z0, x1, z1) {
    const out = [];
    for (let cz = Math.floor(z0 / S); cz <= Math.floor(z1 / S); cz++) for (let cx = Math.floor(x0 / S); cx <= Math.floor(x1 / S); cx++) {
      const c = active.get(keyOf(cx, cz));
      if (!c || !inRange(cx, cz)) { out.push({ minX: cx * S, maxX: cx * S + S, minZ: cz * S, maxZ: cz * S + S }); continue; }   // asleep or off the map: a wall
      const bl = c.gen.blockers, seen = new Set();
      for (let j = Math.max(0, Math.floor((z0 - c.gen.z0) / B)); j <= Math.min(NB - 1, Math.floor((z1 - c.gen.z0) / B)); j++)
        for (let i = Math.max(0, Math.floor((x0 - c.gen.x0) / B)); i <= Math.min(NB - 1, Math.floor((x1 - c.gen.x0) / B)); i++)
          for (const n of c.buckets[j * NB + i]) if (!seen.has(n)) { seen.add(n); out.push(bl[n]); }
    }
    return out;
  }
  // lights on the island near a point (campfires and the like, from chunk props with light: true)
  function lightsNear(x, z, r) {
    const out = [];
    for (const c of active.values()) for (const p of c.gen.props) if (p.light && Math.hypot(p.x - x, p.z - z) <= r) out.push(p);
    return out;
  }

  // Full fine path for a saved worker trip, identical whether its chunks are awake or asleep.
  // Temporary grids are discarded after the search; neither residency nor cache size changes.
  function workerPath(ax, az, bx, bz) {
    planning = new Map();
    try {
      const start = nearestFreeCell(ax, az), end = nearestFreeCell(bx, bz);
      if (!start || !end) return null;
      const a = free(...cellOf(ax, az)) ? [ax, az] : centre(...start);
      const b = free(...cellOf(bx, bz)) ? [bx, bz] : centre(...end);
      const job = localPath(...a, ...b); let next;
      do { next = job.next(); } while (!next.done);
      return next.value && [a, ...next.value];
    } finally { planning = null; }
  }
  const nav = { beginPath, findPath, workerPath, clearLine, free: (x, z) => free(...cellOf(x, z)), nearestFree: (x, z) => { const c = nearestFreeCell(x, z); return c && centre(...c); } };
  return {
    nav, update, route, editChunk, portalsOf, blockersNear, lightsNear, ensureGraph,
    chunkSize: S, chunkOf: (x, z) => [Math.floor(x / S), Math.floor(z / S)], chunkId,
    activeIds: () => [...active.values()].map(c => c.id).sort(),
    active: () => [...active.values()],
    cached: () => cache.size,
    stats: () => ({ ...stats, cached: cache.size, active: active.size, graphMs: graph?.ms ?? null }),
    city,
  };
}
