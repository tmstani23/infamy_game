// Everything on screen. Reads the game state every frame and never changes it.
import { VIDEO_DEFAULTS, pixelRatioFor, createVideoSettings } from '../video_settings.js';
import * as THREE from 'three';
import { ITEMS } from '../sim/inventory.js';
import { VIEW_DIR, CAM_QUAT, CAM_RIGHT, CAM_UP, PPU, toScreen } from './iso.js';
import { shared, MAX_LIGHTS } from './shading.js';
import { buildGround, buildScenery, doorRings, markCrewDoors, behind, footprintLines } from './scenery.js';
import { createSorter } from './draw_order.js';
import { CharacterSprite, loadSheets, INDOOR_SIZE, setSpriteScale, sweepSheets, spriteMemory, useCompressedSprites } from './characters.js';
import { buildRoom3d } from './interior3d.js';
import { createHitFx } from './hitfx.js';
import { createAbilityFx } from './abilityfx.js';
import { createBloom } from './bloom.js';
import { fxShared } from './vfx.js';
import { createBanners } from './banners.js';
import { placePiece } from '../sim/geometry.js';
import { entityName } from '../selection_panel.js';
import { specialOf } from '../sim/special_cast.js';
import { createHQFire } from './hq_fire.js';
import { createHallChannelFx } from './hall_channel_fx.js';
import { createCampfireFx, SIT } from './campfire_fx.js';
import { createFolkFx } from './folk_fx.js';
import { createSayFx } from './say_fx.js';
import { createFireSmokeFx } from './fire_smoke_fx.js';   // wandering folk props (world variety P2)
import { createStructureFire } from './structure_fire.js';
import { createWorldGround } from './world_ground.js';
import { createWeather } from './weather.js';
import { createCrowFx } from './crow_fx.js';
import { createWildDropFx } from './wild_drop_fx.js';
import { createTameFx } from './tame_fx.js';
import { createWildEyesFx } from './wild_eyes_fx.js';   // night eyes of wolves and bears (wildlife W4)   // a hunted animal's hide flies to the hero (wildlife W3)
import { createRailTrack, createCityStation } from './rail_track.js';
import { createRailBlastFx } from './rail_blast_fx.js';
import { createStolenChests } from './stolen_chest.js';
import { createGroundItemsFx } from './ground_items.js';
import { createChestCashFx } from './chest_cash_fx.js';
import { islandBiome } from '../sim/island_art.js';
import { pointAt } from '../sim/frontier/rail_route.js';
import { createFerryShips, seaSpot } from './ferry_ships.js';
import { createMooredBoats } from './moored_boats.js';
import { buildCityDocks } from './city_docks.js';
import { createShipMarks } from './ship_marks.js';
import { createShipFx } from './ship_fx.js';
import { createBoardFx } from './board_fx.js';
import { createFishingFx } from './fishing_fx.js';   // fishing poles (2026-11-23)
import { createShoreLine } from './shore_line.js';   // ships S6b
import { cityOnIsland } from '../sim/chunk_gen.js';
import { cameraDiscontinuity } from '../camera_tracking.js';
import { groundY, maxGroundY } from '../castle_height.js';
import { createBossFx } from './boss_fx.js';
import { createRelicFx } from './relic_fx.js';

const DAY_SKY = new THREE.Color(0x2b2f31), NIGHT_SKY = new THREE.Color(0x06080c);

export async function createView({ canvas, fxLayer, district, catalog, parts, scenery, rooms = [], doors = [], zoom = 0.72, night = false, debug = false, units = null, world = null, worldChunks = null, cutouts = null, resourceSpots = null, spotConfig = null, hallSeconds = 60, weather: weatherCfg = null, wildlife: wildlifeCfg = null, ships = null, shore = null }) {
  // Use one close interior camera setting without enlarging character sprites separately.
  const INDOOR_ZOOM = 1.1;
  const minZoom = place => place === 'world' ? 0.175 : 0.35;
  const FLASH_SECONDS = 0.7;   // the camera moves in closer inside buildings
  let zoomNow = zoom, spriteSweepAt = 0;
  const SPRITE_TEXELS = 160 / 3;   // page pixels per world unit at sprite scale 1 (a 160 px cell covers 3 units)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.info.autoReset=false; // count all water/bloom/main passes together for diagnostics
  let frameDrawMs=0,frameWorkers=0;
  const frameParts={};   // F3 breakdown of the frame's CPU time (2026-11-07 lag hunt)
  const framePeaks={};   // worst single frame of each part over the last 8 s, so a hitch can be read after stopping
  let partAt=0;const mark=k=>{const n=performance.now(),v=n-partAt;frameParts[k]=(frameParts[k]||0)*0.9+v*0.1;const pk=framePeaks[k];if(!pk||v>pk.v||n-pk.at>8000)framePeaks[k]={v,at:n};partAt=n;};
  // Painted art is shaded in its own sRGB values, so no colour conversion on output
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  useCompressedSprites(renderer, createVideoSettings().get().sprites);   // before any sprite page loads
  const bloom = createBloom(renderer);   // glow on effects only
  const bufSize = new THREE.Vector2();

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
  camera.quaternion.copy(CAM_QUAT);
  // unit overlays (health bars, selection rings, nameplates) sit on their own layer so F2 can hide them (2026-11-08)
  const UI_LAYER = 5;
  camera.layers.enable(UI_LAYER);
  const camTarget = new THREE.Vector3();
  let camReady = false;
  let freeCam = null;      // where the camera looks while panned away from the hero (arrow keys), else null
  let shipPan = null;      // ships S6: { k, x, z, tx, tz } the hero's ship went down at x, z; he washes ashore at tx, tz
  let watchedPlace=null,watchedId=null;
  let roomView=null;       // interior view (2026-11-10): the room the camera stays in after following crew inside, until it goes back out
  const indoorPlace=p=>!!p&&p!=='street'&&p!=='world';
  let worldView=false,worldExit=null;   // Watch a war (war 8d-4): the camera shows the island wherever the hero is
  let cityView=false,cityExit=null;   // Watch the city (2026-11-08): the boss is on the island, the camera shows the capital street
  let watchFn = null;      // camera follow target (double-click a crew name or group header): () => { x, z } or null
  const PAN_SPEED = 16;
  // Indoors the camera may also travel to the street to command outdoor crew.
  const B = district.bounds, inMap = p => {
    const rv = roomView && rooms.find(r => r.name === roomView);
    if (rv) { const sz = (rv.renderLayout || rv).size, k = rv.worldScale || 1;   // inside a room: stay over its floor
      p.x = THREE.MathUtils.clamp(p.x, rv.origin.x - 1, rv.origin.x + sz[0] * k + 1); p.z = THREE.MathUtils.clamp(p.z, rv.origin.z - 1, rv.origin.z + sz[1] * k + 1); return p; }
    if ((heroPlace === 'world' && !cityView) || worldView) return p;   // out on the island (frontier W3): no city edges
    const farX = heroPlace === 'street' || cityView ? B.maxX + 4 : Math.max(B.maxX + 4, ...rooms.map(r => r.origin.x + (r.renderLayout || r).size[0] * (r.worldScale || 1) + 4));
    p.x = THREE.MathUtils.clamp(p.x, B.minX - 4, farX);
    p.z = THREE.MathUtils.clamp(p.z, B.minZ - 4, B.maxZ + 4);
    return p; };
  const cameraPlace = h => worldView ? 'world' : roomView && !(watchFn && watchedPlace) ? roomView : cityView && !(watchFn && indoorPlace(watchedPlace)) ? 'street' : watchFn&&watchedPlace ? watchedPlace : freeCam && h?.place !== 'street' && h?.place !== 'world' && camTarget.x <= B.maxX + 10 ? 'street' : h?.place;
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
  scene.add(await buildCityDocks(district.docks));   // the harbour piers on piles (render/city_docks.js, 2026-11-23)
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
  const rings = doorRings(doors.filter(d => d.menu !== 'surveyor' && d.menu !== 'lieutenant'));   // the lieutenant too (2026-11-10)   // the surveyor has a quest mark over his head instead (render/banners.js)
  for (const d of rings) { scene.add(d); d.traverse(c => c.layers.set(UI_LAYER)); }   // door rings hide with F2 too
  const things = await buildScenery(scenery, renderer);
  // the island around the camera while the hero is out there (render/world_ground.js, frontier W3.4)
  const worldGround = world && worldChunks && cutouts ? createWorldGround({ scene, renderer, world, cfg: worldChunks, catalog, cutouts, bounds: district.bounds, gate: doors.find(d=>d.gate&&d.place==='street'), railZ: (district.buildings || []).find(b => b.railStation)?.z ?? null, resourceSpots, spotConfig }) : null;
  // train plan: railway track on the island; each train car is a sprite (train_* art, 2026-11-07), only its body and shadow
  const railTrack = worldGround ? createRailTrack({ scene, snow: (x, z) => islandBiome(world, x, z) === 'snow', hide: (() => { const c = cityOnIsland(world, district.bounds); return (x, z) => x > c.minX && x < c.maxX + 0.6 && z > c.minZ && z < c.maxZ; })(), carSprite: async model => { const s = new CharacterSprite(await loadSheets(catalog, model)); scene.add(s.thing.mesh, s.shadow); return s; } }) : null;
  // frontier weather, purely visual (render/weather.js, 2026-11-20): fog banks, rain, snow
  const weather = worldGround ? createWeather({ scene, camera, renderer, world, cfg: weatherCfg }) : null;
  // crows out on the island (wildlife W1, 2026-11-24), purely visual: render/crow_fx.js
  const crowFx = worldGround ? createCrowFx({ scene, world, groundY, isBuilding: n => catalog?.items?.[n]?.kind === 'buildings', cfg: wildlifeCfg?.crows || {} }) : null;
  // the capital's railway station (2026-11-07): an engine with its nose out and a track off the east edge, in the city
  const cityStationAt = (district.buildings || []).find(b => b.railStation);
  const cityStation = cityStationAt ? createCityStation({ scene, station: cityStationAt, edgeX: district.bounds.maxX,
    carSprite: async model => { const s = new CharacterSprite(await loadSheets(catalog, model)); scene.add(s.thing.mesh, s.shadow); return s; } }) : null;
  // the ships at the city pier and the castle docks, and the one at sea (Z7, render/ferry_ships.js); ships = { bp, rules }
  const shipMarks = createShipMarks({ scene, types: units?.types, holdOf: e => e.hold ?? 0 });
  const shoreLine = world && shore ? createShoreLine({ scene, world }) : null;   // ships S6b: the landable shore while your people are afloat (src/landing_shore.js)
  const boardFx = createBoardFx({ scene, figureSprite: async model => { const s = new CharacterSprite(await loadSheets(catalog, model)); scene.add(s.thing.mesh); return s; } });   // boarding: grappling lines, deck fight, its bar, clan sails and pennants (ships S8)
  const shipFx = createShipFx({ scene, figureSprite: async model => { const s = new CharacterSprite(await loadSheets(catalog, model)); scene.add(s.thing.mesh); return s; } });   // ship guns and hull damage (ships S4)   // war ships: ring, plate, wake (ships S2)
  const ferryShips = worldGround && ships ? createFerryShips({ scene, ...ships, carSprite: async model => { const s = new CharacterSprite(await loadSheets(catalog, model)); scene.add(s.thing.mesh, s.shadow); return s; } }) : null;
  // boats tied up at the castle docks for the look only: a fishing boat, some days a warship (render/moored_boats.js, 2026-11-23)
  const mooredBoats = worldGround && ships ? createMooredBoats({ scene, rules: ships.rules, carSprite: async model => { const s = new CharacterSprite(await loadSheets(catalog, model)); scene.add(s.thing.mesh, s.shadow); return s; } }) : null;
  // night in the wild: a soft, cool glow around the hero's group keeps the ground readable (2026-11-02)
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
  // [x, z, shape], 2026-10-20/21): little stem-and-cap sprites in three shapes (round, tall cone,
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
  const TEAM = { hero: 0xffc83c, crew: 0x3cc8e6, enemy: 0xe63c32, bandit: 0xd2823c, townsfolk: 0xdcdcd2, police: 0x4a78e6, worker: 0x9be05a };   // worker: your workers (2026-11-12)
  // Turning arcs (2026-11-01, mock C): three soft arcs with gaps and small beads that slowly
  // rotate, a faint inner line and a dark under-shadow so it reads on any ground. One shared quad
  // and one shader material per team: no textures, no per-unit memory beyond the mesh itself.
  const TEAM_TIME = { value: 0 };
  // zoomed out (2026-11-19): 0 at normal zoom, 1 at the furthest; rings get thicker and brighter so enemies read in a war
  const TEAM_FAR = { value: 0 };
  const TEAM_GEO = new THREE.PlaneGeometry(1.4, 1.4);
  // rim: a thin pale brass ring all the way round, just outside the arcs, kept apart by a dark gap (workers, 2026-11-25: easy to spot zoomed out)
  const teamMaterial = (c, rim) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(c) }, uTime: TEAM_TIME, uOpacity: { value: 0.6 }, uFar: TEAM_FAR, uRim: { value: new THREE.Color(rim ?? 0) }, uRimK: { value: rim == null ? 0 : 0.6 } },
    vertexShader: `varying vec2 vP; varying float vPhase;
      void main() { vP = (uv - 0.5) * 1.4;
        vec2 c = modelMatrix[3].xz; vPhase = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor, uRim; uniform float uTime, uOpacity, uFar, uRimK; varying vec2 vP; varying float vPhase;
      const float TAU = 6.2831853, R = 0.53;
      void main() {
        float r = length(vP), a = atan(vP.y, vP.x) + uTime * 0.35 + vPhase;
        float seg = fract(a / (TAU / 3.0));                          // 0..1 within each third
        float arc = smoothstep(0.0, 0.05, seg) * (1.0 - smoothstep(0.69, 0.74, seg));
        float d = r - R;
        float wide = 1.0 + 5.0 * uFar, core = exp(-d * d / (0.00018 * wide)), glow = exp(-d * d / (0.0028 * (1.0 + 1.5 * uFar)));
        float inner = exp(-pow(r - 0.43, 2.0) / 0.00006) * 0.35;
        float bp = (0.815 + floor(a / (TAU / 3.0))) * (TAU / 3.0) - uTime * 0.35 - vPhase;   // bead in each gap
        float bead = exp(-dot(vP - R * vec2(cos(bp), sin(bp)), vP - R * vec2(cos(bp), sin(bp))) / 0.00035);
        float light = (core * 0.85 + glow * 0.35) * arc + inner + bead * 0.9;
        float shade = exp(-d * d / 0.004) * 0.22;                     // dark under-shadow for light ground
        vec3 lit = uColor * light;
        if (uRimK > 0.0) {
          float rr = 0.635 + 0.03 * uFar, dr = r - rr, ww = 0.00007 * (1.0 + 1.5 * uFar);
          float g = (exp(-dr * dr / ww) + 0.25 * exp(-dr * dr / (ww * 8.0))) * uRimK * (1.0 + 0.5 * uFar);   // brighter zoomed out
          lit += uRim * g; light += g;
          float gm = r - (R + rr) * 0.5;
          shade = max(shade, exp(-gm * gm / ww) * 0.5);
        }
        float alpha = clamp(light + shade * (1.0 - light), 0.0, 1.0) * mix(uOpacity, 1.0, uFar);
        vec3 col = lit / max(light + shade * (1.0 - light), 1e-4);
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(col, alpha);
      }` });
  // health bars by side (2026-11-19): yours green, enemies red, everyone else keeps the green-to-red health shading
  const SIDE_BAR = { hero: [0.36, 0.8, 0.3], crew: [0.36, 0.8, 0.3], worker: [0.36, 0.8, 0.3], enemy: [0.86, 0.18, 0.14] };
  const TEAM_RIM = { worker: 0xe8d9a0 };   // pale brass edge on your workers' rings, town and camp (2026-11-25)
  const TEAM_MAT = Object.fromEntries(Object.entries(TEAM).map(([k, c]) => [k, teamMaterial(c, TEAM_RIM[k])]));
  // a wild animal's coat: between the species' two shades (coat[0]) and a little lighter or darker (coat[1])
  const coatTint = e => {
    const [a, b] = wildlifeCfg?.animals?.coat?.[e.type] || [[1, 1, 1], [1, 1, 1]], k = e.coat[0], l = 1 + ((e.coat[1] ?? 0.5) - 0.5) * (wildlifeCfg?.animals?.coatLight ?? 0.12);
    return a.map((v, i) => (v + (b[i] - v) * k) * l);
  };
  function teamOf(e, me) {
    if (e.id === me?.id) return 'hero';
    if (e.worker) return me && e.workerOwner === me.owner ? 'worker' : 'enemy';   // workers stand out from townsfolk and crew (2026-11-12)
    if (e.type === 'civilian' || (e.guide && !e.owner)) return 'townsfolk';   // the old surveyor and other clanless guides read as townsfolk (2026-11-20)
    if (me && e.owner === me.owner) return 'crew';
    if (e.type === 'horse' && !e.owner) return me && e.horseOwner === me.owner ? 'crew' : e.horseOwner ? 'enemy' : 'townsfolk';   // a loose horse takes its owner's side, not red (2026-11-21)
    if (e.wildlife) return e.angry && Object.keys(e.angry).length ? 'enemy' : 'bandit';   // wild animals (sim/wild_animals.js): red only while a boar charges
    if (e.owner === 'bandits') return e.angry && Object.keys(e.angry).length ? 'enemy' : 'bandit';
    // police: blue, red while after your clan
    if (e.owner === 'police') return e.angry?.[me?.owner] !== undefined ? 'enemy' : 'police';
    return 'enemy';
  }
  // Special-unit auras (2026-11-12): a soft glow under every unit with a special ability, its own colour and motion
  // per special (sim/special_cast.js SPECIALS). style 0 pulse, 1 flicker, 2 ripples, 3 turning ticks.
  const AURA = { firebomb: [0xff7a2a, 1], taunt: [0xff3b30, 0], charm: [0xff7ad2, 2], aimed: [0x9fd8ff, 3], dogs: [0xe0a650, 2], gatling: [0xdfe6ee, 3], hamstring: [0x7ee07a, 2] };
  const AURA_GEO = new THREE.PlaneGeometry(2.4, 2.4);
  const auraMat = ([c, style]) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(c) }, uTime: TEAM_TIME, uStyle: { value: style } },
    vertexShader: `varying vec2 vP;
      void main() { vP = (uv - 0.5) * 2.4;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uStyle; varying vec2 vP;
      void main() {
        float r = length(vP), t = uTime, glow = exp(-r * r / 0.35), k;
        if (uStyle < 0.5) k = glow * (0.55 + 0.25 * sin(t * 2.2));
        else if (uStyle < 1.5) k = glow * (0.5 + 0.12 * sin(t * 3.1) + 0.08 * sin(t * 4.7 + r * 3.0));
        else if (uStyle < 2.5) { float w = fract(r * 0.9 - t * 0.5); k = glow * 0.35 + exp(-pow(w - 0.5, 2.0) / 0.006) * exp(-r * r / 0.9) * 0.5; }
        else { float a = atan(vP.y, vP.x) + t * 0.6; k = glow * 0.35 + step(0.8, fract(a * 4.0 / 6.2832)) * exp(-pow(r - 0.8, 2.0) / 0.004) * 0.7; }
        k *= 0.5;   // kept soft (2026-11-13: lighter, no flicker on the move)
        if (k < 0.004) discard;
        gl_FragColor = vec4(uColor * k, 1.0);
      }` });
  const AURA_MAT = Object.fromEntries(Object.entries(AURA).map(([k, v]) => [k, auraMat(v)]));
  function updateAura(s, e) {
    const sp = !e.dead && !e.downed && !e.jailed && !e.worker && e.type !== 'hero' && (!e.hidden || s.ghost) ? specialOf(units, e) : null;
    if (!sp || !AURA_MAT[sp]) { if (s.aura) s.aura.visible = false; return; }
    if (!s.aura) { s.aura = new THREE.Mesh(AURA_GEO, AURA_MAT[sp]); s.aura.rotation.x = -Math.PI / 2; s.aura.renderOrder = 1; scene.add(s.aura); }
    s.aura.material = AURA_MAT[sp]; s.aura.visible = s.thing.mesh.visible !== false;
    s.aura.position.set(s.pos.x, 0.015 + s.pos.y, s.pos.z); s.aura.scale.setScalar(s.size);
  }
  function updateTeamRing(s, e, me) {
    if (!s.team) {
      s.team = new THREE.Group();
      const ring = new THREE.Mesh(TEAM_GEO, TEAM_MAT.enemy);
      ring.renderOrder = 2;
      ring.layers.set(UI_LAYER);   // F2 hides the team rings too (2026-11-16: clean screenshots)
      s.team.add(new THREE.Object3D(), ring);   // slot 0 kept empty so children[1] stays the ring
      s.team.rotation.x = -Math.PI / 2;
      scene.add(s.team);
    }
    s.team.visible = !e.dead && !e.downed && !e.jailed && !e.cannon && !(e.wildlife && !(e.angry && Object.keys(e.angry).length)) && !(e.folk && e.type === 'civilian');   // salute cannons are scenery: no ring; a calm wild animal neither
    TEAM_TIME.value = performance.now() / 1000;
    TEAM_FAR.value = THREE.MathUtils.clamp((0.6 - zoomNow) / (0.6 - minZoom('world')), 0, 1);
    s.team.children[1].material = TEAM_MAT[teamOf(e, me)];
    s.team.position.set(s.pos.x, 0.018 + s.pos.y, s.pos.z);
    s.team.scale.setScalar(s.size * (1 + 0.3 * TEAM_FAR.value));
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
    for (const o of [s.ring, s.bar, s.nameplate]) o.traverse(c => c.layers.set(UI_LAYER));
    s.ring.visible = selected.has(e.id);
    if (e.type === 'war_dog') s.addOutline(0xd9a24a);   // loosed dogs: a thin lamp-gold glowing edge (2026-11-25)
    return s;
  }
  // A frontier rickshaw with anyone in it gets a seated coachman on the seat (2026-11-08: no empty seat, but not
  // the hero himself; a parked empty one stays empty). Drawing only: the rickshaw_driver coach_sitting sheet, placed
  // per direction at the seat of the rickshaw_horse sheet (cell pixels, centre to centre; both sheets are 5.4/288 per px).
  // Facing away the hood is in front of him, so he draws behind the cart.
  const SEAT = [[0, -55], [59, -52], [86, -20], [75, 9], [0, 9], [-75, 9], [-98, -37], [-75, -60]], SEAT_PX = 5.4 / 288;
  const BEHIND = [false, false, false, true, true, true, false, false];
  // A rider on a horse (hero, crew, war cavalry): where his sitting sheet's cell centre goes per facing, in horse-sheet
  // pixels from the horse's cell centre (right, down): the saddle of the mare sheets sits 14 px behind and 31 px above
  // her cell centre, the rider's hips 23 px below his; he sinks 5 px into it
  const RIDE_SEAT = [[0, -55], [10, -54], [14, -49], [10, -45], [0, -43], [-10, -45], [-14, -49], [-10, -54]];
  const drivers = new Map();   // rickshaw id -> CharacterSprite (null while loading)
  function syncDriver(e, s, dt, loaded) {
    const want = e.type === 'rickshaw' && e.model === 'rickshaw_horse' && !e.dead && (!!e.driver || loaded.has(e.id));
    let d = drivers.get(e.id);
    if (!want) { if (d) { scene.remove(d.thing.mesh); d.dispose(); } if (d !== undefined) drivers.delete(e.id); return; }
    if (d === undefined) {
      drivers.set(e.id, null);
      loadSheets(catalog, 'rickshaw_driver').then(sh => { if (!drivers.has(e.id)) return; const c = new CharacterSprite(sh); drivers.set(e.id, c); scene.add(c.thing.mesh); }).catch(() => {});
      return;
    }
    if (!d) return;
    const dir = ((e.dir ?? 0) % 8 + 8) % 8, [ox, oy] = SEAT[dir], m = s.thing.mesh;
    d.update(dt, m.position.x, m.position.z, dir, 'ride', null, 1);
    d.thing.mesh.position.copy(m.position).addScaledVector(CAM_RIGHT, ox * SEAT_PX).addScaledVector(CAM_UP, -oy * SEAT_PX)
      .addScaledVector(VIEW_DIR, BEHIND[dir] ? -0.5 : 0.5);
    d.thing.mesh.visible = m.visible;
    d.behind = BEHIND[dir]; d.cart = m;
  }
  function syncSprites(state) {
    for (const e of Object.values(state.entities)) if (!sprites.has(e.id)) { sprites.set(e.id, null); addSprite(e); }
    for (const [id, s] of sprites) if (!state.entities[id] && s && !tameFx.holds(id)) { scene.remove(s.thing.mesh, s.shadow, s.hidden, s.ring, s.bar, s.nameplate); if (s.team) scene.remove(s.team); if (s.aura) scene.remove(s.aura); s.dispose(); sprites.delete(id); trickle.delete(id); }
  }

  function updateLights(time) {
    const wild = ((heroPlace === 'world' && !cityView) || worldView) && heroPos ? [...(worldGround?.lights() || []), Object.assign(wildGlow, { pos: wildGlow.pos.set(heroPos.x, 1.2 + groundY(heroPos.x, heroPos.z), heroPos.z) })] : [];
    const trainLamps = [...(railTrack?.lights() || []), ...(cityStation?.lights() || []), ...(stolenChests?.lights() || [])];   // + the robbery guard's lantern (render/stolen_chest.js)   // train oil lamps (render/train_fx.js)
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
          && [0.25, 1.0, 1.8].some(y => t.covers(probe.copy(hero.pos).setY(hero.pos.y + y)));
      }
      t.cut = THREE.MathUtils.clamp(t.cut + (covering ? dt : -dt) * 4, 0, 1);
      const u = t.mesh.material.uniforms;
      u.uCut.value = t.cut;
      if (hero) u.uCutCenter.value.copy(hero.pos).setY(hero.pos.y + 1.0);
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

  // a building pulses softly twice: crew were sent in, or came out (2026-10-19)
  const flashes = new Map();   // building index -> seconds since the flash started
  function updateFlashes(dt) {
    for (const [i, age] of flashes) {
      const a = age + dt, k = a / FLASH_SECONDS;
      for (const t of things) if (t.building === i) t.mesh.material.uniforms.uFlash.value = k < 1 ? 0.32 * Math.sin(Math.PI * 2 * k) ** 2 : 0;
      if (k >= 1) flashes.delete(i); else flashes.set(i, a);
    }
  }

  // state: current tick; prev: the tick before; alpha: how far between them (0..1)
  let frameAlpha = 1;   // this frame's time between sim ticks, for the camera on a ship
  function render(state, prev, alpha, dt, time, followId) {
    frameAlpha = alpha;
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
    const loaded = new Set(); for (const u of Object.values(state.entities)) if (u.aboard) loaded.add(u.aboard);
    for (const [id, d] of drivers) if (!state.entities[id]) { if (d) { scene.remove(d.thing.mesh); d.dispose(); } drivers.delete(id); }
    wildEyes.begin(); let eyesMine = null; const myOwner = state.entities[followId]?.owner;
    for (const [id, s] of sprites) {
      if (!s || !state.entities[id]) continue;   // a caught wild horse's sprite, held while the light passes (render/tame_fx.js)
      let e = state.entities[id];
      let p = prev.entities[id] || e;
      if (Math.hypot(e.x - p.x, e.z - p.z) > 3) p = e;    // went through a door: no sliding
      if (e.shipRide) { const q = seaSpot(state, e.shipRide, alpha); p = e = { ...e, x: q.x, z: q.z }; }   // at sea: on the drawn ship
      const w = e.swing, swingT = w ? Math.min(1, Math.max(0, (state.tick - 1 + alpha - w.start) / w.len)) : null;
      // a rifleman standing about within 3 s of a shot plays his reload (sim/rifleman.js firedAt)
      // on horseback (sim/mounts.js, 2026-11-06): the hero sits up on the horse ('ride' clip, the idle until it is exported)
      s.riding = !!e.mounted;
      // seated at a campfire (sim/campfire.js): the 'sit' clip on his log, while he stands still
      const anim = e.mounted ? ((e.anim === 'attack' || e.anim === 'sweep') && swingT !== null && swingT < 1 ? e.anim : 'ride') : e.sitting && (e.anim === 'idle' || !e.anim) ? 'sit' : e.anim === 'idle' && e.rifle?.firedAt != null && state.tick - e.rifle.firedAt < 60 ? 'reload' : e.anim;
      // the rider sits on the saddle (2026-11-14: he sat low and off it): his cell centre goes to the horse's cell
      // centre, then RIDE_SEAT per facing moves his hips onto the saddle of the mare sheets
      const seat = e.mounted ? RIDE_SEAT[((e.dir ?? 0) % 8 + 8) % 8] : null;
      s.lift = seat ? (sprites.get(e.ride?.horse)?.feetUp ?? 1.221) - s.feetUp : anim === 'sit' ? SIT.lift : 0;
      // art.json rideBack: some bodies sit this many sheet pixels further back, along the saddle's offset from -49 (2026-11-14)
      const back = seat ? (catalog.rideBack?.[e.model] || 0) / 14 : 0;
      s.seat = seat ? [(seat[0] * (1 + back)) * SEAT_PX, -(seat[1] + (seat[1] + 49) * back) * SEAT_PX] : null;
      s.setEquipment(e.type === 'hero' ? ['weapon','armor','accessory'].map(slot=>ITEMS[e.equipment?.[slot]]) : []);
      if (e.tiny || s.tinyK != null) { s.tinyK = (s.tinyK ?? 1) + ((e.tiny ? 0.45 : 1) - (s.tinyK ?? 1)) * Math.min(1, fdt * 7); if (!e.tiny && s.tinyK > 0.995) s.tinyK = null; }   // the hermit's brew shrank him (sim/wandering_folk.js)
      s.update(fdt, p.x + (e.x - p.x) * alpha, p.z + (e.z - p.z) * alpha, e.dir, anim, swingT,
        (e.place && e.place !== 'street' && e.place !== 'world' ? INDOOR_SIZE * (roomCharacterScales[e.place] || 1) : 1) * (s.tinyK ?? 1) * (e.boss?.scale ?? 1));   // guarded place bosses drawn bigger (P4)
      if (e.type === 'rickshaw' || drivers.has(id)) syncDriver(e, s, fdt, loaded);   // its coachman (frontier rickshaw)
      // salute cannons: no health bar; a ridden horse neither: its bar sat on the rider's and the two flickered (2026-11-16), her health shows on her Mount card
      if (e.cannon || (e.guide && !e.owner) || (e.type === 'horse' && e.rider) || (e.folk && e.type === 'civilian')) s.bar.visible = false; else s.setHealth(e.hp, e.maxHp, SIDE_BAR[teamOf(e, state.entities[followId])]);   // nor the clanless guides (2026-11-20)
      s.setNameplate(e.boss?.title || e.name || entityName(units || { types: {} }, e), (nameplatesOn || !!e.boss) && !e.dead && !e.jailed && (!e.hidden || e.owner === state.entities[followId]?.owner),
        state.clans?.[e.owner]?.color || (e.owner === 'police' ? '#539de0' : e.type === 'civilian' ? '#e0bd52' : '#a7a9ad'), state.clans?.[e.owner] ? state.clans[e.owner].faction || true : false, e.type === 'hero',
        e.boss ? '#d6a64a' : teamOf(e, state.entities[followId]) === 'enemy' ? '#e63c32' : null, !!e.boss);   // bosses: the gilt elite frame (P4); enemies: a red border, the crest keeps the clan colour (2026-11-19)
      // an execute or arrest channel shows one bar, the labelled one in render/abilityfx.js (the
      // health bar stays a health bar: two bars used to show, 2026-10-18);
      // a jailed hero (sim/police.js) is greyed out and his bar counts down his time
      if (e.jailed) s.setBar((e.jailed.until - state.tick - alpha) / e.jailed.len, [0.6, 0.6, 0.65]);
      if (e.boss && !s.bossLook) { s.bossLook = true; const t = e.boss.tint || [1, 1, 1]; s.material.uniforms.uTint.value.setRGB(...t); s.coat = t; if (e.boss.grey) s.material.uniforms.uGrey.value = e.boss.grey; }   // the boss's own colour (P4)
      const grey = !!e.jailed, gu = s.material.uniforms;
      if (grey !== !!s.grey) { gu.uTint.value.setRGB(...(grey ? [0.5, 0.5, 0.55] : [1, 1, 1])); s.grey = grey; }
      // your hidden ninja (sim/stealth.js) are drawn a little see-through (2026-10-20: half as see-through as before); nobody else is shown them at all
      const ghost = !!e.hidden && !grey;
      const veiled = ghost && !e.dead && !e.downed && (e.buffs?.veil?.until ?? -1) > state.tick;
      // a body (2026-11-13): one with no fall to play (horses, guns) fades at once; on the island the others fade out over
      // the last 1.5 s of sim/game.js islandCorpseSeconds (20); bodies with loot on them and the hero are left alone
      const deadFor = e.dead && e.type !== 'hero' && e.diedAt != null ? (state.tick - e.diedAt) / 20 : -1;
      const fall = deadFor < 0 ? 1 : !s.sheets?.death ? Math.max(0, 1 - deadFor / 0.8) : e.place === 'world' && !e.loot && !e.gearItem && e.owner !== 'police' ? Math.min(1, Math.max(0, (20 - deadFor) / 1.5)) : 1;
      // war troops running off after their war ended (sim/frontier/war_end.js, 2026-11-14): they fade out over the last 60% of the run
      const rout = e.rout ? Math.min(1, Math.max(0, (e.rout.until - state.tick - alpha) / Math.max(1, (e.rout.until - e.rout.start) * 0.6))) : 1;
      if (e.rout) s.bar.visible = false;
      gu.uOpacity.value = (grey ? 0.55 : veiled ? 0.18 : ghost ? 0.8 : 1) * fall * rout;
      gu.uVeil.value = veiled ? 1 : 0;
      s.ghost = ghost;
      updateTeamRing(s, e, state.entities[followId]);
      if (e.wildlife) {   // wild animals: no bar until hurt; each its own coat shade from its seed (data/wildlife.json animals.coat)
        if (e.dead || !(e.hp < e.maxHp)) s.bar.visible = false;
        if (!s.coat && e.coat) { s.coat = coatTint(e); s.material.uniforms.uTint.value.setRGB(...s.coat); s.material.uniforms.uGrey.value = wildlifeCfg?.animals?.grey?.[e.type] ?? 0; }
        // night eyes (render/wild_eyes_fx.js, 2026-11-24): at night a wolf or bear out past your people goes near black and only its eyes show
        const EY = wildlifeCfg?.animals?.eyes, night = shared.uNight.value;
        if (EY?.at?.[e.type] && s.coat && (night > 0.01 || s.eyesDark)) {
          let far = 0;
          if (night > 0.01 && !e.dead) {
            eyesMine ??= Object.values(state.entities).filter(u => u.owner === myOwner && !u.dead && u.place === 'world');
            let d = Infinity; for (const u of eyesMine) d = Math.min(d, Math.hypot(u.x - e.x, u.z - e.z));
            far = night * THREE.MathUtils.smoothstep(d, EY.near ?? 7, EY.far ?? 16);
            const close = 1 - THREE.MathUtils.smoothstep(d, EY.near ?? 7, EY.dimTo ?? 40);
            if ((EY.anims || ['idle', 'walk', 'run', 'graze']).includes(s.anim)) wildEyes.add(e.type, s.thing.mesh.position, s.cellWorld * (s.size || 1), ((e.dir ?? 0) % 8 + 8) % 8, night * (0.55 + 0.45 * close), (+e.id * 0.618) % 1, time);
          }
          const k = 1 + ((EY.body ?? 0.1) - 1) * far;
          s.material.uniforms.uTint.value.setRGB(s.coat[0] * k, s.coat[1] * k, s.coat[2] * k);
          gu.uOpacity.value *= 1 + ((EY.alpha ?? 0.45) - 1) * far;
          s.eyesDark = far > 0;
        }
      }
      if (e.type === 'horse' && e.coat && !s.coat) { s.coat = coatTint(e); s.material.uniforms.uTint.value.setRGB(...s.coat); }   // a caught wild horse keeps her coat (wildlife W6)
      updateAura(s, e);
      // Red Lantern: a pulsing red tint on the sprite and a real red light around him
      const lit = e.buffs?.lantern && !e.dead && !e.downed, u = s.material.uniforms;
      if (lit) {
        const k = 0.5 + 0.5 * Math.sin(time * 6);
        u.uTint.value.setRGB(1.25 + 0.15 * k, 0.78, 0.68);
        u.uSelfLight.value.setRGB(0.55 + 0.25 * k, 0.12, 0.05);
        let l = lanternLights.get(id);
        if (!l) { l = { pos: new THREE.Vector3(), radius: 7, color: new THREE.Color(1, 0.28, 0.1), fire: true, seed: Math.random() * 10 }; lanternLights.set(id, l); lights.push(l); }
        l.pos.set(s.pos.x, 1.6 + s.pos.y, s.pos.z);
      } else if (s.lanternTint) {
        u.uTint.value.setRGB(1, 1, 1);
        u.uSelfLight.value.setRGB(0.2, 0.18, 0.16);
      }
      s.lanternTint = lit;
      // hidden ninja: a very slight purple shimmer rippling over them (2026-10-20)
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
      // salute cannons (2026-11-07): lifted out of the night's mud so they read; brighter still while hovered
      if (e.cannon && !lit && !veiled) {
        const hv = id === hoverUnitId;
        u.uTint.value.setRGB(hv ? 1.35 : 1.08, hv ? 1.3 : 1.05, hv ? 1.2 : 1.0);   // 2026-11-07: the stronger lift looked washed out
        u.uSelfLight.value.setRGB(hv ? 0.18 : 0.06, hv ? 0.15 : 0.05, hv ? 0.1 : 0.04);
      }
      s.veiled = veiled;
      s.shimmer = shim;
      // sheltering in a stockade garrison (2026-11-06): not drawn, shown again when sent out
      const sheltered = !!e.garrison || !!e.aboard || !!e.stored;   // stored in a stable (sim/vehicle_garage.js): not drawn   // or riding inside the omnibus (sim/omnibus.js)
      if (sheltered || s.sheltered) {
        for (const m of [s.thing.mesh, s.shadow, s.hidden, s.ring, s.bar, s.nameplate, s.team]) if (m) m.visible = !sheltered && (m !== s.ring || selected.has(id));
        s.sheltered = sheltered;
      }
    }
    shipMarks.update(state, sprites, { colourOf: e => TEAM[teamOf(e, state.entities[followId])], enemyOf: e => teamOf(e, state.entities[followId]) === 'enemy', own: e => e.owner === state.entities[followId]?.owner }, selected, fdt);
    shoreLine?.update(shore, fdt, cameraPlace(state.entities[followId]) === 'world');
    shipFx.update(state, sprites, fdt, cameraPlace(state.entities[followId]), state.entities[followId]?.owner);   // after the sprites: a listing hull sits lower
    boardFx.update(state, sprites, fdt, cameraPlace(state.entities[followId]), state.entities[followId]?.owner);
    for (const [id, l] of lanternLights) if (!sprites.get(id)?.lanternTint) { lights.splice(lights.indexOf(l), 1); lanternLights.delete(id); }
    const hero = sprites.get(followId);
    if (state.entities[followId]) markCrewDoors(rings, state, state.entities[followId].owner);

    updateCamera(state, followId, dt, hero?.pos);

    // clan banners at owned businesses; a gold burst where one just changed hands
    for (const b of banners.update(state, time, state.entities[followId]?.owner, cameraPlace(state.entities[followId]))) if(!resumingPresentation)abilityFx.claim(...banners.spot(b));
    hqFire.update(state);
    structureFire.update(state, cameraPlace(state.entities[followId]));   // torched war structures (checkpoint 6)
    structureFire.updateSmoke(dt, cameraPlace(state.entities[followId]));   // 7c: moving smoke over ruins
    hallFx.update(state, cameraPlace(state.entities[followId]));   // war 8a: the fire or banner on a hall being taken
    campfireFx.update(state, (heroPlace === 'world' && !cityView) || worldView);   // made camps (sim/campfire.js)
    fireSmokeFx.update(dt, state, (heroPlace === 'world' && !cityView) || worldView);   // flames, sparks and smoke on every camp fire (2026-11-26)
    folkFx.update(state, (heroPlace === 'world' && !cityView) || worldView, dt);   // wandering folk's logs and fires (sim/wandering_folk.js)
    sayFx.update(dt, state);   // speech bubbles (shakedown lines, render/say_fx.js)
    hitFx.update(fdt);
    const presentationId=watchFn&&state.entities[watchedId]?.owner===state.entities[followId]?.owner?watchedId:followId;
    abilityFx.update(fdt, state, presentationId, cameraPlace(state.entities[followId]));   // the place the camera shows: the city street in Watch the city (2026-11-10)
    shakeT = Math.max(0, shakeT - dt);
    if (shakeT > 0 && video.shake) {
      const a = shakeAmp * shakeT / 0.18;
      camera.position.addScaledVector(CAM_RIGHT, (Math.random() - 0.5) * a).addScaledVector(CAM_UP, (Math.random() - 0.5) * a);
    }
    worldGround?.update(camTarget.x, camTarget.z, (heroPlace === 'world' && !cityView) || worldView, dt, state.frontier, state.world?.discovered?.[state.entities[followId]?.owner], Math.max(1, 0.35 / zoomNow));
    mark('ground');
    railTrack?.update(state.frontier, (heroPlace === 'world' && !cityView) || worldView, dt, shared.uNight.value);
    if (railBlastFx) syncRailBlast(state, (heroPlace === 'world' && !cityView) || worldView, dt);
    // a hero robbing a freight wagon: loot hops out of the wagon into his hands (2026-11-21)
    chestCashFx.steal(((heroPlace === 'world' && !cityView) || worldView) ? Object.values(state.entities).filter(e => e.robbing?.until > state.tick && e.place === 'world' && !e.dead && !e.downed && sprites.get(e.id)?.thing.mesh.visible).map(e => { const t = state.frontier?.rail?.trains?.[e.robbing.train], p = sprites.get(e.id).pos; return t?.wagonSpot ? { id: e.id, from: t.wagonSpot, to: { x: p.x, y: p.y, z: p.z } } : null; }).filter(Boolean) : [], dt);
    chestCashFx.update(dt);   // cashing a stolen chest: the loot flies into the hall
    stolenChests?.update((heroPlace === 'world' && !cityView) || worldView, state.frontier?.rail?.chests, Object.values(state.entities).filter(e => e.chest && e.place === 'world' && !e.dead && sprites.get(e.id)).map(e => { const p = sprites.get(e.id).pos; return { id: e.id, x: p.x, y: p.y, z: p.z }; }), dt, Object.values(state.frontier?.rail?.trains || {}).filter(t => t.stopped && t.wagonSpot).map(t => ({ id: t.id, x: t.wagonSpot.x, z: t.wagonSpot.z, fast: !!t.robbing, robbed: !!state.frontier.rail.links?.[t.link]?.blast?.robbed })));   // train robbery: the stolen chest carried and dropped, the guard's lantern on a stopped train
    groundItemsFx.update(((heroPlace === 'world' && !cityView) || worldView) ? 'world' : (heroPlace === 'street' || cityView) ? 'street' : null, state.groundItems?.items, dt);   // dropped bag items (render/ground_items.js)
    { const out = (heroPlace === 'world' && !cityView) || worldView;   // fishing poles (2026-11-23): the sim sets e.fishing (cast point) while a worker harvests a fish spot
      fishingFx.update(out ? Object.values(state.entities).filter(e => e.fishing && e.anim === 'idle' && e.place === 'world' && !e.dead && sprites.get(e.id)?.thing.mesh.visible).map(e => { const s = sprites.get(e.id); return { id: e.id, x: s.pos.x, y: s.pos.y, z: s.pos.z, tx: e.fishing[0], tz: e.fishing[1], order: s.thing.mesh.renderOrder }; }) : [], dt);
      fishingFx.moor(out ? worldGround?.spotsInView() || [] : []); }
    weather?.update(state, camTarget, (heroPlace === 'world' && !cityView) || worldView, dt, video.weather !== false);
    wildDropFx.update(fdt);
    bossFrame(state, fdt, (heroPlace === 'world' && !cityView) || worldView);   // boss sigils, rage, mend, dust, bleed (P4)
    relicFx?.update(fdt);
    tameFx.update(fdt, id => sprites.get(id), (heroPlace === 'world' && !cityView) || worldView, state);   // a wild horse caught: warm light passes over her and she is saddled (W6)
    wildEyes.end(video.wildlife !== false);
    crowFx?.update({ state, prev, show: (heroPlace === 'world' && !cityView) || worldView, on: video.wildlife !== false, dt: fdt, cam: { x: camTarget.x, z: camTarget.z, r: camera.right }, things: worldGround?.things(), hear: Math.min(140, Math.max(24, camera.right * 0.9)) });
    worldGround?.fadeGates(railTrack?.carSpots?.() || [], dt);   // a gatehouse a train runs through goes see-through dark
    cityStation?.update(state.frontier, (heroPlace === 'street' || cityView) && !worldView, dt, state.entities[followId]?.owner, shared.uNight.value);
    ferryShips?.update(state, (heroPlace === 'street' || cityView) && !worldView, (heroPlace === 'world' && !cityView) || worldView, dt, alpha);
    mooredBoats?.update(state, (heroPlace === 'world' && !cityView) || worldView, dt);
    mark('rail');
    updateLights(time);
    updateCutaway(hero, dt);
    updateBlueprintWalls(state, presentationId, sprites.get(presentationId)||hero, dt);
    mark('lights');
    // buildings, props and banners stand still, so only the units are re-checked each frame (render/draw_order.js)
    sorter.sort([...things, ...banners.things, ...(worldGround?.things() || []), ...campfireFx.things(), ...folkFx.things()], [...[...sprites.values()].filter(Boolean).map(s => s.thing), ...(railTrack?.things() || []), ...(cityStation?.things() || []), ...(ferryShips?.things() || []), ...(mooredBoats?.things() || []), ...(crowFx?.things() || [])]);
    for (const d of drivers.values()) if (d?.cart) d.thing.mesh.renderOrder = d.cart.renderOrder + (d.behind ? -1 : 1);   // the coachman just before or after his rickshaw
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
  const structureFire = createStructureFire({ scene });
  const hallFx = createHallChannelFx({ scene, lights, thingAt: k => worldGround?.thingAt(k) || null, artThing: p => worldGround?.artThing(p) || null, seconds: () => hallSeconds });   // war 8a: taking a hall
  const campfireFx = createCampfireFx({ scene, lights, artThing: p => worldGround?.artThing(p) || null, emberSeconds: () => units?.rules?.campfire?.emberSeconds ?? 20 });   // world variety P1
  const fireSmokeFx = createFireSmokeFx({ scene, emberSeconds: () => units?.rules?.campfire?.emberSeconds ?? 20 });
  const sayFx = createSayFx({ scene, spriteOf: id => sprites.get(id) || null });
  const folkFx = createFolkFx({ scene, lights, artThing: p => worldGround?.artThing(p) || null, emberSeconds: () => units?.rules?.campfire?.emberSeconds ?? 20 });   // world variety P2
  const hitFx = createHitFx({ scene, overlay: fxLayer, unitToScreen: (x, z, h = 0.9) => { v.set(x, h + groundY(x, z), z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; } });
  let hallChannelOf = () => null;   // main.js: the running hall channel of a war (sim/frontier/war_end.js view)
  const abilityFx = createAbilityFx({ scene, overlay: fxLayer, posOf: id => sprites.get(id)?.pos || null, spriteOf: id => sprites.get(id) || null, hallChannelOf: id => hallChannelOf(id),
    unitToScreen: (x, z, y = 0.9) => { v.set(x, y + groundY(x, z), z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; } });
  function addCasts(casts, castState, heroId = null) {
    crowFx?.casts(casts, castState);   // gunfire scatters the crows
    for (const c of casts) {
      abilityFx.cast(c);
      folkFx.cast(c);   // the hermit's brew going off
      sayFx.cast(c);   // a line of speech (sim/shakedown.js)
      if (bossFx && c.kind?.startsWith?.('boss') && (c.place || 'world') === 'world' && ((heroPlace === 'world' && !cityView) || worldView)) bossCast(c, castState);   // guarded place bosses (P4)
      if (relicFx && c.kind?.startsWith?.('relic') && ((heroPlace === 'world' && !cityView) || worldView)) {   // relics (P4)
        if (c.kind === 'relicSmoke') relicFx.smoke(c.x, c.z, { radius: c.r, seconds: c.seconds });
        else if (c.kind === 'relicHeal') relicFx.heal(() => { const p = sprites.get(c.a)?.pos; return p ? [p.x, p.z] : null; }, { seconds: c.seconds });
        else if (c.kind === 'relicConch') relicFx.conch(c.x, c.z);
        else if (c.kind === 'relicClimb') relicFx.climb(c.x, c.z, c.x1, c.z1, { seconds: c.seconds });
      }
      if (c.kind === 'folkHit') {   // a bandit's blow on the peddler: blood and the struck jolt, no number (sim/wandering_folk.js)
        const a = castState?.entities?.[c.a];
        hitFx.hit({ x: c.x, z: c.z, a: c.a, t: c.t, kill: !!c.kill }, a, false, true, true);
        if (a) { const d = Math.hypot(c.x - a.x, c.z - a.z) || 1; sprites.get(c.t)?.struck((c.x - a.x) / d, (c.z - a.z) / d, !!c.kill); }
      }
      shipFx.cast(c);   // broadsides, bow cannon, deck Gatling (ships S4)
      boardFx.cast(c, castState, sprites);   // grapple, break off, capture (ships S8)
      if (c.ryo) abilityFx.coins(c.x, c.z);   // c.ryo: an execute that paid ryo
      // crew sent onto the boss's horse (sim/mounts.js): she shies sideways, a red ring, and a cross with the reason
      if (c.kind === 'refuseMount') { const s = sprites.get(c.a); if (s) { s.lean = 1; s.leanX = 1; s.leanZ = -0.4; } hitFx.refuse(c.x, c.z, c.text || "The boss's horse"); }
      if (c.kind === 'boarded') { const s = sprites.get(c.a); if (s) s.flash = 0.7; hitFx.note(c.x, c.z, `${c.n} aboard`); }   // crew popped in (sim/omnibus.js)
      // the shakedown dynamite: a small blast of the same kind (2026-11-20); shakedownfx.js keeps its flash and ring
      if (c.kind === 'dynamiteBlast' && (c.place || 'street') === heroPlace) railBlastFx.blast(c.x, c.z, 0, { scale: 0.38, shake: false });
      if ((c.kind === 'chestCashed' || c.kind === 'hidesSold') && heroPlace === 'world') chestCashFx.cash(c);   // hides sold at a market (wildlife W5): koban coins fly into it
      if (c.kind === 'horseCaught' && heroPlace === 'world') tameFx.cast(c);
      if (c.kind === 'repairSpend' && heroPlace === 'world' && c.owner != null && c.owner === castState?.entities?.[heroId]?.owner) hitFx.spend(c.x, c.z, c.spent, c.h);   // what a repair of yours took (2026-11-24)
      if (c.kind === 'wildDrop' && heroPlace === 'world') wildDropFx.drop(c);   // the hide flies from the carcass to the hero   // 2026-11-21: the stolen loot flies into the hall
      if (c.kind === 'railBlast' && railBlastFx) { railBlastFx.blast(c.x, c.z, c.heading || 0); railShakeK = Math.max(0, 1 - Math.hypot(c.x - camTarget.x, c.z - camTarget.z) / 45); }   // train robbery: the charge goes off
      if (c.kind === 'cannonFire' && !c.tower) { shakeT = Math.max(shakeT, 0.18); shakeAmp = Math.max(shakeAmp, 0.12); }   // the salute's kick (2026-11-07)
      if (c.kind === 'assassinate') { shakeT = 0.26; shakeAmp = 0.2; freezeT = Math.max(freezeT, 0.1); }   // the vicious flash hits hard
      if (c.kind === 'shadowstep' && c.crit) { shakeT = 0.24; shakeAmp = 0.18; freezeT = Math.max(freezeT, 0.08); }   // a tiny pause so it lands hard (Shadow Step crit slash)
    }
  }
  let shakeT = 0, shakeAmp = 0, freezeT = 0;
  // train robbery (sim/frontier/rail_blast.js): the burning charge on a line and the blown gap while it is repaired
  const chestCashFx = createChestCashFx({ scene });
  const wildEyes = createWildEyesFx({ scene, cfg: wildlifeCfg?.animals?.eyes || {} });
  const wildDropFx = createWildDropFx({ scene, posOf: id => sprites.get(id)?.pos || null });
  const tameFx = createTameFx({ scene });
  // guarded place bosses (world variety P4, 2026-11-27): the painted ability effects and the sigil under each boss
  // (render/boss_fx.js, textures art/fx/boss/). Casts from sim/boss_abilities.js; the marks follow each frame.
  const bossFx = worldGround ? createBossFx({ scene }) : null;
  // relics (P4, 2026-11-28): the smoke lantern's cloud, the gourd's heal, the conch's call (render/relic_fx.js, sim/relics.js)
  const relicFx = worldGround ? createRelicFx({ scene }) : null;
  const BOSS_COL = { keg: [.95, .5, .2], slam: [.85, .62, .3], howl: [.6, .74, .95], net: [.75, .82, 1], arrowStorm: [.95, .45, .15], flicker: [.9, .3, .3], dust: [.85, .6, .3] };
  function bossCast(c, st) {
    const T = n => (n || 0) / 20, a = st?.entities?.[c.a], ap = sprites.get(c.a)?.pos;
    const kick = (t, amp) => { shakeT = Math.max(shakeT, t); shakeAmp = Math.max(shakeAmp, amp); };
    switch (c.kind) {
      case 'bossKeg': bossFx.keg(c.fx, c.fz, c.x, c.z, { fuse: T(c.ticks), radius: c.r ?? 5 }); break;
      case 'bossKegBlast': bossFx.kegBlast(c.x, c.z, c.r ?? 5); kick(.25, .18); break;
      case 'bossRear': bossFx.rear(c.x, c.z, { radius: c.r ?? 7, windup: T(c.ticks) }); break;
      case 'bossSlam': {
        bossFx.slam(c.x, c.z, c.r ?? 7); kick(.3, .22);
        for (const u of Object.values(st?.entities || {})) if (u.place === 'world' && !u.dead && !u.downed && st.clans?.[u.owner] && Math.hypot(u.x - c.x, u.z - c.z) <= (c.r ?? 7)) { const p = sprites.get(u.id)?.pos || u; bossFx.stun(p.x, p.z, 1.5); }
        break;
      }
      case 'bossHowl': { const k = (a?.boss?.scale || 1.4) / 1.4; bossFx.howl(c.x, c.z, { radius: 9, muzzle: [-.3 * k, 1.9 * k, .3 * k] }); break; }
      case 'bossAdd': bossFx.add(c.x, c.z); break;
      case 'bossNet': bossFx.net(c.fx, c.fz, c.x, c.z, { flight: T(c.ticks) || .4, root: T(c.root) || 2.5 }); break;
      case 'bossShot': bossFx.shot(ap?.x ?? c.fx, 1.45, ap?.z ?? c.fz, c.x, .95, c.z); break;
      case 'bossFireArrow': bossFx.fireArrow(c.fx, c.fz, c.x, c.z, { flight: T(c.ticks) || 1 }); break;
      case 'bossStormMark': bossFx.stormMark(c.x, c.z, { radius: c.r ?? 6, seconds: T(c.ticks) || 1, hold: 2.6 }); break;
      case 'bossStorm': bossFx.storm(c.x, c.z, { radius: c.r ?? 6, fromX: ap?.x ?? c.x - 10, fromZ: ap?.z ?? c.z - 4, arrows: Math.min(64, 12 + (c.count || 6) * 3), seconds: T(c.ticks) || 1.5 }); break;
      case 'bossFlicker': { const t = sprites.get(c.t)?.pos || st?.entities?.[c.t]; if (t) bossFx.flicker(c.fx, c.fz, t.x, t.z, { side: Math.random() < .5 ? 1 : -1 }); kick(.12, .1); break; }
      case 'bossRally': bossFx.rally(c.x, c.z, { radius: 6 }); break;
      case 'bossDust': bossFx.dust(c.x, c.z, { radius: c.r ?? 8, seconds: T(c.ticks) || 5 }); break;
    }
  }
  function bossFrame(state, dt, show) {
    if (!bossFx) return;
    if (show) for (const e of Object.values(state.entities)) {
      if (e.place !== 'world' || e.dead || e.downed) continue;
      const s = sprites.get(e.id); if (!s?.thing?.mesh?.visible) continue;
      const p = s.pos, b = e.buffs, on = k => (b?.[k]?.until ?? -1) > state.tick;
      if (e.boss) bossFx.boss(e.id, p.x, p.z, { color: BOSS_COL[e.boss.ability?.kind] || (e.boss.bleed ? BOSS_COL.dust : [.85, .45, .2]), size: (e.boss.scale || 1.4) / 1.4 });
      if (!b) continue;
      if (on('bossRage')) bossFx.rage(e.id, p.x, p.z, 1, e.boss ? { head: [.25, 1.9, -.25], size: e.boss.scale || 1.4 } : { head: [.35, .75, -.35], eyes: false });
      if (on('bossMend')) bossFx.mend(e.id, p.x, p.z);
      if (on('dusted')) bossFx.blind(e.id, p.x, p.z);
      if (on('bleed')) bossFx.bleed(e.id, p.x, p.z);
    }
    bossFx.update(dt);
  }
  const fishingFx = createFishingFx({ scene });   // workers on fish spots cast lines; fish spot boats moored (2026-11-23)
  const railBlastFx = createRailBlastFx({ scene }), railShown = new Map(), stolenChests = worldGround ? createStolenChests({ scene }) : null, groundItemsFx = createGroundItemsFx({ scene });   // fx id -> 'charge' | 'crater'
  let railShakeK = 0;
  function syncRailBlast(state, show, dt) {
    const want = new Map(), tick = state.tick ?? 0;
    for (const l of show ? Object.values(state.frontier?.rail?.links || {}) : []) {
      if (!l.points?.length) continue;
      if (l.charge) want.set(`charge:${l.id}:${l.charge.at}`, { kind: 'charge', l, c: l.charge });
      if (l.blast && l.closed) want.set(`crater:${l.id}:${l.blast.at}`, { kind: 'crater', l, c: l.blast });
    }
    for (const [id, kind] of railShown) if (!want.has(id)) { if (kind === 'charge') railBlastFx.cancel(id); else railBlastFx.clearCrater(id); railShown.delete(id); }
    for (const [id, w] of want) {
      if (railShown.has(id)) continue;
      const p = pointAt(w.l, w.c.d);
      if (w.kind === 'charge') railBlastFx.charge(id, p.x + Math.cos(p.heading) * .7, p.z - Math.sin(p.heading) * .7, p.heading, Math.max(.1, (w.c.fuse ?? 8) - (tick - w.c.at) / 20));   // beside the rail
      else railBlastFx.crater(id, p.x, p.z, p.heading);
      railShown.set(id, w.kind);
    }
    railBlastFx.update(dt);
    if (video.shake && railShakeK > 0) { const s = railBlastFx.shake(); camera.position.addScaledVector(CAM_RIGHT, s.x * railShakeK).addScaledVector(CAM_UP, s.y * railShakeK); }
  }
  // health gained since the last tick: real heals sparkle at once, regeneration
  // sparkles each time it adds up to 4% of a unit's health
  let healTick = -1;
  const trickle = new Map();
  function showHeals(state, prev) {
    for (const e of Object.values(state.entities)) {
      const p = prev.entities[e.id], s = sprites.get(e.id);
      if (!p || !s || !e.maxHp || e.dead || e.downed || p.downed || e.hp <= p.hp) continue;
      const gain = (e.hp - p.hp) / e.maxHp, steal = !!e.buffs?.lantern && gain > 0.002;   // more than regen gives in a tick
      // a real heal: Rally's ticks rain green (2026-10-19); lifesteal keeps its red-gold dazzle (the rain
      // was lost in the lanterns' glow, ), the clinic's heal its green one
      if (gain >= 0.015 || steal) { if ((e.buffs?.rally || e.buffs?.shroud) && !steal) { abilityFx.rain(s.pos.x, s.pos.z); hitFx.heal(s.pos.x, s.pos.z, Math.round(e.hp - p.hp)); } else abilityFx.heal(s.pos.x, s.pos.z, true, steal); trickle.set(e.id, 0); continue; }
      const t = (trickle.get(e.id) || 0) + gain;
      if (t >= 0.04) { abilityFx.heal(s.pos.x, s.pos.z, false, false); trickle.set(e.id, 0); } else trickle.set(e.id, t);
    }
  }
  const sorter = createSorter();   // draw order of all sprites, kept between frames
  const lanternLights = new Map();   // unit id -> the light that follows it during Red Lantern
  function addHits(hits, state, followId) {
    crowFx?.hits(hits, state);   // crows circle over fights and come down by the dead
    const me = state.entities[followId];
    for (const h of hits) {
      const a = state.entities[h.a], t = state.entities[h.t];
      if (h.crit) sprites.get(h.a)?.shadowBlade?.critical();
      const dry = t && (t.cart || /cannon|gatling|omnibus|rickshaw$|ox_cart|train_|^ship_/.test(t.model || t.type || ''));   // no blood from carts, guns and vehicles
      hitFx.hit(h, a, t?.owner === me?.owner, me?.place === 'world' && h.a !== followId && h.t !== followId, !dry);   // frontier: numbers only for hits by or on your hero (2026-11-28; none for others since 2026-11-12)
      const s = sprites.get(h.t);
      if (s && a) { const d = Math.hypot(h.x - a.x, h.z - a.z) || 1; s.struck((h.x - a.x) / d, (h.z - a.z) / d, h.crit || h.kill); }
      if (a && t) sprites.get(h.a)?.gearFx?.hit(t.x - a.x, t.z - a.z, h.crit);   // a claw charm's rakes on the one struck (render/gear_fx.js)
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
  // followed crew (double-click a name or group header): their point steps once per 50 ms tick, so the camera
  // eases between the last two ticks like the drawn sprites do; without this the crew shook on screen
  let watchPrev = null, watchCur = null, watchTick = -1;
  const cameraPoint = new THREE.Vector3();
  // Also runs with map presentation active: update only camera math, never the scene or GPU.
  function updateCamera(state, followId, dt, position = null) {
    const h = state.entities[followId]; if (!h) return;
    const sample = { id: followId, place: h.place, x: h.x, z: h.z };
    const jumped = cameraDiscontinuity(previousCameraHero, sample);
    previousCameraHero = sample;
    cameraPoint.set(h.x, groundY(h.x, h.z), h.z);   // on a castle terrace the view centres on the raised ground (Z4h)
    // Don't interpolate through a whole-island test travel.
    if (position && Math.hypot(position.x - h.x, position.z - h.z) <= 60) cameraPoint.copy(position);
    // aboard a train (2026-11-07): the camera follows the drawn engine; boarding drops a pan or a watch,
    // panning afterwards keeps the camera there until Home
    const ride = typeof h.aboard === 'string' && h.aboard.startsWith('rail:') ? h.aboard.slice(5) : null, eng = ride && railTrack?.focus(ride);
    if (ride !== lastRide) { if (ride) { freeCam = null; farCam = false; watchFn = null; jumpFrom = null; roomView = null; } lastRide = ride; }
    if (eng && Math.hypot(eng.x - h.x, eng.z - h.z) <= 60) cameraPoint.set(eng.x, 0, eng.z);
    // at sea (2026-11-20: very jerky): the camera sits on the drawn ship itself, no lag behind it
    const sea = h.shipRide && !freeCam && !watchFn ? seaSpot(state, h.shipRide, frameAlpha) : null;
    if (sea) cameraPoint.set(sea.x, 0, sea.z);
    if (jumped) { freeCam = null; farCam = false; watchFn = null; jumpFrom = null; roomView = null; camTarget.copy(cameraPoint); }
    if (shipPan) {   // ships S6: a moment on the wreck, then a pan to the shore
      const k = (shipPan.k += dt), m = Math.max(0, Math.min(1, (k - 1.1) / 0.9)), e = m * m * (3 - 2 * m);
      if (k > 2.2) { shipPan = null; freeCam = null; farCam = false; }
      else { farCam = true; (freeCam ||= new THREE.Vector3()).set(shipPan.x + (shipPan.tx - shipPan.x) * e, cameraPoint.y, shipPan.z + (shipPan.tz - shipPan.z) * e); }
    }
    const w = watchFn && watchFn();
    if (watchFn && !w) watchFn = null;
    watchedPlace = w?.place ?? null; watchedId = w?.id ?? null;
    if (w) roomView = indoorPlace(w.place) && w.place !== h.place ? w.place : null;   // followed crew went in or came out: the view goes with them
    else if (roomView && (h.place !== heroPlace || h.place === roomView)) roomView = null;
    if (w) {
      if (state.tick !== watchTick) { watchPrev = watchCur; watchTick = state.tick; }
      watchCur = { x: w.x, z: w.z, place: w.place };
      const from = watchPrev && watchPrev.place === w.place && Math.hypot(watchPrev.x - w.x, watchPrev.z - w.z) < 6 ? watchPrev : watchCur;
      const wx = from.x + (w.x - from.x) * frameAlpha, wz = from.z + (w.z - from.z) * frameAlpha;
      farCam = true; jumpFrom = null; (freeCam ||= new THREE.Vector3()).set(wx, cameraPoint.y, wz);
    }
    else if (farCam && !roomView && (h.place !== heroPlace || (jumpFrom && jumpFrom.distanceTo(cameraPoint) > 0.3))) { farCam = false; freeCam = null; }
    if (!w) watchPrev = watchCur = null;
    heroPlace = h.place;
    if (!camReady || camTarget.distanceTo(cameraPoint) > (farCam || freeCam ? Infinity : 20)) { camTarget.copy(cameraPoint); camReady = true; freeCam = null; }
    camTarget.lerp(freeCam || cameraPoint, 1 - Math.exp(-dt * (freeCam ? 14 : 6)));
    if (shipPan && freeCam) camTarget.copy(freeCam);
    if (sea) camTarget.copy(cameraPoint);
    (heroPos ||= new THREE.Vector3()).copy(cameraPoint);
    const place = cameraPlace(h);
    const wantZoom = !['street', 'world'].includes(place) ? INDOOR_ZOOM : THREE.MathUtils.clamp(zoom, minZoom(place), 1.0);
    if (Math.abs(wantZoom - zoomNow) > 1e-3) { zoomNow += (wantZoom - zoomNow) * (1 - Math.exp(-dt * 5)); resize(); }
    const ppx = PPU * zoomNow * renderer.getPixelRatio(), s = toScreen(camTarget);
    // Sprite pages: half-size pages when a page pixel is drawn smaller than about half a screen pixel, and unit types nobody has used for 3 minutes are unloaded.
    const spriteNow = performance.now() / 1000;
    setSpriteScale(ppx / SPRITE_TEXELS, spriteNow);
    if (spriteNow - spriteSweepAt > 5) { spriteSweepAt = spriteNow; sweepSheets(spriteNow); }
    camera.position.copy(camTarget)
      .addScaledVector(CAM_RIGHT, Math.round(s.x * ppx) / ppx - s.x)
      .addScaledVector(CAM_UP, Math.round(s.y * ppx) / ppx - s.y)
      .addScaledVector(VIEW_DIR, 200);
    camera.updateMatrixWorld();
  }
  let resumingPresentation=false;
  return {
    render, renderer, scene, addHits, addCasts, updateCamera,
    setHallTakeable: fn => hallFx.setTakeable(fn),   // the capture moment: halls the player's hero can take pulse gold
    setTowns: list => {
      structureFire.setRuins(list.filter(p => p.ruinSmoke).map(p => ({ x: p.x, z: p.z, w: Math.min(8, (p.maxFootprint || 11) * 0.4) })));   // 7c: moving smoke over ruins
      worldGround?.setTowns(list);
      // Space rings at the front door (2026-11-07): the middle of the art's front (+z, screen down-left) edge, as drawn
      const spots = new Map();
      if (cutouts) for (const p of list) if (p.spaceDoor) {
        const piece = placePiece({ name: p.art, x: p.x, z: p.z, flip: !!p.flip }, catalog, cutouts); if (!piece) continue;
        const fit = p.maxFootprint ? Math.min(1, p.maxFootprint / (2 * Math.max(piece.fa, piece.fb))) : 1;
        spots.set(p.spaceDoor, [p.x, p.z + piece.fb * 0.9 * fit + 1.6]);
      }
      banners.setDoors(spots);
    },
    graphicsStats:()=>({spritePages:spriteMemory(),drawMs:frameDrawMs,calls:renderer.info.render.calls,sprites:sprites.size,workers:frameWorkers,
      geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs?.length || 0,
      width:renderer.domElement.width,height:renderer.domElement.height,pixelRatio:renderer.getPixelRatio(),parts:{...frameParts},peaks:Object.fromEntries(Object.entries(framePeaks).map(([k,p])=>[k,p.v]))}),
    setPresentationActive(active){
      fxLayer.hidden=!active;
      resumingPresentation=active;
      if(!active){hitFx.update(100);abilityFx.clear();updateFlashes(100);shakeT=freezeT=0;trickle.clear();}
    },
    addDodges(dodges) { for (const d of dodges) { hitFx.dodge(d); sprites.get(d.t)?.gearFx?.dodge(); } },   // a fang charm's rips (render/gear_fx.js)
    // arrow-key panning (right, up from -1 to 1 on screen); the camera stays there until snapBack
    pan(right, up, dt) {
      if (!right && !up) return;
      watchFn = null;
      freeCam ||= camTarget.clone();
      const k = PAN_SPEED * dt / zoomNow;
      freeCam.addScaledVector(CAM_RIGHT, right * k).addScaledVector(GROUND_UP, up * k);
      inMap(freeCam);
    },
    panTo(x, z, tx, tz) { shipPan = { k: 0, x, z, tx, tz }; watchFn = null; },   // ships S6: the hero's ship sank
    snapBack() { shipPan = null; freeCam = null; farCam = false; watchFn = null; roomView = null; if (cityView) { cityView = false; const f = cityExit; cityExit = null; f?.(); } if (worldView) { worldView = false; const f = worldExit; worldExit = null; f?.(); } },
    // Watch a war (war 8d-4): show the island at (x, z) wherever the hero is; onExit runs when Home / snapBack ends it
    setWarWatch(on, x = 0, z = 0, onExit = null) {
      if (on && cityView) { cityView = false; const f = cityExit; cityExit = null; f?.(); }
      worldView = !!on; worldExit = on ? onExit : null; watchFn = null; roomView = null;
      if (on) { farCam = true; jumpFrom = null; freeCam = new THREE.Vector3(x, heroPos?.y ?? 0, z); }
      else { freeCam = null; farCam = false; }
    },
    isWarWatch: () => worldView,
    // Watch the city: show the capital street from the island, camera at (x, z); onExit runs when Home / snapBack ends it
    setCityWatch(on, x = 0, z = 0, onExit = null) {
      if (on && worldView) { worldView = false; const f = worldExit; worldExit = null; f?.(); }
      cityView = !!on; cityExit = on ? onExit : null; watchFn = null; roomView = null;
      if (on) { farCam = true; jumpFrom = null; freeCam = new THREE.Vector3(x, heroPos?.y ?? 0, z); inMap(freeCam); }
      else { freeCam = null; farCam = false; }
    },
    isCityWatch: () => cityView,
    // keep the camera on fn() = { x, z } every frame (null ends it); pans, map clicks and Home stop it
    watch(fn) { watchFn = fn;watchedPlace=fn?.()?.place??null; },
    // look at a ground point (minimap click); stays there until snapBack, like panning
    // interior view: the room the camera is in while the hero is elsewhere (null on the street), and the way back out
    roomView: () => roomView || (watchFn && indoorPlace(watchedPlace) && watchedPlace !== heroPlace ? watchedPlace : null),
    leaveRoom(x, z) { watchFn = null; roomView = null; farCam = true; jumpFrom = heroPos?.clone() ?? null; freeCam = new THREE.Vector3(x, heroPos?.y ?? 0, z); },
    lookAt(x, z) {
      farCam = false; watchFn = null; roomView = null;
      freeCam = new THREE.Vector3(x, heroPos?.y ?? 0, z);
      inMap(freeCam);
    },
    // jump to any point however far from the hero (double-click a crew name); stays there until the hero moves, uses a door or Home
    jumpTo(x, z) { watchFn = null; roomView = null; farCam = true; jumpFrom = heroPos?.clone() ?? null; freeCam = new THREE.Vector3(x, heroPos?.y ?? 0, z); },
    isPanned: () => !!freeCam,
    cameraXZ: () => ({ x: camTarget.x, z: camTarget.z }),   // where the camera looks (the island minimap pages with it)
    flashBuilding(i) { if (i !== null && i !== undefined) flashes.set(i, 0); },
    // selection rings under these unit ids (selection is screen-only, not game state)
    setSelected(ids) { selected = new Set(ids); for (const [id, s] of sprites) if (s) s.ring.visible = selected.has(id); },
    setNameplates(on) { nameplatesOn = !!on; },
    // F2 screenshot mode: hide unit bars, rings and nameplates
    setUnitOverlays(on) { if (on) camera.layers.enable(UI_LAYER); else camera.layers.disable(UI_LAYER); },
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
      // hear: how far sounds carry from the middle of the view, so what is on screen is heard when zoomed out too (2026-11-15)
      return { x: camTarget.x, z: camTarget.z, place: cameraPlace(h), hear: Math.min(140, Math.max(24, camera.right * 0.9)), hero: { x: h.x, z: h.z, place: h.place }, right: [CAM_RIGHT.x, CAM_RIGHT.z] };
    },
    // page pixel -> ground point { x, z }
    screenToGround(px, py) {
      camera.updateMatrixWorld();
      raycaster.setFromCamera({ x: px / innerWidth * 2 - 1, y: 1 - py / innerHeight * 2 }, camera);
      // castle terraces (Z4h): the first raised ground the view ray meets (src/castle_height.js), stepping down from the
      // highest terrace, so a click on a cliff top lands on top, not on the ground hidden behind it
      const ray = raycaster.ray, top = maxGroundY();
      if (top > 0 && Math.abs(ray.direction.y) > 1e-6) {
        const at = h => { const t = (h - ray.origin.y) / ray.direction.y; return [ray.origin.x + ray.direction.x * t, ray.origin.z + ray.direction.z * t]; };
        const steps = Math.ceil(top / 0.25);
        let above = top + 0.01;
        for (let k = 0; k <= steps; k++) {
          const h = top * (1 - k / steps), [x, z] = at(h);
          if (groundY(x, z) < h - 1e-4) { above = h; continue; }
          let a = above, b = h;   // a: ray above the ground, b: at or under it
          for (let i = 0; i < 12; i++) { const m = (a + b) / 2, [mx, mz] = at(m); if (groundY(mx, mz) >= m) b = m; else a = m; }
          const [bx, bz] = at(b);
          return { x: bx, z: bz };
        }
      }
      return ray.intersectPlane(groundPlane, v) ? { x: v.x, z: v.z } : null;
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
      v.set(x, y + groundY(x, z), z).project(camera);   // y above the ground there (castle terraces, src/castle_height.js)
      return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
    },
    // where a lantern prop's lights actually glow, as page pixels [{ x, y }] (for hovering it to snuff, 2026-10-21)
    lampScreen(prop) {
      return (propLights.get(prop) || []).map(l => { v.set(l.pos.x, l.pos.y, l.pos.z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
    },
    isNight: () => nightTarget === 1,
    wildSounds: () => crowFx?.sounds() || [],   // crow caws and wingbeats since the last frame: [clip, volume, pitch] (render/sound.js wild)
    toggleNight() { nightTarget = nightTarget ? 0 : 1; return nightTarget === 1; },
    toggleDebug() { lines.visible = !lines.visible; },
    setVideo(v) { video = { ...video, ...v }; resize(); },
    setHallChannels(f) { hallChannelOf = f || (() => null); },
    // 1.0 shows the sprites at their real size; closer than that just blurs them
    zoomBy(f) { zoom = THREE.MathUtils.clamp(zoom * f, minZoom(cameraPlace({ place: heroPlace })), 1.0); resize(); },
  };
}
