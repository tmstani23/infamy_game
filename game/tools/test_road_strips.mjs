// Built-in island roads as textured strips (src/road_strips.js, Tim 2026-11-21).
//   node game/tools/test_road_strips.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createPaint } from '../src/world_paint.js';
import { roadLines, smoothLine, buildStrip, linesNear } from '../src/road_strips.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), pc = data('data/world_paint.json'), RS = pc.trail.strips, P = createPaint(world, pc);
assert.ok(existsSync(new URL(`../${RS.art}`, import.meta.url)), 'road strip art is built (tools/build_road_strips.py)');
for (const b of pc.biomes) assert.ok(RS.types[b] >= 0 && RS.types[b] < 6, `biome ${b} has a road type`);
assert.equal(RS.tone.length, 6, 'one tone per road type');

const lines = roadLines(world, pc.paths?.list);
assert.equal(lines.length, world.corridors.length + (pc.paths?.list.length || 0), 'every corridor and path is a road');

// smoothing keeps the ends (roads still meet at junctions) and stays near the line
const sq = smoothLine([[0, 0], [100, 0], [100, 100]], RS.step, RS.smooth);
assert.deepEqual(sq[0], [0, 0]); assert.deepEqual(sq[sq.length - 1], [100, 100]);
for (const [x, z] of sq) assert.ok(Math.min(Math.hypot(x - Math.min(x, 100), z), Math.abs(x - 100)) < 15, 'smoothed road stays near its line');

// a sample of real roads: width, continuous uv, type weights sum to 1, fade only over water
let wet = 0;
for (const l of lines.filter((_, i) => i % 12 === 0)) {
  const r = buildStrip(l, P, RS);
  assert.ok(r.n > 2, `road ${l.id} has points`);
  for (let i = 0; i < r.n; i++) {
    const w = Math.hypot(r.pos[i * 4] - r.pos[i * 4 + 2], r.pos[i * 4 + 1] - r.pos[i * 4 + 3]);
    assert.ok(Math.abs(w - RS.width) < 1e-3, `road ${l.id} is ${RS.width} wide`);
    if (i) assert.ok(r.uv[i * 4 + 1] >= r.uv[(i - 1) * 4 + 1], 'texture runs forward along the road');
    let s = 0; for (let k = 0; k < 6; k++) s += r.types[i * 6 + k];
    assert.ok(Math.abs(s - 1) < 1e-4, 'road type weights sum to 1');
    const x = (r.pos[i * 4] + r.pos[i * 4 + 2]) / 2, z = (r.pos[i * 4 + 1] + r.pos[i * 4 + 3]) / 2;
    if (r.fade[i] < 1) { wet++; assert.ok(P.waterAt(x, z) > RS.waterFade[0], 'a road only fades over water'); }
  }
  assert.ok(Math.abs(r.uv[(r.n - 1) * 4 + 1] * RS.repeat - r.length) < 1e-2, 'uv follows the length');
  assert.equal(JSON.stringify(buildStrip(l, P, RS).types), JSON.stringify(r.types), 'same road twice is identical');
}
// snowy roads use the snow strip
const snowy = lines.find(l => { const [x, z] = l.points[1]; return P.biomes[P.gridAt(x, z)] === 'snow'; });
if (snowy) { const r = buildStrip(snowy, P, RS); assert.ok(Math.max(...Array.from({ length: r.n }, (_, i) => r.types[i * 6 + 5])) > 0.5, 'a road through snow uses the snow strip'); }
assert.ok(linesNear(lines, lines[0].points[0][0], lines[0].points[0][1], 10).includes(lines[0]), 'a road is found near its own start');
console.log(`road strips ok (${lines.length} roads, ${wet} faded points over water in the sample)`);
