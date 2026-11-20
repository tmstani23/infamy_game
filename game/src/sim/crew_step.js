// Crew each tick: duties, pursuit, indoor duty and going through doors.
// Moved out of sim/game.js (phase 7 split, 2026-10-29); game.js passes in what it shares.
import { distractionStep } from './distraction.js';
import { stunned } from './kuroda.js';
import { DOOR_RADIUS } from './game.js';
import { nearRivalHQ } from './sector_patrol.js';
import { bossAway } from './util.js';
export function createCrewStep({ gatling = { step: () => false }, firebomb = { step: () => false }, assignments, blockOffset, botExecute, businesses, clans, contracts, crewGoal, crewJobs, crewOut, crewTarget, deployment, diversion, doors, endAttack, engage, executeStep, fight, intents, leader, lootStep, moveTo, navOf, paths, rally, rifleman, rooms, sectorCleanup, sectorRecovery, sees, shakedown, shinobiAssignments, state, structures = () => null, sweep, swingStep, taunt }) {
  // Crew with no sector duty (the hero group left behind, the lieutenant's idle crew) also walk out of a rival HQ
  // camping zone once its warning shows, then take their old order back (Tim 2026-11-20: 123 infamy from standing there)
  function freeCampingEscape(e, unit) {
    if (e.type === 'hero' || e.guard || e.cop || e.place !== 'street' || !state.clans?.[e.owner]) return false;
    if (state.deployment.clans[e.owner]?.sectors[e.deployment?.group]) return false;   // sector crew: assignments.avoidCamping
    let esc = e.campingEscape;
    if (!esc) {
      const w = state.hqCamping?.visits.find(v => v.clan === e.owner && v.inside && Math.hypot(e.x - v.x, e.z - v.z) <= v.radius + 1);
      const boss = Object.values(state.entities).find(h => h.owner === e.owner && h.type === 'hero');
      const k = e.order?.kind, idle = !k || k === 'stop' || (k === 'move' && e.order.arrived) || (k === 'follow' && bossAway(boss));
      if (!w || !idle || e.swing || e.execute || rally.participating(e) && !w.active) return false;
      const nav = navOf('street'), cands = [];
      for (const r of [w.radius + 7, w.radius + 15, w.radius + 25]) for (let i = 0; i < 12; i++) {
        const p = nav?.nearestFree(w.x + Math.cos(i * Math.PI / 6) * r, w.z + Math.sin(i * Math.PI / 6) * r);
        if (p && !nearRivalHQ(state, e.owner, { x: p[0], z: p[1] })) cands.push(p);
      }
      const p = cands.sort((a, b) => Math.hypot(a[0] - e.x, a[1] - e.z) - Math.hypot(b[0] - e.x, b[1] - e.z))[0];
      if (!p) return false;
      esc = e.campingEscape = { x: p[0], z: p[1], until: state.tick + 1200, prev: e.order ? { ...e.order } : null };
      delete paths[e.id]; e.order = { kind: 'stop' };
    }
    if (state.tick < esc.until && Math.hypot(e.x - esc.x, e.z - esc.z) > 1 && moveTo(e, unit, esc.x, esc.z, true)) return true;
    // arrived or stuck: resume the old task (a follow order only when the boss is not himself in the zone)
    const boss = Object.values(state.entities).find(h => h.owner === e.owner && h.type === 'hero');
    delete e.campingEscape; delete paths[e.id];
    if (esc.prev && !(esc.prev.kind === 'follow' && boss && boss.place === 'street' && nearRivalHQ(state, e.owner, boss, 0))) e.order = esc.prev;
    e.anim = 'idle';
    return false;
  }
  function crewStep(e, unit) {
    if(e.crewJob&&(e.dead||e.downed||e.jailed||e.deployment?.transfer||stunned(e,state.tick)))crewJobs.cancel(e);
    if(e.deployment?.cleanup&&(e.deployment.transfer||e.deployment.duty?.manual||rally.participating(e)
      ||state.deployment.clans[e.owner]?.sectors[e.deployment.group]?.recovery||state.deployment.clans[e.owner]?.sectors[e.deployment.group]?.operation))sectorCleanup.cancel(e);
    if (e.dead || e.downed || e.jailed) return;
    const escorted = e.lootEscort && state.entities[e.lootEscort.looter];
    if (e.lootEscort && (!escorted || escorted.dead || escorted.downed || escorted.jailed || escorted.order?.kind !== 'loot')) {
      e.order = e.lootEscort.prev || { kind: 'move', x: e.x, z: e.z };
      delete e.lootEscort; delete paths[e.id];
    }
    if (stunned(e, state.tick)) { delete e.swing; e.anim = 'idle'; return; }
    if (e.distracted?.source && diversion.step(e, unit)) return;
    if (contracts?.scrubStep(e)) return;
    if (sweep.scatterStep(e, unit)) return;
    if (deployment.travelStep(e, unit)) return;
    if(crewJobs.step(e,unit))return;
    if (e.taunted && taunt.step(e, unit)) return;
    if (gatling.step(e, unit)) return;   // war checkpoint 7-4: a Gatling crew sets up, fires and packs up on its own (sim/gatling.js)
    if (shakedown.step(e, unit) || sweep.step(e, unit)) return;
    if (sectorRecovery.step(e, unit)) return;
    if (assignments.avoidCamping(e,unit) || freeCampingEscape(e, unit)) return;
    if (distractionStep(e, unit, state, moveTo, u => { delete paths[u.id]; })) return;
    if (diversion.step(e, unit)) return;
    if (rifleman.step(e, unit)) return;
    if (firebomb.step(e, unit)) return;   // war 7c-2: a fire-bomb thrower channels and throws (sim/firebomb.js)
    if (taunt.step(e, unit)) return;
    if (sectorCleanup.step(e,unit)) return;
    if (shinobiAssignments.step(e, unit)) return;
    if (!rally.participating(e) && assignments.step(e, unit)) return;
    if (state.deployment.restrictionsEnabled && e.type !== 'settler' && e.order?.kind === 'follow' && e.deployment?.group !== 'hero' && !rally.participating(e) && !e.lootEscort) {
      e.order = { kind: 'move', x: e.x, z: e.z, arrived: true }; delete paths[e.id];
    }
    const finished = e.order?.kind === 'attack' && state.entities[e.order.target];
    if (finished && (finished.dead || finished.downed || finished.jailed)) { delete e.swing; endAttack(e); }
    if(pursueAttack(e,unit))return;
    indoorDuty(e);
    // Move and an explicit Follow recall reach their goal even under fire. Process
    // it before swings, retaliation, automatic executions or hero assistance.
    const recalling = e.order?.kind === 'follow' && e.order.regrouping;
    if (e.order?.kind === 'follow' && !e.execute && e.place === 'street') {
      const leader = state.entities[e.order.target];
      const door = leader && !leader.dead && !leader.downed && !leader.jailed && leader.place !== 'street'
        && doors.find(d => d.to && !d.ninja && d.place === leader.place);
      if (door && (!businesses || businesses.mayEnter(e, door.place))) {
        delete e.swing; delete e.execute;
        if (fight[e.id]) delete fight[e.id].target;
        if (Math.hypot(door.x - e.x, door.z - e.z) >= DOOR_RADIUS) {
          if (!moveTo(e, unit, door.x, door.z, false)) e.anim = 'idle';
        } else {
          const [x, z] = navOf(door.place)?.nearestFree(door.to.x, door.to.z) || [door.to.x, door.to.z];
          Object.assign(e, { x, z, place: door.place, anim: 'idle' });
          e.order.exitWithHero = true;
          delete paths[e.id];
        }
        return;
      }
    }
    if ((e.order?.kind === 'move' && !e.order.arrived) || recalling) {
      delete e.swing; delete e.execute;
      if (fight[e.id]) delete fight[e.id].target;
      if (crewOut(e, unit)) return;
      const goal = crewGoal(e);
      if (goal && Math.hypot(goal.x - e.x, goal.z - e.z) >= goal.near) {
        if (!moveTo(e, unit, goal.x, goal.z, goal.walk)) e.anim = 'idle';
        return;
      }
      if (recalling) delete e.order.regrouping;
      else e.order.arrived = true;
      // Hits during retreat are stale once we get back. A fresh assault after
      // arrival can still provoke normal defense unless Smoke granted passivity.
      e.order.recalledAt = state.tick;
      e.anim = 'idle'; delete paths[e.id];
      return;
    }
    // war checkpoint 6: on a raze order the unit walks to the structure and hits it (sim/frontier/structures.js);
    // one that came from an attack-move drops it for any enemy unit that shows up
    if (e.order?.kind === 'raze') {
      const o = e.order;
      if (o.from === 'attackmove') {
        e.order = { kind: 'attackmove', x: o.ax, z: o.az };
        const foe = crewTarget(e);
        if (foe) { if (e.swing?.structure) delete e.swing; engage(e, unit, foe); return; }
        e.order = o;
      }
      if (structures()?.step(e, unit)) return;
    }
    if (e.execute && executeStep(e, unit)) return;
    if (swingStep(e, unit)) return;
    if (e.order?.kind === 'loot') {   // Ctrl + right-click on a body: walk there and take its ryo
      if (lootStep(e, unit, e.order.target)) return;
      e.order = e.order.prev || { kind: 'move', x: e.x, z: e.z };
    }
    if (e.order?.kind === 'enter' && enterStep(e)) return;
    if (crewOut(e, unit)) return;
    const t = crewTarget(e);
    if (t) { engage(e, unit, t); return; }
    if (fight[e.id]) delete fight[e.id].target;
    // attack-move with nobody to fight: go for an enemy structure of a war in reach (checkpoint 6)
    if (e.order?.kind === 'attackmove' && e.place === 'world' && state.tick % 10 === 0) {
      const st = structures()?.pick(e);
      if (st) { e.order = { kind: 'raze', structure: st.key, x: st.x, z: st.z, from: 'attackmove', ax: e.order.x, az: e.order.z }; delete paths[e.id]; return; }
    }
    if (botExecute(e)) return;
    const goal = crewGoal(e);
    const dist = goal ? Math.hypot(goal.x - e.x, goal.z - e.z) : 0;
    if (!goal || dist < goal.near) {
      e.anim = 'idle'; delete paths[e.id];
      // arrived: hold there. On the island an attack-move stays on (Tim 2026-11-13: attack at will, anyone in reach, until a
      // Stop or a new move order); in town it becomes a plain hold
      if (e.order?.kind === 'attackmove') { if (e.place === 'world') e.order.arrived = true; else e.order = { kind: 'move', x: e.order.x, z: e.order.z }; }
      if (e.order?.kind === 'heal') {                                       // at the clinic door: go in (or wait if broke)
        if (clans?.hitWait(e) > 0) return;                                  // hit lately: wait at the door till it's safe (Tim 2026-10-20)
        if (clans?.checkIn(e)) { delete state.entities[e.id]; delete intents[e.id]; delete fight[e.id]; return; }
        e.order = { kind: 'move', x: e.order.x, z: e.order.z };
      }
      return;
    }
    if (!moveTo(e, unit, goal.x, goal.z, goal.walk && (goal.stroll || dist < 4))) e.anim = 'idle';
  }

  // Pursue only a visible target or a last-observed public doorway/position.
  // Crossing a door never exposes the enemy's unobserved room coordinates.
  function pursueAttack(e,unit) {
    const o=e.order;if(o?.kind!=='attack')return false;
    const t=state.entities[o.target];if(!t||t.dead||t.downed||t.jailed)return false;
    const visible=sees(e,t);
    if(visible){o.lastSeen={x:t.x,z:t.z,place:t.place};delete o.searchPlace;}
    const last=o.lastSeen;
    if(visible&&!deployment.canActAt(e,t.x,t.z,t.place)){endAttack(e);if(state.clans[e.owner])state.clans[e.owner].notice={tick:state.tick,text:'Pursuit stopped: target left the assigned sector'};return true;}
    if(t.place===e.place&&visible)return false;
    if(e.swing)delete e.swing;
    if(o.searchPlace===e.place&&!visible){e.anim='idle';return true;}
    let goal=null;
    if(t.place!==e.place){
      if(e.place==='street'){
        const candidates=doors.filter(d=>d.to&&!d.ninja&&d.place!=='street'&&(visible?d.place===t.place:last?.place==='street'&&Math.hypot(last.x-d.x,last.z-d.z)<DOOR_RADIUS+2));
        const d=candidates.sort((a,b)=>Math.hypot(a.x-(last?.x??e.x),a.z-(last?.z??e.z))-Math.hypot(b.x-(last?.x??e.x),b.z-(last?.z??e.z)))[0];
        if(d)goal={x:d.to.x,z:d.to.z,place:d.place};
      }else{
        const room=rooms.find(r=>r.name===e.place),d=room&&doors.find(d=>!d.ninja&&d.place==='street'&&d.to&&d.x===room.exit.x&&d.z===room.exit.z);
        if(d&&(visible||(last?.place===e.place&&Math.hypot(last.x-d.x,last.z-d.z)<DOOR_RADIUS+2)))goal={...d.to,place:'street'};
      }
    }else if(last?.place===e.place)goal={...last};
    if(!goal&&last?.place===e.place)goal={...last};
    if(!goal){e.anim='idle';return true;}
    const allowed=goal.place==='street'?{ok:true}:businesses?.entryStatus(e,goal.place)||{ok:true};
    const result=allowed.ok?deployment.localTravel(e,unit,goal):'blocked';
    if(result==='blocked'){
      endAttack(e);delete paths[e.id];e.anim='idle';
      if(state.clans[e.owner])state.clans[e.owner].notice={tick:state.tick,text:`Pursuit stopped: ${allowed.ok?'door or sector route is blocked':allowed.why}`};
      return true;
    }
    if(goal.place!==last?.place)o.searchPlace=goal.place;
    if(result==='arrived')e.anim='idle';return true;
  }

  // Entered crew keep guarding even when their leader visits. Explicit orders
  // take control; leaving them behind again restores duty once that task ends.
  function indoorDuty(e) {
    if (e.guard || e.wild || e.cop) return;
    if (e.place === 'street' || e.place === 'world') { delete e.indoorDuty; delete e.patrol; return; }   // the island (W3) is outdoors too
    const leader = Object.values(state.entities).find(h => h.type === 'hero' && h.owner === e.owner);
    const present = leader && !leader.dead && !leader.jailed && leader.place === e.place;
    const o = e.order;
    if (e.indoorDuty?.room !== e.place) e.indoorDuty = { room: e.place, present: !!present, resume: !present && (!o || o.kind === 'follow') };
    if (e.indoorDuty.present && !present) e.indoorDuty.resume = true;
    e.indoorDuty.present = !!present;
    const busy = e.execute || (o && ['attack', 'attackmove', 'heal', 'enter', 'loot'].includes(o.kind)) || (o?.kind === 'move' && !o.arrived);
    if (e.indoorDuty.resume && !busy) {
      e.order = { kind: 'station', x: e.x, z: e.z, garrison: true };
      delete paths[e.id]; delete e.patrol;
      e.indoorDuty.resume = false;
    }
    if (e.execute || !e.order?.garrison || e.order.kind !== 'station') return;
    businesses?.patrolCrew(e);
  }

  // At the door of the business they were sent into: step inside and hold a spot near the way in
  // (a station order: they fight whoever comes in, then go back to it)
  function enterStep(e) {
    const o = e.order, d = doors.find(d => d.to && d.place === o.room && !d.ninja === !o.window);
    if (!d) { e.order = { kind: 'move', x: e.x, z: e.z }; return false; }
    if (Math.hypot(d.x - e.x, d.z - e.z) >= DOOR_RADIUS || (businesses && !businesses.mayEnter(e, d.place))) return false;
    const [ox, oz] = blockOffset(o.k, o.n);
    const [x, z] = navOf(d.place)?.nearestFree(d.to.x + ox, d.to.z + oz) || [d.to.x, d.to.z];
    Object.assign(e, { x, z, place: d.place, anim: 'idle' });
    delete paths[e.id]; delete e.swing;
    delete e.patrol;
    if (fight[e.id]) delete fight[e.id].target;
    e.order = { kind: 'station', x, z, garrison: true };
    return true;
  }

  // Crew standing on each other get nudged apart a little every tick
  return { crewStep };
}
