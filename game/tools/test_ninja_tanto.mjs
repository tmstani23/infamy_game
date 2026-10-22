import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json'), catalog = data('data/art.json');
for (const key of ['clan', 'hp', 'damage', 'attackRange', 'attackSpeed', 'critChance', 'critMultiplier', 'walk', 'run', 'radius', 'price', 'hireSeconds', 'recoverSeconds', 'executeRyo'])
  assert.equal(units.types.ninja_tanto[key], units.types.ninja[key], `same ${key}`);
const g = createGame({ district: data('data/port_town.json'), catalog, cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units });
g.clans.addClan('player', { kind: 'ninja' }); g.clans.addClan('rival');
const home = Object.values(g.state.businesses).find(b => b.hideout === 'player');
const hero = g.spawn('hero', 'ninja_leader', home.x, home.z, { owner: 'player', place: home.room });
assert.equal(g.clans.hirePrice('player', 'ninja_tanto'), g.clans.hirePrice('player', 'ninja'));
assert.equal(g.clans.hirePrice('rival', 'ninja_tanto'), null, 'Shinobi only');
g.step([{ id: hero, type: 'hire', business: home.id, unit: 'ninja_tanto' }]);
assert.equal(g.state.clans.player.queue[0].unit, 'ninja_tanto');
for (let i = 0; i < 250; i++) g.step();
const recruit = g.clans.crewOf('player').find(e => e.type === 'ninja_tanto');
assert.ok(recruit); assert.equal(recruit.model, 'ninja_tanto'); assert.equal(recruit.maxHp, 180);
assert.equal(g.clans.crewCount('player'), 1);
assert.ok(g.stealth.canHide(recruit), 'new variant uses ordinary Shinobi stealth');
recruit.downed = true; recruit.downedAt = g.state.tick;
for (let i = 0; i < 402; i++) g.step();
assert.ok(!g.state.entities[recruit.id]);
assert.ok(g.state.clans.player.clinic.some(p => p.unit === 'ninja_tanto' && p.model === 'ninja_tanto'), 'clinic retains variant');
assert.equal(g.clans.crewCount('player'), 1, 'recovering variant counts toward cap');
// Every game animation must have matching eight-direction colour and half-size glow sheets.
for (const entry of Object.values(catalog.characters.ninja_tanto)) {
  const file = typeof entry === 'string' ? entry : entry.file;
  const png = readFileSync(new URL(`../../assets/sprites/${file}.png`, import.meta.url));
  const glow = readFileSync(new URL(`../../assets/sprites/${file}_glow.png`, import.meta.url));
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  assert.equal(h, 160 * 8); assert.ok(w % 160 === 0 && w > 160);
  assert.equal(glow.readUInt32BE(16), w / 2); assert.equal(glow.readUInt32BE(20), h / 2);
}
console.log('Tanto ninja: identical stats/cost, Shinobi-only hiring, real arrival, stealth, clinic/cap and sprite/glow layout ok');
