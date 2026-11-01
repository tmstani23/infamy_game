// Character page preview (Tim 2026-11-01): the hero's own in-game sprite, idle and animated,
// facing front, with the real weapon glow and gear auras from render/characters.js.
// Its own small WebGL canvas; only drawn while the character page is open.
import * as THREE from 'three';
import { CharacterSprite, loadPortraitSheets } from './characters.js';
import { CAM_QUAT, VIEW_DIR } from './iso.js';
import { shared } from './shading.js';
import { ITEMS } from '../sim/inventory.js';

const FRONT = 7;            // sheet row 7: front three-quarter view, blade showing
const SLOTS = ['weapon', 'armor', 'accessory'];
export function createHeroPreview({ canvas, catalog }) {
  let renderer = null, sprite = null, model = null, last = 0, focus = null;
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.quaternion.copy(CAM_QUAT);
  async function setModel(m) {
    if (m === model) return; model = m;
    const sheets = await loadPortraitSheets(catalog, m); if (model !== m) return;
    if (sprite) { scene.remove(sprite.thing.mesh); sprite.dispose(); }
    sprite = new CharacterSprite(sheets); scene.add(sprite.thing.mesh);
  }
  function draw(hero) {
    if (!hero) return;
    if (!renderer) {
      try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); } catch { return; }
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.setClearColor(0x000000, 0);
    }
    setModel(hero.model);
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!sprite || !w || !h) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); }
    const now = performance.now() / 1000, dt = last ? Math.min(0.1, now - last) : 0; last = now;
    const items = SLOTS.map(s => ITEMS[hero.equipment?.[s]]);
    sprite.setEquipment(items);
    const p = 1.4 + 0.6 * Math.sin(now * 6);
    sprite.gearFocus = focus != null ? { slot: focus, pulse: p } : null;   // slot 0 weapon, 1 armor, 2 accessory
    sprite.update(dt, 0, 0, FRONT, 'idle', null, 1);
    sprite.material.uniforms.uDepthAt.value.w = 0;
    // hovering an equipped slot makes that aura pulse and dims the others
    if (focus != null && sprite.glow) sprite.glow.material.uniforms.uStrength.value *= focus === 0 ? p : 0.35;
    const half = sprite.cellWorld * 0.42, aspect = w / h;
    Object.assign(camera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    camera.updateProjectionMatrix();
    camera.position.set(0, sprite.feetUp + 0.05, 0).addScaledVector(VIEW_DIR, 50);
    // daylight, no fog and no street lamps: the preview always shows the plain look
    const keep = [shared.uNight.value, shared.uFogOn.value, shared.uLightCount.value];
    shared.uNight.value = 0; shared.uFogOn.value = 0; shared.uLightCount.value = 0;
    renderer.render(scene, camera);
    [shared.uNight.value, shared.uFogOn.value, shared.uLightCount.value] = keep;
  }
  return { draw, focus: slot => { focus = slot; }, pause: () => { last = 0; } };
}
