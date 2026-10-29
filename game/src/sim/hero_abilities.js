// Hero abilities (Q / E / R / F), the dash and buff upkeep.
// Moved out of sim/game.js (phase 7 split, 2026-10-29); game.js passes in what it shares.
import { KURODA_KINDS, stunned } from './kuroda.js';
import { SCREEN_DOWN, SCREEN_RIGHT, dirIndex } from './geometry.js';
export function createHeroAbilities({ addBuff, civ, cop, damageScale, endAttack, fair, fight, hit, hostile, inSmoke, kuroda, navOf, paths, rally, reachOf, secs, sees, state, statsOf, stealth, tryMove, wild }) {
  function useAbility(e, c) {
    const a = statsOf(e).abilities?.[c.slot];
    if (!a || e.type !== 'hero' || e.dead || e.downed || e.jailed || e.dash || e.brace || e.spearCombo || e.spearSweep || stunned(e, state.tick)) return;
    if ((e.cooldowns?.[c.slot] ?? 0) > state.tick) return;
    const aim = Number.isFinite(c.x) && Number.isFinite(c.z) ? [c.x, c.z] : null;
    let extra = {};   // more for the renderer's cast entry
    if (KURODA_KINDS.has(a.kind)) {
      const result = kuroda.cast(e, a, c);
      if (!result) return;
      extra = result;
    } else if (a.kind === 'dash') {
      let dx = aim ? aim[0] - e.x : 0, dz = aim ? aim[1] - e.z : 0, len = Math.hypot(dx, dz);
      if (len < 0.2) {   // no aim: dash the way the hero faces
        const th = e.dir * Math.PI / 4, sx = -Math.sin(th), sy = Math.cos(th);
        dx = sx * SCREEN_RIGHT.x + sy * SCREEN_DOWN.x; dz = sx * SCREEN_RIGHT.z + sy * SCREEN_DOWN.z; len = Math.hypot(dx, dz);
      }
      const dist = Math.min(a.range, Math.max(len, 1.5)), ticks = Math.max(1, secs(a.seconds || 0.25));
      e.dash = { vx: dx / len * dist / ticks, vz: dz / len * dist / ticks, left: ticks, hit: [], start: state.tick, len: ticks };
      e.dir = dirIndex(dx, dz);
    } else if (a.kind === 'intimidate') {
      for (const t of Object.values(state.entities))
        if (hostile(e, t) && Math.hypot(t.x - e.x, t.z - e.z) <= a.radius) {
          addBuff(t, 'intimidated', a.seconds, { damage: a.enemyDamage });
          if (a.snareSeconds && a.snareSpeed) addBuff(t, 'snared', a.snareSeconds, { speed: a.snareSpeed });
        }
    } else if (a.kind === 'rally') {
      for (const u of Object.values(state.entities)) {
        if (u.dead || !rally.buffEligible(e, u) || u.place !== e.place || Math.hypot(u.x - e.x, u.z - e.z) > a.radius) continue;
        // heal over time (Tim 2026-10-19): a.heal in all, in healTicks equal parts, the first at once, then one a second
        const n = a.healTicks || 1;
        addBuff(u, 'rally', a.seconds, { boost: a.attackSpeed, heal: a.heal / n, ticksLeft: n, nextHeal: state.tick });
      }
    } else if (a.kind === 'lantern') {
      addBuff(e, 'lantern', a.seconds, { damage: a.damage, lifesteal: a.lifesteal });
    } else if (a.kind === 'shadowstep') {
      // Shadow Step (Shinobi Q): gone in a puff, out again up to range toward the mouse; stops at
      // the first wall or water on the way, and he stays hidden
      // with a target (c.target: the one in the target frame) he can see within range, he steps onto it instead
      // (Tim 2026-10-21: not the mouse), lands next to it with a sure crit, then auto attacks it
      const ct = state.entities[c.target];
      const t = ct && fair(e, ct) && sees(e, ct) && Math.hypot(ct.x - e.x, ct.z - e.z) <= a.range + 1 ? ct : null;
      const grid = navOf(e.place), dx = aim ? aim[0] - e.x : 0, dz = aim ? aim[1] - e.z : 0, len = Math.hypot(dx, dz);
      if (!grid || (!t && len < 0.5)) return;
      const dist = Math.min(a.range, len), n = Math.ceil(dist / 0.25);
      let x = e.x, z = e.z;
      for (let i = 1; i <= n; i++) {
        const px = e.x + dx / len * dist * i / n, pz = e.z + dz / len * dist * i / n;
        if (!grid.free(px, pz)) break;
        x = px; z = pz;
      }
      if (t) {
        const tl = Math.hypot(t.x - e.x, t.z - e.z) || 1, stop = Math.max(0, tl - (a.landGap ?? 0.9));
        x = e.x; z = e.z;
        for (let i = 1, m = Math.ceil(stop / 0.25); i <= m; i++) {
          const px = e.x + (t.x - e.x) / tl * stop * i / m, pz = e.z + (t.z - e.z) / tl * stop * i / m;
          if (!grid.free(px, pz)) break;
          x = px; z = pz;
        }
      }
      if (!t && Math.hypot(x - e.x, z - e.z) < 0.5) return;
      extra = { fx: e.x, fz: e.z };
      e.x = x; e.z = z; e.dir = t ? dirIndex(t.x - x, t.z - z) : dirIndex(dx, dz);
      delete paths[e.id];
      if (t && Math.hypot(t.x - e.x, t.z - e.z) <= reachOf(e, t) + 0.6) {
        const u = statsOf(e);
        hit(e, t, Math.round(u.damage * damageScale(e) * (u.critMultiplier || 2)), true);
        extra = { ...extra, tx: t.x, tz: t.z, target: t.id, crit: true };   // the big slash (render/abilityfx.js)
        if (!t.dead && !t.downed) { e.attackTarget = t.id; delete e.execute; delete e.holdFire; }
      }
    } else if (a.kind === 'distract') {
      // Distract (Shinobi E): a pebble thrown at the mouse (up to range); house guards, police and
      // bandits within radius of where it lands who aren't fighting go and look there for seconds
      if (!aim) return;
      const len = Math.hypot(aim[0] - e.x, aim[1] - e.z), k = len > a.range ? a.range / len : 1;
      const x = e.x + (aim[0] - e.x) * k, z = e.z + (aim[1] - e.z) * k;
      for (const t of Object.values(state.entities)) {
        if (!(t.guard || cop(t) || wild(t)) || t.owner === e.owner || t.place !== e.place || t.dead || t.downed || t.jailed) continue;
        if (Math.hypot(t.x - x, t.z - z) > a.radius || t.swing || t.execute || t.wave || Object.keys(t.angry || {}).length) continue;
        const [sx, sz] = navOf(t.place)?.nearestFree(x, z) || [x, z];
        t.distracted = { x: sx, z: sz, lookX: x, lookZ: z, investigateTicks: secs(4), travelUntil: state.tick + secs(20), until: state.tick + secs(24) };
        delete paths[t.id];
      }
      // ...and it is a scatter of caltrops (Tim 2026-10-20): every enemy close to it is slowed, bosses too
      if (a.snareRadius) for (const t of Object.values(state.entities))
        if (t.owner !== e.owner && !civ(t) && t.place === e.place && !t.dead && !t.downed && !t.jailed && Math.hypot(t.x - x, t.z - z) <= a.snareRadius)
          addBuff(t, 'snared', a.snareSeconds, { speed: a.snareSpeed });
      extra = { tx: x, tz: z };
    } else if (a.kind === 'smoke') {
      // Smoke Bomb (Shinobi R): a cloud round him (radius, seconds); see blind() for what it does.
      // Every unit of his clan holds its attacks, hitting back too, until given a new order
      // (Tim 2026-10-20), so nobody breaks stealth on his own
      const cloud = { x: e.x, z: e.z, r: a.radius, place: e.place, clan: e.owner, hero: e.id, until: state.tick + secs(a.seconds), heal: a.heal || 0, fadeSeconds: a.fadeSeconds || 0 };
      (state.smokes ||= []).push(cloud);
      for (const u of Object.values(state.entities)) {
        if (u.owner !== e.owner || !inSmoke(cloud, u)) continue;
        u.holdFire = true;
        delete u.swing; delete u.execute; delete u.attackTarget;
        if (fight[u.id]) delete fight[u.id].target;
        if (u.type !== 'hero' && u.order?.kind === 'attack') endAttack(u);
      }
      extra = { seconds: a.seconds };
    } else if (a.kind === 'assassinate') {
      // Assassinate (Shinobi F): only after hiddenSeconds hidden (smoke doesn't count), on the enemy
      // at the mouse within reach; non-heroes go down at once. Heroes retain
      // bossShare of their current HP, rounded to whole HP without a finishing blow.
      const clan = state.clans?.[e.owner], tell = text => { if (clan) clan.notice = { tick: state.tick, text }; };
      if (!e.hidden || (!stealth.veiled(e) && (e.hiddenAt == null || state.tick - e.hiddenAt < secs(a.hiddenSeconds)))) return tell(`Assassinate: stay hidden ${a.hiddenSeconds} s first`);
      // the target in the target frame first, else whoever is at the mouse; townsfolk and police too (Tim 2026-10-21)
      const inReach = u => u && fair(e, u) && Math.hypot(u.x - e.x, u.z - e.z) <= reachOf(e, u) + a.reach;
      const picked = inReach(state.entities[c.target]) ? state.entities[c.target] : null;
      let t = picked, bd = 2;
      for (const u of Object.values(state.entities)) {
        if (picked || !aim || !inReach(u)) continue;
        const d = Math.hypot(u.x - aim[0], u.z - aim[1]);
        if (d < bd) { bd = d; t = u; }
      }
      if (!t) return tell('Assassinate: nobody in reach at the mouse');
      const remaining = Math.min(t.hp, Math.max(1, Math.round(t.hp * a.bossShare)));
      const dmg = t.type === 'hero' ? t.hp - remaining : t.hp;
      // a quick lunge onto him first (Tim 2026-10-20: longer reach, so he strikes before he is spotted)
      const fx = e.x, fz = e.z, tl = Math.hypot(t.x - e.x, t.z - e.z), stop = Math.max(0, tl - (a.landGap ?? 0.9)), grid = navOf(e.place);
      for (let i = 1, m = Math.ceil(stop / 0.25); grid && i <= m; i++) {
        const px = fx + (t.x - fx) / (tl || 1) * stop * i / m, pz = fz + (t.z - fz) / (tl || 1) * stop * i / m;
        if (!grid.free(px, pz)) break;
        e.x = px; e.z = pz;
      }
      delete paths[e.id];
      e.dir = dirIndex(t.x - e.x, t.z - e.z);
      extra = { tx: t.x, tz: t.z, target: t.id, fx, fz, critRadius: a.critRadius };
      hit(e, t, dmg, true, 'assassinate');
      delete e.holdFire; // a successful offensive ability is an explicit attack
      for (const u of Object.values(state.entities)) {
        if (!rally.buffEligible(e, u) || u.guard || u.dead || u.downed || u.jailed || u.place !== e.place
          || Math.hypot(u.x - e.x, u.z - e.z) > a.critRadius) continue;
        addBuff(u, 'ambush', a.critSeconds, { critChance: a.critChance });
      }
    } else return;
    delete e.swing;
    (e.cooldowns ||= {})[c.slot] = state.tick + secs(a.cooldown);
    state.casts.push({ a: e.id, slot: c.slot, kind: a.kind, x: e.x, z: e.z, ...(a.radius ? { radius: a.radius } : {}), ...extra });
  }

  // One tick of a dash: slide toward the aim, cut every enemy passed (once each)
  function dashStep(e, unit) {
    const d = e.dash, a = unit.abilities?.Q;
    e.anim = 'run';
    tryMove(e, unit.radius, d.vx, 0);
    tryMove(e, unit.radius, 0, d.vz);
    for (const t of Object.values(state.entities)) {
      if (!(hostile(e, t) || (wild(t) && fair(e, t))) || d.hit.includes(t.id) || Math.hypot(t.x - e.x, t.z - e.z) > statsOf(t).radius + 0.9) continue;
      d.hit.push(t.id);
      hit(e, t, Math.round(unit.damage * (a?.damageMultiplier || 1) * damageScale(e)), false, 'dash');
    }
    if (--d.left <= 0) delete e.dash;
  }

  // Buffs that heal in ticks (Rally): heal share of max health each second while they last
  function healBuffs() {
    for (const e of Object.values(state.entities)) {
      const b = e.buffs?.rally;
      if (!b?.ticksLeft || state.tick < b.nextHeal || e.dead || e.downed) continue;
      if (e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * b.heal);
      b.ticksLeft--; b.nextHeal = state.tick + secs(1);
    }
  }

  function expireBuffs() {
    for (const e of Object.values(state.entities)) {
      if (!e.buffs) continue;
      for (const [k, b] of Object.entries(e.buffs)) if (state.tick >= b.until) delete e.buffs[k];
      if (!Object.keys(e.buffs).length) delete e.buffs;
    }
  }

  return { dashStep, expireBuffs, healBuffs, useAbility };
}
