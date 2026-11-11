// Interior view (Tim 2026-11-10): look inside a building your crew is in without the boss being there, in
// Watch the city or while following crew from the street. Presentation only: the camera does the work
// (render/view.js roomView / leaveRoom); this is the Inside / Outside button, the End key and the
// double-click on a building. Only rooms holding living units of yours can be looked into.
export function peekRoom(state, businesses, owner, heroPlace, room) {
  if (!room || room === 'street' || room === 'world' || room === heroPlace) return null;
  const mine = Object.values(state.entities).filter(e => e.owner === owner && e.place === room && !e.dead && !e.jailed);
  if (!mine.length) return null;
  return mine.find(e => e.type !== 'hero' && !e.guard && !e.guide && !e.downed) || mine[0];
}
export function createInteriorPeek({ game, view, heroId, crewInput, canvas }) {
  let lastRoom = null;
  const hero = () => game.state.entities[heroId];
  const streetDoor = room => game.doors.find(d => d.to && !d.ninja && !d.gate && d.place === room);
  const anchor = room => peekRoom(game.state, game.state.businesses, hero()?.owner, hero()?.place, room);
  const roomOfBuilding = i => (i === null || i === undefined ? null : game.state.businesses?.[`b${i}`]?.room) || null;
  const onStreet = () => !view.roomView() && view.commandPlace(game.state, heroId) === 'street';
  // the room the Inside button would open: the clicked building first, else the room last looked into
  const target = () => { const picked = roomOfBuilding(crewInput?.building?.()); return picked && anchor(picked) ? picked : lastRoom && anchor(lastRoom) ? lastRoom : null; };
  function enter(room) {
    const first = anchor(room); if (!first) return false;
    let id = first.id; lastRoom = room;
    // follow one of yours in that room; if he walks out the camera goes with him, if he falls the next one takes over
    view.watch(() => {
      let u = game.state.entities[id];
      if (!u || u.dead || u.jailed) { u = anchor(room); if (!u) return null; id = u.id; }
      return { id, x: u.x, z: u.z, place: u.place };
    });
    return true;
  }
  function leave() {
    const room = view.roomView(), door = room && streetDoor(room); if (!door) return false;
    lastRoom = room; view.leaveRoom(door.x, door.z); return true;
  }
  const toggle = () => view.roomView() ? leave() : onStreet() && target() ? enter(target()) : false;
  const btn = document.createElement('button');
  btn.id = 'peekbtn'; btn.type = 'button'; btn.hidden = true;
  const style = document.createElement('style');
  style.textContent = '#peekbtn{position:fixed;top:116px;left:50%;transform:translateX(-50%);z-index:60;padding:9px 22px;font-size:16px;font-weight:700;color:#14110a;background:#e9c27a;'
    + 'border:2px solid #14110a;border-radius:4px;cursor:pointer;box-shadow:0 0 14px rgba(0,0,0,.6)}#peekbtn[hidden]{display:none}#peekbtn:hover{background:#ffd98f}';
  document.head.appendChild(style); document.body.appendChild(btn);
  btn.addEventListener('click', e => { toggle(); e.currentTarget.blur(); });
  // double-click a building on the street that has your crew inside
  canvas?.addEventListener('dblclick', e => {
    if (e.button !== 0 || !onStreet()) return;
    const i = view.buildingAt(e.clientX, e.clientY); if (i === null || i === undefined || crewInput?.building?.() !== i) return;
    const room = roomOfBuilding(i); if (room && anchor(room)) enter(room);
  });
  let shown = '';
  return { toggle, enter, leave,
    update() {
      const room = view.roomView(); if (room) lastRoom = room;
      const text = room ? (streetDoor(room) ? 'Outside (End)' : '') : onStreet() && target() ? 'Inside (End)' : '';
      if (text === shown) return; shown = text;
      btn.hidden = !text; btn.textContent = text;
      btn.title = room ? 'Camera back to the street door of this building' : 'Look inside the building your crew is in';
    } };
}
