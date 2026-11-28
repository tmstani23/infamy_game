// Relic tricks (world variety P4, 2026-11-27). The hero's Relic slot (gear_catalog RELICS) holds one relic; a relic is
// a trick, never a stat, and works for the hero plus the crew with him, never war troops (except the conch's order).
// Player clans only. Always on: spyglass (sight), fox mask (unseen), ferryman's charm (wade: areas.js wadeNav).
// Relic key, climber's hook (2026-11-28): hero and crew near go over the nearest town wall or palisade (a thin blocker).
// Relic key (N, a 'relic' command): smoke lantern (a cloud no shot passes through), pilgrim's gourd (a heal over
// time), conch horn (every enemy near shown, hidden ones too). Each key relic has its own cooldown, kept on the hero.
//   state.relicSmokes [{ place, x, z, r, until, clan }]   clouds from the smoke lantern (render/relic_fx.js draws them)
//   e.relicSight                                          sight multiplier, read in sim/boss_abilities.js (sightK)
//   e.relicUnseen                                         fox mask: bandits and wild animals do not notice him; rivals only within this (sim/stealth.js)
//   e.relicReady { [relicId]: tick }                      when each key relic may be used again
//   e.relicMarked                                         tick until which a conch's mark lasts: no stealth (sim/stealth.js)
//   e.relicClimb { x0, z0, x1, z1, from, until }         going over a wall (the hook): placed along the line each tick
// Casts: relicSmoke, relicHeal, relicConch, relicClimb, relicSpotted (the mask broken by an attack).
import { RELICS } from './gear_catalog.js';

export function createRelics({ state, addBuff, giveOrder = () => {}, say = () => {}, secs = s => Math.round(s * 20), wallsNear = () => [], freeAt = (x, z) => [x, z] }) {
  const alive = e => e && !e.dead && !e.downed && !e.jailed;
  const player = owner => !!state.clans?.[owner] && !state.clans[owner].bot;
  const worn = hero => { const id = hero?.equipment?.relic; return id && RELICS[id] ? { id, ...RELICS[id] } : null; };
  const cast = c => state.casts?.push({ place: 'world', ...c });
  const heroes = () => Object.values(state.entities).filter(e => e.type === 'hero' && player(e.owner));
  // the hero's crew with him on the island (not war troops, not workers or settlers)
  const crewOf = (h, R = 40) => Object.values(state.entities).filter(u => u !== h && u.owner === h.owner && u.place === 'world' && !u.warTroop && !u.worker && u.type !== 'settler' && !u.vehicle && alive(u)
    && Math.hypot(u.x - h.x, u.z - h.z) <= R);
  const readyAt = (h, id) => h.relicReady?.[id] ?? 0;

  // The hook's way over: the nearest thin blocker (a wall or palisade run, not a building) within wallRange of the hero,
  // crossed straight through its thin side: { wx, wz (on the wall), x1, z1 (the landing), nx, nz (the way over) } or null
  function climbLine(h, r) {
    const R = r.wallRange ?? 4, thin = r.wallThin ?? 1.6;
    let best = null, bd = Infinity;
    for (const b of wallsNear(h.x, h.z, R + 1)) {
      const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
      if (Math.min(w, d) > thin || Math.max(w, d) < 1.5) continue;
      const px = Math.max(b.minX, Math.min(h.x, b.maxX)), pz = Math.max(b.minZ, Math.min(h.z, b.maxZ)), dist = Math.hypot(px - h.x, pz - h.z);
      if (dist > R || dist >= bd) continue;
      let nx = 0, nz = 0, x1, z1;
      if (w <= d) { nx = h.x < (b.minX + b.maxX) / 2 ? 1 : -1; x1 = nx > 0 ? b.maxX + 1.2 : b.minX - 1.2; z1 = pz; }
      else { nz = h.z < (b.minZ + b.maxZ) / 2 ? 1 : -1; z1 = nz > 0 ? b.maxZ + 1.2 : b.minZ - 1.2; x1 = px; }
      const f = freeAt(x1 + nx * 0.4, z1 + nz * 0.4);
      if (!f || ((f[0] - px) * nx + (f[1] - pz) * nz) <= 0.3) continue;   // nowhere to land on the far side
      best = { wx: nx ? (b.minX + b.maxX) / 2 : px, wz: nz ? (b.minZ + b.maxZ) / 2 : pz, x1: f[0], z1: f[1], nx, nz }; bd = dist;
    }
    return best;
  }
  // the Relic key: why it cannot be used now, or null
  function blocked(h, r = worn(h)) {
    if (!r) return 'No relic worn';
    if (!r.key) return `${r.name} is always on`;
    if (!alive(h)) return 'Your hero is down';
    if (h.place !== 'world') return 'Relics work out on the island';
    if (readyAt(h, r.id) > state.tick) return `${r.name} ready in ${Math.ceil((readyAt(h, r.id) - state.tick) / 20)} s`;
    if (r.trick === 'climb' && (h.mounted || h.ride)) return 'Get off your horse to climb';
    if (r.trick === 'climb' && !climbLine(h, r)) return `No wall or palisade within ${r.wallRange ?? 4} to climb`;
    return null;
  }
  function command(h, c) {
    if (!h || !player(h.owner)) return;
    const r = worn(h), why = blocked(h, r);
    if (why) { say(h.owner, why); return; }
    (h.relicReady ||= {})[r.id] = state.tick + secs(r.cooldown ?? 60);
    if (r.trick === 'smoke') {
      (state.relicSmokes ||= []).push({ place: h.place, x: h.x, z: h.z, r: r.radius ?? 8, until: state.tick + secs(r.seconds ?? 6), clan: h.owner, from: state.tick });
      cast({ kind: 'relicSmoke', a: h.id, x: h.x, z: h.z, r: r.radius ?? 8, seconds: r.seconds ?? 6 });
    } else if (r.trick === 'heal') {
      addBuff(h, 'relicHeal', r.seconds ?? 3, { perTick: h.maxHp * (r.heal ?? 0.5) / secs(r.seconds ?? 3) });
      cast({ kind: 'relicHeal', a: h.id, x: h.x, z: h.z, seconds: r.seconds ?? 3 });
    } else if (r.trick === 'climb') {
      const L = climbLine(h, r), T = secs(r.climbSeconds ?? 3);
      const group = [h, ...Object.values(state.entities).filter(u => u !== h && u.owner === h.owner && u.place === 'world' && !u.warTroop && !u.worker && u.type !== 'settler' && !u.vehicle && !u.mounted && !u.ride && alive(u)
        && Math.hypot(u.x - h.x, u.z - h.z) <= (r.crewRange ?? 8))];
      group.forEach((u, i) => {
        const px = -L.nz, pz = L.nx, side = ((i - 1) % 6 - 2.5) * 0.9, deep = 0.8 + 0.8 * Math.floor((i - 1) / 6);   // the crew land in rows beside the hero's spot
        const spot = (i ? freeAt(L.x1 + px * side + L.nx * deep, L.z1 + pz * side + L.nz * deep) : null) || [L.x1, L.z1];
        const far = (spot[0] - L.wx) * L.nx + (spot[1] - L.wz) * L.nz > 0 ? spot : [L.x1, L.z1];   // never back on the near side
        u.relicClimb = { x0: u.x, z0: u.z, mx: L.wx, mz: L.wz, x1: far[0], z1: far[1], from: state.tick, until: state.tick + T + i };
        delete u.path; u.order = null;
      });
      cast({ kind: 'relicClimb', a: h.id, x: L.wx, z: L.wz, x1: L.x1, z1: L.z1, n: group.length, seconds: r.climbSeconds ?? 3 });
    } else if (r.trick === 'signal') {
      // the conch (2026-11-28, was a call to the war troops): everyone not of the clan within range is shown to it,
      // hidden ninja too, through the same detectedBy that a dog handler's find uses (sim/vision.js canSee)
      const until = state.tick + secs(r.seconds ?? 15), R = r.range ?? 60; let n = 0;
      for (const u of Object.values(state.entities)) {
        if (u.owner === h.owner || u.dead || u.place !== 'world' || u.horseOwner === h.owner || Math.hypot(u.x - h.x, u.z - h.z) > R) continue;
        if (!(u.owner && (state.clans?.[u.owner] || u.owner === 'bandits' || u.guarded) || u.wildlife && u.wm?.den)) continue;   // people of other sides, and wolves and bears; not scenery or deer
        (u.detectedBy ||= {})[h.owner] = Math.max(u.detectedBy[h.owner] ?? 0, until); u.relicMarked = Math.max(u.relicMarked ?? 0, until); n++;   // marked: shown, and no stealth again until it ends (2026-11-28)
      }
      say(h.owner, n ? `${r.name}: ${n} ${n === 1 ? 'enemy' : 'enemies'} within ${R} shown for ${r.seconds ?? 15} s` : `${r.name}: nobody within ${R}`);
      cast({ kind: 'relicConch', a: h.id, x: h.x, z: h.z, n, r: R });
    }
  }
  // a shot from a to b crosses a lantern cloud (either end inside counts): no shot passes through it
  function smokeBlocks(a, b) {
    const S = state.relicSmokes; if (!S?.length || !a || !b) return false;
    for (const s of S) {
      if (s.place !== a.place || s.until <= state.tick) continue;
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1, k = Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.z - a.z) * dz) / L2));
      if ((a.x + dx * k - s.x) ** 2 + (a.z + dz * k - s.z) ** 2 <= s.r * s.r) return true;
    }
    return false;
  }

  function tick() {
    // the gourd's heal
    for (const e of Object.values(state.entities)) {
      const b = e.buffs?.relicHeal;
      if (b && b.until > state.tick && alive(e) && e.maxHp) e.hp = Math.min(e.maxHp, e.hp + b.perTick);
    }
    // the hook: climbers go up to the wall top, then down the far side; nothing else moves them meanwhile
    for (const e of Object.values(state.entities)) {
      const c = e.relicClimb; if (!c) continue;
      if (!alive(e) || state.tick >= c.until) { if (alive(e)) { e.x = c.x1; e.z = c.z1; } delete e.relicClimb; delete e.path; continue; }
      const k = (state.tick - c.from) / Math.max(1, c.until - c.from), u = Math.min(1, k * 2), v = Math.max(0, k * 2 - 1);
      e.x = k < .5 ? c.x0 + (c.mx - c.x0) * u : c.mx + (c.x1 - c.mx) * v; e.z = k < .5 ? c.z0 + (c.mz - c.z0) * u : c.mz + (c.z1 - c.mz) * v;
      e.anim = 'walk'; delete e.path; delete e.swing;
    }
    if (state.relicSmokes) { state.relicSmokes = state.relicSmokes.filter(s => s.until > state.tick); if (!state.relicSmokes.length) delete state.relicSmokes; }
    // fox mask broken: any hit by the masked hero's people (not war troops) this tick shows them for 20 s
    if (state.hits?.length) for (const h of heroes()) if (worn(h)?.trick === 'unseen' && state.hits.some(x => { const a = state.entities[x.a]; return a && a.owner === h.owner && !a.warTroop; })) {
      if ((h.relicSpotted ?? -1) <= state.tick) cast({ kind: 'relicSpotted', a: h.id, x: h.x, z: h.z });
      h.relicSpotted = state.tick + secs(20);
    }
    if (state.tick % 5) return;
    for (const h of heroes()) {
      const r = worn(h), out = h.place === 'world';
      // spyglass: the hero sees farther
      if (r?.trick === 'sight' && out) h.relicSight = r.sightMult ?? 1.6; else delete h.relicSight;
      // fox mask: hero and crew unseen by bandits and wild animals until one of them attacks (then 20 s seen)
      const group = [h, ...crewOf(h, r?.crewRange ?? 40)], ids = new Set(group.map(u => u.id));
      if (r?.trick === 'unseen' && out) {
        const hide = (h.relicSpotted ?? -1) <= state.tick;
        for (const u of group) if (hide) u.relicUnseen = r.rivalSight ?? 6; else delete u.relicUnseen;
      }
      // anyone no longer with a masked hero loses the cover
      for (const u of Object.values(state.entities)) if (u.relicUnseen && u.owner === h.owner && !(r?.trick === 'unseen' && out && ids.has(u.id) && (h.relicSpotted ?? -1) <= state.tick)) delete u.relicUnseen;
    }
  }
  // The Ferryman's charm: who wades (the wearer and his crew with him), worked out once a tick
  let wadeAt = -1; const waders = new Map();
  function wades(e) {
    if (!e || e.place !== 'world') return false;
    if (wadeAt !== state.tick) { wadeAt = state.tick; waders.clear(); for (const h of heroes()) if (alive(h) && h.place === 'world' && worn(h)?.trick === 'wade') waders.set(h.owner, h); }
    const h = waders.get(e.owner);
    if (!h) return false;
    return e === h || (!e.warTroop && !e.worker && e.type !== 'settler' && !e.vehicle && alive(e) && Math.hypot(e.x - h.x, e.z - h.z) <= (worn(h)?.crewRange ?? 120));
  }
  const waterSpeed = () => [...waders.values()].map(h => worn(h)?.waterSpeed).find(v => v) ?? 0.6;
  return { tick, command, blocked, worn, smokeBlocks, readyAt, wades, waterSpeed, climbLine };
}
