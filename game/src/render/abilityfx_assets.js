// Shared look data for render/abilityfx.js: geometries, palettes, outline shader and lantern textures
// (moved out of abilityfx.js, phase 7 split, 2026-10-29).
import * as THREE from 'three';
import { CAM_RIGHT, CAM_UP } from './iso.js';
import { onFxLayer } from './bloom.js';
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
const AMBUSH_AURA_GEO = new THREE.RingGeometry(0.61, 0.79, 64);
const STREAK_GEO = new THREE.PlaneGeometry(1, 1);
const AURAS = {
  lantern: { color: 0xff3a1e, size: 0.625, geo: DISC_GEO, opacity: 0.45 },
  intimidated: { color: 0x7a3cff, size: 1, geo: BUFF_AURA_GEO, opacity: 0.55 },
  rally: { color: 0xffc850, size: 1, geo: BUFF_AURA_GEO, opacity: 0.5 },
  shroud: { color: 0x5a3c96, size: 1, geo: BUFF_AURA_GEO, opacity: 0.5 },
  ambush: { color: 0xb38aff, size: 1.1, geo: AMBUSH_AURA_GEO, opacity: 0.72 },
  veil: { color: 0x233d70, size: 1, geo: BUFF_AURA_GEO, opacity: 0.18 },
  snared: { color: 0x3c4a8a, size: 1, geo: BUFF_AURA_GEO, opacity: 0.55 },
  charmSnare: { color: 0xf087c5, size: .65, geo: BUFF_AURA_GEO, opacity: 0.55 },
  formation: { color: 0xffc779, size: .9, geo: BUFF_AURA_GEO, opacity: .3 },
  geisha: { color: 0x7e5ca6, size: .7, geo: BUFF_AURA_GEO, opacity: .16 },
  diversion: { color: 0xff79ba, size: 1.2, geo: THIN_WAVE_GEO, opacity: .45 },
  downed: { color: 0xc01810, size: 0.75, geo: AURA_GEO, opacity: 0.45, fade: 1.8 },   // shrinks and fades out after going down
};

const STEEL = [0.8, 0.9, 1], WHITE = [1, 1, 1], GOLD = [1, 0.8, 0.35], PURPLE = [0.6, 0.3, 1];
// the Shinobi kit (Tim 2026-10-20): black smoke, purples and blues only as dark, muted highlights
const GUNSMOKE = [[0.62, 0.61, 0.58], [0.52, 0.52, 0.5], [0.72, 0.7, 0.66]], MUZZLE = [[1, 0.92, 0.6], [1, 0.7, 0.3], [1, 0.5, 0.15]];
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
const OUTLINE = { rally: 0xffc850, lantern: 0xff4020, intimidated: 0x9a50ff, shroud: 0x6a4ab0, ambush: 0xa078ed, formation: 0xffc779 };
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

export { flat, WAVE_GEO, DISC_GEO, AURA_GEO, THIN_WAVE_GEO, HALF_WAVE_GEO, BUFF_AURA_GEO, AMBUSH_AURA_GEO, STREAK_GEO, AURAS, STEEL, WHITE, GOLD, PURPLE, GUNSMOKE, MUZZLE, SOOT, SOOT_TINT, DUSK, MIST_BLUE, PETALS, FIRE, pick, count, LANTERNS, ORBIT, rand, screenAngle, OUTLINE, OUTLINE_GEO, OUTLINE_RGB, OUTLINE_VERT, OUTLINE_FRAG, outlineMesh, LANTERN_GEO, HALO_GEO, HALO_TEX, SEAL_TEX };
