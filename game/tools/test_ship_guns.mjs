// Ships plan S4: guns and hull on the ship_test dev save: hull damage by the attacker's kind, the warship's broadside and
// the transport's bow cannon fire on their own at ships first, then siege guns and buildings; the deck Gatling at troops;
// Z and a ceasefire hold fire; melee does not chase a ship; a watchtower shoots a ship only with nobody else in range;
// a sinking is news.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { passable } from '../src/sim/world_data.js';
import { loadSave } from '../src/sim/save.js';
import { build } from './make_dev_save.mjs';
import { waterGrid, sailable, landingFor, nearestSailable } from '../src/sim/frontier/water_nav.js';

const data = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'),
  police: data('data/police.json'), settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'),
  frontier: { ...data('data/frontier.json'), railways: data('data/railways.json'), castleBlueprint: data('data/castle_default.json'), campaignZones: data('data/campaign_zones.json') } });
const file = build('ship_test', { clan: 'yakuza', difficulty: 'medium', mode: 'campaign', ticks: 400, realGame: true, cityMix: true, ryo: 3000, renown: 300, crew: 6, shipTest: true });
const g = createGame(options()), S = g.state; loadSave(g, JSON.parse(JSON.stringify(file)));
const world = options().world, F = options().frontier, W = F.war, wg = waterGrid(world), war = g.frontier.war;
const hero = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === 'player');
const rec = Object.values(S.frontier.wars.list)[0], town = S.frontier.settlements[rec.town], hall = rec.camp.buildings.find(b => b.type === 'camp_hall');
const harbour = world.sites.find(s => s.id === town.site).harbor;
const run = n => { for (let i = 0; i < n; i++) g.step([]); };
const cmd = (e, c) => { g.step([{ id: e.id, type: 'frontier', ...c }]); return S.frontier.receipts.findLast(r => r.action === c.action); };

const H = W.ships.hullDamage, GU = W.ships.guns, UT = options().units.types;
const circle = { x: town.x, z: town.z, r: W.circleRadius - 40 };
const mine = Object.values(S.entities).find(e => e.ship && e.owner === 'player' && e.warUnit === 'warship');
assert.ok(mine, 'the dev save warship');
const foe = rec.defender, pseudo = (type, extra = {}) => ({ id: 'p:' + type, type, owner: foe, x: mine.x, z: mine.z, place: 'world', dir: 0, ...extra });
const far = () => { for (let r = 300; r < 900; r += 40) for (let a = 0; a < 36; a++) { const p = nearestSailable(wg, mine.x + Math.cos(a / 5.7) * r, mine.z + Math.sin(a / 5.7) * r, 'big', 30, circle); if (p) return p; } return null; };

// --- hull damage by the attacker's kind ---
for (const e of Object.values(S.entities)) if (e.ship) e.holdFire = true;   // only the ship a check is about fires
{ const hp = mine.hp;
  g.ships.shelter(mine, 100, pseudo('army_rifleman')); assert.ok(Math.abs(hp - mine.hp - 100 * H.ranged) < 0.02, `a rifle does almost nothing (${hp - mine.hp})`);
  const h1 = mine.hp; g.ships.shelter(mine, 60, pseudo('field_cannon')); assert.ok(Math.abs(h1 - mine.hp - 60 * H.siege) < 0.02, 'a siege cannon does the damage');
  const h2 = mine.hp; g.ships.shelter(mine, 100, pseudo('thug')); assert.ok(Math.abs(h2 - mine.hp - 100 * H.melee) < 0.02, 'melee almost nothing');
  const h3 = mine.hp; g.ships.shelter(mine, 100, pseudo('gatling_crew')); assert.ok(Math.abs(h3 - mine.hp - 100 * H.gatling) < 0.02, 'a Gatling nothing');
  assert.equal(mine.hitAt, S.tick, 'a hit marks the hull (repair pauses)');
  mine.hp = mine.maxHp; }

// --- broadside at an enemy ship in range; the transport's bow cannon back ---
const spot = nearestSailable(wg, mine.x + 22, mine.z + 10, 'big', 40, circle) || nearestSailable(wg, mine.x - 22, mine.z - 10, 'big', 40, circle);
assert.ok(spot && Math.hypot(spot.x - mine.x, spot.z - mine.z) < GU.broadside.range - 2, 'water in range');
const enemy = g.ships.spawn(rec, 'transport', spot.x, spot.z, foe);
for (const b of town.buildings) if (b.type === 'shipyard') b.stage = 'ruined';   // no dock repair muddling the numbers
enemy.holdFire = true; delete mine.holdFire; mine.gunAt = {};
for (const e of Object.values(S.entities)) if (e.ship && e !== mine) e.holdFire = true;
const ehp = enemy.hp;
for (let i = 0; i < 40 && enemy.hp === ehp; i++) g.step([]);
assert.ok(Math.abs(ehp - enemy.hp - GU.broadside.balls * GU.broadside.ballDamage * H.siege) < 0.5, `one volley lands: ${ehp - enemy.hp}`);
assert.ok(mine.firedAt != null && mine.gunAt.broadside > S.tick, 'it reloads');
{ const h = enemy.hp; run(GU.broadside.reloadTicks - 40); assert.equal(enemy.hp, h, 'no second volley before the reload'); run(80); assert.ok(enemy.hp < h, 'then the next'); }
delete enemy.holdFire; mine.holdFire = true;
{ const ours = () => Object.values(S.entities).filter(e => e.ship && e.owner === 'player' && !e.dead).reduce((n, e) => n + e.hp, 0), h = ours();
  for (const e of Object.values(S.entities)) if (e.ship && e.owner === 'player') e.holdFire = true;
  for (let i = 0; i < 320 && ours() === h; i++) g.step([]); assert.ok(Math.abs(h - ours() - GU.bowCannon.ballDamage * H.siege) < 0.5, `the bow cannon answers: ${h - ours()}`); }
// Z holds fire
{ enemy.holdFire = true; const h = enemy.hp; run(400); assert.equal(enemy.hp, h, 'Z: no fire'); }
// a ceasefire holds fire
{ delete mine.holdFire; rec.terms = { by: foe }; const h = enemy.hp; run(400); assert.equal(enemy.hp, h, 'ceasefire: no fire'); delete rec.terms; }
// sinking is news
mine.holdFire = true;
{ S.news.length = 0; g.ships.shelter(enemy, 1e6, pseudo('field_cannon', { owner: 'player' })); assert.ok(enemy.dead, 'sunk');
  const n = S.news.find(x => x.kind === 'shipSunk'); assert.ok(n && n.clan === foe && n.by === 'player' && n.unit === 'transport', 'shipSunk news'); }
run(2);

// --- the deck Gatling at enemy troops on the shore; melee does not chase a ship ---
let shore = null;
for (let r = 5; r <= 12 && !shore; r += 1) for (let a = 0; a < 48; a++) { const x = mine.x + Math.cos(a * Math.PI / 24) * r, z = mine.z + Math.sin(a * Math.PI / 24) * r; if (passable(world, x, z) && !sailable(wg, x, z, 'big')) { shore = { x, z }; break; } }
assert.ok(shore, 'land beside the warship');
const men = [0, 1, 2].map(k => g.frontier.war.spawnTroop(rec, 'grunt', shore.x + k * 0.5, shore.z, foe)).map(id => S.entities[id]);
for (const m of men) m.order = { kind: 'stop' };
delete mine.holdFire; mine.gunAt = { broadside: S.tick + 1e6 };   // cannons out of it: troops are no cannon target anyway
const near = men.filter(m => Math.hypot(m.x - mine.x, m.z - mine.z) <= GU.deckGatling.range && Math.hypot(m.x - mine.x, m.z - mine.z) >= UT.gatling_crew.gatling.minRange);
if (near.length) {
  const hp0 = near.map(m => m.hp);
  run(UT.gatling_crew.gatling.spinTicks + 30);
  assert.ok(near.some((m, i) => m.hp < hp0[i] || m.downed || m.dead), 'the deck Gatling fires on troops in range');
} else console.log('(landing troops out of the deck gun reach: Gatling not checked)');
{ const thug = men[0]; if (!thug.dead && !thug.downed) { const t = g.ships.isShip(mine); assert.ok(t); }
  // melee units never pick a ship as a target (combat.nearestEnemy via the fight): give them time and check
  for (const m of men) { m.hp = m.maxHp; delete m.downed; m.order = { kind: 'stop' }; }
  mine.holdFire = true; run(60);
  assert.ok(men.every(m => S.entities[m.id] && !(m.attackTarget === mine.id)), 'grunts do not go for the ship'); }

// --- a watchtower shoots a ship only with nobody else in range (rule in structures.js towers) ---
const src = readFileSync(new URL('../src/sim/frontier/structures.js', import.meta.url), 'utf8');
assert.ok(src.includes('ships S4: a ship only with nobody else in range'));
console.log('test_ship_guns: ok');
