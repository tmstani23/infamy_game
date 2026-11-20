// Castles (Z4a, Tim 2026-11-19): a clan's castle is a settlement stamped onto the normal town grid from a blueprint
// (data/castle_default.json), so walls, gates, buildings, garrisons and the war rules are the town ones.
// grid.level: one char a cell, the terrace level ('.' outside, 0 yard, 1 inner, 2 keep) for the drawing; grid.slope marks the
// land bridge ramps (the side each rises toward), whose open sides are fenced off (town_grid.js) so the only way on is an end. Two extra cell kinds in grid.use: 'm' moat and 'k' cliff. Both block everyone (town_grid.js cellBoxesOf) and
// cannot be attacked (structures.js lists only walls, gates, buildings and zone cells), so a castle's levels are
// reached only by its bridges and land bridges: the layout makes the order, no rule does.
// A castle record has capital: true (it is the clan's capital on the island) and castle: { rot, blueprint }.
//   castleCells(bp, n, rot)                -> Map(cell index -> char) for a grid of n cells a side, turned rot quarter turns
//   stampCastle(s, bp, data, { rot, clan }) -> stamps a positioned settlement that has its grid (hall on the centre cell)
//   addCastle({ world, worldData, data, bp, id, name, owner, x, z, rot, kind }) -> the new settlement record
import { makeGrid, centreCell } from './town_grid.js';
import { shapeOf } from './station_layout.js';
import { terrainAt } from '../world_data.js';

export const CASTLE_BLOCK = 'mk';   // use chars that block everyone and cannot be broken

// quarter turns clockwise seen from above: the blueprint's north (sea) side turns to east, south, west
const turn = (dx, dz, rot) => { for (let k = 0; k < ((rot % 4) + 4) % 4; k++) [dx, dz] = [-dz, dx]; return [dx, dz]; };
function* cellsOf(rect) { for (let z = rect[1]; z < rect[3]; z++) for (let x = rect[0]; x < rect[2]; x++) yield [x, z]; }
function* ringOf(rect) {
  for (const [x, z] of cellsOf(rect)) if (x === rect[0] || z === rect[1] || x === rect[2] - 1 || z === rect[3] - 1) yield [x, z];
}
const shrink = (r, k = 1) => [r[0] + k, r[1] + k, r[2] - k, r[3] - k];

// the castle's footprint as a world box, for a castle whose hall (bp.hall) stands at x, z, turned rot quarter turns
export function castleBox(bp, x, z, rot = 0, cell = 11) {
  const pts = [[0, 0], [bp.size[0], 0], [0, bp.size[1]], [bp.size[0], bp.size[1]]].map(([a, b]) => turn(a - bp.hall[0] - 0.5, b - bp.hall[1] - 0.5, rot));
  const xs = pts.map(p => x + p[0] * cell), zs = pts.map(p => z + p[1] * cell);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

export function castleIndex(bp, n, rot = 0) {
  const c = (n - 1) / 2, [hx, hz] = bp.hall;
  return (x, z) => { const [dx, dz] = turn(x - hx, z - hz, rot); return (c + dz) * n + c + dx; };
}

// every cell the blueprint sets, later kinds over earlier ones: sea and moat, bridges, outer wall, gates, terraces
export function castleCells(bp, n, rot = 0) {
  const at = castleIndex(bp, n, rot), out = new Map();
  const fill = (rects, ch) => { for (const r of rects || []) for (const [x, z] of cellsOf(r)) out.set(at(x, z), ch); };
  fill(bp.sea, 'm'); fill(bp.moat, 'm'); fill(bp.pier, '.');
  fill((bp.bridges || []).map(b => b.rect), '.');
  for (const [x, z] of ringOf(bp.outerWall)) out.set(at(x, z), 'w');
  fill((bp.gates || []).map(g => g.rect), 'g');
  for (const t of bp.terraces || []) {
    // thick kind (has `open`): a ring of cliff cells with the wall inside it. Thin kind (blueprint v5): the terrace's
    // outer ring is its wall and the cliff is the cell line round it (town_grid.js blocks every edge between two levels)
    if (t.open) { for (const [x, z] of ringOf(t.rect)) out.set(at(x, z), 'k'); for (const [x, z] of ringOf(shrink(t.rect))) out.set(at(x, z), 'w'); fill([t.open], '.'); }
    else for (const [x, z] of ringOf(t.rect)) out.set(at(x, z), 'w');
    fill([t.gate], 'g');
  }
  return out;
}

// the footprint cells of one blueprint building, turned
function footprint(b, type, data, at, rot) {
  const spec = data.buildings?.[type] || {}, size = spec.size | 0 || 1, [w, h] = shapeOf(spec, b.rot || 0) || [size, size];
  const cells = [];
  for (let dz = 0; dz < h; dz++) for (let dx = 0; dx < w; dx++) cells.push(at(b.at[0] + dx, b.at[1] + dz));
  return cells.sort((p, q) => p - q);
}

export function stampCastle(s, bp, data, { rot = 0, kind = null, newId = null, rock = null } = {}) {
  const g = s.grid, n = g.n, at = castleIndex(bp, n, rot), centre = centreCell(n);
  const use = g.use.split(''), ground = g.ground.split('');
  // the whole footprint is castle ground: levelled and cleared
  // rock: cells of mountain under the sea side (a castle spot between cliffs, Z5): left as they are, no dock water there
  const keep = new Set(); if (rock) for (const r of bp.sea || []) for (const [x, z] of cellsOf(r)) if (rock.has(at(x, z))) keep.add(at(x, z));
  for (const [x, z] of cellsOf([0, 0, bp.size[0], bp.size[1]])) if (!keep.has(at(x, z))) ground[at(x, z)] = 'c';
  for (const [i, ch] of castleCells(bp, n, rot)) if (!keep.has(i)) use[i] = ch;
  use[centre] = 'B';
  const hall = s.buildings.find(b => b.type === 'town_hall');
  if (hall) hall.cell = centre;
  let k = s.buildings.length;
  const add = (b, type) => {
    const cells = footprint(b, type, data, at, rot), spec = data.buildings?.[type];
    if (cells.some(i => use[i] !== '.')) throw new Error(`[castle] ${type} at ${b.at} overlaps something`);
    for (const i of cells) use[i] = 'B';
    s.buildings.push({ id: newId ? newId('b') : `${s.id}:${k++}`, type, cell: cells[0], ...(cells.length > 1 ? { cells } : {}),
      ...(shapeOf(spec) ? { rot: ((b.rot || 0) + rot) % 4 } : {}), stage: 'built', workers: 0 });
  };
  for (const b of bp.buildings || []) add(b, b.slot === 'special' ? (bp.special?.[kind] || bp.special?.default) : b.type);
  for (const p of bp.towers?.at || []) add({ at: p }, bp.towers.type);
  // the level of every cell for the drawing: '.' outside the castle, 0 yard, 1 inner terrace, 2 keep terrace (cliff rings included)
  const level = new Array(n * n).fill('.');
  for (const [x, z] of cellsOf([0, 0, bp.size[0], bp.size[1]])) level[at(x, z)] = '0';
  for (const t of bp.terraces || []) for (const [x, z] of cellsOf(t.rect)) level[at(x, z)] = String(t.level);
  // land bridges (Z4h): each terrace's ramp rises from the level it stands on to the terrace, toward its cut in the cliff.
  // grid.slope: one char a cell, the world side the ramp rises toward (N, E, S, W; '.' none). castle.ramps lists each
  // ramp's cells with how many cells along from its low end, for the drawing (src/castle_height.js)
  const slope = new Array(n * n).fill('.'), ramps = [];
  for (const t of bp.terraces || []) {
    const r = t.ramp, o = t.open || t.gate;
    if (!r || !o) continue;
    const dx = o[0] >= r[2] ? 1 : o[2] <= r[0] ? -1 : 0, dz = dx ? 0 : o[1] >= r[3] ? 1 : o[3] <= r[1] ? -1 : 0;
    const len = dx ? r[2] - r[0] : r[3] - r[1], [wx, wz] = turn(dx, dz, rot), dir = wx > 0 ? 'E' : wx < 0 ? 'W' : wz > 0 ? 'S' : 'N';
    const lo = Number(level[at(r[0], r[1])]) || 0, cells = [];
    for (const [x, z] of cellsOf(r)) {
      const i = at(x, z), along = dx > 0 ? x - r[0] : dx < 0 ? r[2] - 1 - x : dz > 0 ? z - r[1] : r[3] - 1 - z;
      slope[i] = dir; cells.push([i, along]);
    }
    ramps.push({ id: t.id, dir, len, lo, hi: t.level, cells });
  }
  g.use = use.join(''); g.ground = ground.join('');
  g.level = level.join(''); g.slope = slope.join('');
  // the dock (bp.pier): the cells of the landing that runs out into the sea, drawn as planks (src/castle_height.js)
  const pier = []; for (const r of bp.pier || []) for (const [x, z] of cellsOf(r)) pier.push(at(x, z));
  s.castle = { rot: ((rot % 4) + 4) % 4, blueprint: bp.id || 'default', ramps, pier };
  // a castle is its clan's capital on the island (big picture plan 2026-11-19): every rule that skips the capital
  // (economy, governor, zoning, upkeep, town counts, founding limits, war targets) skips it; its ryo is the clan treasury
  s.capital = true; delete s.founded;
  s.tier = bp.tier || 3;
  return s;
}

export function addCastle({ world, worldData = null, data, bp, id, name, owner, x, z, rot = 0, kind = null }) {
  const s = world.addTown({ id, name, region: null, owner, x, z, site: null, traits: {}, pop: 0, stock: {}, roadReserve: 0,
    buildings: [{ type: data.founding?.townHall || 'town_hall', stage: 'built', cell: 0 }] });
  s.grid = makeGrid(s, worldData, data);
  let rock = null;
  if (worldData) { rock = new Set(); const g = s.grid, mid = (g.n - 1) / 2;
    for (let i = 0; i < g.n * g.n; i++) if (g.ground[i] === 'x' && terrainAt(worldData, s.x + (i % g.n - mid) * g.cell, s.z + (Math.floor(i / g.n) - mid) * g.cell) === 'm') rock.add(i); }
  return stampCastle(s, bp, data, { rot, kind, rock, newId: world.newId ? t => world.newId(t) : null });
}
