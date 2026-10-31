import assert from 'node:assert/strict';
import { interactionDoor } from '../src/door_interaction.js';
const back = { ninja: true, place: 'shop' }, exit = { ninja: true, place: 'street' };
const service = { menu: 'clinic' };
let heroDoor = back, serviceCalls = 0;
const game = {
  doorNear(id) { assert.equal(id, 'hero'); return heroDoor; },
  serviceAt(id, menu, selected) {
    serviceCalls++;
    assert.equal(id, 'hero'); assert.equal(menu, null); assert.deepEqual(selected, ['crew']);
    return { actor: { id: 'crew' }, door: service };
  },
};
assert.equal(interactionDoor(game, 'hero', ['crew']), back, 'selected crew at remote clinic cannot divert hero rear entry');
heroDoor = exit;
assert.equal(interactionDoor(game, 'hero', ['crew']), exit, 'hero exit also takes precedence');
assert.equal(serviceCalls, 0, 'hero door avoids remote service lookup');
heroDoor = null;
assert.equal(interactionDoor(game, 'hero', ['crew']), service, 'remote selected crew can still use services');
game.serviceAt = () => null;
assert.equal(interactionDoor(game, 'hero', ['crew']), null);
console.log('Door interaction: hero rear entry/exit wins over remote selected service; crew services remain available');
