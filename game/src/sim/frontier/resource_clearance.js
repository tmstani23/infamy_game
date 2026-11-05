import {cellToWorld} from './town_grid.js';
// Resource pieces stay reserved through harvesting/regrowth. No art-derived geometry.
export function coversResources(s,cells,index,clearance=1) {
  if(!index || !s.grid)return false;
  const half=s.grid.cell/2+clearance;
  return cells.some(i=>{
    const [x,z]=cellToWorld(s,i);
    return index.spotsNear(x,z,Math.SQRT2*half+(index.maxPieceReach || 0)).some(spot=>
      (spot.pieces.length?spot.pieces:[[0,0]]).some(([dx,dz])=>Math.abs(spot.x+dx-x)<half && Math.abs(spot.z+dz-z)<half));
  });
}
