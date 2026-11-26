// Camp fire life (Tim 2026-11-26): every lit camp fire on the island, the crew's own (state.campfires, sim/campfire.js) and
// a wandering folk night camp's (state.world.folk scene props, sim/wandering_folk.js), gets flame tongues licking up, a
// few sparks, and a long thin column of smoke that climbs and drifts off on the wind. A fire put out (out = tick) loses
// its flames at once and its smoke thins away over emberSeconds. All of it somewhat see-through.
// createFireSmokeFx({ scene, emberSeconds }) -> { update(dt, state, show) }
import { createParticles, SHAPE } from './vfx.js';

const rand = (a, b) => a + Math.random() * (b - a);
const FX = {
  smoke: { perSecond: 7, y: 0.55, rise: [1.0, 1.5], life: [6.5, 9.5], size: [0.45, 0.7], grow: 4.2, alpha: [0.16, 0.26], drag: 0.12, sway: 0.4,
    wind: [0.32, -0.12], day: [0.62, 0.6, 0.58], night: [0.3, 0.29, 0.3] },
  tongue: { perSecond: 14, y: 0.25, rise: [1.1, 2.0], life: [0.3, 0.55], size: [0.3, 0.5], spread: 0.22, colors: [[1, 0.62, 0.18], [1, 0.42, 0.1], [1, 0.8, 0.35]], alpha: 0.55 },
  spark: { perSecond: 2.5, y: 0.5, rise: [1.4, 2.8], life: [0.9, 1.8], size: [0.06, 0.1], color: [1, 0.62, 0.22], alpha: 0.9 },
  maxStep: 0.1,
};

export function createFireSmokeFx({ scene, emberSeconds = () => 20 }) {
  const smoke = createParticles(scene, { max: 1200, additive: false }), glow = createParticles(scene, { max: 700, additive: true });
  const owed = new Map();   // fire key -> [smoke, tongue, spark] parts of a particle still owed
  function fires(state) {
    const out = [];
    for (const f of Object.values(state.campfires || {})) out.push({ key: `c${f.id}`, x: f.x, z: f.z, out: f.out });
    for (const sc of Object.values(state.world?.folk?.scenes || {})) for (const p of sc.props || []) if (p.fire) out.push({ key: `f${sc.id}`, x: p.x, z: p.z, out: p.out });
    return out;
  }
  function update(dt, state, show) {
    dt = Math.min(dt, FX.maxStep);
    if (!show) { if (owed.size) { owed.clear(); smoke.clear(); glow.clear(); } return; }
    const list = fires(state), keys = new Set(list.map(f => f.key));
    for (const k of [...owed.keys()]) if (!keys.has(k)) owed.delete(k);
    for (const f of list) {
      const left = f.out ? Math.max(0, 1 - ((state.tick ?? 0) - f.out) / Math.max(1, emberSeconds() * 20)) : 1, lit = !f.out;
      const o = owed.get(f.key) || [0, 0, 0];
      owed.set(f.key, o);
      const S = FX.smoke, T = FX.tongue, K = FX.spark;
      for (o[0] += S.perSecond * left * dt; o[0] >= 1; o[0]--) smoke.emit({ x: f.x + rand(-0.12, 0.12), y: S.y, z: f.z + rand(-0.12, 0.12),
        vx: S.wind[0] * rand(0.6, 1.4), vz: S.wind[1] * rand(0.6, 1.4), vy: rand(...S.rise), drag: S.drag, sway: S.sway, life: rand(...S.life), size: rand(...S.size), grow: S.grow,
        color: state.night ? S.night : S.day, alpha: rand(...S.alpha), shape: SHAPE.puff, spin: rand(-0.25, 0.25) });
      if (!lit) continue;
      for (o[1] += T.perSecond * dt; o[1] >= 1; o[1]--) glow.emit({ x: f.x + rand(-T.spread, T.spread), y: T.y + rand(0, 0.2), z: f.z + rand(-T.spread, T.spread),
        vy: rand(...T.rise), drag: 1.2, sway: 0.25, life: rand(...T.life), size: rand(...T.size), grow: -0.5, color: T.colors[Math.floor(Math.random() * T.colors.length)],
        alpha: T.alpha, shape: SHAPE.tongue, rot: 0 });
      for (o[2] += K.perSecond * dt; o[2] >= 1; o[2]--) glow.emit({ x: f.x + rand(-0.2, 0.2), y: K.y, z: f.z + rand(-0.2, 0.2), vx: FX.smoke.wind[0] + rand(-0.3, 0.3), vz: FX.smoke.wind[1] + rand(-0.3, 0.3),
        vy: rand(...K.rise), drag: 0.5, sway: 0.9, life: rand(...K.life), size: rand(...K.size), color: K.color, alpha: K.alpha, shape: SHAPE.ember, twinkle: 0.6 });
    }
    smoke.update(dt); glow.update(dt);
  }
  return { update };
}
