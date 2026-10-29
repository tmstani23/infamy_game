// Running away from a threat (geisha, rifleman; Tim 2026-10-28: geisha got stuck in trees).
// Picks one escape spot and keeps it for holdTicks instead of a new spot 5 steps ahead every tick
// (a goal that moves every tick keeps the straight last leg of moveTo aimed through trees).
// Spots with a clear straight line come first; otherwise any spot the walk grid can path to.
export function createFlee({ state, moveTo, nearestFree, canOccupy = () => true, clearLine = () => true, holdTicks = 30 }) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  function pick(e, from) {
    const away = Math.atan2(e.z - from.z, e.x - from.x);
    for (const straight of [true, false]) for (const reach of [5, 3.5, 7]) for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const a = away + turn, p = nearestFree(e.x + Math.cos(a) * reach, e.z + Math.sin(a) * reach, e);
      if (!p || !canOccupy(e, p[0], p[1], e.place) || Math.hypot(p[0] - from.x, p[1] - from.z) <= dist(e, from)) continue;
      if (straight && !clearLine(e, { x: p[0], z: p[1] })) continue;
      return { x: p[0], z: p[1], place: e.place, until: state.tick + holdTicks };
    }
    return null;
  }
  return function flee(e, unit, from) {
    let g = e.fleeGoal;
    const keep = g && g.place === e.place && state.tick < g.until && dist(e, g) > 0.4 && dist(g, from) > dist(e, from);
    if (!keep) g = e.fleeGoal = pick(e, from);
    if (g && moveTo(e, unit, g.x, g.z, false)) return true;
    delete e.fleeGoal; return false;
  };
}
