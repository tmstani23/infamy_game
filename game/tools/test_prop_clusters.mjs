// Ordinary-prop clustering (sim/prop_clusters.js via sim/chunk_gen.js paintProps). Run from the repo root:
//   node game/tools/test_prop_clusters.mjs
// Same chunk twice is identical; four 250-unit chunks match one 500-unit chunk over the same ground (patches
// cross chunk borders); no duplicates; clustered props stay off blocked ground, trails, sites and nodes;
// families fully replace their old rules and the marsh / coast passes; the switch restores the old scatter;
// non-tree props are drawn at half scale with matching blockers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildChunk } from '../src/sim/chunk_gen.js';
import { familyRates } from '../src/sim/prop_clusters.js';
import { createPaint, trailSegments } from '../src/world_paint.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), bp = data('data/biome_props.json'), cl = bp.clustering;
const cfg = { ...data('data/world_chunks.json'), paint: data('data/world_paint.json'), biomeProps: bp, coastline: data('data/coastline.json') };
const P = createPaint(world, cfg.paint), S = cfg.chunk;
const key = p => `${p.kind}|${p.art || ''}|${p.x}|${p.z}|${p.s}`;
const famKinds = new Set(cl.families.flatMap(f => [...f.primary, ...(f.companions || [])].map(r => r.kind)));
assert.ok(cl.enabled, 'clustering is on');
for (const f of cl.families) assert.ok(familyRates(cl, f).chance <= 1, `${f.id}: centre chance <= 1`);

// sample chunk pairs: forest, plain, marsh, jungle, snow, coast (first even chunk whose centre has that biome)
const find = test => { for (let cz = 0; cz < 32; cz += 2) for (let cx = 0; cx < 56; cx += 2) if (test(cx * S + S, cz * S + S)) return [cx, cz]; return null; };
const at = name => (x, z) => P.gridAt(x, z) === P.B[name] && P.gridAt(x - 60, z - 60) === P.B[name];
const samples = ['forest', 'plain', 'marsh', 'jungle', 'snow', 'dry'].map(n => find(at(n))).filter(Boolean);
const coastPick = find((x, z) => world.coast.some(([a, b]) => Math.hypot(a - x, b - z) < 120) && P.gridAt(x, z) !== P.B.bank);
if (coastPick) samples.push(coastPick);
assert.ok(samples.length >= 6, 'sample chunks found');

let clustered = 0;
for (const [cx, cz] of samples) {
  const four = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => buildChunk(world, cfg, cx + i, cz + j, 1, {}));
  // determinism
  const again = buildChunk(world, cfg, cx, cz, 1, {});
  assert.deepEqual(again.props, four[0].props, `chunk ${cx},${cz} builds the same twice`);
  // borders: one double-size chunk over the same ground
  const big = buildChunk(world, { ...cfg, chunk: S * 2 }, cx / 2, cz / 2, 1, {});
  const a = four.flatMap(c => c.props).map(key).sort(), b = big.props.map(key).sort();
  assert.deepEqual(a, b, `chunks ${cx},${cz}: four chunks match one combined chunk`);
  assert.equal(new Set(a).size, a.length, `chunks ${cx},${cz}: no duplicate props`);
  // member checks
  const x0 = cx * S, z0 = cz * S, segs = trailSegments(world, x0, z0, x0 + 2 * S, z0 + 2 * S, cfg.paint.trail.clearFull, cfg.paint.paths?.list);
  const C = cfg.clear || {}, sites = world.sites || [];
  for (const p of big.props) if (famKinds.has(p.kind) && !P.biomes[P.gridAt(p.x, p.z)].startsWith('top_')) {   // mountain-top props are art-only on blocked tops
    clustered++;
    assert.ok(!P.blockedAt(p.x, p.z), `${p.kind} at ${p.x},${p.z} is not on blocked ground`);
    if (p.kind !== 'dune_grass' && p.kind !== 'coastal_driftwood') assert.ok(P.trailDist(segs, p.x, p.z) >= cfg.paint.trail.clearNone - 1e-6, `${p.kind} at ${p.x},${p.z} keeps off the trail`);
    assert.ok(!sites.some(s => Math.hypot(s.x - p.x, s.z - p.z) < (C.site || 0)), `${p.kind} at ${p.x},${p.z} keeps off sites`);
  }
  // half scale: non-tree blockers match block x s
  for (const blk of big.blockers.filter(q => q.kind === 'boulder')) {
    const p = big.props.find(q => q.kind === 'boulder' && Math.abs(q.x - (blk.minX + blk.maxX) / 2) < 0.02 && Math.abs(q.z - (blk.minZ + blk.maxZ) / 2) < 0.02);
    if (p) assert.ok(Math.abs((blk.maxX - blk.minX) / 2 - 1.1 * p.s) < 0.05, 'boulder blocker shrinks with its sprite');
  }
}
assert.ok(clustered > 1000, `clustered props were checked (${clustered})`);

// replacement: with every family at zero, their kinds vanish from their own biome (edge trees aside), and the
// marsh supplement and coast pass place nothing
const zero = { ...cfg, biomeProps: { ...bp, clustering: { ...cl, families: cl.families.map(f => ({ ...f, per1000: 0 })) } } };
for (const [cx, cz] of samples) for (const p of buildChunk(world, zero, cx, cz, 1, {}).props) {
  const own = cl.families.filter(f => !f.coast && !f.terrain && [...f.primary, ...(f.companions || [])].some(r => r.kind === p.kind)).map(f => f.biome);
  assert.ok(p.kind !== 'dune_grass' && p.kind !== 'coastal_driftwood' && p.kind !== 'bamboo', `${p.kind}: its pass is replaced`);
  if (own.includes(P.biomes[P.gridAt(p.x, p.z)]) && p.kind !== 'pine') assert.fail(`${p.kind} at ${p.x},${p.z} still comes from the old scatter`);
}

// switch: enabled false is exactly the old scatter (no clustering block at all)
const off = { ...cfg, biomeProps: { ...bp, clustering: { ...cl, enabled: false } } }, none = { ...cfg, biomeProps: { ...bp, clustering: undefined } };
for (const [cx, cz] of samples.slice(0, 3)) assert.deepEqual(buildChunk(world, off, cx, cz, 1, {}).props, buildChunk(world, none, cx, cz, 1, {}).props, 'switch off = old scatter');

console.log(`test_prop_clusters: ok (${samples.length} areas, ${clustered} clustered props checked)`);
