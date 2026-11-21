// Kuroda Gatling gun crew (war checkpoint 7-4, Tim 2026-11-12; reworked Tim 2026-11-21): the Kuroda's second special,
// trained at the foundry. One unit: the gun with its two crew (units.json gatling_crew.gatling). Slow and heavy.
//  - It moves like any slow unit (no setup or pack up) and never fires on the move. Standing (stopped, arrived, or an
//    enemy within deployRange on an attack-move) with an enemy in range, it spins up for spinTicks, then fires a burst
//    of burstTicks, then stops and has to spin up again.
//    e.gat = { state: 'spin' | 'fire', start, until, ang, unload?, end? }   (start..until: the spin-up cast bar)   (no e.gat = idle or moving)
//  - Firing, every everyTicks each visible enemy within range (but not nearer than minRange: weak up close) and within
//    coneDeg of its facing takes damage. Shots show as 'gatlingShot' casts, 'gatlingStop' when it stops.
//  - Facing: it turns to the nearest enemy in range (re-picked every turnTicks).
//  - Unload (the ability row, sim/special_cast.js): a cast asked for at a spot stops the gun, faces the spot and fires
//    unload.ticks there (after the spin up, unless it is already firing) at unload.damageMul damage, enemies or not.
//    Cooldown unload.cooldownTicks (e.gatReadyAt). On auto it unloads when a burst starts with unload.autoMin or more
//    enemies in the cone. Any move order ends it.
//  - It never fights hand to hand and takes no order against a structure.
// Rules only: no DOM, no randomness.
import { alive, dist } from './util.js';
import { dirIndex } from './geometry.js';
import { castWanted, autoOn } from './special_cast.js';
export function createGatling({ state, units, vision, hit, moveTo, hostile = () => false, allowed = () => true, reveal = () => {}, paths = {} }) {
  const rulesOf = e => units.types[e?.type]?.gatling || null;
  const foes = (e, R, range) => Object.values(state.entities).filter(t => alive(t) && !t.jailed && t.owner && t.owner !== e.owner && t.type !== 'civilian' && !t.animal && !t.cop
    && t.place === e.place && !t.garrison && !t.aboard && hostile(e, t) && allowed(e, t) && vision.canSee(e.owner, t) && dist(e, t) <= range);
  const nearest = (e, list) => list.reduce((b, t) => !b || dist(e, t) < dist(e, b) || (dist(e, t) === dist(e, b) && t.id < b.id) ? t : b, null);
  function stopFire(e) { if (e.gat?.firing != null) state.casts.push({ kind: 'gatlingStop', a: e.id, x: e.x, z: e.z, place: e.place, dir: e.dir || 0 }); delete e.gat; }
  function face(e, ang) { e.gat.ang = ang; e.dir = dirIndex(Math.cos(ang), Math.sin(ang)); }
  const coneOf = (e, R, list) => { const half = (R.coneDeg ?? 30) * Math.PI / 360, cx = Math.cos(e.gat.ang), cz = Math.sin(e.gat.ang);
    return list.filter(t => { const d = dist(e, t); return d >= (R.minRange ?? 0) && ((t.x - e.x) * cx + (t.z - e.z) * cz) / (d || 1) >= Math.cos(half); }); };
  const aimNearest = (e, R, inRange) => { const t = nearest(e, inRange.filter(t => dist(e, t) >= (R.minRange ?? 0))) || nearest(e, inRange); if (t) face(e, Math.atan2(t.z - e.z, t.x - e.x)); };
  function startFire(e, R, now) {
    const G = e.gat, U = R.unload || {};
    G.state = 'fire'; G.firing = now; delete G.until;
    G.end = now + (G.unload ? U.ticks ?? 100 : R.burstTicks ?? 100);
    reveal(e, true);
  }
  // true: this unit is a Gatling crew and its tick is done
  function step(e, unit) {
    const R = unit?.gatling;
    if (!R) return false;
    const now = state.tick ?? 0, U = R.unload || {};
    delete e.swing; delete e.attackTarget;
    if (e.gat && e.gat.state !== 'spin' && e.gat.state !== 'fire') delete e.gat;   // an old save's setup/pack state
    const req = castWanted(state, e);
    if (req && Number.isFinite(req.x)) {   // Unload: stay here, face the spot and empty the gun at it
      delete e.castReq; delete paths[e.id];
      if ((e.gatReadyAt ?? 0) <= now) {
        e.order = { kind: 'stop' };
        const firing = e.gat?.state === 'fire';
        if (!e.gat) e.gat = { state: 'spin', start: now, until: now + (R.spinTicks ?? 20) };
        e.gat.unload = true; face(e, Math.atan2(req.z - e.z, req.x - e.x));
        e.gatReadyAt = now + (U.cooldownTicks ?? 400);
        if (firing) { e.gat.end = now + (U.ticks ?? 100); }
      }
    }
    const order = e.order || { kind: 'stop' };
    // where it wants to go, if anywhere
    let goal = null;
    if (order.kind === 'attack') { const t = state.entities[order.target]; e.order = t && alive(t) ? { kind: 'attackmove', x: t.x, z: t.z } : { kind: 'stop' }; return step(e, unit); }
    if ((order.kind === 'move' || order.kind === 'station') && !order.arrived && Number.isFinite(order.x)) goal = [order.x, order.z];
    else if (order.kind === 'attackmove' && Number.isFinite(order.x)) { if (!foes(e, R, R.deployRange ?? R.range * 0.85).length) goal = [order.x, order.z]; }
    else if (order.kind === 'follow') { const h = Object.values(state.entities).find(u => u.type === 'hero' && u.owner === e.owner && u.place === e.place); if (h && dist(e, h) > (R.followGap ?? 5)) goal = [h.x, h.z]; }
    if (goal) {
      stopFire(e);
      if (!moveTo(e, unit, goal[0], goal[1], false)) { e.anim = 'idle'; if (order.kind === 'attackmove') e.order = { kind: 'stop' }; else if (order.kind !== 'follow') order.arrived = true; }
      return true;
    }
    // standing: spin up, fire a burst, stop
    delete paths[e.id];
    const inRange = foes(e, R, R.range);
    if (!e.gat) {
      if (!inRange.length) { e.anim = 'idle'; return true; }
      e.gat = { state: 'spin', start: now, until: now + (R.spinTicks ?? 20) }; aimNearest(e, R, inRange);
    }
    const G = e.gat;
    if (!G.unload && inRange.length && (G.ang == null || now % (R.turnTicks ?? 10) === 0)) aimNearest(e, R, inRange);
    if (G.ang == null) face(e, 0);
    if (G.state === 'spin') {
      if (!G.unload && !inRange.length) { delete e.gat; e.anim = 'idle'; return true; }
      e.anim = 'attack';   // the barrels spin, no shots yet
      if (now < G.until) return true;
      if (!G.unload && autoOn(e) && (e.gatReadyAt ?? 0) <= now && coneOf(e, R, inRange).length >= (U.autoMin ?? 3)) { G.unload = true; e.gatReadyAt = now + (U.cooldownTicks ?? 400); }
      startFire(e, R, now);
    }
    if (now >= G.end) { stopFire(e); e.anim = 'idle'; return true; }   // the burst is over: spin up again next time
    const inCone = coneOf(e, R, inRange);
    if (!G.unload && !inCone.length) { stopFire(e); e.anim = 'idle'; return true; }
    e.anim = 'attack';
    if ((now - G.firing) % 2 === 0) state.casts.push({ kind: 'gatlingShot', a: e.id, x: e.x, z: e.z, place: e.place, dir: e.dir || 0 });
    if ((now - G.firing) % (R.everyTicks ?? 4) === 0) { const dmg = Math.round((R.damage ?? 0) * (G.unload ? U.damageMul ?? 1 : 1)); for (const t of inCone) hit(e, t, dmg, false, 'bullet'); }
    return true;
  }
  return { step, rulesOf };
}
