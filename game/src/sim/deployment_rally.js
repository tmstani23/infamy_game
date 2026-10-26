export const RALLY_TICKS = 3 * 60 * 20;
export const RALLY_COOLDOWN_TICKS = 5 * 60 * 20;
export const isRallyParticipant = (state, e) => {
  const r = e && state.deployment?.clans[e.owner]?.rally;
  return !!r?.active && r.endsAt > state.tick && r.participants.some(p => p.id === e.id);
};
export function createDeploymentRally({ state, deployment }) {
  const own = clan => state.deployment.clans[clan];
  function record(clan) {
    if (!own(clan)) return null;
    return own(clan).rally ||= { active: false, endsAt: 0, readyAt: 0, participants: [], groups: [] };
  }
  function participating(e) {
    return isRallyParticipant(state, e);
  }
  function status(clan) {
    const r = own(clan)?.rally, h = Object.values(state.entities).find(e => e.type === 'hero' && e.owner === clan);
    const crew = (r?.participants || []).map(p => state.entities[p.id]).filter(e => e && !e.dead && !e.downed && !e.jailed);
    return { active: !!r?.active && r.endsAt > state.tick, seconds: Math.max(0, Math.ceil(((r?.endsAt || 0) - state.tick) / 20)),
      cooldown: Math.max(0, Math.ceil(((r?.readyAt || 0) - state.tick) / 20)), called: crew.length,
      arrived: h && !h.dead && !h.downed && !h.jailed ? crew.filter(e => e.place === h.place && Math.hypot(e.x - h.x, e.z - h.z) <= 8).length : 0 };
  }
  function command(h, c) {
    if (c.action === 'return' && !c.selectionChange && h.type === 'hero' && Array.isArray(c.units)) {
      const r = own(h.owner)?.rally;
      if (!r?.active) return;
      for (const id of new Set(c.units)) {
        const p = r.participants.find(p => p.id === id), e = state.entities[id];
        if (!p || !e || e.owner !== h.owner) continue;
        r.participants = r.participants.filter(p => p.id !== id); deployment.returnAfterRally(e, p.group);
      }
      return;
    }
    if (c.action !== 'rally' || h.type !== 'hero' || !state.deployment.restrictionsEnabled) return;
    const r = record(h.owner), valid = ['hero', 'home', ...state.deployment.sectors.map(s => s.id)];
    if (!r || r.active || r.readyAt > state.tick || !Array.isArray(c.groups) || !c.groups.length || c.groups.some(g => !valid.includes(g))) return;
    const groups = [...new Set(c.groups)];
    const participants = deployment.members(h.owner).filter(e => !e.downed && groups.includes(e.deployment.transfer?.to || e.deployment.group));
    Object.assign(r, { active: true, startedAt: state.tick, endsAt: state.tick + RALLY_TICKS, readyAt: 0, groups,
      participants: participants.map(e => ({ id: e.id, group: e.deployment.transfer?.to || e.deployment.group })) });
    state.clans[h.owner].notice = { tick: state.tick, text: 'Rally called: 3 minutes including travel. Issue Follow or movement orders to assemble.' };
  }
  function tick() {
    for (const clan of Object.keys(state.clans || {})) {
      const r = record(clan);
      if (r?.active && state.tick >= r.endsAt) {
        r.active = false; r.readyAt = r.nextReady ? r.endsAt : r.endsAt + RALLY_COOLDOWN_TICKS; delete r.nextReady;
        for (const p of r.participants) {
          const e = state.entities[p.id];
          if (e?.owner === clan) deployment.returnAfterRally(e, p.group);
        }
        state.clans[clan].notice = { tick: state.tick, text: 'Rally ended: crew returning to saved assignments' };
      }
    }
  }
  function raidPlaced(clan) {
    const r = record(clan); if (!r) return;
    if (r.active) r.nextReady = true; else r.readyAt = state.tick;
  }
  function buffEligible(h, e) {
    if (!h || !e || h.owner !== e.owner) return false;
    if (e.id === h.id) return true;
    if (e.guard || e.cop || e.wild || e.type === 'civilian' || e.type === 'hero') return false;
    return !state.deployment.restrictionsEnabled || (!e.deployment?.transfer && (e.deployment?.group === 'hero' || participating(e)));
  }
  function cleanBuffs() {
    if (!state.deployment.restrictionsEnabled) return;
    for (const clan of Object.keys(state.clans || {})) {
      const h = Object.values(state.entities).find(e => e.type === 'hero' && e.owner === clan);
      for (const e of deployment.members(clan)) if (e.buffs && !buffEligible(h, e)) {
        delete e.buffs.rally; delete e.buffs.ambush; delete e.buffs.reprisal; delete e.buffs.shroud;
      }
    }
  }
  return { command, tick, participating, status, raidPlaced, buffEligible, cleanBuffs };
}
