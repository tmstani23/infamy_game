import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { worldToCanvas, canvasToWorld, hitTest, fitView, zoomAt, clampView, isDiscovered, fogCols } from '../src/world_map.js';
const world = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url)));
const v = fitView(world, 1400, 800);
for (const [x, z] of [[0, 0], [7000, 4000], [13950, 7950], [3210.5, 999.9]]) {
  const p = worldToCanvas(x, z, v), q = canvasToWorld(p.px, p.py, v);
  assert.ok(Math.hypot(q.x - x, q.z - z) < 0.5, 'round trip');
}
const z = { ...v, cx: 5000, cz: 3000, scale: 0.2 }; const before = canvasToWorld(300, 200, z);
zoomAt(world, z, 300, 200, 1.5); const after = canvasToWorld(300, 200, z);
assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.5, 'zoom keeps point under cursor');
clampView(world, z); assert.ok(z.scale <= 1.2 && z.scale >= 0.1 * 0.9 - 1e-9);
const items = [{ id: 'a', x: 1000, z: 1000 }, { id: 'b', x: 1050, z: 1000 }];
const vv = { cx: 1000, cz: 1000, scale: 0.1, w: 800, h: 600 }; // 50 units = 5 px
assert.equal(hitTest(items, 400 + 4, 300, vv).id, 'b', 'nearest wins');
assert.equal(hitTest(items, 400 - 3, 300, vv).id, 'a');
assert.equal(hitTest(items, 400, 330, vv), null, 'too far');
assert.equal(isDiscovered(world, null, 5, 5), true);
const g = '0'.repeat(fogCols(world) * 32).split(''); g[0] = '1'; const gs = g.join('');
assert.equal(isDiscovered(world, gs, 100, 100), true); assert.equal(isDiscovered(world, gs, 600, 100), false);
console.log('test_world_map: ok');
