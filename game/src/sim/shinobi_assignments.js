import { createAmbush } from './ambush.js';
export const SHINOBI_TASKS = { extractionRadius: 5, extractionLeash: 8 };
export function createShinobiAssignments({ state, deployment, assignments, rally, vision, sees, clearCombat, attackStep, finishTarget, executeStep, intelligence, recovery }) {
  const alive = e => e && !e.dead && !e.downed && !e.jailed;
  const groups = clan => state.deployment.clans[clan]?.sectors || {};
  const crew = (clan, id) => deployment.members(clan, id).filter(e => alive(e) && !e.deployment.transfer && !rally.participating(e));
  const enemy = (clan, e) => alive(e) && e.owner && e.owner !== clan && e.type !== 'civilian' && !e.cop && !e.hidden;
  const say = (clan, text) => { state.clans[clan].notice = { tick: state.tick, text }; };
  const targets = (clan, id) => !groups(clan)[id] ? [] : Object.values(state.entities).filter(e => enemy(clan, e) && e.place === 'street' && vision.canSee(clan, e))
    .sort((a, b) => Math.hypot(a.x - groups(clan)[id].objective.x, a.z - groups(clan)[id].objective.z) - Math.hypot(b.x - groups(clan)[id].objective.x, b.z - groups(clan)[id].objective.z));
  const defenders = (clan, t) => !t ? [] : Object.values(state.entities).filter(e => e.id !== t.id && enemy(clan, e) && e.owner === t.owner && e.place === t.place && vision.canSee(clan, e) && Math.hypot(e.x - t.x, e.z - t.z) <= 8);
  const ambush = createAmbush({ state, deployment, assignments, rally, vision, sees, intelligence, recovery, clearCombat, attackStep, finishTarget, executeStep });
  const command = (h, c) => ambush.command(h, c);
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

    }
    ambush.tick();
  }
  function step(e, unit) {
    if (ambush.step(e, unit)) return true;
    if (state.clans[e.owner]?.kind !== 'ninja' || !alive(e) || !e.deployment || e.deployment.transfer || rally.participating(e)) return false;
    const id = e.deployment.group, task = groups(e.owner)[id]; if (!task) return false;
    const duty = e.deployment.duty ||= { manual: false, status: 'Watching' };
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
  const manual = e => ambush.manual(e);
  return { command, tick, step, manual, targets, defenders: (clan, target) => defenders(clan, state.entities[target]).length };
}
