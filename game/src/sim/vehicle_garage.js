// Recall and storage for your horses and vehicles (Tim 2026-11-07, the Vehicles panel, src/vehicles_panel.js).
// { id: <hero id>, type: 'garage', action: 'recall' | 'takeout', unit: <horse / rickshaw / omnibus id> }
//  - recall: anyone aboard or riding gets off; it heads for your nearest built stable on its own and is stored
//    there (e.stored = { town }, place 'stable': off the map, safe, still counted in your stable room). Further
//    than rules.garage.driveRange, or no closer for rules.garage.stuckSeconds, it is stored at once.
//  - recallAll: the same for every horse and vehicle you own that is not stored or on its way.
//  - takeout: a stored one comes out, parked beside its stable.
// A stored horse still answers her whistle (sim/mounts.js).
// createGarage({ state, rules, nav, stable, omnibus, mounts, say }) -> { command, tick, stableOf, kindOf }
import { steer } from './vehicle_steer.js';

export function createGarage({ state, rules, nav, stable, omnibus, mounts, say }) {
  const R = () => rules?.garage || {};
  const ownerOf = e => e?.type === 'horse' ? e.horseOwner : e?.omnibusOwner;
  const kindOf = e => e?.type === 'horse' ? 'horse' : e?.type === 'rickshaw' || e?.type === 'omnibus' ? e.type : null;
  const run = () => rules?.mount?.heroRun ?? 6;
  const speedOf = e => run() * (e.type === 'horse' ? rules?.mount?.speed ?? 3.75 : rules?.[e.type]?.speed ?? 3);
  // the owner's nearest built stable: { town, x, z }
  function stableOf(owner, x = 0, z = 0) {
    let best = null;
    for (const t of Object.values(state.frontier?.settlements || {})) {
      if (t.owner !== owner || t.capital) continue;
      const b = stable().of(t); if (!b) continue;
      const [sx, sz] = stable().centre(t, b), d = Math.hypot(sx - x, sz - z);
      if (!best || d < best.d) best = { town: t.id, name: t.name, x: sx, z: sz, d };
    }
    return best;
  }
  function store(e, at) {
    Object.assign(e, { stored: { town: at.town }, place: 'stable', anim: 'idle' });
    delete e.recall; delete e.called; delete e.path; delete e.vorder; delete e.trail;
    if (e.type !== 'horse') e.trail = [];
  }
  function getOff(e) {
    if (e.type === 'horse') { const r = e.rider && state.entities[e.rider]; if (r) mounts?.dismount(r); return; }
    const hero = Object.values(state.entities).find(h => h.type === 'hero' && h.owner === e.omnibusOwner);
    if (omnibus?.riders(e).length && hero) omnibus.deploy(hero, [e.id]);
  }
  function command(hero, c) {
    if (hero.type !== 'hero' || c.type !== 'garage') return;
    if (c.action === 'recallAll') return recallAll(hero);
    const e = state.entities[c.unit];
    if (!kindOf(e) || ownerOf(e) !== hero.owner || e.dead) return say(hero.owner, 'Not yours');
    if (c.action === 'takeout') {
      if (!e.stored) return say(hero.owner, 'It is not in a stable');
      const t = state.frontier?.settlements?.[e.stored.town], b = t && stable().of(t);
      const at = b ? (() => { const [x, z] = stable().centre(t, b); return { x, z }; })() : stableOf(hero.owner, hero.x, hero.z);
      if (!at) return say(hero.owner, 'No stable to take it out of');
      const [x, z] = e.type === 'horse' ? (nav()?.nearestFree(at.x + 10, at.z + 5) || [at.x + 10, at.z]) : omnibus?.spotFor?.(e.type, at.x + 10, at.z + 5) || [at.x + 10, at.z];   // its own spot, clear of other vehicles
      Object.assign(e, { place: 'world', x, z, anim: 'idle' }); delete e.stored;
      return say(hero.owner, `${e.name || (e.type === 'omnibus' ? 'The omnibus' : 'The rickshaw')} is out at ${t?.name || 'the stable'}`);
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
  // recalled ones make their way to the stable
  function tick(dt = 1 / 20) {
    for (const e of Object.values(state.entities)) {
      const r = e.recall; if (!r) continue;
      if (e.dead || e.stored) { delete e.recall; continue; }
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
  return { command, tick, stableOf, kindOf };
}
