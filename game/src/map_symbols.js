// Map symbols (2026-11-23: "we shouldn't have any basic shapes"): every feature mark on the World map and the
// minimap drawn as a small old sea-chart symbol, iron-gall ink inside a pale paper halo so it reads on any ground,
// with a touch of colour only where it carries meaning. No text, no glyph characters.
//   site     a surveyor's stake with an ochre ribbon (faded = not scouted yet)
//   pass     the chart sign for a pass: two opposed arcs, the way through between them
//   bridge   an arched bridge with posts
//   ford     stepping stones across two waves
//   bandit   two curved swords crossed, red hilts
//   ruin     a fallen shrine gate, its top beam slipped aslant
//   cache    a chest in outline, ochre wash and straps
//   pin      a rose pennant on a staff (your own pins)
//   hero     a compass, needle's north half jade (you)
// faded: drawn see-through (an unscouted site, a cleared camp).
const INK = '#2b1d12', PAPER = 'rgba(240,226,190,.62)';
export const MAP_SYMBOL_KINDS = ['site', 'pass', 'bridge', 'ford', 'bandit', 'ruin', 'cache', 'pin', 'hero'];
function inkKit(ctx, u, halo) {
  const shape = (color = INK) => { if (halo) { ctx.strokeStyle = PAPER; ctx.lineWidth = 2 * u; ctx.stroke(); } else { ctx.fillStyle = color; ctx.fill(); } };
  const line = (w = 0.8, color = INK) => { if (halo) { ctx.strokeStyle = PAPER; ctx.lineWidth = (w + 1.8) * u; } else { ctx.strokeStyle = color; ctx.lineWidth = w * u; } ctx.stroke(); };
  const P = (x, y) => [x * u, y * u];
  const path = (pts, close = false) => { ctx.beginPath(); pts.forEach(([a, b], i) => i ? ctx.lineTo(a * u, b * u) : ctx.moveTo(a * u, b * u)); if (close) ctx.closePath(); };
  return { shape, line, P, path };
}
function body(ctx, kind, u, halo) {
  const { shape, line, path } = inkKit(ctx, u, halo);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (kind === 'site') {
    path([[0, 5], [0, -5]]); line(1.1);
    path([[-1.8, -2.6], [1.8, -2.6]]); line(0.8);
    path([[0.4, -5], [4.6, -4.2], [3.2, -3.2], [4.6, -2.2], [0.4, -3]], true); shape('#c99a3a');
    path([[-1.4, 5], [1.4, 5]]); line(0.9);
  } else if (kind === 'pass') {
    ctx.beginPath(); ctx.arc(-6 * u, 0, 4.6 * u, -0.75, 0.75); line(1.1);
    ctx.beginPath(); ctx.arc(6 * u, 0, 4.6 * u, Math.PI - 0.75, Math.PI + 0.75); line(1.1);
    path([[-4.4, -3.4], [-5.6, -4.4]]); line(0.6); path([[-4.4, 3.4], [-5.6, 4.4]]); line(0.6);
    path([[4.4, -3.4], [5.6, -4.4]]); line(0.6); path([[4.4, 3.4], [5.6, 4.4]]); line(0.6);
  } else if (kind === 'bridge') {
    ctx.beginPath(); ctx.moveTo(-5.6 * u, 1.6 * u); ctx.quadraticCurveTo(0, -3.6 * u, 5.6 * u, 1.6 * u); line(1.2);
    ctx.beginPath(); ctx.moveTo(-5.6 * u, -0.6 * u); ctx.quadraticCurveTo(0, -5.8 * u, 5.6 * u, -0.6 * u); line(0.6);
    for (const x of [-3.6, 0, 3.6]) { const y = x === 0 ? -1 : 0.2; path([[x, y], [x, y - 2.2]]); line(0.6); }
    ctx.beginPath(); ctx.moveTo(-3 * u, 3.4 * u); ctx.quadraticCurveTo(0, 1.2 * u, 3 * u, 3.4 * u); line(0.6, 'rgba(43,29,18,.7)');
  } else if (kind === 'ford') {
    for (const y of [-2.2, 2.6]) { ctx.beginPath(); for (let i = 0; i <= 12; i++) { const x = -5.6 + i * 11.2 / 12; ctx.lineTo(x * u, (y + Math.sin(x * 1.3) * 0.7) * u); } line(0.7, '#3f5f6e'); }
    for (const [x, y] of [[-3.2, 0.3], [0, 0.1], [3.2, 0.3]]) { ctx.beginPath(); ctx.ellipse(x * u, y * u, 1.3 * u, 0.95 * u, 0, 0, Math.PI * 2); shape(); }
  } else if (kind === 'bandit') {   // two curved swords crossed, round guards, red-wrapped hilts
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(-3 * sd * u, 3 * u); ctx.quadraticCurveTo(-0.2 * sd * u, -0.6 * u, 4.8 * sd * u, -4.6 * u); line(0.95);
      ctx.beginPath(); ctx.ellipse(-3 * sd * u, 3 * u, 1.1 * u, 1.1 * u, 0, 0, Math.PI * 2); shape();
      path([[-3.4 * sd, 3.4], [-5.4 * sd, 5.4]]); line(1.3, halo ? INK : '#8e2a1a');
    }
  } else if (kind === 'ruin') {   // a fallen shrine gate: two posts, the top beam slipped and lying aslant across them
    path([[-3.2, 5], [-3.2, -1.6]]); line(1.2);
    path([[3.2, 5], [3.2, 0.8]]); line(1.2);
    ctx.beginPath(); ctx.moveTo(-6 * u, -3.8 * u); ctx.quadraticCurveTo(-0.6 * u, -1.6 * u, 5.8 * u, 0.4 * u); line(1.3);   // beam, ends upturned
    path([[-6, -3.8], [-6.4, -4.8]]); line(0.8); path([[5.8, 0.4], [6.4, -0.4]]); line(0.8);
    path([[-3.2, 1.2], [3.2, 2.4]]); line(0.7);   // the tie beam, still between the posts
    for (const [x, y] of [[-0.4, 4.8], [1.2, 4.6]]) { ctx.beginPath(); ctx.ellipse(x * u, y * u, 0.8 * u, 0.5 * u, 0, 0, Math.PI * 2); shape(); }
  } else if (kind === 'cache') {   // a chest in outline: an ochre wash, ink edges and straps
    const box = () => { path([[-4.6, -0.4], [4.6, -0.4], [4.6, 4.2], [-4.6, 4.2]], true); };
    const lid = () => { ctx.beginPath(); ctx.moveTo(-4.6 * u, -0.4 * u); ctx.quadraticCurveTo(0, -4.2 * u, 4.6 * u, -0.4 * u); ctx.closePath(); };
    if (halo) { box(); shape(); lid(); shape(); }
    else { ctx.fillStyle = 'rgba(201,154,58,.55)'; box(); ctx.fill(); lid(); ctx.fill();
      box(); line(0.8); lid(); line(0.8);
      for (const x of [-2.4, 2.4]) { ctx.beginPath(); ctx.moveTo(x * u, -2.6 * u); ctx.lineTo(x * u, 4.2 * u); line(0.6); }
      ctx.fillStyle = INK; ctx.fillRect(-0.7 * u, -0.9 * u, 1.4 * u, 1.7 * u); }
  } else if (kind === 'pin') {
    path([[0, 5.4], [0, -5.4]]); line(1);
    path([[0.4, -5.4], [5.4, -3.4], [0.4, -1.4]], true); shape('#b8566e');
    ctx.beginPath(); ctx.arc(0, -5.6 * u, 0.9 * u, 0, Math.PI * 2); shape('#c99a3a');
  } else if (kind === 'hero') {   // a compass: a slim needle in a ring, north half jade
    ctx.beginPath(); ctx.arc(0, 0, 4.6 * u, 0, Math.PI * 2); line(0.7, '#d9b56a');
    path([[0, -6.6], [1.2, 0], [-1.2, 0]], true); shape('#2f8a62');
    path([[0, 6.6], [1.2, 0], [-1.2, 0]], true); shape();
    ctx.beginPath(); ctx.arc(0, 0, 0.8 * u, 0, Math.PI * 2); shape('#d9b56a');
  }
}
export function drawMapSymbol(ctx, kind, x, y, { scale = 1, faded = false } = {}) {
  const u = 1.6 * scale;
  ctx.save(); ctx.translate(x, y);
  if (faded) ctx.globalAlpha = 0.55;
  body(ctx, kind, u, true); body(ctx, kind, u, false);
  ctx.restore();
}
// the key's copy of a symbol, as a small picture (browser only)
const keyCache = new Map();
export function mapSymbolImg(kind, faded = false) {
  if (typeof document === 'undefined') return '';
  const id = kind + (faded ? ':f' : '');
  if (!keyCache.has(id)) { const c = document.createElement('canvas'); c.width = c.height = 40; const g = c.getContext('2d'); g.scale(2, 2); drawMapSymbol(g, kind, 10, 10, { scale: 0.95, faded }); keyCache.set(id, c.toDataURL()); }
  return `<img src="${keyCache.get(id)}" width="20" height="20" alt="" aria-hidden="true">`;
}
