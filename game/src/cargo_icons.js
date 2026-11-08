// Little load icons over a worker carrying a harvest (Tim 2026-11-08): a pile of logs, a stone block, a net with a
// fish, a forage basket, or a rice sack. Each is drawn once into a small canvas and then only blitted (drawImage),
// so the per-frame cost is one image copy per carrying worker. Plain shapes, no textures.
const W = 22, H = 18, S = 3;   // icon size in page pixels, drawn at S times for sharp edges
const cache = new Map();

function paint(kind) {
  const c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
  const g = c.getContext('2d'); g.scale(S, S); g.lineJoin = 'round'; g.lineCap = 'round';
  const ink = '#2a1d10';
  if (kind === 'timber') {
    // three logs, two below and one on top, cut ends facing you
    const log = (x, y) => {
      g.fillStyle = '#7a4f2a'; g.strokeStyle = ink; g.lineWidth = 1;
      g.beginPath(); g.roundRect(x - 1, y - 3.5, 12, 7, 2); g.fill(); g.stroke();
      g.fillStyle = '#d9a866'; g.beginPath(); g.ellipse(x - 1, y, 2.6, 3.5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = '#9c6a38'; g.lineWidth = 0.6; g.beginPath(); g.ellipse(x - 1, y, 1.2, 1.7, 0, 0, Math.PI * 2); g.stroke();
    };
    log(5, 13); log(10, 13); log(7.5, 7);
  } else if (kind === 'stone') {
    // a cut block: light top, two shaded sides
    g.strokeStyle = ink; g.lineWidth = 1;
    g.fillStyle = '#d4d0c4'; g.beginPath(); g.moveTo(11, 2); g.lineTo(19, 5.5); g.lineTo(11, 9); g.lineTo(3, 5.5); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#a19d92'; g.beginPath(); g.moveTo(3, 5.5); g.lineTo(11, 9); g.lineTo(11, 16.5); g.lineTo(3, 13); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#7d7a72'; g.beginPath(); g.moveTo(19, 5.5); g.lineTo(11, 9); g.lineTo(11, 16.5); g.lineTo(19, 13); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#6a675f'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(6, 9); g.lineTo(8, 12); g.stroke();
  } else if (kind === 'fish') {
    // a fish lying on a sagging net bag
    g.fillStyle = 'rgba(201,167,106,.25)'; g.strokeStyle = '#c9a76a'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(2, 7); g.quadraticCurveTo(11, 22, 20, 7); g.closePath(); g.fill(); g.stroke();
    g.save(); g.clip(); g.lineWidth = 0.6; g.beginPath();
    for (let x = -4; x <= 22; x += 4) { g.moveTo(x, 6); g.lineTo(x + 8, 18); g.moveTo(x + 8, 6); g.lineTo(x, 18); }
    g.stroke(); g.restore();
    g.fillStyle = '#9cc3d4'; g.strokeStyle = ink; g.lineWidth = 1;
    g.beginPath(); g.moveTo(15, 7); g.lineTo(20, 3.5); g.lineTo(19.5, 10.5); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(9.5, 7, 6.5, 3.2, -0.12, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#5f8798'; g.beginPath(); g.ellipse(9.5, 5.6, 4.5, 1.2, -0.12, 0, Math.PI * 2); g.fill();
    g.fillStyle = ink; g.beginPath(); g.arc(5.3, 6.4, 0.85, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a6a3a'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(2, 7); g.lineTo(3.5, 9); g.moveTo(20, 7); g.lineTo(18.5, 9); g.stroke();
  } else if (kind === 'forage') {
    // a woven basket with berries and a leaf
    g.fillStyle = '#4f8a3a'; g.strokeStyle = ink; g.lineWidth = 0.8;
    g.beginPath(); g.ellipse(14, 5, 4, 2, -0.5, 0, Math.PI * 2); g.fill(); g.stroke();
    for (const [x, y, col] of [[7, 7, '#b83a3a'], [10.5, 6, '#7a3a8a'], [13.5, 7.5, '#b83a3a'], [9, 8.5, '#d06a2a']]) { g.fillStyle = col; g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill(); g.stroke(); }
    g.fillStyle = '#c99a55'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(3, 9); g.lineTo(19, 9); g.lineTo(16.5, 16.5); g.lineTo(5.5, 16.5); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#8a6430'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(4.2, 12); g.lineTo(17.8, 12); g.moveTo(5, 14.5); g.lineTo(17, 14.5); g.stroke();
  } else {
    // a tied rice sack (any other food or goods)
    g.fillStyle = '#e2d3a8'; g.strokeStyle = ink; g.lineWidth = 1;
    g.beginPath(); g.moveTo(8, 5); g.quadraticCurveTo(3, 9, 4, 14); g.quadraticCurveTo(11, 18, 18, 14); g.quadraticCurveTo(19, 9, 14, 5); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(8, 5); g.lineTo(9, 2); g.lineTo(13, 2); g.lineTo(14, 5); g.fill(); g.stroke();
    g.strokeStyle = '#a0342c'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(8, 5); g.lineTo(14, 5); g.stroke();
  }
  return c;
}

// kind: the spot's kind (timber, stone, fish, forage) or the resource (timber, stone, food)
export function cargoIcon(kind) {
  const k = kind === 'food' ? 'sack' : kind || 'sack';
  if (!cache.has(k)) cache.set(k, paint(k));
  return cache.get(k);
}
export const CARGO_ICON_SIZE = { w: W, h: H };
