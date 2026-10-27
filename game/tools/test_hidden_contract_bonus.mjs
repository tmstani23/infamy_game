import assert from 'node:assert/strict';
import { createContracts } from '../src/sim/contracts.js';
import { stealthBadgeState } from '../src/stealth_badge.js';
function fixture(hidden) {
  const actor = { id: 'n', owner: 's', type: 'hero', place: 'room', x: 0, z: 0, hidden, hp: 100 };
  const state = { tick: 1, news: [], hits: [], ryoGains: [], clans: { s: { id: 's', kind: 'ninja', ryo: 0 }, r: { id: 'r', kind: 'yakuza', ryo: 1000 } },
    entities: { n: actor, hiddenElsewhere: { id: 'other', owner: 's', type: 'ninja', hidden: true, place: 'elsewhere', hp: 100, x: 0, z: 0 } },
    businesses: { b: { id: 'b', room: 'room', owner: 'r', kind: 'shop', x: 20, z: 30 } } };
  const contracts = createContracts({ state, scores: { shop: 1 }, backRoom: () => ({ x: 0, z: 0 }) });
  contracts.tick();
  state.contracts.active.s = { id: 1, kind: 'steal', business: 'b', target: 'r', clan: 's', rewardLocked: true, renown: 25, hiddenBonusShare: .25, stealShare: .2, stealCap: 500, progress: 0, label: 'Test theft' };
  return { state, actor, contracts, job: state.contracts.active.s };
}
{
  const f = fixture(false), { state, actor, contracts, job } = f;
  contracts.tick(); assert.equal(job.progress, 1, 'visible work has base rate');
  actor.foughtAt = state.tick; actor.hidden = true; job.progress = job.need - 1;
  contracts.tick();
  assert.equal(state.clans.s.renown, 31, 'rehidden actual finisher gets rounded25% despite earlier fight');
  assert.equal(state.clans.s.ryo, 200, 'ryo has no hidden bonus');
  assert.equal(state.news.at(-1).hiddenBonus, 6);
  contracts.tick(); assert.equal(state.clans.s.renown, 31, 'bonus paid once');
}
{
  const { state, actor, contracts, job } = fixture(false);
  contracts.tick(); job.progress = job.need - 1; contracts.tick();
  assert.equal(state.clans.s.renown, 25, 'unrelated hidden unit cannot grant visible completion bonus');
}
{
  const { contracts, job } = fixture(true); contracts.tick();
  assert.equal(job.progress, 2, 'hidden objective work is twice as fast');
}
{
  const h = { hidden: true, hiddenAt: 0, stealthStatus: { suspicion: .7, concealment: .8, movement: 'walking', lighting: 'dark' } };
  let s = stealthBadgeState(h, { hiddenSeconds: 3 }, 80);
  assert.equal(s.warning, true); assert.equal(s.hidden, true); assert.equal(s.f, 'F');
  h.stealthStatus.suspicion = 0; s = stealthBadgeState(h, { hiddenSeconds: 3 }, 80); assert.equal(s.warning, false);
  h.hidden = false; s = stealthBadgeState(h, { hiddenSeconds: 3 }, 80); assert.equal(s.suspicion, 1); assert.equal(s.f, '');
  h.hidden = true; h.hiddenAt = null; s = stealthBadgeState(h, { hiddenSeconds: 3 }, 80, true); assert.equal(s.f, 'F', 'veil correctly grants F readiness');
}
console.log('Hidden completion: actual site/last-state eligibility, earlier combat recovery, locked rounded Renown once/no extra ryo, faster quiet work and global badge state passed');
