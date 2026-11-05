// City decisions at 2 Hz while no player is in the city (lag step 1, 2026-11-05).
// Safety net: Tim's heavy save run twice from the same file. 'home' = the player hero put in the
// city (full-rate thinking, must never change); 'away' = as saved, hero out on the island.
// 'away' runs with the lower rate switched off (must match the old behaviour); the 2 Hz run is timed
// and checked for the away flag only (its results differ on purpose).
// Baselines in city_decisions_baseline.json; refresh on purpose with UPDATE=1.
// Skips when the save is missing (saves/ is not in git).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGame } from '../src/sim/game.js';
import { loadSave, heroOf } from '../src/sim/save.js';
const SAVE = new URL('../../saves/loop3-mountainplaytest.json', import.meta.url);
if (!existsSync(SAVE)) { console.log('city decisions: save missing, skipped'); process.exit(0); }
const d = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const district = d('data/port_town.json');
const options = () => ({ district, catalog: d('data/art.json'), cutouts: d('art/cutouts.json'), interiors: d('data/interiors.json'),
  parts: d('data/interior_parts.json'), recipes: d('data/room_recipes.json'), units: d('data/units.json'), civilians: d('data/civilians.json'),
  bandits: d('data/bandits.json'), police: d('data/police.json'), settings: d('data/settings.json'), world: d('data/world.json'),
  worldChunks: { ...d('data/world_chunks.json'), paint: { ...d('data/world_paint.json'), ...d('data/world_crossings.json') },
    biomeProps: d('data/biome_props.json'), coastline: d('data/coastline.json') },
  resourceSpots: d('data/world_spots.json'), resourceSpotRules: d('data/resource_spots.json'), frontier: { ...d('data/frontier.json'), dev: true } });
const save = JSON.parse(readFileSync(SAVE));
const TICKS = +(process.env.TICKS || 300);
function run(where, awayHz) {
  const o = options(); if (awayHz !== undefined) o.settings.cityDecisions = { awayHz };
  const g = createGame(o), bots = loadSave(g, save);
  const hero = g.state.entities[heroOf(g)];
  if (where === 'home') { Object.assign(hero, { x: g.gate.inside[0], z: g.gate.inside[1], place: 'street', anim: 'idle' }); g.areas?.update(Object.values(g.state.entities)); }
  const away = [], ms = [];
  for (let i = 0; i < TICKS; i++) {
    const a = performance.now();
    g.step(bots.flatMap(b => b.tick()));
    ms.push(performance.now() - a);
    away.push(g.cityAway?.() ?? null);
  }
  const S = g.state;
  const hash = createHash('sha256').update(JSON.stringify({ tick: S.tick, clans: S.clans, entities: S.entities })).digest('hex').slice(0, 16);
  ms.sort((a, b) => a - b);
  return { hash, units: Object.keys(S.entities).length, away, median: ms[ms.length >> 1], mean: ms.reduce((a, b) => a + b, 0) / ms.length };
}
const home = run('home'), away = run('away', 0), slow = run('away');
console.log(`timing over ${TICKS} ticks (ms/tick): home median ${home.median.toFixed(2)} mean ${home.mean.toFixed(2)}; away (2 Hz off) median ${away.median.toFixed(2)} mean ${away.mean.toFixed(2)}; away (2 Hz on) median ${slow.median.toFixed(2)} mean ${slow.mean.toFixed(2)}`);
// the away flag: player hero in the city = never away; out on the island = away every tick
if (home.away[0] !== null) {
  assert.ok(home.away.every(a => a === false), 'player hero in the city: full-rate thinking every tick');
  assert.ok(slow.away.every(a => a === true), 'player hero on the island: city is away');
  assert.ok(away.away.every(a => a === false), 'awayHz 0 turns the lower rate off');
}
const file = new URL('./city_decisions_baseline.json', import.meta.url);
const now = { home: { hash: home.hash, units: home.units }, away: { hash: away.hash, units: away.units } };
if (process.env.UPDATE || !existsSync(file)) { writeFileSync(file, JSON.stringify(now, null, 1) + '\n'); console.log('baseline written', now); }
else {
  const base = JSON.parse(readFileSync(file));
  assert.deepEqual(now.home, base.home, 'player in the city: behaviour changed vs baseline');
  assert.deepEqual(now.away, base.away, 'switched off (awayHz 0), the away city must behave exactly as before');
}
console.log('city decisions ok', now);
