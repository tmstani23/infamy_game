// Boss abilities at the guarded places (world variety P4, 2026-11-27). One ability each, from the boss's
// `boss.ability` (data/hidden_places.json place.guard.boss), used every `every` seconds while the boss is in a fight
// and someone of a clan is within `range`. The sim does the damage; casts tell the render what to draw
// (render/boss_fx.js) and the sound what to play. Numbers are first guesses, tuned in play.
//   keg         lit powder keg thrown at your biggest bunch: a fuse ring for `fuse` s, then a blast (radius, damage, knock back)
//   slam        the bear rears for `windup` s, then a shockwave: damage and a stun for everyone within radius
//   howl        the pale wolf howls: `adds` more wolves come and the whole pack runs and bites harder for `seconds`; `max` per fight
//   net         a weighted net pins the hero (or the nearest) for `root` s, then a fast `burst` of shots at burstDamage x
//   arrowStorm  a fire arrow shot up lands and marks a ring; `delay` s later the storm: arrows + perLookout per living lookout
//   flicker     the ronin master blinks to one person in each of your groups (up to `targets`) for a crit slash, then a
//               rally cry heals his band `heal` of their health over healSeconds
//   dust        a dust cloud round the raider chief: your people inside miss `miss` of their hits and see `sight` as far
//   bleed       (passive, the raider chief's flaming spear) each of his hits bleeds `share` of max health a second for `seconds`
export function createBossAbilities({ state, hit, addBuff, statsOf, spawn, remove = () => {}, nav, hostile = () => true, wildOwner = 'wildlife' }) {
  const secs = s => Math.round(s * 20);
  const alive = e => e && !e.dead && !e.downed;
  const cast = c => state.casts?.push({ place: 'world', ...c });
  const foes = boss => Object.values(state.entities).filter(u => alive(u) && u.place === 'world' && state.clans?.[u.owner] && !u.garrison && !u.aboard && !u.ship && !u.stored && hostile(boss, u));
  const near = (list, x, z, r) => list.filter(u => Math.hypot(u.x - x, u.z - z) <= r);
  const inFight = e => Object.values(e.angry || {}).some(t => t > state.tick) || ['hunt', 'charge', 'stalk'].includes(e.wm?.mode);
  const stunned = e => (e.buffs?.stunned?.until ?? -1) > state.tick;
  // the spot of your biggest bunch within reach: the person with the most others round him, and their middle
  function bunch(list, r) {
    let best = null, n = -1;
    for (const u of list) { const k = near(list, u.x, u.z, r).length; if (k > n) { n = k; best = u; } }
    if (!best) return null;
    const g = near(list, best.x, best.z, r);
    return { x: g.reduce((s, u) => s + u.x, 0) / g.length, z: g.reduce((s, u) => s + u.z, 0) / g.length, n: g.length };
  }
  // groups of your people (one person each within `gap` of another): for the flicker cut
  function groups(list, gap) {
    const left = [...list], out = [];
    while (left.length) {
      const g = [left.shift()];
      for (let i = 0; i < g.length; i++) for (let j = left.length - 1; j >= 0; j--) if (Math.hypot(left[j].x - g[i].x, left[j].z - g[i].z) <= gap) g.push(...left.splice(j, 1));
      out.push(g);
    }
    return out;
  }
  function knock(u, fx, fz, d) {
    const dx = u.x - fx, dz = u.z - fz, l = Math.hypot(dx, dz) || 1, k = Math.max(0.5, d * (1 - Math.min(1, l / 6) * 0.5));
    const p = nav?.nearestFree(u.x + dx / l * k, u.z + dz / l * k);
    if (p && (!nav.clearLine || nav.clearLine(u.x, u.z, p[0], p[1]))) { u.x = p[0]; u.z = p[1]; delete u.path; }
  }
  const pending = [];   // timed steps of abilities under way (rebuilt from e.bossFx after a load: the step is dropped, the cooldown kept)
  function later(ticks, fn) { pending.push({ at: state.tick + ticks, fn }); }

  function start(e, A) {
    const m = e.bossFx, all = foes(e), close = near(all.filter(u => !u.hidden), e.x, e.z, A.range ?? 10);   // aimed at those he sees (not inside a smoke lantern's cloud); blasts still hit all
    if (!close.length) return false;
    const dmg = statsOf(e).damage || 10;
    if (A.kind === 'keg') {
      const b = bunch(close, A.radius ?? 5); if (!b) return false;
      cast({ kind: 'bossKeg', a: e.id, x: b.x, z: b.z, fx: e.x, fz: e.z, r: A.radius, ticks: secs(A.fuse) });
      later(secs(A.fuse), () => {
        if (!alive(e)) return;
        cast({ kind: 'bossKegBlast', a: e.id, x: b.x, z: b.z, r: A.radius });
        for (const u of near(foes(e), b.x, b.z, A.radius)) { hit(e, u, A.damage, false, 'bossKeg'); knock(u, b.x, b.z, A.knock ?? 4); }
      });
    } else if (A.kind === 'slam') {
      e.bossFx.busyUntil = state.tick + secs(A.windup); e.bossFx.hold = { x: e.x, z: e.z }; delete e.swing; e.anim = 'idle';
      cast({ kind: 'bossRear', a: e.id, x: e.x, z: e.z, r: A.radius, ticks: secs(A.windup) });
      later(secs(A.windup), () => {
        if (!alive(e)) return;
        cast({ kind: 'bossSlam', a: e.id, x: e.x, z: e.z, r: A.radius });
        for (const u of near(foes(e), e.x, e.z, A.radius)) { hit(e, u, A.damage, false, 'bossSlam'); delete u.swing; addBuff(u, 'stunned', A.stun); }
      });
    } else if (A.kind === 'howl') {
      if ((m.uses || 0) >= (A.max ?? 2)) return false;
      m.uses = (m.uses || 0) + 1;
      cast({ kind: 'bossHowl', a: e.id, x: e.x, z: e.z, seconds: A.seconds });
      for (let i = 0; i < (A.adds ?? 3); i++) {
        const a = (i / (A.adds ?? 3)) * Math.PI * 2 + state.tick * 0.01, p = nav?.nearestFree(e.x + Math.cos(a) * 14, e.z + Math.sin(a) * 14);
        if (!p) continue;
        const id = spawn('wolf', statsOf('wolf').sprite || 'wolf', p[0], p[1], { owner: wildOwner, wild: true, wildlife: true, species: 'wolf', place: 'world', area: 'world', bossAdd: e.id, name: statsOf('wolf').name,
          angry: { ...(e.angry || {}) }, wm: { ...(e.wm || {}), mode: e.wm?.mode === 'stalk' ? 'hunt' : e.wm?.mode || 'hunt', home: [e.x, e.z] } });
        cast({ kind: 'bossAdd', a: id, x: p[0], z: p[1] });
      }
      for (const w of Object.values(state.entities)) if (alive(w) && (w.guarded === e.guarded || w.bossAdd === e.id) && w.species === 'wolf')
        addBuff(w, 'bossRage', A.seconds, { damage: A.damage, speed: A.speed });
    } else if (A.kind === 'net') {
      const t = close.find(u => u.type === 'hero') || close.sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
      const fly = secs(0.4);
      cast({ kind: 'bossNet', a: e.id, t: t.id, x: t.x, z: t.z, fx: e.x, fz: e.z, ticks: fly, root: secs(A.root) });
      later(fly, () => {
        if (!alive(e) || !alive(t)) return;
        addBuff(t, 'snared', A.root, { speed: 0, net: true }); delete t.path;
        for (let i = 0; i < (A.burst ?? 3); i++) later(secs(0.2 + i * (A.burstGap ?? 0.3)), () => {
          if (!alive(e) || !alive(t)) return;
          const netted = (t.buffs?.snared?.until ?? -1) > state.tick && t.buffs.snared.net;
          cast({ kind: 'bossShot', a: e.id, t: t.id, x: t.x, z: t.z, fx: e.x, fz: e.z });
          hit(e, t, Math.round(dmg * (netted ? A.burstDamage ?? 1.5 : 1)), false, 'bossShot');
        });
      });
    } else if (A.kind === 'arrowStorm') {
      const b = bunch(close, A.radius ?? 6); if (!b) return false;
      cast({ kind: 'bossFireArrow', a: e.id, x: b.x, z: b.z, fx: e.x, fz: e.z, ticks: secs(A.flight ?? 1), r: A.radius });
      later(secs(A.flight ?? 1), () => {
        cast({ kind: 'bossStormMark', a: e.id, x: b.x, z: b.z, r: A.radius, ticks: secs(A.delay ?? 1) });
        later(secs(A.delay ?? 1), () => {
          const lookouts = Object.values(state.entities).filter(w => alive(w) && w.guarded === e.guarded && !w.boss && statsOf(w).projectile).length;
          const count = (A.arrows ?? 6) + (A.perLookout ?? 4) * lookouts, span = secs(A.seconds ?? 1.5);
          cast({ kind: 'bossStorm', a: e.id, x: b.x, z: b.z, r: A.radius, ticks: span, count });
          for (let i = 0; i < count; i++) later(Math.floor(i * span / count), () => {
            const inside = near(foes(e), b.x, b.z, A.radius);
            if (!inside.length) return;
            const u = inside[(i * 7 + state.tick) % inside.length];
            if (((i * 13 + state.tick) % 5) < 3) hit(e, u, A.damage, false, 'bossStorm');   // about 3 in 5 arrows find someone
          });
        });
      });
    } else if (A.kind === 'flicker') {
      const targets = groups(close, A.groupGap ?? 6).slice(0, A.targets ?? 5).map(g => g.find(u => u.type === 'hero') || g[0]);
      if (!targets.length) return false;
      const hop = secs(A.hop ?? 0.25);
      e.bossFx.busyUntil = state.tick + hop * targets.length + secs(0.5);
      targets.forEach((t, i) => later(hop * i, () => {
        if (!alive(e) || !alive(t)) return;
        const a = Math.atan2(e.z - t.z, e.x - t.x), p = nav?.nearestFree(t.x + Math.cos(a) * 1.2, t.z + Math.sin(a) * 1.2) || [e.x, e.z];
        cast({ kind: 'bossFlicker', a: e.id, t: t.id, fx: e.x, fz: e.z, x: p[0], z: p[1] });
        e.x = p[0]; e.z = p[1]; delete e.path;
        hit(e, t, Math.round(dmg * (A.crit ?? 2)), true, 'bossFlicker');
      }));
      later(hop * targets.length + secs(0.2), () => {
        if (!alive(e)) return;
        cast({ kind: 'bossRally', a: e.id, x: e.x, z: e.z, seconds: A.healSeconds });
        for (const w of Object.values(state.entities)) if (alive(w) && w.guarded === e.guarded && w.maxHp)
          addBuff(w, 'bossMend', A.healSeconds, { perTick: w.maxHp * (A.heal ?? 0.3) / secs(A.healSeconds ?? 6) });
      });
    } else if (A.kind === 'dust') {
      m.dust = { x: e.x, z: e.z, r: A.radius, until: state.tick + secs(A.seconds), miss: A.miss, sight: A.sight };
      cast({ kind: 'bossDust', a: e.id, x: e.x, z: e.z, r: A.radius, ticks: secs(A.seconds) });
    } else return false;
    return true;
  }

  function tick() {
    // timed steps
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= state.tick) { const p = pending.splice(i, 1)[0]; p.fn(); }
    for (const e of Object.values(state.entities)) {
      // the heal of a rally cry, a bleed, the dust's lasting cloud, and the boss's own ability clock
      const mend = e.buffs?.bossMend;
      if (mend && mend.until > state.tick && alive(e) && e.maxHp) e.hp = Math.min(e.maxHp, e.hp + mend.perTick);
      const bl = e.buffs?.bleed;
      if (bl && bl.until > state.tick && alive(e) && (state.tick - bl.from) % 20 === 0 && state.tick !== bl.from) {
        const by = state.entities[bl.by]; if (by) hit(by, e, Math.max(1, Math.round(e.maxHp * bl.share)), false, 'bleed');
      }
      if (!e.boss) { if (e.bossAdd && !alive(state.entities[e.bossAdd]) && alive(e) && !inFight(e)) remove(e.id); continue; }
      const A = e.boss.ability, m = e.bossFx ||= { next: null };
      if (m.dust && m.dust.until > state.tick && state.tick % 5 === 0)
        for (const u of near(foes(e), m.dust.x, m.dust.z, m.dust.r)) addBuff(u, 'dusted', 0.5, { miss: m.dust.miss, sight: m.dust.sight });
      if (e.boss.bleed) for (const h of state.hits || []) if (h.a === e.id && !h.kind) {
        const t = state.entities[h.t]; if (alive(t)) addBuff(t, 'bleed', e.boss.bleed.seconds, { share: e.boss.bleed.share, by: e.id, from: state.tick });
      }
      if (!A || !alive(e)) continue;
      if (m.hold && (m.busyUntil ?? -1) > state.tick) { e.x = m.hold.x; e.z = m.hold.z; delete e.path; delete e.swing; e.anim = 'idle'; } else delete m.hold;
      if (!inFight(e)) { m.next = null; m.uses = 0; continue; }
      if (m.next == null) { m.next = state.tick + secs(Math.min(4, A.every / 3)); continue; }   // a first use soon after the fight starts
      if (state.tick < m.next || stunned(e) || (m.busyUntil ?? -1) > state.tick) continue;
      m.next = state.tick + secs(start(e, A) ? A.every : 1);
    }
    // what your people see: the spyglass relic and a dust cloud (sim/vision.js sightK)
    if (state.tick % 5 === 0) for (const u of Object.values(state.entities)) {
      if (u.place !== 'world' || !state.clans?.[u.owner]) { if (u.sightK != null) delete u.sightK; continue; }
      const d = (u.buffs?.dusted?.until ?? -1) > state.tick ? u.buffs.dusted.sight ?? 1 : 1, k = (u.relicSight || 1) * d;
      if (k === 1) delete u.sightK; else u.sightK = k;
    }
  }
  // a boss stuck mid wind-up keeps still (the bear rearing, the ronin master between blinks)
  const busy = e => (e?.bossFx?.busyUntil ?? -1) > state.tick;
  return { tick, busy };
}
