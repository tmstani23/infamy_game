// Mouse control of crew, RTS-style: left-click or drag a box to select your crew,
// right-click the ground to send them there, right-click your hero to have them follow,
// right-click an enemy to attack it, X then left-click for attack-move. The hero's auto
// attack is Ctrl + right-click on a unit (Tim 2026-10-17: the one hero attack input; side and
// middle buttons and Shift do not reach the page reliably in Firefox): he chases it and keeps
// hitting it until it is down or he gets another order, and on a downed one he finishes it off.
// Townsfolk can be clicked to look at them (selection panel) and attacked like enemies (heat!).
// Left-click a building (where nothing else is) to look at it (building_panel.js), unless the fog
// has never shown it.
// Selection lives only on this screen; orders go to the rules as 'order' commands.
import { prisonerOf } from './sim/police.js';
const PICK_PX = 22;     // how close a click must be to a unit's body (feet to head)
const CIV_PX = 16;      // ...and a townsperson's (a little tighter, so a move order in a crowd stays a move order)

// Page-pixel distance from a click to a unit's body, taken as the line from its feet to the
// top of its head. view.unitToScreen only gives the body centre (0.9 up); the camera is
// orthographic, so the feet are found by sliding that point back along the view ray
// (screenToGround of the centre lands as far beyond the feet as the feet are below it).
// Before 2026-10-17 only a small circle round the centre counted, so clicks on a running
// townsperson's head or legs missed (Tim could not attack them).
function feetAndHead(view, e) {
  const c = view.unitToScreen(e.x, e.z), g = view.screenToGround(c.x, c.y);
  const f = g ? view.unitToScreen(2 * e.x - g.x, 2 * e.z - g.z) : { x: c.x, y: c.y + 30 };
  return [f, { x: c.x + (c.x - f.x) * 1.1, y: c.y + (c.y - f.y) * 1.1 }];   // head, about 1.9 up
}
export function bodyDistance(view, e, px, py) {
  const [f, { x: hx, y: hy }] = feetAndHead(view, e);
  const vx = hx - f.x, vy = hy - f.y, len2 = vx * vx + vy * vy || 1;
  const k = Math.max(0, Math.min(1, ((px - f.x) * vx + (py - f.y) * vy) / len2));
  return Math.hypot(px - (f.x + vx * k), py - (f.y + vy * k));
}

// Tab targeting: the hero's next enemy (another clan's standing unit, never townsfolk or
// downed ones) within TAB_RANGE and not hidden in the fog (`seen`), nearest first; pressing
// again moves on from `current`
const TAB_RANGE = 14;
export function tabTarget(state, heroId, current, seen = () => true) {
  const h = state.entities[heroId];
  if (!h || h.dead) return null;
  const list = Object.values(state.entities)
    .filter(e => e.owner && e.owner !== h.owner && !e.dead && !e.downed && e.place === h.place && Math.hypot(e.x - h.x, e.z - h.z) <= TAB_RANGE && seen(e))
    .sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z) || (a.id < b.id ? -1 : 1));
  if (!list.length) return null;
  const i = list.findIndex(e => e.id === current);
  return list[(i + 1) % list.length].id;
}

// Which units get a marker over their head: [{ id, kind: 'tab' | 'hero' | 'crew' }]. Red ('hero')
// once the hero is attacking a unit (locked on or swinging at it), blue ('tab') for the Tab target
// otherwise, and small red ('crew') for whatever the hero's crew are attacking, unless it is the
// hero's target already.
export function targetMarkers(state, heroId, tabbed) {
  const h = state.entities[heroId], S = state.entities;
  if (!h) return [];
  const live = id => S[id] && !S[id].dead && S[id].place === h.place;
  const heroT = [h.attackTarget, h.swing?.target].find(live);
  const out = heroT ? [{ id: heroT, kind: 'hero' }] : [];
  if (live(tabbed) && tabbed !== heroT && !S[tabbed].downed) out.push({ id: tabbed, kind: 'tab' });
  const crewT = new Set(Object.values(S).filter(u => u.owner === h.owner && u.type !== 'hero' && !u.dead && !u.downed)
    .map(u => u.swing?.target || (u.order?.kind === 'attack' ? u.order.target : u.execute?.target)).filter(live));
  for (const id of crewT) if (id !== heroT && id !== tabbed) out.push({ id, kind: 'crew' });
  return out;
}

export function createCrewInput({ game, view, heroId, send, box }) {
  let selected = [];
  let drag = null;
  let attackMove = false;     // X pressed: the next left-click on the ground is an attack-move
  let tabbed = null;          // the Tab (or left-click) target: shown blue until the hero attacks it
  let building = null;        // the selected building (index in the district's buildings), or null
  const hero = () => game.state.entities[heroId];
  const myCrew = () => Object.values(game.state.entities)
    .filter(e => e.owner === hero()?.owner && e.type !== 'hero' && e.place === hero()?.place);   // indoors too, so C works there
  const outdoors = () => hero()?.place === 'street';
  // units hidden in the fog of war (sim/vision.js) can't be clicked, tabbed or sent for
  const seen = e => !game.vision || game.vision.canSee(hero()?.owner, e);
  const enemies = () => Object.values(game.state.entities)
    .filter(e => e.owner && e.owner !== hero()?.owner && !e.dead && e.place === hero()?.place && seen(e));
  const townsfolk = () => Object.values(game.state.entities)
    .filter(e => e.type === 'civilian' && !e.dead && e.place === hero()?.place && seen(e));

  // has the hero's clan ever seen any of building i's footprint (centre or corners)?
  const explored = i => {
    const s = game.scenery.find(t => t.building === i), g = game.vision?.grid(hero()?.owner);
    if (!s || !g) return !!s;
    const { minX, maxX, minZ, maxZ } = s.foot;
    return [[s.x, s.z], [minX, minZ], [minX, maxZ], [maxX, minZ], [maxX, maxZ]].some(([x, z]) => g.explored[game.vision.cellOf(x, z)] === 1);
  };
  // the selected units orders go to (a selected townsperson takes none)
  const mine = () => selected.filter(id => game.state.entities[id]?.owner === hero()?.owner);
  function setSelected(ids) {
    selected = ids;
    view.setSelected(ids);
  }
  // the unit under a page pixel (closest within PICK_PX), from a list
  function unitAt(px, py, list, range = PICK_PX) {
    let best = null, bd = range;
    for (const e of list) {
      const d = bodyDistance(view, e, px, py);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // no browser menu on right-click (capture phase, before anything else sees it)
  addEventListener('contextmenu', e => e.preventDefault(), { capture: true });
  // the hero goes for the unit at a page pixel: attack it, or finish it off if it is down
  function heroAt(px, py) {
    const foe = unitAt(px, py, enemies()) || unitAt(px, py, townsfolk(), CIV_PX);
    if (foe?.downed) send({ id: heroId, type: 'execute', target: foe.id });
    else if (foe) send({ id: heroId, type: 'attack', target: foe.id });
  }
  addEventListener('mousedown', e => {
    if (e.target.closest('button, #hire, #clinic, #bar, #selpanel, #bldpanel, #controls')) return;   // indoors too (rooms sit on the same ground plane)
    const target = () => unitAt(e.clientX, e.clientY, enemies()) || unitAt(e.clientX, e.clientY, townsfolk(), CIV_PX);
    // right-click on a unit: the hero's auto attack (Tim 2026-10-17); Ctrl + right-click on a
    // unit sends the selected crew instead (below). On the ground both stay crew orders.
    if (e.button === 2 && !e.ctrlKey && target()) { heroAt(e.clientX, e.clientY); return; }
    if (e.button === 0 && attackMove) {
      attackMove = false;
      document.body.style.cursor = '';
      const p = view.screenToGround(e.clientX, e.clientY);
      if (p && mine().length) send({ id: heroId, type: 'order', units: mine(), kind: 'attackmove', x: p.x, z: p.z });
      return;
    }
    if (e.button === 0) drag = { x: e.clientX, y: e.clientY, add: e.shiftKey };
    if (e.button === 2) {
      // crew orders: Ctrl + right-click a unit to attack it or finish it off (the nearest
      // selected crew member does that); right-click the ground to go there (Ctrl: hold it),
      // or the hero to follow
      if (!mine().length) return;
      const foe = target();
      if (foe?.downed) { send({ id: heroId, type: 'execute', target: foe.id, units: mine() }); return; }
      if (foe) { send({ id: heroId, type: 'order', units: mine(), kind: 'attack', target: foe.id }); return; }
      if (unitAt(e.clientX, e.clientY, [hero()])) { send({ id: heroId, type: 'order', units: mine(), kind: 'follow' }); return; }
      const p = view.screenToGround(e.clientX, e.clientY);
      if (p) send({ id: heroId, type: 'order', units: mine(), kind: e.ctrlKey ? 'station' : 'move', x: p.x, z: p.z });
    }
  });
  addEventListener('mousemove', e => {
    if (!drag) return;
    const x0 = Math.min(drag.x, e.clientX), y0 = Math.min(drag.y, e.clientY);
    const w = Math.abs(e.clientX - drag.x), h = Math.abs(e.clientY - drag.y);
    box.hidden = w < 6 && h < 6;
    Object.assign(box.style, { left: `${x0}px`, top: `${y0}px`, width: `${w}px`, height: `${h}px` });
  });
  addEventListener('mouseup', e => {
    if (!drag || e.button !== 0) return;
    const { x, y, add } = drag;
    drag = null;
    box.hidden = true;
    let picked;
    if (Math.abs(e.clientX - x) < 6 && Math.abs(e.clientY - y) < 6) {
      // a left-click on an enemy makes it the Tab target (MMO-style) and shows its card
      const foe = !unitAt(e.clientX, e.clientY, myCrew()) && unitAt(e.clientX, e.clientY, enemies().filter(f => !f.downed));
      if (foe) tabbed = foe.id;
      const u = foe || unitAt(e.clientX, e.clientY, myCrew()) || unitAt(e.clientX, e.clientY, townsfolk(), CIV_PX);
      picked = u ? [u.id] : [];
      // nothing there but a building: look at the building instead (the crew selection is dropped)
      const b = u || !outdoors() ? null : view.buildingAt(e.clientX, e.clientY);
      building = b !== null && explored(b) ? b : null;
    } else {
      const [x0, x1] = [Math.min(x, e.clientX), Math.max(x, e.clientX)], [y0, y1] = [Math.min(y, e.clientY), Math.max(y, e.clientY)];
      picked = myCrew().filter(u => { const s = view.unitToScreen(u.x, u.z); return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1; }).map(u => u.id);
      building = null;
    }
    // a left-click (or drag) anywhere but the hero's locked target drops it and cancels his auto
    // attack (Tim 2026-10-18); clicking the target itself keeps it
    const locked = hero()?.attackTarget;
    if (locked && !(picked.length === 1 && picked[0] === locked)) {
      send({ id: heroId, type: 'stopattack' });
      if (tabbed === locked) tabbed = null;
    }
    // a townsperson or enemy is only ever looked at on its own (never mixed into a crew selection)
    const civ = id => game.state.entities[id] && game.state.entities[id].owner !== hero()?.owner;
    if (picked.some(civ) || selected.some(civ)) setSelected(picked);
    else setSelected(add ? [...new Set([...selected, ...picked])] : picked);
  });

  return {
    // Tab: the next enemy becomes the hero's target and he starts his auto attack on it at once
    // (Tim 2026-10-18; left-click still only targets, blue)
    tab() {
      tabbed = tabTarget(game.state, heroId, tabbed, seen) || null;
      if (tabbed) send({ id: heroId, type: 'attack', target: tabbed });
    },
    // T: all the hero's crew (selected or not) attack his current target, or finish it if it is down
    crewAttack() {
      const S = game.state.entities, h = hero();
      const t = [h?.attackTarget, h?.swing?.target, tabbed].map(id => S[id]).find(t => t && !t.dead && t.owner !== h.owner && seen(t));
      const units = Object.values(S).filter(e => e.owner === h?.owner && e.type !== 'hero' && !e.dead && !e.downed && e.place === h.place).map(e => e.id);
      if (!t || !units.length) return;
      if (t.downed) send({ id: heroId, type: 'execute', target: t.id, units });
      else send({ id: heroId, type: 'order', units, kind: 'attack', target: t.id });
    },
    // markers over units, for drawMarkers: blue = Tab target, red = the hero's target,
    // small red = what the crew are attacking (unless it is the hero's target too)
    markers() { return targetMarkers(game.state, heroId, tabbed); },
    drawMarkers(root) {
      const list = targetMarkers(game.state, heroId, tabbed);
      while (root.children.length < list.length) root.appendChild(document.createElement('i'));
      [...root.children].forEach((el, k) => {
        const m = list[k], t = m && game.state.entities[m.id];
        el.hidden = !t;
        if (!t) return;
        const [, head] = feetAndHead(view, t);
        el.className = m.kind;
        el.style.transform = `translate(${head.x}px, ${head.y}px)`;
      });
    },
    selectAll() { setSelected(myCrew().map(u => u.id)); },
    clear() { setSelected([]); building = null; attackMove = false; document.body.style.cursor = ''; },
    armAttackMove() { if (mine().length) { attackMove = true; document.body.style.cursor = 'crosshair'; } },
    // Z: selected crew stop and go passive until their next order (sim 'order' kind 'stop')
    stopSelected() { if (mine().length) send({ id: heroId, type: 'order', units: mine(), kind: 'stop' }); },
    followMe() { if (mine().length) send({ id: heroId, type: 'order', units: mine(), kind: 'follow' }); },
    // hurt selected crew walk to the clinic to heal (for ryo)
    healSelected() { if (mine().length) send({ id: heroId, type: 'order', units: mine(), kind: 'heal' }); },
    select(ids) { setSelected(ids); building = null; },
    selected: () => selected,
    building: () => building,
    // drop units that are gone (killed, or carried to the clinic) from the selection; downed
    // ones stay so the selection panel can show them (the rules ignore orders to them), and so do
    // jailed crew picked on the action bar (prisoner ids, only shown, never sent orders)
    update() { if (!outdoors()) building = null; const alive = selected.filter(id => game.state.entities[id] ? !game.state.entities[id].dead : !!prisonerOf(game.state, id)); if (alive.length !== selected.length) setSelected(alive); },
  };
}
