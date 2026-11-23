// Ships plan S5: the cannon tower on the ship_test dev save: limits (a town after the war upgrade, by town hall tier;
// a camp without the hall upgrade, 2 after it), it fires at ships and siege guns before troops, a ship's hull takes it
// times the siege factor (about 60 s to sink a warship), troops take a share, a ceasefire holds fire, at most 4 menders,
// and the general's lists name it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { passable } from '../src/sim/world_data.js';
import { loadSave } from '../src/sim/save.js';
import { build } from './make_dev_save.mjs';
import { waterGrid, sailable, nearestSailable } from '../src/sim/frontier/water_nav.js';
import { militaryWhy } from '../src/sim/frontier/town_military.js';

const data = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'),
  police: data('data/police.json'), settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'),
  frontier: { ...data('data/frontier.json'), railways: data('data/railways.json'), castleBlueprint: data('data/castle_default.json'), campaignZones: data('data/campaign_zones.json') } });
const file = build('ship_test', { clan: 'yakuza', difficulty: 'medium', mode: 'campaign', ticks: 400, realGame: true, cityMix: true, ryo: 3000, renown: 300, crew: 6, shipTest: true });
const g = createGame(options()), S = g.state; loadSave(g, JSON.parse(JSON.stringify(file)));
const world = options().world, F = options().frontier, W = F.war, CT = W.buildings.cannon_tower, wg = waterGrid(world), war = g.frontier.war;
const rec = Object.values(S.frontier.wars.list)[0], town = S.frontier.settlements[rec.town], hall = rec.camp.buildings.find(b => b.type === 'camp_hall');
const run = n => { for (let i = 0; i < n; i++) g.step([]); };
const foe = rec.defender;

// --- data: it moved out of the ships block into war.buildings and the town buildings ---
assert.ok(CT && F.buildings.cannon_tower?.military, 'a military building');
assert.ok(!W.ships.buildings, 'no longer held back in war.ships');
assert.equal(F.townArt.cannon_tower, 'cannon_battery', 'drawn as the gun battery');
assert.ok(W.morale.weights.cannon_tower > 0, 'on the morale bar');
for (const k of ['rush', 'siege', 'raider']) assert.ok(W.general.strategies[k].defend.build.includes('cannon_tower'), `${k} towns build one`);
assert.ok(W.general.buildOn.includes('cannon_tower'), 'and the tail after every list');

// --- town limits: the war upgrade first, then 1, 2, 4 by town hall tier ---
{ const t = { ...town, buildings: [...(town.buildings || [])].filter(b => b.type !== 'cannon_tower'), projects: [], warHall: false, tier: 1 };
  assert.match(militaryWhy(t, 'cannon_tower', F, S), /town hall war upgrade/, 'needs the war upgrade');
  t.warHall = true;
  assert.equal(militaryWhy(t, 'cannon_tower', F, S), null, 'then one may stand');
  const add = () => t.buildings.push({ type: 'cannon_tower', stage: 'built', cells: [] });
  add(); assert.match(militaryWhy(t, 'cannon_tower', F, S), /at most 1 cannon tower at this town hall tier/, 'one at tier 1');
  t.tier = 2; assert.equal(militaryWhy(t, 'cannon_tower', F, S), null, 'a second at tier 2');
  add(); assert.match(militaryWhy(t, 'cannon_tower', F, S), /at most 2/, 'two at tier 2');
  t.tier = 3; add(); add(); assert.match(militaryWhy(t, 'cannon_tower', F, S), /at most 4/, 'four at tier 3'); }

// --- camp: no hall upgrade needed for the first; a spot by the slipway, on the shore ---
const slip = rec.camp.buildings.find(b => b.type === 'slipway');
assert.ok(slip, 'the dev save slipway');
let ok = null;
for (let r = 20; r <= 80 && !ok; r += 6) for (let a = 0; a < 24 && !ok; a++) { const x = hall.x + Math.cos(a * Math.PI / 12) * r, z = hall.z + Math.sin(a * Math.PI / 12) * r; if (war.campCheck(rec.id, 'cannon_tower', { x, z })?.ok) ok = { x, z }; }
assert.ok(ok, 'a camp may place one without the hall upgrade');
// the fire checks want one by the water: stand it on the shore by the slipway (placement is checked above)
let spot = null;
for (let r = 10; r <= 40 && !spot; r += 3) for (let a = 0; a < 24 && !spot; a++) { const x = slip.x + Math.cos(a * Math.PI / 12) * r, z = slip.z + Math.sin(a * Math.PI / 12) * r; if (passable(world, x, z) && !sailable(wg, x, z, 'big') && nearestSailable(wg, x, z, 'big', 20)) spot = { x, z }; }
assert.ok(spot, 'shore by the slipway');
rec.camp.buildings.push({ id: `${rec.id}:cannon_tower${S.frontier.nextId++}`, type: 'cannon_tower', stage: 'built', x: spot.x, z: spot.z, progress: CT.buildTicks, need: CT.buildTicks });
run(2);
assert.match(war.campCheck(rec.id, 'cannon_tower', { x: hall.x + 30, z: hall.z })?.reason || '', /at most 1|hall upgrade/i, 'one before the camp hall upgrade');
const st = g.frontier.structures.list().find(x => x.type === 'cannon_tower' && x.camp);
assert.ok(st && st.max === W.structures.camp.cannon_tower, 'it is a camp structure with its health');

// --- target order: a ship (or siege gun) first, even with a troop nearer ---
for (const e of Object.values(S.entities)) if (e.ship) e.holdFire = true;
for (const b of town.buildings) if (b.type === 'shipyard') b.stage = 'ruined';   // no dock repair muddling the numbers
const water = nearestSailable(wg, spot.x, spot.z, 'big', 20);
assert.ok(water && Math.hypot(water.x - spot.x, water.z - spot.z) < CT.fire.range - 2, 'water in range of the tower');
const ship = g.ships.spawn(rec, 'warship', water.x, water.z, foe); ship.holdFire = true;
let land = null;
for (let r = 6; r <= 14 && !land; r++) for (let a = 0; a < 36; a++) { const x = spot.x + Math.cos(a / 5.7) * r, z = spot.z + Math.sin(a / 5.7) * r; if (passable(world, x, z) && !sailable(wg, x, z, 'big')) { land = { x, z }; break; } }
assert.ok(land, 'ground by the tower');
const grunt = S.entities[war.spawnTroop(rec, 'grunt', land.x, land.z, foe)];
grunt.order = { kind: 'stop' };
assert.ok(Math.hypot(grunt.x - spot.x, grunt.z - spot.z) < Math.hypot(ship.x - spot.x, ship.z - spot.z), 'the troop is nearer');
const sh = ship.hp, gh = grunt.hp;
let t0 = S.tick;
for (let i = 0; i < 160 && ship.hp === sh; i++) g.step([]);
const perShot = CT.fire.damage * W.ships.hullDamage.siege;
assert.ok(Math.abs(sh - ship.hp - perShot) < 0.5, `the ship first, hull times siege: ${sh - ship.hp}`);
assert.equal(grunt.hp, gh, 'not the troop while a ship is in range');
// a warship sinks in about a minute of steady fire (plan: about 60 s)
const shots = Math.ceil(ship.maxHp / perShot), secs = shots * CT.fire.everyTicks / 20;
assert.ok(secs >= 45 && secs <= 75, `one tower sinks a warship in about 60 s (${secs} s)`);
{ const h = ship.hp; run(CT.fire.everyTicks - 10); assert.equal(ship.hp, h, 'one ball every everyTicks'); run(30); assert.ok(ship.hp < h, 'then the next'); }

// --- a ceasefire holds fire ---
{ rec.terms = { by: foe }; const h = ship.hp; run(CT.fire.everyTicks * 2 + 20); assert.equal(ship.hp, h, 'ceasefire: no fire'); delete rec.terms; }

// --- troops next, for a share of the ball ---
ship.dead = true; ship.hp = 0;
grunt.hp = grunt.maxHp; const gh2 = grunt.hp;
for (let i = 0; i < 260 && grunt.hp === gh2; i++) g.step([]);
assert.ok(grunt.hp < gh2, 'with no ship or siege gun near, a troop');
assert.ok(gh2 - grunt.hp <= CT.fire.damage * CT.fire.unitShare + 1, `troops take the unit share: ${gh2 - grunt.hp}`);

// --- at most menders workers on one cannon tower; the town and camp halls unlimited ---
{ const src = readFileSync(new URL('../src/sim/frontier/structures.js', import.meta.url), 'utf8');
  assert.match(src, /data\.war\?\.buildings\?\.\[ownSt\(s, key\)\?\.type\]\?\.menders \?\? Infinity/, 'the work cap reads menders');
  assert.equal(CT.menders, 4, 'four'); }

console.log('test_cannon_tower: ok');
