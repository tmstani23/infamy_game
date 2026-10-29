import { withdrawalReason } from './sector_recovery.js';
import { deploymentFeedback } from './deployment_feedback.js';
import { sectorPatrolRoute } from './sector_patrol.js';

export function createAmbush({ state, deployment, assignments, rally, vision, sees, intelligence, recovery, clearCombat, attackStep, executeStep, finishTarget }) {
  const alive = e => e && !e.dead && !e.downed && !e.jailed;
  const config = clan => state.deployment.clans[clan];
  const crew = (clan, id) => deployment.members(clan, id).filter(e => alive(e) && !e.deployment.transfer && !e.deployment.duty?.manual && !rally.participating(e));
  const enemy = (clan, e) => alive(e) && e.owner !== clan && state.clans[e.owner] && !e.guard && !e.cop && !e.wild && e.type !== 'civilian' && !e.hidden;
  const observed = (team, e) => e?.place === 'street' && team.some(u => u.place === e.place && Math.hypot(u.x - e.x, u.z - e.z) <= vision.range && sees(u, e));
  function withdraw(clan, id, reason) {
    const c = config(clan), op = c.sectors[id].operation;
    if (op && c.hunt?.committedSector === id) delete c.hunt;
    recovery.request(clan, id, reason);
  }
  function command(h, c) {
    if (h.type !== 'hero' || state.clans[h.owner]?.kind !== 'ninja') return;
    const own = config(h.owner), task = own?.sectors[c.sector]; if (!own) return;
    const result = (ok,text) => deploymentFeedback(state,h,c,ok,text);
    if (c.action === 'armAmbush') {
      if (!c.target) { if (task) { task.ambushNext = true; result(true,'AMBUSH ARMED — waiting for a detected enemy in this sector'); } else result(false,'Choose a sector or a known target'); return; }
      const t = state.entities[c.target], job = state.contracts?.active?.[h.owner];
      const known = intelligence.known(h.owner, c.target) || (enemy(h.owner, t) && vision.canSee(h.owner, t)) || (job?.kind === 'boss' && job.hero === c.target);
      if (!known) return result(false,'That target has not been spotted');
      // A committed attack must be explicitly withdrawn before replacing it.
      if (own.hunt?.committedSector) withdraw(h.owner, own.hunt.committedSector, 'Target order replaced');
      own.hunt = { target: c.target, armedAt: state.tick };
      result(true,'HUNT ARMED — a local sector group will attack when it spots this target');
    } else if (c.action === 'cancelAmbush') {
      if (own.hunt?.committedSector) withdraw(h.owner, own.hunt.committedSector, 'Ambush cancelled');
      delete own.hunt; if (task) task.ambushNext = false;
      result(true,'HUNT CANCELLED — sector crew resuming their duties');
    } else if (c.action === 'retreat' && task) { withdraw(h.owner, c.sector, 'Retreat ordered'); result(true,'RETREAT ACCEPTED — sector crew withdrawing'); }
    else if (c.action === 'return' && !c.selectionChange && Array.isArray(c.units)) {
      for (const id of new Set(c.units.map(unit => state.entities[unit]?.deployment?.group))) if (own.sectors[id]?.operation?.kind === 'ambush') withdraw(h.owner, id, 'Return to assignment');
    }
  }
  function begin(clan, id, target) {
    const own = config(clan), task = own.sectors[id], team = crew(clan, id);
    task.operation = { kind: 'ambush', state: 'Attacking', target: target.id, attackingAt: state.tick, units: team.map(e => e.id) };
    task.ambushNext = false;
    if (own.hunt?.target === target.id) own.hunt.committedSector = id;
    for (const e of team) { clearCombat(e); delete e.holdFire; delete e.smokePassive; e.order = { kind: 'stop' }; }
  }
  function tick() {
    for (const [clan, own] of Object.entries(state.deployment.clans)) {
      if (state.clans[clan]?.kind !== 'ninja') continue;
      if (own.hunt?.committedSector && own.sectors[own.hunt.committedSector]?.operation?.target !== own.hunt.target) delete own.hunt;
      const claimed = new Set(Object.values(own.sectors).filter(s => s.operation?.kind === 'ambush').map(s => s.operation.target));
      for (const [id, task] of Object.entries(own.sectors)) {
        const team = crew(clan, id), op = task.operation;
        if (op?.kind === 'ambush') {
          op.units = op.units.filter(unit => { const e = state.entities[unit]; return !e || !alive(e) || (e.deployment.group === id && !e.deployment.transfer && !rally.participating(e) && !e.deployment.duty?.manual); });
          const active = team.filter(e => op.units.includes(e.id));
          if (!active.length) { delete task.operation; if (own.hunt?.committedSector === id) delete own.hunt; continue; }
          const reason = withdrawalReason(state.entities, op.units), t = state.entities[op.target];
          if (reason) { withdraw(clan, id, reason); continue; }
          if (!t || t.dead || t.jailed) { withdraw(clan, id, 'Target defeated or gone'); continue; }
          if (t.place !== 'street' || deployment.sectorAt(t.x, t.z) !== id || (!t.downed && !observed(active, t))) { withdraw(clan, id, 'Target escaped'); continue; }
          if (state.tick - op.attackingAt > 45 * 20) { withdraw(clan, id, 'Attack timed out'); continue; }
          if (t.downed && !active.some(e => e.execute)) finishTarget(clan, t.id, active.map(e => e.id));
          continue;
        }
        if (!team.length || task.recovery) continue;
        const target = own.hunt && !own.hunt.committedSector && state.entities[own.hunt.target];
        if (enemy(clan, target) && deployment.sectorAt(target.x, target.z) === id && observed(team, target)) { begin(clan, id, target); claimed.add(target.id); continue; }
        // A selected identity waits indefinitely; never substitute another victim.
        if (own.hunt && !own.hunt.committedSector) continue;
        if (task.task !== 'ambush' && !task.ambushNext) continue;
        const next = Object.values(state.entities).filter(t => enemy(clan, t) && !claimed.has(t.id) && t.id !== own.hunt?.target && deployment.sectorAt(t.x, t.z) === id && observed(team, t))
          .sort((a,b)=>Math.min(...team.map(e=>Math.hypot(e.x-a.x,e.z-a.z)))-Math.min(...team.map(e=>Math.hypot(e.x-b.x,e.z-b.z))))[0];
        if (next) { begin(clan, id, next); claimed.add(next.id); }
      }
    }
  }
  function patrol(e, unit, task) {
    const team = crew(e.owner, e.deployment.group).sort((a, b) => Number(a.id) - Number(b.id));
    const leader = team[0], grid = deployment.navFor({ ...e, place: 'street' });
    if (!leader || !grid) return false;
    const route=sectorPatrolRoute(state,deployment,e,task),k=task.patrolWaypoint||0,p=route[k%route.length];
    const point = grid.nearestFree(p.x,p.z);
    if (!point) return false;
    if (e.id === leader.id && leader.place === 'street' && Math.hypot(leader.x - point[0], leader.z - point[1]) < 1 && state.tick>=(task.patrolPauseUntil||0)) {task.patrolWaypoint = (k + 1) % route.length;task.patrolPauseUntil=state.tick+30;}
    const slot = team.findIndex(u => u.id === e.id), angle = slot * 2.4;
    const goal = e.id === leader.id ? point : grid.nearestFree(leader.x + Math.cos(angle) * 1.2, leader.z + Math.sin(angle) * 1.2);
    if (goal) {
      if(e.id===leader.id&&state.tick<(task.patrolPauseUntil||0)){e.anim='idle';return true;}
      const result = deployment.localTravel(e, unit, { x: goal[0], z: goal[1], place: 'street',walk:true });
      if (result !== 'moving') e.anim = 'idle';
    }
    const hunt = config(e.owner).hunt, remembered = hunt && intelligence.targets(e.owner).find(t => t.id === hunt.target);
    const label = remembered ? `${state.clans[remembered.owner]?.name || 'Rival'} ${remembered.type === 'hero' ? 'boss' : remembered.type.replaceAll('_', ' ')}` : 'selected target';
    e.deployment.duty = { manual: false, status: hunt ? `Hunting: ${label}` : 'Patrolling' };
    return true;
  }
  function step(e, unit) {
    const task = config(e.owner)?.sectors[e.deployment?.group];
    if (!task || !crew(e.owner, e.deployment.group).some(u => u.id === e.id) || task.recovery) return false;
    const op = task.operation;
    if (op?.kind === 'ambush' && op.units.includes(e.id)) {
      e.deployment.duty = { manual: false, status: 'Attacking' };
      if (e.execute) { executeStep(e, unit); return true; }
      const t = state.entities[op.target];
      if (alive(t) && t.place === e.place && sees(e, t) && deployment.canActAt(e, t.x, t.z, t.place)) attackStep(e, unit, t); else { clearCombat(e); e.anim = 'idle'; }
      return true;
    }
    return task.task === 'ambush' || task.ambushNext || config(e.owner).hunt ? patrol(e, unit, task) : false;
  }
  function manual(e) {
    const op = config(e.owner)?.sectors[e.deployment?.group]?.operation;
    if (op?.kind === 'ambush') op.units = op.units.filter(id => id !== e.id);
  }
  return { command, tick, step, manual };
}
