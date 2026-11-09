// Rail shipments S2: trains carry consignments, wagon-loads in turn, transfer between lines.
// Run: node game/tools/test_shipments_trains.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), railways = data('data/railways.json');
railways.ship.wagonLoad = 60;
railways.train.stopSeconds = 5;
railways.train.consist = ['carriage', 'goods', 'goods', 'guard'];   // two goods wagons: 120 a trip
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, railways, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, F = S.frontier, hero = S.entities[m.heroId], hall = frontier.founding.townHall;
const mk = (id, i, stock) => g.frontier.world.addTown({ id, name: id, owner: 'player', x: world.sites[i].x, z: world.sites[i].z, pop: 3, stock, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
mk('tA', 3, { food: 200, timber: 300, stone: 20, goods: 50, ryo: 100 });
mk('tB', 4, { food: 10, timber: 10, stone: 5, goods: 5, ryo: 100 });
mk('tC', 5, { food: 10, timber: 10, stone: 5, goods: 5, ryo: 100 });
g.step([]);
const sh = g.frontier.shipments;
const line = (id, from, to) => { F.rail.links[id] = { id, owner: 'player', from, to, done: true, length: 100, points: [[0, 0], [100, 0]], dist: [0, 100] }; };
line('r1', 'tA', 'tB'); line('r2', 'tB', 'tC');
const cmd = c => g.step([{ id: hero.id, type: 'frontier', action: 'ship', ...c }]);
const st = id => F.settlements[id].stock;
const run = (ticks, until) => { for (let i = 0; i < ticks; i++) { g.step([]); if (until?.()) return true; } return !until; };

assert.deepEqual(sh.route('player', 'tA', 'tC'), ['tA', 'tB', 'tC'], 'route over two lines');

// order 150 timber for tC, all reserved at tA; and 50 food for tC from tA
cmd({ mode: 'keep', town: 'tA', resource: 'timber', keep: 0 });
cmd({ mode: 'order', town: 'tC', resource: 'timber', amount: 150, pin: 'tA' });
cmd({ mode: 'order', town: 'tC', resource: 'food', amount: 50, pin: 'tA' });
const [o1, o2] = Object.values(F.shipping.orders);
assert.deepEqual(o1.sources, [{ from: 'tA', amount: 150 }], 'placing an order finds its source at once');
assert.deepEqual(o2.sources, [{ from: 'tA', amount: 50 }]);
const A0 = { ...st('tA') };

// first departure: one wagon-load each in turn (60 + 50), then spare room (120 - 110 = 10 more timber)
assert.ok(run(3000, () => Object.values(F.rail.trains).find(t => t.link === 'r1')?.freight?.length), 'train 1 loaded');
const t1 = Object.values(F.rail.trains).find(t => t.link === 'r1');
const by = r => (t1.freight.find(c => c.order === (r === 'timber' ? o1.id : o2.id)) || {}).amount;
assert.equal(by('food'), 50, 'food order got its load');
assert.equal(by('timber'), 70, 'timber: a wagon-load (60) then spare room (10)');
assert.ok(st('tA').timber <= A0.timber - 70 + 5, 'stock leaves the source when loaded');
assert.equal(sh.reservedOf(F.settlements.tA, 'timber'), 80, 'the rest stays reserved');

// everything arrives: transfer at tB onto line 2
assert.ok(run(20000, () => o1.state === 'done' && o2.state === 'done'), 'both orders delivered');
assert.equal(o1.got, 150); assert.equal(o2.got, 50);
assert.ok(st('tC').timber >= 150, 'it arrived in the stock (the towns also produce)');
assert.equal(sh.reservedOf(F.settlements.tA, 'timber'), 0, 'nothing left reserved');
assert.equal(sh.reservedOf(F.settlements.tA, 'food'), 0);
assert.equal(sh.inFlight(o1.id), 0);

// a closed line holds cargo
cmd({ mode: 'order', town: 'tC', resource: 'stone', amount: 10, pin: 'tA' });
const o3 = Object.values(F.shipping.orders).at(-1);
cmd({ mode: 'keep', town: 'tA', resource: 'stone', keep: 0 });
assert.equal(sh.accept(o3.id, 'tA', 10) + o3.sources.reduce((a, x) => a + x.amount, 0) >= 10, true);
assert.ok(run(6000, () => (F.shipping.yards.tB || []).some(c => c.order === o3.id)), 'stone reached the tB yard');
F.rail.links.r2.closed = true;
run(6000);
assert.equal(o3.got, 0, 'blocked at tB');
assert.equal(sh.inFlight(o3.id), 10, 'held in the tB yard, not lost');
delete F.rail.links.r2.closed;
assert.ok(run(20000, () => o3.state === 'done'), 'delivered once the line reopens');
// S6 robbery: the loss is shared equally by every order aboard; orders stay open and the shortfall is re-sent
cmd({ mode: 'keep', town: 'tA', resource: 'food', keep: 0 });
cmd({ mode: 'order', town: 'tC', resource: 'timber', amount: 40, pin: 'tA' });
cmd({ mode: 'order', town: 'tC', resource: 'food', amount: 10, pin: 'tA' });
const [rt, rf] = Object.values(F.shipping.orders).slice(-2);
assert.ok(run(6000, () => { const t = Object.values(F.rail.trains).find(t => t.link === 'r1'); return t?.freight?.length === 2; }), 'both aboard');
const tr = Object.values(F.rail.trains).find(t => t.link === 'r1');
const loot = sh.rob(tr, 0.5);   // 25 of 50 taken: 10 food (all it had) + 15 timber
assert.equal(loot.food, 10); assert.equal(loot.timber, 15);
assert.equal(rt.lost, 15); assert.equal(rf.lost, 10);
assert.match(S.clans.player.notice.text, /Train robbed/);
assert.equal(rf.state, 'open', 'order stays open');
sh.coverManual();
assert.ok(rf.sources.reduce((a, x) => a + x.amount, 0) >= 10, 'shortfall re-sent from the source');
assert.ok(run(30000, () => rt.state === 'done' && rf.state === 'done'), 'delivered in the end');
console.log('test_shipments_trains: ok');
