import assert from 'node:assert/strict';
import { createContracts } from '../src/sim/contracts.js';

function fixture() {
  const state = { tick: 0, dawn: false, hits: [], news: [], ryoGains: [],
    clans: { s: { id: 's', kind: 'ninja', ryo: 0 }, a: { id: 'a', kind: 'yakuza', ryo: 0 }, b: { id: 'b', kind: 'yakuza', ryo: 0 } },
    entities: { s: { id: 's', owner: 's', type: 'hero', hp: 490, place: 'street' },
      a: { id: 'a', owner: 'a', type: 'hero', hp: 560 }, b: { id: 'b', owner: 'b', type: 'hero', hp: 560 },
      wild: { id: 'wild', owner: 'wild', type: 'bandit' } },
    businesses: { tea: { id: 'tea', kind: 'teahouse', room: 'tea', owner: null },
      shop: { id: 'shop', kind: 'shop', room: 'shop', owner: null },
      home: { id: 'home', kind: 'teahouse', room: 'home', owner: 'a', hideout: 'a' },
      clinic: { id: 'clinic', kind: 'clinic', room: 'clinic', owner: 'a' } } };
  const c = createContracts({ state, scores: { teahouse: 1, shop: 1 }, rules: { bandits: { count: 1 } }, backRoom: () => ({ x: 0, z: 0 }) });
  const tick = (hits = []) => { state.tick++; state.hits = hits; c.tick(); state.dawn = false; };
  const take = job => { assert.ok(job); c.command(state.entities.s, { action: 'take', job: job.id }, { menu: 'contracts' }); };
  const bandit = () => state.contracts.board.find(j => j.kind === 'bandits');
  tick();
  return { state, c, tick, take, bandit };
}
{
  const { state, tick, take, bandit } = fixture();
  assert.equal(state.contracts.board.length, 3, 'fair opening has two leaders and one bandit job');
  for (let job = 0; job < 2; job++) {
    take(bandit());
    tick(); assert.ok(!bandit(), 'no duplicate bandit job while one is active');
    tick([{ a: 's', t: 'wild', kill: true }]);
    assert.equal(state.clans.s.ryo, (job + 1) * 200);
    assert.equal(state.clans.s.renown, (job + 1) * 20);
    assert.equal(!!bandit(), job === 0, 'only the first completion creates a replacement');
  }
  for (let i = 0; i < 100; i++) tick();
  assert.ok(!bandit(), 'spent jobs never refill every tick');
  state.dawn = true; tick();
  assert.ok(bandit(), 'next dawn restores the initial supply');
  take(bandit());
  state.dawn = true; tick();
  assert.ok(!state.contracts.active.s && bandit(), 'expiry fails the old job and posts the new cycle');
}
{
  const { state, c, tick, take, bandit } = fixture();
  take(bandit()); c.command(state.entities.s, { action: 'drop' });
  state.businesses.tea.owner = 'a'; tick();
  take(state.contracts.board.find(j => j.business === 'tea'));
  c.command(state.entities.s, { action: 'drop' });
  for (let i = 0; i < 100; i++) tick();
  assert.ok(!bandit(), 'dropping and clan-job swaps cannot manufacture a replacement');
  assert.equal(state.clans.s.ryo, 0);
}
{
  const { state, tick, take, bandit } = fixture();
  const C = state.contracts;
  state.businesses.tea.owner = 'a'; tick();
  const business = C.board.find(j => j.business === 'tea');
  assert.ok(business, 'newly purchased business offers a job before dawn, even with the initial three rows full');
  assert.ok(C.board.every(j => !['home', 'clinic'].includes(j.business)));
  assert.ok(C.board.length <= 5);
  assert.ok(C.board.filter(j => j.target === 'a').length <= 2);
  take(business);
  const accepted = structuredClone(C.active.s);
  assert.ok(!C.board.some(j => j.target === 'a'), 'taking a job still clears its other clan jobs');
  state.businesses.shop.owner = 'b'; tick();
  assert.ok(C.board.some(j => j.business === 'shop'), 'another newly eligible clan appears during an active job');
  assert.deepEqual({ ...C.active.s, need: undefined, spot: undefined }, { ...accepted, need: undefined, spot: undefined }, 'active terms and progress stay unchanged');
  assert.ok(!C.board.some(j => j.target === 'a'), 'refresh does not undo the clan fairness swap');
  state.businesses.tea.owner = 'b'; tick();
  assert.ok(!C.active.s, 'business changing hands still fails its accepted job');
  assert.ok(C.board.every(j => j.business !== 'tea' || j.target === 'b'), 'stale ownership never remains on board');
  take(bandit()); tick([{ a: 's', t: 'wild', kill: true }]);
  assert.equal(C.board.filter(j => j.kind === 'bandits').length, 1);
  for (let i = 0; i < 40; i++) tick();
  assert.equal(C.board.filter(j => j.kind === 'bandits').length, 1, 'refresh never duplicates a replacement');
}
console.log('Contract refill: two earned bandit jobs per dawn, no drop exploit, live business eligibility, fairness and accepted reward locks ok');
