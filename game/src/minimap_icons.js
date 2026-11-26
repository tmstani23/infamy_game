// Island minimap building icons (2026-11-07): each major built building of a frontier town gets a small
// lettered badge, with its name on hover. Reads the frontier view only (state.frontier.settlements).
// Also the city business names for the minimap's hover label.
import { cellToWorld } from './sim/frontier/town_grid.js';

// type -> [badge letter, name, military?]; the rest (houses, farms, camps, quarries, workshops) are too minor to mark.
// Military buildings (2026-11-19): town and war camp, first letter, the first two where another badge has it;
// drawn with a red rim. Enemy ones only as your units last saw them (the snapshot sends remembered buildings only).
export const MAJOR_BUILDINGS = {
  town_hall: ['H', 'Town hall'],
  stable: ['Sb', 'Stable'],
  station: ['R', 'Railway station'],
  storehouse: ['D', 'Storage depot'],
  infirmary: ['I', 'Infirmary'],
  stockade: ['St', 'Stockade'],
  market: ['M', 'Market'],
  barracks: ['B', 'Barracks', true],
  armory: ['A', 'Armory', true],
  watchtower: ['W', 'Watchtower', true],
  cannon_tower: ['Ct', 'Cannon tower', true],   // ships S5
  rifle_range: ['Ri', 'Rifle range', true],
  supply_tents: ['Su', 'Supply tents', true],
  field_clinic: ['Fi', 'Field clinic', true],
  foundry: ['Fo', 'Foundry', true],
  clan_hall: ['Cl', 'Clan hall', true],
  kennel: ['Ke', 'Kennel', true],
  hidden_dojo: ['Hi', 'Hidden dojo', true],
  camp_hall: ['Ca', 'Camp hall', true],
  camp_station: ['R', 'Camp station'],
};
// a camp's stable and stockade count as military there
const CASTLE_WALL = new Set(['watchtower']);
const CAMP_MILITARY = new Set(['stable', 'stockade']);

export const CITY_NAMES = { pawnshop: 'Pawnshop', bathhouse: 'Bathhouse', sake_brewery: 'Sake brewery', manor: 'Manor', customs_house: 'Customs house', warehouse: 'Warehouse', teahouse: 'Teahouse', shop: 'Shop', tenements: 'Tenements', gambling_den: 'Gambling den', clinic: 'Clinic', police_box: 'Police box', police_hq: 'Police headquarters', moneylender: 'Moneylender', hideout: 'Hideout', dojo: 'Shinobi dojo' };

// the finished major buildings of every town in the snapshot: [{ x, z, type, letter, name, town, owner }]
export function majorBuildings(frontier) {
  const out = [];
  for (const s of Object.values(frontier?.settlements || {})) {
    // castles (2026-11-20): every castle gets its badges, but not its wall watchtowers; other capitals none
    if ((s.capital && !s.castle) || !s.grid || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    for (const b of s.buildings || []) {
      const info = MAJOR_BUILDINGS[b.type];
      if (!info || b.stage !== 'built' || (s.castle && CASTLE_WALL.has(b.type))) continue;
      const cells = (b.cells?.length ? b.cells : [b.cell]).filter(i => Number.isInteger(i));
      if (!cells.length) continue;
      const pts = cells.map(i => cellToWorld(s, i));
      out.push({ x: pts.reduce((a, p) => a + p[0], 0) / pts.length, z: pts.reduce((a, p) => a + p[1], 0) / pts.length,
        type: b.type, letter: info[0], name: info[1], military: !!info[2] || b.type === 'stockade', town: s.name, owner: s.owner });
    }
  }
  // war camps (2026-11-19): their finished buildings, by position
  for (const w of Object.values(frontier?.wars?.list || {})) {
    const camp = w.camp, t = frontier?.settlements?.[w.town];
    for (const b of camp?.buildings || []) {
      const info = MAJOR_BUILDINGS[b.type];
      if (!info || b.stage !== 'built' || !Number.isFinite(b.x) || !Number.isFinite(b.z)) continue;
      out.push({ x: b.x, z: b.z, type: b.type, letter: info[0], name: info[1], military: !!info[2] || CAMP_MILITARY.has(b.type),
        town: `War camp${t?.name ? ` at ${t.name}` : ''}`, owner: w.attacker });
    }
  }
  return out;
}

// one badge at pixel (u, v)
export function drawBuildingBadge(ctx, u, v, letter, color, size = 8, military = false) {
  ctx.save();
  const w = letter.length > 1 ? size * 1.5 : size;   // two letters: a wider badge
  ctx.fillStyle = color || 'rgba(0,0,0,.7)'; ctx.fillRect(u - w / 2, v - size / 2, w, size);
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.strokeRect(u - w / 2, v - size / 2, w, size);
  if (military) { ctx.lineWidth = 1.5; ctx.strokeStyle = '#d23a2a'; ctx.strokeRect(u - w / 2 - 1.5, v - size / 2 - 1.5, w + 3, size + 3); }
  ctx.font = `bold ${size - 1}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff4dc'; ctx.fillText(letter, u, v + 0.5);
  ctx.restore();
}

// Guide arrows (2026-11-20): a gold arrow on the minimap edge for each pin or goal spot outside the box.
// edgeArrow takes the target's minimap pixel and returns where the arrow sits on the inset edge and which way it points
// (null while the target is inside the box, where the regular pulse shows instead).
export function edgeArrow(u, v, size, inset = 10) {
  const c = size / 2, dx = u - c, dy = v - c, lim = c - inset, m = Math.max(Math.abs(dx), Math.abs(dy));
  if (m <= lim) return null;
  const t = lim / m;
  return { u: c + dx * t, v: c + dy * t, a: Math.atan2(dy, dx) };
}
export function drawGuideArrow(ctx, ar, s = 1) {
  ctx.save(); ctx.translate(ar.u, ar.v); ctx.rotate(ar.a); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, 5.5); ctx.lineTo(-2, 0); ctx.lineTo(-5, -5.5); ctx.closePath();
  ctx.fillStyle = 'rgba(255,205,80,.97)'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(40,24,0,.9)'; ctx.stroke();
  ctx.restore();
}

// train robbery (2026-11-20): where your hero last went down, and your own dropped stolen chest (sim/frontier/rail_robbery.js)
export function robberyMarks(state, clan) {
  const out = [], d = state?.clans?.[clan]?.lastDown;
  if (d) out.push({ kind: 'down', x: d.x, z: d.z, name: 'Where your hero last went down' });
  for (const c of Object.values(state?.frontier?.rail?.chests || {})) if (c.by === clan) out.push({ kind: 'chest', x: c.x, z: c.z, name: 'Your dropped stolen chest' });
  return out;
}
export function drawRobberyMark(ctx, m, u, v, s = 1) {
  ctx.save(); ctx.lineJoin = 'round';
  if (m.kind === 'down') {   // a red cross with a dark edge
    const r = 5 * s;
    ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(20,10,6,.9)'; ctx.lineWidth = 5 * s;
    ctx.beginPath(); ctx.moveTo(u - r, v - r); ctx.lineTo(u + r, v + r); ctx.moveTo(u + r, v - r); ctx.lineTo(u - r, v + r); ctx.stroke();
    ctx.strokeStyle = '#d8402c'; ctx.lineWidth = 2.6 * s; ctx.stroke();
  } else {   // a small brown chest with a gold edge and lid line
    const w = 11 * s, h = 8 * s;
    ctx.fillStyle = '#6a4626'; ctx.strokeStyle = 'rgba(20,10,6,.9)'; ctx.lineWidth = 3 * s;
    ctx.strokeRect(u - w / 2, v - h / 2, w, h); ctx.fillRect(u - w / 2, v - h / 2, w, h);
    ctx.strokeStyle = '#f0c85a'; ctx.lineWidth = 1.4 * s; ctx.strokeRect(u - w / 2, v - h / 2, w, h);
    ctx.beginPath(); ctx.moveTo(u - w / 2, v - h / 6); ctx.lineTo(u + w / 2, v - h / 6); ctx.stroke();
  }
  ctx.restore();
}
