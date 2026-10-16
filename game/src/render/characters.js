// Draws a unit from the game state with its 8-direction spritesheets.
import * as THREE from 'three';
import { CAM_QUAT } from './iso.js';
import { spriteMaterial, shadowMaterial, hiddenMaterial } from './shading.js';
import { Thing, loadTex } from './scenery.js';

const CELL_WORLD = 3;       // a 160px cell covers 3 world units (see sprite_render_test.html)
const FEET_UP = 0.9;        // the cell centre is 0.9 units above the feet
const FPS = 12;
const RING_GEO = new THREE.RingGeometry(0.55, 0.68, 40);
const RING_MAT = new THREE.MeshBasicMaterial({ color: 0x8fd17a, transparent: true, opacity: 0.85, depthWrite: false });

// Spritesheets per model, from data/art.json "characters"
const sheetCache = {};
export async function loadSheets(catalog, model) {
  if (sheetCache[model]) return sheetCache[model];
  const names = catalog.characters[model];
  const sheets = {};
  // each entry is a sheet name, or { file, speed } where speed scales the playback rate
  await Promise.all(Object.entries(names).map(async ([anim, entry]) => {
    const { file, speed = 1 } = typeof entry === 'string' ? { file: entry } : entry;
    const tex = await loadTex(`../assets/sprites/${file}.png`);
    // mipmaps keep the sprite clean when zoomed out (frames are padded, so no bleeding between cells)
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    // rows are the 8 directions; the frame count follows from the sheet's shape
    sheets[anim] = { tex, speed, frames: Math.round(tex.image.width / tex.image.height * 8) };
  }));
  return (sheetCache[model] = sheets);
}

export class CharacterSprite {
  constructor(sheets) {
    this.sheets = sheets;
    this.material = spriteMaterial(sheets.idle.tex, { uSelfLight: { value: new THREE.Color(0.2, 0.18, 0.16) } });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    mesh.quaternion.copy(CAM_QUAT);
    mesh.scale.set(CELL_WORLD, CELL_WORLD, 1);
    mesh.frustumCulled = false;
    // in 3D rooms the sprite is hidden by furniture in front of it; a faint outline shows where it is
    this.material.depthTest = true;
    this.hidden = new THREE.Mesh(mesh.geometry, hiddenMaterial(this.material.uniforms));
    this.hidden.quaternion.copy(CAM_QUAT);
    this.hidden.scale.copy(mesh.scale);
    this.hidden.renderOrder = 99500;
    this.hidden.frustumCulled = false;
    this.thing = new Thing(mesh, { minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), shadowMaterial);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 1;
    // green ring under selected crew
    this.ring = new THREE.Mesh(RING_GEO, RING_MAT);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 2;
    this.ring.visible = false;
    this.pos = new THREE.Vector3();
    this.anim = 'idle';
    this.time = 0;
  }

  // x, z: interpolated position; dir and anim come from the latest game state
  update(dt, x, z, dir, anim) {
    if (anim !== this.anim) { this.anim = anim; this.time = 0; }
    this.time += dt;
    const sheet = this.sheets[anim] || this.sheets.idle;
    const frame = Math.floor(this.time * FPS * sheet.speed) % sheet.frames;
    const u = this.material.uniforms;
    u.uMap.value = sheet.tex;
    u.uFrame.value.set(frame / sheet.frames, 1 - (dir + 1) / 8, 1 / sheet.frames, 1 / 8);

    this.pos.set(x, 0, z);
    const r = 0.2;
    this.thing.mesh.position.set(x, FEET_UP, z);
    this.hidden.position.set(x, FEET_UP, z);
    u.uDepthAt.value.set(x, 0, z, 0.45);
    this.thing.foot = { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r };
    this.thing.updateScreen();
    this.shadow.position.set(x, 0.01, z);
    this.ring.position.set(x, 0.02, z);
  }
}
