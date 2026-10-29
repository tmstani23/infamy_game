// Looting bodies and executing downed units (hero and crew).
// Moved out of sim/game.js (phase 7 split, 2026-10-29); game.js passes in what it shares.
import { dirIndex } from './geometry.js';
import { TICK_RATE } from './game.js';
export function createLootExecute({ AGGRO, LOOT_REACH, addHeat, anchorOf, civ, cop, deployment, downedFoe, fight, freeSlot, heatFor, hostile, lootable, manualCrew, moveTo, paths, police, removeUnit, resumable, rewards, rng, secs, sees, state, units }) {
  function startLoot(e, c) {
    const body = state.entities[c.target];
    if (e.type !== 'hero') return;
    const heroReady = !e.dead && !e.downed && !e.jailed && !c.crewOnly;
    if (heroReady && c.preferHeroInRange && lootable(e, body) && Math.hypot(e.x - body.x, e.z - body.z) <= LOOT_REACH) {
      delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id];
      e.lootTarget = body.id;
      return;
    }
    if (Array.isArray(c.units) && c.units.length) {
      const selected = c.units.map(id => state.entities[id])
        .filter(u => u && !u.dead && !u.downed && !u.jailed && u.owner === e.owner && u.type !== 'hero' && !u.guard && lootable(u, body))
        .sort((a, b) => Math.hypot(a.x - body.x, a.z - body.z) - Math.hypot(b.x - body.x, b.z - body.z));
      const u = selected[0];
      if (!u) return;
      manualCrew(u);
      delete paths[u.id]; delete u.execute; delete u.swing;
      if (fight[u.id]) delete fight[u.id].target;
      const previous = resumable(u);
      u.order = { kind: 'loot', target: body.id, prev: previous };
      if (previous?.kind !== 'follow') for (const other of selected.slice(1)) {
        const prev = resumable(other);
        if (prev?.kind === 'follow') continue;
        manualCrew(other);
        delete paths[other.id];
        other.lootEscort = { looter: u.id, prev };
        other.order = { kind: 'follow', target: u.id, slot: freeSlot(u.id, other.id) };
      }
      return;
    }
    if (!heroReady || e.execute || !lootable(e, body)) return;
    delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id];
    e.lootTarget = body.id;
  }
  // One tick of walking to a body; true while busy with it (takes the ryo once in reach)
  function lootStep(e, unit, id) {
    const body = state.entities[id];
    if (!lootable(e, body)) return false;
    if (Math.hypot(body.x - e.x, body.z - e.z) <= LOOT_REACH) {
      const clan = state.clans?.[e.owner];
      if (clan) {
        clan.ryo += body.loot;
        state.ryoGains.push({ clan: clan.id, amount: body.loot, reason: `${body.type === 'night_brute' ? 'Night brute' : 'Bandit'} looted` });
        state.casts.push({ kind: 'loot', a: e.id, x: body.x, z: body.z, ryo: body.loot });
      }
      delete body.loot;   // the body then fades like any other
      e.anim = 'idle';
      return false;
    }
    if (!moveTo(e, unit, body.x, body.z, false)) return false;
    return true;
  }

  function startExecute(e, c, assignmentOperation = false) {
    const t = state.entities[c.target];
    const heroReady = e.type === 'hero' && !e.dead && !e.downed && !e.jailed && !c.crewOnly;
    // Police and bots also call this directly without a selected crew list.
    let ex = !e.dead && !e.downed && !e.jailed && !c.crewOnly ? e : null;
    if (Array.isArray(c.units) && c.units.length && !(heroReady && c.preferHeroInRange && e.place === t?.place && Math.hypot(e.x - t?.x, e.z - t?.z) <= 1.3)) {
      ex = c.units.map(id => state.entities[id])
        .filter(u => u && !u.dead && !u.downed && !u.jailed && u.owner === e.owner && u.type !== 'hero' && !u.guard && (!c.broadcast || u.place === 'street') && u.place === t?.place && deployment.canActAt(u, t.x, t.z, t.place))
        .sort((a, b) => t ? Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z) : 0)[0];
    }
    if (!ex || ex.dead || ex.downed || (ex === e && e.type === 'hero' && e.execute) || !downedFoe(ex, state.entities[c.target]) || !sees(ex, state.entities[c.target])) return;
    if (!assignmentOperation && e.type === 'hero' && ex.type !== 'hero') manualCrew(ex);
    delete ex.smokePassive; delete ex.holdFire;
    delete ex.swing;
    delete ex.attackTarget;
    delete paths[ex.id];
    if (fight[ex.id]) delete fight[ex.id].target;
    ex.execute = { target: c.target, start: null, len: secs(units?.rules?.executeSeconds || 3) };
  }
  // An executed enemy (not townsfolk) pays the executor's clan its type's executeRyo, ±executeRyoSpread
  // (state.ryoGains for the badge notice; cast.ryo tells the view to burst coins)
  function payExecute(e, t, cast) {
    const clan = state.clans?.[e.owner], base = units?.types?.[t.type]?.executeRyo || 0;
    if (!clan || !base || !state.clans?.[t.owner] || t.owner === e.owner) return;
    const k = units.rules.executeRyoSpread ?? 0, amount = Math.round(base * (1 - k + rng() * 2 * k));
    clan.ryo += amount;
    cast.ryo = amount;
    const name = units.types[t.type].name || t.type[0].toUpperCase() + t.type.slice(1);
    const victimClan = state.clans[t.owner].name || t.owner;
    state.ryoGains.push({ clan: clan.id, amount, target: t.id, reason: `${victimClan} ${name.toLowerCase()} executed` });
  }
  // One tick of an execute; false when there is nothing (left) to do
  function executeStep(e, unit) {
    const x = e.execute, t = state.entities[x.target];
    if (!downedFoe(e, t)) { delete e.execute; return false; }
    if (Math.hypot(t.x - e.x, t.z - e.z) > 1.3) {
      x.start = null;
      if (!moveTo(e, unit, t.x, t.z, false)) { delete e.execute; return false; }
      return true;
    }
    delete paths[e.id];
    e.anim = 'idle';
    e.dir = dirIndex(t.x - e.x, t.z - e.z);
    if (x.start === null) x.start = state.tick;
    if (state.tick - x.start < x.len) return true;
    // police arrest instead: the unit goes to jail (sim/police.js), nobody dies
    if (cop(e)) {
      state.casts.push({ a: e.id, kind: 'arrest', target: t.id, x: t.x, z: t.z });
      if (t.type === 'hero') police.jailHero(t);
      else { police.jail(t); removeUnit(t.id); }
      delete e.execute;
      return true;
    }
    delete t.downed;
    t.dead = true;
    t.diedAt = state.tick;
    state.casts.push({ a: e.id, kind: 'execute', target: t.id, x: t.x, z: t.z });
    if (civ(t)) { addHeat(e.owner, heatFor('kill'), 'Townsperson killed'); police?.witnessAssault(e, t); }
    else {
      payExecute(e, t, state.casts[state.casts.length - 1]);
      rewards.crewExecuted(e, t);
    }
    delete e.execute;
    return true;
  }

  // Bots: once a second an idle bot crew member looks for a downed enemy within AGGRO of
  // where it belongs, or within carryRadius of itself (so nothing it keeps from being
  // carried off is out of its reach). It only goes when that is safe (no standing enemy
  // within SAFE of the downed unit), and then on a roll against its clan's aggression,
  // made again every second (a once-only "no" left crew lying there for good); pricier
  // unit types are picked first.
  const SAFE = 5;
  function botExecute(e) {
    const clan = state.clans?.[e.owner];
    if (!clan?.bot || e.holdFire || (state.tick + Number(e.id)) % TICK_RATE) return false;
    const [ax, az] = anchorOf(e), reach = units?.rules?.carryRadius ?? 8;
    const price = t => units?.types[t.type]?.price || 0;
    const options = Object.values(state.entities).filter(t => downedFoe(e, t) && !civ(t)
      && (Math.hypot(t.x - ax, t.z - az) < AGGRO || Math.hypot(t.x - e.x, t.z - e.z) < reach)
      && !Object.values(state.entities).some(o => o.execute?.target === t.id)
      && !Object.values(state.entities).some(o => hostile(e, o) && Math.hypot(o.x - t.x, o.z - t.z) < SAFE));
    if (!options.length || rng() >= (clan.aggression ?? 0.5)) return false;
    options.sort((a, b) => price(b) - price(a) || Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z));
    startExecute(e, { target: options[0].id });
    return !!e.execute;
  }
  return { botExecute, executeStep, lootStep, startExecute, startLoot };
}
