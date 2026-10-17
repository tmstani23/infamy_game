// Glow on ability and hit effects only. Every effect mesh is also put on FX_LAYER; each
// frame those alone are drawn into a small offscreen target, blurred by three.js's
// UnrealBloomPass, and the blur is added over the finished frame. The painted art never
// goes through it, so walls and lanterns don't bloom, only the effects do.
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const FX_LAYER = 1;
export const onFxLayer = (...objs) => { for (const o of objs) o.layers.enable(FX_LAYER); return objs[0]; };

const SCALE = 0.5;   // the glow target is half the screen size (the blur hides it)

export function createBloom(renderer, { strength = 1.15, radius = 0.55 } = {}) {
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const pass = new UnrealBloomPass(new THREE.Vector2(1, 1), strength, radius, 0);
  const add = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: { tGlow: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D tGlow; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tGlow, vUv).rgb, 1.0); }',
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
  }));
  let w = 0, h = 0;
  const black = new THREE.Color(0, 0, 0), oldClear = new THREE.Color();

  return {
    scale: SCALE,
    // draw the effects alone and blur them (call before the main render)
    render(scene, camera) {
      renderer.getDrawingBufferSize(size);
      const tw = Math.max(1, Math.round(size.x * SCALE)), th = Math.max(1, Math.round(size.y * SCALE));
      if (tw !== w || th !== h) { w = tw; h = th; target.setSize(w, h); pass.setSize(w, h); }
      const bg = scene.background, mask = camera.layers.mask, alpha = renderer.getClearAlpha();
      renderer.getClearColor(oldClear);
      scene.background = null;
      camera.layers.set(FX_LAYER);
      renderer.setClearColor(black, 1);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      pass.render(renderer, null, target, 0, false);
      renderer.setRenderTarget(null);
      renderer.setClearColor(oldClear, alpha);
      camera.layers.mask = mask;
      scene.background = bg;
    },
    // add the glow over the frame just drawn (call after the main render)
    composite() {
      add.material.uniforms.tGlow.value = pass.renderTargetsHorizontal[0].texture;
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      add.render(renderer);
      renderer.autoClear = auto;
    },
  };
}
