// Guarded place bosses (world variety P4, 2026-11-27): the ability effects and the boss mark. Purely visual; the sim
// (sim/boss_abilities.js) sends casts and view.js calls these.
// Round 7 (2026-11-27: "they all look like basic shapes not magic effects", "stop using basic circles and arcs"):
// every effect is built from painted texture pieces (art/fx/boss/*.png, cut from the painted sheets: spirit fire,
// wisps, vortices, bursts, sigils and runes, smoke, dust, shock rings, slashes, breath, heal light, the rope net). They
// are greyscale; the shader colours them per boss (a dark-to-hot gradient map), makes them flow (noise warp) and
// dissolves them through noise with a bright edge instead of fading. Magic flavour: Japanese spirit magic (ofuda sigils,
// ghost fire). Rules kept from the research (fx_research.md, fx_research2.md): wind-up, impact early, eased fall-off;
// nothing pops; visual weight follows gameplay weight; one status rule (a mark under the unit plus one shape over it).
// Ground marks use their own materials here: the shared sprite shader (render/shading.js) is never touched.
//   createBossFx({ scene, texBase }) -> {
//     ready (Promise: every texture loaded), boss(id, x, z, { color, size }) per frame: the boss mark,
//     keg(fromX, fromZ, x, z, { fuse, radius }), kegBlast(x, z, radius),
//     rear(x, z, { radius, windup }), slam(x, z, radius), stun(x, z, seconds, { head }),
//     howl(x, z, { radius, muzzle }), add(x, z, vx, vz), rage(id, x, z, k, { head, size, eyes }),
//     net(fromX, fromZ, x, z, { root, pinned }), shot(fromX, fromY, fromZ, x, y, z),
//     fireArrow(fromX, fromZ, x, z, { flight }), stormMark(x, z, { radius, seconds, hold }), storm(x, z, { radius, fromX, fromZ, arrows, seconds }),
//     flickerStart(x, z), flicker(fromX, fromZ, x, z, { side }), rally(x, z, { radius }), mend(id, x, z, { head }),
//     dust(x, z, { radius, seconds, vx, vz }), hooves(x, z, vx, vz), blind(id, x, z, { head }), bleed(id, x, z, { head }),
//     update(dt) }
// boss/rage/mend/blind/bleed are per-unit markers: call them every frame while it lasts; they ease out when not refreshed.
import * as THREE from 'three';
import { CAM_QUAT, CAM_UP, CAM_RIGHT } from './iso.js';
import { onFxLayer } from './bloom.js';
import { createParticles, SHAPE } from './vfx.js';
import { groundY } from '../castle_height.js';

// simplex noise + fbm (the same as render/rail_blast_fx.js, copied so that file is left alone)
const NOISE = /* glsl */`
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
const rand = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a));
const outc = k => 1 - Math.pow(1 - clamp(k), 3);
const inq = k => clamp(k) ** 2;
const outback = (k, s = 1.6) => { k = clamp(k) - 1; return 1 + (s + 1) * k * k * k + s * k * k; };
const ramp = (age, life, fin = .12, fout = .4) => age < 0 || age > life ? 0 : clamp(age / life / fin) * clamp((1 - age / life) / fout);

// ---- colours: one main hue per boss, muted, never pure black or white ---------------------------------------------------
const FIRE = [.95, .48, .16], EMBER = [.9, .42, .14], EARTH = [.6, .47, .32], FROST = [.6, .74, .92], RAGE = [.62, .1, .06];
const STEEL = [.62, .67, .78], INK = [.06, .05, .07], HEAL = [.5, .82, .48], SAND = [.66, .53, .36], SMOKE = [.3, .28, .27], BLOODC = [.42, .05, .04];
const DOTFIRE = [[1, .8, .48], [1, .56, .2], [.9, .34, .1]], DOTBLOOD = [[.36, .05, .04], [.28, .04, .03], [.42, .08, .05]];
const DOTSOOT = [[.2, .18, .17], [.26, .23, .21], [.32, .29, .26]];

// ---- painted pieces: the textures cut from the sheets --------------------------------------------------------------------
const PIECES = ['flame1', 'flame2', 'flame3', 'flame4', 'wisp1', 'wisp2', 'wisp3', 'wisp4', 'vortex1', 'vortex2', 'burst1', 'burst2', 'sparks1', 'bloom', 'ring_torn', 'motes',
  'ghostfire1', 'ghostfire2', 'ghostfire3', 'ghostfire4', 'sigil', ...Array.from({ length: 12 }, (_, i) => 'rune' + (i + 1)),
  'breath1', 'breath2', 'breath3', 'breath_wolf', 'smear1', 'smear2', 'smear3', 'smear4', 'heal_column', 'heal_lotus', 'heal_ring', 'heal_motes',
  'smoke1', 'smoke2', 'smoke3', 'smoke4', 'dust1', 'dust2', 'dust3', 'dust4', 'shock_ring', 'cracks', 'debris', 'scorch', 'gust1', 'gust2', 'gust3', 'gust4',
  'net_open', 'net_bundle', 'net_half', 'net_slack'];
const FLAMES = ['flame1', 'flame2', 'flame3', 'flame4'], GHOST = ['ghostfire1', 'ghostfire2', 'ghostfire3', 'ghostfire4'], SMOKES = ['smoke1', 'smoke2', 'smoke3', 'smoke4'];
const WISPS = ['wisp1', 'wisp2', 'wisp3', 'wisp4'];
const DUSTS = ['dust1', 'dust2', 'dust3', 'dust4'], GUSTS = ['gust1', 'gust2', 'gust3', 'gust4'], RUNES = Array.from({ length: 12 }, (_, i) => 'rune' + (i + 1));

// the painted-piece material: a gradient map (dark body in the boss colour, hot core toward white), a noise warp that
// keeps it flowing, and a dissolve through noise that eats the faint thin parts first, with a bright edge on the cut
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
const PLANE = new THREE.PlaneGeometry(1, 1);

// ---- the ground decal (dims, char, stains): noise-edged patches, never a clean disc ---------------------------------------
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
const DECAL_GEO = new THREE.PlaneGeometry(2, 2);

// ---- the few small canvas pieces left (soft pools, the blood drop) ----------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
const T = {};
const softTex = () => T.soft ||= canvasTex(128, 128, g => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const dropTex = () => T.drop ||= canvasTex(64, 96, g => {
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(40, 34, 56, 50, 56, 66); g.arc(32, 66, 24, 0, Math.PI); g.bezierCurveTo(8, 50, 24, 34, 32, 6); g.fill();
});

// ---- small shaded meshes (the keg, arrows, clods) -----------------------------------------------------------------------
const SUN = new THREE.Vector3(-.45, .75, .5).normalize();
function shaded(geo0, hex) {
  const geo = geo0.index ? geo0.toNonIndexed() : geo0; geo.computeVertexNormals();
  const n = geo.attributes.normal, base = new THREE.Color(hex), col = new Float32Array(n.count * 3), v = new THREE.Vector3();
  for (let f = 0; f < n.count; f += 3) {
    v.fromBufferAttribute(n, f); const k = (.45 + .75 * Math.max(0, v.dot(SUN))) * (.85 + Math.random() * .2);
    for (let j = 0; j < 3; j++) { col[(f + j) * 3] = base.r * k; col[(f + j) * 3 + 1] = base.g * k; col[(f + j) * 3 + 2] = base.b * k; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true }));
}
function kegMesh() {
  const g = new THREE.Group();
  g.add(shaded(new THREE.CylinderGeometry(.24, .24, .5, 12), 0x5a3c24));
  for (const y of [-.17, .17]) { const b = shaded(new THREE.CylinderGeometry(.255, .255, .05, 12), 0x2c2622); b.position.y = y; g.add(b); }
  const fuse = shaded(new THREE.CylinderGeometry(.02, .02, .18, 4), 0x2a241e); fuse.position.set(.06, .32, 0); fuse.rotation.z = -.4; g.add(fuse);
  return g;
}
function arrowMesh(len = .62) {
  const g = new THREE.Group();
  const shaft = shaded(new THREE.CylinderGeometry(.028, .028, len, 5), 0x7a5c3e); shaft.position.y = len / 2; g.add(shaft);
  const head = shaded(new THREE.ConeGeometry(.06, .16, 4), 0x3e3d3c); head.rotation.x = Math.PI; head.position.y = -.02; g.add(head);
  for (let i = 0; i < 3; i++) { const f = shaded(new THREE.PlaneGeometry(.13, .26), 0xc9bba2); f.material.side = THREE.DoubleSide; f.position.y = len - .12; f.rotation.y = i * 2.09; f.translateX(.045); g.add(f); }
  return g;
}

export function createBossFx({ scene, texBase = 'art/fx/boss/' }) {
  const loader = new THREE.TextureLoader(), TEX = {};
  const ready = Promise.all(PIECES.map(n => loader.loadAsync(texBase + n + '.png').then(t => { t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; TEX[n] = t; }).catch(() => { TEX[n] = softTex(); })));
  const glow = createParticles(scene, { max: 1200 }), soft = createParticles(scene, { max: 1200, additive: false });
  const live = [], fxs = [], markers = new Map(), pieces = [];
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
  const onGround = (m, x, z, lift = .03) => m.position.set(x, lift + gy(x, z), z);
  // turn a camera card so its +x runs along a world direction on screen
  const aim = (m, dx, dy, dz) => { const s = new THREE.Vector3(dx, dy, dz).applyQuaternion(IQ); m.quaternion.copy(CAM_QUAT); m.rotateZ(Math.atan2(s.y, s.x)); return Math.hypot(s.x, s.y); };
  // the standard life of a painted piece: eases in, holds, then dissolves through noise (never a flat fade)
  const life3 = (k, a, fin = .12, out = .45) => [a * outc(k / fin), k < 1 - out ? 0 : inq((k - (1 - out)) / out) * 1.05];

  function decal(x, z, r, o = {}) {
    const m = new THREE.Mesh(DECAL_GEO, new THREE.ShaderMaterial({ uniforms: { uColor: { value: col3(o.color || [0, 0, 0]) }, uAlpha: { value: 0 }, uFill: { value: 1 }, uMode: { value: o.mode || 0 }, uErode: { value: 0 }, uSeed: { value: rand(0, 50) }, uRag: { value: o.rag ?? .08 }, uMottle: { value: o.mottle ?? 0 } }, vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG, transparent: true, depthTest: false, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rand(0, 6.28); onGround(m, x, z); m.scale.setScalar(r);
    return lift(m, o.order ?? 3);
  }
  function dim(x, z, r, secs, k = .16) { const d = decal(x, z, r, { color: [.03, .025, .02], rag: .12 }); run(secs, t => { U(d).uAlpha.value = k * ramp(t, secs, .12, .45); }, () => drop(d)); }
  // a painted piece flying along the ground or air, turned along its motion (dust thrown out, wind gusts, sparks)
  function fling(name, x, y, z, vx, vy, vz, { size = 1, life = .8, color = SAND, add = false, drag = 2.2, gravity = 0, alpha = .8, grow = 1.6, flow = .6, ground = false } = {}) {
    const m = spr(name, size, { color, add, flow, ground, hotK: add ? 1 : .35 }), p = new THREE.Vector3(x, y, z), v = new THREE.Vector3(vx, vy, vz);
    if (ground) m.rotation.z = Math.atan2(-vz, vx);
    run(life, (t, dt) => {
      v.y -= gravity * dt; v.multiplyScalar(Math.max(0, 1 - drag * dt)); p.addScaledVector(v, dt);
      m.position.copy(p); if (!ground) aim(m, vx, vy * .3, vz);
      const k = t / life, [a, e] = life3(k, alpha, .1, .6); set(m, a, e); m.scale.setScalar(size * (1 + (grow - 1) * outc(k)));
    }, () => drop(m));
    return m;
  }
  // small fast streaks of dust or sparks (secondary layer): the painted dash smear, stretched along the motion
  function kicks(x, z, n, { speed = [3, 7], y = .15, vy = [.2, 1.2], life = [.25, .5], len = [.5, .9], w = .14, color = SAND, add = false, ang = null, spread = 6.283, gravity = 4, r0 = 0, inward = false, alpha = .85, drag = 2.5 } = {}) {
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

  // =====================================================================================================================
  // THE BOSS MARK ("glowing runes or something so they dont just look like a regular enemy"): a talisman sigil
  // turning slowly under his feet in his colour, breathing, and runes that lift off his body, drift up and burn away.
  function boss(id, x, z, { color = [.85, .45, .2], size = 1 } = {}) {
    const m = marker(id, 'boss'); m.x = x; m.z = z; m.size = size; m.color = color;
    if (!m.parts.length) { m.parts.push(spr('sigil', 2.6 * size, { ground: true, color, add: true, order: 5, flow: .15 })); m.next = 0; }
  }
  function tickBoss(m, dt) {
    m.t += dt;
    const sg = m.parts[0];
    onGround(sg, m.x, m.z, .04); sg.rotation.z += dt * .18; set(sg, m.k * (.42 + .1 * Math.sin(m.t * 1.3)));
    sg.scale.setScalar(2.6 * m.size * (1 + .02 * Math.sin(m.t * 1.3)));
    if (m.k > .5 && m.t > m.next) {
      m.next = m.t + rand(.45, .8);
      const r = spr(pick(RUNES), .32 * m.size, { color: m.color, add: true, flow: .3 });
      const p = new THREE.Vector3(m.x + rand(-.35, .35) * m.size, rand(.5, 1.5) * m.size, m.z + rand(-.25, .25) * m.size), sway = rand(0, 6), L = rand(1.6, 2.2);
      run(L, (t) => { const k = t / L, [a, e] = life3(k, .85, .15, .5); r.position.copy(p).add(new THREE.Vector3(Math.sin(sway + t * 2) * .08, t * .45, 0)); set(r, a, e); }, () => drop(r));
    }
  }

  // =====================================================================================================================
  // 1. POWDER KEG. The keg tumbles over and lands; a torn ring of embers marks the blast edge, and the fuse is a ring of
  // painted flames that closes in from the edge to the keg (the timer), the ground charring behind it; the keg flares.
  // kegBlast(): a burst flash, a fireball of painted flame tongues, smoke clouds that rise and part, a painted shock ring of
  // churned earth out to the radius, dust thrown out, clods, a scorch that dissolves away.
  function keg(fromX, fromZ, x, z, { fuse = 1.5, radius = 5, flight = .45 } = {}) {
    const k = lift(kegMesh(), 99805), shadow = lift(new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: softTex(), color: 0x0f0c0a, transparent: true, opacity: 0, depthTest: false, depthWrite: false })), 4);
    shadow.rotation.x = -Math.PI / 2; k.scale.setScalar(1.6);
    const edge = spr('ring_torn', radius * 2.25, { ground: true, color: EMBER, hotK: .45, add: true, order: 5, flow: .3 });
    const char = decal(x, z, radius, { color: [.12, .07, .04], mode: 1, rag: .05, mottle: .7 });
    const front = Array.from({ length: 26 }, (_, i) => ({ m: spr(pick(FLAMES), .7, { color: FIRE, add: true, flow: 1.2 }), a: i / 26 * 6.283 + rand(-.08, .08), s: rand(.7, 1.15), ph: rand(0, 6) }));
    const flare = spr('burst2', 1.4, { color: FIRE, add: true });
    dim(x, z, radius * 1.35, fuse - flight + 1.6, .16);
    let landed = false;
    run(fuse, (t, dt) => {
      const u = seg(t, 0, flight);
      if (u < 1) {
        const px = fromX + (x - fromX) * u, pz = fromZ + (z - fromZ) * u, h = 1.6 + 3.2 * 4 * u * (1 - u) - 1.4 * u;
        k.position.set(px, h + gy(px, pz), pz); k.rotation.set(u * 7, 0, u * 5);
        onGround(shadow, px, pz, .02); shadow.material.opacity = .25 + .35 * u; shadow.scale.setScalar(.7 + .4 * u);
        if (Math.random() < dt * 40) glow.emit({ x: k.position.x, y: k.position.y + .45, z: k.position.z, vx: rand(-1, 1), vz: rand(-1, 1), vy: rand(.5, 2), gravity: 6, drag: 2, life: rand(.1, .3), size: rand(.05, .1), color: pick(DOTFIRE), shape: SHAPE.ember });
        return;
      }
      const a = t - flight, f = clamp(a / Math.max(.01, fuse - flight)), fi = inq(f);
      if (!landed) { landed = true; kicks(x, z, 10, { speed: [2, 4], len: [.35, .6], vy: [.2, .8], life: [.3, .5] }); }
      const bump = Math.max(0, Math.sin(Math.min(1, a / .22) * Math.PI)) * .35 * (1 - a / .22);
      k.position.set(x, .4 + bump + gy(x, z), z); k.rotation.set(0, 0, Math.PI / 2 * .9 * outc(a / .2));
      const grow = .6 + .4 * outback(seg(a, 0, .25), 1.2), r = radius * grow * (1 - fi);
      onGround(edge, x, z, .045); edge.scale.setScalar(radius * 2.25 * grow); edge.rotation.z += dt * .25; set(edge, outc(seg(a, 0, .22)) * (.4 + .15 * Math.sin(time * (6 + 20 * f))));
      U(char).uAlpha.value = .45 * outc(seg(a, 0, .3)); U(char).uFill.value = fi;
      for (const q of front) {   // the fuse: a ring of flame tongues closing in, crowding as it shrinks
        const qa = q.a + time * .3, fl = .75 + .25 * Math.sin(time * 19 + q.ph);
        q.m.position.set(x + Math.cos(qa) * r, .32 * q.s + gy(x, z), z + Math.sin(qa) * r);
        q.m.scale.setScalar(.62 * q.s * (1 - .35 * fi) * fl); set(q.m, outc(seg(a, 0, .25)) * .7 * fl);
      }
      if (Math.random() < dt * 60) { const qa = rand(0, 6.283); glow.emit({ x: x + Math.cos(qa) * r, y: .1, z: z + Math.sin(qa) * r, vx: rand(-.6, .6), vz: rand(-.6, .6), vy: rand(.6, 2), gravity: 5, drag: 2, life: rand(.15, .35), size: rand(.05, .1), color: pick(DOTFIRE), shape: SHAPE.ember }); }
      const fl = seg(t, fuse - .12, fuse); flare.position.set(x, .7, z); set(flare, .95 * fl * fl); flare.scale.setScalar(.8 + 1.4 * fl);
    }, () => { drop(k); drop(shadow); drop(flare); front.forEach(q => drop(q.m)); drop(char);
      run(.15, t => set(edge, 1 - t / .15), () => drop(edge)); });
  }
  function kegBlast(x, z, radius = 5) {
    const fl = spr('burst1', 4.2, { color: FIRE, add: true }); fl.position.set(x, 1.1, z);
    run(.14, t => { set(fl, .6 * (1 - inq(t / .14))); fl.scale.setScalar(4.2 * (1 + .4 * t / .14)); }, () => drop(fl));
    const pool = spr('burst2', radius * 2.4, { ground: true, color: FIRE, add: true, order: 6 }); onGround(pool, x, z);
    run(.4, t => set(pool, .45 * (1 - outc(t / .4))), () => drop(pool));
    for (let i = 0; i < 4; i++) {   // the fireball: painted flame tongues, lifting and burning away fast
      const nb = i < 2, m = spr(pick([...FLAMES, 'ghostfire4']), rand(2.2, 3), nb ? { color: [.75, .3, .08], hot: [1, .78, .4], flow: 1.5 } : { color: FIRE, hotK: .5, add: true, flow: 1.5 }), ox = rand(-.6, .6), oz = rand(-.6, .6), L = rand(.5, .75);
      run(L, t => { const k = t / L, [a, e] = life3(k, nb ? .85 : .4, .1, .6); m.position.set(x + ox, .9 + 1.2 * outc(k), z + oz); set(m, a, e); m.scale.setScalar(rand(2.4, 2.6) * (1 + .3 * outc(k))); }, () => drop(m));
    }
    for (let i = 0; i < 6; i++) {   // smoke clouds: painted, grey, rising and parting
      const an = i / 6 * 6.283 + rand(-.3, .3), d = rand(1.4, 2.6), L = rand(2.2, 3), sz = rand(1.8, 2.6), m = spr(pick(SMOKES), sz, { color: SMOKE, hot: [.5, .47, .44], flow: .8 });
      run(L + .15, t => { const k = seg(t, .15, .15 + L), [a, e] = life3(k, .75, .12, .55); m.position.set(x + Math.cos(an) * d * outc(k * 1.4), .9 + 2.6 * outc(k) + i * .12, z + Math.sin(an) * d * outc(k * 1.4)); set(m, a, e); m.scale.setScalar(sz * (1 + .5 * outc(k))); }, () => drop(m));
    }
    shockRing(x, z, radius, EARTH, .3);
    for (let i = 0; i < 9; i++) { const an = i / 9 * 6.283 + rand(-.2, .2), v = radius * rand(2, 2.6); fling(pick(SMOKES), x + Math.cos(an) * .8, .3, z + Math.sin(an) * .8, Math.cos(an) * v, .4, Math.sin(an) * v, { size: rand(1.2, 1.7), life: rand(.7, 1), color: [.5, .41, .3], drag: 3.2, alpha: .55 }); }
    debris(x, z, 16, 1);
    for (let i = 0; i < 30; i++) { const a = rand(0, 6.283), v = rand(2, 8); glow.emit({ x, y: .4, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(2, 7), gravity: 9, drag: 1.3, life: rand(.4, 1.1), size: rand(.05, .11), color: pick(DOTFIRE), shape: SHAPE.ember }); }
    const sc = spr('scorch', radius * 1.7, { ground: true, color: [.16, .11, .08], hot: [.3, .2, .12], order: 4 }); onGround(sc, x, z);
    run(5.5, t => { const k = t / 5.5; set(sc, .8 * outc(t / .15), seg(t, 1.4, 5.5) ** 1.2 * 1.05); }, () => drop(sc));
  }
  // the painted shock ring of churned earth: out to the radius in `secs` (the damage edge), then it dissolves
  function shockRing(x, z, radius, color, secs = .3, { alpha = .9, extra = 1 } = {}) {
    const m = spr('shock_ring', 1, { ground: true, color, hotK: .35, order: 5, flow: .2 }); onGround(m, x, z, .05);
    const L = secs + .9;
    run(L, t => { const w = outc(t / secs); m.scale.setScalar(radius * 2.3 * (.15 + .85 * w + .05 * seg(t, secs, L)) * extra); set(m, alpha * outc(t / .05), seg(t, secs * .8, L) ** 1.1 * 1.05); }, () => drop(m));
    const g = spr('ring_torn', 1, { ground: true, color: hotOf(color), hotK: .4, add: true, order: 6 }); onGround(g, x, z, .06);
    run(secs + .25, t => { const w = outc(t / secs); g.scale.setScalar(radius * 2.2 * (.15 + .85 * w)); set(g, .35 * (1 - inq(seg(t, secs * .5, secs + .25)))); }, () => drop(g));
  }
  function debris(x, z, n, power) {
    for (let i = 0; i < n; i++) {
      const m = lift(shaded(new THREE.DodecahedronGeometry(rand(.04, .11) * (i % 4 ? 1 : 1.6)), pick([0x6a5640, 0x5a4a38, 0x8a8276, 0x75695a])), 99806);
      const a = rand(0, 6.283), v = rand(2, 7) * power; m.position.set(x, .3, z);
      pieces.push({ m, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(3, 9) * Math.sqrt(power), spin: [rand(-10, 10), rand(-10, 10)], bounced: 0, age: 0, life: rand(2.5, 4) });
    }
  }

  // =====================================================================================================================
  // 2. BEAR SLAM. The wind-up: a torn earth-gold ring at the real radius, pulsing faster, and painted cracks spreading
  // through the ground inside it as he rears (the timer: they reach the rim on the hit). slam(): a burst flash on the ground,
  // the painted shock ring and a ring of dust clouds thrown out to the rim, heavy and low, the cracks left to dissolve.
  // stun(): a turning vortex of gold light over the head and a torn ring under the feet.
  function rear(x, z, { radius = 7, windup = 1.5 } = {}) {
    const edge = spr('ring_torn', radius * 2.25, { ground: true, color: [.82, .62, .36], hotK: .4, add: true, order: 5, flow: .3 });
    const cr = spr('cracks', radius * 2.1, { ground: true, color: [.75, .45, .18], hot: [1, .8, .45], hotK: .4, add: true, order: 5, flow: .2 }); onGround(cr, x, z);
    dim(x, z, radius * 1.35, windup + 1.6, .16);
    run(windup, (t, dt) => {
      const k = t / windup, grow = .6 + .4 * outback(seg(t, 0, .25), 1.2);
      onGround(edge, x, z, .045); edge.scale.setScalar(radius * 2.25 * grow); edge.rotation.z += dt * .2;
      set(edge, outc(seg(t, 0, .22)) * (.12 + .1 * Math.sin(time * (5 + 24 * k)) ** 2));
      set(cr, .15 + .25 * k, 1.02 - outc(k) * .95);   // the cracks open out as the weight comes over
      if (Math.random() < dt * 8) kicks(x + rand(-1, 1), z + rand(-1, 1), 1, { speed: [.6, 1.4], len: [.3, .45], vy: [.1, .4], life: [.3, .5] });
    }, () => { run(.25, t => set(edge, 1 - t / .25), () => drop(edge)); run(3, t => set(cr, .55 * (1 - outc(seg(t, .2, 1.4))), .07 + seg(t, .6, 3) ** 1.2), () => drop(cr)); });
  }
  function slam(x, z, radius = 7) {
    const fl = spr('burst2', radius * 2.2, { ground: true, color: [.75, .62, .42], add: true, order: 6 }); onGround(fl, x, z);
    run(.14, t => set(fl, .3 * (1 - t / .14)), () => drop(fl));
    shockRing(x, z, radius, [.5, .4, .28], .3, { alpha: .75 });
    for (let i = 0; i < 14; i++) { const an = i / 14 * 6.283 + rand(-.15, .15), v = radius * rand(2.3, 2.9); fling(pick(SMOKES), x + Math.cos(an) * 1, .35, z + Math.sin(an) * 1, Math.cos(an) * v, .3, Math.sin(an) * v, { size: rand(1.6, 2.2), life: rand(.9, 1.3), color: [.5, .41, .3], drag: 3, grow: 1.8, alpha: .55 }); }
    for (let i = 0; i < 5; i++) { const m = spr(pick(SMOKES), rand(1.8, 2.4), { color: [.5, .43, .34], flow: .6 }), an = rand(0, 6.283), d = rand(.5, 1.6), L = rand(1.6, 2.2);
      run(L, t => { const k = t / L, [a, e] = life3(k, .6, .1, .6); m.position.set(x + Math.cos(an) * d * (1 + outc(k)), .6 + .8 * outc(k), z + Math.sin(an) * d * (1 + outc(k))); set(m, a, e); }, () => drop(m)); }
    const db = spr('debris', 4.2, { ground: true, color: [.4, .32, .24], order: 5 }); onGround(db, x, z);
    run(1.6, t => { set(db, .9 * outc(t / .06), seg(t, .4, 1.6) * 1.05); db.scale.setScalar(4.2 * (1 + .6 * outc(t / .3))); }, () => drop(db));
    debris(x, z, 20, 1.25);
  }
  function stun(x, z, seconds = 1.5, { head = 2.05 } = {}) {
    const col = [.88, .7, .36], v = spr('vortex1', .85, { color: col, add: true, flow: .4 }), mk = sMark(col);
    kicks(x, z, 5, { speed: [1.5, 3], len: [.3, .5], vy: [.1, .5], life: [.25, .4] });
    run(seconds, (t, dt) => {
      const a = ramp(t, seconds, .1, .2);
      v.position.set(x, head, z); v.quaternion.copy(CAM_QUAT); v.rotateZ(-t * 5); v.scale.set(.85, .42, 1); set(v, .95 * a);   // seen at a slant: a halo of turning light
      placeMark(mk, x, z, a);
    }, () => { drop(v); drop(mk); });
  }

  // =====================================================================================================================
  // 3. PACK HOWL. A spectral wolf's head of cold breath rises off the muzzle and howls up and away, with plumes of breath;
  // painted gusts of wind run out over the snow to the pack. add(): snow dust thrown behind a joining wolf. rage(): red-
  // black ghost fire licking up off each enraged wolf, red eye glints, a torn red ring under it.
  function howl(x, z, { radius = 9, muzzle = [0, 1.4, 0] } = {}) {
    const mx = x + muzzle[0], my = muzzle[1], mz = z + muzzle[2];
    later(.05, () => { const m = spr('breath_wolf', 2.4, { color: [.42, .56, .8], hot: [.85, .92, 1], hotK: .7, flow: .8 }), L = 1.8;
      run(L, t => { const k = t / L, [a, e] = life3(k, .8, .15, .55); m.position.set(mx, my + .9 + 1.2 * outc(k), mz).addScaledVector(CAM_RIGHT, -.2 * k); m.scale.setScalar(2.4 * (.75 + .45 * outc(k))); set(m, a, e); }, () => drop(m)); });
    for (let i = 0; i < 3; i++) later(.1 + i * .22, () => { const m = spr(pick(['breath1', 'breath2', 'breath3']), 1.5, { color: [.5, .62, .82], hotK: .5, flow: 1, rot: rand(-.3, .3) }), L = 1.3;
      run(L, t => { const k = t / L, [a, e] = life3(k, .35, .15, .6); m.position.set(mx, my + .4 + .9 * outc(k), mz); m.scale.setScalar(1.5 * (.7 + .6 * outc(k))); set(m, a, e); }, () => drop(m)); });
    for (let i = 0; i < 7; i++) later(.15 + (i % 3) * .14, () => {   // spirit wisps snaking out over the snow to call the pack
      const an = i / 7 * 6.283 + rand(-.2, .2), m = spr(pick(WISPS), 1, { ground: true, color: FROST, hot: [.8, .9, 1], add: true, order: 5, rot: -an - Math.PI / 2, flow: 1.6 }), L = 1.4;
      run(L, t => { const k = t / L, d = radius * (.12 + .7 * outc(k)), [a, e] = life3(k, .55, .12, .6); onGround(m, x + Math.cos(an) * d, z + Math.sin(an) * d, .05); m.scale.set(1.1, 2.2 + 1.6 * k, 1); set(m, a, e); }, () => drop(m));
    });
  }
  function add(x, z, vx = 0, vz = 0, n = 2) {
    const ang = Math.hypot(vx, vz) > .1 ? Math.atan2(-vz, -vx) : rand(0, 6.283);
    for (let i = 0; i < Math.min(n, 2); i++) { const a = ang + rand(-.6, .6), v = rand(1.5, 3); fling(pick(SMOKES), x, .2, z, Math.cos(a) * v, .3, Math.sin(a) * v, { size: rand(.6, .9), life: rand(.5, .8), color: [.8, .84, .9], drag: 3, alpha: .6 }); }
  }
  function marker(id, kind) { let m = markers.get(id + kind); if (!m) { m = { kind, seen: 0, k: 0, t: rand(0, 1), parts: [] }; markers.set(id + kind, m); } m.seen = time; return m; }
  function rage(id, x, z, k = 1, { head = [.55, .85, 0], size = 1, eyes = true } = {}) {
    const m = marker(id, 'rage'); m.x = x; m.z = z; m.head = head; m.size = size; m.eyes = eyes;
    if (!m.parts.length) {
      m.parts.push(spr(pick(GHOST), 1.6 * size, { color: [.3, .04, .03], hot: [.5, .1, .06], flow: 1.4, order: 6 }));   // behind the body: under the units
      m.parts.push(spr(pick(GHOST), .7 * size, { color: RAGE, hot: [.95, .35, .2], add: true, flow: 1.6 }));
      m.parts.push(sMark(RAGE, .7 * size));
      for (const s of [0, 1]) m.parts.push(spr('burst2', .3, { color: [1, .35, .2], add: true }));
    }
  }
  function tickRage(m, dt) {
    m.t += dt;
    const beat = .5 + .5 * Math.sin(m.t * 2 * Math.PI * 2), [back, front, mk, e1, e2] = m.parts;
    back.position.set(m.x, .8 * m.size, m.z); set(back, m.k * (.6 + .2 * beat)); back.scale.set(1.6 * m.size, 1.6 * m.size * (.92 + .16 * beat), 1);
    front.position.set(m.x, 1.05 * m.size, m.z).addScaledVector(CAM_UP, .15); set(front, m.k * (.18 + .12 * beat)); front.scale.set(.7 * m.size, .8 * m.size * (.9 + .2 * beat), 1);
    placeMark(mk, m.x, m.z, m.k * (.8 + .2 * beat), .8);
    [e1, e2].forEach((e, i) => { e.position.set(m.x + m.head[0] + (i ? .07 : -.07), m.head[1] + .04, m.z + m.head[2]); set(e, m.eyes ? m.k * (.7 + .3 * beat) : 0); });
  }

  // =====================================================================================================================
  // 4. NET AND SHOT. The painted rope net leaves his hand as a twisted bundle, opens as it spins through the air, lands
  // spread over the target and cinches; while it pins, a tan torn ring burns under every netted man; at the end it falls
  // slack and dissolves. shot(): a burst muzzle flash and flame, a smear tracer, a burst and sparks at the hit, smoke.
  function net(fromX, fromZ, x, z, { root = 2.5, flight = .35, size = 2.1, pinned = [] } = {}) {
    const RC = [1.75, 1.6, 1.35], bundle = spr('net_bundle', .9, { keep: true, color: RC }), half = spr('net_half', 1.6, { keep: true, color: RC });
    const open = spr('net_open', size * 2.5, { ground: true, keep: true, color: RC, order: 99806 }), slack = spr('net_slack', size * 2.1, { ground: true, keep: true, color: RC, order: 99806 });
    const shade = lift(new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: softTex(), color: 0x0d0b09, transparent: true, opacity: 0, depthTest: false, depthWrite: false })), 4); shade.rotation.x = -Math.PI / 2;
    const ROPE = [.86, .66, .38], marks = [];   // the net itself shows who is pinned
    run(flight + root + 1, (t, dt) => {
      const u = seg(t, 0, flight);
      if (u < 1) {
        const px = fromX + (x - fromX) * u, pz = fromZ + (z - fromZ) * u, h = 1.5 + 1.6 * 4 * u * (1 - u) + .4 * u, op = seg(u, .25, .7);
        for (const m of [bundle, half]) { m.position.set(px, h, pz); m.quaternion.copy(CAM_QUAT); m.rotateZ(t * 9); }
        set(bundle, 1 - op); set(half, op * (1 - seg(u, .8, 1))); half.scale.setScalar(1.2 + 2.2 * op);
        set(open, seg(u, .75, 1)); onGround(open, px * (1 - seg(u, .75, 1)) + x * seg(u, .75, 1), pz * (1 - seg(u, .75, 1)) + z * seg(u, .75, 1), .4 * (1 - seg(u, .75, 1)) + .06); open.scale.setScalar(size * 2.5 * (.6 + .4 * seg(u, .75, 1)));
        onGround(shade, px, pz, .02); shade.scale.setScalar(size * 2 * (.4 + .6 * u)); shade.material.opacity = .25 * u;
        return;
      }
      set(bundle, 0); set(half, 0);
      const a = t - flight, cinch = 1 + .14 * (1 - outc(seg(a, 0, .12))) - .08 * Math.sin(Math.PI * seg(a, .12, .34));
      const strain = a < root ? (.02 * Math.sin(a * 17) + .03 * Math.max(0, Math.sin(a * 5.3)) ** 8) : 0, rel = seg(a, root, root + .35);
      onGround(open, x, z, .06); open.scale.set(size * 2.5 * (cinch + strain), size * 2.5 * (cinch - strain), 1); set(open, 1 - rel);
      onGround(slack, x, z, .05); slack.scale.setScalar(size * 2.1 * (1 + .1 * rel)); set(slack, rel * .95, seg(a, root + .4, root + 1) * 1.05);
      shade.material.opacity = .3 * (1 - rel);
      if (a < dt * 1.5) kicks(x, z, 12, { speed: [1.5, 3], len: [.35, .55], vy: [.1, .4], life: [.3, .45], r0: size * .9 });
      const pa = seg(a, .15, .35) * (1 - rel);
      for (const q of marks) placeMark(q.m, q.px, q.pz, pa * (.85 + .15 * Math.sin(a * 9)), .6);
    }, () => { [bundle, half, open, slack, shade].forEach(drop); marks.forEach(q => drop(q.m)); });
  }
  function shot(fromX, fromY, fromZ, x, y, z) {
    const dx = x - fromX, dy = y - fromY, dz = z - fromZ, L = Math.hypot(dx, dy, dz);
    const mx = fromX + dx / L * .35, my = fromY + dy / L * .35, mz = fromZ + dz / L * .35;
    const mf = spr('burst2', 1.1, { color: [1, .7, .4], add: true }); mf.position.set(mx, my, mz);
    const tongue = spr('flame3', .9, { color: [1, .62, .3], add: true }); tongue.position.set(mx + dx / L * .35, my + dy / L * .35, mz + dz / L * .35); aim(tongue, dx, dy, dz); tongue.rotateZ(-Math.PI / 2);
    run(.15, t => { const k = t / .15; set(mf, 1 - outc(k)); set(tongue, 1 - inq(k)); mf.scale.setScalar(1.1 * (1 + .4 * k)); }, () => { drop(mf); drop(tongue); });
    const tr = spr('smear1', 1, { color: [1, .78, .5], add: true }); const sl = aim(tr, dx, dy, dz);
    run(.1, t => { const k = t / .1, h = clamp(.3 + k * .9); tr.position.set(fromX + dx * h * .55, fromY + dy * h * .55, fromZ + dz * h * .55); tr.scale.set(Math.min(sl * .8, 4.5), .3, 1); set(tr, .95 * (1 - seg(k, .6, 1))); }, () => drop(tr));
    later(.05, () => {
      const hb = spr('burst1', 1.2, { color: [1, .72, .45], add: true, rot: rand(0, 1) }); hb.position.set(x, y, z);
      run(.14, t => { set(hb, 1 - outc(t / .14)); hb.scale.setScalar(1.2 * (1 + .5 * t / .14)); }, () => drop(hb));
      const sp = spr('sparks1', 1.1, { color: [1, .7, .4], add: true }); sp.position.set(x, y, z); aim(sp, dx, 0, dz);
      run(.25, t => { const k = t / .25, [a, e] = life3(k, .9, .1, .6); set(sp, a, e); sp.position.set(x + dx / L * .4 * k, y, z + dz / L * .4 * k); }, () => drop(sp));
      for (let i = 0; i < 4; i++) soft.emit({ x, y, z, vx: dx / L * rand(1, 2.5) + rand(-.4, .4), vz: dz / L * rand(1, 2.5) + rand(-.4, .4), vy: rand(.3, 1.2), gravity: 7, drag: 1.5, life: rand(.35, .6), size: rand(.08, .14), alpha: .9, color: pick(DOTBLOOD), shape: SHAPE.dot });
    });
    const sm = spr(pick(SMOKES), .8, { color: [.6, .58, .55], flow: .8 });
    run(1.1, t => { const k = t / 1.1, [a, e] = life3(k, .5, .1, .6); sm.position.set(mx + dx / L * .4 * outc(k), my + .4 * outc(k), mz + dz / L * .4 * outc(k)); sm.scale.setScalar(.8 * (1 + .9 * outc(k))); set(sm, a, e); }, () => drop(sm));
  }

  // =====================================================================================================================
  // 5. FIRE ARROW AND ARROW STORM. The fire arrow climbs wrapped in painted spirit fire with a smear of embers behind it,
  // turns over and drops into the middle, and burns there. stormMark(): a torn ring of embers at the radius, the scorch
  // spreading out from the arrow and ghost flames rising from it more and more over the delay (the timer). storm():
  // arrows of varied angle and speed with smear streaks, each kicking up a little painted dust; some burn.
  function fireArrow(fromX, fromZ, x, z, { flight = 1 } = {}) {
    const ar = lift(arrowMesh(.9), 99806), fl = spr('ghostfire1', 1, { color: FIRE, add: true, flow: 1.4 }), trail = spr('smear1', 1, { color: [1, .5, .18], add: true });
    const p = new THREE.Vector3(), prev = new THREE.Vector3(fromX, 1.6, fromZ);
    run(flight + 4.5, (t, dt) => {
      const u = seg(t, 0, flight);
      if (u < 1) {
        const peak = 5.5, up = u < .55, h = up ? 1.6 + (peak - 1.6) * Math.sin(u / .55 * Math.PI / 2) : peak * (1 - inq((u - .55) / .45));
        const along = up ? .15 * u / .55 : .15 + .85 * inq((u - .55) / .45);
        p.set(fromX + (x - fromX) * along, Math.max(0, h), fromZ + (z - fromZ) * along);
        const dir = p.clone().sub(prev); if (dir.lengthSq() > 1e-6) ar.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
        prev.copy(p); ar.position.copy(p);
        fl.position.copy(p); fl.position.y += .25; set(fl, .95); fl.scale.setScalar(1 + .15 * Math.sin(time * 27));
        const sl = aim(trail, -dir.x, -dir.y, -dir.z); trail.rotateZ(Math.PI); trail.position.copy(p).addScaledVector(dir.clone().normalize(), -1); trail.scale.set(2.4, .55, 1); set(trail, .9);
        if (Math.random() < dt * 50) soft.emit({ x: p.x, y: p.y, z: p.z, vy: .25, sway: .2, life: rand(.9, 1.4), size: rand(.2, .32), grow: 2.4, alpha: .4, color: pick(DOTSOOT), shape: SHAPE.dot });
        return;
      }
      set(trail, 0);
      if (ar.userData.stuck !== true) { ar.userData.stuck = true; ar.position.set(x, .05, z); ar.quaternion.setFromEuler(new THREE.Euler(.35, 0, .3)); ar.translateY(-.25); kicks(x, z, 8, { speed: [1.5, 3], len: [.35, .55], vy: [.2, .6], life: [.3, .45] }); }
      const a = t - flight, burn = 1 - .7 * outc(seg(a, 1.2, 3)), k = 1 - seg(a, 3.6, 4.5);
      fl.position.set(x, .35 * burn + .1, z); fl.scale.setScalar(.8 * (.5 + .5 * burn)); set(fl, .9 * k, seg(a, 3.4, 4.5));
    }, () => { drop(ar); drop(fl); drop(trail); });
  }
  function stormMark(x, z, { radius = 6, seconds = 1, hold = 1.7 } = {}) {
    const edge = spr('sigil', radius * 2.3, { ground: true, color: EMBER, hot: [1, .7, .35], hotK: .6, add: true, order: 5, flow: .2 });   // a burning talisman circle marks where the arrows fall
    const sc = spr('scorch', radius * 2, { ground: true, color: [.2, .11, .06], hot: [.45, .2, .08], order: 4 });
    dim(x, z, radius * 1.3, seconds + hold, .15);
    let nextF = 0;
    run(seconds + hold, (t, dt) => {
      const k = t / seconds, grow = .6 + .4 * outback(seg(t, 0, .25), 1.2), end = seg(t, seconds + hold - .8, seconds + hold);
      onGround(edge, x, z, .045); edge.scale.setScalar(radius * 2.3 * grow); edge.rotation.z += dt * .12;
      set(edge, outc(seg(t, 0, .22)) * (.3 + .12 * Math.sin(time * (k < 1 ? 6 + 14 * k : 4)) ** 2), end * 1.05);
      onGround(sc, x, z); sc.scale.setScalar(radius * 2 * (.15 + .85 * outc(seg(t, 0, seconds)))); set(sc, .7, end * 1.05);
      if (t > nextF && t < seconds + hold - .6) {   // ghost flames rising off the scorch, more and more until the storm
        nextF = t + (k < 1 ? .2 - .14 * k : .12);
        const an = rand(0, 6.283), r = Math.sqrt(rand(0, 1)) * radius * .8 * outc(clamp(k)), m = spr(pick(GHOST), rand(.6, .9), { color: EMBER, add: true, flow: 1.2 }), L = rand(.7, 1.1);
        const px = x + Math.cos(an) * r, pz = z + Math.sin(an) * r;
        run(L, tt => { const kk = tt / L, [a, e] = life3(kk, .8, .15, .55); m.position.set(px, .35 + .5 * kk + gy(px, pz), pz); set(m, a, e); }, () => drop(m));
      }
    }, () => { drop(edge); drop(sc); });
  }
  function storm(x, z, { radius = 6, fromX = x - 10, fromZ = z - 4, arrows = 64, seconds = 1.5 } = {}) {
    const dir = new THREE.Vector3(x - fromX, 0, z - fromZ).normalize();
    for (let i = 0; i < arrows; i++) {
      const at = clamp(seconds * (.5 - Math.cos(Math.PI * rand(0, 1)) * .5) + rand(-.05, .05), 0, seconds);
      const a = rand(0, 6.283), d = Math.sqrt(rand(0, 1)) * radius * .74;
      later(at, () => arrowFall(x + Math.cos(a) * d, z + Math.sin(a) * d, dir, i % 5 === 0));
    }
  }
  function arrowFall(x, z, dir, burning) {
    const ar = lift(arrowMesh(), 99806), H = rand(5, 7.5), fall = rand(.2, .34), streak = spr('smear3', 1, { color: [.82, .76, .66], add: true });
    const sw = rand(-.45, .45), slope = rand(.55, 1.05), from = new THREE.Vector3(x - (dir.x - dir.z * sw) * H * slope, H, z - (dir.z + dir.x * sw) * H * slope), to = new THREE.Vector3(x, 0, z);
    const v = to.clone().sub(from).normalize(); ar.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), v);
    aim(streak, v.x, v.y, v.z);
    const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(v.x * .8 + rand(-.3, .3), v.y, v.z * .8 + rand(-.3, .3)).normalize());
    const fl = burning ? spr(pick(GHOST), .5, { color: FIRE, add: true, flow: 1.2 }) : null;
    const life = rand(1.4, 2.4);
    run(fall + life, (t, dt) => {
      if (t < fall) {
        ar.position.lerpVectors(from, to, inq(t / fall));
        streak.position.copy(ar.position).addScaledVector(v, -1); streak.scale.set(2.4, .3, 1); set(streak, .55 * outc(t / .06));
        if (fl) { fl.position.copy(ar.position).y += .15; set(fl, .85); }
        return;
      }
      if (!ar.userData.stuck) {
        ar.userData.stuck = true; ar.position.set(x, 0, z); ar.quaternion.copy(tilt); ar.translateY(-.3); set(streak, 0);
        if (Math.random() < .6) fling(pick(SMOKES), x, .15, z, v.x * 2, .2, v.z * 2, { size: rand(.45, .7), life: .5, color: SAND, drag: 4, alpha: .7 });
      }
      const a = t - fall, k = 1 - seg(a, life - .5, life);
      ar.traverse(c => { if (c.material) c.material.opacity = k; });
      if (fl) { fl.position.set(x, .3, z); set(fl, .8 * (1 - seg(a, .8, 1.8)), seg(a, .8, 1.8)); }
    }, () => { drop(ar); drop(streak); if (fl) drop(fl); });
  }

  // =====================================================================================================================
  // 6. FLICKER CUT. flickerStart(): a vortex of dark ink winding in at his feet and a glint on the blade. flicker(): an ink
  // smear with a light edge from where he was to where he lands, its tail catching its head over four frames; the cut is a
  // painted crescent of steel light, a new angle each time, held two frames and dissolving; a burst and sparks on the hit,
  // blood that stains the ground.
  function flickerStart(x, z) {
    const v = spr('vortex2', 2.6, { ground: true, color: INK, hot: [.2, .18, .22], order: 5, flow: .5 }); onGround(v, x, z, .04);
    run(.5, (t, dt) => { v.rotation.z += dt * 7; v.scale.setScalar(2.6 * (1 - .55 * outc(t / .5))); set(v, .8 * ramp(t, .5, .2, .3)); }, () => drop(v));
    kicks(x, z, 14, { r0: 2, inward: true, speed: [5, 7.5], len: [.5, .8], vy: [0, .2], gravity: 0, drag: 1, life: [.22, .3], color: [.22, .2, .18] });
    const gl = spr('burst2', .7, { color: [.85, .9, 1], add: true });
    run(.22, t => { const k = t / .22; gl.position.set(x + .45 - .3 * k, 1.55 - .55 * k, z); set(gl, Math.sin(k * Math.PI) * .95); }, () => drop(gl));
  }
  const CUTS = [-.6, .95, -.15, .5, -1.05];
  let cutN = 0;
  function flicker(fromX, fromZ, x, z, { side = 1 } = {}) {
    const dx = x - fromX, dz = z - fromZ, L = Math.hypot(dx, dz) || 1;
    const ink = spr('smear3', 1, { color: INK, hot: [.16, .15, .2] }), lit = spr('smear1', 1, { color: STEEL, add: true });
    const sl = aim(ink, -dx, 0, -dz); aim(lit, -dx, 0, -dz);
    run(.22, t => {
      const tail = outc(seg(t, .02, .22)), cx = fromX + dx * (.5 + tail * .5), cz = fromZ + dz * (.5 + tail * .5);
      ink.position.set(cx, .95, cz); ink.scale.set(Math.max(.01, sl * (1 - tail) * 1.1), 1.4 * (1 - .4 * tail), 1); set(ink, .9, seg(t, .08, .22) * 1.05);
      lit.position.set(cx, 1.1, cz); lit.scale.set(Math.max(.01, sl * (1 - tail)), .4, 1); set(lit, .8 * (1 - inq(seg(t, .03, .18))));
    }, () => { drop(ink); drop(lit); });
    kicks(fromX, fromZ, 6, { speed: [1.5, 3], len: [.35, .55], ang: Math.atan2(-dz, -dx), spread: 1.5, vy: [.1, .5], life: [.25, .4] });
    const ang = CUTS[cutN++ % CUTS.length], flip = cutN % 2 ? 1 : -1, big = [1, 1.2, .9][cutN % 3], g = pick(['smear1', 'smear2']);
    later(.04, () => {
      const cut = spr(g, 2.4 * big, { color: STEEL, hot: [.92, .94, 1], hotK: .8, add: true, flow: .6, rot: ang + (side < 0 ? Math.PI : 0) }), body = spr(g, 2.4 * big, { color: [.2, .22, .28], flow: .6, rot: ang + (side < 0 ? Math.PI : 0) });
      for (const m of [body, cut]) m.position.set(x, 1.05, z);
      run(.26, t => { const k = t / .26, e = t < .1 ? 0 : seg(t, .1, .26) * 1.05; set(cut, .8, e); set(body, .55, e); cut.scale.set(flip * 3.2 * big * (.55 + .45 * outc(k * 2)), .75 * big, 1); body.scale.copy(cut.scale); }, () => { drop(cut); drop(body); });
      const hb = spr('burst2', 1.2, { color: [.82, .86, .95], add: true }); hb.position.set(x, 1.05, z);
      run(.12, t => { set(hb, .9 * (1 - outc(t / .12))); hb.scale.setScalar(1.2 * (1 + .6 * t / .12)); }, () => drop(hb));
      const sp = spr('sparks1', 1.3, { color: STEEL, add: true }); sp.position.set(x, 1.05, z); aim(sp, dx, 0, dz);
      run(.28, t => { const [a, e] = life3(t / .28, .9, .1, .6); set(sp, a, e); }, () => drop(sp));
      for (let i = 0; i < 12; i++) { const a = rand(-.9, .9) + (side < 0 ? Math.PI : 0) + Math.atan2(dz, dx); soft.emit({ x, y: 1, z, vx: Math.cos(a) * rand(1, 3.5), vz: Math.sin(a) * rand(1, 3.5), vy: rand(.5, 2.5), gravity: 9, drag: .6, life: rand(.3, .5), size: rand(.06, .12), alpha: .95, color: pick(DOTBLOOD), shape: SHAPE.dot }); }
      const stain = decal(x + dx / L * .6, z + dz / L * .6, .55, { color: [.24, .03, .03], rag: .35, order: 5 });
      run(4, t => { U(stain).uFill.value = outc(seg(t, .3, .7)) * 1.02; U(stain).uAlpha.value = .75; U(stain).uErode.value = seg(t, 2, 4) * 1.05; }, () => drop(stain));
    });
  }

  // =====================================================================================================================
  // 7. RALLY CRY. Calm, in the heal language (soft green, nothing sharp): a lotus of light opens at the master's feet and a
  // ring of drifting leaves of light passes slowly out over his band. mend(): a soft column of green light breathing on
  // each healed man (under one swell a second), motes of light rising over him, a torn green ring under him.
  function rally(x, z, { radius = 6 } = {}) {
    const lo = spr('heal_lotus', 2.6, { ground: true, color: HEAL, add: true, order: 6, flow: .3 }); onGround(lo, x, z, .05);
    run(2.4, t => { const k = t / 2.4, [a, e] = life3(k, .7, .2, .5); lo.scale.setScalar(2.6 * (.6 + .4 * outc(k))); set(lo, a, e); }, () => drop(lo));
    const ring = spr('heal_ring', 1, { ground: true, color: HEAL, add: true, order: 6, flow: .3 }); onGround(ring, x, z, .05);
    run(2.8, (t, dt) => { const k = t / 2.8, [a, e] = life3(k, .65, .12, .5); ring.scale.setScalar(radius * 2.2 * (.15 + .85 * outc(k))); ring.rotation.z += dt * .3; set(ring, a, e); }, () => drop(ring));
  }
  function mend(id, x, z, { head = 2.1 } = {}) {
    const m = marker(id, 'mend'); m.x = x; m.z = z; m.head = head;
    if (!m.parts.length) { m.ph = rand(0, 1); m.rate = rand(.75, .95); m.parts.push(spr('heal_column', 1.5, { color: HEAL, add: true, flow: .6, h: 1.3 }), spr('heal_motes', .9, { color: [.7, .92, .66], add: true, flow: .5 }), sMark(HEAL, .6)); }
  }
  function tickMend(m, dt) {
    m.t += dt;
    const ph = (m.t * m.rate + m.ph) % 1, beat = Math.sin(ph * Math.PI) ** 2, [col, mo, mk] = m.parts;
    col.position.set(m.x, .95, m.z); set(col, m.k * (.12 + .2 * beat));
    mo.position.set(m.x, m.head - .2 + .35 * ph, m.z); set(mo, m.k * .8 * Math.sin(ph * Math.PI));
    placeMark(mk, m.x, m.z, m.k * (.6 + .4 * beat), .3);
  }

  // =====================================================================================================================
  // 8. DUST AND BLEED. hooves(): painted dust thrown up behind the chief's horse as it runs. dust(): the cloud he raises:
  // big painted smoke and dust clouds in sand, rolling out from his line, turning slowly round the middle, thinner in the
  // middle, dissolving away. blind(): a dark smear across the eyes and a torn ochre ring. bleed(): a red ring, a drop over
  // the head, drips that soak into the ground.
  let hoofT = 0;
  function hooves(x, z, vx, vz) {
    if (time - hoofT < .1) return;
    hoofT = time;
    const a = Math.atan2(-vz, -vx) + rand(-.5, .5), v = Math.hypot(vx, vz) * .3 + rand(.5, 1.5);
    fling(pick(SMOKES), x + rand(-.3, .3), .3, z + rand(-.3, .3), Math.cos(a) * v, .2, Math.sin(a) * v, { size: rand(1.2, 1.7), life: rand(1, 1.5), color: SAND, drag: 1.5, alpha: .75, grow: 1.5 });
  }
  function dust(x, z, { radius = 8, seconds = 5, vx = 0, vz = 0 } = {}) {
    for (let i = 0; i < 16; i++) {
      const an = rand(0, 6.283), d = Math.sqrt(rand(.08, 1)) * radius * .8, sz = rand(2.6, 3.8), m = spr(pick(SMOKES), sz, { color: [.44, .36, .26], hot: [.66, .56, .42], hotK: .45, flow: 1.1 });
      const L = seconds + rand(-.4, .8), del = rand(0, .6), spin = rand(.08, .16), h = rand(.8, 1.8), mid = d < radius * .35 ? .5 : 1;
      run(L + del, t => {
        const k = seg(t, del, del + L), [a, e] = life3(k, .42 * mid, .15, .4), ang = an + spin * t;
        const rr = d * (.25 + .75 * outc(seg(t, del, del + 1.5)));
        m.position.set(x + Math.cos(ang) * rr + vx * .35 * outc(k), h + gy(x, z), z + Math.sin(ang) * rr + vz * .35 * outc(k)); m.scale.setScalar(sz * (.8 + .4 * outc(k))); set(m, a, e);
      }, () => drop(m));
    }
    const veil = decal(x, z, radius, { color: [.5, .42, .3], rag: .2, mottle: 1 });
    run(seconds + .8, t => { U(veil).uFill.value = outc(seg(t, 0, 1)) * 1.02; U(veil).uAlpha.value = .2 * (1 - outc(seg(t, seconds - 1.2, seconds + .8))); }, () => drop(veil));
  }
  function blind(id, x, z, { head = 1.9 } = {}) {
    const m = marker(id, 'blind'); m.x = x; m.z = z; m.head = head;
    if (!m.parts.length) m.parts.push(sMark([.7, .55, .32]), spr('smear4', .75, { color: [.16, .12, .08], hot: [.3, .24, .16], flow: .6, h: .45 }));
  }
  function tickBlind(m, dt) {
    m.t += dt;
    const [mk, band] = m.parts;
    placeMark(mk, m.x, m.z, m.k, .5);
    band.position.set(m.x, m.head + .02 * Math.sin(m.t * 2.3), m.z); set(band, .9 * m.k);
  }
  function bleed(id, x, z, { head = 2.25 } = {}) {
    const m = marker(id, 'bleed'); m.x = x; m.z = z; m.head = head;
    if (!m.parts.length) {
      const icon = lift(new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: dropTex(), color: new THREE.Color(...BLOODC), transparent: true, opacity: 0, depthTest: false, depthWrite: false })), 99830);
      icon.quaternion.copy(CAM_QUAT); icon.scale.set(.2, .3, 1);
      m.parts.push(sMark(BLOODC, .58), icon);
    }
  }
  function tickBleed(m, dt) {
    m.t += dt;
    const [mk, icon] = m.parts, beat = .5 + .5 * Math.sin(m.t * 5);
    placeMark(mk, m.x, m.z, m.k * (.75 + .25 * beat), .5);
    icon.position.set(m.x, m.head + .04 * beat, m.z); icon.material.opacity = m.k * (.75 + .2 * beat);
    if (m.k > .3 && Math.random() < dt * 1.2) {
      const px = m.x + rand(-.15, .15), pz = m.z + rand(-.15, .15);
      soft.emit({ x: px, y: rand(.7, 1), z: pz, vy: 0, gravity: 9, life: .4, size: rand(.1, .14), alpha: .95, color: [.4, .04, .03], shape: SHAPE.dot });
      later(.38, () => {
        const r0 = rand(.14, .22), s = decal(px, pz, r0, { color: [.28, .03, .03], rag: .3, order: 5 });
        run(4, t => { U(s).uAlpha.value = .9 * outc(t / .25); s.scale.setScalar(r0 * (1 + .3 * outc(t / 1.2))); U(s).uErode.value = seg(t, 1.8, 4) * 1.05; }, () => drop(s));
      });
    }
  }

  // ---- every frame ----------------------------------------------------------------------------------------------------
  function update(dt) {
    time += dt;
    for (let i = live.length - 1; i >= 0; i--) {
      const r = live[i]; r.age += dt;
      if (r.age >= r.life) { live.splice(i, 1); r.done?.(); continue; }
      if (r.tick?.(r.age, dt) === false) { live.splice(i, 1); r.done?.(); }
    }
    for (let i = fxs.length - 1; i >= 0; i--) { const m = fxs[i]; if (!m.parent) { fxs.splice(i, 1); continue; } m.material.uniforms.uTime.value = time; }
    for (let i = pieces.length - 1; i >= 0; i--) {
      const d = pieces[i], m = d.m; d.age += dt;
      if (d.bounced < 2) {
        d.vy -= 24 * dt; m.position.x += d.vx * dt; m.position.y += d.vy * dt; m.position.z += d.vz * dt; m.rotation.x += d.spin[0] * dt; m.rotation.z += d.spin[1] * dt;
        if (m.position.y <= .04 && d.vy < 0) { m.position.y = .04; d.bounced++; d.vy = d.bounced < 2 ? -d.vy * .25 : 0; d.vx *= .4; d.vz *= .4; }
      }
      m.material.opacity = 1 - seg(d.age, d.life - .8, d.life);
      if (d.age > d.life) { drop(m); pieces.splice(i, 1); }
    }
    for (const [key, m] of markers) {
      m.k += ((time - m.seen < .15 ? 1 : 0) - m.k) * (1 - Math.exp(-dt * (m.k < .5 ? 4 : 2.5)));
      ({ boss: tickBoss, rage: tickRage, mend: tickMend, blind: tickBlind, bleed: tickBleed })[m.kind](m, dt);
      if (time - m.seen > 2 && m.k < .02) { m.parts.forEach(drop); markers.delete(key); }
    }
    glow.update(dt); soft.update(dt);
  }

  return { ready, boss, keg, kegBlast, rear, slam, stun, howl, add, rage, net, shot, fireArrow, stormMark, storm, flickerStart, flicker, rally, mend, dust, hooves, blind, bleed, update };
}
