// Special abilities of crew and war troops as the player sees them (war checkpoint 7-1, Tim 2026-11-12):
// which ability a unit has, when it is ready, the auto-cast switch and a cast asked for by the player.
// The abilities themselves stay in their own modules (sim/diversion.js Charm, sim/rifleman.js Aimed Shot,
// sim/taunt.js Taunt, sim/combat.js the Yumi archer's slowing arrow, sim/dogs.js Loose the dogs, sim/firebomb.js Fire bomb); they read two fields from the unit:
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
  gatling: { name: 'Unload', targeted: true, has: u => !!u?.gatling, readyAt: e => e.gatReadyAt ?? 0 },   // sim/gatling.js (7-4, reworked Tim 2026-11-21)
  firebomb: { name: 'Fire bomb', targeted: true, has: u => !!u?.bomb, readyAt: e => e.bomb?.channel ? e.bomb.channel.until + 1 : e.bomb?.readyAt ?? 0 },   // sim/firebomb.js (7c-2)
  hamstring: { name: 'Slowing arrow', targeted: true, has: u => !!u?.projectile?.hamstring, readyAt: e => e.hamstringReadyAt ?? 0 },
  // ships S8 (sim/frontier/boarding.js): a warship with troops aboard boards an enemy ship; while it goes or fights the
  // same slot is Break off. Manual only. able: also needs someone aboard and no unloading
  board: { name: 'Board', targeted: true, noAuto: true, has: (u, e) => !!e.ship && e.warUnit === 'warship' && !e.board, readyAt: e => e.boardReadyAt ?? 0,
    able: (state, e) => !e.locked && !e.leave && e.sorder?.kind !== 'unload' && Object.values(state.entities).some(u => u.inShip === e.id && !u.dead) },
  breakoff: { name: 'Break off', targeted: false, noAuto: true, has: (u, e) => !!e.ship && !!e.board && e.board.role !== 'd', readyAt: e => e.board?.offAt ?? 0 },
  // ships (Tim 2026-11-23): the guns as slots beside Board. Auto (default) = they pick their own targets as before;
  // off = they fire only when asked. A click aims the next volley (cannons) or the next bursts (Gatling) at the
  // target nearest the click (sim/frontier/ships.js). A ship has several of these, so its auto is per gun (e.gunAuto).
  broadside: { name: 'Broadside', targeted: true, ship: true, gun: 'broadside', has: (u, e) => !!e.ship && e.warUnit === 'warship', readyAt: e => e.gunAt?.broadside ?? 0,
    able: (state, e) => !e.locked && !e.leave },
  bowcannon: { name: 'Bow cannon', targeted: true, ship: true, gun: 'bowCannon', has: (u, e) => !!e.ship && e.warUnit === 'transport', readyAt: e => e.gunAt?.bowCannon ?? 0,
    able: (state, e) => !e.locked && !e.leave },
  deckgun: { name: 'Deck Gatling', targeted: true, ship: true, gun: 'deckGatling', has: (u, e) => !!e.ship && e.warUnit === 'warship', readyAt: () => 0,
    able: (state, e) => !e.locked && !e.leave },
};
// every special of a unit: ships carry several (Board or Break off, and their guns); anyone else one at most
export function specialsOf(units, e) {
  const u = units?.types?.[e?.type];
  if (!e || !u) return [];
  if (!e.ship) { const id = specialOf(units, e); return id ? [id] : []; }
  return Object.keys(SPECIALS).filter(id => SPECIALS[id].has(u, e));
}
// a ship gun's auto switch (per gun); every other special's is the unit's autoCast
export const gunAuto = (e, id) => e?.gunAuto?.[id] !== false;
// the asked-for aim of one ship gun (or null): e.gunReq[id] = { x, z, until }
export const gunWanted = (state, e, id) => { const r = e?.gunReq?.[id]; return r && r.until > (state.tick ?? 0) ? r : null; };
export const gunDone = (e, id) => { if (!e?.gunReq) return; delete e.gunReq[id]; if (!Object.keys(e.gunReq).length) delete e.gunReq; };
export function specialOf(units, e) {
  const u = units?.types?.[e?.type];
  if (!e || !u) return null;
  for (const [id, s] of Object.entries(SPECIALS)) if (!s.ship && s.has(u, e)) return id;
  return null;
}
const usable = e => e && !e.dead && !e.downed && !e.jailed && !e.garrison && !e.aboard;
const able = (S, state, e) => !S.able || S.able(state, e);
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
    if (!e || e.owner !== hero.owner || !specialsOf(units, e).includes(c.ability)) continue;
    if (typeof c.auto === 'boolean') {
      if (S.ship) { if (c.auto) { if (e.gunAuto) { delete e.gunAuto[c.ability]; if (!Object.keys(e.gunAuto).length) delete e.gunAuto; } } else (e.gunAuto ||= {})[c.ability] = false; }
      else if (c.auto) delete e.autoCast; else e.autoCast = false;
      n++; continue; }
    if (!usable(e) || !able(S, state, e) || S.readyAt(e) > now) continue;
    if (S.targeted && !spot) continue;
    if (!S.ship && castWanted(state, e)) continue;   // already asked: the next press takes the next unit (a ship gun takes a new aim)
    const d = spot ? Math.hypot(e.x - c.x, e.z - c.z) : n++;   // no spot: listed order
    if (d < bd) { bd = d; best = e; }
  }
  if (typeof c.auto === 'boolean') return n;
  if (!best) return 0;
  if (S.ship) { (best.gunReq ||= {})[c.ability] = { x: c.x, z: c.z, until: now + CAST_WAIT_TICKS }; return 1; }   // each gun its own aim
  best.castReq = S.targeted ? { x: c.x, z: c.z, until: now + CAST_WAIT_TICKS } : { until: now + CAST_WAIT_TICKS };
  return 1;
}
// counts for the ability row: { have, ready, auto, nextReadyAt } of these unit ids
export function specialView({ state, units }, ability, ids) {
  const S = SPECIALS[ability], now = state.tick ?? 0;
  let have = 0, ready = 0, auto = 0, firing = 0, next = Infinity;
  for (const id of ids || []) {
    const e = state.entities[id];
    if (!e || !usable(e) || !specialsOf(units, e).includes(ability)) continue;
    have++; if (S.ship ? gunAuto(e, ability) : autoOn(e)) auto++;
    if (S.ship && (S.gun === 'deckGatling' ? e.gat?.state === 'fire' : now - (e.gunFired?.[S.gun] ?? -1e9) < 24)) firing++;   // a ship gun firing now (Tim 2026-11-23: its slot flashes red)
    const at = able(S, state, e) ? S.readyAt(e) : Infinity;
    if (at <= now) ready++; else next = Math.min(next, at);
  }
  return { have, ready, auto, ...(firing ? { firing } : {}), nextReadyAt: ready || !have ? 0 : next };
}
