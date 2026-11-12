import { ownerIndex } from './util.js';
// Fog of war: what each clan has explored and what it can see right now.
// A grid over the district, one cell per world unit, per clan. The grids live here, not
// in the state (the state stays plain JSON): a server sends each player only its own
// clan's grid, and in single player the screen reads it with grid(clan). Rooms are not on the grid:
// a clan sees into a room while one of its units is in it.
// Ranges come from game/data/units.json rules.vision.

const EVERY = 5;   // ticks between rebuilds of what is in sight (4 a second)

// territory (sim/territory.js, optional): inside a clan's own territory it sees every unit but hidden ninja
// island (optional, frontier W3.2): sight on the island (e.place === 'world'), where there is no grid:
//   { range, fireRange, fireRadius, lightsNear(x, z, r) }. A unit there is seen by the clan's standing units
//   on the island within range, or within fireRange while it stands near a lit fire (fair for bots too).
export function createVision(state, bounds, rules = {}, territory = null, island = null) {
  const range = rules.range ?? 18, businessRange = rules.businessRange ?? 10;
  const minX = Math.floor(bounds.minX), minZ = Math.floor(bounds.minZ);
  const w = Math.ceil(bounds.maxX) - minX, h = Math.ceil(bounds.maxZ) - minZ;
  // per clan: explored = 1 once ever seen, visible = 1 while in sight now
  const grids = {};
  const grid = clan => (grids[clan] ||= { minX, minZ, w, h, explored: new Uint8Array(w * h), visible: new Uint8Array(w * h) });
  const cellOf = (x, z) => {
    const i = Math.floor(x) - minX, j = Math.floor(z) - minZ;
    return i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i;
  };

  function stamp(g, x, z, r) {
    const i0 = Math.max(0, Math.floor(x - r) - minX), i1 = Math.min(w - 1, Math.floor(x + r) - minX);
    const j0 = Math.max(0, Math.floor(z - r) - minZ), j1 = Math.min(h - 1, Math.floor(z + r) - minZ);
    for (let j = j0; j <= j1; j++) {
      const dz = j + minZ + 0.5 - z;
      for (let i = i0; i <= i1; i++) {
        const dx = i + minX + 0.5 - x;
        if (dx * dx + dz * dz <= r * r) { g.visible[j * w + i] = 1; g.explored[j * w + i] = 1; }
      }
    }
  }

  // Standing units of a clan give sight (the hero, crew); downed and dead ones do not
  const eyes = (e, clan) => e.owner === clan && !e.dead && !e.downed && e.place === 'street';

  function update() {
    for (const clan of Object.keys(state.clans || {})) {
      const g = grid(clan);
      g.visible.fill(0);
      for (const e of Object.values(state.entities)) if (eyes(e, clan)) stamp(g, e.x, e.z, range);
      for (const b of Object.values(state.businesses)) if (b.owner === clan && !territory?.areas().some(a => a.business === b.id)) stamp(g, b.x, b.z, businessRange);
      if (territory) {
        const t = territory.cellGrid();
        // the territory grid has the same cells (same bounds)
        for (let n = 0; n < t.cells.length; n++) if (t.cells[n] && t.areas[t.cells[n] - 1].clan === clan) { g.visible[n] = 1; g.explored[n] = 1; }
      }
    }
  }

  function tick() { if (state.tick % EVERY === 0) update(); }

  // Can this clan see this unit now? Its own units always; others on the street when
  // in range of its standing units or businesses, in a room when one of the clan's units is in that room.
  // each clan's units (sim/util.js ownerIndex, rebuilt each tick and after a spawn): canSee was the top sim cost,
  // scanning every entity for every look (Tim 2026-11-08 lag). Positions and states are still read live.
  const owned = ownerIndex(state), live = u => state.entities[u.id] === u;
  const towerMemo = { tick: -1, list: [] };
  const litMemo = new Map(), witness = new Map();   // island sight helpers (never saved; they only shorten the search)
  function canSee(clan, e) {
    if (!e || !clan) return false;
    if (e.owner === clan || e.workerOwner === clan) return true;
    if (e.horseOwner === clan || e.omnibusOwner === clan) return true;   // your own horses and vehicles: never fogged, however far (Tim 2026-11-08)
    if (e.seenBy === clan) return true;   // ownerless scenery of your own (ox carts, rail gang, salute cannons): never fogged (Tim 2026-11-07)
    if (e.detectedBy?.[clan] > state.tick) return true;   // war stealth (sim/stealth.js): a kunoichi detected by this clan's dog handler, Teppo or watchtower
    if (e.hidden) return false;   // a hidden ninja (sim/stealth.js)
    if (e.place === 'world') {
      if (!island) return false;
      // daytime: dayRange (Tim 2026-11-10); night: range, or fireRange near a lit fire
      // speed pass (war collision checkpoint 5b-5): the same answers, worked out with less. By day the fire check is
      // skipped when a fire could not add range; a unit's fire check is kept while it stands on the same spot in the
      // same tick; and the unit that saw it last is asked first, before the whole clan.
      const day = !state.night && island.dayRange;
      let lit = false;
      if (!(day && island.dayRange >= island.fireRange)) {
        let m = litMemo.get(e.id);
        if (!m || m.tick !== state.tick || m.x !== e.x || m.z !== e.z) litMemo.set(e.id, m = { tick: state.tick, x: e.x, z: e.z, lit: !!island.lightsNear?.(e.x, e.z, island.fireRadius).length });
        lit = m.lit;
      }
      const r = day ? Math.max(island.dayRange, lit ? island.fireRange : 0) : lit ? island.fireRange : island.range, rr = r * r;
      const looks = u => u.owner === clan && !u.dead && !u.downed && u.place === 'world' && live(u) && (u.x - e.x) ** 2 + (u.z - e.z) ** 2 <= rr;
      let seen = witness.get(clan); if (!seen) witness.set(clan, seen = new Map());
      const w = seen.get(e.id);
      if (w && looks(w)) return true;
      for (const u of owned(clan)) if (looks(u)) { seen.set(e.id, u); return true; }
      if (w) seen.delete(e.id);
      // 7c (Tim 2026-11-12): a built watchtower sees the ground round it (island.towers: [{ owner, x, z, sight }], listed once a tick)
      if (island.towers) {
        if (towerMemo.tick !== state.tick) { towerMemo.tick = state.tick; towerMemo.list = island.towers() || []; }
        for (const t of towerMemo.list) if (t.owner === clan && t.sight > 0 && (t.x - e.x) ** 2 + (t.z - e.z) ** 2 <= t.sight * t.sight) return true;
      }
      return false;
    }
    if (e.place !== 'street') return owned(clan).some(u => u.owner === clan && !u.dead && u.place === e.place && live(u));
    // checked exactly rather than on the grid, so it is never a few ticks late
    const near = (x, z, r) => (x - e.x) ** 2 + (z - e.z) ** 2 <= r * r;
    if (territory && !e.hidden && territory.ownerAt(e.x, e.z) === clan) return true;   // your own streets (hidden ninja: the normal rules)
    return owned(clan).some(u => eyes(u, clan) && near(u.x, u.z, range) && live(u))
      || Object.values(state.businesses).some(b => b.owner === clan && !territory?.areas().some(a => a.business === b.id) && near(b.x, b.z, businessRange));
  }

  // save/load (sim/save.js): the fog each clan has explored, and what it sees right now
  const saveState = () => ({ grids });
  function loadState(d) {
    for (const k of Object.keys(grids)) delete grids[k];
    for (const [clan, g] of Object.entries(d?.grids || {})) { const t = grid(clan); t.explored.set(g.explored); t.visible.set(g.visible); }
  }
  return { tick, update, canSee, cellOf, grid, range, businessRange, saveState, loadState };
}
