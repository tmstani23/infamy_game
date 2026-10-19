// Minimap, top right: the district turned to match the screen, with the same fog of war,
// a letter on each business (W warehouse, T teahouse, D den, C clinic, P police),
// dots for units your clan can see, your businesses outlined and a box for the camera's view.
// Left-click (or drag) moves the camera there; right-click sends the selected crew there
// (Ctrl: hold there), like right-clicking the ground. Only reads the state and sends commands.
import { shapeDistance, groundZone } from './sim/geometry.js';

const GROUND = {
  grass: [78, 96, 58], dirt: [122, 104, 78], dry_grass: [130, 120, 76], mud: [84, 70, 54], sand: [176, 160, 122],
  water: [40, 66, 84], planks: [110, 82, 56], gravel: [128, 124, 116], paving: [146, 138, 124],
};
const BUILDING = [62, 50, 46];
const MARK = { warehouse: 'W', teahouse: 'T', gambling_den: 'D', clinic: 'C', police_box: 'P', police_hq: 'P' };
const S = Math.SQRT1_2;

export function createMinimap({ canvas, game, district, view, fog, heroId, clan = 'player', selected, send }) {
  const g = game.vision.grid(clan);
  const midX = g.minX + g.w / 2, midZ = g.minZ + g.h / 2;
  const size = canvas.clientWidth || 180;
  const k = size / ((g.w + g.h) * S) * 1.02;   // the turned district fills the box
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
  function paintCells() {
    const fog = fogOn(), d = img.data;
    for (let n = 0; n < g.w * g.h; n++) {
      const r = base[n * 3], gg = base[n * 3 + 1], b = base[n * 3 + 2];
      const vis = fog ? g.visible[n] : 1, exp = fog ? g.explored[n] : 1;
      let o = [r, gg, b];
      if (!vis) {
        const l = r * 0.299 + gg * 0.587 + b * 0.114;
        o = exp ? [(l + (r - l) * 0.55) * 0.5 + 4, (l + (gg - l) * 0.55) * 0.5 + 5, (l + (b - l) * 0.55) * 0.5 + 10] : [7, 8, 11];
      }
      d[n * 4] = o[0]; d[n * 4 + 1] = o[1]; d[n * 4 + 2] = o[2]; d[n * 4 + 3] = 255;
    }
    cctx.putImageData(img, 0, 0);
  }
  const fogOn = () => fog.isOn();

  function dot(x, z, color, r) {
    const [u, v] = toMap(x, z);
    ctx.beginPath(); ctx.arc(u, v, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.stroke();
  }

  function colorOf(e, me) {
    if (e.id === heroId) return ['#ffcd50', 3.4];
    if (e.owner === me) return ['#50d2c8', 2.4];
    if (e.type === 'civilian') return ['#ebe8dc', 1.5];
    if (e.wild) return (e.angry?.[me] ?? -1) > game.state.tick ? ['#ff4632', 2.4] : ['#ff9a46', 2.2];
    return ['#ff4632', 2.6];
  }

  function draw() {
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
    // every business, as a letter, even under the fog so you can find them (W warehouse, T teahouse, D den, C clinic, P police)
    ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of Object.values(game.state.businesses)) {
      const letter = MARK[b.kind];
      if (!letter) continue;
      const [u, v] = toMap(b.x, b.z);
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(u - 4.5, v - 4.5, 9, 9);
      ctx.fillStyle = b.kind.startsWith('police') ? '#8fb4ff' : b.kind === 'clinic' ? '#8fe08f' : '#ffe2a0';
      ctx.fillText(letter, u, v + 0.5);
    }
    // your businesses
    ctx.strokeStyle = '#ffcd50'; ctx.lineWidth = 1.2;
    for (const b of Object.values(game.state.businesses)) {
      if (b.owner !== clan) continue;
      const [u, v] = toMap(b.x, b.z);
      ctx.strokeRect(u - 4, v - 4, 8, 8);
    }
    // units on the street that you can see (yours on top)
    const list = Object.values(state.entities).filter(e => e.place === 'street' && !e.dead)
      .sort((a, b) => (a.owner === clan) - (b.owner === clan) || (a.id === heroId) - (b.id === heroId));
    for (const e of list) {
      const [c, r] = colorOf(e, clan);
      ctx.globalAlpha = e.downed ? 0.45 : 1;
      dot(e.x, e.z, c, r);
    }
    ctx.globalAlpha = 1;
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
  canvas.addEventListener('mousedown', e => {
    e.stopPropagation();
    e.preventDefault();
    const p = at(e);
    if (e.button === 0) { dragging = true; view.lookAt(p.x, p.z); }
    if (e.button === 2) {
      const units = selected();
      if (units.length) send({ id: heroId, type: 'order', units, kind: e.ctrlKey ? 'station' : 'move', x: p.x, z: p.z });
    }
  });
  addEventListener('mousemove', e => { if (dragging) { const p = at(e); view.lookAt(p.x, p.z); } });
  addEventListener('mouseup', () => { dragging = false; });

  let frame = 0;
  return { update() { if (frame++ % 3 === 0) draw(); } };
}
