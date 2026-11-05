// Economy balance B2: storage caps. Run from the repo root: node game/tools/test_frontier_storage.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontierWorld } from '../src/sim/frontier/world.js';
import { createEconomy } from '../src/sim/frontier/economy.js';
import { createAlerts } from '../src/sim/frontier/alerts.js';
import { storageCap, isFull } from '../src/sim/frontier/storage.js';
import { createFrontier } from '../src/sim/frontier/frontier.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const SID = 's_frontier_1', CAP = data.storage.caps[0];

// cap by tier, storehouses add, ryo and the capital are uncapped
{
  const state = { tick: 0 }, world = createFrontierWorld({ state, data }), s = state.frontier.settlements[SID];
  assert.equal(storageCap(s, data, 'timber'), CAP);
  assert.equal(storageCap({ ...s, tier: 2 }, data, 'timber'), data.storage.caps[1]);
  assert.equal(storageCap({ ...s, tier: 9 }, data, 'timber'), data.storage.caps.at(-1));
  s.buildings.push({ id: 'sh', type: 'storehouse', stage: 'built', cell: null, workers: 0 });
  assert.equal(storageCap(s, data, 'timber'), CAP + data.storage.perStorehouse);
  assert.equal(storageCap(s, data, 'ryo'), Infinity);
  assert.equal(storageCap(state.frontier.settlements.capital, data, 'timber'), Infinity);
  // gains stop at the cap, overflow is counted, totals stay conserved
  world.change(SID, 'timber', 1e6, 'test');
  assert.equal(s.stock.timber, storageCap(s, data, 'timber'));
  assert.ok(s.overflow.timber > 0);
  world.checkInvariants();
  // stock above the cap (old saves) stays, it just cannot grow; spending still works
  s.buildings = s.buildings.filter(b => b.id !== 'sh');
  world.change(SID, 'timber', 10, 'test');
  assert.equal(s.stock.timber, CAP + data.storage.perStorehouse);
  world.change(SID, 'timber', -10, 'spend');
  assert.equal(s.stock.timber, CAP + data.storage.perStorehouse - 10);
  world.checkInvariants();
}

// a full food store still counts as surplus for growth; a full alert fires once
{
  const state = { tick: 0, news: [] }, world = createFrontierWorld({ state, data }), eco = createEconomy({ state, data, world });
  const alerts = createAlerts({ state, data }), s = state.frontier.settlements[SID];
  s.owner = 'player';
  world.change(SID, 'food', CAP, 'test'); world.change(SID, 'stone', CAP, 'test');
  const pop0 = s.pop;
  for (let i = 0; i < data.rates.growthTicks * 3; i++) { state.tick += data.cadenceTicks; state.frontier.econTick++; eco.run(); alerts.econTick(); world.checkInvariants(); }
  assert.ok(isFull(s, data, 'stone'));
  assert.equal(s.storageCaps.stone, CAP); assert.equal(s.storageCaps.ryo, null);
  if (s.housing > pop0) assert.ok(s.pop > pop0, 'growth continues with a full food store');
  assert.equal(state.news.filter(n => n.event === 'full_stone').length, 1, 'one full-store alert');
}

// workers: nobody walks out to a full resource; the governor moves its own workers to one with room
{
  const fdata = structuredClone(data); fdata.settlements = {}; fdata.roads = {}; fdata.rates.food = 0; fdata.rates.growthTicks = 1e9; fdata.mood.reviewTicks = 1e9;
  Object.assign(fdata.workers, { trainTicks: 2, speed: 20, harvestTicks: 0, load: 3, retryTicks: 5 });
  const list = [{ id: 'wood', kind: 'timber', x: 1010, z: 1000 }, { id: 'rock', kind: 'stone', x: 1000, z: 1010 }];
  const spotData = { seed: 1, chunkSize: 250, spots: list.map(p => ({ ...p, pieces: [[0, 0, 0]], deposit: null })), byChunk: {} };
  for (const p of spotData.spots) (spotData.byChunk[`c${Math.floor(p.x / 250)}_${Math.floor(p.z / 250)}`] ||= []).push(p.id);
  const state = { tick: 0 }, fr = createFrontier({ state, data: fdata, spotData });
  fr.world.addTown({ id: 't', name: 'Test', owner: 'p', region: null, x: 1000, z: 1000, pop: 8, stock: { food: 100, timber: 100, stone: 100, goods: 100, ryo: 100 }, buildings: [{ type: 'town_hall', cell: 0 }] });
  const s = fr.world.settlement('t'), workers = fr.modules.find(m => m.name === 'workers').workers;
  const send = c => { fr.command({ owner: 'p' }, { type: 'frontier', town: 't', ...c }); return state.frontier.receipts.at(-1); };
  const run = n => { for (let i = 0; i < n; i++) { state.tick++; fr.tick(); } };
  assert.equal(send({ action: 'train', count: 1 }).ok, true); run(4);
  const w = s.workers[0];
  fr.world.change('t', 'timber', 1e6, 'test');
  assert.ok(isFull(s, fdata, 'timber'));
  assert.equal(workers.assign(s, [w.id], 'wood', 'g').ok, true);
  run(40);
  assert.equal(w.status, 'Store full'); assert.equal(w.trip, null);
  const stone0 = s.stock.stone;
  workers.assignIdle(s);
  assert.equal(w.spot, 'rock', 'governor moved its worker to stone');
  run(200);
  assert.ok(s.stock.stone > stone0, 'stone delivered');
  // a player's own pick is never moved
  workers.assign(s, [w.id], 'wood', 'p'); run(40); workers.assignIdle(s);
  assert.equal(w.spot, 'wood');
}
console.log('test_frontier_storage: ok');

// B7: growth alerts are rate-limited (one per growthCooldownEcon per town) and milestones step by popMilestone
{
  const state = { tick: 0, news: [] }, world = createFrontierWorld({ state, data });
  const alerts = createAlerts({ state, data }), s = state.frontier.settlements[SID], A = data.alerts;
  s.owner = 'player';
  const tick = () => { state.frontier.econTick++; alerts.econTick(); };
  tick();
  const grew = () => state.news.filter(n => n.event === 'growth').length;
  s.pop += A.popMilestone; s.housing = 1e6; tick();
  assert.equal(grew(), 1, 'milestone alert');
  s.pop += A.popMilestone; tick(); s.pop += A.popMilestone; tick();
  assert.equal(grew(), 1, 'no second alert inside the cooldown');
  for (let i = 0; i < A.growthCooldownEcon; i++) tick();
  assert.equal(grew(), 2, 'the next one after the cooldown');
}
console.log('B7 growth alerts: ok');
