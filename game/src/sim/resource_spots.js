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

// Workers a spot keeps busy at full speed with a camp beside it (stages.supports), and the regrow chance per stage per
// economy tick that this needs: 2 stages per piece, so chance = 2 x workers / (pieces x campTripSeconds). null = old flat rate.
export function supportsWorkers(spot, stages) {
  const S = stages.supports; if (!S) return null;
  return isRich(spot) ? S.rich?.[spot.nodeKind] ?? S.small : S.small;
}
export function regrowChance(spot, stages) {
  const S = stages.supports, n = supportsWorkers(spot, stages); if (!S || !n) return null;
  return Math.min(1, 2 * n / (spot.pieces.length * S.campTripSeconds));
}

// One economy tick of regrowth: each h piece may become s, each s piece may become f. `rand` returns 0..1.
// Returns the new stage string, or null when the spot is back to all full (nothing to save).
export function regrowSpot(spot, stateStr, stages, rand) {
  const st = spotState(spot, stateStr);
  const q = regrowChance(spot, stages);
  let out = '';
  for (const ch of st) {
    if (ch === 'h' && rand() < (q ?? stages.regrow.h)) out += 's';
    else if (ch === 's' && rand() < (q ?? stages.regrow.s)) out += 'f';
    else out += ch;
  }
  return /^f*$/.test(out) ? null : out;
}

// Overworked check (Tim 2026-11-06 22:23-22:29): the spot keeps supportsWorkers busy when the camp is beside it
// (campTripSeconds); a longer trip lets more workers share it: best = supports x campTripSeconds / tripSeconds.
// Without supports data it falls back to a live estimate (aim = share of value worked out). Returns { speed, best, over }.
export function overwork(spot, stateStr, stages, n, aim = 0.35, tripSeconds = null) {
  const now = spotYield(spot, stateStr, stages), full = spotYield(spot, null, stages), worked = Math.max(0, 1 - now / full);
  const sup = supportsWorkers(spot, stages), S = stages.supports;
  const best = sup ? Math.max(1, Math.floor(sup * S.campTripSeconds / Math.max(S.campTripSeconds, tripSeconds || S.campTripSeconds)))
    : !n || worked <= aim ? null : Math.max(1, Math.floor(n * aim / worked));
  return { speed: Math.round(100 * now / full), best, over: best != null && n > best };
}
