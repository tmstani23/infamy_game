// Ships for the sail between the city harbour and the castle docks (Z7, Tim 2026-11-20): until a passenger ship is
// made, the coastal ship model (ship_coastal, 8 directions) drawn a size larger. One lies at the city harbour pier
// (city coordinates), one at each castle's dock (island), and while a clan's party is at sea (sim/frontier/ferry.js,
// riders aboard 'ship:<owner>') a sailing one is drawn where they are, and that clan's moored ships are hidden.
// Reads the view state only. Placement: data/campaign_zones.json ship.berth (placeholders, set by eye).
// createFerryShips({ scene, carSprite, bp, rules }) -> { update(state, showCity, showWorld, dt, alpha), things(), dispose() }
// A sailing ship is drawn between sim ticks (alpha, as the units are), so it glides instead of stepping 20 times a second.
import { castleIndex } from '../sim/frontier/castle.js';
import { cellToWorld } from '../sim/frontier/town_grid.js';
import { dirIndex } from '../sim/geometry.js';
import { alongRoute } from '../sim/frontier/sea_route.js';

// a castle's dock as world points: land (on the planks) and the open water off its end (as sim/castles.js dock)
export function castleDock(bp, s) {
  const r = bp?.pier?.[0]; if (!r || !s?.grid || !s.castle) return null;
  const mid = Math.floor((r[0] + r[2] - 1) / 2), ix = castleIndex(bp, s.grid.n, s.castle.rot);
  const [lx, lz] = cellToWorld(s, ix(mid, Math.max(r[1], r[3] - 2))), [sx, sz] = cellToWorld(s, ix(mid, r[1]));
  return { land: { x: lx, z: lz }, end: { x: sx, z: sz } };
}
// where a ship lies at a dock: off the dock's end, `out` units into the water and `side` along the end, lying across
// the dock's line (turn) or with its bow out to sea
export function castleBerth(dock, B = {}) {
  const dx = dock.end.x - dock.land.x, dz = dock.end.z - dock.land.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  const out = B.out ?? 8, side = B.side ?? 0;
  return { x: dock.end.x + ux * out - uz * side, z: dock.end.z + uz * out + ux * side, dir: B.turn === false ? dirIndex(ux, uz) : dirIndex(-uz, ux) };
}

// where a ship at sea is drawn this frame: along its route at the frame's time between sim ticks (alpha), so the ship,
// its riders and the camera all glide on the same spot (Tim 2026-11-20: very jerky at every zoom)
export function seaSpot(state, r, alpha = 1) {
  const k = Math.min(1, Math.max(0, ((state.tick ?? 0) - 1 + alpha - r.since) / Math.max(1, r.until - r.since)));
  return alongRoute(r.path || [r.from, r.dest], k);   // round the island by sea (sim/frontier/sea_route.js)
}

export function createFerryShips({ scene, carSprite, bp, rules }) {
  const S = () => rules?.ship || {}, B = () => S().berth || {};
  const size = () => B().size ?? 1.5;
  const ships = new Map();   // key -> { sprite, gone }
  function get(key) {
    let s = ships.get(key);
    if (!s) { s = { sprite: null, gone: false }; ships.set(key, s);
      carSprite('ship_coastal').then(sp => { if (s.gone) { scene.remove(sp.thing.mesh, sp.shadow); sp.dispose(); } else { s.sprite = sp; sp.thing.mesh.visible = sp.shadow.visible = false; } }).catch(() => {}); }
    return s;
  }
  function drop(key) { const s = ships.get(key); if (!s) return; s.gone = true; if (s.sprite) { scene.remove(s.sprite.thing.mesh, s.sprite.shadow); s.sprite.dispose(); } ships.delete(key); }
  const show = (s, on) => { if (s.sprite) s.sprite.thing.mesh.visible = s.sprite.shadow.visible = on; };
  function put(key, x, z, dir, anim, dt) {
    const s = get(key); if (!s.sprite) return;
    s.sprite.update(dt, x, z, dir, anim, null, size());
    show(s, true);
  }
  function update(state, showCity, showWorld, dt, alpha = 1) {
    const seen = new Set();
    // at sea: the riders of each clan, the hero first
    const sea = new Map();
    for (const u of Object.values(state?.entities || {})) if (String(u.aboard || '').startsWith('ship:') && u.shipRide) {
      const o = u.aboard.slice(5); if (!sea.has(o) || u.type === 'hero') sea.set(o, u); }
    // the city's ship: shared by every clan's crossing, so away while the player's party is at sea
    const pier = B().city;
    if (pier && showCity && !sea.size) { put('city', pier[0], pier[1], pier[2] ?? 0, 'idle', dt); seen.add('city'); }
    if (showWorld) {
      for (const s of Object.values(state?.frontier?.settlements || {})) {
        if (!s.castle || s.owner == null || sea.has(s.owner)) continue;
        const d = castleDock(bp, s); if (!d) continue;
        const b = castleBerth(d, B().castle); put(`dock:${s.id}`, b.x, b.z, b.dir, 'idle', dt); seen.add(`dock:${s.id}`);
      }
      for (const [o, u] of sea) { const r = u.shipRide;
        const p = seaSpot(state, r, alpha);
        put(`sea:${o}`, p.x, p.z, dirIndex(p.dx, p.dz), 'walk', dt); seen.add(`sea:${o}`); }
    }
    for (const [k, s] of ships) if (!seen.has(k)) { show(s, false); if (k.startsWith('sea:') && !sea.has(k.slice(4))) drop(k); }
  }
  const things = () => [...ships.values()].filter(s => s.sprite?.thing.mesh.visible).map(s => s.sprite.thing);
  const dispose = () => { for (const k of [...ships.keys()]) drop(k); };
  return { update, things, dispose };
}
