import { isRallyParticipant } from './deployment_rally.js';
// Shared saved local duties. Manual orders temporarily override these tasks.
export function createAssignments({ state, deployment, doors, clearCombat, inCombat = () => false }) {
  const sector = e => state.deployment.clans[e.owner]?.sectors[e.deployment?.group];
  const eligible = e => e && !e.dead && !e.downed && !e.jailed && !e.guard && e.type !== 'hero' && sector(e) && !e.deployment.transfer;
  const say = (h, text) => { state.clans[h.owner].notice = { tick: state.tick, text }; };
  function manual(e) { if (eligible(e)) e.deployment.duty = { manual: true, status: 'Manual' }; }
  function resume(e) {
    if (!eligible(e)) return;
    clearCombat(e); delete e.holdFire; delete e.smokePassive;
    if (e.distracted?.source) { delete e.distracted; e.diversionImmuneUntil = state.tick + 200; }
    delete e.diversionReturn; delete e.dancingUntil;
    e.deployment.duty = { manual: false, status: 'Returning' }; e.order = { kind: 'stop' };
  }
  function validPoint(h, id, p) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z) || deployment.sectorAt(p.x, p.z) !== id) return null;
    const grid = deployment.navFor({ owner: h.owner, type: 'thug', place: 'street', deployment: { group: id } });
    const point = grid?.nearestFree(p.x, p.z);
    return point ? { x: point[0], z: point[1] } : null;
  }
  function command(h, c) {
    if (h.type !== 'hero' || !state.deployment.restrictionsEnabled) return;
    if (c.action === 'return') {
      if (!Array.isArray(c.units)) return;
      for (const id of new Set(c.units)) { const e = state.entities[id]; if (e?.owner === h.owner && !isRallyParticipant(state, e) && (!c.selectionChange || e.deployment?.duty?.manual)) resume(e); }
      return;
    }
    if (c.action !== 'assignment') return;
    const old = state.deployment.clans[h.owner]?.sectors[c.sector], ninja = state.clans[h.owner].kind === 'ninja';
    if (!old || !(ninja ? ['watch', 'ambush', 'extraction'] : ['patrol', 'guard']).includes(c.task)) return;
    const objective = validPoint(h, c.sector, c.objective || old.objective), fallback = validPoint(h, c.sector, c.fallback || old.fallback);
    if (!objective || !fallback) return say(h, 'Objective and fallback must be inside that sector');
    const route = c.route == null ? [] : Array.isArray(c.route) && c.route.length <= 8 ? c.route.map(p => validPoint(h, c.sector, p)) : null;
    if (!route || route.some(p => !p)) return say(h, 'Route points must be inside that sector (maximum eight)');
    const business = c.task === 'guard' && state.businesses[c.business];
    if (c.task === 'guard' && (!business?.room || business.owner !== h.owner || deployment.sectorAt(...business.ring) !== c.sector)) return say(h, 'Choose your own business in this sector');
    delete old.operation;
    delete old.recovery; delete old.engagement;
    delete old.ambushNext; delete old.patrolWaypoint;
    Object.assign(old, { task: c.task, objective: business ? { x: business.ring[0], z: business.ring[1] } : objective, fallback, route, business: business?.id || null });
    for (const e of deployment.members(h.owner, c.sector)) if (!e.deployment.transfer && !isRallyParticipant(state, e)) resume(e);
    say(h, 'Sector assignment saved');
  }
  function step(e, unit) {
    if (!state.deployment.restrictionsEnabled || !eligible(e)) return false;
    const task = sector(e), duty = e.deployment.duty ||= { manual: false, status: 'Returning' };
    if (duty.manual) return false;
    if (e.swing || e.execute || inCombat(e)) { duty.status = 'Defending'; return false; }
    let target = task.objective, place = 'street', unavailable = false;
    if (task.task === 'guard') {
      const b = state.businesses[task.business], door = doors.find(d => d.to && !d.ninja && d.place === b?.room);
      if (!door || b.owner !== e.owner) { unavailable = true; target = task.fallback; }
      else { target = door.to; place = door.place; }
    }
    const grid = deployment.navFor({ ...e, place: 'street' });
    const route = task.route?.length ? task.route : task.task === 'patrol' ? [task.objective, ...[[6,0],[0,6],[-6,0],[0,-6]].map(([x,z]) => {
      const p = grid?.nearestFree(task.objective.x + x, task.objective.z + z); return p ? { x: p[0], z: p[1] } : task.objective;
    })] : null;
    if (route && task.task !== 'guard') target = route[(duty.waypoint || 0) % route.length];
    if (place === 'street' && e.place === 'street' && task.task === 'patrol') {
      if (!e.order?.duty || Math.hypot(e.x - target.x, e.z - target.z) < .9) {
        duty.waypoint = ((duty.waypoint || 0) + 1) % route.length; target = route[duty.waypoint];
        e.order = { kind: 'attackmove', ...target, place, duty: true };
      }
      duty.status = 'Patrolling'; return false;
    }
    if ((place !== e.place || Math.hypot(e.x - target.x, e.z - target.z) > 1.2) && !(place !== 'street' && e.place === place && duty.guardRoom === place)) {
      const result = deployment.localTravel(e, unit, { ...target, place });
      duty.status = result === 'blocked' ? 'Assignment blocked' : 'Moving';
      if (result !== 'arrived') { if (result === 'blocked') e.anim = 'idle'; return true; }
    }
    if (task.task === 'guard' && place !== 'street') {
      if (duty.guardRoom !== place) { e.order = { kind: 'station', x: e.x, z: e.z, garrison: true, duty: true }; duty.guardRoom = place; }
      duty.status = 'Guarding';
    } else {
      if (!e.order?.duty || e.order.kind === 'stop') e.order = { kind: 'move', x: e.x, z: e.z, arrived: true, duty: true };
      duty.status = unavailable ? 'Business unavailable' : task.task === 'watch' ? 'Watching' : task.task === 'extraction' ? 'Securing' : task.task === 'diversion' ? 'Ready' : 'Holding';
      if (route && state.tick >= (duty.nextAt || 0)) { duty.waypoint = ((duty.waypoint || 0) + 1) % route.length; duty.nextAt = state.tick + 40; }
    }
    return false;
  }
  return { command, step, manual, resume, validPoint };
}
