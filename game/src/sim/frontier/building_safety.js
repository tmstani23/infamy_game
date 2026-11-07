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
export function buildingSafety(s, cells, state, clearance = 1) {
  if(!s.grid)return '';
  const units = livingWorldUnits(state);
  if(units.some(e=>overlapsCells(s,cells,e,clearance)))return 'Unit needs room to leave the footprint';
  const relevant = units.map(e=>worldToCell(s,e.x,e.z)).filter(i=>i>=0);
  if(!relevant.length)return '';
  const solid = new Set();
  for(let i=0;i<s.grid.use.length;i++)if(s.grid.use[i]==='w')solid.add(i);
  for(const b of s.buildings)if(b.stage==='built')for(const i of b.cells || [b.cell])solid.add(i);
  const before = reachable(s,solid);
  for(const i of cells)solid.add(i);
  const after = reachable(s,solid);
  return relevant.some(i=>before[i] && !after[i]) ? 'Would block a unit’s escape route' : '';
}
