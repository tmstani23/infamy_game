// Health bars over damaged war structures (war checkpoint 6). Both sides of a war see them; no damage
// numbers. Reads state.frontier.structures from the snapshot (damaged or burning structures of the player's
// wars) and keeps one small bar per structure over its place on screen. Presentation only.
import { healthBar } from './render/health.js';

export function createStructureBars({ game, view, heroId, root }) {
  const bars = new Map();
  const onIsland = () => game.state.entities[heroId]?.place === 'world';
  const NAMES = { town_hall: 'Town hall', camp_hall: 'Camp hall', housing: 'House', work: 'Workshop' };
  const nice = t => NAMES[t] || (t || 'building').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  function update() {
    if (!root) return;
    const list = onIsland() ? game.state.frontier?.structures || [] : [], want = new Set();
    for (const s of list) {
      if (!(s.hp < s.max)) continue;
      const u = view.unitToScreen(s.x, s.z, s.kind === 'building' ? 7 : 3.5);
      if (u.x < -60 || u.y < -60 || u.x > innerWidth + 60 || u.y > innerHeight + 60) continue;
      want.add(s.key);
      let el = bars.get(s.key);
      if (!el) { el = document.createElement('div'); el.className = 'structbar'; el.innerHTML = '<i></i>'; root.appendChild(el); bars.set(s.key, el); }
      const { frac, color } = healthBar(s.hp, s.max), fill = el.firstChild;
      el.style.left = `${u.x}px`; el.style.top = `${u.y}px`;
      el.style.width = `${s.kind === 'building' ? 64 : 34}px`;
      fill.style.width = `${Math.round(frac * 100)}%`;
      fill.style.background = `rgb(${color.map(c => Math.round(c * 255)).join(',')})`;
      const tip = `${nice(s.type)}: health ${s.hp} of ${s.max}`;
      if (el.title !== tip) el.title = tip;
    }
    for (const [key, el] of bars) if (!want.has(key)) { el.remove(); bars.delete(key); }
  }
  setInterval(update, 50);
  return { update };
}
