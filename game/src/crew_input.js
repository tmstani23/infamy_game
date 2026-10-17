// Mouse control of crew, RTS-style: left-click or drag a box to select your crew,
// right-click the ground to send them there, right-click your hero to have them follow,
// right-click an enemy to attack it, X then left-click for attack-move. The hero attacks
// (or finishes off a downed one) with a mouse side button, the middle button or Shift +
// right-click instead, so
// the two never get mixed up (Tim 2026-10-17). Townsfolk can be clicked to look at them
// (selection panel) and attacked like enemies (heat!).
// Selection lives only on this screen; orders go to the rules as 'order' commands.
const PICK_PX = 22;     // how close a click must be to a unit's body (feet to head)
const CIV_PX = 16;      // ...and a townsperson's (a little tighter, so a move order in a crowd stays a move order)

// Page-pixel distance from a click to a unit's body, taken as the line from its feet to the
// top of its head. view.unitToScreen only gives the body centre (0.9 up); the camera is
// orthographic, so the feet are found by sliding that point back along the view ray
// (screenToGround of the centre lands as far beyond the feet as the feet are below it).
// Before 2026-10-17 only a small circle round the centre counted, so clicks on a running
// townsperson's head or legs missed (Tim could not attack them).
export function bodyDistance(view, e, px, py) {
  const c = view.unitToScreen(e.x, e.z), g = view.screenToGround(c.x, c.y);
  const f = g ? view.unitToScreen(2 * e.x - g.x, 2 * e.z - g.z) : { x: c.x, y: c.y + 30 };
  const hx = c.x + (c.x - f.x) * 1.1, hy = c.y + (c.y - f.y) * 1.1;          // head, about 1.9 up
  const vx = hx - f.x, vy = hy - f.y, len2 = vx * vx + vy * vy || 1;
  const k = Math.max(0, Math.min(1, ((px - f.x) * vx + (py - f.y) * vy) / len2));
  return Math.hypot(px - (f.x + vx * k), py - (f.y + vy * k));
}
const HERO_BUTTONS = [1, 3, 4];   // middle, back (Mouse 4) and forward (Mouse 5): the hero attacks

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

  addEventListener('contextmenu', e => e.preventDefault());
  // the side buttons would otherwise make the browser go back / forward, and middle-click scroll
  for (const type of ['mouseup', 'auxclick']) addEventListener(type, e => { if (HERO_BUTTONS.includes(e.button)) e.preventDefault(); });
  addEventListener('mousedown', e => {
    if (HERO_BUTTONS.includes(e.button)) e.preventDefault();
    if (e.target.closest('button, #hire, #clinic, #bar, #selpanel') || !outdoors()) return;
    const target = () => unitAt(e.clientX, e.clientY, enemies()) || unitAt(e.clientX, e.clientY, townsfolk(), CIV_PX);
    // Shift + right-click works on any mouse (side buttons are often taken over by mouse software)
    if (HERO_BUTTONS.includes(e.button) || (e.button === 2 && e.shiftKey)) {
      // the hero: chase and hit the unit under the mouse (Dota-style), or finish it off if it is down
      const foe = target();
      if (foe?.downed) send({ id: heroId, type: 'execute', target: foe.id });
      else if (foe) send({ id: heroId, type: 'attack', target: foe.id });
      return;
    }
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
      const u = unitAt(e.clientX, e.clientY, myCrew()) || unitAt(e.clientX, e.clientY, townsfolk(), CIV_PX);
      picked = u ? [u.id] : [];
    } else {
      const [x0, x1] = [Math.min(x, e.clientX), Math.max(x, e.clientX)], [y0, y1] = [Math.min(y, e.clientY), Math.max(y, e.clientY)];
      picked = myCrew().filter(u => { const s = view.unitToScreen(u.x, u.z); return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1; }).map(u => u.id);
    }
    // a townsperson is only ever looked at on its own (never mixed into a crew selection)
    const civ = id => game.state.entities[id]?.type === 'civilian';
    if (picked.some(civ) || selected.some(civ)) setSelected(picked);
    else setSelected(add ? [...new Set([...selected, ...picked])] : picked);
  });

  return {
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
