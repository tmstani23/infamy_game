// Infirmary (Tim 2026-11-06): a placed town building. Your hero, crew and workers near a finished one heal
// data.buildings.infirmary.infirmary.healFactor times faster (sim/stats.js reads e.infirmary), and anyone
// knocked out on the island comes round there at full health instead of at the town hall at low health
// (sim/island_respawn.js). createInfirmary({ state, data, world }) -> { tick, of, centre }
import { cellToWorld } from './town_grid.js';

export function createInfirmary({ state, data }) {
  const rules = () => data.buildings?.infirmary?.infirmary || null;
  const of = s => (s?.buildings || []).find(b => b.type === 'infirmary' && b.stage === 'built') || null;
  function centre(s, b) {
    const pts = (b.cells?.length ? b.cells : [b.cell]).map(i => cellToWorld(s, i));
    return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  }
  // every 10 ticks: mark the units standing near their own clan's finished infirmary
  function tick() {
    const R = rules();
    if (!R || (state.tick ?? 0) % 10) return;
    const spots = [];
    for (const s of Object.values(state.frontier?.settlements || {})) { const b = s.owner && s.grid && of(s); if (b) spots.push([s.owner, ...centre(s, b)]); }
    for (const u of Object.values(state.entities || {})) {
      if (u.place !== 'world') { if (u.infirmary) delete u.infirmary; continue; }
      const owner = u.owner ?? u.workerOwner;
      const near = owner && spots.some(([o, x, z]) => o === owner && Math.hypot(u.x - x, u.z - z) <= R.radius);
      if (near) u.infirmary = R.healFactor; else if (u.infirmary) delete u.infirmary;
    }
  }
  return { tick, of, centre };
}
