import { ITEMS, INVENTORY_SLOTS, EQUIPMENT_SLOTS } from './sim/inventory.js';

import { ICONS, effectOf } from './item_detail.js';
export { ICONS };
// menu(key, button, event): right-click opens a slip instead of activating (the bag's Wear / Drop slip, 2026-11-26).
// dragOut(key): an item dragged out of the window `frame` (a CSS selector) and let go there (drops it on the ground).
export function createItemGrid(root, { equipment = false, activate, hover = null, menu = null, dragOut = null, frame = null }) {   // hover(key, button | null): item card (item_card.js) instead of the browser title tip
  let drag = null, dragged = 0;   // drag: { key, button, x, y, ghost }; dragged: when the last drag ended (a click right after it is ignored)
  const keys = equipment ? EQUIPMENT_SLOTS : Array.from({length:INVENTORY_SLOTS}, (_, i) => i);
  const buttons = keys.map(key => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'inventory-slot';
    button.innerHTML = '<small></small><span class="item-icon"></span><span class="item-name"></span>';
    const use = event => { event.preventDefault(); event.stopPropagation(); if (performance.now() - dragged < 250) return; activate(key); };
    button.addEventListener('click', use);
    button.addEventListener('contextmenu', menu ? event => { event.preventDefault(); event.stopPropagation(); if (!button.disabled) menu(key, button, event); } : use);
    if (dragOut) button.addEventListener('pointerdown', event => { if (event.button === 0 && !button.disabled) drag = { key, button, x: event.clientX, y: event.clientY, ghost: null }; });
    if (hover) { button.addEventListener('mouseenter', () => hover(key, button)); button.addEventListener('mouseleave', () => hover(key, null));
      button.addEventListener('focus', () => hover(key, button)); button.addEventListener('blur', () => hover(key, null)); }
    root.appendChild(button); return button;
  });
  if (dragOut) {
    // past 6 px the item's picture follows the pointer; let go outside the window and it is dropped
    addEventListener('pointermove', event => {
      if (!drag) return;
      if (!drag.ghost && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      if (!drag.ghost) { drag.ghost = document.createElement('div'); drag.ghost.className = 'bag-drag-ghost'; drag.ghost.innerHTML = drag.button.querySelector('.item-icon').innerHTML; document.body.appendChild(drag.ghost); hover?.(drag.key, null); }
      const out = !document.querySelector(frame)?.contains(document.elementFromPoint(event.clientX, event.clientY));
      drag.ghost.classList.toggle('out', out); drag.ghost.style.left = `${event.clientX}px`; drag.ghost.style.top = `${event.clientY}px`;
    });
    addEventListener('pointerup', event => {
      const d = drag; drag = null; if (!d?.ghost) return;
      d.ghost.remove(); dragged = performance.now();
      if (!document.querySelector(frame)?.contains(document.elementFromPoint(event.clientX, event.clientY))) dragOut(d.key);
    });
  }
  const update = function update(values = [], available = true, verb = 'Equip') {
    keys.forEach((key, i) => {
      const button = buttons[i], id = values[key], item = ITEMS[id];
      button.disabled = !available || !item;
      button.classList.toggle('occupied', !!item);button.classList.toggle('green-item',item?.rarity==='green');
      button.querySelector('small').textContent = equipment ? key[0].toUpperCase() + key.slice(1) : String(i + 1);
      if (button.dataset.item !== (id || '')) {
        button.dataset.item = id || '';
        button.querySelector('.item-icon').innerHTML = item ? (item.id ? `<img src="../assets/items/${item.icon || item.id}.png" alt="">` : ICONS[item.slot]) : equipment && key === 'relic' ? `<span class="empty-slot relic-empty">${ICONS.relic}</span>` : '<span class="empty-slot"></span>';
        button.querySelector('.item-name').textContent = item?.name || (equipment ? 'Empty' : '');
      }
      const fx = effectOf(item), detail = item ? `${item.name}: ${item.about}${/\.$/.test(item.about) ? '' : '.'} Visual effect: ${fx ? fx.text.toLowerCase() : 'none'}.${item.sell ? ` Sell value: ${item.sell} ryo.` : ''} ${verb}.` : `${equipment ? key : `Slot ${i + 1}`}: Empty`;
      if (!hover) button.title = detail; button.setAttribute('aria-label', detail);
    });
  };
  update.justDragged = () => performance.now() - dragged < 250;   // the page's backdrop click after a drop must not close it
  return update;
}

export function createHQStash({ game, heroId, send, onOpen = () => {}, onClose = () => {} }) {
  const root = document.createElement('section'); root.id = 'hqstash'; root.hidden = true;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'HQ stash');
  root.innerHTML = '<div class="stash-window"><header><div><small>CLAN STORAGE</small><h2>HQ stash</h2></div><span><button class="stash-back" type="button" hidden title="Back to the hire menu">Back</button> <button class="stash-close" type="button" aria-label="Close stash" title="Close (Esc)">Esc</button></span></header><div class="stash-columns"><section><h3>Stash <span class="stash-count"></span></h3><div class="gear-grid stash-items"></div></section><section><h3>Carried <span class="bag-count"></span></h3><div class="gear-grid carried-items"></div></section></div><footer>Right-click or click to transfer, Equipment stays on your character, Esc closes<div class="inventory-notice" role="status"></div></footer></div>';
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  let open = false, previousFocus, back = null;   // back: reopens the menu the stash was opened from (Hire, 2026-11-10)
  const command = (action, index) => send({id:heroId, type:'inventory', action, index});
  const stash = createItemGrid($('.stash-items'), {activate:index => command('withdraw', index)});
  const carried = createItemGrid($('.carried-items'), {activate:index => command('deposit', index)});
  function close() {
    if (!open) return; open = false; root.hidden = true; onClose(); previousFocus?.focus?.();
  }
  function update() {
    if (!open) return;
    const hero = game.state.entities[heroId], inv = game.inventory.status(hero);
    if (!inv.available || !inv.atHQ) return close();
    stash(inv.stash, inv.bag?.includes(null), 'Withdraw'); carried(inv.bag, inv.stash?.includes(null), 'Store at HQ');
    $('.stash-count').textContent = `${inv.stash.filter(Boolean).length} / ${INVENTORY_SLOTS}`;
    $('.bag-count').textContent = `${inv.bag.filter(Boolean).length} / ${INVENTORY_SLOTS}`;
    const notice = game.state.clans[hero.owner]?.notice;
    $('.inventory-notice').textContent = notice && game.state.tick - notice.tick < 100 ? notice.text : '';
  }
  $('.stash-close').addEventListener('click', close);
  $('.stash-back').addEventListener('click', () => { const to = back; close(); to?.(); });
  root.addEventListener('click', e => { if (e.target === root) close(); });
  for (const event of ['mousedown','mouseup','contextmenu','wheel']) root.addEventListener(event, e => {e.stopPropagation(); if(event==='contextmenu')e.preventDefault();});
  root.addEventListener('keydown', e => {
    e.stopPropagation(); if (e.key === 'Escape') {e.preventDefault();close();}
    if (e.key === 'Tab') {
      const stops = [...root.querySelectorAll('button:not(:disabled)')], first = stops[0], last = stops.at(-1);
      if (e.shiftKey && document.activeElement === first) {e.preventDefault();last.focus();}
      else if (!e.shiftKey && document.activeElement === last) {e.preventDefault();first.focus();}
    }
  });
  return { update, close, isOpen:() => open, open({ back: from = null } = {}) {
    const inv = game.inventory.status(game.state.entities[heroId]);
    if (open || !inv.available || !inv.atHQ) return;
    back = from; $('.stash-back').hidden = !from;
    previousFocus = document.activeElement; open = true; root.hidden = false; onOpen(); update(); $('.stash-close').focus();
  }};
}
