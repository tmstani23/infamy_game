// One defender must channel continuously. Progress never pools between guards,
// and fighting, damage, movement or incapacitation interrupts the attempt.
export function createMarkScrubbing({ state, rules, inCombat = () => false }) {
  const jobOf = e => state.contracts?.active[e.markScrub?.clan];
  function eligible(e, job) {
    const m = job.mark, o = e?.order;
    return !!e && !e.dead && !e.downed && !e.jailed && e.type !== 'civilian'
      && e.owner === job.target && e.place === m.place && Math.hypot(e.x-m.x,e.z-m.z) <= rules.reach
      && e.markScrubInterruptedAt !== state.tick && e.hitAt !== state.tick
      && !e.swing && !e.execute && !e.attackTarget && !e.snuffing && !e.dash
      && !e.brace && !e.spearCombo && !e.spearSweep && !inCombat(e)
      && !(e.buffs?.stunned?.until > state.tick) && !(e.buffs?.charming?.until > state.tick)
      && !(e.distracted && (e.distracted.until == null || e.distracted.until > state.tick))
      && !e.deployment?.transfer
      && !(o?.kind === 'move' && !o.arrived)
      && !(['attack','attackmove','follow','loot','enter','heal'].includes(o?.kind) && !o.patrol)
      && !(e.type === 'hero' && ['walk','run'].includes(e.anim));
  }
  function interrupt(e) {
    if (!e?.markScrub) return;
    const job = jobOf(e);
    if (job?.business === e.markScrub.business && job.mark?.scrubber === e.id) {
      delete job.mark.scrubber; job.mark.clear = 0;
    }
    delete e.markScrub; e.markScrubInterruptedAt = state.tick;
  }
  function valid(e, job) {
    const channel = e?.markScrub;
    return !!channel && job?.business === channel.business && job.mark?.alerted
      && job.mark.scrubber === e.id && eligible(e,job)
      && e.place === channel.place && Math.hypot(e.x-channel.x,e.z-channel.z) < .05
      && (e.hitAt == null || e.hitAt < channel.start);
  }
  function step(e) {
    if (!e.markScrub) return false;
    if (!valid(e,jobOf(e))) { interrupt(e); return false; }
    e.anim = 'idle'; return true;
  }
  function update(clan,job) {
    const m = job.mark;
    let defender = state.entities[m.scrubber];
    if (defender && !valid(defender,job)) { interrupt(defender); defender = null; }
    if (!defender) {
      delete m.scrubber; m.clear = 0;
      if (!m.alerted) return false;
      defender = Object.values(state.entities).find(e => !e.markScrub && eligible(e,job));
      if (!defender) return false;
      m.scrubber = defender.id;
      defender.markScrub = { clan, business:job.business, start:state.tick, len:Math.round(rules.clearSeconds*20),
        x:defender.x, z:defender.z, place:defender.place };
      defender.anim = 'idle';
    }
    m.clear = state.tick-defender.markScrub.start;
    return m.clear >= defender.markScrub.len;
  }
  function clear(clan) {
    for (const e of Object.values(state.entities)) if (e.markScrub?.clan === clan) interrupt(e);
  }
  return { update, step, interrupt, clear };
}
