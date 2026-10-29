// Kuroda teppo rifleman (Tim 2026-10-28): the Kuroda clan's special crew, on a par with the Shinobi
// geisha (sim/diversion.js). He acts on his own while standing still:
//  - Aimed Shot is his "auto attack": every cooldownTicks he aims at one visible enemy within range
//    for aimTicks (render draws a red line), then hits him for damage and staggers him for
//    staggerTicks (heroes for half). First anyone hitting his clan, then the nearest. Moving or being
//    hit while aiming spoils the shot (short retry). Each shot adds heat (gunfire is loud).
//  - Otherwise he moves and fights like any other crew member (weak rifle-butt melee between shots;
//    Tim 2026-10-28: no running away of his own, orders always obeyed).
// An explicit attack order shoots that target when it can, else fights like any crew member.
import { dirIndex } from './geometry.js';
import { createFlee } from './flee.js';

export const RIFLE = { range: 8, meleeRange: 2, aimTicks: 20, cooldownTicks: 60, retryTicks: 40, damage: 80, staggerTicks: 30, heat: 3,
  threatRadius: 3.5, closeRadius: 2.2, cornerTicks: 30, fleeTicks: 40 };
export function createRifleman({ state, vision, hit, addHeat, stun, clearLine, clearCombat, hostile = () => false, inCombat = () => false,
  attackStep = () => {}, moveTo = () => false, inRally = () => false, nearestFree = (x, z) => [x, z], canOccupy = () => true, fightTarget = () => null, rules = {} }) {
  const R = { ...RIFLE, ...rules };
  const alive = e => e && !e.dead && !e.downed && !e.jailed;
  const isRifleman = e => e?.type === 'kuroda_rifleman';
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const targets = (t, id) => fightTarget(t.id) === id || t.attackTarget === id || (t.order?.kind === 'attack' && t.order.target === id) || t.swing?.target === id;
  const shootable = (e, t) => alive(t) && t.owner !== e.owner && state.clans?.[t.owner] && t.type !== 'civilian' && !t.cop && !t.wild
    && t.place === e.place && !t.deployment?.transfer && hostile(e, t) && vision.canSee(e.owner, t) && dist(e, t) <= R.range && clearLine(e, t);
  function pick(e) {
    const ordered = e.order?.kind === 'attack' && state.entities[e.order.target];
    if (ordered) return shootable(e, ordered) ? ordered : null;
    const mine = Object.values(state.entities).filter(u => u.owner === e.owner && alive(u) && u.place === e.place);
    let best = null, bestScore = Infinity;
    for (const t of Object.values(state.entities)) {
      if (!shootable(e, t)) continue;
      const score = (mine.some(u => targets(t, u.id)) ? 0 : 100) + dist(e, t);
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }
  const spoil = e => { if (e.rifle?.aim) { delete e.rifle.aim; e.rifle.readyAt = Math.max(e.rifle.readyAt || 0, state.tick + R.retryTicks); } };
  function fire(e, t) {
    delete e.rifle.aim;
    e.rifle.firedAt = state.tick; e.anim = 'fire';
    e.rifle.readyAt = state.tick + R.cooldownTicks;
    e.dir = dirIndex(t.x - e.x, t.z - e.z);
    state.casts.push({ kind: 'rifleshot', a: e.id, t: t.id, x: e.x, z: e.z, tx: t.x, tz: t.z });
    hit(e, t, R.damage, false, 'rifle');
    if (alive(t)) stun(t, t.type === 'hero' ? Math.round(R.staggerTicks / 2) : R.staggerTicks);
    addHeat(e.owner, R.heat, 'Gunfire');
  }
  const flee = createFlee({ state, moveTo, nearestFree, canOccupy, clearLine });
  // his own ranged routine on a sector duty (not the hero group, Rally or HQ reserves; Tim 2026-10-28):
  // holds ground between shots, backs off from anyone coming at him, and after fleeTicks without
  // shaking them turns and fights, opening with a snap shot if loaded
  const onDuty = e => { const g = e.deployment?.group; return !!g && g !== 'hero' && g !== 'home' && !e.deployment?.duty?.manual && !inRally(e) && e.order?.kind !== 'attack'; };
  function skirmish(e, unit, r) {
    const threats = Object.values(state.entities).filter(t => alive(t) && t.place === e.place && hostile(t, e)
      && dist(t, e) < (targets(t, e.id) ? R.threatRadius : R.closeRadius));
    if (!threats.length) {
      delete e.cornered; e.calmSince ??= state.tick;
      if (state.tick - e.calmSince > 40) delete e.fleeingSince;
      if (e.rifleMode) { clearCombat(e); delete e.rifleMode; delete e.fleeGoal; }
      return false;
    }
    spoil(e);
    const t = threats.reduce((a, b) => dist(a, e) <= dist(b, e) ? a : b);
    e.cornered = dist(t, e) <= (unit.attackRange || 1.2) + 0.6 ? (e.cornered ?? state.tick) : null;
    e.fleeingSince ??= state.tick; e.calmSince = null;
    const stand = state.tick - e.fleeingSince >= R.fleeTicks || (e.cornered != null && state.tick - e.cornered >= R.cornerTicks);
    if (stand && !e.swing && r.readyAt <= state.tick && shootable(e, t)) { clearCombat(e); fire(e, t); e.rifleMode = 'fighting'; return true; }
    if (stand || e.swing || !flee(e, unit, t)) { attackStep(e, unit, t); e.rifleMode = 'fighting'; return true; }
    e.rifleMode = 'fleeing'; return true;
  }
  function rifleStep(e, unit) {
    if (!alive(e) || e.deployment?.transfer) return false;
    const r = e.rifle ||= { readyAt: 0 };
    // in the hero group he moves like any other crew member; your move-type orders always come first
    const moving = (e.order?.kind === 'move' && !e.order.arrived) || ['attackmove', 'enter', 'heal', 'loot'].includes(e.order?.kind);
    if (moving) { spoil(e); return false; }
    if (onDuty(e) && skirmish(e, unit, r)) return true;
    // an attack order: shoot first; melee only once the target is within meleeRange (Tim 2026-10-29)
    const ordered = e.order?.kind === 'attack' && state.entities[e.order.target];
    const od = ordered && alive(ordered) && ordered.place === e.place ? dist(e, ordered) : Infinity;
    if (od <= R.meleeRange) { spoil(e); return false; }
    if (r.aim) {
      const t = state.entities[r.aim.target];
      if (!shootable(e, t)) { spoil(e); return false; }
      clearCombat(e); e.dir = dirIndex(t.x - e.x, t.z - e.z); e.anim = 'aim';
      if (state.tick >= r.aim.until) fire(e, t);   // sets anim 'fire'
      return true;
    }
    if (r.readyAt > state.tick) {
      // just fired: finish the shot and the reload before walking on (anim only; the normal crew AI decides the rest)
      const since = state.tick - (r.firedAt ?? -1e9);
      if (since < 10) { clearCombat(e); e.anim = 'fire'; return true; }
      if (onDuty(e) && pick(e)) { clearCombat(e); e.anim = since < 70 ? 'reload' : 'idle'; return true; }   // on duty: hold ground, don't walk into melee
      if (od <= R.range && shootable(e, ordered)) { clearCombat(e); e.dir = dirIndex(ordered.x - e.x, ordered.z - e.z); e.anim = since < 70 ? 'reload' : 'idle'; return true; }   // ordered: reload in place
      return false;
    }
    const t = pick(e);
    if (!t) return false;
    r.aim = { target: t.id, until: state.tick + R.aimTicks, at: state.tick };
    clearCombat(e); e.dir = dirIndex(t.x - e.x, t.z - e.z); e.anim = 'aim';
    return true;
  }
  const step = (e, unit) => isRifleman(e) && rifleStep(e, unit);
  const interrupted = e => { if (isRifleman(e)) spoil(e); };
  const manual = e => { if (isRifleman(e)) spoil(e); };
  return { step, interrupted, manual };
}
