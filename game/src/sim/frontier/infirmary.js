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
    if (!R || (state.tick ?? 0) % 10) return;   // (the field clinic rides on the infirmary rules being there)
    const spots = [];
    for (const s of Object.values(state.frontier?.settlements || {})) { const b = s.owner && s.grid && of(s); if (b) spots.push([s.owner, ...centre(s, b), R.radius, R.healFactor]); }
    // 7c (Tim 2026-11-12): a war camp's finished field clinic does the same for the attacker's troops, hero and crew near it
    // (war.buildings.field_clinic.heal: radius and healFactor)
    const C = data.war?.buildings?.field_clinic?.heal;
    if (C) for (const w of Object.values(state.frontier?.wars?.list || {})) for (const b of w.camp?.buildings || []) if (b.type === 'field_clinic' && b.stage === 'built') spots.push([w.attacker, b.x, b.z, C.radius, C.healFactor]);
    for (const u of Object.values(state.entities || {})) {
      if (u.place !== 'world') { if (u.infirmary) delete u.infirmary; continue; }
      const owner = u.owner ?? u.workerOwner;
      let heal = 0;
      if (owner) for (const [o, x, z, r, f] of spots) if (o === owner && f > heal && Math.hypot(u.x - x, u.z - z) <= r) heal = f;
      if (heal) u.infirmary = heal; else if (u.infirmary) delete u.infirmary;
    }
  }
  return { tick, of, centre };
}
