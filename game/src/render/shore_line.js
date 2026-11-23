// The landable shore in the world (ships S6b, src/landing_shore.js): while anyone of yours is aboard a ship, a soft pale
// line lies at the water's edge wherever a ship can land them, fading in and out, breathing gently, a faint shimmer
// running along it; it tapers off where the shore turns to cliff. A ribbon on the water just off the drawn shore, under
// the ships and their foam. Reads the view only.
// createShoreLine({ scene, world }) -> { update(wanted, dt, show), dispose() }   wanted: shoreWanted() from landing_shore.js
import * as THREE from 'three';
import { shoreLine } from '../landing_shore.js';
import { fxShared } from './vfx.js';   // uPx: screen pixels per world unit, so the line keeps a few pixels at wide zoom

const COLOR = new THREE.Color(1.0, 0.93, 0.74);   // pale warm cream: warmer than the cool white of the surf
const IN = 0.1, OUT = 3.6, TAPER = 18;   // the ends fade over about a tile   // world units: the ribbon from just on the sand out over the water; tapered ends
const VERT = /* glsl */`
attribute float aFade;
varying vec2 vUv; varying float vF;
void main() { vUv = uv; vF = aFade; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
uniform vec3 uColor; uniform float uTime, uAlpha, uPx, uSpan;
varying vec2 vUv; varying float vF;
void main() {
  float a = vUv.y, s = vUv.x;   // a: 0 on the sand .. 1 out on the water; s: along the shore
  float wv = (0.6 + 0.7 * (0.5 + 0.5 * sin(s * 0.12 + sin(s * 0.041) * 2.6))) * (0.55 + 0.45 * vF);   // a brush stroke, thinner at the ends
  float gap = smoothstep(-0.92, -0.7, sin(s * 0.29 + sin(s * 0.067) * 2.8));   // now and then the brush lifts
  float sig = max(0.075 * wv, 1.5 / max(uPx * uSpan, 1.0) * (0.55 + 0.45 * vF));   // at least ~3 px across on screen
  float d = (a - 0.21) / sig;   // the core sits just off the drawn edge, so the surf still shows on the sand
  float core = exp(-d * d) * gap;
  float h = (a - 0.27) / 0.24, halo = exp(-h * h) * step(0.17, a);   // the glow falls out over the water, hardly onto the sand
  float sd = (a - 0.36) / 0.08, shade = exp(-sd * sd) * 0.3 * gap;   // a thin cool shadow on the water side: reads on snow too
  float paint = 0.86 + 0.14 * sin(s * 0.11 + sin(s * 0.031) * 3.0);
  float shimmer = 0.8 + 0.2 * smoothstep(0.6, 1.0, sin(s * 0.09 - uTime * 1.2));
  float breathe = 0.88 + 0.12 * sin(uTime * 1.9);
  float lit = (core * 0.8 + halo * 0.18) * paint * shimmer * breathe;
  float sh = shade * (1.0 - lit);
  float k = (lit + sh) * vF * uAlpha;
  gl_FragColor = vec4((uColor * lit + vec3(0.04, 0.08, 0.13) * sh) / max(lit + sh, 1e-4), k);
}`;

export function createShoreLine({ scene, world }) {
  const shown = new Map();   // key -> { mesh, alpha, want }
  const uTime = { value: 0 };
  let wantedAt = -1, last = [];
  function build(w) {
    const runs = shoreLine(world, w.box, w.water), pos = [], uv = [], fade = [], idx = [];
    for (const run of runs) {
      const base = pos.length / 3, L = run[run.length - 1].s - run[0].s;
      for (const p of run) {
        const t = p.s - run[0].s, f = Math.min(1, Math.min(t, L - t) / TAPER);
        pos.push(p.x - p.nx * IN, 0.03, p.z - p.nz * IN, p.x + p.nx * OUT, 0.03, p.z + p.nz * OUT);
        uv.push(p.s, 0, p.s, 1); fade.push(f, f);
      }
      for (let i = 0; i < run.length - 1; i++) { const j = base + i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uColor: { value: COLOR }, uTime, uAlpha: { value: 0 }, uPx: fxShared.uPx, uSpan: { value: IN + OUT } } });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 1.9; mesh.frustumCulled = false; scene.add(mesh);
    return { mesh, alpha: 0 };
  }
  return {
    // wanted: a function giving the circles to show (read four times a second); show: the island is on screen
    update(wanted, dt, show = true) {
      uTime.value += dt; wantedAt -= dt;
      if (wantedAt < 0) { wantedAt = 0.25; last = show ? wanted() : []; }
      const keys = new Set(last.map(w => w.key));
      for (const w of last) if (!shown.has(w.key)) shown.set(w.key, build(w));
      for (const [key, e] of shown) {
        e.alpha = THREE.MathUtils.clamp(e.alpha + (keys.has(key) ? dt / 0.6 : -dt / 0.4), 0, 1);
        e.mesh.material.uniforms.uAlpha.value = e.alpha; e.mesh.visible = e.alpha > 0;
        if (!e.alpha && !keys.has(key)) { scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); shown.delete(key); }
      }
    },
    dispose() { for (const e of shown.values()) { scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); } shown.clear(); },
  };
}
