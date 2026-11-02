// Discovery and fog on the island (frontier W2.3). Per clan: which coarse world cells are known,
// which settlement sites are scouted (traits known), and last-seen markers of enemy units out in
// the world. All plain data in state.world, so save/load and the worker carry it as is.
// Numbers: world.json rules.discovery. Never takes a camera or "viewed" argument.
//
// state.world = {
//   discovered: { clan: '0101…' },        // one char per cell, row by row (cols = ceil(w / cell))
//   scouted:    { clan: ['S01', …] },      // site ids, in the order found
//   lastSeen:   { clan: { id: { x, z, dir, tick } } }   // enemy units in the world, not seen now
//   pins:       { clan: [ { id, x, z, note } ] }          // personal map pins (W2.4), max rules.maxPins
// }
// Units in the city (no e.area, or e.area !== 'world') count as standing at the capital
// (capital + cityOffset + their street position; indoors = the capital point); the island units (e.area === 'world') use x, z as is.
export function createDiscovery({ state, world }) {
  if (!world) return { tick() {}, command() { return false; }, siteDiscovered() { return false; }, enabled: false };
  const R = { cell: 250, everyTicks: 10, revealHero: 600, revealUnit: 350, scoutRadius: 150, sightRadius: 400, maxPins: 50, pinNoteChars: 40, ...(world.rules?.discovery || {}) };
  const cols = Math.ceil(world.size.w / R.cell), rows = Math.ceil(world.size.h / R.cell);
  const off = world.capital.cityOffset || { x: 0, z: 0 };
  // indoors (rooms sit far off the street map, sim/interiors.js) counts as the capital point itself
  const worldPos = e => {
    if (e.area === 'world' || e.place === 'world') return { x: e.x, z: e.z };
    const out = !e.place || e.place === 'street';
    return { x: world.capital.x + (off.x || 0) + (out ? e.x : 0), z: world.capital.z + (off.z || 0) + (out ? e.z : 0) };
  };
  const live = e => e && !e.dead && !e.jailed && e.owner;
  function ensure(clan) {
    state.world ||= { discovered: {}, scouted: {}, lastSeen: {} };
    const w = state.world;
    w.discovered ||= {}; w.scouted ||= {}; w.lastSeen ||= {};
    w.discovered[clan] ||= '0'.repeat(cols * rows);
    w.scouted[clan] ||= []; w.lastSeen[clan] ||= {};
    return w;
  }
  // Marks every cell whose centre lies within r of (x, z). Returns the new grid string (same one if nothing changed).
  function reveal(grid, x, z, r) {
    let arr = null;
    const i0 = Math.max(0, Math.floor((x - r) / R.cell)), i1 = Math.min(cols - 1, Math.floor((x + r) / R.cell));
    const j0 = Math.max(0, Math.floor((z - r) / R.cell)), j1 = Math.min(rows - 1, Math.floor((z + r) / R.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * cols + i;
      if (grid[k] === '1') continue;
      if (Math.hypot((i + 0.5) * R.cell - x, (j + 0.5) * R.cell - z) > r) continue;
      (arr ||= grid.split(''))[k] = '1';
    }
    return arr ? arr.join('') : grid;
  }
  function tick() {
    if (state.tick % R.everyTicks) return;
    const byClan = {};
    for (const e of Object.values(state.entities)) if (live(e) && state.clans?.[e.owner]) (byClan[e.owner] ||= []).push(e);
    for (const [clan, mine] of Object.entries(byClan)) {
      const w = ensure(clan);
      let grid = w.discovered[clan];
      const eyes = mine.map(e => ({ e, p: worldPos(e) }));
      for (const { e, p } of eyes) grid = reveal(grid, p.x, p.z, e.type === 'hero' ? R.revealHero : R.revealUnit);
      w.discovered[clan] = grid;
      const scouted = w.scouted[clan];
      for (const { e, p } of eyes) {
        if (e.type !== 'hero') continue;
        for (const s of world.sites) if (!scouted.includes(s.id) && Math.hypot(s.x - p.x, s.z - p.z) <= R.scoutRadius) scouted.push(s.id);
      }
      // Enemy units out in the world: seen now -> forget the marker; out of sight -> keep where last seen
      const seen = w.lastSeen[clan];
      for (const o of Object.values(state.entities)) {
        if (!live(o) || o.owner === clan || o.area !== 'world') continue;
        const inSight = eyes.some(({ p }) => Math.hypot(o.x - p.x, o.z - p.z) <= R.sightRadius);
        if (inSight) seen[o.id] = { x: o.x, z: o.z, dir: o.dir ?? 0, tick: state.tick, now: true };
        else if (seen[o.id]?.now) seen[o.id].now = false;
      }
      for (const id of Object.keys(seen)) if (!live(state.entities[id])) delete seen[id];
    }
  }
  // Map pins: { id: hero, type: 'world', action: 'pin', x, z, note } or { ..., action: 'unpin', pin }.
  // Same command for players and bots. Rejected commands change nothing.
  function command(e, c) {
    if (c.type !== 'world' || !e?.owner || !state.clans?.[e.owner]) return false;
    if (c.action === 'pin') {
      const x = Number(c.x), z = Number(c.z);
      if (!Number.isFinite(x) || !Number.isFinite(z) || x < 0 || z < 0 || x > world.size.w || z > world.size.h) return false;
      const w = ensure(e.owner); w.pins ||= {}; const list = (w.pins[e.owner] ||= []);
      if (list.length >= R.maxPins) return false;
      w.nextPin = (w.nextPin || 0) + 1;
      list.push({ id: 'pin' + w.nextPin, x: Math.round(x), z: Math.round(z), note: String(c.note ?? '').slice(0, R.pinNoteChars) });
      return true;
    }
    if (c.action === 'unpin') {
      const list = state.world?.pins?.[e.owner]; const i = list ? list.findIndex(p => p.id === c.pin) : -1;
      if (i < 0) return false; list.splice(i, 1); return true;
    }
    return false;
  }
  // Read-only helpers (never write).
  const isDiscovered = (clan, x, z) => {
    const g = state.world?.discovered?.[clan]; if (!g) return false;
    const i = Math.floor(x / R.cell), j = Math.floor(z / R.cell);
    return i >= 0 && j >= 0 && i < cols && j < rows && g[j * cols + i] === '1';
  };
  // Is the named site (world.json sites id) inside this clan's discovered area? Used to filter other clans' towns (F4.2).
  const siteById = Object.fromEntries((world.sites || []).map(t => [t.id, t]));
  const siteDiscovered = (clan, id) => { const t = siteById[id]; return !!t && isDiscovered(clan, t.x, t.z); };
  // What one clan may know: own grid, own scouted list, enemies in the world only while seen (else last-seen).
  function viewFor(clan) {
    const w = state.world; if (!w) return null;
    const seen = w.lastSeen?.[clan] || {};
    return { discovered: w.discovered?.[clan] ?? null, scouted: [...(w.scouted?.[clan] || [])],
      lastSeen: Object.fromEntries(Object.entries(seen).map(([id, m]) => [id, { ...m }])), cell: R.cell };
  }
  return { tick, command, isDiscovered, viewFor, siteDiscovered, worldPos, enabled: true, cols, rows, rules: R };
}
