// Atlas presentation reads authored geometry and the same biome field as the ground renderer.
// No simulation state or placement is changed here. Glyphs feed both the canvas and its key.
import { createPaint } from './world_paint.js';
import { terrainAt } from './sim/world_data.js';
import { RICH_NAME } from './sim/resource_spots.js';
import { mapTint } from './rail_map.js';
import { drawMapSymbol, mapSymbolImg } from './map_symbols.js';

export const ATLAS_LAYERS = [
  { id: 'routes', label: 'Routes', on: true },
  { id: 'sites', label: 'Sites & towns', on: true },
  { id: 'camps', label: 'Camps & ruins', on: false },
  { id: 'resources', label: 'Resources', on: false },
  { id: 'crossings', label: 'Crossings & passes', on: true },
  { id: 'names', label: 'Zone names', on: true },
  { id: 'biomes', label: 'Biome tint', on: false },
  { id: 'grid', label: 'Grid', on: false },
];
// Dev builds only, view only (no sim state): shows every feature regardless of fog. Remove when exploring is tuned.
export const ATLAS_DEV_LAYERS = [{ id: 'revealAll', label: 'Show everything (test)', on: false }];
const circle = r => ({ circle: r });
const line = (...points) => ({ points });
const polygon = (...points) => ({ points, closed: true });
// town marker (2026-11-21, mock town_marker_mock.png B): a little house badge, drawn in its owner's clan colour
const TOWN_HOUSE = polygon([0,-7],[6,-1],[5,-1],[5,6],[-5,6],[-5,-1],[-6,-1]);
export const ATLAS_MARKERS = {
  site: { label: 'Site', layer: 'sites', color: '#f3d67d', glyph: [circle(5)] },
  town: { label: 'Town', layer: 'sites', color: '#fff1d3', glyph: [TOWN_HOUSE], hollow: true },
  camp: { label: 'Camp / ruin / cache', layer: 'camps', color: '#df8266', glyph: [polygon([0,-6],[6,5],[-6,5])] },
  resource: { label: 'Resource', layer: 'resources', color: '#b6dbc0', glyph: [polygon([0,-5],[5,0],[0,5],[-5,0])] },
  bridge: { label: 'Bridge', layer: 'crossings', color: '#f1e4bb', glyph: [line([-4,-5],[-4,5]),line([4,-5],[4,5]),line([-4,0],[4,0])], hollow: true },
  ford: { label: 'Ford', layer: 'crossings', color: '#9dd3de', glyph: [line([-4,-4],[4,4]),line([4,-4],[-4,4])], hollow: true },
  pass: { label: 'Mountain pass', layer: 'crossings', color: '#e4d6bb', glyph: [polygon([0,-5],[5,0],[0,5],[-5,0])], hollow: true },
  capital: { label: 'The Capital', color: '#d45d49', glyph: [circle(8),circle(4)], hollow: true },
  hero: { label: 'You', color: '#75ecae', glyph: [polygon([0,-8],[6,5],[0,2],[-6,5])] },
  pin: { label: 'Your pin', color: '#f9a2d7', glyph: [circle(5)], hollow: true },
};
// the capital's key entry is a small copy of its seal
const CAPITAL_SVG = '<svg viewBox="-12 -12 24 24" width="20" height="20" aria-hidden="true">'
  + [0,1,2,3,4,5,6,7].map(i => { const a = (i + .5) * Math.PI / 4, c = Math.cos(a), s = Math.sin(a); return `<line x1="${(c*6.5).toFixed(1)}" y1="${(s*6.5).toFixed(1)}" x2="${(c*10.5).toFixed(1)}" y2="${(s*10.5).toFixed(1)}" stroke="#d9b56a" stroke-width="1.4" stroke-linecap="round"/><line x1="0" y1="0" x2="${(c*6).toFixed(1)}" y2="${(s*6).toFixed(1)}" stroke="#d9b56a" stroke-width=".7"/>`; }).join('')
  + '<circle r="6.3" fill="none" stroke="#d9b56a" stroke-width="1.5"/><circle r="2" fill="#d9b56a"/><circle r="1" fill="#5e3f16"/></svg>';
// feature kinds drawn as ink chart symbols (map_symbols.js); camps pick theirs from what they are
const SYMBOL_OF = { site: 'site', pass: 'pass', bridge: 'bridge', ford: 'ford', camp: 'bandit', pin: 'pin', hero: 'hero' };
export function atlasGlyphSVG(kind) {
  if (kind === 'capital') return CAPITAL_SVG;
  if (kind === 'town' && typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = c.height = 40; const g = c.getContext('2d'); g.scale(2, 2); drawTownBadge(g, 10, 10); return `<img src="${c.toDataURL()}" width="20" height="20" alt="" aria-hidden="true">`; }
  if (kind === 'camp') return mapSymbolImg('bandit') + mapSymbolImg('ruin') + mapSymbolImg('cache');
  if (SYMBOL_OF[kind]) return mapSymbolImg(SYMBOL_OF[kind]);
  const s = ATLAS_MARKERS[kind];
  return `<svg viewBox="-11 -11 22 22" width="20" height="20" aria-hidden="true" style="color:${s.color}">` + s.glyph.map(g => g.circle
    ? `<circle cx="0" cy="0" r="${g.circle}"/>`
    : `<path d="M${g.points.map(p => p.join(',')).join(' L')}${g.closed ? ' Z' : ''}"/>`).join('')
    .replaceAll('/>', ` fill="${s.hollow ? 'none' : 'currentColor'}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`) + '</svg>';
}
export function drawAtlasGlyph(ctx, kind, x, y, hollow = false, featureKind = null) {
  if (SYMBOL_OF[kind]) return drawMapSymbol(ctx, kind === 'camp' ? (['ruin', 'cache'].includes(featureKind) ? featureKind : 'bandit') : SYMBOL_OF[kind], x, y, { faded: hollow });
  const s = ATLAS_MARKERS[kind];
  ctx.save(); ctx.translate(x, y); ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // A dark outline keeps small symbols readable over the painting without opaque map labels.
  ctx.shadowColor = '#15282b'; ctx.shadowBlur = 3; ctx.strokeStyle = ctx.fillStyle = s.color;
  for (const g of s.glyph) {
    ctx.beginPath();
    if (g.circle) ctx.arc(0, 0, g.circle, 0, Math.PI * 2);
    else { g.points.forEach(([a,b], i) => i ? ctx.lineTo(a,b) : ctx.moveTo(a,b)); if (g.closed) ctx.closePath(); }
    if (!s.hollow && !hollow) ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
// Town badge on the World map (2026-11-21, mock town_marker_mock_v2.png): a round cream seal rimmed in the owner's
// clan colour, holding a two-tier curved roof in that colour over dark walls and a lit door. Yours are bigger, glow in your
// colour and carry a gold ring, so they stand out from rivals'.
export function drawTownBadge(ctx, x, y, color = ATLAS_MARKERS.town.color, mine = false) {
  const r = mine ? 15 : 11, u = r / 10, TAU = Math.PI * 2;
  color = mapTint(color);   // toned to the map's palette
  const disc = rad => { ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU); };
  const roof = (y0, hw, h) => {   // eaves lift at the tips
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) { const t = i / 20, lift = Math.abs(t - 0.5) ** 3 * 8 * 1.6 * u; ctx.lineTo(-hw + 2 * hw * t, y0 - lift); }
    ctx.lineTo(hw * 0.45, y0 - h); ctx.lineTo(-hw * 0.45, y0 - h); ctx.closePath(); ctx.fill();
  };
  ctx.save(); ctx.translate(x, y);
  if (mine) { ctx.globalAlpha = 0.6; ctx.shadowColor = color; ctx.shadowBlur = 9; ctx.fillStyle = color; disc(r + 2); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.shadowColor = 'rgba(15,28,30,.8)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.fillStyle = color; disc(r); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ecdcb4'; disc(r - 2.2 * u); ctx.fill();
  if (mine) { ctx.strokeStyle = '#c9a253'; ctx.lineWidth = 1.5; disc(r + 1.3); ctx.stroke(); }
  ctx.fillStyle = '#261a14'; ctx.fillRect(-4.2 * u, -0.5 * u, 8.4 * u, 5.7 * u);     // walls
  ctx.fillStyle = '#dcae5c'; ctx.fillRect(-1 * u, 1.8 * u, 2 * u, 3.4 * u);           // lit door
  ctx.fillStyle = color; roof(-0.2 * u, 7.2 * u, 3 * u);
  ctx.fillStyle = '#261a14'; ctx.fillRect(-2.6 * u, -4.6 * u, 5.2 * u, 1.6 * u);
  ctx.fillStyle = color; roof(-3.6 * u, 4.6 * u, 2.6 * u);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, 0.9 * u); ctx.beginPath(); ctx.moveTo(0, -6.2 * u); ctx.lineTo(0, -7.6 * u); ctx.stroke();
  ctx.restore();
}
// The Capital (2026-11-23): an engraved brass ship's wheel, a little bigger than a castle mark, in the manner of an
// old sea chart: eight spokes to a red hub inside a double rim, eight turned handles, a faint see-through warm glow
// and its name in the map serif beside it, like the castles.
export function drawCapitalBadge(ctx, x, y, { label = true, scale = 1 } = {}) {
  const k = scale * 1.15, R = 8.5 * k, L = 13 * k, TAU = Math.PI * 2, INK = 'rgba(18,11,7,.95)', BRASS = '#d9b56a', DARK = '#8a6528';
  const disc = r => { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); };
  ctx.save(); ctx.translate(x, y);
  const halo = ctx.createRadialGradient(0, 0, R * 0.5, 0, 0, L * 1.7);
  halo.addColorStop(0, 'rgba(255,190,100,.28)'); halo.addColorStop(1, 'rgba(255,170,80,0)');
  ctx.fillStyle = halo; disc(L * 1.7); ctx.fill();
  const ang = i => i * TAU / 8 + TAU / 16;
  ctx.lineCap = 'round';
  // ink under everything, so it reads on light and dark ground
  ctx.strokeStyle = INK; ctx.lineWidth = 2.6 * k;
  for (let i = 0; i < 8; i++) { const c = Math.cos(ang(i)), s = Math.sin(ang(i)); ctx.beginPath(); ctx.moveTo(c * R, s * R); ctx.lineTo(c * L, s * L); ctx.stroke(); }
  ctx.fillStyle = INK; disc(R + 1.3 * k); ctx.fill();
  for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(Math.cos(ang(i)) * L, Math.sin(ang(i)) * L, 1.9 * k, 0, TAU); ctx.fill(); }
  // handles: turned brass, a bead near the rim and a knob at the tip
  for (let i = 0; i < 8; i++) { const c = Math.cos(ang(i)), s = Math.sin(ang(i));
    ctx.strokeStyle = BRASS; ctx.lineWidth = 1.1 * k; ctx.beginPath(); ctx.moveTo(c * R, s * R); ctx.lineTo(c * (L - 1 * k), s * (L - 1 * k)); ctx.stroke();
    ctx.fillStyle = BRASS; ctx.beginPath(); ctx.arc(c * (R + 1.8 * k), s * (R + 1.8 * k), 0.95 * k, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(c * L, s * L, 1.25 * k, 0, TAU); ctx.fill(); }
  // field, spokes, hub, double rim
  ctx.fillStyle = 'rgba(30,18,11,.9)'; disc(R); ctx.fill();
  ctx.strokeStyle = DARK; ctx.lineWidth = 0.9 * k;
  for (let i = 0; i < 8; i++) { const c = Math.cos(ang(i)), s = Math.sin(ang(i)); ctx.beginPath(); ctx.moveTo(c * 2.2 * k, s * 2.2 * k); ctx.lineTo(c * R, s * R); ctx.stroke(); }
  ctx.strokeStyle = BRASS; ctx.lineWidth = 0.55 * k;
  for (let i = 0; i < 8; i++) { const c = Math.cos(ang(i)), s = Math.sin(ang(i)); ctx.beginPath(); ctx.moveTo(c * 2.2 * k, s * 2.2 * k); ctx.lineTo(c * R, s * R); ctx.stroke(); }
  ctx.strokeStyle = BRASS; ctx.lineWidth = 1.5 * k; disc(R - 0.6 * k); ctx.stroke();
  ctx.lineWidth = 0.5 * k; disc(R - 2.6 * k); ctx.stroke();
  ctx.fillStyle = BRASS; disc(2.4 * k); ctx.fill();
  ctx.fillStyle = '#5e3f16'; disc(1.3 * k); ctx.fill();
  if (label) {
    ctx.font = `600 ${Math.round(12 * scale)}px Georgia, serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,17,14,0.9)'; ctx.strokeText('The Capital', L + 5 * k, 0.5);
    ctx.fillStyle = '#f3e9cf'; ctx.fillText('The Capital', L + 5 * k, 0.5);
  }
  ctx.restore();
}
const titleCase = s => String(s).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
export function atlasFeatureName(it) {
  if (!it) return '';
  if (it.kind === 'pin') return it.note || 'Your pin';
  if (it.kind === 'resource') return `${RICH_NAME[it.featureKind] || titleCase(it.featureKind)} no. ${parseInt(String(it.id).replace(/\D+/g, ''), 10) || it.id}`;
  if (it.kind === 'camp') return `${it.featureKind === 'bandit' ? 'Bandit camp' : titleCase(it.featureKind)} no. ${parseInt(String(it.id).replace(/\D+/g, ''), 10) || it.id}`;
  return it.name || `${ATLAS_MARKERS[it.kind]?.label || titleCase(it.kind)}${it.id ? ' · ' + it.id : ''}`;
}
export function atlasItems(world, st, layers, known) {
  const records = [];
  // sites the surveyor reported (2026-11-06 20:45) and the nodes around them show through the fog
  const told = new Set(st.knownSites || []), near = (st.knownAt || []), surveyed = (it, kind) => kind === 'site' ? told.has(it.id) : kind === 'resource' && near.some(p => Math.hypot(p.x - it.x, p.z - it.z) <= p.r);
  const add = (list, kind) => { if (!layers[ATLAS_MARKERS[kind].layer] && !layers.revealAll) return; for (const it of list || []) if (known(it.x,it.z) || surveyed(it, kind)) records.push({ ...it, featureKind: it.kind, kind }); };
  add(world.sites, 'site'); add(world.nodes, 'resource'); add(world.camps, 'camp');
  // Geographic crossings are part of the full atlas, independent of site exploration.
  // Keep them in this shared list so the symbols, key and hover all agree.
  if (layers.crossings) {
    for (const it of world.passes || []) records.push({ ...it, kind: 'pass' });
    for (const it of world.fords || []) records.push({ ...it, kind: it.kind === 'bridge' ? 'bridge' : 'ford' });
  }
  // Settlements have already been filtered by the authoritative snapshot; they win over their site.
  if (layers.sites) for (const t of st.towns || []) records.push({ ...t, kind: 'town' });
  records.push({ ...world.capital, kind: 'capital', name: 'The Capital' });
  for (const p of st.pins || []) records.push({ ...p, kind: 'pin' });
  return records;
}

export function atlasRegionAt(world, x, z) {
  return (world.regions || []).find(r => x>=r.box[0] && z>=r.box[1] && x<r.box[2] && z<r.box[3]) || null;
}
// Labels stay inside their source zone, clear of symbols and each other. Small views omit
// labels that cannot fit; exact zone hover remains available at every zoom level.
export function atlasZoneLabels(world, project, measure, viewport, obstacles = []) {
  const labels=[], occupied=[...obstacles], lineHeight=14;
  const overlaps=(a,b)=>a.left<b.right+5 && a.right>b.left-5 && a.top<b.bottom+5 && a.bottom>b.top-5;
  for (const region of world.regions || []) {
    const [x0,z0,x1,z1]=region.box, a=project(x0,z0), b=project(x1,z1);
    const maxWidth=Math.min(190,b.px-a.px-16);
    const lines=[]; let text='';
    for (const word of region.name.split(/\s+/)) {
      if (measure(word)>maxWidth) { lines.length=0; text=''; break; }
      if (text && measure(text+' '+word)>maxWidth) { lines.push(text); text=word; } else text=text ? text+' '+word : word;
    }
    if (text) lines.push(text);
    if (!lines.length || lines.length>2) continue;
    const width=Math.max(...lines.map(measure)), height=lines.length*lineHeight;
    for (const offset of [0,-.22,.22]) {
      const px=(a.px+b.px)/2, py=(a.py+b.py)/2+(b.py-a.py)*offset;
      const box={left:px-width/2-3,right:px+width/2+3,top:py-height/2-2,bottom:py+height/2+2};
      if (box.left<Math.max(a.px+4,viewport.left) || box.right>Math.min(b.px-4,viewport.right) || box.top<Math.max(a.py+4,viewport.top) || box.bottom>Math.min(b.py-4,viewport.bottom) || occupied.some(it=>overlaps(box,it))) continue;
      labels.push({region,lines,px,py,box,lineHeight}); occupied.push(box); break;
    }
  }
  return labels;
}

const BIOMES = {
  jungle: ['Jungle','#416a4d'], forest: ['Forest','#648568'], plain: ['Grassland','#c1bc7d'], hills: ['Hills','#ac9570'],
  marsh: ['Marsh','#739b8a'], dry: ['Drylands','#d8ac71'], snow: ['Snowfields','#e5e7de'],
  top_forest: ['Forested mountains','#667769'], top_snow: ['Snowy mountains','#ced9db'], top_dry: ['Dry mountains','#b49b82'],
  bank: ['Water','#588eaa'], snowedge: ['Snow edge','#bdc9ad'],
};
export function createAtlasBiomes(world, cfg) {
  if (!cfg) return { at: (x,z) => ({ name: titleCase(world.terrain.codes[terrainAt(world,x,z)] || 'Water'), color: '#a9b9a0' }) };
  const paint = createPaint(world,cfg), weights = new Float32Array(cfg.biomes.length);
  return { at(x,z) {
    paint.fieldAt(x,z,weights); let best = 0;
    for (let i=1;i<weights.length;i++) if (weights[i]>weights[best]) best=i;
    const id=cfg.biomes[best], pair=BIOMES[id] || [titleCase(id),'#a9b9a0'];
    return { id, name: pair[0], color: pair[1] };
  } };
}
