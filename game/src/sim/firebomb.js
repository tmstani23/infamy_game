// Shinobi fire-bomb thrower (war 7c-2, 2026-11-12, the 2026-11-09 rule): his normal attack is a weak knife.
// The fire bomb is his special (sim/special_cast.js: auto switch, a cast the player asks for):
//  - He channels for bomb.channelTicks facing the spot; a marker shows on the ground where the bomb will land
//    (cast event firebombMark, drawn by render/crewfx.js). The spot is fixed when the channel starts.
//  - Then the bomb flies (bomb.speed) and lands: every hostile unit within bomb.radius takes bomb.damage (bombs
//    stack), and an enemy structure of his war there takes bomb.structureDamage and catches fire when it is wood
//    (stone: reduced damage, no fire; sim/frontier/structures.js bombAt).
//  - Long cooldown (bomb.cooldownTicks); range (bomb.range) shorter than archers and riflemen.
//  - A tick in which he cannot act (stagger, stun, knockdown, charm, taunt) or a move order breaks the channel
//    (short retry, no cooldown spent); plain hits do not.
// On auto he throws at the nearest enemy unit he can see in range, or at the structure of his raze order.
// e.bomb = { readyAt, channel?: { x, z, key?, until, last } }; state.bombs = [{ a, by, x, z, key?, place, at }] in flight.
// Rules only: no DOM, no randomness. Numbers: units.json types.<type>.bomb.
import { dirIndex } from './geometry.js';
import { alive } from './util.js';
import { castWanted, autoOn } from './special_cast.js';

export function createFireBomb({ state, units, vision, hit, hostile = () => false, allowed = () => true, clearCombat = () => {}, structures = () => null, reveal = () => {} }) {
  const rules = e => units?.types?.[e?.type]?.bomb || null;
  const RETRY = 20;
  const spoil = e => { if (e.bomb?.channel) { delete e.bomb.channel; e.bomb.readyAt = Math.max(e.bomb.readyAt || 0, (state.tick ?? 0) + RETRY); } };
  const foe = (e, t) => alive(t) && t.owner !== e.owner && t.place === e.place && !t.garrison && !t.aboard && t.type !== 'civilian' && !t.cop && hostile(e, t) && allowed(e, t) && vision.canSee(e.owner, t);
  // where to throw: { x, z, key? } or null
  function pick(e, R) {
    const S = structures(), want = castWanted(state, e);
    const inRange = (x, z) => Math.hypot(x - e.x, z - e.z) <= R.range;
    const structAt = (x, z, slack) => { const st = e.place === 'world' ? S?.at?.(e.owner, x, z, slack) : null; return st && S.gap(st, e.x, e.z) <= R.range ? st : null; };
    const onto = st => { const d = Math.hypot(st.x - e.x, st.z - e.z) || 1, k = Math.min(1, R.range / d); return { x: e.x + (st.x - e.x) * k, z: e.z + (st.z - e.z) * k, key: st.key }; };
    if (want) {
      // asked for by the player: the enemy structure under the spot, else the enemy unit nearest the spot, else the spot itself when in range
      const st = structAt(want.x, want.z, 3);
      if (st) return onto(st);
      let best = null, bd = R.radius + 3;
      for (const t of Object.values(state.entities)) { if (!foe(e, t) || !inRange(t.x, t.z)) continue; const d = Math.hypot(t.x - want.x, t.z - want.z); if (d < bd) { bd = d; best = t; } }
      if (best) return { x: best.x, z: best.z };
      return inRange(want.x, want.z) ? { x: want.x, z: want.z } : null;
    }
    if (!autoOn(e)) return null;
    // the structure he was sent at, once it is in range
    if (e.order?.kind === 'raze') { const st = S?.find?.(e.order.structure); if (st && S.canDamage(e.owner, st) && S.gap(st, e.x, e.z) <= R.range) return onto(st); }
    if (e.holdFire) return null;
    let best = null, bd = Infinity;
    for (const t of Object.values(state.entities)) { if (!foe(e, t)) continue; const d = Math.hypot(t.x - e.x, t.z - e.z); if (d <= R.range && d < bd) { bd = d; best = t; } }
    return best ? { x: best.x, z: best.z } : null;
  }
  function throwIt(e, R) {
    const c = e.bomb.channel, now = state.tick ?? 0;
    delete e.bomb.channel;
    e.bomb.readyAt = now + (R.cooldownTicks ?? 300); e.bomb.thrownAt = now;
    const flight = Math.max(2, Math.ceil(Math.hypot(c.x - e.x, c.z - e.z) / (R.speed || 13) * 20));
    (state.projectiles ||= []).push({ kind: 'firebomb', a: e.id, t: null, bomb: true, x: e.x, z: e.z, tx: c.x, tz: c.z, place: e.place, at: now, until: now + flight, damage: 0 });
    (state.casts ||= []).push({ kind: 'firebomb', a: e.id, x: e.x, z: e.z, tx: c.x, tz: c.z, place: e.place, flightTicks: flight });
    (state.bombs ||= []).push({ a: e.id, by: e.owner, x: c.x, z: c.z, ...(c.key ? { key: c.key } : {}), place: e.place, at: now + flight, damage: R.damage ?? 0, structureDamage: R.structureDamage ?? R.damage ?? 0, radius: R.radius ?? 2.5 });
    reveal(e, true);
  }
  function step(e, unit) {
    const R = unit?.bomb;
    if (!R || !alive(e) || e.deployment?.transfer || e.garrison || e.aboard) return false;
    const b = e.bomb ||= { readyAt: 0 }, now = state.tick ?? 0;
    const moving = (e.order?.kind === 'move' && !e.order.arrived) || ['enter', 'heal', 'loot'].includes(e.order?.kind);
    if (moving && !castWanted(state, e)) { spoil(e); return false; }
    if (b.channel) {
      const c = b.channel;
      if (c.last !== now - 1) { spoil(e); return false; }   // he lost a tick (stun, stagger, knockdown, charm, taunt): the channel is broken
      c.last = now;
      clearCombat(e); e.dir = dirIndex(c.x - e.x, c.z - e.z); e.anim = 'throw';
      if (now >= c.until) throwIt(e, R);
      return true;
    }
    if (b.readyAt > now) {
      if (now - (b.thrownAt ?? -1e9) < 8) { clearCombat(e); e.anim = 'throw'; return true; }   // the follow-through of the throw
      return false;
    }
    if (e.swing) return false;   // mid knife swing: after it
    const p = pick(e, R);
    if (!p) return false;
    delete e.castReq;
    const ticks = R.channelTicks ?? 30, flight = Math.max(2, Math.ceil(Math.hypot(p.x - e.x, p.z - e.z) / (R.speed || 13) * 20));
    b.channel = { x: p.x, z: p.z, ...(p.key ? { key: p.key } : {}), until: now + ticks, last: now };
    (state.casts ||= []).push({ kind: 'firebombMark', a: e.id, x: p.x, z: p.z, place: e.place, radius: R.radius ?? 2.5, ticks: ticks + flight });
    clearCombat(e); e.dir = dirIndex(p.x - e.x, p.z - e.z); e.anim = 'throw';
    return true;
  }
  // bombs landing
  function tick() {
    const now = state.tick ?? 0;
    if (!state.bombs?.length) return;
    const due = state.bombs.filter(q => q.at <= now);
    if (!due.length) return;
    state.bombs = state.bombs.filter(q => q.at > now);
    if (!state.bombs.length) delete state.bombs;
    for (const q of due) {
      (state.casts ||= []).push({ kind: 'firebombBurst', a: q.a, x: q.x, z: q.z, place: q.place, radius: q.radius });
      const a = state.entities[q.a];
      if (a) for (const t of Object.values(state.entities)) {
        if (t === a || t.dead || t.downed || t.place !== q.place || t.owner === q.by || t.garrison || t.aboard || Math.hypot(t.x - q.x, t.z - q.z) > q.radius || !allowed(a, t)) continue;
        hit(a, t, q.damage, false, 'firebomb');
      }
      if (q.place === 'world') structures()?.bombAt?.(q.by, q.x, q.z, q.key, q.structureDamage, q.radius);
    }
  }
  return { step, tick, interrupted: () => {}, manual: e => { if (rules(e)) spoil(e); } };
}
