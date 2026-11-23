// Shared placement/completion safety. Queries only; no unit teleporting or save changes.
import { cellToWorld, worldToCell } from './town_grid.js';

// salute cannons are scenery that never moves off a plot, so they never hold up a building (sim/cannon_salute.js)
export const livingWorldUnits = state => Object.values(state?.entities || {}).filter(e => e.place === 'world' && !e.dead && !e.jailed && !e.cannon);
export function overlapsCells(s, cells, e, clearance = 1) {
  return cells.some(i => {
    const [x,z] = cellToWorld(s,i), h = s.grid.cell / 2 + clearance;
    return Math.abs(e.x-x) < h && Math.abs(e.z-z) < h;
  });
}

// Flood actual completed collision, rather than reserved unfinished project cells.
function reachable(s, solid) {
  const {n,ground} = s.grid, seen = new Uint8Array(n*n), queue = [];
  const add = i => {if(i>=0 && i<n*n && !seen[i] && ground[i]!=='x' && !solid.has(i)){seen[i]=1;queue.push(i);}};
  for(let c=0;c<n;c++){add(c);add((n-1)*n+c);add(c*n);add(c*n+n-1);}
  for(let k=0;k<queue.length;k++) {
    const i=queue[k],c=i%n;
    if(c)add(i-1);if(c<n-1)add(i+1);add(i-n);add(i+n);
  }
  return seen;
}
// True when taking `cover` out of a flooded area (seen) cannot cut any other flooded cell off: the flooded cells
// around the cover (one step, corners too) still join each other without it, so every path that ran through the cover
// has a way round. False means not sure, flood again. seed(i): a cell floods start from (cover on one is never sure).
// (2026-11-22: the general's room check flooded the whole grid for every cell it tried and the game hitched.)
export function coverKeepsFlood(seen, n, cover, seed) {
  const N = seen.length, inC = new Set(cover), win = new Set(), edge = new Set();
  for (const i of cover) {
    if (!(i >= 0 && i < N) || seed(i)) return false;
    const col = i % n;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = col + dx, j = i + dz * n + dx;
      if ((!dx && !dz) || c < 0 || c >= n || j < 0 || j >= N || inC.has(j) || !seen[j]) continue;
      win.add(j); if (!dx || !dz) edge.add(j);
    }
  }
  if (edge.size < 2) return true;
  const first = edge.values().next().value, got = new Set([first]), stack = [first];
  while (stack.length) {
    const i = stack.pop(), col = i % n;
    for (const j of [col > 0 ? i - 1 : -1, col < n - 1 ? i + 1 : -1, i - n, i + n]) if (win.has(j) && !got.has(j)) { got.add(j); stack.push(j); }
  }
  for (const j of edge) if (!got.has(j)) return false;
  return true;
}
function solidOf(s) {
  const solid = new Set();
  for(let i=0;i<s.grid.use.length;i++)if(s.grid.use[i]==='w')solid.add(i);
  for(const b of s.buildings)if(b.stage==='built')for(const i of b.cells || [b.cell])solid.add(i);
  return solid;
}
// the flood of the town as it is built, kept per grid while its walls and built buildings stay the same
const floods = new WeakMap();
function builtFlood(s) {
  const g = s.grid; let sig = '';
  for (const b of s.buildings) if (b.stage === 'built') sig += b.id + ',';
  const f = floods.get(g);
  if (f && f.n === g.n && f.use === g.use && f.ground === g.ground && f.sig === sig) return f.before;
  const before = reachable(s, solidOf(s));
  floods.set(g, { n: g.n, use: g.use, ground: g.ground, sig, before });
  return before;
}
export function buildingSafety(s, cells, state, clearance = 1) {
  if(!s.grid)return '';
  const units = livingWorldUnits(state);
  if(units.some(e=>overlapsCells(s,cells,e,clearance)))return 'Unit needs room to leave the footprint';
  const relevant = units.map(e=>worldToCell(s,e.x,e.z)).filter(i=>i>=0);
  if(!relevant.length)return '';
  const n = s.grid.n, before = builtFlood(s), border = i => { const c = i % n, r = (i - c) / n; return c === 0 || r === 0 || c === n - 1 || r === n - 1; };
  // the flood is as before but for the footprint itself: nobody else loses a way out
  if (coverKeepsFlood(before, n, cells, border)) return relevant.some(i=>before[i] && cells.includes(i)) ? 'Would block a unit’s escape route' : '';
  const solid = solidOf(s);
  for(const i of cells)solid.add(i);
  const after = reachable(s,solid);
  return relevant.some(i=>before[i] && !after[i]) ? 'Would block a unit’s escape route' : '';
}
