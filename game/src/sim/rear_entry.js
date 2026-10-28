// Pick walkable entry points that belong to the same connected approach as the
// public entrance. Nearest-free alone can land in a wall pocket or isolated tile.
export function reachableEntry(nav,from,candidates,{blockers=[],clearance=0}={}) {
  if(!nav)return null;
  for(const candidate of candidates){
    const p=nav.nearestFree(candidate.x,candidate.z);if(!p)continue;
    // The whole interaction ring needs floor space, not just its centre cell.
    // Otherwise a legal point can still paint the window on a garden wall.
    if(blockers.some(b=>Math.hypot(Math.max(b.minX-p[0],0,p[0]-b.maxX),Math.max(b.minZ-p[1],0,p[1]-b.maxZ))<clearance))continue;
    const path=nav.findPath(from.x,from.z,...p),end=path?.at(-1);
    if(end&&Math.hypot(end[0]-p[0],end[1]-p[1])<.6)return p;
  }
  return null;
}
