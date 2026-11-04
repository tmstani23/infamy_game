// Which island chunks to draw (frontier W3.4). Pure, no three.js, so Node tests can check it
// (game/tools/test_world_stream.mjs). render/world_ground.js does the drawing.

// Chunks to draw for a camera at (x, z) moving at (vx, vz) units a second: every chunk within
// drawRadius of the camera, plus the same ring around where the camera will be in `ahead` seconds
// (prefetch in the direction of movement). Sorted nearest first.
export function chunksToDraw(x, z, vx, vz, { chunk, drawRadius = 1, ahead = 2, cols = Infinity, rows = Infinity }) {
  const out = new Map();
  const ring = (px, pz) => {
    const cx = Math.floor(px / chunk), cz = Math.floor(pz / chunk);
    for (let dz = -drawRadius; dz <= drawRadius; dz++) for (let dx = -drawRadius; dx <= drawRadius; dx++) {
      const a = cx + dx, b = cz + dz;
      if (a < 0 || b < 0 || a >= cols || b >= rows) continue;
      out.set(`${a},${b}`, [a, b]);
    }
  };
  ring(x, z);
  if (Math.hypot(vx, vz) > 0.5) ring(x + vx * ahead, z + vz * ahead);
  const d = ([a, b]) => ((a + 0.5) * chunk - x) ** 2 + ((b + 0.5) * chunk - z) ** 2;
  return [...out.values()].sort((p, q) => d(p) - d(q));
}

// Given the chunks drawn now (Map key -> { used }), the ones wanted and the cache limit:
// which to build (wanted, not drawn yet; at most `perFrame`, nearest first) and which to drop
// (not wanted, least recently used first, until the cache fits).
export function planChunks(loaded, wanted, { limit, perFrame = 1 }) {
  const want = new Set(wanted.map(([a, b]) => `${a},${b}`));
  const build = wanted.filter(([a, b]) => !loaded.has(`${a},${b}`)).slice(0, perFrame);
  const size = loaded.size + build.length;
  const idle = [...loaded.entries()].filter(([k]) => !want.has(k)).sort((a, b) => a[1].used - b[1].used).map(([k]) => k);
  const drop = idle.slice(0, Math.max(0, size - limit));
  return { build, drop };
}

// Props near the camera (only these get a sprite): within r units, big ones (mountains) a bit further
export function propsInView(props, x, z, r, bigR = r + 30) {
  return props.filter(p => { const d = Math.hypot(p.x - x, p.z - z); return d <= (p.kind === 'mountain' ? bigR : r) + (p.reach || 0); });
}
