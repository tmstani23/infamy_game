// One world-lifetime pair of normal maps and one reflection target, shared by
// every streamed ground material. The reflector is manually captured, not added
// to the scene, so water chunks never recursively render one another.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { waterNormalData } from '../water_surface.js';
import { createWaterCapture } from './water_capture.js';

export function createWaterEffects({ renderer, scene, cfg }) {
  const C = cfg.paint?.waterSurface;
  if (!C?.enabled) return null;
  const size = Math.max(128, Math.min(1024, Math.round(C.normalMaps?.size || 512)));
  const normals = [17, 83].map(seed => {
    const tex = new THREE.DataTexture(waterNormalData(size, seed), size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); tex.needsUpdate = true;
    return tex;
  });
  const R = C.reflection, rsize = Math.max(128, Math.min(1024, Math.round(R?.size || 512)));
  const reflector = R?.enabled ? new Reflector(new THREE.PlaneGeometry(1, 1), { textureWidth: rsize, textureHeight: rsize, multisample: 0, clipBias: 0.003 }) : null;
  if (reflector) { reflector.rotation.x = -Math.PI / 2; reflector.updateMatrixWorld(); }
  const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1); blank.needsUpdate = true;
  const uniforms = {
    uWaterNormal0: { value: normals[0] }, uWaterNormal1: { value: normals[1] },
    uWaterNormalCfg: { value: new THREE.Vector4(C.normalMaps?.tile || 8, C.normalMaps?.strength ?? 0.65, C.normalMaps?.flowSpeed || 0.045, 0.18) },
    uWaterReflection: { value: reflector?.getRenderTarget().texture || blank },
    uWaterReflectionMatrix: { value: new THREE.Matrix4() },
    uWaterReflectionCfg: { value: new THREE.Vector4(0, R?.strength ?? 0.4, R?.distortion ?? 0.018, 1 / rsize) },
  };
  const capture = createWaterCapture({ renderer, scene, reflector, uniforms, inverse: new THREE.Matrix4(), clear: new THREE.Color(), updateHz: R?.updateHz || 30 });
  return {
    uniforms,
    capture: capture.run,
    stats: () => ({ captures: capture.count(), normalSize: size, reflectionSize: reflector ? rsize : 0,
      estimatedGpuBytes: size * size * 4 * 2 * 4 / 3 + (reflector ? rsize * rsize * 12 : 0), cpuNormalBytes: size * size * 4 * 2 }),
    dispose() { normals.forEach(t => t.dispose()); blank.dispose(); if (reflector) { reflector.geometry.dispose(); reflector.dispose(); } },
  };
}
