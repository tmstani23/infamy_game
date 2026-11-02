// Frontier W3.4: which island chunks to draw and drop (src/world_stream.js), pure parts only.
import assert from 'node:assert/strict';
import { chunksToDraw, planChunks, propsInView } from '../src/world_stream.js';

const cfg = { chunk: 250, drawRadius: 1, cols: 56, rows: 32 };
// standing still: the 3 x 3 ring, nearest first
const still = chunksToDraw(1100, 1100, 0, 0, cfg);
assert.equal(still.length, 9);
assert.deepEqual(still[0], [4, 4], 'own chunk first');
// moving east: prefetch the ring around where the camera will be
const moving = chunksToDraw(1240, 1000, 10, 0, cfg);
assert.ok(moving.some(([a]) => a === 6), 'prefetches ahead');
assert.ok(moving.length > 9 && moving.length <= 18);
// island edges: never off the map
const corner = chunksToDraw(10, 10, 0, 0, cfg);
assert.equal(corner.length, 4);
assert.ok(corner.every(([a, b]) => a >= 0 && b >= 0));
// plan: build only what is missing, one per frame; drop least recently used past the limit
const loaded = new Map([['4,4', { used: 9 }], ['0,0', { used: 1 }], ['9,9', { used: 2 }]]);
const p1 = planChunks(loaded, still, { limit: 3, perFrame: 1 });
assert.equal(p1.build.length, 1);
assert.ok(!loaded.has(p1.build[0].join(',')));
assert.deepEqual(p1.drop, ['0,0'], 'drops the oldest unused chunk to fit');
const p2 = planChunks(loaded, still, { limit: 16, perFrame: 2 });
assert.equal(p2.drop.length, 0, 'nothing dropped while under the cache limit');
assert.equal(p2.build.length, 2);
// a wanted chunk is never dropped
const p3 = planChunks(new Map([['4,4', { used: 0 }]]), still, { limit: 0, perFrame: 0 });
assert.deepEqual(p3.drop, []);
// props in view
const props = [{ kind: 'pine', x: 0, z: 0 }, { kind: 'pine', x: 60, z: 0 }, { kind: 'mountain', x: 70, z: 0 }];
assert.deepEqual(propsInView(props, 0, 0, 55).map(p => p.kind), ['pine', 'mountain'], 'mountains show from further off');
console.log('test_world_stream: ok');
