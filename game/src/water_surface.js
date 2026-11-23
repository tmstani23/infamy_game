// Pack authored wave lengths/speeds into the GLSL wave coefficients. No graphics
// or simulation state: these are visual surface slopes, not displaced terrain.
export function waterSurfaceUniforms(cfg) {
  const waves = (cfg?.waves || []).map(w => {
    const [x, z] = w.direction, length = Math.hypot(x, z);
    if (!length || !(w.wavelength > 0) || !(w.amplitude >= 0) || !Number.isFinite(w.speed)) throw new Error('Invalid water surface wave');
    const k = 2 * Math.PI / w.wavelength;
    return [x / length * k, z / length * k, w.amplitude, k * w.speed];
  });
  if (waves.length > 4) throw new Error('Water surface supports at most four wave components');
  while (waves.length < 4) waves.push([0, 0, 0, 0]);
  const P = cfg?.paint, D = cfg?.depth, wind = (P?.windDeg ?? 14) * Math.PI / 180;
  return {
    waves,
    motion: [cfg?.enabled ? 1 : 0, ...(cfg?.drift || [0, 0]), cfg?.distortion ?? 0],
    optics: [cfg?.textureStrength ?? 0.42, cfg?.highlightStrength ?? 0.14, cfg?.gloss ?? 40, cfg?.sheenStrength ?? 0.45],
    deep: cfg?.deepColor || [0.035, 0.065, 0.08],
    sky: cfg?.skyColor || [0.28, 0.34, 0.37],
    light: cfg?.lightDirection || [-0.5, 0.85, -0.25],
    // Painted look (sea look step 1): three painted tones from slow swell bands, the baked chop height and broad patches.
    paint: [P?.strength ?? 0, P?.swellLength || 5.5, P?.swellSpeed ?? 0.25, P?.flecks ?? 0],
    paint2: [Math.cos(wind), Math.sin(wind), P?.swellAmount ?? 0.3, P?.inkScale ?? 0.5],
    lit: P?.litColor || [0.075, 0.115, 0.13],
    // Sea look step 2: depth from the bank (units): max baked, shallows end, deep ink starts, shore foam strength.
    depth: [D?.max || 40, D?.shallowEnd ?? 14, D?.deepStart ?? 24, D?.foam ?? 0],
    shallow: D?.shallowColor || [0.085, 0.14, 0.135],
    foam: D?.foamColor || [0.42, 0.47, 0.46],
    // Sea look step 3: lamp streaks on the water at night (strength, length scale, 0, 0).
    glow: [cfg?.lampStreaks?.strength ?? 0, cfg?.lampStreaks?.length ?? 1, 0, 0],
  };
}

// Periodic height derivatives: integer Fourier modes join exactly on both tile
// axes. These are numerical normal data, not painted color/foam images.
export function waterNormalData(size, seed, style = 'ripple', windDeg = 14) {
  if (style === 'painted') return paintedNormalData(size, seed, windDeg);
  const sx = new Float32Array(size * size), sz = new Float32Array(size * size);
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  for (let c = 0; c < 16; c++) {
    const kx = 2 + Math.floor(random() * 22), kz = Math.floor(random() * 9) - 4;
    const phase = random() * Math.PI * 2, amplitude = (0.025 + random() * 0.025) / Math.sqrt(c + 1);
    const length = Math.hypot(kx, kz), ax = amplitude * kx / length, az = amplitude * kz / length;
    const cos = new Float32Array(size), sin = new Float32Array(size);
    for (let x = 0; x < size; x++) { const a = (x + 0.5) / size * kx * Math.PI * 2 + phase; cos[x] = Math.cos(a); sin[x] = Math.sin(a); }
    for (let z = 0; z < size; z++) {
      const a = (z + 0.5) / size * kz * Math.PI * 2, cy = Math.cos(a), sy = Math.sin(a);
      for (let x = 0; x < size; x++) { const i = z * size + x, h = cos[x] * cy - sin[x] * sy; sx[i] += h * ax; sz[i] += h * az; }
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < sx.length; i++) {
    const d = Math.hypot(sx[i], sz[i], 1);
    data[i * 4] = Math.round((0.5 - sx[i] / d * 0.5) * 255);
    data[i * 4 + 1] = Math.round((0.5 - sz[i] / d * 0.5) * 255);
    data[i * 4 + 2] = Math.round((0.5 + 1 / d * 0.5) * 255); data[i * 4 + 3] = 255;
  }
  return data;
}

// Painted chop (sea look step 1): many short crests whose wave vectors stay
// within ~30 degrees of the wind axis, so the surface reads as directional
// brush strokes instead of one-way scratches. Integer modes keep the tile
// seamless. Alpha holds the height (128 = calm, +-127 = 3 standard deviations)
// for the shader's painted tones.
function paintedNormalData(size, seed, windDeg) {
  const n = size * size, h = new Float32Array(n), sx = new Float32Array(n), sz = new Float32Array(n);
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const wind = windDeg * Math.PI / 180, modes = [];
  for (let tries = 0; modes.length < 72 && tries < 20000; tries++) {
    const kx = Math.round((random() * 2 - 1) * 40), kz = Math.round((random() * 2 - 1) * 40), len = Math.hypot(kx, kz);
    if (len < 5 || len > 40 || Math.abs(Math.sin(Math.atan2(kz, kx) - wind)) > 0.5) continue;
    modes.push([kx, kz, random() * Math.PI * 2, (0.6 + 0.8 * random()) / len]);
  }
  const ca = new Float32Array(size), sa = new Float32Array(size), cb = new Float32Array(size), sb = new Float32Array(size);
  for (const [kx, kz, phase, amp] of modes) {
    for (let i = 0; i < size; i++) {
      const a = (i + 0.5) / size * kx * Math.PI * 2 + phase, b = (i + 0.5) / size * kz * Math.PI * 2;
      ca[i] = Math.cos(a); sa[i] = Math.sin(a); cb[i] = Math.cos(b); sb[i] = Math.sin(b);
    }
    const gx = -amp * kx * Math.PI * 2, gz = -amp * kz * Math.PI * 2;
    for (let z = 0; z < size; z++) for (let x = 0, i = z * size; x < size; x++, i++) {
      const c = ca[x] * cb[z] - sa[x] * sb[z], s = sa[x] * cb[z] + ca[x] * sb[z];
      h[i] += amp * c; sx[i] += gx * s; sz[i] += gz * s;
    }
  }
  let hv = 0, sv = 0;
  for (let i = 0; i < n; i++) { hv += h[i] * h[i]; sv += sx[i] * sx[i] + sz[i] * sz[i]; }
  const hs = 1 / (3 * Math.sqrt(hv / n) || 1), ss = 0.06 / (Math.sqrt(sv / n) || 1);
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = sx[i] * ss, z = sz[i] * ss, d = Math.hypot(x, z, 1);
    data[i * 4] = Math.round((0.5 - x / d * 0.5) * 255);
    data[i * 4 + 1] = Math.round((0.5 - z / d * 0.5) * 255);
    data[i * 4 + 2] = Math.round((0.5 + 1 / d * 0.5) * 255);
    data[i * 4 + 3] = Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, h[i] * hs)));
  }
  return data;
}
