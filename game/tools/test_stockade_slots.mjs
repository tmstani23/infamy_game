// 2026-11-25: a stockade holds garrison.capacity but only garrison.firingSlots of the ranged troops inside shoot;
// the hero on his horse can go in (he gets off).   node game/tools/test_stockade_slots.mjs
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
const FORT = [TOWER, TOWER + 1, TOWER + n, TOWER + n + 1]; for (const c of FORT) G.use = put(G.use, c, 'B');
mine.buildings.push({ id: 'myTown:fort', type: 'stockade', cell: TOWER, cells: FORT, stage: 'built', workers: 0 });
Object.assign(hero, { x: mine.x + 300, z: mine.z, place: 'world' });
{ const r = cmd({ action: 'devStartWar', town: 'myTown', side: 'defend', attacker: rival }); assert.ok(r?.ok, r?.reason); }
const rec = war.warOn('myTown'), GA = g.frontier.garrison, R = frontier.buildings.stockade.garrison;
const st = ST.list().find(s => s.town === 'myTown' && s.type === 'stockade'); assert.ok(st && st.kind === 'building', 'the stockade is a structure');
const ids = () => new Set(Object.keys(g.state.entities));
const troop = (unit, x, z, owner = 'player') => { const b = ids(); war.spawnTroop(rec, unit, x, z, owner); return g.state.entities[Object.keys(g.state.entities).find(id => !b.has(id))]; };
assert.ok(R.firingSlots > 0 && R.firingSlots < R.capacity, 'firing slots set below the room');
const archers = Array.from({ length: R.firingSlots + 6 }, (_, k) => troop('archer', st.x + 4 + (k % 6) * 0.6, st.z + 4 + Math.floor(k / 6) * 0.6));
{ const r = cmd({ action: 'garrison', mode: 'enter', town: 'myTown', building: 'myTown:fort', units: archers.map(u => u.id) }); assert.ok(r?.ok, r?.reason); }
for (let i = 0; i < 300 && archers.some(u => !u.garrison); i++) g.step([]);
assert.ok(archers.every(u => u.garrison), 'all of them are inside');
const foe = troop('grunt', st.x + 8, st.z, rival); foe.hp = foe.maxHp = 500000; foe.order = { kind: 'stop' }; foe.holdFire = true;
const shooters = new Set(); for (let i = 0; i < 200; i++) { foe.x = st.x + 8; foe.z = st.z; foe.hp = 500000; g.step([]); for (const p of g.state.projectiles || []) if (p.garrison && p.t === foe.id) shooters.add(p.a); }
assert.equal(shooters.size, R.firingSlots, `only ${R.firingSlots} shoot (saw ${shooters.size})`);
cmd({ action: 'garrison', mode: 'leave', town: 'myTown', building: 'myTown:fort' });
// the hero on horseback goes in too, off his horse (2026-11-25)
foe.dead = true;
const horse = Object.values(g.state.entities).find(e => e.type === 'horse') || (() => { const id = 'testHorse'; g.state.entities[id] = { id, type: 'horse', model: 'horse', x: hero.x, z: hero.z, place: 'world', hp: 100, maxHp: 100 }; return g.state.entities[id]; })();
Object.assign(hero, { x: st.x + 60, z: st.z, mounted: true, ride: { kind: 'horse', horse: horse.id } }); horse.rider = hero.id;
{ const r = cmd({ action: 'garrison', mode: 'enter', town: 'myTown', building: 'myTown:fort', walk: true, units: [hero.id] }); assert.ok(r?.ok, r?.reason); }
for (let i = 0; i < 600 && !hero.garrison; i++) g.step([]);
assert.ok(hero.garrison, 'the mounted hero rode over and went in');
assert.ok(!hero.mounted && !hero.ride, 'he got off his horse');
console.log('test_stockade_slots: ok');
