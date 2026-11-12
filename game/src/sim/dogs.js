// Yakuza dog handler (war checkpoint 7-3, Tim 2026-11-12): the Yakuza's second special, trained at the kennel.
//  - He fights with his club like any crew member.
//  - "Loose the dogs" (units.json dog_handler.dogs): count dogs run straight at one enemy like a projectile, bite for
//    damage and knock it down for knockdownTicks, then are gone (a dust puff). Cooldown cooldownTicks.
//    Auto: the nearest visible ranged or fleeing enemy within range. Asked for by the player (sim/special_cast.js):
//    the valid enemy nearest the clicked spot, of any kind.
//  - The dogs are not units: each is a short-lived entity { type: 'war_dog', animal: true, pack: { a, t, damage, lead } }
//    with no owner, which nothing can target or hit; this module moves them and removes them when they arrive, when the
//    target is gone, or after maxTicks.
//  - Passive: he detects hidden units within dogs.detect (used by war stealth, 7-5).
// Rules only: no DOM, no randomness.
import { alive, dist } from './util.js';
import { dirIndex } from './geometry.js';
import { castWanted, autoOn } from './special_cast.js';
export function createDogs({ state, units, vision, spawn, hit, hostile = () => false, allowed = () => true, reveal = () => {} }) {
  const rulesOf = e => units.types[e?.type]?.dogs || null;
  const ranged = t => { const u = units.types[t.type]; return !!(u?.projectile || u?.rifle || t.type === 'shinobi_geisha'); };
  const fleeing = t => !!t.fleeing || t.order?.kind === 'flee' || t.order?.kind === 'retreat';
  const valid = (e, t, R) => alive(t) && !t.jailed && t.owner !== e.owner && t.type !== 'civilian' && !t.animal && !t.cop && t.place === e.place && !t.garrison && !t.aboard
    && hostile(e, t) && allowed(e, t) && vision.canSee(e.owner, t) && dist(e, t) <= R.range;
  function target(e, R, req) {
    let best = null, bd = Infinity;
    for (const t of Object.values(state.entities)) {
      if (!valid(e, t, R)) continue;
      if (!req && !ranged(t) && !fleeing(t)) continue;
      const d = req && Number.isFinite(req.x) ? Math.hypot(t.x - req.x, t.z - req.z) : dist(e, t);
      if (d < bd || (d === bd && best && t.id < best.id)) { bd = d; best = t; }
    }
    return best;
  }
  function loose(e, t, R) {
    const now = state.tick ?? 0, n = R.count ?? 3;
    e.dogsReadyAt = now + (R.cooldownTicks ?? 700);
    delete e.castReq;
    const dx = t.x - e.x, dz = t.z - e.z, d = Math.hypot(dx, dz) || 1, sx = -dz / d, sz = dx / d;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 0.7;
      spawn('war_dog', 'tosa', e.x + sx * off + dx / d * 0.6, e.z + sz * off + dz / d * 0.6, { place: e.place, area: e.area, animal: true, anim: 'run', dir: dirIndex(dx, dz),
        pack: { a: e.id, by: e.owner, t: t.id, off, until: now + (R.maxTicks ?? 120), ...(i === 0 ? { lead: true, damage: R.damage ?? 0, knockdownTicks: R.knockdownTicks ?? 0 } : {}) } });
    }
    e.dir = dirIndex(dx, dz);
    state.casts.push({ kind: 'dogsLoose', a: e.id, t: t.id, x: e.x, z: e.z, place: e.place });
    reveal(e, true);
  }
  // once a tick: handlers decide, packs run
  function tick() {
    const now = state.tick ?? 0;
    for (const e of Object.values(state.entities)) {
      if (e.pack) { run(e, now); continue; }
      const R = rulesOf(e);
      if (!R || !alive(e) || e.jailed || e.garrison || e.aboard || e.distracted || (e.dogsReadyAt || 0) > now) continue;
      const req = castWanted(state, e);
      if (!req && (!autoOn(e) || now % 10 !== (Number(e.id) || 0) % 10)) continue;   // auto looks a couple of times a second
      const t = target(e, R, req);
      if (t) loose(e, t, R);
    }
  }
  function gone(dog) { state.casts.push({ kind: 'dogsGone', a: dog.pack.a, x: dog.x, z: dog.z, place: dog.place }); delete state.entities[dog.id]; }
  function run(dog, now) {
    const p = dog.pack, t = state.entities[p.t], a = state.entities[p.a], R = rulesOf(a) || {};
    if (!t || !alive(t) || t.place !== dog.place || now >= p.until) { gone(dog); return; }
    const dx = t.x - dog.x, dz = t.z - dog.z, d = Math.hypot(dx, dz), step = (R.speed ?? 9) / 20;
    if (d <= step + 0.5) {
      if (p.lead) {
        const hp = t.hp;
        if (a && allowed(a, t)) hit(a, t, p.damage, false, 'dogs');
        if (!t.dead && !t.downed && p.knockdownTicks) { (t.buffs ||= {}).stunned = { until: Math.max(t.buffs?.stunned?.until || 0, now + p.knockdownTicks), dogs: true }; delete t.swing; }
        state.casts.push({ kind: 'dogsBite', a: p.a, t: t.id, x: t.x, z: t.z, place: t.place, hurt: t.hp < hp });
      }
      gone(dog); return;
    }
    // straight at it, through anything, like a projectile; each dog keeps its place beside the others
    dog.x += dx / d * step; dog.z += dz / d * step;
    dog.dir = dirIndex(dx, dz); dog.anim = 'run';
  }
  // 7-5: is this hidden unit within a dog handler's nose of that clan?
  function detects(clan, t) {
    for (const e of Object.values(state.entities)) { const R = rulesOf(e); if (R?.detect && e.owner === clan && alive(e) && e.place === t.place && dist(e, t) <= R.detect) return true; }
    return false;
  }
  return { tick, detects, rulesOf };
}
