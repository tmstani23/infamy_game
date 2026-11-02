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
  const clearAt = (x, z) => !segs.some(([a, b]) => segDist(x, z, a, b) < (C.corridor || 0))
    && !sites.some(p => Math.hypot(p.x - x, p.z - z) < (C.site || 0))
    && !nodes.some(p => Math.hypot(p.x - x, p.z - z) < (C.node || 0))
    && !(city && x > city.minX - (C.city || 0) && x < city.maxX + (C.city || 0) && z > city.minZ - (C.city || 0) && z < city.maxZ + (C.city || 0));

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
        props.push({ kind: k.kind, x: +x.toFixed(2), z: +z.toFixed(2), s: +s.toFixed(2) });
        if (k.block > 0) { const b = k.block * s; blockers.push({ minX: x - b, maxX: x + b, minZ: z - b, maxZ: z + b, kind: k.kind }); }
      }
    }
  }
  return { id: chunkId(cx, cz), cx, cz, x0, z0, size, cells, blockers, props };
}
