// F2.6: construction projects. Run from the repo root: node game/tools/test_frontier_construction.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontierWorld } from '../src/sim/frontier/world.js';
import { createEconomy } from '../src/sim/frontier/economy.js';
import { createConstruction } from '../src/sim/frontier/construction.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const SID = 's_frontier_1';
function setup(state = { tick: 0 }) {
  const world = createFrontierWorld({ state, data });
  const eco = createEconomy({ state, data, world });
  const con = createConstruction({ state, data, world });
  const step = n => { for (let i = 0; i < n; i++) { state.tick += data.cadenceTicks; state.frontier.econTick++; eco.run(); con.run(); world.checkInvariants(); } };
  return { state, world, eco, con, step, s: state.frontier.settlements[SID] };
}

// a queued project is unauthorized and does nothing until authorized; pays once only
{
  const { s, con, step, state } = setup();
  const id = con.queue(SID, 'house', 'c1');
  assert.equal(s.projects.length, 1);
  assert.deepEqual([s.projects[0].paid, s.projects[0].authorized, s.projects[0].progress], [false, false, 0]);
  const timber0 = s.stock.timber;
  step(20);
  assert.equal(s.stock.timber, timber0, 'unauthorized: no cost paid');
  con.authorize(id);
  step(1);
  assert.equal(s.projects[0].paid, true);
  assert.equal(s.stock.timber, timber0 - 15 + 0, 'paid the full cost once');
  step(60);
  assert.equal(state.frontier.ledger.filter(l => l.reason === 'build').length, 1, 'paid once only');
  // done: house raises housing by its value
  assert.equal(s.projects.length, 0);
  assert.equal(s.buildings.filter(b => b.type === 'house').length, 3);
  assert.equal(s.housing, 18);
  assert.equal(con.queue(SID, 'castle'), null); assert.equal(con.queue('nope', 'house'), null);
}

// progress follows the number of builders; with no spare workers it waits
{
  const { s, con, step } = setup();
  con.authorize(con.queue(SID, 'quarry'));
  step(2);   // pays on tick 1; builders are assigned from tick 2 on
  const p = s.projects[0];
  assert.equal(p.paid, true);
  step(1);
  assert.equal(s.builders, 3);
  assert.ok(p.progress >= 3 && p.progress % 3 === 0);
  step(100);
  assert.equal(s.projects.length, 0);
  assert.ok(s.buildings.some(b => b.type === 'quarry'));
}

// an unfinished project survives structuredClone(state) and finishes after
{
  const a = setup();
  a.con.authorize(a.con.queue(SID, 'house'));
  a.step(6);
  assert.ok(a.s.projects[0]?.paid && a.s.projects[0].progress > 0 && a.s.projects[0].progress < a.s.projects[0].need);
  const b = setup(structuredClone(a.state));   // adopts the cloned records
  assert.equal(JSON.stringify(b.state.frontier), JSON.stringify(a.state.frontier));
  b.step(60); a.step(60);
  assert.equal(b.s.projects.length, 0);
  assert.equal(b.s.housing, 18);
  assert.equal(JSON.stringify(b.state.frontier), JSON.stringify(a.state.frontier), 'clone runs on identically');
}

// a missing resource waits (and says which); stock is never negative; cost paid only when affordable
{
  const { s, con, step, state } = setup();
  s.projects.push(...[]);
  con.authorize(con.queue(SID, 'workshop'));   // needs 25 timber + 5 stone
  const rec = state.frontier.settlements[SID];
  // drain stone to 0 through the one door
  const w = createFrontierWorld({ state, data });
  w.change(SID, 'stone', -rec.stock.stone, 'test');
  step(3);
  assert.equal(s.projects[0].paid, false);
  assert.ok(s.report.waiting.includes('stone'));
  w.change(SID, 'stone', 5, 'test');
  step(2);
  assert.equal(s.projects[0].paid, true);
}

// cancel at progress 0 restores stock exactly; later cancel refunds nothing
{
  const { s, con, step } = setup();
  const before = { ...s.stock };
  const id = con.queue(SID, 'house'); con.authorize(id);
  step(1);
  assert.equal(s.stock.timber, before.timber - 15 + 0);
  assert.equal(con.cancel(id), true);
  assert.equal(s.projects.length, 0);
  // economy produced and ate for one tick; compare against a control run without the project
  const ctl = setup(); ctl.step(1);
  assert.deepEqual(s.stock, ctl.s.stock, 'cancel at progress 0 gives the cost back exactly');
  const id2 = con.queue(SID, 'house'); con.authorize(id2);
  step(4);
  const mid = { ...s.stock };
  assert.ok(s.projects[0].progress > 0);
  con.cancel(id2);
  assert.equal(s.stock.timber, mid.timber, 'in-progress cancel refunds nothing');
  assert.equal(con.cancel('p999'), false);
}

// repair/rebuild on the same spot: a ruined building is restored, not duplicated
{
  const { s, con, step } = setup();
  const farm = s.buildings.find(b => b.type === 'farm'); farm.stage = 'ruined';
  con.authorize(con.queue(SID, 'farm', farm.cell, { replaces: farm.id }));
  step(100);
  assert.equal(s.buildings.filter(b => b.type === 'farm').length, 1);
  assert.equal(farm.stage, 'built');
}
console.log('test_frontier_construction: ok');
