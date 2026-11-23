// Frontier weather on screen, purely visual (Tim 2026-11-20). Reads the clock and the camera, never the
// rules. src/weather_pick.js picks the weather; numbers in data/weather.json.
// - Fog: a few soft banks lying on the ground, drifting with the wind and wrapping round the view, so a
//   bank leaving one side of the screen comes back in upwind. Drawn just above the ground decals and
//   under every sprite, with a thin even veil over the sprites so buildings, trees and units fade into it.
//   At night they turn moonlit, catch lantern light, and thick fog carries a few pale ghost lights.
// - Rain and snow: GPU points in a box round the camera; all motion is in the vertex shader.
import * as THREE from 'three';
import { shared, MAX_LIGHTS } from './shading.js';
import { onFxLayer } from './bloom.js';
import { CAM_RIGHT, CAM_UP, CAM_QUAT, VIEW_DIR } from './iso.js';
import { islandBiome } from '../sim/island_art.js';
import { pickWeather, easeWeather, hash01 } from '../weather_pick.js';

const SIN_E = VIEW_DIR.y;                                           // screen-up units per ground unit, front to back
const GROUND_FWD = CAM_UP.clone().setY(0).normalize();              // screen-up as a ground direction
const TINTS = {   // day colour (lit, shadow) of each fog kind
  mist: [[0.86, 0.88, 0.87], [0.62, 0.66, 0.67]],
  frost: [[0.93, 0.95, 0.98], [0.70, 0.75, 0.82]],
  dust: [[0.83, 0.74, 0.60], [0.62, 0.52, 0.41]],
};
const UNDER_ORDER = -0.05, VEIL_ORDER = 99000, GHOST_ORDER = 99050, FALL_ORDER = 99100;

const NOISE = /* glsl */`
float wHash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float wFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * wNoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; } return s; }
// three octaves for the broad shapes (warp, ragged edge): cheaper, and the fine detail is not seen there
float wFbm3(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * wNoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; } return s * 1.143; }
`;

const BANK_VERT = /* glsl */`
varying vec2 vUv; varying vec3 vWorld;
void main() { vUv = uv - 0.5; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const BANK_FRAG = /* glsl */`
#define MAX_LIGHTS ${MAX_LIGHTS}
uniform float uTime, uNight, uAmount, uFlowT, uOpacity;
uniform vec2 uWindDir;
uniform vec3 uLit, uShade;
uniform vec4 uLightPos[MAX_LIGHTS], uLightCol[MAX_LIGHTS];
uniform int uLightCount;
uniform vec2 uCenter; uniform float uSeed, uLife, uVeil;
varying vec2 vUv; varying vec3 vWorld;
${NOISE}
void main() {
  vec2 d = vWorld.xz - uCenter;
  vec2 c = vec2(dot(d, uWindDir), dot(d, vec2(-uWindDir.y, uWindDir.x)));   // along and across the wind
  c = c * vec2(0.065, 0.11) + uSeed;                                         // wisps stretched along the wind
  float t = uFlowT;   // flow clock built up on the CPU, so a change of speed never makes the curls jump
  // the bank is a slowly bending ribbon with a ragged edge, and always fades out before the quad ends
  if (length(vUv * 2.0) >= 1.0) discard;   // outside the oval env is 0 (speed only, 2026-11-23: skips the edge noise in the quad's corners)
  vec2 e = vUv * 2.0;
  e.y += 0.32 * sin(e.x * 2.6 + uSeed + uFlowT * 0.12);
  float edge = length(e * vec2(1.0, 1.1)) + (wFbm3(c * 0.9 + 3.7) - 0.5) * 0.6;
  float env = smoothstep(1.0, 0.25, edge) * smoothstep(1.0, 0.75, length(vUv * 2.0)) * uLife;
  if (env < 0.003) discard;                                                 // outside the bank: skip the noise
  vec2 warp = vec2(wFbm3(c * 0.8 + vec2(t * 0.05, 0.0)), wFbm3(c * 0.8 + vec2(5.2, 1.3) - vec2(0.0, t * 0.04)));
  vec2 c2 = c + (warp - 0.5) * 2.2 - vec2(t * 0.09, 0.0);                    // curls stream through the bank
  float dens = wFbm(c2 * 1.3);
  float th = mix(0.6, 0.33, clamp(uAmount, 0.0, 1.0));
  // a wide ramp and a base haze spread the fog evenly instead of in thick swirls (Tim 2026-11-21);
  // the veil over the sprites carries most of it, so buildings and trees fade with the ground
  float soft = smoothstep(th - 0.25, th + 0.45, dens);
  float a = uVeil > 0.0 ? (0.45 + 0.55 * soft) * uVeil : soft * 0.35;
  a *= env * uOpacity * (1.0 + 0.1 * uNight);
  if (a < 0.004) discard;
  // light on the tops of the curls, shade in the folds
  float shade = smoothstep(0.3, 0.78, wFbm(c2 * 2.6 + 3.0));
  vec3 day = mix(uShade, uLit, shade);
  // night: moonlit blue, a slow pale breath, and warm lantern light caught in the fog
  vec3 moon = mix(vec3(0.24, 0.29, 0.40), vec3(0.50, 0.58, 0.72), shade);
  moon += vec3(0.03, 0.09, 0.09) * (0.5 + 0.5 * sin(uTime * 0.35 + uSeed * 4.0 + c.x * 0.9)) * shade;
  vec3 lamp = vec3(0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount || uNight < 0.01) break;   // lanterns only light the fog at night
    float k = clamp(1.0 - length(uLightPos[i].xz - vWorld.xz) / (uLightPos[i].w * 1.3), 0.0, 1.0);
    lamp += uLightCol[i].rgb * (k * k * uLightCol[i].a);
  }
  vec3 col = mix(day, moon + lamp * 0.35, uNight);   // a soft lantern tint, not orange swirls
  gl_FragColor = vec4(col, min(a, 0.6));
}`;

const GHOST_FRAG = /* glsl */`
uniform float uAlpha, uSeed, uTime;
varying vec2 vUv; varying vec3 vWorld;
void main() {
  vec2 p = vUv * 2.0;
  // a teardrop: round below, drawn up into a flickering tail
  float tail = max(0.0, p.y) ;
  vec2 q = vec2(p.x * (1.0 + tail * 1.6 + 0.25 * sin(uTime * 9.0 + uSeed * 7.0 + p.y * 6.0)), p.y * 0.85 + 0.15);
  float r = length(q);
  float core = exp(-r * r * 12.0), halo = exp(-r * r * 2.6) * 0.6;
  float flick = 0.8 + 0.2 * sin(uTime * 13.0 + uSeed * 31.0) * sin(uTime * 5.3 + uSeed);
  float a = (core + halo) * uAlpha * flick;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vec3(0.45, 0.80, 1.0), vec3(0.92, 1.0, 1.0), core), a);
}`;

// rain, splashes and snow: points wrapped in a box (side uBox) round the camera; seeds in aSeed (0..1 x4)
const FALL_VERT = /* glsl */`
uniform float uTime, uFallT, uBox, uHeight, uFall, uShow, uSize, uDpr, uSway;
uniform vec2 uCenter, uDrift;
attribute vec4 aSeed;
varying float vShow; varying float vSeed;
// wrap a ground point into the box seen on screen (axes screen-right and screen-up on the ground, so no corner is missed)
uniform vec2 uAxisU, uAxisV, uBoxUV; uniform float uOffV;
vec2 wrapView(vec2 s) {   // s: position along (uAxisU, uAxisV) in the world
  vec2 c = vec2(dot(uCenter, uAxisU), dot(uCenter, uAxisV)) + vec2(0.0, uOffV);
  vec2 r = mod(s - c + uBoxUV * 0.5, uBoxUV) - uBoxUV * 0.5 + c;
  return uAxisU * r.x + uAxisV * r.y;
}
void main() {
  vSeed = aSeed.w;
  float span = uHeight / uFall;                                           // seconds to fall the whole height
  float fall = fract(aSeed.y + uFallT * (0.8 + 0.4 * aSeed.w));            // uFallT: falls so far, built up on the CPU so a speed change never jumps
  vec2 move = uDrift * fall * span + vec2(sin(uTime * 0.9 + aSeed.w * 40.0), cos(uTime * 0.7 + aSeed.x * 30.0)) * uSway;
  vec2 p = wrapView(aSeed.xz * uBoxUV + vec2(dot(move, uAxisU), dot(move, uAxisV)));
  vec3 w = vec3(p.x, uHeight * (1.0 - fall), p.y);
  vShow = step(fract(aSeed.x * 61.7 + aSeed.y * 13.3), uShow) * smoothstep(0.0, 0.08, fall) * smoothstep(1.0, 0.9, fall);
  gl_PointSize = vShow > 0.0 ? uSize * (0.7 + 0.6 * aSeed.w) * uDpr : 0.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const RAIN_FRAG = /* glsl */`
uniform vec2 uSlant; uniform vec3 uColor; uniform float uAlpha;
varying float vShow; varying float vSeed;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float across = abs(q.x * uSlant.y - q.y * uSlant.x), along = abs(dot(q, uSlant));
  float a = (1.0 - smoothstep(0.012, 0.05, across)) * smoothstep(0.48, 0.1, along) * vShow * uAlpha * (0.6 + 0.4 * vSeed);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;
const SNOW_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uAlpha;
varying float vShow; varying float vSeed;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.25, r) * vShow * uAlpha * (0.65 + 0.35 * vSeed);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;
// splashes: a ring on the ground, each at a new place every cycle
const SPLASH_VERT = /* glsl */`
uniform float uTime, uBox, uShow, uSize, uDpr;
uniform vec2 uCenter;
attribute vec4 aSeed;
varying float vPhase; varying float vShow;
// wrap a ground point into the box seen on screen (axes screen-right and screen-up on the ground, so no corner is missed)
uniform vec2 uAxisU, uAxisV, uBoxUV; uniform float uOffV;
vec2 wrapView(vec2 s) {   // s: position along (uAxisU, uAxisV) in the world
  vec2 c = vec2(dot(uCenter, uAxisU), dot(uCenter, uAxisV)) + vec2(0.0, uOffV);
  vec2 r = mod(s - c + uBoxUV * 0.5, uBoxUV) - uBoxUV * 0.5 + c;
  return uAxisU * r.x + uAxisV * r.y;
}
float h1(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float period = 0.45 + 0.4 * aSeed.w, k = uTime / period + aSeed.y, cyc = floor(k);
  vPhase = fract(k);
  vec2 p = wrapView(vec2(h1(cyc * 12.9898 + aSeed.x * 78.233), h1(cyc * 39.346 + aSeed.z * 11.135)) * uBoxUV);
  vShow = step(aSeed.z, uShow);
  gl_PointSize = vShow > 0.0 ? uSize * uDpr : 0.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(p.x, 0.02, p.y, 1.0);
}`;
const SPLASH_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uAlpha;
varying float vPhase; varying float vShow;
void main() {
  vec2 q = (gl_PointCoord - 0.5) * vec2(2.0, 2.0 / ${SIN_E.toFixed(4)});   // a ring lying on the ground
  float r = length(q), ring = 1.0 - smoothstep(0.0, 0.14, abs(r - vPhase * 0.9));
  float a = ring * (1.0 - vPhase) * vShow * uAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export function createWeather({ scene, camera, renderer, world, cfg }) {
  if (!cfg || !world) return null;
  const rand = Math.random;
  const common = {   // one set shared by every fog material
    uTime: shared.uTime, uNight: shared.uNight, uLightPos: shared.uLightPos, uLightCol: shared.uLightCol, uLightCount: shared.uLightCount,
    uAmount: { value: 0 }, uFlowT: { value: 0 }, uOpacity: { value: cfg.fog.opacity }, uWindDir: { value: new THREE.Vector2(1, 0) },
    uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() },
  };
  const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const bankMat = veil => new THREE.ShaderMaterial({
    uniforms: { ...common, uCenter: { value: new THREE.Vector2() }, uSeed: { value: 0 }, uLife: { value: 1 }, uVeil: { value: veil } },
    vertexShader: BANK_VERT, fragmentShader: BANK_FRAG, transparent: true, depthTest: false, depthWrite: false });
  const banks = Array.from({ length: cfg.fog.banks }, () => {
    const under = new THREE.Mesh(plane, bankMat(0)), over = new THREE.Mesh(plane, bankMat(cfg.fog.veil));
    under.renderOrder = UNDER_ORDER; over.renderOrder = VEIL_ORDER;
    for (const m of [under, over]) { m.frustumCulled = false; m.visible = false; scene.add(m); }
    return { under, over, x: 0, z: 0, len: 40, wid: 18, seed: 0, life: 0, placed: false };
  });

  // ghost lights (hitodama): little teardrop flames in thick night fog
  const ghostGeo = new THREE.PlaneGeometry(1, 1);
  const ghosts = Array.from({ length: cfg.fog.ghostLights }, (_, i) => {
    const m = new THREE.Mesh(ghostGeo, new THREE.ShaderMaterial({ uniforms: { uTime: shared.uTime, uAlpha: { value: 0 }, uSeed: { value: i * 1.7 + 0.3 } },
      vertexShader: BANK_VERT, fragmentShader: GHOST_FRAG, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.quaternion.copy(CAM_QUAT); m.scale.setScalar(1.3); m.renderOrder = GHOST_ORDER; m.frustumCulled = false; m.visible = false;
    onFxLayer(m); scene.add(m);
    return { m, age: 0, life: 0, x: 0, z: 0, y: 1, wander: rand() * 6 };
  });
  let ghostWait = 4;

  const seeds = n => { const a = new Float32Array(n * 4); for (let i = 0; i < a.length; i++) a[i] = rand(); const g = new THREE.BufferGeometry();
    g.setAttribute('aSeed', new THREE.BufferAttribute(a, 4)); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); return g; };
  const fallUniforms = () => ({ uTime: shared.uTime, uFallT: { value: 0 }, uBox: { value: 70 }, uHeight: { value: 14 }, uFall: { value: 20 }, uShow: { value: 0 }, uSize: { value: 20 },
    uDpr: { value: 1 }, uSway: { value: 0 }, uCenter: { value: new THREE.Vector2() }, uDrift: { value: new THREE.Vector2() },
    uAxisU: { value: new THREE.Vector2(CAM_RIGHT.x, CAM_RIGHT.z).normalize() }, uAxisV: { value: new THREE.Vector2(GROUND_FWD.x, GROUND_FWD.z) },
    uBoxUV: { value: new THREE.Vector2(70, 70) }, uOffV: { value: 0 },
    uColor: { value: new THREE.Color() }, uAlpha: { value: 0.4 }, uSlant: { value: new THREE.Vector2(0, 1) } });
  const points = (n, vert, frag) => { const p = new THREE.Points(seeds(n), new THREE.ShaderMaterial({ uniforms: fallUniforms(), vertexShader: vert, fragmentShader: frag,
    transparent: true, depthTest: false, depthWrite: false })); p.frustumCulled = false; p.renderOrder = FALL_ORDER; p.visible = false; scene.add(p); return p; };
  const rain = points(cfg.rain.drops, FALL_VERT, RAIN_FRAG), splash = points(cfg.rain.splashes, SPLASH_VERT, SPLASH_FRAG), snow = points(cfg.snow.flakes, FALL_VERT, SNOW_FRAG);
  splash.renderOrder = UNDER_ORDER + 0.01;

  let now = null, biome = 'forest', biomeAt = -1, wasActive = false;
  const local = new THREE.Vector2(), windDir = new THREE.Vector2();

  function placeBank(b, cx, cz, hw, hd, scale, anywhere) {
    b.len = (cfg.fog.length[0] + rand() * (cfg.fog.length[1] - cfg.fog.length[0])) * scale;
    b.wid = (cfg.fog.width[0] + rand() * (cfg.fog.width[1] - cfg.fog.width[0])) * scale;
    b.seed = rand() * 50;
    if (anywhere) {   // anywhere in the wrap box round the view
      const u = (rand() * 2 - 1) * (hw + b.len * 0.3), v = (rand() * 2 - 1) * (hd + b.len * 0.3);
      b.x = cx + CAM_RIGHT.x * u + GROUND_FWD.x * v; b.z = cz + CAM_RIGHT.z * u + GROUND_FWD.z * v;
    }
    b.placed = true;
  }

  function hide() { for (const b of banks) b.under.visible = b.over.visible = false; for (const g of ghosts) g.m.visible = false; rain.visible = splash.visible = snow.visible = false; }

  // cam: ground point the camera looks at; active: the frontier is on screen; on: the Weather setting
  function update(state, cam, active, dt, on) {
    if (!active || !on) { if (wasActive) hide(); wasActive = false; return; }
    const time = shared.uTime.value;
    if (time - biomeAt > 1 || biomeAt < 0) { biome = islandBiome(world, cam.x, cam.z); biomeAt = time; }
    const target = pickWeather(cfg, biome, state.clock?.day, !!state.night);
    now = easeWeather(wasActive ? now : null, target, dt, cfg.fadeSeconds);
    if (!wasActive) for (const b of banks) b.placed = false;
    wasActive = true;

    // the ground seen: half width along screen-right, half depth along screen-up
    const hw = camera.right / camera.zoom, hd = camera.top / camera.zoom / SIN_E, scale = Math.max(1, hw / 26);
    windDir.set(Math.cos(now.wind.angle), Math.sin(now.wind.angle));
    const tint = TINTS[now.tint] || TINTS.mist;
    common.uLit.value.setRGB(...tint[0]); common.uShade.value.setRGB(...tint[1]);
    common.uAmount.value = Math.min(1, now.fog); common.uWindDir.value.copy(windDir);
    common.uFlowT.value += dt * (1 + Math.max(0, now.snow - 1) * 2);   // a snowstorm whips the banks into spindrift
    const fogOn = now.fog > 0.02;
    const vx = windDir.x * now.wind.speed, vz = windDir.y * now.wind.speed;   // the kind's wind (snowstorm x1.8) is already in the speed
    for (const b of banks) {
      b.under.visible = b.over.visible = fogOn;
      if (!fogOn) continue;
      if (!b.placed) placeBank(b, cam.x, cam.z, hw, hd, scale, true);
      b.x += vx * dt; b.z += vz * dt;
      // wrap round the view: a bank fully off one side comes back in on the other, with a new shape
      const mu = hw + b.len * 0.5 + 2, mv = hd + b.len * 0.5 + 2;
      let u = (b.x - cam.x) * CAM_RIGHT.x + (b.z - cam.z) * CAM_RIGHT.z, v = (b.x - cam.x) * GROUND_FWD.x + (b.z - cam.z) * GROUND_FWD.z;
      if (Math.abs(u) > mu || Math.abs(v) > mv) {
        if (Math.abs(u) > mu * 3 || Math.abs(v) > mv * 3) { placeBank(b, cam.x, cam.z, hw, hd, scale, true); b.life = 0; }   // the camera jumped
        else {
          if (Math.abs(u) > mu) u -= Math.sign(u) * 2 * mu;
          if (Math.abs(v) > mv) v -= Math.sign(v) * 2 * mv;
          b.x = cam.x + CAM_RIGHT.x * u + GROUND_FWD.x * v; b.z = cam.z + CAM_RIGHT.z * u + GROUND_FWD.z * v;
          placeBank(b, cam.x, cam.z, hw, hd, scale, false);
        }
      }
      b.life = Math.min(1, b.life + dt / 3);
      for (const m of [b.under, b.over]) {
        m.position.set(b.x, 0.05, b.z); m.scale.set(b.len, 1, b.wid); m.rotation.y = -now.wind.angle;
        const un = m.material.uniforms; un.uCenter.value.set(b.x, b.z); un.uSeed.value = b.seed; un.uLife.value = b.life;
      }
    }

    // ghost lights: only in thick fog at night
    const haunt = fogOn && now.fog > 0.7 ? shared.uNight.value : 0;   // fog and snowstorm only, not mist, drizzle or haze
    ghostWait -= dt;
    for (const g of ghosts) {
      if (g.life <= 0) {
        g.m.visible = false;
        if (haunt > 0.6 && ghostWait <= 0 && rand() < 0.5) {   // rise somewhere in a bank on screen
          const b = banks[Math.floor(rand() * banks.length)];
          local.set((rand() - 0.5) * b.len * 0.5, (rand() - 0.5) * b.wid * 0.5);
          g.x = b.x + local.x; g.z = b.z + local.y;
          const u = (g.x - cam.x) * CAM_RIGHT.x + (g.z - cam.z) * CAM_RIGHT.z, v = (g.x - cam.x) * GROUND_FWD.x + (g.z - cam.z) * GROUND_FWD.z;
          if (Math.abs(u) < hw * 0.9 && Math.abs(v) < hd * 0.9) { g.age = 0; g.life = 12 + rand() * 12; g.y = 0.7 + rand() * 0.8; ghostWait = 3 + rand() * 6; }
        }
        continue;
      }
      g.age += dt;
      if (g.age >= g.life) { g.life = 0; g.m.visible = false; continue; }
      g.wander += dt * 0.4;
      g.x += (vx * 0.25 + Math.sin(g.wander * 1.3) * 0.5) * dt; g.z += (vz * 0.25 + Math.cos(g.wander) * 0.5) * dt;
      g.m.position.set(g.x, g.y + Math.sin(g.age * 1.1 + g.wander) * 0.25, g.z);
      g.m.material.uniforms.uAlpha.value = Math.min(1, g.age / 4, (g.life - g.age) / 4) * haunt * 0.85;
      g.m.visible = true;
    }

    // rain and snow: a box round the camera big enough for the view, everything sized to the view so it looks the same at any zoom
    const box = 2 * Math.max(hw, hd) + 6, k = box / 70, dpr = renderer.getPixelRatio(), night = shared.uNight.value;
    // the ground box that covers the screen: a drop high up shows higher on screen, so the box reaches further toward the camera
    const cosE = Math.sqrt(1 - SIN_E * SIN_E), H = 14 * k;
    const fallSet = (p, show, fall, size, alpha, day, dark, sway, ground = false) => {
      p.visible = show > 0.01;
      if (!p.visible) return;
      const un = p.material.uniforms;
      un.uBox.value = box; un.uBoxUV.value.set(2 * hw + 4 * k, ground ? 2 * hd + 4 * k : 2 * hd + H * cosE / SIN_E + 4 * k); un.uOffV.value = ground ? 0 : -H * cosE / SIN_E * 0.5;
      un.uHeight.value = 14 * k; un.uFall.value = fall * k; un.uFallT.value += dt * fall / 14; un.uShow.value = show; un.uSize.value = size; un.uDpr.value = dpr;
      un.uSway.value = sway * k; un.uCenter.value.set(cam.x, cam.z); un.uDrift.value.set(vx * k, vz * k); un.uAlpha.value = alpha;
      un.uColor.value.setRGB(...day).lerp(new THREE.Color(...dark), night);
    };
    fallSet(rain, Math.min(1, now.rain), cfg.rain.fall, 18, 0.3, [0.78, 0.82, 0.88], [0.50, 0.58, 0.72], 0);
    fallSet(splash, Math.min(1, now.rain), 1, 14, 0.35, [0.82, 0.86, 0.92], [0.50, 0.58, 0.72], 0, true);
    fallSet(snow, Math.min(1, now.snow / 1.6), cfg.snow.fall * (1 + Math.max(0, now.snow - 1)), 7, 0.9, [1, 1, 1], [0.70, 0.76, 0.90], 0.5);
    if (rain.visible) {   // streaks lean with the wind as seen on screen
      const sx = (vx * CAM_RIGHT.x + vz * CAM_RIGHT.z) / cfg.rain.fall, dir = new THREE.Vector2(THREE.MathUtils.clamp(sx, -0.3, 0.3), 1).normalize();
      rain.material.uniforms.uSlant.value.copy(dir);
    }
  }

  return { update, current: () => now && { ...now, biome } };
}
