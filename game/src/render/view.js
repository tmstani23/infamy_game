// Everything on screen. Reads the game state every frame and never changes it.
import * as THREE from 'three';
import { VIEW_DIR, CAM_QUAT, CAM_RIGHT, CAM_UP, PPU, toScreen } from './iso.js';
import { shared, MAX_LIGHTS } from './shading.js';
import { buildGround, buildScenery, doorRings, sortThings, behind, footprintLines } from './scenery.js';
import { CharacterSprite, loadSheets } from './characters.js';
import { buildRoom3d } from './interior3d.js';
import { createHitFx } from './hitfx.js';
import { createAbilityFx } from './abilityfx.js';

const DAY_SKY = new THREE.Color(0x2b2f31), NIGHT_SKY = new THREE.Color(0x06080c);

export async function createView({ canvas, fxLayer, district, catalog, parts, scenery, rooms = [], doors = [], zoom = 0.72, night = false, debug = false }) {
  const INDOOR_ZOOM = 1.45;   // the camera moves in closer inside buildings
  let zoomNow = zoom;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  // Painted art is shaded in its own sRGB values, so no colour conversion on output
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
  camera.quaternion.copy(CAM_QUAT);
  const camTarget = new THREE.Vector3();
  let camReady = false;
  let freeCam = null;      // where the camera looks while panned away from the hero (arrow keys), else null
  const PAN_SPEED = 16, PAN_MAX = 45;
  // screen-up as a ground direction, long enough to move the view as fast as sideways
  const GROUND_UP = CAM_UP.clone().setY(0).normalize();
  GROUND_UP.divideScalar(GROUND_UP.dot(CAM_UP));

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    const half = h / 2 / (PPU * zoomNow);
    camera.top = half; camera.bottom = -half;
    camera.left = -half * w / h; camera.right = half * w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  scene.add(await buildGround(district.ground, renderer));
  const roomLights = [];
  for (const r of rooms) {
    const built = await buildRoom3d(r, parts, renderer);
    scene.add(built.group, ...built.glows);
    roomLights.push(...built.lights);
  }
  for (const d of doorRings(doors)) scene.add(d);
  const things = await buildScenery(scenery, renderer);
  for (const t of things) scene.add(t.mesh, ...t.extras);
  const lights = [...things.flatMap(t => t.lights), ...roomLights];
  const lines = footprintLines(scenery);
  lines.visible = debug;
  scene.add(lines);

  let nightTarget = night ? 1 : 0;
  shared.uNight.value = nightTarget;

  // one sprite per unit in the state
  const sprites = new Map();
  let selected = new Set();
  async function addSprite(e) {
    const s = new CharacterSprite(await loadSheets(catalog, e.model));
    sprites.set(e.id, s);
    scene.add(s.thing.mesh, s.shadow, s.hidden, s.ring, s.bar);
    s.ring.visible = selected.has(e.id);
    return s;
  }
  function syncSprites(state) {
    for (const e of Object.values(state.entities)) if (!sprites.has(e.id)) { sprites.set(e.id, null); addSprite(e); }
    for (const [id, s] of sprites) if (!state.entities[id] && s) { scene.remove(s.thing.mesh, s.shadow, s.hidden, s.ring, s.bar); sprites.delete(id); }
  }

  function updateLights(time) {
    const near = lights
      .map(l => ({ l, d: (l.pos.x - camTarget.x) ** 2 + (l.pos.z - camTarget.z) ** 2 }))
      .sort((a, b) => a.d - b.d).slice(0, MAX_LIGHTS);
    near.forEach(({ l }, i) => {
      const flick = l.fire
        ? 0.8 + 0.2 * Math.sin(time * 9 + l.seed) * Math.sin(time * 4.3 + l.seed * 2)
        : 0.94 + 0.06 * Math.sin(time * 3 + l.seed);
      shared.uLightPos.value[i].set(l.pos.x, l.pos.y, l.pos.z, l.radius);
      shared.uLightCol.value[i].set(l.color.r, l.color.g, l.color.b, 1.25 * flick);
    });
    shared.uLightCount.value = near.length;
  }

  // Open a see-through hole in anything drawn in front of the followed unit
  const probe = new THREE.Vector3();
  function updateCutaway(hero, dt) {
    for (const t of things) {
      if (!t.big) continue;
      let covering = false;
      if (hero) {
        const s = t.screen, hs = hero.thing.screen;
        covering = s.x0 < hs.x1 && hs.x0 < s.x1 && s.y0 < hs.y1 && hs.y0 < s.y1 && behind(hero.thing, t)
          && [0.25, 1.0, 1.8].some(y => t.covers(probe.copy(hero.pos).setY(y)));
      }
      t.cut = THREE.MathUtils.clamp(t.cut + (covering ? dt : -dt) * 4, 0, 1);
      const u = t.mesh.material.uniforms;
      u.uCut.value = t.cut;
      if (hero) u.uCutCenter.value.copy(hero.pos).setY(1.0);
    }
  }

  // state: current tick; prev: the tick before; alpha: how far between them (0..1)
  function render(state, prev, alpha, dt, time, followId) {
    shared.uTime.value = time;
    shared.uNight.value = THREE.MathUtils.clamp(shared.uNight.value + Math.sign(nightTarget - shared.uNight.value) * dt / 1.2, 0, 1);
    scene.background = DAY_SKY.clone().lerp(NIGHT_SKY, shared.uNight.value);

    syncSprites(state);
    for (const [id, s] of sprites) {
      if (!s) continue;
      const e = state.entities[id];
      let p = prev.entities[id] || e;
      if (Math.hypot(e.x - p.x, e.z - p.z) > 3) p = e;    // went through a door: no sliding
      const w = e.swing, swingT = w ? Math.min(1, Math.max(0, (state.tick - 1 + alpha - w.start) / w.len)) : null;
      s.update(dt, p.x + (e.x - p.x) * alpha, p.z + (e.z - p.z) * alpha, e.dir, e.anim, swingT);
      s.setHealth(e.hp, e.maxHp);
    }
    const hero = sprites.get(followId);
    const inside = state.entities[followId]?.place !== 'street';

    // camera follows the hero, snapped to whole screen pixels so the art stays crisp
    if (hero) {
      // went through a door (or first frame): jump there and follow again
      if (!camReady || camTarget.distanceTo(hero.pos) > (freeCam ? PAN_MAX + 5 : 20)) { camTarget.copy(hero.pos); camReady = true; freeCam = null; }
      camTarget.lerp(freeCam || hero.pos, 1 - Math.exp(-dt * (freeCam ? 14 : 6)));
      heroPos = hero.pos;
    }
    const wantZoom = inside ? Math.min(zoom * INDOOR_ZOOM, 1.1) : zoom;
    if (Math.abs(wantZoom - zoomNow) > 1e-3) { zoomNow += (wantZoom - zoomNow) * (1 - Math.exp(-dt * 5)); resize(); }
    const ppx = PPU * zoomNow * renderer.getPixelRatio();
    const s = toScreen(camTarget);
    camera.position.copy(camTarget)
      .addScaledVector(CAM_RIGHT, Math.round(s.x * ppx) / ppx - s.x)
      .addScaledVector(CAM_UP, Math.round(s.y * ppx) / ppx - s.y)
      .addScaledVector(VIEW_DIR, 200);

    hitFx.update(dt);
    abilityFx.update(dt, state);
    shakeT = Math.max(0, shakeT - dt);
    if (shakeT > 0) {
      const a = shakeAmp * shakeT / 0.18;
      camera.position.addScaledVector(CAM_RIGHT, (Math.random() - 0.5) * a).addScaledVector(CAM_UP, (Math.random() - 0.5) * a);
    }
    updateLights(time);
    updateCutaway(hero, dt);
    sortThings([...things, ...[...sprites.values()].filter(Boolean).map(s => s.thing)]);
    renderer.render(scene, camera);
  }

  // hit effects: damage numbers, trails, sparks, flash and lean, a little shake on kills near the hero
  const hitFx = createHitFx({ scene, overlay: fxLayer, unitToScreen: (x, z) => { v.set(x, 0.9, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; } });
  const abilityFx = createAbilityFx({ scene, overlay: fxLayer, posOf: id => sprites.get(id)?.pos || null,
    unitToScreen: (x, z, y = 0.9) => { v.set(x, y, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; } });
  function addCasts(casts) { for (const c of casts) abilityFx.cast(c); }
  let shakeT = 0, shakeAmp = 0;
  function addHits(hits, state, followId) {
    const me = state.entities[followId];
    for (const h of hits) {
      const a = state.entities[h.a], t = state.entities[h.t];
      hitFx.hit(h, a, t?.owner === me?.owner);
      const s = sprites.get(h.t);
      if (s && a) { const d = Math.hypot(h.x - a.x, h.z - a.z) || 1; s.struck((h.x - a.x) / d, (h.z - a.z) / d, h.crit || h.kill); }
      if (h.kill && me && Math.hypot(h.x - me.x, h.z - me.z) < 9) { shakeT = 0.18; shakeAmp = 0.12; }
      else if (h.crit && me && Math.hypot(h.x - me.x, h.z - me.z) < 9 && shakeT <= 0) { shakeT = 0.1; shakeAmp = 0.05; }
    }
  }
  const raycaster = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const v = new THREE.Vector3();
  let heroPos = null;
  return {
    render, renderer, scene, addHits, addCasts,
    // arrow-key panning (right, up from -1 to 1 on screen); the camera stays there until snapBack
    pan(right, up, dt) {
      if (!right && !up) return;
      freeCam ||= camTarget.clone();
      const k = PAN_SPEED * dt / zoomNow;
      freeCam.addScaledVector(CAM_RIGHT, right * k).addScaledVector(GROUND_UP, up * k);
      if (heroPos && freeCam.distanceTo(heroPos) > PAN_MAX) freeCam.sub(heroPos).setLength(PAN_MAX).add(heroPos);
    },
    snapBack() { freeCam = null; },
    isPanned: () => !!freeCam,
    // selection rings under these unit ids (selection is screen-only, not game state)
    setSelected(ids) { selected = new Set(ids); for (const [id, s] of sprites) if (s) s.ring.visible = selected.has(id); },
    // page pixel -> ground point { x, z }
    screenToGround(px, py) {
      raycaster.setFromCamera({ x: px / innerWidth * 2 - 1, y: 1 - py / innerHeight * 2 }, camera);
      return raycaster.ray.intersectPlane(groundPlane, v) ? { x: v.x, z: v.z } : null;
    },
    // a unit's body centre (about 0.9 above its feet) -> page pixel { x, y }
    unitToScreen(x, z) {
      v.set(x, 0.9, z).project(camera);
      return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
    },
    isNight: () => nightTarget === 1,
    toggleNight() { nightTarget = nightTarget ? 0 : 1; return nightTarget === 1; },
    toggleDebug() { lines.visible = !lines.visible; },
    // 1.0 shows the sprites at their real size; closer than that just blurs them
    zoomBy(f) { zoom = THREE.MathUtils.clamp(zoom * f, 0.35, 1.0); resize(); },
  };
}
