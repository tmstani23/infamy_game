// Stockade garrison (Tim 2026-11-06). Your hero, crew and workers can shelter inside a finished
// stockade: they cannot be attacked, they heal data.buildings.stockade.garrison.healFactor times faster
// (sim/stats.js reads e.garrison.heal) and they stand idle at the building until sent out.
// Command (through the frontier hub): { id: <hero id>, type: 'frontier', action: 'garrison', mode: 'enter' | 'leave',
// town: <settlement id>, units: [entity ids] } (leave with no units = everyone). Receipts as for other frontier commands.
// Hits on anyone inside go to the stockade instead (garrison.hp, Tim 2026-11-06): area attacks such as
// dynamite or a cleave cannot reach the people. At 0 the stockade is ruined and everyone piles out;
// the town governor rebuilds it on the same spot. Enemies attacking the building itself waits for F7 sieges.
// createGarrison({ state, data, world }) -> { command, tick, members, capacity, shelter }
import { cellToWorld, townBlockersIn } from './town_grid.js';

export function createGarrison({ state, data, world }) {
  const rules = () => data.buildings?.stockade?.garrison || null;
  const finished = (s, b) => b.type === 'stockade' && b.stage === 'built';
  const stockadeOf = s => (s.buildings || []).find(b => finished(s, b)) || null;
  // world centre of a building's cells
  function centre(s, b) {
    const pts = (b.cells?.length ? b.cells : [b.cell]).map(i => cellToWorld(s, i));
    return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  }
  const workerOf = (s, u) => u.worker ? s.workers?.find(w => w.id === u.worker) : null;
  // everyone inside: garrisoned entities plus sleeping garrisoned workers that have no entity right now
  const members = (s) => {
    const out = Object.values(state.entities || {}).filter(e => e.garrison?.town === s.id);
    for (const w of s.workers || []) if (w.garrison && !state.entities?.[w.entity]) out.push({ id: 'w:' + w.id, worker: w.id, sleeping: true });
    return out;
  };
  const capacity = () => rules()?.capacity || 0;

  function receipt(e, c, ok, reason = '') {
    const fr = state.frontier;
    fr.receiptSeq = (fr.receiptSeq || 0) + 1;
    fr.receipts.push({ seq: fr.receiptSeq, tick: state.tick ?? 0, clan: e.owner ?? null, action: c.action, ok, reason });
    return true;
  }

  function release(s, u, b) {
    if (u.sleeping) { const w = s.workers.find(x => x.id === u.worker); if (w) { delete w.garrison; delete w.order; } return; }
    delete u.garrison;
    const w = workerOf(s, u);
    if (w) { delete w.garrison; delete w.order; }
    if (!b) return;
    const [cx, cz] = centre(s, b), g = s.grid, reach = (g?.cell || 10) * 1.5;
    for (let r = 0; r < 6; r++) for (let k = 0; k < 8; k++) {   // first open ring spot round the building
      const a = k * Math.PI / 4, d = reach + r * 1.5, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!townBlockersIn(state.frontier, x, z, x, z, data).length) { u.x = x; u.z = z; return; }
    }
  }

  function command(e, c) {
    if (c.action !== 'garrison') return false;
    const R = rules();
    const s = typeof c.town === 'string' ? world.settlement(c.town) : null;
    if (!R || !s || s.capital) return receipt(e, c, false, 'no such town');
    if (s.owner == null || s.owner !== e.owner) return receipt(e, c, false, 'not your town');
    const b = stockadeOf(s);
    if (!b) return receipt(e, c, false, 'no finished stockade');
    const inside = members(s);
    if (c.mode === 'leave') {
      const ids = Array.isArray(c.units) && c.units.length ? new Set(c.units) : null;
      for (const u of inside) if (!ids || ids.has(u.id) || ids.has(u.worker)) release(s, u, b);
      return receipt(e, c, true);
    }
    if (c.mode !== 'enter') return receipt(e, c, false, 'enter or leave');
    const [cx, cz] = centre(s, b);
    let room = R.capacity - inside.length, taken = 0, far = 0, walking = 0;
    for (const id of Array.isArray(c.units) ? c.units : []) {
      const u = state.entities[id];
      if (!u || (u.owner ?? u.workerOwner) !== e.owner || u.garrison || u.dead || u.downed || u.jailed || u.place !== 'world') continue;
      if ((u.type === 'civilian' && !u.worker) || u.wild || u.cop) continue;
      if (Math.hypot(u.x - cx, u.z - cz) > R.range) {
        // right-click on the stockade (Tim 2026-11-07): far units walk over and go in when they arrive
        if (c.walk && !u.worker && !u.aboard && !u.mounted) { u.order = { kind: 'move', x: cx, z: cz, garrisonGo: s.id }; delete u.attackTarget; walking++; } else far++;
        continue;
      }
      if (room <= 0) return receipt(e, c, taken > 0, 'stockade is full');
      admit(s, b, u, [cx, cz]); room--; taken++;
    }
    if (!taken && !walking) return receipt(e, c, false, far ? 'move closer to the stockade' : 'nobody can go in');
    return receipt(e, c, true);
  }

  function admit(s, b, u, [cx, cz]) {
    u.garrison = { town: s.id, building: b.id, heal: rules().healFactor };
    delete u.order; delete u.swing; delete u.attackTarget;
    const w = workerOf(s, u);
    if (w) { w.garrison = true; w.order = { kind: 'hold' }; w.spot = null; w.trip = null; w.project = null; w.nextOrder = null; w.departure = [cx, cz]; }
  }

  // a hit on a sheltered unit: the stockade takes the damage; true when it was absorbed
  function shelter(u, damage) {
    const g = u.garrison, s = g && world.settlement(g.town), b = s?.buildings?.find(x => x.id === g.building && finished(s, x));
    if (!b) return false;
    const max = rules()?.hp || 0;
    if (!max) return true;   // no building health set: the stockade cannot be broken
    b.hp = Math.max(0, (b.hp ?? max) - Math.max(0, damage || 0));
    b.hitAt = state.tick ?? 0;
    if (b.hp > 0) return true;
    // broken: ruined (the governor rebuilds it) and everyone inside piles out round it
    b.stage = 'ruined'; delete b.hp;
    for (const m of members(s)) if (m.sleeping || m.garrison?.building === b.id) release(s, m, b);
    return true;
  }

  // every tick: garrisoned units stand at the stockade; a stockade that is gone lets them out
  function tick() {
    for (const s of Object.values(state.frontier?.settlements || {})) for (const w of s.workers || []) {   // a woken garrisoned worker is put back inside
      const u = w.garrison && state.entities?.[w.entity];
      if (u && !u.garrison && stockadeOf(s)) u.garrison = { town: s.id, building: stockadeOf(s).id, heal: rules()?.healFactor || 1 };
    }
    for (const u of Object.values(state.entities || {})) {   // units sent by right-click go in once they are within range
      const go = u.order?.garrisonGo; if (!go || u.garrison) continue;
      const s = world.settlement(go), b = s && stockadeOf(s), R = rules();
      if (!s || !b || !R || s.owner !== (u.owner ?? u.workerOwner) || u.dead || u.downed || u.jailed) { if (u.order) delete u.order.garrisonGo; continue; }
      const [cx, cz] = centre(s, b);
      if (Math.hypot(u.x - cx, u.z - cz) <= R.range - 2 || u.order.arrived) {
        if (Math.hypot(u.x - cx, u.z - cz) <= R.range && members(s).length < R.capacity) admit(s, b, u, [cx, cz]); else delete u.order.garrisonGo;
      }
    }
    for (const u of Object.values(state.entities || {})) {
      const g = u.garrison; if (!g) continue;
      const s = world.settlement(g.town), b = s?.buildings?.find(x => x.id === g.building && finished(s, x));
      if (!s || s.owner !== (u.owner ?? u.workerOwner) || !b) { delete u.garrison; const w = s && workerOf(s, u); if (w) { delete w.garrison; delete w.order; } continue; }
      if (u.dead || u.downed || u.jailed) { delete u.garrison; continue; }
      const [cx, cz] = centre(s, b);
      u.x = cx; u.z = cz; u.anim = 'idle';
      delete u.order; delete u.attackTarget;
    }
  }
  return { command, tick, members, capacity, shelter };
}
