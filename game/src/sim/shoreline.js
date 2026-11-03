// Shared bank topology. Terrain, fine blockers and art use the same fillets.
// Inland banks are opt-in; crossing clearances and mountain joins stay protected.
const cache = new WeakMap();
const key = (x, z) => `${x},${z}`;
export function rawTerrain(world, x, z) {
  const { rows, cell } = world.terrain;
  return rows[Math.floor(z / cell)]?.[Math.floor(x / cell)] ?? 'w';
}

export const oceanTopology = world => buildTopology(world, false);
export const shorelineTopology = world => buildTopology(world, !!world.terrain.shoreline?.inland);
function buildTopology(world, inland) {
  const entry = cache.get(world.terrain) || {};
  const hit = entry[inland ? 'all' : 'ocean'];
  if (hit) return hit;
  const { rows, cell: T } = world.terrain, H = rows.length, W = rows[0].length;
  const sea = new Uint8Array(W * H), queue = new Int32Array(W * H);
  let head = 0, tail = 0;
  const push = (x, z) => {
    if (x < 0 || z < 0 || x >= W || z >= H) return;
    const i = z * W + x;
    if (!sea[i] && rows[z][x] === 'w') { sea[i] = 1; queue[tail++] = i; }
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let z = 0; z < H; z++) { push(0, z); push(W - 1, z); }
  while (head < tail) {
    const i = queue[head++], x = i % W, z = Math.floor(i / W);
    push(x - 1, z); push(x + 1, z); push(x, z - 1); push(x, z + 1);
  }
  const ocean = (x, z) => x < 0 || z < 0 || x >= W || z >= H || !!sea[z * W + x];
  const wetAt = (x, z) => inland ? 'wr'.includes(rows[z]?.[x] ?? 'w') : ocean(x, z);
  const waterKindAt = (x, z) => {
    const code = rawTerrain(world, x, z);
    return code === 'r' ? 'river' : code === 'w' ? (ocean(Math.floor(x / T), Math.floor(z / T)) ? 'sea' : 'lake') : 'land';
  };
  const edges = [], outgoing = new Map();
  const add = (a, b) => {
    const e = { a, b, used: false }; edges.push(e);
    const k = key(...a); if (!outgoing.has(k)) outgoing.set(k, []);
    outgoing.get(k).push(e);
  };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (rows[z][x] === 'w' || (inland && rows[z][x] === 'r')) continue;
    if (wetAt(x, z - 1)) add([x, z], [x + 1, z]);
    if (wetAt(x + 1, z)) add([x + 1, z], [x + 1, z + 1]);
    if (wetAt(x, z + 1)) add([x + 1, z + 1], [x, z + 1]);
    if (wetAt(x - 1, z)) add([x, z + 1], [x, z]);
  }
  const loops = [];
  for (const first of edges) {
    if (first.used) continue;
    const loop = [], start = key(...first.a);
    let e = first;
    while (e && !e.used) {
      e.used = true; loop.push(e.a.map(v => v * T));
      if (key(...e.b) === start) break;
      const dx = e.b[0] - e.a[0], dz = e.b[1] - e.a[1];
      const options = (outgoing.get(key(...e.b)) || []).filter(n => !n.used);
      const angle = n => Math.atan2(dx * (n.b[1] - n.a[1]) - dz * (n.b[0] - n.a[0]), dx * (n.b[0] - n.a[0]) + dz * (n.b[1] - n.a[1]));
      options.sort((a, b) => angle(b) - angle(a)); e = options[0];
      if (!e) throw new Error('Open ocean contour in terrain data');
    }
    if (loop.length >= 4) loops.push(loop);
  }
  const C = world.terrain.shoreline, radius = Math.max(0, Math.min(C?.radius || 0, T * 0.4));
  const harbors = [...(world.sites || []).filter(s => s.harbor).map(s => s.harbor), ...(world.capital?.port ? [world.capital.port] : [])];
  const crossings = inland ? (world.fords || []) : [];
  const corners = new Map(), affected = new Map();
  const quadrants = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  if (radius) for (const loop of loops) for (const [x, z] of loop) {
    const gx = x / T, gz = z / T;
    const cells = [[gx - 1, gz - 1], [gx, gz - 1], [gx, gz], [gx - 1, gz]];
    const codes = cells.map(([a, b]) => rows[b]?.[a] ?? 'w'), wet = cells.map(([a, b]) => wetAt(a, b));
    const count = wet.filter(Boolean).length;
    if ((count !== 1 && count !== 3) || codes.some((c, i) => c === 'm' || (!inland && c === 'r') || (c === 'w' && !wet[i]))) continue;
    if (harbors.some(h => Math.hypot(h.x - x, h.z - z) < radius + (C.harborKeep || 30))) continue;
    const convex = count === 3, q = wet.indexOf(!convex), [sx, sz] = quadrants[q];
    // Fine-rasterizing a cell that intersects a ford would also refine its
    // legacy crossing circle and could unexpectedly narrow the crossing. Such
    // corners are rounded for drawing only (visual): terrain/collision keep the square cell.
    const [cellX, cellZ] = cells[q];
    const visual = crossings.some(f => Math.hypot(Math.max(cellX * T - f.x, 0, f.x - (cellX + 1) * T), Math.max(cellZ * T - f.z, 0, f.z - (cellZ + 1) * T)) < (world.rules?.fordRadius || 30));
    const waterCode = codes.includes('r') ? 'r' : 'w';
    const corner = { x, z, sx, sz, radius, convex, visual, waterCode, code: codes.find(c => !'wr'.includes(c)), cx: x + sx * radius, cz: z + sz * radius };
    corner.body = waterCode === 'r' ? 'river' : wet.some((v, i) => v && ocean(...cells[i])) ? 'sea' : 'lake';
    corners.set(key(x, z), corner);
    if (visual) continue;
    const cellKey = key(...cells[q]);
    if (!affected.has(cellKey)) affected.set(cellKey, []);
    affected.get(cellKey).push(corner);
  }
  const cornerAt = (x, z) => corners.get(key(Math.round(x / T) * T, Math.round(z / T) * T));
  const codeAt = (x, z, original = rawTerrain(world, x, z), visual = false) => {
    const c = cornerAt(x, z);
    if (!c || (c.visual && !visual)) return original;
    const dx = (x - c.x) * c.sx, dz = (z - c.z) * c.sz;
    if (dx < 0 || dz < 0 || dx > radius || dz > radius || Math.hypot(x - c.cx, z - c.cz) <= radius) return original;
    return c.convex ? c.waterCode : c.code;
  };
  // Short raw edges, trimmed at circular fillets, plus arcs. Index by terrain cell
  // so tint-distance queries visit only nearby coast, never the island perimeter.
  const bins = new Map();
  const shape = s => {
    for (let z = Math.floor(s.minZ / T); z <= Math.floor(s.maxZ / T); z++) for (let x = Math.floor(s.minX / T); x <= Math.floor(s.maxX / T); x++) {
      const k = key(x, z); if (!bins.has(k)) bins.set(k, []); bins.get(k).push(s);
    }
  };
  for (const loop of loops) for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length], dx = (b[0] - a[0]) / T, dz = (b[1] - a[1]) / T;
    const mx = (a[0] + b[0]) / 2 - dz * 3, mz = (a[1] + b[1]) / 2 + dx * 3;
    if (['m', 'r', 'w'].includes(rawTerrain(world, mx, mz))) continue;
    const ra = corners.has(key(...a)) ? radius : 0, rb = corners.has(key(...b)) ? radius : 0;
    const ax = a[0] + dx * ra, az = a[1] + dz * ra, bx = b[0] - dx * rb, bz = b[1] - dz * rb;
    shape({ ax, az, bx, bz, body: waterKindAt((a[0] + b[0]) / 2 + dz * 3, (a[1] + b[1]) / 2 - dx * 3), minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz) });
  }
  for (const c of corners.values()) shape({ corner: c, body: c.body, minX: Math.min(c.x, c.cx), maxX: Math.max(c.x, c.cx), minZ: Math.min(c.z, c.cz), maxZ: Math.max(c.z, c.cz) });
  const distanceAt = (x, z, limit, result) => {
    if (result) result.body = 'sea';
    let distance = limit;
    for (let j = Math.floor((z - limit) / T); j <= Math.floor((z + limit) / T); j++) for (let i = Math.floor((x - limit) / T); i <= Math.floor((x + limit) / T); i++) {
      for (const s of bins.get(key(i, j)) || []) {
        let d;
        if (s.corner) {
          const c = s.corner, dx = (x - c.cx) * -c.sx, dz = (z - c.cz) * -c.sz;
          d = dx >= 0 && dz >= 0 ? Math.abs(Math.hypot(dx, dz) - radius) : Math.min(Math.hypot(x - c.x, z - c.cz), Math.hypot(x - c.cx, z - c.z));
        } else {
          const dx = s.bx - s.ax, dz = s.bz - s.az, l = dx * dx + dz * dz;
          const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / l));
          d = Math.hypot(x - s.ax - dx * t, z - s.az - dz * t);
        }
        if (d < distance) { distance = d; if (result) result.body = s.body; }
      }
    }
    return distance;
  };
  const topology = { loops, corners, radius, inland, codeAt, distanceAt, waterKindAt, affectedCell: (x, z) => affected.has(key(x, z)), cellCorners: (x, z) => affected.get(key(x, z)) };
  entry[inland ? 'all' : 'ocean'] = topology; cache.set(world.terrain, entry);
  return topology;
}
