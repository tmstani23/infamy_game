// Move extras (Tim 2026-11-22): the camp card button hands the workers past a spot's max back to the governor.
// Run: node game/tools/test_camp_extras.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontier } from '../src/sim/frontier/frontier.js';
import { ensureGrid, worldToCell } from '../src/sim/frontier/town_grid.js';
import { supportsWorkers } from '../src/sim/resource_spots.js';

const read = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));
const data = read('frontier.json'), wd = read('world.json'), rules = read('resource_spots.json'); data.settlements = {}; data.roads = {};
for (const t of data.tiers?.list || []) delete t.workers;
const state = { tick: 0, entities: {}, news: [], clans: { player: {} } };
const fr = createFrontier({ state, data, world: wd, spotData: read('world_spots.json'), spotRules: rules });
const site = wd.sites[0], R = data.workers;
const s = fr.world.addTown({ id: 't', name: 'T', owner: 'player', x: site.x, z: site.z, pop: 60, stock: { ...data.founding.startStock, ryo: 5000, goods: 500 }, roadReserve: data.townGrid.hallRoadReserve || 0, buildings: [{ type: 'town_hall', stage: 'built', cell: 0 }] });
ensureGrid(s, wd, data);
const W = fr.modules.find(m => m.name === 'workers').workers;
const food = W.reachSpots(s).filter(p => R.resources[p.kind] === 'food').sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
assert.ok(food, 'a food spot in reach');
s.buildings.push({ id: 'fc', type: 'food_camp', stage: 'built', cell: worldToCell(s, food.x, food.z), store: {}, carts: [] });
s.workerTraining = Array.from({ length: 20 }, () => ({ id: fr.world.newId('w'), readyAt: 0 }));
const news = [], run = n => { for (let i = 0; i < n; i++) { state.tick++; fr.tick(); news.push(...state.news); state.news = []; } };
for (let i = 0; i < 400 && s.workers.length < 20; i++) run(20);
assert.equal(s.workers.length, 20, 'twenty workers trained');
assert.ok(W.assign(s, s.workers.map(w => w.id), food.id, 'p').ok, 'all twenty sent to the one spot by hand');
run(200);
const max = supportsWorkers(food, rules.stages), on = () => s.workers.filter(w => w.spot === food.id).length;
assert.ok(max < 20, 'the spot is over its max');
// the economy tick marks the camp tired and the town alert says so once
run(40);
assert.equal(s.tiredCamps?.[0]?.id, 'fc', 'the camp is marked tired'); assert.equal(s.tiredCamps[0].extra, 20 - max);
const said = news.filter(n => n.event === 'campTired');
assert.equal(said.length, 1, 'one alert'); assert.match(said[0].text, new RegExp(`T food camp: ${20 - max} workers over the max`));
const r = W.campExtras(s, 'fc');
assert.ok(r.ok, r.reason); assert.equal(r.moved, 20 - on() + s.workers.filter(w => w.offSpot).length, 'moved = those off the spot plus those handing a load in first');
run(1200);
assert.ok(on() <= max, `at most the max (${max}) left on the spot, got ${on()}`);
assert.ok(s.workers.filter(w => w.spot === food.id && w.by === 'p').length >= on() - 0, 'the ones left are still the player\'s');
assert.equal(s.workers.filter(w => w.by === 'g').length, r.moved, 'the moved ones belong to the governor');
assert.ok(!W.campExtras(s, 'fc').ok, 'nothing more to move');
for (let i = 0; i < 40; i++) run(1);
assert.equal(s.tiredCamps, undefined, 'no longer tired');
assert.ok(!W.campExtras(s, 'nope').ok, 'unknown camp rejected');
console.log('test_camp_extras: ok', JSON.stringify({ max, moved: r.moved, left: on() }));
