export const TARGET_MEMORY_TICKS = 120 * 20;

export function createShinobiIntelligence({ state, deployment, vision }) {
  const location = e => {
    if (e.place === 'street') return { x: e.x, z: e.z };
    const building = Object.values(state.businesses).find(b => b.room === e.place);
    return building ? { x: building.x, z: building.z, building: building.id } : null;
  };
  const candidate = (clan, e) => e && e.owner !== clan && state.clans[e.owner] && (e.type === 'hero' || (!e.guard && !e.cop && !e.wild && e.type !== 'civilian'));
  function tick() {
    for (const [clan, config] of Object.entries(state.deployment.clans)) {
      if (state.clans[clan]?.kind !== 'ninja') continue;
      const targets = config.targets ||= {}, pins = new Set([config.hunt?.target, ...Object.values(config.sectors).map(s => s.operation?.target)]);
      for (const t of Object.values(targets)) t.live = false;
      for (const e of Object.values(state.entities)) {
        if (!candidate(clan, e) || e.hidden || !vision.canSee(clan, e)) continue;
        if (e.dead || e.downed || e.jailed) { if (!pins.has(e.id)) delete targets[e.id]; continue; }
        const p = location(e); if (!p) continue;
        targets[e.id] = { id: e.id, type: e.type, model: e.model, owner: e.owner, ...p,
          sector: deployment.sectorAt(p.x, p.z), seenAt: state.tick, live: true };
      }
      for (const [id, t] of Object.entries(targets)) if (state.tick - t.seenAt >= TARGET_MEMORY_TICKS && !pins.has(id)) delete targets[id];
      const job = state.contracts?.active?.[clan];
      if (job?.kind !== 'boss') { delete config.bossTrack; continue; }
      const key = `${job.id ?? job.takenAt ?? ''}:${job.hero}`;
      if (config.bossTrack?.key !== key) config.bossTrack = { key, target: job.hero, discovered: false };
      const track = config.bossTrack, e = state.entities[job.hero];
      const visible = e && !e.hidden && !e.dead && !e.jailed && vision.canSee(clan, e);
      if (visible) { track.discovered = true; track.broken = false; track.identity = { id: e.id, type: e.type, model: e.model, owner: e.owner }; track.observedAt = state.tick; }
      if (!track.discovered) continue;
      if (!e || e.hidden || e.dead || e.jailed) track.broken = true;
      if (!track.broken) {
        const p = location(e);
        if (p) { Object.assign(track, p, { seenAt: state.tick, live: true }); if (!p.building) delete track.building; }
      } else track.live = false;
    }
  }
  const targets = clan => {
    const c = state.deployment.clans[clan], list = Object.values(c?.targets || {}).map(t => ({ ...t, age: (state.tick - t.seenAt) / 20 }));
    const track = c?.bossTrack;
    if (track?.discovered && track.identity && Number.isFinite(track.x)) {
      const i = list.findIndex(t => t.id === track.target), old = i >= 0 ? list[i] : null;
      const record = { ...track.identity, x: track.x, z: track.z, seenAt: track.observedAt, age: (state.tick - track.observedAt) / 20,
        sector: deployment.sectorAt(track.x, track.z), live: !!old?.live, tracked: !track.broken };
      if (i >= 0) list[i] = record; else list.push(record);
    }
    return list;
  };
  const known = (clan, id) => !!state.deployment.clans[clan]?.targets?.[id]
    || (state.deployment.clans[clan]?.bossTrack?.target === id && state.deployment.clans[clan].bossTrack.discovered);
  return { tick, targets, known };
}
