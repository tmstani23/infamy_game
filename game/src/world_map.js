// World map drawing (frontier W2.2). Draws game/data/world.json on a canvas: terrain once into a
// cached offscreen canvas, overlays on demand. Pan with drag, zoom with the wheel. Read-only.
// Pure helpers at the top run in Node (tested by game/tools/test_world_map.mjs); drawing needs a DOM.
export const FOG_CELL = 250;   // default; world.json rules.discovery.cell wins
const fogCell = world => world.rules?.discovery?.cell ?? FOG_CELL;
const TERRAIN = { p: '#c4b88c', f: '#6e825c', h: '#aa9670', m: '#70685f', w: '#1e2c52', d: '#ceaa78', n: '#e2e4e8', b: '#889e68', k: '#76826e', r: '#344e80' };
const NODE_COL = { quarry: '#9696a0', forest: '#3c783c', fertile: '#c8be50', ore: '#be6e3c', fishing: '#5aaad2' };

// view = { cx, cz, scale, w, h }: world point (cx, cz) is at the canvas centre, scale = pixels per unit.
export function worldToCanvas(x, z, view) { return { px: (x - view.cx) * view.scale + view.w / 2, py: (z - view.cz) * view.scale + view.h / 2 }; }
export function canvasToWorld(px, py, view) { return { x: (px - view.w / 2) / view.scale + view.cx, z: (py - view.h / 2) / view.scale + view.cz }; }
// Nearest item ({ x, z }) within maxPx pixels of (px, py), or null.
export function hitTest(items, px, py, view, maxPx = 8) {
  let best = null, bd = maxPx;
  for (const it of items) { const p = worldToCanvas(it.x, it.z, view); const d = Math.hypot(p.px - px, p.py - py); if (d <= bd) { bd = d; best = it; } }
  return best;
}
export function fitView(world, w, h) { const scale = Math.min(w / world.size.w, h / world.size.h); return { cx: world.size.w / 2, cz: world.size.h / 2, scale, w, h }; }
// Keep zoom sane and the map from being dragged away entirely.
export function clampView(world, v) {
  const min = Math.min(v.w / world.size.w, v.h / world.size.h) * 0.9;
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
  if (i < 0 || j < 0 || i >= c) return false;
  return grid[j * c + i] === '1';
}

// state (all optional): { discovered: '0101…' | null (null = all known), towns: [{id,x,z,name}], hero: {x,z},
//   scoutedSites: array of ids, pins: [{id,x,z,note}], lastSeen: { id: {x,z,dir,now} } }
export function createWorldMap({ canvas, world, getState = () => ({}) }) {
  const ctx = canvas.getContext('2d');
  let view = fitView(world, canvas.width, canvas.height), cache = null, dirty = true, drag = null, lastMoved = false, rev = -1;
  const sites = world.sites;
  // What may be clicked: only what is drawn (known sites and camps, own pins)
  function hitItems() {
    const st = getState(), grid = st.discovered ?? null, known = (x, z) => isDiscovered(world, grid, x, z);
    return [...sites.filter(s => known(s.x, s.z)).map(s => ({ kind: 'site', ...s })),
      ...world.camps.filter(k => known(k.x, k.z)).map(k => ({ ...k, campKind: k.kind, kind: 'camp' })),
      ...(st.pins || []).map(p => ({ ...p, kind: 'pin' }))];
  }
  function buildCache() {
    const t = world.terrain, off = document.createElement('canvas');
    off.width = t.rows[0].length; off.height = t.rows.length; // one pixel per terrain cell, scaled up when drawn
    const c = off.getContext('2d');
    for (let i = 0; i < t.rows.length; i++) for (let j = 0; j < t.rows[i].length; j++) { c.fillStyle = TERRAIN[t.rows[i][j]] || TERRAIN.p; c.fillRect(j, i, 1, 1); }
    cache = off;
  }
  function path(points) { ctx.beginPath(); points.forEach(([x, z], k) => { const p = worldToCanvas(x, z, view); k ? ctx.lineTo(p.px, p.py) : ctx.moveTo(p.px, p.py); }); ctx.stroke(); }
  function draw() {
    const st = getState(), grid = st.discovered ?? null, scouted = new Set(st.scoutedSites || []);
    view.w = canvas.width; view.h = canvas.height;
    ctx.fillStyle = TERRAIN.w; ctx.fillRect(0, 0, view.w, view.h);
    if (!cache) buildCache();
    const o = worldToCanvas(0, 0, view), cell = world.terrain.cell * view.scale;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(cache, o.px, o.py, cache.width * cell, cache.height * cell);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#4670aa'; ctx.lineWidth = Math.max(1, 2 * view.scale * 10); for (const r of world.rivers) path(r.points);
    ctx.strokeStyle = 'rgba(120,92,56,.85)'; ctx.lineWidth = 1; for (const c of world.corridors) path(c.points);
    if (grid) { // fog: dark haze on undiscovered cells
      const C = fogCell(world), c = fogCols(world), rowsN = Math.ceil(world.size.h / C), s = C * view.scale;
      ctx.fillStyle = 'rgba(10,14,28,.84)';
      for (let j = 0; j < rowsN; j++) for (let i = 0; i < c; i++) if (grid[j * c + i] !== '1') { const p = worldToCanvas(i * C, j * C, view); ctx.fillRect(p.px, p.py, s + 1, s + 1); }
    }
    const known = (x, z) => isDiscovered(world, grid, x, z);
    for (const n of world.nodes) if (known(n.x, n.z)) { const p = worldToCanvas(n.x, n.z, view); ctx.fillStyle = NODE_COL[n.kind] || '#fff'; ctx.fillRect(p.px - 2, p.py - 2, 4, 4); }
    for (const k of world.camps) if (known(k.x, k.z)) { const p = worldToCanvas(k.x, k.z, view); ctx.fillStyle = '#be3228'; ctx.beginPath(); ctx.moveTo(p.px, p.py - 5); ctx.lineTo(p.px + 5, p.py + 4); ctx.lineTo(p.px - 5, p.py + 4); ctx.fill(); }
    for (const s of sites) {
      if (!known(s.x, s.z)) continue;
      const p = worldToCanvas(s.x, s.z, view); ctx.beginPath(); ctx.arc(p.px, p.py, 5, 0, 7);
      if (!grid || scouted.has(s.id)) { ctx.fillStyle = '#e6c85a'; ctx.fill(); } else { ctx.strokeStyle = '#e6c85a'; ctx.lineWidth = 1.5; ctx.stroke(); }   // hollow = not scouted
    }
    for (const t of st.towns || []) { const p = worldToCanvas(t.x, t.z, view); ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 2; ctx.strokeRect(p.px - 7, p.py - 7, 14, 14); }
    const cp = worldToCanvas(world.capital.x, world.capital.z, view);
    ctx.fillStyle = '#c82828'; ctx.beginPath(); ctx.arc(cp.px, cp.py, 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#ffe696'; ctx.lineWidth = 2; ctx.stroke();
    for (const m of Object.values(st.lastSeen || {})) {   // enemy units out in the world: solid while seen, hollow where last seen
      const p = worldToCanvas(m.x, m.z, view); ctx.strokeStyle = ctx.fillStyle = '#e04a3a'; ctx.lineWidth = 1.5;
      m.now ? ctx.fillRect(p.px - 4, p.py - 4, 8, 8) : ctx.strokeRect(p.px - 4, p.py - 4, 8, 8);
    }
    ctx.font = '12px sans-serif';
    for (const pin of st.pins || []) {
      const p = worldToCanvas(pin.x, pin.z, view); ctx.strokeStyle = '#ff78c8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.px, p.py, 5, 0, 7); ctx.stroke();
      if (pin.note) { ctx.fillStyle = '#ffd6ee'; ctx.fillText(pin.note, p.px + 8, p.py + 4); }
    }
    if (st.hero) { const p = worldToCanvas(st.hero.x, st.hero.z, view); ctx.fillStyle = '#5adc78'; ctx.beginPath(); ctx.moveTo(p.px, p.py - 8); ctx.lineTo(p.px + 6, p.py + 5); ctx.lineTo(p.px - 6, p.py + 5); ctx.fill(); }
    dirty = false;
  }
  const api = {
    get view() { return view; },
    invalidate() { dirty = true; },
    // call every frame; redraws only when the view or the snapshot revision changed
    frame(revision) { if (revision !== rev) { rev = revision; dirty = true; } if (dirty) draw(); },
    hit(px, py) { return hitTest(hitItems(), px, py, view); },
    attach() {
      canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomAt(world, view, e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15); dirty = true; }, { passive: false });
      canvas.addEventListener('pointerdown', e => { if (e.button === 0) drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false }; });
      canvas.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; view.cx = drag.cx - dx / view.scale; view.cz = drag.cz - dy / view.scale; clampView(world, view); dirty = true; });
      addEventListener('pointerup', () => { if (drag) lastMoved = drag.moved; drag = null; });
    },
    wasDrag() { return lastMoved; },
    fit() { view = fitView(world, canvas.width, canvas.height); dirty = true; },
  };
  return api;
}
