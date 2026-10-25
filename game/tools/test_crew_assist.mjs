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
  const free = recruit(), tAssigned = recruit(), ctrlAssigned = recruit(), stationed = recruit(), passive = recruit(), healing = recruit();
  const selected = [free, tAssigned, ctrlAssigned, stationed, passive, healing];
  S[tAssigned].order = { kind: 'attack', target: foes[1], prev: { kind: 'follow', target: hero, slot: 1 } };
  S[ctrlAssigned].order = { kind: 'attack', target: foes[1] };
  S[stationed].order = { kind: 'station', x: -9, z: 1 };
  S[passive].order = { kind: 'stop' };
  S[healing].hp = 100;
  S[healing].order = { kind: 'heal', x: -20, z: 20 };
  g.step([{ id: hero, type: 'attack', target: foes[0], assist: true, units: selected }]);
  assert.equal(S[free].order.target, foes[0]);
  assert.equal(S[free].order.assist, hero);
  assert.equal(S[tAssigned].order.target, foes[1]);
  assert.equal(S[ctrlAssigned].order.target, foes[1]);
  assert.equal(S[stationed].order.kind, 'station');
  assert.equal(S[passive].order.kind, 'stop');
  assert.equal(S[healing].order.kind, 'heal');
  assert.deepEqual(targetMarkers(g.state, hero, foes[0]), [{ id: foes[0], kind: 'shared' }, { id: foes[1], kind: 'crew' }]);

  g.step([{ id: hero, type: 'attack', target: foes[1], assist: true, units: selected }]);
  assert.equal(S[free].order.target, foes[1], 'automatic squad follows target changes');
  assert.equal(S[tAssigned].order.target, foes[1], 'T assignment stays put');
  assert.equal(S[ctrlAssigned].order.target, foes[1], 'Ctrl assignment stays put');
  const fresh = recruit();
  g.step();
  assert.equal(S[fresh].order.assist, undefined, 'a new unselected recruit never joins the current attack');
  g.step([{ id: hero, type: 'stopattack' }]);
  assert.equal(S[free].order.kind, 'move', 'automatic squad holds after combat');
  assert.equal(S[fresh].order.kind, 'follow');
  assert.equal(S[tAssigned].order.kind, 'attack', 'stopping the hero preserves manual assignments');
  assert.equal(S[ctrlAssigned].order.kind, 'attack');

  g.step([{ id: hero, type: 'attack', target: foes[0], assist: true, units: selected }]);
  g.step([{ id: hero, type: 'order', units: [free], kind: 'attack', target: foes[1] }]);
  g.step([{ id: hero, type: 'attack', target: foes[0], assist: true, units: selected }]);
  assert.equal(S[free].order.target, foes[1], 'a manual assignment replaces automatic assistance');
  assert.equal(S[free].order.assist, undefined);
  console.log('automatic assistance preserves T, Ctrl, station, stop and heal orders');
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
    input.select([mate]);
    input.tab();
    assert.deepEqual(queue[0], { id: hero, type: 'attack', target: foes[0] });
    assert.deepEqual(queue[1], { id: hero, type: 'order', place: 'street', units: [mate], kind: 'attack', target: foes[0] });
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
    assert.equal(S[mate].order.assist, undefined, 'Tab orders no longer leash crew to hero');
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
    assert.equal(S[free].order.kind, 'follow', 'right-click never recruits unselected crew');
    assert.equal(S[mate].order.target, foes[1], 'right-click preserves the Ctrl assignment');
    input.select([free]); input.target(foes[0]); flush();
    g.state.clans.rival.kind = 'ninja';
    const hidden = S[foes[0]];
    g.state.smokes = [{ clan: 'rival', place: hidden.place, x: hidden.x, z: hidden.z, r: 3, until: g.state.tick + 200 }];
    flush();
    assert.ok(hidden.hidden, 'enemy enters friendly smoke');
    assert.equal(S[hero].attackTarget, undefined, 'hero loses the hidden target');
    assert.equal(S[hero].swing, undefined, 'hidden target cancels the windup');
    assert.notEqual(S[free].order.target, hidden.id, 'assisting crew releases the hidden target');
    assert.ok(input.markers().every(m => m.id !== hidden.id), 'hidden marker and local tab target disappear');
    g.state.smokes = []; hidden.hidden = false; hidden.revealUntil = g.state.tick + 100;
    flush();
    assert.equal(S[hero].attackTarget, undefined, 'reveal does not restore the old lock');
    assert.ok(input.markers().every(m => m.id !== hidden.id), 'reveal does not restore the old indicator');
    S[hero].downed = true;
    assert.ok(input.markers().every(m => m.kind !== 'shared'), 'a downed hero is no longer sharing an attack');
    console.log('Tab, right-click, T toggle, Ctrl assignments and red/blue/purple marker roles ok');
  } finally { globalThis.addEventListener = previousEvents; globalThis.document = previousDocument; }
}
