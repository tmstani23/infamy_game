import assert from 'node:assert/strict';
import { defaultLabel, slug, sortSaves, rowText, willOverwrite, newest } from '../src/save_menu.js';

assert.equal(defaultLabel(3, 'yakuza'), 'Day 3, yakuza');
assert.equal(slug('Day 3, Yakuza!'), 'day-3-yakuza');
assert.equal(slug('  '), 'save');
assert.equal(slug('x'.repeat(60)).length, 40);
assert.match(slug('../etc'), /^[a-z0-9_-]{1,40}$/);
const hs = [
  { name: 'a', savedAt: '2026-11-01T10:00:00Z', label: 'A' },
  { name: 'autosave_1', savedAt: '2026-11-02T10:00:00Z', label: 'Dawn, day 2', clan: 'yakuza', day: 2, mode: 'classic' },
  { name: 'b', savedAt: '2026-11-01T12:00:00Z', label: 'B' },
];
assert.deepEqual(sortSaves(hs).map(h => h.name), ['autosave_1', 'b', 'a']);
assert.equal(hs[0].name, 'a', 'input not mutated');
assert.match(rowText(hs[1]), /^Dawn · Dawn, day 2 · yakuza · day 2 · classic/);
assert.ok(!rowText(hs[0]).startsWith('Dawn'));
assert.ok(willOverwrite(hs, 'b')); assert.ok(!willOverwrite(hs, 'c'));
assert.equal(newest(hs).name, 'autosave_1'); assert.equal(newest([]), null);
console.log('test_save_menu: ok');
