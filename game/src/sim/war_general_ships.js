// Ships S9 (plan war_build/ships/ships_plan.md 1.11, war_build/ships/s9/plan.md): the general's ships. A part of the
// general's brain (sim/war_general_brain.js): it only reads the state and sends the commands a player sends.
// Numbers: frontier.json war.general.ships (placeholders). Per war and side, in the brain's memory (saved): m.sea =
// { look, worth, party: { shipId: [ids] }, land: { stage, ship, ids, at, rest } }.
// - worth(w, side): is there anything for ships to do in this war (looked at every lookSeconds): enemy targets within
//   gun range of water its ships can reach in the circle, enemy ships, or (attacker) a landing past the walls or much
//   nearer the town hall than the camp.
// - yard: the slipway goes into the camp's plan once a barracks stands (slipWanted, slipSpot); a rival's town at war
//   builds a shipyard by its harbour (yardWanted, yardCell). A player's town at war builds nothing new (2026-11-22).
// - train: byStrategy ships, one at a time, once the army has `after` troops.
// - use: warships mend at their yard, board, go at enemy ships, shell, else lie at the yard; transports land troops.
// - detached(): troops in a boarding or landing party, which the land army leaves alone.
import { waterGrid, nearestSailable, landingFor, shipPath } from './frontier/water_nav.js';
import { ringRadius, cellToWorld } from './frontier/town_grid.js';

export function createGeneralShips(game, { clan, memory, rules, strategy, campHall, pickTarget, attackA }) {
  const state = game.state, F = () => game.frontier, W = () => F().data.war || {};
  const SH = () => rules().ships || {};
  const on = () => !!game.ships?.world?.terrain;
  const grid = () => waterGrid(game.ships.world);
  const now = () => state.tick ?? 0;
  const town = id => state.frontier?.settlements?.[id] || null;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const foeOf = w => w.attacker === clan ? w.defender : w.attacker;
  const live = s => !!s && s.ship && !s.dead && (s.hp ?? 1) > 0 && !s.leave && !s.rout;
  const shipsOf = (w, owner) => Object.values(state.entities).filter(s => live(s) && s.owner === owner && s.warTroop === w.id);
  const riders = s => game.ships.riders(s);
  const coming = s => Object.values(state.entities).some(u => u.boardShip === s.id && !u.dead);
  const boxOf = w => { const t = town(w.town); return t ? { x: t.x, z: t.z, r: (W().circleRadius ?? 900) - 10 } : null; };
  const range = () => (W().ships?.guns?.broadside?.range ?? 32) - (SH().shellMargin ?? 6);
  const wantOf = side => SH().byStrategy?.[strategy()]?.[side === 'attacker' ? 'attack' : 'defend'] || {};
  const sea = (w, side) => (memory(w, side).sea ||= {});

  // the side's yard: the camp's built slipway, the town's built shipyard ({ x, z, b }) or null
  function yardOf(w, side) {
    if (side === 'attacker') { const b = w.camp?.buildings?.find(x => x.type === 'slipway' && x.stage === 'built'); return b ? { x: b.x, z: b.z, b } : null; }
    const t = town(w.town), b = t?.owner === clan && (t.buildings || []).find(x => x.type === 'shipyard' && x.stage === 'built');
    if (!b) return null;
    const pts = (b.cells?.length ? b.cells : [b.cell]).map(i => cellToWorld(t, i));
    return { x: pts.reduce((n, p) => n + p[0], 0) / pts.length, z: pts.reduce((n, p) => n + p[1], 0) / pts.length, b };
  }
  // where the side's ships start from: its yard, else the camp hall (attacker) or the harbour (defender)
  function baseOf(w, side) {
    const y = yardOf(w, side); if (y) return y;
    if (side === 'attacker') return campHall(w);
    const t = town(w.town), h = game.ships.world.sites?.find(x => x.id === t?.site)?.harbor;
    return h ? { x: h.x, z: h.z } : t;
  }
  // the water a ship lies at beside a point of the base (its berth), or null
  const berthBy = (w, p) => { const L = p && landingFor(grid(), p.x, p.z, 'big', { box: boxOf(w), maxR: 400 }); return L?.berth ? L : null; };

  // what the enemy has within gun range of water: [{ st, at }] nearest the base first
  function targets(w, side) {
    const S = F().structures, weights = W().morale?.weights || {}, g = grid(), box = boxOf(w), R = range();
    const mine = side === 'attacker'
      ? st => st.town === w.town && !st.camp && st.kind === 'building' && (st.type === 'town_hall' || st.military || st.type === 'shipyard' || weights[st.type])
      : st => st.camp && st.war === w.id && st.kind === 'building' && (st.type === 'camp_hall' || st.type === 'slipway' || st.military || weights[st.type]);
    const out = [];
    for (const st of S.list()) {
      if (!mine(st) || S.hpOf(st) <= 0) continue;
      const at = nearestSailable(g, st.x, st.z, 'big', R + (st.r || 0), box);
      if (at) out.push({ st, at });
    }
    const b = baseOf(w, side) || town(w.town);
    return out.sort((a, c) => dist(a.at, b) - dist(c.at, b) || (a.st.key < c.st.key ? -1 : 1));
  }
  // can ships from the base reach water spot p (cached per war and side for a lookSeconds)
  function reach(w, side, p) {
    const m = sea(w, side), key = `${Math.round(p.x)},${Math.round(p.z)}`;
    m.reach ||= {};
    if (key in m.reach) return m.reach[key];
    const from = berthBy(w, baseOf(w, side))?.berth;
    return (m.reach[key] = !!from && !!shipPath(grid(), [from.x, from.z], [p.x, p.z], { box: boxOf(w) }));
  }
  // the attacker's landing: the shore nearest the town on the side away from the camp (else the nearest at all), when
  // it lands past the walls (inside the ring) or nearer the hall than landShorter times the camp hall's distance
  function landing(w) {
    const t = town(w.town), hall = campHall(w); if (!t || !hall) return null;
    const g = grid(), box = boxOf(w), ring = ringRadius(t, F().data), d = dist(t, hall) || 1;
    const away = { x: t.x + (t.x - hall.x) / d * ring * 0.7, z: t.z + (t.z - hall.z) / d * ring * 0.7 };
    const tries = [landingFor(g, away.x, away.z, 'big', { box, maxR: ring }), landingFor(g, t.x, t.z, 'big', { box, maxR: ring + (SH().landReach ?? 250) })];
    for (const L of tries) {
      if (!L?.berth) continue;
      const near = dist(L.land, t), walled = F().structures.list().some(st => st.town === w.town && !st.camp && (st.kind === 'wall' || st.kind === 'gate'));
      if ((walled && near < ring - 10) || near < (SH().landShorter ?? 0.6) * d) return L;
    }
    return null;
  }
  // is there anything for ships to do in this war: { shell, land, foes, any }; looked at every lookSeconds
  function worth(w, side) {
    if (!on()) return { any: false };
    const m = sea(w, side), every = Math.round((SH().lookSeconds ?? 30) * 20);
    if (m.worth && now() - (m.look ?? -1e9) < every) return m.worth;
    m.look = now(); m.reach = {};
    const shell = targets(w, side).filter(o => reach(w, side, o.at)).slice(0, 8).map(o => o.st.key);
    const L = side === 'attacker' ? landing(w) : null, land = L && reach(w, side, L.berth) ? { land: L.land, berth: L.berth } : null;
    const foes = shipsOf(w, foeOf(w)).length;
    return (m.worth = { shell, land, foes, any: !!(shell.length || land || foes) });
  }

  // ---- yards --------------------------------------------------------------------------------------------------------
  // the camp's plan takes a slipway (after a barracks stands) while ships have work and the strategy trains any
  function slipWanted(w) {
    if (!w.camp?.buildings?.some(b => b.type === 'barracks' && b.stage === 'built')) return false;
    if (w.camp.buildings.some(b => b.type === 'slipway')) return false;   // (a ruin is rebuilt in place by the plan's ruin rule)
    return Object.values(wantOf('attacker')).some(n => n > 0) && worth(w, 'attacker').any;
  }
  // a spot for it: on the shore nearest the camp hall (rings round the nearest landable shore), never in the town ring
  function slipSpot(w) {
    const War = F().war, hall = campHall(w), t = town(w.town), g = grid(), box = boxOf(w);
    const starts = [hall, { x: (hall.x + t.x) / 2, z: (hall.z + t.z) / 2 }].map(p => landingFor(g, p.x, p.z, 'big', { box, maxR: 600 })?.land).filter(Boolean);
    for (const p of starts) for (const r of [0, 8, 16, 24, 32]) for (let k = 0; k < (r ? 12 : 1); k++) {
      const a = k * Math.PI / 6, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (War.campCheck(w.id, 'slipway', { x, z })?.ok) return { x: Math.round(x), z: Math.round(z) };
    }
    return null;
  }
  // a rival's town at war: a shipyard while ships have work (one; the town must have water for it)
  function yardWanted(s, w) {
    if (!state.clans[clan]?.bot || w.defender !== clan || s.id !== w.town) return false;
    if ((s.buildings || []).some(b => b.type === 'shipyard') || (s.projects || []).some(p => p.type === 'shipyard')) return false;
    return Object.values(wantOf('defender')).some(n => n > 0) && worth(w, 'defender').any;
  }
  // the town grid cell for it, nearest the harbour (as the dev save places one)
  function yardCell(s) {
    const P = F().modules.find(x => x.name === 'placement')?.placement; if (!P || !s.grid) return null;
    const h = game.ships.world.sites?.find(x => x.id === s.site)?.harbor || s, n = s.grid.n;
    const cells = [...Array(n * n).keys()].map(i => { const [x, z] = cellToWorld(s, i); return { i, d: Math.hypot(x - h.x, z - h.z) }; }).sort((a, b) => a.d - b.d || a.i - b.i).slice(0, 400);
    for (const { i } of cells) if (P.check(s, { kind: 'shipyard', cells: [i] }).ok) return i;
    return null;
  }

  // ---- training -----------------------------------------------------------------------------------------------------
  // one ship at a time at the yard, up to the strategy's count of each, once the army has `after` troops
  function train(out, cmd, w, side, army) {
    const y = yardOf(w, side); if (!y || !worth(w, side).any || army < (SH().after ?? 6)) return;
    if ((y.b.queue || []).length) return;
    const want = wantOf(side), have = {};
    for (const s of shipsOf(w, clan)) have[s.warUnit] = (have[s.warUnit] || 0) + 1;
    const UD = W().units || {}, War = F().war;
    const order = Object.keys(want).filter(u => (have[u] || 0) < want[u] && (u !== 'transport' || (side === 'attacker' && worth(w, side).land)))
      .sort((a, b) => (have[a] || 0) / want[a] - (have[b] || 0) / want[b] || (a === 'warship' ? -1 : 1));
    const unit = order[0]; if (!unit) return;
    const cost = War.ryoOf(clan, unit), wood = UD[unit]?.timber || 0, slots = UD[unit]?.slots ?? 1;
    if (side === 'attacker') {
      const tv = War.troopView(w.id); if (!tv || tv.cap - tv.troops - tv.queued < slots) return;
      if ((w.camp.chest || 0) < cost || (w.camp.stock?.timber || 0) < wood) return;
      out.push(cmd({ action: 'campTrain', war: w.id, building: y.b.id, unit, count: 1 }));
    } else {
      const v = War.defense.view(w.id), t = town(w.town); if (!v || v.cap - v.troops - v.queued < slots) return;
      if (v.chest < cost || (t.stock?.timber || 0) < wood) return;
      out.push(cmd({ action: 'townTrain', war: w.id, building: y.b.id, unit, count: 1 }));
    }
  }

  // ---- parties -------------------------------------------------------------------------------------------------------
  // troops in a boarding or landing party of this clan (the land army leaves them alone)
  function detached(mem) {
    const out = new Set();
    for (const sides of Object.values(mem.wars || {})) for (const m of Object.values(sides || {})) {
      for (const ids of Object.values(m.sea?.party || {})) for (const id of ids) out.add(id);
      for (const id of m.sea?.land?.ids || []) out.add(id);
    }
    return out;
  }
  const fitsHold = (u, w) => { const N = W().ships?.notAboard || {}; return u.warTroop === w.id && u.owner === clan && !u.dead && !u.downed && !u.ship && !u.aboard && !u.boardShip && !u.garrison && u.place === 'world' && u.type !== 'hero' && !(N.types || []).includes(u.type) && !(N.groups || []).includes(W().units?.[u.warUnit]?.group); };
  // pick up to n troops of the land army nearest p (not already in a party)
  function pick(w, n, p, taken) {
    return Object.values(state.entities).filter(u => fitsHold(u, w) && !taken.has(u.id)).sort((a, b) => dist(a, p) - dist(b, p) || (a.id < b.id ? -1 : 1)).slice(0, n);
  }
  // the land army's troops a landing may take: all of them while it gathers, else those not in the push's wave
  const free = (w, army, taken) => Object.values(state.entities).filter(u => fitsHold(u, w) && !taken.has(u.id) && !(army.mode === 'push' && army.wave?.includes(u.id)));
  const shoreOf = s => game.ships.shoreOf(s);
  const goTo = (out, order, s, p, kind = 'move') => {
    const o = s.sorder || {};
    if (dist(s, p) < 12 && (o.kind || 'stay') === 'stay') return;   // there already
    if (Number.isFinite(o.x) && Math.hypot(o.x - p.x, o.z - p.z) < 12 && ['move', 'attackmove', 'land'].includes(o.kind)) return;
    out.push(order({ kind, units: [s.id], x: Math.round(p.x), z: Math.round(p.z) }));
  };

  // ---- use ------------------------------------------------------------------------------------------------------------
  // each review: every ship of the side its order. army: the land army's state for the landing ({ mode, count })
  function use(out, cmd, order, w, side, mem, army = {}) {
    if (!on()) return;
    const mine = shipsOf(w, clan); if (!mine.length) return;
    const m = sea(w, side), val = worth(w, side), foe = foeOf(w), G = SH();
    const base = baseOf(w, side), home = berthBy(w, base);
    const foes = shipsOf(w, foe);
    const taken = detached(mem);
    m.party ||= {};
    for (const [id, ids] of Object.entries(m.party)) { const s = state.entities[id]; m.party[id] = live(s) ? ids.filter(u => state.entities[u] && !state.entities[u].dead && (state.entities[u].aboard === s.id || state.entities[u].boardShip === s.id)) : []; if (!m.party[id].length) delete m.party[id]; }
    if (side === 'attacker') landStep(out, cmd, order, w, m, mine, home, val, army, taken);
    const loadTicks = Math.round((G.loadSeconds ?? 60) * 20);
    m.mend ||= {}; m.partyAt ||= {};
    for (const id of Object.keys(m.mend)) if (!live(state.entities[id])) delete m.mend[id];
    for (const id of Object.keys(m.partyAt)) if (!m.party[id]) delete m.partyAt[id];
    for (const s of mine) {
      if (s.locked || s.board || s.sorder?.kind === 'unload') continue;   // in a boarding, or unloading
      if (coming(s) && now() - (m.partyAt[s.id] ?? now()) <= loadTicks) continue;   // taking its party on (a late one is left behind when it sails)
      if (m.land?.ship === s.id) continue;   // the landing ship (landStep)
      const hurt = (s.hp ?? 1) < (s.maxHp ?? 1) * (G.mendBelow ?? 0.5), healed = (s.hp ?? 1) >= (s.maxHp ?? 1) * (G.mendTo ?? 0.9);
      if (hurt && yardOf(w, side)) m.mend[s.id] = true; else if (healed) delete m.mend[s.id];
      if (m.mend[s.id] && home) { if (dist(s, home.berth) > 15) goTo(out, order, s, home.berth); continue; }   // it lies at the yard and mends
      if (s.warUnit !== 'warship') { if (home && dist(s, home.berth) > 40) goTo(out, order, s, home.berth); continue; }
      // board a weakened enemy ship when its hold is clearly stronger (plan 1.7: generals board only so)
      const Bd = game.ships.boarding, edge = W().ships?.boarding?.generalEdge ?? 1.5;
      if (riders(s).length && Bd.canBoard(s)) {
        const t = foes.filter(x => { const p = Bd.preview(s, x); return p && p.weakened && p.room && p.ours >= edge * Math.max(1, p.theirs); }).sort((a, b) => dist(a, s) - dist(b, s) || (a.id < b.id ? -1 : 1))[0];
        if (t) { out.push(cmd({ type: 'special', ability: 'board', units: [s.id], x: Math.round(t.x * 100) / 100, z: Math.round(t.z * 100) / 100 })); continue; }
      }
      // a boarding party aboard while the enemy has ships: taken on at the yard's shore
      if (foes.length && !riders(s).length && !m.party[s.id] && shoreOf(s)) {
        const p = pick(w, Math.min(G.boardParty ?? 3, game.ships.holdOf(s)), shoreOf(s), taken);
        if (p.length) { m.party[s.id] = p.map(u => u.id); m.partyAt[s.id] = now(); p.forEach(u => taken.add(u.id)); out.push(cmd({ type: 'ship', action: 'board', ship: s.id, units: m.party[s.id] })); continue; }
      }
      // enemy ships: go at the nearest (the guns fire on their own, ships first)
      const f = foes.sort((a, b) => dist(a, s) - dist(b, s) || (a.id < b.id ? -1 : 1))[0];
      if (f) { goTo(out, order, s, f, 'attackmove'); continue; }
      // shell: the nearest target in range of water (the yard and the towers that can sink it are on that list too)
      const S = F().structures, list = val.shell.map(k => S.find?.(k)).filter(st => st && S.hpOf(st) > 0);
      const tg = list.map(st => ({ st, at: nearestSailable(grid(), st.x, st.z, 'big', range() + (st.r || 0), boxOf(w)) })).filter(o => o.at).sort((a, b) => dist(a.at, s) - dist(b.at, s) || (a.st.key < b.st.key ? -1 : 1))[0];
      if (tg) { goTo(out, order, s, tg.at, 'attackmove'); continue; }
      if (home && dist(s, home.berth) > 40) goTo(out, order, s, home.berth);   // else it lies by the yard
    }
  }

  // the attacker's landing (transports, else nothing): load at the camp shore while the army gathers, sail when it
  // pushes, land on the far shore, the party fights from there, then the ship comes back for the next
  function landStep(out, cmd, order, w, m, mine, home, val, army, taken) {
    const G = SH(), L = m.land ||= { stage: 'none' };
    let s = state.entities[L.ship];
    if (L.ship && !live(s)) { Object.assign(L, { stage: 'none', ship: null, ids: (L.ids || []).filter(id => { const u = state.entities[id]; return u && !u.dead && !u.aboard; }), rest: now() + Math.round((G.landRestSeconds ?? 60) * 20) }); if (L.ids.length) L.stage = 'ashore'; s = null; }
    L.ids = (L.ids || []).filter(id => state.entities[id] && !state.entities[id].dead);
    if (L.stage === 'ashore') { fight(out, order, w, L.ids); if (!L.ids.length) Object.assign(L, { stage: 'none', rest: now() + Math.round((G.landRestSeconds ?? 60) * 20) }); if (L.stage === 'ashore' && !L.ship) return; }
    if (L.stage === 'none') {
      if (!val.land || now() < (L.rest ?? 0) || !home) return;
      s = mine.filter(x => x.warUnit === 'transport' && !x.locked && !x.board && !riders(x).length).sort((a, b) => dist(a, home.berth) - dist(b, home.berth) || (a.id < b.id ? -1 : 1))[0];
      // while it gathers: any of the army, the army keeping landLeast; while it pushes: the reserve gathering at the camp
      const keepBack = army.mode === 'push' ? 0 : G.landLeast ?? 6;
      if (!s || free(w, army, taken).length < keepBack + 2) return;
      Object.assign(L, { stage: 'dock', ship: s.id, ids: [], at: now() });
    }
    if (L.stage === 'dock') {
      if (!shoreOf(s)) { if (now() - L.at > Math.round((G.landWaitSeconds ?? 120) * 20)) Object.assign(L, { stage: 'none', ship: null }); else goTo(out, order, s, home.berth); return; }
      const pool = free(w, army, taken), n = Math.min(G.landParty ?? 8, game.ships.holdOf(s), pool.length - (army.mode === 'push' ? 0 : G.landLeast ?? 6));   // the army keeps landLeast to gather
      const p = n >= 2 ? pool.sort((a, b) => dist(a, shoreOf(s)) - dist(b, shoreOf(s)) || (a.id < b.id ? -1 : 1)).slice(0, n) : [];
      if (!p.length) { Object.assign(L, { stage: 'none', ship: null }); return; }
      L.ids = p.map(u => u.id); L.stage = 'load'; L.at = now();
      out.push(cmd({ type: 'ship', action: 'board', ship: s.id, units: L.ids }));
      return;
    }
    if (L.stage === 'load') {
      const aboard = L.ids.filter(id => state.entities[id]?.aboard === s.id), walking = L.ids.filter(id => state.entities[id]?.boardShip === s.id);
      const late = now() - L.at > Math.round((G.loadSeconds ?? 60) * 20);
      if (walking.length && !late) return;
      L.ids = aboard;   // those who did not make it go back to the army
      if (!aboard.length) { Object.assign(L, { stage: 'none', ship: null, rest: now() + Math.round((G.landRestSeconds ?? 60) * 20) }); return; }
      L.stage = 'wait'; L.at = now();
    }
    if (L.stage === 'wait') {
      if (army.mode !== 'push' && !army.spent && now() - L.at < Math.round((G.landWaitSeconds ?? 120) * 20)) return;
      const to = val.land?.land || home?.land || s;   // (no landing any more: they step off at the camp shore and walk)
      L.stage = 'sail'; L.at = now(); L.to = { x: Math.round(to.x), z: Math.round(to.z) };
      out.push(order({ kind: 'move', units: [s.id], ...L.to, unload: true }));   // a spot on land: it sails to the shore there and they step off
      return;
    }
    if (L.stage === 'sail') {
      if (riders(s).length) {
        // too long on the way (a way that cannot be sailed): they land at the camp shore instead and walk
        const late = now() - L.at > Math.round((G.landWaitSeconds ?? 120) * 60) && home;
        if (late) { L.to = { x: Math.round(home.land.x), z: Math.round(home.land.z) }; L.at = now(); }
        if (late || !['land', 'unload'].includes(s.sorder?.kind)) out.push(order({ kind: 'move', units: [s.id], ...L.to, unload: true }));
        return;
      }
      L.stage = 'ashore'; L.ship = null;
      if (home) goTo(out, order, s, home.berth);   // back to the camp shore
      fight(out, order, w, L.ids);
    }
  }
  // the landed party goes for the strategy's targets from where it stands
  function fight(out, order, w, ids) {
    const list = ids.map(id => state.entities[id]).filter(u => u && !u.dead && !u.downed && !u.aboard);
    if (!list.length) return;
    const cx = list.reduce((n, u) => n + u.x, 0) / list.length, cz = list.reduce((n, u) => n + u.z, 0) / list.length;
    const tg = pickTarget(w, attackA(), { x: cx, z: cz });
    const far = (u, x, z) => Math.hypot((u.order?.x ?? 1e9) - x, (u.order?.z ?? 1e9) - z) > 12;
    if (tg?.st) { const go = list.filter(u => u.order?.kind !== 'attack' && (u.order?.kind !== 'raze' || u.order.structure !== tg.st.key)).map(u => u.id); if (go.length) out.push(order({ kind: 'raze', units: go, structure: tg.st.key, fallback: 'attackmove', x: Math.round(tg.st.x), z: Math.round(tg.st.z) })); return; }
    const p = tg?.unit || town(w.town); if (!p) return;
    const go = list.filter(u => u.order?.kind !== 'attack' && (u.order?.kind !== 'attackmove' || far(u, p.x, p.z))).map(u => u.id);
    if (go.length) out.push(order({ kind: 'attackmove', units: go, x: Math.round(p.x), z: Math.round(p.z) }));
  }

  return { worth, slipWanted, slipSpot, yardWanted, yardCell, train, use, detached, yardOf };
}
