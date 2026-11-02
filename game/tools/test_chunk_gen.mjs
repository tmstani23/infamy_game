// Frontier W3.3: chunk generator (sim/chunk_gen.js). Same input -> same chunk; blocked terrain is
// always a blocker; nothing grows on corridors, sites or nodes; a chunk builds fast.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildChunk } from '../src/sim/chunk_gen.js';
import { terrainAt, passable } from '../src/sim/world_data.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), cfg = data('data/world_chunks.json');
const S = cfg.chunk, TC = world.terrain.cell;
const inBlocker = (c, x, z) => c.blockers.some(b => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
const segDist = (px, pz, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0; return Math.hypot(px - ax - dx * t, pz - az - dz * t); };

// chunks with a corridor, a site, water and mountain in them
const pick = test => { for (let cz = 0; cz < 32; cz++) for (let cx = 0; cx < 56; cx++) if (test(cx, cz)) return [cx, cz]; return null; };
const has = (cx, cz, code) => { for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (terrainAt(world, cx * S + (j + .5) * TC, cz * S + (i + .5) * TC) === code) return true; return false; };
const chunks = [
  pick((cx, cz) => has(cx, cz, 'w') && has(cx, cz, 'f')),
  pick((cx, cz) => has(cx, cz, 'm') && has(cx, cz, 'h')),
  pick((cx, cz) => has(cx, cz, 'r')),
  (s => [Math.floor(s.x / S), Math.floor(s.z / S)])(world.sites[10]),
  (c => [Math.floor(c.points[0][0] / S), Math.floor(c.points[0][1] / S)])(world.corridors.find(c => c.points.length > 2)),
].filter(Boolean);
assert.ok(chunks.length >= 4, 'test chunks found');

let worst = 0;
for (const [cx, cz] of chunks) {
  const t0 = performance.now(), a = buildChunk(world, cfg, cx, cz, 7);
  worst = Math.max(worst, performance.now() - t0);
  assert.equal(JSON.stringify(a), JSON.stringify(buildChunk(world, cfg, cx, cz, 7)), 'same chunk twice is identical');
  // every blocked terrain cell (water, mountain, river away from fords) is covered by a blocker
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const x = a.x0 + (j + .5) * TC, z = a.z0 + (i + .5) * TC;
    if (!passable(world, x, z)) assert.ok(inBlocker(a, x, z), `blocked ${terrainAt(world, x, z)} cell at ${x},${z} has a blocker`);
    if (terrainAt(world, x, z) === 'w') assert.ok(inBlocker(a, x, z), 'water always blocks');
  }
  // nothing on corridors, sites or nodes
  const segs = world.corridors.flatMap(c => c.points.slice(1).map((p, k) => [c.points[k], p]));
  for (const p of a.props) {
    if (p.kind === 'mountain') continue;
    assert.ok(!segs.some(([u, v]) => segDist(p.x, p.z, u, v) < cfg.clear.corridor), `prop ${p.kind} too close to a corridor`);
    assert.ok(!world.sites.some(s => Math.hypot(s.x - p.x, s.z - p.z) < cfg.clear.site), 'prop on a site');
    assert.ok(!world.nodes.some(s => Math.hypot(s.x - p.x, s.z - p.z) < cfg.clear.node), 'prop on a node');
    assert.ok(passable(world, p.x, p.z), 'props only on walkable ground');
  }
}
// a different seed gives a different forest
const [fx, fz] = chunks[0];
assert.notEqual(JSON.stringify(buildChunk(world, cfg, fx, fz, 1).props), JSON.stringify(buildChunk(world, cfg, fx, fz, 2).props), 'seed changes the props');
// the city is a blocker when given
const city = { minX: fx * S + 10, maxX: fx * S + 60, minZ: fz * S + 10, maxZ: fz * S + 60 };
const withCity = buildChunk(world, cfg, fx, fz, 1, { city });
assert.ok(withCity.blockers.some(b => b.kind === 'city'), 'city blocker');
assert.ok(!withCity.props.some(p => p.kind !== 'mountain' && p.x > city.minX - cfg.clear.city && p.x < city.maxX + cfg.clear.city && p.z > city.minZ - cfg.clear.city && p.z < city.maxZ + cfg.clear.city), 'no props by the city walls');
assert.ok(worst < 50, `a chunk builds in under 50 ms (worst ${worst.toFixed(1)} ms)`);
console.log(`test_chunk_gen: ok (${chunks.length} chunks, worst ${worst.toFixed(1)} ms)`);
