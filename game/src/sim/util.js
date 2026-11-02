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
