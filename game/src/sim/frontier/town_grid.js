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
import { artBoxes, townArtData } from './art_blocks.js';
import { stationParts } from './station_layout.js';

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
// perf (2026-11-07 profile: 18% of a frontier tick): each cell's boxes are built once per settlement and
// reused until the grid strings or the set of built buildings change
const blockerCache=new WeakMap();
let blockerEpoch=0;
// frontier tick calls this once a tick: buildings finished since are re-checked (grid edits are seen at once)
export function townBlockersTick(){blockerEpoch++;}
// a number that changes whenever any town's blockers change (checked at most once per frontier tick), so callers
// can keep their own per-cell answers until it moves (sim/areas.js, Tim 2026-11-07 lag while walking)
let blockerVersion=0,versionEpoch=-1,versionTowns='';
export function townBlockersVersion(frontier,data) {
  if(versionEpoch===blockerEpoch)return blockerVersion;
  versionEpoch=blockerEpoch;
  data=townArtData(data);
  const list=Object.values(frontier?.settlements || {}).filter(s=>s.grid && Number.isFinite(s.x)),camps=campsOf(frontier),ids=list.map(s=>s.id).join(',')+'|'+camps.map(w=>w.id).join(',');
  if(ids!==versionTowns){versionTowns=ids;blockerVersion++;}
  for(const s of list)cellBoxesOf(s,data);
  for(const w of camps)campBoxesOf(w.camp,data);
  return blockerVersion;
}
const builtKey=s=>s.buildings.map(b=>b.stage==='built'?b.id ?? (b.cells || [b.cell]).join('.'):'').join(',');
// War camps (collision checkpoint 5b-2): a built camp building blocks the ground its art stands on; building
// sites stay open, so builders and troops are never walled in. Kept per camp until its built buildings change.
const campCache=new WeakMap();
const campsOf=frontier=>Object.values(frontier?.wars?.list || {}).filter(w=>w.camp && Number.isFinite(w.camp.x));
const campKey=camp=>(camp.buildings || []).map(b=>b.stage==='built' && Number.isFinite(b.x)?`${b.id}@${b.x},${b.z}`:'').join(';');
function campBoxesOf(camp,data) {
  let e=campCache.get(camp);
  if(e && e.data===data) {
    if(e.epoch===blockerEpoch)return e.boxes;
    if(campKey(camp)===e.key){e.epoch=blockerEpoch;return e.boxes;}
  }
  const art=data?.townArt,boxes=[];
  for(const b of camp.buildings || []) {
    if(b.stage!=='built' || !Number.isFinite(b.x))continue;
    const fit=art?._placedFootprint?.[b.type];
    for(const o of artBoxes(data,art?.[b.type],fit?11*fit:0) || [])boxes.push({minX:b.x+o.minX,maxX:b.x+o.maxX,minZ:b.z+o.minZ,maxZ:b.z+o.maxZ});
  }
  blockerVersion++;
  campCache.set(camp,{data,key:campKey(camp),epoch:blockerEpoch,boxes});
  return boxes;
}
// what blocks in the war camps, as a string (worker path cache key, like townBlockSignature)
export function campBlockSignature(frontier){return campsOf(frontier).map(w=>`${w.id}:${campKey(w.camp)}`).join('|');}
// the art a grown zone cell shows (the same pick as town_props.js townCellsToProps)
function zoneArt(s,i,art) {
  const def=art?._zones?.[s.grid.zone[i]],stage=Number(s.grid.stage[i]);
  if(!def?.stages || stage<1)return null;
  return s.zones?.[def.kind]?.abandoned && def.abandoned || def.stages[Math.min(stage,def.stages.length)-1];
}
const abandonedKey=s=>Object.entries(s.zones || {}).map(([k,z])=>z?.abandoned?k:'').join(',');
function cellBoxesOf(s,data) {
  const g=s.grid;
  let per=blockerCache.get(s);if(!per)blockerCache.set(s,per=new Map());
  const dk=data || per;let e=per.get(dk);
  if(e && e.use===g.use && e.stage===g.stage && e.zone===g.zone && e.ground===g.ground && e.x===s.x && e.z===s.z && e.n===s.buildings.length) {
    if(e.epoch===blockerEpoch)return e.cells;
    const key=builtKey(s);if(key===e.key && e.ab===abandonedKey(s)){e.epoch=blockerEpoch;return e.cells;}
  }
  const key=builtKey(s);
  const mid=(g.n-1)/2,half=g.cell/2,thickness=data?.townGrid?.wallThickness || g.cell/20,pad=thickness/2;
  const owner=new Map();for(const b of s.buildings)if(b.stage==='built')for(const i of b.cells || [b.cell])owner.set(i,b);
  const cells=new Map();
  const push=(i,b)=>{const l=cells.get(i);if(l)l.push(b);else cells.set(i,[b]);};
  // a box that matches the art may reach over a cell edge: each cell keeps its own part
  const spread=b=>{
    const c0=Math.max(0,Math.round((b.minX-s.x)/g.cell+mid)),c1=Math.min(g.n-1,Math.round((b.maxX-s.x)/g.cell+mid));
    const r0=Math.max(0,Math.round((b.minZ-s.z)/g.cell+mid)),r1=Math.min(g.n-1,Math.round((b.maxZ-s.z)/g.cell+mid));
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++) {
      const x=s.x+(c-mid)*g.cell,z=s.z+(r-mid)*g.cell;
      const part={minX:Math.max(b.minX,x-half),maxX:Math.min(b.maxX,x+half),minZ:Math.max(b.minZ,z-half),maxZ:Math.min(b.maxZ,z+half)};
      if(part.maxX-part.minX>1e-6 && part.maxZ-part.minZ>1e-6)push(r*g.n+c,part);
    }
  };
  // art drawn at (x, z): its boxes, or false when the art is unknown (the caller keeps the old tile rule)
  const artAt=(name,x,z,max,flip)=>{const bs=artBoxes(data,name,max,flip);if(!bs)return false;for(const o of bs)spread({minX:x+o.minX,maxX:x+o.maxX,minZ:z+o.minZ,maxZ:z+o.maxZ});return true;};
  const art=data?.townArt,byArt=new Set();
  // placed buildings block the ground their art stands on (5b-0, Tim 2026-11-11), drawn as in town_props.js
  for(const b of s.buildings) {
    if(b.stage!=='built')continue;
    const cs=b.cells || [b.cell];let cx=0,cz=0;for(const j of cs){cx+=s.x+(j%g.n-mid)*g.cell;cz+=s.z+(Math.floor(j/g.n)-mid)*g.cell;}cx/=cs.length;cz/=cs.length;
    const fit=art?._placedFootprint?.[b.type],max=fit?g.cell*fit:0,parts=b.type==='station' && art?._stationParts && stationParts(s,b);
    let done;
    if(parts) {
      const P=art._stationParts,along=parts.rot%2===0,mf=g.cell*(P.fit ?? 1.6);
      const a=artAt(P.shed,s.x+parts.shed[0],s.z+parts.shed[1],mf,along),h=artAt(P.hall,s.x+parts.hall[0],s.z+parts.hall[1],mf,!along);
      done=a && h;
    } else done=artAt(art?.[b.type],cx,cz,max,false);
    if(done)byArt.add(b);
  }
  for(let i=0;i<g.n*g.n;i++) {
    const add=b=>push(i,b);
    const c=i%g.n,r=Math.floor(i/g.n),x=s.x+(c-mid)*g.cell,z=s.z+(r-mid)*g.cell;
    if(g.use[i]==='w') {
      for(const [a,b] of wallSegments(g,i,data?.townArt?._walls?.cornerCut || 0)) {
        const dx=b[0]-a[0],dz=b[1]-a[1],steps=dx && dz ? Math.max(1,Math.ceil(Math.hypot(dx,dz)/thickness)):1;
        for(let k=0;k<steps;k++) {
          const ax=x+a[0]+dx*k/steps,az=z+a[1]+dz*k/steps,bx=x+a[0]+dx*(k+1)/steps,bz=z+a[1]+dz*(k+1)/steps;
          add({minX:Math.min(ax,bx)-pad,maxX:Math.max(ax,bx)+pad,minZ:Math.min(az,bz)-pad,maxZ:Math.max(az,bz)+pad});
        }
      }
    } else if(g.use[i]==='B' && owner.has(i) && !byArt.has(owner.get(i))) {
      // a building's "collide" (0-1) shrinks its blocking box toward the footprint centre to match its art (Tim 2026-11-07)
      const b=owner.get(i),k=data?.buildings?.[b.type]?.collide ?? data?.townGrid?.buildingCollide;
      if(k>0 && k<1) {
        const cs=b.cells || [b.cell];let cx=0,cz=0;for(const j of cs){cx+=s.x+(j%g.n-mid)*g.cell;cz+=s.z+(Math.floor(j/g.n)-mid)*g.cell;}cx/=cs.length;cz/=cs.length;
        const sx=v=>cx+(v-cx)*k,sz=v=>cz+(v-cz)*k;add({minX:sx(x-half),maxX:sx(x+half),minZ:sz(z-half),maxZ:sz(z+half)});
      } else add({minX:x-half,maxX:x+half,minZ:z-half,maxZ:z+half});
    } else if(zoneStructureAt(s,i,data)) {
      // a grown house or workshop blocks the ground its art stands on (5b-1)
      const zf=art?._ground?.zoneFootprint || 0.8;
      if(!artAt(zoneArt(s,i,art),x,z,g.cell*zf,false)){const h=half*zf;add({minX:x-h,maxX:x+h,minZ:z-h,maxZ:z+h});}
    }
  }
  blockerVersion++;
  per.set(dk,{ab:abandonedKey(s),use:g.use,stage:g.stage,zone:g.zone,ground:g.ground,key,x:s.x,z:s.z,n:s.buildings.length,epoch:blockerEpoch,cells});
  return cells;
}
// which cells block walking, as a string: changes only when something solid appears or goes (worker path cache key)
export function townBlockSignature(s,data){data=townArtData(data);return s.grid && Number.isFinite(s.x)?[...cellBoxesOf(s,data).keys()].join(','):'';}
export function townBlockersIn(frontier,x0,z0,x1,z1,data) {
  const out=[];data=townArtData(data);
  for(const w of campsOf(frontier))for(const b of campBoxesOf(w.camp,data))if(b.maxX>=x0 && b.minX<=x1 && b.maxZ>=z0 && b.minZ<=z1)out.push(b);
  for(const s of Object.values(frontier?.settlements || {})) {
    const g=s.grid;if(!g || !Number.isFinite(s.x))continue;
    const mid=(g.n-1)/2,half=g.cell/2,thickness=data?.townGrid?.wallThickness || g.cell/20,pad=thickness/2;
    const col0=Math.max(0,Math.ceil((x0-s.x-half-pad)/g.cell+mid)),col1=Math.min(g.n-1,Math.floor((x1-s.x+half+pad)/g.cell+mid));
    const row0=Math.max(0,Math.ceil((z0-s.z-half-pad)/g.cell+mid)),row1=Math.min(g.n-1,Math.floor((z1-s.z+half+pad)/g.cell+mid));
    if(col0>col1 || row0>row1)continue;
    const cells=cellBoxesOf(s,data);
    for(let r=row0;r<=row1;r++)for(let c=col0;c<=col1;c++) {
      const bs=cells.get(r*g.n+c);if(!bs)continue;
      for(const b of bs)if(b.maxX>=x0 && b.minX<=x1 && b.maxZ>=z0 && b.minZ<=z1)out.push(b);
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
