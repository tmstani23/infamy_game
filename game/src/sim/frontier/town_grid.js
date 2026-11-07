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
import {wallSegments} from './wall_segments.js';
import { tierOf } from './tiers.js';

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
// B3 (Tim 2026-11-05): one build ring per town hall tier (data.tiers) for every zone, town building,
// wall and gate; roads and work camps may go outside. Without tier data the old core rule applies.
export function ringRadius(s, data) {
  const t = tierOf(s, data);
  if (t) return t.ring;
  const g = data.townGrid;
  return g.coreRadius + g.corePerTier * ((s.tier || 1) - 1);
}
export function inCore(s, i, data) {
  const [ox, oz] = cellOffset(s, i);
  return Math.hypot(ox, oz) <= ringRadius(s, data);
}
export const inRing = inCore;

// A reserved ring is open for roads and gates, never zones or solid structures.
export function hallRoadCell(s, i) {
  if (!s.grid || !s.roadReserve) return false;
  const [x, z] = cellOffset(s, i);
  return Math.max(Math.abs(x), Math.abs(z)) <= s.grid.cell * s.roadReserve && (x !== 0 || z !== 0);
}

export function zoneStructureAt(s,i,data,stage=Number(s.grid.stage[i])) {
  if(stage<1 || s.grid.ground[i]!=='c')return false;
  const def=Object.values(data?.zones?.kinds || {}).find(k=>k.char===s.grid.zone[i]);
  return !!def && (def.blocksMovement || def.buildingEvery>0 && i%def.buildingEvery===0);
}
// Completed structures block their physical footprints; fields and unfinished plots stay open.
export function townBlockersIn(frontier,x0,z0,x1,z1,data) {
  const out=[];
  for(const s of Object.values(frontier?.settlements || {})) {
    const g=s.grid;if(!g || !Number.isFinite(s.x))continue;
    const mid=(g.n-1)/2,half=g.cell/2,thickness=data?.townGrid?.wallThickness || g.cell/20,pad=thickness/2;
    const col0=Math.max(0,Math.ceil((x0-s.x-half-pad)/g.cell+mid)),col1=Math.min(g.n-1,Math.floor((x1-s.x+half+pad)/g.cell+mid));
    const row0=Math.max(0,Math.ceil((z0-s.z-half-pad)/g.cell+mid)),row1=Math.min(g.n-1,Math.floor((z1-s.z+half+pad)/g.cell+mid));
    const add=b=>{if(b.maxX>=x0 && b.minX<=x1 && b.maxZ>=z0 && b.minZ<=z1)out.push(b);};
    for(let r=row0;r<=row1;r++)for(let c=col0;c<=col1;c++) {
      const i=r*g.n+c;
      const x=s.x+(c-mid)*g.cell,z=s.z+(r-mid)*g.cell;
      if(g.use[i]==='w') {
        for(const [a,b] of wallSegments(g,i,data?.townArt?._walls?.cornerCut || 0)) {
          const dx=b[0]-a[0],dz=b[1]-a[1],steps=dx && dz ? Math.max(1,Math.ceil(Math.hypot(dx,dz)/thickness)):1;
          for(let k=0;k<steps;k++) {
            const ax=x+a[0]+dx*k/steps,az=z+a[1]+dz*k/steps,bx=x+a[0]+dx*(k+1)/steps,bz=z+a[1]+dz*(k+1)/steps;
            add({minX:Math.min(ax,bx)-pad,maxX:Math.max(ax,bx)+pad,minZ:Math.min(az,bz)-pad,maxZ:Math.max(az,bz)+pad});
          }
        }
      } else if(g.use[i]==='B' && s.buildings.some(b=>b.stage==='built' && (b.cells || [b.cell]).includes(i))) {
        // a building's "collide" (0-1) shrinks its blocking box toward the footprint centre to match its art (Tim 2026-11-07)
        const b=s.buildings.find(b=>b.stage==='built' && (b.cells || [b.cell]).includes(i)),k=data?.buildings?.[b.type]?.collide ?? data?.townGrid?.buildingCollide;
        if(k>0 && k<1) {
          const cs=b.cells || [b.cell];let cx=0,cz=0;for(const j of cs){cx+=s.x+(j%g.n-mid)*g.cell;cz+=s.z+(Math.floor(j/g.n)-mid)*g.cell;}cx/=cs.length;cz/=cs.length;
          const sx=v=>cx+(v-cx)*k,sz=v=>cz+(v-cz)*k;add({minX:sx(x-half),maxX:sx(x+half),minZ:sz(z-half),maxZ:sz(z+half)});
        } else add({minX:x-half,maxX:x+half,minZ:z-half,maxZ:z+half});
      }
      else if(zoneStructureAt(s,i,data)) {
        const h=half*data.townGrid.zoneFootprint;add({minX:x-h,maxX:x+h,minZ:z-h,maxZ:z+h});
      }
    }
  }
  return out;
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

// Nearest free, unzoned (L3.3) cleared cell in the core (ties go to the lower index), or null when there is none.
export function freeCell(s, data) {
  const g = s.grid, taken = new Set([...s.buildings, ...s.projects].map(b => b.cell));
  let best = null, bestD = Infinity;
  for (let i = 0; i < g.n * g.n; i++) {
    if (g.ground[i] !== 'c' || g.use[i] !== '.' || g.zone[i] !== '.' || taken.has(i) || !inCore(s, i, data) || hallRoadCell(s, i)) continue;
    const [ox, oz] = cellOffset(s, i), d = ox * ox + oz * oz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
// Within `margin` cells (default townGrid.cliffMargin, 1) of unbuildable ground (cliffs, mountains, water):
// roads and fields keep back from it so they never run under the cliff art. Placement rules only; roads
// already built stay as they are.
export function nearCliff(s, i, data, margin = data?.townGrid?.cliffMargin ?? 1) {
  const g = s.grid, { n } = g, col = i % n, row = (i - col) / n;
  for (let dr = -margin; dr <= margin; dr++) for (let dc = -margin; dc <= margin; dc++) {
    const c = col + dc, r = row + dr;
    if (c >= 0 && c < n && r >= 0 && r < n && g.ground[r * n + c] === 'x') return true;
  }
  return false;
}
export function setUse(s, i, ch) { s.grid.use = put(s.grid.use, i, ch); }
