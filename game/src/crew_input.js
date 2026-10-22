// Mouse control of crew, RTS-style: left-click or drag a box to select your crew,
// right-click the ground to send them there, right-click your hero to have them follow,
// right-click an enemy for the hero and selected crew to attack it, X then left-click
// for attack-move. Ctrl + right-click assigns selected crew independently. The hero
// locks on without chasing; right-clicking a downed unit executes it instead.
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
// again moves on from `current`. Whoever is knocking down your War Lantern comes first (Tim 2026-10-20)
const TAB_RANGE = 14;
export function tabTarget(state, heroId, current, seen = () => true) {
  const h = state.entities[heroId];
  if (!h || h.dead) return null;
  const list = Object.values(state.entities)
    .filter(e => e.owner && e.owner !== h.owner && !e.hidden && !e.dead && !e.downed && !e.jailed && e.place === h.place && Math.hypot(e.x - h.x, e.z - h.z) <= TAB_RANGE && seen(e))
    .sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z) || (a.id < b.id ? -1 : 1));
  if (!list.length) return null;
  const knocker = list.find(e => Object.values(state.attacks || {}).some(a => a.clan === h.owner && a.knock?.by === e.id));
  if (knocker && current !== knocker.id) return knocker.id;
  const i = list.findIndex(e => e.id === current);
  return list[(i + 1) % list.length].id;
}

// Red: hero/Tab target. Blue: an independent crew target. Purple: crew sharing
// the hero's target, regardless of whether they joined automatically or by an order.
export function targetMarkers(state, heroId, tabbed, seen = () => true) {
  const h = state.entities[heroId], S = state.entities;
  if (!h) return [];
  const live = id => S[id] && !S[id].dead && !S[id].jailed && (!S[id].hidden || S[id].owner === h.owner) && S[id].place === h.place && seen(S[id]);
  const heroT = !h.dead && !h.downed && !h.jailed ? [h.attackTarget, h.swing?.target].find(live) : null;
  const crewT = new Set(Object.values(S).filter(u => u.owner === h.owner && u.type !== 'hero' && !u.guard && !u.dead && !u.downed && !u.jailed && u.place === h.place)
    .map(u => u.order?.kind === 'attack' ? u.order.target : u.execute?.target || u.swing?.target).filter(live));
  const out = heroT ? [{ id: heroT, kind: crewT.has(heroT) ? 'shared' : 'hero' }] : [];
  if (live(tabbed) && tabbed !== heroT && !S[tabbed].downed) out.push({ id: tabbed, kind: crewT.has(tabbed) ? 'crew' : 'tab' });
  for (const id of crewT) if (id !== heroT && id !== tabbed) out.push({ id, kind: 'crew' });
  return out;
}

export function createCrewInput({ game, view, heroId, send, box }) {
  let selected = [];
  const groups = new Map(); // Local selection shortcuts; assignment never changes orders.
  let drag = null;
  let attackMove = false;     // X pressed: the next left-click on the ground is an attack-move
  let tabbed = null;          // the Tab (or left-click) target: red, purple when sharing the hero's attack
  let looked = null;          // a townsperson (or other non-enemy) left-clicked to look at in the target frame
  let building = null;        // the selected building (index in the district's buildings), or null
  const hero = () => game.state.entities[heroId];
  const myCrew = () => Object.values(game.state.entities)
    .filter(e => e.owner === hero()?.owner && e.type !== 'hero' && !e.guard && e.place === hero()?.place);   // indoors too, so C works there
  const outdoors = () => hero()?.place === 'street';
  // units hidden in the fog of war (sim/vision.js) can't be clicked, tabbed or sent for
  const seen = e => !!e && (!e.hidden || e.owner === hero()?.owner) && (!game.vision || game.vision.canSee(hero()?.owner, e));
  function pruneTargets() {
    if (tabbed && !seen(game.state.entities[tabbed])) tabbed = null;
    if (looked && !seen(game.state.entities[looked])) looked = null;
  }
  const enemies = () => Object.values(game.state.entities)
    .filter(e => e.owner && e.owner !== hero()?.owner && !e.dead && e.place === hero()?.place && seen(e));
  const townsfolk = () => Object.values(game.state.entities)
    .filter(e => e.type === 'civilian' && !e.dead && e.place === hero()?.place && seen(e));
  // bandit bodies with ryo on them: right-click to loot (Tim 2026-10-19)
  const bodies = () => Object.values(game.state.entities)
    .filter(e => e.dead && e.loot > 0 && e.place === hero()?.place && seen(e));

  // has the hero's clan ever seen any of building i's footprint (centre or corners)?
  const explored = i => {
    const s = game.scenery.find(t => t.building === i), g = game.vision?.grid(hero()?.owner);
    if (!s || !g) return !!s;
    const { minX, maxX, minZ, maxZ } = s.foot;
    return [[s.x, s.z], [minX, minZ], [minX, maxZ], [maxX, minZ], [maxX, maxZ]].some(([x, z]) => g.explored[game.vision.cellOf(x, z)] === 1);
  };
  // the selected units orders go to (a selected townsperson takes none)
  const mine = () => selected.filter(id => game.state.entities[id]?.owner === hero()?.owner);
  const groupable = id => {
    const u = game.state.entities[id];
    return u && u.owner === hero()?.owner && u.type !== 'hero' && u.type !== 'civilian' && !u.guard && !u.wild && !u.cop && !u.dead;
  };
  function pruneGroups() {
    for (const [number, ids] of groups) {
      const live = ids.filter(groupable);
      if (live.length) groups.set(number, live);
      else groups.delete(number);
    }
  }
  function setSelected(ids) {
    selected = [...new Set(ids)];
    view.setSelected(selected);
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
    if (foe) { tabbed = foe.downed ? null : foe.id; looked = null; }
    if (foe?.downed) send({ id: heroId, type: 'execute', target: foe.id });
    else if (foe) send({ id: heroId, type: 'attack', target: foe.id, assist: true, units: mine() });
  }
  addEventListener('mousedown', e => {
    if (e.target.closest('button, #hire, #clinic, #bar, #selpanel, #bldpanel, #controls, #knockbar')) return;   // indoors too (rooms sit on the same ground plane)
    const target = () => unitAt(e.clientX, e.clientY, enemies()) || unitAt(e.clientX, e.clientY, townsfolk(), CIV_PX);
    // right-click on a unit: the hero's auto attack (Tim 2026-10-17); Ctrl + right-click on a
    // unit sends the selected crew instead (below). On the ground both stay crew orders.
    if (e.button === 2 && !e.ctrlKey && target()) { heroAt(e.clientX, e.clientY); return; }
    // right-click a bandit's body: the hero walks over and loots it; Ctrl + right-click: the nearest selected crew member does
    const body = e.button === 2 && !target() && unitAt(e.clientX, e.clientY, bodies());
    if (body) { send({ id: heroId, type: 'loot', target: body.id, ...(e.ctrlKey ? { units: mine() } : {}) }); return; }
    if (e.button === 0 && attackMove) {
      attackMove = false;
      document.body.style.cursor = '';
      const p = view.screenToGround(e.clientX, e.clientY);
      if (p && mine().length) send({ id: heroId, type: 'order', units: mine(), kind: 'attackmove', x: p.x, z: p.z });
      return;
    }
    if (e.button === 0) drag = { x: e.clientX, y: e.clientY };
    if (e.button === 2) {
      // crew orders: Ctrl + right-click a unit to attack it or finish it off (the nearest
      // selected crew member does that); right-click the ground to go there (Ctrl: hold it),
      // or the hero to follow
      if (!mine().length) return;
      const foe = target();
      if (foe?.downed) { send({ id: heroId, type: 'execute', target: foe.id, units: mine() }); return; }
      if (foe) { send({ id: heroId, type: 'order', units: mine(), kind: 'attack', target: foe.id }); return; }
      if (unitAt(e.clientX, e.clientY, [hero()])) { send({ id: heroId, type: 'order', units: mine(), kind: 'follow' }); return; }
      // right-click your own business: they walk to its door, go in and hold it (checkpoint 5)
      const i = !e.ctrlKey && outdoors() ? view.buildingAt(e.clientX, e.clientY) : null, biz = i !== null && game.state.businesses[`b${i}`];
      // also the hideout your Shinobi have a Steal job on: the crew climb in by its back window (Tim 2026-10-21)
      if (biz && biz.room && (biz.owner === hero()?.owner || game.contracts?.mayClimb(hero(), biz.room))) { if (mine().length) view.flashBuilding(i); send({ id: heroId, type: 'order', units: mine(), kind: 'enter', business: biz.id }); return; }
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
    const { x, y } = drag;
    drag = null;
    box.hidden = true;
    // the crew selection sticks (Tim 2026-10-19): a click on one of your crew toggles it, a drag box picks exactly the crew in it,
    // and clicking anything else (an enemy, a townsperson, a building, the ground) leaves it alone;
    // only Esc, clicking them off here or on their name on the bar unselects (Tim 2026-10-20: only Esc)
    let picked = [];
    if (Math.abs(e.clientX - x) < 6 && Math.abs(e.clientY - y) < 6) {
      // a left-click on an enemy makes it the Tab target (MMO-style) and shows its card
      const mate = unitAt(e.clientX, e.clientY, myCrew());
      const foe = !mate && unitAt(e.clientX, e.clientY, enemies().filter(f => !f.downed));
      if (foe) tabbed = foe.id;
      const civ = !mate && !foe && unitAt(e.clientX, e.clientY, townsfolk(), CIV_PX);
      looked = civ ? civ.id : null;
      if (mate) picked = [mate.id];
      // nothing there but a building: look at the building
      const b = mate || foe || civ || !outdoors() ? null : view.buildingAt(e.clientX, e.clientY);
      building = b !== null && explored(b) ? b : null;
      if (mate) setSelected(selected.includes(mate.id) ? selected.filter(id => id !== mate.id) : [...selected, mate.id]);
      if (foe) picked = [foe.id];
    } else {
      const [x0, x1] = [Math.min(x, e.clientX), Math.max(x, e.clientX)], [y0, y1] = [Math.min(y, e.clientY), Math.max(y, e.clientY)];
      const boxed = myCrew().filter(u => { const s = view.unitToScreen(u.x, u.z); return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1; });
      picked = boxed.filter(u => !u.dead).map(u => u.id);
      building = null;
      if (picked.length) setSelected(picked);   // a drag picks exactly the crew in the box (Tim 2026-10-20); an empty box keeps the selection
    }
    // a left-click (or drag) anywhere but the hero's locked target drops it and cancels his auto
    // attack (Tim 2026-10-18); clicking the target itself keeps it
    const locked = hero()?.attackTarget;
    if (locked && !(picked.length === 1 && picked[0] === locked)) {
      send({ id: heroId, type: 'stopattack', units: mine() });
      if (tabbed === locked) tabbed = null;
    }
  });

  return {
    // Tab: the next enemy becomes the hero's target and he starts his auto attack on it at once
    // Left-click still only selects a target; Tab attacks with selected crew.
    tab() {
      tabbed = tabTarget(game.state, heroId, tabbed, seen) || null;
      if (tabbed) send({ id: heroId, type: 'attack', target: tabbed, assist: true, units: mine() });
    },
    // a given unit becomes the hero's target and he attacks it (a click on the lantern channel bar)
    target(id) {
      const t = game.state.entities[id];
      if (!t || t.dead || t.place !== hero()?.place || !seen(t)) return;
      tabbed = id;
      send({ id: heroId, type: 'attack', target: id, assist: true, units: mine() });
    },
    // T: outdoor crew (selected or not) attack the marked unit (left-click, its card showing),
    // else the hero's current target; a downed one they finish off (Tim 2026-10-19)
    crewAttack() {
      const S = game.state.entities, h = hero();
      if (!outdoors()) return;
      const t = [...selected, h?.attackTarget, h?.swing?.target, looked, tabbed].map(id => S[id]).find(t => t && !t.dead && t.owner !== h.owner && seen(t));
      const units = Object.values(S).filter(e => e.owner === h?.owner && e.type !== 'hero' && !e.guard && !e.dead && !e.downed && !e.jailed && e.place === 'street').map(e => e.id);
      // a second T while they are on a T attack calls it off: back to what they were doing (Tim 2026-10-19)
      const assigned = units.filter(id => S[id].order?.kind === 'attack' && S[id].order.broadcast);
      if (assigned.length) { send({ id: heroId, type: 'order', units: assigned, kind: 'resume', broadcast: true }); return; }
      if (!t || !units.length) return;
      if (t.downed) send({ id: heroId, type: 'execute', target: t.id, units, broadcast: true });
      else send({ id: heroId, type: 'order', units, kind: 'attack', target: t.id, resume: true, broadcast: true });
    },
    // Shared attacks take purple priority; separate crew assignments stay blue.
    markers() { pruneTargets(); return targetMarkers(game.state, heroId, tabbed, seen); },
    tabbed() { pruneTargets(); return tabbed; },   // for the target frame (src/unit_frames.js)
    looked() { pruneTargets(); return looked; },
    hovered(px, py) {
      const h = hero();
      if (!h || drag) return null;
      return unitAt(px, py, Object.values(game.state.entities)
        .filter(e => !e.dead && e.place === h.place && seen(e)))?.id || null;
    },
    drawMarkers(root) {
      pruneTargets();
      const list = targetMarkers(game.state, heroId, tabbed, seen);
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
    selectAll() { setSelected(Object.keys(game.state.entities).filter(groupable)); },
    assignGroup(number) {
      if (![1, 2, 3, 4].includes(number)) return;
      pruneGroups();
      const ids = selected.filter(groupable), old = groups.get(number) || [];
      if (!ids.length) return;
      if (ids.length === old.length && ids.every(id => old.includes(id))) { groups.delete(number); return; }
      // Membership is exclusive: assigning another number transfers these crew.
      for (const [key, members] of groups) groups.set(key, members.filter(id => !ids.includes(id)));
      groups.set(number, ids);
      pruneGroups();
    },
    selectGroup(number) {
      pruneGroups();
      const ids = groups.get(number);
      if (ids?.length) { setSelected(ids); building = null; }
    },
    groupOf(id) { pruneGroups(); return [...groups].find(([, ids]) => ids.includes(id))?.[0] || null; },
    clear() { setSelected([]); looked = null; building = null; attackMove = false; document.body.style.cursor = ''; },
    cancelAction() { send({ id: heroId, type: 'cancel', units: mine() }); },
    armAttackMove() { if (mine().length) { attackMove = true; document.body.style.cursor = 'crosshair'; } },
    // Z: selected crew stop and go passive until their next order (sim 'order' kind 'stop')
    stopSelected() { if (mine().length) send({ id: heroId, type: 'order', units: mine(), kind: 'stop' }); },
    followMe() { const units = mine().filter(id => game.state.entities[id]?.place === hero()?.place); if (units.length) send({ id: heroId, type: 'order', units, kind: 'follow' }); },
    // hurt selected crew walk to the clinic to heal (for ryo)
    healSelected() { if (mine().length) send({ id: heroId, type: 'order', units: mine(), kind: 'heal' }); },
    select(ids) { setSelected(ids); building = null; },
    selected: () => selected,
    building: () => building,
    // drop units that are gone (killed, or carried to the clinic) from the selection; downed
    // ones stay so the selection panel can show them (the rules ignore orders to them), and so do
    // jailed crew picked on the action bar (prisoner ids, only shown, never sent orders)
    update() { pruneGroups(); if (!outdoors()) building = null; const alive = selected.filter(id => game.state.entities[id] ? !game.state.entities[id].dead : !!prisonerOf(game.state, id)); if (alive.length !== selected.length) setSelected(alive); },
  };
}
