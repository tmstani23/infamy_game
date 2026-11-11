// Interior view: which rooms may be looked into, and who the camera follows there.
import assert from 'node:assert/strict';
import { peekRoom } from '../src/interior_peek.js';
const state = { entities: {
  h: { id: 'h', type: 'hero', owner: 'player', place: 'world' },
  a: { id: 'a', type: 'thug', owner: 'player', place: 'teahouse' },
  g: { id: 'g', type: 'thug', owner: 'player', place: 'den', guard: true },
  d: { id: 'd', type: 'thug', owner: 'player', place: 'inn', dead: true },
  r: { id: 'r', type: 'thug', owner: 'rival', place: 'warehouse' },
} };
const peek = (room, heroPlace = 'world') => peekRoom(state, {}, 'player', heroPlace, room);
assert.equal(peek('teahouse')?.id, 'a', 'crew inside: follow them');
assert.equal(peek('den')?.id, 'g', 'only a guard inside: still viewable');
assert.equal(peek('inn'), null, 'dead crew do not open a room');
assert.equal(peek('warehouse'), null, 'rival-only rooms stay closed');
assert.equal(peek('street'), null); assert.equal(peek('world'), null); assert.equal(peek(null), null);
assert.equal(peek('teahouse', 'teahouse'), null, 'the hero is in that room himself: nothing to switch');
console.log('interior peek ok');
