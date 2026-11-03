// Atlas presentation reads authored geometry and the same biome field as the ground renderer.
// No simulation state or placement is changed here. Glyphs feed both the canvas and its key.
import { createPaint } from './world_paint.js';
import { terrainAt } from './sim/world_data.js';

export const ATLAS_LAYERS = [
  { id: 'routes', label: 'Routes', on: true },
  { id: 'sites', label: 'Sites & towns', on: true },
  { id: 'camps', label: 'Camps & ruins', on: false },
  { id: 'resources', label: 'Resources', on: false },
  { id: 'crossings', label: 'Crossings & passes', on: true },
  { id: 'biomes', label: 'Biome tint', on: false },
  { id: 'grid', label: 'Grid', on: false },
];
const circle = r => ({ circle: r });
const line = (...points) => ({ points });
const polygon = (...points) => ({ points, closed: true });
export const ATLAS_MARKERS = {
  site: { label: 'Site', layer: 'sites', color: '#f3d67d', glyph: [circle(5)] },
  town: { label: 'Town', layer: 'sites', color: '#fff1d3', glyph: [polygon([-6,-6],[6,-6],[6,6],[-6,6])], hollow: true },
  camp: { label: 'Camp / ruin / cache', layer: 'camps', color: '#df8266', glyph: [polygon([0,-6],[6,5],[-6,5])] },
  resource: { label: 'Resource', layer: 'resources', color: '#b6dbc0', glyph: [polygon([0,-5],[5,0],[0,5],[-5,0])] },
  bridge: { label: 'Bridge', layer: 'crossings', color: '#f1e4bb', glyph: [line([-4,-5],[-4,5]),line([4,-5],[4,5]),line([-4,0],[4,0])], hollow: true },
  ford: { label: 'Ford', layer: 'crossings', color: '#9dd3de', glyph: [line([-4,-4],[4,4]),line([4,-4],[-4,4])], hollow: true },
  pass: { label: 'Mountain pass', layer: 'crossings', color: '#e4d6bb', glyph: [polygon([0,-5],[5,0],[0,5],[-5,0])], hollow: true },
  capital: { label: 'The Capital', color: '#d45d49', glyph: [circle(8),circle(4)], hollow: true },
  hero: { label: 'You', color: '#75ecae', glyph: [polygon([0,-8],[6,5],[0,2],[-6,5])] },
  pin: { label: 'Your pin', color: '#f9a2d7', glyph: [circle(5)], hollow: true },
};
export function atlasGlyphSVG(kind) {
  const s = ATLAS_MARKERS[kind];
  return `<svg viewBox="-11 -11 22 22" width="20" height="20" aria-hidden="true" style="color:${s.color}">` + s.glyph.map(g => g.circle
    ? `<circle cx="0" cy="0" r="${g.circle}"/>`
    : `<path d="M${g.points.map(p => p.join(',')).join(' L')}${g.closed ? ' Z' : ''}"/>`).join('')
    .replaceAll('/>', ` fill="${s.hollow ? 'none' : 'currentColor'}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`) + '</svg>';
}
export function drawAtlasGlyph(ctx, kind, x, y, hollow = false) {
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
const titleCase = s => String(s).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
export function atlasFeatureName(it) {
  if (!it) return '';
  if (it.kind === 'pin') return it.note || 'Your pin';
  if (it.kind === 'resource') return `${titleCase(it.featureKind)} · ${it.id}`;
  if (it.kind === 'camp') return `${it.featureKind === 'bandit' ? 'Bandit camp' : titleCase(it.featureKind)} · ${it.id}`;
  return it.name || `${ATLAS_MARKERS[it.kind]?.label || titleCase(it.kind)}${it.id ? ' · ' + it.id : ''}`;
}
export function atlasItems(world, st, layers, known) {
  const records = [];
  const add = (list, kind) => { if (!layers[ATLAS_MARKERS[kind].layer]) return; for (const it of list || []) if (known(it.x,it.z)) records.push({ ...it, featureKind: it.kind, kind }); };
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
