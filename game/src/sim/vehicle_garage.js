// Recall and storage for your horses and vehicles (Tim 2026-11-07, the Vehicles panel, src/vehicles_panel.js).
// { id: <hero id>, type: 'garage', action: 'recall' | 'takeout', unit: <horse / rickshaw / omnibus id> }
//  - recall: anyone aboard or riding gets off; it heads for your nearest built stable on its own and is stored
//    there (e.stored = { town }, place 'stable': off the map, safe, still counted in your stable room). Further
//    than rules.garage.driveRange, or no closer for rules.garage.stuckSeconds, it is stored at once.
//  - recallAll: the same for every horse and vehicle you own that is not stored or on its way.
//  - takeout: a stored one comes out, parked beside its stable.
// A stored horse still answers her whistle (sim/mounts.js).
// War camp stables (Tim 2026-11-14): a built 'stable' in your war camp works like a town stable for what you own
// (stored there = e.stored.town 'war:<war id>'; takeout with at: 'war:<war id>' brings any stored one out beside it)
// but makes nothing and adds no room. When the war ends the camp packs up: what is stored there, and every empty
// horse or vehicle of the attacker standing in the war area (rules.garage.warArea round the town, else the banner),
// is stored at once in the nearest town stable. War cavalry horses are troops, never garaged.
// A town lost to Capture or Burn (checkpoint 8a): what its old owner stored there moves to his nearest other stable.
// createGarage({ state, rules, nav, stable, omnibus, mounts, say }) -> { command, tick, stableOf, kindOf }
import { steer } from './vehicle_steer.js';
import { townBlockersIn } from './frontier/town_grid.js';

export function createGarage({ state, rules, nav, stable, omnibus, mounts, say }) {
  const R = () => rules?.garage || {};
  const ownerOf = e => e?.type === 'horse' ? e.horseOwner : e?.omnibusOwner;
  const kindOf = e => e?.type === 'horse' ? (e.cavalry ? null : 'horse') : e?.type === 'rickshaw' || e?.type === 'omnibus' ? e.type : null;
  const CAMP = 'war:';
  // your built war camp stables: { town: 'war:<id>', name, x, z } (only active wars you attack in)
  function campStables(owner) {
    const out = [];
    for (const w of Object.values(state.frontier?.wars?.list || {})) {
      if (w.attacker !== owner || !w.camp) continue;
      const b = (w.camp.buildings || []).find(x => x.type === 'stable' && x.stage === 'built' && !x.dead);
      if (b) out.push({ town: CAMP + w.id, name: 'the war camp', x: b.x, z: b.z });
    }
    return out;
  }
  const campStable = (owner, key) => campStables(owner).find(c => c.town === key) || null;
  const run = () => rules?.mount?.heroRun ?? 6;
  const speedOf = e => run() * (e.type === 'horse' ? rules?.mount?.speed ?? 3.75 : rules?.[e.type]?.speed ?? 3);
  // the owner's nearest built stable: { town, x, z }
  function stableOf(owner, x = 0, z = 0, camps = true) {
    let best = null;
    for (const t of Object.values(state.frontier?.settlements || {})) {
      if (t.owner !== owner || t.capital) continue;
      const b = stable().of(t); if (!b) continue;
      const [sx, sz] = stable().centre(t, b), d = Math.hypot(sx - x, sz - z);
      if (!best || d < best.d) best = { town: t.id, name: t.name, x: sx, z: sz, d };
    }
    const cap = stable()?.capitalAt?.(owner);   // the capital stable (Tim 2026-11-07): stores at the island side of the gate
    if (cap) { const d = Math.hypot(cap[0] - x, cap[1] - z); if (!best || d < best.d) best = { town: 'capital', name: 'the capital', x: cap[0], z: cap[1], d }; }
    if (camps) for (const c of campStables(owner)) { const d = Math.hypot(c.x - x, c.z - z); if (!best || d < best.d) best = { ...c, d }; }
    return best;
  }
  // a parking spot around the stable for one coming out (Tim 2026-11-10): rings around it, clear of town buildings
  // (padded by its size) and a length away from every other horse and vehicle that is out, so none stack
  const sizeOf = e => e.type === 'horse' ? R().horseSpace ?? 4 : rules?.[e.type]?.length ?? 6;
  function parkSpot(e, at) {
    const me = sizeOf(e), pad = me / 2, n = nav();
    const others = Object.values(state.entities).filter(v => v !== e && kindOf(v) && !v.dead && !v.stored && v.place === 'world');
    const clear = (x, z) => !townBlockersIn(state.frontier, x - pad, z - pad, x + pad, z + pad).length
      && others.every(v => Math.hypot(v.x - x, v.z - z) >= (sizeOf(v) + me) / 2 + (R().parkGap ?? 1));
    const r0 = R().parkRing ?? 9, step = R().parkStep ?? 4;
    for (let ring = 0; ring < 14; ring++) {
      const r = r0 + ring * step, count = Math.max(6, Math.round(2 * Math.PI * r / (me + 2)));
      for (let k = 0; k < count; k++) {
        const a = Math.PI / 2 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) / count * Math.PI * 2;   // front of the stable first, fanning out both ways
        const want = [at.x + Math.cos(a) * r, at.z + Math.sin(a) * r], p = n?.nearestFree(...want) || want;
        if (Math.hypot(p[0] - want[0], p[1] - want[1]) <= 2 && clear(...p)) return p;
      }
    }
    return null;
  }
  function store(e, at) {
    Object.assign(e, { stored: { town: at.town }, place: 'stable', anim: 'idle' });
    delete e.recall; delete e.called; delete e.path; delete e.vorder; delete e.trail;
    if (e.type !== 'horse') e.trail = [];
  }
  // really riding her: the rider exists and his ride points at this horse (a leftover rider id does not count)
  const ridden = e => { const r = e.rider && state.entities[e.rider]; return !!r && !r.dead && r.ride?.kind === 'horse' && r.ride.horse === e.id; };
  function getOff(e) {
    if (e.type === 'horse') {
      if (ridden(e)) mounts?.dismount(state.entities[e.rider]);
      delete e.rider;   // Tim 2026-11-10: a leftover rider id (rider gone, or riding something else) cancelled every recall
      return;
    }
    const hero = Object.values(state.entities).find(h => h.type === 'hero' && h.owner === e.omnibusOwner);
    if (omnibus?.riders(e).length && hero) omnibus.deploy(hero, [e.id]);
    // anyone still inside (down, or the step-out refused) is set beside it, so the vehicle always goes
    for (const u of omnibus?.riders(e) || []) { delete u.aboard; if (u.ride?.kind === 'omnibus') delete u.ride; }
    delete e.driver;
  }
  function command(hero, c) {
    if (hero.type !== 'hero' || c.type !== 'garage') return;
    if (c.action === 'recallAll') return recallAll(hero);
    const e = state.entities[c.unit];
    if (!kindOf(e) || ownerOf(e) !== hero.owner || e.dead) return say(hero.owner, 'Not yours');
    if (c.action === 'takeout') {
      if (!e.stored) return say(hero.owner, 'It is not in a stable');
      // from a war camp stable's menu (c.at): any stored one comes out beside that camp stable (Tim 2026-11-14)
      const camp = c.at ? campStable(hero.owner, c.at) : String(e.stored.town).startsWith(CAMP) ? campStable(hero.owner, e.stored.town) : null;
      if (c.at && !camp) return say(hero.owner, 'Build a stable in the war camp first');
      const t = !camp && state.frontier?.settlements?.[e.stored.town], b = t && stable().of(t), cap = !camp && e.stored.town === 'capital' && stable()?.capitalAt?.(hero.owner);
      const at = camp ? { x: camp.x, z: camp.z } : cap ? { x: cap[0], z: cap[1] } : b ? (() => { const [x, z] = stable().centre(t, b); return { x, z }; })() : stableOf(hero.owner, hero.x, hero.z);
      if (!at) return say(hero.owner, 'No stable to take it out of');
      const [x, z] = parkSpot(e, at) || (e.type === 'horse' ? (nav()?.nearestFree(at.x + 10, at.z + 5) || [at.x + 10, at.z]) : omnibus?.spotFor?.(e.type, at.x + 10, at.z + 5) || [at.x + 10, at.z]);   // its own spot around the stable
      Object.assign(e, { place: 'world', x, z, anim: 'idle' }); delete e.stored;
      return say(hero.owner, `${e.name || (e.type === 'omnibus' ? 'The omnibus' : 'The rickshaw')} is out ${camp ? 'at the war camp' : cap ? 'outside the island gate' : `at ${t?.name || 'the stable'}`}`);
    }
    if (c.action !== 'recall') return;
    if (e.stored) return say(hero.owner, 'Already in the stable');
    const r = recall(hero, e);
    say(hero.owner, !r ? 'Build a stable first' : r.stored ? `Sent back to the stable in ${r.name}` : `On its way back to the stable in ${r.name}`);
  }
  // one horse or vehicle back to the nearest stable: stored at once when far or off the map, else it goes there
  function recall(hero, e) {
    const at = stableOf(hero.owner, e.x, e.z);
    if (!at) return null;
    getOff(e);
    if (e.place !== 'world' || at.d > (R().driveRange ?? 400)) { store(e, at); return { name: at.name, stored: true }; }
    e.recall = { town: at.town, x: at.x, z: at.z, best: at.d, tick: state.tick };
    delete e.called; delete e.path; delete e.vorder;
    return { name: at.name };
  }
  // Recall all (stable menu, Tim 2026-11-07): every horse and vehicle you own that is not stored yet
  function recallAll(hero) {
    const list = Object.values(state.entities).filter(e => kindOf(e) && !e.dead && !e.stored && !e.recall && ownerOf(e) === hero.owner);
    if (!list.length) return say(hero.owner, 'Everything is already in a stable');
    let n = 0;
    for (const e of list) if (recall(hero, e)) n++;
    say(hero.owner, n ? `${n} sent back to the stables` : 'Build a stable first');
  }
  // the war camp packs up (Tim 2026-11-14): once a second, a war that has ended sends home what is stored at its
  // camp and what stands empty in its area; an old ended war (before this rule) is only marked
  const busy = e => e.type === 'horse' ? ridden(e) || !!e.called : !!(omnibus?.riders(e).length);
  function packUp() {
    const wars = state.frontier?.wars; if (!wars) return;
    const live = wars.list || {};
    for (const w of wars.history || []) {
      if (w.mountsHome) continue;
      w.mountsHome = true;
      if ((state.tick ?? 0) - (w.ended ?? 0) > 20 * 60) continue;
      const t = state.frontier.settlements?.[w.town], cx = t?.x ?? w.x, cz = t?.z ?? w.z, r = R().warArea ?? 900;
      for (const e of Object.values(state.entities)) {
        if (!kindOf(e) || e.dead || e.stored || ownerOf(e) !== w.attacker || e.place !== 'world' || busy(e)) continue;
        if (Math.hypot(e.x - cx, e.z - cz) > r) continue;
        const at = stableOf(w.attacker, e.x, e.z, false); if (!at) continue;
        getOff(e); store(e, at);
      }
    }
    for (const e of Object.values(state.entities)) {
      const k = e.stored?.town; if (!kindOf(e) || e.dead || typeof k !== 'string' || !k.startsWith(CAMP) || live[k.slice(CAMP.length)]) continue;
      const at = stableOf(ownerOf(e), e.x, e.z, false); if (at) e.stored = { town: at.town };
    }
    // a town that was captured or burned (war outcomes, checkpoint 8a): what its old owner stored there moves to
    // the nearest stable he still has
    for (const e of Object.values(state.entities)) {
      const k = e.stored?.town; if (!kindOf(e) || e.dead || typeof k !== 'string' || k === 'capital' || k.startsWith(CAMP)) continue;
      const t = state.frontier.settlements?.[k]; if (t && t.owner === ownerOf(e)) continue;
      const at = stableOf(ownerOf(e), t?.x ?? e.x, t?.z ?? e.z, false); if (at) e.stored = { town: at.town };
    }
  }
  // recalled ones make their way to the stable
  function tick(dt = 1 / 20) {
    if ((state.tick ?? 0) % 20 === 0) packUp();
    for (const e of Object.values(state.entities)) {
      const r = e.recall; if (!r) continue;
      if (e.dead || e.stored) { delete e.recall; continue; }
      if (e.type === 'horse' && e.rider && !ridden(e)) delete e.rider;
      if (e.rider || (e.type !== 'horse' && omnibus?.riders(e).length)) { delete e.recall; continue; }   // someone got on: the recall is off
      const dx = r.x - e.x, dz = r.z - e.z, d = Math.hypot(dx, dz);
      if (d <= (R().arriveRange ?? 14)) { store(e, r); continue; }
      if (d < r.best - 1) { r.best = d; r.tick = state.tick; }
      else if (state.tick - r.tick > (R().stuckSeconds ?? 5) * 20) { store(e, r); continue; }
      const s = steer(e, Math.atan2(dx, dz), { turnDegrees: 240 }, dt), step = Math.min(d, speedOf(e) * dt * (s.slow ?? 1));
      const nx = e.x + s.hx * step, nz = e.z + s.hz * step, [fx, fz] = nav()?.nearestFree(nx, nz) || [nx, nz];
      Object.assign(e, { x: fx, z: fz, anim: e.type === 'horse' ? 'run' : 'walk' }); if (e.trail) e.trail = [];
    }
  }
  return { command, tick, stableOf, kindOf, campStables };
}
