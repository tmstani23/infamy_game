// Night eyes (wildlife W4, 2026-11-24): at night a wolf or bear out past your people is drawn near black
// (render/view.js) and only its eyes show: two tiny green-gold slits that catch the light now and then and blink.
// Where the eyes sit in each facing's picture, and the numbers: data/wildlife.json animals.eyes.
import * as THREE from 'three';
import { CAM_QUAT, CAM_RIGHT, CAM_UP, VIEW_DIR } from './iso.js';

const MAX = 96;

export function createWildEyesFx({ scene, cfg = {} }) {
  const size = cfg.size ?? 0.32;
  const geo = new THREE.PlaneGeometry(1, 0.5);
  const bright = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
  bright.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aB', bright);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aB; varying float vB; varying vec2 vP;
      void main() { vB = aB; vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying float vB; varying vec2 vP;
      void main() {
        // vP: -0.5..0.5 across, -0.25..0.25 up; one slit, a little slanted, in a faint halo
        vec2 p = vec2(vP.x, vP.y - vP.x * 0.18);
        float core = smoothstep(1.0, 0.35, pow(p.x / 0.17, 2.0) + pow(p.y / 0.055, 2.0));
        float halo = exp(-(pow(p.x / 0.26, 2.0) + pow(p.y / 0.15, 2.0)) * 1.6) * 0.3;
        vec3 c = (vec3(0.88, 0.98, 0.67) * core + vec3(0.59, 0.82, 0.31) * halo) * vB;
        if (max(c.r, c.g) < 0.004) discard;
        gl_FragColor = vec4(c, 1.0);
      }` });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.frustumCulled = false;
  mesh.renderOrder = 99400;
  mesh.count = 0;
  scene.add(mesh);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), sc = new THREE.Vector3(size, size, 1);
  let n = 0;

  // one animal this frame: its sprite's plane centre, cell size in world units, facing row, type, and how bright (0..1)
  function eye(x, y, z) {
    if (n >= MAX) return;
    v.set(x, y, z).addScaledVector(VIEW_DIR, -0.3);
    m4.compose(v, CAM_QUAT, sc);
    mesh.setMatrixAt(n, m4);
    return n++;
  }
  return {
    begin() { n = 0; },
    // seed 0..1 per animal: when its head turns into the light (glint) and when it blinks
    add(type, centre, cell, dir, b, seed, time) {
      const at = cfg.at?.[type]?.[dir];
      if (!at || b <= 0.01) return;
      const [lo, hi] = cfg.blink || [3, 6], period = lo + ((seed * 7.31) % 1) * (hi - lo);
      if ((time + seed * period) % period < (cfg.blinkSeconds ?? 0.14)) return;
      b *= (cfg.dim ?? 0.15) + (1 - (cfg.dim ?? 0.15)) * Math.max(0, Math.sin(time * (cfg.glint ?? 1.56) + seed * 6.283)) ** 3;
      const gap = (cfg.gap?.[type] ?? 0.12) * (dir === 2 || dir === 6 ? 0 : 1) / 2;
      const cx = centre.x + CAM_RIGHT.x * (at[0] - 0.5) * cell + CAM_UP.x * (0.5 - at[1]) * cell;
      const cy = centre.y + CAM_RIGHT.y * (at[0] - 0.5) * cell + CAM_UP.y * (0.5 - at[1]) * cell;
      const cz = centre.z + CAM_RIGHT.z * (at[0] - 0.5) * cell + CAM_UP.z * (0.5 - at[1]) * cell;
      for (const s of gap ? [-1, 1] : [0]) {
        const i = eye(cx + CAM_RIGHT.x * gap * s, cy + CAM_RIGHT.y * gap * s, cz + CAM_RIGHT.z * gap * s);
        if (i != null) bright.array[i] = b;
      }
    },
    end(show) {
      mesh.count = show ? n : 0;
      mesh.instanceMatrix.needsUpdate = true;
      bright.needsUpdate = true;
    },
  };
}
