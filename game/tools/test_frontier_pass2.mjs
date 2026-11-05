// Economy pass 2 (Tim 2026-11-05): goods sinks, idle half tax, market, start workers, governor fixes.
// Run from the repo root: node game/tools/test_frontier_pass2.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontierWorld } from '../src/sim/frontier/world.js';
import { createEconomy } from '../src/sim/frontier/economy.js';
import { createConstruction } from '../src/sim/frontier/construction.js';
import { createGovernor } from '../src/sim/frontier/governor.js';
import { createFrontier } from '../src/sim/frontier/frontier.js';
import { storageCap } from '../src/sim/frontier/storage.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
assert.equal(data.workers.load, 2.5); assert.equal(data.zones.kinds.work.output.goods, 0.0625);
for (const i of [1, 2]) for (const r of ['timber', 'stone', 'goods']) assert.equal(data.tiers.list[i].upgrade.cost[r], Math.round(data.storage.caps[i - 1] * 0.75), 'upgrade = 75% of the base cap');
for (const b of ['storehouse', 'lumber_camp', 'quarry']) assert.equal(data.buildings[b].cost.goods, 40);
assert.equal(data.tiers.list[0].placed.market, 0); assert.equal(data.tiers.list[1].placed.market, 1);

function town(stock, pop = 8) {
  const fdata = structuredClone(data); fdata.settlements = {}; fdata.roads = {};
  const state = { tick: 0 }, fr = createFrontier({ state, data: fdata });
  fr.world.addTown({ id: 't', name: 'Test', owner: 'p', region: null, x: 1000, z: 1000, pop, stock, buildings: [{ type: 'town_hall', cell: 0 }] });
  const s = fr.world.settlement('t');
  const send = c => { fr.command({ owner: 'p' }, { type: 'frontier', town: 't', ...c }); return state.frontier.receipts.at(-1); };
  const econ = n => { for (let i = 0; i < n * fdata.cadenceTicks; i++) { state.tick++; fr.tick(); } };
  return { state, fr, s, send, econ, fdata };
}

// training costs goods too; without them nothing changes
{
  const { s, send } = town({ food: 100, timber: 100, stone: 100, goods: 4, ryo: 100 });
  const before = JSON.stringify(s.stock);
  assert.equal(send({ action: 'train', count: 1 }).reason, 'not enough goods'); assert.equal(JSON.stringify(s.stock), before);
}
{
  const { s, send, fr } = town({ food: 100, timber: 100, stone: 100, goods: 10, ryo: 100 });
  assert.equal(send({ action: 'train', count: 1 }).ok, true);
  assert.equal(s.stock.goods, 10 - data.workers.goodsCost); assert.equal(s.stock.ryo, 100 - data.workers.cost);
}

// market: sells goods above the keep level, never below it; keep is a command for players and bots
{
  const { s, send, econ, fr } = town({ food: 500, timber: 100, stone: 100, goods: 405, ryo: 0 });
  s.buildings.push({ type: 'market', stage: 'built', cell: 1 });
  econ(10);
  assert.ok(Math.abs(s.stock.goods - data.market.keep) < 1e-6 || s.stock.goods < data.market.keep, `goods ${s.stock.goods}`);
  assert.ok(s.stock.ryo >= 5 * data.market.price - 1e-6, 'ryo from sales');
  assert.ok(fr.world.frontier.ledger.some(l => l.reason === 'market' && l.resource === 'ryo'));
  assert.equal(send({ action: 'setMarketKeep', settlement: 't', keep: -1 }).ok, false);
  assert.equal(send({ action: 'setMarketKeep', settlement: 't', keep: 300 }).ok, true); assert.equal(s.marketKeep, 300);
  const g = s.stock.goods; econ(3); assert.ok(s.stock.goods < g, 'sells down toward the new keep');
}

// idle townsfolk pay half tax
{
  const state = { tick: 0 }, world = createFrontierWorld({ state, data }), eco = createEconomy({ state, data, world });
  const s = state.frontier.settlements.s_frontier_1;
  const step = n => { for (let i = 0; i < n; i++) { state.tick += data.cadenceTicks; state.frontier.econTick++; eco.run(); } };
  step(data.mood.reviewTicks);
  const e = state.frontier.ledger.filter(l => l.reason === 'tax').at(-1), idle = Math.min(s.pop, s.report.idle);
  assert.ok(idle > 0, 'fixture has idle people');
  assert.ok(Math.abs(e.delta - data.rates.tax[s.taxLevel] * (s.pop - idle / 2) * s.mood / 100) < 1e-9);
}

// governor: a full food store is never "food falling"
{
  const state = { tick: 0 }, world = createFrontierWorld({ state, data }), eco = createEconomy({ state, data, world });
  const con = createConstruction({ state, data, world }), gov = createGovernor({ state, data, world, economy: eco, construction: con });
  const s = state.frontier.settlements.s_frontier_1;
  const cap = storageCap(s, data, 'food');
  world.change(s.id, 'food', cap, 'test');   // clamps at the cap
  for (let i = 0; i < data.governor.reviewTicks * 6; i++) { state.tick += data.cadenceTicks; state.frontier.econTick++; eco.run(); con.run(); gov.run(); }
  assert.equal(s.gov.falling, 0); assert.ok(!s.suggestions.some(x => x.reason === 'Farm: food falling'));
}
console.log('test_frontier_pass2: ok');
