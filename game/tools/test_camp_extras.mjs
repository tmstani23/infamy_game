// Move extras (2026-11-22): the camp card button hands the workers past a spot's max back to the governor.
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
// the press is confirmed by one line that accounts for every worker moved (2026-11-22: "no confirmation that anything changed")
{ const said = news.filter(n => n.kind === 'campMoved');
  assert.equal(said.length, 1, 'one confirmation line'); assert.equal(said[0].moved, r.moved); assert.equal(said[0].building, 'fc');
  assert.equal(said[0].placed + said[0].waiting + said[0].loaded + said[0].idle, r.moved, 'every moved worker is in the line');
  assert.match(said[0].text, new RegExp(`^T food camp: ${r.moved} workers moved off\\. `)); }
// one max everywhere (2026-11-22): the box, the camp card and the governor all use the spot's fixed max, however
// long the walk, so the governor never refills what Move extras took off
{ const { overwork } = await import('../src/sim/resource_spots.js');
  assert.equal(overwork(food, null, rules.stages, max, 0.35, 500).best, max, 'a long trip does not shrink the max');
  assert.equal(overwork(food, null, rules.stages, max, 0.35, 500).over, false); assert.equal(overwork(food, null, rules.stages, max + 1).over, true);
  run(600); assert.ok(on() <= max, 'the governor has not refilled the spot past its max'); assert.equal(s.tiredCamps, undefined, 'and the camp stays off the list'); }
// each spot counts for its nearest camp only, and a worker told off his spot no longer counts
{ const { campLoad, spotCounts } = await import('../src/sim/frontier/camp_load.js');
  const args = { R, index: W.index, stages: rules.stages, count: spotCounts([s]) }, fc = s.buildings.find(b => b.id === 'fc');
  const mine = campLoad(s, fc, args); assert.ok(mine.spots.some(x => x.p.id === food.id), 'the camp beside the spot counts it');
  assert.equal(mine.spots.find(x => x.p.id === food.id).max, max, 'with the fixed max');
  const far = { id: 'fc2', type: 'food_camp', stage: 'built', cell: worldToCell(s, food.x + 60, food.z), store: {}, carts: [] }; s.buildings.push(far);
  assert.ok(!campLoad(s, far, args).spots.some(x => x.p.id === food.id), 'a second camp farther off does not count the same spot');
  assert.ok(campLoad(s, fc, args).spots.some(x => x.p.id === food.id), 'the nearer camp still does');
  s.buildings.pop();
  const w = s.workers.find(x => x.spot === food.id), was = spotCounts([s])[food.id];
  w.offSpot = true; assert.equal(spotCounts([s])[food.id] || 0, was - 1, 'one told off his spot is not counted'); delete w.offSpot; }
for (let i = 0; i < 40; i++) run(1);
assert.equal(s.tiredCamps, undefined, 'no longer tired');
assert.ok(!W.campExtras(s, 'nope').ok, 'unknown camp rejected');
console.log('test_camp_extras: ok', JSON.stringify({ max, moved: r.moved, left: on() }));

// the Workers view lists them (2026-11-22): a box over the cards, one card row fewer, Move extras / Go to per camp
{ const { workerPanelHTML } = await import('../src/worker_panel.js');
  const { tiredCamps } = await import('../src/tired_camps.js');
  s.tiredCamps = [{ id: 'fc', type: 'food_camp', extra: 14, n: 20, max: 6 }];
  const list = tiredCamps(state.frontier, 'player'); assert.equal(list[0].num, 1); assert.equal(list[0].name, 'Food camp'); assert.ok(Number.isFinite(list[0].x));
  const opts = { selected: [], index: W.index, data, tab: 'roster' }, cards = h => (h.match(/class="wcard/g) || []).length;
  const withBox = workerPanelHTML(s, { ...opts, tired: list }), without = workerPanelHTML(s, { ...opts, tired: [] });
  assert.match(withBox, /Camps over their max/); assert.match(withBox, /data-act="build-worker-campextras" data-id="fc"/); assert.match(withBox, /data-act="build-worker-campgo" data-id="fc"/);
  assert.match(withBox, /20 working, max 6/); assert.match(withBox, /\+14/);
  assert.equal(cards(withBox), cards(without) - 2, 'one row of cards fewer so the panel keeps its size');
  assert.doesNotMatch(workerPanelHTML(s, { ...opts, tab: 'groups', tired: list }), /Camps over their max/, 'Workers tab only');
  const busy = workerPanelHTML(s, { ...opts, tired: list, moving: id => id === 'fc' });
  assert.match(busy, /<button class="wmv" disabled>Moving<\/button>/, 'the button shows Moving right after the press'); assert.doesNotMatch(busy, /data-act="build-worker-campextras" data-id="fc"/);
  delete s.tiredCamps; }
console.log('test_camp_extras: workers view ok');
