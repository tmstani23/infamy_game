// Tim 2026-11-07: the Vehicles panel commands (sim/vehicle_garage.js): recall to the nearest stable and store, take out; stored horses answer the whistle.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), U = data('data/units.json');
const SB = frontier.buildings.stable.stable, M = U.rules.mount;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, hero = S.entities[m.heroId], clan = S.clans.player;
const site = world.sites.find(s => Math.hypot(s.x - g.gate.island[0], s.z - g.gate.island[1]) > 700) || world.sites[0];
g.frontier.world.addTown({ id: 'tS', name: 'Stableton', owner: 'player', x: site.x, z: site.z, pop: 3, stock: { food: 500, goods: 300, timber: 400, stone: 200 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
const town = S.frontier.settlements.tS;
const cmd = c => g.step([{ id: hero.id, type: 'frontier', action: 'stable', town: 'tS', ...c }]);
Object.assign(hero, { place: 'world', x: site.x + 60, z: site.z + 60 });
g.step([]);   // the town gets its grid

// --- no stable: nothing to make ---------------------------------------------------------------------
const nearCell = s => { let best = -1, bd = Infinity; s.grid.use.split('').forEach((c, i) => { if (c !== '.') return; const [x, z] = g.frontier.stable.centre(s, { cell: i }), d = Math.hypot(x - s.x, z - s.z); if (d > 25 && d < bd) { bd = d; best = i; } }); return best; };
town.buildings.push({ id: 'st1', type: 'stable', cell: nearCell(town), stage: 'built' });
town.tier = 2; town.stock.timber = 2000; town.stock.goods = 2000; town.stock.food = 2000;
const [sx, sz] = g.frontier.stable.centre(town, town.buildings.at(-1));
cmd({ mode: 'horse', kind: 'calico' }); cmd({ mode: 'rickshaw' });
for (let t = 0; t < 120 * 20; t++) g.step([]);
const horse = Object.values(S.entities).find(e => e.type === 'horse' && e.horseOwner === 'player');
const rk = Object.values(S.entities).find(e => e.type === 'rickshaw' && e.omnibusOwner === 'player');
assert.ok(horse && rk, 'a horse and a rickshaw from the stable');
const gcmd = (action, unit) => g.step([{ id: hero.id, type: 'garage', action, unit }]);
// near: it heads back on its own, then is stored
Object.assign(rk, { x: sx + 120, z: sz + 20 });
gcmd('recall', rk.id);
assert.ok(rk.recall, 'on its way');
const d0 = Math.hypot(rk.x - sx, rk.z - sz);
for (let t = 0; t < 40; t++) g.step([]);
assert.ok(Math.hypot(rk.x - sx, rk.z - sz) < d0 - 10 || rk.stored, 'it drives toward the stable');
for (let t = 0; t < 20 * 20 && !rk.stored; t++) g.step([]);
assert.ok(rk.stored && rk.place === 'stable', 'stored at the stable');
assert.equal(g.frontier.stable.have('player', 'rickshaw'), 1, 'still counted in the room');
// far: stored at once; a rider gets off first
Object.assign(hero, { place: 'world', x: horse.x + 1, z: horse.z }); g.step([{ id: hero.id, type: 'mount', horse: horse.id }]);
assert.ok(hero.mounted, 'riding');
Object.assign(hero, { x: sx + 900, z: sz }); g.step([]);
gcmd('recall', horse.id);
assert.ok(!hero.mounted && horse.stored, 'got off; far away, so straight into the stable');
// take out: parked beside the stable
gcmd('takeout', rk.id);
assert.ok(!rk.stored && rk.place === 'world' && Math.hypot(rk.x - sx, rk.z - sz) < 25, 'out beside the stable');
// a stored horse answers her whistle
g.step([{ id: hero.id, type: 'mount', whistle: horse.id }]);
assert.ok(!horse.stored && horse.place === 'world' && Math.hypot(horse.x - hero.x, horse.z - hero.z) < 60 && horse.called === hero.id, 'called out of the stable: she gallops in');
delete horse.called;
// stuck: no closer for a few seconds, it is stored anyway
horse.recall = { town: 'tS', x: sx, z: sz, best: 1, tick: S.tick };
for (let t = 0; t < 6 * 20 + 2 && !horse.stored; t++) g.step([]);
assert.ok(horse.stored, 'stuck: stored anyway');
// Recall all (stable menu): everything not stored goes back; the rickshaw is out, the horse is stored already
gcmd('takeout', horse.id);
assert.ok(!horse.stored && !rk.stored, 'both out');
g.step([{ id: hero.id, type: 'garage', action: 'recallAll' }]);
assert.ok((horse.recall || horse.stored) && (rk.recall || rk.stored), 'Recall all sends both back');
for (let t = 0; t < 30 * 20 && !(horse.stored && rk.stored); t++) g.step([]);
assert.ok(horse.stored && rk.stored, 'both stored');
g.step([{ id: hero.id, type: 'garage', action: 'recallAll' }]);
assert.match(clan.notice?.text || '', /already in a stable/, 'nothing left out');
console.log('test_vehicle_garage: ok');
