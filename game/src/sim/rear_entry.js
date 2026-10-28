// Pick walkable entry points that belong to the same connected approach as the
// public entrance. Nearest-free alone can land in a wall pocket or isolated tile.
export function reachableEntry(nav,from,candidates) {
  if(!nav)return null;
  for(const candidate of candidates){
    const p=nav.nearestFree(candidate.x,candidate.z);if(!p)continue;
    const path=nav.findPath(from.x,from.z,...p),end=path?.at(-1);
    if(end&&Math.hypot(end[0]-p[0],end[1]-p[1])<.6)return p;
  }
  return null;
}
