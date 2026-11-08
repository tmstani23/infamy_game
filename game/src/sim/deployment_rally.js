import { deploymentFeedback } from './deployment_feedback.js';
export const RALLY_TICKS = 3 * 60 * 20;
export const RALLY_COOLDOWN_TICKS = 5 * 60 * 20;
export const isRallyParticipant = (state, e) => {
  const r = e && state.deployment?.clans[e.owner]?.rally;
  return !!r?.active && r.endsAt > state.tick && r.participants.some(p => p.id === e.id);
};
export const crewCommandGroup=(state,e)=>{
  if(!e)return null;
  const r=state.deployment?.clans[e.owner]?.rally;
  return r?.active&&r.endsAt>state.tick&&(e.deployment?.group==='hero'||isRallyParticipant(state,e))?'rally':e.deployment?.group||'hero';
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
    const chosen = c.groups ?? valid;
    if (!r || r.active || r.readyAt > state.tick || !Array.isArray(chosen) || !chosen.length || chosen.some(g => !valid.includes(g))) return deploymentFeedback(state,h,c,false,'Rally unavailable: check cooldown and selected groups');
    const groups = [...new Set(chosen)];
    const participants = deployment.members(h.owner).filter(e => !e.downed && groups.includes(e.deployment.transfer?.to || e.deployment.group));
    // Joining Rally interrupts travel, preserving its destination as the saved
    // assignment. The unit remains at its real position and must still travel.
    for(const e of participants)if(e.deployment.transfer){e.deployment.group=e.deployment.transfer.to;delete e.deployment.transfer;e.order={kind:'stop'};}
    Object.assign(r, { active: true, startedAt: state.tick, endsAt: state.tick + RALLY_TICKS, readyAt: 0, groups,
      participants: participants.map(e => ({ id: e.id, group: e.deployment.transfer?.to || e.deployment.group })) });
    // HQ reserves come out to the boss on their own (Tim 2026-11-08): no second select-and-Follow. Not when he is
    // knocked out or out on the island (a remote Rally); other groups still wait for Follow or movement orders.
    const homeCrew = r.participants.filter(p => p.group === 'home').map(p => state.entities[p.id]).filter(e => e && !e.downed && !e.dead && !e.jailed);
    if (!h.dead && !h.downed && !h.jailed && h.place !== 'world') for (const e of homeCrew) {
      delete e.swing; delete e.execute; delete e.patrol;
      if (e.place !== 'street' && e.place !== 'world') e.indoorDuty = { room: e.place, present: false, resume: false };   // walk out, not back to guarding
      // in the same place: follow at once; inside the HQ with him on the street: out of the door toward him first
      if (e.place === h.place) e.order = { kind: 'follow', target: h.id, regrouping: true, ...(h.place !== 'street' ? { exitWithHero: true } : {}) };
      else if (h.place === 'street') e.order = { kind: 'move', x: h.x, z: h.z, place: 'street', rallyFollow: h.id };
    }
    deploymentFeedback(state,h,c,true,homeCrew.length && h.place !== 'world' && !h.downed ? 'RALLY ACCEPTED — 3 minutes. HQ reserves are on their way to you; Follow or move the others to assemble.'
      : 'RALLY ACCEPTED — 3 minutes including travel. Issue Follow or movement orders to assemble.');
  }
  function tick() {
    for (const clan of Object.keys(state.clans || {})) {
      const r = record(clan);
      // reserves called out of the HQ (command above): once through the door, they fall in behind the boss
      if (r?.active) for (const p of r.participants) {
        const e = state.entities[p.id], o = e?.order, h = o?.rallyFollow && state.entities[o.rallyFollow];
        if (h && e.place === h.place && !h.dead) e.order = { kind: 'follow', target: h.id, regrouping: true };
      }
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
