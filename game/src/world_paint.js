// World painting (frontier W3.10, docs/world_painting.md): the pure, seeded part of how the island
// ground and props get their hand-made look. Shared by the sim (sim/chunk_gen.js: props) and the
// renderer (render/world_ground.js: ground splat maps). No DOM, no three.js, no Math.random: every
// answer depends only on world.json, the numbers in data/world_paint.json and world coordinates,
// so the same spot looks the same in every chunk, on every machine.
//   createPaint(world, cfg) -> { fieldAt, grove, trailAt, stampsIn, paintChunk, ... }  (cached per cfg)
import { islandBiome } from './sim/island_art.js';
import { shorelineTopology } from './sim/shoreline.js';
import { riverDirection } from './world_features.js';

// ---------- seeded value noise (no tables, so it is the same in every chunk) ----------
export function hash2(ix, iz, seed) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, z, scale, seed) {
  const fx = x / scale, fz = z / scale, ix = Math.floor(fx), iz = Math.floor(fz);
  let tx = fx - ix, tz = fz - iz;
  tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}
const fbm = (x, z, scale, seed) => vnoise(x, z, scale, seed) * 0.65 + vnoise(x, z, scale * 0.45, seed + 17) * 0.35;
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l)) : 0;
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}

const made = new WeakMap();   // cfg -> { world, paint }

export function createPaint(world, cfg) {
  const hit = made.get(cfg);
  if (hit && hit.world === world) return hit.paint;
  const seed = ((world.seed ?? 1) * 31 + (cfg.seed ?? 7)) | 0;
  const F = cfg.field, NB = cfg.biomes.length, B = Object.fromEntries(cfg.biomes.map((n, i) => [n, i]));
  const matIds = Object.keys(cfg.materials), NM = matIds.length, M = Object.fromEntries(matIds.map((n, i) => [n, i]));
  const t = world.terrain, tc = t.cell, nx = t.rows[0].length, nz = t.rows.length;
  const shore = world.terrain.shoreline?.radius || cfg.coastTransition?.enabled ? shorelineTopology(world) : null;

  // terrain cell -> biome id (grid built once). Mountain cells take their range's top, water is `bank`.
  const grid = new Int8Array(nx * nz);
  const BLOCKED_BIOME = new Set([B.top_forest, B.top_snow, B.top_dry, B.bank]);
  const CODE = { f: 'forest', b: 'forest', p: 'plain', h: 'hills', k: 'marsh', d: 'dry', n: 'snow', w: 'bank', r: 'bank' };
  // Authored biome overlays change ground/vegetation, preserving terrain and navigation.
  const areas = (cfg.biomeAreas || []).map(a => ({ ...a, box: a.box || world.regions.find(r => r.id === a.region)?.box })).filter(a => a.box);
  const biomeAt = (code, x, z) => {
    const area = areas.find(a => (a.terrainCodes || ['p','f','h','b']).includes(code) && x >= a.box[0] && z >= a.box[1] && x < a.box[2] && z < a.box[3]);
    return area?.biome || CODE[code] || 'plain';
  };
  for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
    const code = t.rows[i][j];
    grid[i * nx + j] = code === 'm' ? B['top_' + islandBiome(world, (j + 0.5) * tc, (i + 0.5) * tc)] : B[biomeAt(code, (j + 0.5) * tc, (i + 0.5) * tc)];
  }
  const gridAt = (x, z) => {
    const i = Math.floor(z / tc), j = Math.floor(x / tc);
    if (i < 0 || j < 0 || i >= nz || j >= nx) return B.bank;
    const original = t.rows[i][j], code = shore ? shore.codeAt(x, z, original) : original;
    return code === original ? grid[i * nx + j] : B[biomeAt(code,x,z)];
  };

  // layer 1: the biome field. Out = weights per biome (sum 1). Borders wander: the point is pushed
  // sideways by noise before the cells are read; cells that block walking never wander.
  const BL = F.blur / 2, OFF = [[0, 0], [BL, 0], [-BL, 0], [0, BL], [0, -BL]];
  function fieldAt(x, z, out) {
    out.fill(0);
    const own = gridAt(x, z);
    if (BLOCKED_BIOME.has(own)) { out[own] = 1; return out; }
    const wx = (vnoise(x, z, F.warpScale, seed + 1) - 0.5) * 2 * F.warp + (vnoise(x, z, F.fineScale, seed + 3) - 0.5) * 2 * F.fine;
    const wz = (vnoise(x, z, F.warpScale, seed + 2) - 0.5) * 2 * F.warp + (vnoise(x, z, F.fineScale, seed + 4) - 0.5) * 2 * F.fine;
    for (const [ox, oz] of OFF) {
      let g = gridAt(x + wx + ox, z + wz + oz);
      if (BLOCKED_BIOME.has(g)) g = own;
      out[g] += 0.2;
    }
    out[B.snowedge] = 4 * out[B.snow] * (1 - out[B.snow]);
    return out;
  }
  // fraction of water around a point (r units), without wandering: shores stay on the cell edges
  const SH = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const waterFrac = (x, z, r) => { let s = 0; for (const [a, b] of SH) if (gridAt(x + a * r, z + b * r) === B.bank) s += 0.2; return s; };
  // Water mask value: signed distance to the (rounded) shoreline, 0.5 on the bank line, +-WATER_RANGE units to 0 / 1.
  // Linear across a pixel, so the shader's 0.5 contour follows the true fillets instead of the coarse cell grid.
  const WATER_RANGE = 4;
  function waterAt(x, z) {
    if (!shore) { const n = (vnoise(x, z, 6, seed + 9) - 0.5) * 2; return waterFrac(x + n, z - n, 2.5); }
    const d = shore.distanceAt(x, z, WATER_RANGE, null);
    // drawing-only fillets (beside fords) count here, but not for props, biomes or walking
    const code = shore.codeAt(x, z, t.rows[Math.floor(z / tc)]?.[Math.floor(x / tc)] ?? 'w', true), wet = 'wr'.includes(code);
    return Math.max(0, Math.min(1, 0.5 + (wet ? d : -d) / (2 * WATER_RANGE)));
  }
  const blockedAt = (x, z) => BLOCKED_BIOME.has(gridAt(x, z));
  const bankAt = (x, z) => Math.min(1, waterFrac(x, z, F.bank) * 2.4);

  // layer 5: trails along corridors. segs = [[a, b], ...] near the point. -> [trail, verge] in 0..1
  const T = cfg.trail;
  function trailAt(segs, x, z) {
    if (!segs.length) return [0, 0];
    let d = 1e9;
    for (const [a, b] of segs) { const k = segDist(x, z, a, b); if (k < d) d = k; }
    if (d > T.verge + T.wMax) return [0, 0];
    const half = (T.wMin + (T.wMax - T.wMin) * vnoise(x, z, 14, seed + 21)) / 2;
    d += (vnoise(x, z, 3.5, seed + 22) - 0.5) * T.ragged;
    return [clamp01((half - d) / 0.7 + 0.5), clamp01(1 - (d - half) / T.verge)];
  }
  // distance to the nearest trail segment (props keep clear)
  function trailDist(segs, x, z) { let d = 1e9; for (const [a, b] of segs) { const k = segDist(x, z, a, b); if (k < d) d = k; } return d; }
  const trailClear = d => clamp01((d - T.clearNone) / (T.clearFull - T.clearNone));

  // layer 7: grove noise 0..1 (props gather in groves)
  const G = cfg.groves;
  const grove = (x, z) => smooth(G.threshold - G.soft, G.threshold + G.soft, fbm(x, z, G.scale, seed + 31));

  // layer 8: hand stamps (from world.json spots plus the list in the data file)
  const stamps = [];
  const fromW = { sites: world.sites, camps: world.camps, passes: world.passes };
  for (const [k, s] of Object.entries(cfg.stamps.from || {})) for (const p of fromW[k] || []) stamps.push({ x: p.x, z: p.z, ...s, from: k });
  for (const s of cfg.stamps.list || []) stamps.push(s);
  const stampsIn = (x0, z0, x1, z1) => stamps.filter(s => s.x > x0 - s.r && s.x < x1 + s.r && s.z > z0 - s.r && s.z < z1 + s.r);
  // how strongly the clearing stamps in `list` clear a point (0..1), without allocating
  function stampClear(list, x, z) {
    let c = 0;
    for (const s of list) {
      if (!s.clear) continue;
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < s.r) c = Math.max(c, clamp01((s.r - d) / (0.3 * s.r)));
    }
    return c;
  }
  // how strongly the stamps in `list` claim a point: { clear, material: [id, amount] }
  function stampAt(list, x, z) {
    let clear = 0, mat = null, ma = 0;
    for (const s of list) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d >= s.r) continue;
      const f = clamp01((s.r - d) / (0.3 * s.r));
      if (s.clear && f > clear) clear = f;
      if (s.material && f * (s.materialAmount ?? 1) > ma) { ma = f * (s.materialAmount ?? 1); mat = s.material; }
    }
    return { clear, material: mat, amount: ma };
  }

  // Loop 1 fords: a gravel bar across the river bed with a ragged edge, and shallower, clearer water over
  // it. Pure drawing; walking is decided by world_data.js (river cells within fordRadius of a crossing).
  const FD = cfg.fordBed || {};
  // The bar is only as wide as the painted water there (plus a small bank margin), so it never covers the banks.
  const fordZones = FD.enabled !== true ? [] : (world.fords || []).filter(f => f.kind === 'ford').map(f => {
    const d = riverDirection(world, f), nx = -d.tz, nz = d.tx;
    let half = 0;
    for (const sign of [-1, 1]) { let last = 0, dry = 0; for (let s = 0; s <= 150; s += 2) { if (waterAt(f.x + nx * s * sign, f.z + nz * s * sign) > 0.5) { last = s; dry = 0; } else if ((dry += 2) > 12 && s > 12) break; } half = Math.max(half, last); }
    return { x: f.x, z: f.z, ...d, across: Math.max(FD.acrossMin, half + FD.bankMargin) };
  });
  function fordAt(x, z) {
    let best = 0;
    for (const f of fordZones) {
      const dx = x - f.x, dz = z - f.z;
      if (Math.abs(dx) > FD.along * 1.5 || Math.abs(dz) > FD.along * 1.5) continue;
      const u = dx * f.tx + dz * f.tz, v = -dx * f.tz + dz * f.tx;
      const d = Math.hypot(u / FD.along, v / f.across) + (vnoise(x, z, FD.noiseScale, seed + 71) - 0.5) * 2 * FD.ragged;
      best = Math.max(best, 1 - smooth(FD.solid, 1, d));
    }
    return best;
  }

  // layers 2-3 and 5: the material weights of one point (sum 1) into w[0..NM). Returns the forest weight.
  const byBiome = cfg.biomes.map(() => []);
  matIds.forEach((id, mi) => { const m = cfg.materials[id]; for (const [b, v] of Object.entries(m.w)) if (v > 0 && B[b] != null) byBiome[B[b]].push([mi, v]); });
  const F0 = new Float32Array(NB), raw = new Float32Array(NM);
  const bankDistance = { body: 'sea' };
  const AMP = matIds.map(id => cfg.materials[id].amp), SCALE = matIds.map(id => cfg.materials[id].scale);
  const KEEP = cfg.mosaic.perPoint ?? 4, top = new Int16Array(KEEP), kept = new Float32Array(NM);
  const ROOTS = M.trail_roots, TRAIL = M.dirt_trail, VERGE = M.pebbles_soil;
  function materialsAt(x, z, w, segs, stampList) {
    fieldAt(x, z, F0);
    const own = gridAt(x, z);
    if (!BLOCKED_BIOME.has(own)) {
      const bk = bankAt(x, z);
      if (bk > 0) { for (let b = 0; b < NB; b++) F0[b] *= 1 - bk; F0[B.bank] += bk; }
    }
    raw.fill(0);
    for (let b = 0; b < NB; b++) {
      const f = F0[b];
      if (f < 0.002) continue;
      for (const [mi, v] of byBiome[b]) raw[mi] += f * v;
    }
    let sum = 0;
    for (let mi = 0; mi < NM; mi++) {
      let r = raw[mi];
      if (r > 0) { r *= Math.max(0, 1 + AMP[mi] * (2 * vnoise(x, z, SCALE[mi], seed + 100 + mi) - 1)); raw[mi] = r; sum += r; }
    }
    if (sum <= 0) { raw[M.grass] = 1; sum = 1; }
    for (let mi = 0; mi < NM; mi++) w[mi] = raw[mi] / sum;
    const forest = F0[B.forest];
    const st = stampAt(stampList, x, z);
    if (st.material) { const a = st.amount; for (let mi = 0; mi < NM; mi++) w[mi] *= 1 - a; w[M[st.material]] += a; }
    if (fordZones.length) {
      const fd = fordAt(x, z) * FD.amount;
      if (fd > 0) {   // a patchy mix of bed materials, so no single texture covers the whole ford
        const n = vnoise(x, z, FD.patchScale, seed + 72), set = FD.mix;
        let tot = 0; const wt = set.map((m, k) => { const c = (k + 0.5) / set.length, v = Math.max(0, 1 - Math.abs(n - c) / FD.patchWidth) * m.weight; tot += v; return v; });
        if (tot > 0) { for (let mi = 0; mi < NM; mi++) w[mi] *= 1 - fd; set.forEach((m, k) => { w[M[m.id]] += fd * wt[k] / tot; }); }
      }
    }
    const [tr, vg] = trailAt(segs, x, z);
    if (tr > 0 || vg > 0) {
      const kv = vg * (1 - tr) * T.verged;
      for (let mi = 0; mi < NM; mi++) w[mi] *= 1 - tr - kv;
      w[TRAIL] += tr * (1 - forest * T.rootsInForest); w[ROOTS] += tr * forest * T.rootsInForest; w[VERGE] += kv;
    }
    // keep each point's strongest few materials only. This is decided per point, never per chunk, so
    // neighbouring chunks always agree, and it caps what the shader samples at one pixel.
    if (KEEP < NM) {
      top.fill(-1);
      for (let mi = 0; mi < NM; mi++) {
        if (w[mi] <= 0) continue;
        let s = KEEP - 1;
        if (top[s] >= 0 && w[top[s]] >= w[mi]) continue;
        while (s > 0 && (top[s - 1] < 0 || w[top[s - 1]] < w[mi])) { top[s] = top[s - 1]; s--; }
        top[s] = mi;
      }
      let sum = 0;
      for (let q = 0; q < KEEP; q++) if (top[q] >= 0) { const mi = top[q]; sum += w[mi]; kept[mi] = w[mi]; }
      w.fill(0);
      if (sum > 0) for (let q = 0; q < KEEP; q++) if (top[q] >= 0) { const mi = top[q]; w[mi] = kept[mi] / sum; }
    }
    return forest;
  }

  // One chunk's ground: weight maps (4 materials each, up to maxMaterials) and a water map. The maps cover the chunk
  // plus a one-pixel border so neighbouring chunks agree at the edge. Returns plain typed arrays.
  function paintChunk(x0, z0, S, near) {
    const n0 = Math.round(S * cfg.res), N = n0 + 2, pitch = S / n0, h = pitch;
    const px = new Float32Array(N * N * NM), O = new Uint8Array(N * N * 4), cover = new Float64Array(NM), w = new Float32Array(NM);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = x0 - h + (i + 0.5) * pitch, z = z0 - h + (j + 0.5) * pitch, k = j * N + i;
      materialsAt(x, z, w, near.segs, near.stamps);
      for (let mi = 0; mi < NM; mi++) { px[k * NM + mi] = w[mi]; cover[mi] += w[mi]; }
      let wet = waterAt(x, z);
      const fd = fordZones.length ? fordAt(x, z) : 0;
      if (fd > 0 && wet > FD.waterLevel) wet += (FD.waterLevel - wet) * fd;   // thin water: the gravel shows through
      O[k * 4] = Math.round(wet * 255);
      // Reuse the actual local ground mosaic; this mask only adjusts its tone.
      const CT = cfg.coastTransition;
      if (CT?.enabled && !BLOCKED_BIOME.has(gridAt(x, z))) {
        const d = shore.distanceAt(x, z, CT.end + CT.ragged, bankDistance);
        const profile = bankDistance.body !== 'sea' && CT.inland ? CT.inland : CT;
        const ragged = (vnoise(x, z, CT.noiseScale, seed + 61) - 0.5) * 2 * profile.ragged;
        const amount = (1 - smooth(profile.start, profile.end, d + ragged)) * profile.strength;
        if (amount > 0) {
          fieldAt(x, z, F0);
          O[k * 4 + 1] = Math.round(amount * 255);
          O[k * 4 + 2] = Math.round(F0[B.dry] * 255);
          O[k * 4 + 3] = Math.round(F0[B.snow] * 255);
        }
      }
      if (fd > 0) O[k * 4 + 1] = Math.max(O[k * 4 + 1], Math.round(fd * FD.shallow * 255));   // clearer, greener shallows
    }
    // W3.11 P4: materials seen on the shared border pixels go first, so a busy chunk (coast cliffs + lowland mosaic)
    // never drops a material its neighbour keeps; the rest rank by coverage.
    const edge = new Float32Array(NM);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (i > 1 && i < N - 2 && j > 1 && j < N - 2) continue;
      const k = j * N + i; for (let mi = 0; mi < NM; mi++) if (px[k * NM + mi] > edge[mi]) edge[mi] = px[k * NM + mi];
    }
    const score = mi => cover[mi] + (edge[mi] > 0.02 ? 1e6 * edge[mi] : 0);
    const order = [...cover.keys()].sort((a, b) => score(b) - score(a)).slice(0, cfg.maxMaterials).filter(mi => cover[mi] > 0);
    const maps = Array.from({ length: Math.ceil(cfg.maxMaterials / 4) }, () => new Uint8Array(N * N * 4));
    for (let k = 0; k < N * N; k++) {
      let s = 0;
      for (const mi of order) s += px[k * NM + mi];
      if (s <= 0) s = 1;
      order.forEach((mi, slot) => { maps[slot >> 2][k * 4 + (slot & 3)] = Math.round(px[k * NM + mi] / s * 255); });
    }
    return { N, h, mats: order.map(mi => matIds[mi]), maps, O };
  }

  const paint = {
    cfg, seed, biomes: cfg.biomes, blockedAt, B, matIds, M, gridAt, fieldAt, waterAt, waterFrac, trailAt, trailDist, trailClear, grove,
    stampsIn, stampAt, stampClear, materialsAt, paintChunk, fordAt, NB, NM,
  };
  made.set(cfg, { world, paint });
  return paint;
}

// The trail segments (corridors, plus the extra `paths` polylines of world_paint.json) near a box,
// for ground and props: [[[x, z], [x, z]], ...]
export function trailSegments(world, x0, z0, x1, z1, margin, paths = []) {
  const out = [];
  for (const pts of [...(world.corridors || []).map(c => c.points), ...paths]) for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    if (Math.max(a[0], b[0]) < x0 - margin || Math.min(a[0], b[0]) > x1 + margin || Math.max(a[1], b[1]) < z0 - margin || Math.min(a[1], b[1]) > z1 + margin) continue;
    out.push([a, b]);
  }
  return out;
}
