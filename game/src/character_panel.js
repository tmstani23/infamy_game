import { createItemGrid } from './inventory_ui.js';
import { createHeroPreview } from './render/hero_preview.js';
import { effectOf } from './item_detail.js';
import { hudIcon } from './hud_icons.js';
import { ITEMS, EQUIPMENT_SLOTS } from './sim/inventory.js';
// Character page formats authoritative snapshots; it owns no stat formulas.
import { formatStat, modifierDisplay } from './character_stat_format.js';
import { sharedKeybinds, SLOT_ACTION } from './keybinds.js';
const keybinds = sharedKeybinds();   // J / I (or their new keys) close the page
export { formatStat, modifierDisplay };

export function createCharacterPanel({ game, heroId, catalog, button, send, onOpen = () => {}, onClose = () => {} }) {
  const root = document.createElement('section'); root.id = 'characterpage'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Hero character');
  root.innerHTML = '<div class="character-window"><header><div><span class="character-eyebrow">CLAN RECORD</span><h2>Character</h2></div><button type="button" class="character-close" aria-label="Close character page" title="Close (Esc)">Esc</button></header><div class="character-layout"><aside><div class="hero-art"><canvas class="hero-preview" aria-label="Hero preview with equipped effects"></canvas></div><span class="hero-clan"></span><h3 class="hero-name"></h3><div class="character-health"><div></div></div><span class="character-hp"></span><div class="character-equipment"><h3>Equipped</h3><div class="equipment-grid"></div></div><div class="character-passives"></div></aside><main><div class="stat-heading"><h3>Attributes</h3><span>Base</span><span>Modifier</span><span>Current</span></div><div class="character-stats"></div><details class="extra-attributes"><summary>More attributes</summary><div class="character-extra-stats"></div></details><section class="character-inventory"><h3>Inventory <span class="inventory-count"></span></h3><div class="gear-grid"></div></section><section class="character-supplies"><h3>Field supplies</h3><button class="use-bandage"></button><button class="use-lantern"></button><p class="supplies-hint"></p></section><details class="character-abilities"><summary>Abilities</summary><div></div></details></main></div><footer>Right-click an item to equip, Right-click equipped gear to remove, I / J close<div class="inventory-notice" role="status"></div></footer></div>';
  document.body.appendChild(root);
  const $ = s => root.querySelector(s), rows = new Map(), abilities = new Map(), passiveRows = new Map();
  const command = (action, detail) => send({id:heroId, type:'inventory', action, ...detail});
  const bag = createItemGrid($('.gear-grid'), {activate:index => command('equip', {index})});
  const equipment = createItemGrid($('.equipment-grid'), {equipment:true, activate:slot => command('unequip', {slot})});
  let open = false, previousFocus = null;
  // animated front view with the real weapon glow and gear auras (render/hero_preview.js)
  const preview = createHeroPreview({ canvas: $('.hero-preview'), catalog });
  [...$('.equipment-grid').children].forEach((button, i) => {
    const fx = document.createElement('span'); fx.className = 'slot-effect'; button.appendChild(fx);
    button.addEventListener('mouseenter', () => preview.focus(i)); button.addEventListener('mouseleave', () => preview.focus(null));
    button.addEventListener('focus', () => preview.focus(i)); button.addEventListener('blur', () => preview.focus(null));
  });
  $('.use-bandage').addEventListener('click',()=>{send({id:heroId,type:'item',action:'bandage'});setOpen(false);});
  // horse whistles were taken out (Tim 2026-11-08): H calls your mount from anywhere, the Vehicles panel's Call picks another
  let raidTarget;$('.use-lantern').addEventListener('click',()=>{if(raidTarget){send({id:heroId,type:'business',action:'raid',business:raidTarget});setOpen(false);}});
  function setOpen(on) {
    if (open === on) return;
    open = on; root.hidden = !on; button?.setAttribute('aria-expanded', String(on));
    if (on) { previousFocus = document.activeElement; onOpen(); update(); $('.character-close').focus(); }
    else { preview.focus(null); preview.pause(); onClose(); previousFocus?.focus?.(); }
  }
  $('.character-close').addEventListener('click', () => setOpen(false));
  root.addEventListener('click', e => { if (e.target === root) setOpen(false); });
  root.addEventListener('keydown', e => {
    e.stopPropagation();
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
    for (const row of snapshot.rows) {
      let record = rows.get(row.key);
      if (!record) {
        const el = document.createElement('div'); el.className = 'character-stat'; el.tabIndex = 0;
        const label = document.createElement('span'), base = document.createElement('span'), modifier = document.createElement('span'), current = document.createElement('strong');
        modifier.className = 'stat-modifier'; el.append(label, base, modifier, current); $(['normalHit','attackInterval','damageTaken','run'].includes(row.key) ? '.character-stats' : '.character-extra-stats').appendChild(el);
        record = { el, label, base, modifier, current }; rows.set(row.key, record);
      }
      const change = modifierDisplay(row);
      record.label.textContent = row.label; record.base.textContent = formatStat(row, row.base); record.modifier.textContent = change.text; record.current.textContent = formatStat(row, row.value);
      record.el.dataset.group = row.group; record.modifier.className = `stat-modifier ${change.kind}`;
      record.current.className = change.changed ? `modified ${change.kind}` : '';
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
