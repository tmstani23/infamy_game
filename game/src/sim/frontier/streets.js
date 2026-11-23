// Organic streets (Tim 2026-11-21: the governor zoned every cell around the town hall, then had no way to
// lay a road out, so growth stopped on "needs road"). There is no fixed plan: each time it is asked, the
// governor draws up to G.streets street paths from the roads he already has (or the hall), bending toward
// his own buildings that still have no road, then toward what lies around the town (nearest other towns,
// the railway, timber, stone). Each cell has a small fixed wobble per town, so streets curve instead of
// running ruler straight, and they bend around whatever is in the way. Only the next G.streetAhead cells of
// each path are kept free of governor zones (a lane to grow into); governor.js roadSpur lays them.
// Nothing is ever erased. Player-touched cells (by 'p') are never used.
import { centreCell, cellOffset, cellToWorld, inCore, nearCliff, ringRadius, hallArtCell } from './town_grid.js';

const hash = str => { let h = 2166136261; for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
const isRoad = (g, i) => g.use[i] === 'r' || g.use[i] === 'g';

// tiny binary heap of [cost, cell]
function heap() {
  const a = [];
  return {
    get size() { return a.length; },
    push(x) { a.push(x); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } },
    pop() { const top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; },
  };
}

// aims around the town, in priority order: { x, z } world points (only their direction from the hall is used)
export function townAims(s, { towns = [], spots = [] } = {}) {
  const d = p => Math.hypot(p.x - s.x, p.z - s.z), out = [];
  out.push(...towns.filter(t => t.id !== s.id && Number.isFinite(t.x)).sort((a, b) => d(a) - d(b)).slice(0, 2));
  const rail = Object.keys(s.railCells || {}).map(Number).filter(Number.isInteger);
  if (rail.length) { const pts = rail.map(i => cellToWorld(s, i)); out.push({ x: pts.reduce((n, p) => n + p[0], 0) / pts.length, z: pts.reduce((n, p) => n + p[1], 0) / pts.length }); }
  for (const kind of ['timber', 'stone']) { const sp = spots.filter(p => p.kind === kind).sort((a, b) => d(a) - d(b))[0]; if (sp) out.push(sp); }
  return out;
}

// passable for a governor street (same ground rules as placing a road; player-touched cells left alone)
function openCell(s, i, data) {
  const g = s.grid;
  if (isRoad(g, i)) return true;
  return g.use[i] === '.' && g.zone[i] === '.' && g.by[i] === '.' && g.ground[i] !== 'x' && !nearCliff(s, i, data);
}

// One street path: the cheapest route from the road network (or hall) to the first goal cell. Each turn costs
// `turn` extra (Tim 2026-11-21: straight streets out from the hall ring, easy to join and good for zones), so
// streets run straight and bend only round what is in the way. Returns cells from the network outward, road cells
// included (they cost little, so streets follow and branch off roads).
// block: optional Set of cells the path may not use (military_plot.js keeps it off the plot itself)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export function route(s, data, linked, goal, wob = () => 0, block = null, turn = data.governor?.streetTurn ?? 4) {
  const g = s.grid, n = g.n, hall = centreCell(n), N = n * n;
  // search states: cell * 5 + heading (0-3, 4 = none yet, at a start)
  const dist = new Float64Array(N * 5).fill(Infinity), prev = new Int32Array(N * 5).fill(-1), q = heap();
  const start = j => { dist[j * 5 + 4] = 0; q.push([0, j * 5 + 4]); };
  start(hall);
  const art = new Uint8Array(N);   // the ring under the hall's art takes no road (town_grid.hallArtCell): streets leave from its edge
  for (let j = 0; j < N; j++) { if (linked[j]) start(j); else if (hallArtCell(s, j)) { art[j] = 1; start(j); } }
  const lim = (ringRadius(s, data) / g.cell + 4) ** 2, hc = hall % n, hr = (hall - hc) / n;
  while (q.size) {
    const [c0, st] = q.pop();
    if (c0 > dist[st]) continue;
    const i = (st / 5) | 0, h = st % 5;
    if (goal(i) && i !== hall && !linked[i] && !art[i]) {
      const path = []; for (let k = st; k >= 0; k = prev[k]) { const ci = (k / 5) | 0; if (ci === hall || art[ci] || prev[k] < 0 && linked[ci]) break; path.push(ci); }
      return path.reverse();
    }
    const c = i % n, r = (i - c) / n;
    for (let d = 0; d < 4; d++) {
      const [dc, dr] = DIRS[d], cc = c + dc, rr = r + dr, j = rr * n + cc;
      if (cc < 0 || rr < 0 || cc >= n || rr >= n || (cc - hc) ** 2 + (rr - hr) ** 2 > lim || !openCell(s, j, data) || block?.has(j)) continue;
      const step = (isRoad(g, j) ? 0.3 : 1 + wob(j)) + (h < 4 && h !== d ? turn : 0), ns = j * 5 + d;
      if (c0 + step < dist[ns]) { dist[ns] = c0 + step; prev[ns] = st; q.push([c0 + step, ns]); }
    }
  }
  return null;
}

// each cell's fixed wobble for a town, worked out once per town and grid size (the same numbers as hashing per step)
const wobbles = new Map();
function wobble(seed, N, W) {
  const k = `${seed}|${N}|${W}`;
  let t = wobbles.get(k);
  if (!t) { t = new Float64Array(N); for (let j = 0; j < N; j++) t[j] = hash(seed + ':' + j) * W; wobbles.set(k, t); }
  return j => t[j];
}

// streets(s, data, { linked, aims, reach }) -> [[cell, ...], ...], each from the network outward.
// Cached per town while the grid and aims stay the same.
const cache = new WeakMap();
export function streets(s, data, { linked, aims = [], reach = 3 }) {
  if (!s.grid) return [];
  const G = data.governor || {}, g = s.grid, n = g.n, want = G.streets ?? 3, gap = (G.streetGap ?? 60) * Math.PI / 180;
  const blds = (s.buildings || []).filter(b => b.type !== 'town_hall' && b.stage !== 'ruined');
  // (lag fix 2026-11-23) the key is kept in parts, so the long grid strings are not joined on every call
  const key = [g.use, g.zone, g.by, s.tier || 1, blds.map(b => b.cell).join(','), aims.map(a => `${Math.round(a.x)},${Math.round(a.z)}`).join(';')];
  const hit = cache.get(s); if (hit && hit.key.every((v, i) => v === key[i])) return hit.out;
  const W = G.streetWobble ?? 0, seed = String(s.id), wob = wobble(seed, n * n, W);
  const near = (cells, d) => { const set = new Set(); for (const i of cells) { const c = i % n, r = (i - c) / n; for (let rr = r - d; rr <= r + d; rr++) for (let cc = c - d; cc <= c + d; cc++) if (rr >= 0 && cc >= 0 && rr < n && cc < n) set.add(rr * n + cc); } return set; };
  const out = [], heads = [];
  // a street already laid all the way still counts (else a finished street would make him start one more)
  const add = path => { if (path?.length) { out.push(path); heads.push(path[path.length - 1]); } };
  // 1) his own buildings (inside the town) with no road beside them yet, nearest the hall first
  const hallXZ = [s.x, s.z], dOf = b => { const [x, z] = cellToWorld(s, b.cell); return Math.hypot(x - hallXZ[0], z - hallXZ[1]); };
  for (const b of blds.filter(b => Number.isInteger(b.cell) && inCore(s, b.cell, data)).sort((a, b) => dOf(a) - dOf(b))) {
    if (out.length >= (G.streetsToBuildings ?? 2)) break;
    const cover = b.cells?.length ? b.cells : [b.cell], ring = near(cover, 1);
    if ([...ring].some(i => isRoad(g, i) && linked[i])) continue;
    const path = route(s, data, linked, i => ring.has(i) && !cover.includes(i), wob);
    if (path) path.bld = true;
    add(path);
  }
  // 2) toward what lies around the town, a direction at a time (aims at least `gap` apart, then wobbly fill-ins)
  const R = Math.min(ringRadius(s, data), (n / 2 - 3) * g.cell), angs = [], base = hash(seed) * Math.PI * 2;   // the ring can reach past the grid edge
  const nb = out.length, dirs = Math.max(G.streetsOut ?? 2, want - nb);   // always at least two streets heading out of town (Tim 2026-11-21)
  const tryAng = ang => {
    if (out.length - nb >= dirs || angs.some(a => Math.abs(Math.atan2(Math.sin(a - ang), Math.cos(a - ang))) < gap)) return;
    angs.push(ang);
    const tx = Math.cos(ang) * R * 0.85, tz = Math.sin(ang) * R * 0.85, tol = Math.max(g.cell * 2, R * 0.2);
    const inGoal = i => { const [ox, oz] = cellOffset(s, i); return Math.hypot(ox - tx, oz - tz) <= tol; };
    for (let j = 0; j < n * n; j++) if (linked[j] && inGoal(j)) { add([j]); return; }   // a street already reaches it: done
    add(route(s, data, linked, inGoal, wob));
  };
  for (const a of aims) if (Math.hypot(a.x - s.x, a.z - s.z) > 1) tryAng(Math.atan2(a.z - s.z, a.x - s.x));
  for (let k = 0; k < 12 && out.length - nb < dirs; k++) tryAng(base + k * 2.399963);   // golden-angle steps
  cache.set(s, { key, out });
  return out;
}

// the lane to keep free: the next `ahead` non-road cells of each street
export function laneCells(paths, g, ahead) {
  const set = new Set();
  for (const p of paths) { let k = 0; for (const i of p) { if (isRoad(g, i)) continue; set.add(i); if (++k >= ahead) break; } }
  return set;
}
