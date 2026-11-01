// Loot notice (Tim 2026-11-01): gear put in the hero's bag (drops, body loot, claimed rewards;
// not shop buys) shows a short "Looted" toast over the Inventory button, and the item's icon
// flies from the hero into that button, which pulses. Reads state.itemGains (one tick's list).
import { ITEMS } from './sim/inventory.js';
import { itemArt } from './item_detail.js';

export function createLootNotice({ game, heroId, view, button }) {
  let observedTick = null, toasts = [];
  const visible = r => r.width > 0 && r.bottom > 0 && r.top < innerHeight;

  function pulse() { button.classList.remove('loot-pulse'); void button.offsetWidth; button.classList.add('loot-pulse'); }

  function fly(id, to) {
    const h = game.state.entities[heroId];
    if (!h || !view?.unitToScreen) return pulse();
    const from = view.unitToScreen(h.x, h.z, 1.4), tx = to.left + to.width / 2, ty = to.top + to.height / 2;
    const el = document.createElement('div');
    el.className = `loot-fly${ITEMS[id]?.rarity === 'green' ? ' green' : ''}`;
    el.innerHTML = itemArt(id);
    document.body.appendChild(el);
    const at = (x, y, s, o) => ({ transform: `translate(${x - 22}px, ${y - 22}px) scale(${s})`, opacity: o });
    const midX = from.x + (tx - from.x) * 0.35, midY = Math.min(from.y, ty) - 70;   // arc up, then into the button
    const anim = el.animate([at(from.x, from.y, 0.6, 0), at(from.x, from.y - 30, 1.15, 1), at(midX, midY, 1, 1), at(tx, ty, 0.45, 0.85)],
      { duration: 1000, easing: 'cubic-bezier(.45,0,.4,1)', fill: 'forwards' });
    const done = () => { el.remove(); pulse(); };
    anim.onfinish = done; setTimeout(() => el.isConnected && done(), 1600);   // hidden tab: never stuck
  }

  function toast(id, r) {
    toasts = toasts.filter(t => t.isConnected);
    const item = ITEMS[id], el = document.createElement('div');
    el.className = `loot-toast${item?.rarity === 'green' ? ' green' : ''}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `${itemArt(id)}<span><small>Looted</small><b></b></span>`;
    el.querySelector('b').textContent = item?.name || id;
    const stacked = toasts.reduce((y, t) => y + t.offsetHeight + 6, 0);
    el.style.right = `${Math.max(8, innerWidth - r.right)}px`;
    el.style.bottom = `${innerHeight - r.top + 10 + stacked}px`;
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), 5000);
    document.body.appendChild(el); toasts.push(el);
  }

  function update() {
    if (observedTick === game.state.tick) return;
    observedTick = game.state.tick;
    const clan = game.state.entities[heroId]?.owner;
    for (const g of game.state.itemGains || []) {
      if (g.clan !== clan || !ITEMS[g.id]) continue;
      const r = button.getBoundingClientRect();
      if (!visible(r)) continue;
      toast(g.id, r); fly(g.id, r);
    }
  }
  return { update };
}
