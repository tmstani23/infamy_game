// Draws the district: the blended ground, and every building and prop as a flat
// painted cutout facing the camera, standing on its invisible footprint box.
// Also keeps all sprites in the right draw order.
import * as THREE from 'three';
import { CAM_RIGHT, CAM_UP, CAM_QUAT, VIEW_DIR, toScreen } from './iso.js';
import { spriteMaterial, groundMaterial, glowMaterial, flameMaterial, doorMaterial, crewDoorMaterial } from './shading.js';
import { shapeDistance, shapeBox, groundZone } from '../sim/geometry.js';

const loader = new THREE.TextureLoader();
export const loadTex = url => new Promise((ok, fail) => loader.load(url, ok, undefined, () => fail(new Error(`Could not load ${url}`))));
export const quad = new THREE.PlaneGeometry(1, 1);

// Anything drawn as a sprite and sorted by its footprint
export class Thing {
  constructor(mesh, foot, big = false) {
    this.mesh = mesh;
    this.foot = foot;          // { minX, maxX, minZ, maxZ }
    this.extras = [];          // flames and glows drawn right after the sprite
    this.lights = [];
    this.big = big;            // turns see-through when the hero walks behind it
    this.cut = 0;
    this.mask = null;
    this.updateScreen();
  }
  updateScreen() {
    const c = toScreen(this.mesh.position), hw = this.mesh.scale.x / 2, hh = this.mesh.scale.y / 2;
    this.screen = { x0: c.x - hw, x1: c.x + hw, y0: c.y - hh, y1: c.y + hh };
    this.depth = (this.foot.minX + this.foot.maxX + this.foot.minZ + this.foot.maxZ) / 2;
  }
  // Is the art opaque where world point p lands on screen?
  covers(p) {
    if (!this.mask) return true;
    const d = p.clone().sub(this.mesh.position);
    const u = d.dot(CAM_RIGHT) / this.mesh.scale.x + 0.5, v = 0.5 - d.dot(CAM_UP) / this.mesh.scale.y;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
    const { w, h, data } = this.mask;
    return data[Math.floor(v * h) * w + Math.floor(u * w)] > 0;
  }
}

// Should A be drawn before (behind) B? The camera looks from +x, +z.
export function behind(A, B) {
  const a = A.foot, b = B.foot, e = 0.01;
  const xs = a.maxX <= b.minX + e ? -1 : b.maxX <= a.minX + e ? 1 : 0;
  const zs = a.maxZ <= b.minZ + e ? -1 : b.maxZ <= a.minZ + e ? 1 : 0;
  if (xs && zs && xs !== zs) return A.depth < B.depth;
  if (xs) return xs < 0;
  if (zs) return zs < 0;
  return A.depth < B.depth;
}

const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// Topological sort of everything that overlaps on screen; ties go back to front
export function sortThings(things) {
  const n = things.length;
  const after = Array.from({ length: n }, () => []);
  const pending = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!overlaps(things[i].screen, things[j].screen)) continue;
    if (behind(things[i], things[j])) { after[i].push(j); pending[j]++; } else { after[j].push(i); pending[i]++; }
  }
  const done = new Array(n).fill(false);
  for (let order = 0; order < n; order++) {
    let best = -1;
    for (let i = 0; i < n; i++) if (!done[i] && pending[i] === 0 && (best < 0 || things[i].depth < things[best].depth)) best = i;
    if (best < 0) for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || things[i].depth < things[best].depth)) best = i; // cycle: break it
    done[best] = true;
    for (const j of after[best]) pending[j]--;
    const t = things[best];
    t.mesh.renderOrder = 10 + order * 4;
    t.extras.forEach((m, i) => { m.renderOrder = 11 + order * 4 + i % 3; });
  }
}

// ---------- ground ----------
const SPLAT_RES = 4;                       // weight-map pixels per world unit
const SPLAT_MARGIN = 34;                   // ground drawn this far past the district's edge
const CHANNELS = ['paving', 'gravel', 'planks', 'grass', 'sand', 'mud', 'water', 'dry_grass'];
const GROUND_TEXTURES = {
  tDirt: 'dirt', tPaving: 'paving', tGravel: 'gravel', tPlanks: 'planks', tGrass: 'grass',
  tSand: 'sand', tMud: 'mud', tWater: 'water', tDryGrass: 'dry_grass',
};

// The weight map's area: the district plus a margin. [minX, minZ, sizeX, sizeZ]
const splatBounds = b => [b.minX - SPLAT_MARGIN, b.minZ - SPLAT_MARGIN, b.maxX - b.minX + 2 * SPLAT_MARGIN, b.maxZ - b.minZ + 2 * SPLAT_MARGIN];

// Paint the district's ground zones (boxes or shapes, sim/geometry.js) into weight maps, one channel per ground type
function buildSplats(zones, SB) {
  const NX = Math.round(SB[2] * SPLAT_RES), NZ = Math.round(SB[3] * SPLAT_RES);
  const w = Object.fromEntries(['dirt', ...CHANNELS].map(c => [c, new Float32Array(NX * NZ)]));
  for (const zone of zones.map(groundZone)) {
    if (!w[zone.type]) { console.warn('Unknown ground type', zone.type); continue; }
    const b = Math.max(zone.blur, 0.3), box = shapeBox(zone.shape);
    // only the pixels the zone (and its soft edge) can reach
    const i0 = Math.max(0, Math.floor((box.minX - b - SB[0]) * SPLAT_RES)), i1 = Math.min(NX - 1, Math.ceil((box.maxX + b - SB[0]) * SPLAT_RES));
    const j0 = Math.max(0, Math.floor((box.minZ - b - SB[1]) * SPLAT_RES)), j1 = Math.min(NZ - 1, Math.ceil((box.maxZ + b - SB[1]) * SPLAT_RES));
    for (let j = j0; j <= j1; j++) {
      const z = SB[1] + (j + 0.5) / SPLAT_RES;
      for (let i = i0; i <= i1; i++) {
        const x = SB[0] + (i + 0.5) / SPLAT_RES;
        let m = Math.min(1, Math.max(0, shapeDistance(zone.shape, x, z) / b + 0.5));
        if (m <= 0) continue;
        m = m * m * (3 - 2 * m);
        const k = j * NX + i;
        for (const c in w) w[c][k] *= 1 - m;
        w[zone.type][k] += m;
      }
    }
  }
  const pack = names => {
    const data = new Uint8Array(NX * NZ * 4);
    for (let k = 0; k < NX * NZ; k++) names.forEach((c, ch) => { data[k * 4 + ch] = Math.round(w[c][k] * 255); });
    const t = new THREE.DataTexture(data, NX, NZ, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  return [pack(CHANNELS.slice(0, 4)), pack(CHANNELS.slice(4))];
}

export async function buildGround(zones, renderer, bounds = { minX: -46, maxX: 46, minZ: -46, maxZ: 46 }) {
  const textures = {};
  await Promise.all(Object.entries(GROUND_TEXTURES).map(async ([k, name]) => {
    const t = await loadTex(`art/ground/${name}.jpg`);
    t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    textures[k] = t;
  }));
  const SB = splatBounds(bounds);
  const [a, b] = buildSplats(zones, SB);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SB[2], SB[3]),
    groundMaterial(textures, a, b, SB, [5.6, 3.6]));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(SB[0] + SB[2] / 2, 0, SB[1] + SB[3] / 2);
  mesh.renderOrder = 0;
  return mesh;
}

// ---------- painted cutouts ----------
// Quarter-size opaque/clear map of an image, for the see-through test
function alphaMask(img, flip = false) {
  const w = Math.ceil(img.width / 4), h = Math.ceil(img.height / 4);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (flip) { g.translate(w, 0); g.scale(-1, 1); }
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = px[i * 4 + 3] > 140 ? 1 : 0;
  return { w, h, data };
}

const colorOf = c => new THREE.Color(c);

// One building or prop from sim/geometry.js placeScenery()
function cutoutThing(s, tex) {
  const { item, meta, k, center, flip, indoor } = s;
  const C = new THREE.Vector3(s.x, 0, s.z);
  // hanging things are drawn higher up (the lift is a height in world units)
  const lift = (s.lift ?? item.lift) * Math.cos(Math.atan(0.5));
  // art pixel -> point on the sprite plane through the footprint centre (mirrored art: x from the right)
  const px = (x, y) => C.clone()
    .addScaledVector(CAM_RIGHT, ((flip ? meta.w - x : x) - center[0]) * k)
    .addScaledVector(CAM_UP, (center[1] - y) * k + lift);

  const mat = spriteMaterial(tex);
  if (flip) mat.uniforms.uFrame.value.set(1, 0, -1, 1);
  if (indoor) mat.uniforms.uIndoor.value = 1;
  else mat.uniforms.uFogAt.value.set(s.x, s.z, 0, 1);   // fog of war darkens it by its footprint
  if (s.depth) {   // stands in a 3D room: hidden behind its walls and furniture
    mat.depthTest = true;
    mat.uniforms.uDepthAt.value.set(s.x, 0, s.z, 0.3);
  }
  if (s.tint) mat.uniforms.uTint.value.set(s.tint);
  if (s.cut) {
    const D = new THREE.Vector3(s.alongZ ? 0 : 1, 0, s.alongZ ? 1 : 0);
    mat.uniforms.uClip.value.set(s.x, 0, s.z, s.cut);
    mat.uniforms.uClipSlope.value = D.dot(CAM_UP) / D.dot(CAM_RIGHT);
  }
  const mesh = new THREE.Mesh(quad, mat);
  mesh.quaternion.copy(CAM_QUAT);
  mesh.scale.set(meta.w * k, meta.h * k, 1);
  mesh.position.copy(px(meta.w / 2, meta.h / 2));
  mesh.frustumCulled = false;

  const isBuilding = item.kind === 'buildings';
  const thing = new Thing(mesh, s.foot, isBuilding || (s.wall && !s.cut) || meta.h * k > 3.2);
  thing.building = s.building ?? null;   // index in the district's buildings (street buildings only)
  if (thing.big) thing.mask = alphaMask(tex.image, flip);

  // lamps: a world position for the light, and a glow drawn on the sprite
  const lamp = (x, y, radius, color, fire) => {
    const Q = px(x, y);
    const t = isBuilding
      ? (1.4 - Q.y) / VIEW_DIR.y      // lamps and windows on the facade, about head height
      : ((C.x - Q.x) * VIEW_DIR.x + (C.z - Q.z) * VIEW_DIR.z) / (VIEW_DIR.x ** 2 + VIEW_DIR.z ** 2);
    const pos = Q.clone().addScaledVector(VIEW_DIR, t);
    thing.lights.push({ pos, radius, color: colorOf(color), fire, seed: Math.random() * 10 });
    const glow = new THREE.Mesh(quad, glowMaterial(colorOf(color), Math.random() * 10, indoor));
    glow.quaternion.copy(CAM_QUAT);
    const g = Math.min(radius * 0.32, 2.4);
    glow.scale.set(g, g, 1);
    glow.position.copy(Q);
    glow.frustumCulled = false;
    thing.extras.push(glow);
  };
  for (const [x, y, r, color] of item.lights) lamp(x, y, r, color, item.flames.length > 0);
  if (item.glows) {
    for (const [x, y, area] of meta.glows.filter(g => g[2] >= 60).slice(0, 2))
      lamp(x, y, 3 + Math.min(area, 1000) / 500, '#ffa050', false);
  }
  for (const [x, y, size] of item.flames) {
    const f = new THREE.Mesh(quad, flameMaterial(Math.random() * 10));
    f.quaternion.copy(CAM_QUAT);
    f.scale.set(size * k, size * k * 1.5, 1);
    f.position.copy(px(x, y)).addScaledVector(CAM_UP, size * k * 0.6);
    f.frustumCulled = false;
    thing.extras.push(f);
  }
  // hanging things: a cord from the art pixel [x, y] up to the ceiling
  if (item.cord) {
    const [x, y] = item.cord, top = px(x, y);
    const len = CEILING * Math.cos(Math.atan(0.5)) - top.clone().sub(C).dot(CAM_UP);
    if (len > 0) {
      const c = new THREE.Mesh(quad, cordMaterial);
      c.quaternion.copy(CAM_QUAT);
      c.scale.set(CORD_WIDTH, len, 1);
      c.position.copy(top).addScaledVector(CAM_UP, len / 2);
      c.frustumCulled = false;
      thing.extras.push(c);
    }
  }
  return thing;
}

const CEILING = 3.4;        // world height that hanging cords go up to
const CORD_WIDTH = 0.08;
const cordMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.09, 0.07, 0.06), transparent: true, depthTest: false, depthWrite: false });

export async function buildScenery(scenery, renderer) {
  const tex = {};
  await Promise.all([...new Set(scenery.map(s => s.item.file))].map(async file => {
    const t = await loadTex(file);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex[file] = t;
  }));
  return scenery.map(s => cutoutThing(s, tex[s.item.file]));
}

export function doorRings(doors) {
  return doors.map(d => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), doorMaterial);
    m.rotation.x = -Math.PI / 2;
    m.position.set(d.x, 0.02, d.z);
    m.renderOrder = 1;
    m.userData.door = d;
    return m;
  });
}

// Street door rings of rooms that hold some of the hero's crew turn teal
export function markCrewDoors(rings, state, owner) {
  const held = new Set();
  for (const e of Object.values(state.entities)) if (e.owner === owner && e.type !== 'hero' && !e.dead && e.place !== 'street') held.add(e.place);
  for (const m of rings) {
    const d = m.userData.door, crew = !!d.to && d.place !== 'street' && held.has(d.place);
    m.material = crew ? crewDoorMaterial : doorMaterial;
    m.scale.setScalar(crew ? 1.4 : 1);   // a bigger ring, so it is easy to spot
  }
}

// Wire boxes of every footprint and blocking box (F3), for lining up art
export function footprintLines(scenery) {
  const pts = [];
  const box = (f, y) => {
    const c = [[f.minX, f.minZ], [f.maxX, f.minZ], [f.maxX, f.maxZ], [f.minX, f.maxZ]];
    for (let i = 0; i < 4; i++) { const [a, b] = [c[i], c[(i + 1) % 4]]; pts.push(a[0], y, a[1], b[0], y, b[1]); }
  };
  scenery.forEach(s => { box(s.foot, 0.02); if (s.solid) box(s.solid, 0.04); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x39d0ff, depthTest: false, transparent: true, opacity: 0.8 }));
  lines.renderOrder = 100000;
  lines.frustumCulled = false;
  return lines;
}
