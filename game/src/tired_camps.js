// Work camps over their max (2026-11-22): the camps of a clan's towns with more workers on their spots than those
// keep busy (sim workers.js econTick: s.tiredCamps). Numbered 1, 2, ... across the clan's towns, so the Workers view
// rows and the minimap diamonds share a number.
import { cellToWorld } from './sim/frontier/town_grid.js';
const NAMES = { food_camp: 'Food camp', lumber_camp: 'Lumber camp', quarry: 'Quarry' };
export const campName = type => NAMES[type] || type.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
export function tiredCamps(frontier, clan) {
  const out = [];
  for (const s of Object.values(frontier?.settlements || {})) {
    if (s.owner !== clan || s.capital || !s.tiredCamps?.length) continue;
    for (const c of s.tiredCamps) {
      const b = s.buildings?.find(x => x.id === c.id); if (!b) continue;
      const [x, z] = s.grid && Number.isInteger(b.cell) ? cellToWorld(s, b.cell) : [b.x ?? s.x, b.z ?? s.z];
      out.push({ ...c, town: s.id, townName: s.name, name: campName(c.type), x, z, num: out.length + 1 });
    }
  }
  return out;
}
// a red diamond with the camp's number (minimap; the Workers view draws the same in HTML)
export function drawTiredCamp(ctx, u, v, num, t = 0) {
  const r = 7, glow = 0.5 + 0.5 * Math.sin(t / 220);
  ctx.save();
  ctx.shadowColor = `rgba(255,60,30,${0.45 + 0.45 * glow})`; ctx.shadowBlur = 8 + 8 * glow;
  ctx.beginPath(); ctx.moveTo(u, v - r); ctx.lineTo(u + r, v); ctx.lineTo(u, v + r); ctx.lineTo(u - r, v); ctx.closePath();
  ctx.fillStyle = '#d8321f'; ctx.fill(); ctx.shadowBlur = 0;
  ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#f3d29a'; ctx.stroke();
  ctx.font = '800 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(String(num), u, v + 0.5);
  ctx.restore();
}
