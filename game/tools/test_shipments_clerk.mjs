// Rail shipments S3: the rail clerk (runs from the governor review, only with the governor on auto).
// Run: node game/tools/test_shipments_clerk.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), railways = data('data/railways.json');
railways.ship.keepShare = 0;   // these tests use the fixed keep defaults (keepShare is tested in test_shipments)
railways.train.stopSeconds = 5;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, railways, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, F = S.frontier, hero = S.entities[m.heroId], hall = frontier.founding.townHall;
const mk = (id, i, stock) => g.frontier.world.addTown({ id, name: id, owner: 'player', x: world.sites[i].x, z: world.sites[i].z, pop: 3, stock, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
mk('tA', 3, { food: 300, timber: 300, stone: 0, goods: 0, ryo: 0 });
mk('tB', 4, { food: 0, timber: 0, stone: 0, goods: 0, ryo: 1000 });
g.step([]);
const sh = g.frontier.shipments, A = F.settlements.tA, B = F.settlements.tB;
A.autoBuild = false; B.autoBuild = false;
const line = (id, from, to) => { F.rail.links[id] = { id, owner: 'player', from, to, done: true, length: 100, points: [[0, 0], [100, 0]], dist: [0, 100] }; };
line('r1', 'tA', 'tB'); line('rc', 'capital', 'tB');
const cmd = c => g.step([{ id: hero.id, type: 'frontier', action: 'ship', ...c }]);
const open = () => Object.values(F.shipping.orders).filter(o => o.state === 'open');
const run = (ticks, until) => { for (let i = 0; i < ticks; i++) { g.step([]); if (until?.()) return true; } return !until; };

// governor not on auto: the clerk does nothing
run(3000);
assert.equal(open().filter(o => o.auto).length, 0, 'no auto orders while the governor is off auto');

// the clerk: orders what tB lacks against keep, from tA's surplus first, the port after
const K = railways.ship.keep, ryoB = B.stock.ryo;
sh.clerk(B);
const want = r => open().find(o => o.to === 'tB' && o.resource === r);
for (const r of ['food', 'timber', 'stone']) assert.ok(want(r), `auto order for ${r}`);
assert.ok(!want('goods'), 'no own town has goods: goods refills are never bought at the capital (Tim 2026-11-22)');
assert.equal(want('food').amount, K.food, 'orders up to the keep amount');
assert.deepEqual(want('food').sources.map(x => x.from), ['tA'], 'food from the surplus town');
assert.deepEqual(want('stone').sources.map(x => x.from), ['capital'], 'no surplus stone anywhere: bought at the port');
const price = railways.ship.buyPrice;
assert.equal(B.stock.ryo, ryoB - want('stone').ryoPaid - (want('timber').ryoPaid || 0), 'paid for at once');
assert.equal(want('stone').ryoPaid, K.stone * price.stone);
assert.ok(want('stone').ryoPaid <= railways.ship.budget, 'within the auto-buy budget');

// a second review adds nothing new (the need is covered)
const n = Object.keys(F.shipping.orders).length;
sh.clerk(B);
assert.equal(Object.keys(F.shipping.orders).length, n, 'no duplicate orders');

// everything arrives by train
assert.ok(run(20000, () => !open().some(o => o.to === 'tB')), 'all delivered');

// fix list 13 (Tim 2026-11-22): no refill until the stock falls below half the keep, then one order back up to the keep
B.stock.food = K.food * 0.6;
sh.clerk(B);
assert.ok(!want('food'), 'above half the keep: no refill');
B.stock.food = K.food * 0.4;
sh.clerk(B);
assert.equal(want('food')?.amount, K.food * 0.6, 'below half the keep: back up to the keep in one order');
assert.ok(run(20000, () => !open().some(o => o.to === 'tB')), 'refill delivered');

// manual order with a port budget, refund on cancel
cmd({ mode: 'budget', town: 'tB', ryo: 0 });
assert.equal(B.shipBudget, 0);
const r0 = B.stock.ryo;
cmd({ mode: 'order', town: 'tB', resource: 'stone', amount: 20, ryo: 100 });
const o = open().find(x => !x.auto);
assert.equal(o.sources[0]?.from, 'capital', 'manual order uses its own ryo, at once (governor off)');
assert.ok(Math.abs(B.stock.ryo - (r0 - 20 * price.stone)) < 2, 'paid');
const r1 = B.stock.ryo + 20 * price.stone;
sh.release(o); o.state = 'cancelled';
assert.equal(B.stock.ryo, r1, 'cancel refunds what was not loaded');

// spare goods go to the capital for ryo
A.stock.goods = Math.ceil(g.frontier.data.storage.caps[(A.tier || 1) - 1] * 0.9);
cmd({ mode: 'keep', town: 'tA', resource: 'goods', keep: 0 });
A.marketKeep = A.stock.goods;   // the market's hold-back covers it all: nothing to sell
sh.clerk(A);
assert.ok(!open().some(x => x.kind === 'sell'), 'rail sale respects the market hold-back');
A.marketKeep = 0;
sh.clerk(A);
const sale = open().find(x => x.kind === 'sell');
assert.ok(sale && sale.sellFrom === 'tA', 'a sale order from tA');
const ryoA = A.stock.ryo;
assert.ok(run(20000, () => sale.state === 'done'), 'sale delivered to the capital');
assert.ok(A.stock.ryo > ryoA, 'tA was paid');

// Tim 2026-11-17: timber and stone are sold only when the store is full (ship.overflow), down to ship.overflow.downTo
// of storage; not below that, never during a war on the town or while it fills a war camp's order; food never
{ const cap = g.frontier.data.storage.caps[(A.tier || 1) - 1], OV = railways.ship.overflow, sells = r => open().filter(x => x.kind === 'sell' && x.sellFrom === 'tA' && x.resource === r);
  for (const x of open()) { sh.release(x); x.state = 'cancelled'; }
  A.stock.timber = cap - 50; A.stock.food = cap; A.reserved = {};
  sh.clerk(A);
  assert.equal(sells('timber').length, 0, 'not full: no sale');
  assert.equal(sells('food').length, 0, 'food is never sold on its own');
  A.stock.timber = cap;
  F.wars ||= { list: {}, cooldown: {}, history: [] }; F.wars.list.wq = { id: 'wq', town: 'tA', attacker: 'x', defender: 'player', state: 'active' };
  sh.clerk(A);
  assert.equal(sells('timber').length, 0, 'not while a war is on the town');
  delete F.wars.list.wq;
  sh.clerk(A);
  const ov = sells('timber')[0];
  assert.ok(ov && ov.overflow, 'full: the top slice is sold');
  assert.equal(ov.amount, Math.floor(cap - cap * OV.downTo), 'down to ' + OV.downTo + ' of storage');
  sh.clerk(A); assert.equal(sells('timber').length, 1, 'one sale open at a time');
  for (const x of open()) { sh.release(x); x.state = 'cancelled'; }
  A.stock.food = 300; A.stock.timber = 300; }

// with the governor on auto the review runs the clerk
B.autoBuild = true;
B.stock.food = 0;
assert.ok(run(4000, () => open().some(x => x.auto && x.to === 'tB' && x.resource === 'food')), 'governor review on auto runs the clerk');
console.log('test_shipments_clerk: ok');
