import assert from 'node:assert/strict';
import fs from 'node:fs';
import { oceanTopology, shorelineTopology, rawTerrain } from '../src/sim/shoreline.js';
import { terrainAt, passable } from '../src/sim/world_data.js';
import { createCoastline } from '../src/world_coast.js';
import { createPaint } from '../src/world_paint.js';
import { buildChunk } from '../src/sim/chunk_gen.js';
const read = f => JSON.parse(fs.readFileSync(new URL(`../data/${f}.json`, import.meta.url)));
const C = read('coastline'), pc = read('world_paint');
const cfg = { ...read('world_chunks'), chunk: 50, islandArt: { enabled: false }, props: {}, clear: {} };
const make = rows => ({ seed: 7, size: { w: 350, h: 350 }, terrain: { cell: 50, rows, shoreline: { radius: 20, inland: true } },
  sites: [], regions: [], camps: [], nodes: [], passes: [], corridors: [], fords: [], lakes: [], rules: { fordRadius: 35 } });
const lake = make(['wwwwwww', 'wpppppw', 'wpppppw', 'wppwppw', 'wpppppw', 'wpppppw', 'wwwwwww']);
assert.equal(oceanTopology(lake).loops.length, 1, 'ocean-only API remains available');
assert.equal(shorelineTopology(lake).loops.length, 2, 'inner lake contour added');
assert.equal(rawTerrain(lake, 151, 151), 'w'); assert.equal(terrainAt(lake, 151, 151), 'p', 'lake corner rounds with the shared terrain shape');
assert.equal(terrainAt(lake, 175, 175), 'w', 'lake center retained');
assert.equal(shorelineTopology(lake).waterKindAt(175, 175), 'lake');
const river = make(['wwwwwww', 'wpppppw', 'wpprppw', 'wpprppw', 'wpprppw', 'wpprppw', 'wwwrwww']);
assert.equal(shorelineTopology(river).waterKindAt(175, 175), 'river');
const original = JSON.stringify(river.terrain.rows);
for (const code of ['p', 'd', 'n']) {
  const world = make(lake.terrain.rows.map(row => row.replaceAll('p', code)));
  const coast = createCoastline(world, C, null, 50); let lakeBank = false;
  for (let cz = 0; cz < 7; cz++) for (let cx = 0; cx < 7; cx++) {
    const a = coast.meshData(cx, cz); if (!a) continue;
    assert.deepEqual(a, coast.meshData(cx, cz));
    for (let i = 0; i < a.alpha.length; i++) {
      const x = a.positions[i * 3], z = a.positions[i * 3 + 2], d = a.uvs[i * 2 + 1];
      if (d > 0) assert.ok(passable(world, x, z), 'bank faces the local land on outer and inner loops');
      if (d < 0) assert.equal(terrainAt(world, x, z), 'w');
      if (x > 125 && x < 225 && z > 125 && z < 225) {
        lakeBank = true; assert.equal(a.bankSizes[i * 2], C.inland.landWidth, 'inland bank uses smaller width');
        assert.equal(a.colors[i * 3 + (code === 'd' ? 1 : code === 'n' ? 2 : 0)], 1, 'wet/dry/snow material follows local biome');
      }
    }
    let sign = 0;
    for (let i = 0; i < a.indices.length; i += 3) {
      const [p, q, r] = [...a.indices.slice(i, i + 3)].map(k => [a.positions[k * 3], a.positions[k * 3 + 2]]);
      const area = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      assert.ok(Math.abs(area) > 1e-6, 'bank face is not degenerate');
      if (!sign) sign = Math.sign(area);
      assert.equal(Math.sign(area), sign, 'both loop orientations retain consistent (unfolded) bank face winding');
    }
  }
  assert.ok(lakeBank);
}
const P = createPaint(lake, pc), near = { segs: [], stamps: [] };
const ground = P.paintChunk(100, 100, 100, near);
assert.ok(ground.O.some((v, i) => i % 4 === 1 && v > 0), 'inland biome-ground transition is painted');
const A = P.paintChunk(100, 100, 50, near), B = P.paintChunk(150, 100, 50, near);
for (let j = 0; j < A.N; j++) for (const [ia, ib] of [[A.N - 2, 0], [A.N - 1, 1]]) for (let c = 0; c < 4; c++) assert.equal(A.O[(j * A.N + ia) * 4 + c], B.O[(j * B.N + ib) * 4 + c]);
let checked = 0;
for (const world of [lake, river]) {
  const shore = shorelineTopology(world);
  for (let cz = 0; cz < 7; cz++) for (let cx = 0; cx < 7; cx++) {
    if (!shore.affectedCell(cx, cz)) continue;
    const boxes = buildChunk(world, cfg, cx, cz).blockers.filter(b => b.kind === 'terrain');
    for (let z = cz * 50 + 0.25; z < (cz + 1) * 50; z++) for (let x = cx * 50 + 0.25; x < (cx + 1) * 50; x++) {
      assert.equal(boxes.some(b => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ), !passable(world, x, z)); checked++;
    }
  }
}
const crossing = make(river.terrain.rows); crossing.fords = [{ x: 175, z: 175, kind: 'bridge' }];
const protectedShore = shorelineTopology(crossing);
assert.ok(!protectedShore.affectedCell(3, 3), 'crossing cell is not re-rasterized/narrowed');
assert.equal(terrainAt(crossing, 151, 151), 'r', 'crossing shape unchanged');
assert.equal(JSON.stringify(river.terrain.rows), original, 'terrain rows never rewritten by queries');
console.log(`test_inland_banks: passed (wet/dry/snow lake banks, river classification, shared rounding and ${checked} collider samples, width/face orientation, tint halos and crossing protection)`);
