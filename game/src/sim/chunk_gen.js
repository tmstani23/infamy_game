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
import { shorelineTopology } from './shoreline.js';
import {islandArt} from './island_art.js';
import { createPaint, trailSegments, hash2 } from '../world_paint.js';
import { clusterProps, clusterReplaces } from './prop_clusters.js';

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

function coastDist(segments, x, z) {
  let d = Infinity;
  for (const [a, b] of segments) d = Math.min(d, segDist(x, z, a, b));
  return d;
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
  const shore = world.terrain.shoreline?.radius ? shorelineTopology(world) : null;
  for (let i = 0; i < n; i++) {
    let start = -1;
    for (let j = 0; j <= n; j++) {
      const blocked = j < n && !shore?.affectedCell(x0 / tc + j, z0 / tc + i) && !passable(world, x0 + (j + 0.5) * tc, z0 + (i + 0.5) * tc);
      if (blocked && start < 0) start = j;
      if (!blocked && start >= 0) {
        blockers.push({ minX: x0 + start * tc, maxX: x0 + j * tc, minZ: z0 + i * tc, maxZ: z0 + (i + 1) * tc, kind: 'terrain' });
        start = -1;
      }
    }
  }
  // Only cells touched by a rounded ocean corner need fine rectangles. They feed
  // both live sliding and the nav grid. Half-unit steps remain within the
  // existing corner-slip distance so movement cannot snag on a raster stair.
  if (shore) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (!shore.affectedCell(x0 / tc + j, z0 / tc + i)) continue;
    const count = Math.ceil(tc / Math.min(cfg.navCell || 1, 0.5)), pitch = tc / count;
    const ax = x0 + j * tc, az = z0 + i * tc;
    let previous = new Map();
    for (let row = 0; row < count; row++) {
      const current = new Map(); let start = -1;
      for (let col = 0; col <= count; col++) {
        const blocked = col < count && !passable(world, ax + (col + 0.5) * pitch, az + (row + 0.5) * pitch);
        if (blocked && start < 0) start = col;
        if (!blocked && start >= 0) {
          const k = `${start},${col}`, old = previous.get(k);
          if (old) old.maxZ = az + (row + 1) * pitch;
          const b = old || { minX: ax + start * pitch, maxX: ax + col * pitch, minZ: az + row * pitch, maxZ: az + (row + 1) * pitch, kind: 'terrain', shoreCorners: shore.cellCorners(x0 / tc + j, z0 / tc + i) };
          if (!old) blockers.push(b); current.set(k, b); start = -1;
        }
      }
      previous = current;
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
    scalePaintedProps(props, blockers, cfg.biomeProps?.propScale);
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

// Tim 2026-11-03: ordinary props other than trees (propScale.keep) and oddities are drawn at
// propScale.factor x their scale, and their walk blockers (centred on the prop) shrink by the same factor.
function scalePaintedProps(props, blockers, ps) {
  if (!ps?.factor || ps.factor === 1) return;
  const keep = new Set(ps.keep || []), f = ps.factor;
  const hit = k => k !== 'biome_oddity' && k !== 'terrain' && k !== 'city' && !keep.has(k);
  for (const p of props) if (hit(p.kind)) p.s = +(p.s * f).toFixed(3);
  for (const b of blockers) if (hit(b.kind)) {
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, hx = (b.maxX - b.minX) / 2 * f, hz = (b.maxZ - b.minZ) / 2 * f;
    Object.assign(b, { minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz });
  }
}

// Layer 7 of docs/world_painting.md. Candidates sit on one global jittered grid (one per grid x grid units,
// the offset from the seeded hash), so a chunk border never changes what is on either side of it.
function paintProps(world, cfg, x0, z0, size, seed, blockers, clearAt) {
  const pc = cfg.paint, P = createPaint(world, pc), g = pc.grid, area = g * g / 1000, ps = P.seed;
  const F = new Float32Array(P.NB), props = [], biomeProps = cfg.biomeProps || {};
  const segs = trailSegments(world, x0, z0, x0 + size, z0 + size, pc.trail.clearFull, pc.paths?.list), stamps = P.stampsIn(x0, z0, x0 + size, z0 + size);
  const coastPoints = world.coast || [], coastSegments = coastPoints.map((p, i) => [p, coastPoints[(i + 1) % coastPoints.length]]);
  const bamboo = pc.bamboo, E = pc.edgeTrees, fo = P.B.forest;
  // Each candidate draws ONE number u and walks the rules' best-case chances (per1000 x area) end to end;
  // the rule u lands in then keeps the prop with chance (real / best case), so each rule still fires with its
  // real probability but most candidates cost one hash. All draws come from the candidate's grid cell.
  const replacements = biomeProps.replaceByBiome || {};
  let rules = pc.props.map((r, i) => ({ ...r, kind: replacements[r.biome]?.[r.kind] || r.kind, i, b: P.B[r.biome], pmax: r.per1000 * area }));
  rules = [...rules, ...(biomeProps.additional || []).map((r, i) => ({ ...r, i: 100 + i, b: P.B[r.biome], pmax: r.per1000 * area }))];
  if (bamboo) rules = [...rules, { ...bamboo, i: 90, b: -1, pmax: bamboo.per1000 * area, grove: 'bamboo' }];
  // Clustering (biome_props.json clustering): rules whose kind a cluster family now places are skipped after
  // the draw, so every other rule keeps exactly the same props. Edge trees stay on their own rule.
  const cl = biomeProps.clustering?.enabled ? biomeProps.clustering : null, replaced = clusterReplaces(cl);
  const kindInfo = new Map();
  for (const r of rules) {
    const key = `${r.biome ?? 'bamboo'}|${r.kind}`;
    if (!kindInfo.has(key)) kindInfo.set(key, { scale: r.scale, block: r.block || 0 });
    r.skip = replaced.has(key) && r.grove !== 'edge';
  }
  for (const r of biomeProps.marshSupplement?.items || []) if (!kindInfo.has(`marsh|${r.kind}`)) kindInfo.set(`marsh|${r.kind}`, { scale: biomeProps.marshSupplement.scale, block: 0 });
  let cum = 0;
  for (const r of rules) { cum += r.pmax; r.cum = cum; }
  if (cum > 1) throw new Error(`Island prop candidate probability exceeds 1 (${cum.toFixed(4)}); reduce biome prop rates.`);
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
    if (!r.here || r.skip) continue;   // its biome is nowhere near this chunk, or a cluster family places it now
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
    const wet = r.marshZone ? Math.min(1, P.waterFrac(x, z, 35) * 3) : 0;
    const zone = r.marshZone === 'surface' ? (wet > 0 ? wet : 0)
      : r.marshZone === 'water' ? 0.35 + 0.65 * wet
      : r.marshZone === 'wooded' ? 0.3 + 0.7 * Math.min(1, F[fo] * 3) : 1;
    if (keep >= f * m * open * zone) continue;
    if (!clearAt(x, z, true)) continue;
    const s = r.scale[0] + (r.scale[1] - r.scale[0]) * hash2(gi, gj, ps + 5);
    props.push({ kind: r.kind, x: +x.toFixed(2), z: +z.toFixed(2), s: +s.toFixed(2) });
    if (r.block > 0) { const q = r.block * s; blockers.push({ minX: x - q, maxX: x + q, minZ: z - q, maxZ: z + q, kind: r.kind }); }
  }
  // Marsh uses its own seeded grid so its local density can be tuned without
  // consuming the one-candidate budget shared by every other biome.
  const marsh = biomeProps.marshSupplement;
  if (marsh && near.has(P.B.marsh) && !cl?.replacePasses?.includes('marsh')) {
    const mg = marsh.grid, total = marsh.items.reduce((n, r) => n + r.weight, 0);
    for (let gj = Math.floor(z0 / mg) - 1; gj <= Math.floor((z0 + size) / mg) + 1; gj++)
      for (let gi = Math.floor(x0 / mg) - 1; gi <= Math.floor((x0 + size) / mg) + 1; gi++) {
        if (hash2(gi, gj, ps + 70) >= marsh.chance) continue;
        const x = (gi + hash2(gi, gj, ps + 71)) * mg, z = (gj + hash2(gi, gj, ps + 72)) * mg;
        if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size || P.gridAt(x, z) !== P.B.marsh) continue;
        if (!passable(world, x, z) || !clearAt(x, z, true)) continue;
        if (hash2(gi, gj, ps + 73) >= P.trailClear(P.trailDist(segs, x, z)) * (1 - P.stampClear(stamps, x, z))) continue;
        let pick = hash2(gi, gj, ps + 74) * total, r = marsh.items.at(-1);
        for (const item of marsh.items) if ((pick -= item.weight) < 0) { r = item; break; }
        const wet = Math.min(1, P.waterFrac(x, z, 35) * 3);
        P.fieldAt(x, z, F);
        const zone = r.zone === 'surface' ? wet : r.zone === 'water' ? .4 + .6 * wet
          : r.zone === 'wooded' ? .35 + .65 * Math.min(1, F[fo] * 3) : 1;
        if (hash2(gi, gj, ps + 75) >= zone) continue;
        const s = marsh.scale[0] + (marsh.scale[1] - marsh.scale[0]) * hash2(gi, gj, ps + 76);
        props.push({ kind: r.kind, x: +x.toFixed(2), z: +z.toFixed(2), s: +s.toFixed(2) });
      }
  }
  // Mountain tops (2026-11-03): sparse art-only props on the flat top of a range (blocked ground, so no
  // walk blockers), kept `inset` units in from the rim in all 8 directions so they stay clear of the
  // cliff art. Own seeded grid like the marsh supplement; biome_props.json mountainTops.byTop picks the kinds.
  const tops = biomeProps.mountainTops, topLists = {};
  for (const [name, items] of Object.entries(tops?.byTop || {}))
    if (P.B[name] !== undefined && near.has(P.B[name])) topLists[P.B[name]] = { items, total: items.reduce((n, r) => n + r.weight, 0) };
  if (Object.keys(topLists).length) {
    const tg = tops.grid, d = tops.inset || 0, e = d * 0.7071;
    const rim = [[d, 0], [-d, 0], [0, d], [0, -d], [e, e], [e, -e], [-e, e], [-e, -e]];
    for (let gj = Math.floor(z0 / tg) - 1; gj <= Math.floor((z0 + size) / tg) + 1; gj++)
      for (let gi = Math.floor(x0 / tg) - 1; gi <= Math.floor((x0 + size) / tg) + 1; gi++) {
        if (hash2(gi, gj, ps + 80) >= tops.chance) continue;
        const x = (gi + hash2(gi, gj, ps + 81)) * tg, z = (gj + hash2(gi, gj, ps + 82)) * tg;
        if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size) continue;
        const b = P.gridAt(x, z), L = topLists[b];
        if (!L || rim.some(([dx, dz]) => P.gridAt(x + dx, z + dz) !== b)) continue;
        let pick = hash2(gi, gj, ps + 83) * L.total, r = L.items.at(-1);
        for (const item of L.items) if ((pick -= item.weight) < 0) { r = item; break; }
        const sc = r.scale || tops.scale, s = sc[0] + (sc[1] - sc[0]) * hash2(gi, gj, ps + 84);
        props.push({ kind: r.kind, x: +x.toFixed(2), z: +z.toFixed(2), s: +s.toFixed(2) });
      }
  }
  // Coast plants use the authored island shoreline rather than a water-biome mask, so they stay out of lakes and rivers.
  const shore = biomeProps.coast;
  if (shore && !cl?.replacePasses?.includes('coast')) {
    const sg = shore.grid, edgeReach = Math.max(shore.distance, 58);
    const localCoast = coastSegments.filter(([a, b]) => Math.max(a[0], b[0]) >= x0 - edgeReach && Math.min(a[0], b[0]) <= x0 + size + edgeReach && Math.max(a[1], b[1]) >= z0 - edgeReach && Math.min(a[1], b[1]) <= z0 + size + edgeReach);
    for (let gj = Math.floor(z0 / sg) - 1; gj <= Math.floor((z0 + size) / sg) + 1; gj++) for (let gi = Math.floor(x0 / sg) - 1; gi <= Math.floor((x0 + size) / sg) + 1; gi++) {
      const x = (gi + hash2(gi, gj, ps + 31)) * sg, z = (gj + hash2(gi, gj, ps + 32)) * sg;
      if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size || coastDist(localCoast, x, z) > shore.distance) continue;
      if (!passable(world, x, z) || P.blockedAt(x, z) || !clearAt(x, z, false)) continue;
      const pick = hash2(gi, gj, ps + 33);
      const kind = pick < shore.duneChance ? 'dune_grass' : pick < shore.duneChance + shore.driftwoodChance ? 'coastal_driftwood' : null;
      if (kind) props.push({ kind, x: +x.toFixed(2), z: +z.toFixed(2), s: +(0.9 + hash2(gi, gj, ps + 34) * 0.2).toFixed(2) });
    }
  }
  // Rare landmarks: one seeded world-space candidate grid shared by all chunks. They are art-only;
  // cliffs, fossils and wrecks are only selected where their corresponding terrain is present.
  if (cl) {
    const dist = shore?.distance ?? 58, reachC = Math.max(dist, 58) + 20;
    const coastLocal = coastSegments.filter(([a, b]) => Math.max(a[0], b[0]) >= x0 - reachC && Math.min(a[0], b[0]) <= x0 + size + reachC && Math.max(a[1], b[1]) >= z0 - reachC && Math.min(a[1], b[1]) <= z0 + size + reachC);
    clusterProps({ cl, P, F, x0, z0, size, segs, stamps, clearAt, near, kindInfo, ps, props, blockers,
      terrainAt: (x, z) => terrainAt(world, x, z), passable: (x, z) => passable(world, x, z),
      coastNear: coastLocal.length > 0, coastDist: (x, z) => coastDist(coastLocal, x, z), coastDistance: dist });
  }
  const rare = biomeProps.oddities;
  if (rare) {
    const rareMax = Math.max(rare.chance, ...Object.values(rare.chanceByBiome || {}));   // per-biome chance (snow higher), checked once the biome is known
    const rg = rare.grid, cliffNames = new Set(rare.requireMountainNearby || []), coastNames = new Set(rare.requireCoast || []);
    const edgeReach = shore?.distance || 58;
    const localCoast = coastSegments.filter(([a, b]) => Math.max(a[0], b[0]) >= x0 - edgeReach && Math.min(a[0], b[0]) <= x0 + size + edgeReach && Math.max(a[1], b[1]) >= z0 - edgeReach && Math.min(a[1], b[1]) <= z0 + size + edgeReach);
    const mountainNearby = (x, z) => {
      const t = world.terrain.cell;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
        if ((dx || dz) && terrainAt(world, x + dx * t, z + dz * t) === 'm') return true;
      return false;
    };
    for (let gj = Math.floor(z0 / rg) - 1; gj <= Math.floor((z0 + size) / rg) + 1; gj++) for (let gi = Math.floor(x0 / rg) - 1; gi <= Math.floor((x0 + size) / rg) + 1; gi++) {
      const roll = hash2(gi, gj, ps + 41);
      if (roll >= rareMax) continue;
      const x = (gi + 0.42 + hash2(gi, gj, ps + 42) * 0.16) * rg, z = (gj + 0.42 + hash2(gi, gj, ps + 43) * 0.16) * rg;
      if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size) continue;
      if (!passable(world, x, z) || P.blockedAt(x, z) || !clearAt(x, z, false)) continue;
      if (P.stampClear(stamps, x, z) > 0.15 || P.trailClear(P.trailDist(segs, x, z)) < 0.75) continue;
      P.fieldAt(x, z, F);
      let biome = 'plain', weight = -1;
      for (let i = 0; i < P.biomes.length; i++) if (F[i] > weight) { biome = P.biomes[i]; weight = F[i]; }
      if (biome === 'snowedge') biome = 'snow';
      if (roll >= (rare.chanceByBiome?.[biome] ?? rare.chance)) continue;
      const atCoast = coastDist(localCoast, x, z) <= edgeReach;
      const candidates = atCoast && biome !== 'snow' ? (rare.coast || []) : (rare.byBiome?.[biome] || []);
      const hasMountain = mountainNearby(x, z);
      const eligible = candidates.filter(name => (!cliffNames.has(name) || hasMountain) && (!coastNames.has(name) || atCoast));
      if (!eligible.length) continue;
      const choose = Math.min(eligible.length - 1, Math.floor(hash2(gi, gj, ps + 44) * eligible.length));
      const name = eligible[choose];
      const s = rare.scale[0] + (rare.scale[1] - rare.scale[0]) * hash2(gi, gj, ps + 45);
      props.push({ kind: 'biome_oddity', art: name, x: +x.toFixed(2), z: +z.toFixed(2), s: +s.toFixed(2), flip: hash2(gi, gj, ps + 46) > 0.5 });
    }
  }
  return props;
}
