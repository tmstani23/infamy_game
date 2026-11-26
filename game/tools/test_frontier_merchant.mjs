// Frontier merchant (Tim 2026-11-26): a stall keeper by each player town hall; sells plain gear and bandages at blacksmith
// prices, buys bag items at half the shop price (never under the blacksmith's), no War Lanterns, never heirlooms.
import assert from 'node:assert/strict';
import { createInventory } from '../src/sim/inventory.js';
import { createItemServices } from '../src/sim/item_services.js';
import { FRONTIER_MERCHANT as FM, merchantPays, merchantSpot, ITEMS } from '../src/sim/gear_catalog.js';

const state = { tick: 0, entities: {}, clans: { player: { id: 'player', kind: 'yakuza', ryo: 1000 }, rival: { id: 'rival', kind: 'yakuza', ryo: 1000, bot: true } }, businesses: {}, ryoGains: [], news: [], banditCamps: [],
  frontier: { settlements: { t1: { id: 't1', owner: 'player', founded: 1, x: 100, z: 100 }, t2: { id: 't2', owner: 'rival', founded: 1, x: 400, z: 400 } } } };
let seq = 0; const removed = [];
const spawn = (type, model, x, z, extra) => { const id = `m${++seq}`; state.entities[id] = { id, type, model, x, z, ...extra }; return id; };
const removeUnit = id => { removed.push(id); delete state.entities[id]; };
const inv = createInventory({ state, baseHp: () => 400 });
const h = { id: 'h', owner: 'player', type: 'hero', place: 'world', x: 0, z: 0, hp: 400, maxHp: 400 };
state.entities.h = h; inv.initialize(h);
const svc = createItemServices({ state, raidRules: { lanternPrice: 400, lanternCarry: 1 }, spawn, removeUnit, cellSize: 11 });
svc.merchants();
const m = state.entities[state.frontier.settlements.t1.merchantNpc];
assert.ok(m?.merchantOf === 't1' && m.shopkeeper && m.guide, 'a stall keeper at the player town');
assert.equal(state.frontier.settlements.t2.merchantNpc, undefined, 'none for bot towns');
assert.deepEqual([m.x, m.z], merchantSpot(state.frontier.settlements.t1));
assert.equal(svc.shop(), undefined, 'the city blacksmith lookup never finds a merchant');
// prices
assert.equal(merchantPays('honed_weapon'), 75); assert.equal(merchantPays('focus_charm'), 100);
assert.equal(merchantPays('honed_weapon_green'), 75, 'Fine: half its plain item price');
assert.equal(merchantPays('bear_hide_coat'), ITEMS.bear_hide_coat.sell, 'frontier gear: never less than the blacksmith');
assert.equal(merchantPays('heirloom_yakuza'), 0);
// away from the stall: nothing
svc.command(h, { action: 'buy', item: 'honed_weapon' }); assert.equal(state.clans.player.ryo, 1000);
// at the stall
Object.assign(h, { x: m.x + 1, z: m.z });
assert.ok(svc.merchantNear(h));
svc.command(h, { action: 'buy', item: 'honed_weapon' }); assert.equal(state.clans.player.ryo, 850); const v = state.clans.player.inventory;
assert.equal(v.bag[0], 'honed_weapon');
svc.command(h, { action: 'buy', item: 'war_lantern' }); assert.equal(state.clans.player.lanterns, undefined, 'no War Lanterns out here');
svc.command(h, { action: 'buy', item: 'bandage' }); assert.equal(v.bandages, 1); assert.equal(state.clans.player.ryo, 825);
svc.command(h, { action: 'sell', index: 0 }); assert.equal(state.clans.player.ryo, 900, 'sold for half the buy price'); assert.equal(v.bag[0], null);
v.bag[0] = 'heirloom_yakuza'; svc.command(h, { action: 'sell', index: 0 }); assert.equal(v.bag[0], 'heirloom_yakuza', 'heirlooms never sold');
// a rival's merchant does not serve you; a ruined town loses its stall
state.frontier.settlements.t1.owner = 'rival'; assert.equal(svc.merchantNear(h), null); state.frontier.settlements.t1.owner = 'player';
state.frontier.settlements.t1.ruined = true; state.tick = 20; svc.merchants();
assert.equal(state.entities[m.id], undefined); assert.equal(state.frontier.settlements.t1.merchantNpc, undefined);
// never on a building: the spot moves to the nearest free cell (Tim 2026-11-26)
{ const n = 11, c = 5, use = Array(n * n).fill('.'), s = { x: 0, z: 0, grid: { n, cell: 11, use: '', zone: '.'.repeat(n * n), ground: 'c'.repeat(n * n) }, projects: [] };
  s.grid.use = use.join(''); const [x0, z0] = merchantSpot(s); assert.deepEqual([x0, z0], [22, 11], 'the free cell nearest the spot');
  use[(c + 1) * n + c + 2] = 'B'; s.grid.use = use.join(''); const p1 = merchantSpot(s); assert.notDeepEqual(p1, [22, 11], 'moves off a building');
  const i1 = (c + p1[1] / 11) * n + c + p1[0] / 11; assert.equal(s.grid.use[i1], '.');
  s.projects.push({ cell: i1 }); assert.notDeepEqual(merchantSpot(s), p1, 'and off a building site'); }
console.log('Frontier merchant: stall per player town, stock, half-price buying, no lanterns, heirlooms kept, own towns only, ruined town passed');
