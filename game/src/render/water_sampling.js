// The source contains rocks along its bottom edge. Sample only open water, and
// crossfade repeat phases independently on both axes. A single shifted copy
// weighted by wx*wy leaves that copy's internal wrap exposed as a cross.
export const WATER_WINDOW = [0.06, 0.43, 0.88, 0.52]; // UV x/y/width/height; TextureLoader flips image y.
export const WATER_SAMPLE_GLSL = /* glsl */`
uniform vec4 uWaterWindow;
vec3 waterPhase(vec2 uv, vec2 dx, vec2 dy) {
  return textureGrad(tWater, uWaterWindow.xy + fract(uv) * uWaterWindow.zw, dx * uWaterWindow.zw, dy * uWaterWindow.zw).rgb;
}
vec3 continuousWater(vec2 uv, vec2 dx, vec2 dy) {
  vec2 f = fract(uv), w = sin(f * 3.14159265); w *= w;
  vec3 a = waterPhase(uv, dx, dy), b = waterPhase(uv + vec2(0.5, 0.0), dx, dy);
  vec3 c = waterPhase(uv + vec2(0.0, 0.5), dx, dy), d = waterPhase(uv + vec2(0.5), dx, dy);
  return mix(mix(d, c, w.x), mix(b, a, w.x), w.y);
}
`;

// Sum-of-waves slopes (GPU Gems) and view-angle sheen (Three.js Water2), adapted
// to the game's painted palette, flat chunks and constant orthographic view.
export const WATER_SURFACE_GLSL = /* glsl */`
uniform vec4 uWaterWaves[4]; // kx, kz, amplitude, angular speed
uniform vec4 uWaterMotion; // enabled, base drift x/z, small ripple distortion
uniform vec4 uWaterOptics; // texture strength, highlight strength, gloss, sheen
uniform vec3 uWaterDeep, uWaterSky, uWaterLight;
uniform sampler2D uWaterNormal0, uWaterNormal1, uWaterReflection;
uniform vec4 uWaterNormalCfg; // world tile, strength, flow speed, repeat cycle
uniform mat4 uWaterReflectionMatrix;
uniform vec4 uWaterReflectionCfg; // ready, strength, distortion, texel size
vec3 waterSurfaceNormal(vec2 p, vec2 pixelWidth, vec2 worldDx, vec2 worldDy) {
  vec2 slope = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = uWaterWaves[i];
    float filterWidth = dot(abs(w.xy), pixelWidth);
    float aa = 1.0 - smoothstep(0.35, 1.4, filterWidth);
    float phase = dot(w.xy, p) - w.w * uTime;
    slope += cos(phase) * w.z * w.xy * aa;
  }
  if (uWaterNormalCfg.y > 0.0) {
    float cycle = uWaterNormalCfg.w, halfCycle = cycle * 0.5;
    float phase0 = mod(uTime * uWaterNormalCfg.z, cycle), phase1 = mod(phase0 + halfCycle, cycle);
    float blend = abs(halfCycle - phase0) / halfCycle;
    vec2 flow = normalize(vec2(1.0, 0.25));
    vec2 uv = p / uWaterNormalCfg.x, dx = worldDx / uWaterNormalCfg.x, dy = worldDy / uWaterNormalCfg.x;
    vec3 a = textureGrad(uWaterNormal0, uv + flow * phase0, dx, dy).rgb * 2.0 - 1.0;
    vec3 b = textureGrad(uWaterNormal1, uv + flow * phase1, dx, dy).rgb * 2.0 - 1.0;
    vec2 fine = mix(a.xy / max(a.z, 0.25), b.xy / max(b.z, 0.25), blend);
    slope -= fine * uWaterNormalCfg.y;
  }
  return normalize(vec3(-slope.x, 1.0, -slope.y));
}
vec3 waterSurfaceLight(vec3 base, vec3 normal) {
  vec3 light = normalize(uWaterLight);
  vec3 halfway = normalize(light + VIEW_DIR);
  float spec = pow(max(dot(normal, halfway), 0.0), uWaterOptics.z);
  float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(normal, VIEW_DIR), 0.0), 5.0);
  vec3 color = base * (0.8 + 0.2 * max(dot(normal, light), 0.0));
  color = mix(color, uWaterSky, clamp(fresnel * uWaterOptics.w, 0.0, 0.35));
  return color + vec3(0.72, 0.82, 0.86) * spec * uWaterOptics.y;
}
// Capture is already day/night graded by the reflected scene. Composite after
// the main water grade, unpremultiplying its transparent backdrop only once.
vec4 waterSceneReflection(vec3 p, vec3 normal) {
  if (uWaterReflectionCfg.x < 0.5) return vec4(0.0);
  vec4 coord = uWaterReflectionMatrix * vec4(p, 1.0);
  vec2 uv = coord.xy / coord.w;
  vec3 tilt = vec3(normal.x, 0.0, normal.z);
  uv += vec2(dot(tilt, CAM_RIGHT), dot(tilt, CAM_UP)) * uWaterReflectionCfg.z;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return vec4(0.0);
  vec4 reflected = textureLod(uWaterReflection, uv, 0.0);
  float edge = smoothstep(0.0, 0.025, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y)));
  float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(normal, VIEW_DIR), 0.0), 5.0);
  float amount = uWaterReflectionCfg.y * (0.18 + 0.82 * fresnel) * reflected.a * edge;
  return vec4(reflected.rgb / max(reflected.a, 0.001), amount);
}
`;
