// Warships and transports as RTS units (ships plan S2, Tim 2026-11-22). A ship is a war troop (war.units warship or
// transport: e.warTroop, e.warUnit, troop places by slots) with e.ship = true, sailing on the water grid
// (sim/frontier/water_nav.js: big water, inside its war circle). It takes the crew order kinds (move, station,
// attack-move; stop = Z holds it still and holds fire) through the normal 'order' command: order() takes the ships out
// of the list before the land units get it. A move to a spot on land is a landing: the ship sails to the water beside
// the nearest landable shore and everyone aboard steps off there, one every unload.secondsEach. Loading is the same in
// reverse: units sent to a ship at the shore walk over and step aboard one at a time, or the hero calls All aboard
// (Use beside his ship at the shore: a ring for unload.ringSeconds, then everyone of his in it goes aboard).
// Riders carry e.aboard = e.inShip = the ship's id; they sit inside (not drawn, cannot fight, not targets) and a hit on
// one goes to the hull (shelter, as the omnibus and the stockade). A ship at 0 health sinks: plain troops aboard are lost,
// the hero and crew wash ashore downed at the nearest landable shore (the S4 effects come later).
// Ship orders live on e.sorder = { kind: 'stay' | 'move' | 'attackmove' | 'land' | 'unload', pts, x, z, land, berth }.
// Commands: { id: <hero>, type: 'ship', action: 'board', ship, units } | { action: 'unload', ships } | { action: 'call' }
// S4: hits on the hull count by the attacker's kind (war.ships.hullDamage: arrows, rifles, melee, Gatling almost nothing;
// siege guns, cannon towers and ship cannons the damage); ships fire their guns on their own (guns below); a sinking
// is news ('shipSunk') for the alert.
// createShips({ state, data, types, world, war, navOf, followOffset, forget, dismount, say, down, structures, hit })
//   -> { isShip, of, riders, order, command, use, prompt, spawn, tick, shelter, holdOf, sink }
import { steer } from '../vehicle_steer.js';
import { waterGrid, sailable, landingFor, shipPath, nearestSailable } from './water_nav.js';
import { yardBerth } from './shipyard.js';
import { cellToWorld } from './town_grid.js';
import { dirIndex } from '../geometry.js';

export function createShips({ state, data, types, world, war, navOf, followOffset, forget, dismount, say, down, structures = () => null, hit = null }) {
  const S = () => data?.war?.ships || {}, U = () => data?.war?.units || {};
  const grid = () => waterGrid(world);
  const isShip = e => !!e?.ship && !e.dead;
  const kindOf = e => S().kinds?.[e?.warUnit] || {};
  const holdOf = e => kindOf(e).hold ?? 0;
  const waterOf = e => kindOf(e).water || 'big';
  const of = u => (u?.inShip && isShip(state.entities[u.inShip])) ? state.entities[u.inShip] : null;
  const riders = s => Object.values(state.entities).filter(u => u.inShip === s.id && !u.dead);
  const loading = s => (s.loadQueue || []).filter(id => state.entities[id]?.boardShip === s.id);
  const coming = s => Object.values(state.entities).filter(u => u.boardShip === s.id && !u.dead).length;
  const room = s => holdOf(s) - riders(s).length - coming(s);
  const each = () => Object.values(state.entities).filter(isShip);
  const unloadTicks = () => Math.max(1, Math.round((S().unload?.secondsEach ?? 1) * 20));
  const radiusOf = s => types?.[s.type]?.radius ?? 4;
  // the war circle a ship stays in (plan 1.2), a little inside its edge
  function boxOf(s) {
    const w = s.warTroop && war?.()?.byId?.(s.warTroop), t = w && state.frontier?.settlements?.[w.town];
    const r = data?.war?.circleRadius ?? 900;
    return t && Number.isFinite(t.x) ? { x: t.x, z: t.z, r: r - 10 } : w && Number.isFinite(w.x) ? { x: w.x, z: w.z, r: r - 10 } : null;
  }
  // may this unit go in a hold? (siege guns and horses never: plan 1.12; riders board on foot)
  function fits(u, owner) {
    const N = S().notAboard || {};
    if (!u || u.dead || u.downed || u.jailed || u.garrison || u.aboard || u.ship || u.owner !== owner || u.place !== 'world') return false;
    if (u.worker || u.guide || u.vehicle || u.railGang || u.type === 'settler' || (N.types || []).includes(u.type)) return false;
    if (u.warUnit && (N.groups || []).includes(U()[u.warUnit]?.group)) return false;
    return true;
  }

  // a war ship trained or placed (S3 trains them; the dev save and tests place them)
  function spawn(w, unit, x, z, owner) {
    const id = war().spawnTroop(w, unit, x, z, owner), s = state.entities[id];
    if (!s) return null;
    Object.assign(s, { ship: true, sorder: { kind: 'stay' }, heading: s.heading ?? 0 });
    s.hold = holdOf(s);   // places aboard, for the plate (render/ship_marks.js)
    delete s.order;
    return s;
  }

  // S3: a ship trained at a shipyard or slipway at x, z comes out on the water beside it; null while none is found
  function launch(w, unit, x, z, owner) {
    const at = world?.terrain ? yardBerth(world, x, z, S().launchReach ?? 80) : { x, z };
    if (!at) return null;
    const k = Object.values(state.entities).filter(s => isShip(s) && Math.hypot(s.x - at.x, s.z - at.z) < 10).length;   // a second one a little aside
    return spawn(w, unit, at.x + Math.cos(k * 2.4) * 9 * Math.sign(k), at.z + Math.sin(k * 2.4) * 9 * Math.sign(k), owner);
  }
  // S3 dock repair: the built yards of the ship's own side in its war: the camp's slipway, the town's shipyard
  const centre = (t, b) => { const pts = (b.cells?.length ? b.cells : [b.cell]).map(i => cellToWorld(t, i)); return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]; };
  function yardsOf(s) {
    const w = s.warTroop && war?.()?.byId?.(s.warTroop), B = data?.war?.buildings || {};
    if (!w) return [];
    if (s.owner === w.attacker) return (w.camp?.buildings || []).filter(b => b.type === 'slipway' && b.stage === 'built').map(b => ({ x: b.x, z: b.z, r: B.slipway?.radius ?? 12 }));
    const t = state.frontier?.settlements?.[w.town];
    if (!t?.grid || t.owner !== s.owner) return [];
    return (t.buildings || []).filter(b => b.type === 'shipyard' && b.stage === 'built').map(b => { const [x, z] = centre(t, b); return { x, z, r: B.shipyard?.radius ?? 12 }; });
  }
  // stopped within repair.dockReach of its own yard it mends to full in repair.fullSeconds, paused repair.pauseSeconds
  // after it is hit or fires (hitAt, firedAt: S4); nowhere else. s.mending is set while it mends (S6 draws it).
  function mend(s, every) {
    const R = S().repair || {}, now = state.tick ?? 0, k = s.sorder?.kind;
    const ok = s.hp != null && s.hp < s.maxHp && (k === 'stay' || k === 'unload') && now - Math.max(s.hitAt ?? -Infinity, s.firedAt ?? -Infinity) >= (R.pauseSeconds ?? 10) * 20
      && yardsOf(s).some(y => Math.hypot(y.x - s.x, y.z - s.z) <= y.r + radiusOf(s) + (R.dockReach ?? 20));
    if (!ok) { delete s.mending; return; }
    s.hp = Math.min(s.maxHp, Math.round((s.hp + s.maxHp * every / Math.max(1, (R.fullSeconds ?? 60) * 20)) * 100) / 100);
    s.mending = true;
  }

  // ---- orders ----
  // Takes the hero's ships out of an 'order' command and gives them their own; returns the command for the rest.
  function order(hero, c) {
    if (!Array.isArray(c?.units) || !c.units.length) return c;
    const list = c.units.map(id => state.entities[id]).filter(s => isShip(s) && s.owner === hero.owner);
    if (!list.length) return c;
    const ids = new Set(list.map(s => s.id));
    // several to one spot: a row across the way there, each its own room (as vehicles, Tim 2026-11-07)
    const cx = list.reduce((n, s) => n + s.x, 0) / list.length, cz = list.reduce((n, s) => n + s.z, 0) / list.length;
    list.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z) || (a.id < b.id ? -1 : 1));
    let ux = c.x - cx, uz = c.z - cz; const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L;
    list.forEach((s, k) => {
      const side = (k - (list.length - 1) / 2) * (radiusOf(s) * 2 + (S().spacing ?? 6));
      give(hero, s, c, Number.isFinite(c.x) ? { x: c.x - uz * side, z: c.z + ux * side } : null, list.length === 1);
    });
    return { ...c, units: c.units.filter(id => !ids.has(id)) };
  }
  function give(hero, s, c, at, alone) {
    if (c.kind === 'raze') c = { ...c, kind: c.fallback || 'move' };   // at war a right-click on the ground is a raze order: ships sail (their guns in S4)
    if (c.kind === 'stop') { s.sorder = { kind: 'stay' }; s.holdFire = true; delete s.loadQueue; return; }   // Z: hold still, hold fire
    if (c.kind === 'resume' || c.kind === 'follow') { delete s.holdFire; return; }
    if (!['move', 'station', 'attackmove'].includes(c.kind) || !at) return;
    delete s.holdFire;
    const g = grid(), water = waterOf(s), box = boxOf(s);
    if (sailable(g, at.x, at.z, water)) {
      const pts = shipPath(g, [s.x, s.z], [at.x, at.z], { water, box });
      if (!pts) { if (alone) say(hero.owner, 'No way there by water'); return; }
      s.sorder = { kind: c.kind === 'attackmove' ? 'attackmove' : 'move', x: at.x, z: at.z, pts: pts.slice(1) };
      return;
    }
    // a spot on land: land at the shore nearest it (a click on cliff or mountain coast goes to the nearest landable shore)
    const L = landingFor(g, at.x, at.z, water, { box, maxR: S().landReach ?? (data?.war?.circleRadius ?? 900) * 2 });   // any distance in the circle (plan 1.5)
    if (!L?.berth) { if (alone) say(hero.owner, 'No landable shore near there'); return; }
    const pts = shipPath(g, [s.x, s.z], [L.berth.x, L.berth.z], { water, box });
    if (!pts) { if (alone) say(hero.owner, 'No way there by water'); return; }
    s.sorder = { kind: 'land', x: L.berth.x, z: L.berth.z, land: L.land, pts: pts.slice(1), blocked: L.blocked };
  }

  // ---- loading and unloading ----
  // the shore a ship at rest lies at: its landing spot, or null when it is out on the water
  function shoreOf(s) {
    if (!['stay', 'unload'].includes(s.sorder?.kind || 'stay')) return null;
    const L = landingFor(grid(), s.x, s.z, waterOf(s), { maxR: radiusOf(s) + (S().unload?.reach ?? 6) + 20 });
    return L && Math.hypot(L.land.x - s.x, L.land.z - s.z) <= radiusOf(s) + (S().unload?.reach ?? 6) + 20 ? L.land : null;
  }
  function seat(u, s) {
    if (u.mounted) dismount?.(u);   // the horse stays ashore
    delete u.order; delete u.attackTarget; delete u.swing; delete u.execute; delete u.boardShip; forget?.(u.id);
    Object.assign(u, { aboard: s.id, inShip: s.id, x: s.x, z: s.z, place: 'world', anim: 'idle' });
  }
  function stepOff(u, s, k, land) {
    const [ox, oz] = followOffset?.(k % 36) || [0, 0], n = navOf?.('world');
    const [x, z] = n?.nearestFree?.(land.x + ox * 0.9, land.z + oz * 0.9) || [land.x, land.z];
    delete u.aboard; delete u.inShip;
    Object.assign(u, { x, z, anim: 'idle' }); forget?.(u.id);
    if (u.type !== 'hero') u.order = { kind: 'move', x, z };
  }
  // units sent to the ship: they walk to its shore and step aboard there, one at a time
  function board(hero, c) {
    const s = state.entities[c.ship];
    if (!isShip(s) || s.owner !== hero.owner) return false;
    const land = shoreOf(s);
    if (!land) return say(hero.owner, 'The ship must lie still at the shore to take anyone aboard'), false;
    let free = room(s), sent = 0;
    const able = (c.units || []).map(id => state.entities[id]).filter(u => fits(u, hero.owner) && u.boardShip !== s.id)
      .sort((a, b) => Math.hypot(a.x - land.x, a.z - land.z) - Math.hypot(b.x - land.x, b.z - land.z));
    for (const u of able) {
      if (free <= 0) break;
      if (u.type === 'hero' && Math.hypot(u.x - land.x, u.z - land.z) > (S().unload?.ringRadius ?? 20)) { say(hero.owner, 'Walk to the shore by the ship to board it'); continue; }
      u.boardShip = s.id; free--; sent++;
      if (u.type !== 'hero') { if (u.mounted) dismount?.(u); u.order = { kind: 'move', x: land.x, z: land.z }; forget?.(u.id); }
    }
    if (free <= 0 && able.length > sent) say(hero.owner, `Room for ${sent} more aboard`);
    return sent > 0;
  }
  function unload(hero, ids) {
    let any = false;
    for (const s of (ids || []).map(id => state.entities[id]).filter(s => isShip(s) && s.owner === hero.owner)) {
      const land = shoreOf(s);
      if (!land) { say(hero.owner, 'Sail to the shore first: right-click the shore'); continue; }
      if (!riders(s).length) continue;
      s.sorder = { kind: 'unload', land, next: state.tick ?? 0 }; any = true;
    }
    return any;
  }
  // the hero's own ship at the shore within the ring of him, the nearest
  function shipBy(hero) {
    let best = null, bd = Infinity;
    for (const s of each()) {
      if (s.owner !== hero.owner) continue;
      const land = shoreOf(s); if (!land) continue;
      const d = Math.hypot(land.x - hero.x, land.z - hero.z); if (d <= (S().unload?.ringRadius ?? 20) && d < bd) { bd = d; best = s; }
    }
    return best;
  }
  // All aboard (Use beside your ship at the shore, as the trains and the ferry): a ring round the landing spot
  function call(hero) {
    if (hero.shipBoard) return allAboard(hero);
    const s = shipBy(hero); if (!s) return false;
    const land = shoreOf(s), ticks = Math.max(1, Math.round((S().unload?.ringSeconds ?? 10) * 20));
    hero.shipBoard = { ship: s.id, x: land.x, z: land.z, place: 'world', r: S().unload?.ringRadius ?? 20, until: (state.tick ?? 0) + ticks, ticks };
    say(hero.owner, `All aboard the ${(types?.[s.type]?.name || 'ship').toLowerCase()}! Get your men into the ring (Space boards now)`);
    return true;
  }
  const inRing = (hero, c = hero.shipBoard) => !c ? [] : Object.values(state.entities).filter(u => u !== hero && fits(u, hero.owner) && !u.boardShip && Math.hypot(u.x - c.x, u.z - c.z) <= c.r)
    .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z) || (a.id < b.id ? -1 : 1));
  function allAboard(hero) {
    const c = hero.shipBoard; delete hero.shipBoard;
    const s = c && state.entities[c.ship];
    if (!isShip(s) || !shoreOf(s)) return say(hero.owner, 'Boarding called off: the ship left the shore'), true;
    const group = [...(fits(hero, hero.owner) && Math.hypot(hero.x - c.x, hero.z - c.z) <= c.r ? [hero] : []), ...inRing(hero, c)];
    let free = room(s), n = 0;
    for (const u of group) { if (free-- <= 0) break; u.boardShip = s.id; (s.loadQueue ||= []).push(u.id); if (u.type !== 'hero') { u.order = { kind: 'stop' }; forget?.(u.id); } n++; }
    say(hero.owner, n ? `${n} going aboard${group.length > n ? ` (${group.length - n} could not fit)` : ''}` : 'Nobody in the ring');
    return true;
  }
  // Use (Space): aboard at the shore = everyone steps off; beside your ship at the shore = All aboard. true when used
  function use(hero) {
    const s = of(hero);
    if (s) { if (!unload(hero, [s.id])) say(hero.owner, 'Sail to the shore first: right-click the shore'); return true; }
    return call(hero);
  }
  function command(hero, c) {
    if (c.action === 'board') return board(hero, c);
    if (c.action === 'unload') return unload(hero, c.ships);
    if (c.action === 'call') return call(hero);
    return false;
  }
  // for the Use prompt (main.js)
  function prompt(hero) {
    const s = of(hero);
    if (s) return { text: shoreOf(s) ? 'Space  Step off here with everyone aboard' : `Aboard the ${(types?.[s.type]?.name || 'ship').toLowerCase()}: right-click the shore to land` };
    if (hero.shipBoard) return { calling: true, text: `Space  All aboard now: ${inRing(hero).length} in the ring, boarding in ${Math.max(0, Math.ceil((hero.shipBoard.until - (state.tick ?? 0)) / 20))} s` };
    const b = shipBy(hero);
    return b ? { text: `Space  All aboard the ${(types?.[b.type]?.name || 'ship').toLowerCase()}` } : null;
  }

  // ---- sailing ----
  function speedOf(s) {
    const base = types?.[s.type]?.walk ?? 5, slow = S().slow || {};
    return base * ((s.hp ?? 1) < (s.maxHp ?? 1) * (slow.below ?? 0.5) ? slow.factor ?? 0.5 : 1);
  }
  function sail(s, dt) {
    const o = s.sorder, g = grid(), water = waterOf(s);
    if (!o?.pts?.length) { s.anim = 'idle'; return; }
    const [tx, tz] = o.pts[0], dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz), last = o.pts.length === 1;
    if (d <= (last ? 0.6 : Math.min(8, radiusOf(s) * 1.5))) { o.pts.shift(); if (!o.pts.length) arrive(s); return; }
    const r = steer(s, Math.atan2(dx, dz), { turnDegrees: kindOf(s).turnDegrees ?? 90, turnSlow: 0.5 }, dt);
    const ease = last ? Math.min(1, 0.25 + d / (radiusOf(s) * 2)) : 1, step = Math.min(d, speedOf(s) * dt * r.slow * ease);
    let nx = s.x + r.hx * step, nz = s.z + r.hz * step;
    // the swing of the turn would touch land: straight at the way point instead (narrow rivers)
    if (!sailable(g, nx, nz, water)) { nx = s.x + dx / d * step; nz = s.z + dz / d * step; }
    // still not open water: a river's steps meet corner to corner (water_nav), passed within half a cell of the water;
    // anything else (a bank swung into): look for the way again, at most once a second, and wait
    const h = g.cell / 2, nearWater = [[0, 0], [h, 0], [-h, 0], [0, h], [0, -h]].some(([a, b]) => sailable(g, nx + a, nz + b, water));
    if (!sailable(g, nx, nz, water) && !nearWater) {
      if ((state.tick ?? 0) - (o.replanned ?? -99) >= 20) { o.replanned = state.tick ?? 0; const pts = shipPath(g, [s.x, s.z], [o.x, o.z], { water, box: boxOf(s) }); if (pts) o.pts = pts.slice(1); else { s.sorder = { kind: 'stay' }; } }
      s.anim = 'idle'; return;
    }
    s.x = nx; s.z = nz; s.anim = 'walk';
  }
  function arrive(s) {
    const o = s.sorder;
    s.anim = 'idle';
    if (o.kind === 'land') { s.sorder = { kind: 'unload', land: o.land, next: state.tick ?? 0 }; if (!riders(s).length) s.sorder = { kind: 'stay' }; return; }
    s.sorder = { kind: 'stay' };
  }
  function unloadStep(s) {
    const o = s.sorder, now = state.tick ?? 0;
    if (now < (o.next ?? now)) return;
    const list = riders(s).filter(u => !s.leave || !u.warTroop).sort((a, b) => (a.type === 'hero' ? -1 : 0) - (b.type === 'hero' ? -1 : 0) || (a.id < b.id ? -1 : 1));   // S7: a leaving ship keeps its troops
    if (!list.length) { s.sorder = { kind: 'stay' }; return; }
    o.k = (o.k ?? 0) + 1;
    stepOff(list[0], s, o.k, o.land);
    state.casts?.push({ kind: 'shipStep', a: s.id, t: list[0].id, x: o.land.x, z: o.land.z, place: 'world', off: true });
    o.next = now + unloadTicks();
    if (list.length === 1) s.sorder = { kind: 'stay' };
  }
  function loadStep(s) {
    const now = state.tick ?? 0;
    // walkers that reached the shore by the ship join the queue
    const reach = radiusOf(s) + (S().unload?.reach ?? 6) + 20, land = shoreOf(s);
    for (const u of Object.values(state.entities)) {
      if (u.boardShip !== s.id) continue;
      if (u.dead || u.downed || u.jailed || !fits({ ...u, aboard: null }, s.owner) || !land || riders(s).length >= holdOf(s)) { delete u.boardShip; s.loadQueue = (s.loadQueue || []).filter(id => id !== u.id); continue; }
      if (!(s.loadQueue || []).includes(u.id) && Math.hypot(u.x - land.x, u.z - land.z) <= Math.min(reach, 12)) { (s.loadQueue ||= []).push(u.id); if (u.type !== 'hero') u.order = { kind: 'stop' }; }
    }
    const q = loading(s); s.loadQueue = q;
    if (!q.length || !land || now < (s.loadNext ?? 0)) { if (!q.length) delete s.loadQueue; return; }
    const u = state.entities[q.shift()];
    if (u && riders(s).length < holdOf(s)) { seat(u, s); state.casts?.push({ kind: 'shipStep', a: s.id, t: u.id, x: land.x, z: land.z, place: 'world', off: false }); }
    s.loadNext = now + unloadTicks();
  }

  // ---- hull ----
  // a hit on a ship or on someone aboard: the hull takes it (true when absorbed), times war.ships.hullDamage for the
  // attacker's kind (S4); with no attacker given (tests, scripted damage) in full
  function shelter(u, damage, a = null) {
    const s = u?.ship ? u : of(u); if (!s) return false;
    if (s.dead) return true;
    const k = a ? hullKind(a) : null, n = Math.max(0, (damage || 0) * (k ? S().hullDamage?.[k] ?? 1 : 1));
    s.hp = Math.max(0, Math.round(((s.hp ?? 0) - n) * 100) / 100); s.hitAt = state.tick ?? 0;
    if (a && n > 0) state.hits?.push({ a: a.id, t: s.id, damage: Math.round(n * 10) / 10, crit: false, kill: s.hp <= 0, x: s.x, z: s.z, dir: a.dir ?? 0, weapon: a.model, kind: 'hull' });
    if (s.hp <= 0) sink(s, a);
    return true;
  }

  // ---- S4 guns (frontier.json war.ships.guns, kinds[].guns) ----
  // Cannons (broadside, bowCannon) fire on their own at the nearest target in range of their war's enemy, ships first,
  // then siege guns, then buildings: balls x ballDamage per volley every reloadTicks; the balls fly at speed and land
  // as frontier.shipShots (a ship takes it times hullDamage.siege, a siege gun unitShare of it, a building the siege
  // factor of war.structures.damage). The deck Gatling (warship) fires as the land Gatling crew (units.json from.gatling:
  // spin up, burst, cone) at enemy troops in range. Z (holdFire), a ceasefire or no war: no fire. Firing sets s.firedAt.
  const GUN = () => S().guns || {};
  const warOf = s => (s?.warTroop && war?.()?.byId?.(s.warTroop)) || null;
  const foeOf = s => { const w = warOf(s); return !w || w.terms || w.state === 'ended' ? null : s.owner === w.attacker ? w.defender : s.owner === w.defender ? w.attacker : null; };
  const alive = t => t && !t.dead && !t.downed && !t.jailed && !t.garrison && !t.aboard && t.place === 'world';
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  const isSiege = t => !!types?.[t?.type]?.siege;
  // where the balls of a volley land round the aim point: [across, along] the line of fire (the first and last stray: splashes)
  const SPREAD = [[-0.8, -10], [2.4, -0.8], [-1.6, 0.3], [0.6, -0.2], [-2.6, 0.6], [1.5, 1], [-0.4, 1.5], [1.2, 7.4]];
  // what a gun of s may hit within range: { t: entity } or { st: structure }, nearest of the first kind on the list
  function aim(s, g, foe) {
    const R = g.range ?? 30, list = g.targets || [], ents = Object.values(state.entities);
    const best = test => { let b = null, bd = Infinity; for (const t of ents) { if (t.owner !== foe || !alive(t) || !test(t)) continue; const d = Math.sqrt(dist2(s, t)) - (types?.[t.type]?.radius ?? 0.5); if (d <= R && (d < bd || (d === bd && t.id < b.id))) { b = t; bd = d; } } return b; };
    if (list.includes('ship')) { const t = best(isShip); if (t) return { t }; }
    if (list.includes('siege')) { const t = best(t => !t.ship && isSiege(t)); if (t) return { t }; }
    if (list.includes('building')) { const st = structures?.()?.near?.(s.owner, s.x, s.z, R); if (st) return { st }; }
    return null;
  }
  function cannons(s, now) {
    const foe = foeOf(s);
    if (!foe || s.holdFire) return;
    for (const key of kindOf(s).guns || []) {
      const g = GUN()[key];
      if (!g || g.from || now < (s.gunAt?.[key] ?? 0) || (now + key.length) % 5) continue;   // look for a target every 5 ticks
      const a = aim(s, g, foe); if (!a) continue;
      const tg = a.t || a.st, d = Math.sqrt(dist2(s, tg)), flight = Math.max(2, Math.ceil(d / (g.speed ?? 52) * 20));
      (state.frontier.shipShots ||= []).push({ a: s.id, by: s.owner, unit: s.warUnit, ...(a.t ? { t: a.t.id } : { key: a.st.key }), damage: (g.balls ?? 1) * (g.ballDamage ?? 0), unitShare: g.unitShare ?? 0.5, at: now + flight });
      (s.gunAt ||= {})[key] = now + (g.reloadTicks ?? 300); s.firedAt = now;
      const n = g.balls ?? 1, spread = n > 1 ? SPREAD.slice(0, n) : [[0, 0]], hitR = a.t ? types?.[a.t.type]?.radius ?? 1 : a.st.r ?? 3;
      state.casts?.push({ kind: key === 'broadside' ? 'shipBroadside' : 'shipCannon', gun: key, a: s.id, t: a.t?.id ?? null, key: a.st?.key ?? null, x: s.x, z: s.z, tx: tg.x, tz: tg.z, heading: s.heading ?? 0, balls: n, spread, hitR, flightTicks: flight, place: 'world' });
      { const dx = tg.x - s.x, dz = tg.z - s.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;   // the balls in flight (drawing only: an 'a' that is no unit never hits, combat.js)
        spread.forEach(([p, q], k) => (state.projectiles ||= []).push({ kind: 'cannonball', a: `ship:${s.id}:${k}`, t: null, tower: true, ship: true, x: s.x, z: s.z, tx: tg.x - uz * p + ux * q, tz: tg.z + ux * p + uz * q, place: 'world', at: now, until: now + flight + k, damage: 0 })); }
      if (key === 'broadside') s.broadAt = now;
    }
  }
  function shotsLand(now) {
    const list = state.frontier?.shipShots; if (!list?.length) return;
    const due = list.filter(o => o.at <= now); if (!due.length) return;
    state.frontier.shipShots = list.filter(o => o.at > now); if (!state.frontier.shipShots.length) delete state.frontier.shipShots;
    for (const o of due) {
      const src = state.entities[o.a], by = { id: `ship:${o.a}`, type: types?.[src?.type] ? src.type : 'warship', owner: o.by, x: src?.x ?? 0, z: src?.z ?? 0, place: 'world', dir: src?.dir ?? 0, model: src?.model || 'ship_war', shipGun: true };
      if (o.key) { const st = structures?.()?.find?.(o.key); if (st && structures().damage(o.by, st, o.damage, 'siege')) (state.structureHits ||= []).push({ a: by.id, key: st.key, x: st.x, z: st.z, kind: 'siege', ship: true }); continue; }
      const t = state.entities[o.t]; if (!t || t.dead || t.downed || t.place !== 'world') continue;
      if (t.ship) shelter(t, o.damage, by);
      else if (!t.aboard && !t.garrison) hit?.(by, t, Math.round(o.damage * o.unitShare), false, 'cannon');
    }
  }
  function deckGun(s, now) {
    if (!(kindOf(s).guns || []).includes('deckGatling')) return;
    const g = GUN().deckGatling || {}, R = types?.[g.from]?.gatling; if (!R) return;
    const foe = foeOf(s), stop = () => { if (s.gat?.firing != null) state.casts?.push({ kind: 'gatlingStop', a: s.id, x: s.x, z: s.z, place: 'world', deck: true }); delete s.gat; };
    if (!foe || s.holdFire) { stop(); return; }
    const range = g.range ?? R.range ?? 13, min = R.minRange ?? 0;
    const foes = () => Object.values(state.entities).filter(t => t.owner === foe && alive(t) && !t.ship && t.type !== 'horse' && t.type !== 'civilian' && dist2(s, t) <= range * range && dist2(s, t) >= min * min);
    if (!s.gat) {
      if ((now + 2) % 5) return;
      const l = foes(); if (!l.length) return;
      const n = l.reduce((b, t) => !b || dist2(s, t) < dist2(s, b) || (dist2(s, t) === dist2(s, b) && t.id < b.id) ? t : b, null);
      s.gat = { state: 'spin', until: now + (R.spinTicks ?? 20), ang: Math.atan2(n.z - s.z, n.x - s.x) }; return;
    }
    const G = s.gat;
    if (G.state === 'spin') { if (now < G.until) return; Object.assign(G, { state: 'fire', firing: now, end: now + (R.burstTicks ?? 100) }); }
    if (now >= G.end) { stop(); return; }
    const k = now - G.firing, every = R.everyTicks ?? 4;
    if (k % 2 && k % every) return;
    const l = foes(); if (!l.length) { stop(); return; }
    if (k % (R.turnTicks ?? 10) === 0) { const n = l.reduce((b, t) => !b || dist2(s, t) < dist2(s, b) ? t : b, null); G.ang = Math.atan2(n.z - s.z, n.x - s.x); }
    const half = (R.coneDeg ?? 30) * Math.PI / 360, cx = Math.cos(G.ang), cz = Math.sin(G.ang);
    const cone = l.filter(t => { const d = Math.sqrt(dist2(s, t)) || 1; return ((t.x - s.x) * cx + (t.z - s.z) * cz) / d >= Math.cos(half); });
    if (!cone.length) return;
    if (k % 2 === 0) state.casts?.push({ kind: 'gatlingShot', a: s.id, x: s.x, z: s.z, place: 'world', dir: dirIndex(Math.cos(G.ang), Math.sin(G.ang)), deck: true, ang: G.ang, heading: s.heading ?? 0, reach: Math.sqrt(Math.min(...cone.map(t => dist2(s, t)))) });
    if (k % every === 0) {
      const dmg = Math.round((R.damage ?? 0) * (g.damageMul ?? 1));
      for (const t of cone) hit?.(s, t, dmg, false, 'bullet');
      s.firedAt = now;
    }
  }
  // the kind of hit a hull takes from an attacker (war.ships.hullDamage): ship and siege guns are siege
  function hullKind(a) {
    if (a?.shipGun || a?.ship || a?.siegeTower) return 'siege';
    const u = types?.[a?.type];
    return u?.gatling ? 'gatling' : u?.siege ? 'siege' : u?.projectile?.bomb ? 'bomb' : u?.projectile ? 'ranged' : 'melee';
  }
  // plan 1.6: plain troops aboard drown; the hero and crew wash ashore downed at the nearest landable shore in the circle
  function sink(s, by = null) {
    const g = grid(), box = boxOf(s), L = landingFor(g, s.x, s.z, waterOf(s), { box, maxR: (data?.war?.circleRadius ?? 900) * 2 });
    const list = riders(s);
    list.forEach((u, k) => {
      delete u.aboard; delete u.inShip; delete u.boardShip;
      if (u.warTroop) { Object.assign(u, { dead: true, diedAt: state.tick ?? 0, hp: 0, anim: 'death' }); return; }
      const [ox, oz] = followOffset?.(k % 36) || [0, 0], n = navOf?.('world'), at = L?.land || { x: s.x, z: s.z };
      const [x, z] = n?.nearestFree?.(at.x + ox * 0.9, at.z + oz * 0.9) || [at.x, at.z];
      Object.assign(u, { x, z, hp: 0 }); forget?.(u.id); down?.(u);
    });
    for (const u of Object.values(state.entities)) if (u.boardShip === s.id) delete u.boardShip;
    state.casts?.push({ kind: 'shipSunk', a: s.id, x: s.x, z: s.z, place: 'world', ashore: L?.land || null, owner: s.owner, hero: list.some(u => u.type === 'hero') });
    // S4: news for the alert (src/news_callouts.js): the owner's camera follows his hero ashore when he was aboard, else an alert and a ping
    state.news?.push({ kind: 'shipSunk', clan: s.owner, by: by?.owner ?? null, unit: s.warUnit, x: s.x, z: s.z, ashore: L?.land || null, hero: list.some(u => u.type === 'hero'), lost: list.filter(u => u.warTroop).length });
    Object.assign(s, { dead: true, diedAt: state.tick ?? 0, hp: 0, anim: 'idle', sorder: { kind: 'stay' } });
    delete s.loadQueue;
  }

  // ---- S7 war end (plan 1.9): when a war ends (war_end.js rout calls leave before the war record goes), each ship of
  // that war (of one clan when only it gives up) with the hero or crew aboard first sails to its landing and puts only
  // them off: the defender at its town's harbour (a river town: the shore nearest the hall), the attacker at the shore by
  // its slipway, else the shore nearest its camp hall. Then it sails away from the town, fades over war.rout.seconds
  // and leaves the map (war_end.js removes routed units); troops in the hold go with it. s.leave = { from, landBy, off }.
  function leave(w, clan = null) {
    const now = state.tick ?? 0, t = state.frontier?.settlements?.[w.town], from = { x: t?.x ?? w.x ?? 0, z: t?.z ?? w.z ?? 0 }, g = grid();
    for (const s of Object.values(state.entities)) {
      if (!s.ship || s.dead || s.leave || s.warTroop !== w.id || (clan != null && s.owner !== clan)) continue;
      delete s.loadQueue; s.holdFire = true; delete s.gat;
      s.leave = { from, landBy: now + Math.round((S().leaveLandSeconds ?? 90) * 20) };
      if (!riders(s).some(u => !u.warTroop)) { goOff(s); continue; }
      delete s.rout;   // not fading yet: it lands its people first
      const camp = w.camp, slip = camp?.buildings?.find(b => b.type === 'slipway' && b.stage === 'built'), hall = camp?.buildings?.find(b => b.type === 'camp_hall');
      const harbour = world?.sites?.find(x => x.id === t?.site)?.harbor;
      const p = s.owner === w.defender ? harbour ? { x: harbour.x ?? harbour[0], z: harbour.z ?? harbour[1] } : from : slip || hall || from;
      const water = waterOf(s), L = landingFor(g, p.x, p.z, water, { maxR: 2000 });
      const pts = L?.berth && shipPath(g, [s.x, s.z], [L.berth.x, L.berth.z], { water });
      if (!pts) { goOff(s); continue; }
      s.sorder = { kind: 'land', x: L.berth.x, z: L.berth.z, land: L.land, pts: pts.slice(1), blocked: L.blocked };
    }
  }
  // sail away from the town and fade (war_end.js removes it when its rout runs out; anyone still aboard is set ashore)
  function goOff(s) {
    const now = state.tick ?? 0, R = data?.war?.rout || {}, g = grid(), water = waterOf(s), f = s.leave?.from || { x: s.x, z: s.z };
    s.leave = { ...(s.leave || {}), off: true };
    s.rout = { start: now, until: now + Math.round((R.seconds ?? 6) * 20), x: s.x, z: s.z };
    const d = Math.hypot(s.x - f.x, s.z - f.z) || 1, run = R.run ?? 70;
    const to = nearestSailable(g, s.x + (s.x - f.x) / d * run, s.z + (s.z - f.z) / d * run, water, 60);
    const pts = to && shipPath(g, [s.x, s.z], [to.x, to.z], { water });
    s.sorder = pts ? { kind: 'move', x: to.x, z: to.z, pts: pts.slice(1) } : { kind: 'stay' };
  }
  // a leaving ship: once its hero and crew are off (or it waited too long), away it goes
  function leaving(s) {
    const L = s.leave;
    if (!L || L.off) return;
    const keep = riders(s).some(u => !u.warTroop), k = s.sorder?.kind;
    if (!keep || (state.tick ?? 0) >= L.landBy || (k !== 'land' && k !== 'unload')) goOff(s);
  }

  function strand(u) {
    const L = landingFor(grid(), u.x, u.z, 'big', { maxR: 2000 }), at = L?.land || { x: u.x, z: u.z }, n = navOf?.('world');
    const [x, z] = n?.nearestFree?.(at.x, at.z) || [at.x, at.z];
    delete u.aboard; delete u.inShip; delete u.boardShip;
    Object.assign(u, { x, z, anim: 'idle' }); forget?.(u.id);
    if (u.type !== 'hero') u.order = { kind: 'move', x, z };
  }
  function tick(dt = 1 / 20) {
    const now = state.tick ?? 0;
    for (const u of Object.values(state.entities)) {   // All aboard calls that ran out
      if (u.shipBoard && (u.dead || u.downed || u.jailed || u.aboard)) delete u.shipBoard;
      else if (u.shipBoard && now >= u.shipBoard.until) allAboard(u);
      // a rider whose ship is gone without sinking (a war that ended took it: S7 lands them first): set ashore
      if (u.inShip && !state.entities[u.inShip]) strand(u);
    }
    shotsLand(now);   // S4: cannon balls in flight land
    for (const s of Object.values(state.entities)) {
      if (!s.ship) continue;
      if (s.dead) { if (riders(s).length) sink(s); continue; }
      if ((s.hp ?? 1) <= 0) { sink(s); continue; }
      s.sorder ||= { kind: 'stay' };
      if (s.order) delete s.order;   // land orders never reach a ship (order() takes it out); a stray one is dropped
      const k = s.sorder.kind;
      if (k === 'move' || k === 'attackmove' || k === 'land') sail(s, dt);
      else if (k === 'unload') { s.anim = 'idle'; unloadStep(s); }
      else s.anim = 'idle';
      if (s.leave) leaving(s);   // S7: the war is over
      else if (s.sorder.kind === 'stay' || s.sorder.kind === 'unload') loadStep(s);
      if (now % 10 === 0) mend(s, 10);   // S3 dock repair, every half second
      if (!s.dead && s.hp > 0 && !s.leave) { cannons(s, now); deckGun(s, now); }   // S4 guns
      if (s.anim === 'idle' && now - (s.broadAt ?? -1e9) < 30) s.anim = 'attack';   // lying still after a volley: the broadside clip
      for (const u of riders(s)) {   // riders sit inside
        if (u.jailed) { delete u.aboard; delete u.inShip; continue; }
        Object.assign(u, { x: s.x, z: s.z, place: 'world', anim: 'idle' });
        delete u.order; delete u.attackTarget; delete u.swing; forget?.(u.id);
      }
    }
  }

  return { isShip, of, riders, order, command, use, prompt, spawn, launch, yardsOf, tick, shelter, sink, holdOf, room, boxOf, shoreOf, leave, get world() { return world; } };
}
