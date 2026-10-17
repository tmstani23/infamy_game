// Mouse control of crew, RTS-style: left-click or drag a box to select your crew,
// right-click the ground to send them there, right-click your hero to have them follow,
// right-click an enemy to attack it, X then left-click for attack-move.
// Selection lives only on this screen; orders go to the rules as 'order' commands.
const PICK_PX = 28;     // how close a click must be to a unit's body

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

  function setSelected(ids) {
    selected = ids;
    view.setSelected(ids);
  }
  // the unit under a page pixel (closest within PICK_PX), from a list
  function unitAt(px, py, list) {
    let best = null, bd = PICK_PX;
    for (const e of list) {
      const s = view.unitToScreen(e.x, e.z), d = Math.hypot(s.x - px, s.y - py);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousedown', e => {
    if (e.target.closest('button, #hire, #bar') || !outdoors()) return;
    if (e.button === 0 && attackMove) {
      attackMove = false;
      document.body.style.cursor = '';
      const p = view.screenToGround(e.clientX, e.clientY);
      if (p && selected.length) send({ id: heroId, type: 'order', units: selected, kind: 'attackmove', x: p.x, z: p.z });
      return;
    }
    if (e.button === 0) drag = { x: e.clientX, y: e.clientY, add: e.shiftKey };
    if (e.button === 2) {
      // right-click an enemy: the hero chases and hits it (Dota-style), and so do selected crew
      const foe = unitAt(e.clientX, e.clientY, enemies());
      if (foe) {
        send({ id: heroId, type: 'attack', target: foe.id });
        if (selected.length) send({ id: heroId, type: 'order', units: selected, kind: 'attack', target: foe.id });
        return;
      }
      if (!selected.length) return;
      if (unitAt(e.clientX, e.clientY, [hero()])) { send({ id: heroId, type: 'order', units: selected, kind: 'follow' }); return; }
      const p = view.screenToGround(e.clientX, e.clientY);
      if (p) send({ id: heroId, type: 'order', units: selected, kind: e.ctrlKey ? 'station' : 'move', x: p.x, z: p.z });
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
      const u = unitAt(e.clientX, e.clientY, myCrew());
      picked = u ? [u.id] : [];
    } else {
      const [x0, x1] = [Math.min(x, e.clientX), Math.max(x, e.clientX)], [y0, y1] = [Math.min(y, e.clientY), Math.max(y, e.clientY)];
      picked = myCrew().filter(u => { const s = view.unitToScreen(u.x, u.z); return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1; }).map(u => u.id);
    }
    setSelected(add ? [...new Set([...selected, ...picked])] : picked);
  });

  return {
    selectAll() { setSelected(myCrew().map(u => u.id)); },
    clear() { setSelected([]); attackMove = false; document.body.style.cursor = ''; },
    armAttackMove() { if (selected.length) { attackMove = true; document.body.style.cursor = 'crosshair'; } },
    followMe() { if (selected.length) send({ id: heroId, type: 'order', units: selected, kind: 'follow' }); },
    // drop units that are gone (killed later on) from the selection
    update() { const alive = selected.filter(id => game.state.entities[id] && !game.state.entities[id].dead); if (alive.length !== selected.length) setSelected(alive); },
  };
}
