// Ships plan S3 (Tim 2026-11-22): the town shipyard and the camp slipway on the ship_test dev save: where they may
// stand (the shore by the harbour; any shore in the circle, not chained), the menus offer them only with water ships
// sail, ships trained from the war chest and timber come out on the water beside them, dock repair, ruin rules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { loadSave } from '../src/sim/save.js';
import { build } from './make_dev_save.mjs';
import { waterGrid, sailable, landingFor, nearestSailable } from '../src/sim/frontier/water_nav.js';
import { createPlacement } from '../src/sim/frontier/placement.js';
import { militaryFor } from '../src/sim/frontier/town_military.js';
import { yardWater, yardSpotWhy, slipSpotWhy, circleShore } from '../src/sim/frontier/shipyard.js';
import { cellToWorld, setUse } from '../src/sim/frontier/town_grid.js';

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

// --- data: town-only shipyard, camp slipway, neither on the morale bar ---
assert.equal(W.buildings.shipyard.where, 'town'); assert.equal(W.buildings.slipway.where, 'camp'); assert.ok(W.buildings.slipway.unchained);
assert.ok(F.buildings.shipyard?.military && !F.buildings.slipway, 'the shipyard is a town military building, the slipway is not');
assert.equal(W.morale?.weights?.shipyard, undefined); assert.equal(W.morale?.weights?.slipway, undefined);
assert.ok(!W.ships.buildings?.shipyard && !W.ships.buildings?.slipway, 'moved out of the holding block');

// --- the shipyard: offered to a harbour town only, on the shore by the harbour ---
assert.ok(yardWater(world, town, W.buildings.shipyard), 'the harbour town has ship water');
assert.ok(militaryFor(town, F, S, world).includes('shipyard'), 'the harbour town is offered a shipyard');
const dry = world.sites.find(s => !s.harbor && !yardWater(world, { id: 'dry', x: s.x, z: s.z, site: s.id }, W.buildings.shipyard));
assert.ok(dry, 'some inland site has no ship water');
assert.ok(!militaryFor({ id: 'dry', x: dry.x, z: dry.z, site: dry.id, owner: town.owner }, F, S, world).includes('shipyard'), 'an inland town is not');
assert.match(yardSpotWhy(world, town, town.x, town.z, W.buildings.shipyard) || '', /harbour|shore/, 'not at the town hall');
// the dev save has a built shipyard on the shore by the harbour: take it out to try the placement rules, then put it back
const yard = town.buildings.find(b => b.type === 'shipyard');
assert.ok(yard?.stage === 'built', 'ship_test has a built shipyard');
{ const pts = yard.cells.map(i => cellToWorld(town, i)), cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  assert.equal(yardSpotWhy(world, town, cx, cz, W.buildings.shipyard), null, 'it stands on the shore by the harbour'); }
const use0 = town.grid.use;
town.buildings.splice(town.buildings.indexOf(yard), 1); for (const c of yard.cells) setUse(town, c, '.');
const P = createPlacement({ data: F, state: S, construction: { cancel() {} }, worldData: world });
const n = town.grid.n, near = [...Array(n * n).keys()].filter(i => { const [x, z] = cellToWorld(town, i); return Math.hypot(x - harbour.x, z - harbour.z) < 200; });
let spot = null, shoreWhy = 0;
for (const i of near) { const r = P.check(town, { kind: 'shipyard', cells: [i] }); if (r.ok) { spot ||= r; } else if (/shore/.test(r.reason)) shoreWhy++; }
assert.ok(spot, 'a shipyard fits on the shore by the harbour');
assert.ok(shoreWhy > 0, 'ground away from the water is refused with the shore reason');
{ const pts = spot.cells.map(i => cellToWorld(town, i)), cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  assert.ok(nearestSailable(wg, cx, cz, 'big', W.buildings.shipyard.shoreReach), 'beside ship water'); }

town.buildings.push(yard); town.grid.use = use0;

// --- the slipway: any shore in the circle, not chained to the camp, never offered without shore ---
{ const sw = rec.camp.buildings.find(b => b.type === 'slipway');   // the dev save's slipway: on the shore, then out of the way
  assert.ok(sw?.stage === 'built', 'ship_test has a built slipway'); assert.equal(slipSpotWhy(world, sw.x, sw.z, W.buildings.slipway), null);
  rec.camp.buildings.splice(rec.camp.buildings.indexOf(sw), 1); }
assert.ok(circleShore(world, town, W.circleRadius, 300, W.buildings.slipway));
assert.ok(world.sites.some(s => !circleShore(world, { id: 'c' + s.id, x: s.x, z: s.z }, W.circleRadius, 0)), 'some circles hold no ship water');
assert.ok(war.campBuildList(rec.id).some(x => x.type === 'slipway'), 'the camp menu offers a slipway');
assert.ok(!war.campBuildList(rec.id).some(x => x.type === 'shipyard'), 'never a shipyard');
assert.equal(war.campCheck(rec.id, 'shipyard', { x: hall.x + 30, z: hall.z }).reason, 'Not a camp building');
{ let inland = null; for (let a = 0; a < 24 && !inland; a++) { const x = hall.x + Math.cos(a / 3.8) * 40, z = hall.z + Math.sin(a / 3.8) * 40; if (!nearestSailable(wg, x, z, 'big', 60)) inland = { x, z }; }
  assert.ok(inland); assert.match(war.campCheck(rec.id, 'slipway', inland).reason, /^A slipway stands on the shore/, 'not inland'); }
const circle = { x: town.x, z: town.z, r: W.circleRadius };
const chain = W.chainDistance ?? 120, far = [];
let slip = null;
for (let r = 320; r <= 860 && !slip; r += 10) for (let a = 0; a < 360; a += 2) {
  const x = Math.round(town.x + Math.cos(a * Math.PI / 180) * r), z = Math.round(town.z + Math.sin(a * Math.PI / 180) * r);
  if (!nearestSailable(wg, x, z, 'big', W.buildings.slipway.shoreReach) || rec.camp.buildings.some(b => Math.hypot(b.x - x, b.z - z) < chain + 10)) continue;
  const ok = war.campCheck(rec.id, 'slipway', { x, z });
  if (process.env.DBG) console.log(x, z, ok.reason);
  if (ok.ok) { slip = { x, z }; break; }
}
assert.ok(slip, 'a slipway fits on a shore outside the build area');
assert.equal(slipSpotWhy(world, slip.x, slip.z, W.buildings.slipway), null);
rec.camp.chest = 5000; rec.camp.stock.timber = 2000; rec.camp.stock.stone = 1000;
let r = cmd(hero, { action: 'campPlace', war: rec.id, kind: 'slipway', x: slip.x, z: slip.z });
assert.ok(r?.ok, r?.reason);
const sb = rec.camp.buildings.find(b => b.type === 'slipway');
// it does not widen the build area: a barracks beside it is still outside
assert.match(war.campCheck(rec.id, 'barracks', { x: sb.x + 25, z: sb.z }).reason || '', /Outside the build area|shore|built on|close/, 'no chain from a slipway');
assert.match(war.campCheck(rec.id, 'slipway', { x: slip.x, z: slip.z }).reason, /at most 1|close/i, 'one a camp');

// --- training a ship: ryo from the chest, timber from the camp stock, out on the water beside the slipway ---
Object.assign(sb, { stage: 'built', progress: sb.need });
const U = W.units.warship, chest0 = rec.camp.chest, wood0 = rec.camp.stock.timber;
rec.camp.stock.timber = U.timber - 1;
r = cmd(hero, { action: 'campTrain', war: rec.id, building: sb.id, unit: 'warship', count: 1 });
assert.match(r?.reason, /timber from the camp stock/, 'short of timber');
rec.camp.stock.timber = wood0;
r = cmd(hero, { action: 'campTrain', war: rec.id, building: sb.id, unit: 'warship', count: 1 }); assert.ok(r.ok, r.reason);
assert.equal(rec.camp.stock.timber, wood0 - U.timber, 'timber paid'); assert.ok(rec.camp.chest < chest0, 'ryo paid');
r = cmd(hero, { action: 'campTrain', war: rec.id, building: sb.id, unit: 'transport', count: 1 }); assert.ok(r.ok, r.reason);
r = cmd(hero, { action: 'campUntrain', war: rec.id, building: sb.id }); assert.ok(r.ok, r.reason);
assert.equal(rec.camp.stock.timber, wood0 - U.timber, 'cancel gives the timber back');
const before = new Set(Object.values(S.entities).filter(e => e.ship).map(e => e.id));
sb.queue[0].left = 2; run(3);
const made = Object.values(S.entities).find(e => e.ship && !before.has(e.id));
assert.ok(made && made.warUnit === 'warship' && made.owner === 'player', 'the warship is out');
assert.ok(sailable(wg, made.x, made.z, 'big'), 'on ship water');
assert.ok(Math.hypot(made.x - sb.x, made.z - sb.z) < 80, 'beside the slipway');
assert.ok(!sb.queue, 'the queue is empty');

// --- dock repair: stopped by its own built yard it mends; under way, hit lately, or far off it does not ---
made.holdFire = true;   // a ship that fires pauses its repair (S4): hold fire for the repair checks
made.hp = made.maxHp * 0.4; const hp0 = made.hp;
assert.ok(g.ships.yardsOf(made).length === 1);
run(200);
assert.ok(made.hp > hp0 + made.maxHp * 0.1 && made.hp < made.maxHp, `it mends at the slipway (${made.hp})`);
run(1000); assert.equal(made.hp, made.maxHp, 'to full in about a minute'); assert.ok(!made.mending, 'and stops');
made.hp = made.maxHp * 0.4; made.hitAt = S.tick; run(100); assert.equal(made.hp, made.maxHp * 0.4, 'paused after a hit'); delete made.hitAt;
const old = rec.camp.buildings.find(b => b.type !== 'slipway' && b.type !== 'camp_hall');
const ship0 = Object.values(S.entities).find(e => e.ship && before.has(e.id) && e.owner === 'player');
{ let away = null; for (let a = 0; a < 72 && !away; a++) for (const r of [200, 300, 400, 500]) { const p = nearestSailable(wg, sb.x + Math.cos(a / 11.5) * r, sb.z + Math.sin(a / 11.5) * r, 'big', 40, { x: town.x, z: town.z, r: W.circleRadius - 30 }); if (p && Math.hypot(p.x - sb.x, p.z - sb.z) > 150) { away = p; break; } }
  assert.ok(away); Object.assign(ship0, { x: away.x, z: away.z, sorder: { kind: 'stay' } }); }
ship0.holdFire = true; ship0.hp = ship0.maxHp * 0.5; run(100); assert.equal(ship0.hp, ship0.maxHp * 0.5, 'away from a yard it does not mend');
sb.stage = 'ruined'; made.hp = made.maxHp * 0.4; run(100); assert.equal(made.hp, made.maxHp * 0.4, 'a ruined slipway mends nothing');
assert.ok(war.campRebuildCheck(rec.id, sb.id).ok !== false || /afford|Needs|has/.test(war.campRebuildCheck(rec.id, sb.id).reason), 'a ruined slipway is rebuilt in place');
assert.notEqual(war.campRebuildCheck(rec.id, sb.id).reason, 'Erase the ruin, then build a new one');

// --- the town shipyard trains for the defender, from his war chest and town timber ---
const rival = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === rec.defender) || { id: null };
S.tick = Math.max(S.tick, (rec.started ?? 0) + (W.town?.musterSeconds ?? 0) * 20 + 40);
if (rival.id) {
  const tw0 = town.stock.timber, ch0 = rec.defense.chest;
  r = cmd(rival, { action: 'townTrain', war: rec.id, building: yard.id, unit: 'transport', count: 1 });
  assert.ok(r?.ok, r?.reason);
  assert.ok(Math.abs(town.stock.timber - (tw0 - W.units.transport.timber)) < 1, 'town timber paid'); assert.ok(rec.defense.chest < ch0, 'war chest paid');
  const had = new Set(Object.values(S.entities).filter(e => e.ship).map(e => e.id));
  yard.queue[0].left = 2; run(3);
  const t2 = Object.values(S.entities).find(e => e.ship && !had.has(e.id));
  assert.ok(t2 && t2.owner === rec.defender && t2.warUnit === 'transport', 'the transport is out for the town');
  assert.ok(sailable(wg, t2.x, t2.z, 'big'), 'on ship water by the shipyard');
  assert.equal(g.ships.yardsOf(t2).length, 1, 'its yard is the town shipyard');
} else console.log('(no defender hero to command the town: town training checked by war_defense only)');
console.log('test_shipyard: ok');
