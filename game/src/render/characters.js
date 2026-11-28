// Draws a unit from the game state with its 8-direction spritesheets.
import * as THREE from 'three';
import { healthBar } from './health.js';
import { CAM_QUAT, CAM_RIGHT, CAM_UP, VIEW_DIR } from './iso.js';
import { spriteMaterial, shadowMaterial, footShadowMaterial, hiddenMaterial, weaponGlowMaterial, outlineMaterial } from './shading.js';
import { Thing, loadTex } from './scenery.js';
import { drawCrest } from './banners.js';
import { createWeaponLightning, readBladeAxes } from './weapon_lightning.js';
import { createWeaponShadow } from './weapon_shadow.js';
import { createRunTrail } from './run_trail.js';
import { cachedSheetLoad } from './sheet_cache.js';
import { createGearFx } from './gear_fx.js';
import { loadSheetSet, setSheetFrame } from './packed_sheets.js';
import { createTextureCache } from './texture_cache.js';
import { halfUrl, ktxUrl, compressedAt, createDetailPicker } from './sprite_detail.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { groundY } from '../castle_height.js';

const TRAIL = 5;   // hero swing trail: how many earlier glow frames are drawn behind the blade

const CELL_WORLD = 3;       // a 160px cell covers 3 world units (see sprite_render_test.html)
const ROLL_Q = new THREE.Quaternion(), Z_AXIS = new THREE.Vector3(0, 0, 1);
const FEET_UP = 0.9;        // the cell centre is 0.9 units above the feet
const FPS = 12;
// drawing scale for characters inside buildings (tried 0.75 on 2026-10-18 and went back to 1);
// drawing only, reach and body sizes in the rules stay the same
export const INDOOR_SIZE = 1;
// health bar above the head: dark back plus a coloured fill that shrinks from the right
const BAR_W = 0.9, BAR_H = 0.09, BAR_UP = 2.35;
const BAR_GEO = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
// both transparent with the fill one step later, so the dark back never draws over the fill
const BAR_BACK = new THREE.MeshBasicMaterial({ color: 0x0a0806, transparent: true, opacity: 0.68, depthTest: false, depthWrite: false });
const RING_GEO = new THREE.RingGeometry(0.55, 0.68, 40);
const RING_MAT = new THREE.MeshBasicMaterial({ color: 0x8fd17a, transparent: true, opacity: 0.38, depthWrite: false });   // softer (2026-11-01)

// Weapon glow per weapon type and which model holds what, from data/weapon_glow.json (loaded once)
let glowConfig = null;
const loadGlowConfig = () => (glowConfig ??= fetch('data/weapon_glow.json').then(r => r.ok ? r.json() : null).catch(() => null));

// Spritesheets per model, from data/art.json "characters"
const sheetCache = {};
// ---- sprite memory (2026-11-15) ---------------------------------------------------------------------------------
// 1. Once a packed page is on the graphics card, its decoded copy in the page is closed (it was held twice).
// 2. Far out the half-size pages are used, up close the full ones (render/sprite_detail.js); the swap is in place.
// 3. A model's sheets are dropped when no sprite has used them for SHEET_IDLE_SECONDS; they load again when needed.
// 4. GPU-compressed pages (KTX2, 2026-11-15): Video settings, Compressed sprites, picks where they are used (read
//    at start); a page without a compressed copy, or a graphics card that cannot take them, uses the PNG.
const noHalf = new Set();   // full page urls whose half page is missing: use the full page
// ships and boats (2026-11-23): rendered at twice people's page pixels per unit (tools/export_sprites.mjs MOUNTS) and drawn up
// to 1.7 times larger (the warship at half that page density, 1.15 times), so their pages switch to half size a little
// further out than people's (BIG_DRAWN_SCALE) and load GPU-compressed at every zoom unless
// Video settings Compressed sprites is Off (4 times the pixels at a quarter of the bytes: memory as before)
const BIG_DRAWN = /\/catalog_v1\/(ship_|boat_)[^/]*\.png$/, BIG_DRAWN_SCALE = 1.2;
const noKtx = new Set();    // compressed page urls that failed to load
let ktx = null, ktxMode = 'off';
const KTX_TRANSCODER = 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/basis/';
export function useCompressedSprites(renderer, mode = 'far') {
  ktxMode = mode;
  if (mode === 'off' || ktx) return;
  try { ktx = new KTX2Loader().setTranscoderPath(KTX_TRANSCODER).detectSupport(renderer); }
  catch { ktx = null; ktxMode = 'off'; }
}
async function loadKtx(url) {
  const tex = await ktx.loadAsync(url);
  tex.colorSpace = THREE.NoColorSpace;   // stored values pass through, like the PNG pages (output is linear)
  tex.flipY = false;
  tex.minFilter = tex.mipmaps.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}
async function loadPage(url, level) {
  const squeeze = compressedAt(ktxMode, level) || (ktxMode !== 'off' && BIG_DRAWN.test(url));
  const k = ktx && squeeze ? ktxUrl(url, level) : null;
  if (k && !noKtx.has(k)) { try { return [await loadKtx(k), level]; } catch { noKtx.add(k); } }
  const h = level === 'half' && !noHalf.has(url) ? halfUrl(url) : null;
  if (h) { try { return [configured(await loadTex(h)), 'half']; } catch { noHalf.add(url); } }
  return [configured(await loadTex(url)), 'full'];
}
function describePage(tex, level) {
  const im = tex.image, k = level === 'half' ? 2 : 1;
  tex.userData.level = level;
  tex.userData.size = { width: im.width, height: im.height };
  tex.userData.full = { width: im.width * k, height: im.height * k };
  // graphics card memory with mip levels: 4 bytes a pixel as PNG, 1 byte compressed (BC7 / ASTC 4x4 / ETC2)
  tex.userData.bytes = Math.round(im.width * im.height * (tex.isCompressedTexture ? 1 : 4) * 4 / 3);
}
// once on the graphics card the page's own copy is freed: the picture (PNG) or the compressed levels (KTX2)
const closeAfterUpload = tex => { tex.onUpdate = () => {
  if (tex.isCompressedTexture) { tex.mipmaps = []; return; }
  const b = tex.image; if (b && typeof b.close === 'function') b.close();
}; };
// give an existing page texture the picture of another (the sprites keep the same texture object), PNG or compressed
const PICTURE_KEYS = ['image', 'mipmaps', 'format', 'type', 'internalFormat', 'minFilter', 'generateMipmaps', 'colorSpace', 'premultiplyAlpha', 'unpackAlignment'];
function adoptPicture(texture, next) {
  for (const key of PICTURE_KEYS) texture[key] = next[key];
  texture.isCompressedTexture = !!next.isCompressedTexture;
  texture.flipY = false;
}
// the pages the game view draws: detail levels, decoded copy closed after upload
const pageLoad = async (url, level) => { const [tex, got] = await loadPage(url, level); describePage(tex, got); closeAfterUpload(tex); return tex; };
const pageSwap = async (texture, url, level, stillHeld) => {
    if (level === 'half' && (noHalf.has(url) || !halfUrl(url))) return;   // no half page for this one: it stays full
    const [next, got] = await loadPage(url, level);
    if (!stillHeld() || got === texture.userData.level) { next.image?.close?.(); next.dispose(); return; }
    texture.dispose();                 // the graphics card copy has a fixed size: free it, the next draw uploads the new picture
    adoptPicture(texture, next); describePage(texture, got); texture.needsUpdate = true;
  };
const mainTextures = createTextureCache(pageLoad, 4, pageSwap);
const shipTextures = createTextureCache(pageLoad, 4, pageSwap);
const cacheFor = url => BIG_DRAWN.test(url) ? shipTextures : mainTextures;
const packedTextures = {
  acquire: url => cacheFor(url).acquire(url),
  release(texture) { mainTextures.release(texture); shipTextures.release(texture); },
  level: () => mainTextures.level(),
  stats() { const a = mainTextures.stats(), b = shipTextures.stats(); for (const k in b) a[k] = (a[k] || 0) + b[k]; return a; },
};
// pages drawn by another renderer (the character page preview): always full, kept as loaded
const plainTextures = createTextureCache(async url => { const tex = await loadTex(url); describePage(tex, 'full'); configureCharacterTexture(tex); return tex; });
const SHEET_IDLE_SECONDS = 180;
const sheetUse = new Map();   // sheets -> { keys: Set of sheetCache keys, count, idleAt (seconds) }
const nowSeconds = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000;
function trackSheets(key, sheets) {
  let u = sheetUse.get(sheets);
  if (!u) sheetUse.set(sheets, u = { keys: new Set(), count: 0, idleAt: nowSeconds() });
  u.keys.add(key); u.idleAt = nowSeconds();
  return sheets;
}
export function retainSheets(sheets) { const u = sheetUse.get(sheets); if (u) u.count++; }
export function releaseSheets(sheets) { const u = sheetUse.get(sheets); if (u && u.count > 0 && --u.count === 0) u.idleAt = nowSeconds(); }
// drop the sheets nobody has drawn for a while (called by the view every few seconds); returns how many models went
export function sweepSheets(now = nowSeconds(), idle = SHEET_IDLE_SECONDS) {
  let n = 0;
  for (const [sheets, u] of sheetUse) {
    if (u.count > 0 || now - u.idleAt < idle) continue;
    sheetUse.delete(sheets);
    for (const k of u.keys) delete sheetCache[k];
    const cache = sheets.textureCache || packedTextures, seen = new Set();
    for (const sheet of Object.values(sheets)) {
      if (sheet?.packed) { for (const list of [sheet.packed.color, sheet.packed.glow]) for (const f of list || []) if (f?.map && !seen.has(f.map)) { seen.add(f.map); cache.release(f.map); } }
      else for (const t of [sheet?.tex, sheet?.glow]) if (t && !seen.has(t)) { seen.add(t); t.dispose(); }
    }
    n++;
  }
  return n;
}
// the view tells how big sprites are on screen (screen pixels per sprite texel); pages follow
const detail = createDetailPicker(), shipDetail = createDetailPicker();
export function setSpriteScale(ratio, now = nowSeconds()) {
  mainTextures.setLevel(detail.update(ratio, now));
  shipTextures.setLevel(shipDetail.update(ratio * BIG_DRAWN_SCALE, now));
}
export const spriteMemory = () => ({ ...packedTextures.stats(), level: packedTextures.level(), models: sheetUse.size, inUse: [...sheetUse.values()].filter(u => u.count > 0).length });
export function loadSheets(catalog, model) {
  return cachedSheetLoad(sheetCache,model,()=>loadModelSheets(catalog,model).then(s=>trackSheets(model,s))).then(s=>{const u=sheetUse.get(s);if(u)u.idleAt=nowSeconds();return s;});
}
// Character page portrait (tools/export_sprites.mjs <model> --portrait --pack): the idle,
// front row only, at 512 px. Models without a portrait use their normal sheets.
export function loadPortraitSheets(catalog, model) {
  const idle = catalog.characters[model]?.idle, speed = idle?.speed ?? 1;
  // the preview has its own renderer, so its pages come from plainTextures (never the game view's closed, resized pages)
  return cachedSheetLoad(sheetCache, 'portrait:' + model, () => loadModelSheets(catalog, model, {
    names: { idle: { file: `${model}_portrait_idle`, speed } },
    packedUrl: `../assets/sprites_packed/portraits/${model}.json`,
    fallback: () => loadModelSheets(catalog, model, null, plainTextures),
  }, plainTextures).then(s => trackSheets('portrait:' + model, s)));
}
async function loadModelSheets(catalog, model, portrait = null, textures = packedTextures) {
  const names = portrait?.names || catalog.characters[model];
  const sheets = {};
  Object.defineProperty(sheets, 'framing', { value: catalog.characterFraming?.[model] || {} });
  const cfg = await loadGlowConfig();
  const weapon = cfg?.weapons?.[cfg.models?.[model]];
  // the glow settings ride along on the sheet set, hidden from anything that lists the animations
  if (weapon) Object.defineProperty(sheets, 'weapon', { value: weapon });
  const packedUrl = portrait ? portrait.packedUrl : catalog.packedCharacters?.[model];
  const loaded = await loadSheetSet({
    packedUrl: packedUrl ? new URL(packedUrl, document.baseURI).href : null,
    disabled: new URLSearchParams(globalThis.location?.search || '').get('sprites') === 'original',
    model, names, requireGlow: !!weapon,
    loadJson: async url => { const response = await fetch(url); if (!response.ok) throw new Error(`Could not load ${url}`); return response.json(); },
    loadTexture: url => textures.acquire(url),
    releaseTexture: texture => textures.release(texture),
    loadOriginal: portrait ? portrait.fallback : () => loadOriginalSheets(names, weapon),
    onFallback: error => portrait ? console.info(`[sprites] ${model}: no portrait yet, using game sheets`)
      : console.warn(`[sprites] ${model}: packed load failed; using original sheets`, error),
  });
  Object.assign(sheets, loaded);
  if (!Object.getOwnPropertyDescriptor(loaded, 'textureCache')) Object.defineProperty(sheets, 'textureCache', { value: textures });
  else return loaded;   // a portrait that fell back to the game sheets: hand that set on as it is
  if (loaded.packing) Object.defineProperty(sheets, 'packing', {value: loaded.packing});
  if (packedUrl) console.info(`[sprites] ${model}: ${loaded.packing ? 'packed atlas trial' : 'original sheets'}`, loaded.packing || '');
  return sheets;
}

function configureCharacterTexture(tex) {
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
}
const configured = tex => { configureCharacterTexture(tex); return tex; };

async function loadOriginalSheets(names, weapon) {
  const sheets = {};
  // each entry is a sheet name, or { file, speed } where speed scales the playback rate
  await Promise.all(Object.entries(names).map(async ([anim, entry]) => {
    const { file, speed = 1 } = typeof entry === 'string' ? { file: entry } : entry;
    const tex = await loadTex(`../assets/sprites/${file}.png`);
    // mipmaps keep the sprite clean when zoomed out (frames are padded, so no bleeding between cells)
    configureCharacterTexture(tex);
    // rows are the 8 directions; the frame count follows from the sheet's shape
    sheets[anim] = { tex, speed, frames: Math.round(tex.image.width / tex.image.height * 8) };
    // the weapon alone as a soft halo (tools/export_sprites.mjs), same frames at half size; missing = no glow
    if (weapon) sheets[anim].glow = await loadTex(`../assets/sprites/${file}_glow.png`).catch(() => null);
    if ((weapon?.lightning || weapon?.shadow || weapon?.runTrail) && sheets[anim].glow) sheets[anim].bladeAxes = readBladeAxes(sheets[anim].glow,sheets[anim].frames);
  }));
  return sheets;
}

export class CharacterSprite {
  constructor(sheets) {
    this.sheets = sheets; retainSheets(sheets);
    this.cellWorld = sheets.framing?.cellWorld || CELL_WORLD;
    this.feetUp = sheets.framing?.feetUp ?? FEET_UP;
    // rows in the sheets (8, or 16/32 for long vehicles); roll: turn the picture in the screen plane by this many
    // radians about the ground point, heading: true ground angle for the foot shadow (train cars, render/rail_track.js)
    this.dirs = sheets.idle?.dirs || 8;
    this.roll = 0; this.heading = null;
    this.material = spriteMaterial(sheets.idle.tex, { uSelfLight: { value: new THREE.Color(0.2, 0.18, 0.16) } }, !!sheets.packing);
    setSheetFrame(this.material.uniforms, sheets.idle, 0, 0);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    mesh.quaternion.copy(CAM_QUAT);
    mesh.scale.set(this.cellWorld, this.cellWorld, 1);
    mesh.frustumCulled = true;
    // in 3D rooms the sprite is hidden by furniture in front of it; a faint outline shows where it is
    this.material.depthTest = true;
    this.hidden = new THREE.Mesh(mesh.geometry, hiddenMaterial(this.material.uniforms, !!sheets.packing));
    this.hidden.quaternion.copy(CAM_QUAT);
    this.hidden.scale.copy(mesh.scale);
    this.hidden.renderOrder = 99500;
    this.hidden.frustumCulled = true;
    this.thing = new Thing(mesh, { minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
    // vehicles: footprint shadow [length, width] that turns with them (characterFraming shadow)
    this.footShadow = sheets.framing?.shadow || null;
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), this.footShadow ? footShadowMaterial : shadowMaterial);
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
    for (const m of [back, this.fill]) m.frustumCulled = true;
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
    this.nameplate.frustumCulled = true;
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
      // Color and glow have independent packed layouts. They still use the
      // same original full-cell space as lightning, trails and the body quad.
      const glowUniforms = {...this.material.uniforms,
        uFrame: {value: new THREE.Vector4(0, 0, 1, 1)},
        uSampleBounds: {value: new THREE.Vector4(0, 0, 1, 1)}};
      if (weapon.void) {
        this.voidHalo = new THREE.Mesh(mesh.geometry, weaponGlowMaterial(glowUniforms, firstGlow, weapon.color, 0, { void: true, dark: true, packed: !!sheets.packing }));
        this.voidHalo.frustumCulled = false;
        mesh.add(this.voidHalo);
        this.thing.extras.push(this.voidHalo);
      }
      this.glow = new THREE.Mesh(mesh.geometry, weaponGlowMaterial(glowUniforms, firstGlow, weapon.color, 0, { void: !!weapon.void, coreColor: weapon.coreColor, coreStrength: weapon.coreStrength ?? 0, shimmerColor: weapon.shimmerColor, packed: !!sheets.packing }));
      const initialGlowSheet = sheets.idle.glow ? sheets.idle : Object.values(sheets).find(sh => sh.glow);
      setSheetFrame(this.glow.material.uniforms, initialGlowSheet, 0, 0, true);
      this.glow.frustumCulled = false;
      mesh.add(this.glow);
      this.thing.extras.push(this.glow);
      // hero weapons (weapon_glow.json "hero"): a light trail on swings, from the last few glow frames
      // drawn again with fading strength (2026-10-28, option 4: shimmer idle + trail on attacks)
      if (weapon.lightning) {
        this.lightning=createWeaponLightning(this.material.uniforms);
        mesh.add(this.lightning.mesh);this.thing.extras.push(this.lightning.mesh);
      }
      if (weapon.shadow) {
        this.shadowBlade=createWeaponShadow(this.material.uniforms);
        mesh.add(this.shadowBlade.mesh);this.thing.extras.push(this.shadowBlade.mesh);
      }
      if (weapon.runTrail) {   // hero running trail (+ Kuroda sparks/arc, Yakuza hum) (render/run_trail.js)
        this.runTrail=createRunTrail(this.material.uniforms,weapon.runTrail);
        mesh.add(this.runTrail.mesh);this.thing.extras.push(this.runTrail.mesh);
      }
      if (weapon.hero && !weapon.lightning && !weapon.shadow) {
        this.trail = []; this.trailHistory = []; this.trailClock = 0;
        for (let i = 0; i < TRAIL; i++) {
          const own = { uFrame: { value: new THREE.Vector4() }, uSampleBounds: {value: new THREE.Vector4(0, 0, 1, 1)}, uDepthAt: this.material.uniforms.uDepthAt, uOpacity: this.material.uniforms.uOpacity };
          const m = new THREE.Mesh(mesh.geometry, weaponGlowMaterial(own, firstGlow, weapon.trailColor || weapon.color, 0, { coreColor: weapon.shimmerColor || [1, 1, 1], coreStrength: 0.6, packed: !!sheets.packing }));
          m.frustumCulled = false; m.visible = false; mesh.add(m); this.thing.extras.push(m); this.trail.push(m);
        }
      }
    }
  }

  setEquipment(items=[]) {
    const key=items.map(i=>i?.name||'').join('|');
    if(key===this.gearEffect)return;this.gearEffect=key;this.gearItems=items;
    // One effect per item kind (render/gear_fx.js); no variant sheets.
    if(this.gearFx||items.some(Boolean))(this.gearFx??=createGearFx(this)).set(items);
    const accent=items[0]?.glow;
    // Preserve each hero's established weapon signature; gear adds a tint/glint.
    if(this.glow){const c=this.weapon.color;this.glow.material.uniforms.uColor.value.setRGB(...c.map((v,i)=>accent?v*.8+accent[i]*.2:v));}
  }

  // x, z: interpolated position; dir and anim come from the latest game state
  // swingT: 0..1 through the current attack swing (the attack sheet is stretched over the swing)
  // size: drawing scale (INDOOR_SIZE inside buildings)
  update(dt, x, z, dir, anim, swingT = null, size = 1) {
    if (anim !== this.anim) { this.anim = anim; this.time = 0; }
    this.time += dt;
    // riding (render/view.js): a strike from the saddle plays the rideAttack sheet (tools/export_sprites.mjs RIDE_ATTACK),
    // or stays in the riding seat for a body that has none yet
    const sheet = (this.riding && (anim === 'attack' || anim === 'sweep') && (this.sheets.rideAttack || this.sheets.ride)) || this.sheets[anim] || this.sheets.idle;
    // a fall plays once and stays down; an attack follows the swing; everything else loops
    const f = Math.floor(this.time * FPS * sheet.speed);
    const frame = anim === 'death' ? Math.min(f, sheet.frames - 1)
      : (anim === 'attack' || anim === 'sweep') && swingT !== null ? Math.min(sheet.frames - 1, Math.floor(swingT * sheet.frames))
      : f % sheet.frames;
    // hit flash fades out; the lean eases back
    this.flash = Math.max(0, (this.flash || 0) - dt / 0.12);
    this.material.uniforms.uFlash.value = Math.min(1, this.flash) * 0.15;   // 2026-11-12: the white hit flash read as a strobe at night (was 0.85)
    this.lean = Math.max(0, (this.lean || 0) - dt / 0.18);
    const lk = Math.sin(this.lean * Math.PI / 2) * 0.16;
    x += (this.leanX || 0) * lk; z += (this.leanZ || 0) * lk;
    const u = this.material.uniforms;
    setSheetFrame(u, sheet, dir, frame);
    if (this.glow) {
      // a slow faint shimmer, a little brighter mid-swing, fading out as the unit falls
      const w = this.weapon, g = this.glow.material.uniforms;
      this.glow.visible = !!sheet.glow;
      if (sheet.glow) setSheetFrame(g, sheet, dir, frame, true);
      const swing = (anim === 'attack' || anim === 'sweep') && swingT !== null ? Math.sin(Math.PI * swingT) * (w.attack || 0) : 0;
      const fall = anim === 'death' ? Math.max(0, 1 - this.time / 0.8) : 1;
      const pulse = w.pulse ?? .1;
      g.uStrength.value = w.strength * (1 - pulse + pulse * Math.sin(this.time * (w.pulseRate ?? 2.2))) * (1 + swing) * fall;
      if (w.lightning) this.lightning.update(dt,sheet.bladeAxes?.[dir*sheet.frames+frame],swing,!!sheet.glow&&anim!=='death');
      if (w.shadow) this.shadowBlade.update(dt,sheet.bladeAxes?.[dir*sheet.frames+frame],
        (anim==='attack'||anim==='sweep')?swingT:null,!!sheet.glow&&anim!=='death',{anim,dir});
      if (this.runTrail) this.runTrail.update(dt,anim,dir,!!sheet.glow&&anim!=='death',sheet.bladeAxes?.[dir*sheet.frames+frame],
        (anim==='attack'||anim==='sweep')?swingT:null,g.uShimmer?.value>-1);
      if (w.hero && !w.lightning && !w.shadow) {
        // shimmer: every shimmerEvery s a band of light runs up the blade over shimmerSeconds
        const every = w.shimmerEvery ?? 2.6, run = w.shimmerSeconds ?? 1.0, t = (this.time + (this.shimmerOffset ??= Math.random() * every)) % every;
        g.uShimmer.value = t < run && fall === 1 ? -0.15 + 1.3 * (t / run) : -1;
        // trail: keep the last TRAIL glow frames while swinging, then let them fade out
        const swinging = (anim === 'attack' || anim === 'sweep') && swingT !== null && sheet.glow;
        this.trailClock += dt;
        if (swinging && this.trailClock >= 1 / 40) {
          this.trailClock = 0;
          this.trailHistory.unshift({ frame: g.uFrame.value.clone(), bounds: g.uSampleBounds.value.clone(), map: g.uMap.value, life: 1 });
          this.trailHistory.length = Math.min(this.trailHistory.length, TRAIL);
        }
        for (const h of this.trailHistory) h.life -= dt / (swinging ? 0.45 : 0.18);
        this.trail.forEach((m, i) => {
          const h = this.trailHistory[i + 1];   // [0] is the current frame, already drawn by the glow
          m.visible = !!h && h.life > 0;
          if (!m.visible) return;
          const tu = m.material.uniforms;
          tu.uFrame.value.copy(h.frame); tu.uSampleBounds.value.copy(h.bounds); tu.uMap.value = h.map;
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

    // gear effects after the weapon glow, so a glint can ride on it; gearFocus = character page hover
    this.gearFx?.update(dt,{anim,sheet,dir,frame,swingT,x,z,focus:this.gearFocus});
    // castle terraces (Z4h): everything a unit draws stands on the ground height under it (src/castle_height.js)
    const gy = groundY(x, z);
    this.pos.set(x, gy, z);
    const r = 0.2;
    if (size !== this.size) {
      this.size = size;
      this.thing.mesh.scale.set(this.cellWorld * size, this.cellWorld * size, 1);
      this.hidden.scale.copy(this.thing.mesh.scale);
      this.shadow.scale.setScalar(size);
      this.ring.scale.setScalar(size);
    }
    this.thing.mesh.position.set(x, this.feetUp * size + (this.lift || 0) + gy, z);   // lift: riding a horse (render/view.js)
    if (this.seat) this.thing.mesh.position.addScaledVector(CAM_RIGHT, this.seat[0]).addScaledVector(CAM_UP, this.seat[1]);   // seat: onto the saddle, screen right and up in world units
    if (this.roll || this.rolled) {
      // turn about the ground point: the centre sits feetUp above it, split into screen-up and toward-camera parts
      const r = this.roll || 0, h = this.feetUp * size, up = h * CAM_UP.y, back = h * VIEW_DIR.y;
      this.thing.mesh.position.set(x, gy, z).addScaledVector(VIEW_DIR, back)
        .addScaledVector(CAM_UP, up * Math.cos(r)).addScaledVector(CAM_RIGHT, -up * Math.sin(r));
      this.thing.mesh.quaternion.copy(CAM_QUAT).multiply(ROLL_Q.setFromAxisAngle(Z_AXIS, r));
      this.rolled = !!r;
    }
    this.hidden.position.set(x, FEET_UP * size + gy, z);
    u.uDepthAt.value.set(x, gy, z, 0.45);
    this.thing.foot = { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r };
    this.thing.updateScreen();
    this.shadow.position.set(x, 0.01 + gy + (gy ? 0.08 : 0), z);   // a little higher on raised ground, so a land bridge's slope never cuts it
    if (this.footShadow) {
      // dir 0..7 = S, SW, W, NW, N, NE, E, SE on screen (more rows split those steps); length along the heading
      const a = this.heading ?? dir * 2 * Math.PI / this.dirs, S = Math.SQRT1_2;
      const hx = (-Math.sin(a) + Math.cos(a)) * S, hz = (Math.sin(a) + Math.cos(a)) * S;
      this.shadow.rotation.set(-Math.PI / 2, 0, Math.atan2(-hx, -hz));
      this.shadow.scale.set(this.footShadow[1] / 1.5 * size, this.footShadow[0] / 1.5 * size, 1);
    }
    this.ring.position.set(x, 0.02 + gy + (gy ? 0.08 : 0), z);
    this.bar.position.set(x, BAR_UP * size + gy, z).addScaledVector(CAM_RIGHT, -BAR_W / 2);
    this.nameplate.position.set(x, (BAR_UP + 0.35) * size + gy, z);
    this.nameplate.scale.setScalar(size * (this.heroNameplate ? 1.12 : this.eliteNameplate ? 1.2 : 1));
  }

  // elite (a guarded place boss, P4 2026-11-27): a gilt double frame with a diamond at each end, drawn a little larger
  setNameplate(name, visible, color = '#d4aa5a', clan = false, hero = false, border = null, elite = false) {
    this.heroNameplate = hero; this.eliteNameplate = elite;
    this.nameplate.visible = !!visible && !!name;
    const key = `${name}|${color}|${clan}|${hero}|${border}|${elite}`;
    if (!name || key === this.nameplateText) return;
    this.nameplateText = key;
    const g = this.labelContext;
    g.clearRect(0, 0, 256, 48);
    g.fillStyle = 'rgba(8,10,14,.60)'; g.beginPath(); g.roundRect(4, 5, 248, 38, 9); g.fill();
    g.strokeStyle = border || color; g.lineWidth = border ? 3 : 2; g.beginPath(); g.roundRect(5, 6, 246, 36, 8); g.stroke();
    g.strokeStyle = color;
    if (hero) { g.lineWidth = 1; g.beginPath(); g.roundRect(9, 10, 238, 28, 5); g.stroke(); }
    if (elite) {
      g.strokeStyle = '#d6a64a'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(10, 11, 236, 26, 5); g.stroke();
      g.fillStyle = '#e8bd5c'; for (const x of [5, 251]) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 7, 24); g.lineTo(x, 32); g.lineTo(x - 7, 24); g.closePath(); g.fill(); }
    }
    if (clan) {
      g.fillStyle = color; g.beginPath(); g.arc(231, 24, 14, 0, Math.PI * 2); g.fill();
      drawCrest(g, 231, 24, 10, undefined, typeof clan === 'string' ? clan : null);
    }
    g.font = '600 25px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f1e4c7'; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText(name, clan ? 114 : 128, 24, clan ? 204 : 232);
    this.labelTexture.needsUpdate = true;
  }

  // hp bar over every unit with health, hidden once down; length = hp / maxHp,
  // colour from green (full) to dark red (nearly dead), see health.js
  setHealth(hp, maxHp, side = null) {   // side: a fixed fill colour (yours green, enemies red), else shaded by health
    this.bar.visible = !!maxHp && hp > 0;
    if (!this.bar.visible) return;
    const { frac, color } = healthBar(hp, maxHp);
    this.fill.scale.x = BAR_W * frac;
    this.fill.visible = frac > 0;
    this.fill.material.color.setRGB(...(side || color));
  }

  // the same bar used as a timer instead (arrest / execute channel, jail time): frac 0..1, rgb 0..1
  setBar(frac, rgb) {
    this.bar.visible = true;
    this.fill.scale.x = BAR_W * Math.max(0, Math.min(1, frac));
    this.fill.visible = frac > 0;
    this.fill.material.color.setRGB(...rgb);
  }

  // free the GPU copies when the unit leaves the map (townsfolk come and go, bandits each night)
  // a thin glowing edge round the figure, drawn just after it (shares its frame, so it follows every pose)
  addOutline(color) {
    if (this.outline) return;
    this.outline = new THREE.Mesh(this.thing.mesh.geometry, outlineMaterial(this.material.uniforms, color, !!this.sheets.packing));
    this.outline.frustumCulled = false;
    this.thing.mesh.add(this.outline);
    this.thing.extras.push(this.outline);
  }
  dispose() {
    this.outline?.material.dispose();
    if (!this.disposed) { this.disposed = true; releaseSheets(this.sheets); }
    this.thing.mesh.geometry.dispose();
    this.shadow.geometry.dispose();
    for (const m of [this.material, this.hidden.material, this.fill.material, this.labelMaterial]) m.dispose();
    this.nameplate.geometry.dispose(); this.labelTexture.dispose();
    this.glow?.material.dispose();
    this.gearFx?.dispose();
    this.lightning?.dispose();
    this.shadowBlade?.dispose();
    this.runTrail?.dispose();
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
