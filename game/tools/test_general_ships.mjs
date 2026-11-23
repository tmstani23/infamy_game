// Ships plan S9: the general uses ships (sim/war_general_ships.js), bot versus bot on the ship_test dev save: the
// player's general (his hero away) attacks the rival's harbour town. Ships have work there; ships are no part of the
// land army; the warship shells or goes at enemy ships; a hurt warship lies at its yard and mends; a warship with a
// party boards a weakened enemy ship; a camp without a slipway puts one on the shore; a rival town at war without a
// shipyard builds one; a defender trains a warship; a transport lands a party by the town; an inland war has no ship work.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { loadSave } from '../src/sim/save.js';
import { build } from './make_dev_save.mjs';
import { waterGrid, nearestSailable, sailable } from '../src/sim/frontier/water_nav.js';
import { passable } from '../src/sim/world_data.js';

const data = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'),
  police: data('data/police.json'), settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'),
  resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json'),
  frontier: { ...data('data/frontier.json'), railways: data('data/railways.json'), castleBlueprint: data('data/castle_default.json'), campaignZones: data('data/campaign_zones.json') } });
const file = build('ship_test', { clan: 'yakuza', difficulty: 'medium', mode: 'campaign', ticks: 400, realGame: true, cityMix: true, ryo: 3000, renown: 300, crew: 6, shipTest: true });
const world = options().world, wg = waterGrid(world);

function scene(tune = null) {
  const o = options(); tune?.(o.frontier);
  const g = createGame(o), S = g.state, bots = loadSave(g, JSON.parse(JSON.stringify(file)));
  const rec = Object.values(S.frontier.wars.list)[0], town = S.frontier.settlements[rec.town], hall = rec.camp.buildings.find(b => b.type === 'camp_hall');
  const hero = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === 'player');
  Object.assign(hero, { x: town.x + 1600, z: town.z }); delete hero.order;   // away: his general runs his side
  const gen = clan => bots.find(b => b.config?.general && b.config.clan === clan);
  const sent = [];
  const run = n => { for (let i = 0; i < n; i++) { const c = bots.flatMap(b => b.tick()); sent.push(...c.filter(x => x.by === 'general').map(x => ({ tick: S.tick, ...x }))); g.step(c); } };
  const ship = (owner, unit) => Object.values(S.entities).find(e => e.ship && !e.dead && e.owner === owner && e.warUnit === unit);
  const troopsAt = (owner, unit, n, p) => Array.from({ length: n }, (_, k) => S.entities[g.frontier.war.spawnTroop(rec, unit, p.x + (k % 4) * 1.4, p.z + Math.floor(k / 4) * 1.4, owner)]);
  return { g, S, bots, rec, town, hall, hero, gen, run, sent, ship, troopsAt };
}
// a walkable spot near p (troops are spawned there)
const ground = p => { for (let r = 0; r < 60; r += 2) for (let a = 0; a < 16; a++) { const x = p.x + Math.cos(a * Math.PI / 8) * r, z = p.z + Math.sin(a * Math.PI / 8) * r; if (passable(world, x, z) && !sailable(wg, x, z, 'big')) return { x, z }; } return p; };

// --- ships have work here; the land army leaves ships alone; a ship goes to work ---
{
  const T = scene(), { S, rec, run, sent, ship } = T, fleet = T.gen('player').fleet;
  assert.ok(fleet.worth(rec, 'attacker').any, 'ships have work for the attacker (the shipyard and town on the shore)');
  assert.ok(fleet.worth(rec, 'defender').any, 'and for the defender (the slipway on the shore, enemy ships)');
  const war = ship('player', 'warship'), x0 = { ...war.sorder };
  run(1300);
  const shipIds = new Set(Object.values(S.entities).filter(e => e.ship).map(e => e.id));
  const landOrders = sent.filter(c => c.type === 'order' && ['station', 'raze'].includes(c.kind));
  assert.ok(landOrders.every(c => !(c.units || []).some(id => shipIds.has(id))), 'no station or raze order of the land army names a ship');
  const shipOrders = sent.filter(c => c.type === 'order' && (c.units || []).some(id => shipIds.has(id)));
  assert.ok(shipOrders.length > 0 || war.firedAt != null, 'the general sends its ships to work');
  assert.ok(shipOrders.length < 40, `and does not repeat the same order every look (${shipOrders.length})`);
  console.log('ok ships have work, kept out of the land army', shipOrders.length, 'ship orders, fired:', war.firedAt != null, x0.kind);
}

// --- a hurt warship lies at its yard and mends ---
{
  const T = scene(), { S, rec, run, ship } = T, war = ship('player', 'warship');
  const slip = rec.camp.buildings.find(b => b.type === 'slipway');
  // sail it away from the yard first, then hurt it
  const away = nearestSailable(wg, war.x + 120, war.z, 'big', 100, { x: T.town.x, z: T.town.z, r: 880 }) || nearestSailable(wg, war.x - 120, war.z, 'big', 100, { x: T.town.x, z: T.town.z, r: 880 });
  Object.assign(war, { x: away.x, z: away.z, sorder: { kind: 'stay' } });
  war.hp = war.maxHp * 0.3;
  for (const e of Object.values(S.entities)) if (e.ship && e.owner !== 'player') e.holdFire = true;
  const d0 = Math.hypot(war.x - slip.x, war.z - slip.z);
  run(1600);
  const d1 = Math.hypot(war.x - slip.x, war.z - slip.z);
  assert.ok(d1 < Math.min(60, d0), `it sails home to its slipway (${Math.round(d0)} -> ${Math.round(d1)})`);
  assert.ok(war.hp > war.maxHp * 0.3, 'and mends there');
  console.log('ok a hurt warship mends at its yard', Math.round(war.hp / war.maxHp * 100) + '%');
}

// --- a warship with a party aboard boards a weakened enemy ship ---
{
  const T = scene(), { g, S, rec, run, ship, troopsAt } = T, war = ship('player', 'warship');
  for (const e of Object.values(S.entities)) if (e.ship) e.holdFire = true;   // no sinking muddling it
  const shore = g.ships.shoreOf(war); assert.ok(shore, 'the warship lies at the shore');
  const men = troopsAt('player', 'grunt', 3, ground(shore));
  g.step([{ id: T.hero.id, type: 'ship', action: 'board', ship: war.id, units: men.map(u => u.id) }]);
  for (let i = 0; i < 200 && g.ships.riders(war).length < 3; i++) g.step([]);
  assert.equal(g.ships.riders(war).length, 3, 'three aboard');
  const spot = nearestSailable(wg, war.x + 30, war.z + 10, 'big', 60, { x: T.town.x, z: T.town.z, r: 880 });
  const foe = g.ships.spawn(rec, 'transport', spot.x, spot.z, rec.defender);
  foe.hp = foe.maxHp * 0.4; foe.holdFire = true;
  delete war.holdFire;
  run(1200);
  assert.ok(T.sent.some(c => c.type === 'special' && c.ability === 'board' && c.units?.includes(war.id)), 'the general boards it');
  assert.ok(foe.owner === 'player' || foe.dead, `it is taken (owner ${foe.owner})`);
  console.log('ok the general boards a weakened ship', foe.owner);
}

// --- a camp with no slipway puts one on the shore (a barracks stands) ---
{
  const T = scene(), { S, rec, run, sent } = T;
  rec.camp.buildings = rec.camp.buildings.filter(b => b.type !== 'slipway');
  for (const e of Object.values(S.entities)) if (e.ship) e.dead = true;
  rec.camp.chest = 3000; Object.assign(rec.camp.stock, { timber: 2000, stone: 900 });
  run(1);
  const war = T.g.frontier.war;
  // a built barracks beside the camp hall
  let p = null; for (let r = 24; r < 110 && !p; r += 6) for (let a = 0; a < 24; a++) { const x = Math.round(T.hall.x + Math.cos(a * Math.PI / 12) * r), z = Math.round(T.hall.z + Math.sin(a * Math.PI / 12) * r); if (war.campCheck(rec.id, 'barracks', { x, z }).ok) { p = { x, z }; break; } }
  rec.camp.buildings.push({ id: `${rec.id}:barracks${S.frontier.nextId++}`, type: 'barracks', stage: 'built', x: p.x, z: p.z, progress: 1, need: 1 });
  run(700);
  const c = sent.find(x => x.action === 'campPlace' && x.kind === 'slipway');
  assert.ok(c, 'the camp places a slipway');
  const site = rec.camp.buildings.find(b => b.type === 'slipway');
  assert.ok(site && nearestSailable(wg, site.x, site.z, 'big', 30), 'on the shore');
  console.log('ok the camp puts up a slipway', site.stage);
}

// --- a rival town at war without a shipyard builds one; the defender trains a warship ---
{
  const T = scene(), { S, rec, town, run, sent, troopsAt } = T;
  const yard = town.buildings.find(b => b.type === 'shipyard');
  town.buildings = town.buildings.filter(b => b !== yard);
  for (const i of yard.cells?.length ? yard.cells : [yard.cell]) { town.grid.use = town.grid.use.slice(0, i) + '.' + town.grid.use.slice(i + 1); }
  T.g.frontier.world.recount?.(town.id);
  Object.assign(town.stock, { timber: 1500, stone: 800 });
  run(1300);
  assert.ok(sent.some(x => x.action === 'place' && x.kind === 'shipyard' && x.town === town.id), 'the rival town places a shipyard');
  console.log('ok a rival town at war builds a shipyard');
}
{
  const T = scene(), { S, rec, town, run, sent, troopsAt } = T;
  troopsAt(rec.defender, 'grunt', 8, ground(town));
  rec.defense.chest = 2000; town.stock.timber = 1500;
  run(700);
  assert.ok(sent.some(x => x.action === 'townTrain' && x.unit === 'warship'), 'the defender trains a warship');
  console.log('ok the defender trains a warship');
}

// --- a transport lands a party by the town ---
{
  // (this town's shore is all on the camp's side, about 500 from the hall: landShorter and landReach are raised so a landing
  // counts; the army is kept gathering, so the transport sails after landWaitSeconds)
  const T = scene(f => { f.war.general.ships.landShorter = 5; f.war.general.ships.landReach = 400; Object.assign(f.war.general.strategies.siege.attack, { pushAt: 200, bold: 0, edgePush: 99 }); }), { g, S, rec, run, sent, ship, troopsAt } = T, fleet = T.gen('player').fleet;
  const w = fleet.worth(rec, 'attacker');
  assert.ok(w.land, 'a landing');
  {
    const tr = ship('player', 'transport');
    for (const e of Object.values(S.entities)) if (e.ship) e.holdFire = true;
    troopsAt('player', 'grunt', 14, ground(T.hall));
    run(4000);
    const m = T.gen('player').view().wars[rec.id]?.attacker?.sea?.land;
    const landed = Object.values(S.entities).filter(u => u.owner === 'player' && u.warTroop === rec.id && !u.ship && !u.dead && Math.hypot(u.x - w.land.land.x, u.z - w.land.land.z) < 120);
    assert.ok(sent.some(c => c.type === 'ship' && c.action === 'board' && c.ship === tr.id), 'the transport takes a party aboard');
    assert.ok(m && ['wait', 'sail', 'ashore'].includes(m.stage) || landed.length, `it goes to land them (stage ${m?.stage})`);
    console.log('ok a transport lands a party', m?.stage, landed.length, 'near the landing');
  }
}
console.log('test_general_ships: all passed');
