// Island minimap building icons (Tim 2026-11-07): each major built building of a frontier town gets a small
// lettered badge, with its name on hover. Reads the frontier view only (state.frontier.settlements).
// Also the city business names for the minimap's hover label.
import { cellToWorld } from './sim/frontier/town_grid.js';

// type -> [badge letter, name]; the rest (houses, farms, camps, quarries, workshops) are too minor to mark
export const MAJOR_BUILDINGS = {
  town_hall: ['H', 'Town hall'],
  stable: ['S', 'Stable'],
  station: ['R', 'Railway station'],
  storehouse: ['D', 'Storage depot'],
  infirmary: ['I', 'Infirmary'],
  stockade: ['K', 'Stockade'],
  market: ['M', 'Market'],
};

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
        type: b.type, letter: info[0], name: info[1], town: s.name, owner: s.owner });
    }
  }
  return out;
}

// one badge at pixel (u, v)
export function drawBuildingBadge(ctx, u, v, letter, color, size = 8) {
  ctx.save();
  ctx.fillStyle = color || 'rgba(0,0,0,.7)'; ctx.fillRect(u - size / 2, v - size / 2, size, size);
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.strokeRect(u - size / 2, v - size / 2, size, size);
  ctx.font = `bold ${size - 1}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff4dc'; ctx.fillText(letter, u, v + 0.5);
  ctx.restore();
}
