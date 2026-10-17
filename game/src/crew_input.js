// Mouse control of crew, RTS-style: left-click or drag a box to select your crew,
// right-click the ground to send them there, right-click your hero to have them follow,
// right-click an enemy to attack it, X then left-click for attack-move. The hero's auto
// attack is Ctrl + right-click on a unit (Tim 2026-10-17: the one hero attack input; side and
// middle buttons and Shift do not reach the page reliably in Firefox): he chases it and keeps
// hitting it until it is down or he gets another order, and on a downed one he finishes it off.
// Townsfolk can be clicked to look at them (selection panel) and attacked like enemies (heat!).
// Selection lives only on this screen; orders go to the rules as 'order' commands.
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
// downed ones) within TAB_RANGE, nearest first; pressing again moves on from `current`
const TAB_RANGE = 14;
export function tabTarget(state, heroId, current) {
  const h = state.entities[heroId];
  if (!h || h.dead) return null;
  const list = Object.values(state.entities)
    .filter(e => e.owner && e.owner !== h.owner && !e.dead && !e.downed && e.place === h.place && Math.hypot(e.x - h.x, e.z - h.z) <= TAB_RANGE)
    .sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z) || (a.id < b.id ? -1 : 1));
  if (!list.length) return null;
  const i = list.findIndex(e => e.id === current);
  return list[(i + 1) % list.length].id;
}

export function createCrewInput({ game, view, heroId, send, box }) {
  let selected = [];
  let drag = null;
  let attackMove = false;     // X pressed: the next left-click on the ground is an attack-move
  const hero = () => game.state.entities[heroId];
  const myCrew = () => Object.values(game.state.entities)
    .filter(e => e.owner === hero()?.owner && e.type !== 'hero' && e.place === 'street');
  const outdoors = () => hero()?.place === 'street';
  const enemies = () => Object.values(game.state.entities)
    .filter(e => e.owner && e.owner !== hero()?.owner && !e.dead && e.place === hero()?.place);
  const townsfolk = () => Object.values(game.state.entities)
    .filter(e => e.type === 'civilian' && !e.dead && e.place === hero()?.place);

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
    if (e.target.closest('button, #hire, #clinic, #bar, #selpanel') || !outdoors()) return;
    const target = () => unitAt(e.clientX, e.clientY, enemies()) || unitAt(e.clientX, e.clientY, townsfolk(), CIV_PX);
    // Ctrl + right-click on a unit: the hero's auto attack (Ctrl + right-click on the ground
    // stays the crew's hold order)
    if (e.button === 2 && e.ctrlKey && target()) { heroAt(e.clientX, e.clientY); return; }
    if (e.button === 0 && attackMove) {
      attackMove = false;
      document.body.style.cursor = '';
      const p = view.screenToGround(e.clientX, e.clientY);
      if (p && mine().length) send({ id: heroId, type: 'order', units: mine(), kind: 'attackmove', x: p.x, z: p.z });
      return;
    }
    if (e.button === 0) drag = { x: e.clientX, y: e.clientY, add: e.shiftKey };
    if (e.button === 2) {
      // right-click is for the selected crew only: attack an enemy, finish off a downed one
      // (the nearest selected crew member does it), or go / follow / hold
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
      // a left-click on an enemy locks the hero onto it (MMO-style) and shows its card
      const foe = !unitAt(e.clientX, e.clientY, myCrew()) && unitAt(e.clientX, e.clientY, enemies().filter(f => !f.downed));
      if (foe) send({ id: heroId, type: 'attack', target: foe.id });
      const u = foe || unitAt(e.clientX, e.clientY, myCrew()) || unitAt(e.clientX, e.clientY, townsfolk(), CIV_PX);
      picked = u ? [u.id] : [];
    } else {
      const [x0, x1] = [Math.min(x, e.clientX), Math.max(x, e.clientX)], [y0, y1] = [Math.min(y, e.clientY), Math.max(y, e.clientY)];
      picked = myCrew().filter(u => { const s = view.unitToScreen(u.x, u.z); return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1; }).map(u => u.id);
    }
    // a townsperson or enemy is only ever looked at on its own (never mixed into a crew selection)
    const civ = id => game.state.entities[id] && game.state.entities[id].owner !== hero()?.owner;
    if (picked.some(civ) || selected.some(civ)) setSelected(picked);
    else setSelected(add ? [...new Set([...selected, ...picked])] : picked);
  });

  return {
    // Tab: lock the hero onto the next enemy (same lock as Ctrl + right-click)
    tab() { const t = tabTarget(game.state, heroId, hero()?.attackTarget); if (t) send({ id: heroId, type: 'attack', target: t }); },
    // keep the lock marker (#lock) over the head of the hero's locked target, every frame
    drawLock(el) {
      const t = game.state.entities[hero()?.attackTarget];
      el.hidden = !t || t.place !== hero()?.place;
      if (el.hidden) return;
      const [, head] = feetAndHead(view, t);
      el.style.transform = `translate(${head.x}px, ${head.y}px)`;
    },
    selectAll() { setSelected(myCrew().map(u => u.id)); },
    clear() { setSelected([]); attackMove = false; document.body.style.cursor = ''; },
    armAttackMove() { if (mine().length) { attackMove = true; document.body.style.cursor = 'crosshair'; } },
    followMe() { if (mine().length) send({ id: heroId, type: 'order', units: mine(), kind: 'follow' }); },
    // hurt selected crew walk to the clinic to heal (for ryo)
    healSelected() { if (mine().length) send({ id: heroId, type: 'order', units: mine(), kind: 'heal' }); },
    select(ids) { setSelected(ids); },
    selected: () => selected,
    // drop units that are gone (killed, or carried to the clinic) from the selection; downed
    // ones stay so the selection panel can show them (the rules ignore orders to them)
    update() { const alive = selected.filter(id => game.state.entities[id] && !game.state.entities[id].dead); if (alive.length !== selected.length) setSelected(alive); },
  };
}
