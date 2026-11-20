// Campaign zones on the World map (Z3, Tim 2026-11-19, mock zones_map_mock_v1.png): dashed borders between the six
// zones, a tint over a zone one clan holds, a label chip per zone (name, who holds it, your towns of the cap), the
// castles you know and the goal row. A rival's part shows only what your clan has discovered: a rival town counts once
// its ground is discovered, a rival castle likewise. A zone where you have a town uses the true holder (you know
// whether you hold it). Pure helpers first (Node tested, tools/test_zone_map.mjs); drawing needs a canvas.
import { createCampaignZones } from './sim/campaign_zones.js';

export const ZONE_YOU = '#e2b84a';
const YOU_TINT = '#f0a020', STEP = 50;

// what the player's clan knows of each zone
//   -> { rows: [{ id, name, holder, mine, cap, status, text, color, at }], castles: [{ x, z, mine, name, color }], goal: { held, need, near, text } }
export function zoneMapState({ rules, world, settlements, clans, clan, castleSpots = null, known = () => true }) {
  if (!rules?.zones?.length || !world) return null;
  const live = id => !!clans?.[id];
  const all = createCampaignZones({ rules, world, settlements: () => settlements, isClan: live });
  const cap = rules.townCap ?? 2, nameOf = id => clans?.[id]?.name || 'a rival clan';
  const rows = all.zones().map(z => {
    const towns = all.townsIn(z.id).filter(s => s.owner != null && live(s.owner));
    const mine = towns.filter(s => s.owner === clan).length;
    const seen = towns.filter(s => s.owner === clan || known(s.x, s.z));
    const owners = mine ? new Set(towns.map(s => s.owner)) : new Set(seen.map(s => s.owner));   // with a town there you know the truth
    const holder = owners.size === 1 ? [...owners][0] : null;
    const status = holder === clan ? 'you' : holder ? 'rival' : owners.size > 1 ? 'contested' : zoneKnown(world, all, z.id, known) ? 'free' : 'unknown';
    const text = status === 'you' ? 'Held by you' : status === 'rival' ? `Held by the ${nameOf(holder)}` : status === 'contested' ? 'Contested' : status === 'free' ? 'Free' : 'No towns known';
    return { id: z.id, name: z.name, holder, mine, cap, status, text, color: status === 'you' ? ZONE_YOU : status === 'rival' ? clans?.[holder]?.color || '#888888' : null, at: z.labelAt || null };
  });
  // castles: the spots where a clan's castle stands (a settlement with castle), yours always, a rival's once discovered
  const castles = Object.values(settlements || {}).filter(s => s.castle && Number.isFinite(s.x) && s.owner != null && (s.owner === clan || known(s.x, s.z)))
    .map(s => ({ x: s.x, z: s.z, mine: s.owner === clan, zone: all.zoneAt(s.x, s.z), name: s.owner === clan ? 'Your castle' : `${nameOf(s.owner).replace(/ clan$/, '')} castle`, color: s.owner === clan ? ZONE_YOU : clans?.[s.owner]?.color || '#888888' }));
  const need = rules.siege?.zonesNeeded ?? 4, held = all.held(clan);
  const near = castles.some(c => !c.mine && held.some(z => z === c.zone || all.touches(z, c.zone)));
  return { rows, castles, goal: { held: held.length, need, near, total: rows.length, text: `Hold ${need} of ${rows.length} zones, one next to a rival castle` } };
}
// has the clan seen a fair part of a zone (a third of its sampled land)? Then no known town reads as Free
function zoneKnown(world, zones, id, known) {
  let n = 0, k = 0;
  for (let z = 250; z < world.size.h; z += 500) for (let x = 250; x < world.size.w; x += 500) if (zones.zoneAt(x, z) === id) { n++; if (known(x, z)) k++; }
  return n > 0 && k * 3 >= n;
}

// --- drawing ----------------------------------------------------------------------------------------------------
const grids = new WeakMap();
// the zone of every STEP cell and the border segments between zones, worked out once per world
function zoneGrid(world, rules) {
  if (grids.has(world)) return grids.get(world);
  const zones = createCampaignZones({ rules, world }), ids = zones.zones().map(z => z.id);
  const w = Math.ceil(world.size.w / STEP), h = Math.ceil(world.size.h / STEP), cells = new Int8Array(w * h).fill(-1);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cells[j * w + i] = ids.indexOf(zones.zoneAt((i + 0.5) * STEP, (j + 0.5) * STEP));
  const segs = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const a = cells[j * w + i], e = i + 1 < w ? cells[j * w + i + 1] : -1, s = j + 1 < h ? cells[(j + 1) * w + i] : -1;
    if (a >= 0 && e >= 0 && a !== e) segs.push([(i + 1) * STEP, j * STEP, (i + 1) * STEP, (j + 1) * STEP]);
    if (a >= 0 && s >= 0 && a !== s) segs.push([i * STEP, (j + 1) * STEP, (i + 1) * STEP, (j + 1) * STEP]);
  }
  const g = { ids, w, h, cells, segs, tint: null, key: '' };
  grids.set(world, g);
  return g;
}
// under the map marks: the holder tint and the dashed borders, clipped to the land
export function drawZoneGround(ctx, world, rules, zs, project) {
  if (!zs || !world.coast?.length) return;
  const g = zoneGrid(world, rules), key = zs.rows.map(r => r.color || '-').join('|');
  if (g.key !== key || !g.tint) {
    g.tint ||= Object.assign(document.createElement('canvas'), { width: g.w, height: g.h });
    const c = g.tint.getContext('2d'); c.clearRect(0, 0, g.w, g.h);
    const col = g.ids.map(id => { const r = zs.rows.find(x => x.id === id); return r?.status === 'you' ? YOU_TINT : r?.color || null; });
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { const k = g.cells[j * g.w + i]; if (k >= 0 && col[k]) { c.fillStyle = col[k]; c.fillRect(i, j, 1, 1); } }
    g.key = key;
  }
  ctx.save();
  ctx.beginPath(); world.coast.forEach(([x, z], i) => { const p = project(x, z); i ? ctx.lineTo(p.px, p.py) : ctx.moveTo(p.px, p.py); }); ctx.closePath(); ctx.clip();
  const a = project(0, 0), b = project(g.w * STEP, g.h * STEP);
  ctx.globalAlpha = 0.3; ctx.imageSmoothingEnabled = false; ctx.drawImage(g.tint, a.px, a.py, b.px - a.px, b.py - a.py);
  ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true;
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(250,240,210,0.9)'; ctx.setLineDash([7, 5]); ctx.beginPath();
  for (const [x0, z0, x1, z1] of g.segs) { const p = project(x0, z0), q = project(x1, z1); ctx.moveTo(p.px, p.py); ctx.lineTo(q.px, q.py); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}
function chip(ctx, px, py, r) {
  const l3 = `Your towns ${r.mine} of ${r.cap}`;
  ctx.font = '600 15px Georgia, serif'; const w1 = ctx.measureText(r.name).width + (r.color ? 14 : 0);
  ctx.font = '12px Georgia, serif'; const w = Math.max(w1, ctx.measureText(r.text).width, ctx.measureText(l3).width) + 34;
  ctx.fillStyle = 'rgba(20,17,14,0.86)'; ctx.strokeStyle = r.color || 'rgba(214,180,90,0.7)'; ctx.lineWidth = r.color ? 2 : 1;
  ctx.beginPath(); ctx.roundRect(px - w / 2, py - 30, w, 60, 5); ctx.fill(); ctx.stroke();
  if (r.color) { const x = px - w / 2; ctx.fillStyle = r.color; ctx.beginPath(); ctx.moveTo(x + 8, py - 22); ctx.lineTo(x + 20, py - 22); ctx.lineTo(x + 20, py - 10); ctx.lineTo(x + 14, py - 5); ctx.lineTo(x + 8, py - 10); ctx.closePath(); ctx.fill(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#f3e9cf'; ctx.font = '600 15px Georgia, serif'; ctx.fillText(r.name, px + (r.color ? 6 : 0), py - 11);
  ctx.font = '12px Georgia, serif'; ctx.fillStyle = r.color || (r.status === 'contested' ? '#e58a6a' : '#c9bfa6'); ctx.fillText(r.text, px, py + 6);
  ctx.fillStyle = '#c9bfa6'; ctx.fillText(l3, px, py + 22);
}
function castleMark(ctx, px, py, c) {
  ctx.fillStyle = 'rgba(20,17,14,0.9)'; ctx.strokeStyle = c.color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.rect(px - 8, py - 6, 16, 12); ctx.fill(); ctx.stroke();
  for (const dx of [-8, -1.5, 5]) { ctx.beginPath(); ctx.rect(px + dx, py - 10, 3.5, 4); ctx.fill(); ctx.stroke(); }
  ctx.font = '600 12px Georgia, serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,17,14,0.9)'; ctx.strokeText(c.name, px + 13, py + 4);
  ctx.fillStyle = '#f3e9cf'; ctx.fillText(c.name, px + 13, py + 4);
}
// over the map marks: the zone chips and the castles you know
export function drawZoneLabels(ctx, zs, project) {
  if (!zs) return;
  ctx.save();
  for (const r of zs.rows) if (r.at) { const p = project(r.at[0], r.at[1]); chip(ctx, p.px, p.py, r); }
  for (const c of zs.castles) { const p = project(c.x, c.z); castleMark(ctx, p.px, p.py, c); }
  ctx.restore();
}
// fixed on the map's corner: the goal row with its bar
export function drawZoneGoal(ctx, zs, gx, gy) {
  if (!zs) return;
  const g = zs.goal, prog = `${Math.min(g.held, g.need)} of ${g.need}`;
  ctx.save();
  ctx.font = '600 13px Georgia, serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const gw = ctx.measureText(g.text).width + 120;
  ctx.fillStyle = 'rgba(20,17,14,0.9)'; ctx.strokeStyle = 'rgba(214,180,90,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(gx, gy, gw, 44, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f3e9cf'; ctx.fillText(g.text, gx + 12, gy + 18); ctx.fillStyle = ZONE_YOU; ctx.textAlign = 'right'; ctx.fillText(prog, gx + gw - 12, gy + 18);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(gx + 12, gy + 28, gw - 24, 6);
  ctx.fillStyle = ZONE_YOU; ctx.fillRect(gx + 12, gy + 28, (gw - 24) * Math.min(1, g.held / Math.max(1, g.need)), 6);
  ctx.restore();
}
