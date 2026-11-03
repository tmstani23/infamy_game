// W3.10 island painting (docs/world_painting.md): determinism, seams, prop rules, density, Part B art.
//   node game/tools/test_world_paint.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildChunk } from '../src/sim/chunk_gen.js';
import { createPaint, trailSegments } from '../src/world_paint.js';
import { passable, terrainAt } from '../src/sim/world_data.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), paintCfg = data('data/world_paint.json');
const cfg = { ...data('data/world_chunks.json'), paint: paintCfg }, S = cfg.chunk, T = world.terrain.cell;
const P = createPaint(world, paintCfg);
const cols = Math.ceil(world.size.w / S), rows = Math.ceil(world.size.h / S);

// chunks by what they hold: count terrain codes per chunk
const n = S / T, mix = (cx, cz) => { const c = {}; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const k = terrainAt(world, cx * S + (j + .5) * T, cz * S + (i + .5) * T); c[k] = (c[k] || 0) + 1; } return c; };
const all = [];
for (let cz = 0; cz < rows; cz++) for (let cx = 0; cx < cols; cx++) all.push({ cx, cz, m: mix(cx, cz) });
const pick = (f, k = 3) => all.filter(f).slice(0, k);
const sample = [
  ...pick(c => (c.m.f || 0) >= n * n * 0.8), ...pick(c => (c.m.p || 0) >= n * n * 0.8), ...pick(c => (c.m.n || 0) >= n * n * 0.8),
  ...pick(c => c.m.f && c.m.p && c.m.f + c.m.p > n * n * 0.8), ...pick(c => c.m.n && (c.m.f || c.m.p || c.m.h)), ...pick(c => c.m.m && c.m.f), ...pick(c => c.m.r && c.m.p),
];
assert.ok(sample.length >= 12, 'found sample chunks of each kind');

// 1. the same chunk twice is identical (props, blockers, art, ground maps)
for (const { cx, cz } of sample.slice(0, 8)) {
  assert.equal(JSON.stringify(buildChunk(world, cfg, cx, cz, 7)), JSON.stringify(buildChunk(world, cfg, cx, cz, 7)), `chunk ${cx},${cz} twice`);
  const near = { segs: trailSegments(world, cx * S, cz * S, (cx + 1) * S, (cz + 1) * S, 10, paintCfg.paths?.list), stamps: P.stampsIn(cx * S, cz * S, (cx + 1) * S, (cz + 1) * S) };
  const a = P.paintChunk(cx * S, cz * S, S, near), b = P.paintChunk(cx * S, cz * S, S, near);
  assert.deepEqual([a.mats, a.maps.map(m => [...m]), [...a.O]], [b.mats, b.maps.map(m => [...m]), [...b.O]], `ground ${cx},${cz} twice`);
  assert.ok(a.mats.length <= paintCfg.maxMaterials, `at most ${paintCfg.maxMaterials} materials per chunk`);
}

// 2a. props are seamless: four chunks give exactly the props of one chunk twice the size
const key = p => `${p.kind}@${p.x},${p.z}`;
for (const { cx, cz } of [sample[0], sample[3], sample[9]].map(c => ({ cx: c.cx & ~1, cz: c.cz & ~1 }))) {
  const four = [];
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) four.push(...buildChunk(world, cfg, cx + a, cz + b, 7).props.map(key));
  const big = buildChunk(world, { ...cfg, chunk: 2 * S }, cx / 2, cz / 2, 7).props.map(key);
  assert.deepEqual(four.sort(), big.sort(), `props across the borders of ${cx},${cz} match`);
}
// 2b. ground maps agree along shared borders (a chunk's last column = its neighbour's border pixels)
let worstSeam = 0;
const decode = (c, k) => Object.fromEntries(c.mats.map((m, s) => [m, c.maps[s >> 2][k * 4 + (s & 3)] / 255]));
for (const { cx, cz } of sample) {
  if (cx + 1 >= cols) continue;
  const nearOf = (x0, z0) => ({ segs: trailSegments(world, x0, z0, x0 + S, z0 + S, 10, paintCfg.paths?.list), stamps: P.stampsIn(x0, z0, x0 + S, z0 + S) });
  const a = P.paintChunk(cx * S, cz * S, S, nearOf(cx * S, cz * S)), b = P.paintChunk((cx + 1) * S, cz * S, S, nearOf((cx + 1) * S, cz * S)), N = a.N;
  for (let j = 0; j < N; j++) for (const [ia, ib] of [[N - 2, 0], [N - 1, 1]]) {
    const ka = j * N + ia, kb = j * N + ib, wa = decode(a, ka), wb = decode(b, kb);
    assert.equal(a.O[ka * 4], b.O[kb * 4], 'water agrees across the border');
    for (const m of new Set([...Object.keys(wa), ...Object.keys(wb)])) worstSeam = Math.max(worstSeam, Math.abs((wa[m] || 0) - (wb[m] || 0)));
  }
}
assert.ok(worstSeam < 0.03, `ground weights agree across chunk borders (worst ${worstSeam.toFixed(3)})`);

// 3. no prop on a corridor, a blocked cell, within clearNone of a trail, or inside a clearing stamp's core
const tr = paintCfg.trail;
for (const { cx, cz } of sample) {
  const g = buildChunk(world, cfg, cx, cz, 7), segs = trailSegments(world, g.x0, g.z0, g.x0 + S, g.z0 + S, 20, paintCfg.paths?.list), st = P.stampsIn(g.x0, g.z0, g.x0 + S, g.z0 + S);
  for (const p of g.props) {
    assert.ok(passable(world, p.x, p.z), `prop ${p.kind} at ${p.x},${p.z} on a blocked cell`);
    assert.ok(P.trailDist(segs, p.x, p.z) >= tr.clearNone, `prop ${p.kind} at ${p.x},${p.z} within ${tr.clearNone} of a trail`);
    for (const s of st) if (s.clear) assert.ok(Math.hypot(p.x - s.x, p.z - s.z) >= 0.7 * s.r, `prop inside a clearing stamp (${s.from})`);
  }
}

// 4. density per biome within the data ranges (props per 1000 square units of walkable ground)
const dens = {};
for (const [biome, code] of [['forest', 'f'], ['plain', 'p'], ['snow', 'n'], ['hills', 'h'], ['dry', 'd']]) {
  const list = all.filter(c => (c.m[code] || 0) === n * n).slice(0, 4);
  assert.ok(list.length, `a full ${biome} chunk exists`);
  let props = 0;
  for (const { cx, cz } of list) props += buildChunk(world, cfg, cx, cz, 7).props.length;
  const d = props / (list.length * S * S / 1000), [lo, hi] = paintCfg.density[biome];
  dens[biome] = +d.toFixed(2);
  assert.ok(d >= lo && d <= hi, `${biome} density ${d.toFixed(2)} outside ${lo}-${hi}`);
}

// 5. Part B: lake banks on the shores, fords only at thin ford crossings, opposite rims on forest/snow ranges
let banks = 0, fords = 0, opp = 0;
const art = new Set();
for (let cz = 0; cz < rows; cz++) for (let cx = 0; cx < cols; cx++) {
  const m = all[cz * cols + cx].m;
  if (!m.w && !m.r && !m.m) continue;
  for (const a of buildChunk(world, cfg, cx, cz, 7).art) {
    const k = `${a.art}@${a.x},${a.z}`;
    assert.ok(!art.has(k), `art ${k} placed by two chunks`); art.add(k);
    if (a.bank) {
      banks++;
      const [dx, dz] = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[a.bank];
      assert.ok(passable(world, a.x + dx * 2, a.z + dz * 2) && terrainAt(world, a.x - dx * 2, a.z - dz * 2) === 'w', `bank ${k}: land on its ${a.bank} side, water behind`);
    }
    if (a.ford) { fords++; assert.equal(terrainAt(world, a.x, a.z), 'r', 'ford art sits on the river'); }
    if (/_opposite/.test(a.art)) opp++;
  }
}
assert.ok(banks > 20 && fords > 0 && opp > 20, `banks ${banks}, fords ${fords}, opposite rims ${opp}`);
assert.ok(!(world.fords || []).some(f => f.kind === 'bridge' && [...art].some(k => k.startsWith('river_ford') && k.includes(`@${f.x},`))), 'no ford art at bridges');

console.log(`test_world_paint: ok (${sample.length} chunks; seam worst ${worstSeam.toFixed(3)}; density ${JSON.stringify(dens)}; banks ${banks}, fords ${fords}, opposite rims ${opp})`);
