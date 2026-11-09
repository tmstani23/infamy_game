// Rail shipments S4: town card Shipments tab (src/shipments_tab.js) drives the real sim through its buttons.
// Run: node game/tools/test_shipments_tab.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { createShipmentsTab } from '../src/shipments_tab.js';
import { resourceUsage } from '../src/sim/frontier/resource_usage.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), railways = data('data/railways.json');
railways.ship.keepShare = 0;   // these tests use the fixed keep defaults (keepShare is tested in test_shipments)
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, railways, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, F = S.frontier, hero = S.entities[m.heroId], hall = frontier.founding.townHall;
const mk = (id, i, stock) => g.frontier.world.addTown({ id, name: id, owner: 'player', x: world.sites[i].x, z: world.sites[i].z, pop: 3, stock, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
mk('tA', 3, { food: 300, timber: 300, stone: 100, goods: 100, ryo: 0 });
mk('tB', 4, { food: 0, timber: 0, stone: 0, goods: 0, ryo: 500 });
g.step([]);
const B = F.settlements.tB;
const tab = createShipmentsTab({ game: g, data: g.frontier.data, cmd: c => g.step([{ id: hero.id, type: 'frontier', ...c }]), usage: resourceUsage });
const press = id => assert.ok(tab.click({ act: 'ship', id }, B), `button ${id}`);
const open = () => Object.values(F.shipping?.orders || {}).filter(o => o.state === 'open');

let h = tab.html(B);
assert.match(h, /Needs a rail line/, 'greyed without a line');
assert.match(h, /Auto orders <b>off<\/b>/, 'says auto orders are off');
F.rail.links.r1 = { id: 'r1', owner: 'player', from: 'tA', to: 'tB', done: true, length: 100, points: [[0, 0], [100, 0]], dist: [0, 100] };
h = tab.html(B);
assert.match(h, /Order 50/); assert.match(h, /Order 100/);
assert.ok(!/overflow|scroll/.test(h), 'no scrolling');

// Simple: one click
press('quick:timber:50');
assert.equal(open().length, 1, 'one click placed an order');
assert.equal(open()[0].sources[0].from, 'tA', 'from the town with spare');
assert.match(tab.html(B), /On the way/);

// Advanced: New order with a pin and urgent
press('mode:advanced');
assert.match(tab.html(B), /Place order/);
assert.match(tab.html(B), /Cost ⓘ.*~\d+ ryo/); assert.match(tab.html(B), /data-act="shipinput" data-id="amt"/); assert.ok(tab.input({ id: "amt" }, "230")); assert.match(tab.html(B), /value="230"/); tab.input({ id: "amt" }, "100"); assert.match(tab.html(B), /Order cap ⓘ/);
press('res:stone'); press('amt:-10'); press('pin'); press('urgent');
assert.match(tab.html(B), /tA ▸/, 'source pin cycles to tA');
press('place');
const o = open().find(x => x.resource === 'stone');
assert.ok(o && o.pin === 'tA' && o.urgent && o.amount === 90, 'advanced order placed');
assert.match(tab.html(B), /Open 2/);

// Keep tab
press('sub:keep');
const k0 = B.keep?.food ?? railways.ship.keep.food;
press('keep:food:10');
assert.equal(B.keep.food, k0 + 10, 'keep +');
press('autobuy'); assert.equal(B.autoBuy, false, 'auto-buy off');
press('bud:50'); assert.equal(B.shipBudget, railways.ship.budget + 50, 'budget +');
assert.match(tab.html(B), /data-id="keep:food"/); assert.ok(tab.input({ id: 'keep:food' }, '2500', B)); assert.equal(B.keep.food, 2500, 'typed keep'); assert.ok(tab.input({ id: 'keep:goods' }, '2000', B)); assert.equal(B.marketKeep, 2000, 'typed goods keep'); assert.ok(tab.input({ id: 'bud' }, '900', B)); assert.equal(B.shipBudget, 900, 'typed budget');

// Open tab: cancel
press('sub:open');
assert.match(tab.html(B), /Cancel order/);
press('cancel:' + o.id);
assert.equal(o.state, 'cancelled');

// governor on auto: the line says so
B.autoBuild = true;
assert.match(tab.html(B), /Auto orders <b>on<\/b>/);
// Sell tab: needs a line to the capital
press('mode:advanced'); press('sub:sell');
assert.match(tab.html(B), /Needs a rail line to the capital/);
F.rail.links.rc = { id: 'rc', owner: 'player', from: 'capital', to: 'tA', done: true, length: 100, points: [[0, 0], [100, 0]], dist: [0, 100] };
const A = F.settlements.tA, g0 = A.stock.goods;
const TA = createShipmentsTab({ game: g, data: g.frontier.data, cmd: c => g.step([{ id: hero.id, type: 'frontier', ...c }]), usage: resourceUsage });
const pa = id => assert.ok(TA.click({ act: 'ship', id }, A));
pa('mode:advanced'); pa('sub:sell'); pa('sres:goods'); pa('samt:-50');
assert.match(TA.html(A), /Sell 50 goods/);
pa('sellgo');
const sale = Object.values(F.shipping.orders).find(o => o.kind === 'sell' && !o.auto);
assert.ok(sale && sale.amount === 50 && sale.sellFrom === 'tA', 'sale placed');
assert.equal(A.reserved.goods, 50, 'reserved until the train loads it');
const r0 = A.stock.ryo;
for (let i = 0; i < 6000 && sale.state === 'open'; i++) g.step([]);
assert.equal(sale.state, 'done'); assert.ok(A.stock.ryo >= r0 + 50 * railways.ship.sellPrice.goods, 'paid on arrival');
// the Rail ledger from the tab, and Back
press('ledger');
assert.match(tab.html(B), /Back to Shipments/); assert.match(tab.html(B), /data-id="lg~tab:done"/);
press('lg~tab:done'); press('lg~close');
assert.match(tab.html(B), /Rail ledger ▸/, 'back on the Shipments tab');
console.log('test_shipments_tab: ok');
