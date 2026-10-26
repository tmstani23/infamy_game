export const SHINOBI_TASKS = { extractionRadius: 5, extractionLeash: 8, armSeconds: 60, attackSeconds: 45, escapeSeconds: 10, abortHealth: .35 };
export function createShinobiAssignments({ state, deployment, assignments, rally, vision, sees, clearCombat, attackStep, finishTarget, executeStep }) {
  const alive = e => e && !e.dead && !e.downed && !e.jailed;
  const groups = clan => state.deployment.clans[clan]?.sectors || {};
  const crew = (clan, id) => deployment.members(clan, id).filter(e => alive(e) && !e.deployment.transfer && !rally.participating(e));
  const enemy = (clan, e) => alive(e) && e.owner && e.owner !== clan && e.type !== 'civilian' && !e.cop && !e.hidden;
  const say = (clan, text) => { state.clans[clan].notice = { tick: state.tick, text }; };
  const targets = (clan, id) => !groups(clan)[id] ? [] : Object.values(state.entities).filter(e => enemy(clan, e) && e.place === 'street' && vision.canSee(clan, e))
    .sort((a, b) => Math.hypot(a.x - groups(clan)[id].objective.x, a.z - groups(clan)[id].objective.z) - Math.hypot(b.x - groups(clan)[id].objective.x, b.z - groups(clan)[id].objective.z));
  const defenders = (clan, t) => !t ? [] : Object.values(state.entities).filter(e => e.id !== t.id && enemy(clan, e) && e.owner === t.owner && e.place === t.place && vision.canSee(clan, e) && Math.hypot(e.x - t.x, e.z - t.z) <= 8);
  function clearGroup(clan, id) {
    for (const e of crew(clan, id)) { clearCombat(e); delete e.holdFire; delete e.smokePassive; e.order = { kind: 'move', x: e.x, z: e.z, arrived: true }; e.deployment.duty = { manual: false, status: 'Watching' }; }
  }
  function escape(clan, id, reason) {
    const task = groups(clan)[id], op = task.operation;
    if (!op || op.state === 'Escaping') return;
    op.state = 'Escaping'; op.escapedAt = state.tick; op.reason = reason;
    clearGroup(clan, id); say(clan, `${id}: escaping · ${reason}`);
  }
  function command(h, c) {
    if (h.type !== 'hero' || state.clans[h.owner]?.kind !== 'ninja') return;
    if (c.action === 'return' && !c.selectionChange && Array.isArray(c.units)) {
      for (const id of c.units) {
        const e = state.entities[id], group = e?.deployment?.group;
        if (e?.owner === h.owner && groups(h.owner)[group]?.operation?.kind === 'ambush') escape(h.owner, group, 'Return to assignment');
      }
      return;
    }
    const task = groups(h.owner)[c.sector]; if (!task) return;
    if (c.action === 'armAmbush') {
      const t = state.entities[c.target], members = crew(h.owner, c.sector);
      if (task.operation || !members.length || !enemy(h.owner, t) || !vision.canSee(h.owner, t) || t.place !== 'street') return say(h.owner, 'Choose a visible street enemy and an available sector group');
      clearGroup(h.owner, c.sector);
      task.operation = { kind: 'ambush', state: 'Ambush armed', target: t.id, startedAt: state.tick, initial: members.length, units: members.map(e => e.id) };
      say(h.owner, `${c.sector}: ambush armed · ${defenders(h.owner, t).length} spotted nearby defenders`);
    } else if (c.action === 'cancelAmbush' && task.operation?.state === 'Ambush armed') {
      delete task.operation; for (const e of crew(h.owner, c.sector)) assignments.resume(e);
    } else if (c.action === 'retreat' && task.operation?.kind === 'ambush') escape(h.owner, c.sector, 'Retreat ordered');
  }
  function tick() {
    for (const clan of Object.keys(state.clans || {})) {
      if (state.clans[clan].kind !== 'ninja') continue;
      const config = state.deployment.clans[clan];
      if (state.tick % 5 === 0) {
        const sightings = config.sightings ||= {}, observed = new Set(), job = state.contracts?.active[clan];
        for (const [id] of Object.entries(groups(clan))) {
          const eyes = crew(clan, id).filter(e => deployment.sectorAt(e.x, e.z, e.place) === id);
          if (!eyes.length) continue;
          for (const t of Object.values(state.entities)) {
            if (!enemy(clan, t) || t.place !== 'street' || deployment.sectorAt(t.x, t.z) !== id
              || !eyes.some(e => e.place === t.place && Math.hypot(t.x - e.x, t.z - e.z) <= vision.range && sees(e, t))) continue;
            const old = sightings[t.id], dx = old ? t.x - old.x : 0, dz = old ? t.z - old.z : 0, length = Math.hypot(dx, dz);
            const priority = !!job && (job.hero === t.id || (job.target === t.owner && t.type === 'hero'));
            if (!old?.live || old.sector !== id || (priority && !old.priority)) {
              state.news.push({ kind: 'sectorContact', clan, sector: id, x: t.x, z: t.z, target: t.id, priority }); groups(clan)[id].alertAt = state.tick;
            }
            sightings[t.id] = { id: t.id, owner: t.owner, x: t.x, z: t.z, sector: id, seenAt: state.tick, live: true, priority,
              direction: length > .05 ? { x: dx / length, z: dz / length } : old?.direction || null };
            observed.add(t.id);
          }
        }
        for (const [key, contact] of Object.entries(sightings)) if (!observed.has(key)) {
          if (contact.live) state.news.push({ kind: 'sectorLost', clan, sector: contact.sector, x: contact.x, z: contact.z, direction: contact.direction, priority: contact.priority });
          contact.live = false;
          if (state.tick - contact.seenAt >= 200) delete sightings[key];
        }
      }
      for (const [id, task] of Object.entries(groups(clan))) {
        const op = task.operation; if (!op || op.kind !== 'ambush') continue;
        const members = crew(clan, id).filter(e => op.units.includes(e.id)), t = state.entities[op.target];
        if (!members.length) { delete task.operation; continue; }
        const health = members.reduce((n, e) => n + e.hp, 0) / members.reduce((n, e) => n + e.maxHp, 0);
        if (op.state !== 'Escaping' && (health < SHINOBI_TASKS.abortHealth || members.length < Math.ceil(op.initial / 2))) escape(clan, id, 'Group in danger');
        if (op.state === 'Ambush armed') {
          if (!t || t.dead || t.downed || state.tick - op.startedAt > 20 * SHINOBI_TASKS.armSeconds) { delete task.operation; for (const e of members) assignments.resume(e); continue; }
          if (enemy(clan, t) && vision.canSee(clan, t) && t.place === 'street' && deployment.sectorAt(t.x, t.z) === id) {
            if (defenders(clan, t).length > members.length + 2) escape(clan, id, 'Too many spotted defenders');
            else { op.state = 'Attacking'; op.attackingAt = state.tick; }
          }
        } else if (op.state === 'Attacking') {
          if (!t || t.dead || t.jailed) escape(clan, id, 'Target defeated or gone');
          else if ((!t.downed && (!vision.canSee(clan, t) || t.hidden)) || deployment.sectorAt(t.x, t.z, t.place) !== id || t.place !== 'street') escape(clan, id, 'Target escaped');
          else if (state.tick - op.attackingAt > 20 * SHINOBI_TASKS.attackSeconds || defenders(clan, t).length > members.length + 2) escape(clan, id, 'Ambush no longer safe');
          else if (t.downed && !members.some(e => e.execute)) finishTarget(clan, t.id, members.map(e => e.id));
        } else if (op.state === 'Escaping' && members.every(e => e.place === 'street' && Math.hypot(e.x - task.fallback.x, e.z - task.fallback.z) < 1.5)
          && (members.every(e => e.hidden) || state.tick - op.escapedAt > 20 * SHINOBI_TASKS.escapeSeconds)) {
          delete task.operation; for (const e of members) assignments.resume(e);
        }
      }
    }
  }
  function step(e, unit) {
    if (state.clans[e.owner]?.kind !== 'ninja' || !alive(e) || !e.deployment || e.deployment.transfer || rally.participating(e)) return false;
    const id = e.deployment.group, task = groups(e.owner)[id]; if (!task) return false;
    const op = task.operation, duty = e.deployment.duty ||= { manual: false, status: 'Watching' };
    if (op?.kind === 'ambush' && op.units.includes(e.id)) {
      duty.status = op.state; duty.manual = false;
      if (op.state === 'Ambush armed') { e.anim = 'idle'; return true; }
      if (op.state === 'Escaping') {
        delete e.swing; delete e.execute; const result = deployment.localTravel(e, unit, { ...task.fallback, place: 'street' });
        if (result !== 'moving') e.anim = 'idle'; return true;
      }
      const t = state.entities[op.target];
      if (e.execute) { executeStep(e, unit); return true; }
      if (t && !t.downed && !t.dead && !t.hidden && sees(e, t) && deployment.canActAt(e, t.x, t.z, t.place)) { attackStep(e, unit, t); return true; }
      e.anim = 'idle'; return true;
    }
    if (task.task !== 'extraction' || duty.manual) return false;
    const goal = task.objective;
    let t = state.entities[duty.intercept];
    if (!enemy(e.owner, t) || !sees(e, t) || t.place !== e.place || Math.hypot(t.x - goal.x, t.z - goal.z) > SHINOBI_TASKS.extractionLeash || !deployment.canActAt(e, t.x, t.z, t.place)) {
      if (duty.intercept) { clearCombat(e); delete duty.intercept; e.order = { kind: 'stop' }; }
      t = Object.values(state.entities).find(t => enemy(e.owner, t) && t.place === e.place && sees(e, t) && Math.hypot(t.x - goal.x, t.z - goal.z) <= SHINOBI_TASKS.extractionRadius && deployment.canActAt(e, t.x, t.z, t.place));
    }
    if (t && e.place === 'street' && Math.hypot(e.x - goal.x, e.z - goal.z) <= SHINOBI_TASKS.extractionLeash) {
      duty.intercept = t.id; duty.status = 'Defending'; attackStep(e, unit, t); return true;
    }
    return false;
  }
  function manual(e) {
    const task = groups(e.owner)[e.deployment?.group], op = task?.operation;
    if (op?.kind !== 'ambush' || !op.units) return;
    op.units = op.units.filter(id => id !== e.id);
    if (!op.units.length) delete task.operation;
  }
  return { command, tick, step, manual, targets, defenders: (clan, target) => defenders(clan, state.entities[target]).length };
}
