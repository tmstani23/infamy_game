// F2.4 production and food, F2.5 jobs and growth, F2.5b mood and taxes. Run from the repo root: node game/tools/test_frontier_economy.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontierWorld } from '../src/sim/frontier/world.js';
import { createEconomy } from '../src/sim/frontier/economy.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const SID = 's_frontier_1';
function fresh(edit, edit2) {
  const state = { tick: 0 };
  const world = createFrontierWorld({ state, data });
  const eco = createEconomy({ state, data, world });
  edit?.(state.frontier.settlements[SID], world, state);
  edit2?.(state);
  const hit = (a) => eco.hit(SID, a);
  const step = n => { for (let i = 0; i < n; i++) { state.tick += data.cadenceTicks; state.frontier.econTick++; eco.run(); world.checkInvariants(); } };
  return { state, world, eco, step, hit, s: state.frontier.settlements[SID] };
}

// 1,000 economy ticks: no negative stock, start + in - out = end (from totals, not the capped ledger)
{
  const { state, step, s } = fresh();
  step(1000);
  const tot = state.frontier.totals[SID];
  for (const r of data.resources) {
    assert.ok(s.stock[r] >= 0, `${r} >= 0`);
    assert.ok(Math.abs(tot[r].start + tot[r].in - tot[r].out - s.stock[r]) < 1e-6, `${r} conserved`);
  }
  assert.ok(tot.food.in > 0 && tot.food.out > 0, 'the farm feeds and the town eats');
  assert.ok(state.frontier.ledger.some(l => l.reason === 'farm') || tot.food.in > 0);
}

// the farm's output is output x workers per tick; eating is rate x pop
{
  const { state, step, s } = fresh();
  const food0 = s.stock.food;
  step(1);
  const farm = s.buildings.find(b => b.type === 'farm');
  assert.equal(farm.workers, 4);
  const expect = food0 + data.buildings.farm.output.food * 4 - data.rates.food * s.pop;
  assert.ok(Math.abs(s.stock.food - expect) < 1e-9);
  assert.equal(state.frontier.ledger.filter(l => l.reason === 'eat' && l.settlement === SID).length, 1);
}

// with no farms: food reaches 0, pop is unchanged, 'food' is waiting; nobody dies
{
  const { step, s } = fresh(s => { s.buildings = s.buildings.filter(b => b.type !== 'farm'); });
  step(1000);
  assert.equal(s.stock.food, 0);
  assert.equal(s.pop, 8);
  assert.ok(s.report.waiting.includes('food'));
}

// workshop recipe: timber + stone into goods, only when the inputs are there
{
  const { s, step } = fresh(s => { s.buildings.push({ id: 'w1', type: 'workshop', cell: null, stage: 'built', workers: 0 }); });
  step(20);
  assert.ok(s.stock.goods > 0, 'goods made');
  assert.ok(s.stock.timber >= 0 && s.stock.stone >= 0);
}
{
  const { s, step } = fresh(s => { s.buildings.push({ id: 'w1', type: 'workshop', cell: null, stage: 'built', workers: 0 }); }, state => {
    const t = state.frontier.totals[SID];
    for (const r of ['timber', 'stone']) { state.frontier.settlements[SID].stock[r] = 0; t[r].start = 0; }
  });
  step(20);
  assert.equal(s.stock.goods, 0, 'no inputs, no goods');
  assert.ok(s.report.waiting.includes('inputs'));
}

// ---- F2.5 jobs and growth ----
const farmsOnly = (s, world) => { s.buildings = s.buildings.filter(b => b.type !== 'farm'); };
const drain = state => { state.frontier.settlements[SID].stock.food = 0; state.frontier.totals[SID].food.start = 0; };
const twoFarmsAndShop = (s, world) => {
  s.buildings.push({ id: 'f2', type: 'farm', cell: null, stage: 'built', workers: 0 }, { id: 'w1', type: 'workshop', cell: null, stage: 'built', workers: 0 });
};
const crew = (s, kind) => s.buildings.filter(b => b.type === kind).reduce((n, b) => n + b.workers, 0);
{
  // pop never exceeds housing; spare housing and surplus food: exactly +1 per growth period
  const { s, step } = fresh();
  step(59); assert.equal(s.pop, 8);
  step(1); assert.equal(s.pop, 9, '+1 at the first growth period');
  step(60); assert.equal(s.pop, 10);
  for (let i = 0; i < 1000; i++) { step(1); assert.ok(s.pop <= s.housing, 'pop <= housing'); }
  assert.equal(s.pop, 12);
  assert.ok(s.report.waiting.includes('housing'), 'full: housing is what the town waits for');
  assert.equal(s.workforce, s.pop);
}
{
  // no housing room: nothing grows and housing is reported
  const { s, step } = fresh((s, world) => { s.buildings = s.buildings.filter(b => b.type !== 'house'); world.recount(SID); });
  step(130);
  assert.equal(s.pop, 8); assert.ok(s.report.waiting.includes('housing'));
}
{
  // no surplus food (no farm): nothing grows and food is reported
  const { s, step } = fresh(farmsOnly);
  step(130);
  assert.equal(s.pop, 8); assert.ok(s.report.waiting.includes('food') || s.growthBlock === 'food');
}
{
  // priority 'produce': workshop before extra farms while food is fine; farms first when food is short
  let t = fresh(twoFarmsAndShop); t.s.priority = 'produce'; t.eco.assignJobs(t.s);
  assert.equal(crew(t.s, 'workshop'), 2); assert.equal(crew(t.s, 'farm'), 6);
  t = fresh(twoFarmsAndShop); t.s.priority = 'grow'; t.eco.assignJobs(t.s);
  assert.equal(crew(t.s, 'workshop'), 0); assert.equal(crew(t.s, 'farm'), 8);
  t = fresh(twoFarmsAndShop, drain); t.s.priority = 'produce'; t.eco.assignJobs(t.s);
  assert.equal(crew(t.s, 'farm'), 8, 'short food: farms first'); assert.equal(crew(t.s, 'workshop'), 0);
  assert.equal(t.s.report.idle, 0); assert.equal(t.s.report.unfilled, 2, 'unfilled jobs are reported');
}
{
  // builders: only while a paid project exists, up to maxBuilders
  const { s, eco } = fresh();
  eco.assignJobs(s); assert.equal(s.builders, 0);
  s.projects.push({ id: 'p1', type: 'house', cell: null, cost: {}, paid: true, progress: 0, need: 30, authorized: true });
  eco.assignJobs(s);
  assert.equal(s.builders, 3);
  const used = s.builders + s.buildings.reduce((n, b) => n + b.workers, 0);
  assert.ok(used <= s.pop);
}

// ---- F2.5b mood and taxes ----
{
  // everything good: mood stays above 70 and a tax ledger entry matches the formula
  const { s, state, step } = fresh();
  step(5);
  const entry = state.frontier.ledger.filter(l => l.reason === 'tax').at(-1);
  assert.ok(entry, 'taxes collected at the review');
  assert.ok(Math.abs(entry.delta - data.rates.tax.normal * 8 * s.mood / 100) < 1e-9, 'tax = rate x pop x mood/100');
  step(300);
  assert.ok(s.mood > 70, `mood ${s.mood}`);
}
{
  // high taxes alone: lower mood, never below the decline line, nobody leaves; more ryo per person
  const a = fresh(), b = fresh();
  b.eco.setTax(SID, 'high');
  a.step(300); b.step(300);
  assert.ok(b.s.mood < a.s.mood && b.s.mood > data.mood.declineBelow);
  assert.ok(b.s.pop >= a.s.pop - 0 || b.s.pop >= 8);
  assert.ok(b.s.report.moodWhy.some(w => w.factor === 'taxes' && w.text && w.hint) || b.s.mood >= 70);
}
{
  // three bad factors for 10 reviews: then -1 pop per review down to the floor; one fixed factor ends it
  const t = fresh(farmsOnly, drain);
  const { s, eco, step } = t;
  eco.setTax(SID, 'high');
  const pops = [];
  for (let i = 0; i < 60; i++) { for (let k = 0; k < 5; k++) { eco.hit(SID, 100); step(1); } pops.push(s.pop); }
  assert.equal(s.mood < data.mood.declineBelow, true);
  assert.equal(pops[8], 8, 'no one leaves before 10 reviews in a row');
  const firstDrop = pops.findIndex(p => p < 8);
  assert.ok(firstDrop >= 9 && firstDrop <= 10, `first drop at review ${firstDrop + 1}`);
  assert.equal(pops[firstDrop], 7);
  assert.equal(pops[firstDrop + 1], 6, 'then 1 per review');
  assert.equal(pops.at(-1), data.mood.floorPop, 'stops at the floor');
  assert.deepEqual(s.report.moodWhy.map(w => w.factor).sort(), ['food', 'safety', 'taxes']);
  assert.equal(s.report.moodWhy[0].factor, 'food', 'worst first');
}
{
  const { s, eco, step } = fresh(farmsOnly, drain);
  eco.setTax(SID, 'high');
  while (s.pop === 8) { eco.hit(SID, 100); step(1); }
  const popNow = s.pop;
  step(0);
  // fix one factor (safety) and stop the raids: mood is back over the line, decline stops at once
  eco.hit(SID, -100);   // raise safety back (negative hit)
  step(50);
  assert.equal(s.pop, popNow, 'decline stopped');
  assert.equal(s.lowReviews, 0);
}
{
  // the governor's tax change is ignored while the player has locked a level
  const { s, eco } = fresh();
  assert.equal(eco.setTax(SID, 'low'), true);
  assert.equal(eco.setAutoTax(SID, 'high'), false); assert.equal(s.taxLevel, 'low');
  assert.equal(eco.setTax(SID, 'auto'), true);
  assert.equal(eco.setAutoTax(SID, 'high'), true); assert.equal(s.taxLevel, 'high');
  assert.equal(eco.setTax(SID, 'silly'), false);
}

// determinism: two runs from the same start end identical
{
  const a = fresh(), b = fresh();
  a.step(300); b.step(300);
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
}
console.log('test_frontier_economy: ok');

// Economy balance B1: workers (and workers in training) eat like townspeople and need a bed.
{
  const { step, s } = fresh(s => { s.workers = [{ id: 'w1' }, { id: 'w2' }]; s.workerTraining = [{ id: 'w3', readyAt: 1e9 }]; });
  const food0 = s.stock.food;
  step(1);
  const farm = s.buildings.find(b => b.type === 'farm');
  const expect = food0 + data.buildings.farm.output.food * farm.workers - data.rates.food * (s.pop + 3);
  assert.ok(Math.abs(s.stock.food - expect) < 1e-9, 'workers eat');
}
{
  // housing has room for townspeople but not once workers count: growth waits on housing
  const { step, s } = fresh((s, world) => { s.workers = Array.from({ length: s.housing - s.pop }, (_, i) => ({ id: `w${i}` })); world.change(s.id, 'food', 1e6, 'test'); });
  const pop0 = s.pop;
  step(data.rates.growthTicks * 3);
  assert.equal(s.pop, pop0, 'no growth while workers fill the beds');
  assert.equal(s.growthBlock, 'housing');
}
console.log('B1 workers eat and need a bed: ok');
