// The source contains rocks along its bottom edge. Sample only open water, and
// crossfade repeat phases independently on both axes. A single shifted copy
// weighted by wx*wy leaves that copy's internal wrap exposed as a cross.
export const WATER_WINDOW = [0.06, 0.43, 0.88, 0.52]; // UV x/y/width/height; TextureLoader flips image y.
export const WATER_SAMPLE_GLSL = /* glsl */`
uniform vec4 uWaterWindow;
vec3 waterPhase(vec2 uv) {
  return texture2D(tWater, uWaterWindow.xy + fract(uv) * uWaterWindow.zw).rgb;
}
vec3 continuousWater(vec2 uv) {
  vec2 f = fract(uv), w = sin(f * 3.14159265); w *= w;
  vec3 a = waterPhase(uv), b = waterPhase(uv + vec2(0.5, 0.0));
  vec3 c = waterPhase(uv + vec2(0.0, 0.5)), d = waterPhase(uv + vec2(0.5));
  return mix(mix(d, c, w.x), mix(b, a, w.x), w.y);
}
`;
