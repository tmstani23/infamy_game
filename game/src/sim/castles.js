// Clan castles on the island (Z4, Tim 2026-11-19): where each zone's castle stands and placing a clan's castle there.
// The castle record and its layout come from sim/frontier/castle.js; the spots from data/campaign_zones.json.
// frontierData.castleBlueprint = data/castle_default.json and frontierData.campaignZones = data/campaign_zones.json
// (main.js and the tests lay both over frontier.json, like railways.json).
//   createCastles({ state, data, world, frontier }) -> { spots, castleOf, place }
//     place(clan, zoneId) -> the castle record (once per clan); castleOf(clan) -> its castle or null;
//     approach(clan) -> { x, z } on the open ground in front of its drawbridge
//     dock(clan) -> { land, sea }: where the ship from the city lands and the water off the dock's end
//     levelAt(x, z) -> the castle terrace level under a point (0 off the terraces; a land bridge counts as its low end)
//     rangeScale(a, b) -> how much further shooter a reaches at b from higher ground (castle_default.json highGround)
import { addCastle, castleIndex, castleBox } from './frontier/castle.js';
import { cellToWorld } from './frontier/town_grid.js';
import { createCampaignZones } from './campaign_zones.js';

const ROT = { north: 0, east: 1, south: 2, west: 3 };   // which way the dock faces -> quarter turns of the blueprint

// the ground every castle spot stands on (whether or not a clan's castle is there this game), as world boxes: the
// island's generated trees and rocks keep off it (sim/chunk_gen.js world.castleClear), in the sim and the drawing alike
export function castleClearings(world, data) {
  const bp = data?.castleBlueprint, rules = data?.campaignZones;
  if (!bp || !rules || !world) return [];
  const cell = data.townGrid?.cellSize || 11;
  return createCampaignZones({ rules, world }).castles().filter(c => Number.isFinite(c.x)).map(c => castleBox(bp, c.x, c.z, ROT[c.sea] ?? 0, cell));
}

// the castle ground over the island's water (Tim 2026-11-20, the dock past the harbour gate): every cell of a placed castle
// that stands on castle ground and is not sea or moat, as world boxes (one per run of such cells along a grid row). The
// island's water under them does not block walking (sim/chunk_gen.js opts.walk); the castle's own walls, gates and sea
// cells still block (town_grid.js). Kept rock under the sea side (ground 'x') stays as the island has it.
export function castleWalkBoxes(s) {
  const g = s?.grid; if (!g?.level || !s.castle) return [];
  const n = g.n, mid = (n - 1) / 2, out = [], ok = i => g.level[i] !== '.' && g.ground[i] === 'c' && g.use[i] !== 'm';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!ok(r * n + c) || (c > 0 && ok(r * n + c - 1))) continue;
    let e = c; while (e + 1 < n && ok(r * n + e + 1)) e++;
    out.push({ minX: s.x + (c - mid - 0.5) * g.cell, maxX: s.x + (e - mid + 0.5) * g.cell, minZ: s.z + (r - mid - 0.5) * g.cell, maxZ: s.z + (r - mid + 0.5) * g.cell });
  }
  return out;
}

export function createCastles({ state, data, world, frontier }) {
  const bp = data?.castleBlueprint, rules = data?.campaignZones;
  if (!bp || !rules || !world || !frontier) return null;
  const zones = createCampaignZones({ rules, world });
  const spots = () => zones.castles();
  const castleOf = clan => Object.values(state.frontier?.settlements || {}).find(s => s.castle && s.owner === clan) || null;
  function place(clan, zoneId) {
    if (castleOf(clan)) return castleOf(clan);
    const spot = spots().find(c => c.zone === zoneId), c = state.clans?.[clan];
    if (!spot || !c || !Number.isFinite(spot.x)) return null;
    const w = frontier.world, id = `castle_${zoneId}`;
    if (state.frontier.settlements[id]) return null;
    const name = `${c.name || clan} castle`;
    return addCastle({ world: w, worldData: world, data, bp, id, name, owner: clan, x: spot.x, z: spot.z, rot: ROT[spot.sea] ?? 0, kind: c.kind });
  }
  // the open ground in front of a clan's drawbridge (blueprint approach), as a world point
  function approach(clan) {
    const c = castleOf(clan), a = bp.approach?.at;
    if (!c?.grid || !a) return null;
    const [x, z] = cellToWorld(c, castleIndex(bp, c.grid.n, c.castle.rot)(a[0], a[1]));
    return { x, z };
  }
  // the dock (blueprint pier): where the ship from the city lands (land, on the planks by the harbour gate) and the
  // open water off its end (sea), as world points (sim/frontier/ferry.js)
  function dock(clan) {
    const c = castleOf(clan), r = bp.pier?.[0];
    if (!c?.grid || !r) return null;
    const mid = Math.floor((r[0] + r[2] - 1) / 2), ix = castleIndex(bp, c.grid.n, c.castle.rot);
    const [lx, lz] = cellToWorld(c, ix(mid, Math.max(r[1], r[3] - 2))), [sx, sz] = cellToWorld(c, ix(mid, r[1]));
    return { land: { x: lx, z: lz }, sea: { x: sx + (sx - lx) * 3, z: sz + (sz - lz) * 3 } };
  }
  // high ground (Z4h, plan Z8: "a small range bonus for shooters on a higher ring"): each terrace level a shooter stands
  // above its target adds highGround.rangePerLevel of its range (placeholder, Tim to tune)
  let ids = null;
  function levelAt(x, z) {
    ids ||= spots().map(c => `castle_${c.zone}`);
    for (const id of ids) {
      const s = state.frontier?.settlements?.[id], g = s?.grid;
      if (!g?.level || !Number.isFinite(s.x)) continue;
      const mid = (g.n - 1) / 2, col = Math.round((x - s.x) / g.cell + mid), row = Math.round((z - s.z) / g.cell + mid);
      if (col < 0 || row < 0 || col >= g.n || row >= g.n) continue;
      const l = g.level[row * g.n + col];
      if (l !== '.') return Number(l) || 0;
    }
    return 0;
  }
  const per = bp.highGround?.rangePerLevel ?? 0;
  const rangeScale = (a, b) => {
    if (!per || !a || !b || (a.place ?? 'world') !== 'world' || (b.place ?? 'world') !== 'world') return 1;
    const d = levelAt(a.x, a.z) - levelAt(b.x, b.z);
    return d > 0 ? 1 + per * d : 1;
  };
  return { spots, castleOf, place, approach, dock, levelAt, rangeScale };
}
