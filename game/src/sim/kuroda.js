// Kuroda's counter, spear sequence and fixed formation. Plain state only;
// damage, visibility and orders use the same game hooks for humans and bots.
import { dirIndex } from './geometry.js';

export const stunned = (e, tick) => (e.buffs?.stunned?.until ?? 0) > tick;
export const KURODA_KINDS = new Set(['sweep', 'reprisal', 'threefold', 'formation']);

export function createKuroda({ state, statsOf, fair, sees, reachOf, hit, addBuff, damageScale, clearCombat, clearLine, civilian, cop }) {
  const secs = n => Math.round(n * 20);
  const alive = e => e && !e.dead && !e.downed && !e.jailed;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const within = (f, e) => f.until > state.tick && f.clan === e.owner && f.place === e.place && distance(f, e) <= f.radius;
  const formationOf = e => (state.formations || []).filter(f => within(f, e)).sort((a, b) => a.damageTaken - b.damageTaken)[0];
  const emit = (e, kind, extra = {}) => state.casts.push({ a: e.id, kind, x: e.x, z: e.z, dir: e.dir, place: e.place, ...extra });
  // Secondary hits never start fights with townsfolk or street police. Wave
  // officers, or a police target the player explicitly selected, are allowed.
  const secondary = (a, t, primary) => alive(t) && !civilian(t) && fair(a, t) && sees(a, t)
    && (!cop(t) || t.wave || cop(primary)) && clearLine(a, t);

  function cleave(a, target, damage) {
    const b = a.buffs?.reprisal;
    if (!b || b.until <= state.tick) return;
    for (const t of Object.values(state.entities)) {
      if (t === target || !secondary(a, t, target) || distance(target, t) > b.radius) continue;
      hit(a, t, Math.round(damage * b.splash), false, 'cleave');
    }
    emit(a, 'cleave', { tx: target.x, tz: target.z, radius: b.radius });
  }

  function weaponHit(a, t, damage, normal = true) {
    const counter = a.buffs?.reprisal;
    if (normal && counter?.until > state.tick && counter.stunPending) {
      counter.stunPending = false;
      if (alive(t)) {
        addBuff(t, 'stunned', counter.stunSeconds);
        clearCombat(t);
        delete t.brace; delete t.spearCombo; delete t.dash;
        emit(a, 'counterstun', { target: t.id, tx: t.x, tz: t.z });
      }
    }
    const f = formationOf(a);
    if (f && alive(t)) {
      const slow = t.buffs?.snared;
      // Formation's light slow must not replace a stronger Sweeping Cut,
      // Intimidate or Distract snare that is still running.
      if (!slow || slow.until <= state.tick || slow.speed >= f.snareSpeed)
        addBuff(t, 'snared', f.snareSeconds, { speed: f.snareSpeed, style: 'kuroda' });
    }
    cleave(a, t, damage);
  }

  function damaged(t) {
    const b = t.brace;
    delete t.brace;
    if (!b || b.until <= state.tick || !alive(t)) return;
    if (t.buffs) delete t.buffs.pursuit;
    addBuff(t, 'reprisal', b.seconds, { splash: b.splash, radius: b.radius, stunSeconds: b.stunSeconds, stunPending: true });
    emit(t, 'counter', { seconds: b.seconds });
  }

  function cast(e, a, c) {
    if (e.brace || e.spearCombo || e.spearSweep) return null;
    if (a.kind === 'sweep') {
      e.spearSweep = { start: state.tick, until: state.tick + secs(.45), len: secs(.45) };
      for (const t of Object.values(state.entities)) {
        if (!secondary(e, t, null) || distance(e, t) > a.radius) continue;
        hit(e, t, Math.round(statsOf(e).damage * damageScale(e) * a.damageMultiplier), false, 'sweep');
        if (alive(t)) addBuff(t, 'snared', a.snareSeconds, { speed: a.snareSpeed, style: 'kuroda' });
      }
    } else if (a.kind === 'reprisal') {
      clearCombat(e);
      e.brace = { start: state.tick, until: state.tick + secs(a.channelSeconds), seconds: a.seconds,
        splash: a.splash, radius: a.radius, stunSeconds: a.stunSeconds, escapeSpeed: a.escapeSpeed, escapeSeconds: a.escapeSeconds };
    } else if (a.kind === 'threefold') {
      let t = state.entities[c.target];
      const inReach = u => alive(u) && fair(e, u) && sees(e, u) && distance(e, u) <= reachOf(e, u) && clearLine(e, u);
      if (!inReach(t)) {
        if (!Number.isFinite(c.x) || !Number.isFinite(c.z)) return null;
        t = Object.values(state.entities).filter(inReach).filter(u => Math.hypot(u.x - c.x, u.z - c.z) < 1.5)
          .sort((u, v) => Math.hypot(u.x - c.x, u.z - c.z) - Math.hypot(v.x - c.x, v.z - c.z))[0];
      }
      if (!t) return null;
      clearCombat(e);
      e.spearCombo = { target: t.id, start: state.tick, until: state.tick + secs(a.seconds),
        strikes: a.strikes, landed: 0, multiplier: a.damageMultiplier, interval: secs(a.seconds / a.strikes), next: state.tick + secs(0.15) };
      e.dir = dirIndex(t.x - e.x, t.z - e.z);
      return { target: t.id, tx: t.x, tz: t.z };
    } else if (a.kind === 'formation') {
      // Refresh this leader's zone rather than stacking another over it.
      state.formations = (state.formations || []).filter(f => f.a !== e.id && f.until > state.tick);
      state.formations.push({ a: e.id, clan: e.owner, x: e.x, z: e.z, place: e.place,
        radius: a.radius, start: state.tick, until: state.tick + secs(a.seconds), damageTaken: a.damageTaken,
        snareSeconds: a.snareSeconds, snareSpeed: a.snareSpeed });
    } else return null;
    return { dir: e.dir };
  }

  function cancel(e, movement = false) {
    const b = e.brace;
    if (movement && b?.until > state.tick && alive(e) && !stunned(e, state.tick)) {
      if (e.buffs) delete e.buffs.reprisal;
      addBuff(e, 'pursuit', b.escapeSeconds, { runSpeed: b.escapeSpeed });
      emit(e, 'pursuit', { seconds: b.escapeSeconds });
    }
    delete e.brace; delete e.spearCombo; delete e.spearSweep;
  }

  function stepActor(e, movement) {
    // A held movement intent predates the cast when E is pressed while
    // already running. Treat it the same as a fresh movement command.
    if (e.brace && Math.hypot(movement?.right || 0, movement?.down || 0) >= .1) cancel(e, true);
    if (e.spearSweep) {
      const s = e.spearSweep;
      if (state.tick >= s.until) { delete e.spearSweep; delete e.swing; }
      else { e.swing = { start: s.start, len: s.len, strike: -1 }; e.anim = 'sweep'; return true; }
    }
    if (e.brace) {
      if (state.tick >= e.brace.until) delete e.brace;
      else { delete e.swing; e.anim = 'guard'; return true; }
    }
    const b = e.spearCombo;
    if (!b) return false;
    const t = state.entities[b.target];
    if (state.tick >= b.until || !alive(t) || !fair(e, t) || !sees(e, t)) { delete e.spearCombo; delete e.swing; return false; }
    const phase = Math.min(b.strikes - 1, Math.floor((state.tick - b.start) / b.interval));
    const swingStart = b.start + phase * b.interval;
    if (!e.swing || e.swing.start !== swingStart)
      e.swing = { start: swingStart, len: b.interval, strike: -1, target: t.id };
    if (b.landed < b.strikes && state.tick >= b.next) {
      e.dir = dirIndex(t.x - e.x, t.z - e.z);
      // Misses count as a thrust; the leader never chases during the sequence.
      const landed = distance(e, t) <= reachOf(e, t) && clearLine(e, t);
      if (landed) {
        const damage = Math.round(statsOf(e).damage * damageScale(e) * b.multiplier);
        hit(e, t, damage, false, 'threefold');
        weaponHit(e, t, damage, false);
      }
      const k = Math.min(1, reachOf(e,t) / (distance(e,t) || 1));
      emit(e, 'thrust', { tx: e.x+(t.x-e.x)*k, tz: e.z+(t.z-e.z)*k, target: t.id, landed, strike: b.landed + 1 });
      b.landed++; b.next += b.interval;
    }
    e.anim = 'attack';
    return true;
  }

  function tick() {
    if (state.formations) {
      state.formations = state.formations.filter(f => f.until > state.tick);
      if (!state.formations.length) delete state.formations;
    }
    for (const e of Object.values(state.entities)) {
      if (!alive(e)) { delete e.brace; delete e.spearCombo; delete e.spearSweep; continue; }
      const f = formationOf(e);
      if (f) addBuff(e, 'formation', 0.1, { damageTaken: f.damageTaken });
      else if (e.buffs) delete e.buffs.formation;
      if (stunned(e, state.tick)) { clearCombat(e); delete e.brace; delete e.spearCombo; delete e.spearSweep; }
    }
  }

  return { cast, stepActor, weaponHit, damaged, tick,
    damageTaken: e => formationOf(e)?.damageTaken ?? 1,
    cancel };
}
