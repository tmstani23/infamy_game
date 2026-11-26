// Painted pointer cursors (2026-11-23): attack over an enemy, move over ground or water your selection can go to,
// attack-move once X is armed. Lantern style as the landing anchor (src/landing_shore.js SHORE_CURSOR): cream and ink,
// vermilion for attack. 40 px SVG data URLs with their hot spot; a plain CSS cursor after each as the fallback.
const INK = '#1d1208', CREAM = '#efe4c6', BRASS = '#c9a45a', RED = '#b0443a';
// drawn on a 40 grid, shown at SIZE px and a little see-through (2026-11-23: about a third the size, so they do not
// hide the target)
export const SIZE = 16, SEE = 0.8;
const svg = (body, hx, hy, fallback) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${SIZE}' height='${SIZE}' viewBox='0 0 40 40'><g opacity='${SEE}'>${body}</g></svg>`)}") ${Math.round(hx * SIZE / 40)} ${Math.round(hy * SIZE / 40)}, ${fallback}`;
// one katana, handle at (x0, y0), tip toward (x1, y1): a curved blade that tapers to a sharp point (blades come to a point),
// ink edge, cream steel, brass guard, dark wrapped grip
const blade = (x0, y0, x1, y1, bend) => {
  const ux = (x1 - x0) / Math.hypot(x1 - x0, y1 - y0), uy = (y1 - y0) / Math.hypot(x1 - x0, y1 - y0), gx = x0 + ux * 6.5, gy = y0 + uy * 6.5;
  const cx = (gx + x1) / 2 - uy * bend, cy = (gy + y1) / 2 + ux * bend, f = n => n.toFixed(1);
  const side = [], back = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    const px = a * gx + b * cx + c * x1, py = a * gy + b * cy + c * y1;
    let tx = 2 * (1 - t) * (cx - gx) + 2 * t * (x1 - cx), ty = 2 * (1 - t) * (cy - gy) + 2 * t * (y1 - cy); const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
    const w = 1.9 * Math.min(1, (1 - t) / 0.28);   // full width until the last stretch, then a long clean point
    side.push(`${f(px - ty * w)} ${f(py + tx * w)}`); back.push(`${f(px + ty * w)} ${f(py - tx * w)}`);
  }
  const shape = `M${side.join('L')}L${back.reverse().join('L')}Z`;
  return `<path d='${shape}' fill='${CREAM}' stroke='${INK}' stroke-width='1.8' stroke-linejoin='miter' stroke-miterlimit='12'/>`
    + `<path d='M${f(x0)} ${f(y0)}L${f(gx)} ${f(gy)}' stroke='${INK}' stroke-width='5.6' stroke-linecap='round'/>`
    + `<path d='M${f(x0 + ux * 2)} ${f(y0 + uy * 2)}L${f(x0 + ux * 4.4)} ${f(y0 + uy * 4.4)}' stroke='${RED}' stroke-width='1.6' stroke-dasharray='1.2 1.2'/>`
    + `<ellipse cx='${f(gx)}' cy='${f(gy)}' rx='4' ry='2.3' transform='rotate(${f(Math.atan2(uy, ux) * 180 / Math.PI + 90)} ${f(gx)} ${f(gy)})' fill='${BRASS}' stroke='${INK}' stroke-width='1.3'/>`;
};
const SWORDS = blade(6, 35, 35, 5, 2.4) + blade(34, 35, 5, 5, -2.4);
// a ring lying on the ground, seen at the game's angle, and a chevron pointing down into it
const ring = col => `<ellipse cx='20' cy='31' rx='12' ry='5.4' fill='none' stroke='${INK}' stroke-width='5.6'/><ellipse cx='20' cy='31' rx='12' ry='5.4' fill='none' stroke='${col}' stroke-width='3'/>`;
const CHEVRON = `<path d='M11 10L20 21 29 10' fill='none' stroke='${INK}' stroke-width='7.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M11 10L20 21 29 10' fill='none' stroke='${CREAM}' stroke-width='3.6' stroke-linecap='round' stroke-linejoin='round'/>`
  + `<path d='M15 4.5L20 9.8 25 4.5' fill='none' stroke='${INK}' stroke-width='4.4' stroke-linecap='round' stroke-linejoin='round' opacity='.8'/><path d='M15 4.5L20 9.8 25 4.5' fill='none' stroke='${CREAM}' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' opacity='.8'/>`;
const SMALL_SWORDS = `<g transform='translate(20 13.5) scale(.68) translate(-20 -20)'>${SWORDS}</g>`;
// a pointing hand: something here to use with a right-click (2026-11-26: your camp fire)
const HAND = `<path d='M13.5 19V6.5a2.6 2.6 0 0 1 5.2 0V16.5a2.5 2.5 0 0 1 5 .3a2.5 2.5 0 0 1 5 .6a2.4 2.4 0 0 1 4.6 1.1V27c0 5.5-3.6 9-9 9h-3.2c-3.2 0-5.4-1.6-7-4.4l-4.2-7.4a2.4 2.4 0 0 1 4-2.6z' fill='${CREAM}' stroke='${INK}' stroke-width='2.6' stroke-linejoin='round'/>`
  + `<path d='M18.7 16.5v5M23.7 16.8v4.8M28.7 17.4v4.4' stroke='${INK}' stroke-width='1.4' stroke-linecap='round'/><path d='M14 31h14' stroke='${BRASS}' stroke-width='2' stroke-linecap='round' opacity='.9'/>`;
export const CURSOR = {
  use: svg(HAND, 16, 4, 'pointer'),
  attack: svg(SWORDS, 20, 20, 'crosshair'),
  move: svg(ring(CREAM) + CHEVRON, 20, 31, 'pointer'),
  attackMove: svg(ring(RED) + SMALL_SWORDS, 20, 31, 'crosshair'),
};
