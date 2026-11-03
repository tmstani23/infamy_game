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
