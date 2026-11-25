// Catching a wild horse (wildlife W6, Tim 2026-11-24): no rope and nothing thrown. A band of warm lantern light
// passes over her from head to tail; behind it she is the saddled horse, ahead of it still the wild one. A soft,
// uneven pool of the same light lies on the grass, leaning toward the hero. About a second, all see-through.
// Mock and critic rounds: project files war_build/wildlife/halter_swap/ (Tim picked best_anim_r4).
// Sim: a 'horseCaught' cast { a: hero id, t: the wild horse's id (gone from the sim), horse: the tamed horse's id }
// (sim/wild_animals.js catchHorse). The wild horse's sprite is held on screen until the light has passed (holds()).
import * as THREE from 'three';
import { CAM_RIGHT, CAM_UP } from './iso.js';
import { groundY } from '../castle_height.js';

const END = 1.0, HOLD = 0.6;                       // seconds: whole effect, wild sprite kept
const CORE = [236 / 255, 150 / 255, 64 / 255], EDGE = [138 / 255, 74 / 255, 30 / 255];
const BODY = 1.3, MID = 1.15, BAND = 0.45, SOFT = 0.12;   // half her length on screen, body centre height, band length, wipe edge (world units)
const sm = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const SIN_E = Math.hypot(CAM_UP.x, CAM_UP.z);      // ground depth shrinks on screen by this much

function poolMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uCore: { value: new THREE.Color(...CORE) }, uEdge: { value: new THREE.Color(...EDGE) }, uLean: { value: new THREE.Vector2(1, 0) },
      uStrength: { value: 0 }, uSeed: { value: 0 } },
    vertexShader: `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uCore, uEdge; uniform vec2 uLean; uniform float uStrength, uSeed; varying vec2 vP;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 q = vec2(dot(vP, uLean), dot(vP, vec2(-uLean.y, uLean.x)));          // along the lean (toward the hero), across it
        float ang = atan(q.y, q.x);
        float d = length(vec2(q.x / (q.x > 0.0 ? 1.0 : 0.72), q.y / 0.78))          // longer toward the hero, short behind
          * (1.0 + 0.16 * sin(3.0 * ang + uSeed) + 0.09 * sin(5.0 * ang + uSeed * 2.3));
        float k = pow(clamp(1.0 - d + 0.3 * (n(vP * 2.4) - 0.5) + 0.12 * (n(vP * 7.0) - 0.5), 0.0, 1.0), 1.3);
        k *= 0.7 + 0.3 * clamp(q.x, -1.0, 1.0);                                      // brighter on the hero's side
        float g = k * 0.55 * uStrength; if (g < 0.004) discard;
        gl_FragColor = vec4(mix(uEdge, uCore, clamp(1.0 - d, 0.0, 1.0)) * g, 1.0);
      }`,
    transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// sp(id): the sprite for an entity id (render/characters.js) or undefined
export function createTameFx({ scene }) {
  const live = [];
  function cast(c) { live.push({ time: 0, hero: c.a, wild: c.t, horse: c.horse, dir: c.dir, hx: c.x, hz: c.z, pool: null, axis: null }); }
  const holds = id => live.some(f => f.wild === id && f.time < HOLD);
  const off = s => { if (!s) return; const u = s.material.uniforms; u.uWipe.value.set(0, 0, 0, 0); u.uSweep.value.set(0, 0, 0, 0); };
  function setup(f, neu, hero) {
    const a = ((f.dir ?? 2) % 8 + 8) % 8 * Math.PI / 4;               // sprite row 0 S .. 7 SE (sim/geometry.js dirIndex)
    let r = -Math.sin(a) * BODY, u = -Math.cos(a) * BODY * SIN_E;                   // her head, on screen, from her middle
    if (Math.hypot(r, u) < 0.7) { r = 0; u = 0.9; }                                  // facing us or away: top to bottom
    f.head = new THREE.Vector3().addScaledVector(CAM_RIGHT, r).addScaledVector(CAM_UP, u);
    f.axis = f.head.clone().normalize().negate();                                    // the way the light travels
    const p = neu.pos, hx = hero ? hero.pos.x : f.hx, hz = hero ? hero.pos.z : f.hz;
    const lean = new THREE.Vector2(hx - p.x, hz - p.z); lean.lengthSq() > 1e-4 ? lean.normalize() : lean.set(1, 0);
    const mat = poolMaterial(), mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), mat);
    mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 2; mesh.frustumCulled = false;
    mesh.position.set(p.x + lean.x * 0.45, groundY(p.x, p.z) + 0.04, p.z + lean.y * 0.45);
    mat.uniforms.uLean.value.set(lean.x, -lean.y);                                  // plane x = world x, plane y = -world z after the turn
    mat.uniforms.uSeed.value = (f.wild * 7.31) % 6.28;
    scene.add(mesh); f.pool = mesh;
  }
  function update(dt, sp, show = true) {
    for (let i = live.length - 1; i >= 0; i--) {
      const f = live[i];
      f.time += dt;
      const neu = sp(f.horse), old = sp(f.wild);
      if (f.time >= END) { off(neu); if (f.pool) { scene.remove(f.pool); f.pool.geometry.dispose(); f.pool.material.dispose(); } live.splice(i, 1); continue; }
      if (!neu) { f.time = Math.min(f.time, 0.05); continue; }                       // the tamed horse's sprite comes next frame
      if (!f.axis) setup(f, neu, sp(f.hero));
      const t = f.time, centre = neu.pos.clone().add(new THREE.Vector3(0, MID, 0));
      const p = Math.min(1, Math.max(0, (t - 0.1) / 0.45));
      const at = centre.clone().addScaledVector(f.head, (1 - 2 * p) * 1.2);                 // starts past her nose, ends past her tail
      const k = 1 - sm((t - 0.45) / 0.45);
      for (const [s, side] of [[neu, -1], [old, 1]]) {
        if (!s) continue;
        const u = s.material.uniforms;
        u.uWipe.value.set(at.x, at.y, at.z, t < HOLD ? side * SOFT : 0);                // saddled behind the light, wild ahead of it; then all of her
        u.uWipeAxis.value.copy(f.axis);
        u.uSweep.value.set(CORE[0] * k, CORE[1] * k, CORE[2] * k, k > 0.01 ? BAND : 0);
      }
      f.pool.visible = show;
      f.pool.material.uniforms.uStrength.value = sm(t / 0.3) * (1 - sm((t - 0.45) / 0.5));
    }
  }
  function clear() { for (const f of live) if (f.pool) { scene.remove(f.pool); f.pool.geometry.dispose(); f.pool.material.dispose(); } live.length = 0; }
  return { cast, update, holds, clear };
}
