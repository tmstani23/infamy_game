import * as THREE from 'three';
import { createCoastline } from '../world_coast.js';
import { createPaint } from '../world_paint.js';
import { coastlineMaterial } from './shading.js';
import { loadTex } from './scenery.js';

export function createCoastlineRenderer({ world, cfg, renderer }) {
  const C = cfg.coastline;
  if (!C?.enabled || !cfg.paint?.enabled) return null;
  const coast = createCoastline(world, C, createPaint(world, cfg.paint), cfg.chunk);
  const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  blank.needsUpdate = true;
  const textures = {}, rows = {}, available = new THREE.Vector3();
  ['wet', 'dry', 'snow'].forEach((family, i) => {
    textures[family] = { value: blank }; rows[family] = C.materials[family].rows;
    loadTex(C.materials[family].file).then(tex => {
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      textures[family].value = tex; available.setComponent(i, 1);
    }).catch(e => console.error(`Coastline ${family} texture:`, e));
  });
  return {
    mesh(gen) {
      const data = coast.meshData(gen.cx, gen.cz);
      if (!data) return null;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
      geometry.setAttribute('coastWeights', new THREE.BufferAttribute(data.colors, 3));
      geometry.setAttribute('coastClear', new THREE.BufferAttribute(data.alpha, 1));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      const material = coastlineMaterial({ textures, available, rows,
        bounds: [gen.x0, gen.z0, gen.size, gen.size], cfg: C });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = -0.75; mesh.frustumCulled = false;
      return mesh;
    },
    dispose(mesh) { if (mesh) { mesh.geometry.dispose(); mesh.material.dispose(); } },
  };
}
