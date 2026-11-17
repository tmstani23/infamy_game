// Rail shipments S2: trains carry consignments, wagon-loads in turn, transfer between lines.
// Run: node game/tools/test_shipments_trains.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), railways = data('data/railways.json');
railways.ship.keepShare = 0;   // these tests use the fixed keep defaults (keepShare is tested in test_shipments)
railways.ship.wagonLoad = 60;
railways.train.stopSeconds = 5;
railways.train.consist = ['carriage', 'goods', 'goods', 'guard'];   // two goods wagons: 120 a trip
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, railways, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
// 8e-1 / 8e-2: ryo by train (shipments.js kind 'ryo'), treasury keep line and daily cap for auto orders.
const S = g.state, F = S.frontier, hero = S.entities[m.heroId], hall = frontier.founding.townHall;
const mk = (id, i, stock, owner = 'player') => g.frontier.world.addTown({ id, name: id, owner, x: world.sites[i].x, z: world.sites[i].z, pop: 3, stock, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
mk('tA', 3, { food: 200, timber: 300, stone: 20, goods: 50, ryo: 500 });
mk('tB', 4, { food: 10, timber: 10, stone: 5, goods: 5, ryo: 100 });
mk('tC', 5, { food: 10, timber: 10, stone: 5, goods: 5, ryo: 100 });
g.step([]);
const sh = g.frontier.shipments, clan = S.clans.player;
const line = (id, from, to) => { F.rail.links[id] = { id, owner: 'player', from, to, done: true, length: 100, points: [[0, 0], [100, 0]], dist: [0, 100] }; };
const cmd = c => g.step([{ id: hero.id, type: 'frontier', action: 'ship', ...c }]);
const note = () => clan.notice?.text || '';
const run = (ticks, until) => { for (let i = 0; i < ticks; i++) { g.step([]); if (until?.()) return true; } return !until; };
const orders = () => Object.values(F.shipping?.orders || {}).filter(o => o.kind === 'ryo');
const last = () => orders().at(-1);
const coffers = id => F.settlements[id].stock.ryo;

// no line from the capital
clan.ryo = 5000; g.frontier.world.syncCapital();
cmd({ mode: 'ryo', from: 'treasury', to: 'tB', into: 'coffers', amount: 300 });
assert.match(note(), /rail line/i, 'needs a line from the capital');
line('r0', 'capital', 'tA'); line('r1', 'tA', 'tB');
cmd({ mode: 'ryo', from: 'treasury', to: 'tB', into: 'coffers', amount: 5 });
assert.match(note(), /at least/i, 'minimum');
cmd({ mode: 'ryo', from: 'treasury', to: 'tB', into: 'coffers', amount: 99999 });
assert.match(note(), /only/i, 'not more than the treasury');
cmd({ mode: 'ryo', from: 'treasury', to: 'tB', into: 'coffers', amount: 300, auto: true });
assert.match(note(), /war chests only/i, 'auto orders never go to coffers');

// treasury -> tB coffers, paid at once, rides through tA
const before = clan.ryo, b0 = coffers('tB');
cmd({ mode: 'ryo', from: 'treasury', to: 'tB', into: 'coffers', amount: 300 });
const o1 = last();
assert.equal(o1.state, 'open');
assert.equal(Math.round(before - clan.ryo), 300, 'treasury pays when the order is placed');
assert.deepEqual(sh.ryoOnTheWay('player', { to: 'tB' }), { treasury: 300 });
assert.ok(run(30000, () => o1.state === 'done'), 'ryo order delivered');
assert.ok(coffers('tB') >= b0 + 300 - 1, 'it arrived in tB coffers');
assert.deepEqual(sh.ryoOnTheWay('player', { to: 'tB' }), {});

// ryo takes no wagon room, and at most ryoPerTrain per train
const cap = g.frontier.data.railways.ship.ryoPerTrain;
assert.ok(cap > 0, 'ryoPerTrain in data');
cmd({ mode: 'ryo', from: 'treasury', to: 'tA', into: 'coffers', amount: cap + 500 });
const big = last();
assert.ok(run(20000, () => Object.values(F.rail.trains).some(t => (t.freight || []).some(c => c.order === big.id))), 'big order loaded');
const tr = Object.values(F.rail.trains).find(t => (t.freight || []).some(c => c.order === big.id));
assert.equal(tr.freight.find(c => c.order === big.id).amount, cap, 'one train carries ryoPerTrain');
assert.ok(run(40000, () => big.state === 'done'), 'the rest comes on the next train');

// cancel before loading refunds; town coffers as a source
const a0 = coffers('tA');
cmd({ mode: 'ryo', from: 'tA', to: 'tB', into: 'coffers', amount: 9999 });
assert.match(note(), /only/i, 'not more than the town has');
cmd({ mode: 'ryo', from: 'tA', to: 'tB', into: 'coffers', amount: 200 });
const o3 = last();
assert.equal(Math.round(a0 - coffers('tA')), 200, 'coffers pay at once');
cmd({ mode: 'cancel', order: o3.id });
assert.equal(o3.state, 'cancelled');
assert.equal(Math.round(coffers('tA')), Math.round(a0), 'cancel refunds what was not loaded');

// a defending town's war chest (fake war record on the list), and the war ending first
const W = F.wars.list;
W.wX = { id: 'wX', attacker: 'bot1', defender: 'player', town: 'tB', x: 0, z: 0, defense: { chest: 0, put: 0 }, fake: true };
const ryo0 = clan.ryo;
cmd({ mode: 'ryo', from: 'treasury', into: 'chest', war: 'wX', amount: 400 });
const o4 = last();
assert.equal(o4.to, 'tB', 'a defending chest order goes to the town');
const d0 = W.wX.defense.chest;
// keep the fake war away from the war module: deliver by hand through arrive()
const fakeTrain = { id: 'ft', owner: 'player', freight: [{ order: o4.id, resource: 'ryo', amount: 400 }] };
o4.sources = [];
sh.arrive(fakeTrain, { from: 'tA', to: 'tB' }, 'tB');
assert.equal(W.wX.defense.chest - d0, 400, 'arrives in the defending war chest');
assert.equal(W.wX.defense.sources.treasury, 400, 'sources listed');
assert.equal(o4.state, 'done');
cmd({ mode: 'ryo', from: 'treasury', into: 'chest', war: 'wX', amount: 100 });
const o5 = last(); o5.sources = [];
delete W.wX;   // the war ended before it arrived
const cb = coffers('tB');
sh.arrive({ id: 'ft2', owner: 'player', freight: [{ order: o5.id, resource: 'ryo', amount: 100 }] }, { from: 'tA', to: 'tB' }, 'tB');
assert.equal(Math.round(coffers('tB') - cb), 100, 'war over first: into that town coffers');
// a camp chest with no linked station
W.wY = { id: 'wY', attacker: 'player', defender: 'bot1', town: 'tB', x: 0, z: 0, camp: { chest: 0, stock: {} } };
cmd({ mode: 'ryo', from: 'treasury', into: 'chest', war: 'wY', amount: 100 });
assert.match(note(), /camp station/i, 'camp needs a linked station');
// camp ryo after the war ended goes back to the treasury
W.wY.camp.station = { node: 'tC', linked: true }; line('r2', 'tB', 'tC');
cmd({ mode: 'ryo', from: 'treasury', into: 'chest', war: 'wY', amount: 100 });
const o6 = last(); assert.equal(o6.to, 'tC'); o6.sources = [];
delete W.wY;
const tr0 = clan.ryo;
sh.arrive({ id: 'ft3', owner: 'player', freight: [{ order: o6.id, resource: 'ryo', amount: 100 }] }, { from: 'tB', to: 'tC' }, 'tC');
assert.equal(Math.round(clan.ryo - tr0), 100, 'camp ryo after the war goes back to the treasury');

// 8e-2: auto orders: keep line and daily share
W.wZ = { id: 'wZ', attacker: 'bot1', defender: 'player', town: 'tB', x: 0, z: 0, defense: { chest: 0, put: 0 } };
clan.ryo = 3000; g.frontier.world.syncCapital(); delete clan.autoRyo;
cmd({ mode: 'treasuryKeep', ryo: 1000 });
assert.equal(clan.treasuryKeep, 1000);
assert.equal(sh.autoRoom(clan), Math.floor(2000 * g.frontier.data.war.supply.autoShare), 'room = share of what is above the keep line');
const room = sh.autoRoom(clan);
cmd({ mode: 'ryo', from: 'treasury', into: 'chest', war: 'wZ', amount: room + 10, auto: true });
assert.match(note(), /keep line/i, 'auto order above today\'s share refused');
cmd({ mode: 'ryo', from: 'treasury', into: 'chest', war: 'wZ', amount: room, auto: true });
assert.equal(last().amount, room, 'auto order within the share');
assert.equal(sh.autoRoom(clan), 0, 'share used up for today');
cmd({ mode: 'ryo', from: 'treasury', into: 'chest', war: 'wZ', amount: 600, auto: false });
assert.equal(last().amount, 600, 'manual orders ignore the keep line and share');
clan.ryo = 900; g.frontier.world.syncCapital(); delete clan.autoRyo;
assert.equal(sh.autoRoom(clan), 0, 'never below the keep line');
for (const o of orders()) if (o.war === 'wZ') { o.state = 'cancelled'; o.sources = []; }
// autoChest: a low defending chest gets one refill order within today's share
clan.ryo = 5000; g.frontier.world.syncCapital(); delete clan.autoRyo;
W.wZ.defense.chest = 100;
const n1 = sh.autoChest('player', W.wZ);
assert.equal(n1, 500, 'refill ordered (min of refill and a quarter of 4000)');
assert.equal(sh.autoChest('player', W.wZ), 0, 'one open auto order at a time');
for (const o of orders()) if (o.war === 'wZ') { sh.release(o); o.state = 'cancelled'; }
W.wZ.defense.chest = 900;
assert.equal(sh.autoChest('player', W.wZ), 0, 'chest not low: no order');
delete W.wZ;

// robbed ryo is lost, the order shrinks
clan.ryo = 3000; g.frontier.world.syncCapital();
cmd({ mode: 'ryo', from: 'treasury', to: 'tB', into: 'coffers', amount: 200 });
const o7 = last();
const rt = { id: 'rt', owner: 'player', freight: [{ order: o7.id, resource: 'ryo', amount: 200 }] }; o7.sources = [];
sh.rob(rt, 0.5);
assert.equal(o7.amount, 100, 'robbed ryo is lost, not re-sent');
assert.equal(o7.lost, 100);
console.log('ryo freight ok');
