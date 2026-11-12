// The hero's action bar (WoW-style), bottom centre: portrait and health, the basic attack
// and the Q E R F abilities with cooldown sweeps, active buffs above, crew health pips
// with their names on the left (click one to select it, Shift-click to add or drop it,
// double-click to select it alone and jump the camera to it). Control-group numbers
// appear under assigned crew; changing selection never changes their orders.
// Only reads the state; abilities go to the rules as 'ability' commands.
import { unitName } from './selection_panel.js';
import { baseStats } from './sim/stats.js';
import { createGroupedCrew } from './grouped_crew.js';
import { CONSUMABLES } from './sim/gear_catalog.js';
import { itemArt } from './item_detail.js';
import { hudIcon } from './hud_icons.js';
import { sharedKeybinds, SLOT_ACTION } from './keybinds.js';
const keybinds = sharedKeybinds();   // key text follows rebinding (Tim 2026-11-12)

// Usable items share ONE action-bar slot (key B, Tim 2026-11-01): the first one carried shows
// there with its count and cooldown sweep; nothing carried = empty frame. Add new usables here.
export const USABLE_ITEMS = [
  { id: 'bandage', action: 'bandage', def: CONSUMABLES.bandage, count: inv => inv.bandages || 0, readyAt: inv => inv.bandageReadyAt || 0,
    blocked: h => h.bandaging ? 'Already bandaging' : h.hp >= h.maxHp ? 'Full health' : '',
    about: 'Heal 25% of maximum HP over 6 s. Moving, attacking or taking damage interrupts it.' },
];

const BUFFS = { charming:'Charming', rally: 'Rally', lantern: 'Red Lantern', intimidated: 'Intimidated', snared: 'Slowed', shroud: 'Smoke (healing)', ambush: 'Ambush (+20% crit)', veil: 'Vanish', reprisal: 'Reprisal (cleave)', pursuit: 'Reprisal (+30% run)', formation: 'Iron Formation', stunned: 'Stunned', downed: 'Downed' };

const pct = k => `${Math.round(k * 100)}%`;
// MMO-style tooltip lines for a slot, with numbers worked out from the hero's stats
function tooltip(a, key, stats) {
  const dmg = stats.damage || 0;
  if (!a) return { name: 'Auto attack', key: 'Right-click', lines: [
    ['Damage', `${dmg} per hit`], ['Attack speed', `every ${stats.attackSpeed} s`], ['Range', `${stats.attackRange} steps`],
    ['Critical hit', `${pct(stats.critChance || 0)} chance, ${stats.critMultiplier || 2}x damage`]],
    about: 'Tab selects a target. T or right-clicking an enemy body, nameplate or target portrait attacks with the current command group. Ctrl + right-click orders selected crew only. Right-click ground moves. During execution, attacks order selected crew while the hero keeps executing. Hero movement, Escape or an enemy hit interrupts execution.' };
  const lines = { dash: [['Damage', `${Math.round(dmg * a.damageMultiplier)} to each enemy passed (${pct(a.damageMultiplier)})`], ['Distance', `up to ${a.range} steps`]],
    intimidate: [['Effect', `enemies deal ${pct(1 - a.enemyDamage)} less damage`], ['Area', `${a.radius} steps around you`], ['Duration', `${a.seconds} s`]],
    rally: [['Effect', `you and your crew attack ${pct(a.attackSpeed - 1)} faster`], ['Heal', `${pct(a.heal)} of your and each crew member's health`], ['Area', `${a.radius} steps around you`], ['Duration', `${a.seconds} s`]],
    lantern: [['Damage', `+${pct(a.damage - 1)} (${Math.round(dmg * a.damage)} per hit)`], ['Lifesteal', `${pct(a.lifesteal)} of damage dealt`], ['Duration', `${a.seconds} s`]],
    sweep: [['Damage', `${Math.round(dmg * a.damageMultiplier)} (${pct(a.damageMultiplier)})`], ['Area', `${a.radius} steps`], ['Slow', `${pct(1-a.snareSpeed)} for ${a.snareSeconds} s`]],
    reprisal: [['Brace', `up to ${a.channelSeconds} s; damage to you or nearby crew activates`], ['Counter', `your next normal hit stuns ${a.stunSeconds} s`], ['Cleave', `${pct(a.splash)} splash for ${a.seconds} s`], ['Nearby crew', `${pct(a.crewSplash ?? .2)} splash for ${a.crewSeconds ?? 3} s within ${a.crewRadius ?? 6} steps; no stun`], ['Move to break', `+${pct(a.escapeSpeed-1)} run speed for ${a.escapeSeconds} s instead`]],
    threefold: [['Damage', `${a.strikes} x ${Math.round(dmg * a.damageMultiplier)} (${pct(a.damageMultiplier)} each)`], ['Duration', `${a.seconds} s; movement cancels`]],
    formation: [['Protection', `${pct(1-a.damageTaken)} less damage inside`], ['Area', `${a.radius} steps; fixed on the ground`], ['Duration', `${a.seconds} s`]] }[a.kind] || [];
  return { name: a.name + (key === 'F' ? ' (ultimate)' : ''), key, lines: [['Cost', a.cost ? `${a.cost} ryo` : 'None'], ['Cooldown', `${a.cooldown} s`], ...lines], about: a.about };
}

export function createActionBar({ root, game, units, heroId, tickRate, crewInput, where = () => '', jump = () => {}, watchGroup = () => {}, send = () => {}, crewRoot = null, onInspect = () => {}, onHeroFocus = () => {} }) {
  const hero = () => game.state.entities[heroId];
  const stats = game.stats?.base(hero()) || baseStats(units, hero());
  const kit = stats.abilities || {};
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  const el = (tag, cls, parent, text) => { const n = document.createElement(tag); n.className = cls; if (text) n.textContent = text; parent.appendChild(n); return n; };

  const buffs = el('div', 'buffs', root);
  const row = el('div', 'row', root);
  const koNotice = el('div', 'ko-notice', root);
  const crew = el('div', 'crew', crewRoot || row);
  const grouped = createGroupedCrew({root:crew,game,heroId,units,crewInput,send,watchGroup,where});
  // Tim 2026-10-30: click = only this crew member, shown in the target frame; Shift+click adds or removes.
  // A click on a member of a bigger selection waits for mouseup, so dragging it still moves the whole selection.
  let pendingPick = null;
  const pickOne = id => { crewInput.selectUnit(id, true); if (game.state.entities[id]) onInspect(id); };
  crew.addEventListener('mousedown', e => {
    const id = e.target.closest('.mate')?.dataset.id;
    pendingPick = null;
    if (!id || !crewInput || e.button !== 0) return;
    const sel = crewInput.selected();
    if (e.shiftKey) { crewInput.select(sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]); return; }
    if (sel.includes(id) && sel.length > 1) { pendingPick = id; return; }
    pickOne(id);
  });
  crew.addEventListener('click', e => {
    const id = e.target.closest('.mate')?.dataset.id;
    if (id && id === pendingPick) pickOne(id);
    pendingPick = null;
  });
  crew.addEventListener('dragstart', () => { pendingPick = null; });
  crew.addEventListener('dblclick', e => {
    if (e.button !== 0) return;
    const id = e.target.closest('.mate')?.dataset.id, u = game.state.entities[id];
    if (id) crewInput?.select([id]);
    if (u) { onInspect(id); jump(u); }
    else if (id && game.police?.hq?.door) jump({ place: 'street', x: game.police.hq.door[0], z: game.police.hq.door[1] });   // jailed: the HQ
  });
  const portrait = el('div', 'portrait', row);
  portrait.addEventListener('mousedown',e=>{if(e.button===0)crewInput?.selectAll();});
  portrait.addEventListener('dblclick',e=>{if(e.button===0)onHeroFocus();});   // Tim 2026-10-30: camera back to the hero
  const face = el('div', 'face', portrait);
  el('span', 'glyph', face, 'R');
  const hpBar = el('div', 'hp', portrait), hpFill = el('div', 'fill', hpBar), hpText = el('div', 'txt', hpBar);

  const slots = [];
  // the key text on each slot: the slot's bound key, RMB stays (Tim 2026-11-12: Unbound in red when it has none)
  const keyShown = k => SLOT_ACTION[k] ? keybinds.badge(SLOT_ACTION[k]) : k === 'B' ? keybinds.badge('useItem') : k;
  const keyEls = [];
  const paintKeys = () => { for (const [n, k] of keyEls) { const t = keyShown(k); n.textContent = t; n.classList.toggle('unbound', t === 'Unbound'); } };
  keybinds.subscribe(paintKeys);
  const buffTimers = new Map();
  const addSlot = (key, kind, a) => {
    const s = el('div', 'slot', row);
    // drawn icon with the name under it (Tim 2026-11-11: icons, and the name stays readable)
    el('div', 'icon', s).innerHTML = `<span class="ab-ico">${hudIcon(a ? a.kind : 'attack')}</span><span class="ab-name">${a ? a.name : 'Auto attack'}</span>`;
    s.addEventListener('mouseenter', () => {
      const current = game.stats?.effective(hero()) || stats;
      const t = tooltip(a, key, a ? stats : { ...current, damage: Math.round(current.damage || 0) });
      tip.innerHTML = `<b>${t.name}</b><i${keyShown(key) === 'Unbound' ? ' class="unbound"' : ''}>${keyShown(key)}</i>` + t.lines.map(([k, v]) => `<div><span>${k}</span>${v}</div>`).join('') + `<p>${t.about}</p>`;
      tip.hidden = false;
      const r = s.getBoundingClientRect();
      tip.style.left = `${Math.min(innerWidth - 270, Math.max(10, r.left + r.width / 2 - 130))}px`;
      tip.style.bottom = `${innerHeight - r.top + 10}px`;
    });
    s.addEventListener('mouseleave', () => { tip.hidden = true; });
    keyEls.push([el('div', 'key', s, keyShown(key)), key]);
    const sweep = el('div', 'sweep', s), secs = el('div', 'secs', s);
    slots.push({ s, key, a, sweep, secs, wasReady: true });
  };
  addSlot('RMB', 'attack', null);
  for (const [k, a] of Object.entries(kit)) addSlot(k, a.kind, a);

  // the usable-item slot, right of F
  const itemSlot = el('div', 'slot item-slot empty', row), itemIcon = el('div', 'icon', itemSlot);
  keyEls.push([el('div', 'key', itemSlot, keyShown('B')), 'B']); paintKeys();
  const itemCount = el('div', 'count', itemSlot), itemSweep = el('div', 'sweep', itemSlot), itemSecs = el('div', 'secs', itemSlot);
  let itemShown = null, itemWasReady = true;
  const inv = () => (game.inventory?.status(hero()) || {});
  const currentItem = () => USABLE_ITEMS.find(u => u.count(inv()) > 0) || null;
  function useItem() {
    const h = hero(), u = currentItem();
    if (!h || !u || h.dead || u.blocked(h) || u.readyAt(inv()) > game.state.tick) return;
    send({ id: heroId, type: 'item', action: u.action });
  }
  itemSlot.addEventListener('click', useItem);
  itemSlot.addEventListener('mouseenter', () => {
    const u = currentItem(), v = inv();
    tip.innerHTML = u ? `<b>${u.def.name}</b><i>B</i><div><span>Carried</span>${u.count(v)} / ${u.def.carryLimit}</div><div><span>Cooldown</span>${u.def.cooldownSeconds} s</div><p>${u.about}</p>`
      : '<b>Item slot</b><i>B</i><p>Usable items you carry (bandages from the blacksmith) appear here.</p>';
    tip.hidden = false;
    const r = itemSlot.getBoundingClientRect();
    tip.style.left = `${Math.min(innerWidth - 270, Math.max(10, r.left + r.width / 2 - 130))}px`;
    tip.style.bottom = `${innerHeight - r.top + 10}px`;
  });
  itemSlot.addEventListener('mouseleave', () => { tip.hidden = true; });
  function updateItem(h, t) {
    const u = currentItem(), v = inv();
    if ((u?.id || null) !== itemShown) { itemShown = u?.id || null; itemIcon.innerHTML = u ? itemArt(u.id) : ''; }
    itemSlot.classList.toggle('empty', !u);
    if (!u) { itemCount.textContent = itemSecs.textContent = ''; itemSweep.style.background = 'none'; itemSlot.classList.remove('active', 'blocked'); return; }
    const left = (u.readyAt(v) - t) / tickRate, cooling = left > 0;
    itemCount.textContent = `${u.count(v)}/${u.def.carryLimit}`;
    itemSweep.style.background = cooling ? `conic-gradient(transparent ${(1 - left / u.def.cooldownSeconds) * 360}deg, rgba(4,5,8,.72) 0)` : 'none';
    itemSecs.textContent = cooling ? (left < 1 ? left.toFixed(1) : Math.ceil(left)) : '';
    itemSlot.classList.toggle('active', !!h.bandaging);
    itemSlot.classList.toggle('blocked', !cooling && !h.bandaging && !!u.blocked(h));
    if (!cooling && !itemWasReady) { itemSlot.classList.remove('flash'); void itemSlot.offsetWidth; itemSlot.classList.add('flash'); }
    itemWasReady = !cooling;
  }

  // t = the current tick with the in-between fraction, so sweeps move smoothly
  function update(t) {
    const h = hero();
    if (!h) return;
    const ko = !!h.dead;
    root.classList.toggle('ko', ko);
    const k = h.maxHp ? h.hp / h.maxHp : 0;
    hpFill.style.width = `${k * 100}%`;
    face.style.setProperty('--hp-angle', `${Math.max(0, Math.min(1, k)) * 360}deg`);
    face.style.setProperty('--ring', k < 0.25 ? '#ed5347' : '#64c85f');
    face.classList.toggle('hurt', !ko && t - (h.hitAt ?? -Infinity) < tickRate * 0.85);
    const back = ko ? Math.max(0, Math.ceil((units.rules?.heroRespawnSeconds ?? 20) - (t - h.diedAt) / tickRate)) : 0;
    koNotice.hidden = !ko;
    if (ko) koNotice.textContent = `Knocked out, returning to the clinic in ${back}s`;
    hpText.textContent = ko ? `Knocked out, ${back}s` : `${Math.ceil(h.hp)} / ${h.maxHp}`;
    hpBar.classList.toggle('low', k < 0.25);

    for (const sl of slots) {
      if (!sl.a) { sl.s.classList.toggle('active', !!h.swing || !!h.dash); continue; }
      const ready = h.cooldowns?.[sl.key] ?? 0, left = (ready - t) / tickRate;
      const cooling = left > 0;
      sl.sweep.style.background = cooling ? `conic-gradient(transparent ${(1 - left / sl.a.cooldown) * 360}deg, rgba(4,5,8,.72) 0)` : 'none';
      const vanish = sl.a.kind === 'smoke' && !h.dead && !h.downed && !h.jailed ? Math.max(0, ((h.buffs?.veil?.until ?? 0) - t) / tickRate) : 0;
      const counter = sl.a.kind === 'reprisal' && h.buffs?.reprisal ? Math.max(0, (h.buffs.reprisal.until-t)/tickRate) : 0;
      const pursuit = sl.a.kind === 'reprisal' && h.buffs?.pursuit ? Math.max(0, (h.buffs.pursuit.until-t)/tickRate) : 0;
      sl.secs.textContent = h.brace && sl.a.kind === 'reprisal' ? 'Brace' : pursuit > 0 ? `Speed\n${Math.ceil(pursuit)}s` : counter > 0 ? `Cleave\n${Math.ceil(counter)}s` : vanish > 0 ? `Vanish\n${Math.ceil(vanish)}s` : cooling ? (left < 1 ? left.toFixed(1) : Math.ceil(left)) : '';
      sl.s.classList.toggle('vanish', vanish > 0);
      if (!cooling && !sl.wasReady) { sl.s.classList.remove('flash'); void sl.s.offsetWidth; sl.s.classList.add('flash'); }
      sl.wasReady = !cooling;
      sl.s.classList.toggle('active', vanish > 0 || counter > 0 || pursuit > 0 || !!(sl.a.kind === 'reprisal' && h.brace) || !!(sl.a.kind === 'threefold' && h.spearCombo) || !!(sl.a.kind === 'lantern' && h.buffs?.lantern) || !!(sl.a.kind === 'dash' && h.dash));
    }

    updateItem(h, t);

    // buffs on the hero (and Rally on any of its crew)
    const mine = Object.values(game.state.entities).filter(e => e.owner === h.owner && !e.dead);
    const shown = {};
    for (const e of mine) for (const [name, b] of Object.entries(e.buffs || {})) {
      if (b.until <= t) continue;
      const left = (b.until - t) / tickRate, timer = buffTimers.get(name);
      if (!timer || b.until > timer.until) buffTimers.set(name, { until: b.until, total: left });
      const active = buffTimers.get(name);
      if (!shown[name] || b.until > shown[name].until) shown[name] = active;
    }
    for (const [name, timer] of buffTimers) if (timer.until <= t) buffTimers.delete(name);
    const passiveHtml = (game.stats?.passives(h) || []).map(p => `<span class="clan-passive ${p.active ? 'active' : ''}" tabindex="0" role="img" aria-label="${p.name}" title="${p.name}: ${p.status}. ${p.description}">${hudIcon(p.icon === 'shield' ? 'shield' : 'passive')}</span>`).join('');
    const html = passiveHtml + Object.entries(shown).map(([n, { until, total }]) => {
      const left = Math.max(0, (until - t) / tickRate), pct = Math.max(0, Math.min(1, left / total));
      const name = BUFFS[n] || n;
      return `<span class="buff ${n}" style="--remaining:${pct * 100}%" tabindex="0" role="img" aria-label="${name}, ${Math.ceil(left)} seconds remaining" title="${name}"><i></i><b aria-hidden="true">${hudIcon(n)}</b><small>${Math.ceil(left)}s</small></span>`;
    }).join('');
    // compare with the last string written: the browser re-serialises the SVG icons, so an innerHTML compare never matched (rebuilt every frame)
    if (buffs._html !== html) { buffs._html = html; buffs.innerHTML = html; }

    // crew: a small name over a health bar each; crew in the clinic or in jail show greyed out
    // (jailed ones can be picked: the selection panel says they are in jail)
    // Tim 2026-11-07: out on the island the bar lists only the crew out there with you; crew left in the capital are not shown
    // or tracked (also not its clinic / jail lines). One predicate, so a per-town split can replace it later.
    const listed = e => h.place !== 'world' || e.place === 'world';
    const crewList = mine.filter(e => e.type !== 'hero' && !e.guard && e.maxHp && listed(e));
    const clinic = h.place === 'world' ? [] : game.state.clans?.[h.owner]?.clinic || [];
    const jail = h.place === 'world' ? [] : game.state.clans?.[h.owner]?.jail || [];
    if(game.state.deployment?.restrictionsEnabled){grouped.update(crewList,clinic,jail);return;}
    const n = crewList.length + clinic.length + jail.length;
    while (crew.children.length < n) { const m = el('div', 'mate', crew); el('span', 'name', m); el('div', 'pip', m); el('b', 'group', m); }
    while (crew.children.length > n) crew.lastChild.remove();
    crewList.forEach((e, i) => {
      const m = crew.children[i], f = e.hp / e.maxHp, name = unitName(units, e.type);
      if (m.firstChild.textContent !== name) m.firstChild.textContent = name;
      m.children[1].style.setProperty('--hp', `${f * 100}%`);
      m.classList.toggle('hurt', f < 0.5);
      m.classList.toggle('down', !!e.downed);
      m.classList.remove('away', 'jailed');
      m.classList.toggle('passive', e.order?.kind === 'stop');   // Z: stopped and passive
      const group = crewInput?.groupOf(e.id);
      m.children[2].textContent = group ? `${group}` : '';
      m.children[2].title = group ? `Group ${group}: press ${group} to select; Ctrl+${group} with this group selected dissolves it` : '';
      m.dataset.id = e.id;
      m.draggable = false;
      m.classList.toggle('picked', crewInput?.selected().includes(e.id) || false);
      m.title = `${name} ${Math.ceil(e.hp)} / ${e.maxHp}${group ? ` (group ${group})` : ''}${e.downed ? ' (downed)' : ''}${e.order?.kind === 'stop' ? ' (passive: Z)' : ''}, ${where(e)}; double-click to select only this crew member`;
    });
    clinic.forEach((c, i) => {
      const m = crew.children[crewList.length + i];
      m.firstChild.textContent = unitName(units, c.unit);
      m.children[1].style.setProperty('--hp', '100%');
      m.classList.remove('hurt', 'down', 'jailed', 'passive');
      m.children[2].textContent = ''; m.children[2].title = '';
      m.classList.add('away');
      m.classList.remove('picked');
      delete m.dataset.id;
      m.draggable = false;
      m.title = `${unitName(units, c.unit)} at the clinic, ${c.kind !== 'recover' ? `back in ${Math.ceil(c.left)} s` : c.left > 0 ? `recovering, ${Math.ceil(c.left)} s` : 'recovered: revive at the clinic'}`;
    });
    jail.forEach((p, i) => {
      const m = crew.children[crewList.length + clinic.length + i], name = unitName(units, p.unit);
      if (m.firstChild.textContent !== name) m.firstChild.textContent = name;
      m.children[1].style.setProperty('--hp', '100%');
      m.classList.remove('hurt', 'down', 'passive');
      m.children[2].textContent = ''; m.children[2].title = '';
      m.classList.add('away', 'jailed');
      m.dataset.id = p.id;
      m.classList.toggle('picked', crewInput?.selected().includes(p.id) || false);
      m.title = `${name} in jail: bail ${p.bail} ryo at the police HQ (Space at its door)`;
    });
  }
  return { update, useItem };
}
