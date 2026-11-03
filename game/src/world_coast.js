// Pure render geometry derived from terrain, not gameplay rules. Ocean-connected
// water only: lakes, rivers, cliff faces and harbor approaches keep their own art.
import { terrainAt } from './sim/world_data.js';

const key = p => `${p[0]},${p[1]}`;
const unit = (x, z) => { const d = Math.hypot(x, z) || 1; return [x / d, z / d]; };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function seaContours(world) {
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
  const edges = [], outgoing = new Map();
  const add = (a, b) => {
    const e = { a, b, used: false };
    edges.push(e);
    const k = key(a); if (!outgoing.has(k)) outgoing.set(k, []);
    outgoing.get(k).push(e);
  };
  // Clockwise around land: the right-hand normal (-dz, dx) always points inland.
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (rows[z][x] === 'w') continue;
    if (ocean(x, z - 1)) add([x, z], [x + 1, z]);
    if (ocean(x + 1, z)) add([x + 1, z], [x + 1, z + 1]);
    if (ocean(x, z + 1)) add([x + 1, z + 1], [x, z + 1]);
    if (ocean(x - 1, z)) add([x, z + 1], [x, z]);
  }
  const loops = [];
  for (const first of edges) {
    if (first.used) continue;
    const loop = [], start = key(first.a);
    let e = first;
    while (e && !e.used) {
      e.used = true; loop.push(e.a.map(v => v * T));
      if (key(e.b) === start) break;
      const dx = e.b[0] - e.a[0], dz = e.b[1] - e.a[1];
      // At diagonal contacts, turn right to keep each land component separate.
      const options = (outgoing.get(key(e.b)) || []).filter(n => !n.used);
      const angle = n => { const nx = n.b[0] - n.a[0], nz = n.b[1] - n.a[1]; return Math.atan2(dx * nz - dz * nx, dx * nx + dz * nz); };
      options.sort((a, b) => angle(b) - angle(a));
      e = options[0];
      if (!e) throw new Error('Open ocean contour in terrain data');
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}

function sampleLoop(loop, cfg) {
  // Join the offsets BEFORE subdividing. Offsetting a densely sampled tiny
  // corner curve would fold the ten-unit inland band over itself.
  const nodes = loop.filter((p, i) => {
    const a = loop[(i + loop.length - 1) % loop.length], b = loop[(i + 1) % loop.length];
    return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 0.001;
  });
  let length = 0;
  const joined = nodes.map((p, i) => {
    const prev = nodes[(i + nodes.length - 1) % nodes.length], next = nodes[(i + 1) % nodes.length];
    const incoming = unit(p[0] - prev[0], p[1] - prev[1]), outgoing = unit(next[0] - p[0], next[1] - p[1]);
    const tangent = unit(incoming[0] + outgoing[0], incoming[1] + outgoing[1]);
    const normal = [-tangent[1], tangent[0]];
    const miter = Math.min(cfg.miterLimit, 1 / Math.max(0.1, normal[0] * -outgoing[1] + normal[1] * outgoing[0]));
    return { p, offset: normal.map(v => v * miter) };
  });
  const out = [];
  for (let i = 0; i < joined.length; i++) {
    const a = joined[i], b = joined[(i + 1) % joined.length], d = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]);
    const count = Math.max(1, Math.ceil(d / cfg.sampleStep));
    for (let j = 0; j < count; j++) {
      const t = j / count, offset = [0, 1].map(k => a.offset[k] + (b.offset[k] - a.offset[k]) * t);
      out.push({ p: [0, 1].map(k => a.p[k] + (b.p[k] - a.p[k]) * t), normal: unit(...offset), miter: Math.hypot(...offset), s: length + d * t });
    }
    length += d;
  }
  // An integer number of repeats closes each island without a texture phase jump.
  return { points: out, length, period: length / Math.max(1, Math.round(length / cfg.length)) };
}

export function createCoastline(world, cfg, paint, chunkSize) {
  const loops = seaContours(world).map(loop => sampleLoop(loop, cfg)), bins = new Map();
  const reach = Math.max(cfg.landWidth, cfg.waterWidth) * cfg.miterLimit;
  for (const loop of loops) for (let i = 0; i < loop.points.length; i++) {
    const a = loop.points[i], next = loop.points[(i + 1) % loop.points.length];
    const b = i + 1 === loop.points.length ? { ...next, s: loop.length } : next;
    const segment = { a, b, period: loop.period };
    const loX = Math.floor((Math.min(a.p[0], b.p[0]) - reach) / chunkSize), hiX = Math.floor((Math.max(a.p[0], b.p[0]) + reach) / chunkSize);
    const loZ = Math.floor((Math.min(a.p[1], b.p[1]) - reach) / chunkSize), hiZ = Math.floor((Math.max(a.p[1], b.p[1]) + reach) / chunkSize);
    for (let z = loZ; z <= hiZ; z++) for (let x = loX; x <= hiX; x++) {
      const k = `${x},${z}`; if (!bins.has(k)) bins.set(k, []);
      bins.get(k).push(segment);
    }
  }
  const harbors = [...(world.sites || []).filter(s => s.harbor).map(s => s.harbor), ...(world.capital?.port ? [world.capital.port] : [])];
  const F = paint ? new Float32Array(paint.NB) : null;
  function weights(p, normal) {
    const x = p[0] + normal[0] * cfg.biomeSample, z = p[1] + normal[1] * cfg.biomeSample;
    const code = terrainAt(world, x, z);
    if (paint) {
      paint.fieldAt(x, z, F);
      const dry = F[paint.B.dry], snow = F[paint.B.snow];
      return [Math.max(0, 1 - dry - snow), dry, snow];
    }
    return code === 'n' ? [0, 0, 1] : code === 'd' ? [0, 1, 0] : [1, 0, 0];
  }
  return {
    stats: { loops: loops.length, segments: loops.reduce((n, l) => n + l.points.length, 0), coastalChunks: bins.size },
    meshData(cx, cz) {
      const segments = bins.get(`${cx},${cz}`);
      if (!segments) return null;
      const positions = [], uvs = [], colors = [], alpha = [], indices = [];
      const x0 = cx * chunkSize, z0 = cz * chunkSize;
      const nearbyHarbors = harbors.filter(h => h.x >= x0 - reach - cfg.harborClear - cfg.clearFeather && h.x <= x0 + chunkSize + reach + cfg.harborClear + cfg.clearFeather && h.z >= z0 - reach - cfg.harborClear - cfg.clearFeather && h.z <= z0 + chunkSize + reach + cfg.harborClear + cfg.clearFeather);
      for (const { a, b, period } of segments) {
        const mid = [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2], normal = unit(a.normal[0] + b.normal[0], a.normal[1] + b.normal[1]);
        const land = terrainAt(world, mid[0] + normal[0] * cfg.biomeSample, mid[1] + normal[1] * cfg.biomeSample);
        if (land === 'm' || land === 'r' || land === 'w') continue;
        const base = positions.length / 3;
        for (const d of [cfg.landWidth, 0, -cfg.waterWidth]) for (const v of [a, b]) {
          const x = v.p[0] + v.normal[0] * d * v.miter, z = v.p[1] + v.normal[1] * d * v.miter;
          positions.push(x, cfg.height, z); uvs.push(v.s / period, d); colors.push(...weights(v.p, v.normal));
          let clear = 1;
          for (const h of nearbyHarbors) clear = Math.min(clear, smooth(cfg.harborClear, cfg.harborClear + cfg.clearFeather, Math.hypot(h.x - x, h.z - z)));
          alpha.push(clear);
        }
        // Both faces are enabled by the material; orientation is irrelevant to lighting.
        for (let row = 0; row < 2; row++) { const j = base + row * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
      }
      return indices.length ? { positions: new Float32Array(positions), uvs: new Float32Array(uvs), colors: new Float32Array(colors), alpha: new Float32Array(alpha), indices: new Uint32Array(indices) } : null;
    },
  };
}
