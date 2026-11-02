// F2.2: frontier world records, ids, ledger and totals. Run from the repo root:
//   node game/tools/test_frontier_world.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontierWorld } from '../src/sim/frontier/world.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const fresh = () => { const state = { tick: 0 }; return { state, world: createFrontierWorld({ state, data }) }; };

// records match the data file
{
  const { state, world } = fresh();
  const f = state.frontier;
  assert.equal(f.version, 1);
  assert.deepEqual(Object.keys(f.settlements).sort(), Object.keys(data.settlements).sort());
  const s = world.settlement('s_frontier_1');
  assert.equal(s.pop, 8);
  assert.deepEqual(s.stock, { food: 60, timber: 40, stone: 10, goods: 0, ryo: 0 });
  assert.equal(s.buildings.length, 3);
  assert.equal(s.housing, 12, 'two houses of 6');
  assert.equal(s.owner, null);
  assert.equal(f.roads.r1.from, 'capital');
  assert.equal(f.roads.r1.to, 's_frontier_1');
  assert.equal(f.roads.r1.length, 540);
  assert.equal(f.roads.r1.state, 'working');
  assert.equal(world.settlement('nope'), null);
  world.checkInvariants();
}

// ids: p1, p2 and they survive a structuredClone of the state
{
  const { state, world } = fresh();
  assert.equal(world.newId('p'), 'p1');
  assert.equal(world.newId('p'), 'p2');
  const copy = structuredClone(state);
  const world2 = createFrontierWorld({ state: copy, data });   // adopts the existing state.frontier
  assert.equal(world2.newId('p'), 'p3');
  assert.equal(world2.newId('b'), 'b4');
  assert.deepEqual(copy.frontier.settlements, state.frontier.settlements);
}

// ledger is capped at 500 and totals equal the sum of every delta (2,000 calls)
{
  const { state, world } = fresh();
  let sumIn = 0, sumOut = 0;
  for (let i = 0; i < 2000; i++) {
    const delta = (i % 3 === 0 ? -1 : 1) * (0.25 + (i % 7));
    state.tick = i;
    world.ledgerAdd({ settlement: 's_frontier_1', resource: 'food', delta, reason: 'test' });
    if (delta > 0) sumIn += delta; else sumOut -= delta;
    assert.ok(state.frontier.ledger.length <= 500);
  }
  const t = state.frontier.totals.s_frontier_1.food;
  assert.equal(t.in, sumIn);
  assert.equal(t.out, sumOut);
  assert.equal(state.frontier.ledger.length, 500);
  assert.equal(state.frontier.ledger.at(-1).tick, 1999);
  assert.equal(state.frontier.ledger[0].tick, 1500, 'oldest dropped first');
}

// change() writes stock, totals and ledger together
{
  const { state, world } = fresh();
  world.change('s_frontier_1', 'timber', -15, 'build');
  world.change('s_frontier_1', 'food', 2.5, 'farm');
  assert.equal(world.settlement('s_frontier_1').stock.timber, 25);
  assert.equal(state.frontier.totals.s_frontier_1.timber.out, 15);
  assert.equal(state.frontier.totals.s_frontier_1.food.in, 2.5);
  assert.equal(state.frontier.ledger.length, 2);
  world.checkInvariants();
  const before = JSON.stringify(state);
  assert.throws(() => world.change('s_frontier_1', 'stone', -11, 'build'), /negative/);
  assert.throws(() => world.change('s_frontier_1', 'gold', 1, 'x'), /unknown/);
  assert.equal(JSON.stringify(state), before, 'a refused change writes nothing');
  world.setOwner('s_frontier_1', 'player');
  assert.equal(world.settlement('s_frontier_1').owner, 'player');
}
console.log('test_frontier_world: ok');
