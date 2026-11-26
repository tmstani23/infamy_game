// Item hover card (2026-11-24): replaces the browser's grey title tip on inventory slots. Shows the item, what it
// does to the hero's real stats compared with what is worn now (green better, red worse), its look and its price.
// The numbers come from the sim's own stat snapshot of the hero wearing the item; this file owns no stat formulas.
import { ITEMS, EQUIPMENT_SLOTS, gearFlat } from './sim/inventory.js';
import { RARITIES } from './sim/gear_catalog.js';
import { effectOf, itemArt } from './item_detail.js';
import { formatStat, modifierDisplay } from './character_stat_format.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TIER = { common: 'Common', green: 'Fine', frontier: 'Frontier', heirloom: 'Heirloom' };
const rgb = c => c ? `rgb(${c.map(v => Math.round(v * 255)).join(',')})` : null;

// The hero's stat rows now and wearing `id` in `slot` (id null = taking that slot off): changed rows only.
export function gearPreview(game, hero, slot, id) {
  if (!hero?.equipment || !EQUIPMENT_SLOTS.includes(slot)) return [];
  const worn = { ...hero, equipment: { ...hero.equipment, [slot]: id || null } };
  worn.maxHp = (hero.maxHp ?? 0) - gearFlat(hero, 'maxHpFlat') + gearFlat(worn, 'maxHpFlat');
  const now = game.stats.snapshot(hero)?.rows || [], then = new Map((game.stats.snapshot(worn)?.rows || []).map(r => [r.key, r]));
  return now.map(r => {
    const t = then.get(r.key); if (!t || formatStat(r, r.value) === formatStat(t, t.value)) return null;
    const d = modifierDisplay({ ...r, modifier: t.value - r.value });
    return { key: r.key, label: r.label, from: formatStat(r, r.value), to: formatStat(t, t.value), delta: d.text, kind: d.kind === 'positive' ? 'good' : 'bad', row: t };
  }).filter(Boolean);
}

// ctx: { worn: true when the item sits in an equipment slot, action: what a click does, rows: gearPreview rows }
export function itemCardHtml(id, { worn = false, action = '', rows = [], replaces = null } = {}) {
  const item = ITEMS[id]; if (!item) return '';
  const tier = TIER[item.rarity] || 'Common', tint = rgb(RARITIES[item.rarity]?.color) || '#c9b48c';
  const [bonus, ...rest] = String(item.about || '').split(/\.\s+/), flavour = rest.join('. ').replace(/\.$/, '');
  const fx = effectOf(item);
  const list = rows.length ? rows.map(r => `<div class="ic-row ${r.kind}"><span>${esc(r.label)}</span><span class="ic-from">${esc(r.from)}</span><i class="ic-to"></i><b>${esc(r.to)}</b><em>${esc(r.delta)}</em></div>`).join('')
    : `<div class="ic-row same"><span>${worn ? 'Worn now' : 'No change to your stats'}</span></div>`;
  const sell = item.sell ? `Sells for ${item.sell} ryo` : item.heirloom ? 'Keepsake, never sold' : '';
  return `<div class="ic-head" style="--tier:${tint}"><span class="ic-art">${itemArt(id)}</span><div><small>${tier} ${esc(item.slot)}${worn ? ', worn' : ''}</small><h4>${esc(item.name)}</h4>`
    + `<p class="ic-bonus">${esc(bonus.replace(/\.$/, '').replace(/−/g, '-'))}</p></div></div>${flavour ? `<p class="ic-flavour">${esc(flavour)}</p>` : ''}`
    + `<div class="ic-rows"><div class="ic-cap">${worn ? 'If you take it off' : replaces ? `Replacing ${esc(replaces)}` : 'If you wear it'}</div>${list}</div>`
    + (fx ? `<p class="ic-fx">${esc(fx.text)}</p>` : '')
    + `<div class="ic-foot"><span>${esc(action)}</span><span>${esc(sell)}</span></div>`;
}

// One floating card shared by every item grid.
export function createItemCard() {
  let el = document.getElementById('itemcard');
  if (!el) { el = document.createElement('div'); el.id = 'itemcard'; el.hidden = true; el.setAttribute('role', 'tooltip'); document.body.appendChild(el); }
  let html = '';
  function show(anchor, content) {
    if (!content) return hide();
    if (content !== html) { el.innerHTML = html = content; el.style.setProperty('--tier', el.querySelector('.ic-head')?.style.getPropertyValue('--tier') || ''); }
    el.style.visibility = 'hidden'; el.hidden = false;
    // beside the slot, kept inside the window it belongs to (critic: never past the frame), else inside the screen
    const r = anchor.getBoundingClientRect(), w = el.getBoundingClientRect(), gap = 12;
    const box = anchor.closest('.character-window, .stash-window')?.getBoundingClientRect() || { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const lo = Math.max(8, box.left + 8), hi = Math.min(innerWidth, box.right) - 8;
    const left = r.right + gap + w.width <= hi ? r.right + gap : r.left - gap - w.width >= lo ? r.left - gap - w.width : Math.max(8, Math.min(r.left, innerWidth - w.width - 8));
    const bottom = Math.min(innerHeight - 8, box.bottom - 26);   // clear of the window frame
    el.style.left = `${left}px`; el.style.top = `${Math.max(8, Math.min(r.top, bottom - w.height))}px`;
    el.style.visibility = '';
  }
  function hide() { el.hidden = true; }
  return { show, hide };
}
