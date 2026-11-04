// Resource spots (L3.4). Run from the repo root:  node game/tools/test_resource_spots.mjs
// Data file is current and byte-identical on a rerun; no ordinary spot on unbuildable ground; fish within 2 cells of
// water; one deposit per node; spotYield never 0; chunk/near lookups agree; world.json untouched by the tool.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildable, terrainAt } from '../src/sim/world_data.js';
import { makeSpotIndex, spotYield, regrowSpot, spotState } from '../src/sim/resource_spots.js';

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = f => readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8');
const world = JSON.parse(read('world.json')), data = JSON.parse(read('world_spots.json')), conf = JSON.parse(read('resource_spots.json'));
const sha = f => createHash('sha256').update(read(f)).digest('hex');
const worldBefore = sha('world.json'), spotsBefore = sha('world_spots.json');

// two runs give byte-identical output (--check regenerates in memory and compares; a real rerun must not change the file)
execFileSync(process.execPath, ['tools/seed_resource_spots.mjs'], { cwd: root, stdio: 'pipe' });
assert.equal(sha('world_spots.json'), spotsBefore, 'rerun gives the same bytes');
execFileSync(process.execPath, ['tools/seed_resource_spots.mjs', '--check'], { cwd: root, stdio: 'pipe' });
assert.equal(sha('world.json'), worldBefore, 'world.json untouched');
assert.equal(data.configSha, createHash('sha256').update(read('resource_spots.json')).digest('hex').slice(0, 12), 'data matches the config');

const kinds = new Set(['timber', 'stone', 'fish', 'forage']);
const ids = new Set(), cell = world.terrain.cell;
for (const s of data.spots) {
  assert.ok(!ids.has(s.id), `unique id ${s.id}`); ids.add(s.id);
  assert.ok(kinds.has(s.kind), `${s.id} kind`);
  assert.ok(s.pieces.length >= 2, `${s.id} has pieces`);
  if (s.deposit) continue;
  assert.ok(buildable(world, s.x, s.z), `${s.id} sits on buildable ground`);
  const k = conf.spots.kinds[s.kind];
  assert.ok(s.pieces.length >= k.size[0] && s.pieces.length <= k.size[1], `${s.id} size in range`);
  for (const [dx, dz] of s.pieces) assert.ok(buildable(world, s.x + dx, s.z + dz), `${s.id} piece on buildable ground`);
  if (s.kind === 'fish') {
    let near = false;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const c = terrainAt(world, s.x + j * cell, s.z + i * cell); if (c === 'w' || c === 'r') near = true; }
    assert.ok(near, `${s.id} fish spot is within 2 cells of water`);
  }
}
// every node has exactly one deposit spot
for (const n of world.nodes) assert.equal(data.spots.filter(s => s.deposit === n.id).length, 1, `${n.id} has one deposit`);
assert.equal(data.spots.filter(s => s.deposit).length, world.nodes.length, 'no extra deposits');

// lookups
const idx = makeSpotIndex(data);
let inChunks = 0;
for (const c of Object.keys(data.byChunk)) { const list = idx.spotsInChunk(c); inChunks += list.length; assert.ok(list.every(Boolean)); }
assert.equal(inChunks, data.spots.length, 'every spot is in exactly one chunk');
const probe = data.spots[100], near = idx.spotsNear(probe.x, probe.z, 500);
assert.ok(near.includes(probe), 'spotsNear finds the spot');
assert.deepEqual(near.map(s => s.id).sort(), data.spots.filter(s => Math.hypot(s.x - probe.x, s.z - probe.z) <= 500).map(s => s.id).sort(), 'spotsNear matches brute force');
assert.deepEqual(idx.spotsNear(-5000, -5000, 10), [], 'nothing far off the map');

// yield is never 0, even when every piece is harvested; regrowth heals back to nothing-to-save
for (const s of data.spots) {
  assert.ok(spotYield(s, undefined, conf.stages) > 0, `${s.id} fresh yield`);
  assert.ok(spotYield(s, 'h'.repeat(s.pieces.length), conf.stages) > 0, `${s.id} worked-out yield`);
}
const t = data.spots.find(s => s.kind === 'timber');
const worked = 'h'.repeat(t.pieces.length);
assert.ok(spotYield(t, worked, conf.stages) < spotYield(t, undefined, conf.stages), 'worked spot yields less');
let st = worked, seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 4000 && st; i++) st = regrowSpot(t, st, conf.stages, rand);
assert.equal(st, null, 'spot regrows fully');
assert.equal(spotState(t, 'bad'), 'f'.repeat(t.pieces.length), 'bad saved state reads as full');
console.log(`resource spots OK (${data.spots.length} spots)`);
