// Painted effects toolkit (2026-11-27): the shared base for every effect built from painted texture sheets
// (art/fx/*.png, white light on black, cut from the vfx sheets). Lifted from render/boss_fx.js so boss, hero and crew
// effects share one shader, one loader and one set of helpers. Purely visual.
// The painted-piece shader: a gradient map (dark body in the effect colour, hot core toward white), a noise warp that
// keeps it flowing, and a dissolve through noise that eats the thin parts first with a bright edge (never a flat fade).
// Ground marks use their own materials here: the shared sprite shader (render/shading.js) is never touched.
//   createPainted({ scene, texBase, pieces }) -> { ready, spr, set, U, onGround, aim, life3, run, later, decal, dim,
//     fling, kicks, sMark, placeMark, marker, lift, drop, glow, soft, now, update }
import * as THREE from 'three';
import { CAM_QUAT } from './iso.js';
import { onFxLayer } from './bloom.js';
import { createParticles } from './vfx.js';
import { groundY } from '../castle_height.js';

export const rand = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const seg = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a));
export const outc = k => 1 - Math.pow(1 - clamp(k), 3);
export const inq = k => clamp(k) ** 2;
export const outback = (k, s = 1.6) => { k = clamp(k) - 1; return 1 + (s + 1) * k * k * k + s * k * k; };
export const ramp = (age, life, fin = .12, fout = .4) => age < 0 || age > life ? 0 : clamp(age / life / fin) * clamp((1 - age / life) / fout);

// every piece cut from the sheets so far (art/fx/<name>.png)
export const PIECES = ['flame1', 'flame2', 'flame3', 'flame4', 'wisp1', 'wisp2', 'wisp3', 'wisp4', 'vortex1', 'vortex2', 'burst1', 'burst2', 'sparks1', 'bloom', 'ring_torn', 'motes',
  'ghostfire1', 'ghostfire2', 'ghostfire3', 'ghostfire4', 'sigil', ...Array.from({ length: 12 }, (_, i) => 'rune' + (i + 1)),
  'breath1', 'breath2', 'breath3', 'breath_wolf', 'smear1', 'smear2', 'smear3', 'smear4', 'slash1', 'slash2', 'slash3', 'slash4', 'heal_column', 'heal_lotus', 'heal_ring', 'heal_motes',
  'smoke1', 'smoke2', 'smoke3', 'smoke4', 'dust1', 'dust2', 'dust3', 'dust4', 'shock_ring', 'cracks', 'debris', 'scorch', 'gust1', 'gust2', 'gust3', 'gust4',
  'net_open', 'net_bundle', 'net_half', 'net_slack',
  'fireball1', 'fireball2', 'fireball3', 'splash_fire', 'bolt1', 'bolt2', 'bolt3', 'bolt_loop', 'ink1', 'ink2', 'brush', 'petals'];   // sheet F
export const FLAMES = ['flame1', 'flame2', 'flame3', 'flame4'], GHOST = ['ghostfire1', 'ghostfire2', 'ghostfire3', 'ghostfire4'], SMOKES = ['smoke1', 'smoke2', 'smoke3', 'smoke4'];
export const WISPS = ['wisp1', 'wisp2', 'wisp3', 'wisp4'], SLASHES = ['slash1', 'slash2', 'slash3', 'slash4'], SMEARS = ['smear1', 'smear2', 'smear3', 'smear4'];
export const BOLTS = ['bolt1', 'bolt2', 'bolt3', 'bolt_loop'], FIREBALLS = ['fireball1', 'fireball2', 'fireball3'], INKS = ['ink1', 'ink2'];
export const DUSTS = ['dust1', 'dust2', 'dust3', 'dust4'], GUSTS = ['gust1', 'gust2', 'gust3', 'gust4'], RUNES = Array.from({ length: 12 }, (_, i) => 'rune' + (i + 1));

export const NOISE = /* glsl */`
vec3 m289(vec3 x){return x-floor(x*(1./289.))*289.;} vec4 m289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 perm(vec4 x){return m289(((x*34.)+1.)*x);} vec4 tis(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
  vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=m289(i);
  vec4 p=perm(perm(perm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 nm=tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=nm.x;p1*=nm.y;p2*=nm.z;p3*=nm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float fbm(vec3 p){float f=0.,a=.5;for(int i=0;i<4;i++){f+=a*snoise(p);p*=2.03;a*=.5;}return f;}`;
const FX_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FX_FRAG = /* glsl */`
uniform sampler2D uMap; uniform vec3 uColor, uHot, uEdge; uniform float uAlpha, uErode, uFlow, uTime, uSeed, uKeep, uHotK;
varying vec2 vUv;
${NOISE}
void main(){
  vec2 uv = vUv;
  if (uFlow > 0.) uv += uFlow * .05 * vec2(fbm(vec3(uv * 2.4 + uSeed, uTime * .8)), fbm(vec3(uv * 2.4 - uSeed, uTime * .8 + 4.)));
  vec4 t = texture2D(uMap, uv);
  float n = fbm(vec3(vUv * 3.5 + uSeed, uSeed * .37)) * .5 + .5;
  float d = n * .75 + t.a * .35;
  float keep = uErode <= 0. ? 1. : smoothstep(uErode, uErode + .05, d);
  float edge = uErode <= 0. ? 0. : 1. - smoothstep(0., .06, abs(d - uErode - .025));
  vec3 col = uKeep > .5 ? t.rgb * uColor : mix(uColor * .62, uHot, smoothstep(.5, 1., t.r) * uHotK);
  col = mix(col, uEdge, clamp(edge * 1.4, 0., 1.) * step(.5, 1. - uKeep));
  float a = t.a * keep * uAlpha;
  if (a < .003) discard;
  gl_FragColor = vec4(col, min(a, 1.));
}`;
export const PLANE = new THREE.PlaneGeometry(1, 1);

// the ground decal (dims, char, stains): noise-edged patches, never a clean disc
const DECAL_VERT = 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const DECAL_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uAlpha, uFill, uMode, uErode, uSeed, uRag, uMottle;
varying vec2 vP;
${NOISE}
void main(){
  float r = length(vP);
  float n = fbm(vec3(vP * 2.4, uSeed)), n2 = fbm(vec3(vP * 5.5, uSeed + 7.));
  float rr = r + n * uRag;
  float shape = smoothstep(1.0, .9, rr);
  float f = uMode < .5 ? smoothstep(uFill + .06, uFill - .06, rr) : smoothstep(1. - uFill - .06, 1. - uFill + .06, rr);
  float v = clamp(.55 + n2 * .9 + (1. - r) * .3, 0., 1.);
  float keep = uErode <= 0. ? 1. : smoothstep(uErode, uErode + .05, v);
  float a = shape * f * keep * uAlpha * mix(1., clamp(.35 + 1.1 * (n2 + .5), 0., 1.4), uMottle);
  if (a < .004) discard;
  gl_FragColor = vec4(uColor, min(a, 1.));
}`;
export const DECAL_GEO = new THREE.PlaneGeometry(2, 2);

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
let SOFT = null;
export const softTex = () => SOFT ||= canvasTex(128, 128, g => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});

// one texture cache per base folder, so boss, hero and crew effects share the loaded pieces
const CACHE = new Map();
function loadPieces(texBase, names) {
  let c = CACHE.get(texBase); if (!c) { c = { TEX: {}, wait: new Map() }; CACHE.set(texBase, c); }
  const loader = new THREE.TextureLoader();
  return { TEX: c.TEX, ready: Promise.all(names.map(n => {
    if (!c.wait.has(n)) c.wait.set(n, loader.loadAsync(texBase + n + '.png').then(t => { t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; c.TEX[n] = t; }).catch(() => { c.TEX[n] = softTex(); }));
    return c.wait.get(n);
  })) };
}

export function createPainted({ scene, texBase = 'art/fx/', pieces = PIECES, glowMax = 1200, softMax = 1200 }) {
  const { TEX, ready } = loadPieces(texBase, pieces);
  const glow = createParticles(scene, { max: glowMax }), soft = createParticles(scene, { max: softMax, additive: false });
  const live = [], fxs = [], markers = new Map(), ticks = {};
  let time = 0;
  const gy = (x, z) => groundY(x, z);
  const IQ = CAM_QUAT.clone().invert();
  const lift = (o, order = 99800) => { o.renderOrder = order; o.frustumCulled = false; o.traverse?.(c => { c.renderOrder = order; c.frustumCulled = false; }); scene.add(o); return o; };
  const drop = o => { scene.remove(o); o.traverse?.(c => { c.geometry !== DECAL_GEO && c.geometry !== PLANE && c.geometry?.dispose?.(); c.material?.dispose?.(); }); };
  const run = (life, tick, done) => { const r = { age: 0, life, tick, done }; live.push(r); return r; };
  const later = (t, fn) => run(t, null, fn);
  const col3 = v => new THREE.Color(...v);
  const hotOf = c => c.map(v => v + (1 - v) * .5);

  // a painted piece. o: { color, hot, edge, add, ground, flow, keep, order, w, h, rot, hotK }. A camera card unless ground.
  function spr(name, size, o = {}) {
    const c = o.color || [1, 1, 1];
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: TEX[name] || softTex() }, uColor: { value: col3(c) }, uHot: { value: col3(o.hot || hotOf(c)) }, uEdge: { value: col3(o.edge || o.hot || hotOf(c)) },
        uAlpha: { value: 0 }, uErode: { value: 0 }, uFlow: { value: o.flow ?? 0 }, uTime: { value: 0 }, uSeed: { value: rand(0, 40) }, uKeep: { value: o.keep ? 1 : 0 }, uHotK: { value: o.hotK ?? 1 } },
      vertexShader: FX_VERT, fragmentShader: FX_FRAG, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const m = new THREE.Mesh(PLANE, mat);
    m.scale.set(size * (o.w || 1), size * (o.h || 1), 1);
    if (o.ground) { m.rotation.x = -Math.PI / 2; m.rotation.z = o.rot ?? rand(0, 6.283); } else { m.quaternion.copy(CAM_QUAT); if (o.rot) m.rotateZ(o.rot); }
    if (o.add) onFxLayer(m);
    fxs.push(m);
    return lift(m, o.order ?? (o.ground ? 4 : 99820));
  }
  const U = m => m.material.uniforms;
  const set = (m, a, e = 0) => { U(m).uAlpha.value = a; U(m).uErode.value = e; };
  const onGround = (m, x, z, h = .03) => m.position.set(x, h + gy(x, z), z);
  // turn a camera card so its +x runs along a world direction on screen; returns the screen length of that direction
  const aim = (m, dx, dy, dz) => { const s = new THREE.Vector3(dx, dy, dz).applyQuaternion(IQ); m.quaternion.copy(CAM_QUAT); m.rotateZ(Math.atan2(s.y, s.x)); return Math.hypot(s.x, s.y); };
  // the standard life of a painted piece: eases in, holds, then dissolves through noise
  const life3 = (k, a, fin = .12, out = .45) => [a * outc(k / fin), k < 1 - out ? 0 : inq((k - (1 - out)) / out) * 1.05];

  function decal(x, z, r, o = {}) {
    const m = new THREE.Mesh(DECAL_GEO, new THREE.ShaderMaterial({ uniforms: { uColor: { value: col3(o.color || [0, 0, 0]) }, uAlpha: { value: 0 }, uFill: { value: 1 }, uMode: { value: o.mode || 0 }, uErode: { value: 0 }, uSeed: { value: rand(0, 50) }, uRag: { value: o.rag ?? .08 }, uMottle: { value: o.mottle ?? 0 } }, vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG, transparent: true, depthTest: false, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rand(0, 6.28); onGround(m, x, z); m.scale.setScalar(r);
    return lift(m, o.order ?? 3);
  }
  function dim(x, z, r, secs, k = .16, color = [.03, .025, .02]) { const d = decal(x, z, r, { color, rag: .12 }); run(secs, t => { U(d).uAlpha.value = k * ramp(t, secs, .12, .45); }, () => drop(d)); return d; }
  // a painted piece flying along the ground or air, turned along its motion
  function fling(name, x, y, z, vx, vy, vz, { size = 1, life = .8, color = [.66, .53, .36], add = false, drag = 2.2, gravity = 0, alpha = .8, grow = 1.6, flow = .6, ground = false, hotK, turn = true } = {}) {
    const m = spr(name, size, { color, add, flow, ground, hotK: hotK ?? (add ? 1 : .35) }), p = new THREE.Vector3(x, y, z), v = new THREE.Vector3(vx, vy, vz);
    if (ground) m.rotation.z = Math.atan2(-vz, vx);
    run(life, (t, dt) => {
      v.y -= gravity * dt; v.multiplyScalar(Math.max(0, 1 - drag * dt)); p.addScaledVector(v, dt);
      m.position.copy(p); if (!ground && turn) aim(m, vx, vy * .3, vz);
      const k = t / life, [a, e] = life3(k, alpha, .1, .6); set(m, a, e); m.scale.setScalar(size * (1 + (grow - 1) * outc(k)));
    }, () => drop(m));
    return m;
  }
  // small fast streaks (dust or sparks): the painted smear, stretched along the motion
  function kicks(x, z, n, { speed = [3, 7], y = .15, vy = [.2, 1.2], life = [.25, .5], len = [.5, .9], w = .14, color = [.66, .53, .36], add = false, ang = null, spread = 6.283, gravity = 4, r0 = 0, inward = false, alpha = .85, drag = 2.5 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = ang === null ? rand(0, 6.283) : ang + rand(-spread / 2, spread / 2), v = rand(...speed), L = rand(...len), lf = rand(...life), sg = inward ? -1 : 1;
      const m = spr('smear2', 1, { color, add });
      const p = new THREE.Vector3(x + Math.cos(a) * r0, y, z + Math.sin(a) * r0), vel = new THREE.Vector3(Math.cos(a) * v * sg, rand(...vy), Math.sin(a) * v * sg);
      run(lf, (t, dt) => {
        vel.y -= gravity * dt; vel.multiplyScalar(Math.max(0, 1 - drag * dt)); p.addScaledVector(vel, dt); if (p.y < .05) { p.y = .05; vel.y = 0; }
        aim(m, vel.x, vel.y, vel.z); const sp = Math.min(1, vel.length() / v);
        m.position.copy(p); m.scale.set(Math.max(.05, L * (.35 + .65 * sp)), w * L * 2.2, 1); set(m, ramp(t, lf, .08, .5) * alpha);
      }, () => drop(m));
    }
  }
  // status mark under a unit: a small torn ring of light in the status colour, turning slowly
  const sMark = (color, r = .62) => spr('ring_torn', r * 2.2, { ground: true, color, add: true, order: 5 });
  const placeMark = (m, x, z, a, spin = .4) => { onGround(m, x, z, .04); m.rotation.z += spin / 60; set(m, a * .75); };
  // per-unit markers: call marker(id, kind) every frame while it lasts; m.k eases in, and out once it stops being called.
  // tick(kind, fn) registers fn(m, dt), which places the parts (m.parts) using m.k.
  function marker(id, kind) { let m = markers.get(id + ':' + kind); if (!m) { m = { kind, seen: 0, k: 0, t: rand(0, 1), parts: [] }; markers.set(id + ':' + kind, m); } m.seen = time; return m; }
  const tick = (kind, fn) => { ticks[kind] = fn; };

  function update(dt) {
    time += dt;
    for (let i = live.length - 1; i >= 0; i--) {
      const r = live[i]; r.age += dt;
      if (r.age >= r.life) { live.splice(i, 1); r.done?.(); continue; }
      if (r.tick?.(r.age, dt) === false) { live.splice(i, 1); r.done?.(); }
    }
    for (let i = fxs.length - 1; i >= 0; i--) { const m = fxs[i]; if (!m.parent) { fxs.splice(i, 1); continue; } m.material.uniforms.uTime.value = time; }
    for (const [key, m] of markers) {
      m.k += ((time - m.seen < .15 ? 1 : 0) - m.k) * (1 - Math.exp(-dt * (m.k < .5 ? 4 : 2.5)));
      ticks[m.kind]?.(m, dt);
      if (time - m.seen > 2 && m.k < .02) { m.parts.forEach(drop); markers.delete(key); }
    }
    glow.update(dt); soft.update(dt);
  }
  function clear() { for (const r of live.splice(0)) r.done?.(); for (const m of markers.values()) m.parts.forEach(drop); markers.clear(); }

  return { ready, TEX, gy, IQ, spr, set, U, onGround, aim, life3, run, later, decal, dim, fling, kicks, sMark, placeMark, marker, tick, lift, drop, glow, soft, now: () => time, update, clear };
}
