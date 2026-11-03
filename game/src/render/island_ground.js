// Island ground painting on screen (frontier W3.10, docs/world_painting.md layers 1-6): one ground mesh
// per chunk. The pure rules (biome field, material weights, trails) are in src/world_paint.js; this file
// turns them into weight maps and gives them to the island ground shader (render/shading.js).
import * as THREE from 'three';
import { createPaint, trailSegments } from '../world_paint.js';
import { islandGroundMaterial } from './shading.js';

const loadImage = url => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error(`Could not load ${url}`)); i.src = url; });

// All island ground textures in one texture array (a layer each), built once.
async function loadMaterialArray(paintCfg, renderer) {
  const ids = Object.keys(paintCfg.materials), S = paintCfg.size;
  const images = await Promise.all(ids.map(id => loadImage(`art/ground/${paintCfg.materials[id].file}`)));
  const data = new Uint8Array(S * S * 4 * ids.length), cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true });
  images.forEach((im, i) => { g.drawImage(im, 0, 0, S, S); data.set(g.getImageData(0, 0, S, S).data, i * S * S * 4); });
  const tex = new THREE.DataArrayTexture(data, S, S, ids.length);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

export function createIslandPainter({ world, cfg, renderer, groundTex }) {
  const pc = cfg.paint, paint = createPaint(world, pc), M = pc.mosaic;
  let array = null, failed = false;
  loadMaterialArray(pc, renderer).then(t => { array = t; }).catch(e => { failed = true; console.error('Island ground textures:', e); });
  // P3 samples the source's open-water interior. The old processed copy has
  // cross seams baked into it; keep it preserved but do not use it here.
  const water = new THREE.TextureLoader().load('art/ground/water.jpg');
  water.wrapS = water.wrapT = THREE.RepeatWrapping; water.colorSpace = groundTex.tWater.colorSpace;
  water.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const dt = (d, n) => { const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; };

  return {
    ready: () => !!array,
    failed: () => failed,
    // ground mesh of a generated chunk (gen from sim/chunk_gen.js)
    mesh(gen) {
      const S = gen.size, margin = pc.trail.verge + pc.trail.wMax;
      const near = { segs: trailSegments(world, gen.x0, gen.z0, gen.x0 + S, gen.z0 + S, margin, pc.paths?.list), stamps: paint.stampsIn(gen.x0, gen.z0, gen.x0 + S, gen.z0 + S) };
      const c = paint.paintChunk(gen.x0, gen.z0, S, near);
      const layers = Array.from({ length: 16 }, (_, i) => c.mats[i] != null ? paint.M[c.mats[i]] : 0);
      const tiles = Array.from({ length: 16 }, (_, i) => c.mats[i] != null ? pc.materials[c.mats[i]].tile : 8);
      const splats = Array.from({ length: 4 }, (_, i) => dt(c.maps[i] || new Uint8Array(c.N * c.N * 4), c.N));
      const bounds = [gen.x0 - c.h, gen.z0 - c.h, S + 2 * c.h, S + 2 * c.h];
      const mat = islandGroundMaterial({ mats: array, water, splats, over: dt(c.O, c.N), bounds, layers, tiles, mosaic: M, coastTransition: pc.coastTransition, waterSurface: pc.waterSurface });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(S, S), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(gen.x0 + S / 2, 0, gen.z0 + S / 2);
      mesh.renderOrder = -1;
      mesh.frustumCulled = false;
      return mesh;
    },
    dispose(mesh) {
      const u = mesh.material.uniforms;
      for (const k of ['uSplatA', 'uSplatB', 'uSplatC', 'uSplatD', 'uOver']) u[k].value.dispose();
    },
  };
}
