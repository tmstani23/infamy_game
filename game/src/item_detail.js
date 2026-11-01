// Shared item presentation for the shop and character page: art, the visible
// equipped effect (what render/characters.js really draws per slot) and a detail card.
import { ITEMS } from './sim/inventory.js';
import { CONSUMABLES } from './sim/gear_catalog.js';
// Small reusable item icons; physical hero weapons continue using existing sprites.
export const ICONS = {
  weapon: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 45Q43 24 52 9Q50 30 23 49Z" fill="#d5d9d6" stroke="#f4ead2"/><path d="m16 44 8 8M10 55l9-10" stroke="#c19a5f" stroke-width="5"/></svg>',
  armor: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m24 10-12 7-6 15 12 4 1 20h26l1-20 12-4-6-15-12-7-8 8Z" fill="#4e625e" stroke="#c6ac7b" stroke-width="2"/><path d="M22 29h20M22 37h20M22 45h20M28 24v26m8-26v26" stroke="#c6ac7b" stroke-width="2"/></svg>',
  accessory: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 23C7 23 20 4 32 18c12-14 25 5 0 5ZM28 22l-9 17m17-17 9 17" fill="none" stroke="#ba8169" stroke-width="4"/><circle cx="32" cy="43" r="13" fill="#645634" stroke="#d4b16d" stroke-width="2"/><path d="M28 39h8v8h-8Z" fill="none" stroke="#e1c790" stroke-width="2"/></svg>',
};

// what render/gear_fx.js draws for each visual kind
const EFFECT = { weaponGlint: 'A small glint slides along your blade every few seconds',
  weaponEmbers: 'A few sparks drift off your blade, more as you swing',
  weaponTrail: 'A thin arc of light follows your blade tip on swings',
  armorShimmer: 'A thin line of light sweeps down your outline',
  bodyOutline: 'Faint afterimages trail you while you move',
  accessoryAura: 'Tiny spirit motes rise around you',
  movementWisps: 'Wind curls on the ground behind you while you run' };
const SHORT = { weaponGlint: 'edge glint', weaponEmbers: 'embers', weaponTrail: 'swing trail', armorShimmer: 'rim sheen',
  bodyOutline: 'afterimage', accessoryAura: 'spirit motes', movementWisps: 'wind wisps' };
const css = c => c ? `rgb(${c.map(v => Math.round(v * 255)).join(',')})` : '#d8b56c';
export const itemOf = id => ITEMS[id] || CONSUMABLES[id] || null;
export function effectOf(item) {
  if (!item?.slot) return null;
  const kind = item.visual?.kind;
  return { text: EFFECT[kind] || 'Subtle light on your hero', short: SHORT[kind] || item.slot, color: css(item.visual?.color || item.glow) };
}
export function itemArt(id) {
  const item = ITEMS[id];
  if (item) return item.id ? `<img src="../assets/items/${item.id}.png" alt="">` : ICONS[item.slot];
  if (id === 'bandage') return '<img src="../assets/items/bandage.png" alt="">';
  if (id === 'war_lantern') return '<span class="item-emoji">🏮</span>';
  return '<span class="empty-slot"></span>';
}
const ABOUT = { bandage: 'Heal 25% of maximum HP over 6 s; moving, attacking or taking damage interrupts it; 60 s cooldown; carry 2',
  war_lantern: 'Starts a night raid on a rival business; one shared clan charge' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// rows: [label, value, kind] ; equipped: the item now in the same slot (for comparison)
export function detailHtml(id, { rows = [], equipped = null } = {}) {
  const item = itemOf(id); if (!item) return '<p class="detail-empty">Hover or click an item to see its details.</p>';
  const gear = !!ITEMS[id], rarity = item.rarity === 'green' ? 'Fine' : gear ? 'Common' : 'Supply';
  const lines = (item.about || ABOUT[id] || '').replace(/\.$/, '').split(/;\s*/).filter(Boolean)
    .map(t => `<div class="detail-stat ${/^[+−]/.test(t) ? 'good' : /\d/.test(t) ? 'cost' : ''}">${esc(t)}</div>`).join('');
  const effect = effectOf(item);
  const same = equipped && equipped !== item ? `<p class="detail-compare">Replaces equipped <b>${esc(equipped.name)}</b>: ${esc((equipped.about || '').replace(/\.$/, ''))}</p>`
    : equipped === item ? '<p class="detail-compare">Currently equipped.</p>' : '';
  return `<div class="detail-top"><span class="detail-art${item.rarity === 'green' ? ' green' : ''}">${itemArt(id)}</span><div><small>${gear ? item.slot : 'supply'} · ${rarity}</small><h3>${esc(item.name)}</h3></div></div>
    <div class="detail-stats">${lines}${rows.map(([a, b, k]) => `<div class="detail-row ${k || ''}"><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join('')}</div>
    ${effect ? `<p class="detail-effect"><i style="--fx:${effect.color}"></i>Visual effect when equipped: ${effect.text}</p>` : `<p class="detail-effect none">No visual effect on your hero${id === 'war_lantern' ? ' (it hangs a War Lantern at the business you raid)' : ''}</p>`}${same}`;
}
