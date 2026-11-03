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
vec3 waterSurfaceNormal(vec2 p, vec2 pixelWidth) {
  vec2 slope = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = uWaterWaves[i];
    float filterWidth = dot(abs(w.xy), pixelWidth);
    float aa = 1.0 - smoothstep(0.8, 3.14, filterWidth);
    float phase = dot(w.xy, p) - w.w * uTime;
    slope += cos(phase) * w.z * w.xy * aa;
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
`;
