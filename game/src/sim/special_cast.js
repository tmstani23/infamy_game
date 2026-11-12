// Special abilities of crew and war troops as the player sees them (war checkpoint 7-1, Tim 2026-11-12):
// which ability a unit has, when it is ready, the auto-cast switch and a cast asked for by the player.
// The abilities themselves stay in their own modules (sim/diversion.js Charm, sim/rifleman.js Aimed Shot,
// sim/taunt.js Taunt, sim/combat.js the Yumi archer's slowing arrow, sim/dogs.js Loose the dogs); they read two fields from the unit:
//   e.autoCast === false   the unit does not use its ability on its own (default: it does)
//   e.castReq = { x, z, until } | { until }   the player asked for a cast (at that spot, for targeted ones);
//                          the module casts as soon as it can, at the valid enemy nearest the spot, also
//                          with auto off, and clears the request. It lapses at `until`.
// Rules only: no DOM, no randomness.
export const CAST_WAIT_TICKS = 60;   // how long an asked-for cast waits for a target or the cooldown

// id -> { name, targeted, has(unit def, entity), readyAt(entity), cooldownTicks(unit def) }
export const SPECIALS = {
  charm: { name: 'Charm', targeted: true, has: (u, e) => e.type === 'shinobi_geisha', readyAt: e => e.lure?.readyAt ?? 0 },
  aimed: { name: 'Aimed Shot', targeted: true, has: u => !!u?.rifle, readyAt: e => e.rifle?.aim ? e.rifle.aim.until + 1 : e.rifle?.readyAt ?? 0 },   // aiming = busy until the shot
  taunt: { name: 'Taunt', targeted: false, has: (u, e) => e.type === 'yakuza_enforcer' || !!u?.taunt, readyAt: e => e.taunt?.readyAt ?? 0 },
  dogs: { name: 'Loose the dogs', targeted: true, has: u => !!u?.dogs, readyAt: e => e.dogsReadyAt ?? 0 },   // sim/dogs.js (7-3)
  gatling: { name: 'Hold aim', targeted: true, noAuto: true, has: u => !!u?.gatling, readyAt: () => 0 },   // sim/gatling.js (7-4): no cooldown, no auto switch
  hamstring: { name: 'Slowing arrow', targeted: true, has: u => !!u?.projectile?.hamstring, readyAt: e => e.hamstringReadyAt ?? 0 },
};
export function specialOf(units, e) {
  const u = units?.types?.[e?.type];
  if (!e || !u) return null;
  for (const [id, s] of Object.entries(SPECIALS)) if (s.has(u, e)) return id;
  return null;
}
const usable = e => e && !e.dead && !e.downed && !e.jailed && !e.garrison && !e.aboard;
// the wanted cast of a unit right now (or null); the ability modules call this
export const castWanted = (state, e) => e?.castReq && e.castReq.until > (state.tick ?? 0) ? e.castReq : null;
export const autoOn = e => e?.autoCast !== false;
// of two targets the one nearer the asked-for spot; no spot = keep the module's own choice
export const nearerToCast = (req, a, b) => !Number.isFinite(req?.x) ? null : Math.hypot(a.x - req.x, a.z - req.z) <= Math.hypot(b.x - req.x, b.z - req.z) ? a : b;

// { id: heroId, type: 'special', ability, units: [...], x?, z? }     cast: ONE of the listed units of the hero's clan that has it ready
//                                    (one press, one caster, Tim 2026-11-12): the one nearest the spot; a targeted ability needs the spot,
//                                    an instant one takes it as the pointer's place (none given = the first listed). A unit on cooldown never queues.
// { id: heroId, type: 'special', ability, units: [...], auto: bool } switch auto-cast for the listed units that have it
export function specialCommand({ state, units }, hero, c) {
  const S = SPECIALS[c?.ability];
  if (!hero || hero.type !== 'hero' || !S) return 0;
  const now = state.tick ?? 0;
  const spot = Number.isFinite(c.x) && Number.isFinite(c.z);
  let n = 0, best = null, bd = Infinity;
  for (const id of Array.isArray(c.units) ? c.units : []) {
    const e = state.entities[id];
    if (!e || e.owner !== hero.owner || specialOf(units, e) !== c.ability) continue;
    if (typeof c.auto === 'boolean') { if (c.auto) delete e.autoCast; else e.autoCast = false; n++; continue; }
    if (!usable(e) || S.readyAt(e) > now) continue;
    if (S.targeted && !spot) continue;
    if (castWanted(state, e)) continue;   // already asked: the next press takes the next unit
    const d = spot ? Math.hypot(e.x - c.x, e.z - c.z) : n++;   // no spot: listed order
    if (d < bd) { bd = d; best = e; }
  }
  if (typeof c.auto === 'boolean') return n;
  if (!best) return 0;
  best.castReq = S.targeted ? { x: c.x, z: c.z, until: now + CAST_WAIT_TICKS } : { until: now + CAST_WAIT_TICKS };
  return 1;
}
// counts for the ability row: { have, ready, auto, nextReadyAt } of these unit ids
export function specialView({ state, units }, ability, ids) {
  const S = SPECIALS[ability], now = state.tick ?? 0;
  let have = 0, ready = 0, auto = 0, next = Infinity;
  for (const id of ids || []) {
    const e = state.entities[id];
    if (!e || !usable(e) || specialOf(units, e) !== ability) continue;
    have++; if (autoOn(e)) auto++;
    const at = S.readyAt(e);
    if (at <= now) ready++; else next = Math.min(next, at);
  }
  return { have, ready, auto, nextReadyAt: ready || !have ? 0 : next };
}
