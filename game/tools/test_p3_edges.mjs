// Shared rounded shore: terrain, ribbon, collision and coastal tint agree.
// No browser or generated previews. Run: node game/tools/test_p3_edges.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { oceanTopology, rawTerrain } from '../src/sim/shoreline.js';
import { terrainAt, passable } from '../src/sim/world_data.js';
import { buildChunk } from '../src/sim/chunk_gen.js';
import { createCoastline } from '../src/world_coast.js';
import { createPaint } from '../src/world_paint.js';
import { slideWorld } from '../src/sim/world_slide.js';

const read = f => JSON.parse(fs.readFileSync(new URL(`../data/${f}.json`, import.meta.url)));
const pc = read('world_paint'), C = read('coastline');
const cfg = { ...read('world_chunks'), chunk: 50, islandArt: { enabled: false }, props: {}, clear: {} };
const worldOf = rows => ({ seed: 7, terrain: { rows, cell: 50, shoreline: { radius: 20, harborKeep: 30 } },
  size: { w: rows[0].length * 50, h: rows.length * 50 }, regions: [], sites: [], camps: [], passes: [], fords: [], lakes: [], nodes: [], corridors: [], rules: { fordRadius: 20 } });
const w = worldOf(['wwwww', 'wpppw', 'wpppw', 'wpppw', 'wwwww']);
const shore = oceanTopology(w);
assert.equal(shore.corners.size, 4, 'four circular corners on the test island');
assert.equal(rawTerrain(w, 51, 51), 'p');
assert.equal(terrainAt(w, 51, 51), 'w', 'outer grid point is trimmed to a round corner');
assert.equal(terrainAt(w, 60, 60), 'p', 'land inside the circle remains walkable');
for (const c of shore.corners.values()) for (let j = 1; j < 20; j++) {
  const a = Math.PI / 2 * j / 20, x = c.cx - c.sx * Math.cos(a) * c.radius, z = c.cz - c.sz * Math.sin(a) * c.radius;
  assert.ok(shore.distanceAt(x, z, 25) < 1e-8, 'tint distance follows the exact circle');
  const nx = c.sx * Math.cos(a), nz = c.sz * Math.sin(a);
  assert.ok(passable(w, x + nx * 0.05, z + nz * 0.05));
  assert.ok(!passable(w, x - nx * 0.05, z - nz * 0.05));
}

const notch = worldOf(['wwwww', 'wpppw', 'wpwww', 'wpppw', 'wwwww']);
assert.equal(rawTerrain(notch, 101, 101), 'w');
assert.equal(terrainAt(notch, 101, 101), 'p', 'concave coast fills the angular notch');
assert.equal(terrainAt(notch, 120, 120), 'w', 'open inlet remains water');
const harbor = worldOf(w.terrain.rows); harbor.sites = [{ harbor: { x: 50, z: 50 } }];
assert.equal(terrainAt(harbor, 51, 51), 'p', 'harbor approach is preserved');
for (const code of ['r', 'm']) {
  const excluded = worldOf(['wwww', `w${code}pw`, 'wppw', 'wwww']);
  assert.ok(!oceanTopology(excluded).corners.has('100,50'), 'river mouths and cliff joins stay unchanged');
}
const lake = worldOf(['wwwwwwwww', 'wpppppppw', 'wpppppppw', 'wppwwpppw', 'wppwwpppw', 'wpppppppw', 'wpppppppw', 'wpppppppw', 'wwwwwwwww']);
assert.equal(oceanTopology(lake).loops.length, 1, 'lake is not an ocean contour');
assert.equal(terrainAt(lake, 151, 151), 'w', 'enclosed lake corners remain unchanged');

// Exact agreement at every fine-cell center, for convex and concave shapes.
let checked = 0;
for (const world of [w, notch]) {
  const topology = oceanTopology(world), cache = new Map();
  for (let cz = 0; cz < 5; cz++) for (let cx = 0; cx < 5; cx++) {
    if (!topology.affectedCell(cx, cz)) continue;
    const chunk = buildChunk(world, cfg, cx, cz); cache.set(`${cx},${cz}`, chunk);
    const boxes = chunk.blockers.filter(b => b.kind === 'terrain');
    for (let z = cz * 50 + 0.25; z < (cz + 1) * 50; z += 0.5) for (let x = cx * 50 + 0.25; x < (cx + 1) * 50; x += 0.5) {
      const blocked = boxes.some(b => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
      assert.equal(blocked, !passable(world, x, z), 'collision raster agrees with shared terrain'); checked++;
    }
    assert.deepEqual(chunk, buildChunk(world, cfg, cx, cz), 'rounded collision is deterministic');
  }
  const coast = createCoastline(world, C, null, 50);
  for (let cz = 0; cz < 5; cz++) for (let cx = 0; cx < 5; cx++) {
    const d = coast.meshData(cx, cz); if (!d) continue;
    for (let i = 0; i < d.alpha.length; i++) {
      const x = d.positions[i * 3], z = d.positions[i * 3 + 2], cross = d.uvs[i * 2 + 1];
      if (cross > 0) assert.ok(passable(world, x, z), 'rounded bank stays inland');
      if (cross < 0) assert.equal(terrainAt(world, x, z), 'w', 'rounded water fringe faces sea');
    }
    let sign;
    for (let i = 0; i < d.indices.length; i += 3) {
      const [a, b, c] = [...d.indices.slice(i, i + 3)].map(j => [d.positions[j * 3], d.positions[j * 3 + 2]]);
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      assert.ok(Math.abs(area) > 1e-6); sign ??= Math.sign(area);
      assert.equal(Math.sign(area), sign, 'rounded ribbon has no folded or collapsed triangles');
    }
  }
}

// Coastal tint stays in the ocean band and uses the correct biome family.
const samples = [];
for (const code of ['p', 'd', 'n']) {
  const world = worldOf(w.terrain.rows.map(row => row.replaceAll('p', code))), P = createPaint(world, pc);
  const a = P.paintChunk(100, 50, 50, { segs: [], stamps: [] }), b = P.paintChunk(150, 50, 50, { segs: [], stamps: [] });
  for (let j = 0; j < a.N; j++) for (const [ia, ib] of [[a.N - 2, 0], [a.N - 1, 1]]) for (let ch = 0; ch < 4; ch++) {
    assert.equal(a.O[(j * a.N + ia) * 4 + ch], b.O[(j * b.N + ib) * 4 + ch], 'all coast/water mask channels match at chunk halos');
  }
  const at = z => { const i = 10, j = Math.round((z - 50) / 2.5 + 0.5); return [...a.O.slice((j * a.N + i) * 4, (j * a.N + i) * 4 + 4)]; };
  const near = at(55), middle = at(65), far = at(80);
  assert.ok(near[1] > middle[1] && middle[1] > far[1]); assert.equal(far[1], 0, 'tint restores ordinary ground inland');
  assert.equal(near[2], code === 'd' ? 255 : 0); assert.equal(near[3], code === 'n' ? 255 : 0);
  samples.push([code, near[1], middle[1], far[1]]);
}
const LP = createPaint(lake, pc), L = LP.paintChunk(125, 150, 50, { segs: [], stamps: [] });
assert.ok(L.O.every((v, i) => i % 4 !== 1 || v === 0), 'no ocean tint added at the enclosed lake');

// Regression: diagonal input must not undo corner nudges on either orientation.
const real = read('world'), realCfg = read('world_chunks');
for (const [x0, z0, dx, dz] of [[1925, 150.351, -1, -1], [2999.649, 525, 1, -1]]) {
  const blocks = buildChunk(real, realCfg, Math.floor(x0 / 250), Math.floor(z0 / 250)).blockers.filter(b => b.kind === 'terrain');
  let x = x0, z = z0;
  for (let n = 0; n < 60; n++) {
    const old = [x, z]; [x, z] = slideWorld(x, z, 0.35, dx * Math.SQRT1_2 * 0.3, dz * Math.SQRT1_2 * 0.3, () => blocks, 0.6);
    assert.ok(Math.hypot(x - old[0], z - old[1]) <= 0.30001, 'no corner speed boost');
    assert.ok(!blocks.some(b => x + 0.35 > b.minX && x - 0.35 < b.maxX && z + 0.35 > b.minZ && z - 0.35 < b.maxZ));
  }
  assert.ok(Math.hypot(x - x0, z - z0) > 9, 'both coast orientations escape the fine raster step');
}
console.log(`test_p3_edges: passed (${checked} collision samples; convex/concave geometry, preserved mouths/cliffs/harbors/lakes, biome tint and halos, bounded movement; tint samples ${JSON.stringify(samples)})`);
