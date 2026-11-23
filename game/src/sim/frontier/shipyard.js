// Ships S3 (plan war_build/ships/ships_plan.md): where the ship buildings may stand. The town shipyard stands on the
// shore by its town's harbour (world.json site.harbor; a river town without one: anywhere on its grid), the camp
// slipway on any shore inside the war circle outside the town ring. "On the shore" = within shoreReach of water big ships sail
// (sim/frontier/water_nav.js). Plain functions of the world and the data, so the sim and the build bar agree.
import { waterGrid, nearestSailable, landingFor } from './water_nav.js';
import { buildable, passable, terrainAt } from '../world_data.js';

const harbourOf = (world, s) => world?.sites?.find(t => t.id === s?.site)?.harbor || null;
const sailNear = (world, x, z, r) => !!nearestSailable(waterGrid(world), x, z, 'big', r);
// right at the drawn water's edge (Tim 2026-11-23: a slipway stood far up the grass): drawn sea or river within r of
// the middle, as the eye sees the shore; the grid test above only says that water is big ships' water
const wetWithin = (world, x, z, r) => { const w = (a, b) => { const c = terrainAt(world, a, b); return c === 'w' || c === 'r'; };
  if (w(x, z)) return true; for (let d = 2; d <= r; d += 2) for (let k = 0; k < 24; k++) if (w(x + Math.cos(k * Math.PI / 12) * d, z + Math.sin(k * Math.PI / 12) * d)) return true; return false; };
const onShore = (world, x, z, def) => sailNear(world, x, z, def.shoreReach ?? 30) && wetWithin(world, x, z, def.shoreEdge ?? 18);
const cache = new WeakMap();   // world -> Map(key -> bool)
function remember(world, key, fn) {
  let m = cache.get(world); if (!m) cache.set(world, m = new Map());
  if (!m.has(key)) m.set(key, fn());
  return m.get(key);
}

// does this town have water big ships sail near its harbour (or, with none, near its hall)? Worlds without terrain: yes
export function yardWater(world, s, def = {}) {
  if (!world?.terrain || !s) return true;
  return remember(world, `town:${s.id}:${s.x}:${s.z}`, () => {
    const h = harbourOf(world, s);
    return h ? sailNear(world, h.x, h.z, def.harbourReach ?? 250) : sailNear(world, s.x, s.z, def.riverReach ?? 300);
  });
}
// why a town shipyard cannot stand with its middle at x, z, or null
export function yardSpotWhy(world, s, x, z, def = {}) {
  if (!world?.terrain) return null;
  if (!yardWater(world, s, def)) return 'This town has no harbour water ships can sail';
  const h = harbourOf(world, s);
  if (h && Math.hypot(x - h.x, z - h.z) > (def.harbourReach ?? 250)) return 'A shipyard stands by the harbour';
  return onShore(world, x, z, def) ? null : 'A shipyard stands on the shore, at the water\'s edge';
}
// why a camp slipway cannot stand at x, z, or null
export function slipSpotWhy(world, x, z, def = {}) {
  if (!world?.terrain) return null;
  return onShore(world, x, z, def) ? null : 'A slipway stands on the shore, at the water\'s edge';
}
// does the war circle round a town hold shore outside the town's build ring (ring: its radius) where a slipway could
// stand: ground that can be built on (as war.js groundOk) within shoreReach of water big ships sail? Offered only then.
const landOk = (world, x, z, h = 5.5) => { for (const dx of [-h, 0, h]) for (const dz of [-h, 0, h]) if (!buildable(world, x + dx, z + dz) || !passable(world, x + dx, z + dz)) return false; return true; };
export function circleShore(world, t, r, ring = 0, def = {}) {
  if (!world?.terrain || !t) return true;
  const reach = def.shoreReach ?? 30;
  return remember(world, `circle:${t.id}:${t.x}:${t.z}:${r}:${ring}:${reach}`, () => {
    const g = waterGrid(world);
    for (let x = t.x - r; x <= t.x + r; x += 10) for (let z = t.z - r; z <= t.z + r; z += 10) {
      const d = Math.hypot(x - t.x, z - t.z);
      if (d > ring + 15 && d < r - 15 && landOk(world, x, z) && nearestSailable(g, x, z, 'big', reach) && wetWithin(world, x, z, def.shoreEdge ?? 18)) return true;
    }
    return false;
  });
}
// where ships from a yard at x, z come out: the water beside it, or null
export function yardBerth(world, x, z, reach = 80) {
  if (!world?.terrain) return null;
  const g = waterGrid(world), L = landingFor(g, x, z, 'big', { maxR: reach });
  return L?.berth || nearestSailable(g, x, z, 'big', reach);
}
