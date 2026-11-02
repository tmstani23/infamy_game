// F4.2: frontier part of the snapshot. Run from the repo root: node game/tools/test_frontier_snapshot.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontier } from '../src/sim/frontier/frontier.js';
import { createSnapshotEncoder, frontierFor, FRONTIER_EVERY } from '../src/sim_snapshot.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const state = { tick: 0, entities: {}, clans: {}, deployment: { clans: {} } };
const fr = createFrontier({ state, data });
fr.world.assignStartOwners({ player: 'player', bot: 'kuroda' });
const mine = Object.values(state.frontier.settlements).find(s => s.owner === 'player' && !s.capital);
const theirs = Object.values(state.frontier.settlements).find(s => s.owner === 'kuroda');
assert.ok(mine && theirs, 'fixture has an own and a rival town');
state.frontier.shipments.h1 = { id: 'h1', owner: 'player', cargo: { timber: 5 } };
state.frontier.shipments.h2 = { id: 'h2', owner: 'kuroda', cargo: { timber: 5 } };
state.frontier.receipts.push({ seq: 1, clan: 'player', action: 'x', ok: true }, { seq: 2, clan: 'kuroda', action: 'x', ok: true });

const before = JSON.stringify(state);
// undiscovered rival: invisible; discovered: name only, never stock
for (const seen of [false, true]) {
  const v = frontierFor(state.frontier, 'player', { siteDiscovered: () => seen });
  assert.deepEqual(v.settlements[mine.id], mine, 'own town is full');
  if (!seen) assert.equal(v.settlements[theirs.id], undefined);
  else assert.deepEqual(Object.keys(v.settlements[theirs.id]).sort(), ['id', 'name', 'owner', 'region', 'site']);
  if (seen) assert.equal(v.settlements[theirs.id].stock, undefined, 'no rival stock');
  assert.deepEqual(Object.keys(v.shipments), ['h1'], 'only own shipments');
  assert.deepEqual(v.receipts.map(r => r.seq), [1], 'only own receipts');
  assert.ok(Object.keys(v.roads).length > 0, 'roads travel with their state');
  assert.equal(v.ledger, undefined);
}
assert.equal(JSON.stringify(state), before, 'building the view changes nothing');

// the encoder sends it at 4 Hz: changes inside 5 ticks do not show up, then they do
const game = { state, discovery: { siteDiscovered: () => true }, vision: { canSee: () => false, grid: () => ({ visible: new Uint8Array(4), explored: new Uint8Array(4) }) } };
const enc = createSnapshotEncoder(game, 'player');
const get = p => new Map(p.set).get('s:frontier');
let f0 = get(enc.encode({ map: true }));
assert.ok(f0, 'first packet has the frontier');
assert.equal(f0.settlements[theirs.id].stock, undefined, 'no rival stock in the packet');
mine.stock.food += 7; state.tick += 1;
assert.equal(get(enc.encode({ map: true })), undefined, 'no frontier update inside the 4 Hz window');
state.tick += FRONTIER_EVERY;
assert.equal(get(enc.encode({ map: true })).settlements[mine.id].stock.food, mine.stock.food, 'update after the window');

// size: a one-town view stays small
const one = JSON.stringify(frontierFor({ ...state.frontier, settlements: { [mine.id]: mine, c: state.frontier.settlements.capital } }, 'player', null));
console.log('one own town view:', one.length, 'chars');
console.log('test_frontier_snapshot: ok');
