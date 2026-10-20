// Crew lock (Tim 2026-10-20): crew sent into one of your businesses lock by themselves, and the
// 'lock' command locks / unlocks your own crew only. Run: node tools/test_crew_lock.mjs
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
assert.ok(S[a].locked && !S[b].locked, 'sent into the business: locked');
g.step([{ id: hero, type: 'lock', units: [b, foe], on: true }]);
assert.ok(S[b].locked && !S[foe].locked, 'L locks your own crew only');
g.step([{ id: hero, type: 'lock', units: [a, b], on: false }]);
assert.ok(!S[a].locked && !S[b].locked, 'and unlocks them');
console.log('crew lock ok');
