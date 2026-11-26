// Stockade garrison (2026-11-06). Your hero, crew and workers can shelter inside a finished
// stockade: they cannot be attacked, they heal data.buildings.stockade.garrison.healFactor times faster
// (sim/stats.js reads e.garrison.heal) and they stand idle at the building until sent out.
// Command (through the frontier hub): { id: <hero id>, type: 'frontier', action: 'garrison', mode: 'enter' | 'leave',
// town: <settlement id>, units: [entity ids] } (leave with no units = everyone). Receipts as for other frontier commands.
// Hits on anyone inside go to the stockade instead (garrison.hp, 2026-11-06): area attacks such as
// dynamite or a cleave cannot reach the people. At 0 the stockade is ruined and everyone piles out;
// the town governor rebuilds it on the same spot. Enemies attacking the building itself waits for F7 sieges.
// createGarrison({ state, data, world }) -> { command, tick, members, capacity, shelter }
// 7c-3b (2026-11-12, war plan 2026-11-09b): garrisons in a town's houses, workshops and farmhouses. The town owner's
// troops, crew and the hero (2026-11-19; not workers) go in, up to war.structures.zoneGarrison.capacity per building:
// { action: 'garrison', mode: 'enter' | 'leave', structure: <structure key>, units, walk }. Inside: e.garrison =
// { town, key, zone: true, x, z }. Hits on them go to the building (structures.damage), at 0 everyone piles out
// (breakOutKey), melee inside cannot attack, ranged troops shoot out (sim/frontier/structures.js garrisonFire), no
// healing inside. Not the stockade's members().
// Stockade as a fortress (2026-11-16): health by town hall tier (garrison.hpByTier, stockadeHp), a town may have
// several (tiers placed limit) and each holds garrison.capacity. War troops (e.warTroop) go in by the structure way
// above: into a town stockade or a war camp's stockade (war.buildings.stockade), with garrison.range, the stockade's
// healing and e.garrison.fort; the hero, crew and workers go in as before (town stockades only). Both kinds share
// one stockade's room. The 'garrison' command with town takes building: <building id> for one stockade (none = the
// nearest with room; leave = all of them) and sends war troops the structure way. Ranged units inside shoot out.
import { cellToWorld, townBlockersIn } from './town_grid.js';

// full health of a town's stockade at a town hall tier
export const stockadeHp = (data, tier) => { const G = data?.buildings?.stockade?.garrison, t = G?.hpByTier; return (t?.length ? t[Math.min(t.length, Math.max(1, tier || 1)) - 1] : 0) || G?.hp || 0; };

export function createGarrison({ state, data, world, atWar = () => false, dismount = () => {} }) {
  const rules = () => data.buildings?.stockade?.garrison || null;
  const finished = (s, b) => b.type === 'stockade' && b.stage === 'built';
  const forts = s => (s?.buildings || []).filter(b => finished(s, b));
  const stockadeOf = s => forts(s)[0] || null;
  const keyOf = (s, b) => `t|${s.id}|${(b.cells?.length ? b.cells : [b.cell])[0]}`;
  // world centre of a building's cells
  function centre(s, b) {
    const pts = (b.cells?.length ? b.cells : [b.cell]).map(i => cellToWorld(s, i));
    return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  }
  const workerOf = (s, u) => u.worker ? s.workers?.find(w => w.id === u.worker) : null;
  // ---- 7c-3b zone garrisons ----
  const Z = () => data.war?.structures?.zoneGarrison || null;
  let structs = null;   // sim/frontier/structures.js, set once both exist
  const zoneSt = key => structs?.find?.(key) || null;
  const fort = st => !!st && st.kind === 'building' && st.type === 'stockade' && !!rules();
  const zoneOk = st => (!!st && !!Z() && (st.kind === 'zone' || st.kind === 'building') && (Z().types || []).includes(st.type)) || fort(st);
  const inZone = key => Object.values(state.entities || {}).filter(e => e.garrison?.zone && e.garrison.key === key && !e.dead);
  // room and reach of a structure troops can hold: a stockade's own numbers (less the hero, crew and workers inside), else a house's
  // Z4e (2026-11-19): watchtowers are garrisonable too, in towns, war camps and castles: zoneGarrison.byType gives a
  // type its own room (capacity) and how much further its ranged troops reach from up there (reach)
  const byType = st => Z()?.byType?.[st?.type] || null;
  const capOf = st => fort(st) ? (rules().capacity || 0) - (st.s && st.b ? membersIn(st.s, st.b).length : 0) : byType(st)?.capacity ?? Z()?.capacity ?? 10;
  const rangeOf = st => fort(st) ? rules().range ?? 14 : Z()?.range ?? 9;
  function outAt(u, cx, cz, reach = 7) {
    delete u.garrison;
    for (let r = 0; r < 6; r++) for (let k = 0; k < 8; k++) {
      const a = (k + r * 0.5) * Math.PI / 4, d = reach + r * 1.5, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!townBlockersIn(state.frontier, x, z, x, z, data).length) { u.x = x; u.z = z; u.order = { kind: 'move', x, z, arrived: true }; return; }
    }
  }
  const outOf = (u, st) => outAt(u, st.x, st.z, fort(st) ? (st.r || 7) + 3 : 7);
  function breakOutKey(key) { for (const u of inZone(key)) outAt(u, u.garrison.x ?? u.x, u.garrison.z ?? u.z); }
  // a bot defender's ranged troop walks into the nearest building of its own town with room (stand-in defender, 7c-3b)
  function defendIn(u, townId) {
    if (!structs || !u || u.garrison) return false;
    const s = world.settlement(townId); if (!s || s.owner !== u.owner) return false;
    const going = key => Object.values(state.entities || {}).filter(e => !e.dead && e.order?.garrisonKey === key).length;
    // a stockade with room before a house
    const pick = structs.list().filter(st => st.town === townId && zoneOk(st) && structs.hpOf(st) > 0 && inZone(st.key).length + going(st.key) < capOf(st))
      .map(st => ({ st, d: Math.hypot(st.x - u.x, st.z - u.z) })).sort((a, b) => (fort(b.st) ? 1 : 0) - (fort(a.st) ? 1 : 0) || a.d - b.d || (a.st.key < b.st.key ? -1 : 1))[0]?.st;
    if (!pick) return false;
    u.order = { kind: 'move', x: pick.x, z: pick.z, garrisonGo: s.id, garrisonKey: pick.key }; delete u.attackTarget;
    return true;
  }
  function admitZone(u, st) {
    if (u.mounted || u.ride?.kind === 'horse') dismount(u);   // 2026-11-25: a rider (the hero on his horse) gets off and goes in
    u.garrison = { ...(st.town ? { town: st.town } : {}), ...(st.war ? { war: st.war } : {}), key: st.key, zone: true, x: st.x, z: st.z, ...(fort(st) ? { fort: true, heal: rules().healFactor || 1 } : {}), ...(byType(st)?.reach ? { reach: byType(st).reach } : {}) };
    delete u.order; delete u.swing; delete u.attackTarget; u.x = st.x; u.z = st.z;
  }
  // who may hold a house or a stockade the structure way: troops, crew and the hero (2026-11-19: the hero may garrison any
  // garrisonable building; was troops and crew only, 2026-11-12); never workers, animals, guns on wheels. Riders may (
  // 2026-11-25: the hero on his horse could not go in): they ride over and get off at the door.
  const troopOk = (u, owner) => !!u && u.owner === owner && !u.worker && !u.garrison && !u.dead && !u.downed && !u.jailed && u.place === 'world' && !u.aboard && !u.cavalry
    && u.type !== 'civilian' && u.type !== 'horse' && !u.wild && !u.cop && !u.guide && !u.gatling;
  function zoneCommand(e, c) {
    const st = zoneSt(c.structure);
    if (!st || (!Z() && !fort(st))) return receipt(e, c, false, 'no such building');
    if (st.owner == null || st.owner !== e.owner) return receipt(e, c, false, st.camp ? 'not your war camp' : 'not your town');
    if (!zoneOk(st)) return receipt(e, c, false, 'troops cannot garrison that');
    if (c.mode === 'leave') { const ids = Array.isArray(c.units) && c.units.length ? new Set(c.units) : null; for (const u of inZone(st.key)) if (!ids || ids.has(u.id)) outOf(u, st); return receipt(e, c, true); }
    if (c.mode !== 'enter') return receipt(e, c, false, 'enter or leave');
    let room = capOf(st) - inZone(st.key).length, taken = 0, far = 0, walking = 0;
    for (const id of Array.isArray(c.units) ? c.units : []) {
      const u = state.entities[id];
      if (!troopOk(u, e.owner)) continue;
      if (room - walking <= 0) break;
      if (Math.hypot(u.x - st.x, u.z - st.z) > rangeOf(st)) {
        if (c.walk) { u.order = { kind: 'move', x: st.x, z: st.z, garrisonGo: st.town || st.war, garrisonKey: st.key }; delete u.attackTarget; walking++; } else far++;
        continue;
      }
      admitZone(u, st); room--; taken++;
    }
    if (!taken && !walking) return receipt(e, c, false, room <= 0 ? 'it is full' : far ? 'move closer' : 'nobody can go in');
    return receipt(e, c, true);
  }
  // everyone inside: garrisoned entities plus sleeping garrisoned workers that have no entity right now
  const members = (s) => {
    const out = Object.values(state.entities || {}).filter(e => e.garrison?.town === s.id && !e.garrison.hall && !e.garrison.zone);
    for (const w of s.workers || []) if (w.garrison && !state.entities?.[w.entity]) out.push({ id: 'w:' + w.id, worker: w.id, sleeping: true, building: w.garrisonIn });
    return out;
  };
  const capacity = () => rules()?.capacity || 0;
  // one stockade: the hero, crew and workers inside it (a worker with no stockade noted counts in the first), and everyone with the troops
  const membersIn = (s, b) => members(s).filter(m => (m.sleeping ? m.building ?? stockadeOf(s)?.id : m.garrison.building) === b.id);
  const usedIn = (s, b) => membersIn(s, b).length + inZone(keyOf(s, b)).length;
  const going = (s, b) => Object.values(state.entities || {}).filter(e => !e.dead && !e.garrison && (e.order?.garrisonKey === keyOf(s, b) || (e.order?.garrisonGo === s.id && e.order.garrisonB === b.id))).length;

  function receipt(e, c, ok, reason = '') {
    const fr = state.frontier;
    fr.receiptSeq = (fr.receiptSeq || 0) + 1;
    fr.receipts.push({ seq: fr.receiptSeq, tick: state.tick ?? 0, clan: e.owner ?? null, action: c.action, ok, reason });
    return true;
  }

  function release(s, u, b) {
    if (u.sleeping) { const w = s.workers.find(x => x.id === u.worker); if (w) { delete w.garrison; delete w.garrisonIn; delete w.order; } return; }
    delete u.garrison;
    const w = workerOf(s, u);
    if (w) { delete w.garrison; delete w.garrisonIn; delete w.order; }
    if (!b) return;
    const [cx, cz] = centre(s, b), g = s.grid, reach = (g?.cell || 10) * 1.5;
    for (let r = 0; r < 6; r++) for (let k = 0; k < 8; k++) {   // first open ring spot round the building
      const a = k * Math.PI / 4, d = reach + r * 1.5, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!townBlockersIn(state.frontier, x, z, x, z, data).length) { u.x = x; u.z = z; return; }
    }
  }

  function command(e, c) {
    if (c.action !== 'garrison') return false;
    if (c.structure) return zoneCommand(e, c);   // 7c-3b: a house, workshop or farmhouse
    const R = rules();
    const s = typeof c.town === 'string' ? world.settlement(c.town) : null;
    if (!R || !s || s.capital) return receipt(e, c, false, 'no such town');
    if (s.owner == null || s.owner !== e.owner) return receipt(e, c, false, 'not your town');
    const fs = forts(s).filter(b => c.building == null || b.id === c.building);
    if (!fs.length) return receipt(e, c, false, 'no finished stockade');
    if (c.mode === 'leave') {
      const ids = Array.isArray(c.units) && c.units.length ? new Set(c.units) : null;
      for (const b of fs) {
        for (const u of membersIn(s, b)) if (!ids || ids.has(u.id) || ids.has(u.worker)) release(s, u, b);
        const [cx, cz] = centre(s, b);
        for (const u of inZone(keyOf(s, b))) if (!ids || ids.has(u.id)) outAt(u, cx, cz, (s.grid?.cell || 10) * 1.5);
      }
      return receipt(e, c, true);
    }
    if (c.mode !== 'enter') return receipt(e, c, false, 'enter or leave');
    const at = new Map(fs.map(b => [b.id, centre(s, b)])), room = new Map(fs.map(b => [b.id, R.capacity - usedIn(s, b)]));
    let taken = 0, far = 0, walking = 0, full = false;
    for (const id of Array.isArray(c.units) ? c.units : []) {
      const u = state.entities[id];
      if (!u || (u.owner ?? u.workerOwner) !== e.owner || u.garrison || u.dead || u.downed || u.jailed || u.place !== 'world') continue;
      if ((u.type === 'civilian' && !u.worker) || u.wild || u.cop || u.cavalry) continue;
      // war troops hold it the structure way (they shoot out, 8d-9); the hero, crew and workers shelter as before
      const troop = !!u.warTroop && !!structs;
      if (troop && !troopOk(u, e.owner)) continue;
      // the nearest of the town's stockades that still has room (else the nearest)
      const near = fs.map(b => ({ b, d: Math.hypot(u.x - at.get(b.id)[0], u.z - at.get(b.id)[1]) })).sort((x, y) => (room.get(y.b.id) > 0 ? 1 : 0) - (room.get(x.b.id) > 0 ? 1 : 0) || x.d - y.d || (x.b.id < y.b.id ? -1 : 1))[0];
      const b = near.b, [cx, cz] = at.get(b.id), st = troop ? zoneSt(keyOf(s, b)) : null;
      if (troop && !st) continue;
      if (near.d > R.range) {
        // right-click on the stockade (2026-11-07): far units walk over and go in when they arrive
        if (c.walk && !u.worker && !u.aboard) { u.order = { kind: 'move', x: cx, z: cz, garrisonGo: s.id, ...(troop ? { garrisonKey: st.key } : { garrisonB: b.id }) }; delete u.attackTarget; walking++; } else far++;
        continue;
      }
      if (room.get(b.id) <= 0) { full = true; continue; }
      if (troop) admitZone(u, st); else admit(s, b, u, [cx, cz]);
      room.set(b.id, room.get(b.id) - 1); taken++;
    }
    if (full && !walking) return receipt(e, c, taken > 0, 'stockade is full');
    if (!taken && !walking) return receipt(e, c, false, far ? 'move closer to the stockade' : 'nobody can go in');
    return receipt(e, c, true);
  }

  function admit(s, b, u, [cx, cz]) {
    if (u.mounted || u.ride?.kind === 'horse') dismount(u);
    u.garrison = { town: s.id, building: b.id, key: keyOf(s, b), heal: rules().healFactor };
    delete u.order; delete u.swing; delete u.attackTarget;
    const w = workerOf(s, u);
    if (w) { w.garrison = true; w.garrisonIn = b.id; w.order = { kind: 'hold' }; w.spot = null; w.trip = null; w.project = null; w.nextOrder = null; w.departure = [cx, cz]; }
  }

  // a hit on a sheltered unit: the stockade takes the damage; true when it was absorbed
  function shelter(u, damage, by = null) {
    const g = u.garrison, s = g && world.settlement(g.town), b = s?.buildings?.find(x => x.id === g.building && finished(s, x));
    if (g?.hall) return true;
    if (g?.zone) {   // 7c-3b: the house takes the hit, in a war on its town; otherwise nothing gets through
      const st = zoneSt(g.key); if (!st) return false;
      if (by && state.clans?.[by.owner] && (st.camp || (s && atWar(by.owner, s)))) structs.damage(by.owner, st, damage, 'melee');   // (structures.damage lets only the other side of the war through)
      return true;
    }   // workers sheltering in the town hall during a war (sim/frontier/structures.js): the hall takes it, unharmed
    if (!b) return false;
    const max = stockadeHp(data, s.tier);
    if (!max) return true;   // no building health set: the stockade cannot be broken
    // a clan's hits reach the stockade only in a war on this town (checkpoint 6); bandits and the like as before
    if (by && state.clans?.[by.owner] && !atWar(by.owner, s)) return true;
    b.hp = Math.max(0, (b.hp ?? max) - Math.max(0, damage || 0));
    b.hitAt = state.tick ?? 0;
    if (b.hp > 0) return true;
    // broken: ruined (the governor rebuilds it) and everyone inside piles out round it
    b.stage = 'ruined'; delete b.hp;
    const key = keyOf(s, b);
    breakOut(s, b); breakOutKey(key);
    return true;
  }
  // the stockade fell: everyone inside piles out round it (the troops by breakOutKey)
  function breakOut(s, b) { const first = stockadeOf(s)?.id ?? b.id; for (const m of members(s)) if ((m.sleeping ? m.building ?? first : m.garrison?.building) === b.id) release(s, m, b); }

  // every tick: garrisoned units stand at the stockade; a stockade that is gone lets them out
  function tick() {
    for (const s of Object.values(state.frontier?.settlements || {})) for (const w of s.workers || []) {   // a woken garrisoned worker is put back inside
      const u = w.garrison && state.entities?.[w.entity];
      const b = u && !u.garrison ? forts(s).find(x => x.id === w.garrisonIn) || stockadeOf(s) : null;
      if (b) u.garrison = { town: s.id, building: b.id, key: keyOf(s, b), heal: rules()?.healFactor || 1 };
    }
    for (const u of Object.values(state.entities || {})) {   // units sent by right-click go in once they are within range
      const go = u.order?.garrisonGo; if (!go || u.garrison) continue;
      if (u.order.garrisonKey) {   // 7c-3b: walking to a house
        const st = zoneSt(u.order.garrisonKey);
        if (!st || !zoneOk(st) || st.owner !== u.owner || u.dead || u.downed || u.jailed) { delete u.order.garrisonGo; delete u.order.garrisonKey; continue; }
        if (Math.hypot(u.x - st.x, u.z - st.z) <= rangeOf(st) - 1 || u.order.arrived) {
          if (Math.hypot(u.x - st.x, u.z - st.z) <= rangeOf(st) + 2 && inZone(st.key).length < capOf(st)) admitZone(u, st); else { delete u.order.garrisonGo; delete u.order.garrisonKey; }
        }
        continue;
      }
      const s = world.settlement(go), R = rules();
      // the stockade it was sent to; when that one is gone or full, the nearest of the town's with room
      const b = s && R ? forts(s).map(x => ({ x, c: centre(s, x) })).sort((p, q) => (q.x.id === u.order.garrisonB ? 1 : 0) - (p.x.id === u.order.garrisonB ? 1 : 0) || Math.hypot(u.x - p.c[0], u.z - p.c[1]) - Math.hypot(u.x - q.c[0], u.z - q.c[1]))
        .find(p => usedIn(s, p.x) < R.capacity)?.x || forts(s).find(x => x.id === u.order.garrisonB) || stockadeOf(s) : null;
      if (!s || !b || !R || s.owner !== (u.owner ?? u.workerOwner) || u.dead || u.downed || u.jailed) { if (u.order) { delete u.order.garrisonGo; delete u.order.garrisonB; } continue; }
      const [cx, cz] = centre(s, b);
      if (b.id !== u.order.garrisonB && u.order.garrisonB != null) { u.order = { kind: 'move', x: cx, z: cz, garrisonGo: s.id, garrisonB: b.id }; continue; }
      if (Math.hypot(u.x - cx, u.z - cz) <= R.range - 2 || u.order.arrived) {
        if (Math.hypot(u.x - cx, u.z - cz) <= R.range && usedIn(s, b) < R.capacity) admit(s, b, u, [cx, cz]); else { delete u.order.garrisonGo; delete u.order.garrisonB; }
      }
    }
    for (const u of Object.values(state.entities || {})) {
      const g = u.garrison; if (!g || g.hall) continue;   // hall shelter is run by sim/frontier/structures.js
      if (g.zone) {
        const st = zoneSt(g.key);
        if (u.dead || u.downed || u.jailed) { delete u.garrison; continue; }
        if (!st || st.owner !== u.owner) { outAt(u, g.x ?? u.x, g.z ?? u.z); continue; }
        u.x = st.x; u.z = st.z; u.anim = 'idle'; delete u.order; delete u.attackTarget;
        continue;
      }
      const s = world.settlement(g.town), b = s?.buildings?.find(x => x.id === g.building && finished(s, x));
      if (!s || s.owner !== (u.owner ?? u.workerOwner) || !b) { delete u.garrison; const w = s && workerOf(s, u); if (w) { delete w.garrison; delete w.garrisonIn; delete w.order; } continue; }
      if (u.dead || u.downed || u.jailed) { delete u.garrison; continue; }
      const [cx, cz] = centre(s, b);
      u.x = cx; u.z = cz; u.anim = 'idle';
      delete u.order; delete u.attackTarget;
    }
  }
  return { command, tick, members, membersIn, usedIn, going, forts, keyOf, capOf, rangeOf, capacity, shelter, breakOut, breakOutKey, inZone, zoneOk, defendIn, setStructures: s => { structs = s; } };
}
