// Ships plan S2 (Tim 2026-11-22): warships and transports as RTS units (sim/frontier/ships.js) on the ship_test dev save:
// troop places, move on water inside the war circle, landing on a click on land (one steps off a second), boarding one at
// a time, All aboard, Z holds, hits on riders go to the hull, sinking, save and load mid-sail.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { loadSave, makeSave } from '../src/sim/save.js';
import { build } from './make_dev_save.mjs';
import { waterGrid, sailable, landingFor, nearestSailable } from '../src/sim/frontier/water_nav.js';
import { passable } from '../src/sim/world_data.js';
import { shoreWanted, shoreLine, landMark } from '../src/landing_shore.js';   // ships S6b

const data = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'),
  police: data('data/police.json'), settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'),
  frontier: { ...data('data/frontier.json'), railways: data('data/railways.json'), castleBlueprint: data('data/castle_default.json'), campaignZones: data('data/campaign_zones.json') } });
const file = build('ship_test', { clan: 'yakuza', difficulty: 'medium', mode: 'campaign', ticks: 400, realGame: true, cityMix: true, ryo: 3000, renown: 300, crew: 6, shipTest: true });
const fresh = () => { const g = createGame(options()); loadSave(g, JSON.parse(JSON.stringify(file))); return g; };
let g = fresh(), S = g.state;
const world = options().world, F = options().frontier, wg = waterGrid(world);
const hero = () => S.entities[Object.values(S.entities).find(e => e.type === 'hero' && e.owner === 'player').id];
const rec = Object.values(S.frontier.wars.list)[0], town = S.frontier.settlements[rec.town], hall = rec.camp.buildings.find(b => b.type === 'camp_hall');
const circle = { x: town.x, z: town.z, r: F.war.circleRadius };
const run = (n, cmds = []) => { for (let i = 0; i < n; i++) g.step(i ? [] : cmds); };
const order = (units, c) => g.step([{ id: hero().id, type: 'order', units, place: 'world', ...c }]);
const crew = () => Object.values(S.entities).filter(u => u.owner === 'player' && u.type !== 'hero' && !u.ship && !u.dead && !u.downed && u.place === 'world' && u.type !== 'horse');
assert.ok(g.ships, 'the game has ships');

// a warship and a transport at the shore nearest the camp hall, inside the circle
const L0 = landingFor(wg, hall.x, hall.z, 'big', { box: circle, maxR: 400 });
assert.ok(L0?.berth, 'landable shore near the camp');
for (const o of Object.values(S.entities)) if (o.ship && o.owner === 'player') delete S.entities[o.id];   // the save's own ships: this test brings its own to the same shore
const ship = g.ships.spawn(rec, 'warship', L0.berth.x, L0.berth.z, 'player');
const t2 = nearestSailable(wg, L0.berth.x + 30, L0.berth.z + 30, 'big', 80, circle);
const transport = g.ships.spawn(rec, 'transport', t2.x, t2.z, 'player');
assert.ok(ship?.ship && transport?.ship && ship.type === 'warship' && ship.model === 'ship_war' && transport.model === 'ship_coastal');
assert.equal(ship.hp, data('data/units.json').types.warship.hp, 'hull health from units.json');
{ const v = g.frontier.war.troopView(rec.id); assert.ok(v.troops >= 9, `a warship takes 5 troop places and a transport 4 (${v.troops})`); }
run(2);
assert.ok(g.ships.shoreOf(ship), 'the warship lies at the shore');

// --- boarding: the crew walk to the shore and step aboard one at a time ---
const men = crew().slice(0, 8);
assert.ok(men.length >= 6, `crew to board (${men.length})`);
for (const u of men) { u.x = L0.land.x + 4; u.z = L0.land.z + 4; }
g.step([{ id: hero().id, type: 'ship', action: 'board', ship: ship.id, units: men.map(u => u.id) }]);
let last = 0, steps = [];
for (let i = 0; i < 600 && g.ships.riders(ship).length < 6; i++) { g.step([]); const n = g.ships.riders(ship).length; if (n !== last) { steps.push(S.tick); last = n; } }
assert.equal(g.ships.riders(ship).length, 6, 'the hold takes 6');
assert.ok(steps.every((t, i) => !i || t - steps[i - 1] >= 19), 'one steps aboard a second');
assert.ok(men.filter(u => !u.inShip).every(u => !u.boardShip), 'those that did not fit are not left waiting');
for (const u of g.ships.riders(ship)) assert.ok(u.aboard === ship.id && u.x === ship.x && u.z === ship.z, 'riders sit inside');

// --- a move on the water: it sails there, always on water and inside the circle ---
const goal = nearestSailable(wg, ship.x + (town.x - ship.x) * 0.3 + 60, ship.z + (town.z - ship.z) * 0.3, 'big', 300, circle) || nearestSailable(wg, ship.x + 120, ship.z, 'big', 200, circle);
assert.ok(goal, 'a water spot to sail to');
order([ship.id], { kind: 'raze', fallback: 'move', x: goal.x, z: goal.z, slack: 3 });   // at war a ground right-click is a raze order
assert.equal(ship.sorder.kind, 'move', 'a ship takes a move order');
let wet = true, inside = true;
for (let i = 0; i < 2400 && ship.sorder.kind === 'move'; i++) { g.step([]); const h = wg.cell / 2; wet &&= [[0, 0], [h, 0], [-h, 0], [0, h], [0, -h]].some(([a, b]) => sailable(wg, ship.x + a, ship.z + b, 'big')); inside &&= Math.hypot(ship.x - circle.x, ship.z - circle.z) <= circle.r; }
assert.equal(ship.sorder.kind, 'stay', 'it arrives');
assert.ok(Math.hypot(ship.x - goal.x, ship.z - goal.z) < 2, 'at the spot');
assert.ok(wet && inside, 'on water and inside the war circle all the way');
for (const u of g.ships.riders(ship)) assert.ok(u.x === ship.x && u.z === ship.z, 'riders go with it');

// --- Z: holds still and holds fire; a new order lifts it ---
order([ship.id], { kind: 'stop' }); assert.ok(ship.holdFire && ship.sorder.kind === 'stay');

// --- a move onto land is a landing: sail to the shore, then everyone steps off, one a second, onto walkable ground ---
const shore = landingFor(wg, town.x, town.z, 'big', { box: circle, maxR: 600 });
assert.ok(shore, 'landable shore by the town');
order([ship.id], { kind: 'move', x: shore.land.x, z: shore.land.z });
assert.equal(ship.sorder.kind, 'land'); assert.ok(!ship.holdFire, 'a new order lifts the hold');
for (let i = 0; i < 2400 && ship.sorder.kind === 'land'; i++) g.step([]);
assert.equal(ship.sorder.kind, 'unload', 'reached the shore and unloads');
const off = [];
for (let i = 0; i < 400 && g.ships.riders(ship).length; i++) { const n = g.ships.riders(ship).length; g.step([]); if (g.ships.riders(ship).length < n) off.push(S.tick); }
assert.equal(g.ships.riders(ship).length, 0, 'all stepped off');
assert.ok(off.every((t, i) => !i || t - off[i - 1] >= 19), 'one steps off a second');
for (const u of men.filter(u => !u.inShip).slice(0, 6)) assert.ok(passable(world, u.x, u.z) && Math.hypot(u.x - shore.land.x, u.z - shore.land.z) < 15, 'on walkable shore by the landing');
assert.equal(ship.sorder.kind, 'stay');

// a click on blocked coast: the ship goes to the nearest landable shore
{ let k = -1; for (let j = 1; j < wg.H - 1 && k < 0; j++) for (let i = 1; i < wg.W - 1; i++) { const q = j * wg.W + i; if (wg.kind[q] || wg.walk[q]) continue;
    const x = (i + 0.5) * wg.cell, z = (j + 0.5) * wg.cell; if (Math.hypot(x - circle.x, z - circle.z) > circle.r - 100) continue;
    if ([q - 1, q + 1, q - wg.W, q + wg.W].some(n => wg.kind[n] === 1)) { k = q; break; } }
  if (k >= 0) { const x = (k % wg.W + 0.5) * wg.cell, z = (Math.floor(k / wg.W) + 0.5) * wg.cell; order([transport.id], { kind: 'move', x, z });
    assert.ok(transport.sorder.kind === "land" && transport.sorder.blocked, `cliff coast: lands at the nearest landable shore (${JSON.stringify(transport.sorder).slice(0, 200)} ${x} ${z} ${S.clans.player.notice?.text})`); order([transport.id], { kind: 'stop' }); } }

// --- the ship is not a land unit: land orders never reach it, and it is no target yet (guns come in S4) ---
order([ship.id, men[0].id], { kind: 'move', x: shore.land.x + 3, z: shore.land.z + 3 });
assert.ok(!ship.order && men[0].order?.kind === 'move', 'a mixed order: the ship sails, the man walks');

// --- as the omnibus (Tim 2026-11-23): no ring and no Space; a right-click sends them aboard one at a time ---
for (let i = 0; i < 100 && ship.sorder.kind !== 'stay'; i++) g.step([]);
for (const [i, u] of men.slice(0, 4).entries()) Object.assign(u, { x: shore.land.x + 2 + i, z: shore.land.z + 1, order: { kind: 'stop' } });
Object.assign(hero(), { x: shore.land.x + 1, z: shore.land.z + 1, place: 'world' });
assert.equal(g.ships.prompt(hero()), null, 'no Space prompt beside a ship');
g.step([{ id: hero().id, type: 'use' }]);
assert.ok(!hero().shipBoard, 'Space calls no ring');
g.step([{ id: hero().id, type: 'ship', action: 'board', ship: ship.id, units: [hero().id, ...men.slice(0, 4).map(u => u.id)] }]);
run(10 * 20 + 7 * 20);
assert.ok(hero().inShip === ship.id && g.ships.riders(ship).length >= 5, `the hero and the men sent are aboard (${g.ships.riders(ship).length})`);
const sx = hero().x; g.step([{ id: hero().id, type: 'move', right: 1, down: 0 }]); assert.equal(hero().x, sx, 'the hero aboard does not walk');
assert.equal(g.ships.prompt(hero()), null, 'aboard: no hint banner (Tim 2026-11-24)');

// --- S6b: the landable shore shows while your people are afloat; the cursor marks where a click lands ---
{ const want = shoreWanted(g, 'player'); assert.equal(want.length, 1, 'the war circle your people are afloat in');
  assert.equal(shoreWanted(g, 'nobody').length, 0, 'no line with nobody afloat');
  const runs = shoreLine(world, want[0].box, want[0].water), p = runs[0]?.[Math.floor(runs[0].length / 2)];
  assert.ok(p && runs.every(r => r.every(q => Math.hypot(q.x - town.x, q.z - town.z) <= circle.r)), 'landable shore lines, inside the circle');
  assert.equal(landMark(world, p.x - p.nx * 6, p.z - p.nz * 6, 'big', want[0].box), 'anchor', 'an anchor just ashore on the line');
  assert.equal(landMark(world, p.x + p.nx * 40, p.z + p.nz * 40, 'big', want[0].box), null, 'no mark out on the water'); }

// --- save and load mid-sail ---
order([ship.id], { kind: 'move', x: goal.x, z: goal.z }); run(40);
const mid = { x: ship.x, z: ship.z, n: g.ships.riders(ship).length };
{ const sv = JSON.parse(JSON.stringify(makeSave(g))); g = createGame(options()); loadSave(g, sv); S = g.state; }
const ship2 = S.entities[ship.id];
assert.ok(ship2?.ship && ship2.sorder.kind === 'move' && Math.hypot(ship2.x - mid.x, ship2.z - mid.z) < 0.01 && g.ships.riders(ship2).length === mid.n, 'loads mid-sail');
for (let i = 0; i < 2400 && ship2.sorder.kind === 'move'; i++) g.step([]);
assert.equal(ship2.sorder.kind, 'stay', 'and sails on after loading');

// --- hits on someone aboard go to the hull; at 0 it sinks: troops drown, the hero and crew wash ashore ---
const rider = g.ships.riders(ship2).find(u => u.type !== 'hero'), hp0 = ship2.hp;
assert.ok(g.ships.shelter(rider, 150) && ship2.hp === hp0 - 150 && rider.hp > 0, 'the hull takes the hit');
const troop = S.entities[g.frontier.war.spawnTroop(rec, 'grunt', ship2.x, ship2.z, 'player')]; Object.assign(troop, { aboard: ship2.id, inShip: ship2.id }); delete troop.order;
const aboard = g.ships.riders(ship2);
g.ships.shelter(rider, 1e6); const sunkCast = S.casts?.find(c => c.kind === 'shipSunk' && c.a === ship2.id); g.step([]);
assert.ok(ship2.dead, 'sunk');
assert.ok(troop.dead && !troop.inShip, 'plain troops aboard drown');
assert.ok(troop.drowned === ship2.id && Math.hypot(troop.x - ship2.x, troop.z - ship2.z) > 1, 'S6: a drowned troop lies in the sea round the wreck');
{ const c = sunkCast; assert.ok(c && c.berth && c.washed === aboard.filter(u => !u.warTroop).length, 'S6: the sinking cast carries the landing for the wave'); }
for (const u of aboard.filter(u => !u.warTroop)) {
  assert.ok(!u.inShip && (u.downed || u.dead) && passable(world, u.x, u.z), `${u.type} washed ashore on landable ground`);
  assert.ok(u.washed != null, 'S6: marked washed ashore for the wave');
  assert.ok(Math.hypot(u.x - circle.x, u.z - circle.z) <= circle.r, 'inside the war circle');
}
console.log('ships: ok');
// a rider whose ship is gone without sinking (the war ended and took it) is set ashore, not left hidden aboard
{ const t = landingFor(wg, town.x, town.z, 'big', { box: circle, maxR: 600 }), s = g.ships.spawn(rec, 'transport', t.berth.x, t.berth.z, 'player'), u = crew().find(x => !x.inShip);
  Object.assign(u, { aboard: s.id, inShip: s.id, x: s.x, z: s.z }); delete S.entities[s.id]; g.step([]);
  assert.ok(!u.inShip && !u.aboard && passable(world, u.x, u.z), 'stranded rider set ashore'); }
// as the omnibus (Tim 2026-11-23): Q on a ship out on the water brings it in to the nearest shore, then everyone steps off;
// a right-click on a ship lying off brings it in to the shore by the men, and they board; one rider let off alone
{ const cmd = c => g.ships.command({ owner: 'player' }, c);   // (the hero is down after the sinking above: the rule itself)
  const t = landingFor(wg, town.x, town.z, 'big', { box: circle, maxR: 600 }), s = g.ships.spawn(rec, 'transport', t.berth.x, t.berth.z, 'player');
  const out = nearestSailable(wg, s.x + (s.x - t.land.x) * 6, s.z + (s.z - t.land.z) * 6, 'big', 200, circle);
  const two = crew().filter(x => !x.inShip && !x.dead && !x.downed).slice(0, 2); assert.equal(two.length, 2, 'two crew ashore');
  for (const [i, u] of two.entries()) Object.assign(u, { x: t.land.x + 1 + i, z: t.land.z + 1, place: 'world', order: { kind: 'stop' } });
  Object.assign(s, { x: out.x, z: out.z }); assert.ok(!g.ships.shoreOf(s), 'the ship lies off the shore');
  cmd({ action: 'board', ship: s.id, units: two.map(u => u.id) });
  assert.equal(s.sorder.kind, 'land', 'sent aboard a ship lying off: it comes in to their shore');
  for (let i = 0; i < 1500 && g.ships.riders(s).length < 2; i++) g.step([]);
  assert.equal(g.ships.riders(s).length, 2, 'and they board');
  Object.assign(s, { x: out.x, z: out.z, sorder: { kind: 'stay' } }); for (const u of two) Object.assign(u, { x: s.x, z: s.z });
  cmd({ action: 'unload', ships: [s.id] });
  assert.equal(s.sorder.kind, 'land', 'Q out on the water: it sails in to the nearest shore');
  for (let i = 0; i < 1500 && g.ships.riders(s).length; i++) g.step([]);
  assert.ok(!g.ships.riders(s).length && two.every(u => !u.inShip && passable(world, u.x, u.z)), 'then everyone steps off');
  cmd({ action: 'board', ship: s.id, units: two.map(u => u.id) }); for (let i = 0; i < 400 && g.ships.riders(s).length < 2; i++) g.step([]);
  assert.equal(g.ships.riders(s).length, 2, 'aboard again at the shore');
  cmd({ action: 'unload', ships: [s.id], only: two[0].id });
  assert.ok(!two[0].inShip && two[1].inShip === s.id, 'one rider let off alone');
  // Tim 2026-11-24: one seat on a ship out on the water: it comes in and only he steps off
  Object.assign(s, { x: out.x, z: out.z, sorder: { kind: 'stay' } }); Object.assign(two[1], { x: s.x, z: s.z });
  cmd({ action: 'unload', ships: [s.id], only: two[1].id });
  assert.equal(s.sorder.kind, 'land', 'one seat out on the water: the ship comes in');
  cmd({ action: 'board', ship: s.id, units: [two[0].id] });   // (a second rider, to see he stays aboard)
  Object.assign(two[0], { aboard: s.id, inShip: s.id, place: 'world' }); delete s.loadQueue; delete two[0].boardShip;
  Object.assign(s, { x: out.x, z: out.z }); cmd({ action: 'unload', ships: [s.id], only: two[1].id });
  for (let i = 0; i < 1500 && two[1].inShip; i++) g.step([]);
  for (let i = 0; i < 100; i++) g.step([]);
  assert.ok(!two[1].inShip && passable(world, two[1].x, two[1].z) && two[0].inShip === s.id && s.sorder.kind === 'stay', 'only he steps off there'); }
console.log('ships: omnibus rules ok');
console.log('ships: stranded ok');
