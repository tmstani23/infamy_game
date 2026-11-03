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
  return {
    waves,
    motion: [cfg?.enabled ? 1 : 0, ...(cfg?.drift || [0, 0]), cfg?.distortion ?? 0],
    optics: [cfg?.textureStrength ?? 0.42, cfg?.highlightStrength ?? 0.14, cfg?.gloss ?? 40, cfg?.sheenStrength ?? 0.45],
    deep: cfg?.deepColor || [0.035, 0.065, 0.08],
    sky: cfg?.skyColor || [0.28, 0.34, 0.37],
    light: cfg?.lightDirection || [-0.5, 0.85, -0.25],
  };
}

// Periodic height derivatives: integer Fourier modes join exactly on both tile
// axes. These are numerical normal data, not painted color/foam images.
export function waterNormalData(size, seed) {
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
