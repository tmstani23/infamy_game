// Capture lifecycle kept independent of WebGL so throttling, state restoration
// and failure fallback can be verified in Node without launching a browser.
export function createWaterCapture({ renderer, scene, reflector, uniforms, inverse, clear, updateHz = 30, onError = console.error }) {
  let last = -Infinity, enabled = false, failed = false, captures = 0;
  return {
    count: () => captures,
    run(camera, time, active, hidden) {
      if (!active) { uniforms.uWaterReflectionCfg.value.x = 0; last = -Infinity; enabled = false; return; }
      if (!reflector || failed) return;
      if (enabled && time >= last && time - last < 1 / updateHz) return;
      const background = scene.background, alpha = renderer.getClearAlpha(); renderer.getClearColor(clear);
      const autoClear = renderer.autoClear, target = renderer.getRenderTarget();
      const xr = renderer.xr.enabled, shadows = renderer.shadowMap.autoUpdate;
      const visible = hidden.map(m => m.visible);
      try {
        hidden.forEach(m => { m.visible = false; }); scene.background = null;
        renderer.setClearColor(0, 0); renderer.autoClear = true; camera.updateMatrixWorld();
        reflector.onBeforeRender(renderer, scene, camera);
        inverse.copy(reflector.matrixWorld).invert();
        uniforms.uWaterReflectionMatrix.value.copy(reflector.material.uniforms.textureMatrix.value).multiply(inverse);
        uniforms.uWaterReflectionCfg.value.x = 1; last = time; enabled = true; captures++;
      } catch (error) {
        failed = true; uniforms.uWaterReflectionCfg.value.x = 0;
        onError('Water reflection disabled; normal-map surface remains available:', error);
      } finally {
        hidden.forEach((m, i) => { m.visible = visible[i]; }); scene.background = background;
        renderer.setClearColor(clear, alpha); renderer.autoClear = autoClear;
        renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = shadows; renderer.setRenderTarget(target);
      }
    },
  };
}
