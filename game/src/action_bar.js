// The hero's action bar (WoW-style), bottom centre: portrait and health, the basic attack
// and the Q E R F abilities with cooldown sweeps, active buffs above, crew health pips
// with their names on the left (click one to select it, Shift-click to add or drop it,
// double-click to select it alone and jump the camera to it). Control-group numbers
// appear under assigned crew; changing selection never changes their orders.
// Only reads the state; abilities go to the rules as 'ability' commands.
import { unitName } from './selection_panel.js';

const BUFFS = { rally: 'Rally', lantern: 'Red Lantern', intimidated: 'Intimidated', snared: 'Caltrops (slowed)', shroud: 'Smoke (healing)', ambush: 'Ambush (+20% crit)', veil: 'Vanish' };

const pct = k => `${Math.round(k * 100)}%`;
// MMO-style tooltip lines for a slot, with numbers worked out from the hero's stats
function tooltip(a, key, stats) {
  const dmg = stats.damage || 0;
  if (!a) return { name: 'Auto attack', key: 'Right-click', lines: [
    ['Damage', `${dmg} per hit`], ['Attack speed', `every ${stats.attackSpeed} s`], ['Range', `${stats.attackRange} steps`],
    ['Critical hit', `${pct(stats.critChance || 0)} chance, ${stats.critMultiplier || 2}x damage`]],
    about: 'Right-click or Tab attacks with the hero and selected available crew; independent T/Ctrl assignments keep their targets. Ctrl + right-click orders selected crew only. T sends outdoor crew; indoor crew stay at their duties. During execution, attacks order selected crew while the hero keeps executing. Hero movement, Escape or an enemy hit interrupts execution.' };
  const lines = { dash: [['Damage', `${Math.round(dmg * a.damageMultiplier)} to each enemy passed (${pct(a.damageMultiplier)})`], ['Distance', `up to ${a.range} steps`]],
    intimidate: [['Effect', `enemies deal ${pct(1 - a.enemyDamage)} less damage`], ['Area', `${a.radius} steps around you`], ['Duration', `${a.seconds} s`]],
    rally: [['Effect', `you and your crew attack ${pct(a.attackSpeed - 1)} faster`], ['Heal', `${pct(a.heal)} of your and each crew member's health`], ['Area', `${a.radius} steps around you`], ['Duration', `${a.seconds} s`]],
    lantern: [['Damage', `+${pct(a.damage - 1)} (${Math.round(dmg * a.damage)} per hit)`], ['Lifesteal', `${pct(a.lifesteal)} of damage dealt`], ['Duration', `${a.seconds} s`]] }[a.kind] || [];
  return { name: a.name + (key === 'F' ? ' (ultimate)' : ''), key, lines: [['Cost', a.cost ? `${a.cost} ryo` : 'None'], ['Cooldown', `${a.cooldown} s`], ...lines], about: a.about };
}

export function createActionBar({ root, game, units, heroId, tickRate, crewInput, where = () => '', jump = () => {} }) {
  const hero = () => game.state.entities[heroId];
  const stats = { ...units.types[hero()?.type], ...units.models?.[hero()?.model] };   // the Shinobi boss has his own (units.json models)
  const kit = stats.abilities || {};
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  const el = (tag, cls, parent, text) => { const n = document.createElement(tag); n.className = cls; if (text) n.textContent = text; parent.appendChild(n); return n; };

  const buffs = el('div', 'buffs', root);
  const row = el('div', 'row', root);
  const crew = el('div', 'crew', row);
  crew.addEventListener('mousedown', e => {
    const id = e.target.closest('.mate')?.dataset.id;
    if (!id || !crewInput || e.button !== 0) return;
    const sel = crewInput.selected();
    crewInput.select(sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);   // toggles: the selection sticks (Tim 2026-10-19)
  });
  crew.addEventListener('dblclick', e => {
    if (e.button !== 0) return;
    const id = e.target.closest('.mate')?.dataset.id, u = game.state.entities[id];
    if (id) crewInput?.select([id]);
    if (u) jump(u);
    else if (id && game.police?.hq?.door) jump({ place: 'street', x: game.police.hq.door[0], z: game.police.hq.door[1] });   // jailed: the HQ
  });
  const portrait = el('div', 'portrait', row);
  el('div', 'face', portrait, 'R');
  const hpBar = el('div', 'hp', portrait), hpFill = el('div', 'fill', hpBar), hpText = el('div', 'txt', hpBar);

  const slots = [];
  const addSlot = (key, kind, a) => {
    const s = el('div', 'slot', row);
    const t = tooltip(a, key, stats);
    el('div', 'icon', s, a ? a.name : 'Auto attack');
    s.addEventListener('mouseenter', () => {
      tip.innerHTML = `<b>${t.name}</b><i>${t.key}</i>` + t.lines.map(([k, v]) => `<div><span>${k}</span>${v}</div>`).join('') + `<p>${t.about}</p>`;
      tip.hidden = false;
      const r = s.getBoundingClientRect();
      tip.style.left = `${Math.min(innerWidth - 270, Math.max(10, r.left + r.width / 2 - 130))}px`;
      tip.style.bottom = `${innerHeight - r.top + 10}px`;
    });
    s.addEventListener('mouseleave', () => { tip.hidden = true; });
    el('div', 'key', s, key);
    const sweep = el('div', 'sweep', s), secs = el('div', 'secs', s);
    slots.push({ s, key, a, sweep, secs, wasReady: true });
  };
  addSlot('RMB', 'attack', null);
  for (const [k, a] of Object.entries(kit)) addSlot(k, a.kind, a);

  // t = the current tick with the in-between fraction, so sweeps move smoothly
  function update(t) {
    const h = hero();
    if (!h) return;
    const ko = !!h.dead;
    root.classList.toggle('ko', ko);
    const k = h.maxHp ? h.hp / h.maxHp : 0;
    hpFill.style.width = `${k * 100}%`;
    const back = ko ? Math.max(0, Math.ceil((units.rules?.heroRespawnSeconds ?? 20) - (t - h.diedAt) / tickRate)) : 0;
    hpText.textContent = ko ? `Knocked out · ${back}s` : `${Math.ceil(h.hp)} / ${h.maxHp}`;
    hpBar.classList.toggle('low', k < 0.25);

    for (const sl of slots) {
      if (!sl.a) { sl.s.classList.toggle('active', !!h.swing || !!h.dash); continue; }
      const ready = h.cooldowns?.[sl.key] ?? 0, left = (ready - t) / tickRate;
      const cooling = left > 0;
      sl.sweep.style.background = cooling ? `conic-gradient(transparent ${(1 - left / sl.a.cooldown) * 360}deg, rgba(4,5,8,.72) 0)` : 'none';
      const vanish = sl.a.kind === 'smoke' && !h.dead && !h.downed && !h.jailed ? Math.max(0, ((h.buffs?.veil?.until ?? 0) - t) / tickRate) : 0;
      sl.secs.textContent = vanish > 0 ? `Vanish\n${Math.ceil(vanish)}s` : cooling ? (left < 1 ? left.toFixed(1) : Math.ceil(left)) : '';
      sl.s.classList.toggle('vanish', vanish > 0);
      if (!cooling && !sl.wasReady) { sl.s.classList.remove('flash'); void sl.s.offsetWidth; sl.s.classList.add('flash'); }
      sl.wasReady = !cooling;
      sl.s.classList.toggle('active', vanish > 0 || !!(sl.a.kind === 'lantern' && h.buffs?.lantern) || !!(sl.a.kind === 'dash' && h.dash));
    }

    // buffs on the hero (and Rally on any of its crew)
    const mine = Object.values(game.state.entities).filter(e => e.owner === h.owner && !e.dead);
    const shown = {};
    for (const e of mine) for (const [name, b] of Object.entries(e.buffs || {})) shown[name] = Math.max(shown[name] || 0, b.until);
    const html = Object.entries(shown).map(([n, until]) => `<span class="buff ${n}">${BUFFS[n] || n} ${Math.max(0, Math.ceil((until - t) / tickRate))}s</span>`).join('');
    if (buffs.innerHTML !== html) buffs.innerHTML = html;

    // crew: a small name over a health bar each; crew in the clinic or in jail show greyed out
    // (jailed ones can be picked: the selection panel says they are in jail)
    const crewList = mine.filter(e => e.type !== 'hero' && !e.guard && e.maxHp);
    const clinic = game.state.clans?.[h.owner]?.clinic || [];
    const jail = game.state.clans?.[h.owner]?.jail || [];
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
  return { update };
}
