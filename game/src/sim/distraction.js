import { dirIndex } from './geometry.js';
// Investigation duration starts on arrival, not when the pebble is thrown.
export function distractionStep(e, unit, state, moveTo, stopPath = () => {}) {
  const d = e.distracted;
  if (!d || d.source) return false;
  if (e.swing || e.execute || e.attackTarget || (e.hitBy && state.tick - e.hitBy.tick <= 1)) { delete e.distracted; return false; }
  if (d.arrivedAt == null) {
    if (state.tick >= d.travelUntil) { delete e.distracted; return false; }
    if (Math.hypot(e.x - d.x, e.z - d.z) >= .8) {
      if (!moveTo(e, unit, d.x, d.z, true)) { delete e.distracted; stopPath(e); return false; }
      return true;
    }
    d.arrivedAt = state.tick; d.until = state.tick + d.investigateTicks;
    d.face = dirIndex(d.lookX - e.x, d.lookZ - e.z); stopPath(e);
  }
  if (state.tick >= d.until) { delete e.distracted; return false; }
  e.dir = d.face; e.anim = 'idle'; return true;
}
