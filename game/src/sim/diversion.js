// Shinobi geisha (rework, Tim 2026-10-27): no manual Diversion any more. In a sector or in the
// hero group she acts on her own:
//  - Lure is her "auto attack": every cooldownTicks she charms one visible enemy crew member or
//    house guard within radius (first anyone hitting her clan, then anyone near her clan, then the
//    nearest). The charmed unit stands entranced for durationTicks and does nothing. Never heroes,
//    police, bandits or townsfolk.
//  - Anyone coming at her: she runs away (and so slips back into hiding, sim/stealth.js).
//  - Caught anyway (a threat stays in reach for cornerTicks, or there is nowhere to run): she
//    fights, and her stats (units.json shinobi_geisha) make her deadly up close.
// An explicit attack order from the player still makes her fight like any crew member.
import { createFlee } from './flee.js';

export const DIVERSION = { radius: 6, durationTicks: 80, cooldownTicks: 200, threatRadius: 3.5, closeRadius: 2.2, cornerTicks: 30, castTicks: 20 };
export function createDiversion({ state, deployment, vision, reveal, clearCombat, inCombat = () => false,
  hostile = () => false, attackStep = () => {}, moveTo = () => false, nearestFree = (x, z) => [x, z], fightTarget = () => null, clearLine = () => true }) {
  const flee = createFlee({ state, moveTo, nearestFree, clearLine, canOccupy: (e, x, z, place) => deployment.canOccupy(e, x, z, place) });
  const alive = e => e && !e.dead && !e.downed && !e.jailed;
  const isGeisha = e => e?.type === 'shinobi_geisha';
  const targets = (t, id) => fightTarget(t.id) === id || t.attackTarget === id || (t.order?.kind === 'attack' && t.order.target === id) || t.swing?.target === id;
  function release(t) {
    if (!t.distracted?.source) return;
    if (t.distracted.prevOrder) t.order = t.distracted.prevOrder;
    delete t.distracted;
  }
  function lure(e) {
    const mine = Object.values(state.entities).filter(u => u.owner === e.owner && alive(u) && u.place === e.place);
    let best = null, bestScore = Infinity;
    for (const t of Object.values(state.entities)) {
      if (!alive(t) || t.owner === e.owner || !state.clans?.[t.owner] || t.type === 'hero' || t.type === 'civilian' || t.cop || t.wild
        || t.place !== e.place || t.distracted || t.deployment?.transfer || !hostile(e, t) || !vision.canSee(e.owner, t)) continue;
      const d = Math.hypot(t.x - e.x, t.z - e.z);
      if (d > DIVERSION.radius) continue;
      const hitting = mine.some(u => targets(t, u.id)), near = mine.some(u => u !== e && Math.hypot(u.x - t.x, u.z - t.z) < 4);
      const score = (hitting ? 0 : near ? 100 : 200) + d;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    if (!best) return false;
    clearCombat(best);
    best.distracted = { source: e.id, x: best.x, z: best.z, place: best.place, until: state.tick + DIVERSION.durationTicks,
      prevOrder: best.order ? structuredClone(best.order) : null, at: state.tick };
    best.order = { kind: 'stop' };
    e.lure = { readyAt: state.tick + DIVERSION.cooldownTicks, castUntil: state.tick + DIVERSION.castTicks, target: best.id };
    (e.buffs||={}).charming={start:state.tick,until:e.lure.castUntil};
    reveal(e, true);
    state.casts.push({ kind: 'diversion', a: e.id, x: best.x, z: best.z, radius: 1.2 });
    return true;
  }
  function geishaStep(e, unit) {
    if (!alive(e) || e.deployment?.transfer || e.order?.kind === 'attack') { delete e.cornered; return false; }
    // a move-type order from you beats running away (Tim 2026-10-28)
    if ((e.order?.kind === 'move' && !e.order.arrived) || ['attackmove', 'enter', 'heal', 'loot'].includes(e.order?.kind)) { delete e.cornered; if (e.geishaMode) { delete e.geishaMode; delete e.fleeGoal; } return false; }
    const threats = Object.values(state.entities).filter(t => alive(t) && t.place === e.place && t.distracted?.source !== e.id && hostile(t, e)
      && Math.hypot(t.x - e.x, t.z - e.z) < (targets(t, e.id) ? DIVERSION.threatRadius : DIVERSION.closeRadius));
    if (threats.length) {
      const t = threats.reduce((a, b) => Math.hypot(a.x - e.x, a.z - e.z) <= Math.hypot(b.x - e.x, b.z - e.z) ? a : b);
      const reach = (unit.attackRange || 1.2) + 0.6, close = Math.hypot(t.x - e.x, t.z - e.z) <= reach;
      e.cornered = close ? (e.cornered ?? state.tick) : null;
      if ((e.cornered != null && state.tick - e.cornered >= DIVERSION.cornerTicks) || e.swing) {
        attackStep(e, unit, t); e.geishaMode = 'fighting'; return true;
      }
      if (!e.swing && flee(e, unit, t)) { e.geishaMode = 'fleeing'; return true; }
      attackStep(e, unit, t); e.geishaMode = 'fighting'; return true;   // nowhere to run
    }
    delete e.cornered;
    if (e.geishaMode === 'fighting' || e.geishaMode === 'fleeing') { clearCombat(e); delete e.geishaMode; }
    const moving=(e.order?.kind==='move'&&!e.order.arrived)||['attackmove','enter','heal','loot'].includes(e.order?.kind)||['walk','run'].includes(e.anim);
    if(moving){if(e.lure)e.lure.castUntil=Math.min(e.lure.castUntil,state.tick);if(e.buffs)delete e.buffs.charming;return false;}
    if ((e.lure?.castUntil ?? -1) > state.tick) { e.anim = 'dance'; return true; }
    if ((e.lure?.readyAt ?? 0) <= state.tick && !inCombat(e) && lure(e)) { e.anim = 'dance'; return true; }
    return false;
  }
  function tick() {
    for (const t of Object.values(state.entities)) if (t.distracted?.source) {
      const a = state.entities[t.distracted.source];
      if (!alive(t) || !alive(a) || t.distracted.until <= state.tick) release(t);
    }
  }
  function step(e, unit) {
    if (e.distracted?.source) { clearCombat(e); e.anim = 'idle'; return true; }   // entranced: stands still
    if (isGeisha(e) && geishaStep(e, unit)) return true;
    return false;
  }
  // kept for the shared deployment command and the older manual hooks; nothing to do now
  const command = () => {};
  const manual = e => { delete e.cornered;if(isGeisha(e)){if(e.lure)e.lure.castUntil=state.tick;if(e.buffs)delete e.buffs.charming;} };
  const interrupted = e => { if (isGeisha(e) && e.lure) {e.lure.castUntil = state.tick;if(e.buffs)delete e.buffs.charming;} };
  return { command, tick, step, manual, interrupted, release };
}
