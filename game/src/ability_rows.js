// Ability rows over the action bar (war checkpoint 7, Tim 2026-11-12): the special abilities of the selected
// units, shown only while the selection has any. Keys are Shift + the main bar keys, slot for slot:
//   Torch         Shift + right-click an enemy building, wall, gate or house in your war (or click the button, then
//                 left-click it): every selected melee unit runs over and sets it alight.
//   the specials  Shift + Q, E, R, F left to right (Charm, Aimed Shot, Taunt, Loose the dogs, Slowing arrow; at most four in a selection get a key). One press, one caster:
//                 the ready unit nearest the spot. A targeted one waits for a left-click on the target (right-click or
//                 Escape cancels the aim); an instant one fires at once.
// A button shows ready / total; with none ready it is grey and counts down the shortest cooldown in the group.
// Right-click a button: auto-cast on or off for the selected units of that type (a moving dotted border and the
// word Auto while on). Units on a Torch order carry a small flame mark over their heads.
// Presentation and input only; the rules are in sim/frontier/structures.js and sim/special_cast.js.
import { SPECIALS, specialView } from './sim/special_cast.js';
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  torch: svg('<path d="M12 3c1 3 4 4.500 4 8a4 4 0 0 1-8 0c0-1.500.700-2.500 1.500-3.500C10 9 12 7 12 3z"/><path d="M10 15l-1.500 6h7L14 15"/>'),
  charm: svg('<path d="M12 20s-7-4.400-7-9.500A3.800 3.800 0 0 1 12 8a3.800 3.800 0 0 1 7 2.500C19 15.600 12 20 12 20z"/>'),
  aimed: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'),
  taunt: svg('<path d="M4 10v4h3l5 4V6l-5 4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.500 6.500a8 8 0 0 1 0 11"/>'),
  hamstring: svg('<path d="M4 20L18 6M18 6h-5M18 6v5"/><path d="M5 15l4 4"/>'),
  gatling: svg('<circle cx="7" cy="15" r="4"/><path d="M9 12l11-5M10 14l11-5M20 7v2"/>'),
  dogs: svg('<path d="M4 9l3-3 2 3h6l3-3 2 3v5a6 6 0 0 1-6 5h-4a6 6 0 0 1-6-5V9z"/><path d="M9.500 13h.010M14.500 13h.010M11 16.500h2"/>'),
};
const ABOUT = {
  charm: 'Then left-click near an enemy. The nearest ready geisha charms the enemy closest to the click. An enemy already charmed is skipped.',
  aimed: 'Then left-click near an enemy. The nearest ready rifleman takes a slow, heavy shot at the enemy closest to the click. A target another rifleman is already aiming at is avoided.',
  taunt: 'The ready enforcer nearest the pointer taunts the enemies around him so they turn on him. Enemies already taunted are skipped.',
  hamstring: 'Then left-click near an enemy. The nearest ready archer shoots a slowing arrow at the enemy closest to the click.',
  gatling: 'Then left-click the ground. The nearest Gatling crew sets up where it stands and holds its aim at that spot, firing at every enemy in its cone. Without it the gun turns to the nearest enemy on its own once set up. Any move order packs it up and frees the aim.',
  dogs: 'Then left-click near an enemy. The nearest ready dog handler looses his dogs at the enemy closest to the click: they bite for heavy damage and knock it down for a moment. On auto he sends them at ranged or fleeing enemies.',
};
// the specials' keys, left to right: Shift + the main bar's ability keys
export const ABILITY_KEYS = ['Q', 'E', 'R', 'F'];

export function createAbilityRows({ root, marks, game, units, view, heroId, crewInput, send, tickRate = 20 }) {
  const hero = () => game.state.entities[heroId];
  const el = (tag, cls, parent, text) => { const n = document.createElement(tag); n.className = cls; if (text) n.textContent = text; parent.appendChild(n); return n; };
  const row = el('div', 'abilityrow', root); row.hidden = true;
  if (root.querySelector('.row')) root.insertBefore(row, root.querySelector('.row'));
  const tip = el('div', 'tip', document.body); tip.hidden = true;
  const atWar = () => { const h = hero(); return !!h && h.place === 'world' && Object.values(game.state.frontier?.wars?.list || {}).some(w => w.attacker === h.owner || w.defender === h.owner); };
  // who an ability order goes to: the selected crew and troops, and the hero when he is selected or nothing is
  const picked = () => { const sel = crewInput.selected(); return { units: sel.filter(id => id !== heroId && game.state.entities[id]?.type !== 'hero'), hero: !sel.length || sel.includes(heroId) }; };
  const torchers = () => { if (!atWar()) return 0; const p = picked(); return game.frontier?.structures?.torchers([...p.units, ...(p.hero ? [heroId] : [])]) || 0; };
  const torchAt = p => { const s = picked(); send({ id: heroId, type: 'order', kind: 'raze', torch: true, x: p.x, z: p.z, slack: 6, units: s.units, hero: s.hero, place: 'world' }); };
  const ABILITIES = [
    { id: 'torch', name: 'Torch', targeted: true, keyText: 'Shift + RMB',
      about: 'Hold Shift and right-click an enemy building, wall, gate or house in your war (or click this button, then left-click it). Every selected melee unit runs over and sets it on fire. One fire per building; it burns harder with up to 3 units feeding it and dies down a few seconds after they stop. Ranged units ignore the order. A plain right-click attacks without fire.',
      view: () => { const n = torchers(); return { have: n, ready: n }; },
      cast: p => torchAt(p) },
    ...Object.entries(SPECIALS).map(([id, S]) => ({ id, name: S.name, targeted: S.targeted, special: true, noAuto: !!S.noAuto, about: ABOUT[id] || '',
      view: () => specialView({ state: game.state, units }, id, picked().units),
      cast: p => send({ id: heroId, type: 'special', ability: id, units: picked().units, ...(p ? { x: p.x, z: p.z } : {}) }),
      ...(S.noAuto ? {} : { auto: on => send({ id: heroId, type: 'special', ability: id, units: picked().units, auto: on }) }) })),
  ];
  const slots = new Map();
  let shown = [];
  // p: the pointer's place on the ground (a key press); a button click has none
  function arm(a, p = null) {
    const v = a.view();
    if (!v.ready) return;
    if (!a.targeted) { a.cast(p); return; }
    crewInput.armTarget(q => a.cast(q), a.id);
  }
  function tipText(a, s) {
    const v = s.v || {};
    const lines = [`<div><span>Ready</span>${v.ready || 0} of ${v.have || 0} selected</div>`];
    if (a.auto) lines.push(`<div><span>Auto</span>${!v.auto ? 'off' : v.auto === v.have ? 'on' : `on for ${v.auto} of ${v.have}`}</div>`);
    return `<b>${a.name}</b><i>${s.keyText}</i>${lines.join('')}<p>${a.about}</p>${a.special ? `<p>One press, one caster: press again for the next unit.${a.auto ? ' Right-click this button to switch auto-cast on or off.' : ''}</p>` : ''}`;
  }
  function slot(a) {
    let s = slots.get(a.id);
    if (s) return s;
    const b = el('div', 'slot ability', row);
    el('div', 'icon', b).innerHTML = `<span class="ab-ico">${ICONS[a.id] || ''}</span><span class="ab-name">${a.name}</span>`;
    const key = el('div', 'key', b), count = el('div', 'count', b), secs = el('div', 'secs', b), auto = el('div', 'autotag', b, 'Auto');
    auto.hidden = true;
    b.addEventListener('click', () => arm(a));
    b.addEventListener('contextmenu', e => { e.preventDefault(); if (a.auto) a.auto(!(s.v?.auto === s.v?.have)); });
    b.addEventListener('mouseenter', () => {
      tip.innerHTML = tipText(a, s);
      tip.hidden = false;
      const r = b.getBoundingClientRect();
      tip.style.left = `${Math.min(innerWidth - 270, Math.max(10, r.left + r.width / 2 - 130))}px`;
      tip.style.bottom = `${innerHeight - r.top + 10}px`;
    });
    b.addEventListener('mouseleave', () => { tip.hidden = true; });
    s = { b, key, count, secs, auto, keyText: '', v: null };
    slots.set(a.id, s);
    return s;
  }
  // flame marks over units on a Torch order
  const flames = new Map();
  function updateMarks() {
    const want = new Set(), h = hero();
    if (marks && h?.place === 'world') for (const e of Object.values(game.state.entities)) {
      if (e.owner !== h.owner || !e.order?.torch || e.dead || e.place !== 'world') continue;
      const u = view.unitToScreen(e.x, e.z, 2.6);
      if (u.x < -20 || u.y < -20 || u.x > innerWidth + 20 || u.y > innerHeight + 20) continue;
      want.add(e.id);
      let m = flames.get(e.id);
      if (!m) { m = el('div', 'abilitymark torch', marks); m.innerHTML = ICONS.torch; flames.set(e.id, m); }
      m.style.left = `${u.x}px`; m.style.top = `${u.y}px`;
    }
    for (const [id, m] of flames) if (!want.has(id)) { m.remove(); flames.delete(id); }
  }
  const set = (n, text) => { if (n.textContent !== text) n.textContent = text; };
  function update() {
    const all = ABILITIES.map(a => ({ a, v: a.view() })).filter(x => x.v.have > 0);
    // Torch sits over the right-click slot; the specials take Q, E, R, F in order
    let k = 0;
    shown = all.filter(x => !x.a.special || k++ < ABILITY_KEYS.length);
    row.hidden = !shown.length;
    if (!shown.length && tip.hidden === false) tip.hidden = true;
    for (const [id, s] of slots) s.b.hidden = !shown.some(x => x.a.id === id);
    k = 0;
    for (const { a, v } of shown) {
      const s = slot(a);
      s.v = v; s.keyText = a.keyText || `Shift + ${ABILITY_KEYS[k++]}`;
      set(s.key, a.special ? `S+${s.keyText.slice(-1)}` : 'S+RMB');
      set(s.count, a.special ? `${v.ready}/${v.have}` : `${v.have}`);
      const cooling = !v.ready;
      s.b.classList.toggle('cooling', cooling);
      set(s.secs, cooling ? `${Math.max(1, Math.ceil((v.nextReadyAt - (game.state.tick ?? 0)) / tickRate))}` : '');
      const auto = !!a.auto && v.auto > 0;
      s.b.classList.toggle('auto', auto); s.auto.hidden = !auto;
      s.b.classList.toggle('armed', crewInput.targetArmed() === a.id);
    }
    updateMarks();
  }
  setInterval(update, 100);
  return {
    update,
    // Shift + Q, E, R, F: the i-th special shown; p = the pointer's place on the ground
    key(i, p = null) { const x = shown.filter(s => s.a.special)[i]; if (!x) return false; arm(x.a, p); return true; },
    // Shift + right-click on the ground: Torch, when the selection can
    shiftRight(p) { if (!p || !torchers()) return false; torchAt(p); return true; },
  };
}
