// Ability rows over the action bar (war checkpoint 7, Tim 2026-11-12): the special abilities of the selected
// units, shown only while the selection has any. Keys are Shift + the main bar keys, slot for slot:
//   Torch         Shift + right-click an enemy building, wall, gate or house in your war (or click the button, then
//                 left-click it): every selected melee unit runs over and sets it alight.
//   the specials  Shift + Q, E, R, F left to right (Charm, Aimed Shot, Taunt, Loose the dogs, Unload, Slowing arrow; at most four in a selection get a key). One press, one caster:
//                 the ready unit nearest the spot. A targeted one waits for a left-click on the target (right-click or
//                 Escape cancels the aim); an instant one fires at once.
// A button shows ready / total; with none ready it is grey and counts down the shortest cooldown in the group.
// Right-click a button: auto-cast on or off for the selected units of that type (a moving dotted border and the
// word Auto while on). Units on a Torch order carry a small flame mark over their heads.
// 7c-2: only barracks troops (grunts, spearmen, brutes, enforcers), plain melee crew and a melee hero torch (a 1 second cast); Fire bomb is a special.
// Presentation and input only; the rules are in sim/frontier/structures.js and sim/special_cast.js.
import { SPECIALS, specialView } from './sim/special_cast.js';
import { specialNumbers } from './special_stats.js';
import { sharedKeybinds } from './keybinds.js';
import { PAINTED } from './hud_icons.js';
const keybinds = sharedKeybinds();   // key text follows rebinding (Tim 2026-11-12)
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  torch: svg('<path d="M12 3c1 3 4 4.500 4 8a4 4 0 0 1-8 0c0-1.500.700-2.500 1.500-3.500C10 9 12 7 12 3z"/><path d="M10 15l-1.500 6h7L14 15"/>'),
  charm: svg('<path d="M12 20s-7-4.400-7-9.500A3.800 3.800 0 0 1 12 8a3.800 3.800 0 0 1 7 2.500C19 15.600 12 20 12 20z"/>'),
  aimed: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'),
  taunt: svg('<path d="M4 10v4h3l5 4V6l-5 4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.500 6.500a8 8 0 0 1 0 11"/>'),
  firebomb: svg('<circle cx="11" cy="15" r="5.500"/><path d="M14.500 10.500l3-3M17.500 7.500c1-2 3-1.500 2.500-3.500"/>'),
  hamstring: svg('<path d="M4 20L18 6M18 6h-5M18 6v5"/><path d="M5 15l4 4"/>'),
  gatling: svg('<circle cx="7" cy="15" r="4"/><path d="M9 12l11-5M10 14l11-5M20 7v2"/>'),
  dogs: svg('<path d="M4 9l3-3 2 3h6l3-3 2 3v5a6 6 0 0 1-6 5h-4a6 6 0 0 1-6-5V9z"/><path d="M9.500 13h.010M14.500 13h.010M11 16.500h2"/>'),
  board: svg('<path d="M12 3v13"/><path d="M5.500 9.500c0 4 3 6.500 6.500 6.500s6.500-2.500 6.500-6.500"/><path d="M5.500 9.500L4 11.500M18.500 9.500l1.500 2"/><path d="M9.500 5.500h5"/><path d="M12 16c0 2 1.500 3.500 4 4.500"/>'),   // ships S8: a grappling hook
  breakoff: svg('<path d="M3 12h6.500M14.500 12H21"/><path d="M9.500 12c.800-1.200 1.500-1.200 2.500 0M12 12c1 1.200 1.700 1.200 2.500 0"/><path d="M8 6l8 12"/>'),   // a cut line
  broadside: svg('<path d="M3 15h18"/><path d="M5 15l1.500 4h11L19 15"/><path d="M7 12h3M11 12h3M15 12h3"/><path d="M8.500 9.500a1.500 1.500 0 1 0 0-.010M15.500 7a1 1 0 1 0 0-.010"/>'),   // gun ports and smoke
  bowcannon: svg('<circle cx="8" cy="15" r="3.500"/><path d="M10.500 13l9-5M11.500 15.500l9-5M20.500 8v2.500"/>'),
  deckgun: svg('<circle cx="7" cy="15" r="4"/><path d="M9 12l11-5M10 14l11-5M20 7v2"/>'),
};
// painted art (data/ui_art.json, lantern style) where it exists: the slot id, or the painted id it borrows (Tim 2026-11-23)
const PAINT_ID = { board: 'boarding', deckgun: 'gatling', bowcannon: 'bow_cannon' };
const slotIcon = id => { const p = PAINT_ID[id] || id; return PAINTED.has(p) ? `<img class="painted" src="../assets/ui/abilities/${p}.png" alt="" draggable="false">` : ICONS[id] || ''; };
export const ABOUT = {
  charm: 'Then left-click near an enemy. The nearest ready geisha charms the enemy closest to the click. An enemy already charmed is skipped.',
  aimed: 'Then left-click near an enemy. The nearest ready rifleman takes a slow, heavy shot at the enemy closest to the click. A target another rifleman is already aiming at is avoided.',
  taunt: 'The ready enforcer nearest the pointer taunts the enemies around him so they turn on him. Enemies already taunted are skipped.',
  firebomb: 'Then left-click an enemy building or the ground near enemies, within his throw. The nearest ready fire-bomb thrower winds up; a ring on the ground shows where the bomb will land. It hits every enemy in the ring hard and sets a wooden building on fire; stone takes less and does not burn. A stagger, stun or knockdown breaks the wind-up. Long cooldown. His normal attack is a weak knife.',
  hamstring: 'Then left-click near an enemy. The nearest ready archer shoots a slowing arrow at the enemy closest to the click.',
  gatling: 'A cone shows where the nearest ready Gatling crew will fire; left-click to fire there. The gun stops, spins up and empties itself into the cone for a few seconds at extra damage, hitting every enemy in it. Any move order ends it. On auto it unloads into a packed group.',
  board: 'Then left-click an enemy ship. The nearest selected warship with troops aboard sails alongside and grapples for a few seconds; if the enemy ship gets out of reach the grapple fails. Then both ships stop moving and firing while the holds fight, a bar over them showing both sides. Fighters fall one by one until one hold is empty: the strength of a fighter is what he costs, so the stronger hold wins. Defenders on a ship under half health fight at a penalty, so shell it first. A defending warship\'s deck Gatling cuts down part of the boarding party as it comes over. Win and the ship is yours, with the damage it has. An empty hold is taken at once. Another ship can join from the free side. Transports cannot board but can be boarded.',
  broadside: 'Then left-click an enemy ship, siege gun, troops or building in range. The nearest ready warship turns its next broadside on the target nearest the click. On auto it fires on its own at the nearest target, ships first; with auto off it fires only when aimed.',
  bowcannon: 'Then left-click an enemy ship, siege gun, troops or building in range. The nearest ready transport fires its bow cannon at the target nearest the click. On auto it fires on its own; with auto off only when aimed.',
  deckgun: 'Then left-click near enemy troops. The nearest warship spins up its deck Gatling and fires bursts toward the click, at the troops nearest it. On auto it fires at troops in reach on its own; with auto off only when aimed.',
  breakoff: 'The boarding warship nearest the pointer breaks off and keeps who is left. Only after a few seconds of fighting; then it cannot board again for a while.',
  dogs: 'Then left-click near an enemy. The nearest ready dog handler looses his dogs at the enemy closest to the click: they bite for heavy damage and knock it down for a moment. On auto he sends them at ranged or fleeing enemies.',
};
const SHIP_KEY = { board: 0, broadside: 1, bowcannon: 2, deckgun: 3 };
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
      about: 'Hold Shift and right-click an enemy building, wall, gate or house in your war (or click this button, then left-click it). Every selected grunt and spearman, plain melee crew and a melee hero run over and light it with a 1 second cast. A stagger, stun, knockdown, charm or taunt breaks the cast and they start again; plain hits do not. One fire per building; it burns until workers put it out or the building falls. Once it burns they keep hitting it. Other units ignore the order. A plain right-click attacks without fire.',
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
    const u = a.special ? picked().units.map(id => units?.types?.[game.state.entities[id]?.type]).find(d => d && specialNumbers(a.id, d)) : null;   // its numbers, from a selected caster (Tim 2026-11-18)
    return `<b>${a.name}</b><i>${s.keyText}</i>${lines.join('')}<p>${a.about}</p>${u ? `<p>${specialNumbers(a.id, u)}</p>` : ''}${a.special ? `<p>One press, one caster: press again for the next unit.${a.auto ? ' Right-click this button to switch auto-cast on or off.' : ''}</p>` : ''}`;
  }
  function slot(a) {
    let s = slots.get(a.id);
    if (s) return s;
    const b = el('div', 'slot ability', row);
    el('div', 'icon', b).innerHTML = `<span class="ab-ico">${slotIcon(a.id)}</span><span class="ab-name">${a.name}</span>`;
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
    // a ship ability keeps its own key whatever is selected (Tim 2026-11-24); the other specials take the keys left, in order
    { const taken = new Set(shown.filter(x => x.a.special && SHIP_KEY[x.a.id] != null).map(x => SHIP_KEY[x.a.id])); let n = 0;
      for (const x of shown) { if (!x.a.special) continue; if (SHIP_KEY[x.a.id] != null) x.ki = SHIP_KEY[x.a.id]; else { while (taken.has(n)) n++; x.ki = n++; } } }
    k = 0;
    for (const { a, v, ki } of shown) {
      const s = slot(a);
      const act = a.special && ki < ABILITY_KEYS.length ? `special${ki + 1}` : null;
      s.v = v; s.keyText = a.keyText || keybinds.label(act);
      set(s.key, act ? keybinds.badge(act) : a.special ? '' : 'S+RMB'); s.key.classList.toggle('unbound', !!act && keybinds.isUnbound(act));
      set(s.count, a.special ? `${v.ready}/${v.have}` : `${v.have}`);
      const cooling = !v.ready;
      s.b.classList.toggle('cooling', cooling);
      set(s.secs, cooling && Number.isFinite(v.nextReadyAt) ? `${Math.max(1, Math.ceil((v.nextReadyAt - (game.state.tick ?? 0)) / tickRate))}` : '');   // not able at all (Board with an empty hold): grey, no count
      const auto = !!a.auto && v.auto > 0;
      s.b.classList.toggle('auto', auto); s.auto.hidden = !auto;
      s.b.classList.toggle('firing', v.firing > 0);   // a ship gun firing: the slot flashes red (Tim 2026-11-23)
      s.b.classList.toggle('armed', crewInput.targetArmed() === a.id);
    }
    updateMarks();
  }
  setInterval(update, 100);
  // Unload (Tim 2026-11-21): while it waits for its click, a cone on the ground from the ready Gatling crew nearest the
  // pointer toward the pointer, as far as the gun reaches (call each frame with the mouse's page place)
  const NS = 'http://www.w3.org/2000/svg';
  const coneSvg = document.createElementNS(NS, 'svg'); coneSvg.setAttribute('class', 'unloadcone');
  coneSvg.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:4';
  const conePath = document.createElementNS(NS, 'path'); conePath.setAttribute('fill', 'rgba(255,214,150,0.18)'); conePath.setAttribute('stroke', 'rgba(255,224,170,0.75)'); conePath.setAttribute('stroke-width', '1.5'); conePath.setAttribute('stroke-dasharray', '6 4');
  coneSvg.appendChild(conePath); document.body.appendChild(coneSvg); coneSvg.style.display = 'none';
  // Board (ships S8): while it waits for its click, over an enemy ship a label with both holds' strength (the ship that
  // would go: the ready selected warship nearest it) and weakened when it is under half health
  const boardTip = el('div', 'tip boardtip', document.body); boardTip.hidden = true;
  boardTip.style.width = 'auto'; boardTip.style.pointerEvents = 'none';
  function boardPreview(mouse) {
    const B = game.ships?.boarding, p = crewInput.targetArmed() === 'board' && mouse && B ? view.screenToGround(mouse.x, mouse.y) : null, h = hero();
    if (!p || !h) { boardTip.hidden = true; return; }
    let t = null, td = Infinity;
    for (const e of Object.values(game.state.entities)) { if (!e.ship || e.dead || e.owner === h.owner) continue; const d = Math.hypot(e.x - p.x, e.z - p.z) - (units?.types?.[e.type]?.radius ?? 4); if (d < 6 && d < td) { td = d; t = e; } }
    let html = 'Click an enemy ship';
    if (t) {
      const now = game.state.tick ?? 0; let s = null, sd = Infinity;
      for (const id of picked().units) { const e = game.state.entities[id]; if (!e?.ship || !B.canBoard(e) || (e.boardReadyAt ?? 0) > now) continue; const d = Math.hypot(e.x - t.x, e.z - t.z); if (d < sd) { sd = d; s = e; } }
      const v = B.preview(s, t);
      html = v ? `<div><span>Your hold</span>${v.ours}</div><div><span>Their hold</span>${v.theirs}</div>${v.weakened ? '<div><span>Their ship</span><b style="color:#f0a488;font-size:12px">weakened</b></div>' : ''}${v.gatling ? '<p style="color:#e8a07a">Their deck Gatling cuts your party as it boards</p>' : ''}${v.room ? '' : '<p>No room alongside</p>'}` : html;
    }
    if (boardTip.innerHTML !== html) boardTip.innerHTML = html;
    boardTip.style.left = `${Math.min(innerWidth - 200, mouse.x + 18)}px`; boardTip.style.top = `${mouse.y + 18}px`; boardTip.style.bottom = 'auto';
    boardTip.hidden = false;
  }
  function aimPreview(mouse) {
    boardPreview(mouse);
    let gun = null;
    const p = crewInput.targetArmed() === 'gatling' && mouse ? view.screenToGround(mouse.x, mouse.y) : null;
    if (p) { const now = game.state.tick ?? 0; let bd = Infinity;
      for (const id of picked().units) { const e = game.state.entities[id], R = units?.types?.[e?.type]?.gatling;
        if (!R || e.dead || e.downed || (e.gatReadyAt ?? 0) > now) continue;
        const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; gun = e; } } }
    if (!gun) { coneSvg.style.display = 'none'; return; }
    const R = units.types[gun.type].gatling, ang = Math.atan2(p.z - gun.z, p.x - gun.x), half = (R.coneDeg ?? 30) * Math.PI / 360;
    const pt = (r, a) => { const q = view.unitToScreen(gun.x + Math.cos(a) * r, gun.z + Math.sin(a) * r, 0.05); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; };
    const outer = [], inner = [];
    for (let k = 0; k <= 8; k++) { const a = ang - half + 2 * half * k / 8; outer.push(pt(R.range, a)); inner.unshift(pt(R.minRange ?? 0, a)); }
    conePath.setAttribute('d', `M${inner[inner.length - 1]} L${outer.join(' L')} L${inner.join(' L')} Z`);
    coneSvg.style.display = '';
  }
  return {
    update,
    aimPreview,
    // Shift + Q, E, R, F: the i-th special shown; p = the pointer's place on the ground
    key(i, p = null) { const x = shown.find(s => s.a.special && s.ki === i); if (!x) return false; arm(x.a, p); return true; },
    // Shift + right-click on the ground: Torch, when the selection can
    shiftRight(p) { if (!p || !torchers()) return false; torchAt(p); return true; },
  };
}
