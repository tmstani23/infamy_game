// Render ribbon derived from the shared terrain/fillet geometry. Ocean-connected
// water only: lakes, rivers, cliff faces and harbor approaches keep their own art.
import { terrainAt } from './sim/world_data.js';

import { oceanTopology } from './sim/shoreline.js';
export const seaContours = world => oceanTopology(world).loops;
const key = p => p.join(',');
const unit = (x, z) => { const d = Math.hypot(x, z) || 1; return [x / d, z / d]; };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function sampleLoop(loop, cfg, corners) {
  // Shared circular fillets have enough radius for the bank. Unrounded corners
  // keep mitered offsets joined before subdivision so their bands cannot fold.
  const nodes = loop.filter((p, i) => {
    const a = loop[(i + loop.length - 1) % loop.length], b = loop[(i + 1) % loop.length];
    return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 0.001;
  });
  let length = 0;
  const joined = [];
  for (let i = 0; i < nodes.length; i++) {
    const p = nodes[i], prev = nodes[(i + nodes.length - 1) % nodes.length], next = nodes[(i + 1) % nodes.length];
    const incoming = unit(p[0] - prev[0], p[1] - prev[1]), outgoing = unit(next[0] - p[0], next[1] - p[1]);
    const corner = corners.get(key(p));
    if (corner) {
      const R = corner.radius, sign = corner.convex ? 1 : -1;
      const entry = [p[0] - incoming[0] * R, p[1] - incoming[1] * R];
      const center = [entry[0] - incoming[1] * sign * R, entry[1] + incoming[0] * sign * R];
      const angle = Math.atan2(entry[1] - center[1], entry[0] - center[0]);
      const count = Math.max(2, Math.ceil(Math.PI * R / (2 * cfg.sampleStep)));
      for (let j = 0; j <= count; j++) {
        const t = angle + sign * Math.PI / 2 * j / count, nx = -Math.cos(t) * sign, nz = -Math.sin(t) * sign;
        joined.push({ p: [center[0] + Math.cos(t) * R, center[1] + Math.sin(t) * R], offset: [nx, nz] });
      }
    } else {
      const tangent = unit(incoming[0] + outgoing[0], incoming[1] + outgoing[1]);
      const normal = [-tangent[1], tangent[0]];
      const miter = Math.min(cfg.miterLimit, 1 / Math.max(0.1, normal[0] * -outgoing[1] + normal[1] * outgoing[0]));
      joined.push({ p, offset: normal.map(v => v * miter) });
    }
  }
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
  const topology = oceanTopology(world);
  const loops = topology.loops.map(loop => sampleLoop(loop, cfg, topology.corners)), bins = new Map();
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
