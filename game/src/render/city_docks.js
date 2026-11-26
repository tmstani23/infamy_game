// The capital's harbour piers drawn as wooden piers on piles like the castle docks (2026-11-23: "give them same
// treatment"). Drawing only: the city's walkable ground is unchanged (the painted planks stay under it). Each pier is
// a rectangle in city units from data/port_town.json docks.piers ([minX, minZ, maxX, maxZ] of the part over the water,
// land = the side that meets the quay: 'N', 'S', 'E' or 'W'); docks.size overrides src/dock_shape.js DOCK (a city pier
// sits lower so people walking it stay on the boards); docks.pieces = textures and tints, as townArt._castle.pieces.
// buildCityDocks(docks) -> Promise<THREE.Group>
import * as THREE from 'three';
import { dockShape, dockPieces } from '../dock_shape.js';
import { terraceMaterial } from './shading.js';
import { loadTex } from './scenery.js';

// a pier as a small one-unit grid for src/dock_shape.js: its cells, a row of quay ground on its land side, sea round it
export function pierGrid([x0, z0, x1, z1], land) {
  const w = Math.round(x1 - x0), h = Math.round(z1 - z0), n = Math.max(w, h) + 2, mid = (n - 1) / 2;
  const use = new Array(n * n).fill('m'), level = new Array(n * n).fill('.'), pier = [];
  const at = (col, row) => row * n + col;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const i = at(c + 1, r + 1); pier.push(i); use[i] = '.'; level[i] = '0'; }
  const quay = land === 'N' ? [...Array(w)].map((_, c) => at(c + 1, 0)) : land === 'S' ? [...Array(w)].map((_, c) => at(c + 1, h + 1))
    : land === 'W' ? [...Array(h)].map((_, r) => at(0, r + 1)) : [...Array(h)].map((_, r) => at(w + 1, r + 1));
  for (const i of quay) { use[i] = '.'; level[i] = '0'; }
  // cell (col, row) centre = x + (col - mid), so the pier's first cell edge lands on x0, z0
  return { x: x0 - 1 + 0.5 + mid, z: z0 - 1 + 0.5 + mid, n, cell: 1, mid, use: use.join(''), level: level.join(''), pier };
}

export async function buildCityDocks(docks) {
  const group = new THREE.Group();
  if (!docks?.piers?.length) return group;
  const out = {};
  for (const p of docks.piers) { const c = pierGrid(p.rect, p.land); dockPieces(c, dockShape(c, docks.size || null), out); }
  for (const [kind, quads] of Object.entries(out)) {
    if (!quads.length) continue;
    const P = docks.pieces?.[kind] || {}, tile = P.tile || 8;
    const pos = new Float32Array(quads.length * 12), uv = new Float32Array(quads.length * 8), shade = new Float32Array(quads.length * 4), idx = [];
    quads.forEach((f, k) => {
      f.q.forEach(([x, y, z], v) => { pos.set([x, y, z], k * 12 + v * 3); uv.set([f.uvw[v][0] / (tile * (P.aspect ?? 1)), f.uvw[v][1] / tile], k * 8 + v * 2); shade[k * 4 + v] = (P.gain ?? 1) * (f.shade ?? 1); });
      const b = k * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('shade', new THREE.BufferAttribute(shade, 1));
    geo.setIndex(idx);
    const tex = await loadTex(P.texture || 'art/ground/dock_deck.jpg');
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mesh = new THREE.Mesh(geo, terraceMaterial(tex, P.tint || '#ffffff'));
    mesh.renderOrder = -0.9;   // after the ground, before every sprite (as the castle terraces)
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}
