// Right-click/Tab assistance, explicit assignment protection and target marker roles.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { createCrewInput, targetMarkers } from '../src/crew_input.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const make = () => {
  const g = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units: data('data/units.json') });
  g.clans.addClan('player'); g.clans.addClan('rival');
  const hero = g.spawn('hero', 'ronin', -8, 1, { owner: 'player', hp: 100000, maxHp: 100000 });
  const recruit = () => g.spawn('thug', 'thug', -9, 1, { owner: 'player', order: { kind: 'follow', target: hero } });
  const foes = [-6, -2].map(x => g.spawn('thug', 'thug', x, 1, { owner: 'rival', hp: 100000, maxHp: 100000, order: { kind: 'stop' } }));
  return { g, hero, recruit, foes, S: g.state.entities };
};

{
  const { g, hero, recruit, foes, S } = make();
  const free = recruit(), tAssigned = recruit(), ctrlAssigned = recruit(), stationed = recruit(), locked = recruit(), passive = recruit(), healing = recruit();
  S[tAssigned].order = { kind: 'attack', target: foes[1], prev: { kind: 'follow', target: hero, slot: 1 } };
  S[ctrlAssigned].order = { kind: 'attack', target: foes[1] };
  S[stationed].order = { kind: 'station', x: -9, z: 1 };
  S[locked].locked = true;
  S[passive].order = { kind: 'stop' };
  S[healing].hp = 100;
  S[healing].order = { kind: 'heal', x: -20, z: 20 };
  g.step([{ id: hero, type: 'attack', target: foes[0], assist: true }]);
  assert.equal(S[free].order.target, foes[0]);
  assert.equal(S[free].order.assist, hero);
  assert.equal(S[tAssigned].order.target, foes[1]);
  assert.equal(S[ctrlAssigned].order.target, foes[1]);
  assert.equal(S[stationed].order.kind, 'station');
  assert.equal(S[locked].order.kind, 'follow');
  assert.equal(S[passive].order.kind, 'stop');
  assert.equal(S[healing].order.kind, 'heal');
  assert.deepEqual(targetMarkers(g.state, hero, foes[0]), [{ id: foes[0], kind: 'shared' }, { id: foes[1], kind: 'crew' }]);

  g.step([{ id: hero, type: 'attack', target: foes[1], assist: true }]);
  assert.equal(S[free].order.target, foes[1], 'automatic squad follows target changes');
  assert.equal(S[tAssigned].order.target, foes[1], 'T assignment stays put');
  assert.equal(S[ctrlAssigned].order.target, foes[1], 'Ctrl assignment stays put');
  const fresh = recruit();
  g.step();
  assert.equal(S[fresh].order.assist, hero, 'a newly available recruit joins the current attack');
  g.step([{ id: hero, type: 'stopattack' }]);
  assert.equal(S[free].order.kind, 'follow', 'automatic squad resumes its former orders');
  assert.equal(S[fresh].order.kind, 'follow');
  assert.equal(S[tAssigned].order.kind, 'attack', 'stopping the hero preserves manual assignments');
  assert.equal(S[ctrlAssigned].order.kind, 'attack');

  g.step([{ id: hero, type: 'attack', target: foes[0], assist: true }]);
  g.step([{ id: hero, type: 'order', units: [free], kind: 'attack', target: foes[1] }]);
  g.step([{ id: hero, type: 'attack', target: foes[0], assist: true }]);
  assert.equal(S[free].order.target, foes[1], 'a manual assignment replaces automatic assistance');
  assert.equal(S[free].order.assist, undefined);
  console.log('automatic assistance preserves T, Ctrl, station, lock, stop and heal orders');
}

// Exercise the actual input handlers with a minimal event surface, without a browser.
{
  const { g, hero, recruit, foes, S } = make();
  const mate = recruit(), queue = [], handlers = {};
  const previousEvents = globalThis.addEventListener, previousDocument = globalThis.document;
  globalThis.addEventListener = (type, fn) => (handlers[type] ||= []).push(fn);
  globalThis.document = { body: { style: {} } };
  const view = { setSelected() {}, buildingAt: () => null,
    unitToScreen: (x, z) => ({ x: 600 + (x - z) * 30, y: 400 + (x + z) * 15 - 30.6 }),
    screenToGround: (x, y) => ({ x: ((x - 600) / 30 + (y - 400) / 15) / 2, z: ((y - 400) / 15 - (x - 600) / 30) / 2 }) };
  try {
    const input = createCrewInput({ game: g, view, heroId: hero, send: c => queue.push(c), box: { style: {} } });
    const flush = () => { g.step(queue.splice(0)); };
    input.tab();
    assert.deepEqual(queue[0], { id: hero, type: 'attack', target: foes[0], assist: true });
    flush();
    assert.equal(S[hero].attackTarget, foes[0]);
    assert.equal(S[hero].swing?.target, foes[0], 'Tab starts the hero auto attack');
    assert.equal(S[mate].order.target, foes[0]);
    assert.deepEqual(input.markers(), [{ id: foes[0], kind: 'shared' }]);
    input.tab(); flush();
    assert.equal(S[hero].attackTarget, foes[1]);
    assert.equal(S[mate].order.target, foes[1]);
    input.select([mate]);
    input.crewAttack(); flush();
    assert.equal(S[mate].order.assist, undefined, 'T creates an independent assignment');
    input.tab(); flush();
    assert.equal(S[hero].attackTarget, foes[0]);
    assert.equal(S[mate].order.target, foes[1], 'Tab leaves a T target alone');
    assert.deepEqual(input.markers(), [{ id: foes[0], kind: 'hero' }, { id: foes[1], kind: 'crew' }]);
    input.crewAttack(); flush(); // second T releases its explicit assignment
    assert.equal(S[mate].order.assist, hero);
    const point = view.unitToScreen(S[foes[1]].x, S[foes[1]].z);
    const event = { button: 2, ctrlKey: true, clientX: point.x, clientY: point.y, target: { closest: () => null } };
    for (const fn of handlers.mousedown) fn(event);
    flush();
    assert.equal(S[mate].order.target, foes[1]);
    assert.equal(S[mate].order.assist, undefined, 'Ctrl-right-click stays independent');
    event.ctrlKey = false;
    for (const fn of handlers.mousedown) fn(event);
    flush();
    assert.equal(S[hero].attackTarget, foes[1]);
    assert.deepEqual(input.markers(), [{ id: foes[1], kind: 'shared' }], 'purple overrides red even for a manual crew assignment');
    const free = recruit();
    input.select([]);
    const other = view.unitToScreen(S[foes[0]].x, S[foes[0]].z);
    for (const fn of handlers.mousedown) fn({ ...event, clientX: other.x, clientY: other.y });
    flush();
    assert.equal(S[free].order.target, foes[0], 'right-click assists even when no crew is selected');
    assert.equal(S[mate].order.target, foes[1], 'right-click preserves the Ctrl assignment');
    S[hero].downed = true;
    assert.ok(input.markers().every(m => m.kind !== 'shared'), 'a downed hero is no longer sharing an attack');
    console.log('Tab, right-click, T toggle, Ctrl assignments and red/blue/purple marker roles ok');
  } finally { globalThis.addEventListener = previousEvents; globalThis.document = previousDocument; }
}
