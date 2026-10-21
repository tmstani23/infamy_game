// Game settings (data/settings.json, plan S1): laid over the detail files, and the day/night clock.
// Run: node tools/test_settings.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame, TICK_RATE } from '../src/sim/game.js';
import { applySettings } from '../src/sim/settings.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const files = { units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json') };
const settings = data('data/settings.json');

// the settings win over the detail files, and the files passed in are left alone
const s = applySettings(files, { ...settings, townsfolk: { total: 17 }, costs: { ...settings.costs, startRyo: 999, hire: { thug: 77 } }, police: { officersPerTier: [0, 1, 2, 3, 9] }, bandits: { maxOut: 4 } });
assert.equal(s.units.rules.startRyo, 999);
assert.equal(s.units.types.thug.price, 77);
assert.equal(Object.values(s.civilians.types).reduce((n, t) => n + t.count, 0), 17);
assert.deepEqual(s.police.rules.tiers.map(t => t.officers), [0, 1, 2, 3, 9]);
assert.equal(s.bandits.rules.maxOut, 4);
const banditSettings = applySettings(files, { bandits: { sightRange: 3, giveUpDistance: 4, roamerLoot: 75 } });
assert.equal(banditSettings.bandits.rules.sightRange, 3);
assert.equal(banditSettings.bandits.rules.giveUpDistance, 4);
assert.equal(banditSettings.bandits.rules.roamerLoot, 75);
assert.equal(files.bandits.rules.sightRange, 6, 'settings do not mutate source rules');
assert.equal(files.bandits.rules.giveUpDistance, 6);
assert.equal(files.units.rules.startRyo, 200);
const live = applySettings(files, settings);
assert.equal(live.units.rules.startRyo, 200);
assert.equal(live.units.rules.raid.lanternPrice, 1200);
assert.equal(live.bandits.rules.sightRange, 6);
assert.equal(live.bandits.rules.giveUpDistance, 6);
assert.equal(live.police.rules.giveUpDistance, files.police.rules.giveUpDistance, 'wild enemy tuning leaves police pursuit unchanged');
const patrolSettings = applySettings(files, { hqCamping: { radius: 9, penaltyHeat: 3 }, police: { dayPatrol: { hq: 2, box: 1 } } });
assert.equal(patrolSettings.units.rules.hqCamping.radius, 9);
assert.equal(patrolSettings.units.rules.hqCamping.penaltyHeat, 3);
assert.deepEqual(patrolSettings.police.rules.dayPatrol, { hq: 2, box: 1 });
assert.equal(files.units.rules.hqCamping.radius, 12, 'custom camping settings do not mutate base rules');
assert.equal(applySettings(files, settings).civilians.types.monk2.count > 0, true);
console.log('settings laid over the data files ok');

const make = dayNight => createGame({
  district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  ...files, settings: { ...settings, dayNight },
});

// the clock: day for daySeconds, then night for nightSeconds, dusk and dawn each fire once
const g = make({ auto: true, daySeconds: 2, nightSeconds: 3, startAtNight: false });
g.clans.addClan('player');
let dusk = 0, dawn = 0, firstNight = null;
for (let i = 0; i < (2 + 3 + 1) * TICK_RATE; i++) {
  g.step();
  if (g.state.dusk) { dusk++; firstNight ??= g.state.tick; }
  if (g.state.dawn) dawn++;
}
assert.equal(dusk, 1); assert.equal(dawn, 1);
assert.ok(Math.abs(firstNight - 2 * TICK_RATE) <= 1, `night came at tick ${firstNight}`);
assert.equal(g.state.clock.day, 2);
assert.equal(g.state.night, false);
console.log('day/night clock ok');

// N (the 'time' command) fires the same dawn and starts the new half fresh
g.step([{ type: 'time', night: true }]);
assert.ok(g.state.dusk && g.state.night);
g.step([{ type: 'time' }]);
assert.ok(g.state.dawn && !g.state.night);
assert.equal(g.state.clock.day, 3);
assert.equal(g.state.clock.left, 2 * TICK_RATE);
console.log('manual flip = real dawn ok');

// without settings there is no clock: night only changes by command (the Node tests' world)
const h = createGame({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'), interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), ...files });
for (let i = 0; i < 50; i++) h.step();
assert.equal(h.state.clock, null); assert.equal(h.state.night, false);
console.log('no settings = no clock ok');
