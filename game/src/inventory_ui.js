import { ITEMS, INVENTORY_SLOTS, EQUIPMENT_SLOTS } from './sim/inventory.js';

// Small reusable item icons; physical hero weapons continue using existing sprites.
const ICONS = {
  weapon: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 45Q43 24 52 9Q50 30 23 49Z" fill="#d5d9d6" stroke="#f4ead2"/><path d="m16 44 8 8M10 55l9-10" stroke="#c19a5f" stroke-width="5"/></svg>',
  armor: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m24 10-12 7-6 15 12 4 1 20h26l1-20 12-4-6-15-12-7-8 8Z" fill="#4e625e" stroke="#c6ac7b" stroke-width="2"/><path d="M22 29h20M22 37h20M22 45h20M28 24v26m8-26v26" stroke="#c6ac7b" stroke-width="2"/></svg>',
  accessory: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 23C7 23 20 4 32 18c12-14 25 5 0 5ZM28 22l-9 17m17-17 9 17" fill="none" stroke="#ba8169" stroke-width="4"/><circle cx="32" cy="43" r="13" fill="#645634" stroke="#d4b16d" stroke-width="2"/><path d="M28 39h8v8h-8Z" fill="none" stroke="#e1c790" stroke-width="2"/></svg>',
};
export function createItemGrid(root, { equipment = false, activate }) {
  const keys = equipment ? EQUIPMENT_SLOTS : Array.from({length:INVENTORY_SLOTS}, (_, i) => i);
  const buttons = keys.map(key => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'inventory-slot';
    button.innerHTML = '<small></small><span class="item-icon"></span><span class="item-name"></span>';
    const use = event => { event.preventDefault(); event.stopPropagation(); activate(key); };
    button.addEventListener('click', use); button.addEventListener('contextmenu', use);
    root.appendChild(button); return button;
  });
  return function update(values = [], available = true, verb = 'Equip') {
    keys.forEach((key, i) => {
      const button = buttons[i], id = values[key], item = ITEMS[id];
      button.disabled = !available || !item;
      button.classList.toggle('occupied', !!item);button.classList.toggle('green-item',item?.rarity==='green');
      button.querySelector('small').textContent = equipment ? key[0].toUpperCase() + key.slice(1) : String(i + 1);
      if (button.dataset.item !== (id || '')) {
        button.dataset.item = id || '';
        button.querySelector('.item-icon').innerHTML = item ? (item.id ? `<img src="../assets/items/${item.id}.png" alt="">` : ICONS[item.slot]) : '<span class="empty-slot"></span>';
        button.querySelector('.item-name').textContent = item?.name || (equipment ? 'Empty' : '');
      }
      const detail = item ? `${item.name}: ${item.about}${item.sell ? ` Sell value: ${item.sell} ryo.` : ''} ${verb}.` : `${equipment ? key : `Slot ${i + 1}`}: Empty`;
      button.title = detail; button.setAttribute('aria-label', detail);
    });
  };
}

export function createHQStash({ game, heroId, send, onOpen = () => {}, onClose = () => {} }) {
  const root = document.createElement('section'); root.id = 'hqstash'; root.hidden = true;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'HQ stash');
  root.innerHTML = '<div class="stash-window"><header><div><small>CLAN STORAGE</small><h2>HQ stash</h2></div><button class="stash-close" type="button" aria-label="Close stash">✕</button></header><div class="stash-columns"><section><h3>Stash <span class="stash-count"></span></h3><div class="gear-grid stash-items"></div></section><section><h3>Carried <span class="bag-count"></span></h3><div class="gear-grid carried-items"></div></section></div><footer>Right-click or click to transfer · Equipment stays on your character · Esc closes<div class="inventory-notice" role="status"></div></footer></div>';
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  let open = false, previousFocus;
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
  return { update, close, isOpen:() => open, open() {
    const inv = game.inventory.status(game.state.entities[heroId]);
    if (open || !inv.available || !inv.atHQ) return;
    previousFocus = document.activeElement; open = true; root.hidden = false; onOpen(); update(); $('.stash-close').focus();
  }};
}
