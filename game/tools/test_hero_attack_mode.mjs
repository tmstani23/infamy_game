// Hero attack mode on the frontier.
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

// Frontier attack mode for the hero (2026-11-15): right-click an enemy, he chases it, then goes for the nearest war
// enemy in range and then an enemy structure; WASD only breaks the chase; Esc/Z (command attackmode off) or cancel ends it.
Object.assign(hero, { x: enemy.x + 300, z: enemy.z, place: 'world' });
{ const r = cmd({ action: 'devStartWar', town: 'enemyTown', side: 'attack' }); assert.ok(r?.ok, r?.reason); }
const E = g.state.entities;
const foe = (dx, dz, hp = 40) => E[g.spawn('swordsman', 'swordsman', hero.x + dx, hero.z + dz, { owner: rival, place: 'world', area: 'world', warTroop: war.warOn('enemyTown').id, order: { kind: 'stop' }, holdFire: true, hp, maxHp: hp })];
hero.hp = hero.maxHp = 5000;
const a = foe(10, 0), b = foe(12, 3);
const run = (n, cmds = []) => { g.step(cmds); for (let i = 1; i < n; i++) g.step([]); };
// no attack mode yet: he stands
run(40); assert.ok(!hero.attackMode && Math.hypot(hero.x - (enemy.x + 300), hero.z - enemy.z) < 1, 'no order, no chase');
g.step([{ id: hero.id, type: 'attack', target: a.id }]);
assert.equal(hero.attackMode, true, 'a right-click attack on the frontier starts attack mode');
const d0 = Math.hypot(a.x - hero.x, a.z - hero.z);
run(20); assert.ok(Math.hypot(a.x - hero.x, a.z - hero.z) < d0 - 1 || a.downed || a.dead, 'he chases the target');
for (let i = 0; i < 600 && !(a.dead || a.downed); i++) g.step([]);
assert.ok(a.dead || a.downed, 'the first target falls');
for (let i = 0; i < 600 && !(b.dead || b.downed); i++) g.step([]);
assert.ok(b.dead || b.downed, 'he goes on to the next war enemy in range by himself');
assert.equal(hero.attackMode, true, 'still in attack mode');
// a left-click elsewhere (stopattack) leaves it on; WASD breaks the chase but not the mode
const c = foe(5, 0, 4000);
for (let i = 0; i < 100 && hero.attackTarget !== c.id; i++) g.step([]);
assert.equal(hero.attackTarget, c.id, 'picked the third');
g.step([{ id: hero.id, type: 'stopattack', units: [] }]);
assert.ok(hero.attackMode && hero.attackTarget === c.id, 'left-click keeps attack mode and its target');
const before = Math.hypot(c.x - hero.x, c.z - hero.z);
for (let i = 0; i < 16; i++) g.step([{ id: hero.id, type: 'move', right: -1, down: 0 }]);
assert.ok(Math.hypot(c.x - hero.x, c.z - hero.z) > before + 1.5, 'WASD walks him away: ' + before + ' -> ' + Math.hypot(c.x - hero.x, c.z - hero.z));
assert.equal(hero.attackMode, true, 'WASD keeps attack mode');
run(120, [{ id: hero.id, type: 'move', right: 0, down: 0 }]); assert.ok(Math.hypot(c.x - hero.x, c.z - hero.z) < 4, 'let go: he closes in again');
// save parity
{ const g2 = createGame(options()); loadSave(g2, JSON.parse(JSON.stringify(makeSave(g)))); assert.equal(g2.state.entities[hero.id].attackMode, true, 'attack mode is saved'); }
// Esc / Z
g.step([{ id: hero.id, type: 'attackmode', on: false }]);
assert.ok(!hero.attackMode && !hero.attackTarget, 'Esc or Z ends it');
const hx = hero.x, hz = hero.z; c.x += 8; run(60);
assert.ok(Math.hypot(hero.x - hx, hero.z - hz) < 0.5, 'no chase once it is off');
// a building that falls ends it there, as for crew (2026-11-15): no going on to the next one by himself
for (const u of [a, b, c]) { u.dead = true; }
{ const st = ST.find(`t|enemyTown|${HOUSE}`); assert.ok(st, 'the house is a target');
  Object.assign(hero, { x: st.x + 3, z: st.z + 3 });
  g.step([{ id: hero.id, type: 'order', kind: 'raze', structure: st.key, units: [], hero: true }]);
  assert.ok(hero.attackMode && hero.order?.kind === 'raze', 'right-click on a building: attack mode');
  ST.damage('player', st, ST.hpOf(st) - 1, 'melee');
  for (let i = 0; i < 400 && ST.hpOf(ST.find(st.key) || st) > 0 && hero.order?.kind === 'raze'; i++) g.step([]);
  run(100);
  assert.ok(hero.order?.kind !== 'raze', 'after it falls he does not go for another building: ' + JSON.stringify(hero.order)); }
// X with the hero selected: he attack-moves and goes building to building
{ const hx = hero.x, hz = hero.z;
  g.step([{ id: hero.id, type: 'order', kind: 'attackmove', x: enemy.x, z: enemy.z, units: [hero.id], place: 'world' }]);
  assert.ok(hero.attackMode && ['attackmove', 'raze'].includes(hero.order?.kind), 'attack-move takes the hero');
  let razed = false; for (let i = 0; i < 400 && !razed; i++) { g.step([]); razed = hero.order?.kind === 'raze' && hero.order.from === 'attackmove'; }
  assert.ok(razed, 'on an attack-move he goes for the next building');
  g.step([{ id: hero.id, type: 'attackmode', on: false }]);
  assert.ok(!hero.attackMode && !hero.order, 'Esc ends the attack-move too'); }
// the city: never
Object.assign(hero, { place: 'street' }); const cop = foe(2, 0); cop.place = 'street';
g.step([{ id: hero.id, type: 'attack', target: cop.id }]);
assert.ok(!hero.attackMode, 'no attack mode in the city');
console.log('hero attack mode ok');
