import { createItemGrid } from './inventory_ui.js';
import { createHeroPreview } from './render/hero_preview.js';
import { effectOf } from './item_detail.js';
import { createItemCard, gearPreview, itemCardHtml } from './item_card.js';
import { hudIcon } from './hud_icons.js';
import { ITEMS, EQUIPMENT_SLOTS } from './sim/inventory.js';
import { GROUND_ITEMS } from './sim/gear_catalog.js';
// Character page formats authoritative snapshots; it owns no stat formulas.
import { formatStat, modifierDisplay } from './character_stat_format.js';
import { sharedKeybinds, SLOT_ACTION } from './keybinds.js';
const keybinds = sharedKeybinds();
const MAIN_ROWS = ['normalHit', 'attackInterval', 'damageTaken', 'run'];   // the rest sit under More attributes   // J / I (or their new keys) close the page
export { formatStat, modifierDisplay };

export function createCharacterPanel({ game, heroId, catalog, button, send, onOpen = () => {}, onClose = () => {} }) {
  const root = document.createElement('section'); root.id = 'characterpage'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Hero character');
  root.innerHTML = '<div class="character-window"><header><div><span class="character-eyebrow">CLAN RECORD</span><h2>Character</h2></div><button type="button" class="character-close" aria-label="Close character page" title="Close (Esc)">Esc</button></header><div class="character-layout"><aside><div class="hero-art"><canvas class="hero-preview" aria-label="Hero preview with equipped effects"></canvas></div><span class="hero-clan"></span><h3 class="hero-name"></h3><div class="character-health"><div></div></div><span class="character-hp"></span><div class="character-equipment"><h3>Equipped</h3><div class="equipment-grid"></div></div><div class="character-passives"></div></aside><main><div class="stat-heading"><h3>Attributes</h3><span>Base</span><span>Modifier</span><span>Current</span></div><div class="character-stats"></div><details class="extra-attributes"><summary>More attributes</summary><div class="character-extra-stats"></div></details><section class="character-inventory"><h3>Inventory <span class="inventory-count"></span></h3><div class="gear-grid"></div><div class="stolen-chest" hidden tabindex="0"><span class="chest-art"><img src="art/props/iron_chest.png" alt=""><i></i><i></i><i></i><i></i></span><span><b>Stolen chest</b><small class="chest-loot"></small></span></div><div class="stolen-chest hide-stock" hidden tabindex="0"><span><b>Hides</b><small class="hide-list"></small></span></div></section><section class="character-supplies"><h3>Field supplies</h3><button class="use-bandage"></button><button class="use-lantern"></button><p class="supplies-hint"></p></section><details class="character-abilities"><summary>Abilities</summary><div></div></details></main></div><footer>Click an item to wear it, Right-click for Drop, Drag it out to drop it, Right-click worn gear to remove, I / J close<div class="inventory-notice" role="status"></div></footer></div>';
  document.body.appendChild(root);
  const $ = s => root.querySelector(s), rows = new Map(), abilities = new Map(), passiveRows = new Map();
  const command = (action, detail) => send({id:heroId, type:'inventory', action, ...detail});
  // hovering an item: the item card beside it and the Attributes rows show what wearing it (or taking it off) would change (2026-11-24)
  const card = createItemCard(); let hovered = null;   // { key, button, worn }
  const hover = worn => (key, button) => { if (button && !slip.hidden) return; hovered = button ? { key, button, worn } : null; if (!button) card.hide(); update(); };
  // a bag item (2026-11-26): click wears it; right-click opens a slip, Wear or Drop; dragged out of the window it is dropped
  const drop = index => send({id:heroId, type:'groundItem', action:'drop', index});
  const slip = document.createElement('div'); slip.className = 'bag-slip'; slip.hidden = true; slip.setAttribute('role', 'menu');
  slip.innerHTML = '<b class="slip-name"></b><button type="button" role="menuitem" data-do="wear">Wear</button><button type="button" role="menuitem" data-do="drop">Drop on the ground</button><small class="slip-why"></small>';
  $('.character-window').appendChild(slip); let slipAt = null;
  const closeSlip = () => { slip.hidden = true; slipAt = null; };
  slip.addEventListener('click', e => { const act = e.target.closest('[data-do]')?.dataset.do; if (!act || slipAt == null) return;
    e.stopPropagation(); if (act === 'wear') command('equip', {index: slipAt}); else drop(slipAt); closeSlip(); });
  function openSlip(index, button, event) {
    const hero = game.state.entities[heroId], id = game.inventory.status(hero).bag?.[index]; if (!ITEMS[id]) return;
    slipAt = index; hovered = null; card.hide();
    const can = game.groundItems?.canDrop(hero), mins = Math.round(GROUND_ITEMS.lifeSeconds / 60);
    slip.querySelector('.slip-name').textContent = ITEMS[id].name;
    const d = slip.querySelector('[data-do="drop"]'); d.disabled = !can;
    d.title = can ? `It lies there as a small bundle for ${mins} minutes, then is gone. Anyone can pick it up with Space, rivals too.` : 'Only outdoors: on a street or out on the island';
    slip.querySelector('.slip-why').textContent = can ? '' : 'Drop outdoors only';
    const box = $('.character-window').getBoundingClientRect(); slip.hidden = false;
    const w = slip.getBoundingClientRect();
    slip.style.left = `${Math.min(event.clientX - box.left, box.width - w.width - 8)}px`; slip.style.top = `${Math.min(event.clientY - box.top, box.height - w.height - 8)}px`;
    slip.querySelector('[data-do="wear"]').focus();
  }
  root.addEventListener('pointerdown', e => { if (!slip.hidden && !slip.contains(e.target)) closeSlip(); }, true);
  const bag = createItemGrid($('.gear-grid'), {activate:index => command('equip', {index}), hover: hover(false), menu: openSlip, frame: '#characterpage .character-window',
    dragOut: drop });   // indoors the sim refuses with a notice
  const equipment = createItemGrid($('.equipment-grid'), {equipment:true, activate:slot => command('unequip', {slot}), hover: hover(true)});
  let open = false, previousFocus = null;
  // animated front view with the real weapon glow and gear auras (render/hero_preview.js)
  const preview = createHeroPreview({ canvas: $('.hero-preview'), catalog });
  [...$('.equipment-grid').children].forEach((button, i) => {
    const fx = document.createElement('span'); fx.className = 'slot-effect'; button.appendChild(fx);
    button.addEventListener('mouseenter', () => preview.focus(i)); button.addEventListener('mouseleave', () => preview.focus(null));
    button.addEventListener('focus', () => preview.focus(i)); button.addEventListener('blur', () => preview.focus(null));
  });
  $('.use-bandage').addEventListener('click',()=>{send({id:heroId,type:'item',action:'bandage'});setOpen(false);});
  // horse whistles were taken out (2026-11-08): H calls your mount from anywhere, the Vehicles panel's Call picks another
  let raidTarget;$('.use-lantern').addEventListener('click',()=>{if(raidTarget){send({id:heroId,type:'business',action:'raid',business:raidTarget});setOpen(false);}});
  function setOpen(on) {
    if (open === on) return;
    open = on; root.hidden = !on; button?.setAttribute('aria-expanded', String(on));
    if (on) { previousFocus = document.activeElement; onOpen(); update(); $('.character-close').focus(); }
    else { hovered = null; card.hide(); closeSlip(); preview.focus(null); preview.pause(); onClose(); previousFocus?.focus?.(); }
  }
  $('.character-close').addEventListener('click', () => setOpen(false));
  root.addEventListener('click', e => { if (e.target === root && !bag.justDragged()) setOpen(false); });
  root.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape' && !slip.hidden) { e.preventDefault(); closeSlip(); return; }
    if (e.key === 'Escape' || ['character', 'inventory'].includes(keybinds.lookup(e))) { e.preventDefault(); setOpen(false); }
    if (e.key === 'Tab') {
      const stops = [...root.querySelectorAll('button:not(:disabled), summary, [tabindex="0"]')].filter(el => el.getClientRects().length), first = stops[0], last = stops.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  });
  for (const type of ['mousedown', 'mouseup', 'contextmenu', 'wheel']) root.addEventListener(type, e => { e.stopPropagation(); if (type === 'contextmenu') e.preventDefault(); });
  button?.addEventListener('click', () => setOpen(!open));
  function update() {
    if (!open) return;
    const hero = game.state.entities[heroId], snapshot = game.stats.snapshot(hero); if (!snapshot) return;
    const inv = game.inventory.status(hero);
    const supply=game.state.clans[hero.owner],cooldown=Math.max(0,Math.ceil(((inv.bandageReadyAt||0)-game.state.tick)/20));
    $('.use-bandage').textContent=`Bandage, ${inv.bandages||0}/2${hero.bandaging?', Healing...':cooldown?', '+cooldown+'s':''}`;
    $('.use-bandage').disabled=!inv.available||!(inv.bandages>0)||cooldown>0||!!hero.bandaging||hero.hp>=hero.maxHp;
    raidTarget=Object.values(game.state.businesses).find(b=>game.businesses.canRaid(heroId,b.id).ok)?.id;
    $('.use-lantern').textContent=`War Lantern, ${supply.lanterns||0}${raidTarget?', Raid '+(game.state.businesses[raidTarget].name||'this business'):''}`;
    $('.use-lantern').disabled=!raidTarget;
    $('.supplies-hint').textContent='Bandage: stand still for 6s; damage and actions interrupt. War Lantern: approach a rival business at night.';
    bag(inv.bag, inv.available); equipment(inv.equipment, inv.available && inv.bag?.includes(null), 'Remove to inventory');
    // train robbery (2026-11-21): the stolen chest the hero carries, with what is inside (hover for the rules)
    { const el = $('.stolen-chest'), loot = hero.chest?.loot, text = loot ? Object.entries(loot).filter(([, n]) => n >= 1).map(([r, n]) => `${Math.round(n)} ${r}`).join(', ') || 'Empty' : '';
      el.hidden = !loot;
      if (loot && el.dataset.loot !== text) { el.dataset.loot = text; el.querySelector('.chest-loot').textContent = text;
        el.title = `Stolen chest: ${text}. Take it to one of your town halls or your war camp banner and press Space to cash it in. If your hero is knocked out, the chest drops where they fall, and any hero can pick it up.`; el.setAttribute('aria-label', el.title); } }
    // hides and gall from the hunt (wildlife W5): sold with Space at a built market in one of your towns
    { const el = $('.hide-stock'), have = Object.entries(game.state.clans?.[hero.owner]?.hides || {}).filter(([, n]) => n > 0);
      const prices = game.wildAnimals?.prices?.() || {}, worth = Math.round(have.reduce((v, [k, n]) => v + n * (prices[k] || 0), 0));
      const text = have.map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}${n > 1 ? 's' : ''}`).join(', ');
      el.hidden = !have.length;
      if (have.length && el.dataset.list !== text) { el.dataset.list = text; el.querySelector('.hide-list').textContent = text;
        el.title = `Hides: ${text}, worth ${worth} ryo. Take them to a built market in one of your towns and press Space to sell them.`; el.setAttribute('aria-label', el.title); } }
    $('.inventory-count').textContent = `${inv.bag?.filter(Boolean).length || 0} / 12`;
    const notice = game.state.clans[hero.owner]?.notice;
    $('.inventory-notice').textContent = notice && game.state.tick - notice.tick < 100 ? notice.text : '';
    root.dataset.clan = snapshot.faction || snapshot.kind;
    $('.hero-name').textContent = snapshot.name; $('.hero-clan').textContent = snapshot.clan;
    $('.character-hp').textContent = `${Math.ceil(snapshot.hp)} / ${snapshot.maxHp} HP`;
    $('.character-health div').style.width = `${Math.max(0, Math.min(100, snapshot.hp / snapshot.maxHp * 100))}%`;
    preview.draw(hero);
    [...$('.equipment-grid').children].forEach((button, i) => {
      const fx = effectOf(ITEMS[inv.equipment?.[EQUIPMENT_SLOTS[i]]]), el = button.querySelector('.slot-effect'), text = fx ? fx.short : '';
      if (el.textContent !== text) { el.textContent = text; el.style.setProperty('--fx', fx?.color || 'transparent'); }
    });
    // the hovered item: what it would change, for the card and the Attributes rows
    let changes = new Map();
    if (hovered) {
      const id = hovered.worn ? inv.equipment?.[hovered.key] : inv.bag?.[hovered.key], item = ITEMS[id];
      if (!item || !inv.available) card.hide();
      else {
        const slot = item.slot, rows = gearPreview(game, hero, slot, hovered.worn ? null : id), now = ITEMS[inv.equipment?.[slot]];
        changes = new Map(rows.map(r => [r.key, r]));
        card.show(hovered.button, itemCardHtml(id, { worn: hovered.worn, rows, replaces: !hovered.worn && now ? now.name : null,
          action: hovered.worn ? (inv.bag?.includes(null) ? 'Right-click to take off' : 'Bag full') : 'Click to wear, right-click to drop' }));
      }
    }
    for (const row of snapshot.rows) {
      let record = rows.get(row.key);
      if (!record) {
        const el = document.createElement('div'); el.className = 'character-stat'; el.tabIndex = 0;
        const label = document.createElement('span'), base = document.createElement('span'), modifier = document.createElement('span'), current = document.createElement('strong');
        modifier.className = 'stat-modifier'; el.append(label, base, modifier, current); $(MAIN_ROWS.includes(row.key) ? '.character-stats' : '.character-extra-stats').appendChild(el);
        record = { el, label, base, modifier, current }; rows.set(row.key, record);
      }
      const change = modifierDisplay(row);
      record.label.textContent = row.label; record.base.textContent = formatStat(row, row.base); record.modifier.textContent = change.text; record.current.textContent = formatStat(row, row.value);
      record.el.dataset.group = row.group; record.modifier.className = `stat-modifier ${change.kind}`;
      record.current.className = change.changed ? `modified ${change.kind}` : '';
      const next = changes.get(row.key); record.el.classList.toggle('item-preview', !!next);
      record.el.classList.toggle('item-worse', next?.kind === 'bad');   // stats under More attributes preview there (the card lists every change)
      if (next) {   // the row as it would read wearing the item, and the change it makes beside the new value
        record.modifier.textContent = modifierDisplay(next.row).text; record.modifier.className = `stat-modifier preview ${next.kind}`;   // the new total, so Base plus Modifier still gives Current
        record.current.textContent = next.to; record.current.className = `preview ${next.kind}`;
        const was = document.createElement('small'); was.className = 'stat-was'; was.textContent = next.from; record.current.prepend(was, document.createElement('i'));
      }
      const detail = [...row.sources, row.note].filter(Boolean).join(', ') || 'Base value; no active modifiers.';
      record.el.title = detail; record.modifier.title = detail;
      record.el.setAttribute('aria-label', `${row.label}: base ${formatStat(row, row.base)}, modifier ${change.text}, current ${formatStat(row, row.value)}. ${detail}`);
    }
    for (const passive of snapshot.passives) {
      let el = passiveRows.get(passive.id);
      if (!el) { el = document.createElement('div'); el.className = 'character-passive'; el.innerHTML = '<b></b><small></small><p></p>'; $('.character-passives').appendChild(el); passiveRows.set(passive.id, el); }
      el.querySelector('b').textContent = passive.name; el.querySelector('small').textContent = passive.status; el.querySelector('p').textContent = passive.description; el.classList.toggle('active', passive.active);
    }
    for (const a of snapshot.abilities) {
      let el = abilities.get(a.key);
      if (!el) { el = document.createElement('details'); el.innerHTML = '<summary><i class="ab-ico"></i><kbd></kbd><b></b><span></span></summary><p></p>'; el.querySelector('.ab-ico').innerHTML = hudIcon(a.kind); $('.character-abilities > div').appendChild(el); abilities.set(a.key, el); }
      { const kb = el.querySelector('kbd'), t = SLOT_ACTION[a.key] ? keybinds.badge(SLOT_ACTION[a.key]) : a.key; kb.textContent = t; kb.classList.toggle('unbound', t === 'Unbound'); } el.querySelector('b').textContent = a.name;
      el.querySelector('span').textContent = a.remaining > 0 ? `${Math.ceil(a.remaining)}s remaining` : `${a.cooldown}s cooldown`;
      el.querySelector('p').textContent = a.about;
    }
  }
  // I / Inventory button: open at the bag (closes if it is already open)
  function showInventory() { if (open) return setOpen(false); setOpen(true); $('.character-inventory').scrollIntoView({ block: 'nearest' }); }
  return { update, showInventory, toggle: () => setOpen(!open), close: () => { if (open) setOpen(false); }, isOpen: () => open };
}
