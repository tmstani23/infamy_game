import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRewards } from '../src/sim/rewards.js';
import { createHQRaidEffects } from '../src/sim/hq_raids.js';

const settings = JSON.parse(readFileSync(new URL('../data/settings.json', import.meta.url)));
const make = () => {
  const state = { tick: 50, news: [], casts: [], ryoGains: [], ryoLosses: [], entities: {},
    clans: { p: { id: 'p', kind: 'yakuza', ryo: 0 }, s: { id: 's', kind: 'ninja', ryo: 1000, renown: 0 } },
    businesses: { hq: { id: 'hq', hideout: 's', owner: 's' } } };
  return { state, rewards: createRewards(state, { propertyRenown: settings.rewards.renown }) };
};
{
  const { state, rewards } = make();
  rewards.renownTick([{ kind: 'raidWon', raider: 'p' }, { kind: 'shakedownSuccess', clan: 'p' }]);
  assert.equal(state.clans.p.renown, 110, 'business raid 75 plus Shakedown 35');
  rewards.renownTick([{ kind: 'raidWon', raider: 's' }, { kind: 'shakedownSuccess', clan: 's' }, { kind: 'sweepSuccess', clan: 's', ryo: 500 }]);
  assert.equal(state.clans.s.renown, 0, 'property Renown never pays Shinobi');
}
{
  const { state, rewards } = make();
  const sweep = ryo => rewards.renownTick([{ kind: 'sweepSuccess', clan: 'p', ryo }]);
  // sweep.js calls claimSweep only after encountering two rival units. An empty
  // completion carries zero cash and must never grant Renown from its news.
  sweep(0); sweep(undefined);
  assert.equal(state.clans.p.renown || 0, 0, 'empty/unpaid Sweeps grant no Renown');
  const baseline = rewards.sectorClaim('p', 'town').sequence;
  sweep(rewards.claimSweep('p', 'town', baseline));
  assert.equal(state.clans.p.renown, 50, 'qualifying Sweep earns 50');
  assert.equal(state.clans.p.ryo, 500);
  sweep(rewards.claimSweep('p', 'town', baseline));
  assert.equal(state.clans.p.renown, 50, 'cooldown Sweep grants no further Renown');
  state.tick += 180 * 20;
  sweep(rewards.claimSweep('p', 'town', rewards.sectorClaim('p', 'town').sequence));
  assert.equal(state.clans.p.renown, 100, 'existing three-minute cooldown reopens claim');
}
{
  const { state, rewards } = make();
  const unit = (id, owner) => ({ id, owner, type: 'hero', place: 'street', maxHp: 100, x: 0, z: 0 });
  state.entities = { p: unit('p', 'p'), a: unit('a', 's'), b: unit('b', 's') };
  const baseline = rewards.sectorClaim('p', 'town').sequence;
  rewards.sectorTick(() => 'town');
  state.entities.a.dead = state.entities.b.dead = true;
  rewards.sectorTick(() => 'town');
  assert.equal(state.clans.p.ryo, 200);
  const topup = rewards.claimSweep('p', 'town', baseline);
  assert.equal(topup, 300, 'ordinary clear contributes to Sweep cash total');
  rewards.renownTick([{ kind: 'sweepSuccess', clan: 'p', ryo: topup }]);
  assert.equal(state.clans.p.renown, 50, 'paid top-up qualifies once');
  assert.equal(rewards.claimSweep('p', 'town', baseline), 0, 'top-up cannot be repeated');
  assert.equal(state.clans.p.ryo, 500);
}
{
  const { state, rewards } = make();
  state.news = [{ kind: 'hqRaidWon', at: state.tick, business: 'hq', raider: 'p', defender: 's' },
    { kind: 'raidWon', hq: true, business: 'hq', raider: 'p', defender: 's' }];
  createHQRaidEffects({ state }).tick();
  rewards.renownTick([...state.news]);
  assert.equal(state.clans.p.raidPoints, 2, 'HQ retains separate two-point reward');
  assert.equal(state.clans.p.renown || 0, 0, 'HQ grants no extra business-raid Renown');
}
console.log('Property rewards: 75 raid/35 Shakedown/50 qualifying Sweep, empty/cooldown/top-up gates and HQ two points without extra Renown passed');
