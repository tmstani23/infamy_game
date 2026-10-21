// Checks mouse picking of units (src/crew_input.js bodyDistance) against a stand-in
// orthographic iso view: node game/tools/test_picking.mjs
import assert from 'node:assert/strict';
import { bodyDistance } from '../src/crew_input.js';

// iso-ish orthographic camera: 30 px per unit across, height lifts things 34 px per unit
const S = 30, H = 34, view = {
  project: (x, y, z) => ({ x: 600 + (x - z) * S, y: 400 + (x + z) * S * 0.5 - y * H }),
  unitToScreen(x, z) { return this.project(x, 0.9, z); },
  screenToGround(px, py) { const a = (px - 600) / S, b = (py - 400) / (S * 0.5); return { x: (a + b) / 2, z: (b - a) / 2 }; },
};
const e = { x: 3, z: 1 };
const feet = view.project(3, 0, 1), centre = view.unitToScreen(3, 1), head = view.project(3, 1.8, 1);
assert.ok(bodyDistance(view, e, centre.x, centre.y) < 1, 'centre');
assert.ok(bodyDistance(view, e, feet.x, feet.y) < 1, 'feet count');
assert.ok(bodyDistance(view, e, head.x, head.y) < 1, 'head counts');
// the old pick (a circle round the centre) missed the head of a unit this size
assert.ok(Math.hypot(head.x - centre.x, head.y - centre.y) > 18, 'head is far from the centre');
assert.ok(bodyDistance(view, e, centre.x + 40, centre.y) > 30, 'beside it does not count');
assert.ok(bodyDistance(view, e, head.x, head.y - 60) > 30, 'well above it does not count');
console.log('picking tests passed');

// Tab targeting: nearest enemy first, then the next; never townsfolk, own crew or downed units
{
  const { readFileSync } = await import('node:fs');
  const { createGame } = await import('../src/sim/game.js');
  const { tabTarget, targetMarkers } = await import('../src/crew_input.js');
  const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
  const g = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), civilians: data('data/civilians.json') });
  g.clans.addClan('player'); g.clans.addClan('kuroda', { bot: true });
  const S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', 0, 1, { owner: 'player' });
  g.spawn('thug', 'thug', 1, 1, { owner: 'player' });
  g.civilians.add('merchant', 1.5, 1);
  const near = g.spawn('thug', 'thug', 3, 1, { owner: 'kuroda' }), next = g.spawn('thug', 'thug', 6, 1, { owner: 'kuroda' });
  const down = g.spawn('thug', 'thug', 2, 1, { owner: 'kuroda' }); S[down].downed = true;
  g.spawn('thug', 'thug', 30, 1, { owner: 'kuroda' });                     // too far
  assert.equal(tabTarget(g.state, hero, undefined), near, 'nearest enemy first');
  assert.equal(tabTarget(g.state, hero, near), next, 'then the next');
  assert.equal(tabTarget(g.state, hero, next), near, 'and round again');
  assert.equal(tabTarget(g.state, hero, undefined, e => e.id !== near), next, 'skips one hidden in the fog');
  g.step([{ id: hero, type: 'attack', target: tabTarget(g.state, hero) }]);
  assert.equal(S[hero].attackTarget, near, 'it locks the hero on');
  // Marker roles: hero/Tab red, independent crew blue, shared attacks purple.
  const mate = Object.values(S).find(e => e.owner === 'player' && e.type === 'thug').id;
  S[hero].attackTarget = undefined;
  assert.deepEqual(targetMarkers(g.state, hero, next), [{ id: next, kind: 'tab' }]);
  S[mate].order = { kind: 'attack', target: near };
  assert.deepEqual(targetMarkers(g.state, hero, next), [{ id: next, kind: 'tab' }, { id: near, kind: 'crew' }]);
  S[hero].attackTarget = next;
  assert.deepEqual(targetMarkers(g.state, hero, next), [{ id: next, kind: 'hero' }, { id: near, kind: 'crew' }], 'tabbed turns red once attacked');
  S[hero].attackTarget = near;
  assert.deepEqual(targetMarkers(g.state, hero, null), [{ id: near, kind: 'shared' }], 'shared crew/hero target is purple');
  console.log('tab targeting ok');
}
