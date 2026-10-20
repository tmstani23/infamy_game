// The clinic only takes someone who hasn't been hit for clinicUnhitSeconds (Tim 2026-10-20): the
// boss's menu waits, and crew sent with G wait at the door. Run: node tools/test_clinic_unhit.mjs
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
const R = g.settings.units.rules, S = g.state.entities;
const run = s => { for (let i = 0; i < s * 20; i++) g.step(); };
g.clans.addClan('player', { name: 'Your clan' });
const C = g.state.clans.player;
C.ryo = 5000;
const door = g.doors.find(d => d.menu === 'clinic');
const hero = g.spawn('hero', 'ronin', door.x, door.z, { owner: 'player' }), H = S[hero];
H.hp = H.maxHp / 2; H.hitAt = g.state.tick;
g.step([{ id: hero, type: 'clinic', action: 'heal' }]);
assert.ok(H.hp < H.maxHp, 'no heal right after a hit');
assert.match(C.notice.text, /You were hit/);
run(R.clinicUnhitSeconds);
g.step([{ id: hero, type: 'clinic', action: 'heal' }]);
assert.equal(H.hp, H.maxHp, 'healed once the hits stop');
// crew sent with G wait at the door while they are still being hit
const t = g.spawn('thug', 'thug', door.x + 0.3, door.z, { owner: 'player' });
S[t].hp = S[t].maxHp / 2;
g.step([{ id: hero, type: 'order', units: [t], kind: 'heal' }]);
for (let i = 0; i < 20 * 3; i++) { S[t].hitAt = g.state.tick; g.step(); }
assert.ok(S[t], 'still waiting at the door');
run(R.clinicUnhitSeconds + 2);
assert.equal(S[t], undefined, 'checked in once the hits stopped');
assert.equal(C.clinic.length, 1);
console.log('clinic waits for 5 s without a hit ok');
