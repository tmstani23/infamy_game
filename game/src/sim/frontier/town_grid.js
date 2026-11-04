// The town grid (Loop 3, card L3.1). Pure: no DOM, no randomness. A square grid of cells around the
// town hall replaces the spiral slots of town_layout.js (which stays for migrating old towns only).
// settlement.grid = { n, cell, ground, use, zone, by, stage }: the last five are strings of n*n chars
// (strings, not arrays, keep saves small).
//   ground: x unbuildable, o overgrown, c cleared      use:  . free, r road, w wall, g gate, B building
//   zone:   . none, h housing, f farm, k work          by:   . none, p player, g governor
//   stage:  0-3
// A cell index is row * n + col; the town hall takes the centre cell. All numbers live in
// data/frontier.json "townGrid". Cells are measured in world units from the town's x, z.
import { terrainAt, buildable } from '../world_data.js';
import { townSlot } from './town_layout.js';

const OVERGROWN = new Set(['f', 'b']);   // forest and bamboo start overgrown; open ground starts cleared

export const gridSize = data => 2 * Math.ceil(data.townGrid.radius / data.townGrid.cellSize) + 1;   // cells per side (odd, so the hall is centred)
export const centreCell = n => ((n - 1) / 2) * n + (n - 1) / 2;

// Offset of cell i from the town hall, in world units
export function cellOffset(s, i) {
  const { n, cell } = s.grid, c = (n - 1) / 2;
  return [((i % n) - c) * cell, (Math.floor(i / n) - c) * cell];
}
export function cellToWorld(s, i) {
  const [ox, oz] = cellOffset(s, i);
  return [s.x + ox, s.z + oz];
}
// Cell index under a world point, or -1 outside the grid
export function worldToCell(s, x, z) {
  const { n, cell } = s.grid, c = (n - 1) / 2;
  const col = Math.round((x - s.x) / cell) + c, row = Math.round((z - s.z) / cell) + c;
  return col < 0 || row < 0 || col >= n || row >= n ? -1 : row * n + col;
}
// Housing and work zones go only in the core around the hall; it grows with the town hall tier.
export function inCore(s, i, data) {
  const g = data.townGrid, [ox, oz] = cellOffset(s, i);
  return Math.hypot(ox, oz) <= g.coreRadius + g.corePerTier * ((s.tier || 1) - 1);
}

const fill = (n, ch) => ch.repeat(n * n);
const put = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);

// worldData may be null (tests without an island): then every cell counts as buildable open ground.
export function makeGrid(s, worldData, data) {
  const g = data.townGrid, n = gridSize(data), cell = g.cellSize, c = (n - 1) / 2, N = n * n;
  const ground = new Array(N);
  for (let i = 0; i < N; i++) {
    const col = i % n, row = (i - col) / n, dx = (col - c) * cell, dz = (row - c) * cell;
    if (Math.hypot(dx, dz) > g.radius + cell) { ground[i] = 'x'; continue; }   // outside the work range: not part of the town
    if (!worldData) { ground[i] = 'c'; continue; }
    const wx = s.x + dx, wz = s.z + dz;
    if (!buildable(worldData, wx, wz)) { ground[i] = 'x'; continue; }
    ground[i] = Math.hypot(dx, dz) <= g.clearedRadius * cell || !OVERGROWN.has(terrainAt(worldData, wx, wz)) ? 'c' : 'o';
  }
  const centre = centreCell(n);
  const use = put(fill(n, '.'), centre, 'B');
  ground[centre] = 'c';
  return { n, cell, ground: ground.join(''), use, zone: fill(n, '.'), by: fill(n, '.'), stage: fill(n, '0') };
}

// Gives a positioned town its grid, once. Old towns (and fresh ones from addTown) hold spiral slot
// numbers in `cell`; they move to the grid cell under the same world spot (migration, L3.1).
export function ensureGrid(s, worldData, data) {
  if (!data.townGrid || s.grid || !Number.isFinite(s.x) || !Number.isFinite(s.z)) return false;
  const grid = s.grid = makeGrid(s, worldData, data);
  const move = (rec, fallback) => {
    const [ox, oz] = townSlot(rec.cell ?? fallback);
    const col = Math.round(ox / grid.cell), row = Math.round(oz / grid.cell), c = (grid.n - 1) / 2;
    rec.cell = (row + c) * grid.n + col + c;
    grid.ground = put(grid.ground, rec.cell, 'c');   // something already stands here
    grid.use = put(grid.use, rec.cell, 'B');
  };
  s.buildings.forEach((b, i) => move(b, i));
  s.projects.forEach((p, i) => move(p, s.buildings.length + i));
  return true;
}

// Nearest free cleared cell in the core (ties go to the lower index), or null when there is none.
export function freeCell(s, data) {
  const g = s.grid, taken = new Set([...s.buildings, ...s.projects].map(b => b.cell));
  let best = null, bestD = Infinity;
  for (let i = 0; i < g.n * g.n; i++) {
    if (g.ground[i] !== 'c' || g.use[i] !== '.' || taken.has(i) || !inCore(s, i, data)) continue;
    const [ox, oz] = cellOffset(s, i), d = ox * ox + oz * oz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
export function setUse(s, i, ch) { s.grid.use = put(s.grid.use, i, ch); }
