// Sprite facing uses 45-degree steps in the isometric ground plane.
export function inViewCone(observer, target, degrees = 90) {
  const a = (observer.dir || 0) * Math.PI / 4, s = Math.SQRT1_2;
  const fx = s * (Math.cos(a) - Math.sin(a)), fz = s * (Math.cos(a) + Math.sin(a));
  const dx = target.x - observer.x, dz = target.z - observer.z, d = Math.hypot(dx, dz);
  return d < 1e-8 || (fx * dx + fz * dz) / d >= Math.cos(degrees * Math.PI / 360) - 1e-9;
}
export function clearSight(a, b, blockers) {
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const box of blockers) {
    let near = 0, far = 1;
    for (const [p, delta, low, high] of [[a.x, dx, box.minX, box.maxX], [a.z, dz, box.minZ, box.maxZ]]) {
      if (Math.abs(delta) < 1e-9) { if (p <= low || p >= high) { near = 2; break; } }
      else { const x = (low - p) / delta, y = (high - p) / delta; near = Math.max(near, Math.min(x, y)); far = Math.min(far, Math.max(x, y)); }
    }
    if (near <= far && far > 1e-5 && near < 1 - 1e-5) return false;
  }
  return true;
}
