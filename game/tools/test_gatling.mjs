import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { specialOf, specialView } from '../src/sim/special_cast.js';
const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const units = read('data/units.json'), frontier = read('data/frontier.json');
for (const t of Object.values(units.types)) { t.dodgeChance = 0; t.critChance = 0; }
const g = createGame({ district: read('data/port_town.json'), catalog: read('data/art.json'), cutouts: read('art/cutouts.json'), interiors: read('data/interiors.json'), parts: read('data/interior_parts.json'), recipes: read('data/room_recipes.json'), units, settings: { ...read('data/settings.json') } });
const { heroId } = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', bots: read('data/bots.json') });
const st = g.state, hero = st.entities[heroId], me = hero.owner;
for (const e of Object.values(st.entities)) { e.holdFire = true; if (e.type !== 'hero') e.order = { kind: 'stop' }; if (e.type === 'hero') e.x += 80; }
const sector = st.deployment.sectors[0], ax = sector.anchor.x, az = sector.anchor.z, group = sector.id;
const rival = Object.keys(st.clans).find(id => id !== me);
const mine = (type, model, dx, dz, extra = {}) => st.entities[g.spawn(type, model, ax + dx, az + dz, { owner: me, deployment: { group }, order: { kind: 'stop' }, holdFire: true, ...extra })];
const foe = (type, model, dx, dz) => st.entities[g.spawn(type, model, ax + dx, az + dz, { owner: rival, deployment: { group: 'hero' }, order: { kind: 'stop' }, holdFire: true })];
// War checkpoint 7-4: the Kuroda Gatling gun crew (sim/gatling.js).
const R = units.types.gatling_crew.gatling;
const cast = (ability, ids, extra = {}) => g.step([{ id: hero.id, type: 'special', ability, units: ids, ...extra }]);
assert.equal(specialOf(units, { type: 'gatling_crew' }), 'gatling');
assert.deepEqual(frontier.war.units.gatling.at, ['foundry']); assert.equal(frontier.war.units.gatling.clan, 'kuroda');
const run = (n, fn) => { for (let i = 0; i < n; i++) { g.step(); if (fn?.()) return i + 1; } return n; };
const gun = mine('gatling_crew', 'gatling', 0, 0, { holdFire: false });
// ---- no fire before it is set up -----------------------------------------------------------------------
const a = foe('thug', 'thug', 7, 0), b = foe('thug', 'thug', 7, 1.2), side = foe('thug', 'thug', 0, 8), close = foe('thug', 'thug', 1.5, 0);
const hp = () => [a, b, side, close].map(e => e.hp), hp0 = hp();
run(R.setupTicks - 5);
assert.equal(gun.gat?.state, 'setting'); assert.deepEqual(hp(), hp0, 'no shot while setting up');
// ---- set up: the cone hits every enemy in it, not the one at its side, not the one too close -----------------
{ let shots = 0; run(40, () => { shots += st.casts.filter(c => c.kind === 'gatlingShot' && c.a === gun.id).length; return false; });
  assert.equal(gun.gat.state, 'set'); assert.ok(shots > 5, `it fires (${shots} shot casts)`);
  assert.ok(a.hp < hp0[0] && b.hp < hp0[1], 'both enemies in the cone are hit');
  assert.equal(side.hp, hp0[2], 'the enemy out of the cone is not'); assert.equal(close.hp, hp0[3], 'nor the one inside the minimum range');
  assert.equal((hp0[0] - a.hp) % R.damage, 0); assert.equal(gun.anim, 'attack'); }
// ---- Hold aim: the facing stays on the chosen spot --------------------------------------------------------
{ const s0 = side.hp; cast('gatling', [gun.id], { x: side.x, z: side.z });
  run(5); assert.ok(gun.gat.aim, 'the aim is held'); const a0 = a.hp;
  run(40);
  assert.ok(side.hp < s0, 'the enemy at the chosen spot is hit'); assert.equal(a.hp, a0, 'the others are out of the cone now');
  assert.deepEqual(specialView({ state: st, units }, 'gatling', [gun.id]).ready, 1, 'no cooldown'); }
// ---- a move order packs it up first, and it does not fire on the move ---------------------------------------
{ let stop = false; const x0 = gun.x;
  g.step([{ id: hero.id, type: 'order', kind: 'move', units: [gun.id], x: gun.x - 6, z: gun.z }]);
  stop ||= st.casts.some(c => c.kind === 'gatlingStop' && c.a === gun.id);
  run(R.packTicks - 3, () => { stop ||= st.casts.some(c => c.kind === 'gatlingStop' && c.a === gun.id); return false; });
  assert.ok(stop, 'the firing stops'); assert.equal(gun.gat?.state, 'packing'); assert.ok(Math.abs(gun.x - x0) < 0.2, 'it has not moved while packing');
  const h1 = hp(); run(30);
  assert.equal(gun.gat, undefined, 'packed'); assert.ok(Math.hypot(gun.x - x0, 0) > 0.3, 'now it moves'); assert.deepEqual(hp(), h1, 'no shots on the move'); }
// ---- it never fights hand to hand ------------------------------------------------------------------------------
{ g.step([{ id: hero.id, type: 'order', kind: 'attack', units: [gun.id], target: a.id }]); run(10); assert.notEqual(gun.order?.kind, 'attack'); assert.equal(gun.swing, undefined); }
console.log('test_gatling: ok');
