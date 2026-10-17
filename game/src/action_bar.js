// The hero's action bar (WoW-style), bottom centre: portrait and health, the basic attack
// and the Q E R F abilities with cooldown sweeps, active buffs above, crew health pips
// on the left. Only reads the state; abilities go to the rules as 'ability' commands.
const BUFFS = { rally: 'Rally', lantern: 'Red Lantern', intimidated: 'Intimidated' };

const pct = k => `${Math.round(k * 100)}%`;
// MMO-style tooltip lines for a slot, with numbers worked out from the hero's stats
function tooltip(a, key, stats) {
  const dmg = stats.damage || 0;
  if (!a) return { name: 'Attack', key: 'Right-click', lines: [
    ['Damage', `${dmg} per hit`], ['Attack speed', `every ${stats.attackSpeed} s`], ['Range', `${stats.attackRange} steps`],
    ['Critical hit', `${pct(stats.critChance || 0)} chance, ${stats.critMultiplier || 2}x damage`]],
    about: 'Right-click an enemy to chase it and keep hitting it. Standing still, the hero hits the nearest enemy in reach.' };
  const lines = { dash: [['Damage', `${Math.round(dmg * a.damageMultiplier)} to each enemy passed (${pct(a.damageMultiplier)})`], ['Distance', `up to ${a.range} steps`]],
    intimidate: [['Effect', `enemies deal ${pct(1 - a.enemyDamage)} less damage`], ['Area', `${a.radius} steps around you`], ['Duration', `${a.seconds} s`]],
    rally: [['Effect', `crew attack ${pct(a.attackSpeed - 1)} faster`], ['Heal', `${pct(a.heal)} of each crew member's health`], ['Area', `${a.radius} steps around you`], ['Duration', `${a.seconds} s`]],
    lantern: [['Damage', `+${pct(a.damage - 1)} (${Math.round(dmg * a.damage)} per hit)`], ['Lifesteal', `${pct(a.lifesteal)} of damage dealt`], ['Duration', `${a.seconds} s`]] }[a.kind] || [];
  return { name: a.name + (key === 'F' ? ' (ultimate)' : ''), key, lines: [['Cost', a.cost ? `${a.cost} ryo` : 'None'], ['Cooldown', `${a.cooldown} s`], ...lines], about: a.about };
}

export function createActionBar({ root, game, units, heroId, tickRate }) {
  const hero = () => game.state.entities[heroId];
  const stats = units.types[hero()?.type] || {};
  const kit = stats.abilities || {};
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  const el = (tag, cls, parent, text) => { const n = document.createElement(tag); n.className = cls; if (text) n.textContent = text; parent.appendChild(n); return n; };

  const buffs = el('div', 'buffs', root);
  const row = el('div', 'row', root);
  const crew = el('div', 'crew', row);
  const portrait = el('div', 'portrait', row);
  el('div', 'face', portrait, 'R');
  const hpBar = el('div', 'hp', portrait), hpFill = el('div', 'fill', hpBar), hpText = el('div', 'txt', hpBar);

  const slots = [];
  const addSlot = (key, kind, a) => {
    const s = el('div', 'slot', row);
    const t = tooltip(a, key, stats);
    el('div', 'icon', s, a ? a.name : 'Attack');
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
    hpText.textContent = ko ? 'Knocked out' : `${Math.ceil(h.hp)} / ${h.maxHp}`;
    hpBar.classList.toggle('low', k < 0.25);

    for (const sl of slots) {
      if (!sl.a) { sl.s.classList.toggle('active', !!h.swing || !!h.dash); continue; }
      const ready = h.cooldowns?.[sl.key] ?? 0, left = (ready - t) / tickRate;
      const cooling = left > 0;
      sl.sweep.style.background = cooling ? `conic-gradient(transparent ${(1 - left / sl.a.cooldown) * 360}deg, rgba(4,5,8,.72) 0)` : 'none';
      sl.secs.textContent = cooling ? (left < 1 ? left.toFixed(1) : Math.ceil(left)) : '';
      if (!cooling && !sl.wasReady) { sl.s.classList.remove('flash'); void sl.s.offsetWidth; sl.s.classList.add('flash'); }
      sl.wasReady = !cooling;
      sl.s.classList.toggle('active', !!(sl.a.kind === 'lantern' && h.buffs?.lantern) || !!(sl.a.kind === 'dash' && h.dash));
    }

    // buffs on the hero (and Rally on any of its crew)
    const mine = Object.values(game.state.entities).filter(e => e.owner === h.owner && !e.dead);
    const shown = {};
    for (const e of mine) for (const [name, b] of Object.entries(e.buffs || {})) shown[name] = Math.max(shown[name] || 0, b.until);
    const html = Object.entries(shown).map(([n, until]) => `<span class="buff ${n}">${BUFFS[n] || n} ${Math.max(0, Math.ceil((until - t) / tickRate))}s</span>`).join('');
    if (buffs.innerHTML !== html) buffs.innerHTML = html;

    const crewList = mine.filter(e => e.type !== 'hero' && e.maxHp);
    while (crew.children.length < crewList.length) el('div', 'pip', crew);
    while (crew.children.length > crewList.length) crew.lastChild.remove();
    crewList.forEach((e, i) => {
      const p = crew.children[i], f = e.hp / e.maxHp;
      p.style.setProperty('--hp', `${f * 100}%`);
      p.classList.toggle('hurt', f < 0.5);
      p.title = `${e.type} ${Math.ceil(e.hp)} / ${e.maxHp}`;
    });
  }
  return { update };
}
