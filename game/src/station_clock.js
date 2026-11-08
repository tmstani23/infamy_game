// Station clock (Tim 2026-11-08): over each of your railway stations, a small board says when the next train
// comes in and where it goes, so you need not walk to the window and press Space. One row per line (up to 3):
// a ring that fills as the train nears, then "Boarding · leaves 0:42" in gold while it stands there. Also draws
// the All aboard zone while you call one.
// Draw only: reads rail.serviceAt(owner, station) (sim/frontier/rail.js). The capital's board stands over the
// city railway station (in the city) and over the line's end outside the island gate (on the island).
const STYLE = `
.stclock { position:fixed; z-index:3; pointer-events:none; transform:translate(-50%,-100%); display:flex; flex-direction:column; gap:2px;
  padding:4px 7px 4px 5px; border-radius:6px; background:linear-gradient(#1d1912ee,#0f0d0aee); border:1px solid #8a6a32; box-shadow:0 2px 8px #000a, inset 0 0 0 1px #0008;
  font:600 11px/14px system-ui,sans-serif; color:#e9d6a8; white-space:nowrap; text-shadow:0 1px 2px #000; }
.stclock[hidden] { display:none; }
.stclock::after { content:''; position:absolute; left:50%; bottom:-6px; transform:translateX(-50%); border:6px solid transparent; border-bottom:0; border-top-color:#8a6a32; }
.stclock .row { display:flex; align-items:center; gap:5px; }
.stclock svg { width:14px; height:14px; flex:none; transform:rotate(-90deg); }
.stclock .trk { fill:none; stroke:#ffffff22; stroke-width:3; }
.stclock .arc { fill:none; stroke:#d4aa5a; stroke-width:3; stroke-linecap:round; }
.stclock .t { font-variant-numeric:tabular-nums; color:#fff3d0; }
.stclock .to { color:#b8a888; font-weight:500; }
.stclock .row.now { color:#ffd34d; animation:stclock 1s ease-in-out infinite; }
.stclock .row.now .arc { stroke:#ffd34d; }
@keyframes stclock { 50% { opacity:.6; } }
@media(prefers-reduced-motion:reduce) { .stclock .row.now { animation:none; } }`;

const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createStationClock({ game, heroId, view }) {
  const style = document.createElement('style'); style.textContent = STYLE; document.head.appendChild(style);
  const boards = new Map();   // station id -> { el, key, full }
  let last = 0;
  // where each board stands: an island station's shed, the capital's city station or the line's island end
  function anchors(rail, owner, place) {
    const out = [];
    for (const id of new Set(rail.linksOf(owner).filter(l => l.done).flatMap(l => [l.from, l.to]))) {
      if (id === 'capital') {
        const st = game.gate?.station;
        if (place === 'street' && st) out.push({ id, x: st[0], z: st[1] });
        else if (place === 'world') { const p = rail.endpoint(owner, id); if (p) out.push({ id, x: p.x, z: p.z }); }
      } else if (place === 'world') { const p = rail.endpoint(owner, id); if (p) out.push({ id, x: p.x, z: p.z }); }
    }
    return out;
  }
  // the All aboard zone (Tim 2026-11-08): a big gold ring on the ground round where you called it, its edge running
  // down as the call runs out, and a banner over it with the seconds left and how many of yours stand inside
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '3' });   // CSS size set: the backing store is devicePixelRatio times bigger
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let drawn = false;
  function zones(rail, hero) {
    const calls = rail && hero && !document.body.classList.contains('ui-hidden') ? rail.trains().filter(t => t.call && t.owner === hero.owner && t.call.place === hero.place) : [];
    if (!calls.length) { if (drawn) { ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; } return; }
    const dpr = devicePixelRatio || 1;
    if (canvas.width !== innerWidth * dpr || canvas.height !== innerHeight * dpr) { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight); drawn = true;
    const now = performance.now() / 1000;
    for (const t of calls) {
      const c = t.call, left = Math.max(0, (c.until - game.state.tick) / 20), k = c.ticks ? left * 20 / c.ticks : 0, n = rail.inZone(t).length;
      const pts = Array.from({ length: 64 }, (_, i) => { const a = i / 64 * Math.PI * 2; return view.unitToScreen(c.x + Math.sin(a) * c.r, c.z + Math.cos(a) * c.r, 0.05); });
      const pulse = 0.5 + 0.5 * Math.sin(now * 5);
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
      ctx.fillStyle = `rgba(255,211,77,${0.07 + 0.05 * pulse})`; ctx.fill();
      ctx.setLineDash([10, 7]); ctx.lineDashOffset = -now * 18; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,225,140,.55)'; ctx.stroke(); ctx.setLineDash([]);
      // the time left: a solid bright arc from the top of the ring, shrinking clockwise
      const m = Math.max(1, Math.round(64 * k));
      ctx.beginPath(); for (let i = 0; i <= m; i++) { const p = pts[(32 + i) % 64]; i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
      ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,211,77,${0.75 + 0.25 * pulse})`; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.stroke(); ctx.shadowBlur = 0;
      // the banner over the far edge of the ring
      const top = pts.reduce((a, p) => p.y < a.y ? p : a, pts[0]), text = `ALL ABOARD!  ${Math.ceil(left)}`, sub = `${n} crew in the zone · Space boards now`;
      ctx.textAlign = 'center'; ctx.font = '800 20px system-ui,sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = '#1a1208';
      ctx.strokeText(text, top.x, top.y - 22); ctx.fillStyle = '#ffd34d'; ctx.fillText(text, top.x, top.y - 22);
      ctx.font = '600 12px system-ui,sans-serif'; ctx.lineWidth = 3; ctx.strokeText(sub, top.x, top.y - 6); ctx.fillStyle = '#f3e3bb'; ctx.fillText(sub, top.x, top.y - 6);
    }
  }
  function update() {
    const rail = game.frontier?.rail, hero = game.state.entities[heroId];
    zones(rail, hero);
    const riding = String(hero?.aboard || '').startsWith('rail:');
    const list = rail && hero && !riding && !document.body.classList.contains('ui-hidden') ? anchors(rail, hero.owner, hero.place) : [];
    const live = new Set(), text = performance.now() - last > 250;
    if (text) last = performance.now();
    for (const a of list) {
      const rows = rail.serviceAt(hero.owner, a.id).slice(0, 3);
      if (!rows.length) continue;
      const p = view.unitToScreen(a.x, a.z, 7);
      if (p.x < -80 || p.y < -40 || p.x > innerWidth + 80 || p.y > innerHeight + 80) continue;
      live.add(a.id);
      let b = boards.get(a.id);
      if (!b) { b = { el: document.createElement('div'), key: '', full: {} }; b.el.className = 'stclock'; document.body.appendChild(b.el); boards.set(a.id, b); }
      b.el.hidden = false;
      b.el.style.left = `${p.x}px`; b.el.style.top = `${p.y}px`;
      if (!text && b.key) continue;
      const html = rows.map(r => {
        const full = b.full[r.train] = Math.max(b.full[r.train] || 0, r.eta, 1);   // the ring fills from the longest wait seen
        const k = r.eta === 0 ? 1 : 1 - r.eta / full, arc = `<svg viewBox="0 0 16 16"><circle class="trk" cx="8" cy="8" r="6"/><circle class="arc" cx="8" cy="8" r="6" pathLength="100" stroke-dasharray="${(k * 100).toFixed(1)} 100"/></svg>`;
        if (r.eta === 0) b.full[r.train] = 0;
        return r.eta === 0
          ? `<div class="row now">${arc}<span>Boarding</span><span class="to">→ ${esc(r.toName)}</span><span class="t">leaves ${clock(r.leaves ?? 0)}</span></div>`
          : `<div class="row">${arc}<span class="t">${clock(r.eta)}</span><span class="to">→ ${esc(r.toName)}</span></div>`;
      }).join('');
      if (html !== b.key) { b.key = html; b.el.innerHTML = html; }
    }
    for (const [id, b] of boards) if (!live.has(id)) b.el.hidden = true;
  }
  return { update };
}
