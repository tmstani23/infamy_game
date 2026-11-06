// Cart-like steering for everything on wheels or hooves (Tim 2026-11-06; first made for the capital's town
// traffic in sim/civilians.js drive()): the heading turns at most turnDegrees a second toward where it wants
// to go, the speed drops while turning hard, and the sprite row (e.dir) follows the heading, so a turn
// sweeps through the 8 views instead of snapping. Used by town traffic (sim/civilians.js), the omnibus and
// rickshaws (sim/omnibus.js; the hero's driving in sim/game.js) and horses (sim/mounts.js).
import { dirIndex } from './geometry.js';

// Turn e.heading toward the angle `want` (atan2(dx, dz)). Returns { hx, hz, diff, slow }: the unit heading,
// the angle still left to turn, and the speed factor for that turn (1 straight on, 1 - turnSlow at 90 degrees or more).
export function steer(e, want, { turnDegrees = 120, turnSlow = 0.6 } = {}, dt = 1 / 20) {
  if (e.heading === undefined || !Number.isFinite(e.heading)) e.heading = want;
  let diff = want - e.heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const maxTurn = turnDegrees * Math.PI / 180 * dt;
  e.heading += Math.max(-maxTurn, Math.min(maxTurn, diff));
  const hx = Math.sin(e.heading), hz = Math.cos(e.heading);
  e.dir = dirIndex(hx, hz);
  return { hx, hz, diff, slow: 1 - turnSlow * Math.min(1, Math.abs(diff) / (Math.PI / 2)) };
}
