// Minimap, top right: the district turned to match the screen, with the same fog of war,
// a letter on each business (W warehouse, T teahouse, D den, C clinic, P police, H hideout, J the Shinobi dojo; on its owner's colour once seen),
// dots for units your clan can see, your businesses outlined and a box for the camera's view.
// Left-click (or drag) moves the camera there; right-click sends the selected crew there
// (Ctrl: hold there), like right-clicking the ground. Only reads the state and sends commands.
// Territory (sim/territory.js) shows as a tint in each clan's colour (a rival's once you have seen
// its business), a whole held quarter as a box. The same code draws the full game map (M,
// src/game_map.js): big = true, with layer switches (layers), hover info (onHover) and a click
// that looks there and closes it (onPick).
import { mapTerrain, createMapRaster } from './map_raster.js';
import { drawWatchMarkers } from './watch_markers.js';
import { contractMapLocation } from './contract_map_marker.js';

const MARK = { pawnshop: 'Q', bathhouse: 'A', sake_brewery: 'K', manor: 'R', customs_house: 'U', warehouse: 'W', teahouse: 'T', shop: 'S', tenements: 'N', gambling_den: 'D', clinic: 'C', police_box: 'P', police_hq: 'P', moneylender: 'M', hideout: 'H', dojo: 'J' };
const S = Math.SQRT1_2;

export function policeMapColor(officer, clan, state) {
  const target = state.entities[officer.swing?.target || officer.execute?.target || officer.attackTarget];
  return (officer.angry?.[clan] ?? -1) > state.tick || target?.owner === clan ? '#ff4632' : '#72aaff';
}

export function createMinimap({ canvas, game, district, view, fog, heroId, clan = 'player', selected, send, big = false,
  layers = { territory: true, businesses: true, police: true, units: true }, onHover = null, onPick = null, overlay = null }) {
  const g = game.vision.grid(clan);
  const midX = g.minX + g.w / 2, midZ = g.minZ + g.h / 2;
  let size = canvas.clientWidth || 180, zoom = Math.max(1, size / 180);   // big map: letters and dots grow a little
  let baseScale = size / ((g.w + g.h) * S) * 1.02;
  let mapZoom = 1, k = baseScale;   // the turned district fills the box
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d');

  // world point <-> minimap pixel (screen right = x - z, screen down = x + z)
  const toMap = (x, z) => [size / 2 + (x - midX - (z - midZ)) * S * k, size / 2 + (x - midX + (z - midZ)) * S * k];
  const toWorld = (u, v) => {
    const a = (u - size / 2) / (S * k), b = (v - size / 2) / (S * k);
    return { x: midX + (a + b) / 2, z: midZ + (b - a) / 2 };
  };

  // the map itself, one pixel per cell: ground, then buildings
  const base = mapTerrain(game,district,g);
  const img = new ImageData(g.w, g.h), cells = document.createElement('canvas');
  cells.width = g.w; cells.height = g.h;
  const cctx = cells.getContext('2d'), raster = createMapRaster(base,img.data);
  const metrics={draws:0,cellPaints:0,drawMs:0,maxDrawMs:0};

  // the same fog as the screen: never explored near black, explored dimmed and greyed
  // territory tint per cell ([r, g, b, alpha] or null), rebuilt when owners or what you have seen change
  const turfBuffer=new Float32Array(g.w*g.h*4);
  let turf = null, turfKey = null;
  const rgb = hex => { const v = parseInt(String(hex).replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  function territoryTint() {
    const t = game.territory, st = game.state;
    if (!t || !layers.territory) { const changed=turf!==null;turf=null;turfKey=null;return changed; }
    const tg = t.cellGrid(), vg = game.vision.grid(clan);
    // a rival's area shows once you have seen its business (Tim 2026-10-19 rule for owner colours)
    const shown = tg.areas.map(a => a.clan === clan || !fogOn() || vg.explored[game.vision.cellOf(a.x, a.z)] === 1);
    const key = tg.areas.map((a, i) => `${a.business}:${a.clan}:${shown[i]}`).join(',');
    if (key === turfKey) return;
    turfKey = key;
    turf = turfBuffer;
    turf.fill(0);
    const cols = tg.areas.map(a => rgb(st.clans?.[a.clan]?.color || '#888888'));
    const at = n => { const c = tg.cells[n]; return c && shown[c - 1] ? tg.areas[c - 1].clan : null; };
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const n = j * g.w + i, c = tg.cells[n];
      if (!c || !shown[c - 1]) continue;
      const own = tg.areas[c - 1].clan;
      // the edge of a clan's territory drawn stronger
      const edge = i === 0 || j === 0 || i === g.w - 1 || j === g.h - 1 || at(n - 1) !== own || at(n + 1) !== own || at(n - g.w) !== own || at(n + g.w) !== own;
      const k=n*4,col=cols[c-1];turf[k]=col[0];turf[k+1]=col[1];turf[k+2]=col[2];turf[k+3]=edge?.7:.22;
    }
    return true;
  }
  function paintCells() {
    const changed=territoryTint();
    if(raster.paint(g.visible,g.explored,fogOn(),turf,changed)){
      cctx.putImageData(img,0,0);metrics.cellPaints++;
    }
  }
  const fogOn = () => fog.isOn();

  // the clan holding a quarter whole, if you can tell (yours, or all its businesses seen)
  function shownHolder(q) {
    const o = game.territory.heldBy(q), vg = game.vision.grid(clan);
    return o && (o === clan || !fogOn() || q.businesses.every(id => vg.explored[game.vision.cellOf(game.state.businesses[id].x, game.state.businesses[id].z)] === 1)) ? o : null;
  }
  function dot(x, z, color, r) {
    const [u, v] = toMap(x, z);
    r *= Math.sqrt(zoom);
    ctx.beginPath(); ctx.arc(u, v, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.stroke();
  }

  function colorOf(e, me) {
    if (e.id === heroId) return ['#ffcd50', 3.4];
    if (e.owner === me) return ['#50d2c8', 2.4];
    if (e.type === 'civilian') return ['#ebe8dc', 1.5];
    if (e.cop || e.owner === 'police') return [policeMapColor(e, me, game.state), 2.4];
    if (e.wild) return (e.angry?.[me] ?? -1) > game.state.tick ? ['#ff4632', 2.4] : ['#ff9a46', 2.2];
    return ['#ff4632', 2.6];
  }

  function paintMap() {
    if (canvas.clientWidth && canvas.clientWidth !== size) {
      size = canvas.clientWidth; zoom = Math.max(1, size / 180);
      baseScale = size / ((g.w + g.h) * S) * 1.02; k = baseScale * mapZoom;
      canvas.width = canvas.height = Math.round(size * dpr);
    }
    const nowMs = performance.now();metrics.draws++;
    const state = fog.seen(game.state);
    paintCells();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, size, size);
    // the grid image, turned 45 degrees
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.transform(S * k, S * k, -S * k, S * k, 0, 0);
    ctx.translate(g.minX - midX, g.minZ - midZ);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cells, 0, 0);
    ctx.restore();
    if (layers.deployment) overlay?.ground({ ctx, toMap, size, zoom, now: nowMs, dpr });
    // every business, as a letter, even under the fog so you can find them (W warehouse, T teahouse, D den, C clinic, P police)
    // quarters (sim/territory.js, Tim 2026-10-20): a white dotted outline round each, its name in the middle
    // (big map); once one clan holds every business in it (and you can tell) the outline is in its colour
    if (game.territory && layers.territory) for (const q of game.territory.quarters) {
      const o = shownHolder(q), [x0, z0, x1, z1] = q.box;
      ctx.beginPath();
      [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach(([x, z], i) => { const [u, v] = toMap(x, z); i ? ctx.lineTo(u, v) : ctx.moveTo(u, v); });
      ctx.closePath();
      ctx.strokeStyle = o ? state.clans?.[o]?.color || '#888' : 'rgba(255,255,255,.7)'; ctx.lineWidth = (o ? 1.6 : 1) * Math.sqrt(zoom); ctx.setLineDash([1.5 * zoom, 3 * zoom]); ctx.stroke(); ctx.setLineDash([]);
      if (!big) continue;
      const [cu, cv] = toMap((x0 + x1) / 2, (z0 + z1) / 2), f = Math.sqrt(zoom);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.font = `600 ${Math.round(12 * f)}px system-ui, sans-serif`;
      ctx.strokeText(q.name, cu, cv); ctx.fillStyle = '#f4ecd8'; ctx.fillText(q.name, cu, cv);
    }
    const fs = Math.round(8 * Math.sqrt(zoom)), bs = 9 * Math.sqrt(zoom);
    ctx.font = `bold ${fs}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of Object.values(game.state.businesses)) {
      const letter = MARK[b.kind];
      if (!letter) continue;
      if (b.kind.startsWith('police') ? !layers.police : !layers.businesses) continue;
      const [u, v] = toMap(b.x, b.z);
      // once you have seen it, an owned business shows in its owner's colour (Tim 2026-10-19)
      const vg = game.vision.grid(clan), cell = game.vision.cellOf(b.x, b.z);
      const ownerColor = b.owner && (b.owner === clan || (cell >= 0 && vg.explored[cell])) ? state.clans?.[b.owner]?.color : null;
      ctx.fillStyle = ownerColor || 'rgba(0,0,0,.65)'; ctx.fillRect(u - bs / 2, v - bs / 2, bs, bs);
      ctx.fillStyle = ownerColor ? '#fff4dc' : b.kind.startsWith('police') ? '#8fb4ff' : b.kind === 'clinic' ? '#8fe08f' : '#ffe2a0';
      ctx.fillText(letter, u, v + 0.5);
    }
    // Camp locations are public; remaining bandits are shown only while in sight.
    if (layers.businesses) for (const camp of game.state.banditCamps || []) {
      const [u, v] = toMap(camp.x, camp.z);
      const scale = camp.members.length > 2 ? 1.5 : 1, boxSize = bs * scale;
      ctx.save(); ctx.font = `bold ${Math.round(fs * scale)}px sans-serif`;
      ctx.fillStyle = '#56331d'; ctx.fillRect(u - boxSize / 2, v - boxSize / 2, boxSize, boxSize);
      ctx.fillStyle = '#ffb46e'; ctx.fillText('B', u, v + 0.5);
      ctx.restore();
    }
    // your businesses
    ctx.strokeStyle = '#ffcd50'; ctx.lineWidth = 1.2;
    if (layers.businesses) for (const b of Object.values(game.state.businesses)) {
      if (b.owner !== clan) continue;
      const [u, v] = toMap(b.x, b.z);
      ctx.strokeRect(u - bs / 2 + 0.5, v - bs / 2 + 0.5, bs - 1, bs - 1);
    }
    // pings (a rival walking into your territory, src/main.js): an orange ring pulsing out
    for (let i = pings.length - 1; i >= 0; i--) {
      const p = pings[i], q = (nowMs - p.t) / 1600;
      if (q >= 3) { pings.splice(i, 1); continue; }
      const [u, v] = toMap(p.x, p.z), f = q % 1;
      ctx.beginPath(); ctx.arc(u, v, (4 + f * 12) * Math.sqrt(zoom), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,150,50,${(1 - f) * 0.9})`; ctx.lineWidth = 1.6; ctx.stroke();
    }
    // your business under a raid: a red ping pulsing out from it (checkpoint 5)
    for (const a of Object.values(game.state.attacks || {})) {
      if (a.mode !== 'raid' || a.defender !== clan) continue;
      const b = game.state.businesses[a.business], [u, v] = toMap(b.x, b.z), p = (performance.now() / 1600) % 1;
      for (const k of [0, 0.5]) {
        const q = (p + k) % 1;
        ctx.beginPath(); ctx.arc(u, v, 5 + q * 12, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,70,50,${(1 - q) * 0.9})`; ctx.lineWidth = 1.6; ctx.stroke();
      }
    }
    // your active Shinobi contract (Tim 2026-10-27): a violet diamond on the target; when it is off
    // the map's edge, an arrow on the edge points toward it
    const job = game.state.contracts?.active?.[clan];
    if (job) {
      const p = contractMapLocation(game, clan);
      if (p) {
        const [u, v] = toMap(p.x, p.z), m = 9, pulse = 0.6 + 0.4 * Math.sin(nowMs / 260);
        ctx.fillStyle = `rgba(190,140,255,${pulse})`; ctx.strokeStyle = 'rgba(20,10,30,.9)'; ctx.lineWidth = 1.2;
        if (u >= m && u <= size - m && v >= m && v <= size - m) {
          const r = 5 * Math.sqrt(zoom);
          ctx.beginPath(); ctx.moveTo(u, v - r); ctx.lineTo(u + r, v); ctx.lineTo(u, v + r); ctx.lineTo(u - r, v); ctx.closePath();
          ctx.fill(); ctx.stroke();
        } else {
          const c = size / 2, a = Math.atan2(v - c, u - c), d = Math.min((c - m) / Math.abs(Math.cos(a) || 1e-6), (c - m) / Math.abs(Math.sin(a) || 1e-6));
          const x = c + Math.cos(a) * d, y = c + Math.sin(a) * d, r = 7 * Math.sqrt(zoom);
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          ctx.lineTo(x + Math.cos(a + 2.5) * r * 0.8, y + Math.sin(a + 2.5) * r * 0.8); ctx.lineTo(x + Math.cos(a - 2.5) * r * 0.8, y + Math.sin(a - 2.5) * r * 0.8);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        // and a small arrow just off your hero's dot, pointing the way
        const h = game.state.entities[heroId];
        if (h && h.place === 'street' && !big) {
          const [hu, hv] = toMap(h.x, h.z), a = Math.atan2(v - hv, u - hu), gap = 11 * Math.sqrt(zoom), r = 5 * Math.sqrt(zoom);
          if (Math.hypot(u - hu, v - hv) > gap * 2) {
            const x = hu + Math.cos(a) * gap, y = hv + Math.sin(a) * gap;
            ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            ctx.lineTo(x + Math.cos(a + 2.5) * r * 0.8, y + Math.sin(a + 2.5) * r * 0.8); ctx.lineTo(x + Math.cos(a - 2.5) * r * 0.8, y + Math.sin(a - 2.5) * r * 0.8);
            ctx.closePath(); ctx.fill(); ctx.stroke();
          }
        }
      }
    }
    // units on the street that you can see (yours on top)
    const list = Object.values(state.entities).filter(e => e.place === 'street' && !e.dead)
      .sort((a, b) => (a.owner === clan) - (b.owner === clan) || (a.id === heroId) - (b.id === heroId));
    for (const e of list) {
      if (e.cop ? !layers.police : !layers.units && e.id !== heroId) continue;
      const [c, r] = colorOf(e, clan);
      ctx.globalAlpha = e.downed ? 0.45 : 1;
      dot(e.x, e.z, c, r);
    }
    ctx.globalAlpha = 1;
    drawWatchMarkers({ ctx, toMap, state: game.state, clan, scale: big ? 1.25 : 1 });
    if (layers.deployment) overlay?.markers({ ctx, toMap, size, zoom, now: nowMs });
    // what the camera sees
    const corners = [[0, 0], [innerWidth, 0], [innerWidth, innerHeight], [0, innerHeight]].map(([x, y]) => view.screenToGround(x, y));
    if (corners.every(Boolean) && !(game.state.entities[heroId]?.place !== 'street' && !view.isPanned())) {
      ctx.beginPath();
      corners.forEach((p, i) => { const [u, v] = toMap(p.x, p.z); i ? ctx.lineTo(u, v) : ctx.moveTo(u, v); });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  // clicks: keep them away from the crew controls underneath (they listen on the window)
  // (scaled to the minimap's size on screen, which the movable HUD can change)
  const draw=()=>{const start=performance.now();paintMap();const ms=performance.now()-start;metrics.drawMs+=ms;metrics.maxDrawMs=Math.max(metrics.maxDrawMs,ms);};
  const at = e => { const r = canvas.getBoundingClientRect(); return toWorld((e.clientX - r.left) * size / r.width, (e.clientY - r.top) * size / r.height); };
  let dragging = false;
  // the business under a map point (for the big map's hover and click), within a few pixels
  const pxAt = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * size / r.width, (e.clientY - r.top) * size / r.height]; };
  const businessAt = e => {
    const [u, v] = pxAt(e);
    let best = null, bd = Infinity;
    for (const b of [...Object.values(game.state.businesses), ...(game.state.banditCamps || [])]) {
      if (b.kind === 'bandit_camp' ? !layers.businesses : !MARK[b.kind] || (b.kind.startsWith('police') ? !layers.police : !layers.businesses)) continue;
      const [bu, bv] = toMap(b.x, b.z), d = (bu - u) ** 2 + (bv - v) ** 2;
      const radius = 10 * Math.sqrt(zoom) * (b.kind === 'bandit_camp' && b.members.length > 2 ? 1.5 : 1);
      if (d < radius * radius && d < bd) { bd = d; best = b; }
    }
    return best;
  };
  if (onHover) {
    // a business under the mouse, else the quarter it is in (big map hover)
    const quarterAt = e => { const p = at(e); return game.territory?.quarters.find(q => p.x >= q.box[0] && p.z >= q.box[1] && p.x <= q.box[2] && p.z <= q.box[3]) || null; };
    canvas.addEventListener('mousemove', e => {
      if (layers.deployment && overlay?.hover(at(e), e)) return;
      const b = businessAt(e); onHover(b, e, b ? null : quarterAt(e));
    });
    canvas.addEventListener('mouseleave', e => { overlay?.hover(null, e); onHover(null, e); });
  }
  canvas.addEventListener('mousedown', e => {
    e.stopPropagation();
    e.preventDefault();
    const p = at(e);
    if (e.button === 0 && layers.deployment && overlay?.pick(p, e)) return;
    // big map: a click looks there (a business: its door) and closes the map
    if (e.button === 0 && onPick) { const b = businessAt(e); const q = b?.ring ? { x: b.ring[0], z: b.ring[1] } : b || p; view.lookAt(q.x, q.z); onPick(); return; }
    if (e.button === 0) { dragging = true; view.lookAt(p.x, p.z); }
    if (e.button === 2) {
      const units = selected();
      if (units.length) send({ id: heroId, type: 'order', units, kind: e.ctrlKey ? 'station' : 'move', place: 'street', x: p.x, z: p.z });
    }
  });
  addEventListener('mousemove', e => { if (dragging) { const p = at(e); view.lookAt(p.x, p.z); } });
  addEventListener('mouseup', () => { dragging = false; });

  let frame = 0;
  const pings = [];
  return { worldAt: at, zoomBy(factor) { mapZoom = Math.max(1, Math.min(4, mapZoom * factor)); k = baseScale * mapZoom; draw(); return mapZoom; }, update() { if (frame++ % 3 === 0) draw(); }, draw,
    ping(x,z){const t=performance.now();while(pings.length&&(pings.length>=64||t-pings[0].t>=4800))pings.shift();pings.push({x,z,t});},
    diagnostics:()=>({...metrics,pings:pings.length,terrainBytes:base.byteLength,rasterBytes:img.data.byteLength}), layers, size, shownHolder: q => shownHolder(q) };
}
