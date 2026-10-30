// Combat: targets, crew attack sync, swings, hits, heat and carrying off the downed.
// Moved out of sim/game.js (phase 7 split, 2026-10-29); game.js passes in what it shares.
import { charmProtected } from './charm_rules.js';
import { dirIndex } from './geometry.js';
import { stunned } from './kuroda.js';
import { DT } from './game.js';
export function createCombat({ options, BACKUP_RANGE, LOCK_RANGE, RETALIATE_SECONDS, AGGRO, LEASH, atHome, attackAllowed, bandits, civ, clans, contracts, cop, diversion, fair, fight, freeSlot, heatFor, hostile, intents, kuroda, leader, moveTo, nav, paths, police, reachOf, rewards, rifleman, secs, sees, state, stats, stealth, territory, units, wild, clearShot=()=>true }) {
  state.projectiles||=[];
  function launch(e,t,unit){
    const r=unit.projectile,hamstring=!!r.hamstring&&(e.hamstringReadyAt||0)<=state.tick&&!t.cop&&t.type!=='civilian';
    if(hamstring)e.hamstringReadyAt=state.tick+r.hamstring.cooldownTicks;
    const duration=Math.max(2,Math.ceil(Math.hypot(t.x-e.x,t.z-e.z)/r.speed*20)),crit=rng()<stats.criticalChance(e);
    const p={kind:r.kind,a:e.id,t:t.id,x:e.x,z:e.z,tx:t.x,tz:t.z,place:e.place,at:state.tick,until:state.tick+duration,damage:Math.round(stats.damage(e)*(crit?unit.critMultiplier||2:1)),crit,hamstring};
    state.projectiles.push(p);state.casts.push({...p,kind:r.kind,flightTicks:duration});stealth.reveal(e,true);
  }
  function projectileTick(){
    const due=state.projectiles.filter(p=>p.until<=state.tick);state.projectiles=state.projectiles.filter(p=>p.until>state.tick);
    for(const p of due){const a=state.entities[p.a],t=state.entities[p.t];
      if(!a||a.dead||a.downed||a.jailed||!t||a.place!==p.place||t.place!==p.place||!attackAllowed(a,t)||!sees(a,t)||!clearShot(a,t))continue;
      if(rng()<stats.dodgeChance(t)){state.dodges.push({a:a.id,t:t.id,x:t.x,z:t.z});continue;}
      const hp=t.hp;hit(a,t,p.damage,p.crit,p.kind);
      if(p.hamstring&&t.hp<hp&&!t.dead&&!t.downed){const r=stats.base(a).projectile.hamstring,old=t.buffs?.snared;
        (t.buffs||={}).snared={until:Math.max(old?.until||0,state.tick+r.durationTicks),speed:Math.min(old?.until>state.tick?old.speed??1:1,r.speed),hamstring:true};
        state.casts.push({kind:'hamstringHit',a:a.id,t:t.id,x:t.x,z:t.z,place:t.place});
      }
    }
  }
  function nearestEnemy(e, x, z, range) {
    let best = null, bd = range;
    for (const t of Object.values(state.entities)) {
      if (!hostile(e, t) || !sees(e, t) || (cop(t) && !cop(e) && !t.wave)) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  // Where a crew member is tied to: its hero, its station, or where it is going
  function anchorOf(e) {
    const o = e.order || {};
    if (o.kind === 'follow') { const h = state.entities[o.target]; return h && !h.dead && h.place === e.place ? [h.x, h.z] : [e.x, e.z]; }
    if (o.kind === 'station' || o.kind === 'move' || o.kind === 'attackmove') return [o.x, o.z];
    return [e.x, e.z];
  }

  // the order a T attack goes back to afterwards: follow, hold / station / move spot, passive stop,
  // or one still on its way (attack-move, going into a business, off to the clinic)
  function resumable(u) {
    const o = u.order?.kind === 'attack' ? u.order.prev : u.order;
    return o && ['follow', 'move', 'station', 'stop', 'attackmove', 'enter', 'heal'].includes(o.kind) ? { ...o } : null;
  }
  // A finished attack holds at the last combat position. Calling an attack off
  // explicitly (a second T) still restores the previous order.
  function endAttack(u, cancelled = false) {
    const p = u.order?.prev;
    const resume = cancelled || !!state.clans?.[u.owner]?.bot;
    if (resume && p?.kind === 'follow') p.slot = freeSlot(p.target, u.id);
    if (!cancelled && u.order?.assist) {
      const h = state.entities[u.order.assist];
      if (h?.assistCrew) h.assistCrew = h.assistCrew.filter(id => id !== u.id);
    }
    u.order = resume && p ? p : { kind: 'move', x: u.x, z: u.z, arrived: true };
    delete paths[u.id];
  }

  // Right-click/Tab assistance follows the leader's changing target. Manual attack
  // orders (T or Ctrl-right-click) and deliberate duties stay independent.
  function setAssistCrew(hero, ids) {
    hero.assistCrew = [...new Set(Array.isArray(ids) ? ids : [])].filter(id => {
      const u = state.entities[id];
      return u && u.owner === hero.owner && u.type !== 'hero' && !u.guard && !u.dead && !u.downed && !u.jailed && u.place === hero.place;
    });
    // A new selection must leave the previous squad doing its existing attack.
    for (const u of Object.values(state.entities)) if (u.order?.assist === hero.id && !hero.assistCrew.includes(u.id)) delete u.order.assist;
  }
  function syncCrewAttacks() {
    const heroes = Object.values(state.entities).filter(e => e.type === 'hero');
    for (const u of Object.values(state.entities)) if (u.order?.assist) {
      const h = state.entities[u.order.assist], t = h && state.entities[h.attackTarget];
      if (!h?.assistCrew?.includes(u.id) || h.dead || h.downed || h.jailed || !fair(h, t) || !sees(h, t)
        || u.place !== h.place || Math.hypot(t.x - h.x, t.z - h.z) > LOCK_RANGE) {
        delete u.swing; endAttack(u);
      }
    }
    for (const h of heroes) {
      const t = state.entities[h.attackTarget];
      if (!h.assistCrew?.length || h.dead || h.downed || h.jailed || !fair(h, t) || !sees(h, t)
        || Math.hypot(t.x - h.x, t.z - h.z) > LOCK_RANGE) continue;
      for (const u of Object.values(state.entities)) {
        if (!h.assistCrew.includes(u.id) || u.owner !== h.owner || u.type === 'hero' || u.guard || u.dead || u.downed || u.jailed || u.smokePassive || u.place !== h.place || !fair(u, t)) continue;
        const o = u.order;
        if (o?.kind === 'move' && !o.arrived) continue; // finish a deliberate move before joining the hero
        if (o?.kind === 'attack' && o.assist !== h.id) continue;
        if ((o?.kind === 'station' && !o.garrison) || ['stop', 'heal', 'enter', 'loot'].includes(o?.kind) || u.execute) continue;
        if (o?.assist === h.id && o.target === t.id) continue;
        const prev = resumable(u);
        if (prev?.garrison) {
          delete prev.garrison; delete prev.patrol; delete u.patrol;
          if (u.indoorDuty) u.indoorDuty.resume = false;
        }
        delete u.swing; delete u.holdFire; delete paths[u.id];
        if (fight[u.id]) delete fight[u.id].target;
        u.order = { kind: 'attack', target: t.id, assist: h.id, prev, followLeader: h.id };
      }
    }
  }

  // Who this crew member should be fighting right now, if anyone
  function crewTarget(e) {
    const o = e.order || {};
    if (o.kind === 'stop') return null;                  // passive (Z): never picks a fight
    if (e.holdFire) return null;                         // smoke escort stays passive until an explicit combat order
    if (o.kind === 'attack') {
      const t = state.entities[o.target];
      // A deliberate order keeps tracking a visible-at-order-time enemy across fog and screens.
      // Stealth still breaks the lock; a recall or new order replaces it.
      if (attackAllowed(e, t) && !(t.hidden && t.owner !== e.owner)) return t;
      endAttack(e);                                    // target gone: back to the old order, or stand there
      return null;
    }
    // a plain move ignores enemies until it arrives (RTS rule); everything else fights back
    if (o.kind === 'move' && !o.arrived) return null;
    if ((o.kind === 'heal' || o.kind === 'enter') && Math.hypot(o.x - e.x, o.z - e.z) > 0.6) return null;
    // first stop anyone finishing off one of our downed crew nearby
    const executor = Object.values(state.entities).find(t => t.execute && hostile(e, t) && !cop(t)
      && state.entities[t.execute.target]?.owner === e.owner && Math.hypot(t.x - e.x, t.z - e.z) < AGGRO);
    if (executor) return executor;
    const [ax, az] = anchorOf(e);
    // crew of every clan, bots too, only pick fights on an attack-move, while stationed in a business, or
    // inside a business being raided or attacked (Tim 2026-10-19/20). Otherwise they swing back at whoever
    // hit them, or at whoever hit their boss or a mate within BACKUP_RANGE. House guards keep auto-aggro
    const raidRoom = e.place !== 'street' && Object.values(state.attacks || {}).some(a => a.room === e.place && a.phase !== 'over');
    if (!e.guard && o.kind !== 'attackmove' && o.kind !== 'station' && !raidRoom) {
      const attacker = u => {
        const by = u.hitBy && state.tick - u.hitBy.tick < secs(RETALIATE_SECONDS) && state.entities[u.hitBy.id];
        return by && u.hitBy.tick > (o.recalledAt ?? -1) && hostile(e, by) && (!cop(by) || by.wave) && Math.hypot(by.x - ax, by.z - az) < LEASH ? by : null;
      };
      const own = attacker(e);
      if (own) return own;
      for (const u of Object.values(state.entities)) {
        if (u === e || u.owner !== e.owner || u.dead || u.place !== e.place || Math.hypot(u.x - e.x, u.z - e.z) > BACKUP_RANGE) continue;
        const by = attacker(u);
        if (by) return by;
      }
      return null;
    }
    const f = fight[e.id];
    const old = f && state.entities[f.target];
    if (hostile(e, old) && (!cop(old) || old.wave) && Math.hypot(old.x - ax, old.z - az) < LEASH) return old;
    return nearestEnemy(e, e.x, e.z, AGGRO);
  }

  // Close in on the target, then swing at it every attackSpeed seconds. A swing has a
  // wind-up and the damage lands on the strike (STRIKE of the way through), Dota-style;
  // e.swing is in the state so the renderer can time the animation to it.
  const STRIKE = 0.4;
  const swingTicks = unit => Math.max(4, Math.round(Math.min(unit.attackSpeed * 0.85, unit.swingSeconds || 0.7) / DT));
  function engage(e, unit, t, chase = true) {
    if(!attackAllowed(e,t)){delete e.swing;if(fight[e.id])delete fight[e.id].target;return;}
    if (stunned(e, state.tick)) { delete e.swing; e.anim = 'idle'; return; }
    const f = fight[e.id] ||= { cd: 0 };
    // never chase into another place (Tim 2026-10-28: ambush ninja kept running into a building's wall after a target who went inside)
    if (t.place !== e.place) { delete f.target; if (!e.swing) e.anim = 'idle'; return; }
    f.target = t.id;
    if (e.swing) return;                                   // mid-swing: finish it (see swingStep)
    const d = Math.hypot(t.x - e.x, t.z - e.z);
    // a townsperson running away gets away during the wind-up: get right up close first
    const running = chase && civ(t) && t.flee;
    if (d > reachOf(e, t) * (running ? 0.5 : 1)||(unit.projectile&&!clearShot(e,t))) {
      if (chase) {
        // close in on a spot round the target so several attackers surround it instead of queueing
        const [sx, sz] = running || (unit.projectile&&!clearShot(e,t)) ? [t.x, t.z] : surroundSpot(e, t);
        if (moveTo(e, unit, sx, sz, false)) return;
      }
      e.anim = 'idle';
      return;
    }
    delete paths[e.id];
    // turn toward the target one eighth per tick instead of snapping round
    const want = dirIndex(t.x - e.x, t.z - e.z), diff = (want - e.dir + 8) % 8;
    if (diff) { e.dir = (e.dir + (diff <= 4 ? 1 : 7)) % 8; if (diff !== 1 && diff !== 7) { e.anim = 'idle'; return; } }
    if (f.cd > 0) { e.anim = 'idle'; return; }
    const speed = stats.attackInterval(e);
    const len = swingTicks({ ...unit, attackSpeed: speed });
    e.swing = { start: state.tick, len, strike: state.tick + Math.round(len * STRIKE), target: t.id };
    e.anim = 'attack';
    f.cd = speed;
  }

  // Where an attacker should stand round its target: spread out by how many are on it
  function surroundSpot(e, t) {
    const on = Object.values(state.entities).filter(u => u.type !== 'hero' && !u.dead && fight[u.id]?.target === t.id).map(u => u.id).sort();
    const n = on.length, k = Math.max(0, on.indexOf(e.id));
    const r = reachOf(e, t) * 0.8, a = Math.atan2(e.z - t.z, e.x - t.x) + (n > 1 ? (k - (n - 1) / 2) * 0.9 : 0);
    const spot = [t.x + Math.cos(a) * r, t.z + Math.sin(a) * r];
    return t.place === 'street' ? nav.nearestFree(...spot) || [t.x, t.z] : spot;
  }

  // Swings in progress: land the hit on the strike tick (if the target is still in reach), end the swing
  function swingStep(e, unit) {
    if (stunned(e, state.tick)) { delete e.swing; e.anim = 'idle'; return true; }
    const w = e.swing;
    if (!w) return false;
    if (state.tick === w.strike) {
      const t = state.entities[w.target];
      if (attackAllowed(e, t) && sees(e, t) && Math.hypot(t.x - e.x, t.z - e.z) <= reachOf(e, t) + 0.6 && (!unit.projectile||clearShot(e,t))) {
        if(unit.projectile){launch(e,t,unit);}
        else {
        const dodge = stats.dodgeChance(t);
        if (dodge && rng() < dodge) {
          stealth.reveal(e, true); // attempting an attack still consumes the attacker's veil
          state.dodges.push({ a: e.id, t: t.id, x: t.x, z: t.z });
        } else {
          const crit = rng() < stats.criticalChance(e);
          const damage = Math.round(stats.damage(e) * (crit ? unit.critMultiplier || 2 : 1));
          hit(e, t, damage, crit);
          kuroda.weaponHit(e, t, damage);
        }
        }
      }
    }
    if (state.tick >= w.start + w.len) { delete e.swing; return false; }
    e.anim = 'attack';
    return true;
  }

  // Small seeded random numbers, so a game replays the same way from the same seed
  let seed = (options.seed ?? 12345) >>> 0;
  function rng() {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let x = seed;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }

  // Heat: a number per clan for trouble caused in the street (townsfolk hurt or killed),
  // cooling by 1 every heatCoolSeconds. Nothing reacts to it yet.
  // state.heatGains = this tick's rises ({ clan, amount, reason }), for the heat pop-ups
  // c.infamy = lifetime heat (stand-in until the infamy board); the top-infamy clan gains more (police.heatScale)
  function addHeat(owner, n, reason, scale = true) {
    const c = state.clans?.[owner];
    if (!c || !n) return;
    c.infamy = (c.infamy || 0) + n;
    n = Math.round(n * (scale ? police?.heatScale(owner) ?? 1 : 1));
    c.heat = (c.heat || 0) + n;
    state.heatGains.push({ clan: owner, amount: n, reason });
  }
  function coolHeat() {
    const every = secs(units?.rules?.heatCoolSeconds || 10);
    if (!state.clans) return;
    // laying low: with the boss inside the hideout heat cools heatCoolFactor times as fast
    const f = units?.rules?.hideout?.heatCoolFactor ?? 1, fast = Math.max(1, Math.round(every / f));
    for (const c of Object.values(state.clans)) {
      if (!(c.heat > 0)) continue;
      const boss = Object.values(state.entities).find(e => e.owner === c.id && e.type === 'hero');
      // in your own territory it cools every territory.heatCoolSeconds (sim/territory.js)
      const turf = territory.inOwn(boss) ? Math.max(1, Math.min(every, secs(territory.rules.heatCoolSeconds))) : every;
      if (state.tick % (atHome(boss) ? Math.min(fast, turf) : turf) === 0) c.heat = Math.max(0, c.heat - 1);
    }
  }

  function hit(a, t, damage, crit = false, kind = null) {
    if(charmProtected(a,t,state))return;
    // Assassinate's explicit current-health rule stays exact inside a formation.
    if (kind !== 'assassinate') damage = Math.round(damage * stats.damageTaken(t));
    stealth.reveal(a, true); stealth.reveal(t);   // outgoing hits consume the smoke veil; incoming hits cannot reveal it
    t.hp = Math.max(0, t.hp - damage);
    t.hitAt = state.tick; a.struckAt = state.tick;   // struckAt: Unstuck waits after a fight (sim/unstuck.js)
    contracts?.interruptScrub(t);
    diversion.interrupted(t);
    rifleman.interrupted(t);
    t.hitBy = { id: a.id, tick: state.tick };   // a hero only swings back at whoever hit him (below)
    if (damage > 0) kuroda.damaged(t, a);
    delete t.execute;                // a hit breaks an execute channel
    // this tick's hits, for damage numbers and effects (cleared every tick)
    state.hits.push({ a: a.id, t: t.id, damage, crit, kill: t.hp <= 0, x: t.x, z: t.z, dir: a.dir, weapon: a.model, ...(kind ? { kind } : {}) });
    // Red Lantern: heal part of the damage dealt
    const steal = stats.lifesteal(a);
    if (steal && !a.dead && a.maxHp) a.hp = Math.min(a.maxHp, a.hp + damage * steal);
    if (civ(t)) addHeat(a.owner, heatFor('hit'), 'Assault');
    if (civ(t) && t.hp <= 0) addHeat(a.owner, heatFor('down'), 'Townsperson beaten down');
    if (civ(t)) police?.witnessAssault(a, t);
    if (wild(t)) bandits.provoke(t, a.owner);
    if (cop(a)) t.copHitAt = state.tick;     // the police box won't take a bribe right after (sim/police.js)
    // who fought where, for the police (a patrol goes to a clan's last fight, and for units seen fighting)
    if (state.clans?.[a.owner]) {
      a.foughtAt = state.tick;
      if (a.place === 'street') state.clans[a.owner].lastFight = { x: a.x, z: a.z, tick: state.tick };
      // officers defending a business you attack (e.wave) give attack.hitHeat instead: the attack already costs heat when won
      if (cop(t)) { addHeat(a.owner, t.wave ? units?.rules?.attack?.hitHeat ?? 0 : police.rules.hitPoliceHeat, 'Assaulting police'); police.provoke(t, a.owner); }
    }
    if (t.hp > 0) return;
    if (t.type === 'hero') {
      delete t.assistCrew;
      for (const u of Object.values(state.entities)) if (u.owner === t.owner && u.order?.kind === 'follow' && u.order.target === t.id) {
        u.order = { kind: 'move', x: u.x, z: u.z, arrived: true };
        delete paths[u.id];
      }
    }
    delete t.swing;
    delete t.dash;
    delete t.buffs;
    kuroda.cancel(t);
    delete paths[t.id];
    delete fight[t.id];
    t.anim = 'death';
    // Bandits leave their money on the body for whoever loots it.
    if (wild(t)) { t.dead = true; t.diedAt = state.tick; bandits.killed(a, t); return; }
    // an officer knocked out is taken away (the HQ sends another)
    if (cop(t)) { t.dead = true; t.diedAt = state.tick; police.knockedOut(t); return; }
    // house guards (sim/businesses.js) die outright; the business sends a new one later
    if (t.guard) { t.dead = true; t.diedAt = state.tick; return; }
    // crew go down, not dead: an enemy can finish them with an execute (see executeStep)
    if (t.type !== 'hero') { t.downed = true; t.downedAt = state.tick; leader.downed(a, t); return; }
    // the police knock the hero down instead, and an officer arrests him (a channel only his crew can break)
    state.news.push({ kind: 'bossDown', clan: t.owner, hero: t.id, by: a.owner || null, x: t.x, z: t.z });
    if (cop(a) && police) { t.downed = true; t.downedAt = state.tick; return; }
    rewards.leaderDown(a, t);
    leader.downed(a, t);
    t.dead = true;
    t.anim = 'death';
    t.diedAt = state.tick;
    delete paths[t.id];
    delete fight[t.id];
  }

  // Downed units remain executable/arrestable for the configured window. An
  // already-started execution or arrest may finish before the body is carried.
  function carryOffDowned() {
    const r = units?.rules || {};
    for (const e of Object.values(state.entities)) {
      if (!e.downed || e.dead) continue;
      e.downedAt ??= state.tick;
      if (state.tick - e.downedAt < secs(r.downedMinSeconds ?? 20)) continue;
      if (Object.values(state.entities).some(o => o.execute?.target === e.id && Number.isFinite(o.execute.start))) continue;
      // a hero the police knocked down but nobody arrested: knocked out as usual (up at the clinic)
      if (e.type === 'hero') { delete e.downed; e.dead = true; e.diedAt = state.tick; continue; }
      if (!civ(e) && !clans?.carryOff(e)) continue;      // townsfolk are helped home (sim/civilians.js sends a new one out later)
      delete state.entities[e.id];
      delete intents[e.id];
      for (const u of Object.values(state.entities)) if (u.order?.target === e.id && u.order.kind === 'attack') endAttack(u);
    }
  }
  return { addHeat, anchorOf, carryOffDowned, coolHeat, crewTarget, endAttack, engage, hit, nearestEnemy, resumable, rng, setAssistCrew, swingStep, syncCrewAttacks, projectileTick };
}
