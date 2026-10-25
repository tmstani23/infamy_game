// Everything on screen. Reads the game state every frame and never changes it.
import * as THREE from 'three';
import { VIEW_DIR, CAM_QUAT, CAM_RIGHT, CAM_UP, PPU, toScreen } from './iso.js';
import { shared, MAX_LIGHTS } from './shading.js';
import { buildGround, buildScenery, doorRings, markCrewDoors, sortThings, behind, footprintLines } from './scenery.js';
import { CharacterSprite, loadSheets, INDOOR_SIZE } from './characters.js';
import { buildRoom3d } from './interior3d.js';
import { createHitFx } from './hitfx.js';
import { createAbilityFx } from './abilityfx.js';
import { createBloom } from './bloom.js';
import { fxShared } from './vfx.js';
import { createBanners } from './banners.js';

const DAY_SKY = new THREE.Color(0x2b2f31), NIGHT_SKY = new THREE.Color(0x06080c);

export async function createView({ canvas, fxLayer, district, catalog, parts, scenery, rooms = [], doors = [], zoom = 0.72, night = false, debug = false }) {
  // Use one close interior camera setting without enlarging character sprites separately.
  const INDOOR_ZOOM = 1.1;
  const FLASH_SECONDS = 0.7;   // the camera moves in closer inside buildings
  let zoomNow = zoom;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  // Painted art is shaded in its own sRGB values, so no colour conversion on output
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const bloom = createBloom(renderer);   // glow on effects only
  const bufSize = new THREE.Vector2();

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
  camera.quaternion.copy(CAM_QUAT);
  const camTarget = new THREE.Vector3();
  let camReady = false;
  let freeCam = null;      // where the camera looks while panned away from the hero (arrow keys), else null
  const PAN_SPEED = 16;
  // panning reaches the whole district (a little past its edge), wherever the hero is
  // (indoors: within 45 of the hero, as before)
  const B = district.bounds, inMap = p => {
    if (heroPlace !== 'street') { if (heroPos && p.distanceTo(heroPos) > 45) p.sub(heroPos).setLength(45).add(heroPos); return p; }
    p.x = THREE.MathUtils.clamp(p.x, B.minX - 4, B.maxX + 4); p.z = THREE.MathUtils.clamp(p.z, B.minZ - 4, B.maxZ + 4); return p; };
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

  scene.add(await buildGround(district.ground, renderer, district.bounds));
  const roomLights = [], blueprintWalls = [], blueprintDoors = [];
  const roomCharacterScales = Object.fromEntries(rooms.map(r => [r.name, r.template.characterScale || 1]));
  for (const r of rooms) {
    const built = await buildRoom3d(r, parts, renderer);
    scene.add(built.group, ...built.glows);
    roomLights.push(...built.lights);
    const baseOpacity = r.template.scenePainting ? 0.8 : 1;
    const scale = r.worldScale || 1;
    for (const wall of built.partitionWalls) blueprintWalls.push({ ...wall, at: wall.at * scale, a: wall.a * scale, b: wall.b * scale,
      room: r.name, ox: r.origin.x, oz: r.origin.z, fade: baseOpacity, baseOpacity });
    for (const door of built.partitionDoors) blueprintDoors.push({ ...door, at: door.at * scale, a: door.a * scale, b: door.b * scale,
      room: r.name, ox: r.origin.x, oz: r.origin.z, fade: baseOpacity, baseOpacity });
  }
  const rings = doorRings(doors);
  for (const d of rings) scene.add(d);
  const things = await buildScenery(scenery, renderer);
  for (const t of things) scene.add(t.mesh, ...t.extras);
  const lights = [...things.flatMap(t => t.lights), ...roomLights];
  // lanterns by prop index, so a snuffed one (state.lightsOut, sim/stealth.js) can go dark
  const propLights = new Map();
  for (const t of things) if (t.prop !== null && t.lights.length) propLights.set(t.prop, t.lights);
  let lightsOutKey = '';
  function syncLightsOut(state) {
    const key = (state.lightsOut || []).join(',');
    if (key === lightsOutKey) return;
    lightsOutKey = key;
    const out = new Set(state.lightsOut || []);
    for (const [prop, ls] of propLights) for (const l of ls) { l.off = out.has(prop); if (l.glow) l.glow.visible = !l.off; }
  }
  const lines = footprintLines(scenery);
  lines.visible = debug;
  scene.add(lines);

  let nightTarget = night ? 1 : 0;
  shared.uNight.value = nightTarget;
  // tiny glowing mushrooms on the plank edges of the village bridges (port_town.json glowShrooms
  // [x, z, shape], Tim 2026-10-20/21): little stem-and-cap sprites in three shapes (round, tall cone,
  // flat wide), pale by day, the caps glowing soft light-blue at night; only drawn, they light nothing
  const shrooms = (() => {
    const list = district.glowShrooms || [];
    if (!list.length) return null;
    const mats = [];
    for (let shape = 0; shape < 3; shape++) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d');
      // [cap width, cap height, stem height, cap pointiness] per shape
      const [cw, ch, sh, pt] = [[13, 9, 12, 0], [8, 14, 15, 1], [17, 6, 9, 0]][shape];
      const top = 52 - sh;
      g.fillStyle = 'rgba(205,215,220,1)';   // stem
      g.beginPath(); g.moveTo(32 - 2.5, 54); g.lineTo(32 + 2.5, 54); g.lineTo(32 + 1.8, top); g.lineTo(32 - 1.8, top); g.closePath(); g.fill();
      const glow = g.createRadialGradient(32, top - ch * 0.4, 0, 32, top - ch * 0.4, cw * 1.6);   // soft halo, kept small
      glow.addColorStop(0, 'rgba(150,225,255,0.35)'); glow.addColorStop(1, 'rgba(80,160,230,0)');
      g.fillStyle = glow; g.fillRect(0, 0, 64, 64);
      const cap = g.createLinearGradient(0, top - ch, 0, top + 1);
      cap.addColorStop(0, 'rgba(215,248,255,1)'); cap.addColorStop(1, 'rgba(90,185,240,1)');
      g.fillStyle = cap; g.beginPath();
      if (pt) { g.moveTo(32 - cw / 2, top + 1); g.quadraticCurveTo(32 - cw * 0.35, top - ch * 0.6, 32, top - ch); g.quadraticCurveTo(32 + cw * 0.35, top - ch * 0.6, 32 + cw / 2, top + 1); }
      else g.ellipse(32, top + 1, cw / 2, ch, 0, Math.PI, 0);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(240,252,255,0.8)';   // two pale spots on the cap
      g.beginPath(); g.arc(32 - cw * 0.18, top - ch * 0.45, 1.2, 0, Math.PI * 2); g.arc(32 + cw * 0.15, top - ch * 0.3, 1, 0, Math.PI * 2); g.fill();
      const mine = list.filter(p => (p[2] ?? 0) === shape);
      if (!mine.length) continue;
      const pos = new Float32Array(mine.length * 3);
      mine.forEach(([x, z], i) => { pos[i * 3] = x; pos[i * 3 + 1] = 0.2; pos[i * 3 + 2] = z; });
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), size: 22, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false });
      const pts = new THREE.Points(geo, mat);
      pts.renderOrder = 2;
      scene.add(pts);
      mats.push(mat);
    }
    return { set opacity(v) { for (const m of mats) m.opacity = v; } };
  })();

  // thin ring under every character, coloured by who they are to you, over a faint dark
  // edge so it reads on light and dark ground, day or night
  const TEAM = { hero: 0xffc83c, crew: 0x3cc8e6, enemy: 0xe63c32, bandit: 0xd2823c, townsfolk: 0xdcdcd2, police: 0x4a78e6 };
  const TEAM_GEO = new THREE.RingGeometry(0.5, 0.56, 40), TEAM_EDGE_GEO = new THREE.RingGeometry(0.47, 0.59, 40);
  const TEAM_MAT = Object.fromEntries(Object.entries(TEAM).map(([k, c]) => [k, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, depthWrite: false })]));
  const TEAM_EDGE = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
  function teamOf(e, me) {
    if (e.id === me?.id) return 'hero';
    if (e.type === 'civilian') return 'townsfolk';
    if (me && e.owner === me.owner) return 'crew';
    if (e.owner === 'bandits') return e.angry && Object.keys(e.angry).length ? 'enemy' : 'bandit';
    // police: blue, red while after your clan
    if (e.owner === 'police') return e.angry?.[me?.owner] !== undefined ? 'enemy' : 'police';
    return 'enemy';
  }
  function updateTeamRing(s, e, me) {
    if (!s.team) {
      s.team = new THREE.Group();
      const edge = new THREE.Mesh(TEAM_EDGE_GEO, TEAM_EDGE), ring = new THREE.Mesh(TEAM_GEO, TEAM_MAT.enemy);
      edge.renderOrder = 2; ring.renderOrder = 2;
      s.team.add(edge, ring);
      s.team.rotation.x = -Math.PI / 2;
      scene.add(s.team);
    }
    s.team.visible = !e.dead && !e.downed && !e.jailed;
    s.team.children[1].material = TEAM_MAT[teamOf(e, me)];
    s.team.position.set(s.pos.x, 0.018, s.pos.z);
    s.team.scale.setScalar(s.size);
  }

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
    for (const [id, s] of sprites) if (!state.entities[id] && s) { scene.remove(s.thing.mesh, s.shadow, s.hidden, s.ring, s.bar); if (s.team) scene.remove(s.team); s.dispose(); sprites.delete(id); trickle.delete(id); }
  }

  function updateLights(time) {
    const near = lights.filter(l => !l.off)
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

  function updateBlueprintWalls(state, followId, hero, dt) {
    const place = state.entities[followId]?.place;
    // The fixed camera is southeast of its target. Fade a finite wall run only
    // when that camera ray to the followed unit intersects the run.
    const blocksView = item => {
      if (!hero || item.room !== place) return false;
      const x = hero.pos.x, z = hero.pos.z;
      if (item.along === 'z') {
        const t = (item.ox + item.at - x) / 60;
        const hit = z + 60 * t;
        return t > 0 && t < 1 && hit >= item.oz + item.a && hit <= item.oz + item.b;
      }
      const t = (item.oz + item.at - z) / 60;
      const hit = x + 60 * t;
      return t > 0 && t < 1 && hit >= item.ox + item.a && hit <= item.ox + item.b;
    };
    for (const item of [...blueprintWalls, ...blueprintDoors]) {
      const x = hero?.pos.x, z = hero?.pos.z;
      const near = hero && item.room === place && (item.along === 'z'
        ? Math.hypot(x - item.ox - item.at, z - THREE.MathUtils.clamp(z, item.oz + item.a, item.oz + item.b))
        : Math.hypot(z - item.oz - item.at, x - THREE.MathUtils.clamp(x, item.ox + item.a, item.ox + item.b))) < 2.2;
      const target = item.baseOpacity < 1
        ? near ? 0.4 : item.baseOpacity
        : blocksView(item) ? 0.18 : 1;
      item.fade += (target - item.fade) * (1 - Math.exp(-dt * 12));
      for (const mat of item.materials) mat.uniforms.uOpacity.value = item.fade;
    }
    for (const door of blueprintDoors) door.leaf.visible = !state.interiorDoors?.[door.id];
  }

  // a building pulses softly twice: crew were sent in, or came out (Tim 2026-10-19)
  const flashes = new Map();   // building index -> seconds since the flash started
  function updateFlashes(dt) {
    for (const [i, age] of flashes) {
      const a = age + dt, k = a / FLASH_SECONDS;
      for (const t of things) if (t.building === i) t.mesh.material.uniforms.uFlash.value = k < 1 ? 0.32 * Math.sin(Math.PI * 2 * k) ** 2 : 0;
      if (k >= 1) flashes.delete(i); else flashes.set(i, a);
    }
  }

  // state: current tick; prev: the tick before; alpha: how far between them (0..1)
  function render(state, prev, alpha, dt, time, followId) {
    updateFlashes(dt);
    shared.uTime.value = time;
    shared.uNight.value = THREE.MathUtils.clamp(shared.uNight.value + Math.sign(nightTarget - shared.uNight.value) * dt / 1.2, 0, 1);
    scene.background = DAY_SKY.clone().lerp(NIGHT_SKY, shared.uNight.value);
    if (shrooms) shrooms.opacity = 0.45 + shared.uNight.value * (0.35 + 0.1 * Math.sin(time * 1.7));   // seen by day, a gentle glow at night

    syncSprites(state);
    syncLightsOut(state);
    if (state.tick !== healTick) { healTick = state.tick; showHeals(state, prev); }
    // hitstop: on a big impact the screen holds still for a few frames (animation and
    // effects only; the rules keep running, so this never touches the game)
    const fdt = freezeT > 0 ? 0 : dt;
    freezeT = Math.max(0, freezeT - dt);
    for (const [id, s] of sprites) {
      if (!s) continue;
      const e = state.entities[id];
      let p = prev.entities[id] || e;
      if (Math.hypot(e.x - p.x, e.z - p.z) > 3) p = e;    // went through a door: no sliding
      const w = e.swing, swingT = w ? Math.min(1, Math.max(0, (state.tick - 1 + alpha - w.start) / w.len)) : null;
      s.update(fdt, p.x + (e.x - p.x) * alpha, p.z + (e.z - p.z) * alpha, e.dir, e.anim, swingT,
        e.place && e.place !== 'street' ? INDOOR_SIZE * (roomCharacterScales[e.place] || 1) : 1);
      s.setHealth(e.hp, e.maxHp);
      // an execute or arrest channel shows one bar, the labelled one in render/abilityfx.js (the
      // health bar stays a health bar: two bars used to show, Tim 2026-10-18);
      // a jailed hero (sim/police.js) is greyed out and his bar counts down his time
      if (e.jailed) s.setBar((e.jailed.until - state.tick - alpha) / e.jailed.len, [0.6, 0.6, 0.65]);
      const grey = !!e.jailed, gu = s.material.uniforms;
      if (grey !== !!s.grey) { gu.uTint.value.setRGB(...(grey ? [0.5, 0.5, 0.55] : [1, 1, 1])); s.grey = grey; }
      // your hidden ninja (sim/stealth.js) are drawn a little see-through (Tim 2026-10-20: half as see-through as before); nobody else is shown them at all
      const ghost = !!e.hidden && !grey;
      const veiled = ghost && !e.dead && !e.downed && (e.buffs?.veil?.until ?? -1) > state.tick;
      gu.uOpacity.value = grey ? 0.55 : veiled ? 0.18 : ghost ? 0.8 : 1;
      gu.uVeil.value = veiled ? 1 : 0;
      s.ghost = ghost;
      updateTeamRing(s, e, state.entities[followId]);
      // Red Lantern: a pulsing red tint on the sprite and a real red light around him
      const lit = e.buffs?.lantern && !e.dead && !e.downed, u = s.material.uniforms;
      if (lit) {
        const k = 0.5 + 0.5 * Math.sin(time * 6);
        u.uTint.value.setRGB(1.25 + 0.15 * k, 0.78, 0.68);
        u.uSelfLight.value.setRGB(0.55 + 0.25 * k, 0.12, 0.05);
        let l = lanternLights.get(id);
        if (!l) { l = { pos: new THREE.Vector3(), radius: 7, color: new THREE.Color(1, 0.28, 0.1), fire: true, seed: Math.random() * 10 }; lanternLights.set(id, l); lights.push(l); }
        l.pos.set(s.pos.x, 1.6, s.pos.z);
      } else if (s.lanternTint) {
        u.uTint.value.setRGB(1, 1, 1);
        u.uSelfLight.value.setRGB(0.2, 0.18, 0.16);
      }
      s.lanternTint = lit;
      // hidden ninja: a very slight purple shimmer rippling over them (Tim 2026-10-20)
      const shim = ghost && !lit && !veiled;
      if (shim) {
        const k = 0.5 + 0.5 * Math.sin(time * 2.4 + s.pos.x * 1.3 + s.pos.z * 0.9);
        u.uTint.value.setRGB(0.95 + 0.03 * k, 0.9, 1.05 + 0.07 * k);
        u.uSelfLight.value.setRGB(0.21 + 0.05 * k, 0.15, 0.26 + 0.09 * k);
      } else if ((s.shimmer || s.veiled) && !lit) {
        u.uTint.value.setRGB(...(grey ? [0.5, 0.5, 0.55] : [1, 1, 1]));
        u.uSelfLight.value.setRGB(0.2, 0.18, 0.16);
      }
      if (veiled) {
        u.uTint.value.setRGB(0.65, 0.78, 1.05);
        u.uSelfLight.value.setRGB(0.09, 0.15, 0.27);
      }
      s.veiled = veiled;
      s.shimmer = shim;
    }
    for (const [id, l] of lanternLights) if (!sprites.get(id)?.lanternTint) { lights.splice(lights.indexOf(l), 1); lanternLights.delete(id); }
    const hero = sprites.get(followId);
    const inside = state.entities[followId]?.place !== 'street';
    if (state.entities[followId]) markCrewDoors(rings, state, state.entities[followId].owner);

    // camera follows the hero, snapped to whole screen pixels so the art stays crisp
    if (hero) {
      // went through a door (or first frame): jump there and follow again
      // a crew jump (jumpTo) lasts until the hero moves or goes through a door
      const place = state.entities[followId]?.place;
      if (farCam && (place !== heroPlace || (jumpFrom && jumpFrom.distanceTo(hero.pos) > 0.3))) { farCam = false; freeCam = null; }
      if (place !== heroPlace) freeCam = null;   // through a door: look at the hero again
      heroPlace = place;
      if (!camReady || camTarget.distanceTo(hero.pos) > (farCam || freeCam ? Infinity : 20)) { camTarget.copy(hero.pos); camReady = true; freeCam = null; }
      camTarget.lerp(freeCam || hero.pos, 1 - Math.exp(-dt * (freeCam ? 14 : 6)));
      heroPos = hero.pos;
    }
    const wantZoom = inside ? INDOOR_ZOOM : zoom;
    if (Math.abs(wantZoom - zoomNow) > 1e-3) { zoomNow += (wantZoom - zoomNow) * (1 - Math.exp(-dt * 5)); resize(); }
    const ppx = PPU * zoomNow * renderer.getPixelRatio();
    const s = toScreen(camTarget);
    camera.position.copy(camTarget)
      .addScaledVector(CAM_RIGHT, Math.round(s.x * ppx) / ppx - s.x)
      .addScaledVector(CAM_UP, Math.round(s.y * ppx) / ppx - s.y)
      .addScaledVector(VIEW_DIR, 200);

    // clan banners at owned businesses; a gold burst where one just changed hands
    for (const b of banners.update(state, time, state.entities[followId]?.owner)) abilityFx.claim(...banners.spot(b));
    hitFx.update(fdt);
    abilityFx.update(fdt, state, followId);
    shakeT = Math.max(0, shakeT - dt);
    if (shakeT > 0) {
      const a = shakeAmp * shakeT / 0.18;
      camera.position.addScaledVector(CAM_RIGHT, (Math.random() - 0.5) * a).addScaledVector(CAM_UP, (Math.random() - 0.5) * a);
    }
    updateLights(time);
    updateCutaway(hero, dt);
    updateBlueprintWalls(state, followId, hero, dt);
    sortThings([...things, ...banners.things, ...[...sprites.values()].filter(Boolean).map(s => s.thing)]);
    // effect particles are sized in world units: pixels per unit of each target drawn
    const px = renderer.getDrawingBufferSize(bufSize).y / (camera.top - camera.bottom);
    fxShared.uPx.value = px * bloom.scale;
    bloom.render(scene, camera);
    fxShared.uPx.value = px;
    renderer.render(scene, camera);
    bloom.composite();
  }

  // hit effects: damage numbers, trails, sparks, flash and lean, a little shake on kills near the hero
  const banners = createBanners({ scene });
  const hitFx = createHitFx({ scene, overlay: fxLayer, unitToScreen: (x, z) => { v.set(x, 0.9, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; } });
  const abilityFx = createAbilityFx({ scene, overlay: fxLayer, posOf: id => sprites.get(id)?.pos || null, spriteOf: id => sprites.get(id) || null,
    unitToScreen: (x, z, y = 0.9) => { v.set(x, y, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; } });
  function addCasts(casts) {
    for (const c of casts) {
      abilityFx.cast(c);
      if (c.ryo) abilityFx.coins(c.x, c.z);   // c.ryo: an execute that paid ryo
      if (c.kind === 'assassinate') { shakeT = 0.26; shakeAmp = 0.2; freezeT = Math.max(freezeT, 0.1); }   // the vicious flash hits hard
      if (c.kind === 'shadowstep' && c.crit) { shakeT = 0.24; shakeAmp = 0.18; freezeT = Math.max(freezeT, 0.08); }   // a tiny pause so it lands hard (Shadow Step crit slash)
    }
  }
  let shakeT = 0, shakeAmp = 0, freezeT = 0;
  // health gained since the last tick: real heals sparkle at once, regeneration
  // sparkles each time it adds up to 4% of a unit's health
  let healTick = -1;
  const trickle = new Map();
  function showHeals(state, prev) {
    for (const e of Object.values(state.entities)) {
      const p = prev.entities[e.id], s = sprites.get(e.id);
      if (!p || !s || !e.maxHp || e.dead || e.downed || p.downed || e.hp <= p.hp) continue;
      const gain = (e.hp - p.hp) / e.maxHp, steal = !!e.buffs?.lantern && gain > 0.002;   // more than regen gives in a tick
      // a real heal: Rally's ticks rain green (Tim 2026-10-19); lifesteal keeps its red-gold dazzle (the rain
      // was lost in the lanterns' glow, Tim), the clinic's heal its green one
      if (gain >= 0.015 || steal) { if ((e.buffs?.rally || e.buffs?.shroud) && !steal) { abilityFx.rain(s.pos.x, s.pos.z); hitFx.heal(s.pos.x, s.pos.z, Math.round(e.hp - p.hp)); } else abilityFx.heal(s.pos.x, s.pos.z, true, steal); trickle.set(e.id, 0); continue; }
      const t = (trickle.get(e.id) || 0) + gain;
      if (t >= 0.04) { abilityFx.heal(s.pos.x, s.pos.z, false, false); trickle.set(e.id, 0); } else trickle.set(e.id, t);
    }
  }
  const lanternLights = new Map();   // unit id -> the light that follows it during Red Lantern
  function addHits(hits, state, followId) {
    const me = state.entities[followId];
    for (const h of hits) {
      const a = state.entities[h.a], t = state.entities[h.t];
      hitFx.hit(h, a, t?.owner === me?.owner);
      const s = sprites.get(h.t);
      if (s && a) { const d = Math.hypot(h.x - a.x, h.z - a.z) || 1; s.struck((h.x - a.x) / d, (h.z - a.z) / d, h.crit || h.kill); }
      if (h.kind === 'dash') { abilityFx.cut(h, a); freezeT = Math.max(freezeT, 0.07); }
      else if (h.a === followId && (h.crit || h.kill)) freezeT = Math.max(freezeT, 0.05);
      if (a?.buffs?.lantern) abilityFx.lanternHit(h);
      if (h.kill && me && Math.hypot(h.x - me.x, h.z - me.z) < 9) { shakeT = 0.18; shakeAmp = 0.12; }
      else if (h.crit && me && Math.hypot(h.x - me.x, h.z - me.z) < 9 && shakeT <= 0) { shakeT = 0.1; shakeAmp = 0.05; }
    }
  }
  const raycaster = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const v = new THREE.Vector3();
  let heroPos = null, farCam = false, jumpFrom = null, heroPlace = null;
  return {
    render, renderer, scene, addHits, addCasts,
    addDodges(dodges) { for (const d of dodges) hitFx.dodge(d); },
    // arrow-key panning (right, up from -1 to 1 on screen); the camera stays there until snapBack
    pan(right, up, dt) {
      if (!right && !up) return;
      freeCam ||= camTarget.clone();
      const k = PAN_SPEED * dt / zoomNow;
      freeCam.addScaledVector(CAM_RIGHT, right * k).addScaledVector(GROUND_UP, up * k);
      inMap(freeCam);
    },
    snapBack() { freeCam = null; farCam = false; },
    // look at a ground point (minimap click); stays there until snapBack, like panning
    lookAt(x, z) {
      farCam = false;
      freeCam = new THREE.Vector3(x, heroPos?.y ?? 0, z);
      inMap(freeCam);
    },
    // jump to any point however far from the hero (double-click a crew name); stays there until the hero moves, uses a door or Home
    jumpTo(x, z) { farCam = true; jumpFrom = heroPos?.clone() ?? null; freeCam = new THREE.Vector3(x, heroPos?.y ?? 0, z); },
    isPanned: () => !!freeCam,
    flashBuilding(i) { if (i !== null && i !== undefined) flashes.set(i, 0); },
    // selection rings under these unit ids (selection is screen-only, not game state)
    setSelected(ids) { selected = new Set(ids); for (const [id, s] of sprites) if (s) s.ring.visible = selected.has(id); },
    // page pixel -> ground point { x, z }
    screenToGround(px, py) {
      raycaster.setFromCamera({ x: px / innerWidth * 2 - 1, y: 1 - py / innerHeight * 2 }, camera);
      return raycaster.ray.intersectPlane(groundPlane, v) ? { x: v.x, z: v.z } : null;
    },
    // page pixel -> index of the street building painted there (the frontmost one), or null.
    // Any point on the click's view ray works for Thing.covers, so the ground point is used.
    buildingAt(px, py) {
      const p = this.screenToGround(px, py);
      if (!p) return null;
      const P = new THREE.Vector3(p.x, 0, p.z);
      let best = null;
      for (const t of things) if (t.building !== null && t.covers(P) && (!best || t.mesh.renderOrder > best.mesh.renderOrder)) best = t;
      return best ? best.building : null;
    },
    // a unit's body centre (about 0.9 above its feet) -> page pixel { x, y }
    unitToScreen(x, z) {
      v.set(x, 0.9, z).project(camera);
      return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
    },
    // where a lantern prop's lights actually glow, as page pixels [{ x, y }] (for hovering it to snuff, Tim 2026-10-21)
    lampScreen(prop) {
      return (propLights.get(prop) || []).map(l => { v.set(l.pos.x, l.pos.y, l.pos.z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
    },
    isNight: () => nightTarget === 1,
    toggleNight() { nightTarget = nightTarget ? 0 : 1; return nightTarget === 1; },
    toggleDebug() { lines.visible = !lines.visible; },
    // 1.0 shows the sprites at their real size; closer than that just blurs them
    zoomBy(f) { zoom = THREE.MathUtils.clamp(zoom * f, 0.35, 1.0); resize(); },
  };
}
