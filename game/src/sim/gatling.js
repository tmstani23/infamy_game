// Kuroda Gatling gun crew (war checkpoint 7-4, Tim 2026-11-12): the Kuroda's second special, trained at the foundry.
// One unit: the gun with its two crew (units.json gatling_crew.gatling). Slow and heavy.
//  - It cannot fire on the move. Standing still (stopped, arrived, or an enemy within deployRange on an attack-move) it
//    sets up for setupTicks; any order that moves it packs it up for packTicks first.
//    e.gat = { state: 'setting' | 'set' | 'packing', until, ang, aim?, firing? }   (no e.gat = packed, free to move)
//  - Set up, it fires a cone: every everyTicks each visible enemy within range (but not nearer than minRange: weak up
//    close) and within coneDeg of its facing takes damage. Shots show as 'gatlingShot' casts, 'gatlingStop' when it stops.
//  - Facing: on its own it turns to the nearest enemy in range (re-picked every turnTicks). "Hold aim" (the ability row,
//    sim/special_cast.js: a cast asked for at a spot) fixes the facing at that spot until the gun packs up.
//  - It never fights hand to hand and takes no order against a structure.
// Rules only: no DOM, no randomness.
import { alive, dist } from './util.js';
import { dirIndex } from './geometry.js';
import { castWanted } from './special_cast.js';
export function createGatling({ state, units, vision, hit, moveTo, hostile = () => false, allowed = () => true, reveal = () => {}, paths = {} }) {
  const rulesOf = e => units.types[e?.type]?.gatling || null;
  const foes = (e, R, range) => Object.values(state.entities).filter(t => alive(t) && !t.jailed && t.owner && t.owner !== e.owner && t.type !== 'civilian' && !t.animal && !t.cop
    && t.place === e.place && !t.garrison && !t.aboard && hostile(e, t) && allowed(e, t) && vision.canSee(e.owner, t) && dist(e, t) <= range);
  const nearest = (e, list) => list.reduce((b, t) => !b || dist(e, t) < dist(e, b) || (dist(e, t) === dist(e, b) && t.id < b.id) ? t : b, null);
  function stopFire(e) { if (e.gat?.firing) { delete e.gat.firing; state.casts.push({ kind: 'gatlingStop', a: e.id, x: e.x, z: e.z, place: e.place, dir: e.dir || 0 }); } }
  function face(e, ang) { e.gat.ang = ang; e.dir = dirIndex(Math.cos(ang), Math.sin(ang)); }
  // true: this unit is a Gatling crew and its tick is done
  function step(e, unit) {
    const R = unit?.gatling;
    if (!R) return false;
    const now = state.tick ?? 0, o = e.order || { kind: 'stop' };
    delete e.swing; delete e.attackTarget;
    const req = castWanted(state, e);
    if (req && Number.isFinite(req.x)) {   // Hold aim: stay here, face the spot
      const ang = Math.atan2(req.z - e.z, req.x - e.x);
      delete e.castReq; delete paths[e.id];
      e.order = { kind: 'stop' };
      if (!e.gat || e.gat.state === 'packing') e.gat = { state: 'setting', until: now + (R.setupTicks ?? 60) };
      e.gat.aim = true; face(e, ang);
    }
    const order = e.order || o;
    // where it wants to go, if anywhere
    let goal = null;
    if (order.kind === 'attack') { const t = state.entities[order.target]; e.order = t && alive(t) ? { kind: 'attackmove', x: t.x, z: t.z } : { kind: 'stop' }; return step(e, unit); }
    if ((order.kind === 'move' || order.kind === 'station') && !order.arrived && Number.isFinite(order.x)) goal = [order.x, order.z];
    else if (order.kind === 'attackmove' && Number.isFinite(order.x)) { if (!foes(e, R, R.deployRange ?? R.range * 0.85).length) goal = [order.x, order.z]; }
    else if (order.kind === 'follow') { const h = Object.values(state.entities).find(u => u.type === 'hero' && u.owner === e.owner && u.place === e.place); if (h && dist(e, h) > (R.followGap ?? 5)) goal = [h.x, h.z]; }
    if (goal) {
      if (e.gat) {   // pack up first
        stopFire(e);
        if (e.gat.state !== 'packing') e.gat = { state: 'packing', until: now + (R.packTicks ?? 30), ang: e.gat.ang };
        if (now < e.gat.until) { e.anim = 'idle'; return true; }
        delete e.gat;
      }
      if (!moveTo(e, unit, goal[0], goal[1], false)) { e.anim = 'idle'; if (order.kind === 'attackmove') e.order = { kind: 'stop' }; else if (order.kind !== 'follow') order.arrived = true; }
      return true;
    }
    // standing: set up, then fire
    delete paths[e.id];
    if (!e.gat || e.gat.state === 'packing') e.gat = { state: 'setting', until: now + (R.setupTicks ?? 60), ...(e.gat?.ang != null ? { ang: e.gat.ang } : {}) };
    const G = e.gat;
    if (G.state === 'setting') { e.anim = 'idle'; if (now < G.until) return true; G.state = 'set'; delete G.until; }
    const inRange = foes(e, R, R.range);
    if (!G.aim && inRange.length && (G.ang == null || now % (R.turnTicks ?? 10) === 0 || !G.firing)) { const t = nearest(e, inRange.filter(t => dist(e, t) >= (R.minRange ?? 0))) || nearest(e, inRange); face(e, Math.atan2(t.z - e.z, t.x - e.x)); }
    if (G.ang == null) face(e, 0);
    const half = (R.coneDeg ?? 30) * Math.PI / 360, cx = Math.cos(G.ang), cz = Math.sin(G.ang);
    const inCone = inRange.filter(t => { const d = dist(e, t); return d >= (R.minRange ?? 0) && ((t.x - e.x) * cx + (t.z - e.z) * cz) / (d || 1) >= Math.cos(half); });
    if (!inCone.length) { stopFire(e); e.anim = 'idle'; return true; }
    if (!G.firing) { G.firing = now; reveal(e, true); }
    e.anim = 'attack';
    if ((now - G.firing) % 2 === 0) state.casts.push({ kind: 'gatlingShot', a: e.id, x: e.x, z: e.z, place: e.place, dir: e.dir || 0 });
    if ((now - G.firing) % (R.everyTicks ?? 4) === 0) for (const t of inCone) hit(e, t, R.damage ?? 0, false, 'bullet');
    return true;
  }
  return { step, rulesOf };
}
