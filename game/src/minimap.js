// Minimap, top right: the district turned to match the screen, with the same fog of war,
// a letter on each business (W warehouse, T teahouse, D den, C clinic, P police, H hideout, J the Shinobi dojo; on its owner's colour once seen),
// dots for units your clan can see, your businesses outlined and a box for the camera's view.
// Left-click (or drag) moves the camera there; right-click sends the selected crew there
// (Ctrl: hold there), like right-clicking the ground. Only reads the state and sends commands.
// Territory (sim/territory.js) shows as a tint in each clan's colour (a rival's once you have seen
// its business), a whole held quarter as a box. The same code draws the full game map (M,
// src/game_map.js): big = true, with layer switches (layers), hover info (onHover) and a click
// that looks there and closes it (onPick).
import { shapeDistance, groundZone } from './sim/geometry.js';
import { drawWatchMarkers } from './watch_markers.js';

const GROUND = {
  grass: [78, 96, 58], dirt: [122, 104, 78], dry_grass: [130, 120, 76], mud: [84, 70, 54], sand: [176, 160, 122],
  water: [40, 66, 84], planks: [110, 82, 56], gravel: [128, 124, 116], paving: [146, 138, 124],
};
const BUILDING = [62, 50, 46];
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
  const zones = district.ground.map(groundZone);
  const base = new Uint8ClampedArray(g.w * g.h * 3);
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    const x = g.minX + i + 0.5, z = g.minZ + j + 0.5;
    let c = GROUND.grass;
    for (const zone of zones) if (shapeDistance(zone.shape, x, z) >= 0) c = GROUND[zone.type] || c;
    for (const s of game.scenery) {
      const r = s.item?.kind === 'buildings' && !s.indoor && s.solid;
      if (r && x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) c = BUILDING;
    }
    base.set(c, (j * g.w + i) * 3);
  }
  const img = new ImageData(g.w, g.h), cells = document.createElement('canvas');
  cells.width = g.w; cells.height = g.h;
  const cctx = cells.getContext('2d');

  // the same fog as the screen: never explored near black, explored dimmed and greyed
  // territory tint per cell ([r, g, b, alpha] or null), rebuilt when owners or what you have seen change
  let turf = null, turfKey = null;
  const rgb = hex => { const v = parseInt(String(hex).replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  function territoryTint() {
    const t = game.territory, st = game.state;
    if (!t || !layers.territory) { turf = null; turfKey = null; return; }
    const tg = t.cellGrid(), vg = game.vision.grid(clan);
    // a rival's area shows once you have seen its business (Tim 2026-10-19 rule for owner colours)
    const shown = tg.areas.map(a => a.clan === clan || !fogOn() || vg.explored[game.vision.cellOf(a.x, a.z)] === 1);
    const key = tg.areas.map((a, i) => `${a.business}:${a.clan}:${shown[i]}`).join(',');
    if (key === turfKey) return;
    turfKey = key;
    turf = new Array(g.w * g.h).fill(null);
    const cols = tg.areas.map(a => rgb(st.clans?.[a.clan]?.color || '#888888'));
    const at = n => { const c = tg.cells[n]; return c && shown[c - 1] ? tg.areas[c - 1].clan : null; };
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const n = j * g.w + i, c = tg.cells[n];
      if (!c || !shown[c - 1]) continue;
      const own = tg.areas[c - 1].clan;
      // the edge of a clan's territory drawn stronger
      const edge = i === 0 || j === 0 || i === g.w - 1 || j === g.h - 1 || at(n - 1) !== own || at(n + 1) !== own || at(n - g.w) !== own || at(n + g.w) !== own;
      turf[n] = [...cols[c - 1], edge ? 0.7 : 0.22];
    }
  }
  function paintCells() {
    territoryTint();
    const fog = fogOn(), d = img.data;
    for (let n = 0; n < g.w * g.h; n++) {
      const r = base[n * 3], gg = base[n * 3 + 1], b = base[n * 3 + 2];
      const vis = fog ? g.visible[n] : 1, exp = fog ? g.explored[n] : 1;
      let o = [r, gg, b];
      if (!vis) {
        const l = r * 0.299 + gg * 0.587 + b * 0.114;
        o = exp ? [(l + (r - l) * 0.55) * 0.5 + 4, (l + (gg - l) * 0.55) * 0.5 + 5, (l + (b - l) * 0.55) * 0.5 + 10] : [7, 8, 11];
      }
      const t = turf && turf[n];
      if (t) { const a = t[3]; o = [o[0] + (t[0] - o[0]) * a, o[1] + (t[1] - o[1]) * a, o[2] + (t[2] - o[2]) * a]; }
      d[n * 4] = o[0]; d[n * 4 + 1] = o[1]; d[n * 4 + 2] = o[2]; d[n * 4 + 3] = 255;
    }
    cctx.putImageData(img, 0, 0);
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

  function draw() {
    if (canvas.clientWidth && canvas.clientWidth !== size) {
      size = canvas.clientWidth; zoom = Math.max(1, size / 180);
      baseScale = size / ((g.w + g.h) * S) * 1.02; k = baseScale * mapZoom;
      canvas.width = canvas.height = Math.round(size * dpr);
    }
    const nowMs = performance.now();
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
    if (layers.deployment) overlay?.ground({ ctx, toMap, size, zoom, now: nowMs });
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
  return { zoomBy(factor) { mapZoom = Math.max(1, Math.min(4, mapZoom * factor)); k = baseScale * mapZoom; draw(); return mapZoom; }, update() { if (frame++ % 3 === 0) draw(); }, draw, ping(x, z) { pings.push({ x, z, t: performance.now() }); }, layers, size, shownHolder: q => shownHolder(q) };
}
