import { isRallyParticipant } from './deployment_rally.js';
import { deploymentFeedback } from './deployment_feedback.js';
import { sectorPatrolRoute, rivalHQZones, nearRivalHQ } from './sector_patrol.js';
// Shared saved local duties. Manual orders temporarily override these tasks.
export function createAssignments({ state, deployment, doors, clearCombat, inCombat = () => false }) {
  const sector = e => state.deployment.clans[e.owner]?.sectors[e.deployment?.group];
  const eligible = e => e && !e.dead && !e.downed && !e.jailed && !e.guard && e.type !== 'hero' && sector(e) && !e.deployment.transfer;
  const say = (h, text) => { state.clans[h.owner].notice = { tick: state.tick, text }; };
  function manual(e) { if (eligible(e)) {delete e.deployment.campingEscape;e.deployment.duty = { manual: true, status: 'Manual' };} }
  function resume(e) {
    if (!eligible(e)) return;
    clearCombat(e); delete e.holdFire; delete e.smokePassive;
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
    const result = (ok, text) => deploymentFeedback(state, h, c, ok, text);
    if(c.action==='release'&&Array.isArray(c.units)) {
      for(const id of new Set(c.units)){const e=state.entities[id];if(e?.owner===h.owner&&eligible(e)&&e.deployment.duty?.manual)e.deployment.duty.returnWhenDone=true;}
      return;
    }
    if (c.action === 'return') {
      if (!Array.isArray(c.units)) return;
      for (const id of new Set(c.units)) { const e = state.entities[id]; if (e?.owner === h.owner && !isRallyParticipant(state, e) && (!c.selectionChange || e.deployment?.duty?.manual)) resume(e); }
      if (!c.selectionChange) result(true, 'RETURNING TO DUTY — selected crew resuming their assignments');
      return;
    }
    if (c.action !== 'assignment') return;
    const old = state.deployment.clans[h.owner]?.sectors[c.sector], ninja = state.clans[h.owner].kind === 'ninja';
    if (!old || !(ninja ? ['watch', 'ambush'] : ['patrol', 'guard']).includes(c.task)) return result(false, 'Choose a valid sector duty');
    const objective = validPoint(h, c.sector, c.objective || old.objective), fallback = validPoint(h, c.sector, c.fallback || old.fallback);
    if (!objective || !fallback) return result(false, 'Objective and fallback must be inside that sector');
    const route = c.route == null ? [] : Array.isArray(c.route) && c.route.length <= 8 ? c.route.map(p => validPoint(h, c.sector, p)) : null;
    if (!route || route.some(p => !p)) return result(false, 'Route points must be inside that sector (maximum eight)');
    const business = c.task === 'guard' && state.businesses[c.business];
    if (c.task === 'guard' && (!business?.room || business.owner !== h.owner || deployment.sectorAt(...business.ring) !== c.sector)) return result(false, 'Choose your own business in this sector');
    delete old.operation;
    delete old.recovery; delete old.engagement;
    delete old.ambushNext; delete old.patrolWaypoint;
    delete old.patrolPath;delete old.patrolPauseUntil;
    Object.assign(old, { task: c.task, objective: business ? { x: business.ring[0], z: business.ring[1] } : objective, fallback, route, business: business?.id || null });
    for (const e of deployment.members(h.owner, c.sector)) if (!e.deployment.transfer && !isRallyParticipant(state, e)) resume(e);
    const name = state.deployment.sectors.find(s => s.id === c.sector)?.name || c.sector;
    result(true, `${c.task.replaceAll('_', ' ').toUpperCase()} ACTIVE — ${name} crew following this duty`);
  }
  function step(e, unit) {
    if (!state.deployment.restrictionsEnabled || !eligible(e)) return false;
    const task = sector(e); let duty = e.deployment.duty ||= { manual: false, status: 'Returning' };
    if (duty.manual) {
      const o=e.order, target=o?.kind==='attack'&&state.entities[o.target];
      const busy=e.swing||e.execute||(o?.kind==='move'&&!o.arrived)||o?.kind==='attackmove'||(target&&!target.dead&&!target.downed&&!target.jailed);
      if(!duty.returnWhenDone||busy)return false;
      resume(e);
      duty=e.deployment.duty;
    }
    if (e.swing || e.execute || inCombat(e)) { duty.status = 'Defending'; return false; }
    let target = task.objective, place = 'street', unavailable = false;
    if (task.task === 'guard') {
      const b = state.businesses[task.business], door = doors.find(d => d.to && !d.ninja && d.place === b?.room);
      if (!door || b.owner !== e.owner) { unavailable = true; target = task.fallback; }
      else { target = door.to; place = door.place; }
    }
    const grid = deployment.navFor({ ...e, place: 'street' });
    const route = task.task === 'patrol' ? sectorPatrolRoute(state,deployment,e,task) : task.route?.length ? task.route : null;
    if (route && task.task !== 'guard') target = route[(duty.waypoint || 0) % route.length];
    if (place === 'street' && e.place === 'street' && task.task === 'patrol') {
      if(state.tick<(duty.pauseUntil||0)){e.anim='idle';duty.status='Patrolling';return true;}
      const reached=Math.hypot(e.x-target.x,e.z-target.z)<.9;
      if(reached&&!duty.nextWaypoint){duty.pauseUntil=state.tick+30;duty.nextWaypoint=true;e.anim='idle';duty.status='Patrolling';return true;}
      if (!e.order?.duty || Math.hypot(e.x - target.x, e.z - target.z) < .9) {
        duty.waypoint = ((duty.waypoint || 0) + 1) % route.length; target = route[duty.waypoint];
        e.order = { kind: 'attackmove', ...target, place, duty: true, patrol:true };delete duty.nextWaypoint;
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
  function avoidCamping(e,unit) {
    if(!state.deployment.restrictionsEnabled||!eligible(e)||e.deployment.duty?.manual||isRallyParticipant(state,e)||e.place!=='street')return false;
    const warning=state.hqCamping?.visits.find(v=>v.clan===e.owner&&v.inside&&Math.hypot(e.x-v.x,e.z-v.z)<=v.radius+1);
    let escape=e.deployment.campingEscape;
    if(!escape&&!warning)return false;
    if(!escape){
      const grid=deployment.navFor(e),candidates=[];
      for(const radius of [warning.radius+7,warning.radius+15,warning.radius+25])for(let k=0;k<12;k++){
        const p=grid?.nearestFree(warning.x+Math.cos(k*Math.PI/6)*radius,warning.z+Math.sin(k*Math.PI/6)*radius);
        if(!p||nearRivalHQ(state,e.owner,{x:p[0],z:p[1]}))continue;
        const path=grid.findPath(e.x,e.z,...p),end=path?.at(-1);
        if(end&&Math.hypot(end[0]-p[0],end[1]-p[1])<1)candidates.push({x:p[0],z:p[1],place:'street'});
      }
      const point=candidates.sort((a,b)=>Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z))[0];
      if(!point)return false;
      escape=e.deployment.campingEscape={point,until:state.tick+1500};clearCombat(e);e.order={kind:'stop'};
    }
    if(state.tick>=escape.until&&!nearRivalHQ(state,e.owner,sector(e).objective)){delete e.deployment.campingEscape;return false;}
    const result=deployment.localTravel(e,unit,escape.point);e.deployment.duty={manual:false,status:'Avoiding HQ camping'};
    if(result!=='moving')e.anim='idle';return true;
  }
  return { command, step, manual, resume, validPoint, avoidCamping };
}
