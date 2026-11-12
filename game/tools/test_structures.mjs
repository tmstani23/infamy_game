// F6 war, checkpoint 6: structure health, attacking and torching, ruins and breaches.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';
import { terrainAt } from '../src/sim/world_data.js';
import { townBlockersIn, cellToWorld, centreCell } from '../src/sim/frontier/town_grid.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), settings = data('data/settings.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world, worldChunks: data('data/world_chunks.json'), resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json'), frontier: { ...frontier, dev: true, railways: data('data/railways.json') } });
const S = frontier.war.structures;
assert.ok(S && S.townHall.length === 3 && S.wall > 0 && S.gate > 0 && S.zone.length === 3 && S.damage.melee === 1 && S.damage.ranged < 1 && S.damage.siege > 1, 'structure data block');
for (const t of Object.keys(frontier.war.buildings)) assert.ok((S.camp[t] ?? S.camp.default) > 0, `camp ${t} has health`);

const g = createGame(options());
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 } });
const hero = g.state.entities[m.heroId], war = g.frontier.war, fw = g.frontier.world, ST = g.frontier.structures;
const rival = Object.keys(g.state.clans).find(c => c !== 'player');
const third = Object.keys(g.state.clans).find(c => c !== 'player' && c !== rival);
const open = (x, z, r) => { for (let dx = -r; dx <= r; dx += 50) for (let dz = -r; dz <= r; dz += 50) if (terrainAt(world, x + dx, z + dz) !== 'p') return false; return true; };
const spots = [];
for (let z = 500; z < world.size.h - 500 && spots.length < 2; z += 50) for (let x = 500; x < world.size.w - 500 && spots.length < 2; x += 50) {
  if (Math.hypot(x - world.capital.x, z - world.capital.z) < 1600 || spots.some(s => Math.hypot(x - s[0], z - s[1]) < 2000)) continue;
  if (open(x, z, 500)) spots.push([x, z]);
}
assert.equal(spots.length, 2, 'test spots exist');
const addTown = (id, owner, [x, z]) => fw.addTown({ id, name: id, region: null, owner, x, z, site: null, traits: { soil: 1, water: 1, defense: 1, nodes: {} }, pop: 5, stock: { ...frontier.founding.startStock, ryo: 0 }, buildings: [{ type: 'town_hall', stage: 'built', cell: 0 }] });
const enemy = addTown('enemyTown', rival, spots[0]), mine = addTown('myTown', 'player', spots[1]);
g.step([]);
const put = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);
const G = enemy.grid, n = G.n, C = centreCell(n);
const WALL = C + 6, GATE = C + 6 + n, HOUSE = C - 6, STORE = C + 5 * n;
G.use = put(put(G.use, WALL, 'w'), GATE, 'g');
const house = () => { G.ground = put(G.ground, HOUSE, 'c'); G.zone = put(G.zone, HOUSE, 'h'); G.stage = put(G.stage, HOUSE, '2'); };
house();
G.use = put(G.use, STORE, 'B'); enemy.buildings.push({ type: 'storehouse', stage: 'built', cell: STORE });
const stockadeCells = [C - 5 * n, C - 5 * n + 1, C - 4 * n, C - 4 * n + 1];
for (const i of stockadeCells) G.use = put(G.use, i, 'B');
enemy.buildings.push({ id: 'stk', type: 'stockade', stage: 'built', cell: stockadeCells[0], cells: stockadeCells });
const hall = enemy.buildings.find(b => b.type === 'town_hall');
const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return g.state.frontier.receipts.findLast(r => r.action === c.action); };
const key = cell => `t|enemyTown|${cell}`;

// ---- no war: nothing is a target ------------------------------------------------------------
assert.equal(ST.list().length, 0, 'no war, no structures to attack');
{ const st = ST.find(key(hall.cell)); assert.ok(st && st.max === S.townHall[0], 'the hall has tier 1 health'); assert.equal(ST.damage('player', st, 100), false, 'no war: no damage'); assert.equal(hall.hp, undefined); }

// ---- a war: the attacker may damage the town, nobody else -------------------------------------
Object.assign(hero, { x: enemy.x + 300, z: enemy.z, place: 'world' });
{ const r = cmd({ action: 'devStartWar', town: 'enemyTown', side: 'attack' }); assert.ok(r?.ok, r?.reason); }
const rec = war.warOn('enemyTown');
const kinds = ST.list().reduce((o, s) => { o[s.kind] = (o[s.kind] || 0) + 1; return o; }, {});
assert.ok(kinds.building >= 4 && kinds.wall === 1 && kinds.gate === 1 && kinds.zone >= 1, 'town and camp structures listed: ' + JSON.stringify(kinds));
const sHall = ST.find(key(hall.cell)), sWall = ST.find(key(WALL)), sGate = ST.find(key(GATE)), sHouse = ST.find(key(HOUSE)), sStore = ST.find(key(STORE)), sStk = ST.find(key(stockadeCells[0]));
assert.ok(sHall && sWall && sGate && sHouse && sStore && sStk);
assert.equal(sWall.max, S.wall); assert.equal(sGate.max, S.gate); assert.equal(sHouse.max, S.zone[1]); assert.equal(sStore.max, S.town.storehouse); assert.equal(sStk.max, frontier.buildings.stockade.garrison.hp);
const campHall = rec.camp.buildings.find(b => b.type === 'camp_hall'), sCamp = ST.find(`c|${rec.id}|${campHall.id}`);
assert.ok(sCamp && sCamp.max === S.campHall[0], 'camp hall health');
assert.ok(ST.canDamage('player', sHall) && !ST.canDamage(rival, sHall) && !ST.canDamage(third, sHall), 'only the attacker damages the town');
assert.ok(ST.canDamage(rival, sCamp) && !ST.canDamage('player', sCamp) && !ST.canDamage(third, sCamp), 'only the defender damages the camp');
// health is stored only once damaged
assert.equal(sStore.b.hp, undefined); assert.equal(enemy.cellHp, undefined);
assert.ok(ST.damage('player', sStore, 100, 'ranged')); assert.equal(sStore.b.hp, S.town.storehouse - 100 * S.damage.ranged, 'ranged does little');
assert.ok(ST.damage('player', sStore, 100, 'siege')); assert.equal(sStore.b.hp, S.town.storehouse - 100 * S.damage.ranged - 100 * S.damage.siege, 'siege does a lot');
assert.equal(g.state.frontier.fires, undefined, 'ranged and siege hits light no fire');
assert.ok(ST.damage('player', sWall, 50, 'melee')); assert.equal(enemy.cellHp[WALL], S.wall - 50);
assert.equal(g.state.frontier.fires, undefined, 'a plain melee hit lights no fire (checkpoint 7-0: only a Torch order does)');
assert.ok(ST.ignite('player', sWall, 'x1')); assert.ok(g.state.frontier.fires[sWall.key], 'a torch hit sets it alight'); assert.equal(ST.ignite(third, sWall, 'x2'), false);
assert.equal(ST.damage(third, sWall, 50), false);

// ---- fire: burns while fed, dies after ---------------------------------------------------------
{ const hp0 = enemy.cellHp[WALL]; for (let i = 0; i < 200; i++) g.step([]);
  const burned = hp0 - enemy.cellHp[WALL];
  assert.ok(burned > 0 && burned <= S.fire.damage * Math.ceil(S.fire.lingerTicks / 20), `the fire burned ${burned} and died`);
  assert.equal(g.state.frontier.fires, undefined, 'the fire is out');
  const hp1 = enemy.cellHp[WALL]; for (let i = 0; i < 60; i++) g.step([]); assert.equal(enemy.cellHp[WALL], hp1); }

// ---- troops on a raze order walk over and hit it; one fire per structure -------------------------
const troops = [];
for (let k = 0; k < 6; k++) troops.push(war.spawnTroop(rec, 'grunt', sStore.x + 14 + (k % 3) * 1.5, sStore.z + 14 + Math.floor(k / 3) * 1.5));
const archer = war.spawnTroop(rec, 'archer', sStore.x + 16, sStore.z + 18);
g.step([{ id: hero.id, type: 'order', kind: 'raze', structure: sStore.key, units: [...troops, archer] }]);
assert.ok(troops.every(id => g.state.entities[id].order?.kind === 'raze'), 'the order is taken');
// a plain attack never lights it; the Torch order does, for melee units only, and the fire strength is capped
{ const hp0 = sStore.b.hp; let t = 0; for (; t < 600 && sStore.b.hp === hp0; t++) g.step([]);
  assert.ok(sStore.b.hp < hp0, 'plain hits land'); assert.equal(g.state.frontier.fires?.[sStore.key], undefined, 'and light no fire');
  assert.equal(ST.torchers([...troops, archer]), troops.length, 'the archer cannot torch');
  g.step([{ id: hero.id, type: 'order', kind: 'raze', torch: true, structure: sStore.key, units: [...troops, archer] }]);
  assert.ok(troops.every(id => g.state.entities[id].order?.torch), 'melee take the Torch order'); assert.ok(!g.state.entities[archer].order?.torch, 'the archer keeps its plain attack');
  let most = 0; for (let i = 0; i < 200 && sStore.b.stage === 'built' && most < 2; i++) { g.step([]); most = Math.max(most, Object.keys(g.state.frontier.fires?.[sStore.key]?.fed || {}).length); }
  assert.ok(most >= 2, `several units feed one fire (${most})`); assert.ok(S.fire.maxFeeders >= 1); }
{ const hp0 = sStore.b.hp; let hits = 0, fireSeen = false, t = 0;
  for (; t < 1200 && sStore.b.stage === 'built'; t++) { g.step([]); hits += g.state.structureHits?.length || 0; fireSeen ||= !!g.state.frontier.fires?.[sStore.key]; assert.ok(Object.keys(g.state.frontier.fires || {}).length <= 1); }
  assert.ok(hits > 3 && fireSeen, `troops hit it (${hits} hits) and it burned`);
  assert.equal(sStore.b.stage, 'ruined', `the storehouse fell after ${t} ticks from ${hp0}`);
  assert.equal(sStore.b.hp, undefined);
  const [x, z] = cellToWorld(enemy, STORE);
  assert.equal(townBlockersIn(g.state.frontier, x - 1, z - 1, x + 1, z + 1, frontier).length, 0, 'a ruin does not block');
  assert.equal(ST.find(sStore.key), null, 'a ruin is no longer a target');
  for (let i = 0; i < 5; i++) g.step([]);
  assert.ok(troops.every(id => g.state.entities[id].order?.kind !== 'raze'), 'the order ends when it falls');
  assert.match(g.state.clans.player.notice?.text || '', /Storehouse destroyed/); }

// ---- breaches: a wall or gate cell becomes open ground -------------------------------------------
{ const [x, z] = cellToWorld(enemy, WALL);
  assert.ok(townBlockersIn(g.state.frontier, x - 5, z - 5, x + 5, z + 5, frontier).length > 0, 'the wall blocks');
  assert.ok(ST.damage('player', ST.find(key(WALL)), S.wall * 2, 'siege'));
  assert.equal(G.use[WALL], '.'); assert.deepEqual(enemy.breaches, [{ cell: WALL, was: 'w' }]); assert.equal(enemy.cellHp, undefined);
  g.step([]);
  assert.equal(townBlockersIn(g.state.frontier, x - 2, z - 2, x + 2, z + 2, frontier).length, 0, 'the gap is open');
  assert.ok(ST.damage('player', ST.find(key(GATE)), S.gate * 2, 'siege')); assert.equal(G.use[GATE], '.'); assert.equal(enemy.breaches.length, 2);
  // no repairs during the war; after it the breach can be built over
  const pl = g.frontier.modules.find(m => m.name === 'placement').placement;
  fw.change('enemyTown', 'timber', 500, 'test'); fw.change('enemyTown', 'stone', 500, 'test');
  const r = pl.check(enemy, { kind: 'wall', cells: [WALL] }); assert.ok(!r.ok && /breached/.test(r.reason), r.reason); }

// ---- a house drops to an empty plot ---------------------------------------------------------------
{ house(); const st = ST.find(key(HOUSE)); assert.ok(st);
  assert.ok(ST.damage('player', st, st.max + 1, 'siege')); assert.equal(G.stage[HOUSE], '0'); assert.equal(G.zone[HOUSE], 'h', 'still zoned: it regrows by the zone rules'); assert.equal(ST.find(key(HOUSE)), null); }

// ---- attack-move with nobody to fight goes for a structure ----------------------------------------
{ const st = ST.find(key(hall.cell));
  for (const id of troops) Object.assign(g.state.entities[id], { x: st.x + 16 + Math.random() * 0, z: st.z + 16 });
  g.step([{ id: hero.id, type: 'order', kind: 'attackmove', units: troops, x: st.x + 15, z: st.z + 15, place: 'world' }]);
  for (let i = 0; i < 40; i++) g.step([]);
  assert.ok(troops.some(id => g.state.entities[id].order?.kind === 'raze'), 'attack-move picked a structure'); }

// ---- a right-click on the ground: the structure under the point, else the plain move ----------------
{ const st = ST.find(key(hall.cell)), u = g.state.entities[troops[0]];
  g.step([{ id: hero.id, type: 'order', kind: 'raze', x: st.x + 200, z: st.z + 200, units: [troops[0]], fallback: 'move', place: 'world' }]);
  assert.equal(u.order?.kind, 'move', 'open ground: a plain move'); assert.ok(Math.abs(u.order.x - (st.x + 200)) < 2);
  g.step([{ id: hero.id, type: 'order', kind: 'raze', x: st.x, z: st.z, units: [troops[0]], fallback: 'move', place: 'world' }]);
  assert.equal(u.order?.kind, 'raze', 'on the hall: attack it'); assert.equal(u.order.structure, st.key);
  ST.damage('player', st, 10, 'ranged');
  const view = ST.viewFor('player'); assert.ok(view.every(v => v.hp < v.max || v.fire) && view.some(v => v.key === st.key), 'the screen gets the damaged ones');
  assert.equal(ST.viewFor(third).length, 0, 'a clan outside the war gets none'); }

// ---- the hero can be sent too; WASD takes him back -------------------------------------------------
{ const st = ST.find(key(hall.cell)); Object.assign(hero, { x: st.x + 14, z: st.z - 14 });
  g.step([{ id: hero.id, type: 'order', kind: 'raze', structure: st.key, units: [], hero: true }]);
  assert.equal(hero.order?.kind, 'raze');
  const hp0 = ST.hpOf(st); for (let i = 0; i < 200; i++) g.step([]);
  assert.ok(ST.hpOf(st) < hp0, 'the hero and troops damage the hall');
  g.step([{ id: hero.id, type: 'move', right: 1, down: 0 }]); assert.equal(hero.order, undefined, 'WASD ends the hero order'); }

// ---- stockade: only the attacker's hits reach it ---------------------------------------------------
{ const stk = enemy.buildings.find(b => b.type === 'stockade');
  const gar = g.frontier.garrison, max = frontier.buildings.stockade.garrison.hp;
  const inside = { garrison: { town: 'enemyTown', building: 'stk' } };
  assert.ok(gar.shelter(inside, 100, { owner: third }) && stk.hp === undefined, 'a clan not at war does not chip the stockade');
  assert.ok(gar.shelter(inside, 100, { owner: 'player' }) && stk.hp === max - 100, 'the attacker does');
  assert.ok(gar.shelter(inside, 100, { owner: 'wild' }) && stk.hp === max - 200, 'bandits as before');
  assert.ok(ST.damage('player', ST.find(key(stockadeCells[0])), max, 'siege')); assert.equal(stk.stage, 'ruined'); }

// ---- the camp: the defender ruins a building, its queue is lost -------------------------------------
{ const wk = rec.camp; const b = { id: 'bx', type: 'barracks', stage: 'built', x: campHall.x + 30, z: campHall.z, queue: [{ unit: 'grunt', left: 99999 }] }; wk.buildings.push(b);
  const st = ST.find(`c|${rec.id}|bx`); assert.ok(st && st.max === S.camp.barracks);
  const chest = wk.chest;
  assert.equal(ST.damage('player', st, 10), false, 'not your own camp');
  assert.ok(ST.damage(rival, st, st.max, 'melee')); assert.equal(b.stage, 'ruined'); assert.equal(b.queue, undefined, 'the queue is lost'); assert.equal(wk.chest, chest, 'no refund'); }

// ---- town hall shelter: workers run in while attackers are inside the ring, and go back to work after -----
{ const wk = g.frontier.modules.find(m => m.name === 'workers').workers, SH = S.shelter;
  for (const id of [...troops, archer]) delete g.state.entities[id];
  Object.assign(hero, { x: enemy.x + 600, z: enemy.z });
  enemy.workers.length = 0;
  for (let k = 0; k < 3; k++) enemy.workers.push({ id: `sw${k}`, spot: null, dropoff: null, phase: 0, carrying: 0, entity: null, elapsed: 0, trip: null, departure: [enemy.x + 40 + k * 3, enemy.z + 30] });
  for (let i = 0; i < SH.calmTicks + 45; i++) g.step([]);   // the earlier attacks are over
  assert.ok(!enemy.shelter && enemy.workers.every(w => !w.shelter), 'no attacker inside the ring: nobody shelters');
  const raider = g.state.entities[war.spawnTroop(rec, 'grunt', enemy.x + 60, enemy.z - 60)];
  raider.holdFire = true;
  for (let i = 0; i < 45; i++) g.step([]);
  assert.ok(enemy.shelter && enemy.workers.every(w => w.shelter), 'attackers inside the ring: the workers head for the hall');
  const kept = enemy.workers.map(w => w.shelter.spot); assert.ok(enemy.workers.every(w => w.spot === null), 'no gathering while sheltering');
  for (let i = 0; i < 900 && !enemy.workers.every(w => w.shelter?.in); i++) { g.step([]); Object.assign(raider, { x: enemy.x + 60, z: enemy.z - 60 }); }
  assert.ok(enemy.workers.every(w => w.shelter.in), 'they reach the hall and go in');
  for (const w of enemy.workers) { const u = g.state.entities[w.entity]; if (u) assert.ok(u.garrison?.hall, 'inside: cannot be attacked'); }
  assert.equal(g.frontier.garrison.members(enemy).length, 0, 'not counted as a stockade garrison');
  // the enemy leaves: they come out after calmTicks and go back to their jobs
  delete g.state.entities[raider.id];
  for (let i = 0; i < SH.calmTicks - 40; i++) g.step([]);
  assert.ok(enemy.shelter, 'still inside before the calm time is up');
  for (let i = 0; i < 80; i++) g.step([]);
  assert.ok(!enemy.shelter && enemy.workers.every(w => !w.shelter && !w.order), 'they come out');
  assert.deepEqual(enemy.workers.map(w => w.spot), kept, 'back to their jobs');
  assert.ok(Object.values(g.state.entities).every(u => !u.garrison?.hall));
  // sheltering again, then the hall falls: everyone is out at once
  const r2 = g.state.entities[war.spawnTroop(rec, 'grunt', enemy.x + 60, enemy.z - 60)]; r2.holdFire = true;
  for (let i = 0; i < 45; i++) g.step([]);
  assert.ok(enemy.workers.every(w => w.shelter));
  const hs = ST.find(key(hall.cell)); assert.ok(ST.damage('player', hs, 99999, 'siege')); assert.equal(hall.stage, 'ruined');
  assert.ok(!enemy.shelter && enemy.workers.every(w => !w.shelter), 'the hall fell: pushed out');
  for (let i = 0; i < 45; i++) g.step([]);
  assert.ok(!enemy.shelter, 'no hall, no shelter');
  enemy.autoBuild = true; for (let i = 0; i < 400; i++) g.step([]);
  assert.equal(hall.stage, 'ruined', 'the governor does not rebuild a ruin while the war is on'); assert.ok(!enemy.projects.some(p => p.replaces === hall.id));
  delete g.state.entities[r2.id]; hall.stage = 'built'; }

// ---- watchtower fire: arrows at the nearest enemy of the war in range; a ruined tower is silent ---------
{ const T = S.tower, tw = { id: 'tw', type: 'watchtower', stage: 'built', x: campHall.x - 40, z: campHall.z + 40 }; rec.camp.buildings.push(tw);
  const spawn = (owner, dx) => { const id = g.spawn('swordsman', 'swordsman', tw.x + dx, tw.z, { owner, place: 'world', area: 'world', order: { kind: 'stop' } }); return g.state.entities[typeof id === 'object' ? id.id : id]; };
  const foe = spawn(rival, T.range - 4), far = spawn(rival, T.range + 6), other = spawn(third, 6), own = spawn('player', 5);
  const hp = [foe, far, other, own].map(e => e.hp);
  let arrows = 0;
  for (let i = 0; i < T.everyTicks * 4 + 20; i++) { g.step([]); arrows += (g.state.casts || []).filter(c => c.tower).length; Object.assign(foe, { x: tw.x + T.range - 4, z: tw.z }); Object.assign(far, { x: tw.x + T.range + 6, z: tw.z }); Object.assign(other, { x: tw.x + 6, z: tw.z }); }
  assert.ok(arrows >= 3 && arrows <= 5, `one arrow every ${T.everyTicks} ticks (${arrows})`);
  assert.ok(foe.hp <= hp[0] - T.damage * 2, 'the enemy in range is hit'); assert.equal(far.hp, hp[1], 'out of range: untouched'); assert.equal(other.hp, hp[2], 'a clan outside the war: untouched'); assert.equal(own.hp, hp[3]);
  assert.ok(ST.damage(rival, ST.find(`c|${rec.id}|tw`), 99999, 'siege')); assert.equal(tw.stage, 'ruined');
  for (let i = 0; i < 20; i++) g.step([]);
  const hp1 = foe.hp; for (let i = 0; i < T.everyTicks * 3; i++) { g.step([]); Object.assign(foe, { x: tw.x + T.range - 4, z: tw.z }); }
  assert.equal(foe.hp, hp1, 'a ruined watchtower stops shooting');
  for (const e of [foe, far, other, own]) delete g.state.entities[e.id]; }

// ---- save and load -------------------------------------------------------------------------------
{ ST.damage('player', ST.find(key(hall.cell)), 10, 'melee');
  const save = JSON.parse(JSON.stringify(makeSave(g)));
  const g2 = createGame(options()); loadSave(g2, save);
  assert.deepEqual(g2.state.frontier.settlements.enemyTown.breaches, enemy.breaches);
  assert.equal(g2.state.frontier.settlements.enemyTown.buildings.find(b => b.type === 'town_hall').hp, hall.hp);
  assert.deepEqual(g2.state.frontier.fires, g.state.frontier.fires);
  for (let i = 0; i < 100; i++) { g.step([]); g2.step([]); }
  assert.equal(g2.state.frontier.settlements.enemyTown.buildings.find(b => b.type === 'town_hall').hp, hall.hp, 'same after 100 ticks'); }
fw.checkInvariants();
console.log('test_structures: ok');
