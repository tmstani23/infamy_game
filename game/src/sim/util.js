// Small helpers shared across the sim (phase 7 refactor, 2026-10-29). Plain functions, no state.
export const alive = e => e && !e.dead && !e.downed && !e.jailed;      // standing: not dead, downed or in jail
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);        // ground distance between two units
export const secs = s => Math.round(s * 20);                           // seconds -> sim ticks (20 Hz)
// a short notice for a clan's menus (state.clans[id].notice); returns the text for callers that show it
// Save/load (sim/save.js): put saved data back into a closure's own Map/Set/object/array, keeping its identity
export function refill(target, data) {
  if (target instanceof Map || target instanceof Set) { target.clear(); for (const x of data || []) target instanceof Map ? target.set(...x) : target.add(x); }
  else if (Array.isArray(target)) { target.length = 0; target.push(...(data || [])); }
  else { for (const k of Object.keys(target)) delete target[k]; Object.assign(target, data || {}); }
  return target;
}
export const noticeFor = state => (clan, text) => { clan.notice = { tick: state.tick, text }; return text; };
// Units by owner, rebuilt once a tick and after each spawn (rosterChanged, called by game.js spawn), for read-only
// searches that would otherwise scan every entity for each unit (lag 2026-11-08). Callers skip units removed
// meanwhile with a live check (state.entities[u.id] === u).
const revs = new WeakMap();
export const rosterChanged = state => { revs.set(state, (revs.get(state) || 0) + 1); };
export function ownerIndex(state) {
  let at = -1, atRev = -1, map = new Map(), all = [];
  const NONE = [];   // owner undefined: every unit
  return owner => {
    const rev = revs.get(state) || 0;
    if (state.tick !== at || rev !== atRev) {
      map = new Map(); at = state.tick; atRev = rev; all = Object.values(state.entities);
      for (const u of all) { let a = map.get(u.owner); if (!a) map.set(u.owner, a = []); a.push(u); }
    }
    return owner === undefined ? all : map.get(owner) || NONE;
  };
}
