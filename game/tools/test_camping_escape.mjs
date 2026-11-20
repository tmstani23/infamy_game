import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
// Free crew (no sector duty) leave a rival HQ camping zone and take their order back; police boxes keep no day patrol.
const data = f => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url)));
const game = createGame({ district: { ...data('port_town'), banditCamps: [] }, catalog: data('art'),
  cutouts: JSON.parse(readFileSync(new URL('../art/cutouts.json', import.meta.url))),
  interiors: data('interiors'), parts: data('interior_parts'), recipes: data('room_recipes'), units: data('units') });
game.clans.addClan('player'); game.clans.addClan('kuroda');
const rival = Object.values(game.state.businesses).find(b => b.hideout === 'kuroda');
const crewId = game.spawn('thug', 'thug', ...rival.ring, { owner: 'player', order: { kind: 'stop' } });
const run = s => { for (let i = 0; i < s * 20; i++) game.step(); };
run(60);
const c = game.state.entities[crewId], zone = game.state.hqCamping.zones.find(z => z.owner === 'kuroda');
assert.ok(Math.hypot(c.x - zone.x, c.z - zone.z) > zone.radius, 'idle crew walked out of the camping zone');
const infamy = game.state.clans.player.heat ?? 0;
run(40);
assert.equal(game.state.clans.player.heat ?? 0, infamy, 'no more camping heat once out');
console.log('camping escape ok, infamy', infamy ?? 'n/a');
