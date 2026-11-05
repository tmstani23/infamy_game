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

// What a spot gives per harvest round: sum of piece values, never below the trickle (so never 0).
export function spotYield(spot, stateStr, stages) {
  const st = spotState(spot, stateStr);
  let sum = 0;
  for (const ch of st) sum += stages.value[ch] ?? 0;
  return Math.max(sum, stages.trickle);
}

// One economy tick of regrowth: each h piece may become s, each s piece may become f. `rand` returns 0..1.
// Returns the new stage string, or null when the spot is back to all full (nothing to save).
export function regrowSpot(spot, stateStr, stages, rand) {
  const st = spotState(spot, stateStr);
  let out = '';
  for (const ch of st) {
    if (ch === 'h' && rand() < stages.regrow.h) out += 's';
    else if (ch === 's' && rand() < stages.regrow.s) out += 'f';
    else out += ch;
  }
  return /^f*$/.test(out) ? null : out;
}
