// Yakuza irezumi enforcer (Tim 2026-10-28): the Yakuza clan's special crew, on a par with the Shinobi
// geisha (sim/diversion.js) and the Kuroda rifleman (sim/rifleman.js).
//  - Taunt is his "auto attack": every cooldownTicks he bellows at one visible enemy crew member or
//    house guard within radius (first anyone hitting a weaker clanmate, then anyone near his clan, then
//    the nearest). The taunted unit must attack him for durationTicks. Never heroes, police, bandits or
//    townsfolk. While a taunt holds he takes damageTaken x damage (bulwark buff, sim/stats.js).
//  - Otherwise he moves and fights like any other crew member.
export const TAUNT = { radius: 5, durationTicks: 80, cooldownTicks: 80, damageTaken: 0.85 };
export function createTaunt({ state, vision, hostile = () => false, clearCombat = () => {}, attackStep = () => {}, addBuff = () => {}, fightTarget = () => null, rules = {} }) {
  const R = { ...TAUNT, ...rules };
  const alive = e => e && !e.dead && !e.downed && !e.jailed;
  const isEnforcer = e => e?.type === 'yakuza_enforcer';
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const hitting = (t, id) => fightTarget(t.id) === id || t.attackTarget === id || (t.order?.kind === 'attack' && t.order.target === id) || t.swing?.target === id;
  function bellow(e) {
    const mine = Object.values(state.entities).filter(u => u.owner === e.owner && u !== e && alive(u) && u.place === e.place);
    let best = null, bestScore = Infinity;
    for (const t of Object.values(state.entities)) {
      if (!alive(t) || t.owner === e.owner || !state.clans?.[t.owner] || t.type === 'hero' || t.type === 'civilian' || t.cop || t.wild
        || t.place !== e.place || t.taunted?.until>state.tick || t.distracted || t.deployment?.transfer || !hostile(e, t) || !hostile(t, e) || !vision.canSee(e.owner, t)) continue;
      const d = dist(t, e);
      if (d > R.radius) continue;
      const onMate = mine.some(u => hitting(t, u.id)), near = mine.some(u => dist(u, t) < 4);
      const score = (onMate ? 0 : near ? 100 : 200) + d;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    if (!best) return false;
    clearCombat(e);
    clearCombat(best);
    best.taunted = { source: e.id, until: state.tick + R.durationTicks };
    e.taunt = { readyAt: state.tick + R.cooldownTicks, target: best.id, castUntil: state.tick + 15 };
    addBuff(e, 'bulwark', R.durationTicks / 20, { taken: R.damageTaken });
    state.casts.push({ kind: 'taunt', a: e.id, t: best.id, x: e.x, z: e.z, tx: best.x, tz: best.z });
    return true;
  }
  function tick() {
    for (const t of Object.values(state.entities)) if (t.taunted) {
      const a = state.entities[t.taunted.source];
      if (!alive(t) || !alive(a) || a.place !== t.place || t.taunted.until <= state.tick) delete t.taunted;
    }
  }
  function step(e, unit) {
    // taunted: goes for the enforcer whatever else it was doing
    if (e.taunted) { const a = state.entities[e.taunted.source]; if (e.taunted.until>state.tick && alive(a) && a.place===e.place && hostile(e, a)) { attackStep(e, unit, a); return true; } delete e.taunted; }
    if (!isEnforcer(e) || !alive(e) || e.deployment?.transfer || e.deployment?.scattered || e.holdFire || e.smokePassive || e.execute || e.crewJob || e.buffs?.stunned?.until>state.tick) return false;
    const moving = (e.order?.kind === 'move' && !e.order.arrived && !e.order.duty) || ['enter', 'heal', 'loot'].includes(e.order?.kind) || (e.order?.kind==='follow'&&e.order.regrouping);
    if(moving){if(e.taunt)e.taunt.castUntil=state.tick;return false;}
    if ((e.taunt?.castUntil ?? -1) > state.tick) { e.anim = 'taunt'; return true; }
    if ((e.taunt?.readyAt ?? 0) <= state.tick && bellow(e)) { e.anim = 'taunt'; return true; }
    return false;
  }
  return { step, tick };
}
