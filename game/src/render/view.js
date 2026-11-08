// Everything on screen. Reads the game state every frame and never changes it.
import { VIDEO_DEFAULTS, pixelRatioFor } from '../video_settings.js';
import * as THREE from 'three';
import { ITEMS } from '../sim/inventory.js';
import { VIEW_DIR, CAM_QUAT, CAM_RIGHT, CAM_UP, PPU, toScreen } from './iso.js';
import { shared, MAX_LIGHTS } from './shading.js';
import { buildGround, buildScenery, doorRings, markCrewDoors, behind, footprintLines } from './scenery.js';
import { createSorter } from './draw_order.js';
import { CharacterSprite, loadSheets, INDOOR_SIZE } from './characters.js';
import { buildRoom3d } from './interior3d.js';
import { createHitFx } from './hitfx.js';
import { createAbilityFx } from './abilityfx.js';
import { createBloom } from './bloom.js';
import { fxShared } from './vfx.js';
import { createBanners } from './banners.js';
import { placePiece } from '../sim/geometry.js';
import { unitName } from '../selection_panel.js';
import { createHQFire } from './hq_fire.js';
import { createWorldGround } from './world_ground.js';
import { createRailTrack, createCityStation } from './rail_track.js';
import { cameraDiscontinuity } from '../camera_tracking.js';

const DAY_SKY = new THREE.Color(0x2b2f31), NIGHT_SKY = new THREE.Color(0x06080c);

export async function createView({ canvas, fxLayer, district, catalog, parts, scenery, rooms = [], doors = [], zoom = 0.72, night = false, debug = false, units = null, world = null, worldChunks = null, cutouts = null, resourceSpots = null, spotConfig = null }) {
  // Use one close interior camera setting without enlarging character sprites separately.
  const INDOOR_ZOOM = 1.1;
  const minZoom = place => place === 'world' ? 0.175 : 0.35;
  const FLASH_SECONDS = 0.7;   // the camera moves in closer inside buildings
  let zoomNow = zoom;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.info.autoReset=false; // count all water/bloom/main passes together for diagnostics
  let frameDrawMs=0,frameWorkers=0;
  const frameParts={};   // F3 breakdown of the frame's CPU time (Tim 2026-11-07 lag hunt)
  const framePeaks={};   // worst single frame of each part over the last 8 s, so a hitch can be read after stopping
  let partAt=0;const mark=k=>{const n=performance.now(),v=n-partAt;frameParts[k]=(frameParts[k]||0)*0.9+v*0.1;const pk=framePeaks[k];if(!pk||v>pk.v||n-pk.at>8000)framePeaks[k]={v,at:n};partAt=n;};
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
  let watchedPlace=null,watchedId=null;
  let watchFn = null;      // camera follow target (double-click a crew name or group header): () => { x, z } or null
  const PAN_SPEED = 16;
  // Indoors the camera may also travel to the street to command outdoor crew.
  const B = district.bounds, inMap = p => {
    if (heroPlace === 'world') return p;   // out on the island (frontier W3): no city edges
    const farX = heroPlace === 'street' ? B.maxX + 4 : Math.max(B.maxX + 4, ...rooms.map(r => r.origin.x + (r.renderLayout || r).size[0] * (r.worldScale || 1) + 4));
    p.x = THREE.MathUtils.clamp(p.x, B.minX - 4, farX);
    p.z = THREE.MathUtils.clamp(p.z, B.minZ - 4, B.maxZ + 4);
    return p; };
  const cameraPlace = h => watchFn&&watchedPlace ? watchedPlace : freeCam && h?.place !== 'street' && h?.place !== 'world' && camTarget.x <= B.maxX + 10 ? 'street' : h?.place;
  // screen-up as a ground direction, long enough to move the view as fast as sideways
  const GROUND_UP = CAM_UP.clone().setY(0).normalize();
  GROUND_UP.divideScalar(GROUND_UP.dot(CAM_UP));

  let video = { ...VIDEO_DEFAULTS };
  function resize() {
    const w = innerWidth, h = innerHeight;
    // video settings (src/video_settings.js): the picked resolution sets how many pixels are drawn
    const forced = Number(new URLSearchParams(location.search).get('dpr'));
    renderer.setPixelRatio(forced || pixelRatioFor(video, w, h, devicePixelRatio));
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
  const rings = doorRings(doors.filter(d => d.menu !== 'surveyor'));   // the surveyor has a quest mark over his head instead (render/banners.js)
  for (const d of rings) scene.add(d);
  const things = await buildScenery(scenery, renderer);
  // the island around the camera while the hero is out there (render/world_ground.js, frontier W3.4)
  const worldGround = world && worldChunks && cutouts ? createWorldGround({ scene, renderer, world, cfg: worldChunks, catalog, cutouts, bounds: district.bounds, gate: doors.find(d=>d.gate&&d.place==='street'), resourceSpots, spotConfig }) : null;
  // train plan: railway track on the island; each train car is a sprite (train_* art, Tim 2026-11-07), only its body and shadow
  const railTrack = worldGround ? createRailTrack({ scene, carSprite: async model => { const s = new CharacterSprite(await loadSheets(catalog, model)); scene.add(s.thing.mesh, s.shadow); return s; } }) : null;
  // the capital's railway station (Tim 2026-11-07): an engine with its nose out and a track off the east edge, in the city
  const cityStationAt = (district.buildings || []).find(b => b.railStation);
  const cityStation = cityStationAt ? createCityStation({ scene, station: cityStationAt, edgeX: district.bounds.maxX,
    carSprite: async model => { const s = new CharacterSprite(await loadSheets(catalog, model)); scene.add(s.thing.mesh, s.shadow); return s; } }) : null;
  // night in the wild: a soft, cool glow around the hero's group keeps the ground readable (Tim 2026-11-02)
  const wildGlow = { pos: new THREE.Vector3(), radius: worldChunks?.nightGlow?.radius ?? 12, color: new THREE.Color(...(worldChunks?.nightGlow?.color ?? [0.3, 0.36, 0.5])), fire: false, seed: 1 };
  for (const t of things) scene.add(t.mesh, ...t.extras);
  const lights = [...things.flatMap(t => t.lights), ...roomLights];
  // lanterns by prop index, so a snuffed one (state.lightsOut, sim/stealth.js) can go dark
  const propLights = new Map();
  for (const t of things) if (t.prop !== null && t.lights.length) propLights.set(t.prop, t.lights);
  for(const light of roomLights)if(light.prop!=null)propLights.set(light.prop,[light]);
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
  // Turning arcs (Tim 2026-11-01, mock C): three soft arcs with gaps and small beads that slowly
  // rotate, a faint inner line and a dark under-shadow so it reads on any ground. One shared quad
  // and one shader material per team: no textures, no per-unit memory beyond the mesh itself.
  const TEAM_TIME = { value: 0 };
  const TEAM_GEO = new THREE.PlaneGeometry(1.4, 1.4);
  const teamMaterial = c => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(c) }, uTime: TEAM_TIME, uOpacity: { value: 0.6 } },
    vertexShader: `varying vec2 vP; varying float vPhase;
      void main() { vP = (uv - 0.5) * 1.4;
        vec2 c = modelMatrix[3].xz; vPhase = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uOpacity; varying vec2 vP; varying float vPhase;
      const float TAU = 6.2831853, R = 0.53;
      void main() {
        float r = length(vP), a = atan(vP.y, vP.x) + uTime * 0.35 + vPhase;
        float seg = fract(a / (TAU / 3.0));                          // 0..1 within each third
        float arc = smoothstep(0.0, 0.05, seg) * (1.0 - smoothstep(0.69, 0.74, seg));
        float d = r - R;
        float core = exp(-d * d / 0.00018), glow = exp(-d * d / 0.0028);
        float inner = exp(-pow(r - 0.43, 2.0) / 0.00006) * 0.35;
        float bp = (0.815 + floor(a / (TAU / 3.0))) * (TAU / 3.0) - uTime * 0.35 - vPhase;   // bead in each gap
        float bead = exp(-dot(vP - R * vec2(cos(bp), sin(bp)), vP - R * vec2(cos(bp), sin(bp))) / 0.00035);
        float light = (core * 0.85 + glow * 0.35) * arc + inner + bead * 0.9;
        float shade = exp(-d * d / 0.004) * 0.22;                     // dark under-shadow for light ground
        float alpha = clamp(light + shade * (1.0 - light), 0.0, 1.0) * uOpacity;
        vec3 col = uColor * light / max(light + shade * (1.0 - light), 1e-4);
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(col, alpha);
      }` });
  const TEAM_MAT = Object.fromEntries(Object.entries(TEAM).map(([k, c]) => [k, teamMaterial(c)]));
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
      const ring = new THREE.Mesh(TEAM_GEO, TEAM_MAT.enemy);
      ring.renderOrder = 2;
      s.team.add(new THREE.Object3D(), ring);   // slot 0 kept empty so children[1] stays the ring
      s.team.rotation.x = -Math.PI / 2;
      scene.add(s.team);
    }
    s.team.visible = !e.dead && !e.downed && !e.jailed && !e.cannon;   // salute cannons are scenery: no ring
    TEAM_TIME.value = performance.now() / 1000;
    s.team.children[1].material = TEAM_MAT[teamOf(e, me)];
    s.team.position.set(s.pos.x, 0.018, s.pos.z);
    s.team.scale.setScalar(s.size);
  }

  // one sprite per unit in the state
  const sprites = new Map();
  let selected = new Set();
  let nameplatesOn = false;
  let hoverUnitId = null;   // the salute cannon under the pointer (town_hover.js): drawn brighter
  async function addSprite(e) {
    const s = new CharacterSprite(await loadSheets(catalog, e.model));
    sprites.set(e.id, s);
    scene.add(s.thing.mesh, s.shadow, s.hidden, s.ring, s.bar, s.nameplate);
    s.ring.visible = selected.has(e.id);
    return s;
  }
  function syncSprites(state) {
    for (const e of Object.values(state.entities)) if (!sprites.has(e.id)) { sprites.set(e.id, null); addSprite(e); }
    for (const [id, s] of sprites) if (!state.entities[id] && s) { scene.remove(s.thing.mesh, s.shadow, s.hidden, s.ring, s.bar, s.nameplate); if (s.team) scene.remove(s.team); s.dispose(); sprites.delete(id); trickle.delete(id); }
  }

  function updateLights(time) {
    const wild = heroPlace === 'world' && heroPos ? [...(worldGround?.lights() || []), Object.assign(wildGlow, { pos: wildGlow.pos.set(heroPos.x, 1.2, heroPos.z) })] : [];
    const trainLamps = [...(railTrack?.lights() || []), ...(cityStation?.lights() || [])];   // train oil lamps (render/train_fx.js)
    const near = [...lights, ...wild, ...trainLamps].filter(l => !l.off)
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
    for (const t of [...things, ...(worldGround?.things() || [])]) {
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
    const frameStart=performance.now();renderer.info.reset();partAt=frameStart;
    frameWorkers=Object.values(state.entities).filter(e=>e.worker).length;
    updateFlashes(dt);
    shared.uTime.value = time;
    shared.uNight.value = THREE.MathUtils.clamp(shared.uNight.value + Math.sign(nightTarget - shared.uNight.value) * dt / 1.2, 0, 1);
    scene.background = DAY_SKY.clone().lerp(NIGHT_SKY, shared.uNight.value);
    if (shrooms) shrooms.opacity = 0.45 + shared.uNight.value * (0.35 + 0.1 * Math.sin(time * 1.7));   // seen by day, a gentle glow at night

    syncSprites(state);
    syncLightsOut(state);
    mark('sprites');
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
      // a rifleman standing about within 3 s of a shot plays his reload (sim/rifleman.js firedAt)
      // on horseback (sim/mounts.js, Tim 2026-11-06): the hero sits up on the horse ('ride' clip, the idle until it is exported)
      const anim = e.mounted ? 'ride' : e.anim === 'idle' && e.rifle?.firedAt != null && state.tick - e.rifle.firedAt < 60 ? 'reload' : e.anim;
      s.lift = e.mounted ? 0.95 : 0;
      s.setEquipment(e.type === 'hero' ? ['weapon','armor','accessory'].map(slot=>ITEMS[e.equipment?.[slot]]) : []);
      s.update(fdt, p.x + (e.x - p.x) * alpha, p.z + (e.z - p.z) * alpha, e.dir, anim, swingT,
        e.place && e.place !== 'street' && e.place !== 'world' ? INDOOR_SIZE * (roomCharacterScales[e.place] || 1) : 1);
      if (e.cannon) s.bar.visible = false; else s.setHealth(e.hp, e.maxHp);   // salute cannons: no health bar
      s.setNameplate(e.name || unitName(units || { types: {} }, e.type), nameplatesOn && !e.dead && !e.jailed && (!e.hidden || e.owner === state.entities[followId]?.owner),
        state.clans?.[e.owner]?.color || (e.owner === 'police' ? '#539de0' : e.type === 'civilian' ? '#e0bd52' : '#a7a9ad'), !!state.clans?.[e.owner], e.type === 'hero');
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
      // salute cannons (Tim 2026-11-07): lifted out of the night's mud so they read; brighter still while hovered
      if (e.cannon && !lit && !veiled) {
        const hv = id === hoverUnitId;
        u.uTint.value.setRGB(hv ? 1.35 : 1.08, hv ? 1.3 : 1.05, hv ? 1.2 : 1.0);   // Tim 2026-11-07: the stronger lift looked washed out
        u.uSelfLight.value.setRGB(hv ? 0.18 : 0.06, hv ? 0.15 : 0.05, hv ? 0.1 : 0.04);
      }
      s.veiled = veiled;
      s.shimmer = shim;
      // sheltering in a stockade garrison (Tim 2026-11-06): not drawn, shown again when sent out
      const sheltered = !!e.garrison || !!e.aboard;   // or riding inside the omnibus (sim/omnibus.js)
      if (sheltered || s.sheltered) {
        for (const m of [s.thing.mesh, s.shadow, s.hidden, s.ring, s.bar, s.nameplate, s.team]) if (m) m.visible = !sheltered && (m !== s.ring || selected.has(id));
        s.sheltered = sheltered;
      }
    }
    for (const [id, l] of lanternLights) if (!sprites.get(id)?.lanternTint) { lights.splice(lights.indexOf(l), 1); lanternLights.delete(id); }
    const hero = sprites.get(followId);
    if (state.entities[followId]) markCrewDoors(rings, state, state.entities[followId].owner);

    updateCamera(state, followId, dt, hero?.pos);

    // clan banners at owned businesses; a gold burst where one just changed hands
    for (const b of banners.update(state, time, state.entities[followId]?.owner, state.entities[followId]?.place)) if(!resumingPresentation)abilityFx.claim(...banners.spot(b));
    hqFire.update(state);
    hitFx.update(fdt);
    const presentationId=watchFn&&state.entities[watchedId]?.owner===state.entities[followId]?.owner?watchedId:followId;
    abilityFx.update(fdt, state, presentationId);
    shakeT = Math.max(0, shakeT - dt);
    if (shakeT > 0 && video.shake) {
      const a = shakeAmp * shakeT / 0.18;
      camera.position.addScaledVector(CAM_RIGHT, (Math.random() - 0.5) * a).addScaledVector(CAM_UP, (Math.random() - 0.5) * a);
    }
    worldGround?.update(camTarget.x, camTarget.z, heroPlace === 'world', dt, state.frontier, state.world?.discovered?.[state.entities[followId]?.owner], Math.max(1, 0.35 / zoomNow));
    mark('ground');
    railTrack?.update(state.frontier, heroPlace === 'world', dt, shared.uNight.value);
    cityStation?.update(state.frontier, heroPlace === 'street', dt, state.entities[followId]?.owner, shared.uNight.value);
    mark('rail');
    updateLights(time);
    updateCutaway(hero, dt);
    updateBlueprintWalls(state, presentationId, sprites.get(presentationId)||hero, dt);
    mark('lights');
    // buildings, props and banners stand still, so only the units are re-checked each frame (render/draw_order.js)
    sorter.sort([...things, ...banners.things, ...(worldGround?.things() || [])], [...[...sprites.values()].filter(Boolean).map(s => s.thing), ...(railTrack?.things() || []), ...(cityStation?.things() || [])]);
    mark('sort');
    // effect particles are sized in world units: pixels per unit of each target drawn
    const px = renderer.getDrawingBufferSize(bufSize).y / (camera.top - camera.bottom);
    fxShared.uPx.value = px * bloom.scale;
    worldGround?.captureWater(camera, time);
    mark('water');
    bloom.render(scene, camera, video.glow);
    mark('glow');
    fxShared.uPx.value = px;
    renderer.render(scene, camera);
    bloom.composite();
    mark('draw');
    frameDrawMs=performance.now()-frameStart;
    resumingPresentation=false;
  }

  // hit effects: damage numbers, trails, sparks, flash and lean, a little shake on kills near the hero
  const banners = createBanners({ scene });
  const hqFire = createHQFire({ scene, things, lights });
  const hitFx = createHitFx({ scene, overlay: fxLayer, unitToScreen: (x, z) => { v.set(x, 0.9, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; } });
  const abilityFx = createAbilityFx({ scene, overlay: fxLayer, posOf: id => sprites.get(id)?.pos || null, spriteOf: id => sprites.get(id) || null,
    unitToScreen: (x, z, y = 0.9) => { v.set(x, y, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; } });
  function addCasts(casts) {
    for (const c of casts) {
      abilityFx.cast(c);
      if (c.ryo) abilityFx.coins(c.x, c.z);   // c.ryo: an execute that paid ryo
      if (c.kind === 'cannonFire') { shakeT = Math.max(shakeT, 0.18); shakeAmp = Math.max(shakeAmp, 0.12); }   // the salute's kick (Tim 2026-11-07)
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
  const sorter = createSorter();   // draw order of all sprites, kept between frames
  const lanternLights = new Map();   // unit id -> the light that follows it during Red Lantern
  function addHits(hits, state, followId) {
    const me = state.entities[followId];
    for (const h of hits) {
      const a = state.entities[h.a], t = state.entities[h.t];
      if (h.crit) sprites.get(h.a)?.shadowBlade?.critical();
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
  let heroPos = null, farCam = false, jumpFrom = null, heroPlace = null, lastRide = null;
  let previousCameraHero = null;
  const cameraPoint = new THREE.Vector3();
  // Also runs with map presentation active: update only camera math, never the scene or GPU.
  function updateCamera(state, followId, dt, position = null) {
    const h = state.entities[followId]; if (!h) return;
    const sample = { id: followId, place: h.place, x: h.x, z: h.z };
    const jumped = cameraDiscontinuity(previousCameraHero, sample);
    previousCameraHero = sample;
    cameraPoint.set(h.x, 0, h.z);
    // Don't interpolate through a whole-island test travel.
    if (position && Math.hypot(position.x - h.x, position.z - h.z) <= 60) cameraPoint.copy(position);
    // aboard a train (Tim 2026-11-07): the camera follows the drawn engine; boarding drops a pan or a watch,
    // panning afterwards keeps the camera there until Home
    const ride = typeof h.aboard === 'string' && h.aboard.startsWith('rail:') ? h.aboard.slice(5) : null, eng = ride && railTrack?.focus(ride);
    if (ride !== lastRide) { if (ride) { freeCam = null; farCam = false; watchFn = null; jumpFrom = null; } lastRide = ride; }
    if (eng && Math.hypot(eng.x - h.x, eng.z - h.z) <= 60) cameraPoint.set(eng.x, 0, eng.z);
    if (jumped) { freeCam = null; farCam = false; watchFn = null; jumpFrom = null; camTarget.copy(cameraPoint); }
    const w = watchFn && watchFn();
    if (watchFn && !w) watchFn = null;
    watchedPlace = w?.place ?? null; watchedId = w?.id ?? null;
    if (w) { farCam = true; jumpFrom = null; (freeCam ||= new THREE.Vector3()).set(w.x, cameraPoint.y, w.z); }
    else if (farCam && (h.place !== heroPlace || (jumpFrom && jumpFrom.distanceTo(cameraPoint) > 0.3))) { farCam = false; freeCam = null; }
    heroPlace = h.place;
    if (!camReady || camTarget.distanceTo(cameraPoint) > (farCam || freeCam ? Infinity : 20)) { camTarget.copy(cameraPoint); camReady = true; freeCam = null; }
    camTarget.lerp(freeCam || cameraPoint, 1 - Math.exp(-dt * (freeCam ? 14 : 6)));
    (heroPos ||= new THREE.Vector3()).copy(cameraPoint);
    const place = cameraPlace(h);
    const wantZoom = !['street', 'world'].includes(place) ? INDOOR_ZOOM : THREE.MathUtils.clamp(zoom, minZoom(place), 1.0);
    if (Math.abs(wantZoom - zoomNow) > 1e-3) { zoomNow += (wantZoom - zoomNow) * (1 - Math.exp(-dt * 5)); resize(); }
    const ppx = PPU * zoomNow * renderer.getPixelRatio(), s = toScreen(camTarget);
    camera.position.copy(camTarget)
      .addScaledVector(CAM_RIGHT, Math.round(s.x * ppx) / ppx - s.x)
      .addScaledVector(CAM_UP, Math.round(s.y * ppx) / ppx - s.y)
      .addScaledVector(VIEW_DIR, 200);
    camera.updateMatrixWorld();
  }
  let resumingPresentation=false;
  return {
    render, renderer, scene, addHits, addCasts, updateCamera,
    setTowns: list => {
      worldGround?.setTowns(list);
      // Space rings at the front door (Tim 2026-11-07): the middle of the art's front (+z, screen down-left) edge, as drawn
      const spots = new Map();
      if (cutouts) for (const p of list) if (p.spaceDoor) {
        const piece = placePiece({ name: p.art, x: p.x, z: p.z, flip: !!p.flip }, catalog, cutouts); if (!piece) continue;
        const fit = p.maxFootprint ? Math.min(1, p.maxFootprint / (2 * Math.max(piece.fa, piece.fb))) : 1;
        spots.set(p.spaceDoor, [p.x, p.z + piece.fb * 0.9 * fit + 1.6]);
      }
      banners.setDoors(spots);
    },
    graphicsStats:()=>({drawMs:frameDrawMs,calls:renderer.info.render.calls,sprites:sprites.size,workers:frameWorkers,
      geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs?.length || 0,
      width:renderer.domElement.width,height:renderer.domElement.height,pixelRatio:renderer.getPixelRatio(),parts:{...frameParts},peaks:Object.fromEntries(Object.entries(framePeaks).map(([k,p])=>[k,p.v]))}),
    setPresentationActive(active){
      fxLayer.hidden=!active;
      resumingPresentation=active;
      if(!active){hitFx.update(100);abilityFx.clear();updateFlashes(100);shakeT=freezeT=0;trickle.clear();}
    },
    addDodges(dodges) { for (const d of dodges) hitFx.dodge(d); },
    // arrow-key panning (right, up from -1 to 1 on screen); the camera stays there until snapBack
    pan(right, up, dt) {
      if (!right && !up) return;
      watchFn = null;
      freeCam ||= camTarget.clone();
      const k = PAN_SPEED * dt / zoomNow;
      freeCam.addScaledVector(CAM_RIGHT, right * k).addScaledVector(GROUND_UP, up * k);
      inMap(freeCam);
    },
    snapBack() { freeCam = null; farCam = false; watchFn = null; },
    // keep the camera on fn() = { x, z } every frame (null ends it); pans, map clicks and Home stop it
    watch(fn) { watchFn = fn;watchedPlace=fn?.()?.place??null; },
    // look at a ground point (minimap click); stays there until snapBack, like panning
    lookAt(x, z) {
      farCam = false; watchFn = null;
      freeCam = new THREE.Vector3(x, heroPos?.y ?? 0, z);
      inMap(freeCam);
    },
    // jump to any point however far from the hero (double-click a crew name); stays there until the hero moves, uses a door or Home
    jumpTo(x, z) { watchFn = null; farCam = true; jumpFrom = heroPos?.clone() ?? null; freeCam = new THREE.Vector3(x, heroPos?.y ?? 0, z); },
    isPanned: () => !!freeCam,
    flashBuilding(i) { if (i !== null && i !== undefined) flashes.set(i, 0); },
    // selection rings under these unit ids (selection is screen-only, not game state)
    setSelected(ids) { selected = new Set(ids); for (const [id, s] of sprites) if (s) s.ring.visible = selected.has(id); },
    setNameplates(on) { nameplatesOn = !!on; },
    nameplateAt(px,py,eligible=[]) {
      if(!nameplatesOn)return null;
      const ids=new Map(eligible.map(id=>[sprites.get(id)?.nameplate,id]));
      const plates=[...ids.keys()].filter(p=>p?.visible);
      raycaster.setFromCamera({x:px/innerWidth*2-1,y:1-py/innerHeight*2},camera);
      return ids.get(raycaster.intersectObjects(plates,false)[0]?.object)||null;
    },
    setOfficeHint(p) { banners.setHint(p); },   // telegraph office door [x, z] or null
    commandPlace(state, followId) { return cameraPlace(state.entities[followId]); },
    audioFocus(state, followId, selected = []) {
      const h = state.entities[followId];
      if (!h) return null;
      return { x: camTarget.x, z: camTarget.z, place: cameraPlace(h), hero: { x: h.x, z: h.z, place: h.place } };
    },
    // page pixel -> ground point { x, z }
    screenToGround(px, py) {
      camera.updateMatrixWorld();
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
    setHoverUnit(id) { hoverUnitId = id; },
    // a unit's body centre (about 0.9 above its feet) -> page pixel { x, y }; y = another height
    unitToScreen(x, z, y = 0.9) {
      v.set(x, y, z).project(camera);
      return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
    },
    // where a lantern prop's lights actually glow, as page pixels [{ x, y }] (for hovering it to snuff, Tim 2026-10-21)
    lampScreen(prop) {
      return (propLights.get(prop) || []).map(l => { v.set(l.pos.x, l.pos.y, l.pos.z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
    },
    isNight: () => nightTarget === 1,
    toggleNight() { nightTarget = nightTarget ? 0 : 1; return nightTarget === 1; },
    toggleDebug() { lines.visible = !lines.visible; },
    setVideo(v) { video = { ...video, ...v }; resize(); },
    // 1.0 shows the sprites at their real size; closer than that just blurs them
    zoomBy(f) { zoom = THREE.MathUtils.clamp(zoom * f, minZoom(cameraPlace({ place: heroPlace })), 1.0); resize(); },
  };
}
