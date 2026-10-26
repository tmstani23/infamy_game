// Checks that the per-frame draw sorter (render/draw_order.js createSorter) gives exactly the same
// draw order as the plain sortThings, with moving units, appearing banners and overlap cycles:
// node game/tools/test_draw_sort.mjs
import assert from 'node:assert/strict';
import { sortThings, createSorter } from '../src/render/draw_order.js';

let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function thing(x, z, r, h) {
  const t = { mesh: { renderOrder: 0 }, extras: [{ renderOrder: 0 }], foot: null, screen: null, depth: 0 };
  place(t, x, z, r, h);
  return t;
}
// a rough stand-in for Thing.updateScreen: iso screen box from the footprint
function place(t, x, z, r, h = 2) {
  t.foot = { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r };
  const sx = (x - z) * 0.7, sy = (x + z) * 0.4;
  t.screen = { x0: sx - r, x1: sx + r, y0: sy - r * 0.5, y1: sy + h };
  t.depth = x + z;
}
const orders = list => list.map(t => [t.mesh.renderOrder, t.extras[0].renderOrder]);

for (const [nStatic, nMovers, frames] of [[30, 6, 30], [400, 60, 15], [900, 120, 4]]) {
  const statics = Array.from({ length: nStatic }, () => thing(rand() * 120 - 60, rand() * 120 - 60, 0.3 + rand() * (rand() < 0.1 ? 6 : 1.5), 1 + rand() * 6));
  const banners = [];
  const movers = Array.from({ length: nMovers }, () => thing(rand() * 80 - 40, rand() * 80 - 40, 0.45, 2));
  const sorter = createSorter();
  for (let f = 0; f < frames; f++) {
    for (const m of movers) place(m, m.foot.minX + 0.45 + (rand() - 0.5) * 2, m.foot.minZ + 0.45 + (rand() - 0.5) * 2, 0.45, 2);
    if (f % 5 === 2) banners.push(thing(rand() * 60 - 30, rand() * 60 - 30, 0.5, 3));        // a banner goes up
    if (f % 7 === 6 && banners.length) banners.splice(0, 1);                                // one comes down
    const fixed = [...statics, ...banners];
    sortThings([...fixed, ...movers]);
    const want = orders([...fixed, ...movers]);
    sorter.sort(fixed, movers);
    assert.deepEqual(orders([...fixed, ...movers]), want, `frame ${f} with ${nStatic} statics, ${nMovers} movers`);
  }
}

// speed on a port-town-sized scene (695 props + 43 buildings + banners, ~120 units)
const statics = Array.from({ length: 760 }, () => thing(rand() * 200 - 100, rand() * 150 - 50, 0.3 + rand() * 2, 1 + rand() * 5));
const movers = Array.from({ length: 120 }, () => thing(rand() * 100 - 50, rand() * 100 - 50, 0.45, 2));
const sorter = createSorter();
sorter.sort(statics, movers);
let t0 = performance.now();
for (let f = 0; f < 30; f++) sortThings([...statics, ...movers]);
const oldMs = (performance.now() - t0) / 30;
t0 = performance.now();
for (let f = 0; f < 30; f++) sorter.sort(statics, movers);
const newMs = (performance.now() - t0) / 30;
console.log(`draw sort per frame: old ${oldMs.toFixed(2)} ms, new ${newMs.toFixed(2)} ms`);
console.log('draw sort OK');
