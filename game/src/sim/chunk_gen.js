// Chunk generator (frontier W3.3): one square piece of the island, built from world.json alone.
// Pure and deterministic: the same world, chunk and seed always give the same chunk, so saves
// never store chunks (only state.world changes). No DOM, no three.js, no Math.random.
//   buildChunk(world, cfg, cx, cz, seed, { city }) -> {
//     id, cx, cz, x0, z0, size,
//     cells:    terrain code rows covering the chunk (cfg.chunk / terrain cell per side),
//     blockers: [{ minX, maxX, minZ, maxZ, kind }]  walk blockers (blocked terrain cells, tree trunks, rocks, the city),
//     props:    [{ kind, x, z, s }]                  things to draw (s = scale)
//   }
// cfg is game/data/world_chunks.json. city (optional) = { minX, maxX, minZ, maxZ } in island
// coordinates: the walled city is a blocker on the island (the way in is its gate, W3.5).
import { terrainAt, passable } from './world_data.js';
import {islandArt} from './island_art.js';
import { createPaint, trailSegments, hash2 } from '../world_paint.js';

export const chunkId = (cx, cz) => `c${cx}_${cz}`;

// The walled city on the island: its district bounds placed at world.capital + cityOffset (island units)
export function cityOnIsland(world, bounds) {
  const c = world.capital, o = c.cityOffset || {}, x = c.x + (o.x || 0), z = c.z + (o.z || 0);
  return { minX: x + bounds.minX, maxX: x + bounds.maxX, minZ: z + bounds.minZ, maxZ: z + bounds.maxZ };
}

// small seeded generator (mulberry32), one per chunk, seeded from the chunk position
function rngFor(seed, cx, cz) {
  let a = (Math.imul(cx + 1, 73856093) ^ Math.imul(cz + 1, 19349663) ^ (seed | 0)) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function segDist(px, pz, [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

export function buildChunk(world, cfg, cx, cz, seed = 1, { city = null } = {}) {
  const size = cfg.chunk, tc = world.terrain.cell, n = Math.round(size / tc);
  const x0 = cx * size, z0 = cz * size;
  const rng = rngFor(seed, cx, cz);
  const cells = [];
  for (let i = 0; i < n; i++) {
    let row = '';
    for (let j = 0; j < n; j++) row += terrainAt(world, x0 + (j + 0.5) * tc, z0 + (i + 0.5) * tc);
    cells.push(row);
  }
  // blocked terrain cells, merged into runs along each row
  const blockers = [];
  for (let i = 0; i < n; i++) {
    let start = -1;
    for (let j = 0; j <= n; j++) {
      const blocked = j < n && !passable(world, x0 + (j + 0.5) * tc, z0 + (i + 0.5) * tc);
      if (blocked && start < 0) start = j;
      if (!blocked && start >= 0) {
        blockers.push({ minX: x0 + start * tc, maxX: x0 + j * tc, minZ: z0 + i * tc, maxZ: z0 + (i + 1) * tc, kind: 'terrain' });
        start = -1;
      }
    }
  }
  if (city && city.maxX > x0 && city.minX < x0 + size && city.maxZ > z0 && city.minZ < z0 + size)
    blockers.push({ minX: Math.max(city.minX, x0), maxX: Math.min(city.maxX, x0 + size), minZ: Math.max(city.minZ, z0), maxZ: Math.min(city.maxZ, z0 + size), kind: 'city' });

  // what must stay clear: corridors, sites, nodes, the city
  const C = cfg.clear || {};
  const near = (list, r) => (list || []).filter(p => p.x > x0 - r && p.x < x0 + size + r && p.z > z0 - r && p.z < z0 + size + r);
  const sites = near(world.sites, C.site || 0), nodes = near(world.nodes, C.node || 0);
  const segs = [];
  for (const c of world.corridors || []) for (let k = 1; k < c.points.length; k++) {
    const [a, b] = [c.points[k - 1], c.points[k]], r = C.corridor || 0;
    if (Math.max(a[0], b[0]) < x0 - r || Math.min(a[0], b[0]) > x0 + size + r || Math.max(a[1], b[1]) < z0 - r || Math.min(a[1], b[1]) > z0 + size + r) continue;
    segs.push([a, b]);
  }
  const clearAt = (x, z, noTrail = false) => (noTrail || !segs.some(([a, b]) => segDist(x, z, a, b) < (C.corridor || 0)))
    && !sites.some(p => Math.hypot(p.x - x, p.z - z) < (C.site || 0))
    && !nodes.some(p => Math.hypot(p.x - x, p.z - z) < (C.node || 0))
    && !(city && x > city.minX - (C.city || 0) && x < city.maxX + (C.city || 0) && z > city.minZ - (C.city || 0) && z < city.maxZ + (C.city || 0));

  // W3.10: when cfg.paint is on, props come from the painted rules (jittered grid, groves, edge trees,
  // trail clearance, stamps; docs/world_painting.md layer 7). Otherwise the older per-cell scatter below.
  if (cfg.paint?.enabled) {
    const props = paintProps(world, cfg, x0, z0, size, seed, blockers, clearAt);
    return { id: chunkId(cx, cz), cx, cz, x0, z0, size, cells, blockers, props, art: islandArt(world, cfg, cx, cz) };
  }

  // props scattered per terrain cell by biome; the count per cell is fixed by density, the
  // positions by the chunk's seed. Every random draw happens whether or not a prop is kept,
  // so one rule change never reshuffles the rest of the chunk.
  const props = [], area = tc * tc / 1000;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const code = cells[i][j], kinds = cfg.props?.[code];
    if (!kinds) continue;
    for (const k of kinds) {
      const want = k.per1000 * area, count = Math.floor(want) + (rng() < want % 1 ? 1 : 0);
      for (let q = 0; q < count; q++) {
        const x = x0 + (j + rng()) * tc, z = z0 + (i + rng()) * tc;
        const s = k.scale[0] + (k.scale[1] - k.scale[0]) * rng();
        if (code !== 'm' && (!passable(world, x, z) || !clearAt(x, z))) continue;
        if(cfg.islandArt?.enabled&&k.kind==='mountain')continue;
        props.push({ kind: k.kind, x: +x.toFixed(2), z: +z.toFixed(2), s: +s.toFixed(2) });
        if (k.block > 0) { const b = k.block * s; blockers.push({ minX: x - b, maxX: x + b, minZ: z - b, maxZ: z + b, kind: k.kind }); }
      }
    }
  }
  return { id: chunkId(cx, cz), cx, cz, x0, z0, size, cells, blockers, props, art:islandArt(world,cfg,cx,cz) };
}

// Layer 7 of docs/world_painting.md. Candidates sit on one global jittered grid (one per grid x grid units,
// the offset from the seeded hash), so a chunk border never changes what is on either side of it.
function paintProps(world, cfg, x0, z0, size, seed, blockers, clearAt) {
  const pc = cfg.paint, P = createPaint(world, pc), g = pc.grid, area = g * g / 1000, ps = P.seed;
  const F = new Float32Array(P.NB), props = [];
  const segs = trailSegments(world, x0, z0, x0 + size, z0 + size, pc.trail.clearFull, pc.paths?.list), stamps = P.stampsIn(x0, z0, x0 + size, z0 + size);
  const bamboo = pc.bamboo, E = pc.edgeTrees, fo = P.B.forest;
  // Each candidate draws ONE number u and walks the rules' best-case chances (per1000 x area) end to end;
  // the rule u lands in then keeps the prop with chance (real / best case), so each rule still fires with its
  // real probability but most candidates cost one hash. All draws come from the candidate's grid cell.
  let rules = pc.props.map((r, i) => ({ ...r, i, b: P.B[r.biome], pmax: r.per1000 * area }));
  if (bamboo) rules = [...rules, { ...bamboo, i: 90, b: -1, pmax: bamboo.per1000 * area, grove: 'bamboo' }];
  let cum = 0;
  for (const r of rules) { cum += r.pmax; r.cum = cum; }
  const reach = pc.field.warp + pc.field.fine + pc.field.blur, T = world.terrain.cell, near = new Set();
  for (let z = z0 - reach; z < z0 + size + reach + T; z += T) for (let x = x0 - reach; x < x0 + size + reach + T; x += T) near.add(P.gridAt(Math.min(x, x0 + size + reach), Math.min(z, z0 + size + reach)));
  for (const r of rules) r.here = r.grove === 'bamboo' || near.has(r.b);
  for (let gj = Math.floor(z0 / g) - 1; gj <= Math.floor((z0 + size) / g) + 1; gj++) for (let gi = Math.floor(x0 / g) - 1; gi <= Math.floor((x0 + size) / g) + 1; gi++) {
    const u = hash2(gi, gj, ps + 3);
    if (u >= cum) continue;
    const x = (gi + hash2(gi, gj, ps + 1)) * g, z = (gj + hash2(gi, gj, ps + 2)) * g;
    if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size) continue;
    if (P.blockedAt(x, z)) continue;
    let k = 0;
    while (rules[k].cum <= u) k++;
    const r = rules[k];
    if (!r.here) continue;   // its biome is nowhere near this chunk
    // cheapest tests first: the keep draw against each factor (all are at most 1) before the costly field
    const keep = hash2(gi, gj, ps + 4);
    const m = r.grove === 'in' ? P.grove(x, z) : r.grove === 'out' ? 1 - P.grove(x, z) : 1;
    if (keep >= m) continue;
    const open = P.trailClear(P.trailDist(segs, x, z)) * (1 - P.stampClear(stamps, x, z));
    if (keep >= m * open) continue;
    let f;
    if (r.grove === 'bamboo') f = terrainAt(world, x, z) === 'b' ? 1 : 0;
    else {
      P.fieldAt(x, z, F);
      f = F[r.b] * (r.grove === 'edge' ? (F[fo] > E.lo && F[fo] < E.hi ? 1 : 0) : 1);
    }
    if (keep >= f * m * open) continue;
    if (!clearAt(x, z, true)) continue;
    const s = r.scale[0] + (r.scale[1] - r.scale[0]) * hash2(gi, gj, ps + 5);
    props.push({ kind: r.kind, x: +x.toFixed(2), z: +z.toFixed(2), s: +s.toFixed(2) });
    if (r.block > 0) { const q = r.block * s; blockers.push({ minX: x - q, maxX: x + q, minZ: z - q, maxZ: z + q, kind: r.kind }); }
  }
  return props;
}
