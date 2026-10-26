// Rival HQ loitering: street presence is counted once per visiting clan, not
// once per unit. Rules and public summaries stay independent of the renderer.
export function createHQCamping({ state, rules = {}, addHeat, tickRate = 20 }) {
  const R = { enabled: true, radius: 12, windowSeconds: 60, warningSeconds: 20,
    activateSeconds: 30, penaltySeconds: 5, penaltyHeat: 12, clearSeconds: 30, ...rules };
  const ticks = s => Math.max(1, Math.round(s * tickRate));
  const windowTicks = ticks(R.windowSeconds), records = new Map();
  state.hqCamping = { zones: [], visits: [] };
  const reset = m => {
    m.history.fill(0); m.total = 0; m.active = false;
    m.clear = 0; m.penalty = 0;
  };
  function tick() {
    const zones = R.enabled ? Object.values(state.businesses).filter(b => b.hideout && b.owner && b.ring)
      .map(b => ({ business: b.id, owner: b.owner, x: b.ring[0], z: b.ring[1], radius: R.radius })) : [];
    const visits = [], keep = new Set();
    const people = Object.values(state.entities).filter(e => state.clans[e.owner] && e.place === 'street'
      && !e.guard && !e.dead && !e.downed && !e.jailed);
    for (const zone of zones) for (const clan of Object.keys(state.clans)) {
      if (clan === zone.owner) continue;
      const key = `${clan}:${zone.business}`; keep.add(key);
      // A formal raid requires waiting at the HQ through its warmup.
      const raid = state.attacks?.[zone.business];
      if (raid?.hq && raid.mode === 'raid' && raid.clan === clan && raid.defender === zone.owner) {
        records.delete(key);
        continue;
      }
      const inside = people.some(e => e.owner === clan && Math.hypot(e.x - zone.x, e.z - zone.z) <= zone.radius);
      let m = records.get(key);
      if (!m && !inside) continue;
      if (!m) { m = { history: new Uint8Array(windowTicks) }; reset(m); records.set(key, m); }
      // The alarm clears only after a continuous absence by the entire clan.
      // Any re-entry restarts decay, even at the very end of the countdown.
      if (m.active) {
        m.clear = inside ? 0 : m.clear + 1;
        if (m.clear >= ticks(R.clearSeconds)) { records.delete(key); continue; }
      }
      const slot = state.tick % windowTicks;
      m.total += Number(inside) - m.history[slot]; m.history[slot] = Number(inside);
      if (!m.total && !m.active) { records.delete(key); continue; }
      if (!m.active && m.total >= ticks(R.activateSeconds)) {
        m.active = true; m.clear = 0; m.penalty = 0;
      }
      if (m.active && inside) {
        // Accumulate only occupied time; short exits cannot dodge every charge.
        if (++m.penalty >= ticks(R.penaltySeconds)) {
          m.penalty = 0;
          // Camping is a fixed charge; ordinary crimes retain police heat scaling.
          addHeat(clan, R.penaltyHeat, 'Camping a rival HQ', false);
          state.clans[clan].lastDisturbance = { x: zone.x, z: zone.z, tick: state.tick };
        }
      }
      if (m.active || (inside && m.total >= ticks(R.warningSeconds))) visits.push({ ...zone, clan,
        inside, active: m.active, seconds: m.total / tickRate,
        remaining: m.active ? Math.max(0, R.clearSeconds - m.clear / tickRate) : 0,
        clearSeconds: R.clearSeconds });
    }
    for (const key of records.keys()) if (!keep.has(key)) records.delete(key);
    state.hqCamping = { zones, visits };
  }
  return { tick, rules: R };
}
