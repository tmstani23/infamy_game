// Boarding, the one ship special (ships plan S8, 1.7 and 1.12; numbers in frontier.json war.ships.boarding).
// Select warships, Board (Shift + the first ability key), click an enemy ship: the nearest selected warship with troops
// aboard sails alongside it (special_cast.js castReq). Within reach it grapples for grappleSeconds; if the target gets
// out of reach the attempt fails. Then the holds fight: both ships (and any that join) stop moving and firing, and every
// second each side takes lossShare of its own strength off the other (strength = ryo cost in war.units; hero and crew as
// in the boarding block). Defenders on a ship under half health hit back at weakDefender. The loss carries over and the
// weakest fighter falls when it covers him: troops go overboard and drown, hero and crew wash ashore downed. A defending
// warship's deck Gatling cuts gatlingCut of each boarding party as it comes over. The side left with nobody loses: the
// boarders take the ship with the damage it has, or the defenders keep theirs. Both empty in the same second: the
// defender keeps the ship with its strongest. An empty hold is taken at once. A third ship joins from the free side, to
// either side of the fight. Only the boarders break off (Break off, after breakOffSeconds); that ship may not board again
// for cooldownSeconds. A war that ends or pauses stops the struggle where it stands.
// One fight per boarded ship: state.frontier.boardings[targetId] = { t, att, def, ships, slots, carry, next, view }.
// On a ship: s.board = { t, side, role 'a'|'d', until, grip?, fight?, offAt? } while it goes or fights; s.locked = the
// fight's key while locked in one; s.boardReadyAt after a break off. Rules only: no DOM, no randomness.
import { sailable, shipPath, nearestSailable } from './water_nav.js';

export function createBoarding({ state, data, grid, kindOf, radiusOf, waterOf, boxOf, foeOf, riders, wash, say }) {
  const B = () => data?.war?.ships?.boarding || {}, U = () => data?.war?.units || {};
  const T = s => Math.round(s * 20);
  const now = () => state.tick ?? 0;
  const ent = id => state.entities[id];
  const live = s => !!s && s.ship && !s.dead && (s.hp ?? 1) > 0;
  const fights = () => state.frontier?.boardings || {};
  const push = c => state.casts?.push({ place: 'world', ...c });
  const strength = u => u.type === 'hero' ? B().hero ?? 400 : u.warTroop ? U()[u.warUnit]?.ryo ?? 30 : B().crew ?? 200;
  const holdStrength = s => riders(s).reduce((n, u) => n + strength(u), 0);
  const weak = s => (s.hp ?? 1) < (s.maxHp ?? 1) * 0.5;
  const reach = (s, t) => radiusOf(s) + radiusOf(t) + (B().reach ?? 8);

  // the fight a ship is in (as the boarded ship or alongside), or null
  const fightOf = s => (s?.locked && fights()[s.locked]) || null;
  // the free side of t (1 or -1, the one nearer the ship s) or 0: taken by a ship in its fight or one on its way there
  function freeSide(t, s) {
    const F = fights()[t.id], taken = new Set();
    for (const [k, id] of Object.entries(F?.slots || {})) if (live(ent(id))) taken.add(+k);
    for (const o of Object.values(state.entities)) if (o !== s && live(o) && o.board?.t === t.id && !o.board.fight) taken.add(o.board.side);
    const sides = [1, -1].filter(k => !taken.has(k));
    if (!sides.length) return 0;
    const at = k => spot(t, s, k);
    return sides.sort((a, b) => Math.hypot(at(a).x - s.x, at(a).z - s.z) - Math.hypot(at(b).x - s.x, at(b).z - s.z))[0];
  }
  // where s lies alongside t on that side: across t's heading, hull to hull
  function spot(t, s, side) {
    const h = t.heading ?? 0, d = B().alongside ?? 5;   // hull to hull
    return { x: t.x + Math.cos(h) * side * d, z: t.z - Math.sin(h) * side * d };
  }

  // ---- the order: a Board cast asked on a ship (castReq with a spot) or a Break off (castReq without) ----
  function canBoard(s) {
    return live(s) && !!kindOf(s).board && !s.locked && !s.board && !s.leave && s.sorder?.kind !== 'unload' && now() >= (s.boardReadyAt ?? 0) && riders(s).length > 0;
  }
  function order(s, req) {
    if (!Number.isFinite(req.x)) return breakOff(s);
    if (!canBoard(s)) return false;
    const foe = foeOf(s);
    if (foe == null) return say(s.owner, 'No enemy to board'), false;
    let x = null, xd = Infinity;
    for (const o of Object.values(state.entities)) {
      if (!live(o) || o.owner !== foe || o.leave || o.rout) continue;
      const d = Math.hypot(o.x - req.x, o.z - req.z) - radiusOf(o);
      if (d <= 10 && (d < xd || (d === xd && o.id < x.id))) { x = o; xd = d; }
    }
    if (!x) return say(s.owner, 'Click an enemy ship to board it'), false;
    const F = fightOf(x), t = F ? ent(F.t) : x;
    if (!live(t)) return false;
    const side = freeSide(t, s);
    if (!side) return say(s.owner, 'No room alongside that ship'), false;
    s.board = { t: t.id, side, role: F && s.owner === F.def ? 'd' : 'a', until: now() + T(B().chaseSeconds ?? 45) };
    s.sorder = { kind: 'board', t: t.id, pts: [] };
    delete s.loadQueue;
    return true;
  }
  // only the boarders: before the fight it just stops; in the fight only after breakOffSeconds, then no boarding for a while
  function breakOff(s) {
    const b = s.board;
    if (!b || b.role === 'd') return false;
    if (b.fight == null) { delete s.board; s.sorder = { kind: 'stay' }; return true; }
    if (now() < (b.offAt ?? 0)) return false;
    const F = fights()[b.t];
    leaveFight(F, s);
    s.boardReadyAt = now() + T(B().cooldownSeconds ?? 15);
    push({ kind: 'boardBreak', a: s.id, t: b.t, x: s.x, z: s.z });
    say(s.owner, 'Broke off the boarding');
    if (F && !F.ships.some(id => live(ent(id)) && ent(id).owner === F.att)) end(F, 'off');
    return true;
  }
  function leaveFight(F, s) {
    delete s.locked; delete s.board; s.sorder = { kind: 'stay' };
    if (!F) return;
    F.ships = F.ships.filter(id => id !== s.id);
    for (const [k, id] of Object.entries(F.slots)) if (id === s.id) delete F.slots[k];
  }

  // ---- going alongside and the grapple ----
  function go(s) {
    const b = s.board, t = ent(b.t), at = now();
    const fail = text => { if (text) say(s.owner, text); push({ kind: 'boardFail', a: s.id, t: b.t, x: s.x, z: s.z }); delete s.board; s.sorder = { kind: 'stay' }; };
    if (!live(t) || (b.role === 'a' ? foeOf(s) !== t.owner : t.owner !== s.owner || !fights()[t.id])) return fail(null);
    if (b.role === 'a' && t.owner === s.owner) return fail(null);
    const near = Math.hypot(t.x - s.x, t.z - s.z) <= reach(s, t);
    if (b.grip != null) {
      if (!near) return fail('Grapple failed: the enemy ship got away');
      if (b.role === 'a' && t.owner !== s.owner && (kindOf(t).guns || []).includes('deckGatling') && riders(t).length && (at - b.grip) % 3 === 0)
        push({ kind: 'boardGatling', a: t.id, t: s.id, x: t.x, z: t.z, tx: s.x, tz: s.z, heading: t.heading ?? 0 });   // its deck Gatling sweeps the boarders
      if (at - b.grip >= T(B().grappleSeconds ?? 4)) join(s, t);
    } else if (near) {
      b.grip = at;
      push({ kind: 'boardGrapple', a: s.id, t: t.id, side: b.side, x: s.x, z: s.z });
    } else if (at >= b.until) return fail('The enemy ship got away');
    if (!s.board || s.board.fight != null) return;
    // sail for the spot alongside, a new way twice a second (the target may be moving)
    const o = s.sorder?.kind === 'board' ? s.sorder : (s.sorder = { kind: 'board', t: t.id, pts: [] });
    if (at - (o.planned ?? -99) < 10 && o.pts.length) return;
    o.planned = at;
    const g = grid(), p = spot(t, s, b.side), water = waterOf(s);
    const to = sailable(g, p.x, p.z, water) ? p : nearestSailable(g, p.x, p.z, water, 12);
    if (!to) { o.pts = []; return; }
    if (Math.hypot(to.x - s.x, to.z - s.z) < 1) { o.pts = []; return; }
    const pts = shipPath(g, [s.x, s.z], [to.x, to.z], { water, box: boxOf(s), maxNodes: 40000 });
    o.pts = pts ? pts.slice(1) : []; o.x = to.x; o.z = to.z;
  }

  // the grapple held: start the fight, or join the one on t; an empty hold is taken at once
  function join(s, t) {
    const at = now();
    let F = fights()[t.id];
    if (!F) {
      if (s.board.role === 'd') { delete s.board; s.sorder = { kind: 'stay' }; return; }
      if (!riders(t).length) { delete s.board; s.sorder = { kind: 'stay' }; capture(t, s.owner, null); return; }
      F = ((state.frontier ||= {}).boardings ||= {})[t.id] = { t: t.id, att: s.owner, def: t.owner, ships: [t.id], slots: {}, carry: { [s.owner]: 0, [t.owner]: 0 }, at, next: at + 20 };
      lock(t, F);
    }
    if (s.owner !== F.att && s.owner !== F.def) { delete s.board; s.sorder = { kind: 'stay' }; return; }
    if (F.slots[s.board.side] && live(ent(F.slots[s.board.side]))) { const k = -s.board.side; if (F.slots[k] && live(ent(F.slots[k]))) { delete s.board; s.sorder = { kind: 'stay' }; return; } s.board.side = k; }
    F.ships.push(s.id); F.slots[s.board.side] = s.id;
    lock(s, F);
    Object.assign(s.board, { fight: at, offAt: at + T(B().breakOffSeconds ?? 3) });
    delete s.board.grip;
    // the deck Gatling of a defending warship cuts the boarding party as it comes over (none without defenders)
    let cut = 0;
    if (s.owner === F.att && (kindOf(t).guns || []).includes('deckGatling') && sideOf(F, F.def).length) {
      cut = (B().gatlingCut ?? 0.2) * holdStrength(s);
      F.carry[F.att] = (F.carry[F.att] ?? 0) + cut;
    }
    push({ kind: 'boardJoin', a: s.id, t: t.id, side: s.board.side, role: s.board.role, cut: Math.round(cut), x: s.x, z: s.z });
    view(F);
  }
  function lock(s, F) {
    s.locked = F.t; s.sorder = { kind: 'stay' }; s.anim = 'idle';
    delete s.loadQueue;
    if (s.gat) { if (s.gat.firing != null) push({ kind: 'gatlingStop', a: s.id, x: s.x, z: s.z, deck: true }); delete s.gat; }
    for (const u of Object.values(state.entities)) if (u.boardShip === s.id) delete u.boardShip;   // no one steps aboard mid-fight
  }

  // ---- the struggle ----
  // the fighters of one side: everyone aboard that side's ships in the fight, weakest first
  function sideOf(F, owner) {
    const out = [];
    for (const id of F.ships) { const s = ent(id); if (!live(s) || s.owner !== owner) continue; for (const u of riders(s)) out.push({ u, s, str: strength(u) }); }
    return out.sort((a, b) => a.str - b.str || (a.u.id < b.u.id ? -1 : 1));
  }
  function view(F) {
    const a = sideOf(F, F.att), d = sideOf(F, F.def), sa = a.reduce((n, f) => n + f.str, 0), sd = d.reduce((n, f) => n + f.str, 0);
    F.view = { a: Math.max(0, Math.round(sa - (F.carry[F.att] ?? 0))), d: Math.max(0, Math.round(sd - (F.carry[F.def] ?? 0))), na: a.length, nd: d.length,
      a0: Math.max(F.view?.a0 ?? 0, sa), d0: Math.max(F.view?.d0 ?? 0, sd), weak: weak(ent(F.t)) };
  }
  function fall(F, f, k) {
    const { u, s } = f, at = now();
    push({ kind: 'boardFall', a: s.id, t: u.id, fight: F.t, side: u.owner === F.att ? 'a' : 'd', x: s.x, z: s.z });
    if (u.warTroop) {   // over the side: it drowns beside the ships (render/ship_fx.js draws it as the sinking ones)
      const h = s.heading ?? 0, sd = k & 1 ? 1 : -1, off = radiusOf(s) + 1.5 + (k % 3) * 0.7, along = ((k % 5) / 4 - 0.5) * 4;
      delete u.aboard; delete u.inShip; delete u.boardShip;
      Object.assign(u, { dead: true, diedAt: at, hp: 0, anim: 'idle', drowned: s.id, boardFell: F.t, x: s.x + Math.sin(h) * along + Math.cos(h) * sd * off, z: s.z + Math.cos(h) * along - Math.sin(h) * sd * off });
    } else wash(u, s, k);
  }
  function exchange(F) {
    const a = sideOf(F, F.att), d = sideOf(F, F.def);
    if (!d.length) return capture(ent(F.t), F.att, F);
    if (!a.length) return end(F, 'held');
    const L = B().lossShare ?? 0.1, w = B().weakDefender ?? 0.6;
    const sa = a.reduce((n, f) => n + f.str, 0), sd = d.reduce((n, f) => n + f.str * (weak(f.s) ? w : 1), 0);
    F.carry[F.def] = (F.carry[F.def] ?? 0) + L * sa;
    F.carry[F.att] = (F.carry[F.att] ?? 0) + L * sd;
    let k = 0;
    while (a.length && F.carry[F.att] >= a[0].str) { F.carry[F.att] -= a[0].str; fall(F, a.shift(), k++); }
    while (d.length && F.carry[F.def] >= d[0].str) {
      if (d.length === 1 && !a.length) { F.carry[F.def] = 0; break; }   // both holds empty at once: the defender keeps its strongest
      F.carry[F.def] -= d[0].str; fall(F, d.shift(), k++);
    }
    if (!a.length) F.carry[F.att] = 0;
    view(F);
    if (!d.length) return capture(ent(F.t), F.att, F);
    if (!a.length) return end(F, 'held');
  }
  // the boarders take t: it changes side with the damage it has, empty; the fight ends
  function capture(t, owner, F) {
    const from = t.owner;
    if (F) end(F, 'taken');
    for (const u of riders(t)) wash(u, t, 0);   // nobody of the old side stays aboard (none should be left)
    t.owner = owner;
    t.sorder = { kind: 'stay' };
    delete t.holdFire; delete t.gat; delete t.loadQueue; delete t.board; delete t.mending; delete t.locked; delete t.castReq;
    t.capturedAt = now();
    push({ kind: 'shipCaptured', a: t.id, owner, from, x: t.x, z: t.z });
    state.news?.push({ kind: 'shipCaptured', clan: owner, from, unit: t.warUnit, x: t.x, z: t.z });
  }
  function end(F, why) {
    if (!F || !fights()[F.t]) return;
    for (const id of F.ships) { const s = ent(id); if (!s) continue; delete s.locked; if (s.board) { delete s.board; if (!s.dead) s.sorder = { kind: 'stay' }; } }
    delete state.frontier.boardings[F.t];
    if (!Object.keys(state.frontier.boardings).length) delete state.frontier.boardings;
    push({ kind: 'boardEnd', t: F.t, why, att: F.att, def: F.def, x: ent(F.t)?.x ?? 0, z: ent(F.t)?.z ?? 0 });
    if (why === 'held') { say(F.def, 'Boarders beaten off'); say(F.att, 'The boarding failed'); }
  }

  // every tick (ships.tick, after the ships moved): asked-for casts, ships going alongside, the fights
  function tick() {
    for (const s of Object.values(state.entities)) {
      if (!s.ship) continue;
      if (s.castReq) { const r = s.castReq; delete s.castReq; if (r.until > now() && live(s)) order(s, r); }
      if (s.board && !live(s)) { delete s.board; continue; }
      if (s.board && s.board.fight == null) go(s);
    }
    for (const F of Object.values(fights())) {
      const t = ent(F.t);
      if (!live(t) || t.owner !== F.def) { end(F, 'sunk'); continue; }
      if (foeOf(t) == null) { end(F, 'stopped'); continue; }   // the war ended or paused: survivors stay where they are
      for (const id of [...F.ships]) { const s = ent(id); if (!live(s)) { F.ships = F.ships.filter(x => x !== id); for (const [k, v] of Object.entries(F.slots)) if (v === id) delete F.slots[k]; } }
      if (!F.ships.some(id => ent(id).owner === F.att)) { end(F, 'off'); continue; }
      if (now() >= F.next) { F.next += 20; exchange(F); }
    }
  }
  // a war's ships leave (war end, ships.leave): its fights stop first
  function stop(warId) {
    for (const F of Object.values(fights())) if (ent(F.t)?.warTroop === warId) end(F, 'stopped');
  }
  // the armed cursor's numbers: the hold of ship s against what it would fight at t (and whether t is weakened)
  function preview(s, t) {
    if (!live(t)) return null;
    const F = fightOf(t), T0 = F ? ent(F.t) : t;
    const theirs = F ? sideOf(F, t.owner).reduce((n, f) => n + f.str, 0) : holdStrength(t);
    return { ours: s ? holdStrength(s) : 0, theirs, weakened: weak(T0), gatling: (kindOf(T0).guns || []).includes('deckGatling') && theirs > 0 && T0.owner === t.owner, room: !!freeSide(T0, s || t), fight: !!F };
  }
  return { tick, order, stop, preview, strength, holdStrength, canBoard, fightOf };
}
