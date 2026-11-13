// Tim 2026-11-13: troops shot from a garrisoned house fight back at the house; a rival inside cannot be clicked.
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
const archers = [0, 1].map(k => troop('archer', st.x + 4 + k, st.z + 4));
{ const r = cmd({ action: 'garrison', mode: 'enter', structure: st.key, units: archers.map(u => u.id) }); assert.ok(r?.ok, r?.reason); }
assert.equal(GA.inZone(st.key).length, 2, 'both archers inside');
const foes = [0, 1, 2].map(k => troop('grunt', st.x + 6 + k, st.z + 5, rival));
for (const u of foes) { assert.equal(u.owner, rival); u.order = { kind: 'move', x: u.x, z: u.z, arrived: true }; }
const hp0 = ST.hpOf(st);
let razing = 0, shots = 0; const hp1 = foes.map(u => u.hp);
for (let i = 0; i < 400; i++) { g.step([]); razing = foes.filter(u => u.order?.kind === 'raze' && u.order.structure === st.key).length;shots += (g.state.frontier.garrisonShots || []).length; if (razing === foes.length && ST.hpOf(st) < hp0) break; }
assert.equal(razing, foes.length, `the shot grunts go for the house (${foes.map(u => u.order?.kind)})`);
assert.ok(ST.hpOf(st) < hp0, `the house takes their hits (${hp0} -> ${ST.hpOf(st)})`);
// a busy unit is left alone: one on a plain move keeps it
const runner = troop('grunt', st.x + 8, st.z - 8, rival); runner.order = { kind: 'move', x: st.x + 300, z: st.z, arrived: false };
for (let i = 0; i < 60; i++) g.step([]);
assert.notEqual(runner.order?.kind, 'raze', 'a unit on a move keeps its move');
console.log('test_garrison_answer: ok');
