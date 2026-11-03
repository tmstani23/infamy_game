// Numerical texture fields and reflection lifecycle, without a WebGL context.
import assert from 'node:assert/strict';
import { waterNormalData } from '../src/water_surface.js';
import { createWaterCapture } from '../src/render/water_capture.js';
const N = 128, a = waterNormalData(N, 17), b = waterNormalData(N, 83);
assert.deepEqual(a, waterNormalData(N, 17)); assert.notDeepEqual(a, b);
let inner = 0, wrap = 0, count = 0;
for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
  const i = (z * N + x) * 4, v = [...a.slice(i, i + 3)].map(c => c / 255 * 2 - 1);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 0.015, 'normal field remains unit length within byte quantization');
  assert.equal(a[i + 3], 255); assert.ok(v[2] > 0.9, 'gentle upward tangent normal');
  for (const c of [0, 1]) {
    if (x < N - 1) { inner += Math.abs(a[i + c] - a[i + 4 + c]); count++; }
    if (z < N - 1) { inner += Math.abs(a[i + c] - a[i + N * 4 + c]); count++; }
    if (x === N - 1) wrap += Math.abs(a[i + c] - a[z * N * 4 + c]);
    if (z === N - 1) wrap += Math.abs(a[i + c] - a[x * 4 + c]);
  }
}
assert.ok(wrap / (N * 4) < inner / count * 1.3, 'tile wrap has no larger seam than ordinary neighboring pixels');

function fixture(fail = false) {
  const matrix = () => ({ copy() { return this; }, invert() { return this; }, multiply() { return this; } });
  const scene = { background: { sky: true } }, originalBackground = scene.background;
  const originalTarget = {}, hidden = [{ visible: true }, { visible: false }], camera = { updateMatrixWorld() {} };
  let target = originalTarget, color = 123, alpha = 0.7, attempts = 0, errors = 0;
  const renderer = { autoClear: false, xr: { enabled: true }, shadowMap: { autoUpdate: true },
    getClearColor(out) { out.color = color; }, getClearAlpha: () => alpha,
    setClearColor(c, a) { color = typeof c === 'object' ? c.color : c; alpha = a; },
    getRenderTarget: () => target, setRenderTarget(t) { target = t; } };
  const uniforms = { uWaterReflectionCfg: { value: { x: 0 } }, uWaterReflectionMatrix: { value: matrix() } };
  const reflector = { matrixWorld: {}, material: { uniforms: { textureMatrix: { value: {} } } },
    onBeforeRender() {
      attempts++; assert.equal(hidden[0].visible, false); assert.equal(hidden[1].visible, false); assert.equal(scene.background, null);
      target = {}; renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
      if (fail) throw new Error('simulated capture failure');
    } };
  const capture = createWaterCapture({ renderer, scene, reflector, uniforms, inverse: matrix(), clear: {}, updateHz: 30, onError: () => errors++ });
  const restored = () => { assert.deepEqual(hidden.map(m => m.visible), [true, false]); assert.equal(scene.background, originalBackground); assert.equal(target, originalTarget); assert.equal(color, 123); assert.equal(alpha, 0.7); assert.equal(renderer.autoClear, false); assert.equal(renderer.xr.enabled, true); assert.equal(renderer.shadowMap.autoUpdate, true); };
  return { capture, camera, hidden, uniforms, restored, attempts: () => attempts, errors: () => errors };
}
const f = fixture();
f.capture.run(f.camera, 1, true, f.hidden); f.restored(); assert.equal(f.capture.count(), 1); assert.equal(f.uniforms.uWaterReflectionCfg.value.x, 1);
for (let i = 1; i <= 20; i++) f.capture.run(f.camera, 1 + i * 0.001, true, f.hidden);
assert.equal(f.attempts(), 1, 'one shared throttled capture, not one per chunk/frame');
f.capture.run(f.camera, 1.04, true, f.hidden); assert.equal(f.attempts(), 2); f.restored();
f.capture.run(f.camera, 1.05, false, f.hidden); assert.equal(f.uniforms.uWaterReflectionCfg.value.x, 0);
f.capture.run(f.camera, 1.051, true, f.hidden); assert.equal(f.attempts(), 3, 'returning to water refreshes immediately');
const bad = fixture(true); bad.capture.run(bad.camera, 2, true, bad.hidden); bad.restored();
bad.capture.run(bad.camera, 3, true, bad.hidden); assert.equal(bad.attempts(), 1); assert.equal(bad.errors(), 1); assert.equal(bad.uniforms.uWaterReflectionCfg.value.x, 0, 'failed reflection falls back cleanly');
console.log('test_water_capture: normal data unit length/periodic/deterministic, shared capture throttle, visibility/renderer restoration and failure fallback passed');
