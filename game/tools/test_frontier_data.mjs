// F2.1: frontier.json is well formed. Run from the repo root: node game/tools/test_frontier_data.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
assert.equal(d.version, 7);
assert.ok(d.cadenceTicks > 0);
for (const k of ['resources', 'rates', 'buildings', 'regions', 'settlements', 'roads']) assert.ok(d[k], `has ${k}`);

for (const [id, b] of Object.entries(d.buildings)) {
  assert.ok(b.cost && Object.keys(b.cost).length, `${id} has cost`);
  assert.ok(Number.isFinite(b.jobs), `${id} has jobs`);
  assert.ok(b.buildTicks > 0, `${id} has buildTicks`);
  for (const r of Object.keys(b.cost)) assert.ok(d.resources.includes(r), `${id} cost resource ${r} is known`);
  if (b.output) for (const r of Object.keys(b.output)) assert.ok(d.resources.includes(r), `${id} output ${r} is known`);
  if (b.recipe) for (const r of [...Object.keys(b.recipe.in), ...Object.keys(b.recipe.out)]) assert.ok(d.resources.includes(r), `${id} recipe ${r} is known`);
}
for (const [id, s] of Object.entries(d.settlements)) {
  assert.ok(d.regions[s.region], `${id} region exists`);
  for (const b of s.buildings) assert.ok(d.buildings[b.type], `${id} building ${b.type} exists`);
  for (const r of Object.keys(s.stock)) assert.ok(d.resources.includes(r), `${id} stock resource ${r} is known`);
}
for (const [id, r] of Object.entries(d.roads)) {
  assert.ok(d.settlements[r.from] && d.settlements[r.to], `road ${id} ends are settlements`);
  assert.ok(r.length > 0, `road ${id} has length`);
}
const first = d.settlements.s_frontier_1;
assert.equal(first.pop, 8);
assert.deepEqual([first.stock.food, first.stock.timber, first.stock.stone], [60, 40, 10]);
assert.deepEqual(first.buildings.map(b => b.type).sort(), ['farm', 'house', 'house']);

// no negative numbers anywhere
(function walk(v, path) {
  if (typeof v === 'number') assert.ok(v >= 0, `${path} is not negative`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
})(d, 'frontier');
console.log('test_frontier_data: ok');
