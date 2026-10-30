// Mouse control of crew, RTS-style: left-click or drag a box to select your crew,
// right-click the ground to send them there, right-click your hero to have them follow,
// right-click an enemy for the hero and selected crew to attack it, X then left-click
// for attack-move. Ctrl + right-click assigns selected crew independently. The hero
// locks on without chasing; right-clicking a downed unit executes it instead.
// Townsfolk can be clicked to look at them (selection panel) and attacked like enemies (heat!).
// Left-click a building (where nothing else is) to look at it (building_panel.js), unless the fog
// has never shown it.
// Selection lives only on this screen; orders go to the rules as 'order' commands.
import { prisonerOf, POLICE } from './sim/police.js';
import { isRallyParticipant } from './sim/deployment_rally.js';
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

// Tab targeting: the hero's next enemy (another clan's standing unit, never police,
// townsfolk or downed ones) within TAB_RANGE and not hidden in the fog (`seen`), nearest first; pressing
// again moves on from `current`. Whoever is knocking down your War Lantern comes first (Tim 2026-10-20)
const TAB_RANGE = 14;
export function tabTarget(state, heroId, current, seen = () => true, place = null, origin = null) {
  const h = state.entities[heroId];
  if (!h) return null;
  place ||= h.place;
  origin ||= h;
  const list = Object.values(state.entities)
    .filter(e => e.owner && e.owner !== h.owner && e.owner !== POLICE && !e.hidden && !e.dead && !e.downed && !e.jailed && e.place === place && Math.hypot(e.x - origin.x, e.z - origin.z) <= TAB_RANGE && seen(e))
    .sort((a, b) => Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z) || (a.id < b.id ? -1 : 1));
  if (!list.length) return null;
  const knocker = list.find(e => Object.values(state.attacks || {}).some(a => a.clan === h.owner && a.knock?.by === e.id));
  if (knocker && current !== knocker.id) return knocker.id;
  const i = list.findIndex(e => e.id === current);
  return list[(i + 1) % list.length].id;
}

// Red: hero/Tab target. Blue: an independent crew target. Purple: crew sharing
// the hero's target, regardless of whether they joined automatically or by an order.
export function targetMarkers(state, heroId, tabbed, seen = () => true, place = null) {
  const h = state.entities[heroId], S = state.entities;
  if (!h) return [];
  place ||= h.place;
  const live = id => S[id] && !S[id].dead && !S[id].jailed && (!S[id].hidden || S[id].owner === h.owner) && S[id].place === place && seen(S[id]);
  const heroT = h.place === place && !h.dead && !h.downed && !h.jailed ? [h.attackTarget, h.swing?.target].find(live) : null;
  const crewT = new Set(Object.values(S).filter(u => u.owner === h.owner && u.type !== 'hero' && !u.guard && !u.dead && !u.downed && !u.jailed && u.place === place)
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
  const commandPlace = () => view.commandPlace?.(game.state, heroId) || hero()?.place;
  const order = c => send({ id: heroId, type: 'order', place: commandPlace(), ...c });
  const myCrew = () => Object.values(game.state.entities)
    .filter(e => e.owner === hero()?.owner && e.type !== 'hero' && !e.guard && e.place === commandPlace());
  const outdoors = () => commandPlace() === 'street';
  // units hidden in the fog of war (sim/vision.js) can't be clicked, tabbed or sent for
  const seen = e => !!e && (!e.hidden || e.owner === hero()?.owner) && (!game.vision || game.vision.canSee(hero()?.owner, e));
  function pruneTargets() {
    const gone=id=>!game.state.entities[id]||(seen(game.state.entities[id])&&(game.state.entities[id].dead||game.state.entities[id].jailed));
    if (tabbed && gone(tabbed)) tabbed = null;
    if (looked && gone(looked)) looked = null;
  }
  const enemies = () => Object.values(game.state.entities)
    .filter(e => e.owner && e.owner !== hero()?.owner && !e.dead && e.place === commandPlace() && seen(e));
  const townsfolk = () => Object.values(game.state.entities)
    .filter(e => e.type === 'civilian' && !e.dead && e.place === commandPlace() && seen(e));
  // bandit bodies with ryo on them: right-click to loot (Tim 2026-10-19)
  const bodies = () => Object.values(game.state.entities)
    .filter(e => e.dead && e.loot > 0 && seen(e) && e.place === commandPlace());

  // has the hero's clan ever seen any of building i's footprint (centre or corners)?
  const explored = i => {
    const s = game.scenery.find(t => t.building === i), g = game.vision?.grid(hero()?.owner);
    if (!s || !g) return !!s;
    const { minX, maxX, minZ, maxZ } = s.foot;
    return [[s.x, s.z], [minX, minZ], [minX, maxZ], [maxX, minZ], [maxX, maxZ]].some(([x, z]) => g.explored[game.vision.cellOf(x, z)] === 1);
  };
  // the selected units orders go to (a selected townsperson takes none)
  const mine = () => selected.filter(id => game.state.entities[id]?.owner === hero()?.owner);
  const bodyJobUnits=()=>mine().length?mine():myCrew().filter(e=>!e.dead&&!e.downed&&!e.jailed&&!e.deployment?.transfer&&['hero','rally'].includes(commandGroup(e))).map(e=>e.id);
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
  function setSelected(ids, returnPrevious = false, alreadyReturned = []) {
    let next = [...new Set(ids)];
    const group = id => commandGroup(game.state.entities[id]);
    if (game.state.deployment?.restrictionsEnabled) {
      const first = next.map(id=>game.state.entities[id]).find(e=>groupable(e?.id));
      if(first)next=next.filter(id=>!groupable(id)||commandGroup(game.state.entities[id])===commandGroup(first));
    }
    const oldGroups = new Set(selected.map(group).filter(Boolean)), newGroups = new Set(next.map(group).filter(Boolean));
    const switched = returnPrevious || (newGroups.size && [...newGroups].some(g => !oldGroups.has(g)) && selected.some(id => !next.includes(id)));
    if (switched) {
      const units = selected.filter(id => !next.includes(id) && !alreadyReturned.includes(id) && game.state.deployment?.clans[hero()?.owner]?.sectors[group(id)]);
      if (units.length) send({ id: heroId, type: 'deployment', action: 'release', units });
    }
    selected = next;
    view.setSelected(selected);
  }
  function commandGroup(e) {
    if (!e) return null;
    const active = game.state.deployment?.clans[e.owner]?.rally?.active;
    return active && (e.deployment?.group === 'hero' || isRallyParticipant(game.state,e)) ? 'rally' : e.deployment?.group || 'hero';
  }
  function selectUnit(id, individual=false) {
    const e=game.state.entities[id];
    if(!e){setSelected([id]);return;}
    if(individual || !game.state.deployment?.restrictionsEnabled){setSelected([id]);return;}
    const group=commandGroup(e);
    setSelected(Object.values(game.state.entities).filter(u=>groupable(u.id)&&!u.downed&&!u.jailed&&!u.deployment?.transfer&&commandGroup(u)===group).map(u=>u.id));
  }
  // the unit under a page pixel (closest within PICK_PX), from a list
  function unitAt(px, py, list, range = PICK_PX) {
    const plate=view.nameplateAt?.(px,py,list.map(e=>e.id));
    if(plate)return list.find(e=>e.id===plate)||null;
    let best = null, bd = range;
    for (const e of list) {
      const d = bodyDistance(view, e, px, py);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // no browser menu on right-click (capture phase, before anything else sees it)
  addEventListener('contextmenu', e => {if(!e.target?.closest?.('input,textarea,[contenteditable="true"]'))e.preventDefault();}, { capture: true });
  // the hero goes for the unit at a page pixel: attack it, or finish it off if it is down
  function heroAt(px, py) {
    const foe = unitAt(px, py, enemies()) || unitAt(px, py, townsfolk(), CIV_PX);
    if(foe)attackTarget(foe.id);
  }
  function attackTarget(id,crewOnly=false){
    const foe=game.state.entities[id],h=hero();if(!foe||foe.dead||foe.owner===h?.owner||foe.place!==commandPlace()||!seen(foe))return;
    tabbed=foe.id;looked=null;
    const units=mine(),heroGroup=!units.length||units.every(id=>['hero','rally'].includes(commandGroup(game.state.entities[id])));
    const useHero=!crewOnly&&heroGroup&&foe.place===h?.place;
    if(foe.downed){const jobs=bodyJobUnits();send({id:heroId,type:'execute',target:id,units:jobs,crewJob:!!jobs.length,crewOnly:!useHero,preferHeroInRange:useHero});return;}
    if(useHero)send({id:heroId,type:'attack',target:id});
    if(units.length)order({units,kind:'attack',target:id});
  }
  addEventListener('mousedown', e => {
    if (e.target.closest('button, #hire, #clinic, #partyframes, #crewcommands, #utilitymenu, #bar, #selpanel, #bldpanel, #controls, #deploymentpanel, #knockbar')) return;   // indoors too (rooms sit on the same ground plane)
    const target = () => unitAt(e.clientX, e.clientY, enemies()) || unitAt(e.clientX, e.clientY, townsfolk(), CIV_PX);
    // right-click on a unit: the hero's auto attack (Tim 2026-10-17); Ctrl + right-click on a
    // unit sends the selected crew instead (below). On the ground both stay crew orders.
    const pointed = e.button === 2 && target();
    const body = e.button === 2 && (!pointed || pointed.downed) && unitAt(e.clientX, e.clientY, bodies());
    if (body) {
      const jobs=bodyJobUnits(),useHero=!e.ctrlKey&&(!jobs.length||jobs.every(id=>['hero','rally'].includes(commandGroup(game.state.entities[id]))));
      send({id:heroId,type:'loot',target:body.id,units:jobs,crewJob:!!jobs.length,preferHeroInRange:useHero,crewOnly:!useHero});return;
    }
    if (e.button === 2 && !e.ctrlKey && pointed) { heroAt(e.clientX, e.clientY); return; }
    if (e.button === 0 && attackMove) {
      attackMove = false;
      document.body.style.cursor = '';
      const p = view.screenToGround(e.clientX, e.clientY);
      if (p && mine().length) order({ units: mine(), kind: 'attackmove', x: p.x, z: p.z });
      return;
    }
    if (e.button === 0) drag = { x: e.clientX, y: e.clientY };
    if (e.button === 2) {
      // crew orders: Ctrl + right-click a unit to attack it or finish it off (the nearest
      // selected crew member does that); right-click the ground to go there (Ctrl: hold it),
      // or the hero to follow
      if (!mine().length) return;
      const foe = target();
      if (foe?.downed) { send({ id: heroId, type: 'execute', target: foe.id, units: mine(),crewJob:true, crewOnly: true }); return; }
      if (foe) { order({ units: mine(), kind: 'attack', target: foe.id }); return; }
      if (hero()?.place === commandPlace() && unitAt(e.clientX, e.clientY, [hero()])) { order({ units: mine(), kind: 'follow' }); return; }
      // right-click your own business: they walk to its door, go in and hold it (checkpoint 5)
      const i = !e.ctrlKey && outdoors() ? view.buildingAt(e.clientX, e.clientY) : null, biz = i !== null && game.state.businesses[`b${i}`];
      // also the hideout your Shinobi have a Steal job on: the crew climb in by its back window (Tim 2026-10-21)
      if (biz && biz.room && (biz.owner === hero()?.owner || game.contracts?.mayClimb(hero(), biz.room))) { if (mine().length) view.flashBuilding(i); order({ units: mine(), kind: 'enter', business: biz.id }); return; }
      const p = view.screenToGround(e.clientX, e.clientY);
      if (p) order({ units: mine(), kind: e.ctrlKey ? 'station' : 'move', x: p.x, z: p.z });
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
      const mate = unitAt(e.clientX, e.clientY, myCrew()) || (game.state.deployment?.restrictionsEnabled&&hero()?.place===commandPlace()&&unitAt(e.clientX,e.clientY,[hero()]));
      const foe = !mate && unitAt(e.clientX, e.clientY, enemies().filter(f => !f.downed));
      if (foe) {tabbed = foe.id;looked=null;}
      const civ = !mate && !foe && unitAt(e.clientX, e.clientY, townsfolk(), CIV_PX);
      looked = civ ? civ.id : mate ? mate.id : null;
      if (mate) picked = [mate.id];
      // nothing there but a building: look at the building
      const b = mate || foe || civ || !outdoors() ? null : view.buildingAt(e.clientX, e.clientY);
      building = b !== null && explored(b) ? b : null;
      if (mate) {
        if(game.state.deployment?.restrictionsEnabled)selectUnit(mate.id);
        else setSelected(selected.includes(mate.id) ? selected.filter(id => id !== mate.id) : [...selected, mate.id]);
      }
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
    }
  });

  return {
    // Tab changes the selected target only; explicit attack input is separate.
    tab() {
      const place = commandPlace(), focus = mine().map(id => game.state.entities[id]).find(e => e?.place === place) || (place === hero()?.place ? hero() : view.audioFocus(game.state, heroId));
      tabbed = tabTarget(game.state, heroId, tabbed, seen, place, focus) || null;
      looked=null;
    },
    // a given unit becomes the hero's target and he attacks it (a click on the lantern channel bar)
    target(id) {
      attackTarget(id);
    },
    attackTarget,
    // T: outdoor crew (selected or not) attack the marked unit (left-click, its card showing),
    // else the hero's current target; a downed one they finish off (Tim 2026-10-19)
    crewAttack() {
      const h=hero(),id=[looked,tabbed,h?.attackTarget,h?.swing?.target].find(id=>{const t=game.state.entities[id];return t&&!t.dead&&t.owner!==h?.owner;});
      if(id)attackTarget(id);
    },
    // Shared attacks take purple priority; separate crew assignments stay blue.
    markers() { pruneTargets(); return targetMarkers(game.state, heroId, tabbed, seen, commandPlace()); },
    tabbed() { pruneTargets(); return tabbed; },   // for the target frame (src/unit_frames.js)
    looked() { pruneTargets(); return looked; },
    hovered(px, py) {
      const h = hero();
      if (!h || drag) return null;
      return unitAt(px, py, Object.values(game.state.entities)
        .filter(e => !e.dead && e.place === commandPlace() && seen(e)))?.id || null;
    },
    drawMarkers(root) {
      pruneTargets();
      const list = targetMarkers(game.state, heroId, tabbed, seen, commandPlace());
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
    selectAll() {
      if(!game.state.deployment?.restrictionsEnabled){setSelected(Object.keys(game.state.entities).filter(groupable));return;}
      setSelected(Object.values(game.state.entities).filter(e=>groupable(e.id)&&!e.downed&&!e.jailed&&!e.deployment?.transfer&&['hero','rally'].includes(commandGroup(e))).map(e=>e.id));
    },
    selectUnit,
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
      if (ids?.length) { setSelected(ids, true); building = null; }
    },
    groupOf(id) { pruneGroups(); return [...groups].find(([, ids]) => ids.includes(id))?.[0] || null; },
    clear() {
      const units=selected.filter(id=>game.state.deployment?.clans[hero()?.owner]?.sectors[game.state.entities[id]?.deployment?.group]);
      if(units.length)send({id:heroId,type:'deployment',action:'return',units,selectionChange:true});
      setSelected([]); looked = null; tabbed=null; building = null; attackMove = false; document.body.style.cursor = '';
    },
    returnToDutyAndSelectHero(ids = mine()) {
      const S = game.state.entities, owner = hero()?.owner, sectors = game.state.deployment?.clans[owner]?.sectors || {};
      const units = [...new Set(ids)].filter(id => {
        const e = S[id];
        return e?.owner === owner && sectors[e.deployment?.group] && !e.deployment.transfer && !e.dead && !e.downed && !e.jailed;
      });
      if (units.length) send({ id: heroId, type: 'deployment', action: 'return', units });
      const heroCrew = Object.values(S).filter(e => e.owner === owner && groupable(e.id) && e.deployment?.group === 'hero'
        && !e.deployment.transfer && !e.downed && !e.jailed).map(e => e.id);
      setSelected(heroCrew, true, units);
      looked = null; building = null; attackMove = false; document.body.style.cursor = '';
    },
    cancelAction() { send({ id: heroId, type: 'cancel', units: mine() }); },
    armAttackMove() { if (mine().length) { attackMove = true; document.body.style.cursor = 'crosshair'; } },
    // Z: selected crew stop and go passive until their next order (sim 'order' kind 'stop')
    stopSelected() { if (mine().length) order({ units: mine(), kind: 'stop' }); },
    followMe() { const units = mine().filter(id => ['street', hero()?.place].includes(game.state.entities[id]?.place)); if (units.length) order({ units, kind: 'follow' }); },
    // hurt selected crew walk to the clinic to heal (for ryo)
    healSelected() { if (mine().length) order({ units: mine(), kind: 'heal' }); },
    select(ids, options = {}) { setSelected(ids, !!options.returnPrevious); building = null; },
    selected: () => selected,
    building: () => building,
    // drop units that are gone (killed, or carried to the clinic) from the selection; downed
    // ones stay so the selection panel can show them (the rules ignore orders to them), and so do
    // jailed crew picked on the action bar (prisoner ids, only shown, never sent orders)
    update() { pruneGroups(); if (!outdoors()) building = null; const alive = selected.filter(id => game.state.entities[id] ? !game.state.entities[id].dead : !!prisonerOf(game.state, id)); if (alive.length !== selected.length) setSelected(alive); },
  };
}
