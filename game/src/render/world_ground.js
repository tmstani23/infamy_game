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
import { placePiece } from '../sim/geometry.js';
import { groundMaterial } from './shading.js';
import { loadTex, cutoutThing, loadGroundTextures, GROUND_CHANNELS } from './scenery.js';
import { chunksToDraw, planChunks, propsInView } from '../world_stream.js';

// world prop kind -> art in data/art.json and a size factor (placeholders until the forest and
// mountain art is cut in, W3.4b)
const ART = {
  cedar: ['pine_tree', 1], pine: ['pine_tree', 0.9], twisted_pine: ['dead_tree', 1], bush: ['bush', 1], ferns: ['bush', 0.55],
  stump: ['rotten_log', 0.5], fallen_log: ['rotten_log', 1], small_rocks: ['boulder', 0.4], boulder: ['boulder', 1],
  bamboo: ['bamboo', 1], mountain: ['boulder', 1], campfire: ['campfire', 1],
};
// terrain code -> ground weights (channels in render/scenery.js; what is left over is dirt)
const GROUND = {
  p: { grass: 1 }, f: { grass: 0.45, mud: 0.15 }, h: { dry_grass: 0.6, gravel: 0.2 }, m: { gravel: 0.8 },
  w: { water: 1 }, r: { water: 1 }, d: { sand: 0.5, dry_grass: 0.4 }, n: { sand: 0.7, gravel: 0.2 },
  b: { grass: 0.7 }, k: { mud: 0.7, water: 0.15 },
};
const SPLAT_RES = 0.5;   // weight-map pixels per world unit
const TRAIL = 3;         // half width of a corridor trail

export function createWorldGround({ scene, renderer, world, cfg, catalog, cutouts, bounds, gate }) {
  const S = cfg.chunk, seed = world.seed ?? 1, city = cityOnIsland(world, bounds);
  const cols = Math.ceil(world.size.w / S), rows = Math.ceil(world.size.h / S);
  const loaded = new Map();     // 'cx,cz' -> { gen, mesh, used }
  const sprites = new Map();    // prop key -> Thing
  const textures = new Map();   // art file -> texture (or a pending promise)
  let groundTex = null, frame = 0, last = null, list = [], shown = false, propAt = null;
  loadGroundTextures(renderer).then(async t => {
    if(cfg.islandArt?.enabled){const tops=await Promise.all(['forest','snow','dry'].map(b=>loadTex(`art/ground/top_${b}.png`)));tops.forEach(tex=>{tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=renderer.capabilities.getMaxAnisotropy();});t={...t,tTopForest:tops[0],tTopSnow:tops[1],tTopDry:tops[2]};}
    groundTex=t;
  }).catch(e=>console.error('Island ground textures:',e));
  const segs = [];
  for (const c of world.corridors || []) for (let k = 1; k < c.points.length; k++) segs.push([c.points[k - 1], c.points[k]]);

  function weightsAt(x, z) {
    const w = Object.fromEntries(GROUND_CHANNELS.map(c => [c, 0]));
    // a soft blend: the average of nine samples around the point
    for (const dx of [-9, 0, 9]) for (const dz of [-9, 0, 9]) for (const [c, v] of Object.entries(GROUND[terrainAt(world, x + dx, z + dz)] || {})) w[c] += v / 9;
    return w;
  }
  function groundMesh(gen) {
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
    c.mesh.geometry.dispose();
    c.mesh.material.uniforms.uSplatA.value.dispose(); c.mesh.material.uniforms.uSplatB.value.dispose();
    c.mesh.material.uniforms.uIslandTop?.value.dispose();
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
    const [name, f] = p.art ? [p.art, 1] : ART[p.kind] || [];
    if (!name) return null;
    if(p.decal){
      const tex=textureFor(`art/props/${name}.png`);if(!tex)return undefined;
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(p.width,p.height),spriteMaterial(tex));mesh.rotation.x=-Math.PI/2;mesh.rotation.z=-(p.angle||0);mesh.position.set(p.x,.015,p.z);mesh.renderOrder=-.5;
      mesh.material.uniforms.uFogAt.value.set(p.x,p.z,0,1);
      return {mesh,extras:[],lights:[],decal:true};
    }
    const piece = placePiece({ name, x: p.x, z: p.z, flip: p.art ? !!p.flip : Math.floor(p.x * 7 + p.z * 3) % 2 === 0 }, catalog, cutouts);
    if (!piece) return null;
    const tex = textureFor(piece.item.file);
    if (!tex) return undefined;   // still loading: try next pass
    const s = (p.s || 1) * f;
    if (s !== 1) {   // scale the art and its footprint about the prop's spot
      piece.k *= s;
      const sc = r => ({ minX: p.x + (r.minX - p.x) * s, maxX: p.x + (r.maxX - p.x) * s, minZ: p.z + (r.minZ - p.z) * s, maxZ: p.z + (r.maxZ - p.z) * s });
      piece.foot = sc(piece.foot);
    }
    return cutoutThing(piece, tex);
  }
  function removeThing(key) {
    const t = sprites.get(key);
    if (!t) return;
    scene.remove(t.mesh, ...t.extras);
    t.mesh.material.dispose();
    if(t.decal)t.mesh.geometry.dispose();
    sprites.delete(key);
  }

  // Each frame: (camera x, z), whether the followed hero is on the island, frame time
  function update(x, z, active, dt) {
    if (!active) {
      if (shown) { for (const k of [...sprites.keys()]) removeThing(k); for (const c of loaded.values()) c.mesh.visible = false; list = []; shown = false; last = null; propAt = null; }
      return;
    }
    if (!shown) { for (const c of loaded.values()) c.mesh.visible = true; shown = true; }
    frame++;
    const vx = last && dt > 0 ? (x - last[0]) / dt : 0, vz = last && dt > 0 ? (z - last[1]) / dt : 0;
    last = [x, z];
    const wanted = chunksToDraw(x, z, vx, vz, { chunk: S, drawRadius: cfg.drawRadius ?? 1, cols, rows });
    for (const [a, b] of wanted) { const c = loaded.get(`${a},${b}`); if (c) c.used = frame; }
    if (groundTex) {
      const plan = planChunks(loaded, wanted, { limit: cfg.drawCache ?? 16, perFrame: 1 });
      for (const k of plan.drop) dropChunk(k);
      for (const [a, b] of plan.build) {
        const gen = buildChunk(world, cfg, a, b, seed, { city }), mesh = groundMesh(gen);
        scene.add(mesh);
        loaded.set(`${a},${b}`, { gen, mesh, used: frame });
        propAt = null;   // new props may be in view
      }
    }
    // props: refresh when the camera has moved a few units (or a chunk came in)
    const R = cfg.propRadius ?? 55;
    if (propAt && Math.hypot(x - propAt[0], z - propAt[1]) < 4) return;
    propAt = [x, z];
    const want = new Map();
    if(gate&&cfg.islandArt?.enabled&&Math.hypot(gate.x-x,gate.z-z)<R+30)want.set('city-gate',{art:'city_gate_se',x:gate.x,z:gate.z});
    for (const c of loaded.values()) {
      if (Math.abs(c.gen.x0 + S / 2 - x) > S / 2 + R + 40 || Math.abs(c.gen.z0 + S / 2 - z) > S / 2 + R + 40) continue;
      const near = propsInView(c.gen.props, x, z, R);
      for(const [i,p]of (c.gen.art||[]).entries())if(Math.hypot(p.x-x,p.z-z)<R+60)want.set(`${c.gen.id}:art:${i}`,p);
      for (const p of near) want.set(`${c.gen.id}:${c.gen.props.indexOf(p)}`, p);
    }
    let changed = false, pending = false;
    for (const k of [...sprites.keys()]) if (!want.has(k)) { removeThing(k); changed = true; }
    for (const [k, p] of want) {
      if (sprites.has(k)) continue;
      const t = makeThing(p);
      if (t === undefined) { pending = true; continue; }
      if (!t) continue;
      scene.add(t.mesh, ...t.extras);
      sprites.set(k, t); changed = true;
    }
    if (pending) propAt = null;
    if (changed) list = [...sprites.values()].filter(t=>!t.decal);
  }

  return { update, things: () => list, lights: () => list.flatMap(t => t.lights), chunks: () => loaded.size };
}
