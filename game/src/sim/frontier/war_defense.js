// War checkpoint 8b-2 (Tim 2026-11-15): the defending town trains troops.
// The defender has its own war chest on the war record (war.defense = { chest, put }), filled from the town's coffers
// with a typeable box at any time while the war is on (command warChestTown { war, amount }). Clan treasury money
// reaches it only by train (8e). Built military buildings in the town (and its stable, for cavalry) train the units
// war.units lists for their type, paid from that chest, after the muster: war.town.musterSeconds after the war was
// declared (commands townTrain { war, building, unit, count }, townUntrain { war, building }). Queues live on the town
// building (b.queue = [{ unit, left, paid }]) and train war.town.trainSpeed times as fast as at a camp. Troop cap: the
// same as a camp's (war.troopCap base + each built supply tents' cap, at most max), counting the defender's troops
// alive and queued. A finished troop comes out on the building's side facing the war camp, a war troop of the
// defender (fights, is held in the war circle, routs and fades at the end like the attacker's).
// When the war ends the chest and the ryo of every queued troop go back to the town coffers, before any outcome
// (settle), so a sack takes its share of it and a capture hands it over with the town.
import { cellToWorld } from './town_grid.js';
import { debitRyo, creditRyo } from '../treasury.js';

export function createWarDefense({ state, data, war, world }) {
  const W = data.war || {}, T = () => W.town || {}, BD = () => W.buildings || {}, UD = () => W.units || {};
  const f = () => state.frontier;
  const town = id => f()?.settlements?.[id] || null;
  const nice = t => (t || '').replace(/_/g, ' ');
  const round = n => Math.round(n * 100) / 100;
  const def = w => (w.defense ||= { chest: 0, put: 0 });
  const musterEnd = w => (w.started ?? 0) + Math.round((T().musterSeconds ?? 0) * 20);
  // Z6 (2026-11-20): a besieged castle trains from minute one (no muster) and pays from the Clan treasury: its war
  // chest IS the treasury (a castle's ryo is the clan's), so nothing is put in and nothing goes back at the end
  const isCastle = w => !!town(w?.town)?.castle;
  const clanOf = w => state.clans?.[w.defender] || null;
  const musterLeft = w => isCastle(w) ? 0 : Math.max(0, musterEnd(w) - (state.tick ?? 0));
  const chestOf = w => isCastle(w) ? Math.max(0, clanOf(w)?.ryo ?? 0) : def(w).chest;
  function spend(w, n) {   // n > 0 out of the chest, n < 0 back into it
    if (!isCastle(w)) { def(w).chest = round(def(w).chest - n); return; }
    const c = clanOf(w); if (!c) return;
    if (n > 0) debitRyo(state, c, n, 'castle defence', { war: w.id }); else if (n < 0) creditRyo(state, c, -n, 'castle defence', { war: w.id });
  }
  const ticksOf = (clan, unit) => Math.max(1, Math.round(war.ticksOf(clan, unit) / Math.max(0.01, T().trainSpeed ?? 1)));
  const centre = (s, b) => { const pts = (b.cells?.length ? b.cells : [b.cell]).map(i => cellToWorld(s, i)); return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]; };
  // the town's buildings that train in this war: built military ones, and the stable once the town hall war upgrade is
  // done (cavalry need the upgrade, as at a camp)
  const trains = (s, b, clan) => b.stage === 'built' && war.trainsAt(b.type, clan).length > 0 && (data.buildings?.[b.type]?.military || (b.type === 'stable' && !!s.warHall));
  const slotsOf = u => Math.max(1, UD()[u]?.slots ?? 1);   // troop places a unit takes (Tim 2026-11-21)
  const troopsOf = w => Object.values(state.entities || {}).filter(e => e.warTroop === w.id && e.owner === w.defender && !e.dead).reduce((n, e) => n + slotsOf(e.warUnit), 0) + (war.crewIn?.(w, w.defender) || 0);   // hero crew in the circle count too
  const queuedOf = (w, s) => (s?.buildings || []).reduce((n, b) => n + (b.queue || []).reduce((m, q) => m + slotsOf(q.unit), 0), 0);
  function troopCap(w, s) {
    const C = W.troopCap || {}, tents = (s?.buildings || []).filter(b => b.stage === 'built').reduce((n, b) => n + (data.buildings?.[b.type]?.military ? BD()[b.type]?.cap || 0 : 0), 0);
    return Math.min(C.max ?? Infinity, (C.base ?? 0) + tents);
  }
  const mine = (e, w) => !!w && !!e && e.owner === w.defender;

  // ---- the defender's war chest ------------------------------------------------------------
  function chestIn(e, c) {
    const w = war.byId(c.war), s = w && town(w.town);
    if (!mine(e, w) || !s) return { ok: false, reason: 'Not a war on your town' };
    if (s.owner !== w.defender) return { ok: false, reason: 'Not your town' };
    if (s.castle) return { ok: false, reason: 'A castle pays from the Clan treasury' };
    const n = c.amount;
    if (!Number.isSafeInteger(n) || n < 1) return { ok: false, reason: 'amount must be a positive whole number' };
    if ((s.stock?.ryo ?? 0) < n) return { ok: false, reason: `The town coffers have only ${Math.floor(s.stock?.ryo ?? 0)} ryo` };
    world.change(s.id, 'ryo', -n, 'war chest');
    const d = def(w); d.chest = round(d.chest + n); d.put = round(d.put + n);
    return { ok: true };
  }

  // ---- training ----------------------------------------------------------------------------------
  function trainWhy(w, s, b, unit, n) {
    if (w.terms) return 'A ceasefire is on: the war is ending';   // 8c
    if (b?.type === 'stable' && b.stage === 'built' && !s.warHall) return 'Cavalry need the town hall war upgrade';
    if (!b || !trains(s, b, w.defender)) return 'No such finished military building in the town';
    if (!war.trainsAt(b.type, w.defender).includes(unit)) return `The ${nice(b.type)} does not train that`;
    const left = musterLeft(w);
    if (left > 0) return `Mustering: training opens in ${Math.ceil(left / 20)} s`;
    if (!Number.isSafeInteger(n) || n < 1) return 'count must be a positive integer';
    if ((b.queue?.length || 0) + n > (W.queueMax ?? 20)) return `At most ${W.queueMax ?? 20} waiting at one building`;
    const room = troopCap(w, s) - troopsOf(w) - queuedOf(w, s), need = n * slotsOf(unit);
    if (need > room) return room > 0 ? (need === n ? `Troop cap: room for ${room} more` : `Troop cap: ${need} places needed, ${room} free`) : `Troop cap reached (${troopCap(w, s)}): build supply tents for more`;
    const cost = war.ryoOf(w.defender, unit) * n, chest = chestOf(w);
    if (chest < cost) return `Needs ${cost} ryo from the ${s.castle ? 'Clan treasury' : 'war chest'} (it has ${Math.floor(chest)})`;
    return null;
  }
  function townTrain(e, c) {
    const w = war.byId(c.war), s = w && town(w.town);
    if (!mine(e, w) || !s || s.owner !== w.defender) return { ok: false, reason: 'Not a war on your town' };
    const b = (s.buildings || []).find(x => x.id === c.building);
    const why = trainWhy(w, s, b, c.unit, c.count);
    if (why) return { ok: false, reason: why };
    const each = war.ryoOf(w.defender, c.unit);
    spend(w, each * c.count);
    b.queue ||= [];
    for (let i = 0; i < c.count; i++) b.queue.push({ unit: c.unit, left: ticksOf(w.defender, c.unit), paid: each, war: w.id });
    return { ok: true };
  }
  function townUntrain(e, c) {
    const w = war.byId(c.war), s = w && town(w.town);
    if (!mine(e, w) || !s) return { ok: false, reason: 'Not a war on your town' };
    const b = (s.buildings || []).find(x => x.id === c.building), q = b?.queue?.pop();
    if (!q) return { ok: false, reason: 'Nothing waiting there' };
    if (!b.queue.length) delete b.queue;
    spend(w, -(q.paid ?? 0));
    return { ok: true };
  }

  // one sim tick: the first troop of each queue counts down and comes out
  function tick(runtime) {
    for (const w of war.active()) {
      const s = town(w.town);
      if (!s?.grid || s.owner !== w.defender) continue;
      const camp = w.camp?.buildings?.find(b => b.type === 'camp_hall') || w.camp || w;
      for (const b of s.buildings || []) {
        const q = b.queue?.[0];
        if (!q || b.stage !== 'built') continue;
        if (q.left > 0) q.left--;
        if (q.left > 0 || !runtime?.spawn) continue;   // bare tests: a ready troop waits at the front
        const [bx, bz] = centre(s, b), r = Math.sqrt((b.cells || [b.cell]).length) * (s.grid.cell || 11) / 2 + 2;
        const a = Number.isFinite(camp.x) ? Math.atan2(camp.z - bz, camp.x - bx) : 0;
        const gx = bx + Math.cos(a) * (r + 6), gz = bz + Math.sin(a) * (r + 6), k = b.rally = ((b.rally || 0) % 24) + 1;
        const id = war.spawnTroop(w, q.unit, bx + Math.cos(a) * r, bz + Math.sin(a) * r, w.defender), e = state.entities[id];
        if (e) e.order = { kind: 'move', x: gx + Math.cos(k * 2.4) * 1.3 * Math.sqrt(k), z: gz + Math.sin(k * 2.4) * 1.3 * Math.sqrt(k) };
        f().nextId++;
        b.queue.shift();
        if (!b.queue.length) delete b.queue;
      }
    }
  }

  // the end of a war: chest and queued ryo back to the town coffers (once)
  function settle(w) {
    const s = town(w.town);
    if (s?.castle) {   // queued troops' ryo back to the treasury; there is no separate chest
      let back = 0;
      for (const b of s.buildings || []) if (b.queue?.length) { back += b.queue.reduce((n, q) => n + (q.paid || 0), 0); delete b.queue; }
      back = Math.floor(back); if (back > 0) spend(w, -back);
      return back;
    }
    let back = w.defense?.chest || 0;
    for (const b of s?.buildings || []) if (b.queue?.length) { back += b.queue.reduce((n, q) => n + (q.paid || 0), 0); delete b.queue; }
    if (w.defense) w.defense.chest = 0;
    back = Math.floor(back);
    if (back > 0 && s) world.change(s.id, 'ryo', back, 'war chest returned');
    if (back > 0 && w.defense) w.defense.returned = (w.defense.returned || 0) + back;
    return back;
  }

  // read-only, for the screens and tests
  function view(warId) {
    const w = war.byId(warId), s = w && town(w.town);
    if (!w || !s) return null;
    const list = (s.buildings || []).filter(b => trains(s, b, w.defender)).map(b => ({ id: b.id, type: b.type, units: war.trainsAt(b.type, w.defender).map(u => ({ unit: u, ryo: war.ryoOf(w.defender, u), seconds: ticksOf(w.defender, u) / 20 })), queue: (b.queue || []).map(q => ({ unit: q.unit, left: q.left })) }));
    return { chest: Math.floor(chestOf(w)), treasury: !!s.castle, put: Math.floor(w.defense?.put || 0), coffers: Math.floor(s.stock?.ryo || 0), muster: Math.ceil(musterLeft(w) / 20), troops: troopsOf(w), queued: queuedOf(w, s), cap: troopCap(w, s), buildings: list };
  }

  function command(e, c) {
    const fn = { warChestTown: chestIn, townTrain, townUntrain }[c.action];
    if (!fn) return null;
    return fn(e, c);
  }
  return { command, tick, settle, view, trainWhy: (warId, building, unit, count) => { const w = war.byId(warId), s = w && town(w.town); return w && s ? trainWhy(w, s, s.buildings.find(b => b.id === building), unit, count) : 'No such war'; }, troopCap: warId => { const w = war.byId(warId); return w ? troopCap(w, town(w.town)) : 0; } };
}
