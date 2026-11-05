// Lean Classic (Tim 2026-11-05): main.js gives a Classic match no island data, so the sim builds no island
// areas, camps, gate or frontier. Checks that such a match runs, and that a Classic save made by an
// older build (island data present) still loads and runs in the lean game.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const city = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json') });
const island = () => ({ world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json'),
  resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json') });
const start = (opts, mode) => { const g = createGame(opts); setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode, bots: data('data/bots.json'), spawns: opts.district.spawns }); return g; };

// a lean Classic match: nothing from the island exists, and it plays
const lean = start(city(), 'classic');
assert.equal(lean.frontier, null); assert.equal(lean.areas, null); assert.equal(lean.gate, null);
assert.ok(!lean.doors.some(d => d.gate), 'no island gate door');
for (let i = 0; i < 300; i++) lean.step([]);
assert.ok(!lean.state.frontier, 'no frontier state');

// a campaign match still gets the island
const camp = start({ ...city(), ...island() }, 'campaign');
assert.ok(camp.frontier && camp.areas && camp.gate);

// an old Classic save (made with the island loaded) opens in the lean game
const old = start({ ...city(), ...island() }, 'classic');
for (let i = 0; i < 200; i++) old.step([]);
const file = JSON.parse(JSON.stringify(makeSave(old)));
const loaded = createGame(city());
loadSave(loaded, file);
assert.equal(loaded.state.match.mode, 'classic');
for (let i = 0; i < 300; i++) loaded.step([]);
assert.equal(loaded.state.tick, old.state.tick + 300);
console.log('test_lean_classic: ok');
