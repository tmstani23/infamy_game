// War 7c-3b (2026-11-12): garrisons in houses, workshops and farmhouses: the owner's troops go in (up to capacity),
// ranged ones shoot out, melee ones do not, and when the house falls everyone piles out.
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
const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return g.state.frontier.receipts.findLast(r => r.action === c.action); };
const put = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);
const G = mine.grid, n = G.n, C = centreCell(n), HOUSE = C - 6;
G.ground = put(G.ground, HOUSE, 'c'); G.zone = put(G.zone, HOUSE, 'h'); G.stage = put(G.stage, HOUSE, '2');
for (let k = 1; k <= 5; k++) G.use = put(G.use, HOUSE + k, 'r');
Object.assign(hero, { x: mine.x + 300, z: mine.z, place: 'world' });
{ const r = cmd({ action: 'devStartWar', town: 'myTown', side: 'defend', attacker: rival }); assert.ok(r?.ok, r?.reason); }
const rec = war.warOn('myTown'), GA = g.frontier.garrison;
const st = ST.list().find(s => s.town === 'myTown' && s.cell === HOUSE); assert.ok(st && st.kind === 'zone' && st.type === 'housing', 'the house is a structure');
assert.ok(GA.zoneOk(st), 'a house can be garrisoned');
const ids = () => new Set(Object.keys(g.state.entities));
const troop = (unit, x, z, owner = 'player') => { const b = ids(); war.spawnTroop(rec, unit, x, z, owner); return g.state.entities[Object.keys(g.state.entities).find(id => !b.has(id))]; };
// for the defender the war's spawnTroop owner is the defender
const archers = [0, 1, 2].map(k => troop('archer', st.x + 4 + k, st.z + 4)), grunt = troop('grunt', st.x + 5, st.z + 6);
for (const u of [...archers, grunt]) assert.equal(u.owner, 'player');
let r = cmd({ action: 'garrison', mode: 'enter', structure: st.key, units: [...archers, grunt].map(u => u.id) });
assert.ok(r?.ok, r?.reason);
assert.ok([...archers, grunt].every(u => u.garrison?.zone && u.garrison.key === st.key), 'all four are inside');
assert.equal(GA.inZone(st.key).length, 4);
assert.ok(Math.hypot(grunt.x - st.x, grunt.z - st.z) < 0.01, 'they stand at the house');
// capacity: ten at most
const more = Array.from({ length: 8 }, (_, k) => troop('grunt', st.x + 3, st.z + 3 + k * 0.6));
r = cmd({ action: 'garrison', mode: 'enter', structure: st.key, units: more.map(u => u.id) });
assert.equal(GA.inZone(st.key).length, frontier.war.structures.zoneGarrison.capacity, 'full at capacity');
cmd({ action: 'garrison', mode: 'leave', structure: st.key, units: more.filter(u => u.garrison).map(u => u.id) });
assert.equal(GA.inZone(st.key).length, 4, 'leave lets the named ones out');
for (const u of more) u.dead = true;
// 2026-11-19: the hero may garrison a house too, and steps out again
{ const was = { x: hero.x, z: hero.z }; Object.assign(hero, { x: st.x + 4, z: st.z + 5 });
  const rh = cmd({ action: 'garrison', mode: 'enter', structure: st.key, units: [hero.id] });
  assert.ok(rh?.ok && hero.garrison?.zone && hero.garrison.key === st.key, `the hero goes in (${rh?.reason})`);
  cmd({ action: 'garrison', mode: 'leave', structure: st.key, units: [hero.id] });
  assert.ok(!hero.garrison && GA.inZone(st.key).length === 4, 'and comes out, the troops stay');
  Object.assign(hero, was); }
// an enemy comes close: the archers shoot out, the grunt does not
const foe = troop('grunt', st.x + 9, st.z + 2, rival); foe.hp = foe.maxHp = 5000; foe.order = { kind: 'stop' };
const shooters = new Set(); for (let i = 0; i < 120; i++) { g.step([]); for (const p of g.state.projectiles || []) if (p.garrison) shooters.add(p.a); }
assert.ok(foe.hp < 5000, `the archers inside hit it (${foe.hp})`);
assert.ok(archers.some(a => shooters.has(a.id)) && !shooters.has(grunt.id), 'ranged shoot out, melee do not');
// a hit on someone inside goes to the house
const hp0 = ST.hpOf(st); g.frontier.garrison.shelter(grunt, 50, foe); assert.ok(ST.hpOf(st) < hp0 && grunt.hp === grunt.maxHp, 'the house takes the hit');
// the house falls: everyone piles out round it
ST.damage(rival, st, 1e9, 'siege'); g.step([]);
assert.ok([...archers, grunt].every(u => !u.garrison), 'out when it falls');
assert.ok([...archers, grunt].every(u => Math.hypot(u.x - st.x, u.z - st.z) > 3), 'standing round it');
// not someone else's town
const rr = cmd({ action: 'garrison', mode: 'enter', structure: ST.list().find(s => s.town === 'enemyTown')?.key || 'x', units: [archers[0].id] });
assert.ok(!rr?.ok, 'not in a rival town');
// a bot town at war: its stand-in defender trains an archer every third troop, and the archer walks into a house
{
  const EG = enemy.grid, EH = centreCell(EG.n) - 6;
  EG.ground = put(EG.ground, EH, 'c'); EG.zone = put(EG.zone, EH, 'h'); EG.stage = put(EG.stage, EH, '2');
  for (let k = 1; k <= 5; k++) EG.use = put(EG.use, EH + k, 'r');
  enemy.stock.ryo = 2000; g.state.clans[rival].bot = true;
  const r2 = cmd({ action: 'devStartWar', town: 'enemyTown' }); assert.ok(r2?.ok, r2?.reason);
  const ew = war.warOn('enemyTown'), S = war.data.standIn, keep = S.trainTicks; S.trainTicks = 20;
  const est = ST.list().find(s => s.town === 'enemyTown' && s.cell === EH); assert.ok(est, 'the rival house is a structure');
  let inside = [];
  for (let i = 0; i < 1200 && !inside.length; i++) { g.step([]); inside = GA.inZone(est.key); }
  S.trainTicks = keep;
  const stand = Object.values(g.state.entities).filter(e => e.warTroop === ew.id && e.owner === rival);
  assert.ok(stand.some(e => e.type === S.ranged.type) && stand.some(e => e.type !== S.ranged.type), `stand-in trains both (${stand.map(e => e.type)})`);
  assert.ok(inside.length && inside.every(e => e.type === S.ranged.type), 'the stand-in archer holds the house');
}
console.log('test_zone_garrison: ok');
