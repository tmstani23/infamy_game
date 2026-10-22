import assert from 'node:assert/strict';
import { rewardPopups } from '../src/ryo_badge.js';
const state = { ryoGains: [
  { clan: 's', amount: 50, target: 'crew', reason: 'Rival crew executed' },
  { clan: 's', amount: 400, target: 'boss', reason: 'Contract' },
  { clan: 'rival', amount: 50, target: 'other', reason: 'Rival reward' }],
  news: [
    { kind: 'combatRenown', clan: 's', target: 'crew', amount: 2 },
    { kind: 'combatRenown', clan: 's', target: 'boss', amount: 8 },
    { kind: 'contractDone', clan: 's', renown: 40 },
    { kind: 'combatRenown', clan: 's', target: 'no-bounty', amount: 8, reason: 'Rival leader defeated' },
    { kind: 'combatRenown', clan: 'rival', target: 'other', amount: 8 }] };
const popups = rewardPopups(state, 's');
assert.deepEqual(popups.map(g => [g.amount, g.renown]), [[50, 2], [400, 48], [0, 8]]);
assert.ok(state.ryoGains.every(g => g.renown === undefined), 'UI grouping never mutates simulation events');
assert.deepEqual(rewardPopups({ news: [{ kind: 'contractDone', clan: 's', renown: 25 }], ryoGains: [] }, 's').map(g => [g.amount, g.renown]), [[0, 25]], 'zero-treasury contract still shows Renown');
assert.equal(rewardPopups({ news: [], ryoGains: [] }, 's').length, 0);
console.log('Reward popups: paired crew/boss/contract rewards, Renown-only payouts, clan filtering and immutable events ok');
