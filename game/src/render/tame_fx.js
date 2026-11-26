// Catching a wild horse (wildlife W6, Tim 2026-11-24): no rope and nothing thrown. A band of warm lantern light
// passes over her from head to tail; behind it she is the saddled horse, ahead of it still the wild one. A soft,
// uneven pool of the same light lies on the grass, leaning toward the hero. About a second, all see-through.
// Mock and critic rounds: project files war_build/wildlife/halter_swap/ (Tim picked best_anim_r4).
// Before it (Tim 2026-11-26, mock and critic rounds war_build/wildlife/catch_pole/): while the hero's catch runs
// (e.catchCast, sim/wild_animals.js catchHorse) he holds a plain bamboo pole to her neck (never a rope or loop) and a
// soft lantern glow builds round her; after the saddle, one soft glow says she is ready to ride.
// Sim: a 'horseCaught' cast { a: hero id, t: the wild horse's id (gone from the sim), horse: the tamed horse's id }
// (sim/wild_animals.js catchHorse). The wild horse's sprite is held on screen until the light has passed (holds()).
import * as THREE from 'three';
import { CAM_RIGHT, CAM_UP } from './iso.js';
import { groundY } from '../castle_height.js';

const END = 2.0, HOLD = 0.6, SWEEP_END = 1.0, READY = 1.45;   // seconds: whole effect, wild sprite kept, the light band, the ready glow's peak
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

// a soft lantern glow standing round her, uneven and flickering (additive, see-through)
function haloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(...CORE) }, uStrength: { value: 0 }, uTime: { value: 0 }, uSeed: { value: 0 } },
    vertexShader: `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uCol; uniform float uStrength, uTime, uSeed; varying vec2 vP;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float d = length(vP / vec2(1.0, 0.82));
        float k = pow(clamp(1.0 - d + 0.35 * (n(vP * 2.2 + vec2(uTime * 0.7, -uTime * 0.4)) - 0.5), 0.0, 1.0), 1.6);
        float g = k * uStrength * (0.85 + 0.15 * sin(uTime * 9.0 + uSeed)); if (g < 0.004) discard;
        gl_FragColor = vec4(uCol * g, 1.0);
      }`,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
// the catch pole: a thin bamboo staff, darker joints, a lit edge, tapering to a blunt tip
function poleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uAlpha: { value: 0.92 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uAlpha; varying vec2 vUv;
      void main() {
        float along = vUv.x, across = abs(vUv.y - 0.5) * 2.0;
        vec3 c = mix(vec3(0.38, 0.28, 0.16), vec3(0.24, 0.17, 0.1), smoothstep(0.2, 1.0, across));
        c = mix(c, vec3(0.6, 0.48, 0.3), (1.0 - smoothstep(0.0, 0.45, abs(vUv.y - 0.72))) * 0.6);   // lit upper edge
        float joint = 1.0 - smoothstep(0.0, 0.012, abs(fract(along * 5.5 + 0.3) - 0.5) - 0.48);
        c = mix(c, vec3(0.18, 0.12, 0.07), joint * 0.8);
        float a = uAlpha * (1.0 - smoothstep(0.75, 1.0, across)) * smoothstep(0.0, 0.03, along);
        if (a < 0.01) discard;
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true, depthTest: false, depthWrite: false,
  });
}
const W0 = 0.07, W1 = 0.04;                         // pole width at the hand and at the tip (world units)
const HAND_UP = 0.72, HAND_OUT = 0.18, RIDE_UP = 1.8, RIDE_OUT = 0.3,   // on foot; in the saddle (Tim 2026-11-26: most catches are from horseback)
      NECK_UP = 1.47, NECK_HEAD = 0.36;   // hand and neck points on the sprites, on screen from their feet
const PULL = 0.55, CATCH_COL = [226 / 255, 160 / 255, 92 / 255], READY_COL = [232 / 255, 182 / 255, 110 / 255];
function headOf(dir) {                               // her head on screen from her middle (as setup below)
  const a = ((dir ?? 2) % 8 + 8) % 8 * Math.PI / 4;
  let r = -Math.sin(a) * BODY, u = -Math.cos(a) * BODY * SIN_E;
  if (Math.hypot(r, u) < 0.7) { r = 0; u = 0.9; }
  return new THREE.Vector3().addScaledVector(CAM_RIGHT, r).addScaledVector(CAM_UP, u);
}

// sp(id): the sprite for an entity id (render/characters.js) or undefined
export function createTameFx({ scene }) {
  const live = [], catching = new Map();   // hero id -> { horse, pole, halo, pool, time }
  let clock = 0;
  function haloMesh(seed) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.4), haloMaterial());
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(CAM_RIGHT, CAM_UP, new THREE.Vector3().crossVectors(CAM_RIGHT, CAM_UP)));
    m.renderOrder = 3; m.frustumCulled = false; m.material.uniforms.uSeed.value = seed; scene.add(m); return m;
  }
  function poolMesh(seed) {
    const mat = poolMaterial(), m = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), mat);
    m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.frustumCulled = false; mat.uniforms.uSeed.value = seed; scene.add(m); return m;
  }
  function poleMesh() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]), 2));
    g.setIndex([0, 2, 1, 2, 3, 1]);
    const m = new THREE.Mesh(g, poleMaterial()); m.renderOrder = 4; m.frustumCulled = false; scene.add(m); return m;
  }
  const drop = m => { if (!m) return; scene.remove(m); m.geometry.dispose(); m.material.dispose(); };
  const glow = (s, col, k) => {                     // the whole sprite lit a little, most on her outline (render/shading.js uSweep)
    if (!s) return; const u = s.material.uniforms;
    u.uWipe.value.set(s.pos.x, s.pos.y, s.pos.z, 0); u.uSweep.value.set(col[0] * k, col[1] * k, col[2] * k, k > 0.005 ? 60 : 0);
  };
  function setPole(m, a, b) {
    const d = b.clone().sub(a), sx = d.dot(CAM_RIGHT), sy = d.dot(CAM_UP), l = Math.hypot(sx, sy) || 1;
    const n = new THREE.Vector3().addScaledVector(CAM_RIGHT, -sy / l).addScaledVector(CAM_UP, sx / l);
    const P = m.geometry.attributes.position, put = (i, p) => P.setXYZ(i, p.x, p.y, p.z);
    put(0, a.clone().addScaledVector(n, -W0)); put(1, a.clone().addScaledVector(n, W0));
    put(2, b.clone().addScaledVector(n, -W1)); put(3, b.clone().addScaledVector(n, W1));
    P.needsUpdate = true;
  }
  // a hero catching (e.catchCast): pole from his hands to her neck, her glow building over the cast
  function catchUpdate(dt, sp, show, state) {
    const now = new Set();
    for (const id of Object.keys(state?.catchCasts || {})) {
      const e = state.entities[id], k = e?.catchCast, hs = e && sp(e.id), she = k && state.entities[k.horse], ws = she && sp(she.id);   // ids by the entity's own (the map keys are not strings)
      if (!k || !hs || !ws || !she || e.place !== 'world') continue;
      now.add(id);
      let c = catching.get(id);
      if (!c) { c = { horse: k.horse, time: 0, pole: poleMesh(), halo: haloMesh((+k.horse || 1) * 3.1 % 6.28), pool: poolMesh((+k.horse || 1) * 7.31 % 6.28) }; catching.set(id, c); }
      c.time += dt;
      const len = Math.max(0.05, (k.until - k.start) / 20), p = Math.min(1, ((state.tick - k.start) / 20 + 0.05) / len);
      const g = (0.15 + 0.85 * p * p * (3 - 2 * p)) * Math.min(1, c.time / 0.25);
      const feet = ws.pos, head = headOf(she.dir), mid = feet.clone().addScaledVector(CAM_UP, MID);
      const toHer = Math.sign(feet.clone().sub(hs.pos).dot(CAM_RIGHT)) || 1;
      const hand = hs.pos.clone().addScaledVector(CAM_UP, hs.riding ? RIDE_UP : HAND_UP).addScaledVector(CAM_RIGHT, toHer * (hs.riding ? RIDE_OUT : HAND_OUT));
      const sway = 0.03 * Math.sin(c.time * 5.6);
      const neck = feet.clone().addScaledVector(CAM_UP, NECK_UP + sway).addScaledVector(head, NECK_HEAD);
      setPole(c.pole, hand, neck);
      c.pole.visible = c.halo.visible = c.pool.visible = show;
      glow(ws, CATCH_COL, PULL * g);
      c.halo.position.copy(mid); c.halo.material.uniforms.uStrength.value = 0.22 * g; c.halo.material.uniforms.uTime.value = clock;
      c.pool.position.set(feet.x, groundY(feet.x, feet.z) + 0.04, feet.z); c.pool.material.uniforms.uStrength.value = 0.55 * g;
    }
    for (const [id, c] of catching) {
      if (now.has(id)) continue;
      const s = sp(c.horse); if (s && !live.some(f => f.wild === c.horse)) off(s);
      drop(c.pole); drop(c.halo); drop(c.pool); catching.delete(id);
    }
  }
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
  function update(dt, sp, show = true, state = null) {
    clock += dt;
    catchUpdate(dt, sp, show, state);
    for (let i = live.length - 1; i >= 0; i--) {
      const f = live[i];
      f.time += dt;
      const neu = sp(f.horse), old = sp(f.wild);
      if (f.time >= END) { off(neu); drop(f.pool); drop(f.halo); live.splice(i, 1); continue; }
      if (!neu) { f.time = Math.min(f.time, 0.05); continue; }                       // the tamed horse's sprite comes next frame
      if (!f.axis) setup(f, neu, sp(f.hero));
      const t = f.time, centre = neu.pos.clone().add(new THREE.Vector3(0, MID, 0));
      if (t >= SWEEP_END) {                          // she is ready to ride: one soft lantern glow swells and fades
        const r = Math.exp(-(((t - READY) / 0.28) ** 2));
        if (old) off(old);
        glow(neu, READY_COL, 0.6 * r);
        f.halo ||= haloMesh((f.wild * 3.1) % 6.28);
        f.halo.position.copy(neu.pos).addScaledVector(CAM_UP, MID); f.halo.visible = show;
        f.halo.material.uniforms.uStrength.value = 0.26 * r; f.halo.material.uniforms.uTime.value = clock;
        f.halo.material.uniforms.uCol.value.setRGB(...READY_COL);
        f.pool.visible = show; f.pool.material.uniforms.uStrength.value = 0.6 * r;
        continue;
      }
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
  function clear() {
    for (const f of live) { drop(f.pool); drop(f.halo); } live.length = 0;
    for (const c of catching.values()) { drop(c.pole); drop(c.halo); drop(c.pool); } catching.clear();
  }
  return { cast, update, holds, clear };
}
