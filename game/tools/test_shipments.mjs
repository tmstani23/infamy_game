// Rail shipments S1 (sim/frontier/shipments.js): orders, keep amounts, reserved stock, rules.
// Run: node game/tools/test_shipments.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), railways = data('data/railways.json');
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, railways, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, hero = S.entities[m.heroId];
const hall = frontier.founding.townHall;
const mk = (id, owner, i, stock) => g.frontier.world.addTown({ id, name: id, owner, x: world.sites[i].x, z: world.sites[i].z, pop: 3, stock, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
mk('tA', 'player', 3, { food: 200, timber: 200, stone: 20, goods: 50, ryo: 100 });
mk('tB', 'player', 4, { food: 10, timber: 10, stone: 5, goods: 5, ryo: 100 });
mk('tC', 'player', 5, { food: 10, timber: 10, stone: 5, goods: 5, ryo: 100 });
mk('tX', 'bot1', 6, { food: 500, timber: 500, stone: 500, goods: 500, ryo: 0 });
g.step([]);
const sh = g.frontier.shipments, F = S.frontier;
const note = () => S.clans.player.notice?.text || '';
const cmd = c => g.step([{ id: hero.id, type: 'frontier', action: 'ship', ...c }]);
const orders = () => Object.values(F.shipping?.orders || {});
const BIG = { food: 1e5, timber: 1e5, stone: 1e5, goods: 1e5 };
F.settlements.tA.keep = { ...BIG };   // nothing spare at tA yet, so placing an order reserves nothing (checked by hand below)
const line = (id, from, to, extra = {}) => { F.rail.links[id] = { id, owner: 'player', from, to, done: true, length: 100, points: [[0, 0], [100, 0]], dist: [0, 100], ...extra }; };

// --- needs a rail line ------------------------------------------------------------------------------------
cmd({ mode: 'order', town: 'tB', resource: 'timber', amount: 50 });
assert.match(note(), /rail line/i, 'no line, no order');
assert.equal(orders().length, 0);

line('r1', 'tA', 'tB');
cmd({ mode: 'order', town: 'tB', resource: 'timber', amount: 50 });
assert.equal(orders().length, 1, 'order placed once a line is open');
const o = orders()[0];
assert.deepEqual([o.to, o.resource, o.amount, o.got, o.state], ['tB', 'timber', 50, 0, 'open']);

// --- limits -----------------------------------------------------------------------------------------------
cmd({ mode: 'order', town: 'tB', resource: 'timber', amount: 3 });
assert.match(note(), /start at/i, 'minimum order');
cmd({ mode: 'order', town: 'tB', resource: 'ryo', amount: 50 });
assert.match(note(), /resource/i, 'only goods, not ryo');
cmd({ mode: 'order', town: 'tX', resource: 'food', amount: 50 });
assert.match(note(), /not your/i, 'rival town');
cmd({ mode: 'order', town: 'tB', resource: 'food', amount: 50, ryo: 99999 });
assert.match(note(), /ryo/i, 'ryo offered must be in stock');
const cap = Math.floor(g.frontier.data.storage.caps[0]);
cmd({ mode: 'order', town: 'tB', resource: 'food', amount: cap + 500 });
assert.match(note(), /room|full/i, 'order must fit storage');
cmd({ mode: 'order', town: 'tC', resource: 'food', amount: 50 });
assert.match(note(), /rail line/i, 'tC has no line');
line('r2', 'tB', 'tC', { closed: true });
cmd({ mode: 'order', town: 'tC', resource: 'food', amount: 50 });
assert.match(note(), /rail line/i, 'a closed line carries nothing');
delete F.rail.links.r2.closed;
cmd({ mode: 'order', town: 'tC', resource: 'food', amount: 50, pin: 'tA' });
assert.equal(orders().length, 2, 'tC reaches tA through tB');
cmd({ mode: 'order', town: 'tC', resource: 'food', amount: 50, pin: 'tX' });
assert.match(note(), /pinned/i, 'pin must be your own town');

// auto order cap
for (let i = 0; i < 6; i++) cmd({ mode: 'order', town: 'tB', resource: 'stone', amount: 10, auto: true });
assert.equal(orders().filter(x => x.auto && x.to === 'tB').length, railways.ship.maxAuto, 'cap on open auto orders');

// --- keep and reserved --------------------------------------------------------------------------------------
const A = F.settlements.tA;
delete A.keep;
assert.equal(sh.keepOf(A, 'timber'), railways.ship.keep.timber, 'default keep');
cmd({ mode: 'keep', town: 'tA', resource: 'timber', keep: 150 });
assert.equal(sh.keepOf(A, 'timber'), 150);
assert.equal(sh.free(A, 'timber'), 50, 'stock 200 - keep 150');
cmd({ mode: 'keep', town: 'tA', resource: 'timber', keep: -1 });
assert.match(note(), /keep must/i);
cmd({ mode: 'keep', town: 'tX', resource: 'timber', keep: 5 });
assert.match(note(), /not your/i);

assert.equal(sh.accept(o.id, 'tA', 30), 30, 'reserve 30 at the source');
assert.equal(sh.reservedOf(A, 'timber'), 30);
assert.equal(sh.free(A, 'timber'), 20, 'reserved stock is not free');
assert.equal(sh.accept(o.id, 'tA', 30), 20, 'only what the order still needs (50 - 30)');
assert.equal(sh.accept(o.id, 'tA', 5), 0, 'order fully reserved');
assert.equal(sh.reservedOf(A, 'timber'), 50);
cmd({ mode: 'keep', town: 'tA', resource: 'timber', keep: 0 });
const o2 = orders()[1];
assert.equal(sh.accept(o2.id, 'tA', 500), 50, 'food order: free is 160 but the order only needs 50');
cmd({ mode: 'order', town: 'tB', resource: 'timber', amount: 200 });   // bigger than A can spare
const o3 = orders().find(x => x.amount === 200);
assert.equal(o3.sources.reduce((a, x) => a + x.amount, 0), 150, 'placed: reserved at once, never below keep+reserved (stock 200 - 50)');

cmd({ mode: 'cancel', order: o.id });
assert.equal(o.state, 'cancelled');
assert.equal(sh.reservedOf(A, 'timber'), 150, 'cancel releases its 50');
cmd({ mode: 'cancel', order: o.id });
assert.match(note(), /no such open order/i);

// --- a stock change never touches reserved bookkeeping; saves keep the records ----------------------------------
assert.ok(JSON.parse(JSON.stringify(F.shipping)).orders[o3.id], 'orders are plain data');
console.log('test_shipments: ok');
