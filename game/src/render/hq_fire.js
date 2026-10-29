import * as THREE from 'three';
import { CAM_QUAT, CAM_UP, VIEW_DIR } from './iso.js';
import { shared, FOG_QUAD } from './shading.js';

// A burning HQ (Tim OK'd the mock 2026-10-26): one quad over the building draws
// smoke, ragged flames on the roof and round the base, licks that break off the
// tips and float up, embers and a soft glow.
// Each flame's height and thickness keep changing, and tongues curl apart with
// deep U gaps between them (Tim 2026-10-26), so the fire never settles.
// The quad sits in the building's sorted extras so units in front still draw over it.
const PAD_W = 1.25, PAD_H = 1.9;      // quad size relative to the building art
const SOURCES = 72;

const fireFragment = (sourceCount = SOURCES) => /* glsl */`
uniform float uTime; uniform float uNight; uniform float uAspect; uniform float uSeed;
uniform vec4 uSrc[${sourceCount}];   // x, y in art space (0..1, y up from the art's bottom), size, seed
${FOG_QUAD}
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
  return s;
}
float wobble(float x) {   // smooth 1D random, 0..1
  float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(fract(sin(i * 91.7) * 43758.55), fract(sin((i + 1.0) * 91.7) * 43758.55), f);
}
vec3 ramp(float k) {      // deep red edge -> orange -> pale core
  vec3 c = mix(vec3(0.35, 0.04, 0.02), vec3(0.75, 0.14, 0.03), smoothstep(0.0, 0.25, k));
  c = mix(c, vec3(0.98, 0.42, 0.07), smoothstep(0.25, 0.55, k));
  c = mix(c, vec3(1.0, 0.72, 0.28), smoothstep(0.55, 0.8, k));
  return mix(c, vec3(1.0, 0.9, 0.6), smoothstep(0.8, 1.0, k));
}
void main() {
  float t = uTime + uSeed * 31.0;
  vec2 p = vec2((vUv.x - 0.5) * ${PAD_W.toFixed(2)} + 0.5, vUv.y * ${PAD_H.toFixed(2)});
  vec2 q = vec2(p.x * uAspect, p.y);    // art space measured in art heights

  // smoke rising off the roof and drifting left, lit orange from below
  float sv = p.y - 0.6;
  float xc = 0.48 * uAspect - max(sv, 0.0) * 0.45;
  float w = 0.14 + 0.4 * max(sv, 0.0);
  float sx = (q.x - xc) / w;
  float env = exp(-sx * sx) * smoothstep(-0.05, 0.15, sv) * (1.0 - smoothstep(0.6, 1.25, sv));
  float sn = fbm(vec2(q.x * 3.0 + sv * 1.5, q.y * 2.2 - t * 0.35));
  float sa = clamp(env * 1.7 + (sn - 0.5) * 1.6 - 0.3, 0.0, 1.0);
  sa = sa * sa * (3.0 - 2.0 * sa) * 0.8;
  float lit = 1.0 - smoothstep(0.0, 0.4, sv);
  vec3 smokeCol = mix(vec3(0.14, 0.12, 0.11), vec3(0.55, 0.24, 0.08), lit * 0.7);
  smokeCol = mix(smokeCol, vec3(0.32, 0.31, 0.3), (1.0 - uNight) * 0.6);

  // flames: one rising, warped noise field cut into tongues by each source's shape
  float warp = fbm(q * 3.0 + vec2(0.0, -t * 1.1)) - 0.5;
  float n = fbm(vec2(q.x * 12.0 + warp * 1.6, q.y * 8.0 - t * 4.0));
  float f = 0.0, halo = 0.0;
  for (int i = 0; i < ${sourceCount}; i++) {
    vec4 s = uSrc[i];
    // height swings from a stub to well over twice its usual size, each at its own pace
    float h = s.z * (0.25 + 1.5 * pow(wobble(t * (1.1 + fract(s.w * 0.37) * 2.2) + s.w * 13.0), 1.6));
    vec2 d = vec2(q.x - s.x * uAspect, q.y - s.y);
    float v = d.y / h;
    // thickness: small flames only, never a blob (Tim 2026-10-26); each swells and slims as it burns
    float width = s.z * (0.16 + 0.1 * fract(s.w * 0.53)) * (0.75 + 0.45 * wobble(t * 1.3 + s.w * 5.0));
    // curl: the flame bends side to side more the higher it goes
    float u = d.x / width + sin(v * 3.5 - t * 2.6 + s.w) * 0.6 * clamp(v, 0.0, 1.0);
    // 1-2 tongues split by deep rounded U gaps that open from about a third of the way up
    float k = 1.0 + floor(fract(s.w * 0.71) * 2.0);
    float prof = 0.5 + 0.5 * cos(u * k * 2.6 + sin(t * 0.9 + s.w) * 1.2 + s.w);
    float gaps = smoothstep(-0.15, 0.2, prof + 0.2 - 1.1 * smoothstep(0.15, 0.9, v));
    float uw = u / (0.8 - 0.45 * clamp(v, 0.0, 1.0));
    float shape = exp(-uw * uw) * clamp(1.0 - v * 0.85, 0.0, 1.0) * smoothstep(-0.3, 0.05, v) * gaps;
    // noise bites into the base too, so it never fills in as a solid blob
    f = max(f, shape * 1.6 + (n - 0.5) * 2.4 * clamp(0.5 + v, 0.0, 1.2) * exp(-u * u * 1.2) * (1.0 - smoothstep(1.0, 1.5, v)) - 0.45);
    halo = max(halo, exp(-dot(d, d) / (s.z * s.z * 0.6)));
    // a lick of flame tears off the tip of about half the flames, curls up, shrinks and dies
    float lp = fract(t * (0.5 + fract(s.w * 0.29) * 0.7) + fract(s.w * 0.13));
    vec2 ld = vec2(q.x - s.x * uAspect - sin(lp * 4.0 + s.w) * s.z * 0.18, q.y - s.y - h * (0.65 + lp * 1.1));
    float ll = s.z * 0.2 * (1.0 - lp * 0.6);                     // half its height, shrinking
    float ly = ld.y / ll, lx = ld.x / (ll * 0.32) + sin(ly * 2.0 + t * 3.0 + s.w) * 0.4;
    float lw = ly < 0.0 ? sqrt(max(1.0 - ly * ly, 0.0)) : max(1.0 - ly, 0.0);   // teardrop, point up
    float lick = smoothstep(0.0, 0.35, lw - abs(lx)) * (1.0 - lp) * step(0.45, fract(s.w * 0.61));
    f = max(f, lick * (0.55 + 0.6 * n));
  }
  f = clamp(f, 0.0, 1.0);
  float fa = smoothstep(0.04, 0.34, f);

  // embers: sparse dots rising through the smoke
  vec2 g = vec2(q.x * 14.0, q.y * 14.0 - t * 4.0);
  vec2 cell = floor(g), fr = fract(g) - 0.5;
  vec2 off = vec2(hash(cell + 3.0) - 0.5, hash(cell + 7.0) - 0.5) * 0.6;
  float ember = smoothstep(0.13, 0.0, length(fr - off)) * step(0.88, hash(cell))
    * (0.6 + 0.4 * sin(t * 9.0 + hash(cell) * 40.0))
    * smoothstep(0.4, 0.7, p.y) * (1.0 - smoothstep(0.95, 1.6, p.y)) * exp(-sx * sx * 0.3);

  // premultiplied: smoke under flames, glow and embers added on top
  vec3 col = smokeCol * sa; float a = sa;
  float fo = fa * 0.92;
  col = col * (1.0 - fo) + ramp(f) * fa; a = a * (1.0 - fo) + fo;
  col += vec3(1.0, 0.42, 0.12) * halo * 0.1 * mix(0.4, 1.0, uNight) + vec3(1.0, 0.55, 0.2) * ember;
  float fog = fogGlow(fogGround());
  gl_FragColor = vec4(col * fog, a * fog);
}`;

function fireMaterial(aspect, sources, seed) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uAspect: { value: aspect }, uSeed: { value: seed },
      uSrc: { value: sources.map(s => new THREE.Vector4(...s)) } },
    vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: fireFragment(sources.length),
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

// Where flames start, in art space (x 0..1 across, y up from the art's bottom; sizes in
// art heights). Only small flames (Tim 2026-10-26): a big fire is a cluster of them,
// tallest in the middle and shorter towards its edges. Clusters sit on the roof and round
// the front base (the two lower edges of the footprint diamond).
function fireSources(aspect) {
  const r = Math.random, out = [];
  const cluster = (x, y, size, count) => {
    for (let i = 0; i < count && out.length < SOURCES; i++) {
      const off = (i / (count - 1) - 0.5) + (r() - 0.5) * 0.25;   // -0.6..0.6 across the cluster
      out.push([x + off * size * 0.9 / aspect, y + (r() - 0.3) * size * 0.15,
        size * (1 - 0.9 * off * off * 2) * (0.6 + 0.4 * r()), r() * 100]);
    }
  };
  for (let i = 0; i < 6; i++) {                 // roof: 6 clusters of 7
    const k = (i + 0.25 + r() * 0.5) / 6;
    cluster(0.22 + 0.5 * k, 0.58 + 0.28 * k - r() * 0.12, 0.22 + r() * 0.12, 7);
  }
  for (let i = 0; i < 7; i++) {                 // base: 7 clusters of 4
    const k = (i + 0.25 + r() * 0.5) / 7, x = 0.08 + 0.86 * k;
    const y = x < 0.58 ? 0.27 - 0.22 * (x - 0.08) / 0.5 : 0.05 + 0.2 * (x - 0.58) / 0.36;
    cluster(x, y + 0.02, 0.12 + r() * 0.08, 4);
  }
  while (out.length < SOURCES) out.push([0.5, -5, 0.05, 0]);   // unused: far below the quad
  return out;
}

const ground = new THREE.Vector3();
// Small ground patches reuse the HQ's curling flame, smoke and ember shader.
export function createGroundFirePatch(x,z,radius,seed=1) {
  const sources=Array.from({length:9},(_,i)=>[.5+(i-4)*.045,.06,.2+Math.random()*.1,seed+i*7.3]);
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),fireMaterial(1,sources,seed));
  mesh.quaternion.copy(CAM_QUAT);mesh.scale.set(radius*3.4,radius*3.4*PAD_H/PAD_W,1);
  mesh.position.set(x,0,z).addScaledVector(CAM_UP,mesh.scale.y/2);
  mesh.frustumCulled=false;mesh.renderOrder=99805;
  return mesh;
}
export function createHQFire({ scene, things, lights }) {
  const burning = new Map(), quad = new THREE.PlaneGeometry(1, 1);
  function update(state) {
    for (const [id, fire] of burning) if (!(state.hqRaids?.[id]?.suppressedUntil > state.tick)) {
      scene.remove(fire.mesh);
      fire.thing.extras.splice(fire.thing.extras.indexOf(fire.mesh), 1);
      fire.mesh.material.dispose();
      if (lights) lights.splice(lights.indexOf(fire.light), 1);
      burning.delete(id);
    }
    for (const [id, r] of Object.entries(state.hqRaids || {})) {
      if (r.suppressedUntil <= state.tick || burning.has(id)) continue;
      const thing = things.find(t => t.building === Number(id.slice(1)));
      if (!thing) continue;
      const w = Math.abs(thing.mesh.scale.x), h = Math.abs(thing.mesh.scale.y);
      const mesh = new THREE.Mesh(quad, fireMaterial(w / h, fireSources(w / h), Math.random() * 10));
      mesh.quaternion.copy(CAM_QUAT);
      mesh.scale.set(w * PAD_W, h * PAD_H, 1);
      mesh.position.copy(thing.mesh.position).addScaledVector(CAM_UP, h * (PAD_H - 1) / 2);
      mesh.frustumCulled = false;
      thing.extras.push(mesh); scene.add(mesh);
      // a flickering orange light on the building and the ground round it
      const c = thing.mesh.position;
      ground.set(c.x - VIEW_DIR.x * c.y / VIEW_DIR.y, 2, c.z - VIEW_DIR.z * c.y / VIEW_DIR.y);
      const light = { pos: ground.clone(), radius: Math.max(8, w * 0.9), color: new THREE.Color(1, 0.38, 0.1), fire: true, seed: Math.random() * 10 };
      if (lights) lights.push(light);
      burning.set(id, { thing, mesh, light });
    }
  }
  return { update };
}
