// War structures (frontier plan F6, checkpoint 6): health on everything that stands in a war, attacking
// and torching it, ruins and breaches. Rules only: no DOM, no randomness. Numbers: data.war.structures.
// A structure is one of:
//   a town building (the town hall included)    key 't|<town id>|<first cell>'
//   a town wall or gate cell                    key 't|<town id>|<cell>'
//   a grown zone cell (house, workshop)         key 't|<town id>|<cell>'
//   a built war camp building                   key 'c|<war id>|<building id>'
// Health is kept only once something is damaged: on the building (b.hp), or in settlement.cellHp[cell]
// for walls, gates and zone cells. The stockade keeps its own health (buildings.stockade.garrison.hp).
// Only the two sides of a war damage each other's structures: the attacker the town's, the defender the
// camp's. Nobody else, and nothing outside a war.
// At 0 health: a building becomes stage 'ruined' (stops working and blocking; a training queue is lost),
// a wall or gate cell becomes open ground (settlement.breaches lists them for the rubble), a zone cell
// drops to an empty plot (stage 0) and regrows by the zone rules.
// Torching (checkpoint 7-0, Tim 2026-11-12): never automatic. Melee units on a Torch order (a raze order with
// torch: true, from the Torch ability button) set the structure alight with their hits: one fire per structure,
// state.frontier.fires[key] = { until, by, fed: { unitId: tick of its last torch hit } }. Every second the fire
// burns for fire.damage x the units that fed it within fire.lingerTicks (at most fire.maxFeeders), and it dies
// fire.lingerTicks after the last torch hit. A plain raze order (right-click, attack-move) only hits.
// Order: { id: <hero id>, type: 'order', kind: 'raze', structure: <key> | x, z (the structure at that ground point),
//   units: [crew ids], hero: true|false, fallback: 'move' | 'station' (the crew order when nothing is there) }.
// createStructures({ state, data, world, war, garrison }) -> { list, find, at, near, pick, canDamage, damage, order, step, tick, viewFor, hpOf, gap, attach }
import { cellToWorld, setUse, zoneStructureAt, townCellBoxes, campBuildingBoxes, ringRadius } from './town_grid.js';

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
    if (b.type === 'stockade') return data.buildings?.stockade?.garrison?.hp || S.town?.default || 0;
    if (b.type === 'town_hall') { const t = S.townHall || []; return t[Math.min(t.length, Math.max(1, s.tier || 1)) - 1] || 0; }
    return S.town?.[b.type] ?? S.town?.default ?? 0;
  }
  function campMax(b) {
    const S = R();
    if (b.type === 'camp_hall') { const t = S.campHall || []; return t[Math.min(t.length, Math.max(1, b.tier || 1)) - 1] || 0; }
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
      list.push({ key: `t|${s.id}|${cs[0]}`, kind: 'building', type: b.type, town: s.id, owner: s.owner, b, s, x, z, r: Math.sqrt(cs.length) * g.cell / 2, boxes: bx, max, military: b.type === 'stockade' });
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
      const max = campMax(b); if (!max) continue;
      const line = b.type === 'palisade' || b.type === 'gate';
      list.push({ key: `c|${w.id}|${b.id}`, kind: line ? b.type === 'gate' ? 'gate' : 'wall' : 'building', type: b.type, war: w.id, owner: w.attacker, b, x: b.x, z: b.z, r: data.war?.buildings?.[b.type]?.radius ?? 8, boxes: campBuildingBoxes(b, data), max, camp: true });
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
    if (st.camp) { const w = war.byId(st.war); return w && w.defender === clan ? w : null; }
    const w = war.warOn(st.town);
    return w && w.attacker === clan && st.owner === w.defender ? w : null;
  }
  const canDamage = (clan, st) => !!warFor(clan, st) && hpOf(st) > 0;
  // what a clan may attack: the town of each war it attacks, the camp of each war it defends
  function targetsOf(clan) {
    const out = [];
    for (const w of war.warsOf(clan)) out.push(...(w.attacker === clan ? townList(town(w.town)) : campList(w)));
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
      if (st.type === 'stockade' && garrison) garrison.breakOut(st.s, b);
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

  // set it alight, or feed its fire (a torch hit; later a fire bomb): feeder = the unit's id
  function ignite(clan, st, feeder) {
    if (!R()?.fire || !canDamage(clan, st)) return false;
    const now = state.tick ?? 0, fires = f().fires ||= {}, old = fires[st.key];
    const fire = fires[st.key] = { until: now + (R().fire.lingerTicks ?? 60), by: clan, fed: old?.by === clan ? old.fed || {} : {} };
    if (feeder != null) fire.fed[feeder] = now;
    return true;
  }
  const isMelee = unit => kindOf(unit) === 'melee' && !unit?.gatling;   // a Gatling crew neither torches nor attacks structures (7-4)
  // how many of these units could take a Torch order (the ability button's count)
  function torchers(ids) { return (ids || []).filter(id => { const u = state.entities[id]; return u && !u.dead && !u.downed && u.place === 'world' && !u.garrison && !u.aboard && rt?.unitOf && isMelee(rt.unitOf(u)); }).length; }

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
    // a Torch order is for melee units only; the rest of the selection keeps what it was doing
    const can = u => !rt?.unitOf?.(u)?.gatling && (!c.torch || (rt?.unitOf ? isMelee(rt.unitOf(u)) : true));
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
      if (s.kind === 'bomb') { (state.casts ||= []).push({ kind: 'firebombBurst', a: s.a, x: st.x, z: st.z, place: 'world', radius: 2 }); if (!isStone(st)) ignite(s.by, st, s.a); }
      damage(s.by, st, s.damage, s.kind);
    }
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
        if (o.torch && isMelee(unit)) ignite(e.owner, st, e.id);
        (state.structureHits ||= []).push({ a: e.id, key: st.key, x: st.x, z: st.z, kind: kindOf(unit) });
      }
      if ((state.tick ?? 0) >= w.start + w.len) delete e.swing; else { e.anim = 'attack'; return true; }
      if (!canDamage(e.owner, st)) return true;   // it fell on this hit: the order ends next tick
    } else if (w) delete e.swing;
    const reach = (unit.attackRange || 1.5) + (unit.radius || 0.35) + 0.4;
    const d = gap(st, e.x, e.z);
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
    if (fight.cd > 0) { e.anim = 'idle'; return true; }
    const speed = rt.intervalOf(e), len = rt.swingTicks(unit, speed);
    e.swing = { start: state.tick ?? 0, len, strike: (state.tick ?? 0) + Math.round(len * (unit.strikeFraction ?? 0.4)), structure: st.key };
    e.anim = 'attack';
    fight.cd = speed;
    return true;
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

  function tick() {
    const fr = f(); if (!fr || !R()) return;
    towers();
    shelterTick();
    shotsTick();
    const fires = fr.fires;
    if (!fires) return;
    const now = state.tick ?? 0, F = R().fire || {};
    for (const key of Object.keys(fires)) {
      const fire = fires[key], st = find(key);
      if (!st || fire.until <= now || !canDamage(fire.by, st)) { delete fires[key]; continue; }
      if (now % 20 === 0) {
        let n = 0;
        if (fire.fed) for (const id of Object.keys(fire.fed)) { if (now - fire.fed[id] > (F.lingerTicks ?? 60)) delete fire.fed[id]; else n++; }
        damage(fire.by, st, (F.damage ?? 0) * Math.max(1, Math.min(F.maxFeeders ?? 3, n)), 'fire');
      }
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
  return { list, find, at, near, pick, canDamage, damage, order, step, tick, viewFor, hpOf, gap, gateBlockers, gateNav, gatesAgainst, ignite, torchers, watchers, attach };
}
