// World data (frontier W1): read-only helpers and the validator for game/data/world.json.
// Pure module: no DOM, no three.js, no randomness. Coordinates: x east, z south, world units.
// Rule numbers (spacing, route counts, choke radii, road costs) live in world.rules.

import { shorelineTopology } from './shoreline.js';

const BLOCKED = new Set(['m', 'w']);        // never walkable
const UNBUILDABLE = new Set(['m', 'w', 'r', 'k']);

function grid(world) {
  const t = world.terrain;
  return { cell: t.cell, rows: t.rows, nz: t.rows.length, nx: t.rows[0]?.length || 0 };
}

// Terrain code letter at a world point ('p', 'f', ...). Off the grid counts as sea ('w').
export function terrainAt(world, x, z) {
  const g = grid(world);
  const i = Math.floor(z / g.cell), j = Math.floor(x / g.cell);
  if (i < 0 || j < 0 || i >= g.nz || j >= g.nx) return 'w';
  const code = g.rows[i][j];
  return world.terrain.shoreline?.radius ? shorelineTopology(world).codeAt(x, z, code) : code;
}

export function terrainName(world, x, z) {
  return world.terrain.codes[terrainAt(world, x, z)] || 'unknown';
}

// River cells within rules.fordRadius of a crossing count as walkable (route graph and walk grid, 50-unit
// cells), bridges included, so the water beside a bridge is walkable too. Deck-only walking is parked:
// see to_delete/bridge_deck_attempt/NOTES.md.
function nearFord(world, x, z) {
  const r = world.rules.fordRadius;
  return (world.fords || []).some(f => Math.hypot(f.x - x, f.z - z) < r);
}

// Walkable on foot: not mountain or water; river only at a ford or bridge.
export function passable(world, x, z) {
  const c = terrainAt(world, x, z);
  if (BLOCKED.has(c)) return false;
  if (c === 'r') return nearFord(world, x, z);
  return true;
}

export function buildable(world, x, z) {
  return !UNBUILDABLE.has(terrainAt(world, x, z));
}

// ---------- grid search helpers (validator and tools only) ----------

export function buildGrids(world) {
  const g = grid(world), { cell, nx, nz, rows } = g;
  const pass = new Uint8Array(nx * nz);
  const choke = new Int16Array(nx * nz).fill(-1);   // index into chokes[]
  const cost = new Float32Array(nx * nz);
  const chokes = [];
  const cx = j => (j + 0.5) * cell, cz = i => (i + 0.5) * cell;
  const mark = (list, kind, radius, onlyCode) => {
    for (const p of list || []) {
      const k = chokes.push({ id: p.id, kind }) - 1;
      const rc = Math.ceil(radius / cell);
      const pi = Math.floor(p.z / cell), pj = Math.floor(p.x / cell);
      for (let i = Math.max(0, pi - rc); i <= Math.min(nz - 1, pi + rc); i++)
        for (let j = Math.max(0, pj - rc); j <= Math.min(nx - 1, pj + rc); j++) {
          if (onlyCode && rows[i][j] !== onlyCode) continue;
          if (Math.hypot(cx(j) - p.x, cz(i) - p.z) < radius && choke[i * nx + j] < 0) choke[i * nx + j] = k;
        }
    }
  };
  mark(world.passes, 'pass', world.rules.passRadius, null);
  mark(world.fords, 'ford', world.rules.fordRadius, 'r');
  const rc = world.rules.roadCost;
  for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
    const c = rows[i][j], k = i * nx + j;
    const ok = !BLOCKED.has(c) && (c !== 'r' || (choke[k] >= 0 && chokes[choke[k]].kind === 'ford'));
    pass[k] = ok ? 1 : 0;
    cost[k] = rc[c] ?? 99;
  }
  return { ...g, pass, choke, chokes, cost, cx, cz };
}

const cellOf = (G, x, z) => {
  const i = Math.floor(z / G.cell), j = Math.floor(x / G.cell);
  return (i < 0 || j < 0 || i >= G.nz || j >= G.nx) ? -1 : i * G.nx + j;
};

// Flood fill over passable cells from `start`, skipping cells whose choke is in `banned`.
function flood(G, start, banned) {
  const seen = new Uint8Array(G.nx * G.nz);
  if (start < 0 || !G.pass[start]) return seen;
  const stack = [start]; seen[start] = 1;
  while (stack.length) {
    const k = stack.pop(), i = (k / G.nx) | 0, j = k % G.nx;
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a < 0 || b < 0 || a >= G.nz || b >= G.nx) continue;
      const n = a * G.nx + b;
      if (seen[n] || !G.pass[n] || (banned && G.choke[n] >= 0 && banned.has(G.choke[n]))) continue;
      seen[n] = 1; stack.push(n);
    }
  }
  return seen;
}

// Cheapest 8-way path by road cost from src to dst, avoiding banned chokes. Returns cell list or null.
function shortest(G, src, dst, banned) {
  const N = G.nx * G.nz, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const heap = [];   // [d, k] binary min-heap
  const push = (d, k) => { heap.push([d, k]); let c = heap.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let c = 0;
      for (;;) { const l = 2 * c + 1, r = l + 1; let m = c;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } }
    return top; };
  dist[src] = 0; push(0, src);
  const steps = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
  while (heap.length) {
    const [d, k] = pop();
    if (k === dst) break;
    if (d > dist[k]) continue;
    const i = (k / G.nx) | 0, j = k % G.nx;
    for (const [di, dj, m] of steps) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= G.nz || b >= G.nx) continue;
      const n = a * G.nx + b;
      if (!G.pass[n] || (G.choke[n] >= 0 && banned.has(G.choke[n]))) continue;
      const nd = d + G.cost[n] * m;
      if (nd < dist[n]) { dist[n] = nd; prev[n] = k; push(nd, n); }
    }
  }
  if (dist[dst] === Infinity) return null;
  const path = [dst];
  while (path[path.length - 1] !== src) path.push(prev[path[path.length - 1]]);
  return { cells: path.reverse(), cost: dist[dst] * G.cell };
}

// Count routes from a site to the capital that share no pass or ford (chokes within
// rules.siteChokeIgnore of the site don't count: every route leaves through them).
// A route that crosses no choke at all can't be cut, so it counts as enough.
export function countRoutes(world, x, z, G = buildGrids(world)) {
  const need = world.rules.minRoutes, cap = cellOf(G, world.capital.x, world.capital.z);
  const src = cellOf(G, x, z), banned = new Set();
  let n = 0, first = null;
  while (n < need) {
    const r = shortest(G, src, cap, banned);
    if (!r) break;
    first ||= r; n++;
    const used = new Set();
    for (const k of r.cells) {
      const c = G.choke[k]; if (c < 0) continue;
      const i = (k / G.nx) | 0, j = k % G.nx;
      if (Math.hypot(G.cx(j) - x, G.cz(i) - z) >= world.rules.siteChokeIgnore) used.add(c);
    }
    if (!used.size) { n = need; break; }
    for (const c of used) banned.add(c);
  }
  return { routes: n, travelCost: first ? Math.round(first.cost) : null };
}

function insidePoly(poly, x, z) {
  let inside = false;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [xa, za] = poly[a], [xb, zb] = poly[b];
    if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) inside = !inside;
  }
  return inside;
}

export function onIsland(world, x, z) {
  return insidePoly(world.coast, x, z) || (world.islets || []).some(s => Math.hypot(s.x - x, s.z - z) <= s.r);
}

// Returns a list of problems: [{ code, id, msg }]. Empty list = valid.
export function validateWorld(world) {
  const out = [], bad = (code, id, msg) => out.push({ code, id, msg: `${id ? id + ': ' : ''}${msg}` });
  if (!world?.rules) { bad('no_rules', null, 'world.rules missing'); return out; }
  const g = grid(world), R = world.rules;
  if (!g.nz || g.rows.some(r => r.length !== g.nx)) bad('grid', null, 'terrain rows missing or uneven');
  if (g.nx * g.cell !== world.size.w || g.nz * g.cell !== world.size.h) bad('grid', null, 'terrain grid does not match size');
  for (const r of g.rows) for (const c of r) if (!world.terrain.codes[c]) { bad('grid', null, `unknown terrain code '${c}'`); return out; }
  if (!world.capital) { bad('no_capital', null, 'capital missing'); return out; }

  const G = buildGrids(world);
  const pts = [['capital', [{ id: 'capital', ...world.capital }]], ['site', world.sites], ['node', world.nodes],
    ['camp', world.camps], ['pass', world.passes], ['ford', world.fords]];
  for (const [kind, list] of pts) for (const p of list || []) {
    if (!onIsland(world, p.x, p.z)) bad('off_island', p.id, `${kind} is outside the coast`);
  }
  for (const s of world.sites || []) {
    const c = terrainAt(world, s.x, s.z);
    if (UNBUILDABLE.has(c)) bad('bad_ground', s.id, `site on ${world.terrain.codes[c]}`);
  }
  for (const [kind, list] of [['node', world.nodes], ['camp', world.camps]]) for (const p of list || []) {
    const c = terrainAt(world, p.x, p.z);
    if (c === 'w' && kind === 'node' && R.waterNodeKinds?.includes(p.kind)) continue;
    if (BLOCKED.has(c)) bad('bad_ground', p.id, `${kind} on ${world.terrain.codes[c]}`);
  }
  const sites = world.sites || [];
  for (let a = 0; a < sites.length; a++) for (let b = a + 1; b < sites.length; b++) {
    const d = Math.hypot(sites[a].x - sites[b].x, sites[a].z - sites[b].z);
    if (d < R.minSiteSpacing) bad('too_close', sites[a].id, `${Math.round(d)} u from ${sites[b].id} (min ${R.minSiteSpacing})`);
  }

  // reachability, and no single pass seals any site off
  const cap = cellOf(G, world.capital.x, world.capital.z);
  if (cap < 0 || !G.pass[cap]) bad('capital_blocked', 'capital', 'capital cell is not passable');
  const reach = flood(G, cap, null);
  const siteCell = s => cellOf(G, s.x, s.z);
  for (const s of sites) if (!reach[siteCell(s)]) bad('unreachable', s.id, 'no land route to the capital');
  G.chokes.forEach((c, k) => {
    if (c.kind !== 'pass') return;
    const r = flood(G, cap, new Set([k]));
    const pt = (world.passes || []).find(q => q.id === c.id);
    const cut = sites.filter(s => reach[siteCell(s)] && !r[siteCell(s)]
      && Math.hypot(pt.x - s.x, pt.z - s.z) >= R.siteChokeIgnore);   // a pass at the site's door is its own exit, not a seal
    if (cut.length) bad('pass_seals', c.id, `blocking this pass cuts off ${cut.map(s => s.id).join(', ')}`);
  });
  for (const s of sites) {
    if (!reach[siteCell(s)]) continue;
    const { routes } = countRoutes(world, s.x, s.z, G);
    if (routes < R.minRoutes) bad('few_routes', s.id, `${routes} independent route(s) to the capital (min ${R.minRoutes})`);
  }

  // unbuildable share of land (unreachable buildable pockets count as unbuildable)
  let land = 0, unb = 0;
  for (let k = 0; k < G.nx * G.nz; k++) {
    const c = g.rows[(k / G.nx) | 0][k % G.nx];
    if (c === 'w') continue;
    land++;
    if (UNBUILDABLE.has(c) || !reach[k]) unb++;
  }
  if (land && unb / land > R.maxUnbuildableShare)
    bad('too_unbuildable', null, `${Math.round(100 * unb / land)}% of land unbuildable (max ${Math.round(100 * R.maxUnbuildableShare)}%)`);

  // harbors and sea lanes
  const isWater = (x, z) => terrainAt(world, x, z) === 'w';
  const nextToWater = (x, z) => [[g.cell, 0], [-g.cell, 0], [0, g.cell], [0, -g.cell]].some(([dx, dz]) => isWater(x + dx, z + dz));
  const ports = { capital: world.capital.port || null };
  for (const s of sites) if (s.harbor) {
    ports[s.id] = s.harbor;
    if (isWater(s.harbor.x, s.harbor.z) || !nextToWater(s.harbor.x, s.harbor.z)) bad('bad_harbor', s.id, 'harbor is not a shore cell');
  }
  if (world.capital.port && (isWater(world.capital.port.x, world.capital.port.z) || !nextToWater(world.capital.port.x, world.capital.port.z)))
    bad('bad_harbor', 'capital', 'capital port is not a shore cell');
  for (const l of world.seaLanes || []) {
    const a = ports[l.from], b = ports[l.to];
    if (!a || !b || l.from === l.to) { bad('bad_lane', l.id, 'must join two harbors'); continue; }
    const p = l.points, end = R.laneEndSlack;
    if (Math.hypot(p[0][0] - a.x, p[0][1] - a.z) > end || Math.hypot(p.at(-1)[0] - b.x, p.at(-1)[1] - b.z) > end) {
      bad('bad_lane', l.id, 'ends are not at its harbors'); continue;
    }
    let dry = null;
    for (let q = 0; q + 1 < p.length && !dry; q++) {
      const L = Math.hypot(p[q + 1][0] - p[q][0], p[q + 1][1] - p[q][1]), n = Math.max(1, Math.ceil(L / (g.cell / 2)));
      for (let t = 0; t <= n; t++) {
        const x = p[q][0] + (p[q + 1][0] - p[q][0]) * t / n, z = p[q][1] + (p[q + 1][1] - p[q][1]) * t / n;
        if (Math.hypot(x - a.x, z - a.z) < end || Math.hypot(x - b.x, z - b.z) < end) continue;
        if (!isWater(x, z)) { dry = [Math.round(x), Math.round(z)]; break; }
      }
    }
    if (dry) bad('bad_lane', l.id, `crosses land at ${dry.join(', ')}`);
  }
  return out;
}
