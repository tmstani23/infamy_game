// Rail shipments S5: Rail ledger (src/rail_ledger.js) on real sim state. Run: node game/tools/test_rail_ledger.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { createRailLedger } from '../src/rail_ledger.js';
import { shipEta } from '../src/sim/frontier/ship_eta.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), railways = data('data/railways.json');
railways.train.stopSeconds = 5;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, railways, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, F = S.frontier, hero = S.entities[m.heroId], hall = frontier.founding.townHall;
const mk = (id, i, stock) => g.frontier.world.addTown({ id, name: id, owner: 'player', x: world.sites[i].x, z: world.sites[i].z, pop: 3, stock, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
mk('tA', 3, { food: 900, timber: 900, stone: 100, goods: 100, ryo: 0 });   // keep is half the cap (500): stock above it ships
mk('tB', 4, { food: 0, timber: 0, stone: 0, goods: 0, ryo: 500 });
g.step([]);
F.rail.links.r1 = { id: 'r1', owner: 'player', from: 'tA', to: 'tB', done: true, length: 2000, points: [[0, 0], [2000, 0]], dist: [0, 2000] };
const L = createRailLedger({ game: g });
assert.match(L.html(), /No shipments on the way/);
g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'order', town: 'tB', resource: 'timber', amount: 50 }]);
const o = Object.values(F.shipping.orders)[0];
assert.match(L.html(), /Open 1/); assert.match(L.html(), /Timber 50/); assert.match(L.html(), /tA to tB/);
// 2026-11-23: every open row has a countdown; while it waits at tA it is an estimate
assert.match(L.html(), /WAITING<\/small><b>about \d+(s|m \d\ds)<\/b>/);
const e0 = shipEta({ frontier: F, data: g.frontier.data, tick: S.tick, order: o }), t0 = S.tick;
assert.equal(e0.status, 'waiting'); assert.ok(e0.secs > 0 && !e0.exact, 'waiting: an estimate');
// wait until it is aboard, then pick it: the ledger names its train for the map highlight
for (let i = 0; i < 4000 && !Object.values(F.rail.trains).some(t => t.freight?.length); i++) g.step([]);
assert.ok(L.click('pick:' + o.id));
assert.ok(L.train(), 'selected shipment -> its train');
assert.match(L.html(), /on train \d+ to tB/); assert.match(L.html(), /TRAIN \d+<\/small><b>\d+(s|m \d\ds)<\/b>/, 'aboard, straight to tB: exact');
const e1 = shipEta({ frontier: F, data: g.frontier.data, tick: S.tick, order: o }), t1 = S.tick;
assert.equal(e1.status, 'train'); assert.ok(e1.exact);
for (let i = 0; i < 6000 && o.state === 'open'; i++) g.step([]);
assert.equal(o.state, 'done');
// the countdowns hold: within a couple of seconds of the real arrival (nobody watches these trains)
const took = s0 => Math.abs((o.done - s0.t) / 20 - s0.e.secs);
assert.ok(took({ t: t1, e: e1 }) <= 2, `train eta ${e1.secs}s vs ${(o.done - t1) / 20}s`);
assert.ok(took({ t: t0, e: e0 }) <= 3, `waiting eta ${e0.secs}s vs ${(o.done - t0) / 20}s`);
L.click('tab:done');
assert.match(L.html(), /DELIVERED/); assert.match(L.html(), /tA to tB/, 'the source name is kept after loading');
L.click('tab:lost'); assert.match(L.html(), /No cargo lost/);
// pages: never more than 6 rows
for (let i = 0; i < 9; i++) g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'order', town: 'tB', resource: 'food', amount: 10 }]);
L.click('tab:open');
assert.equal((L.html().match(/class="lgrow/g) || []).length, 6); assert.match(L.html(), />Next</);
assert.match(L.html(), /data-ledger="cancel:/); assert.deepEqual(L.click('cancel:x1'), { cancel: 'x1' });
console.log('test_rail_ledger: ok');
