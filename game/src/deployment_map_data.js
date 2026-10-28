// Presentation data for this clan only. Contacts copy observed positions and
// never read rival assignments, objectives, transfers or hidden movement.
export const LAST_KNOWN_TICKS = 200;
export const TASK_LABELS = { patrol: 'Patrol sector', watch: 'Watch', ambush: 'Ambush', guard: 'Guard business' };

export function createDeploymentMapData({ game, clan }) {
  const contacts = new Map();
  let snapshot = { sectors: [], contacts: [], transfers: [], own: [] };
  let lastTick = null;
  const location = e => {
    if (e.place === 'street') return { x: e.x, z: e.z };
    const b = Object.values(game.state.businesses).find(b => b.room === e.place);
    return b?.ring ? { x: b.ring[0], z: b.ring[1] } : null;
  };
  function update() {
    const st = game.state, d = game.deployment, tick = st.tick, live = new Set();
    if (!d || !st.deployment?.clans[clan]) return snapshot;
    if (tick === lastTick) return snapshot;
    lastTick = tick;
    for (const e of Object.values(st.entities)) {
      if (e.owner === clan || !st.clans[e.owner] || e.type === 'civilian' || e.cop || e.wild || !game.vision.canSee(clan, e)) continue;
      if (e.dead || e.jailed) { contacts.delete(e.id); continue; }
      const p = location(e); if (!p) continue;
      const prev = contacts.get(e.id), dx = prev ? p.x - prev.x : 0, dz = prev ? p.z - prev.z : 0, length = Math.hypot(dx, dz);
      contacts.set(e.id, { id: e.id, owner: e.owner, ...p, sector: d.sectorAt(p.x, p.z), seenAt: tick,
        direction: length > .05 ? { x: dx / length, z: dz / length } : prev?.direction || null });
      live.add(e.id);
    }
    for (const [id, c] of contacts) if (tick - c.seenAt >= LAST_KNOWN_TICKS) contacts.delete(id);
    const known = [...contacts.values()].map(c => ({ ...c, live: live.has(c.id), age: (tick - c.seenAt) / 20 }));
    const own = d.members(clan), counts = d.counts(clan);
    const transfers = own.filter(e => e.deployment.transfer && !e.downed).flatMap(e => {
      const p = location(e), t = e.deployment.transfer;
      const goal = t.target && location({ ...t.target, place: t.target.place });
      return p && goal ? [{ id: e.id, from: p, to: goal, blocked: t.status === 'blocked' }] : [];
    });
    const sectors = st.deployment.sectors.map(s => {
      const assigned = own.filter(e => e.deployment.group === s.id && !e.deployment.transfer);
      const incoming = own.filter(e => e.deployment.transfer?.to === s.id);
      const standing = assigned.filter(e => !e.downed), blocked = incoming.filter(e => e.deployment.transfer.status === 'blocked').length;
      const task = st.deployment.clans[clan].sectors[s.id];
      const status = task.recovery?.state || task.operation?.state || (blocked ? 'Transfer blocked' : incoming.length ? 'Transferring' : !assigned.length ? 'Empty'
        : !standing.length ? 'Downed' : standing.some(e => e.swing || e.order?.kind === 'attack') ? 'Fighting'
        : standing.some(e => e.deployment.duty?.manual) ? 'Manual'
        : standing.find(e => e.deployment.duty?.status)?.deployment.duty.status
        || (standing.some(e => e.order?.kind === 'move' && !e.order.arrived) ? 'Moving' : 'Holding'));
      const presence = new Map();
      for (const e of own) {
        if (e.downed) continue;
        const p = location(e);
        if (p && d.sectorAt(p.x, p.z) === s.id) presence.set(clan, (presence.get(clan) || 0) + 1);
      }
      for (const c of known) if (c.live && c.sector === s.id) presence.set(c.owner, (presence.get(c.owner) || 0) + 1);
      return { ...s, count: counts[s.id], assigned: assigned.length, living: standing.length, incoming: incoming.length, blocked,
        hp: assigned.reduce((n, e) => n + Math.max(0, e.hp), 0), maxHp: assigned.reduce((n, e) => n + e.maxHp, 0),
        desired: task.desired ?? st.deployment.sectorLimit, missing: Math.max(0, (task.desired ?? st.deployment.sectorLimit) - standing.length - incoming.length),
        task: task.task, taskLabel: TASK_LABELS[task.task] || task.task, objective: { ...task.objective }, fallback: { ...(task.recovery?.point || task.fallback) }, status, alertAt: task.alertAt,
        presence: [...presence].map(([owner, count]) => ({ owner, count, color: st.clans[owner]?.color || '#888888', name: st.clans[owner]?.name || owner })) };
    });
    snapshot = { sectors, contacts: known, transfers, own: own.map(e => ({ id: e.id, ...location(e), group: e.deployment.group, downed: !!e.downed, interior: e.place !== 'street' })) };
    return snapshot;
  }
  return { update, get: () => snapshot };
}
