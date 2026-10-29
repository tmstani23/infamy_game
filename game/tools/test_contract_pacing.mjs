import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContracts } from '../src/sim/contracts.js';
import { debitRyo } from '../src/sim/treasury.js';
import { rewardPopups, treasuryHistory } from '../src/ryo_badge.js';

const rules = JSON.parse(readFileSync(new URL('../data/units.json', import.meta.url))).rules.contracts;
function fixture(ryo = 1000) {
  const state = { tick: 0, night: false, news: [], hits: [], ryoGains: [],
    clans: { s: { id: 's', name: 'Shinobi', kind: 'ninja', ryo: 0 },
      r: { id: 'r', kind: 'yakuza', ryo }, k: { id: 'k', kind: 'kuroda', ryo: 500 } },
    entities: { s: { id: 's', owner: 's', type: 'hero', hp: 100, place: 'room', x: 0, z: 0, hidden: true },
      r: { id: 'r', owner: 'r', type: 'hero', hp: 100 }, k: { id: 'k', owner: 'k', type: 'hero', hp: 100 } },
    businesses: { b: { id: 'b', kind: 'shop', owner: 'r', room: 'room', x: 0, z: 0 },
      other: { id: 'other', kind: 'shop', owner: 'k', room: 'other', x: 10, z: 10 } } };
  const c = createContracts({ state, rules, scores: { shop: 1 }, backRoom: () => ({ x: 0, z: 0 }) });
  c.tick();
  const take = job => c.command(state.entities.s, { action: 'take', job: job.id }, { menu: 'contracts' });
  function find(kind, target = 'r') {
    for (let i = 0; i < 40; i++) {
      const j = state.contracts.board.find(j => j.kind === kind && j.target === target);
      if (j) return j;
      c.post();
    }
    assert.fail(`No ${kind} job for ${target}`);
  }
  return { state, c, take, find };
}
{
  const { state, c, take, find } = fixture();
  assert.equal(c.readyIn('s'), 0, 'first job available immediately');
  take(find('scout'));
  const deadline = state.contracts.readyAt.s;
  assert.equal(deadline, rules.acceptIntervalSeconds * 20);
  c.command(state.entities.s, { action: 'drop' });
  const next = find('scout', 'k'), board = structuredClone(state.contracts.board);
  take(next);
  assert.equal(state.contracts.active.s, undefined, 'cancel cannot reset cadence or rotate targets instantly');
  assert.deepEqual(state.contracts.board, board, 'rejected acceptance never consumes jobs');
  state.tick = deadline - 1; state.night = true; state.dawn = true; c.tick();
  assert.equal(c.readyIn('s'), 1, 'dawn, board refill and night cannot reset cadence');
  const valid = state.contracts.board[0]; take(valid);
  assert.equal(state.contracts.active.s, undefined, 'one tick before deadline remains blocked');
  state.tick = deadline; state.night = false; take(valid);
  assert.ok(state.contracts.active.s, 'accepts exactly at deadline in daylight');
  state.tick += 20 * (rules.acceptIntervalSeconds + 5);
  assert.equal(c.readyIn('s'), 0, 'long objective/travel consumes the timer');
  c.command(state.entities.s, { action: 'drop' });
  const available = find('scout'); take(available);
  assert.ok(state.contracts.active.s, 'no extra cooldown after a long job');
  const clone = structuredClone(state);
  const restored = createContracts({ state: clone, rules, scores: { shop: 1 }, backRoom: () => ({ x: 0, z: 0 }) });
  assert.equal(restored.readyIn('s'), c.readyIn('s'), 'cadence survives plain-state reconstruction');
  assert.equal(c.readyIn('r'), 0, 'cadence belongs to the accepting clan');
}
for (const treasury of [0, 9, 1000, 10000]) {
  const { state, c, take, find } = fixture(treasury);
  take(find('steal')); c.tick();
  const job = state.contracts.active.s;
  job.progress = job.need - 1; c.tick(); c.tick();
  const stolen = Math.min(600, Math.floor(treasury * .2));
  assert.equal(state.clans.r.ryo, treasury - stolen);
  assert.equal(state.clans.s.ryo, stolen, 'treasury loss and thief payment agree');
  assert.equal(state.clans.s.renown, 35, 'existing quoted/hidden reward unchanged');
  assert.equal(state.ryoLosses?.length || 0, stolen ? 1 : 0, 'completion cannot debit twice');
  if (stolen) {
    const entry = state.ryoLosses[0];
    assert.deepEqual([entry.before, entry.after, entry.amount, entry.by, entry.target], [treasury, treasury - stolen, stolen, 's', 'b']);
    assert.match(treasuryHistory(state, state.clans.r), /Contract theft · Shinobi/);
    assert.equal(rewardPopups(state, 'r')[0].amount, -stolen);
  }
}
{
  const state = { tick: 1 }, clan = { id: 'r', ryo: 1000 };
  for (let i = 0; i < 25; i++) debitRyo(state, clan, 1, 'Crew hired');
  assert.equal(clan.ryo, 975);
  assert.equal(clan.ryoHistory.length, 20, 'saved ledger is bounded');
  assert.equal(rewardPopups(state, 'r').length, 0, 'ordinary purchases do not spam loss popups');
  assert.equal(treasuryHistory(state, clan).split('\n').length, 6);
  debitRyo(state, clan, 0, 'Empty theft', { notify: true });
  assert.equal(state.ryoLosses.length, 25, 'zero debits have no false loss event');
}
// Comparable upper bounds, not a full-match balance claim: 20 seconds travel,
// hidden local work, score-one target, unlimited ready jobs, no combat delays.
for (const kind of ['scout', 'steal', 'mark']) {
  const r = rules[kind], work = kind === 'mark' ? r.plantSeconds + r.holdSeconds : r.seconds;
  const seconds = 20 + work / rules.hiddenProgressRate;
  const quoted = Math.round(r.renown * (1 + rules.rewardPerBusinessPoint));
  const renown = quoted + Math.round(quoted * rules.hiddenBonusShare);
  const oldJobs = Math.floor(600 / seconds), newJobs = Math.floor(600 / Math.max(seconds, rules.acceptIntervalSeconds));
  console.log(`${kind}: 10-minute upper bound ${oldJobs * renown} → ${newJobs * renown} Renown (${oldJobs} → ${newJobs} jobs)`);
}
console.log('Contract pacing/treasury: shared acceptance boundary, cancellation/daytime/refill/reconstruction, actual theft cap/rounding/once-only ledger and bounded history passed');
