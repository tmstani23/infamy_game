// Geometric invariants, source calibration and chunk seams; no browser required.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { seaContours, createCoastline } from '../src/world_coast.js';
import { createPaint } from '../src/world_paint.js';
import { terrainAt } from '../src/sim/world_data.js';

const json = f => JSON.parse(fs.readFileSync(new URL(`../${f}`, import.meta.url)));
const C = json('data/coastline.json');
const makeWorld = rows => ({ terrain: { rows, cell: 50 }, sites: [] });
const island = makeWorld(['wwwwwww', 'wpppppw', 'wpwwwpw', 'wpwwwpw', 'wpppppw', 'wwwwwww']);
assert.equal(seaContours(island).length, 1, 'enclosed lake has no ocean-bank contour');
const diagonal = makeWorld(['wwww', 'wpww', 'wwpw', 'wwww']);
assert.equal(seaContours(diagonal).length, 2, 'diagonal contacts retain two separate closed shorelines');

function checkMesh(data) {
  assert.ok(data && data.indices.length);
  for (const a of [data.positions, data.uvs, data.colors, data.alpha]) assert.ok(a.every(Number.isFinite));
  assert.equal(data.positions.length / 3, data.alpha.length);
  for (const i of data.indices) assert.ok(i < data.alpha.length);
  for (let i = 0; i < data.colors.length; i += 3) assert.ok(Math.abs(data.colors[i] + data.colors[i + 1] + data.colors[i + 2] - 1) < 1e-5);
  let sign = 0;
  for (let i = 0; i < data.indices.length; i += 3) {
    const [a, b, c] = [...data.indices.slice(i, i + 3)].map(j => [data.positions[j * 3], data.positions[j * 3 + 2]]);
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    assert.ok(Math.abs(area) > 1e-6, 'no collapsed shoreline triangles');
    if (!sign) sign = Math.sign(area);
    assert.equal(Math.sign(area), sign, 'inland/sea offsets never fold triangles back over themselves');
  }
}

const coast = createCoastline(island, C, null, 100);
for (let cz = 0; cz < 3; cz++) for (let cx = 0; cx < 4; cx++) {
  const a = coast.meshData(cx, cz); if (!a) continue;
  checkMesh(a);
  assert.deepEqual(a, coast.meshData(cx, cz), 'repeat calls are deterministic');
  for (let i = 0; i < a.alpha.length; i++) {
    const x = a.positions[i * 3], z = a.positions[i * 3 + 2], d = a.uvs[i * 2 + 1];
    if (d > 0) assert.notEqual(terrainAt(island, x, z), 'w', 'inland texture stays on land on every facing');
    if (d < 0) assert.equal(terrainAt(island, x, z), 'w', 'outer fringe faces sea on every facing');
  }
}
// Identical halo vertices/UVs/material weights on either side of a chunk border.
const vertexRecords = d => new Set(Array.from({ length: d.alpha.length }, (_, i) => JSON.stringify([
  ...d.positions.slice(i * 3, i * 3 + 3), ...d.uvs.slice(i * 2, i * 2 + 2), ...d.colors.slice(i * 3, i * 3 + 3), d.alpha[i],
])));
const left = coast.meshData(0, 0), right = coast.meshData(1, 0);
const l = vertexRecords(left), r = vertexRecords(right);
assert.ok([...l].filter(v => r.has(v)).length >= 6, 'chunk halos share identical boundary geometry and parameters');

const harborWorld = makeWorld(['wwwww', 'wpppw', 'wpppw', 'wwwww']);
harborWorld.sites = [{ harbor: { x: 100, z: 50 } }];
const harbor = createCoastline(harborWorld, C, null, 250).meshData(0, 0);
assert.ok(harbor.alpha.some(a => a === 0), 'harbor clearing suppresses bank art');
const mouth = makeWorld(['wwwww', 'wmrpw', 'wpppw', 'wwwww']);
const gap = createCoastline(mouth, C, null, 250).meshData(0, 0);
for (let i = 0; i < gap.alpha.length; i += 6) {
  // Rows are inland, shoreline, sea; vertices 2/3 lie on the authoritative edge.
  const a = i + 2, b = i + 3;
  const x = (gap.positions[a * 3] + gap.positions[b * 3]) / 2, z = (gap.positions[a * 3 + 2] + gap.positions[b * 3 + 2]) / 2;
  assert.ok(!(z === 50 && x < 150), 'mountain and river-mouth boundary segments omitted');
}

const world = json('data/world.json'), original = JSON.stringify(world), paint = createPaint(world, json('data/world_paint.json'));
const start = performance.now(), real = createCoastline(world, C, paint, 250), built = [];
// Representative dry/snow/wet coast, capital, bay, islet and a chunk junction.
for (const [x, z] of [[400, 4000], [5000, 500], [13000, 3200], [8800, 5200], [2000, 330], [700, 6200], [13500, 6200]]) {
  const data = real.meshData(Math.floor(x / 250), Math.floor(z / 250));
  if (data) { checkMesh(data); built.push(data); }
}
assert.ok(built.length >= 4, 'representative mapped coasts found');
assert.equal(JSON.stringify(world), original, 'render fitting never mutates gameplay terrain or world data');
for (const m of Object.values(C.materials)) {
  assert.ok(m.rows[0] < m.rows[1] && m.rows[1] < m.rows[2] && m.rows[0] >= 0 && m.rows[2] <= 1);
  assert.deepEqual(fs.readFileSync(new URL(`../../${m.src}`, import.meta.url)), fs.readFileSync(new URL(`../${m.file}`, import.meta.url)), 'runtime source pixels preserved');
}
console.log(`world_coast: geometry, facing, lake exclusion, mouths/cliffs, harbors, chunk halos and 3 imported sources passed; ${real.stats.loops} loops / ${real.stats.segments} segments, setup + ${built.length} chunks ${(performance.now() - start).toFixed(1)}ms`);
