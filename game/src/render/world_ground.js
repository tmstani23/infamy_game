// The island on screen (frontier W3.4): ground and props of the chunks around the camera, drawn
// only while the followed hero is out on the island (e.place === 'world'). Reads world.json, never
// the game state, and never changes anything in the sim.
// - Ground: one plane per chunk, painted with the city's ground textures by terrain (render/shading.js
//   groundMaterial), blended softly across cell and chunk edges; corridors show as dirt trails.
// - Props: the same props the sim walks round (sim/chunk_gen.js, same seed), as painted sprites, but
//   only those near the camera get a sprite, so cost follows the view, not the island.
// - Chunks build one per frame, nearest first, with a prefetch ahead of the camera, and the least
//   recently used are dropped past a small cache (src/world_stream.js decides, Node-tested).
import * as THREE from 'three';
import { buildChunk, cityOnIsland } from '../sim/chunk_gen.js';
import {islandBiome} from '../sim/island_art.js';
import {spriteMaterial} from './shading.js';
import { terrainAt } from '../sim/world_data.js';
import { placePiece, ELEVATION } from '../sim/geometry.js';
import { groundMaterial } from './shading.js';
import { loadTex, cutoutThing, loadGroundTextures, GROUND_CHANNELS } from './scenery.js';
import { chunksToDraw, planChunks, propsInView } from '../world_stream.js';
import { createPaint } from '../world_paint.js';
import { createIslandPainter } from './island_ground.js';
import { createCoastlineRenderer } from './coastline.js';
import { createWaterEffects } from './water_effects.js';
import { campPropsInChunk, findPropsInChunk, crossingPropsInChunk, nodePropsInChunk, sitePropsInChunk } from '../world_features.js';
import { makeSpotIndex } from '../sim/resource_spots.js';
import { spotPiecesToProps, visibleSpots, coveredBySpot } from '../resource_spot_props.js';
import { isDiscovered } from '../world_map.js';
import { createSpotGlow } from './spot_glow.js';

// world prop kind -> art in data/art.json and a size factor (placeholders until the forest and
// mountain art is cut in, W3.4b)
const ART = {
  cedar: ['pine_tree', 0.76], pine: ['pine_tree', 1],   // W3.10 sizes: pine 5.5 units wide, cedar 4.2
  twisted_pine: ['dead_tree', 1], bush: ['bush', 1], ferns: ['bush', 0.55],
  stump: ['rotten_log', 0.5], fallen_log: ['rotten_log', 1], small_rocks: ['boulder', 0.4], boulder: ['boulder', 1],
  bamboo: ['bamboo', 1], cherry: ['cherry_tree', 1], mountain: ['boulder', 1], campfire: ['campfire', 1],
};
// terrain code -> ground weights (channels in render/scenery.js; what is left over is dirt)
const GROUND = {
  p: { grass: 1 }, f: { grass: 0.45, mud: 0.15 }, h: { dry_grass: 0.6, gravel: 0.2 }, m: { gravel: 0.8 },
  w: { water: 1 }, r: { water: 1 }, d: { sand: 0.5, dry_grass: 0.4 }, n: { sand: 0.7, gravel: 0.2 },
  b: { grass: 0.7 }, k: { mud: 0.7, water: 0.15 },
};
const SPLAT_RES = 0.5;   // weight-map pixels per world unit
const TRAIL = 3;         // half width of a corridor trail

export function createWorldGround({ scene, renderer, world, cfg, catalog, cutouts, bounds, gate, resourceSpots, spotConfig }) {
  const S = cfg.chunk, seed = world.seed ?? 1, city = cityOnIsland(world, bounds);
  const cols = Math.ceil(world.size.w / S), rows = Math.ceil(world.size.h / S);
  const loaded = new Map();     // 'cx,cz' -> { gen, mesh, used }
  const sprites = new Map();    // prop key -> Thing
  const textures = new Map();   // art file -> texture (or a pending promise)
  const spotIndex = resourceSpots ? makeSpotIndex(resourceSpots) : null;
  let spotRevision = '', snapshot = null, spotAppliedAt = -Infinity, spotKey = '', lastDiscovered = undefined;
  const glowCfg = spotConfig?.glow, glow = glowCfg ? createSpotGlow({ scene, cfg: glowCfg }) : null, glowItems = [];
  const sigs = new WeakMap(), sigOf = p => { let v = sigs.get(p); if (v === undefined) sigs.set(p, v = JSON.stringify(p)); return v; };
  const coastline = createCoastlineRenderer({ world, cfg, renderer });
  const waterEffects = createWaterEffects({ world, cfg, renderer, scene });
  const reflectionFrustum = new THREE.Frustum(), reflectionProjection = new THREE.Matrix4(), waterBox = new THREE.Box3();
  let towns = [];   // founded towns' things (src/town_props.js), set by setTowns
  let painter = null, groundTex = null, frame = 0, last = null, list = [], shown = false, propAt = null;
  loadGroundTextures(renderer).then(async t => {
    if(cfg.islandArt?.enabled){const tops=await Promise.all(['forest','snow','dry'].map(b=>loadTex(`art/ground/top_${b}.png`)));tops.forEach(tex=>{tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=renderer.capabilities.getMaxAnisotropy();});t={...t,tTopForest:tops[0],tTopSnow:tops[1],tTopDry:tops[2]};}
    if (cfg.paint?.enabled) painter = createIslandPainter({ world, cfg, renderer, groundTex: t, waterEffects });
    groundTex=t;
  }).catch(e=>console.error('Island ground textures:',e));
  // W3.10: the walled city seen from the island. Its box is a walk blocker (sim/chunk_gen.js), so a line of
  // stone wall pieces marks its edges, open at the gate and left out over water (data: world_paint.json cityWall).
  const CW = cfg.paint?.cityWall, wall = [];
  if (CW && gate) {
    const o = CW.out, add = (x, z, flip) => { if (terrainAt(world, x, z) !== 'w' && Math.hypot(x - gate.x, z - gate.z) > CW.gap) wall.push({ art: CW.art, x, z, flip }); };
    for (let x = city.minX + CW.step / 2; x < city.maxX; x += CW.step) { add(x, city.minZ - o, false); add(x, city.maxZ + o, false); }
    for (let z = city.minZ + CW.step / 2; z < city.maxZ; z += CW.step) { add(city.minX - o, z, true); add(city.maxX + o, z, true); }
  }
  const segs = [];
  for (const c of world.corridors || []) for (let k = 1; k < c.points.length; k++) segs.push([c.points[k - 1], c.points[k]]);

  function weightsAt(x, z) {
    const w = Object.fromEntries(GROUND_CHANNELS.map(c => [c, 0]));
    // a soft blend: the average of nine samples around the point
    for (const dx of [-9, 0, 9]) for (const dz of [-9, 0, 9]) for (const [c, v] of Object.entries(GROUND[terrainAt(world, x + dx, z + dz)] || {})) w[c] += v / 9;
    return w;
  }
  function groundMesh(gen) {
    if (painter) return painter.mesh(gen);   // W3.10 painted ground (render/island_ground.js)
    const n = Math.round(S * SPLAT_RES), A = new Uint8Array(n * n * 4), B = new Uint8Array(n * n * 4), M = new Uint8Array(n * n * 4);
    const near = segs.filter(([a, b]) => Math.max(a[0], b[0]) > gen.x0 - 10 && Math.min(a[0], b[0]) < gen.x0 + S + 10 && Math.max(a[1], b[1]) > gen.z0 - 10 && Math.min(a[1], b[1]) < gen.z0 + S + 10);
    const tc=world.terrain.cell,topBiomes=gen.cells.map((row,j)=>[...row].map((code,i)=>code==='m'?['forest','snow','dry'].indexOf(islandBiome(world,gen.x0+(i+.5)*tc,gen.z0+(j+.5)*tc)):-1));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = gen.x0 + (i + 0.5) / SPLAT_RES, z = gen.z0 + (j + 0.5) / SPLAT_RES;
      const w = weightsAt(x, z);
      const top=topBiomes[Math.floor((z-gen.z0)/tc)]?.[Math.floor((x-gen.x0)/tc)];
      if(cfg.islandArt?.enabled&&top>=0)M[(j*n+i)*4+top]=255;
      // corridors: a dirt trail fading out at its edge (not over water)
      let trail = 0;
      for (const [a, b] of near) {
        const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l)) : 0;
        trail = Math.max(trail, 1 - Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) / TRAIL);
      }
      const keep = w.water > 0.5 ? 1 : 1 - Math.max(0, trail) * 0.85;
      const k = (j * n + i) * 4;
      GROUND_CHANNELS.forEach((c, ch) => { (ch < 4 ? A : B)[k + ch % 4] = Math.round(Math.min(1, w[c] * keep) * 255); });
    }
    const tex = d => { const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(S, S), groundMaterial(groundTex, tex(A), tex(B), [gen.x0, gen.z0, S, S], [5.6, 3.6]));
    if(cfg.islandArt?.enabled){
      const mat=mesh.material;mat.uniforms.uIslandTop={value:tex(M)};mat.uniforms.uTopTile={value:cfg.islandArt.topTile};
      mat.fragmentShader=mat.fragmentShader.replace('varying vec3 vWorld;', 'uniform sampler2D uIslandTop,tTopForest,tTopSnow,tTopDry; uniform float uTopTile; varying vec3 vWorld;').replace('  vec3 g = grade(col', '  vec3 top = texture2D(uIslandTop,(p-uBounds.xy)/uBounds.zw).rgb; col = col*(1.0-min(1.0,top.r+top.g+top.b)) + tex(tTopForest,p/uTopTile)*top.r + tex(tTopSnow,p/uTopTile)*top.g + tex(tTopDry,p/uTopTile)*top.b;\n  vec3 g = grade(col');
    }
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(gen.x0 + S / 2, 0, gen.z0 + S / 2);
    mesh.renderOrder = -1;   // under the city's own ground where they overlap
    mesh.frustumCulled = false;
    return mesh;
  }
  function dropChunk(key) {
    const c = loaded.get(key);
    if (!c) return;
    scene.remove(c.mesh);
    if (c.coastMesh) { scene.remove(c.coastMesh); coastline.dispose(c.coastMesh); }
    c.mesh.geometry.dispose();
    c.mesh.material.uniforms.uSplatA.value.dispose(); c.mesh.material.uniforms.uSplatB.value.dispose();
    c.mesh.material.uniforms.uIslandTop?.value.dispose(); c.mesh.material.uniforms.uOver?.value.dispose();
    c.mesh.material.uniforms.uSplatC?.value.dispose(); c.mesh.material.uniforms.uSplatD?.value.dispose();
    c.mesh.material.dispose();
    loaded.delete(key);
  }

  function textureFor(file) {
    const t = textures.get(file);
    if (t && !(t instanceof Promise)) return t;
    if (!t) textures.set(file, loadTex(file).then(x => { x.anisotropy = renderer.capabilities.getMaxAnisotropy(); textures.set(file, x); }).catch(() => textures.set(file, null)));
    return null;
  }
  function makeThing(p) {
    if (p.dirt) {   // E5: an unbuilt project is a flat patch of trodden dirt (island ground texture, lit like the ground)
      const tex = textureFor(p.texture || 'art/ground/island/dirt_trail.jpg');
      if (!tex) return undefined;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.width, p.height), spriteMaterial(tex));
      if (p.tile || p.cornerRadius) {
        if (p.tile && tex.wrapS !== THREE.MirroredRepeatWrapping) {
          tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping; tex.needsUpdate = true;
        }
        const mat = mesh.material;
        Object.assign(mat.uniforms, {
          uGroundTile: { value: p.tile }, uGroundSize: { value: new THREE.Vector2(p.width, p.height) },
          uGroundEdges: { value: new THREE.Vector4(...(p.edges || [0, 0, 0, 0])) }, uGroundFade: { value: p.edgeFade || 0.01 },
          uCornerRadius:{value:p.cornerRadius || 0},uCornerEdges:{value:new THREE.Vector4(...(p.edges || [1,1,1,1]))}
        });
        mat.uniforms.uGroundTile.value ||= 1;
        mat.fragmentShader = mat.fragmentShader.replace('varying vec2 vUv;',
          'uniform float uGroundTile, uGroundFade, uCornerRadius; uniform vec2 uGroundSize; uniform vec4 uGroundEdges,uCornerEdges; varying vec2 vUv;')
          .replace('vec4 t = spriteTex(vUv);', `vec4 t = ${p.tile?'texture2D(uMap, vWorld.xz / uGroundTile)':'spriteTex(vUv)'};
            vec4 distanceToEdge = vec4(vUv.x, 1.0-vUv.x, 1.0-vUv.y, vUv.y) * uGroundSize.xxyy;
            float roughness = 0.15 * sin(vWorld.x * 3.1 + sin(vWorld.z * 2.7));
            vec4 fade = mix(vec4(1.0), smoothstep(vec4(0.0), vec4(uGroundFade), distanceToEdge + roughness), uGroundEdges);
            float radius=uCornerRadius*(vUv.x<0.5?uCornerEdges.x:uCornerEdges.y)*(vUv.y>0.5?uCornerEdges.z:uCornerEdges.w);
            vec2 q=abs((vUv-0.5)*uGroundSize)-uGroundSize*0.5+radius;
            float rounded=length(max(q,vec2(0.0)))+min(max(q.x,q.y),0.0)-radius;
            t.a *= fade.x * fade.y * fade.z * fade.w * (1.0-smoothstep(0.0,0.15,rounded));`)
          .replace('grade(t.rgb, vWorld, true, uSelfLight)', 'grade(t.rgb, vWorld, false, uSelfLight)');
      }
      if (p.opacity !== undefined) mesh.material.uniforms.uOpacity.value = p.opacity;
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(p.x, 0.02, p.z);
      mesh.renderOrder = p.key?.includes(':crop:') ? -0.4 : p.key?.includes(':road') || p.key?.endsWith(':field') ? -0.42 : -0.45;
      mesh.material.uniforms.uFogAt.value.set(p.x, p.z, 0, 1);
      if (p.tint) mesh.material.uniforms.uTint.value.set(p.tint);
      mesh.position.y = p.key?.includes(':crop:') ? 0.026 : p.key?.includes(':road') || p.key?.endsWith(':field') ? 0.024 : 0.02;
      return { mesh, extras: [], lights: [], decal: true };
    }
    const [name, f] = p.art ? [p.art, 1] : ART[p.kind] || (catalog.items[p.kind] ? [p.kind, 1] : []);
    if (!name) return null;
    if(p.decal){
      const tex=textureFor(`art/props/${name}.png`);if(!tex)return undefined;
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(p.width,p.height),spriteMaterial(tex));mesh.rotation.x=-Math.PI/2;mesh.rotation.z=-(p.angle||0);mesh.position.set(p.x,.015,p.z);mesh.renderOrder=-.5;
      mesh.material.uniforms.uFogAt.value.set(p.x,p.z,0,1);
      return {mesh,extras:[],lights:[],decal:true};
    }
    const piece = placePiece({ name, x: p.x, z: p.z, flip: p.art ? !!p.flip : !cfg.biomeProps?.noMirror?.kinds?.includes(p.kind) && Math.floor(p.x * 7 + p.z * 3) % 2 === 0 }, catalog, cutouts);
    if (!piece) return null;
    let fenceWidth=1;
    if(p.fenceHeading) {
      let [dx,dz]=p.fenceHeading;const length=Math.hypot(dx,dz);
      if(dx-dz<0){dx=-dx;dz=-dz;}
      // Reproject the existing fence's ground edge; its posts remain upright.
      piece.shear=Math.sin(ELEVATION)*(1-(dx+dz)/length);
      fenceWidth=Math.max(p.fenceMinWidth || 0,(dx-dz)/length);
    }
    const tex = textureFor(piece.item.file);
    if (!tex) return undefined;   // still loading: try next pass
    const fit = p.maxFootprint ? Math.min(1, p.maxFootprint / (2 * Math.max(piece.fa, piece.fb))) : 1;
    const s = (p.s || 1) * f * (cfg.biomeProps?.visualScaleByKind?.[p.art || p.kind] ?? 1) * fit;
    if (s !== 1) {   // scale the art and its footprint about the prop's spot
      piece.k *= s;
      const sc = r => ({ minX: p.x + (r.minX - p.x) * s, maxX: p.x + (r.maxX - p.x) * s, minZ: p.z + (r.minZ - p.z) * s, maxZ: p.z + (r.maxZ - p.z) * s });
      piece.foot = sc(piece.foot);
    }
    const thing = cutoutThing(piece, tex);
    if(p.fenceHeading)thing.mesh.scale.x*=fenceWidth;
    if (p.lightRadius) for (const light of thing.lights) light.radius = p.lightRadius;
    if (p.tint) thing.mesh.material.uniforms.uTint.value.set(p.tint);
    if (p.noLights) { for (const e of thing.extras) e.material.dispose(); thing.extras = []; thing.lights = []; }
    if (p.opacity !== undefined && thing?.mesh.material.uniforms?.uOpacity) thing.mesh.material.uniforms.uOpacity.value = p.opacity;
    return thing;
  }
  function removeThing(key) {
    const t = sprites.get(key);
    if (!t) return;
    scene.remove(t.mesh, ...t.extras);
    t.mesh.material.dispose();
    for (const e of t.extras) e.material.dispose();
    if(t.decal)t.mesh.geometry.dispose();
    sprites.delete(key);
  }

  // Each frame: (camera x, z), whether the followed hero is on the island, frame time
  function update(x, z, active, dt, frontier, discovered, viewScale = 1) {
    // perf 2026-11-07: the spots are only re-read when a new frontier view or discovery arrives (4 Hz), not every frame
    if (frontier !== snapshot || discovered !== lastDiscovered) { spotKey = `${JSON.stringify(frontier?.spots || {})}|${discovered}`; lastDiscovered = discovered; }
    snapshot = frontier;
    const revision = spotKey;
    // Harvest stage changes are batched (max ~2/s) so many workers can't force a full prop + draw-order rebuild every tick
    const nowMs = performance.now();
    if (revision !== spotRevision && nowMs - spotAppliedAt >= 500) { spotRevision = revision; propAt = null; spotAppliedAt = nowMs; }
    glow?.update(glowItems, active, viewScale);
    if (!active) {
      if (shown) { for (const k of [...sprites.keys()]) removeThing(k); for (const c of loaded.values()) { c.mesh.visible = false; if (c.coastMesh) c.coastMesh.visible = false; } list = []; shown = false; last = null; propAt = null; }
      return;
    }
    if (!shown) { for (const c of loaded.values()) { c.mesh.visible = true; if (c.coastMesh) c.coastMesh.visible = true; } shown = true; }
    frame++;
    const vx = last && dt > 0 ? (x - last[0]) / dt : 0, vz = last && dt > 0 ? (z - last[1]) / dt : 0;
    last = [x, z];
    const wanted = chunksToDraw(x, z, vx, vz, { chunk: S, drawRadius: cfg.drawRadius ?? 1, cols, rows });
    for (const [a, b] of wanted) { const c = loaded.get(`${a},${b}`); if (c) c.used = frame; }
    if (painter?.failed()) painter = null;   // textures missing: fall back to the city ground
    if (groundTex && (!painter || painter.ready())) {
      const plan = planChunks(loaded, wanted, { limit: cfg.drawCache ?? 16, perFrame: 1 });
      for (const k of plan.drop) dropChunk(k);
      for (const [a, b] of plan.build) {
        const gen = buildChunk(world, cfg, a, b, seed, { city }), mesh = groundMesh(gen);
        gen.props.push(...campPropsInChunk(world,gen.x0,gen.z0,gen.size),...findPropsInChunk(world,gen.x0,gen.z0,gen.size),...crossingPropsInChunk(world,gen.x0,gen.z0,gen.size,cfg.paint?.bridge,cfg.paint?.enabled?createPaint(world,cfg.paint).waterAt:null),...nodePropsInChunk(world,gen.x0,gen.z0,gen.size),...sitePropsInChunk(world,gen.x0,gen.z0,gen.size));
        scene.add(mesh);
        const coastMesh = coastline?.mesh(gen);
        if (coastMesh) scene.add(coastMesh);
        loaded.set(`${a},${b}`, { gen, mesh, coastMesh, used: frame });
        propAt = null;   // new props may be in view
      }
    }
    // props: refresh when the camera has moved a few units (or a chunk came in)
    // perf 2026-11-07 (Tim: worse while moving): props are gathered a margin wider and refreshed every MOVE units
    // instead of every 4, so panning rebuilds the prop set about a third as often without props popping in
    const MOVE = 12, R = (cfg.propRadius ?? 55) * viewScale + MOVE;
    if (propAt && Math.hypot(x - propAt[0], z - propAt[1]) < MOVE && Math.abs(R - propAt[2]) < 1) return;
    propAt = [x, z, R];
    const want = new Map();
    const spots = spotConfig ? visibleSpots(spotIndex, { x, z, radius: R + spotConfig.pieceReach, known: (sx, sz) => isDiscovered(world, discovered ?? '0', sx, sz) }) : [];
    if (glow) {   // resource glow: spots and nodes within a wider radius so they show at far zoom
      const known = (sx, sz) => isDiscovered(world, discovered ?? '0', sx, sz), GR = R * (glowCfg.reach ?? 1.6) + spotConfig.pieceReach;
      glowItems.length = 0;
      for (const s of visibleSpots(spotIndex, { x, z, radius: GR, known })) glowItems.push({ key: s.id, kind: s.kind, x: s.x, z: s.z, big: !!s.deposit, deposit: s.deposit, node: s.deposit ? s.nodeKind : null,
        r: Math.max(glowCfg.minRadius ?? 4, ...s.pieces.map(([a, b]) => Math.hypot(a, b) + (glowCfg.pad ?? 3))) });
      const hasSpot = new Set(glowItems.map(i => i.deposit).filter(Boolean));   // a node and its deposit spot share one glow
      for (const n of world.nodes || []) if (!hasSpot.has(n.id) && Math.hypot(n.x - x, n.z - z) < GR && known(n.x, n.z)) glowItems.push({ key: n.id, kind: n.kind, x: n.x, z: n.z, r: glowCfg.nodeRadius ?? 9, big: true, node: n.kind });
    }
    const patches = towns.filter(p => p.dirt && Math.hypot(p.x - x, p.z - z) < R + p.width);
    const cleared = p => patches.some(t => Math.abs(p.x - t.x) < t.width / 2 && Math.abs(p.z - t.z) < t.height / 2);
    for (const spot of spots) for (const p of spotPiecesToProps(spot, snapshot?.spots?.[spot.id], catalog.spotArt, spotConfig))
      if (Math.hypot(p.x - x, p.z - z) < R && !cleared(p)) want.set(p.key, p);
    if(gate&&cfg.islandArt?.enabled&&Math.hypot(gate.x-x,gate.z-z)<R+30)want.set('city-gate',{art:'city_gate_se',x:gate.x,z:gate.z});
    for (const p of towns) if (Math.hypot(p.x - x, p.z - z) < R + 10) want.set(`town:${p.key}`, p);
    wall.forEach((p, i) => { if (Math.hypot(p.x - x, p.z - z) < R + 10) want.set(`city-wall:${i}`, p); });
    for (const c of loaded.values()) {
      if (Math.abs(c.gen.x0 + S / 2 - x) > S / 2 + R + 40 + 120 || Math.abs(c.gen.z0 + S / 2 - z) > S / 2 + R + 40 + 120) continue;
      const near = propsInView(c.gen.props, x, z, R);
      for(const [i,p]of (c.gen.art||[]).entries())if(Math.hypot(p.x-x,p.z-z)<R+60)want.set(`${c.gen.id}:art:${i}`,p);
      for (const p of near) {
        // Authored camp/site props stay; only generated decorative props are covered by resource pieces.
        if (cleared(p) || (spotConfig && !p.art && !p.feature && coveredBySpot(p, spots, spotConfig.clearance))) continue;
        want.set(`${c.gen.id}:${p._i ??= c.gen.props.indexOf(p)}`, p);
      }
    }
    let changed = false, pending = false;
    for (const k of [...sprites.keys()]) if (!want.has(k)) { removeThing(k); changed = true; }
    for (const [k, p] of want) {
      if (sprites.has(k) && sprites.get(k).drawSignature !== sigOf(p)) { removeThing(k); changed = true; }
      if (sprites.has(k)) continue;
      const t = makeThing(p);
      if (t === undefined) { pending = true; continue; }
      if (!t) continue;
      scene.add(t.mesh, ...t.extras);
      t.drawSignature = sigOf(p);
      sprites.set(k, t); changed = true;
    }
    if (pending) propAt = null;
    if (changed) list = [...sprites.values()].filter(t=>!t.decal);
  }

  function captureWater(camera, time) {
    if (!waterEffects) return;
    let waterVisible = false;
    // perf 2026-11-07 (Tim: lag riding past water): the box around all water in view, so the reflection
    // pass can skip everything standing too far from it to show in it
    let w0x = Infinity, w0z = Infinity, w1x = -Infinity, w1z = -Infinity;
    if (shown && painter) {
      camera.updateMatrixWorld(); reflectionProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      reflectionFrustum.setFromProjectionMatrix(reflectionProjection);
      const T = world.terrain.cell, pad = world.terrain.shoreline?.radius || 0;
      // perf 2026-11-07: each chunk's water cells are listed once, not rescanned every frame
      for (const c of loaded.values()) {
        if (!c.water) { c.water = []; for (let j = 0; j < c.gen.cells.length; j++) for (let i = 0; i < c.gen.cells[j].length; i++) if ('wr'.includes(c.gen.cells[j][i])) c.water.push(c.gen.x0 + i * T, c.gen.z0 + j * T); }
        for (let k = 0; k < c.water.length; k += 2) {
          const x = c.water[k], z = c.water[k + 1];
          waterBox.min.set(x - pad, -0.1, z - pad); waterBox.max.set(x + T + pad, 0.1, z + T + pad);
          if (reflectionFrustum.intersectsBox(waterBox)) { waterVisible = true; w0x = Math.min(w0x, x - pad); w0z = Math.min(w0z, z - pad); w1x = Math.max(w1x, x + T + pad); w1z = Math.max(w1z, z + T + pad); }
        }
      }
    }
    const hidden = [];
    for (const c of loaded.values()) { hidden.push(c.mesh); if (c.coastMesh) hidden.push(c.coastMesh); }
    for (const t of sprites.values()) if (t.decal) hidden.push(t.mesh);
    if (waterVisible) {   // small things (sprites, props, units) farther than REACH from that water are left out of the reflection
      const REACH = 45;
      for (const o of scene.children) {
        if (!o.visible || !o.geometry || !o.isMesh) continue;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        if (o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) > 30) continue;
        const { x, z } = o.position;
        if (x < w0x - REACH || x > w1x + REACH || z < w0z - REACH || z > w1z + REACH) hidden.push(o);
      }
    }
    waterEffects.capture(camera, time, waterVisible, hidden);
  }
  function setTowns(list) { towns = list; propAt = null; }
  return { update, setTowns, captureWater, waterStats: () => waterEffects?.stats(), things: () => list, lights: () => list.flatMap(t => t.lights), chunks: () => loaded.size };
}
