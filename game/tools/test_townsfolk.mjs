// Townsfolk in frontier towns (Tim 2026-11-07): sim/frontier/townsfolk.js. Run: node game/tools/test_townsfolk.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json') });
const g = createGame(options());
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 1000 } });
const hero = g.state.entities[m.heroId];
Object.assign(hero, { x: 3000, z: 3000, place: 'world' });
const w = g.frontier.world;
w.addTown({ id: 'tw', name: 'T', region: null, owner: 'player', x: 3000, z: 3000, site: null, traits: { soil: 2, water: 2, defense: 2, nodes: {} },
  pop: 40, stock: { food: 500, timber: 200, stone: 30 }, buildings: [{ type: 'town_hall', cell: 0 }, { type: 'farm', cell: 1 }] });
const t = w.settlement('tw'), T = data('data/frontier.json').townsfolk;
const folk = () => Object.values(g.state.entities).filter(e => e.townsfolk === 'tw' && !e.dead);
const run = n => { for (let i = 0; i < n; i++) g.step([]); };
g.state.night = false;
run(20 * 8);
const want = Math.min(T.max[t.tier || 1], Math.floor(t.pop / T.perPeople));
assert.ok(want > 0, 'the test town wants townsfolk');
assert.equal(folk().length, want, `one per ${T.perPeople} people up to the tier cap (${folk().length} / ${want})`);
assert.ok(folk().every(e => e.seenBy === 'player' && e.type === 'civilian' && e.place === 'world'), 'decoration: ownerless civilians your fog shows');
const start = folk().map(e => [e.x, e.z]);
run(20 * 15);
assert.ok(folk().some((e, i) => !start[i] || Math.hypot(e.x - start[i][0], e.z - start[i][1]) > 1), 'they wander');
// night: everyone goes back to the hall and in
g.state.night = true;
run(20 * 60);
assert.equal(folk().length, 0, 'gone in at night');
g.state.night = false;
run(20 * 8);
assert.equal(folk().length, want, 'out again by day');
// nobody near: none drawn
Object.assign(hero, { x: 3000 + T.viewRadius + 200, z: 3000 });
for (const e of Object.values(g.state.entities)) if (e.owner === 'player' && e.id !== hero.id && e.place === 'world') e.x += 2000;
run(5);
assert.equal(folk().length, 0, 'none while no unit of yours is near');
console.log('test_townsfolk: ok');
