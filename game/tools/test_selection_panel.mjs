// Selection panel wording: what each crew member is shown doing, read from real game states.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { unitStatus, unitName } from '../src/selection_panel.js';

const data = f => JSON.parse(fs.readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json'), district = data('data/waterfront.json');
const g = createGame({
  district, catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units,
});
g.clans.addClan('player', { name: 'Your clan' });
const S = g.state.entities;
const [hx, hz] = district.spawns.hero;
const hero = g.spawn('hero', 'ronin', hx, hz, { owner: 'player' });
const a = g.spawn('thug', 'thug', hx + 1, hz, { owner: 'player' });

assert.equal(unitName(units, 'thug'), 'Thug');
assert.equal(unitName(units, 'rifleman'), 'Rifleman');
assert.equal(unitStatus(S[a], g.state), 'Idle');
g.step([{ id: hero, type: 'order', units: [a], kind: 'follow' }]);
assert.equal(unitStatus(S[a], g.state), 'Following');
g.step([{ id: hero, type: 'order', units: [a], kind: 'move', x: hx + 4, z: hz }]);
g.step([]);
assert.equal(unitStatus(S[a], g.state), 'Moving');
for (let i = 0; i < 200; i++) g.step([]);
assert.equal(unitStatus(S[a], g.state), 'Idle', 'arrived');
g.step([{ id: hero, type: 'order', units: [a], kind: 'station', x: hx + 4, z: hz }]);
for (let i = 0; i < 20; i++) g.step([]);
assert.equal(unitStatus(S[a], g.state), 'Holding');
assert.equal(unitStatus({ ...S[a], order: { kind: 'attackmove' } }, g.state), 'Attack-moving');
assert.equal(unitStatus({ ...S[a], order: { kind: 'heal' } }, g.state), 'Going to clinic');
assert.equal(unitStatus({ ...S[a], swing: {} }, g.state), 'Fighting');
assert.equal(unitStatus({ ...S[a], downed: true }, g.state), 'Downed');
S[hero].execute = { target: a };
assert.equal(unitStatus({ ...S[a], downed: true }, g.state), 'Being finished off');
console.log('selection panel ok');
