// Ability effects drawn from the sim's per-tick casts list and the buffs in the state:
// dash streak, intimidate shockwave and aura, rally ring and aura, red lantern glow.
// Purely visual: nothing here changes the game state.
import * as THREE from 'three';
import { CAM_QUAT as CAM_Q, CAM_RIGHT, CAM_UP, VIEW_DIR } from './iso.js';
import { onFxLayer } from './bloom.js';
import { createParticles, createCards, SHAPE, getLantern } from './vfx.js';

const flat = (geo, color, opacity) => {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3;
  m.frustumCulled = false;
  return onFxLayer(m);
};
const WAVE_GEO = new THREE.RingGeometry(0.86, 1, 64), DISC_GEO = new THREE.CircleGeometry(1, 40), AURA_GEO = new THREE.RingGeometry(0.57, 0.77, 48);
// Rally's outward ring is 40% thinner than the others (Tim 2026-10-19)
const THIN_WAVE_GEO = new THREE.RingGeometry(0.958, 1, 64);   // halved again (Tim 2026-10-19)
// Rally, Intimidate and Red Lantern rings, auras and halos 50% thinner (Tim 2026-10-19: they hid the characters)
const HALF_WAVE_GEO = new THREE.RingGeometry(0.93, 1, 64), BUFF_AURA_GEO = new THREE.RingGeometry(0.67, 0.77, 48);
const STREAK_GEO = new THREE.PlaneGeometry(1, 1);
const AURAS = {
  lantern: { color: 0xff3a1e, size: 0.625, geo: DISC_GEO, opacity: 0.45 },
  intimidated: { color: 0x7a3cff, size: 1, geo: BUFF_AURA_GEO, opacity: 0.55 },
  rally: { color: 0xffc850, size: 1, geo: BUFF_AURA_GEO, opacity: 0.5 },
  shroud: { color: 0x5a3c96, size: 1, geo: BUFF_AURA_GEO, opacity: 0.5 },
  snared: { color: 0x3c4a8a, size: 1, geo: BUFF_AURA_GEO, opacity: 0.55 },   // caltrops (Distract): slowed   // healing in a Smoke Bomb (same width as Rally's)
  downed: { color: 0xc01810, size: 0.75, geo: AURA_GEO, opacity: 0.45, fade: 1.8 },   // shrinks and fades out after going down
};

const STEEL = [0.8, 0.9, 1], WHITE = [1, 1, 1], GOLD = [1, 0.8, 0.35], PURPLE = [0.6, 0.3, 1];
// the Shinobi kit (Tim 2026-10-20): black smoke, purples and blues only as dark, muted highlights
const SOOT = [[0.04, 0.035, 0.06], [0.06, 0.05, 0.08], [0.03, 0.025, 0.04]], SOOT_TINT = [[0.13, 0.08, 0.2], [0.09, 0.1, 0.18]];
const DUSK = [[0.36, 0.24, 0.6], [0.22, 0.3, 0.52], [0.46, 0.36, 0.66]], MIST_BLUE = [0.5, 0.58, 0.76];
const PETALS = [[1, 0.62, 0.8], [1, 0.75, 0.88], [1, 0.5, 0.7], [1, 0.85, 0.92]];
const FIRE = [[1, 0.35, 0.1], [1, 0.55, 0.15], [1, 0.8, 0.3], [1, 0.2, 0.08]];
const pick = a => a[Math.floor(Math.random() * a.length)];
// emit about rate a second over dt
const count = (rate, dt) => { const n = rate * dt; return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); };
const LANTERNS = 4, ORBIT = 1.3;
const rand = (a, b) => a + Math.random() * (b - a);
// screen angle of a ground direction
const screenAngle = (dx, dz) => Math.atan2(dx * CAM_UP.x + dz * CAM_UP.z, dx * CAM_RIGHT.x + dz * CAM_RIGHT.z);

// glowing outline around a unit's sprite while a buff is on, one colour per buff
const OUTLINE = { rally: 0xffc850, lantern: 0xff4020, intimidated: 0x9a50ff, shroud: 0x6a4ab0 };
const OUTLINE_GEO = new THREE.PlaneGeometry(1, 1);
const OUTLINE_RGB = Object.fromEntries(Object.entries(OUTLINE).map(([k, v]) => [k, new THREE.Color(v)]));
const OUTLINE_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const OUTLINE_FRAG = /* glsl */`
uniform sampler2D uMap; uniform vec4 uFrame; uniform vec3 uColor; uniform float uOpacity; uniform float uWidth;
varying vec2 vUv;
float alphaAt(vec2 c) { return (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0) ? 0.0 : texture2D(uMap, uFrame.xy + c * uFrame.zw).a; }
void main() {
  float a = alphaAt(vUv), m = 0.0;
  // widest alpha nearby (two rings of 12 samples), minus the body itself, leaves a halo outside it
  for (int i = 0; i < 12; i++) {
    float t = float(i) * 0.5236;
    vec2 d = vec2(cos(t), sin(t)) * uWidth;
    m = max(m, alphaAt(vUv + d) * 0.65);
    m = max(m, alphaAt(vUv + d * 0.5));
  }
  float g = clamp(m - a, 0.0, 1.0);
  if (g < 0.01) discard;
  gl_FragColor = vec4(uColor * g * uOpacity, 1.0);
}`;
const outlineMesh = (color) => {
  const m = new THREE.Mesh(OUTLINE_GEO, new THREE.ShaderMaterial({
    uniforms: { uMap: { value: null }, uFrame: { value: new THREE.Vector4() }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uWidth: { value: 0.03 } },
    vertexShader: OUTLINE_VERT, fragmentShader: OUTLINE_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
  }));
  m.frustumCulled = false;
  return onFxLayer(m);
};

const LANTERN_GEO = new THREE.PlaneGeometry(0.62, 0.93), HALO_GEO = new THREE.PlaneGeometry(1.23, 1.23);   // halo 50% thinner (Tim 2026-10-19)   // 20% smaller (Tim 2026-10-19)
// round soft glow for lantern halos
let haloTex = null;
const HALO_TEX = () => haloTex ||= (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
// 灯 seal for under the hero, drawn once
let sealTex = null;
const SEAL_TEX = () => sealTex ||= (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128); g.strokeStyle = '#fff';
  g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 120, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 100, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); g.beginPath(); g.arc(110, 0, 5, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '700 120px "Yu Mincho", "MS Mincho", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('灯', 0, 6);
  return new THREE.CanvasTexture(c);
})();

export function createAbilityFx({ scene, overlay, posOf, spriteOf, unitToScreen }) {
  const waves = [], streaks = [], auras = new Map();   // auras: "id:buff" -> mesh
  const glow = createParticles(scene), cards = createCards(scene);
  const soot = createParticles(scene, { max: 2500, additive: false });   // black smoke: drawn normally so it darkens
  const smokeRings = new Map();   // "x,z,until" of a Smoke Bomb -> its thin ground ring
  let flashEl = null, flashT = 0;  // Assassinate's violet-white screen flash
  const marks = new Map();       // unit id -> the ? over a guard looking at a Distract pebble
  // one black smoke puff: rises a little and swells as it fades; tint: some dark purple or blue ones
  function puff(x, y, z, { vx = 0, vy = 0.3, vz = 0, size = 1.1, life = 1.6, tint = 0.25, alpha = 0.85 } = {}) {
    soot.emit({ x, y, z, vx, vy, vz, drag: 1.6, sway: 0.25, life: life * rand(0.75, 1.25), size: size * rand(0.7, 1.3), grow: 0.9,
      color: pick(Math.random() < tint ? SOOT_TINT : SOOT), alpha: alpha * rand(0.75, 1), shape: SHAPE.dot, spin: rand(-0.6, 0.6) });
  }
  // a burst of smoke at a point: n puffs thrown out round it
  function smokeBurst(x, z, n, radius = 1.2, size = 1.2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rand(0.5, 1) * radius * 2.2;
      puff(x + Math.cos(a) * 0.3, rand(0.2, 1.6), z + Math.sin(a) * 0.3, { vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(0.2, 0.9), size });
    }
  }
  // dim violet and blue motes drifting up
  function motes(x, z, n, spread = 0.8, y = 1) {
    for (let i = 0; i < n; i++)
      glow.emit({ x: x + rand(-spread, spread), y: y + rand(-0.6, 0.8), z: z + rand(-spread, spread), vy: rand(0.3, 1.2), drag: 1.5, sway: 0.5,
        life: rand(0.6, 1.2), size: rand(0.1, 0.22), color: pick(DUSK), alpha: 0.75, shape: SHAPE.sparkle, twinkle: 0.7, spin: 2 });
  }
  const rallyCasts = new Map();   // hero id -> when they last cast Rally (the buff itself is crew-only)
  const outlines = new Map();   // "id:buff" -> glowing outline mesh
  const lanterns = new Map();   // unit id -> the lanterns circling a unit with Red Lantern on
  let dim = null, dimT = 0;     // Intimidate's brief screen dim

  // the hovering paper lanterns, their halos and a 灯 seal for one unit
  function lanternSet() {
    const items = [];
    for (let i = 0; i < LANTERNS; i++) {
      const body = new THREE.Mesh(LANTERN_GEO, new THREE.MeshBasicMaterial({ map: getLantern(), transparent: true, depthTest: false, depthWrite: false }));
      const halo = new THREE.Mesh(HALO_GEO, new THREE.MeshBasicMaterial({ map: HALO_TEX(), color: 0xff5020, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
      for (const m of [body, halo]) { m.frustumCulled = false; onFxLayer(m); scene.add(m); }
      items.push({ body, halo });
    }
    const seal = flat(DISC_GEO, 0xff3018, 0.0);
    seal.material.map = SEAL_TEX();
    seal.material.needsUpdate = true;
    scene.add(seal);
    return { items, seal, age: 0, out: null };
  }

  // a burst of steel sparkles around a point
  function sparkles(x, y, z, n, color = STEEL, speed = 3, size = 0.32) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(0.3, 1) * speed;
      glow.emit({ x, y: y + rand(-0.3, 0.3), z, vx: Math.cos(a) * sp, vy: rand(0.5, 2.5), vz: Math.sin(a) * sp, drag: 3, gravity: 2,
        life: rand(0.35, 0.7), size: size * rand(0.6, 1.3), color, shape: SHAPE.sparkle, twinkle: 0.6, spin: rand(-3, 3) });
    }
  }
  const bars = new Map();                             // execute channel bars: unit id -> HTML element

  function wave(x, z, radius, color, life, delay = 0, geo = WAVE_GEO) {
    const m = flat(geo, color, 0.9);
    m.position.set(x, 0.04, z);
    m.visible = false;
    scene.add(m);
    waves.push({ m, radius, life, age: -delay });
  }

  return {
    // a business just changed hands (render/banners.js): gold glints round its banner and a thin gold ring
    claim(x, z) {
      sparkles(x, 1.4, z, 36, [1, 0.85, 0.45], 3.2, 0.36);
      cards.glint(x, 1.8, z, 2.2, 0xffe6a0, 0.5);
      wave(x, z, 3, 0xffd060, 0.7, 0, THIN_WAVE_GEO);
    },
    // c: one entry of state.casts
    cast(c) {
      const s0 = spriteOf(c.a);
      if (c.kind === 'dash') {
        const m = flat(STREAK_GEO, 0xcfe0ff, 0.8);
        scene.add(m);
        streaks.push({ m, id: c.a, x: c.x, z: c.z, age: 0, done: null, ghostT: 0 });
        // the draw: a white flash on the hero, a glint where the blade leaves the scabbard
        const s = spriteOf(c.a);
        if (s) s.flash = 1.3;
        cards.glint(c.x, 1.1, c.z, 1.8);
        sparkles(c.x, 0.9, c.z, 10, WHITE, 2.5);
      }
      if (c.kind === 'intimidate') {
        wave(c.x, c.z, c.radius, 0x8a40ff, 0.45, 0, HALF_WAVE_GEO); wave(c.x, c.z, c.radius * 0.7, 0x3a1060, 0.5, 0.08, HALF_WAVE_GEO);
        cards.ink(c.x, c.z, c.radius * 0.95, 0.75);
        cards.seal(c.x, c.z, 2.1, '威', 0x9a50ff, 1.3, { spin: -0.8 });
        // purple glitter riding out on the shockwave
        for (let i = 0; i < 70; i++) {
          const a = Math.random() * Math.PI * 2, v = c.radius * 5 * rand(0.85, 1.05);
          glow.emit({ x: c.x, y: rand(0.15, 1.2), z: c.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(0, 0.8), drag: 5,
            life: rand(0.6, 1.1), size: rand(0.18, 0.34), color: Math.random() < 0.3 ? [0.9, 0.75, 1] : PURPLE, shape: SHAPE.sparkle, twinkle: 0.8, spin: 3 });
        }
        if (s0) s0.flash = 1;
        dimT = 0.55;
      }
      if (c.kind === 'rally') {
        rallyCasts.set(c.a, performance.now() / 1000);
        wave(c.x, c.z, c.radius, 0xffd060, 0.6, 0, THIN_WAVE_GEO);
        cards.seal(c.x, c.z, 3, '勇', 0xffc850, 1.8, { spin: 0.5, follow: () => posOf(c.a) });
        cards.glint(c.x, 1.6, c.z, 2, 0xffe6a0, 0.4);
        // glowing sakura petals hanging in the air over the ring, drifting down
        for (let i = 0; i < 70; i++) {
          const a = Math.random() * Math.PI * 2, r = 3.2 * Math.sqrt(Math.random()) + 0.4;
          glow.emit({ x: c.x + Math.cos(a) * r, y: rand(1.5, 4.5), z: c.z + Math.sin(a) * r, vx: Math.cos(a) * 0.4, vz: Math.sin(a) * 0.4,
            vy: rand(-0.7, -0.3), sway: 0.9, life: rand(2.4, 4), size: rand(0.22, 0.34), color: pick(PETALS), alpha: 0.9,
            shape: SHAPE.petal, spin: rand(-2.5, 2.5) });
        }
      }
      if (c.kind === 'shadowstep') {
        // landed on a target with the sure crit (Tim 2026-10-20): a massive violet slash across him
        if (c.crit) {
          const ang = Math.atan2(c.tz - c.z, c.tx - c.x);
          cards.stroke(c.tx, 1.2, c.tz, ang - 0.6, 6.2, 1.0, 0x6a4ab0, 0.45);
          cards.stroke(c.tx, 1.2, c.tz, ang - 0.6, 5.2, 0.3, 0xf0eaff, 0.32);
          cards.stroke(c.tx, 1.0, c.tz, ang + 0.7, 4.0, 0.5, 0x3c4a8a, 0.38);
          cards.glint(c.tx, 1.3, c.tz, 3.4, 0xe8e0ff, 0.3);
          sparkles(c.tx, 1.1, c.tz, 22, [0.85, 0.8, 1], 5);
        }
        // gone in black smoke, a fading violet ghost where he stood, a smoke trail, out of a smoke swirl
        if (s0) cards.ghost(s0, [0.36, 0.24, 0.6], 0.7, 0.6);
        smokeBurst(c.fx, c.fz, 34, 1, 1.2); motes(c.fx, c.fz, 14);
        const dx = c.x - c.fx, dz = c.z - c.fz;
        for (let i = 1; i < 10; i++) puff(c.fx + dx * i / 10, rand(0.4, 1.3), c.fz + dz * i / 10, { size: 0.8, life: 1.1, vy: 0.2 });
        for (let i = 0; i < 26; i++) {   // the swirl: puffs going round him
          const a = Math.random() * Math.PI * 2, r = rand(0.6, 1.3);
          puff(c.x + Math.cos(a) * r, rand(0.1, 1.2), c.z + Math.sin(a) * r, { vx: -Math.sin(a) * 2.2, vz: Math.cos(a) * 2.2, vy: rand(0.3, 0.8), size: 0.9, life: 1.2 });
        }
        motes(c.x, c.z, 16, 0.6);
        wave(c.x, c.z, 1.6, 0x5c3c8c, 0.55, 0, THIN_WAVE_GEO);
        if (s0) s0.flash = 1;
      }
      if (c.kind === 'distract') {
        // a pebble lands: small dim-blue ripples and a little dust (the guards get a ? while they look)
        wave(c.tx, c.tz, 0.6, 0x8496be, 0.4, 0, THIN_WAVE_GEO); wave(c.tx, c.tz, 1.1, 0x5a6c9a, 0.5, 0.1, THIN_WAVE_GEO); wave(c.tx, c.tz, 1.6, 0x3c4a74, 0.6, 0.2, THIN_WAVE_GEO);
        for (let i = 0; i < 6; i++) puff(c.tx + rand(-0.3, 0.3), 0.15, c.tz + rand(-0.3, 0.3), { size: 0.45, life: 0.7, vy: 0.4, alpha: 0.5 });
        for (let i = 0; i < 8; i++) glow.emit({ x: c.tx, y: 0.2, z: c.tz, vx: rand(-1, 1), vz: rand(-1, 1), vy: rand(1, 2), gravity: 5,
          life: rand(0.3, 0.5), size: rand(0.08, 0.14), color: MIST_BLUE, shape: SHAPE.sparkle, twinkle: 0.6 });
        // the caltrops scattering over the snare ring: steel glints bouncing out and lying there a moment
        for (let i = 0; i < 22; i++) {
          const a = Math.random() * Math.PI * 2, v = rand(1, 3.4);
          glow.emit({ x: c.tx, y: 0.3, z: c.tz, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(1.5, 3), gravity: 9, drag: 2.5,
            life: rand(0.9, 1.5), size: rand(0.08, 0.13), color: [0.62, 0.68, 0.82], shape: SHAPE.sparkle, twinkle: 0.4, spin: 4 });
        }
        wave(c.tx, c.tz, 2, 0x3c4a8a, 0.6, 0.05, THIN_WAVE_GEO);
      }
      if (c.kind === 'snuff') {
        // a Shinobi snuffing a lantern from afar (Tim 2026-10-20): a small blackish-purple smoke flash off him, a wisp at the lantern
        smokeBurst(c.x, c.z, 16, 0.5, 0.8); motes(c.x, c.z, 10, 0.5);
        wave(c.x, c.z, 1.2, 0x5c3c8c, 0.35, 0, THIN_WAVE_GEO);
        smokeBurst(c.tx, c.tz, 6, 0.3, 0.6);
      }
      if (c.kind === 'smoke') {
        // the bomb goes off: a big black burst (the cloud itself keeps billowing in update) and a thin ring
        smokeBurst(c.x, c.z, 70, c.radius * 0.6, 1.5);
        motes(c.x, c.z, 30, c.radius * 0.6);
        wave(c.x, c.z, c.radius, 0x5c3c8c, 0.5, 0, THIN_WAVE_GEO);
        cards.ink(c.x, c.z, c.radius * 0.9, 0.9);
      }
      if (c.kind === 'assassinate') {
        // a vicious strike: black smoke bursts, a violet crescent with a white-hot edge, a blinding flash, the 影 (shadow) seal
        smokeBurst(c.tx, c.tz, 46, 1.1, 1.2);
        const ang = Math.atan2(c.tz - c.z, c.tx - c.x);
        cards.stroke(c.tx, 1.2, c.tz, ang + 0.5, 4.4, 0.7, 0x6a4ab0, 0.42);
        cards.stroke(c.tx, 1.2, c.tz, ang + 0.5, 3.6, 0.22, 0xf0eaff, 0.3);
        cards.stroke(c.tx, 1.1, c.tz, ang - 0.6, 3.0, 0.4, 0x3c4a8a, 0.36);
        cards.glint(c.tx, 1.3, c.tz, 4.2, 0xe8e0ff, 0.35);
        cards.glint(c.tx, 1.3, c.tz, 2.4, 0x9a80d0, 0.5);
        cards.seal(c.tx, c.tz, 2.2, '影', 0x6a4aa0, 1.4, { spin: 0.5 });
        wave(c.tx, c.tz, 1.8, 0x5c3c8c, 0.5, 0, THIN_WAVE_GEO); wave(c.tx, c.tz, 1.1, 0x3c4a8a, 0.45, 0.06, THIN_WAVE_GEO);
        sparkles(c.tx, 1.1, c.tz, 26, [0.85, 0.8, 1], 5);
        motes(c.tx, c.tz, 18, 0.5);
        flashT = 0.22;
        if (s0) s0.flash = 1.6;
        // the stab (Tim 2026-10-20): a thin V of light shooting out through him, away from the ninja
        for (const k of [-1, 1]) {
          cards.stroke(c.tx + Math.cos(ang) * 1.2, 1.15, c.tz + Math.sin(ang) * 1.2, ang + k * 0.22, 3.4, 0.12, 0xf0eaff, 0.22);
          cards.stroke(c.tx + Math.cos(ang) * 1.2, 1.15, c.tz + Math.sin(ang) * 1.2, ang + k * 0.22, 4.2, 0.3, 0x7a5ac8, 0.3);
        }
        if (c.fx !== undefined) smokeBurst(c.fx, c.fz, 14, 0.6, 0.9);   // where he lunged from
      }
      if (c.kind === 'arrest') { wave(c.x, c.z, 1.6, 0x4a78e6, 0.45); wave(c.x, c.z, 1.0, 0x1a2a60, 0.5, 0.05); }
      if (c.kind === 'execute') { wave(c.x, c.z, 1.8, 0xff2010, 0.45); wave(c.x, c.z, 1.1, 0x600000, 0.5, 0.05); }
      if (c.kind === 'lantern') {
        wave(c.x, c.z, 2.4, 0xff4020, 0.5, 0, HALF_WAVE_GEO); wave(c.x, c.z, 1.6, 0xffa040, 0.4, 0.06, HALF_WAVE_GEO); wave(c.x, c.z, 3.4, 0xffd070, 0.7, 0.12, HALF_WAVE_GEO);
        cards.glint(c.x, 1.4, c.z, 2.4, 0xffb060, 0.45);
        cards.pillar(() => posOf(c.a), 0xff4a20, 0.9, 5.5, 1.6);
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2, v = rand(1, 4);
          glow.emit({ x: c.x, y: rand(0.3, 1.6), z: c.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(1, 4), drag: 2.5, gravity: -0.5,
            life: rand(0.7, 1.4), size: rand(0.16, 0.34), color: pick(FIRE), shape: Math.random() < 0.4 ? SHAPE.sparkle : SHAPE.ember, twinkle: 0.4 });
        }
        if (s0) s0.flash = 1.4;
      }
    },

    // h: a hit from the dash (kind 'dash'); attacker: its entity. A blade stroke through the
    // enemy along the dash, a star glint on the steel and a burst of sparks.
    cut(h, attacker) {
      const dx = attacker ? h.x - attacker.x : 1, dz = attacker ? h.z - attacker.z : 0;
      const ang = screenAngle(dx, dz);
      cards.stroke(h.x, 1.05, h.z, ang + 0.35, 2.8, 0.36);
      cards.stroke(h.x, 1.05, h.z, ang + 0.35, 2.0, 0.12, 0xffffff, 0.18);
      cards.glint(h.x + rand(-0.2, 0.2), rand(1.1, 1.5), h.z, h.crit ? 2.2 : 1.6, h.crit ? 0xffe090 : 0xffffff);
      sparkles(h.x, 1.0, h.z, h.crit ? 18 : 12, h.crit ? [1, 0.85, 0.4] : STEEL, 4);
    },

    // health coming back (heal, lifesteal or regeneration): a small quick glowy dazzle.
    // big: a real heal rather than a regen trickle; lifesteal: red-gold instead of green-gold
    heal(x, z, big, lifesteal) {
      const cols = lifesteal ? [[1, 0.45, 0.25], [1, 0.8, 0.4]] : [[0.55, 1, 0.5], [1, 0.9, 0.45]];
      for (let i = 0, n = big ? 9 : 4; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        glow.emit({ x: x + Math.cos(a) * rand(0.15, 0.4), y: rand(0.5, 1.5), z: z + Math.sin(a) * rand(0.15, 0.4), vy: rand(0.8, 1.6), drag: 1.5,
          life: rand(0.35, 0.6), size: rand(0.12, big ? 0.26 : 0.18), color: pick(cols), shape: SHAPE.sparkle, twinkle: 0.7, spin: 3 });
      }
      if (big) cards.glint(x, rand(1.2, 1.6), z, 0.8, lifesteal ? 0xff9a60 : 0xb8ff90, 0.25);
    },

    // healing rain: small green drops falling onto a unit healed by a Rally tick,
    // with a few tiny sparkles where they land (Tim 2026-10-19)
    rain(x, z) {
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2, r = rand(0.05, 0.45), y = rand(2.1, 2.9), vy = -rand(4.5, 5.5);
        const size = rand(0.12, 0.18), color = Math.random() < 0.3 ? [0.75, 1, 0.8] : [0.35, 1, 0.55];
        // a drop and two fainter dots trailing above it, so it reads as a falling streak
        for (let k = 0; k < 3; k++)
          glow.emit({ x: x + Math.cos(a) * r, y: y + k * 0.12, z: z + Math.sin(a) * r, vy, life: (y - 0.15) / -vy, size: size * (1 - k * 0.25),
            color, alpha: 0.9 - k * 0.3, shape: SHAPE.ember });
      }
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2, v = rand(0.4, 1.1);
        glow.emit({ x: x + rand(-0.3, 0.3), y: 0.12, z: z + rand(-0.3, 0.3), vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(0.6, 1.2), gravity: 3,
          life: rand(0.3, 0.5), size: rand(0.1, 0.17), color: [0.6, 1, 0.65], shape: SHAPE.sparkle, twinkle: 0.8, spin: 3 });
      }
    },

    // a bandit killed: gold coins pop out of the body in arcs and land, with a glint
    coins(x, z) {
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2, v = rand(1, 2.6);
        glow.emit({ x, y: 1.1, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(3.5, 5.5), gravity: 12, life: rand(0.6, 0.85),
          size: rand(0.16, 0.24), color: Math.random() < 0.3 ? [1, 0.95, 0.6] : [1, 0.75, 0.2], shape: SHAPE.ember, twinkle: 0.5 });
      }
      sparkles(x, 1.2, z, 8, GOLD, 2.5, 0.3);
      cards.glint(x, 1.5, z, 1.4, 0xffd060, 0.3);
    },

    // a hit landed by someone with Red Lantern on: a red-gold sparkle burst
    lanternHit(h) {
      sparkles(h.x, 1.1, h.z, h.crit ? 16 : 9, pick(FIRE), 3.5, 0.3);
      sparkles(h.x, 1.1, h.z, 4, GOLD, 2, 0.4);
      cards.glint(h.x, rand(1, 1.4), h.z, h.crit ? 1.8 : 1.1, 0xff9a40, 0.25);
    },

    update(dt, state) {
      glow.update(dt);
      soot.update(dt);
      cards.update(dt);
      // Smoke Bomb clouds: black smoke keeps billowing in the radius while it lasts, dim glints inside,
      // a thin dark-violet ring on the ground (state.smokes, sim/game.js)
      const live = new Set();
      for (const s of state.smokes || []) {
        const key = `${s.x},${s.z},${s.until}`;
        live.add(key);
        for (let n = count(90, dt); n > 0; n--) {
          const a = Math.random() * Math.PI * 2, r = s.r * Math.sqrt(Math.random()) * 0.92;
          puff(s.x + Math.cos(a) * r, rand(0.1, 2.2), s.z + Math.sin(a) * r, { vx: Math.cos(a) * 0.3, vz: Math.sin(a) * 0.3, vy: rand(0.1, 0.5), size: rand(1.2, 1.9), life: 1.8, alpha: 0.9 });
        }
        if (Math.random() < dt * 14) motes(s.x + rand(-s.r, s.r) * 0.6, s.z + rand(-s.r, s.r) * 0.6, 1, 0.4, rand(0.5, 2));
        let ring = smokeRings.get(key);
        if (!ring) { ring = flat(THIN_WAVE_GEO, 0x5c3c8c, 0.6); ring.position.set(s.x, 0.04, s.z); ring.scale.set(s.r, s.r, 1); scene.add(ring); smokeRings.set(key, ring); }
      }
      for (const [key, ring] of smokeRings) if (!live.has(key)) {
        ring.material.opacity -= dt * 1.5;
        if (ring.material.opacity <= 0) { scene.remove(ring); ring.material.dispose(); smokeRings.delete(key); }
      }
      // units drawn to a Distract pebble: a small dim-blue ? over their heads while they look
      const puzzled = new Set();
      for (const e of Object.values(state.entities)) {
        if (!e.distracted || e.distracted.until <= state.tick || e.dead || e.downed || !overlay) continue;
        const p = posOf(e.id), sp = spriteOf(e.id);
        if (!p || !sp?.thing.mesh.visible) continue;
        puzzled.add(e.id);
        let el = marks.get(e.id);
        if (!el) { el = document.createElement('div'); el.textContent = '?'; el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;font:bold 22px serif;color:#8496be;text-shadow:0 0 6px #1a2240,0 0 2px #000'; overlay.appendChild(el); marks.set(e.id, el); }
        const q = unitToScreen(p.x, p.z, 3.1 + 0.08 * Math.sin(performance.now() / 250));
        el.style.transform = `translate(${q.x}px, ${q.y}px) translate(-50%, -50%)`;
      }
      for (const [id, el] of marks) if (!puzzled.has(id)) { el.remove(); marks.delete(id); }
      // Assassinate: a hard violet-white flash over the whole screen
      if (flashT > 0 && overlay) {
        if (!flashEl) { flashEl = document.createElement('div'); flashEl.style.cssText = 'position:absolute;inset:0;background:radial-gradient(circle,#efe8ff 0%,#8a70c8 55%,#1a1030 100%);pointer-events:none;opacity:0;mix-blend-mode:screen'; overlay.prepend(flashEl); }
        flashT = Math.max(0, flashT - dt);
        const k = 1 - flashT / 0.22;
        flashEl.style.opacity = String(0.7 * (k < 0.1 ? k / 0.1 : (1 - k) ** 2));
      }
      const now = performance.now() / 1000;

      // Intimidate: the screen darkens for a moment
      if (dimT > 0 && overlay) {
        if (!dim) { dim = document.createElement('div'); dim.style.cssText = 'position:absolute;inset:0;background:#05020a;pointer-events:none;opacity:0'; overlay.prepend(dim); }
        dimT = Math.max(0, dimT - dt);
        const k = 1 - dimT / 0.55;
        dim.style.opacity = String(0.45 * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85));
      }

      for (const e of Object.values(state.entities)) {
        // a bandit's body with ryo on it: a gold glint now and then, so it reads as lootable
        if (e.dead && e.loot > 0) {
          const q = posOf(e.id);
          if (q && Math.random() < dt * 2.5) glow.emit({ x: q.x + rand(-0.3, 0.3), y: rand(0.15, 0.4), z: q.z + rand(-0.3, 0.3), vy: rand(0.3, 0.7),
            life: rand(0.5, 0.8), size: rand(0.14, 0.22), color: GOLD, shape: SHAPE.sparkle, twinkle: 0.8, spin: 2 });
          continue;
        }
        if (e.dead || !e.buffs) continue;
        const p = posOf(e.id);
        if (!p) continue;
        // intimidated: purple wisps rising off them
        if (e.buffs.intimidated) for (let n = count(7, dt); n > 0; n--)
          glow.emit({ x: p.x + rand(-0.3, 0.3), y: rand(0.6, 1.6), z: p.z + rand(-0.3, 0.3), vy: rand(0.5, 1.1), sway: 0.5, life: rand(0.8, 1.3),
            size: rand(0.4, 0.7), grow: 1.2, color: [0.35, 0.12, 0.7], alpha: 0.55, shape: SHAPE.dot });
        // rallied: a few petals keep drifting down and gold motes rise around them
        if (e.buffs.rally) {
          for (let n = count(1.6, dt); n > 0; n--) {
            const a = Math.random() * Math.PI * 2;
            glow.emit({ x: p.x + Math.cos(a) * rand(0.4, 1.4), y: rand(2, 3.2), z: p.z + Math.sin(a) * rand(0.4, 1.4), vy: rand(-0.6, -0.3), sway: 0.8,
              life: rand(2, 3), size: rand(0.2, 0.3), color: pick(PETALS), alpha: 0.85, shape: SHAPE.petal, spin: rand(-2, 2) });
          }
          for (let n = count(4, dt); n > 0; n--)
            glow.emit({ x: p.x + rand(-0.4, 0.4), y: rand(0.1, 0.5), z: p.z + rand(-0.4, 0.4), vy: rand(0.8, 1.6), life: rand(0.6, 1), size: rand(0.12, 0.2),
              color: GOLD, shape: SHAPE.sparkle, twinkle: 0.7 });
        }
        // red lantern: embers and flame licks from his feet
        if (e.buffs.lantern) {
          for (let n = count(45, dt); n > 0; n--) {
            const a = Math.random() * Math.PI * 2, r = rand(0.15, 0.6);
            glow.emit({ x: p.x + Math.cos(a) * r, y: rand(0.05, 0.5), z: p.z + Math.sin(a) * r, vx: Math.cos(a) * 0.3, vz: Math.sin(a) * 0.3,
              vy: rand(1.2, 3), gravity: -0.6, sway: 0.6, life: rand(0.5, 1.2), size: rand(0.1, 0.24), color: pick(FIRE), shape: SHAPE.ember });
          }
          for (let n = count(14, dt); n > 0; n--)
            glow.emit({ x: p.x + rand(-0.35, 0.35), y: rand(0.1, 0.6), z: p.z + rand(-0.35, 0.35), vy: rand(1.5, 2.6), drag: 1.5, life: rand(0.35, 0.6),
              size: rand(0.5, 0.8), grow: -0.6, color: [1, 0.3, 0.08], alpha: 0.45, shape: SHAPE.dot });
        }
      }

      // the lanterns: four paper lanterns circling a Red Lantern unit, bobbing and glowing
      for (const e of Object.values(state.entities)) {
        if (!e.buffs?.lantern || e.dead || e.downed || lanterns.has(e.id)) continue;
        lanterns.set(e.id, lanternSet());
      }
      for (const [id, L] of lanterns) {
        const e = state.entities[id], p = posOf(id), sp = spriteOf(id);
        if (L.out === null && (!e || !e.buffs?.lantern || e.dead || e.downed)) L.out = 0;
        if (L.out !== null) L.out += dt;
        L.age += dt;
        const grow = Math.min(1, L.age / 0.35) * (L.out === null ? 1 : Math.max(0, 1 - L.out / 0.3));
        if (grow <= 0 || !p) {
          for (const { body, halo } of L.items) { scene.remove(body, halo); body.material.dispose(); halo.material.dispose(); }
          scene.remove(L.seal); L.seal.material.dispose();
          lanterns.delete(id);
          continue;
        }
        const heroOrder = sp?.thing.mesh.renderOrder ?? 99000;
        L.items.forEach(({ body, halo }, i) => {
          const a = now * 1.3 + i * Math.PI * 2 / LANTERNS, r = ORBIT * (0.4 + 0.6 * grow);
          const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
          const y = 1.75 + 0.18 * Math.sin(now * 2.2 + i * 1.7);
          body.position.set(p.x + ox, y, p.z + oz);
          halo.position.copy(body.position);
          body.quaternion.copy(CAM_Q); body.rotateZ(0.12 * Math.sin(now * 1.8 + i));
          halo.quaternion.copy(CAM_Q);
          const flick = 0.85 + 0.15 * Math.sin(now * 11 + i * 3) * Math.sin(now * 6.3 + i);
          body.scale.setScalar(grow);
          halo.scale.setScalar(grow * (0.9 + 0.25 * flick));
          halo.material.opacity = 0.75 * flick;
          // in front of him or behind him, by which side of him it is on
          const front = ox * VIEW_DIR.x + oz * VIEW_DIR.z > 0;
          body.renderOrder = heroOrder + (front ? 0.6 : -0.6);
          halo.renderOrder = heroOrder + (front ? 0.5 : -0.7);
          if (Math.random() < dt * 6) glow.emit({ x: body.position.x, y: y - 0.3, z: body.position.z, vy: rand(-0.3, 0.4), sway: 0.4,
            life: rand(0.5, 0.9), size: rand(0.08, 0.16), color: pick(FIRE), shape: SHAPE.ember });
        });
        const pulse = 1 + 0.06 * Math.sin(now * 5);
        L.seal.position.set(p.x, 0.04, p.z);
        L.seal.scale.set(1.5 * grow * pulse, 1.5 * grow * pulse, 1);
        L.seal.rotation.z = now * 0.7;
        L.seal.material.opacity = 0.85 * grow;
      }
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.age += dt;
        if (w.age < 0) continue;
        const k = w.age / w.life;
        if (k >= 1) { scene.remove(w.m); w.m.material.dispose(); waves.splice(i, 1); continue; }
        const r = w.radius * (0.15 + 0.85 * (1 - (1 - k) ** 3));
        w.m.visible = true;
        w.m.scale.set(r, r, 1);
        w.m.material.opacity = 0.9 * (1 - k);
      }

      // dash: a pale streak along the ground from the start point to the hero, fading after,
      // blue after-images and a trail of sparkles while it runs, a glint as the blade goes home
      for (let i = streaks.length - 1; i >= 0; i--) {
        const s = streaks[i], e = state.entities[s.id], p = posOf(s.id), sp = spriteOf(s.id);
        if (!s.done && (!e || !e.dash) && s.age > 0.05) {
          s.done = s.age;
          if (p) { cards.glint(p.x, 1.35, p.z, 1.2, 0xfff2d0, 0.35); sparkles(p.x, 1.1, p.z, 6, WHITE, 1.5, 0.26); }
        }
        if (!s.done && sp && dt > 0) {
          s.ghostT -= dt;
          if (s.ghostT <= 0) { s.ghostT = 0.035; cards.ghost(sp); }
          for (let j = 0; j < 3; j++) glow.emit({ x: sp.pos.x + rand(-0.3, 0.3), y: rand(0.3, 1.9), z: sp.pos.z + rand(-0.3, 0.3),
            vy: rand(0.2, 0.9), drag: 2, life: rand(0.35, 0.7), size: rand(0.16, 0.3), color: j ? STEEL : WHITE, shape: SHAPE.sparkle, twinkle: 0.7, spin: 2 });
        }
        s.age += dt;
        const fade = s.done ? 1 - (s.age - s.done) / 0.3 : 1;
        if (fade <= 0 || !p) { scene.remove(s.m); s.m.material.dispose(); streaks.splice(i, 1); continue; }
        const dx = p.x - s.x, dz = p.z - s.z, len = Math.hypot(dx, dz);
        s.m.position.set(s.x + dx / 2, 0.05, s.z + dz / 2);
        s.m.rotation.set(-Math.PI / 2, 0, -Math.atan2(dz, dx));
        s.m.scale.set(Math.max(len, 0.01), 0.55 * fade + 0.1, 1);
        s.m.material.opacity = 0.75 * fade;
      }

      // auras under units with an active buff
      const seen = new Set(), now0 = performance.now() / 1000;
      const rallyOwners = new Set(Object.values(state.entities).filter(u => u.buffs?.rally && !u.dead).map(u => u.owner));
      for (const [id, t] of rallyCasts) if (!state.entities[id] || (now0 - t > 1.5 && !rallyOwners.has(state.entities[id].owner))) rallyCasts.delete(id);
      for (const e of Object.values(state.entities)) {
        // the hero who cast Rally keeps its aura while their crew is rallied
        // (after its own buff ends, or if it went down and got up)
        const rallied = e.type === 'hero' && !e.buffs?.rally && !e.downed && rallyCasts.has(e.id)
          && (now0 - rallyCasts.get(e.id) < 1.5 || rallyOwners.has(e.owner));
        if ((!e.buffs && !e.downed && !rallied) || e.dead) continue;
        const p = posOf(e.id);
        if (!p) continue;
        let layer = 0;   // stacked buffs: each one a little wider and higher than the last
        for (const name of [...Object.keys(e.buffs || {}), ...(rallied ? ['rally'] : []), ...(e.downed ? ['downed'] : [])]) {
          const a = AURAS[name];
          if (!a) continue;
          const key = `${e.id}:${name}`, i = OUTLINE[name] ? layer++ : 0;
          seen.add(key);
          const sp = spriteOf(e.id), now = performance.now() / 1000;
          if (OUTLINE[name] && sp && !e.downed) {
            let o = outlines.get(key);
            if (!o) { o = outlineMesh(OUTLINE[name]); scene.add(o); outlines.set(key, o); }
            const u = o.material.uniforms, su = sp.material.uniforms;
            u.uMap.value = su.uMap.value;
            u.uFrame.value.copy(su.uFrame.value);
            u.uWidth.value = (0.021 + 0.012 * i) * (name === 'rally' ? 0.8 : 1) * 0.5;   // outline thickness (Tim: 25% thinner; Rally's 20% thinner again; all halved 2026-10-19)
            u.uOpacity.value = 0.8 + 0.25 * Math.sin(now * 4 + e.id * 1.3 + i);
            o.position.copy(sp.thing.mesh.position);
            o.quaternion.copy(sp.thing.mesh.quaternion);
            o.scale.copy(sp.thing.mesh.scale);
            o.renderOrder = sp.thing.mesh.renderOrder - 0.2 - 0.05 * i;
            // sparkles circling the body
            for (let n = count(9, dt); n > 0; n--) {
              const c = OUTLINE_RGB[name];
              glow.emit({ x: p.x, y: 0.7 + 0.45 * i + rand(-0.15, 0.25), z: p.z, vy: rand(0.1, 0.4), life: rand(0.5, 0.8), size: rand(0.12, 0.22),
                color: [c.r, c.g, c.b], shape: SHAPE.sparkle, twinkle: 0.6,
                orbit: { x: p.x, z: p.z, r: 0.55 + 0.12 * i, w: (i % 2 ? -1 : 1) * rand(3, 4.5), a: Math.random() * Math.PI * 2 } });
            }
          }
          let m = auras.get(key);
          if (!m) { m = flat(a.geo, a.color, a.opacity); m.userData.born = performance.now(); scene.add(m); auras.set(key, m); }
          let shrink = 1;
          if (a.fade) {
            const left = 1 - (performance.now() - m.userData.born) / 1000 / a.fade;
            m.visible = left > 0;
            m.material.opacity = a.opacity * Math.max(0, left);
            shrink = 0.3 + 0.7 * Math.max(0, left);
          }
          const pulse = 1 + 0.08 * Math.sin(performance.now() / 160 + e.id * 1.7);
          m.position.set(p.x, 0.035, p.z);
          const ring = a.size * pulse * shrink * (1 + 0.18 * i);
          m.scale.set(ring, ring, 1);
        }
      }
      for (const [key, m] of auras) if (!seen.has(key)) { scene.remove(m); m.material.dispose(); auras.delete(key); }
      for (const [key, o] of outlines) if (!seen.has(key) || state.entities[key.split(':')[0]]?.downed) { scene.remove(o); o.material.dispose(); outlines.delete(key); }

      // channel bars over whoever is finishing someone off (EXECUTING, red) or arresting them
      // (ARRESTING, blue): the only bar for a channel (Tim 2026-10-18)
      const busy = new Set();
      for (const e of Object.values(state.entities)) {
        const x = e.execute, p = posOf(e.id);
        if (!x || x.start === null || !p || !overlay) continue;
        busy.add(e.id);
        let el = bars.get(e.id);
        if (el && el.arrest !== !!x.arrest) { el.remove(); el = null; }
        if (!el) {
          el = document.createElement('div'); el.className = x.arrest ? 'channel arrest' : 'channel'; el.arrest = !!x.arrest;
          el.innerHTML = `<i></i><span>${x.arrest ? 'ARRESTING' : 'EXECUTING'}</span>`; overlay.appendChild(el); bars.set(e.id, el);
        }
        const k = Math.min(1, (state.tick - x.start) / x.len), s = unitToScreen(p.x, p.z, 2.75);
        el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
        el.firstChild.style.width = `${k * 100}%`;
      }
      for (const [id, el] of bars) if (!busy.has(id)) { el.remove(); bars.delete(id); }
    },
  };
}
