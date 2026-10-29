// Draws a unit from the game state with its 8-direction spritesheets.
import * as THREE from 'three';
import { healthBar } from './health.js';
import { CAM_QUAT, CAM_RIGHT } from './iso.js';
import { spriteMaterial, shadowMaterial, hiddenMaterial, weaponGlowMaterial } from './shading.js';
import { Thing, loadTex } from './scenery.js';
import { drawCrest } from './banners.js';
import { createWeaponLightning, readBladeAxes } from './weapon_lightning.js';

const TRAIL = 5;   // hero swing trail: how many earlier glow frames are drawn behind the blade

const CELL_WORLD = 3;       // a 160px cell covers 3 world units (see sprite_render_test.html)
const FEET_UP = 0.9;        // the cell centre is 0.9 units above the feet
const FPS = 12;
// drawing scale for characters inside buildings (Tim tried 0.75 on 2026-10-18 and went back to 1);
// drawing only, reach and body sizes in the rules stay the same
export const INDOOR_SIZE = 1;
// health bar above the head: dark back plus a coloured fill that shrinks from the right
const BAR_W = 0.9, BAR_H = 0.09, BAR_UP = 2.35;
const BAR_GEO = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
// both transparent with the fill one step later, so the dark back never draws over the fill
const BAR_BACK = new THREE.MeshBasicMaterial({ color: 0x0a0806, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false });
const RING_GEO = new THREE.RingGeometry(0.55, 0.68, 40);
const RING_MAT = new THREE.MeshBasicMaterial({ color: 0x8fd17a, transparent: true, opacity: 0.85, depthWrite: false });

// Weapon glow per weapon type and which model holds what, from data/weapon_glow.json (loaded once)
let glowConfig = null;
const loadGlowConfig = () => (glowConfig ??= fetch('data/weapon_glow.json').then(r => r.ok ? r.json() : null).catch(() => null));

// Spritesheets per model, from data/art.json "characters"
const sheetCache = {};
export async function loadSheets(catalog, model) {
  if (sheetCache[model]) return sheetCache[model];
  const names = catalog.characters[model];
  const sheets = {};
  Object.defineProperty(sheets, 'framing', { value: catalog.characterFraming?.[model] || {} });
  const cfg = await loadGlowConfig();
  const weapon = cfg?.weapons?.[cfg.models?.[model]];
  // the glow settings ride along on the sheet set, hidden from anything that lists the animations
  if (weapon) Object.defineProperty(sheets, 'weapon', { value: weapon });
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
    // the weapon alone as a soft halo (tools/export_sprites.mjs), same frames at half size; missing = no glow
    if (weapon) sheets[anim].glow = await loadTex(`../assets/sprites/${file}_glow.png`).catch(() => null);
    if (weapon?.lightning && sheets[anim].glow) sheets[anim].bladeAxes = readBladeAxes(sheets[anim].glow,sheets[anim].frames);
  }));
  return (sheetCache[model] = sheets);
}

export class CharacterSprite {
  constructor(sheets) {
    this.sheets = sheets;
    this.cellWorld = sheets.framing?.cellWorld || CELL_WORLD;
    this.feetUp = sheets.framing?.feetUp ?? FEET_UP;
    this.material = spriteMaterial(sheets.idle.tex, { uSelfLight: { value: new THREE.Color(0.2, 0.18, 0.16) } });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    mesh.quaternion.copy(CAM_QUAT);
    mesh.scale.set(this.cellWorld, this.cellWorld, 1);
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
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256; labelCanvas.height = 48;
    this.labelContext = labelCanvas.getContext('2d');
    this.labelTexture = new THREE.CanvasTexture(labelCanvas);
    this.labelMaterial = new THREE.MeshBasicMaterial({ map: this.labelTexture, transparent: true, depthTest: false, depthWrite: false });
    this.nameplate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), this.labelMaterial);
    this.nameplate.quaternion.copy(CAM_QUAT);
    // Keep visible units' clickable labels above smoke (99810) and combat
    // particles. Visibility/stealth still decides whether a label exists.
    this.nameplate.renderOrder = 99860;
    this.nameplate.frustumCulled = false;
    this.nameplate.visible = false;
    this.pos = new THREE.Vector3();
    this.anim = 'idle';
    this.time = 0;
    this.size = 1;
    // faint glow on the held weapon, drawn just after the sprite (Thing extras keep it in the draw order)
    const weapon = sheets.weapon;
    if (weapon && Object.values(sheets).some(sh => sh.glow)) {
      this.weapon = weapon;
      const firstGlow = Object.values(sheets).find(sh => sh.glow).glow;
      if (weapon.void) {
        this.voidHalo = new THREE.Mesh(mesh.geometry, weaponGlowMaterial(this.material.uniforms, firstGlow, weapon.color, 0, { void: true, dark: true }));
        this.voidHalo.frustumCulled = false;
        mesh.add(this.voidHalo);
        this.thing.extras.push(this.voidHalo);
      }
      this.glow = new THREE.Mesh(mesh.geometry, weaponGlowMaterial(this.material.uniforms, firstGlow, weapon.color, 0, { void: !!weapon.void, coreColor: weapon.coreColor, coreStrength: weapon.coreStrength ?? 0, shimmerColor: weapon.shimmerColor }));
      this.glow.frustumCulled = false;
      mesh.add(this.glow);
      this.thing.extras.push(this.glow);
      // hero weapons (weapon_glow.json "hero"): a light trail on swings, from the last few glow frames
      // drawn again with fading strength (Tim 2026-10-28, option 4: shimmer idle + trail on attacks)
      if (weapon.lightning) {
        this.lightning=createWeaponLightning(this.material.uniforms);
        mesh.add(this.lightning.mesh);this.thing.extras.push(this.lightning.mesh);
      }
      if (weapon.hero && !weapon.lightning) {
        this.trail = []; this.trailHistory = []; this.trailClock = 0;
        for (let i = 0; i < TRAIL; i++) {
          const own = { uFrame: { value: new THREE.Vector4() }, uDepthAt: this.material.uniforms.uDepthAt, uOpacity: this.material.uniforms.uOpacity };
          const m = new THREE.Mesh(mesh.geometry, weaponGlowMaterial(own, firstGlow, weapon.trailColor || weapon.color, 0, { coreColor: weapon.shimmerColor || [1, 1, 1], coreStrength: 0.6 }));
          m.frustumCulled = false; m.visible = false; mesh.add(m); this.thing.extras.push(m); this.trail.push(m);
        }
      }
    }
  }

  // x, z: interpolated position; dir and anim come from the latest game state
  // swingT: 0..1 through the current attack swing (the attack sheet is stretched over the swing)
  // size: drawing scale (INDOOR_SIZE inside buildings)
  update(dt, x, z, dir, anim, swingT = null, size = 1) {
    if (anim !== this.anim) { this.anim = anim; this.time = 0; }
    this.time += dt;
    const sheet = this.sheets[anim] || this.sheets.idle;
    // a fall plays once and stays down; an attack follows the swing; everything else loops
    const f = Math.floor(this.time * FPS * sheet.speed);
    const frame = anim === 'death' ? Math.min(f, sheet.frames - 1)
      : (anim === 'attack' || anim === 'sweep') && swingT !== null ? Math.min(sheet.frames - 1, Math.floor(swingT * sheet.frames))
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
    if (this.glow) {
      // a slow faint shimmer, a little brighter mid-swing, fading out as the unit falls
      const w = this.weapon, g = this.glow.material.uniforms;
      this.glow.visible = !!sheet.glow;
      if (sheet.glow) g.uMap.value = sheet.glow;
      const swing = (anim === 'attack' || anim === 'sweep') && swingT !== null ? Math.sin(Math.PI * swingT) * (w.attack || 0) : 0;
      const fall = anim === 'death' ? Math.max(0, 1 - this.time / 0.8) : 1;
      const pulse = w.pulse ?? .1;
      g.uStrength.value = w.strength * (1 - pulse + pulse * Math.sin(this.time * (w.pulseRate ?? 2.2))) * (1 + swing) * fall;
      if (w.lightning) this.lightning.update(dt,sheet.bladeAxes?.[dir*sheet.frames+frame],swing,!!sheet.glow&&anim!=='death');
      if (w.hero && !w.lightning) {
        // shimmer: every shimmerEvery s a band of light runs up the blade over shimmerSeconds
        const every = w.shimmerEvery ?? 2.6, run = w.shimmerSeconds ?? 1.0, t = (this.time + (this.shimmerOffset ??= Math.random() * every)) % every;
        g.uShimmer.value = t < run && fall === 1 ? -0.15 + 1.3 * (t / run) : -1;
        // trail: keep the last TRAIL glow frames while swinging, then let them fade out
        const swinging = (anim === 'attack' || anim === 'sweep') && swingT !== null && sheet.glow;
        this.trailClock += dt;
        if (swinging && this.trailClock >= 1 / 40) {
          this.trailClock = 0;
          this.trailHistory.unshift({ frame: u.uFrame.value.clone(), map: sheet.glow, life: 1 });
          this.trailHistory.length = Math.min(this.trailHistory.length, TRAIL);
        }
        for (const h of this.trailHistory) h.life -= dt / (swinging ? 0.45 : 0.18);
        this.trail.forEach((m, i) => {
          const h = this.trailHistory[i + 1];   // [0] is the current frame, already drawn by the glow
          m.visible = !!h && h.life > 0;
          if (!m.visible) return;
          const tu = m.material.uniforms;
          tu.uFrame.value.copy(h.frame); tu.uMap.value = h.map;
          tu.uStrength.value = (w.trailStrength ?? 0.8) * h.life * (1 - i / TRAIL);
        });
      }
      if (this.voidHalo) {
        this.voidHalo.visible = this.glow.visible;
        const dark = this.voidHalo.material.uniforms;
        dark.uMap.value = g.uMap.value;
        dark.uStrength.value = g.uStrength.value;
      }
    }

    this.pos.set(x, 0, z);
    const r = 0.2;
    if (size !== this.size) {
      this.size = size;
      this.thing.mesh.scale.set(this.cellWorld * size, this.cellWorld * size, 1);
      this.hidden.scale.copy(this.thing.mesh.scale);
      this.shadow.scale.setScalar(size);
      this.ring.scale.setScalar(size);
    }
    this.thing.mesh.position.set(x, this.feetUp * size, z);
    this.hidden.position.set(x, FEET_UP * size, z);
    u.uDepthAt.value.set(x, 0, z, 0.45);
    this.thing.foot = { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r };
    this.thing.updateScreen();
    this.shadow.position.set(x, 0.01, z);
    this.ring.position.set(x, 0.02, z);
    this.bar.position.set(x, BAR_UP * size, z).addScaledVector(CAM_RIGHT, -BAR_W / 2);
    this.nameplate.position.set(x, (BAR_UP + 0.35) * size, z);
    this.nameplate.scale.setScalar(size);
  }

  setNameplate(name, visible, color = '#d4aa5a', clan = false) {
    this.nameplate.visible = !!visible && !!name;
    const key = `${name}|${color}|${clan}`;
    if (!name || key === this.nameplateText) return;
    this.nameplateText = key;
    const g = this.labelContext;
    g.clearRect(0, 0, 256, 48);
    g.fillStyle = 'rgba(8,10,14,.78)'; g.beginPath(); g.roundRect(4, 5, 248, 38, 9); g.fill();
    g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); g.roundRect(5, 6, 246, 36, 8); g.stroke();
    if (clan) {
      g.fillStyle = color; g.beginPath(); g.arc(231, 24, 14, 0, Math.PI * 2); g.fill();
      drawCrest(g, 231, 24, 10);
    }
    g.font = '600 25px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f1e4c7'; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText(name, clan ? 114 : 128, 24, clan ? 204 : 232);
    this.labelTexture.needsUpdate = true;
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

  // the same bar used as a timer instead (arrest / execute channel, jail time): frac 0..1, rgb 0..1
  setBar(frac, rgb) {
    this.bar.visible = true;
    this.fill.scale.x = BAR_W * Math.max(0, Math.min(1, frac));
    this.fill.visible = frac > 0;
    this.fill.material.color.setRGB(...rgb);
  }

  // free the GPU copies when the unit leaves the map (townsfolk come and go, bandits each night)
  dispose() {
    this.thing.mesh.geometry.dispose();
    this.shadow.geometry.dispose();
    for (const m of [this.material, this.hidden.material, this.fill.material, this.labelMaterial]) m.dispose();
    this.nameplate.geometry.dispose(); this.labelTexture.dispose();
    this.glow?.material.dispose();
    this.lightning?.dispose();
    for (const m of this.trail || []) m.material.dispose();
    this.voidHalo?.material.dispose();
  }

  // got hit: flash white and lean away from the attacker (dx, dz: unit push direction)
  struck(dx, dz, strong) {
    this.flash = strong ? 1.6 : 1;
    this.lean = 1;
    this.leanX = dx; this.leanZ = dz;
  }
}
