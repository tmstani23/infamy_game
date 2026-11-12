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
// Who is where (war collision checkpoint 5b-5, big fights): every unit in ground squares of `cell`, rebuilt once a tick
// and after each spawn like ownerIndex, so a search for units near a point looks at the squares round it and not at
// every unit. near(x, z, r) gives the numbers of the units that may be within r (their places in all(), the same order
// as state.entities); callers still check place, distance and state live. A search reaches `slack` further than
// asked, which covers how far a unit walks inside one tick; street and island share the squares (callers check place).
export function spatialIndex(state, cell = 12, slack = 3) {
  let at = -1, atRev = -1, all = [], cells = new Map();
  const out = [];
  const fresh = () => {
    const rev = revs.get(state) || 0;
    if (state.tick === at && rev === atRev) return;
    at = state.tick; atRev = rev; all = Object.values(state.entities); cells = new Map();
    for (let k = 0; k < all.length; k++) {
      const u = all[k], key = Math.floor(u.x / cell) * 65536 + Math.floor(u.z / cell);
      const list = cells.get(key); if (list) list.push(k); else cells.set(key, [k]);
    }
  };
  return {
    all: () => { fresh(); return all; },
    // null when r is too wide for squares to help: look at everyone
    near(x, z, r) {
      fresh();
      const R = r + slack;
      if (!(R < cell * 8)) return null;
      out.length = 0;
      const i0 = Math.floor((x - R) / cell), i1 = Math.floor((x + R) / cell), j0 = Math.floor((z - R) / cell), j1 = Math.floor((z + R) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const list = cells.get(i * 65536 + j); if (list) for (let n = 0; n < list.length; n++) out.push(list[n]); }
      return out;
    },
  };
}
// The boss is away from the city (out on the island): his city orders are not available, the lieutenant runs it
// (Tim 2026-11-08). One definition for the sim (game.js command filter) and the UI (Deployment panel, Rally button).
export const bossAway = hero => hero?.type === 'hero' && hero.place === 'world';
