// Draws a unit from the game state with its 8-direction spritesheets.
import * as THREE from 'three';
import { healthBar } from './health.js';
import { CAM_QUAT, CAM_RIGHT } from './iso.js';
import { spriteMaterial, shadowMaterial, hiddenMaterial } from './shading.js';
import { Thing, loadTex } from './scenery.js';

const CELL_WORLD = 3;       // a 160px cell covers 3 world units (see sprite_render_test.html)
const FEET_UP = 0.9;        // the cell centre is 0.9 units above the feet
const FPS = 12;
// health bar above the head: dark back plus a coloured fill that shrinks from the right
const BAR_W = 0.9, BAR_H = 0.09, BAR_UP = 2.35;
const BAR_GEO = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
// both transparent with the fill one step later, so the dark back never draws over the fill
const BAR_BACK = new THREE.MeshBasicMaterial({ color: 0x0a0806, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false });
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
    this.bar = new THREE.Group();
    this.bar.quaternion.copy(CAM_QUAT);
    const back = new THREE.Mesh(BAR_GEO, BAR_BACK);
    back.scale.set(BAR_W + 0.04, BAR_H + 0.04, 1);
    back.position.x = -0.02;
    this.fill = new THREE.Mesh(BAR_GEO, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    this.fill.scale.set(BAR_W, BAR_H, 1);
    this.fill.position.z = 0.001;
    this.bar.add(back, this.fill);
    for (const m of [back, this.fill]) m.frustumCulled = false;
    back.renderOrder = 99600;
    this.fill.renderOrder = 99601;
    this.bar.visible = false;
    this.pos = new THREE.Vector3();
    this.anim = 'idle';
    this.time = 0;
  }

  // x, z: interpolated position; dir and anim come from the latest game state
  // swingT: 0..1 through the current attack swing (the attack sheet is stretched over the swing)
  update(dt, x, z, dir, anim, swingT = null) {
    if (anim !== this.anim) { this.anim = anim; this.time = 0; }
    this.time += dt;
    const sheet = this.sheets[anim] || this.sheets.idle;
    // a fall plays once and stays down; an attack follows the swing; everything else loops
    const f = Math.floor(this.time * FPS * sheet.speed);
    const frame = anim === 'death' ? Math.min(f, sheet.frames - 1)
      : anim === 'attack' && swingT !== null ? Math.min(sheet.frames - 1, Math.floor(swingT * sheet.frames))
      : f % sheet.frames;
    // hit flash fades out; the lean eases back
    this.flash = Math.max(0, (this.flash || 0) - dt / 0.12);
    this.material.uniforms.uFlash.value = Math.min(1, this.flash) * 0.85;
    this.lean = Math.max(0, (this.lean || 0) - dt / 0.18);
    const lk = Math.sin(this.lean * Math.PI / 2) * 0.16;
    x += (this.leanX || 0) * lk; z += (this.leanZ || 0) * lk;
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
    this.bar.position.set(x, BAR_UP, z).addScaledVector(CAM_RIGHT, -BAR_W / 2);
  }

  // hp bar over every unit with health, hidden once down; length = hp / maxHp,
  // colour from green (full) to dark red (nearly dead), see health.js
  setHealth(hp, maxHp) {
    this.bar.visible = !!maxHp && hp > 0;
    if (!this.bar.visible) return;
    const { frac, color } = healthBar(hp, maxHp);
    this.fill.scale.x = BAR_W * frac;
    this.fill.visible = frac > 0;
    this.fill.material.color.setRGB(...color);
  }

  // got hit: flash white and lean away from the attacker (dx, dz: unit push direction)
  struck(dx, dz, strong) {
    this.flash = strong ? 1.6 : 1;
    this.lean = 1;
    this.leanX = dx; this.leanZ = dz;
  }
}
