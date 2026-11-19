// Island minimap building icons (Tim 2026-11-07): each major built building of a frontier town gets a small
// lettered badge, with its name on hover. Reads the frontier view only (state.frontier.settlements).
// Also the city business names for the minimap's hover label.
import { cellToWorld } from './sim/frontier/town_grid.js';

// type -> [badge letter, name, military?]; the rest (houses, farms, camps, quarries, workshops) are too minor to mark.
// Military buildings (Tim 2026-11-19): town and war camp, first letter, the first two where another badge has it;
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
const CAMP_MILITARY = new Set(['stable', 'stockade']);

export const CITY_NAMES = { pawnshop: 'Pawnshop', bathhouse: 'Bathhouse', sake_brewery: 'Sake brewery', manor: 'Manor', customs_house: 'Customs house', warehouse: 'Warehouse', teahouse: 'Teahouse', shop: 'Shop', tenements: 'Tenements', gambling_den: 'Gambling den', clinic: 'Clinic', police_box: 'Police box', police_hq: 'Police headquarters', moneylender: 'Moneylender', hideout: 'Hideout', dojo: 'Shinobi dojo' };

// the finished major buildings of every town in the snapshot: [{ x, z, type, letter, name, town, owner }]
export function majorBuildings(frontier) {
  const out = [];
  for (const s of Object.values(frontier?.settlements || {})) {
    if (s.capital || !s.grid || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    for (const b of s.buildings || []) {
      const info = MAJOR_BUILDINGS[b.type];
      if (!info || b.stage !== 'built') continue;
      const cells = (b.cells?.length ? b.cells : [b.cell]).filter(i => Number.isInteger(i));
      if (!cells.length) continue;
      const pts = cells.map(i => cellToWorld(s, i));
      out.push({ x: pts.reduce((a, p) => a + p[0], 0) / pts.length, z: pts.reduce((a, p) => a + p[1], 0) / pts.length,
        type: b.type, letter: info[0], name: info[1], military: !!info[2] || b.type === 'stockade', town: s.name, owner: s.owner });
    }
  }
  // war camps (Tim 2026-11-19): their finished buildings, by position
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
