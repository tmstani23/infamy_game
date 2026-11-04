// Loop 3, card L3.1: the town grid. Cells round-trip, a town founded over water marks those cells
// unbuildable, an old (spiral slot) town migrates to the grid with every building within half a cell of
// its old spot, the grid survives save/load, and queue never picks an unbuildable or used cell.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';
import { terrainAt } from '../src/sim/world_data.js';
import { townSlot } from '../src/sim/frontier/town_layout.js';
import { gridSize, cellToWorld, worldToCell, inCore, makeGrid, centreCell } from '../src/sim/frontier/town_grid.js';
import { drawableTowns, townProps } from '../src/town_props.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier });
function game() {
  const g = createGame(options());
  setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 1000 } });
  return g;
}
const T = frontier.townGrid, n = gridSize(frontier);
assert.equal(n, 2 * Math.ceil(T.radius / T.cellSize) + 1);

// 1. round trip
{
  const s = { x: 3000, z: 2000, grid: { n, cell: T.cellSize } };
  for (const i of [0, 1, n - 1, n * n - 1, centreCell(n), 5 * n + 17]) assert.equal(worldToCell(s, ...cellToWorld(s, i)), i, `cell ${i}`);
  assert.deepEqual(cellToWorld(s, centreCell(n)), [3000, 2000], 'the hall stands on the town spot');
  assert.equal(worldToCell(s, 3000 + 99999, 2000), -1);
  assert.ok(inCore(s, centreCell(n), frontier) && !inCore(s, 0, frontier), 'core is round the hall only');
  assert.ok(inCore({ ...s, tier: 3 }, centreCell(n) + 30, frontier) >= inCore(s, centreCell(n) + 30, frontier), 'core grows with tier');
}

// 2. a spot with water in range: those cells are unbuildable; the hall's cell is a building
{
  let spot = null;
  const wc = world.terrain.cell;
  outer: for (let z = 400; z < 6000; z += 250) for (let x = 400; x < 12000; x += 250) {
    if (terrainAt(world, x, z) === 'w') continue;
    if (terrainAt(world, x + 120, z) === 'w' && terrainAt(world, x, z) !== 'r' && wc) { spot = [x, z]; break outer; }
  }
  assert.ok(spot, 'found a shore spot');
  const gr = makeGrid({ x: spot[0], z: spot[1] }, world, frontier);
  assert.equal(gr.ground.length, n * n);
  const wet = worldToCell({ x: spot[0], z: spot[1], grid: gr }, spot[0] + 120, spot[1]);
  assert.equal(gr.ground[wet], 'x', 'water cell is x');
  assert.equal(gr.use[centreCell(n)], 'B');
  assert.equal(gr.ground[centreCell(n)], 'c');
}

// 3. migration: an old town with spiral slots
{
  const g = game(), w = g.frontier.world;
  w.addTown({ id: 'old', name: 'Old', region: null, owner: 'player', x: 3000, z: 3000, site: null, traits: { soil: 2, water: 2, defense: 2, nodes: {} },
    pop: 6, stock: { food: 80, timber: 200, stone: 30 }, buildings: [{ type: 'town_hall', cell: 0 }, { type: 'farm', cell: 1 }, { type: 'house', cell: 9 }, { type: 'lumber_camp', cell: 20 }] });
  const old = [0, 1, 9, 20].map(c => townSlot(c));
  const s = w.settlement('old');
  g.step([]);   // the hub gives it a grid
  assert.ok(s.grid && s.grid.n === n, 'grid made');
  s.buildings.forEach((b, i) => {
    const [x, z] = cellToWorld(s, b.cell);
    assert.ok(Math.abs(x - (s.x + old[i][0])) <= T.cellSize / 2 && Math.abs(z - (s.z + old[i][1])) <= T.cellSize / 2, `building ${i} within half a cell`);
    assert.equal(s.grid.use[b.cell], 'B');
  });
  const before = s.buildings.map(b => b.cell);
  g.step([]);
  assert.deepEqual(s.buildings.map(b => b.cell), before, 'migrates once');
  // drawing follows the grid: the hall is drawn on the spot, the others where they were
  const props = townProps(drawableTowns(structuredClone(g.state.frontier), 'player'), frontier.townArt);
  assert.deepEqual([props[0].x, props[0].z], [3000, 3000]);
  // queue never picks an x or used cell
  const used = new Set(before);
  for (let k = 0; k < 40; k++) {
    const id = createQueue(g, s);
    const p = s.projects.find(x => x.id === id);
    assert.ok(p, 'queued');
    assert.ok(!used.has(p.cell), 'free cell');
    assert.notEqual(s.grid.ground[p.cell], 'x');
    assert.equal(s.grid.ground[p.cell], 'c', 'cleared');
    assert.ok(inCore(s, p.cell, frontier), 'in the core');
    used.add(p.cell);
  }
  // save / load
  const file = makeSave(g, { label: 't' });
  const g2 = game();
  loadSave(g2, JSON.parse(JSON.stringify(file)));
  g2.step([]);
  assert.deepEqual(g2.state.frontier.settlements.old.grid, s.grid, 'grid survives save/load');
}
function createQueue(g, s) {
  const hero = Object.values(g.state.entities).find(e => e.type === 'hero');
  const before = new Set(s.projects.map(p => p.id));
  g.step([{ id: hero.id, type: 'frontier', action: 'queue', settlement: s.id, building: 'house' }]);
  return s.projects.find(p => !before.has(p.id))?.id;
}
console.log('town_grid: ok');
