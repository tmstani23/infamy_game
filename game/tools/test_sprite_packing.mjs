import assert from 'node:assert/strict';
import {frameBounds, packFrames, validateLayout, mipBytes} from '../../tools/sprite_packing.mjs';

assert.equal(mipBytes(4, 2), 44, 'exact rectangular mip chain includes the 1x1 level');
assert.equal(mipBytes(4, 2, false), 32);
const cell = 16, frames = 2, directions = 8, width = cell * frames, height = cell * directions;
const pixels = new Uint8Array(width * height * 4);
for (let dir = 0; dir < directions; dir++) {
  pixels[((dir * cell + 2) * width + 3) * 4 + 3] = 1;
  pixels[((dir * cell + 13) * width + 14) * 4 + 3] = 255;
}
const parsed = frameBounds(pixels, width, height);
assert.equal(parsed.frames, frames); assert.equal(parsed.bounds.length, 16);
for (let dir = 0; dir < directions; dir++) {
  assert.deepEqual(parsed.bounds[dir*frames], {dir, frame: 0, x: 3, y: 2, w: 12, h: 12}, 'alpha=1 is retained');
  assert.deepEqual(parsed.bounds[dir*frames+1], {dir, frame: 1, x: 0, y: 0, w: 0, h: 0}, 'empty frames keep their timeline slot');
}
const first = packFrames(parsed.bounds);
assert.deepEqual(packFrames(parsed.bounds), first, 'same input gives repeatable atlas layouts');
validateLayout(parsed.bounds, first);
assert.equal(first.placements[1], null);
const empty = packFrames([{w: 0, h: 0}]);
assert.equal(empty.bytes, 4, 'fully empty sheet retains a transparent 1x1 texture');
assert.equal(first.bytes, first.pages.reduce((n, p) => n + mipBytes(p.width, p.height), 0));
assert.ok(packFrames(parsed.bounds, {margin: 1}).bytes < mipBytes(width, height), 'padding is real overhead, especially for tiny test frames');

// Multiple pages, POT allocation, generous gutters and no overlaps.
const squares = Array.from({length: 5}, () => ({w: 44, h: 44}));
const multi = packFrames(squares, {margin: 8, maxSize: 64});
assert.equal(multi.pages.length, 5); validateLayout(squares, multi);
assert.throws(() => packFrames([{w: 2049, h: 2}]), /exceeds/);
assert.throws(() => frameBounds(new Uint8Array(7), 2, 2));
let seed = 125;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32);
for (let run = 0; run < 8; run++) {
  const varied = Array.from({length: 80}, () => ({w: 1 + Math.floor(random()*100), h: 1 + Math.floor(random()*150)}));
  validateLayout(varied, packFrames(varied));
}
console.log('Sprite packing: alpha=1, empty timeline slots, repeatability, page bounds, gutters, overlap checks, exact mip bytes and seeded varied layouts passed');
