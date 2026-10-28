// Node check for the unit frames' target pick and colours (game/src/unit_frames.js)
import assert from 'node:assert/strict';
import { frameTarget, relation, frameStatus } from '../src/unit_frames.js';

const E = (id, o) => ({ id, place: 'street', hp: 100, maxHp: 100, ...o });
const state = { tick: 0, entities: {
  h: E('h', { type: 'hero', owner: 'player', attackTarget: 'r' }),
  c: E('c', { type: 'swordsman', owner: 'player' }),
  r: E('r', { type: 'hero', owner: 'rival', swing: { target: 'h' } }),
  p: E('p', { type: 'junsa', owner: 'police' }),
  b: E('b', { type: 'bandit', owner: 'bandits' }),
  t: E('t', { type: 'civilian', civ: 'geisha' }),
  d: E('d', { type: 'thug', owner: 'rival', dead: true }),
  in: E('in', { type: 'thug', owner: 'rival', place: 'teahouse' }),
} };
const S = state.entities;

// a lone left-clicked unit beats the hero's attack target; own crew selected doesn't count
assert.equal(frameTarget(state, 'h', ['p'], null), 'p');
assert.equal(frameTarget(state, 'h', ['c'], null), 'r');
assert.equal(frameTarget(state, 'h', ['c', 'p'], null), 'r');
// then the hero's target, then the Tab target; dead, other-room and unseen units are skipped
assert.equal(frameTarget(state, 'h', [], 'b'), 'b', 'explicit Tab focus beats the previous attack target');
S.h.attackTarget = null;
assert.equal(frameTarget(state, 'h', [], 'b'), 'b');
assert.equal(frameTarget(state, 'h', ['d'], null), null);
assert.equal(frameTarget(state, 'h', ['in'], null), null);
assert.equal(frameTarget(state, 'h', ['p'], null, e => e.id !== 'p'), null);

assert.equal(relation(S.h, S.h).kind, 'you');
assert.equal(relation(S.c, S.h).kind, 'crew');
assert.equal(relation(S.r, S.h).tag, 'Rival clan');
assert.equal(relation(S.p, S.h).tag, 'Police');
assert.equal(relation(S.b, S.h).kind, 'neutral');
assert.equal(relation(S.t, S.h).tag, 'Townsfolk');

assert.equal(frameStatus(S.r, state, 'h'), 'Attacking you');
assert.equal(frameStatus(S.p, state, 'h'), 'Idle');
console.log('unit frames ok');
