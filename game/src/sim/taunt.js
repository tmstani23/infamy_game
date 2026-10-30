// Yakuza irezumi enforcer (Tim 2026-10-28): the Yakuza clan's special crew, on a par with the Shinobi
// geisha (sim/diversion.js) and the Kuroda rifleman (sim/rifleman.js).
//  - Taunt is his "auto attack": every cooldownTicks he bellows at one visible enemy crew member or
//    house guard within radius (first anyone hitting a weaker clanmate, then anyone near his clan, then
//    the nearest). The taunted unit must attack him for durationTicks. Never heroes, police, bandits or
//    townsfolk. While a taunt holds he takes damageTaken x damage (bulwark buff, sim/stats.js).
//  - Otherwise he moves and fights like any other crew member.
import { alive, dist } from './util.js';
import {dirIndex,SCREEN_DOWN,SCREEN_RIGHT} from './geometry.js';
export const TAUNT = { radius: 5, durationTicks: 80, cooldownTicks: 80, damageTaken: 0.85 };
export function createTaunt({ state, vision, hostile = () => false, clearCombat = () => {}, attackStep = () => {}, addBuff = () => {}, fightTarget = () => null, rules = {}, rulesFor=()=>null, engagementTarget=()=>null, reveal=()=>{}, allowed=()=>true }) {
  const isEnforcer = e => e?.type === 'yakuza_enforcer'||!!rulesFor(e);
  const hitting = (t, id) => fightTarget(t.id) === id || t.attackTarget === id || (t.order?.kind === 'attack' && t.order.target === id) || t.swing?.target === id;
  const valid=(e,t,R)=>alive(t)&&t.owner!==e.owner&&!!state.clans?.[t.owner]&&t.type!=='hero'&&t.type!=='civilian'&&!t.cop&&!t.wild
    &&t.place===e.place&&!(t.taunted?.until>state.tick)&&!t.distracted&&!t.deployment?.transfer&&hostile(e,t)&&hostile(t,e)&&allowed(e,t)&&vision.canSee(e.owner,t)&&dist(t,e)<=R.radius;
  function bellow(e) {
    const R={...TAUNT,...rules,...rulesFor(e)};
    const mine = Object.values(state.entities).filter(u => u.owner === e.owner && u !== e && alive(u) && u.place === e.place);
    let best = null, bestScore = Infinity;
    for (const t of Object.values(state.entities)) {
      if (!valid(e,t,R)) continue;
      const d = dist(t, e);
      const onMate = mine.some(u => hitting(t, u.id)), near = mine.some(u => dist(u, t) < 4);
      const score = (onMate ? 0 : near ? 100 : 200) + d;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    if (!best) return false;
    clearCombat(e);
    e.dir=dirIndex(best.x-e.x,best.z-e.z);
    const angle=e.dir*Math.PI/4,fx=SCREEN_DOWN.x*Math.cos(angle)-SCREEN_RIGHT.x*Math.sin(angle),fz=SCREEN_DOWN.z*Math.cos(angle)-SCREEN_RIGHT.z*Math.sin(angle);
    const victims=R.coneDegrees?Object.values(state.entities).filter(t=>valid(e,t,R)&&((t.x-e.x)*fx+(t.z-e.z)*fz)/Math.max(.001,dist(t,e))>=Math.cos(R.coneDegrees*Math.PI/360)):[best];
    for(const t of victims){clearCombat(t);t.taunted={source:e.id,until:state.tick+R.durationTicks};}
    e.taunt = { readyAt: state.tick + R.cooldownTicks, target: best.id, castUntil: state.tick + 15 };
    if(R.damageTaken<1)addBuff(e, 'bulwark', R.durationTicks / 20, { taken: R.damageTaken });
    reveal(e,true);
    state.casts.push({ kind: 'taunt',style:e.type, a: e.id, t: best.id, x: e.x, z: e.z, tx: best.x, tz: best.z,cone:R.coneDegrees||0,radius:R.radius,dir:e.dir });
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
    const R={...TAUNT,...rules,...rulesFor(e)};
    if(R.engagementOnly&&(e.order?.kind==='stop'||!engagementTarget(e)))return false;
    const moving = (e.order?.kind === 'move' && !e.order.arrived && !e.order.duty) || ['enter', 'heal', 'loot'].includes(e.order?.kind) || (e.order?.kind==='follow'&&e.order.regrouping);
    if(moving){if(e.taunt)e.taunt.castUntil=state.tick;return false;}
    if ((e.taunt?.castUntil ?? -1) > state.tick) { e.anim = 'taunt'; return true; }
    if ((e.taunt?.readyAt ?? 0) <= state.tick && bellow(e)) { e.anim = 'taunt'; return true; }
    return false;
  }
  return { step, tick };
}
