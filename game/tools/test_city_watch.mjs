// Watch the city (Tim 2026-11-08): while the boss is on the island, { type: 'watchCity', on } makes the capital think at full speed and drops crew orders.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const settings = data('data/settings.json');
const o = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'), interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'),
  recipes: data('data/room_recipes.json'), units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json') };
const g = createGame(o);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: o.district.spawns, test: { playerRyo: 3000 }, seed: 9 });
const hero = g.state.entities[m.heroId], gate = g.doors.find(d => d.gate && d.place === 'world');
Object.assign(hero, { place: 'world', x: gate.to.x, z: gate.to.z });
g.step([]); g.step([]);
assert.equal(g.cityAway(), true, 'boss on the island: city is away (throttled)');
g.step([{ id: hero.id, type: 'watchCity', on: true }]); g.step([]);
assert.equal(g.cityAway(), false, 'watching: the city thinks at full speed');
g.step([{ id: hero.id, type: 'order', place: 'street', kind: 'move', units: [], x: 0, z: 0 }]);   // dropped, must not throw
g.step([{ id: hero.id, type: 'watchCity', on: false }]); g.step([]);
assert.equal(g.cityAway(), true, 'back to the hero: away again');
console.log('city watch ok');
