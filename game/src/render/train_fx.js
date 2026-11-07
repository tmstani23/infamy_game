// Steam and the waiting badge of a sprite train (Tim 2026-11-07), drawn by render/rail_track.js.
//   const fx = createTrainFx(scene)
//   fx.step(dt, engine, { mode: 'idle' | 'run' | null, speed, whistle, wait })
//     engine: { x, z, fx, fz } its middle on the ground and the way it faces (unit), or null while it is out of sight
//     mode: idle = standing in a station (slow soft wisps), run = moving (puffs, more the faster it goes)
//     whistle: true on the frame it whistles (pulling out): a thin, fast plume straight up for a moment
//     wait: { left, full } seconds while it stands in a station: a flashing badge and a bar that runs down
//   fx.dispose()
// The puffs stay where they were let out, so a moving train leaves its steam behind it.
import * as THREE from 'three';
import { CAM_QUAT, CAM_RIGHT } from './iso.js';

const CHIMNEY = { fwd: 2.3, up: 3.55 };   // the chimney top from the engine's middle (train_engine: 6.4 long, 3.6 tall)
const STEAM = {
  idle:    { every: 0.5, life: 3.8, rise: 1.0, size: [0.45, 2.8], alpha: 0.34, spread: 0.18, sway: 0.4 },
  run:     { every: 0.13, life: 2.1, rise: 2.6, size: [0.8, 3.4], alpha: 0.5, spread: 0.35, sway: 0.15 },
  whistle: { every: 0.025, life: 0.85, rise: 12, size: [0.3, 0.85], alpha: 0.9, spread: 0.05, sway: 0, seconds: 1.6 },
};
const POOL = 110;
const BADGE = { up: 6.0, size: 1.7, flashHz: 1.4 };
const BAR = { up: 4.6, w: 3.2, h: 0.34, pad: 0.06 };
const ON_TOP = 99600;   // steam and badge over the scenery (sprites are drawn without a depth test)

function canvasTexture(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let puffTex = null, badgeTex = null;
const puffTexture = () => puffTex ||= canvasTexture(64, (g, n) => {
  const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, n, n);
});
// a round dark badge, gold rim, a little steam engine in cream
const badgeTexture = () => badgeTex ||= canvasTexture(128, (g, n) => {
  const m = n / 2;
  g.fillStyle = 'rgba(28,22,16,0.92)'; g.beginPath(); g.arc(m, m, m - 6, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d4aa5a'; g.lineWidth = 7; g.stroke();
  g.fillStyle = '#efe4c8';
  g.fillRect(30, 52, 50, 24);          // boiler
  g.fillRect(36, 34, 11, 20);          // chimney
  g.fillRect(31, 30, 21, 7);           // chimney cap
  g.fillRect(76, 40, 24, 36);          // cab
  g.fillRect(72, 36, 32, 6);           // cab roof
  g.fillRect(24, 76, 82, 6);           // footplate
  for (const [x, r] of [[40, 10], [64, 10], [92, 8]]) { g.beginPath(); g.arc(x, 88, r, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(28,22,16,0.92)';
  for (const [x, r] of [[40, 4], [64, 4], [92, 3]]) { g.beginPath(); g.arc(x, 88, r, 0, Math.PI * 2); g.fill(); }
});

const PLANE = new THREE.PlaneGeometry(1, 1);
const quad = (mat, order = ON_TOP) => { const m = new THREE.Mesh(PLANE, mat); m.quaternion.copy(CAM_QUAT); m.renderOrder = order; m.frustumCulled = false; m.visible = false; return m; };
const flat = (map, color = 0xffffff, opacity = 1) => new THREE.MeshBasicMaterial({ map, color, opacity, transparent: true, depthTest: false, depthWrite: false });

export function createTrainFx(scene) {
  const puffs = [], timers = { idle: 0, run: 0, whistle: 0 };
  let next = 0, whistleLeft = 0, clock = 0;
  for (let i = 0; i < POOL; i++) { const mesh = quad(flat(puffTexture(), 0xece7de, 0), ON_TOP - 1); scene.add(mesh); puffs.push({ mesh, age: 0, life: 0 }); }
  const badge = quad(flat(badgeTexture())), barBack = quad(flat(null, 0x15110c, 0.85)), barFill = quad(flat(null, 0xd4aa5a, 1), ON_TOP + 1);
  badge.scale.set(BADGE.size, BADGE.size, 1);
  barBack.scale.set(BAR.w, BAR.h, 1);
  scene.add(badge, barBack, barFill);
  const amber = new THREE.Color(0xd4aa5a), red = new THREE.Color(0xc0462e);

  function emit(kind, e, speed) {
    const k = STEAM[kind], p = puffs[next]; next = (next + 1) % POOL;
    const x = e.x + e.fx * CHIMNEY.fwd, z = e.z + e.fz * CHIMNEY.fwd;
    const j = () => (Math.random() - 0.5) * 2 * k.spread;
    p.mesh.position.set(x + j(), CHIMNEY.up, z + j());
    p.vx = j() * 0.6; p.vz = j() * 0.6; p.vy = k.rise * (0.85 + Math.random() * 0.3);
    if (kind === 'run') { p.vx -= e.fx * speed * 0.08; p.vz -= e.fz * speed * 0.08; }   // the draught pulls it back a little
    p.age = 0; p.life = k.life * (0.85 + Math.random() * 0.3); p.k = k; p.phase = Math.random() * 6.3;
    p.mesh.visible = true;
  }
  function step(dt, e, { mode = null, speed = 0, whistle = false, wait = null } = {}) {
    clock += dt;
    if (whistle) whistleLeft = STEAM.whistle.seconds;
    whistleLeft = Math.max(0, whistleLeft - dt);
    if (e) {
      const go = (kind, every) => { timers[kind] += dt; while (timers[kind] >= every) { timers[kind] -= every; emit(kind, e, speed); } };
      if (mode === 'idle') go('idle', STEAM.idle.every);
      if (mode === 'run') go('run', STEAM.run.every / Math.max(0.35, Math.min(1.6, speed / 36)));
      if (whistleLeft > 0) go('whistle', STEAM.whistle.every);
    }
    for (const p of puffs) {
      if (!p.mesh.visible) continue;
      p.age += dt;
      if (p.age >= p.life) { p.mesh.visible = false; continue; }
      const f = p.age / p.life, k = p.k, slow = 1 / (1 + p.age * 1.2);   // rises fast at first, then hangs
      p.mesh.position.x += (p.vx + Math.sin(p.phase + p.age * 1.7) * k.sway) * dt;
      p.mesh.position.z += (p.vz + Math.cos(p.phase + p.age * 1.3) * k.sway) * dt;
      p.mesh.position.y += p.vy * slow * dt;
      const s = k.size[0] + (k.size[1] - k.size[0]) * Math.sqrt(f);
      p.mesh.scale.set(s, s, 1);
      p.mesh.material.opacity = k.alpha * Math.min(1, f * 6) * (1 - f) * (1 - f);
    }
    const show = !!(e && wait && wait.full > 0);
    badge.visible = barBack.visible = barFill.visible = show;
    if (!show) return;
    const pulse = 0.5 + 0.5 * Math.sin(clock * Math.PI * 2 * BADGE.flashHz);
    badge.material.opacity = 0.45 + 0.55 * pulse;
    badge.scale.setScalar(BADGE.size * (1 + 0.06 * pulse)); badge.scale.z = 1;
    badge.position.set(e.x, BADGE.up, e.z);
    const frac = Math.max(0, Math.min(1, wait.left / wait.full)), w = (BAR.w - BAR.pad * 2) * frac;
    barBack.position.set(e.x, BAR.up, e.z);
    barFill.scale.set(Math.max(0.001, w), BAR.h - BAR.pad * 2, 1);
    barFill.position.set(e.x, BAR.up, e.z).addScaledVector(CAM_RIGHT, -(BAR.w - BAR.pad * 2 - w) / 2);
    barFill.material.color.copy(amber).lerp(red, frac < 0.25 ? 1 - frac / 0.25 : 0);
  }
  function dispose() {
    for (const p of puffs) { scene.remove(p.mesh); p.mesh.material.dispose(); }
    for (const m of [badge, barBack, barFill]) { scene.remove(m); m.material.dispose(); }
  }
  return { step, dispose };
}
