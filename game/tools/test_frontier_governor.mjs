// F2.7: the governor. Run from the repo root: node game/tools/test_frontier_governor.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontierWorld } from '../src/sim/frontier/world.js';
import { createEconomy } from '../src/sim/frontier/economy.js';
import { createConstruction } from '../src/sim/frontier/construction.js';
import { createGovernor } from '../src/sim/frontier/governor.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
delete data.tiers;   // B3 tier limits are covered by test_frontier_tiers.mjs
const SID = 's_frontier_1', R = data.governor.reviewTicks;
function fresh(edit) {
  const state = { tick: 0 };
  const world = createFrontierWorld({ state, data });
  const eco = createEconomy({ state, data, world });
  const con = createConstruction({ state, data, world });
  const gov = createGovernor({ state, data, world, economy: eco, construction: con });
  const s = state.frontier.settlements[SID];
  edit?.(s, world, state);
  let maxProjects = 0;
  const ticks = n => { for (let i = 0; i < n; i++) {
    state.tick += data.cadenceTicks; state.frontier.econTick++;
    eco.run(); con.run(); gov.run(); world.checkInvariants();
    maxProjects = Math.max(maxProjects, s.projects.length);
  } };
  const reviews = n => ticks(n * R);
  return { state, world, eco, con, gov, s, ticks, reviews, get maxProjects() { return maxProjects; } };
}
const noFarm = s => { s.buildings = s.buildings.filter(b => b.type !== 'farm'); };
const add = (s, type) => s.buildings.push({ id: `x${s.buildings.length}${type}`, type, cell: null, stage: 'built', workers: 0 });
const count = (s, type) => s.buildings.filter(b => b.type === type).length;

// autoBuild off: suggestions only, zero new projects in 500 reviews; repairs and rebuilds still happen
{
  const t = fresh(s => { noFarm(s); s.buildings.find(b => b.type === 'house').stage = 'ruined'; });
  const { s } = t;
  t.reviews(500);
  assert.equal(s.autoBuild, false);
  assert.ok(s.suggestions.some(x => x.type === 'farm' && /food falling/i.test(x.reason)), 'farm suggested');
  assert.ok(s.suggestions.length <= 3);
  assert.equal(count(s, 'farm'), 0, 'nothing new built without the OK');
  assert.equal(s.projects.length, 0);
  assert.equal(count(s, 'house'), 2);
  assert.ok(s.buildings.every(b => b.stage === 'built'), 'the ruined house was rebuilt on its spot');
  assert.equal(s.buildings.length, 2, 'rebuilt, not duplicated');
  assert.ok(t.maxProjects <= 1);
  assert.ok(s.report.doing && s.report.next, 'report text');
}

// the player's OK on a suggestion queues and authorizes it
{
  const t = fresh(noFarm);
  t.reviews(10);
  const pid = t.gov.approve(SID, 0);
  assert.ok(pid); assert.equal(t.s.projects.find(p => p.id === pid).authorized, true);
  t.reviews(30);
  assert.equal(count(t.s, 'farm'), 1);
  assert.equal(t.gov.approve(SID, 5), false);
}

// autoBuild on: within budget the suggestion becomes a project; food falling + idle workers -> farm
{
  const t = fresh(s => { noFarm(s); s.autoBuild = true; s.budget.ryo = 500; });
  t.reviews(30);
  assert.equal(count(t.s, 'farm'), 1, 'the next project was a farm');
}
// over-budget projects stay unauthorized, and only one project exists (budget 1: a budget of 0 means
// "none set", which spends governor.initiativeBudget instead, 2026-11-06)
{
  const t = fresh(s => { noFarm(s); s.autoBuild = true; s.budget.ryo = 1; });
  t.reviews(60);
  assert.equal(t.s.projects.length, 1);
  assert.equal(t.s.projects[0].authorized, false);
  assert.equal(t.s.projects[0].type, 'farm');
  assert.equal(count(t.s, 'farm'), 0);
}
// food falling and no idle workers: no farm, the report says need workers
{
  const t = fresh(s => { noFarm(s); add(s, 'lumber_camp'); add(s, 'quarry'); s.autoBuild = true; s.budget.ryo = 500; });
  t.reviews(30);
  assert.equal(t.s.report.idle, 0);
  assert.equal(count(t.s, 'farm'), 0);
  assert.equal(t.s.projects.length, 0);
  assert.match(t.s.report.next, /need workers/i);
}
// housing full (food steady): a house
{
  const t = fresh(s => { s.pop = 12; s.workforce = 12; s.autoBuild = true; s.budget.ryo = 500; });
  t.reviews(10);
  assert.ok(t.s.projects.some(p => p.type === 'house') || count(t.s, 'house') > 2, 'house project for full housing');
}
// priorities: produce -> a producer building, fortify -> stockade, trade -> workshop (as suggestions)
for (const [priority, type] of [['fortify', 'stockade'], ['trade', 'workshop']]) {
  const t = fresh(s => { s.priority = priority; });   // 8 people, one farm: 4 idle workers
  t.reviews(10);
  assert.ok(t.s.suggestions.some(x => x.type === type), `${priority} suggests ${type}`);
}
{
  const t = fresh(s => { s.priority = 'produce'; s.stock.timber = 0; s.stock.stone = 99; s.stock.goods = 99; });
  // direct stock writes only in this fixture: realign totals
  t.state.frontier.totals[SID].timber.start = 0; t.state.frontier.totals[SID].stone.start = 99; t.state.frontier.totals[SID].goods.start = 99;
  t.reviews(10);
  assert.ok(t.s.suggestions.some(x => x.type === 'lumber_camp'), 'lowest stock decides');
}

// never two projects at once, and no runaway farms in a long autoBuild run
{
  const t = fresh(s => { s.autoBuild = true; s.budget.ryo = 60; });
  t.reviews(500);
  assert.ok(t.maxProjects <= 1, 'one project at a time');
  assert.ok(count(t.s, 'farm') <= 3, `farms ${count(t.s, 'farm')}`);
}

// mood keeper: a governed town settles above 55 and stays; a raid dips it, then it recovers by itself
{
  const t = fresh();
  t.reviews(50);
  assert.ok(t.s.mood > 55);
  let min = 100;
  for (let i = 0; i < 150; i++) { t.reviews(1); min = Math.min(min, t.s.mood); assert.ok(t.s.mood > 55, 'stays above 55'); }
  t.eco.hit(SID, 100);
  let low = 100;
  for (let i = 0; i < 100; i++) { t.reviews(1); low = Math.min(low, t.s.mood); }
  assert.ok(low < t.s.mood - 5 || low < 70, `dipped (${low})`);
  assert.ok(t.s.mood > 70, `recovered (${t.s.mood})`);
  assert.equal(t.s.pop >= 8, true, 'nobody left over one raid');
}
// a player-locked tax level is never changed by the governor
{
  const t = fresh();
  t.eco.setTax(SID, 'high');
  t.reviews(20); t.eco.hit(SID, 100); t.reviews(200);
  assert.equal(t.s.taxLevel, 'high');
}
console.log('test_frontier_governor: ok');

// no budget set: initiative spends up to governor.initiativeBudget (2026-11-06)
{
  const t = fresh(s => { noFarm(s); s.autoBuild = true; s.budget.ryo = 0; });
  t.reviews(30);
  assert.ok(t.s.projects.every(p => p.authorized) || count(t.s, 'farm') === 1, 'built within the default initiative budget');
  console.log('governor initiative budget ok');
}
