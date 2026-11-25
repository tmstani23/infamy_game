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
// ---- reworked Tim 2026-11-21: a spin up, then a burst, then a spin up again ------------------------------
const a = foe('thug', 'thug', 7, 0), b = foe('thug', 'thug', 7, 1.2), side = foe('thug', 'thug', 0, -8)   /* (0, 8) is behind a wall: Tim 2026-11-25 */, close = foe('thug', 'thug', 1.5, 0);
const hp = () => [a, b, side, close].map(e => e.hp), hp0 = hp();
for (const e of [a, b, side, close]) e.hp = e.maxHp = 100000;
const H0 = hp();
gun.autoCast = false;
run(R.spinTicks - 3);
assert.equal(gun.gat?.state, 'spin'); assert.deepEqual(hp(), H0, 'no shot while spinning up');
// ---- firing: the cone hits every enemy in it, not the one at its side, not the one too close -----------------
{ let shots = 0; run(40, () => { shots += st.casts.filter(c => c.kind === 'gatlingShot' && c.a === gun.id).length; return false; });
  assert.equal(gun.gat.state, 'fire'); assert.ok(shots > 5, `it fires (${shots} shot casts)`);
  assert.ok(a.hp < H0[0] && b.hp < H0[1], 'both enemies in the cone are hit');
  assert.equal(side.hp, H0[2], 'the enemy out of the cone is not'); assert.equal(close.hp, H0[3], 'nor the one inside the minimum range');
  assert.equal((H0[0] - a.hp) % R.damage, 0); assert.equal(gun.anim, 'attack'); }
// ---- after burstTicks it stops and spins up again ------------------------------------------------------------
{ let stopped = false; run(R.burstTicks, () => (stopped ||= st.casts.some(c => c.kind === 'gatlingStop' && c.a === gun.id)));
  assert.ok(stopped, 'the burst ends'); run(2); assert.equal(gun.gat?.state, 'spin', 'and it spins up again');
  run(R.spinTicks + 2); assert.equal(gun.gat?.state, 'fire'); }
// ---- Unload: faces the clicked spot, extra damage, then a cooldown ---------------------------------------------
{ const s0 = side.hp; cast('gatling', [gun.id], { x: side.x, z: side.z });
  run(R.spinTicks + 4); assert.ok(gun.gat.unload, 'it unloads'); const a0 = a.hp;
  run(40);
  assert.ok(side.hp < s0, 'the enemy at the chosen spot is hit'); assert.equal(a.hp, a0, 'the others are out of the cone now');
  assert.equal((s0 - side.hp) % Math.round(R.damage * R.unload.damageMul), 0, 'at Unload damage');
assert.equal(specialView({ state: st, units }, 'gatling', [gun.id]).ready, 0, 'on cooldown'); }
// ---- a move order stops it at once, and it does not fire on the move -------------------------------------------
{ const x0 = gun.x;
  g.step([{ id: hero.id, type: 'order', kind: 'move', units: [gun.id], x: gun.x - 6, z: gun.z }]);
  assert.ok(st.casts.some(c => c.kind === 'gatlingStop' && c.a === gun.id), 'the firing stops');
  const h1 = hp(); run(30);
  assert.equal(gun.gat, undefined, 'no setup state'); assert.ok(Math.abs(gun.x - x0) > 0.3, 'it moves at once'); assert.deepEqual(hp(), h1, 'no shots on the move'); }
// ---- on auto it unloads into a packed group ---------------------------------------------------------------------
{ const g2 = mine('gatling_crew', 'gatling', 0, 0, { holdFire: false }); const t = foe('thug', 'thug', 7, -1.2); t.hp = t.maxHp = 100000;
  run(R.spinTicks + 4); assert.ok(g2.gat?.unload, 'auto Unload with 3 in the cone'); g.step([{ id: hero.id, type: 'order', kind: 'move', units: [g2.id], x: gun.x, z: gun.z - 30 }]); }
// ---- it never fights hand to hand ------------------------------------------------------------------------------
{ g.step([{ id: hero.id, type: 'order', kind: 'attack', units: [gun.id], target: a.id }]); run(10); assert.notEqual(gun.order?.kind, 'attack'); assert.equal(gun.swing, undefined); }
// ---- Tim 2026-11-25: a wall or building between stops it, as for arrows and rifles ---------------------------------
{ const n = g.nav; let spot = null;
  for (let r = 6; r <= 11 && !spot; r += 0.5) for (let k = 0; k < 64 && !spot; k++) {
    const gx = ax + 30 * Math.cos(k), gz = az + 30 * Math.sin(k);   // somewhere off the earlier fight
    if (!n.free(gx, gz)) continue;
    for (let q = 0; q < 32 && !spot; q++) { const tx = gx + r * Math.cos(q * Math.PI / 16), tz = gz + r * Math.sin(q * Math.PI / 16);
      if (n.free(tx, tz) && !n.clearLine(gx, gz, tx, tz)) spot = [gx, gz, tx, tz]; } }
  assert.ok(spot, 'a spot with a wall between');
  for (const e of Object.values(st.entities)) if (e.type === 'gatling_crew') e.holdFire = true;
  const w = st.entities[g.spawn('gatling_crew', 'gatling', spot[0], spot[1], { owner: me, deployment: { group }, order: { kind: 'stop' }, holdFire: false })];
  const t = st.entities[g.spawn('thug', 'thug', spot[2], spot[3], { owner: rival, deployment: { group: 'hero' }, order: { kind: 'stop' }, holdFire: true })];
  t.hp = t.maxHp = 100000; w.autoCast = false;
  run(R.spinTicks + 60);
  assert.equal(t.hp, 100000, 'no shot through the wall'); assert.notEqual(w.gat?.state, 'fire', 'it does not fire at all'); }
console.log('test_gatling: ok');
