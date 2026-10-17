// RTS-style panel, bottom left: one card per selected crew member (or townsperson) with a
// portrait, its type, health bar and what it is doing. Only reads the state; clicking a card asks the
// crew input to select just that unit.
import { healthBar } from './render/health.js';
import { portrait } from './portraits.js';

export const unitName = (units, type) => units.types[type]?.name || (type.charAt(0).toUpperCase() + type.slice(1)).replace(/_/g, ' ');

// What a unit is doing, in a word or two, from the state alone (no DOM, so Node can check it)
export function unitStatus(e, state) {
  if (e.dead) return 'Dead';
  if (e.downed) return Object.values(state.entities).some(o => o.execute?.target === e.id) ? 'Being finished off' : 'Downed';
  if (e.execute) return 'Finishing off';
  if (e.swing) return 'Fighting';
  if (e.type === 'civilian') {
    if (e.scared) return 'Scared';
    if (e.flee) return 'Running away';
    if (e.talk) return 'Chatting';
    if (e.anim === 'bow') return 'Praying';
    return e.anim === 'walk' || e.anim === 'run' ? 'Walking' : 'Idle';
  }
  const k = e.order?.kind, moving = e.anim === 'walk' || e.anim === 'run';
  if (k === 'follow') return 'Following';
  if (k === 'attack') return 'Attacking';
  if (k === 'attackmove') return 'Attack-moving';
  if (k === 'heal') return 'Going to clinic';
  if (k === 'station') return moving ? 'Moving to hold' : 'Holding';
  return moving ? 'Moving' : 'Idle';
}

const css = ([r, g, b]) => `rgb(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0})`;

export function createSelectionPanel({ root, game, units, catalog, crewInput }) {
  let shown = '';
  const cards = {};
  root.addEventListener('mousedown', e => {
    const card = e.target.closest('.card');
    if (card) crewInput.select([card.dataset.id]);
  });

  function update() {
    const ids = crewInput.selected().filter(id => game.state.entities[id]);
    root.hidden = !ids.length;
    root.classList.toggle('many', ids.length > 8);
    const key = ids.join(',');
    if (key !== shown) {
      shown = key;
      root.innerHTML = '';
      for (const id of ids) {
        const e = game.state.entities[id];
        const c = document.createElement('div');
        c.className = 'card';
        c.dataset.id = id;
        c.innerHTML = '<div class="pic"></div><div class="info"><b></b><div class="hp"><div class="fill"></div></div><i></i></div>';
        c.querySelector('b').textContent = unitName(units, e.civ || e.type);
        root.appendChild(c);
        cards[id] = { c, pic: c.querySelector('.pic'), fill: c.querySelector('.fill'), status: c.querySelector('i'), model: e.model, hasPic: false };
      }
    }
    for (const id of ids) {
      const e = game.state.entities[id], k = cards[id];
      if (!k.hasPic) {
        const url = portrait(catalog, k.model);
        if (url) { k.pic.style.backgroundImage = `url(${url})`; k.hasPic = true; }
      }
      const { frac, color } = healthBar(e.hp, e.maxHp);
      k.fill.style.width = `${frac * 100}%`;
      k.fill.style.background = css(color);
      const st = unitStatus(e, game.state);
      if (k.status.textContent !== st) k.status.textContent = st;
      k.c.classList.toggle('down', !!e.downed);
      k.c.title = `${unitName(units, e.civ || e.type)}: ${Math.ceil(e.hp)} / ${e.maxHp}`;
    }
  }
  return { update };
}
