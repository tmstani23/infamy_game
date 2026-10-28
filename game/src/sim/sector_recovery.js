// Shared local group survival. All positions and decisions are authoritative;
// candidate scoring uses only enemies the clan can actually see.
export const RECOVERY = { health: .7, quietTicks: 120, replanTicks: 20, gatherRadius: 2, dangerRadius: 4 };
import { nearRivalHQ } from './sector_patrol.js';
export function withdrawalReason(entities, ids) {
  const lost = ids.filter(id => !entities[id] || entities[id].dead || entities[id].downed || entities[id].jailed).length;
  const standing = ids.map(id => entities[id]).filter(e => e && !e.dead && !e.downed && !e.jailed);
  if (lost >= 2) return 'Two crew down';
  if (standing.some(e => e.hp <= e.maxHp / 3) && (lost || ids.length === 1)) return 'Crew in danger';
  return null;
}

export function createSectorRecovery({ state, deployment, rally, vision, clearCombat, inCombat = () => false, attackStep = () => {}, hostile = (a, b) => a.owner !== b.owner && !b.cop && !b.wild }) {
  const available = e => e && !e.dead && !e.downed && !e.jailed;
  const automated = e => !!e.deployment && !e.deployment.transfer && !e.deployment.duty?.manual && !rally.participating(e);
  const roster = (clan, id) => deployment.members(clan, id).filter(automated);
  const members = (clan, id) => roster(clan, id).filter(available);
  const location = e => {
    if (e.place === 'street') return { x: e.x, z: e.z };
    const b = Object.values(state.businesses).find(b => b.room === e.place);
    return b?.ring ? { x: b.ring[0], z: b.ring[1] } : null;
  };
  const threats = clan => Object.values(state.entities).filter(e => available(e) && e.owner && e.owner !== clan
    && e.type !== 'civilian' && !e.hidden && vision.canSee(clan, e)
    && deployment.members(clan).some(u => available(u) && hostile(u, e)));
  function request(clan, id, reason = 'Retreat ordered') {
    const task = state.deployment.clans[clan]?.sectors[id];
    if (!task || !members(clan, id).length) return false;
    delete task.operation; delete task.engagement;
    task.recovery ||= { state: 'Withdrawing', startedAt: state.tick, replanAt: state.tick };
    task.recovery.reason = reason;
    for (const e of members(clan, id)) {
      clearCombat(e); delete e.holdFire; delete e.smokePassive;
      e.order = { kind: 'stop' }; e.deployment.duty = { manual: false, status: 'Withdrawing' };
    }
    return true;
  }
  function pickPoint(clan, id, team, enemies) {
    const task = state.deployment.clans[clan].sectors[id], anchor = state.deployment.sectors.find(s => s.id === id).anchor;
    const grid = deployment.navFor({ ...team[0], place: 'street', deployment: { group: id } });
    if (!grid) return null;
    const positions = team.map(location).filter(Boolean);
    if (!positions.length) return null;
    const center = { x: positions.reduce((n, p) => n + p.x, 0) / positions.length, z: positions.reduce((n, p) => n + p.z, 0) / positions.length };
    const friends = Object.values(state.entities).filter(e => e.owner === clan && available(e)).map(location).filter(Boolean);
    const sites = Object.values(state.businesses).filter(b => b.owner === clan && b.ring).map(b => ({ x: b.ring[0], z: b.ring[1] }));
    const candidates = [anchor, task.objective, ...sites, ...friends];
    for (const radius of [4, 8, 12, 20]) for (let k = 0; k < 8; k++) candidates.push({ x: center.x + Math.cos(k * Math.PI / 4) * radius, z: center.z + Math.sin(k * Math.PI / 4) * radius });
    const known = enemies.map(location).filter(Boolean);
    let best = null, bestScore = -Infinity;
    for (const p of candidates) {
      const q = p && grid.nearestFree(p.x, p.z);
      if (!q || deployment.sectorAt(...q) !== id || nearRivalHQ(state,clan,{x:q[0],z:q[1]})) continue;
      const reachable = positions.every(from => {
        const path = grid.findPath(from.x, from.z, ...q), end = path?.at(-1);
        return end && Math.hypot(end[0] - q[0], end[1] - q[1]) < 1;
      });
      if (!reachable) continue;
      const distance = Math.min(20, ...known.map(t => Math.hypot(t.x - q[0], t.z - q[1])));
      const friendly = sites.some(t => Math.hypot(t.x - q[0], t.z - q[1]) < 4) ? 2 : 0;
      const score = distance * 4 + friendly - Math.hypot(q[0] - center.x, q[1] - center.z) * .35;
      if (score > bestScore) { bestScore = score; best = { x: q[0], z: q[1], place: 'street' }; }
    }
    return best;
  }
  function tick() {
    if (!state.deployment.restrictionsEnabled) return;
    for (const [clan, config] of Object.entries(state.deployment.clans)) for (const [id, task] of Object.entries(config.sectors)) {
      const team = members(clan, id);
      if (!team.length) { delete task.engagement; delete task.recovery; continue; }
      if (!task.recovery) {
        const fighting = team.some(e => inCombat(e) || state.tick - Math.max(e.hitAt ?? -Infinity, e.foughtAt ?? -Infinity) < RECOVERY.quietTicks);
        if (fighting && !task.engagement) task.engagement = { ids: roster(clan, id).map(e => e.id) };
        if (task.engagement) {
          // Deliberate manual orders/transfers detach, rather than count as casualties.
          task.engagement.ids = task.engagement.ids.filter(unit => {
            const e = state.entities[unit];
            return !e || e.dead || e.downed || e.jailed || (e.deployment.group === id && automated(e));
          });
          const reason = withdrawalReason(state.entities, task.engagement.ids);
          if (reason) request(clan, id, reason);
          else if (!fighting) delete task.engagement;
        }
      }
      const r = task.recovery; if (!r) continue;
      const enemies = threats(clan), unsafe = r.point && enemies.some(e => {
        const p = location(e); return p && Math.hypot(p.x - r.point.x, p.z - r.point.z) < RECOVERY.dangerRadius;
      });
      if ((!r.point || unsafe || r.blocked) && state.tick >= r.replanAt) {
        r.point = pickPoint(clan, id, team, enemies); r.replanAt = state.tick + RECOVERY.replanTicks; r.blocked = false; r.state = 'Withdrawing';
        for (const e of team) clearCombat(e);
      }
      const gathered = r.point && team.every(e => e.place === 'street' && Math.hypot(e.x - r.point.x, e.z - r.point.z) <= RECOVERY.gatherRadius);
      r.state = gathered && !unsafe ? 'Recovering' : 'Withdrawing';
      if (r.state === 'Recovering' && team.every(e => e.hp >= e.maxHp * RECOVERY.health
        && state.tick - Math.max(e.hitAt ?? -Infinity, e.foughtAt ?? -Infinity) >= RECOVERY.quietTicks)) {
        delete task.recovery; delete task.engagement;
        for (const e of team) { clearCombat(e); e.order = { kind: 'stop' }; e.deployment.duty = { manual: false, status: 'Returning' }; }
      }
    }
  }
  function step(e, unit) {
    if (!automated(e)) return false;
    const r = state.deployment.clans[e.owner]?.sectors[e.deployment.group]?.recovery;
    if (!r) return false;
    e.deployment.duty ||= { manual: false };
    e.deployment.duty.status = r.state;
    if (r.point) {
      const result = deployment.localTravel(e, unit, r.point);
      if (result !== 'blocked') { if (result === 'arrived') e.anim = 'idle'; return true; }
      r.blocked = true;
    }
    const t = threats(e.owner).find(t => t.place === e.place && Math.hypot(t.x - e.x, t.z - e.z) <= (unit.attackRange || 1.2) + .6);
    if (t) attackStep(e, unit, t); else e.anim = 'idle';
    return true;
  }
  return { tick, step, request };
}
