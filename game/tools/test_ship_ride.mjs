// The ship between the city harbour pier and the castle dock (Tim 2026-11-19, sim/frontier/ferry.js): the boss and his
// party board at the pier, sail, land on the dock; back the same way; Space skips. Run: node game/tools/test_ship_ride.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { castleIndex } from '../src/sim/frontier/castle.js';
import { cellToWorld } from '../src/sim/frontier/town_grid.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const zonesData = data('data/campaign_zones.json'), bp = data('data/castle_default.json');
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'),
  frontier: { ...data('data/frontier.json'), railways: data('data/railways.json'), fixtureTowns: false, castleBlueprint: bp, campaignZones: zonesData } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, hero = S.entities[m.heroId], ferry = g.ferry, ship = zonesData.ship;
assert.ok(ferry, 'a campaign with castles has the ship');
const dock = g.castles.dock('player');
assert.ok(dock, 'the player castle has a dock');
const run = n => { for (let i = 0; i < n; i++) g.step([]); };
const use = mode => g.step([{ id: hero.id, type: 'frontier', action: 'ferry', mode }]);

// the pier is ground the boss can stand on, and so is the dock
assert.ok(g.nav.nearestFree(ship.pier[0], ship.pier[1]), 'the city pier is walkable');
const [px, pz] = g.nav.nearestFree(ship.pier[0], ship.pier[1]);
assert.ok(Math.hypot(px - ship.pier[0], pz - ship.pier[1]) < 2, 'free ground right at the pier point');

// --- away from the pier: no ship ---------------------------------------------------------------------------
assert.equal(ferry.at(hero), null, 'no ship at the start spot');
use('board'); assert.ok(!hero.aboard, 'Use far from the pier does not board');

// --- city to castle, with a crew member ----------------------------------------------------------------------
Object.assign(hero, { x: px, z: pz, place: 'street' });
const mate = S.entities[g.spawn('thug', 'thug', px + 1.5, pz + 1, { owner: hero.owner })];
if (mate.deployment) mate.deployment.group = 'hero';
const far = S.entities[g.spawn('thug', 'thug', px - 60, pz + 60, { owner: hero.owner })];
assert.equal(ferry.at(hero), 'city');
assert.equal(ferry.prompt(hero).text, 'Space  Ship to your castle');
use('board');
assert.equal(hero.aboard, 'ship:player'); assert.equal(mate.aboard, 'ship:player'); assert.ok(!far.aboard, 'crew far away stay');
assert.equal(hero.place, 'world');
run(40);
assert.ok(ferry.prompt(hero).riding, 'the prompt shows the crossing');
g.step([{ id: hero.id, type: 'move', x: 5, z: 5 }]); assert.ok(hero.aboard, 'orders do nothing at sea');
run(ship.seconds * 20);
assert.ok(!hero.aboard && !mate.aboard && !hero.shipRide, 'landed');
assert.equal(hero.place, 'world');
assert.ok(Math.hypot(hero.x - dock.land.x, hero.z - dock.land.z) < 25, `on the dock (${Math.round(Math.hypot(hero.x - dock.land.x, hero.z - dock.land.z))} away)`);
assert.equal(mate.order?.kind, 'follow');
// off the dock on foot: a way from where he landed to the castle hall
const c = g.castles.castleOf('player');
g.areas.update(Object.values(S.entities));
const yard = cellToWorld(c, castleIndex(bp, c.grid.n, c.castle.rot)(13, 8));   // the outer yard inside the harbour gate
const path = g.areas.nav.workerPath(hero.x, hero.z, yard[0], yard[1]);
assert.ok(path && path.length, 'a way on foot from the dock through the harbour gate into the yard');

// --- castle to city, skipped ---------------------------------------------------------------------------------
assert.equal(ferry.at(hero), 'castle');
use('board'); assert.equal(hero.shipRide.to, 'city');
use('skip'); assert.ok(hero.aboard, 'no skip in the first moments');
run(ship.skipSeconds * 20 + 1); use('skip');
assert.ok(!hero.aboard, 'skipped'); assert.equal(hero.place, 'street');
assert.ok(Math.hypot(hero.x - ship.pier[0], hero.z - ship.pier[1]) < 6, 'back on the city pier');
console.log('ship ride ok');
