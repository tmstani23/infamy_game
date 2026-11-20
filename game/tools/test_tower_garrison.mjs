// Z4e (Tim 2026-11-19): watchtowers can be garrisoned: their own room (zoneGarrison.byType.watchtower.capacity) and
// ranged troops inside reach further (reach).   node game/tools/test_tower_garrison.mjs
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
const G = mine.grid, n = G.n, C = centreCell(n), TOWER = C + 8 * n + 8;
G.use = put(G.use, TOWER, 'B'); mine.buildings.push({ id: 'myTown:tower', type: 'watchtower', cell: TOWER, stage: 'built', workers: 0 });
Object.assign(hero, { x: mine.x + 300, z: mine.z, place: 'world' });
{ const r = cmd({ action: 'devStartWar', town: 'myTown', side: 'defend', attacker: rival }); assert.ok(r?.ok, r?.reason); }
const rec = war.warOn('myTown'), GA = g.frontier.garrison, T = frontier.war.structures.zoneGarrison.byType.watchtower;
const st = ST.list().find(s => s.town === 'myTown' && s.type === 'watchtower'); assert.ok(st && st.kind === 'building', 'the watchtower is a structure');
const ids = () => new Set(Object.keys(g.state.entities));
const troop = (unit, x, z, owner = 'player') => { const b = ids(); war.spawnTroop(rec, unit, x, z, owner); return g.state.entities[Object.keys(g.state.entities).find(id => !b.has(id))]; };
const archers = Array.from({ length: T.capacity + 2 }, (_, k) => troop('archer', st.x + 4 + k * 0.5, st.z + 4));
const r = cmd({ action: 'garrison', mode: 'enter', structure: st.key, units: archers.map(u => u.id) });
assert.ok(r?.ok, r?.reason);
for (let i = 0; i < 200 && GA.inZone(st.key).length < T.capacity; i++) g.step([]);
assert.equal(GA.inZone(st.key).length, T.capacity, 'the tower holds its own number, not a house full');
const inside = GA.inZone(st.key); assert.ok(inside.every(u => u.garrison.reach === T.reach), 'they reach further from up there');
for (const u of archers) if (!u.garrison) { u.dead = true; }
// a foe just past an archer's reach from a house, inside it from the tower
const unit = g.unitOf ? g.unitOf(inside[0]) : null, base = (data('data/units.json').archer?.attackRange ?? unit?.attackRange ?? 6) + 3;
const foe = troop('grunt', st.x + base + T.reach - 1, st.z, rival); foe.hp = foe.maxHp = 50000; foe.order = { kind: 'stop' }; foe.holdFire = true;
let shots = 0; for (let i = 0; i < 160; i++) { foe.x = st.x + base + T.reach - 1; foe.z = st.z; g.step([]); for (const p of g.state.projectiles || []) if (p.garrison && p.t === foe.id) shots++; }
assert.ok(shots > 0, 'archers in the tower hit a foe past their ground reach');
cmd({ action: 'garrison', mode: 'leave', structure: st.key });
assert.equal(GA.inZone(st.key).length, 0, 'and come out again');
console.log('test_tower_garrison: ok');
