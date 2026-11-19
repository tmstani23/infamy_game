// War structures (frontier plan F6, checkpoint 6): health on everything that stands in a war, attacking
// and torching it, ruins and breaches. Rules only: no DOM, no randomness. Numbers: data.war.structures.
// A structure is one of:
//   a town building (the town hall included)    key 't|<town id>|<first cell>'
//   a town wall or gate cell                    key 't|<town id>|<cell>'
//   a grown zone cell (house, workshop)         key 't|<town id>|<cell>'
//   a built war camp building                   key 'c|<war id>|<building id>'
// Health is kept only once something is damaged: on the building (b.hp), or in settlement.cellHp[cell]
// for walls, gates and zone cells. The stockade keeps its own health: by town hall tier in a town
// (buildings.stockade.garrison.hpByTier), by camp hall tier in a war camp (war.structures.campStockade).
// Only the two sides of a war damage each other's structures: the attacker the town's, the defender the
// camp's. Nobody else, and nothing outside a war.
// At 0 health: a building becomes stage 'ruined' (stops working and blocking; a training queue is lost),
// a wall or gate cell becomes open ground (settlement.breaches lists them for the rubble), a zone cell
// drops to an empty plot (stage 0) and regrows by the zone rules.
// Torching (7c-2, Tim 2026-11-12): never automatic. Only units that can torch (war.structures.torch.types, and a
// melee hero; never riders) take a Torch order (a raze order with torch: true, from the Torch ability button).
// At the structure the unit casts for torch.castTicks (order.cast = { until, last }); a tick in which it could not
// act (stagger, stun, knockdown, charm, taunt) breaks the cast and it starts again, plain hits do not. A finished
// cast lights the fire and the unit carries on hitting. One fire per structure:
// state.frontier.fires[key] = { by, at, until? }. Every second it burns for fire.damage until it is doused
// (douse(), workers, 7c-4), the structure is a ruin, or fire.burnTicks have passed (0 = no end).
// A fire bomb lights the same fire on wood. A plain raze order (right-click, attack-move) only hits.
// Order: { id: <hero id>, type: 'order', kind: 'raze', structure: <key> | x, z (the structure at that ground point),
//   units: [crew ids], hero: true|false, fallback: 'move' | 'station' (the crew order when nothing is there) }.
// createStructures({ state, data, world, war, garrison }) -> { list, find, at, near, pick, canDamage, damage, order, step, tick, viewFor, hpOf, gap, attach }
import { cellToWorld, setUse, zoneStructureAt, townCellBoxes, campBuildingBoxes, ringRadius } from './town_grid.js';
import { addCampStock } from './camp_stock.js';
import { stockadeHp } from './garrison.js';

export function createStructures({ state, data, world, war, garrison = null, workers = null }) {
  const R = () => data.war?.structures || null;
  let rt = null;   // { moveTo, fight, paths, damageOf, intervalOf } from the game
  const f = () => state.frontier;
  const town = id => f()?.settlements?.[id] || null;
  const put = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);
  const cellsOf = b => b.cells?.length ? b.cells : [b.cell];
  const zoneKind = (s, i) => Object.entries(data.zones?.kinds || {}).find(([, k]) => k.char === s.grid.zone[i])?.[0] || null;

  // ---- health -----------------------------------------------------------------------------
  function townMax(s, b) {
    const S = R();
    if (b.type === 'stockade') return stockadeHp(data, s.tier) || S.town?.default || 0;
    if (b.type === 'town_hall') { const t = S.townHall || []; return t[Math.min(t.length, Math.max(1, s.tier || 1)) - 1] || 0; }
    return S.town?.[b.type] ?? S.town?.default ?? 0;
  }
  function campMax(b, c = null) {
    const S = R();
    if (b.type === 'camp_hall') { const t = S.campHall || []; return t[Math.min(t.length, Math.max(1, b.tier || 1)) - 1] || 0; }
    if (b.type === 'stockade' && S.campStockade?.length) { const t = S.campStockade, tier = c?.buildings?.find(x => x.type === 'camp_hall')?.tier || 1; return t[Math.min(t.length, Math.max(1, tier)) - 1] || 0; }
    return S.camp?.[b.type] ?? S.camp?.default ?? 0;
  }
  function cellMax(s, i) {
    const S = R(), u = s.grid.use[i];
    if (u === 'w') return S.wall || 0;
    if (u === 'g') return S.gate || 0;
    const st = Number(s.grid.stage[i]), z = S.zone || [];
    return z[Math.min(z.length, Math.max(1, st)) - 1] || 0;
  }

  // ---- the structures of a town and of a camp (kept until something solid changes) -------------
  const townCache = new WeakMap(), campCache = new WeakMap();
  // (the grid strings are compared as they are: the same string object is an instant match)
  const townSig = s => `${s.tier || 1}|${s.x},${s.z}|${s.buildings.map(b => `${b.type}:${b.stage}:${b.cell}`).join(',')}`;
  function townList(s) {
    if (!s?.grid || !Number.isFinite(s.x) || !R()) return [];
    const sig = townSig(s), hit = townCache.get(s), gr = s.grid;
    if (hit && hit.use === gr.use && hit.stage === gr.stage && hit.zone === gr.zone && hit.sig === sig) return hit.list;
    const g = s.grid, boxes = townCellBoxes(s, data), list = [], owned = new Set();
    for (const b of s.buildings) {
      if (b.stage !== 'built') continue;
      const cs = cellsOf(b); for (const i of cs) owned.add(i);
      const max = townMax(s, b); if (!max) continue;
      const pts = cs.map(i => cellToWorld(s, i));
      const x = pts.reduce((n, p) => n + p[0], 0) / pts.length, z = pts.reduce((n, p) => n + p[1], 0) / pts.length;
      const bx = cs.flatMap(i => boxes.get(i) || []);
      list.push({ key: `t|${s.id}|${cs[0]}`, kind: 'building', type: b.type, town: s.id, owner: s.owner, b, s, x, z, r: Math.sqrt(cs.length) * g.cell / 2, boxes: bx, max, military: b.type === 'stockade' || !!data.buildings?.[b.type]?.military });
    }
    for (let i = 0; i < g.use.length; i++) {
      const u = g.use[i];
      const wall = u === 'w' || u === 'g', zone = !wall && !owned.has(i) && u !== 'B' && zoneStructureAt(s, i, data);
      if (!wall && !zone) continue;
      const max = cellMax(s, i); if (!max) continue;
      const [x, z] = cellToWorld(s, i);
      list.push({ key: `t|${s.id}|${i}`, kind: wall ? (u === 'w' ? 'wall' : 'gate') : 'zone', type: wall ? (u === 'w' ? 'wall' : 'gate') : zoneKind(s, i), town: s.id, owner: s.owner, cell: i, s, x, z, r: g.cell / 2, boxes: boxes.get(i) || [], max });
    }
    townCache.set(s, { sig, list, use: g.use, stage: g.stage, zone: g.zone });
    return list;
  }
  const campSig = c => (c.buildings || []).map(b => `${b.id}:${b.type}:${b.stage}:${b.tier || 1}:${b.x},${b.z}`).join(';');
  function campList(w) {
    const c = w?.camp; if (!c || !R()) return [];
    const sig = campSig(c), hit = campCache.get(c);
    if (hit && hit.sig === sig) return hit.list;
    const list = [];
    for (const b of c.buildings || []) {
      if (b.stage !== 'built' || !Number.isFinite(b.x)) continue;
      const max = campMax(b, c); if (!max) continue;
      const line = b.type === 'palisade' || b.type === 'gate';
      list.push({ key: `c|${w.id}|${b.id}`, kind: line ? b.type === 'gate' ? 'gate' : 'wall' : 'building', type: b.type, war: w.id, owner: w.attacker, b, x: b.x, z: b.z, r: data.war?.buildings?.[b.type]?.radius ?? 8, boxes: b.type === 'rail_section' ? b.hitBoxes || [] : campBuildingBoxes(b, data), max, camp: true });
    }
    campCache.set(c, { sig, list });
    return list;
  }
  const hpOf = st => st.b ? st.b.hp ?? st.max : st.s.cellHp?.[st.cell] ?? st.max;
  function setHp(st, hp) {
    if (st.b) st.b.hp = hp;
    else (st.s.cellHp ||= {})[st.cell] = hp;
  }
  function clearHp(st) {
    if (st.b) delete st.b.hp;
    else if (st.s.cellHp) { delete st.s.cellHp[st.cell]; if (!Object.keys(st.s.cellHp).length) delete st.s.cellHp; }
  }

  // every structure of every war (both sides)
  function list() {
    const out = [];
    for (const w of war.active()) { out.push(...townList(town(w.town)), ...campList(w)); }
    return out;
  }
  function find(key) {
    if (typeof key !== 'string') return null;
    const [side, id] = key.split('|');
    const l = side === 't' ? townList(town(id)) : side === 'c' ? campList(war.byId(id)) : [];
    return l.find(st => st.key === key) || null;
  }
  // the war in which `clan` may damage this structure, or null
  function warFor(clan, st) {
    if (!st || clan == null) return null;
    // (8c: nothing is damaged during a ceasefire, w.terms; fires go out with it)
    if (st.camp) { const w = war.byId(st.war); return w && !w.terms && w.defender === clan ? w : null; }
    const w = war.warOn(st.town);
    return w && !w.terms && w.attacker === clan && st.owner === w.defender ? w : null;
  }
  const canDamage = (clan, st) => !!warFor(clan, st) && hpOf(st) > 0;
  // what a clan may attack: the town of each war it attacks, the camp of each war it defends
  function targetsOf(clan) {
    const out = [];
    for (const w of war.warsOf(clan)) if (!w.terms) out.push(...(w.attacker === clan ? townList(town(w.town)) : campList(w)));
    return out;
  }
  // distance from a point to the solid part of a structure (its boxes; a circle when it has none)
  function gap(st, x, z) {
    if (!st.boxes?.length) return Math.max(0, Math.hypot(x - st.x, z - st.z) - st.r);
    let best = Infinity;
    for (const b of st.boxes) { const d = Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ)); if (d < best) best = d; }
    return best;
  }
  // the structure under a world point a clan may attack (right-click), nearest first
  function at(clan, x, z, slack = 1.5) {
    let best = null, bd = Infinity;
    for (const st of targetsOf(clan)) {
      if (Math.abs(x - st.x) > st.r + 12 || Math.abs(z - st.z) > st.r + 12 || hpOf(st) <= 0) continue;
      const d = Math.min(gap(st, x, z), Math.max(0, Math.hypot(x - st.x, z - st.z) - st.r * 0.7));
      if (d <= slack && d < bd) { bd = d; best = st; }
    }
    return best;
  }
  // attack-move: the nearest structure in reach; military buildings first, then other buildings, walls and gates, then houses
  const RANK = st => st.kind === 'building' ? (st.military || st.camp || st.type === 'town_hall' ? 0 : 1) : st.kind === 'zone' ? 3 : 2;
  function near(clan, x, z, range) {
    let best = null, bk = Infinity, bd = Infinity;
    for (const st of targetsOf(clan)) {
      const d = Math.hypot(x - st.x, z - st.z) - st.r;
      if (d > range || hpOf(st) <= 0) continue;
      const k = RANK(st);
      if (k < bk || (k === bk && (d < bd || (d === bd && st.key < best.key)))) { best = st; bk = k; bd = d; }
    }
    return best;
  }

  // ---- damage, fire, ruin ------------------------------------------------------------------------
  // siege = cannons (units.json siege: true), bomb = fire-bomb throwers (projectile.bomb), checkpoint 7-2
  const kindOf = unit => unit?.siege ? 'siege' : unit?.projectile?.bomb ? 'bomb' : unit?.projectile ? 'ranged' : 'melee';
  // stone resists fire bombs (war.structures.stone: types and the bomb damage factor); camp palisades and gates are wood
  const isStone = st => !st.camp && (R().stone?.types || []).includes(st.type);
  function note(st, text) {
    const w = st.camp ? war.byId(st.war) : war.warOn(st.town);
    for (const id of w ? [w.attacker, w.defender] : []) if (state.clans?.[id]) state.clans[id].notice = { tick: state.tick ?? 0, text };
  }
  const NAMES = { town_hall: 'Town hall', camp_hall: 'Camp hall', wall: 'Wall', gate: 'Gate', palisade: 'Palisade', housing: 'House', work: 'Workshop' };
  const nameOf = st => NAMES[st.type] || (st.type || 'building').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  function ruin(st, by) {
    delete f().fires?.[st.key];
    if (st.b) {
      const b = st.b;
      b.stage = 'ruined'; delete b.hp; delete b.queue; delete b.upgrade;
      if (st.type === 'stockade' && garrison && st.s) garrison.breakOut(st.s, b);   // (a camp stockade holds only troops: breakOutKey below)
      shelterOut(st);
    } else if (st.kind === 'zone') {
      const g = st.s.grid;
      g.stage = put(g.stage, st.cell, '0'); if (st.s.zoneGrow) delete st.s.zoneGrow[st.cell];
      clearHp(st);
    } else {
      (st.s.breaches ||= []).push({ cell: st.cell, was: st.s.grid.use[st.cell] });
      setUse(st.s, st.cell, '.');
      st.s.grid.by = put(st.s.grid.by, st.cell, '.');
      if (st.s.lineCosts) delete st.s.lineCosts[st.cell];
      clearHp(st);
    }
    garrison?.breakOutKey?.(st.key);   // 7c-3b: troops in a fallen house pile out
    (state.news ||= []).push({ kind: 'structureDown', key: st.key, type: st.type, what: st.kind, x: st.x, z: st.z, owner: st.owner, by: by ?? null, ...(st.camp ? { war: st.war } : { town: st.town }) });
    if (st.kind !== 'zone') note(st, `${nameOf(st)} destroyed`);
  }
  // amount of raw damage from a clan; false when that clan may not damage it
  function damage(clan, st, amount, kind = 'melee') {
    if (!canDamage(clan, st)) return false;
    const mult = kind === 'fire' ? 1 : (R().damage?.[kind] ?? 1) * (kind === 'bomb' && isStone(st) ? R().stone?.bomb ?? 1 : 1);
    const hp = Math.max(0, hpOf(st) - Math.max(0, amount * mult));
    if (hp > 0) { setHp(st, hp); return true; }
    ruin(st, clan);
    return true;
  }

  // ---- town hall shelter (6-4) ---------------------------------------------------------------------
  // While a war is on a town and one of the attacker's units is inside its build ring, the town's workers run to
  // the town hall and shelter inside: they do not gather, farm or build and cannot be attacked (unit.garrison with
  // hall: true; area hits are absorbed, sim/frontier/garrison.js). settlement.shelter = { seen: tick an enemy was last
  // inside the ring }; worker.shelter = { spot, dropoff, by, in } keeps the job to go back to. They come out
  // shelter.calmTicks after the last enemy left, or at once when the hall falls or the war ends.
  const hallOf = s => (s.buildings || []).find(b => b.type === 'town_hall' && b.stage === 'built') || null;
  function shelterRelease(s) {
    for (const w of s.workers || []) {
      const k = w.shelter; if (!k) continue;
      const u = state.entities?.[w.entity];
      if (u?.garrison?.hall) delete u.garrison;
      w.spot = k.spot ?? null; w.dropoff = k.dropoff ?? null; if (k.by === undefined) delete w.by; else w.by = k.by;
      if (w.order?.kind === 'hold' || w.order?.kind === 'move') { delete w.order; if (w.trip?.kind === 'move') { w.trip = null; w.elapsed = 0; w.phase = 0; } }
      delete w.nextOrder; delete w.shelter;
    }
    delete s.shelter;
  }
  function shelterOut(st) { if (st?.type === 'town_hall' && st.s) shelterRelease(st.s); }
  function shelterTick() {
    const S = R()?.shelter, now = state.tick ?? 0;
    if (!S || !workers) return;
    for (const s of Object.values(f().settlements || {})) {
      if (!s.shelter && (now % 20 || !war.warOn(s.id))) continue;
      const w = war.warOn(s.id), hall = hallOf(s);
      if (!w || !hall) { if (s.shelter) shelterRelease(s); continue; }
      if (now % 20 === 0) {
        const r2 = ringRadius(s, data) ** 2;
        const foe = Object.values(state.entities).some(e => e.owner === w.attacker && e.place === 'world' && !e.dead && !e.downed && e.type !== 'civilian' && e.type !== 'horse' && (e.x - s.x) ** 2 + (e.z - s.z) ** 2 <= r2);
        if (foe) (s.shelter ||= {}).seen = now;
        else if (s.shelter && now - s.shelter.seen >= (S.calmTicks ?? 200)) { shelterRelease(s); continue; }
      }
      if (!s.shelter || now % 10) continue;
      const cell = s.grid?.cell || 11, near = (S.enterRange ?? 1.6) * cell;
      for (const k of s.workers || []) {
        if (k.job) continue;   // sent to repair or douse (7c-4): they work on under attack
        if (!k.shelter) {
          const keep = { spot: k.spot ?? null, dropoff: k.dropoff ?? null, by: k.by };
          const r = workers.workerOrder(s, [k.id], 'move', { x: s.x, z: s.z + cell });
          if (!r.ok) continue;   // no way to the hall right now: tried again next time
          k.shelter = keep;
        }
        const u = state.entities?.[k.entity], at = workers.position?.(k) || k.departure || [s.x, s.z];
        if (!k.shelter.in && (k.order?.kind === 'hold' || Math.hypot(at[0] - s.x, at[1] - s.z) <= near)) k.shelter.in = true;
        if (k.shelter.in && u && !u.garrison) { u.garrison = { town: s.id, building: hall.id ?? 'hall', heal: 1, hall: true }; delete u.attackTarget; }
      }
    }
  }

  // set it alight (a finished torch cast or a fire bomb); one fire per structure, a burning one stays as it is
  function ignite(clan, st) {
    if (!R()?.fire || !canDamage(clan, st)) return false;
    const now = state.tick ?? 0, fires = f().fires ||= {};
    if (fires[st.key]) return true;
    const burn = R().fire.burnTicks || 0;
    fires[st.key] = { by: clan, at: now, ...(burn > 0 ? { until: now + burn } : {}) };
    return true;
  }
  const burning = st => !!f().fires?.[st.key];
  // put a fire out (workers, 7c-4); true when there was one
  function douse(st) { const fires = f().fires; if (!fires?.[st?.key]) return false; delete fires[st.key]; if (!Object.keys(fires).length) delete f().fires; return true; }
  const isMelee = unit => kindOf(unit) === 'melee' && !unit?.gatling;   // a Gatling crew neither torches nor attacks structures (7-4)
  // who can torch (7c-2): the unit types of war.structures.torch.types (grunts, spearmen and plain melee crew) and a melee hero; never from the saddle
  const canTorch = (e, unit) => !!e && !!unit && isMelee(unit) && !e.cavalry && (e.type === 'hero' || (R()?.torch?.types || []).includes(e.type));
  // how many of these units could take a Torch order (the ability button's count)
  function torchers(ids) { return (ids || []).filter(id => { const u = state.entities[id]; return u && !u.dead && !u.downed && u.place === 'world' && !u.garrison && !u.aboard && rt?.unitOf && canTorch(u, rt.unitOf(u)); }).length; }

  // ---- units attacking a structure -----------------------------------------------------------------
  function order(hero, c) {
    const st = hero && (c.structure ? find(c.structure) : Number.isFinite(c.x) && Number.isFinite(c.z) && hero.place === 'world' ? at(hero.owner, c.x, c.z, c.slack ?? 1.5) : null);
    if (!st || !canDamage(hero.owner, st)) return false;
    const set = u => {
      delete u.swing; delete u.execute; delete u.attackTarget; delete u.holdFire;
      if (rt?.fight?.[u.id]) delete rt.fight[u.id].target;
      if (rt?.paths) delete rt.paths[u.id];
      u.order = { kind: 'raze', structure: st.key, x: st.x, z: st.z, ...(c.torch ? { torch: true } : {}) };
    };
    // a Torch order is only for units that can torch; the rest of the selection keeps what it was doing
    const can = u => !rt?.unitOf?.(u)?.gatling && (!c.torch || (rt?.unitOf ? canTorch(u, rt.unitOf(u)) : true));
    let n = 0;
    for (const id of Array.isArray(c.units) ? c.units : []) {
      const u = state.entities[id];
      if (!u || u.owner !== hero.owner || u.type === 'hero' || u.dead || u.downed || u.jailed || u.place !== 'world' || u.garrison || u.aboard || u.guard || u.type === 'civilian' || u.type === 'horse' || !can(u)) continue;
      set(u); n++;
    }
    if (c.hero && hero.type === 'hero' && !hero.dead && !hero.downed && hero.place === 'world' && !hero.aboard && !hero.garrison && can(hero)) { set(hero); n++; }
    return n > 0;
  }
  // a ranged unit's shot at a structure (7-2): drawn as a state.projectiles entry with no target unit; the damage waits in
  // frontier.shots = [{ key, by, a, damage, kind, at }] until it lands. A fire bomb sets wood alight (stone only takes reduced damage).
  function shoot(e, st, unit) {
    const now = state.tick ?? 0, pr = unit.projectile, flight = Math.max(2, Math.ceil(Math.hypot(st.x - e.x, st.z - e.z) / (pr.speed || 30) * 20));
    (state.projectiles ||= []).push({ kind: pr.kind, a: e.id, t: null, structure: st.key, x: e.x, z: e.z, tx: st.x, tz: st.z, place: 'world', at: now, until: now + flight, damage: 0 });
    (state.casts ||= []).push({ kind: pr.kind, a: e.id, x: e.x, z: e.z, tx: st.x, tz: st.z, place: 'world', flightTicks: flight });
    if (unit.siege) state.casts.push({ kind: 'cannonFire', a: e.id, x: e.x, z: e.z, place: 'world', dir: e.dir || 0, brass: !!unit.brass });
    (f().shots ||= []).push({ key: st.key, by: e.owner, a: e.id, damage: rt.damageOf(e), kind: kindOf(unit), at: now + flight });
  }
  function shotsTick() {
    const fr = f(), now = state.tick ?? 0;
    if (!fr.shots) return;
    const due = fr.shots.filter(s => s.at <= now);
    if (!due.length) return;
    fr.shots = fr.shots.filter(s => s.at > now);
    if (!fr.shots.length) delete fr.shots;
    for (const s of due) {
      const st = find(s.key);
      if (!st || !canDamage(s.by, st)) continue;
      if (s.kind === 'bomb') { (state.casts ||= []).push({ kind: 'firebombBurst', a: s.a, x: st.x, z: st.z, place: 'world', radius: 2 }); if (!isStone(st)) ignite(s.by, st); }
      damage(s.by, st, s.damage, s.kind);
    }
  }
  // a fire bomb lands (7c-2, sim/firebomb.js): the enemy structure it was thrown at (key), else one within slack of the
  // spot, takes the bomb's damage (stone: reduced) and, when it is wood, catches fire
  function bombAt(clan, x, z, key, amount, slack = 2) {
    const st = (key && find(key)) || at(clan, x, z, slack);
    if (!st || !canDamage(clan, st)) return false;
    if (!isStone(st)) ignite(clan, st);
    return damage(clan, st, amount, 'bomb');
  }
  // one tick of a unit on a raze order; false when the order is over (the caller carries on as usual)
  function step(e, unit) {
    const o = e.order, st = o?.kind === 'raze' ? find(o.structure) : null;
    if (!st || !rt || !canDamage(e.owner, st)) {
      if (e.swing?.structure) delete e.swing;
      if (o?.kind === 'raze') { if (o.from === 'attackmove') e.order = { kind: 'attackmove', x: o.ax, z: o.az }; else e.order = { kind: 'move', x: e.x, z: e.z, arrived: true }; }
      return false;
    }
    const fight = rt.fight[e.id] ||= { cd: 0 };
    delete fight.target;
    const w = e.swing;
    if (w?.structure) {
      if ((state.tick ?? 0) === w.strike) {
        if (unit.projectile) shoot(e, st, unit);   // an arrow, bullet, ball or bomb flies; it lands in tick()
        else damage(e.owner, st, rt.damageOf(e), kindOf(unit));
        (state.structureHits ||= []).push({ a: e.id, key: st.key, x: st.x, z: st.z, kind: kindOf(unit) });
      }
      if ((state.tick ?? 0) >= w.start + w.len) delete e.swing; else { e.anim = 'attack'; return true; }
      if (!canDamage(e.owner, st)) return true;   // it fell on this hit: the order ends next tick
    } else if (w) delete e.swing;
    const reach = (unit.attackRange || 1.5) + (unit.radius || 0.35) + 0.4;
    const d = gap(st, e.x, e.z);
    // 7c: a melee unit walks all the way to its own slot round the structure before it hits (ranged units stop in range)
    if (isMelee(unit) && !o.noSlot && !o.atSlot && !o.contact) {
      const [sx, sz] = slotSpot(st, e, unit, o), ds = Math.hypot(sx - e.x, sz - e.z), now = state.tick ?? 0;
      if (ds <= 0.4) o.atSlot = true;
      else {
        if (o.slotBest == null || ds < o.slotBest - 0.15) { o.slotBest = ds; o.slotAt = now; }
        else if (now - o.slotAt > 30) { if (d <= reach) o.atSlot = true; else o.noSlot = true; }   // stuck short of it: hit from here, or go for the nearest wall
        if (!o.atSlot && !o.noSlot) { if (!rt.moveTo(e, unit, sx, sz, false)) o.noSlot = true; else return true; }
      }
    }
    if (d > reach && !o.contact) {
      // walk to the nearest wall of it; standing against something solid close by counts as there
      if (o.bestD == null || d < o.bestD - 0.15) { o.bestD = d; o.bestAt = state.tick ?? 0; }
      else if ((state.tick ?? 0) - o.bestAt > 30) { if (d <= reach + (st.s?.grid?.cell || 11)) o.contact = true; else { o.bestD = d; o.bestAt = state.tick ?? 0; } }
      const [gx, gz] = approach(st, e, unit);
      if (!rt.moveTo(e, unit, gx, gz, false)) { e.anim = 'idle'; if (d <= reach + (st.s?.grid?.cell || 11)) o.contact = true; }
      return true;
    }
    delete rt.paths[e.id];
    const want = rt.dirIndex(st.x - e.x, st.z - e.z), diff = (want - e.dir + 8) % 8;
    if (diff) { e.dir = (e.dir + (diff <= 4 ? 1 : 7)) % 8; if (diff !== 1 && diff !== 7) { e.anim = 'idle'; return true; } }
    // 7c-2 Torch: a cast of torch.castTicks at the structure. A tick this unit could not act (stun, stagger, knockdown,
    // charm, taunt: step() is not reached then) breaks it and it starts over; plain hits do not. Once it burns, he hits.
    if (o.torch && !burning(st) && canTorch(e, unit)) {
      const now = state.tick ?? 0;
      if (!o.cast || o.cast.last !== now - 1) { o.cast = { start: now, until: now + (R().torch?.castTicks ?? 20) }; (state.casts ||= []).push({ kind: 'torchCast', a: e.id, x: e.x, z: e.z, place: 'world', ticks: R().torch?.castTicks ?? 20 }); }
      o.cast.last = now;
      e.anim = 'attack';
      if (now >= o.cast.until) { delete o.cast; ignite(e.owner, st); }
      return true;
    }
    if (o.cast) delete o.cast;
    if (fight.cd > 0) { e.anim = 'idle'; return true; }
    const speed = rt.intervalOf(e), len = rt.swingTicks(unit, speed);
    e.swing = { start: state.tick ?? 0, len, strike: (state.tick ?? 0) + Math.round(len * (unit.strikeFraction ?? 0.4)), structure: st.key };
    e.anim = 'attack';
    fight.cd = speed;
    return true;
  }
  // 7c (Tim 2026-11-12: attackers converged and stacked on a building): each attacker of a clan on a structure takes its own
  // slot round it, at least slotGap (war.structures, default 1.3) from the others' slots; a unit takes the free one
  // nearest its own side. The spot is where a line from the centre at that angle leaves the solid boxes, plus a
  // step. Kept on the order (o.slot, o.sx, o.sz); o.noSlot: the slot could not be reached, use the nearest wall.
  const inBoxes = (st, x, z) => st.boxes.some(b => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
  function slotSpot(st, e, unit, o) {
    if (o.noSlot) return approach(st, e, unit);
    if (o.sx == null) {
      const pad = (unit.radius || 0.35) + 0.5, ext = Math.max(st.r || 4, ...(st.boxes || []).map(b => Math.max(Math.abs(b.minX - st.x), Math.abs(b.maxX - st.x), Math.abs(b.minZ - st.z), Math.abs(b.maxZ - st.z))));
      const gapW = R().slotGap ?? 1.3, m = Math.max(12, Math.ceil(2 * Math.PI * (ext + pad) / 0.3)), cell = 2 * Math.PI / m;
      const taken = [];
      for (const u of Object.values(state.entities)) if (u !== e && u.owner === e.owner && !u.dead && u.order?.kind === 'raze' && u.order.structure === o.structure && u.order.sx != null) taken.push([u.order.sx, u.order.sz]);
      const spotAt = k => {
        const a = k * cell, ux = Math.cos(a), uz = Math.sin(a);
        let t = 0;
        if (st.boxes?.length) { while (t < ext + 2 && inBoxes(st, st.x + ux * t, st.z + uz * t)) t += 0.25; } else t = st.r || 4;
        return [st.x + ux * (t + pad), st.z + uz * (t + pad)];
      };
      const want = Math.round(Math.atan2(e.z - st.z, e.x - st.x) / cell);
      let k = want, spot = null;
      for (let i = 0; i < m && !spot; i++) {
        const c = want + (i % 2 ? (i + 1) / 2 : -i / 2), p = spotAt(c);
        if (taken.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= gapW)) { k = c; spot = p; }
      }
      spot ||= spotAt(want);   // every place round it taken: share the nearest
      o.slot = ((k % m) + m) % m; [o.sx, o.sz] = spot;
    }
    return [o.sx, o.sz];
  }
  // where to walk: just outside the nearest solid box, on the unit's side
  function approach(st, e, unit) {
    const pad = (unit.radius || 0.35) + 0.5;
    if (!st.boxes?.length) { const d = Math.hypot(e.x - st.x, e.z - st.z) || 1, r = st.r + pad; return [st.x + (e.x - st.x) / d * r, st.z + (e.z - st.z) / d * r]; }
    let best = null, bd = Infinity;
    for (const b of st.boxes) { const px = Math.min(b.maxX, Math.max(b.minX, e.x)), pz = Math.min(b.maxZ, Math.max(b.minZ, e.z)), d = Math.hypot(e.x - px, e.z - pz); if (d < bd) { bd = d; best = [px, pz]; } }
    const dx = e.x - best[0], dz = e.z - best[1], d = Math.hypot(dx, dz);
    if (d < 1e-6) return [e.x, e.z];
    return [best[0] + dx / d * pad, best[1] + dz / d * pad];
  }
  // attack-move with no enemy unit to fight: go for a structure in reach
  function pick(e, range) {
    if (e.place !== 'world' || !war.warsOf(e.owner).length) return null;
    return near(e.owner, e.x, e.z, range ?? R()?.searchRange ?? 30);
  }

  // ---- gates stop only the enemy (6-5) --------------------------------------------------------------------------
  // During a war a town's gates let their own side (and everyone outside the war) through and block the attacker;
  // a camp's gates block the defender. Outside a war gates are open to all, as before. A broken gate is a gap.
  // For the blocked side a gate is a solid box across its cell (thin along the wall it sits in) and closed ground
  // for its routes (areas.blockedNav); nobody else's collisions or routes change.
  const gateCache = new WeakMap();
  function townGateBoxes(s) {
    const g = s.grid, hit = gateCache.get(s);
    if (hit && hit.use === g.use && hit.x === s.x && hit.z === s.z) return hit.boxes;
    const boxes = [], n = g.n, half = g.cell / 2, thin = g.cell * (R()?.gateThickness ?? 0.3) / 2, solid = i => i >= 0 && i < n * n && (g.use[i] === 'w' || g.use[i] === 'g' || g.use[i] === 'B');
    for (let i = 0; i < g.use.length; i++) {
      if (g.use[i] !== 'g') continue;
      const [x, z] = cellToWorld(s, i), col = i % n;
      const across = (col > 0 && solid(i - 1)) || (col < n - 1 && solid(i + 1)), down = solid(i - n) || solid(i + n);
      const hx = across && !down ? half : !across && down ? thin : half, hz = across && !down ? thin : !across && down ? half : half;
      boxes.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, gate: true });
    }
    gateCache.set(s, { use: g.use, x: s.x, z: s.z, boxes });
    return boxes;
  }
  const campGateBoxes = w => campList(w).filter(st => st.kind === 'gate').flatMap(st => st.boxes.length ? st.boxes : [{ minX: st.x - st.r, maxX: st.x + st.r, minZ: st.z - st.r, maxZ: st.z + st.r }]);
  let gateTick = -1, gateMemo = new Map();
  // the gate boxes that stop this clan right now ([] for nearly everyone)
  function gatesAgainst(clan) {
    if (gateTick !== (state.tick ?? 0)) { gateTick = state.tick ?? 0; gateMemo = new Map(); }
    let out = gateMemo.get(clan);
    if (out) return out;
    out = [];
    if (R() && clan != null) for (const w of war.warsOf(clan)) {
      if (w.attacker === clan) { const s = town(w.town); if (s?.grid && Number.isFinite(s.x)) out.push(...townGateBoxes(s)); }
      else if (w.defender === clan) out.push(...campGateBoxes(w));
    }
    gateMemo.set(clan, out);
    return out;
  }
  // for tryMove: the gate boxes near a unit, or null when no gate stops it
  function gateBlockers(e) {
    const all = e?.place === 'world' ? gatesAgainst(e.owner ?? e.horseOwner) : null;
    return all?.length ? (x0, z0, x1, z1) => all.filter(b => b.maxX >= x0 && b.minX <= x1 && b.maxZ >= z0 && b.minZ <= z1) : null;
  }
  // for routes: the island walk grid with the gates closed for this unit's side, or null when no gate stops it
  const gateNavs = new Map();
  function gateNav(e) {
    const clan = e?.owner ?? e?.horseOwner;
    if (e?.place !== 'world' || !rt?.areas?.blockedNav || !gatesAgainst(clan).length) return null;
    let nav = gateNavs.get(clan);
    if (!nav) { const pad = 0.6; nav = rt.areas.blockedNav((x, z) => gatesAgainst(clan).some(b => x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad)); gateNavs.set(clan, nav); }
    return nav;
  }

  // ---- watchtower fire (6-3): a built watchtower shoots arrows at the nearest enemy unit of its war in range ----
  // tower = { range, damage, everyTicks, speed }. The arrow flies as a state.projectiles entry (tower: true, drawing
  // only); the hit is ours (frontier.towerShots), through the game's own hit() so falls and effects match.
  function towers() {
    const T = R()?.tower, now = state.tick ?? 0, fr = f();
    if (!T || !rt?.hit) return;
    for (const shot of fr.towerShots || []) {
      if (shot.until > now) continue;
      const t = state.entities[shot.t];
      if (t && !t.dead && !t.downed && !t.jailed && !t.garrison && t.place === 'world') rt.hit({ id: `tower:${shot.key}`, type: T.as || 'army_archer', owner: shot.by, x: shot.x, z: shot.z, place: 'world', dir: 0, model: 'archer', tower: true }, t, shot.damage, false, 'arrow');
    }
    if (fr.towerShots) { fr.towerShots = fr.towerShots.filter(s => s.until > now); if (!fr.towerShots.length) delete fr.towerShots; }
    if (now % 5) return;
    for (const w of war.active()) {
      if (w.terms) continue;   // 8c ceasefire: towers hold fire
      const sides = [[campList(w), w.attacker, w.defender], [townList(town(w.town)), w.defender, w.attacker]];
      for (const [l, mine, foe] of sides) for (const st of l) {
        if (st.type !== 'watchtower' || (st.b.shotAt ?? -Infinity) + (T.everyTicks ?? 30) > now) continue;
        let best = null, bd = (T.range ?? 16) ** 2;
        for (const e of Object.values(state.entities)) {
          if (e.owner !== foe || e.place !== 'world' || e.dead || e.downed || e.jailed || e.garrison || e.aboard || e.type === 'civilian' || e.type === 'horse' || e.guide) continue;
          const d = (e.x - st.x) ** 2 + (e.z - st.z) ** 2;
          if (d < bd || (d === bd && best && e.id < best.id)) { bd = d; best = e; }
        }
        if (!best) continue;
        st.b.shotAt = now;
        const flight = Math.max(2, Math.ceil(Math.sqrt(bd) / (T.speed ?? 30) * 20));
        (fr.towerShots ||= []).push({ key: st.key, by: mine, t: best.id, x: st.x, z: st.z, until: now + flight, damage: T.damage ?? 10 });
        (state.projectiles ||= []).push({ kind: 'arrow', tower: true, a: `tower:${st.key}`, t: best.id, x: st.x, z: st.z, tx: best.x, tz: best.z, place: 'world', at: now, until: now + flight, damage: 0 });
        (state.casts ||= []).push({ kind: 'arrow', tower: true, a: `tower:${st.key}`, t: best.id, x: st.x, z: st.z, tx: best.x, tz: best.z, place: 'world', flightTicks: flight });
      }
    }
  }

  // Tim 2026-11-13: troops shot from a garrisoned house fight back at the house (they cannot reach the shooters inside).
  // The one hit and its idle mates within 8 (no order, a finished move or an attack-move, no live fight) get a raze
  // order on it; not the hero (the player steers him), workers, gatling crews or anyone already busy.
  function answerGarrison(t, a) {
    const st = a.garrison?.key && find(a.garrison.key);
    if (!st || t.dead || t.downed || !canDamage(t.owner, st)) return;
    const idle = u => { const o = u.order; return !o || (o.kind === 'move' && o.arrived && !o.garrisonGo) || o.kind === 'attackmove'; };
    for (const u of Object.values(state.entities)) {
      if (u.owner !== t.owner || u.type === 'hero' || u.dead || u.downed || u.jailed || u.garrison || u.aboard || u.guard || u.worker || u.place !== 'world' || u.type === 'civilian' || u.type === 'horse') continue;
      if (u !== t && (u.x - t.x) ** 2 + (u.z - t.z) ** 2 > 64) continue;
      if (!idle(u) || u.attackTarget || u.swing || u.execute) continue;
      const f = rt.fight?.[u.id], ft = f?.target && state.entities[f.target];
      if (ft && !ft.dead && !ft.downed && !ft.garrison) continue;
      const unit = rt.unitOf(u); if (!unit || unit.gatling) continue;
      const am = u.order?.kind === 'attackmove' ? { from: 'attackmove', ax: u.order.x, az: u.order.z } : {};
      if (f) delete f.target; if (rt.paths) delete rt.paths[u.id];
      u.order = { kind: 'raze', structure: st.key, x: st.x, z: st.z, auto: true, ...am };
    }
  }
  // ---- 7c-3b: ranged troops in a garrisoned house shoot out (melee ones cannot attack) --------------------------
  // frontier.garrisonShots = [{ a, t, until, damage, kind }]: the hit lands through the game's hit() when the shot arrives.
  function garrisonFire() {
    const fr = f(), now = state.tick ?? 0;
    if (!rt?.hit || !rt.unitOf) return;
    if (fr.garrisonShots) {
      for (const s of fr.garrisonShots) if (s.until <= now) { const a = state.entities[s.a], t = state.entities[s.t]; if (a && t && !t.dead && !t.downed && !t.garrison) { rt.hit(a, t, s.damage, false, s.kind); answerGarrison(t, a); } }
      fr.garrisonShots = fr.garrisonShots.filter(s => s.until > now); if (!fr.garrisonShots.length) delete fr.garrisonShots;
    }
    if (now % 2) return;
    for (const u of Object.values(state.entities)) {
      const g = u.garrison; if (!g || g.hall || !(g.zone || g.building) || u.dead || u.owner == null || (g.next ?? 0) > now) continue;   // a house, or a stockade (8d-9: everyone ranged inside one)
      const unit = rt.unitOf(u); if (!unit?.projectile && !unit?.rifle) continue;
      const w = g.war ? war.byId(g.war) : war.warOn(g.town); if (!w || w.terms || (u.owner !== w.defender && u.owner !== w.attacker)) continue;
      const foe = u.owner === w.defender ? w.attacker : w.defender, reach = (unit.rifle?.range ?? unit.attackRange ?? 6) + 3 + (g.fort || g.building ? data.buildings?.stockade?.garrison?.reach ?? 0 : 0);
      let best = null, bd = reach * reach;
      for (const e of Object.values(state.entities)) {
        if (e.owner !== foe || e.place !== 'world' || e.dead || e.downed || e.jailed || e.garrison || e.aboard || e.hidden || e.type === 'civilian' || e.type === 'horse' || e.guide) continue;
        const d = (e.x - u.x) ** 2 + (e.z - u.z) ** 2;
        if (d < bd || (d === bd && best && e.id < best.id)) { bd = d; best = e; }
      }
      if (!best) continue;
      const every = unit.rifle ? unit.rifle.cooldownTicks ?? 60 : Math.max(4, Math.round((rt.intervalOf?.(u) ?? 1.5) * 20));
      g.next = now + every;
      const kind = unit.projectile?.kind || 'bullet', flight = Math.max(2, Math.ceil(Math.sqrt(bd) / (unit.projectile?.speed || 90) * 20));
      (fr.garrisonShots ||= []).push({ a: u.id, t: best.id, until: now + flight, damage: unit.rifle ? unit.rifle.damage ?? rt.damageOf(u) : rt.damageOf(u), kind: unit.rifle ? 'bullet' : kind });
      (state.projectiles ||= []).push({ kind, garrison: true, a: u.id, t: best.id, x: u.x, z: u.z, tx: best.x, tz: best.z, place: 'world', at: now, until: now + flight, damage: 0 });
      (state.casts ||= []).push({ kind, garrison: true, a: u.id, t: best.id, x: u.x, z: u.z, tx: best.x, tz: best.z, place: 'world', flightTicks: flight });
    }
  }

  // ---- workers repair and douse (7c-4, Tim 2026-11-12: manual) ----------------------------------------------------
  // Workers sent by a 'work' order (sim/frontier/workers.js) to one of their own site's structures put its fire out
  // first (repair.douseWork worker ticks), then mend it: repair.hpPerTick health per worker a tick, paid per health
  // point from the site's stock (repair.cost; no stock, no repair). A ruined town hall is mended the same way: after
  // repair.ruinShare of its health in work it stands again (damaged), and the town can place and train once more.
  // They can be attacked while at it (they do not shelter).
  const REP = () => R()?.repair || {};
  const ownSt = (s, key) => { const st = find(key); return st && (s.camp ? st.camp && st.war === s.id : !st.camp && st.town === s.id) ? st : null; };
  // no mending a hall while the enemy hero is taking it (8a, Tim 2026-11-14): break his channel first
  const hallTaken = s => !s.camp && war.warOn(s.id)?.channel?.side === 'town';
  function hallRuin(s, key) {
    if (s.camp || typeof key !== 'string') return null;
    const [side, id, cell] = key.split('|');
    return side === 't' && id === s.id ? (s.buildings || []).find(b => b.type === 'town_hall' && b.stage === 'ruined' && String(cellsOf(b)[0]) === cell) || null : null;
  }
  const ruinSpot = (s, b) => { const pts = cellsOf(b).map(i => cellToWorld(s, i)); return { x: pts.reduce((n, p) => n + p[0], 0) / pts.length, z: pts.reduce((n, p) => n + p[1], 0) / pts.length, r: Math.sqrt(pts.length) * (s.grid?.cell || 11) / 2 + 1 }; };
  // the key a worker order needs for a ruined town hall of this town (null when it stands)
  function hallRuinKey(s) { const b = (s?.buildings || []).find(x => x.type === 'town_hall' && x.stage === 'ruined'); return b ? `t|${s.id}|${cellsOf(b)[0]}` : null; }
  // Town building sites (Tim 2026-11-15): key p|<town>|<project id>, an authorized placed-building project of a town.
  // Workers there add rates.workerBuildRate work a second each, at most rates.maxBuilders on one site, on top of the
  // townspeople (construction.js). An unpaid project, or one still being cleared, makes them wait.
  function townProject(s, key) {
    if (s.camp || typeof key !== 'string') return null;
    const [side, id, pid] = key.split('|');
    return side === 'p' && id === s.id ? (s.projects || []).find(p => p.id === pid && p.authorized && (p.cells?.length || Number.isInteger(p.cell))) || null : null;
  }
  const siteOf = (s, p) => (p.replaces && (s.buildings || []).find(b => b.id === p.replaces)) || p;   // a rebuild covers the ruin's cells
  function projectKeyAt(s, cell) { const p = (s?.projects || []).find(x => x.authorized && cellsOf(siteOf(s, x)).includes(cell)); return p ? `p|${s.id}|${p.id}` : null; }
  const siteCap = (s, key) => townProject(s, key) ? data.rates?.maxBuilders ?? 4 : Infinity;
  function workTarget(s, key) {
    const tp = townProject(s, key);
    if (tp) return tp.progress < tp.need ? ruinSpot(s, siteOf(s, tp)) : null;
    const st = ownSt(s, key);
    if (st) return hpOf(st) > 0 && (burning(st) || hpOf(st) < st.max) ? { x: st.x, z: st.z, r: (st.r || 4) + 1 } : null;
    const b = hallRuin(s, key);
    return b && !hallTaken(s) ? ruinSpot(s, b) : null;
  }
  const workWhy = (s, key) => hallRuin(s, key) && hallTaken(s) ? 'The hall is being taken: stop the enemy hero first' : ownSt(s, key) ? 'It is not damaged or burning' : find(key) ? 'Not one of your buildings' : 'Nothing to build, repair or put out there';
  // pay for `hp` health points of repair from the site's stock; false when it is short (whole units, the rest is kept as a debt)
  function payRepair(s, hp) {
    const cost = REP().cost || {}, debt = s.camp ? (s.war.camp.repairDebt ||= {}) : (s.repairDebt ||= {});
    const stock = s.camp ? s.war.camp.stock || {} : s.stock || {};
    const due = {};
    for (const [r, v] of Object.entries(cost)) { const d = (debt[r] || 0) + hp * v; due[r] = d; if (Math.floor(d) > (stock[r] || 0)) return false; }
    for (const [r, d] of Object.entries(due)) {
      const whole = Math.floor(d); debt[r] = d - whole;
      if (whole > 0) { if (s.camp) addCampStock(s.war.camp, r, -whole); else world.change(s.id, r, -whole, 'repair'); }
    }
    return true;
  }
  function workOn(s, key, n) {
    const st = ownSt(s, key), per = (REP().hpPerTick ?? 1) * n;
    if (st) {
      const fire = f().fires?.[st.key];
      if (fire) { fire.doused = (fire.doused || 0) + n; if (fire.doused >= (REP().douseWork ?? 60)) douse(st); return 'working'; }
      const hp = hpOf(st);
      if (hp <= 0 || hp >= st.max) return 'done';
      if (s.camp ? s.war?.terms : Object.values(f().wars?.list || {}).some(w => w.town === s.id && w.terms)) return 'waiting';   // Tim 2026-11-18: no repairs in a ceasefire
      const gain = Math.min(st.max - hp, per);
      if (!payRepair(s, gain)) return 'waiting';
      if (hp + gain >= st.max - 1e-6) { clearHp(st); return 'done'; }
      setHp(st, hp + gain);
      return 'working';
    }
    const tp = townProject(s, key);
    if (tp) {
      if (tp.progress >= tp.need) return 'done';
      if (!tp.paid || tp.phase === 'clearing') return 'waiting';
      if (Object.values(f().wars?.list || {}).some(w => w.town === s.id && w.terms)) return 'waiting';   // Tim 2026-11-18: no building in a ceasefire
      tp.progress = Math.min(tp.need, tp.progress + n * (data.rates?.workerBuildRate ?? 1) / (data.cadenceTicks || 20));
      return 'working';
    }
    const b = hallRuin(s, key);
    if (!b) return 'done';
    if (hallTaken(s)) return 'waiting';
    const max = townMax(s, b) || 1, need = max * (REP().ruinShare ?? 0.5);
    if (!payRepair(s, per)) return 'waiting';
    b.repair = (b.repair || 0) + per;
    if (b.repair >= need) {
      b.stage = 'built'; b.hp = Math.min(max, Math.round(b.repair)); delete b.repair;
      world.recount?.(s.id);
      note({ camp: false, town: s.id }, 'Town hall repaired');
    }
    return 'working';
  }
  // a worker leaves the hall shelter for his job
  function workLeave(s, w) {
    if (!w.shelter) return;
    const u = state.entities?.[w.entity];
    if (u?.garrison?.hall) delete u.garrison;
    delete w.shelter;
  }
  workers?.attachJobs?.({ target: workTarget, why: workWhy, work: workOn, leave: workLeave, cap: siteCap });
  // Stand-in until the bot general (8d): a bot clan's workers douse their own burning structures by themselves,
  // repair.botDousers at a time (the player's never do: his are manual)
  function botDouse() {
    const fires = f().fires, n = REP().botDousers ?? 0;
    if (!fires || !n || !workers?.workerOrder || war.generalOn?.()) return;   // 8d: the bot general sends the workers itself
    for (const key of Object.keys(fires)) {
      const st = find(key); if (!st || !state.clans?.[st.owner]?.bot) continue;
      const s = st.camp ? workers.siteOf?.(st.war) : st.s; if (!s?.workers?.length) continue;
      const on = s.workers.filter(w => w.job?.key === key).length; if (on >= n) continue;
      const free = s.workers.filter(w => !w.job && !w.project).map(w => { const p = workers.position?.(w) || w.departure || [s.x, s.z]; return { w, d: Math.hypot(p[0] - st.x, p[1] - st.z) }; }).sort((a, b) => a.d - b.d).slice(0, n - on).map(o => o.w.id);
      if (free.length) workers.workerOrder(s, free, 'work', { target: key });
    }
  }

  function tick() {
    const fr = f(); if (!fr || !R()) return;
    if ((state.tick ?? 0) % 20 === 7) botDouse();
    towers();
    garrisonFire();
    shelterTick();
    shotsTick();
    const fires = fr.fires;
    if (!fires) return;
    const now = state.tick ?? 0, F = R().fire || {};
    for (const key of Object.keys(fires)) {
      const fire = fires[key], st = find(key);
      if (!st || (fire.until && fire.until <= now) || !canDamage(fire.by, st)) { delete fires[key]; continue; }
      if ((now - (fire.at || 0)) % 20 === 19) damage(fire.by, st, F.damage ?? 0, 'fire');   // once a second from when it was lit
    }
    if (!Object.keys(fires).length) delete fr.fires;
  }

  // read-only: what the screen shows a clan: the damaged or burning structures of its wars (both sides)
  function viewFor(clan) {
    const fires = f()?.fires || {}, out = [];
    for (const w of war.warsOf(clan)) for (const st of [...townList(town(w.town)), ...campList(w)]) {
      const hp = hpOf(st), fire = !!fires[st.key];
      if (hp < st.max || fire) out.push({ key: st.key, kind: st.kind, type: st.type, x: Math.round(st.x * 10) / 10, z: Math.round(st.z * 10) / 10, r: st.r, owner: st.owner, hp: Math.round(hp), max: st.max, ...(fire ? { fire: true } : {}) });
    }
    return out;
  }
  // 7-5: the built watchtowers of every war, for war stealth detection: [{ owner, x, z, range }]
  function watchers() { const T = R()?.tower; return T ? list().filter(st => st.type === 'watchtower' && hpOf(st) > 0).map(st => ({ owner: st.owner, x: st.x, z: st.z, range: T.detect ?? T.range ?? 0, sight: T.sight ?? 0 })) : []; }
  function attach(services) { rt = services; }
  return { list, find, at, near, pick, canDamage, damage, order, step, tick, viewFor, hpOf, gap, gateBlockers, gateNav, gatesAgainst, ignite, bombAt, douse, workTarget, workOn, hallRuinKey, projectKeyAt, burning, canTorch, torchers, watchers, attach };
}
