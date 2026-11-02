// F2.8: frontier commands and receipts. Run from the repo root: node game/tools/test_frontier_commands.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontier } from '../src/sim/frontier/frontier.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const SID = 's_frontier_1';
function fresh() {
  const state = { tick: 0 };
  const fr = createFrontier({ state, data });
  fr.world.setOwner(SID, 'player');
  const me = { owner: 'player' }, other = { owner: 'rival' };
  const send = (e, c) => { fr.command(e, { type: 'frontier', ...c }); return state.frontier.receipts.at(-1); };
  return { state, fr, me, other, send, s: state.frontier.settlements[SID] };
}
const snap = s => JSON.stringify(s);

// wrong owner: rejected with a reason and the settlement is unchanged, for every action
{
  const { state, fr, other, send, s } = fresh();
  const pid = fr.modules.length && (fr.world.newId('x'), null);
  const proj = (() => { const { me, send: sd } = { me: { owner: 'player' }, send }; return null; })();
  fr.command({ owner: 'player' }, { type: 'frontier', action: 'queue', settlement: SID, building: 'house' });
  const projectId = s.projects[0].id;
  state.frontier.receipts.length = 0;
  const before = snap(s);
  const attempts = [
    { action: 'setPriority', settlement: SID, priority: 'produce' }, { action: 'setBudget', settlement: SID, ryo: 50 },
    { action: 'setAutoBuild', settlement: SID, on: true }, { action: 'approveSuggestion', settlement: SID, index: 0 },
    { action: 'setTax', settlement: SID, level: 'low' }, { action: 'authorize', project: projectId },
    { action: 'cancel', project: projectId }, { action: 'queue', settlement: SID, building: 'farm' }
  ];
  for (const a of attempts) {
    const r = send(other, a);
    assert.equal(r.ok, false, a.action); assert.match(r.reason, /not your/);
    assert.equal(snap(s), before, `${a.action} changed nothing`);
  }
  assert.equal(state.frontier.receipts.length, attempts.length);
}

// valid actions: one ok receipt each, and the effect
{
  const { state, me, send, s, fr } = fresh();
  const ok = (c, check) => { const n = state.frontier.receipts.length; const r = send(me, c); assert.equal(r.ok, true, `${c.action}: ${r.reason}`); assert.equal(state.frontier.receipts.length, n + 1); assert.equal(r.clan, 'player'); check?.(); };
  ok({ action: 'setPriority', settlement: SID, priority: 'produce' }, () => assert.equal(s.priority, 'produce'));
  ok({ action: 'setBudget', settlement: SID, ryo: 80 }, () => assert.equal(s.budget.ryo, 80));
  ok({ action: 'setAutoBuild', settlement: SID, on: true }, () => assert.equal(s.autoBuild, true));
  ok({ action: 'setAutoBuild', settlement: SID, on: false });
  ok({ action: 'setTax', settlement: SID, level: 'low' }, () => assert.deepEqual([s.taxLevel, s.taxLocked], ['low', true]));
  ok({ action: 'setTax', settlement: SID, level: 'auto' }, () => assert.equal(s.taxLocked, false));
  ok({ action: 'queue', settlement: SID, building: 'house', cell: 'c9' }, () => assert.equal(s.projects.length, 1));
  const pid = s.projects[0].id;
  ok({ action: 'authorize', project: pid }, () => assert.equal(s.projects[0].authorized, true));
  ok({ action: 'cancel', project: pid }, () => assert.equal(s.projects.length, 0));
  s.suggestions = [{ type: 'farm', reason: 'Farm: food falling' }];
  ok({ action: 'approveSuggestion', settlement: SID, index: 0 }, () => { assert.equal(s.projects[0].type, 'farm'); assert.equal(s.projects[0].authorized, true); assert.equal(s.suggestions.length, 0); });
  fr.world.checkInvariants();
}

// invalid values and targets are rejected with a reason and change nothing
{
  const { me, send, s, state } = fresh();
  const before = snap(s);
  for (const a of [
    { action: 'setPriority', settlement: SID, priority: 'conquer' }, { action: 'setBudget', settlement: SID, ryo: -5 },
    { action: 'setBudget', settlement: SID, ryo: NaN }, { action: 'setAutoBuild', settlement: SID, on: 'yes' },
    { action: 'approveSuggestion', settlement: SID, index: 3 }, { action: 'setTax', settlement: SID, level: 'silly' },
    { action: 'authorize', project: 'p404' }, { action: 'cancel' }, { action: 'queue', settlement: SID, building: 'castle' },
    { action: 'setPriority', settlement: 'nowhere', priority: 'grow' }, { action: 'setPriority', settlement: 'capital', priority: 'grow' },
    { action: 'teleport', settlement: SID }
  ]) { const r = send(me, a); assert.equal(r.ok, false, a.action); assert.ok(r.reason, `${a.action} has a reason`); assert.equal(snap(s), before); }
  assert.equal(state.frontier.receipts.every(r => r.seq > 0), true);
}

// receipts last one tick: the hub drops older ones at the start of the next tick
{
  const { state, me, send, fr } = fresh();
  state.tick = 5; send(me, { action: 'setPriority', settlement: SID, priority: 'trade' });
  assert.equal(state.frontier.receipts.length, 1);
  fr.tick();                                     // same tick: receipts stay for the snapshot
  assert.equal(state.frontier.receipts.length, 1);
  state.tick = 6; fr.tick();
  assert.equal(state.frontier.receipts.length, 0);
}
console.log('test_frontier_commands: ok');
