// Shaders for painted art: day/night grading, lantern light and the see-through cutaway.
// All colour math is done on the painted (sRGB) values, like a 2D paint program.
import * as THREE from 'three';
import { VIEW_DIR, CAM_UP, CAM_RIGHT } from './iso.js';

export const MAX_LIGHTS = 24;

// Shared by every material, so changing a value here changes the whole scene
export const shared = {
  uNight: { value: 0 },
  uTime: { value: 0 },
  uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
  uLightCol: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
  uLightCount: { value: 0 },
  // fog of war (render/fog.js): per world cell r = in sight, g = explored; off until fog.js turns it on
  uFog: { value: new THREE.DataTexture(new Uint8Array([255, 255, 0, 255]), 1, 1) },
  uFogRect: { value: new THREE.Vector4(0, 0, 1, 1) },   // minX, minZ, width, depth of the grid
  uFogOn: { value: 0 },
};
shared.uFog.value.needsUpdate = true;

// Fog of war: (in sight, explored) at a ground point; rooms (far east, x 300+) have no fog
const FOG = /* glsl */`
uniform sampler2D uFog;
uniform vec4 uFogRect;
uniform float uFogOn;
vec2 fogAt(vec2 p) {
  if (uFogOn < 0.5 || p.x > 200.0) return vec2(1.0);
  vec2 uv = (p - uFogRect.xy) / uFogRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec2(0.0);
  return texture2D(uFog, uv).rg;
}
// never explored: near black; explored but out of sight: dimmed and greyed
vec3 fogged(vec3 col, vec2 p) {
  vec2 f = fogAt(p);
  vec3 dim = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 0.55) * 0.5 + vec3(0.015, 0.02, 0.04);
  return mix(mix(vec3(0.027, 0.031, 0.043), dim, f.g), col, f.r);
}
// how much of an additive glow shows through the fog
float fogGlow(vec2 p) { vec2 f = fogAt(p); return mix(f.g * 0.35, 1.0, f.r); }
`;
// for glows, flames and door rings: the ground point under the quad's centre, along the view direction
const v0 = VIEW_DIR;
const FOG_QUAD = `${FOG}
const vec3 VIEW_DIR_FOG = vec3(${v0.x.toFixed(6)}, ${v0.y.toFixed(6)}, ${v0.z.toFixed(6)});
uniform mat4 modelMatrix;
vec2 fogGround() { vec3 q = modelMatrix[3].xyz; return q.xz - VIEW_DIR_FOG.xz * (q.y / VIEW_DIR_FOG.y); }`;

const v = VIEW_DIR, u = CAM_UP, r = CAM_RIGHT;
const LIGHTING = /* glsl */`
#define MAX_LIGHTS ${MAX_LIGHTS}
const vec3 VIEW_DIR = vec3(${v.x.toFixed(6)}, ${v.y.toFixed(6)}, ${v.z.toFixed(6)});
const vec3 CAM_UP = vec3(${u.x.toFixed(6)}, ${u.y.toFixed(6)}, ${u.z.toFixed(6)});
const vec3 CAM_RIGHT = vec3(${r.x.toFixed(6)}, ${r.y.toFixed(6)}, ${r.z.toFixed(6)});
uniform float uNight;
uniform float uTime;
uniform vec4 uLightPos[MAX_LIGHTS];   // xyz, radius
uniform vec4 uLightCol[MAX_LIGHTS];   // rgb, strength
uniform int uLightCount;
${FOG}

// upright = painted sprite standing up facing the camera; otherwise the ground
vec3 lanternLight(vec3 P, bool upright) {
  vec3 lit = vec3(0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec3 d = uLightPos[i].xyz - P;
    float dist;
    if (upright) {
      // distance across the screen, with less light from lamps far behind the sprite
      float dz = dot(d, VIEW_DIR);
      // and less on what sits high above the lamp (roofs), since lamps light walls and ground
      float above = max(0.0, -dot(d, CAM_UP) - 0.5);
      dist = length(d - VIEW_DIR * dz) + max(0.0, -dz - 1.5) * 0.7 + max(0.0, dz - 5.0) * 0.3 + above * 0.9;
    } else {
      dist = length(d);
    }
    float a = clamp(1.0 - dist / uLightPos[i].w, 0.0, 1.0);
    lit += uLightCol[i].rgb * (a * a * uLightCol[i].a);
  }
  return lit;
}

uniform float uIndoor;   // 1 = inside a building: always lamp-lit, whatever the time of day

vec3 grade(vec3 base, vec3 P, bool upright, vec3 selfLight) {
  float night = max(uNight, uIndoor);
  // day: slightly cool and muted, never bright
  vec3 day = mix(vec3(dot(base, vec3(0.299, 0.587, 0.114))), base, 0.9) * vec3(0.95, 0.97, 1.0);
  if (night < 0.001) return day;
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  // painted lamps, lit windows and fires keep glowing at night
  float emis = smoothstep(0.45, 0.8, lum) * smoothstep(0.06, 0.28, base.r - base.b);
  vec3 moon = vec3(0.19, 0.24, 0.37) + selfLight;
  vec3 tint = mix(vec3(lum), base, 0.6);
  vec3 lit = tint * (moon + lanternLight(P, upright)) + base * emis * 1.15;
  return mix(day, lit, night);
}
`;

const SPRITE_VERT = /* glsl */`
const vec3 VIEW_DIR = vec3(${v.x.toFixed(6)}, ${v.y.toFixed(6)}, ${v.z.toFixed(6)});
uniform vec4 uFrame;   // uv offset (xy) and scale (zw) for spritesheets
uniform vec4 uDepthAt; // xyz: ground point the sprite stands on; w > 0: test depth against 3D rooms, pulled this far toward the camera
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uFrame.xy + uv * uFrame.zw;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  if (uDepthAt.w > 0.0) {
    // depth as if the sprite were an upright card standing on its ground point,
    // so it passes in front of and behind 3D walls and furniture correctly
    vec3 n = normalize(vec3(VIEW_DIR.x, 0.0, VIEW_DIR.z));
    vec3 F = uDepthAt.xyz + n * uDepthAt.w;
    vec3 q = w.xyz - VIEW_DIR * (dot(w.xyz - F, n) / dot(VIEW_DIR, n));
    vec4 c = projectionMatrix * viewMatrix * vec4(q, 1.0);
    gl_Position.z = c.z / c.w * gl_Position.w;
  }
}`;

const SPRITE_FRAG = /* glsl */`
${LIGHTING}
uniform sampler2D uMap;
uniform float uOpacity;
uniform float uCut;          // 0..1, see-through hole around the hero
uniform vec3 uCutCenter;
uniform float uCutRadius;
uniform vec3 uSelfLight;
uniform vec3 uTint;          // multiplies the art (recolours a shared piece to match a room)
uniform float uFlash;        // 0..1 white hit flash
uniform vec4 uClip;          // near interior walls: ground point xyz on the wall, w = height to keep
uniform float uClipSlope;    // screen slope of the wall's foot
uniform vec4 uFogAt;         // w > 0: darken by the fog of war at ground point xy (scenery)
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.02) discard;
  t.rgb *= uTint;
  float edge = 0.0;
  if (uClip.w > 0.0) {
    vec3 s = vWorld - uClip.xyz;
    float h = (dot(s, CAM_UP) - uClipSlope * dot(s, CAM_RIGHT)) / ${Math.cos(Math.atan(0.5)).toFixed(6)};
    if (h > uClip.w) discard;
    edge = smoothstep(uClip.w - 0.08, uClip.w, h);   // dark cut line along the top
  }
  float a = t.a * uOpacity;
  if (uCut > 0.0) {
    vec3 d = vWorld - uCutCenter;
    d -= VIEW_DIR * dot(d, VIEW_DIR);
    float k = smoothstep(uCutRadius * 0.45, uCutRadius, length(d));
    a *= mix(1.0, mix(0.12, 0.88, k), uCut);
  }
  vec3 c = grade(t.rgb, vWorld, true, uSelfLight) * (1.0 - edge * 0.7);
  if (uFogAt.w > 0.0) c = fogged(c, uFogAt.xy);
  gl_FragColor = vec4(mix(c, vec3(1.0, 0.97, 0.9), uFlash), a);
}`;

// The parts of a sprite that something solid hides, drawn as a faint silhouette
export function hiddenMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SPRITE_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      varying vec2 vUv;
      void main() {
        float a = texture2D(uMap, vUv).a;
        if (a < 0.4) discard;
        gl_FragColor = vec4(0.85, 0.78, 0.64, 0.16);
      }`,
    transparent: true, depthTest: true, depthWrite: false,
    depthFunc: THREE.GreaterDepth,
  });
}

export function spriteMaterial(map, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uMap: { value: map },
      uFrame: { value: new THREE.Vector4(0, 0, 1, 1) },
      uOpacity: { value: 1 },
      uCut: { value: 0 },
      uCutCenter: { value: new THREE.Vector3() },
      uCutRadius: { value: 3.4 },
      uSelfLight: { value: new THREE.Color(0, 0, 0) },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uFlash: { value: 0 },
      uIndoor: { value: 0 },
      uClip: { value: new THREE.Vector4(0, 0, 0, 0) },
      uClipSlope: { value: 0 },
      uDepthAt: { value: new THREE.Vector4(0, 0, 0, 0) },
      uFogAt: { value: new THREE.Vector4(0, 0, 0, 0) },
      ...extra,
    },
    vertexShader: SPRITE_VERT,
    fragmentShader: SPRITE_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

// ---------- ground: several tiled textures blended by a painted weight map ----------
const GROUND_VERT = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const GROUND_FRAG = /* glsl */`
${LIGHTING}
uniform sampler2D uSplatA;   // r paving, g gravel, b planks, a grass
uniform sampler2D uSplatB;   // r sand, g mud, b water, a dry grass
uniform sampler2D tDirt, tPaving, tGravel, tPlanks, tGrass, tSand, tMud, tWater, tDryGrass;
uniform vec4 uBounds;        // minX, minZ, sizeX, sizeZ of the weight map
uniform vec2 uTile;          // world size of one texture tile
varying vec3 vWorld;

vec3 tex(sampler2D t, vec2 uv) { return texture2D(t, uv).rgb; }

void main() {
  vec2 p = vWorld.xz;
  vec2 uv = p / uTile;
  vec3 dirt = tex(tDirt, uv);
  // roughen the borders between ground types with the dirt texture
  vec2 jitter = (dirt.rg - 0.35) * 0.012;
  vec2 suv = (p - uBounds.xy) / uBounds.zw + jitter;
  vec4 A = texture2D(uSplatA, suv);
  vec4 B = texture2D(uSplatB, suv);

  // water: two drifting layers, dark and a little glossy
  vec2 w1 = uv * 0.6 + vec2(uTime * 0.012, uTime * 0.02);
  vec2 w2 = uv * 0.9 - vec2(uTime * 0.017, -uTime * 0.008);
  vec3 water = (tex(tWater, w1) + tex(tWater, w2)) * 0.5;
  water = mix(water, vec3(0.04, 0.07, 0.09), 0.35);

  // weights add up to at most 1; whatever is left over is dirt
  float rest = max(0.0, 1.0 - dot(A, vec4(1.0)) - dot(B, vec4(1.0)));
  vec3 col = dirt * rest
    + tex(tPaving, uv * 1.5) * A.r + tex(tGravel, uv * 1.2) * A.g
    + tex(tPlanks, vec2(uv.y, uv.x) * vec2(1.0, 0.8)) * A.b + tex(tGrass, uv) * A.a
    + tex(tSand, uv) * B.r + tex(tMud, uv * 0.9) * B.g + water * B.b + tex(tDryGrass, uv * 1.1) * B.a;

  vec3 g = grade(col, vWorld, false, vec3(0.0));
  // lantern light shimmers on the water at night
  float ripple = 0.6 + 0.4 * sin(p.x * 3.1 + uTime * 1.7) * sin(p.y * 2.3 - uTime * 1.3);
  g += B.b * (1.0 - A.b) * uNight * lanternLight(vWorld, false) * 0.35 * ripple;
  gl_FragColor = vec4(fogged(g, p), 1.0);
}`;

export function groundMaterial(textures, splatA, splatB, bounds, tile) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uSplatA: { value: splatA }, uSplatB: { value: splatB },
      uBounds: { value: new THREE.Vector4(...bounds) },
      uTile: { value: new THREE.Vector2(...tile) },
      ...Object.fromEntries(Object.entries(textures).map(([k, t]) => [k, { value: t }])),
    },
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    depthWrite: false,
  });
}

// ---------- additive light glow and animated flames ----------
const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export function glowMaterial(color, seed, indoor = false) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uColor: { value: new THREE.Color(color) }, uSeed: { value: seed }, uIndoor: { value: indoor ? 1 : 0 } },
    vertexShader: QUAD_VERT,
    fragmentShader: /* glsl */`
      uniform float uNight; uniform float uTime; uniform vec3 uColor; uniform float uSeed; uniform float uIndoor;
      ${FOG_QUAD}
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float flicker = 0.88 + 0.12 * sin(uTime * 7.0 + uSeed * 13.0) * sin(uTime * 3.1 + uSeed);
        float a = pow(max(0.0, 1.0 - d), 2.2) * max(uNight, uIndoor) * flicker;
        gl_FragColor = vec4(uColor * a * fogGlow(fogGround()), 1.0);
      }`,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function flameMaterial(seed) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uSeed: { value: seed } },
    vertexShader: QUAD_VERT,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uSeed; uniform float uNight;
      ${FOG_QUAD}
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 uv = vUv;
        float t = uTime * 2.2 + uSeed * 7.0;
        float n = noise(vec2(uv.x * 5.0, uv.y * 4.0 - t * 1.6)) * 0.6 + noise(vec2(uv.x * 11.0, uv.y * 9.0 - t * 2.7)) * 0.4;
        // teardrop that narrows toward the top and sways
        float x = (uv.x - 0.5 - (uv.y * uv.y) * 0.12 * sin(t * 1.3)) / (0.36 * (1.0 - uv.y * 0.85) + 0.02);
        float body = (1.0 - x * x) * (1.0 - uv.y);
        float f = clamp(body * 1.6 + (n - 0.55) * 1.2 * uv.y - 0.15, 0.0, 1.0);
        vec3 col = mix(vec3(0.9, 0.22, 0.03), vec3(1.0, 0.78, 0.35), f * f);
        float a = smoothstep(0.0, 0.5, f) * (0.75 + 0.25 * uNight);
        gl_FragColor = vec4(col * a * fogGlow(fogGround()), 1.0);
      }`,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// Door ring on the ground (Tim OK'd the mock 2026-10-17): a crisp outer ring with four
// notches, a slowly turning dashed inner ring, a faint ember glow inside and a bright
// spot sweeping round the rim, all gently pulsing
export const doorMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: shared.uTime, uFog: shared.uFog, uFogRect: shared.uFogRect, uFogOn: shared.uFogOn },
  vertexShader: QUAD_VERT,
  fragmentShader: /* glsl */`
    uniform float uTime; varying vec2 vUv;
    ${FOG_QUAD}
    void main() {
      vec2 p = vUv - 0.5;
      float d = length(p) * 2.0, ang = atan(p.y, p.x), t = uTime;
      float pulse = 0.85 + 0.15 * sin(t * 2.5);
      float rim = abs(d - 0.86);
      float outer = smoothstep(0.035, 0.0, rim);
      float halo = smoothstep(0.30, 0.0, rim) * 0.45;
      float dash = step(0.35, cos(ang * 12.0 - t * 0.8)) * smoothstep(0.03, 0.0, abs(d - 0.66));
      float notch = step(0.97, cos(ang * 4.0 + t * 0.3)) * smoothstep(0.09, 0.0, rim) * 1.2;
      float fill = pow(clamp(1.0 - d / 0.86, 0.0, 1.0), 1.5) * 0.28;
      float sweep = pow(max(cos(ang - t * 1.6), 0.0), 8.0) * smoothstep(0.12, 0.0, rim) * 0.9;
      vec3 gold = vec3(1.0, 0.78, 0.38), pale = vec3(1.0, 0.92, 0.7), ember = vec3(1.0, 0.45, 0.2);
      vec3 col = (pale * (outer * 1.5 + notch * 1.4 + sweep) + gold * (halo + dash * 1.1) + ember * fill) * pulse;
      col *= fogGlow(fogGround());
      gl_FragColor = vec4(col, min(1.0, max(col.r, max(col.g, col.b))));
    }`,
  transparent: true, depthTest: false, depthWrite: false,
  blending: THREE.AdditiveBlending,   // reads as light on both the day and night ground
});

export const shadowMaterial = new THREE.ShaderMaterial({
  vertexShader: QUAD_VERT,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      float d = length(vUv - 0.5) * 2.0;
      float ring = smoothstep(0.1, 0.0, abs(d - 0.82)) * 0.45;   // faint marker so the hero reads on dark ground
      gl_FragColor = vec4(vec3(0.95, 0.72, 0.38) * ring, max(0.42 * smoothstep(0.9, 0.15, d), ring));
    }`,
  transparent: true, depthTest: true, depthWrite: false,   // hidden under 3D furniture; nothing else writes depth
});

// ---------- 3D interiors: textured shapes lit by the same lamps ----------
const SOLID_VERT = /* glsl */`
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// Lamp light on a surface facing N, plus the cool indoor shadow light
const SOLID_LIGHT = /* glsl */`
vec3 roomLight(vec3 P, vec3 N) {
  vec3 lit = vec3(0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec3 d = uLightPos[i].xyz - P;
    float dist = length(d);
    float a = clamp(1.0 - dist / uLightPos[i].w, 0.0, 1.0);
    float facing = 0.3 + 0.7 * max(dot(N, d / max(dist, 1e-3)), 0.0);
    lit += uLightCol[i].rgb * (a * a * uLightCol[i].a * facing);
  }
  // tops catch more light than sides; of the two sides you see, +x is a little lighter
  float face = 0.74 + 0.26 * N.y + 0.08 * N.x;
  return vec3(0.33, 0.35, 0.43) * face + lit * (0.85 + 0.15 * face);
}
vec3 roomGrade(vec3 base, vec3 P, vec3 N, float glow) {
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  return mix(vec3(lum), base, 0.65) * roomLight(P, N) + base * glow;
}`;

// opts: { map, tile: [w, h] world size of one repeat (or none: use the mesh's own uv),
//   tint, detail (0 = flat average colour, 1 = full texture), glow (paper and coals light themselves),
//   uvRect: [u0, v0, u1, v1] part of the texture to use, alphaTest, side }
export function solidMaterial(opts) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uMap: { value: opts.map },
      uTile: { value: new THREE.Vector2(...(opts.tile || [0, 0])) },
      uTint: { value: new THREE.Color(opts.tint || '#ffffff') },   // may go above 1 (see gain)
      uDetail: { value: opts.detail ?? 1 },
      uGlow: { value: opts.glow || 0 },
      uUvRect: { value: new THREE.Vector4(...(opts.uvRect || [0, 0, 1, 1])) },
      uAlphaTest: { value: opts.alphaTest || 0 },
      uShadeLow: { value: opts.shadeLow ?? 1 },
      uSwap: { value: opts.swap ? 1 : 0 },
    },
    vertexShader: SOLID_VERT,
    fragmentShader: /* glsl */`
      ${LIGHTING}
      ${SOLID_LIGHT}
      uniform sampler2D uMap; uniform vec2 uTile; uniform vec3 uTint; uniform float uDetail; uniform float uGlow;
      uniform vec4 uUvRect; uniform float uAlphaTest; uniform float uShadeLow; uniform float uSwap;
      varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv;
      void main() {
        vec3 N = normalize(vNormal);
        if (!gl_FrontFacing) N = -N;
        vec2 uv;
        if (uTile.x > 0.0) {
          // world-space texturing: every surface shows the texture at the same size
          vec3 a = abs(N);
          uv = a.y > 0.5 ? vWorld.xz : a.x > 0.5 ? vec2(vWorld.z, vWorld.y) : vWorld.xy;
          if (uSwap > 0.5) uv = uv.yx;   // grain along horizontal beams
          uv /= uTile;
        } else {
          uv = mix(uUvRect.xy, uUvRect.zw, vUv);
        }
        vec4 t = texture2D(uMap, uv);
        if (t.a < uAlphaTest) discard;
        vec3 avg = texture2D(uMap, uv, 12.0).rgb;
        vec3 base = mix(avg, t.rgb, uDetail) * uTint;
        // walls darken toward the floor (soft contact shadow)
        base *= mix(uShadeLow, 1.0, smoothstep(0.0, 0.7, vWorld.y));
        gl_FragColor = vec4(roomGrade(base, vWorld, N, uGlow), 1.0);
      }`,
    side: opts.side ?? THREE.FrontSide,
  });
}

// Room floor: tatami laid in a running bond (or boards), with soft shadows along the
// far walls and under furniture. shadows: up to 24 world rects [minX, minZ, maxX, maxZ, strength]
export function roomFloorMaterial(map, { origin, size, pattern = 'tatami', tint = '#ffffff', shadows = [] }) {
  const MAX = 24;
  const rects = Array.from({ length: MAX }, (_, i) => new THREE.Vector4(...(shadows[i] ? shadows[i].slice(0, 4) : [0, 0, 0, 0])));
  const strength = Array.from({ length: MAX }, (_, i) => shadows[i]?.[4] ?? 0);
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uMap: { value: map }, uOrigin: { value: new THREE.Vector2(origin.x, origin.z) },
      uSize: { value: new THREE.Vector2(...size) }, uTint: { value: new THREE.Color(tint) },
      uShadow: { value: rects }, uShadowK: { value: strength },
    },
    vertexShader: SOLID_VERT,
    fragmentShader: /* glsl */`
      ${LIGHTING}
      ${SOLID_LIGHT}
      #define MAX_SHADOWS ${MAX}
      uniform sampler2D uMap; uniform vec2 uOrigin; uniform vec2 uSize; uniform vec3 uTint;
      uniform vec4 uShadow[MAX_SHADOWS]; uniform float uShadowK[MAX_SHADOWS];
      varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv;
      float hash(float n) { return fract(sin(n * 91.345) * 47453.12); }
      void main() {
        vec2 p = vWorld.xz - uOrigin;
        vec3 col;
        ${pattern === 'tatami' ? `
        // 2 x 1 cell mats in 2 x 2 blocks, turned a quarter in every other block
        vec2 b = floor(p / 2.0), q = p - b * 2.0;
        if (mod(b.x + b.y, 2.0) > 0.5) q = q.yx;
        vec2 m = vec2(q.x, fract(q.y));
        float id = dot(b, vec2(7.0, 13.0)) + floor(q.y);
        col = texture2D(uMap, vec2(m.x / 2.0, m.y)).rgb * (0.9 + 0.12 * hash(id));
        // a thin muted border (heri) along the long sides, a faint seam at the short ends
        float heri = 1.0 - smoothstep(0.025, 0.04, min(m.y, 1.0 - m.y));
        col = mix(col, col * vec3(0.62, 0.55, 0.46), heri);
        col *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.025, min(m.x, 2.0 - m.x)));` : `
        // boards 0.5 wide running along x, with staggered ends
        float row = floor(p.y * 2.0);
        float cx = p.x + hash(row) * 3.0;
        vec2 m = vec2(mod(cx, 3.0), fract(p.y * 2.0));
        col = texture2D(uMap, vec2(m.y * 0.25 + hash(row) * 0.7, m.x / 3.0)).rgb * (0.85 + 0.2 * hash(floor(cx / 3.0) + row * 7.0));
        col *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.04, min(m.y, 1.0 - m.y)));
        col *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.03, min(m.x, 3.0 - m.x)));`}
        col *= uTint;
        // contact shadow along the two tall walls
        float wall = min(p.x, p.y);
        col *= mix(0.8, 1.0, smoothstep(0.0, 0.7, wall));
        // soft shadows under furniture
        for (int i = 0; i < MAX_SHADOWS; i++) {
          if (uShadowK[i] <= 0.0) continue;
          vec4 r = uShadow[i];
          vec2 d = max(max(r.xy - vWorld.xz, vWorld.xz - r.zw), 0.0);
          col *= 1.0 - uShadowK[i] * (1.0 - smoothstep(0.0, 0.35, length(d)));
        }
        gl_FragColor = vec4(roomGrade(col, vWorld, vec3(0.0, 1.0, 0.0), 0.0), 1.0);
      }`,
    depthWrite: false,
  });
}
