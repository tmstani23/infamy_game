// Frontier W3.2: the island as a walkable place (sim/areas.js) inside the sim.
// The city grids are untouched, island paths never enter the city, island and city units never see
// each other, a crew order walks on the island, and long island paths are refined near and coarse beyond.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), worldChunks = data('data/world_chunks.json');
const base = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units: data('data/units.json') });
function fixture(withWorld) {
  const g = createGame({ ...base(), ...(withWorld ? { world, worldChunks } : {}) });
  g.clans.addClan('player', { faction: 'yakuza', kind: 'yakuza', bot: false });
  g.clans.addClan('rival');
  const hero = g.state.entities[g.spawn('hero', 'ronin', -8, 1, { owner: 'player', holdFire: true })];
  return { g, hero };
}

// 1. the city's walk grid is identical with and without the island
const A = fixture(false).g, { g, hero } = fixture(true);
assert.equal(A.areas, null, 'no island without world data');
const b = data('data/port_town.json').bounds;
for (let x = b.minX; x < b.maxX; x += 0.5) for (let z = b.minZ; z < b.maxZ; z += 0.5)
  if (A.nav.free(x, z) !== g.nav.free(x, z)) assert.fail(`city grid differs at ${x},${z}`);

// 2. a hero out on the island; chunks load around him only
const city = g.areas.city;
const out = { x: city.minX - 40, z: (city.minZ + city.maxZ) / 2 };
Object.assign(hero, { place: 'world', x: out.x, z: out.z });
g.step([]);
assert.equal(g.areas.active().length, 9, '3 x 3 chunks around the hero');
// a path that has to go round the city never enters it
const north = g.areas.nav.nearestFree(city.minX - 12, (city.minZ + city.maxZ) / 2), south = g.areas.nav.nearestFree(city.minX + 90, city.maxZ + 15);   // west of the wall, then south of it
const path = g.areas.nav.findPath(...north, ...south);
assert.ok(path && path.length > 1, 'path round the city');
let [px, pz] = north;
for (const [x, z] of path) {
  for (let t = 0; t <= 1; t += 0.02) {
    const sx = px + (x - px) * t, sz = pz + (z - pz) * t;
    assert.ok(!(sx > city.minX && sx < city.maxX && sz > city.minZ && sz < city.maxZ), 'island path never crosses the city');
  }
  [px, pz] = [x, z];
}

// 3. sight: a rival on the island at the very same numbers as a city unit is not seen from the city
const rival = g.state.entities[g.spawn('hero', 'rival_yakuza', 0, 0, { owner: 'rival', holdFire: true })];
const cityCrew = g.state.entities[g.spawn('thug', 'thug', 3, 3, { owner: 'player', holdFire: true })];
Object.assign(rival, { place: 'world', x: cityCrew.x, z: cityCrew.z });
assert.equal(g.vision.canSee('player', rival), false, 'a city unit never sees onto the island');
const sightNow = !g.state.night && worldChunks.sight.dayRange ? worldChunks.sight.dayRange : worldChunks.sight.range;   // day sight is dayRange
Object.assign(rival, { x: hero.x + sightNow - 2, z: hero.z });
assert.equal(g.vision.canSee('player', rival), true, 'the hero sees a rival close by on the island');
Object.assign(rival, { x: hero.x + sightNow + 5 });
assert.equal(g.vision.canSee('player', rival), false, 'out of range on the island');
Object.assign(cityCrew, { x: 0, z: 0 });
rival.x = 0; rival.z = 0; rival.place = 'street';
assert.equal(g.vision.canSee('rival', hero), false, 'a city unit never sees the hero on the island');
g.removeUnit?.(rival.id); rival.dead = true;

// 4. crew walk on the island: an order to a spot 150 units away gets there
const crew = g.state.entities[g.spawn('thug', 'thug', 0, 0, { owner: 'player', holdFire: true })];
Object.assign(crew, { place: 'world', x: hero.x - 3, z: hero.z + 2 });
const goal = g.areas.nav.nearestFree(hero.x - 150, hero.z + 60);
g.step([{ id: hero.id, type: 'order', units: [crew.id], kind: 'move', x: goal[0], z: goal[1] }]);
for (let k = 0; k < 20 * 60 && Math.hypot(crew.x - goal[0], crew.z - goal[1]) > 1.5; k++) g.step([]);
assert.ok(Math.hypot(crew.x - goal[0], crew.z - goal[1]) <= 1.5, `crew reached the island spot (at ${crew.x.toFixed(1)},${crew.z.toFixed(1)})`);
assert.equal(crew.place, 'world');

// 5. a long trip is refined near and coarse beyond, and the unit keeps going past the first part
const far = world.sites.reduce((a, s) => (s.x < a.x ? s : a));
const long = g.areas.nav.findPath(crew.x, crew.z, far.x, far.z);
assert.ok(long && long.replanAt > 0, 'long path has a coarse remainder');
const startX = crew.x;
g.step([{ id: hero.id, type: 'order', units: [crew.id], kind: 'move', x: far.x, z: far.z }]);
for (let k = 0; k < 20 * 90; k++) g.step([]);
const plan = g.saveState().paths[crew.id];
assert.ok(!plan || !plan.replanAt || plan.pts.length > plan.replanAt, 'the unit walks a detailed part, never only rough waypoints');
assert.ok(startX - crew.x > 250, `crew walked on past the refined part (moved ${(startX - crew.x).toFixed(0)} west)`);
assert.ok(g.areas.active().some(c => c.cx === Math.floor(crew.x / 250)), 'chunks follow the crew');

console.log(`test_areas: ok (crew walked ${(startX - crew.x).toFixed(0)} units west in 90 s)`);
