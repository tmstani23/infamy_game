// Legacy lock regression: entering a business no longer locks crew or prevents orders.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const g = createGame({
  district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: { ...data('data/settings.json'), dayNight: { auto: false } },
});
const S = g.state.entities;
g.clans.addClan('player', { name: 'Your clan' });
g.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
const tea = Object.values(g.state.businesses).find(b => b.kind === 'teahouse');
g.clans.setOwner(tea.id, 'player');
const hero = g.spawn('hero', 'ronin', tea.ring[0], tea.ring[1], { owner: 'player' });
const [a, b] = [0, 1].map(i => g.spawn('thug', 'thug', tea.ring[0] + i * 0.6, tea.ring[1] + 0.6, { owner: 'player' }));
const foe = g.spawn('thug', 'thug', tea.ring[0] + 3, tea.ring[1], { owner: 'kuroda' });
g.step([{ id: hero, type: 'order', units: [a], kind: 'enter', business: tea.id }]);
assert.ok(!S[a].locked && !S[b].locked, 'entering a business never locks crew');
g.step([{ id: hero, type: 'lock', units: [b, foe], on: true }]);
assert.ok(!S[b].locked && !S[foe].locked, 'retired lock commands have no effect');
for (let i = 0; i < 600 && S[a].place !== tea.room; i++) g.step();
assert.equal(S[a].place, tea.room, 'crew enters the business');
const room = g.rooms.find(r => r.name === tea.room);
Object.assign(S[hero], { place: room.name, x: room.spawn.x, z: room.spawn.z });
g.step([{ id: hero, type: 'order', units: [a], kind: 'move', x: room.spawn.x + 1, z: room.spawn.z }]);
assert.equal(S[a].order.kind, 'move', 'crew remains commandable when hero enters afterwards');
console.log('retired locks and indoor crew commands ok');
