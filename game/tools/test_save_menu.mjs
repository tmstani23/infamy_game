import assert from 'node:assert/strict';
import { defaultLabel, slug, sortSaves, rowText, willOverwrite, newest, saveLoadURL, saveFromURL } from '../src/save_menu.js';

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
const route = saveLoadURL('dev_frontier', 'http://localhost:8080/game/?test=ninja#old-panel');
assert.equal(route, 'http://localhost:8080/game/?load=dev_frontier', 'save navigation keeps the server/path and drops stale test presets');
assert.equal(saveFromURL(route), 'dev_frontier');
assert.equal(saveFromURL('http://localhost:8080/game/'), null, 'ordinary launch still opens the main menu');
assert.throws(()=>saveLoadURL('../outside',route), /Bad save name/);
assert.throws(()=>saveFromURL('http://localhost:8080/game/?load=..%2Foutside'), /Bad save name/);
console.log('test_save_menu: ok');
