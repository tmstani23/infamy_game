// Resource spots (Loop 3, L3.4): pure lookups over game/data/world_spots.json. No DOM, no randomness of its own.
// The sim owns where spots are; art follows. Worked spots save as state.frontier.spots[id] = one stage char per
// piece ('f' full, 'h' harvested, 's' sapling / rubble); unworked spots save nothing (all 'f').
// Stage numbers (value, regrow, trickle) live in game/data/resource_spots.json -> `stages`.

export function makeSpotIndex(data) {
  const byId = new Map(data.spots.map(s => [s.id, s]));
  const size = data.chunkSize;
  const chunkSpots = id => (data.byChunk[id] || []).map(i => byId.get(i));
  return {
    byId, chunkSize: size, maxPieceReach: data.spots.reduce((m,s)=>Math.max(m,...s.pieces.map(([x,z])=>Math.hypot(x,z))),0),
    get: id => byId.get(id) || null,
    spotsInChunk: chunkSpots,
    // spots whose centre lies within r of (x, z)
    spotsNear(x, z, r) {
      const out = [], c0 = Math.floor((x - r) / size), c1 = Math.floor((x + r) / size);
      const d0 = Math.floor((z - r) / size), d1 = Math.floor((z + r) / size);
      for (let cz = d0; cz <= d1; cz++) for (let cx = c0; cx <= c1; cx++)
        for (const s of chunkSpots(`c${cx}_${cz}`)) if (Math.hypot(s.x - x, s.z - z) <= r) out.push(s);
      return out;
    }
  };
}

const fullState = spot => 'f'.repeat(spot.pieces.length);

// Stage string for a spot: the saved one, or all full when it was never worked.
export function spotState(spot, stateStr) {
  return stateStr && stateStr.length === spot.pieces.length ? stateStr : fullState(spot);
}

// Rich deposits (spots linked to a world.json node) work faster and regrow faster: stages.rich factors.
export const isRich = spot => !!spot?.deposit;
// Display names for rich deposits by world.json node kind (Tim 2026-11-06: always called "Rich ...").
export const RICH_NAME = { quarry: 'Rich stone vein', ore: 'Rich ore vein', forest: 'Rich forest', fishing: 'Rich fishing ground', fertile: 'Rich fertile ground' };
export const RICH_GIVES = { quarry: 'stone', ore: 'stone (iron later)', forest: 'timber', fishing: 'food', fertile: 'food' };
// Reach for a rich deposit. anchors: [{ town, name, x, z, r, camp }] = each town hall (r = workers.range) and each built
// work camp (r = workers.campReach). Returns { ok, text, town } (town = nearest own town, for "Place camp here").
export function richReach(p, anchors) {
  let best = null, near = null;
  for (const a of anchors || []) {
    const d = Math.hypot(a.x - p.x, a.z - p.z);
    if (d <= a.r && (!best || d < best.d)) best = { ...a, d: Math.round(d) };
    if (!a.camp && (!near || d < near.d)) near = { ...a, d: Math.round(d) };
  }
  if (best) return { ok: true, text: `In reach of ${best.name}${best.camp ? '\'s work camp' : ''} (${best.d} away)` };
  return { ok: false, town: near?.town || null, text: near ? `Needs a work camp: ${near.d} from ${near.name}` : 'Needs a town and a work camp nearby' };
}
function richFactor(spot, stages, key) { return isRich(spot) ? (stages.rich?.[key] ?? 1) : 1; }

// What a spot gives per harvest round: sum of piece values, never below the trickle (so never 0).
export function spotYield(spot, stateStr, stages) {
  const st = spotState(spot, stateStr);
  let sum = 0;
  for (const ch of st) sum += stages.value[ch] ?? 0;
  return Math.max(sum, stages.trickle) * richFactor(spot, stages, 'yield');
}

// One economy tick of regrowth: each h piece may become s, each s piece may become f. `rand` returns 0..1.
// Returns the new stage string, or null when the spot is back to all full (nothing to save).
export function regrowSpot(spot, stateStr, stages, rand) {
  const st = spotState(spot, stateStr);
  const k = richFactor(spot, stages, 'regrow');
  let out = '';
  for (const ch of st) {
    if (ch === 'h' && rand() < stages.regrow.h * k) out += 's';
    else if (ch === 's' && rand() < stages.regrow.s * k) out += 'f';
    else out += ch;
  }
  return /^f*$/.test(out) ? null : out;
}
