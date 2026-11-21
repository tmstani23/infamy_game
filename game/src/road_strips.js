// Built-in island roads as textured strips (Tim 2026-11-21): the corridors of world.json (plus world_paint.json
// `paths`) were painted into the coarse ground weight maps and came out blotchy and broken, worst on snow. Now each
// is a ribbon mesh along a smoothed copy of its line, textured from the road strip sheet (six road types, one per
// kind of land, art/ground/island/road_strips.png, built by tools/build_road_strips.py). The road type follows the
// biome field and fades between types where the land changes; the road fades out over water. Pure (Node-tested,
// tools/test_road_strips.mjs); render/world_ground.js turns the arrays into meshes.

// every corridor and extra path as a polyline: [{ id, points: [[x, z], ...] }]
export function roadLines(world, paths = []) {
  return [...(world.corridors || []).map((c, i) => ({ id: c.id ?? `c${i}`, points: c.points })), ...paths.map((p, i) => ({ id: `path${i}`, points: p }))]
    .filter(l => l.points?.length > 1)
    .map(l => ({ ...l, box: { minX: Math.min(...l.points.map(p => p[0])), maxX: Math.max(...l.points.map(p => p[0])), minZ: Math.min(...l.points.map(p => p[1])), maxZ: Math.max(...l.points.map(p => p[1])) } }));
}

// The line split every `step` units, then corner-cut `smooth` times (Chaikin), so it bends instead of zig-zagging.
// The ends stay where they were, so roads still meet at their junctions.
export function smoothLine(points, step = 40, smooth = 4) {
  let p = [];
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k], b = points[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let i = 0; i < n; i++) p.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  }
  p.push(points[points.length - 1]);
  for (let r = 0; r < smooth; r++) {
    const o = [p[0]];
    for (let k = 0; k < p.length - 1; k++) {
      const a = p[k], b = p[k + 1];
      o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    o.push(p[p.length - 1]);
    p = o;
  }
  return p;
}

// One road's strip: two vertices per point (left, right). Returns plain arrays:
// pos [x, z, ...] per vertex, uv [u, v] (u 0 left .. 1 right, v = distance / repeat), types [6 weights] and fade per
// point, plus its box. paint = createPaint(world, paintCfg) (src/world_paint.js); cfg = paintCfg.trail.strips.
export function buildStrip(line, paint, cfg) {
  const pts = smoothLine(line.points, cfg.step, cfg.smooth), half = cfg.width / 2, n = pts.length;
  const pos = new Float32Array(n * 4), uv = new Float32Array(n * 4), types = new Float32Array(n * 6), fade = new Float32Array(n);
  const F = new Float32Array(paint.NB), idx = paint.biomes.map(b => cfg.types[b] ?? 0), [w0, w1] = cfg.waterFade;
  let L = 0, minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    if (i) L += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    pos.set([p[0] - tz * half, p[1] + tx * half, p[0] + tz * half, p[1] - tx * half], i * 4);
    uv.set([0, L / cfg.repeat, 1, L / cfg.repeat], i * 4);
    paint.fieldAt(p[0], p[1], F);
    let tot = 0;
    for (let k = 0; k < F.length; k++) { types[i * 6 + idx[k]] += F[k]; tot += F[k]; }
    for (let k = 0; k < 6; k++) types[i * 6 + k] = tot > 0 ? types[i * 6 + k] / tot : k === 0 ? 1 : 0;
    const wet = paint.waterAt(p[0], p[1]);
    fade[i] = wet <= w0 ? 1 : wet >= w1 ? 0 : (w1 - wet) / (w1 - w0);
    minX = Math.min(minX, p[0] - half); maxX = Math.max(maxX, p[0] + half); minZ = Math.min(minZ, p[1] - half); maxZ = Math.max(maxZ, p[1] + half);
  }
  return { id: line.id, n, pos, uv, types, fade, length: L, box: { minX, minZ, maxX, maxZ } };
}

// lines (from roadLines) whose box comes within `margin` of the point
export const linesNear = (lines, x, z, margin) => lines.filter(({ box: b }) => x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin);
