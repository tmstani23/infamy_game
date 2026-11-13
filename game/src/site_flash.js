// A new war camp building site flashes until it has workers (7c-4, Tim 2026-11-12: builders are manual).
// Also marks your burning buildings in a war with nobody sent to put them out. Presentation only: small pulsing
// markers over the spot, in the structure bar layer. sim/frontier/workers.js sets building.idle on a site with no crew.
const CSS = `.siteflash{position:fixed;transform:translate(-50%,-50%);pointer-events:none;border-radius:50%;border:3px solid #ffd76a;box-shadow:0 0 10px #ffb400,inset 0 0 8px #ffb40088;animation:siteflash 1s ease-in-out infinite}
.siteflash b{position:absolute;left:50%;top:-20px;transform:translateX(-50%);white-space:nowrap;font:600 11px system-ui,sans-serif;color:#ffe9b0;text-shadow:0 1px 2px #000,0 0 4px #000}
@keyframes siteflash{0%,100%{opacity:.25}50%{opacity:1}}`;
export function createSiteFlash({ root, game, view, heroId }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const marks = new Map();
  function update() {
    const h = game.state.entities[heroId], want = new Set();
    if (root && h?.place === 'world') for (const w of Object.values(game.state.frontier?.wars?.list || {})) {
      if (w.attacker !== h.owner || !w.camp) continue;
      for (const b of w.camp.buildings || []) {
        if (!b.idle || !(b.stage === 'site' || b.upgrade)) continue;
        const c = view.unitToScreen(b.x, b.z, 0), e = view.unitToScreen(b.x + 5, b.z, 0), r = Math.max(14, Math.abs(e.x - c.x));
        if (c.x < -60 || c.y < -60 || c.x > innerWidth + 60 || c.y > innerHeight + 60) continue;
        const id = `${w.id}:${b.id}`; want.add(id);
        let m = marks.get(id);
        if (!m) { m = document.createElement('div'); m.className = 'siteflash'; m.innerHTML = '<b>Needs workers</b>'; root.appendChild(m); marks.set(id, m); }
        m.style.left = `${c.x}px`; m.style.top = `${c.y}px`; m.style.width = `${r * 2}px`; m.style.height = `${r}px`;
      }
    }
    for (const [id, m] of marks) if (!want.has(id)) { m.remove(); marks.delete(id); }
  }
  setInterval(update, 100);
  return { update };
}
