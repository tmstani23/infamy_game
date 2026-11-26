// Train robbery: the rail charge and its blast (2026-11-20: like the shakedown dynamite but a longer fuse and a
// much bigger blast; the game's painted, muted look, not cartoony; cool and powerful). Purely visual.
// Layers, each on its own timing: the charge (a big bundle strapped to the rail, a fuse cord that burns down with a
// hissing spark, the shakedown ring), then the blast: a flash, a fireball of noise-lumped puffs that cool from white
// to orange to deep red and roll on into rising grey-brown smoke, a dust ring racing out along the ground, debris
// (sleeper splinters, rail pieces, stones) thrown up on real arcs that bounce and puff dust, embers hanging after,
// and the scorched crater with bent rail ends (a code stand-in until the painted blown-track strip exists).
//   createRailBlastFx({ scene }) -> { charge(id, x, z, heading, seconds), cancel(id), blast(x, z, heading),
//     crater(id, x, z, heading), clearCrater(id), update(dt), shake() -> { x, y } (camera nudge, world units) }
import * as THREE from 'three';
import { CAM_QUAT } from './iso.js';
import { onFxLayer } from './bloom.js';
import { createParticles, SHAPE } from './vfx.js';
import { createRune, RUNE } from './rune_mesh.js';

const rand = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
const ease = k => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

// ---- noise-lumped puff: one sphere, the fireball and the smoke ----------------------------------------
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
const PUFF_VERT = /* glsl */`
uniform float uTime, uSeed, uAmp;
varying vec3 vN, vS, vP; varying float vNoise;
${NOISE}
// the surface: big slow lumps plus rounded billows bulging out, so the edge rolls like cauliflower, never a plain ball;
// all smooth and low enough in frequency for the mesh (sharp creases came out polygony, 2026-11-20)
float bil(vec3 q){ float n = snoise(q) * .5 + .5; return n * n; }
float disp(vec3 q){
  vec3 o = vec3(uSeed, uSeed * .7, -uTime * .6);
  return snoise(q * 1.2 + o) * uAmp * .7 + bil(q * 2. + o * 1.3) * uAmp * .6;   // broad rolls only: fine bumps on every lump read as popcorn (2026-11-20)
}
void main(){
  vec3 q = normalize(position);
  float d0 = disp(q);
  vNoise = d0 / max(uAmp, .01) - .2;
  vec3 p = q * (1. + d0);
  // the lumpy normal: the displaced surface a step along two tangents
  vec3 t = normalize(cross(q, abs(q.y) < .99 ? vec3(0., 1., 0.) : vec3(1., 0., 0.))), b = cross(q, t);
  vec3 q1 = normalize(q + t * .05), q2 = normalize(q + b * .05);
  vec3 nrm = normalize(cross(q1 * (1. + disp(q1)) - p, q2 * (1. + disp(q2)) - p));
  if (dot(nrm, q) < 0.) nrm = -nrm;
  vN = normalize(normalMatrix * nrm);
  vS = normalize(normalMatrix * q);
  vP = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
// heat 1 white-hot .. 0 cold smoke; erode 0 solid .. 1 gone (soft, uneven noise edges, never a clean outline)
const PUFF_FRAG = /* glsl */`
uniform float uTime, uSeed, uHeat, uErode, uOpacity, uUnderGlow, uThin; uniform vec3 uCold;
varying vec3 vN, vS, vP; varying float vNoise;
${NOISE}
vec3 ramp(float h){
  vec3 c0=uCold, c1=mix(uCold, vec3(.30,.22,.17), .6), c2=vec3(.50,.17,.06), c3=vec3(.86,.40,.11), c4=vec3(1.,.72,.34), c5=vec3(1.,.93,.74);
  if(h<.2) return mix(c0,c1,h/.2);
  if(h<.42) return mix(c1,c2,(h-.2)/.22);
  if(h<.64) return mix(c2,c3,(h-.42)/.22);
  if(h<.84) return mix(c3,c4,(h-.64)/.2);
  return mix(c4,c5,min(1.,(h-.84)/.16));
}
void main(){
  float face = clamp(vS.z, 0., 1.);                       // facing the camera: the core of the lump
  float detail = fbm(vP * 3.1 + vec3(uSeed * 1.3, -uTime * .9, uTime * .4));
  float h = uHeat * (.3 + .8 * face) + detail * .45 * uHeat + vNoise * .35 * uHeat;
  h -= smoothstep(.15, -.35, detail) * .35 * uHeat;   // sooty dark streaks through the fire
  vec3 col = ramp(clamp(h, 0., 1.));
  // smoke: lit a little from above, darker underneath, warm under-glow from the fire while it lasts
  // real volume: a sun from the upper left lights the lumps, their undersides and far sides fall into shade
  vec3 nb = normalize(vN + vec3(detail * .2, detail * .2, 0.));
  float sun = clamp(dot(nb, normalize(vec3(-.45, .75, .5))), 0., 1.);
  float up = clamp(vN.y * .5 + .5, 0., 1.);
  col *= mix(1., .64 + .5 * sun, 1. - uHeat * .8);   // gentle shading, so the lumps read as one cloud
  col = mix(col, col * vec3(.8, .78, .82), (1. - up) * (1. - uHeat));
  col += vec3(.45, .17, .04) * uUnderGlow * (1. - up) * (1. - uHeat);
  float edge = smoothstep(0., .35, face);
  float a = smoothstep(uErode - .08, uErode + .08, detail * .5 + .62) * mix(.94, 1., edge) * uOpacity;
  a *= mix(1., clamp(.1 + .34 * edge + .4 * detail, .04, .62), uThin);   // 2026-11-20: more transparent smoke
  a *= smoothstep(0., .42, mix(vS.z, vN.z, .4) + detail * .1);   // a wide soft rim melts each lump into its neighbours   // a soft rim on the lumpy outline hides the mesh edge   // cooled smoke thins into a see-through, patchy veil
  if (a < .01) discard;
  gl_FragColor = vec4(col, a);
}`;
const PUFF_GEO = new THREE.IcosahedronGeometry(1, 9);
function puffMaterial(seed) {
  return new THREE.ShaderMaterial({
    uniforms: { uCold: { value: new THREE.Vector3(.17, .15, .14) }, uTime: { value: 0 }, uSeed: { value: seed }, uAmp: { value: .28 }, uHeat: { value: 1 }, uErode: { value: 0 }, uOpacity: { value: 1 }, uUnderGlow: { value: 0 }, uThin: { value: 0 } },
    vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG, transparent: true, depthTest: false, depthWrite: false,
  });
}

// ---- canvas textures -------------------------------------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
let ringTex = null, glowTex = null, craterTex = null;
const getRing = () => ringTex ||= canvasTex(256, 256, g => {   // a dusty ring, ragged inside edge
  for (let i = 0; i < 160; i++) {
    const a = Math.random() * 6.283, r = 92 + Math.random() * 30, s = 6 + Math.random() * 16;
    const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r, gr = g.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, 'rgba(196,174,140,.8)'); gr.addColorStop(1, 'rgba(196,174,140,0)');
    g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2);
  }
});
const getGlow = () => glowTex ||= canvasTex(128, 128, g => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(.25, 'rgba(255,190,110,.7)'); gr.addColorStop(.6, 'rgba(220,110,40,.22)'); gr.addColorStop(1, 'rgba(200,90,30,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const getCrater = () => craterTex ||= canvasTex(512, 512, g => {   // the blast mark: soot and scattered grit on the ground under the painted blown track
  const blot = (x, y, r, c0, c1) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); };
  for (let i = 0; i < 70; i++) { const a = Math.random() * 6.283, r = Math.random() * 150; blot(256 + Math.cos(a) * r, 256 + Math.sin(a) * r * .9, 40 + Math.random() * 70, 'rgba(18,14,11,.42)', 'rgba(18,14,11,0)'); }   // soot
  for (let i = 0; i < 260; i++) { const a = Math.random() * 6.283, r = 40 + Math.random() * 200; g.fillStyle = `rgba(${pick([[118, 112, 104], [84, 78, 72], [60, 44, 30]]).join(',')},${(.5 + Math.random() * .5).toFixed(2)})`; g.fillRect(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 2 + Math.random() * 4, 2 + Math.random() * 3); }   // gravel and splinters
});
const flat = (tex, size, color = 0xffffff, additive = false, opacity = 1) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthTest: false, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  m.rotation.x = -Math.PI / 2; m.frustumCulled = false; return m;
};

// ---- colours (muted, painted) ----------------------------------------------------------------------
const FIRE = [[1, .82, .5], [1, .56, .2], [.92, .34, .1]], DUST = [[.6, .53, .43], [.68, .6, .49], [.5, .45, .38]], SMOKE = [[.2, .18, .17], [.27, .24, .22], [.33, .3, .27]];
// debris pieces shaded per face (a sun from the upper left, a little grain), so they read as splinters and stones,
// not flat colored shapes; the shading turns with the piece as it tumbles
const SUN = new THREE.Vector3(-.45, .75, .5).normalize();
function shaded(geo0, hex) {
  const geo = geo0.index ? geo0.toNonIndexed() : geo0; geo.computeVertexNormals();
  const n = geo.attributes.normal, base = new THREE.Color(hex), col = new Float32Array(n.count * 3), v = new THREE.Vector3();
  for (let f = 0; f < n.count; f += 3) {
    v.fromBufferAttribute(n, f);
    const k = (.45 + .75 * Math.max(0, v.dot(SUN))) * (.85 + Math.random() * .2);
    for (let j = 0; j < 3; j++) { col[(f + j) * 3] = base.r * k; col[(f + j) * 3 + 1] = base.g * k; col[(f + j) * 3 + 2] = base.b * k; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
}
const WOOD = [0x4a3322, 0x5a4028, 0x3d2a1b], IRON = [0x3b3a3a, 0x48464a], STONE = [0x77736d, 0x5f5b56, 0x8a857c];

export function createRailBlastFx({ scene }) {
  const glow = createParticles(scene, { max: 900 }), smoke = createParticles(scene, { max: 900, additive: false });
  const charges = new Map(), craters = new Map(), puffs = [], debris = [], cards = [];
  let shakeT = 0, shakeAmp = 0, time = 0;
  const lift = o => { o.renderOrder = 99800; o.frustumCulled = false; scene.add(o); return o; };

  // ---- the charge ---------------------------------------------------------------------------------
  function charge(id, x, z, heading = 0, seconds = 8) {
    cancel(id);
    const g = new THREE.Group(), red = new THREE.MeshBasicMaterial({ color: 0x8e2c1d }), dark = new THREE.MeshBasicMaterial({ color: 0x5c1b12 }), band = new THREE.MeshBasicMaterial({ color: 0xc9b48a });
    const stick = new THREE.CylinderGeometry(.09, .09, .62, 8), bandGeo = new THREE.CylinderGeometry(.097, .097, .05, 8);
    [[-.2, 0], [0, 0], [.2, 0], [-.1, .16], [.1, .16], [0, .31]].forEach(([sx, sy], i) => {   // six sticks, stacked against the rail
      const s = new THREE.Mesh(stick, i % 2 ? dark : red); s.rotation.z = Math.PI / 2; s.position.set(0, .1 + sy, sx); g.add(s);
      for (const off of [-.18, .18]) { const b = new THREE.Mesh(bandGeo, band); b.rotation.z = Math.PI / 2; b.position.set(off, .1 + sy, sx); g.add(b); }
    });
    // the fuse cord: a loose curve off the bundle; the spark burns down it
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(.31, .3, 0), new THREE.Vector3(.7, .5, .2), new THREE.Vector3(1.1, .12, .5), new THREE.Vector3(1.6, .04, .3)]);
    const cord = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .025, 5), new THREE.MeshBasicMaterial({ color: 0x3a332b }));
    g.add(cord);
    g.position.set(x, 0, z); g.rotation.y = heading;
    g.traverse(m => { m.renderOrder = 99805; m.frustumCulled = false; });
    scene.add(g);
    const ring = onFxLayer(createRune(RUNE.shakedown, 0xd9905c, .45, false)); ring.position.set(x, .03, z); ring.scale.setScalar(2.4); lift(ring);
    charges.set(id, { g, ring, curve, x, z, heading, age: 0, seconds });
  }
  function cancel(id) { const c = charges.get(id); if (!c) return; scene.remove(c.g, c.ring); charges.delete(id); }
  function chargeTick(c, dt) {
    c.age += dt;
    const k = Math.min(1, c.age / c.seconds), p = c.curve.getPoint(1 - k).clone();
    p.applyAxisAngle(new THREE.Vector3(0, 1, 0), c.heading); p.x += c.x; p.z += c.z;
    c.ring.material.opacity = .3 + .2 * Math.sin(time * (4 + 10 * k));   // the ring pulses faster as the fuse runs down
    for (let i = 0; i < 3; i++) {   // hissing spark
      const a = rand(0, 6.283), v = rand(.6, 2.2);
      glow.emit({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(.5, 2.5), gravity: 6, drag: 2, life: rand(.12, .35), size: rand(.05, .12), color: pick(FIRE), shape: SHAPE.ember });
    }
    if (Math.random() < dt * 14) smoke.emit({ x: p.x, y: p.y + .05, z: p.z, vy: rand(.4, .8), life: rand(.6, 1.1), size: rand(.12, .22), grow: 1.5, alpha: .75, color: pick(SMOKE), shape: SHAPE.dot, sway: .3 });
  }

  // ---- the blast ----------------------------------------------------------------------------------
  function puff(x, y, z, o) {
    const m = new THREE.Mesh(PUFF_GEO, puffMaterial(rand(0, 50)));
    if (o.cold) m.material.uniforms.uCold.value.set(...o.cold);
    m.position.set(x, y, z); m.scale.setScalar(.01); lift(m);
    puffs.push({ m, age: -(o.delay || 0), x, y, z, ...o });
  }
  // o.scale: a smaller blast of the same kind (the shakedown dynamite, 2026-11-20); o.shake false: no camera shake
  function blast(x, z, heading = 0, o = {}) {
    const S = o.scale ?? 1, N = n => Math.max(1, Math.round(n * S));
    const P = (dx, y, dz, q) => puff(x + dx * S, y * S, z + dz * S, { ...q, size: q.size * S, rise: q.rise * S, drift: [q.drift[0] * S, q.drift[1] * S] });
    // flash: a ground glow and a bright pop
    const pool = lift(onFxLayer(flat(getGlow(), 22 * S, 0xffd8a0, true, 1))); pool.position.set(x, .04, z);
    cards.push({ m: pool, age: 0, life: .9, fade: k => Math.pow(1 - k, 1.5) });
    const pop = lift(onFxLayer(new THREE.Mesh(new THREE.PlaneGeometry(14 * S, 14 * S), new THREE.MeshBasicMaterial({ map: getGlow(), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }))));
    pop.quaternion.copy(CAM_QUAT); pop.position.set(x, 2 * S, z);
    cards.push({ m: pop, age: 0, life: .35, fade: k => 1 - k, grow: 1.2 });
    // fireball: a dome of lumps, the middle ones biggest and hottest, cooling into smoke
    for (let i = 0; i < 9; i++) {   // few, big, overlapping lumps: many small ones read as popcorn (2026-11-20)
      const a = (i / 9) * 6.283 + rand(-.3, .3), core = i < 3, r = core ? rand(0, .6) : rand(.8, 1.9);
      P(Math.cos(a) * r, core ? 1.2 + i * .9 : rand(.6, 1.4), Math.sin(a) * r, { delay: rand(0, .1), size: core ? rand(3.6, 4.6) : rand(2.8, 3.7), rise: core ? rand(4, 7) : rand(1.2, 2.6), drift: [Math.cos(a) * rand(1, 2.6), Math.sin(a) * rand(1, 2.6)], fire: core ? rand(.95, 1.1) : rand(.7, .95), life: rand(5, 7.5) });
    }
    // the smoke column that follows it up
    for (let i = 0; i < 6; i++) P(rand(-1.4, 1.4), 3 + i * 1.3, rand(-1.6, 1.6), { delay: .3 + i * .1, size: rand(3.2, 4.4), rise: rand(4, 7), drift: [rand(-.3, .8), rand(-.4, .3)], fire: rand(.3, .5), life: rand(6, 9) });
    // shockwave: dust racing out along the ground
    const ring = lift(flat(getRing(), 2, 0xffffff, false, .85)); ring.position.set(x, .05, z);
    cards.push({ m: ring, age: 0, life: .8, fade: k => .85 * (1 - k), scale: k => (2 + 28 * ease(k * 1.3)) * S });
    // dust skirt and sparks
    for (let i = 0; i < 22; i++) {   // the dust wall: flat, overlapping rolls racing out along the ground into one ring
      const a = (i / 22) * 6.283 + rand(-.15, .15), d = rand(4.5, 9.5);
      P(Math.cos(a) * 1.5, .3, Math.sin(a) * 1.5, { delay: rand(0, .08), size: rand(1, 1.6), rise: rand(.2, .6), drift: [Math.cos(a) * d, Math.sin(a) * d], fire: 0, cold: [.4, .37, .31], life: rand(2.6, 4), amp: 1, squash: .45 });
    }
    for (let i = 0; i < N(50); i++) {
      const a = rand(0, 6.283), v = rand(5, 16) * S;
      smoke.emit({ x, y: .3, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(.3, 1.8), drag: 2.4, life: rand(1.6, 3.4), size: rand(1, 2) * S, grow: 2.4, alpha: 1, color: pick(DUST), shape: SHAPE.dot, sway: .4 });
    }
    for (let i = 0; i < N(120); i++) {
      const a = rand(0, 6.283), v = rand(3, 14) * Math.sqrt(S);
      glow.emit({ x, y: .6, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(2, 12) * Math.sqrt(S), gravity: 9, drag: 1.2, life: rand(.4, 1.6), size: rand(.06, .16), color: pick(FIRE), shape: i % 4 ? SHAPE.ember : SHAPE.sparkle, twinkle: .3 });
    }
    // debris: sleeper splinters, rail pieces, stones, thrown up on real arcs
    const along = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const pieces = o.debris === false ? 0 : N(70);
    for (let i = 0; i < pieces; i++) {
      const kind = i < pieces * .37 ? 'wood' : i < pieces * .49 && S >= 1 ? 'iron' : 'stone';
      const geo = kind === 'wood' ? new THREE.BoxGeometry(rand(.28, .7), rand(.06, .1), rand(.08, .15)) : kind === 'iron' ? new THREE.BoxGeometry(rand(.35, .8), .07, .07) : new THREE.DodecahedronGeometry(rand(.05, .12));   // splinters, bits of rail and stones (2026-11-20: smaller)
      const m = lift(shaded(geo, pick(kind === 'wood' ? WOOD : kind === 'iron' ? IRON : STONE)));
      const a = rand(0, 6.283), v = rand(3, kind === 'stone' ? 13 : 9) * Math.sqrt(S), side = rand(-.5, .5);
      m.position.set(x + along.x * side, .3, z + along.z * side);
      debris.push({ m, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(8, kind === 'iron' ? 14 : 19) * Math.sqrt(S), spin: [rand(-12, 12), rand(-12, 12), rand(-12, 12)], bounced: 0, age: 0, trail: kind !== 'stone' && Math.random() < .6, burning: kind === 'wood' && Math.random() < .5 });
    }
    // embers hanging in the air after
    for (let i = 0; i < N(60); i++) glow.emit({ x: x + rand(-3, 3) * S, y: rand(1, 5) * S, z: z + rand(-3, 3) * S, vy: rand(.2, 1), sway: .8, drag: .5, life: rand(1.5, 4), size: rand(.04, .09), color: pick(FIRE), shape: SHAPE.ember, twinkle: .6 });
    if (o.shake !== false) { shakeT = .7; shakeAmp = .55 * S; }
  }

  // ---- the blown line (stand-in until the painted strip) --------------------------------------------
  function crater(id, x, z, heading = 0) {
    clearCrater(id);
    const g = new THREE.Group();
    const decal = flat(getCrater(), 15); decal.position.y = .02; g.add(decal);   // the painted blown track (render/rail_track.js) shows the damage now; this group only keeps the smoke going
    const iron = new THREE.MeshBasicMaterial({ color: 0x3c3b3b }), wood = new THREE.MeshBasicMaterial({ color: 0x3d2a1b });
    for (const side of []) for (const rail of [-.7, .7]) {   // rail ends bent up and twisted out of the gap
      const pts = [new THREE.Vector3(rail, .1, side * 4.2), new THREE.Vector3(rail, .14, side * 2.6), new THREE.Vector3(rail + rail * .5, .5, side * 1.7), new THREE.Vector3(rail + rail * 1.1, .9, side * 1.35)];
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, .07, 5), iron));
    }
    for (let i = 0; i < 0; i++) {   // snapped sleepers lying about (now in the painted art)
      const s = shaded(new THREE.BoxGeometry(rand(.6, 1.5), .12, .26), 0x3d2a1b);
      s.position.set(rand(-3.5, 3.5), .07, rand(-3, 3)); s.rotation.y = rand(0, 3.14); s.rotation.z = rand(-.15, .15); g.add(s);
    }
    g.position.set(x, 0, z); g.rotation.y = heading;
    g.traverse(m => { m.renderOrder = -0.395; m.frustumCulled = false; });   // the scorch lies on the ground under the painted blown track (render/rail_track.js, -0.39)
    g.visible = false;
    scene.add(g); craters.set(id, { g, decal, x, z, age: 0 });
  }
  function clearCrater(id) { const c = craters.get(id); if (c) { scene.remove(c.g); craters.delete(id); } }

  // ---- every frame --------------------------------------------------------------------------------
  // the blast plays SPEED times faster than real time (2026-11-20: way faster); the fuse and the crater keep real time
  const SPEED = 1.6;
  function update(dt0) {
    const dt = dt0 * SPEED;
    time += dt;
    for (const c of charges.values()) chargeTick(c, dt0);
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i], u = p.m.material.uniforms;
      p.age += dt;
      if (p.age < 0) { p.m.visible = false; continue; }
      p.m.visible = true;
      const k = p.age / p.life, grow = ease(p.age / .45) * .65 + ease(p.age / p.life) * .55;   // snaps out, then keeps swelling slowly
      p.m.scale.setScalar(p.size * grow);
      p.m.position.set(p.x + p.drift[0] * ease(p.age / 1.2), p.y + p.rise * (ease(p.age / 1.5) * .45 + k * .9), p.z + p.drift[1] * ease(p.age / 1.2));
      u.uTime.value = time;
      u.uHeat.value = p.fire * Math.max(0, 1 - Math.pow(p.age / 1.5, 1.3));   // white-hot to cold smoke in a second and a half
      u.uUnderGlow.value = p.fire > 0 ? Math.max(0, 1 - p.age / 2.2) : 0;   // dust is not lit by the fire
      u.uErode.value = k < .72 ? 0 : Math.pow((k - .72) / .28, 1.6) * 1.3;  // smoke stays solid, then frays away at the very end
      u.uAmp.value = (.16 + .14 * Math.min(1, p.age / 1.5)) * (p.amp || 1);
      u.uThin.value = p.fire > 0 ? Math.min(1, Math.max(0, (p.age - (p.fire > .6 ? 1.1 : .5)) / 1.6)) : Math.min(1, .55 + p.age / 1.5);   // the plume goes see-through as it cools; dust is a veil from the start   // the plume goes see-through as it cools
      if (p.squash) p.m.scale.y *= p.squash;
      u.uOpacity.value = Math.min(1, p.age / .04) * (p.fire > 0 ? 1 : .6);   // dust: a thin veil, not solid lumps
      if (k >= 1) { scene.remove(p.m); p.m.material.dispose(); puffs.splice(i, 1); }
    }
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i], m = d.m;
      d.age += dt;
      if (d.bounced < 2) {
        d.vy -= 26 * dt;
        m.position.x += d.vx * dt; m.position.y += d.vy * dt; m.position.z += d.vz * dt;
        m.rotation.x += d.spin[0] * dt; m.rotation.y += d.spin[1] * dt; m.rotation.z += d.spin[2] * dt;
        if (d.burning && d.age < 2 && Math.random() < dt * 40) glow.emit({ x: m.position.x, y: m.position.y, z: m.position.z, vx: rand(-.4, .4), vz: rand(-.4, .4), vy: rand(0, .6), life: rand(.2, .5), size: rand(.08, .16), color: pick(FIRE), shape: SHAPE.ember });
        if (d.trail && d.age < 1.6 && Math.random() < dt * 30) smoke.emit({ x: m.position.x, y: m.position.y, z: m.position.z, vy: .3, life: rand(.5, .9), size: rand(.18, .3), grow: 1.4, alpha: .85, color: pick(SMOKE), shape: SHAPE.dot });
        if (m.position.y <= .06 && d.vy < 0) {   // lands: a dust puff, one low bounce, then lies there
          m.position.y = .06; d.bounced++;
          d.vy = d.bounced < 2 ? -d.vy * .28 : 0; d.vx *= .45; d.vz *= .45; d.spin = d.spin.map(s => s * .35);
          for (let k = 0; k < 4; k++) smoke.emit({ x: m.position.x, y: .1, z: m.position.z, vx: rand(-1, 1), vz: rand(-1, 1), vy: rand(.2, .6), drag: 2, life: rand(.5, 1), size: rand(.25, .45), grow: 1.6, alpha: .9, color: pick(DUST), shape: SHAPE.dot });
        }
      }
      if (d.age > 18) { m.material.transparent = true; m.material.opacity = Math.max(0, 1 - (d.age - 18) / 3); }   // lies there about 8 s
      if (d.age > 21) { scene.remove(m); m.geometry.dispose(); debris.splice(i, 1); }
    }
    for (let i = cards.length - 1; i >= 0; i--) {
      const c = cards[i]; c.age += dt; const k = c.age / c.life;
      if (k >= 1) { scene.remove(c.m); cards.splice(i, 1); continue; }
      c.m.material.opacity = c.fade(k);
      if (c.scale) c.m.scale.setScalar(c.scale(k));
      if (c.grow) c.m.scale.setScalar(1 + c.grow * k);
    }
    for (const c of craters.values()) {   // a thin smoke keeps rising from the crater for a while
      c.age += dt0;
      c.g.visible = c.age > .35; c.decal.material.opacity = Math.min(1, Math.max(0, (c.age - .35) / 1.2));
      if (c.age < 40 && Math.random() < dt0 * (c.age < 8 ? 6 : 1.5)) smoke.emit({ x: c.x + rand(-1, 1), y: .2, z: c.z + rand(-1, 1), vy: rand(.5, 1), sway: .4, life: rand(2, 3.5), size: rand(.4, .7), grow: 2, alpha: .6, color: pick(SMOKE), shape: SHAPE.dot });
    }
    glow.update(dt); smoke.update(dt);
    shakeT = Math.max(0, shakeT - dt);
  }
  // the camera nudge this frame (view.js adds it to the camera target): strong, short, settling
  function shake() {
    if (shakeT <= 0) return { x: 0, y: 0 };
    const a = shakeAmp * Math.pow(shakeT / .7, 2);
    return { x: Math.sin(time * 61) * a, y: Math.cos(time * 47) * a };
  }
  return { charge, cancel, blast, crater, clearCrater, update, shake };
}
