// Crew orders work inside a room the same as on the street (Tim 2026-10-18: indoors you
// could not send crew anywhere or set them on anyone): node game/tools/test_indoor_orders.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json');
const g = createGame({
  district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units,
});
const run = (n, cmds = []) => { g.step(cmds); for (let i = 1; i < n; i++) g.step(); };
const E = g.state.entities;
g.clans.addClan('player');
g.clans.addClan('kuroda', { bot: true });
const tea = Object.values(g.state.businesses).find(b => b.kind === 'teahouse');
const door = g.doors.find(d => d.place === tea.room);
const hero = g.spawn('hero', 'ronin', tea.door[0], tea.door[1], { owner: 'player' });
const ids = [g.spawn('thug', 'thug', tea.door[0] + 1, tea.door[1], { owner: 'player' }), g.spawn('thug', 'thug', tea.door[0] - 1, tea.door[1], { owner: 'player' })];

// Hero takes both crew in
run(1, [{ id: hero, type: 'use', units: ids }]);
assert.equal(E[hero].place, tea.room);
assert.ok(ids.every(id => E[id].place === tea.room), 'crew came in');

// Move order inside the room: they go there (no street walk grid needed)
const [sx, sz] = [door.to.x, door.to.z];
const gx = sx + 1.5, gz = sz - 1;
run(1, [{ id: hero, type: 'order', units: ids, kind: 'move', x: gx, z: gz }]);
assert.ok(ids.every(id => E[id].order?.kind === 'move'), 'move order taken indoors');
assert.ok(ids.every(id => Math.hypot(E[id].order.x - gx, E[id].order.z - gz) < 1.5), 'goal near the click');
const before = ids.map(id => Math.hypot(E[id].x - gx, E[id].z - gz));
run(40);
ids.forEach((id, k) => assert.ok(Math.hypot(E[id].x - gx, E[id].z - gz) < before[k], `crew ${k} walked toward the spot`));
assert.ok(ids.every(id => E[id].place === tea.room), 'still inside');

// Ctrl + right-click: hold the spot
run(1, [{ id: hero, type: 'order', units: [ids[0]], kind: 'station', x: sx, z: sz }]);
assert.equal(E[ids[0]].order.kind, 'station');

// Attack an enemy in the room
const foe = g.spawn('thug', 'thug', sx, sz + 1, { owner: 'kuroda' });
Object.assign(E[foe], { place: tea.room, x: sx + 0.5, z: sz });
const hp0 = E[foe].hp;
run(1, [{ id: hero, type: 'order', units: ids, kind: 'attack', target: foe }]);
assert.ok(ids.every(id => E[id].order?.kind === 'attack' && E[id].order.target === foe), 'attack order taken indoors');
run(60);
assert.ok(E[foe].hp < hp0 || E[foe].downed || E[foe].dead, 'crew hit the enemy indoors');

// Attack-move and follow indoors too
run(1, [{ id: hero, type: 'order', units: ids, kind: 'attackmove', x: sx, z: sz }]);
assert.ok(ids.every(id => ['attackmove', 'attack'].includes(E[id].order?.kind) || E[id].downed || E[id].dead));
run(1, [{ id: hero, type: 'order', units: ids, kind: 'follow' }]);
assert.ok(ids.filter(id => !E[id].downed && !E[id].dead).every(id => E[id].order.kind === 'follow'));

// Crew out on the street are not ordered from inside (different place)
const out = g.spawn('thug', 'thug', tea.door[0] + 2, tea.door[1] + 2, { owner: 'player' });
run(1, [{ id: hero, type: 'order', units: [out], kind: 'move', x: sx, z: sz }]);
assert.notEqual(E[out].order?.kind, 'move');

console.log('indoor orders ok');
