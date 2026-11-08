// World atlas: registered illustration with data overlays, feature discovery and exact hover.
// Shared terrain caching below also serves the minimap; atlas visibility never changes its fog.
// Pure helpers at the top run in Node (tested by game/tools/test_world_map.mjs); drawing needs a DOM.
import { drawRailLines } from './rail_map.js';
import { ATLAS_LAYERS, ATLAS_DEV_LAYERS, atlasItems, drawAtlasGlyph, atlasFeatureName, createAtlasBiomes, atlasRegionAt, atlasZoneLabels } from './world_atlas.js';
import { makeSpotIndex } from './sim/resource_spots.js';
import { visibleSpots } from './resource_spot_props.js';
// Extend the map UI without changing the accepted atlas or its glyph system.
// Railways (Tim 2026-11-08): your lines get their own switch and a key entry
export const WORLD_LAYERS = [...ATLAS_LAYERS, { id: 'spots', label: 'Spots', on: false }, { id: 'rail', label: 'Railways', on: true }];
export const worldFeatureName = it => it?.kind === 'spot' ? `${it.featureKind} spot · ${it.id}` : atlasFeatureName(it);
// Resource markers (brighter, Tim 2026-11-05): a soft glow, a dark rim and a bright dot; big = rich spot or node.
export const SPOT_COLORS = { timber: '#8ff09a', forest: '#8ff09a', stone: '#f2eee2', quarry: '#f2eee2', ore: '#ffb35c', fish: '#7fe2ff', fishing: '#7fe2ff', forage: '#ffe07a', fertile: '#d4f57a' };
// Rich deposits (Tim 2026-11-06): a dark painted badge with the kind character and a coloured rim, so they
// never read as one more small spot. Small spots keep the plain dot.
const RICH_MARK = { quarry: '石', ore: '鉱', forest: '木', fishing: '魚', fertile: '稲', stone: '石', timber: '木', fish: '魚', forage: '稲' };
export function drawSpotMarker(ctx, x, y, kind, big = false) {
  const c = SPOT_COLORS[kind] || '#ffffff', r = big ? 6.5 : 2.6;
  ctx.save();
  if (big) {
    ctx.fillStyle = 'rgba(58,40,24,.92)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = '#f3e6c8'; ctx.font = `bold ${Math.round(r * 1.35)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(RICH_MARK[kind] || '◆', x, y + 0.5);
    ctx.restore(); return;
  }
  ctx.globalAlpha = 0.35; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r * 2.1, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,.85)'; ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
export const FOG_CELL = 250;   // default; world.json rules.discovery.cell wins
const fogCell = world => world.rules?.discovery?.cell ?? FOG_CELL;
export const TERRAIN = { p: '#c4b88c', f: '#6e825c', h: '#aa9670', m: '#70685f', w: '#1e2c52', d: '#ceaa78', n: '#e2e4e8', b: '#889e68', k: '#76826e', r: '#344e80' };
export const GRID = 500;
const MARGIN = 24;
export function columnLetters(index) {
  if (!Number.isInteger(index) || index < 0) return '';
  let label = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label;
  return label;
}
export function gridLabel(x, z) {
  return Number.isFinite(x) && Number.isFinite(z) && x >= 0 && z >= 0 ? `${columnLetters(Math.floor(x / GRID))}${Math.floor(z / GRID) + 1}` : '';
}
// One immutable smoothed terrain cache shared by the World map and island minimap.
const terrainCaches = new WeakMap();
export function worldTerrainCache(world) {
  if (terrainCaches.has(world)) return terrainCaches.get(world);
  const t = world.terrain, base = document.createElement('canvas'), out = document.createElement('canvas');
  base.width = t.rows[0].length; base.height = t.rows.length;
  const c = base.getContext('2d');
  for (let z = 0; z < base.height; z++) for (let x = 0; x < base.width; x++) { c.fillStyle = TERRAIN[t.rows[z][x]] || TERRAIN.p; c.fillRect(x, z, 1, 1); }
  out.width = base.width * 4; out.height = base.height * 4;
  const g = out.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(base, 0, 0, out.width, out.height);
  terrainCaches.set(world, out);
  return out;
}

// view = { cx, cz, scale, w, h }: world point (cx, cz) is at the canvas centre, scale = pixels per unit.
// North up: x right, z down. All interaction coordinates are CSS pixels, independent of DPR.
export function worldToCanvas(x, z, view) { return { px: (x - view.cx) * view.scale + view.w / 2, py: (z - view.cz) * view.scale + view.h / 2 }; }
export function canvasToWorld(px, py, view) { return { x: (px - view.w / 2) / view.scale + view.cx, z: (py - view.h / 2) / view.scale + view.cz }; }
export function worldTransform(view) { const k = view.scale; return [k, 0, 0, k, view.w / 2 - k * view.cx, view.h / 2 - k * view.cz]; }
// Nearest item ({ x, z }) within maxPx pixels of (px, py), or null.
export function hitTest(items, px, py, view, maxPx = 8) {
  let best = null, bd = maxPx;
  for (const it of items) { const p = worldToCanvas(it.x, it.z, view); const d = Math.hypot(p.px - px, p.py - py); if (d <= bd) { bd = d; best = it; } }
  return best;
}
export function fitView(world, w, h) { const scale = Math.min(Math.max(1, w - 2 * MARGIN) / world.size.w, Math.max(1, h - 2 * MARGIN) / world.size.h); return { cx: world.size.w / 2, cz: world.size.h / 2, scale, w, h }; }
// Keep zoom sane and the map from being dragged away entirely.
export function clampView(world, v) {
  const min = fitView(world, v.w, v.h).scale * 0.9;
  v.scale = Math.max(min, Math.min(v.scale, 1.2));
  v.cx = Math.max(0, Math.min(v.cx, world.size.w)); v.cz = Math.max(0, Math.min(v.cz, world.size.h));
  return v;
}
// Zoom about a screen point so the world point under it stays put.
export function zoomAt(world, v, px, py, factor) {
  const before = canvasToWorld(px, py, v); v.scale *= factor; clampView(world, v);
  const after = canvasToWorld(px, py, v); v.cx += before.x - after.x; v.cz += before.z - after.z; return clampView(world, v);
}
export function fogCols(world) { return Math.ceil(world.size.w / fogCell(world)); }
export function isDiscovered(world, grid, x, z) {
  if (!grid) return true;
  const C = fogCell(world), c = fogCols(world), i = Math.floor(x / C), j = Math.floor(z / C);
  if (i < 0 || j < 0 || i >= c || x >= world.size.w || z >= world.size.h) return false;
  return grid[j * c + i] === '1';
}

// Pixel spacing accounts for multi-letter columns and narrow viewports without changing grid IDs.
export function rulerLabels(count, position, label, measure, min, max, gap = 8) {
  const out = []; let edge = min - gap;
  for (let i=0;i<count;i++) { const text=label(i), at=position(i), half=measure(text)/2;
    if (at-half < min || at+half > max || at-half < edge+gap) continue;
    out.push({text,at}); edge=at+half;
  }
  return out;
}

// state (all optional): { discovered: '0101…' | null (null = all known), towns: [{id,x,z,name}], hero: {x,z},
//   scoutedSites: array of ids, pins: [{id,x,z,note}] }
export function createWorldMap({ canvas, world, resourceSpots = null, paintConfig = null, atlasConfig = null, onHover = () => {}, getState = () => ({}) }) {
  const ctx = canvas.getContext('2d');
  const layers = Object.fromEntries([...WORLD_LAYERS, ...ATLAS_DEV_LAYERS].map(l => [l.id,l.on])), biomes = createAtlasBiomes(world,paintConfig);
  const spotIndex = resourceSpots ? makeSpotIndex(resourceSpots) : null;
  let dpr = 1, view = fitView(world, canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height), cache = null, dirty = true, drag = null, hover = null, lastMoved = false, rev = -1, illustration = null, biomeCache = null;
  if (atlasConfig?.image && atlasConfig.size?.w === world.size.w && atlasConfig.size?.h === world.size.h && typeof Image !== 'undefined') {
    const img = new Image(); img.onload = () => { illustration=img; dirty=true; }; img.onerror = () => { dirty=true; };
    img.src=atlasConfig.image;
  }
  function resize() {
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2), w = canvas.clientWidth || view.w, h = canvas.clientHeight || view.h;
    if (w !== view.w || h !== view.h) { const old = fitView(world, view.w, view.h).scale; view.scale *= fitView(world, w, h).scale / old; view.w = w; view.h = h; clampView(world, view); dirty = true; }
    if (dpr !== ratio || canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { dpr = ratio; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); dirty = true; }
  }
  const transform = () => ctx.setTransform(...worldTransform(view).map(v => v * dpr));
  const cssTransform = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const inWorld = p => p.x >= 0 && p.z >= 0 && p.x < world.size.w && p.z < world.size.h;
  // One feature list serves drawing, the key and hit testing.
  function hitItems() {
    const st = getState(), grid = st.discovered ?? null, known = (x, z) => layers.revealAll || isDiscovered(world, grid, x, z);
    const spots = layers.spots ? visibleSpots(spotIndex, { x: view.cx, z: view.cz, radius: Math.hypot(view.w, view.h) / (2 * view.scale), known }) : [];
    return [...atlasItems(world,st,layers,known), ...spots.map(s => ({ ...s, featureKind: s.kind, kind: 'spot' }))];
  }
  function path(points) { ctx.beginPath(); points.forEach(([x, z], k) => { const p = worldToCanvas(x, z, view); k ? ctx.lineTo(p.px, p.py) : ctx.moveTo(p.px, p.py); }); ctx.stroke(); }
  function draw() {
    const st = getState(), scouted = new Set(st.scoutedSites || []);
    cssTransform();
    ctx.fillStyle = '#162e3a'; ctx.fillRect(0, 0, view.w, view.h);
    if (!illustration && !cache) cache = worldTerrainCache(world);
    ctx.save(); ctx.beginPath(); ctx.rect(MARGIN,MARGIN,view.w-MARGIN,view.h-MARGIN); ctx.clip();
    transform(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(illustration || cache, 0, 0, world.size.w, world.size.h); cssTransform();
    if (layers.biomes) {
      if (!biomeCache) {
        biomeCache=document.createElement('canvas'); biomeCache.width=world.terrain.rows[0].length; biomeCache.height=world.terrain.rows.length;
        const c=biomeCache.getContext('2d'), cell=world.terrain.cell;
        for (let j=0;j<biomeCache.height;j++) for (let i=0;i<biomeCache.width;i++) { c.fillStyle=biomes.at((i+.5)*cell,(j+.5)*cell).color; c.fillRect(i,j,1,1); }
      }
      ctx.globalAlpha=.24; transform(); ctx.drawImage(biomeCache,0,0,world.size.w,world.size.h); cssTransform(); ctx.globalAlpha=1;
    }
    ctx.lineJoin = 'round';
    // Fallback stays usable while the illustration loads or if it is unavailable.
    if (!illustration) { ctx.strokeStyle = '#4670aa'; ctx.lineWidth = Math.max(1, 2 * view.scale * 10); for (const r of world.rivers) path(r.points); }
    if (layers.routes) {
      for (const c of world.corridors) { ctx.strokeStyle=c.kind==='road' ? 'rgba(78,55,34,.5)' : 'rgba(89,65,44,.33)'; ctx.lineWidth=c.kind==='road' ? 1.4 : 1; path(c.points); }
      ctx.strokeStyle='rgba(89,65,44,.4)'; ctx.lineWidth=1; for (const points of paintConfig?.paths?.list || []) path(points);
    }
    if (layers.grid) { // hidden by default; ruler labels remain visible
      const G = GRID; ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1;
      for (let x = 0; x <= world.size.w; x += G) path([[x, 0], [x, world.size.h]]);
      for (let z = 0; z <= world.size.h; z += G) path([[0, z], [world.size.w, z]]);
    }
    const items=hitItems();
    if (layers.names) {
      ctx.save(); ctx.font='italic 12px Georgia, serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.lineWidth=3; ctx.lineJoin='round'; ctx.strokeStyle='rgba(16,33,37,.85)'; ctx.fillStyle='#f5e5ba';
      const obstacles=[...items,...(st.hero ? [st.hero] : [])].map(it=>{const p=worldToCanvas(it.x,it.z,view);return {left:p.px-10,right:p.px+10,top:p.py-10,bottom:p.py+10};});
      const labels=atlasZoneLabels(world,(x,z)=>worldToCanvas(x,z,view),s=>ctx.measureText(s).width,{left:MARGIN+5,top:MARGIN+5,right:view.w-5,bottom:view.h-5},obstacles);
      for (const label of labels) label.lines.forEach((line,i)=>{const y=label.py+(i-(label.lines.length-1)/2)*label.lineHeight;ctx.strokeText(line,label.px,y);ctx.fillText(line,label.px,y);});
      ctx.restore();
    }
    for (const it of items) { const p=worldToCanvas(it.x,it.z,view); if (it.kind === 'spot') drawSpotMarker(ctx,p.px,p.py,it.deposit ? it.nodeKind || it.featureKind : it.featureKind,!!it.deposit); else if (it.kind === 'resource') drawSpotMarker(ctx,p.px,p.py,it.featureKind,true); else drawAtlasGlyph(ctx,it.kind,p.px,p.py,it.kind==='site' && !!st.discovered && !scouted.has(it.id)); }
    // your railway lines (Tim 2026-11-07): laid track glows, the rest of the route dashed, progress at the railhead
    if (st.rail && layers.rail) drawRailLines(ctx, st.rail.links, (x, z) => { const p = worldToCanvas(x, z, view); return [p.px, p.py]; }, { width: 3, seconds: st.rail.seconds });
    if (st.hero) { const p=worldToCanvas(st.hero.x,st.hero.z,view); drawAtlasGlyph(ctx,'hero',p.px,p.py); }
    // the surveyor's tour stop (Tim 2026-11-06 20:45): a gold ring the size of the area a town draws its nodes from
    if (st.highlight) { const h=st.highlight, p=worldToCanvas(h.x,h.z,view); ctx.save(); ctx.strokeStyle='rgba(240,200,90,.95)'; ctx.lineWidth=2.5; ctx.setLineDash([6,4]);
      ctx.beginPath(); ctx.arc(p.px,p.py,Math.max(14,(h.r||0)*view.scale),0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    ctx.restore(); cssTransform();
    // Fixed rulers stay legible while the map pans/zooms underneath them.
    ctx.fillStyle = 'rgba(10,20,27,.94)'; ctx.fillRect(0, 0, view.w, MARGIN); ctx.fillRect(0, 0, MARGIN, view.h);
    ctx.fillStyle = '#dfcc9b'; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center';
    for (const l of rulerLabels(Math.ceil(world.size.w/GRID),i=>worldToCanvas((i+.5)*GRID,0,view).px,columnLetters,s=>ctx.measureText(s).width,MARGIN+4,view.w-4)) ctx.fillText(l.text,l.at,16);
    for (const l of rulerLabels(Math.ceil(world.size.h/GRID),i=>worldToCanvas(0,(i+.5)*GRID,view).py,i=>String(i+1),()=>12,MARGIN+4,view.h-4,4)) ctx.fillText(l.text,12,l.at+4);
    ctx.textAlign = 'left';
    const label = hover && canvasToWorld(hover.px, hover.py, view);
    if (label && hover.px>=MARGIN && hover.py>=MARGIN && inWorld(label)) {
      const feature=hitTest(items,hover.px,hover.py,view,10);
      onHover({ ...label, grid:gridLabel(label.x,label.z), zone:atlasRegionAt(world,label.x,label.z)?.name || '', biome:biomes.at(label.x,label.z).name, feature:worldFeatureName(feature) });
    } else onHover(null);
    dirty = false;
  }
  const api = {
    get view() { return view; },
    invalidate() { dirty = true; },
    get grid() { return layers.grid; },
    setGrid(on) { layers.grid = !!on; dirty = true; },
    get layers() { return { ...layers }; },
    setLayer(id,on) { if (Object.hasOwn(layers,id)) { layers[id]=!!on; dirty=true; } },
    items: hitItems,
    biomeAt: (x,z) => biomes.at(x,z),
    centerOn(p) { if (p && inWorld(p)) { view.cx=p.x; view.cz=p.z; clampView(world,view); dirty=true; } },
    // centre on p with about `span` world units across the shorter side (the surveyor's tour)
    focus(p, span) { if (!p || !inWorld(p)) return; resize(); view.scale=Math.min(view.w,view.h)/Math.max(1,span); view.cx=p.x; view.cz=p.z; clampView(world,view); dirty=true; },
    // call every frame; redraws only when the view or the snapshot revision changed
    resize,
    frame(revision) { resize(); if (revision !== rev) { rev = revision; dirty = true; } if (dirty) draw(); },
    hit(px, py) { return px < MARGIN || py < MARGIN ? null : hitTest(hitItems(), px, py, view); },
    attach() {
      const local = e => { const r = canvas.getBoundingClientRect(); return { px: (e.clientX - r.left) * view.w / r.width, py: (e.clientY - r.top) * view.h / r.height }; };
      canvas.addEventListener('wheel', e => { e.preventDefault(); const p = local(e); zoomAt(world, view, p.px, p.py, e.deltaY < 0 ? 1.15 : 1 / 1.15); dirty = true; }, { passive: false });
      // Pointer capture keeps the release on this canvas even if other game handlers swallow it
      // (Tim 2026-11-02: drag stuck to the cursor); a move with no button held also ends the drag.
      const end = e => { if (drag) lastMoved = drag.moved; drag = null; try { canvas.releasePointerCapture?.(e.pointerId); } catch {} };
      canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; const p = local(e); lastMoved = false; drag = { x: p.px, y: p.py, cx: view.cx, cz: view.cz, moved: false }; try { canvas.setPointerCapture?.(e.pointerId); } catch {} });
      canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
      canvas.addEventListener('pointermove', e => { hover = local(e); dirty = true; if (!drag) return; if (!(e.buttons & 1)) return end(e); const dx = hover.px - drag.x, dy = hover.py - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; view.cx = drag.cx - dx / view.scale; view.cz = drag.cz - dy / view.scale; clampView(world, view); });
      canvas.addEventListener('pointerleave', () => { hover = null; dirty = true; });
      addEventListener('pointerup', end, true);   // window, capture phase: a release anywhere ends it
    },
    wasDrag() { return lastMoved; },
    fit() { resize(); view = fitView(world, view.w, view.h); dirty = true; },
    // + / - buttons: zoom about the middle of the map
    zoomBy(factor) { zoomAt(world, view, view.w / 2, view.h / 2, factor); dirty = true; },
  };
  return api;
}
