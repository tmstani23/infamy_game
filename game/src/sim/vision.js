// Fog of war: what each clan has explored and what it can see right now.
// A grid over the district, one cell per world unit, per clan. The grids live here, not
// in the state (the state stays plain JSON): a server sends each player only its own
// clan's grid, and in single player the screen reads it with grid(clan). Rooms are not on the grid:
// a clan sees into a room while one of its units is in it.
// Ranges come from game/data/units.json rules.vision.

const EVERY = 5;   // ticks between rebuilds of what is in sight (4 a second)

export function createVision(state, bounds, rules = {}) {
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
      for (const b of Object.values(state.businesses)) if (b.owner === clan) stamp(g, b.x, b.z, businessRange);
    }
  }

  function tick() { if (state.tick % EVERY === 0) update(); }

  // Can this clan see this unit now? Its own units always; others on the street when
  // in range of its standing units or businesses, in a room when one of the clan's units is in that room.
  function canSee(clan, e) {
    if (!e || !clan) return false;
    if (e.owner === clan) return true;
    if (e.place !== 'street') return Object.values(state.entities).some(u => u.owner === clan && !u.dead && u.place === e.place);
    // checked exactly rather than on the grid, so it is never a few ticks late
    const near = (x, z, r) => (x - e.x) ** 2 + (z - e.z) ** 2 <= r * r;
    return Object.values(state.entities).some(u => eyes(u, clan) && near(u.x, u.z, range))
      || Object.values(state.businesses).some(b => b.owner === clan && near(b.x, b.z, businessRange));
  }

  return { tick, update, canSee, cellOf, grid, range, businessRange };
}
