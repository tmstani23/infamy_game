// A deliberate move reaches its destination before retaliation/hero assistance.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
function setup() {
  const g = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units: data('data/units.json') });
  g.clans.addClan('player'); g.clans.addClan('kuroda');
  const hero = g.spawn('hero', 'ronin', -5, 5, { owner: 'player' });
  const id = g.spawn('thug', 'thug', 0, 1, { owner: 'player', hp: 2000, maxHp: 2000, order: { kind: 'station', x: 0, z: 1 } });
  const foe = g.spawn('brute', 'brute', -1.3, 1, { owner: 'kuroda', hp: 10000, maxHp: 10000, order: { kind: 'attack', target: id } });
  return { g, hero, id, foe, u: g.state.entities[id] };
}
{
  const { g, hero, id, foe, u } = setup();
  g.step([{ id: hero, type: 'order', units: [id], kind: 'attack', target: foe }]);
  for (let i = 0; i < 30 && !u.swing; i++) g.step();
  assert.ok(u.swing, 'crew are actually in an attack wind-up before the move');
  let received = 0;
  g.step([{ id: hero, type: 'order', units: [id], kind: 'move', x: -12, z: 1 },
    { id: hero, type: 'attack', target: foe, assist: true, units: [id] }]);
  const target = [u.order.x, u.order.z];
  for (let i = 0; i < 120 && !u.order.arrived; i++) {
    assert.equal(u.order.kind, 'move', 'hero target cannot replace a pending move');
    assert.ok(!u.swing, 'move cancels the old wind-up and blocks new attacks');
    assert.ok(!g.state.hits.some(h => h.a === id), 'no outgoing crew damage while moving');
    received += g.state.hits.filter(h => h.t === id).length;
    g.step();
  }
  assert.ok(received > 0, 'crew took actual hits while moving');
  assert.ok(u.order.arrived, 'crew arrive despite those hits');
  assert.ok(Math.hypot(u.x - target[0], u.z - target[1]) < .25, 'reaches the actual movement destination');
  g.step();
  assert.equal(u.order.kind, 'attack');
  assert.equal(u.order.assist, hero, 'automatic hero assistance resumes after arrival');
}
{
  const { g, hero, id, foe, u } = setup();
  // The old .6 combat threshold was larger than the .25 arrival threshold.
  u.hitBy = { id: foe, tick: g.state.tick };
  g.step([{ id: hero, type: 'order', units: [id], kind: 'move', x: -.5, z: 1 }]);
  assert.ok(!u.swing && !u.order.arrived);
  for (let i = 0; i < 15 && !u.order.arrived; i++) { assert.ok(!u.swing); g.step(); }
  assert.ok(u.order.arrived, 'short move finishes before retaliation');
  let hit = false;
  for (let i = 0; i < 100 && !hit; i++) { g.step(); hit = g.state.hits.some(h => h.a === id); }
  assert.ok(hit, 'normal retaliation resumes after arrival');
}
{
  const { g, hero, id, u } = setup();
  g.step([{ id: hero, type: 'order', units: [id], kind: 'attackmove', x: -12, z: 1 }]);
  let fought = false;
  for (let i = 0; i < 80 && !fought; i++) { g.step(); fought = !!u.swing; }
  assert.ok(fought && !u.downed, 'attack-move still stops to fight on the way');
}
console.log('plain move under fire, wind-up cancellation, arrival, hero assistance and attack-move ok');
