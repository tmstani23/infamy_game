// War checkpoint 8d (Tim 2026-11-15): the bot general's brain. One per clan (player and bots alike), a client like
// the bots and the lieutenant: it only reads the state and sends the commands a player sends, as the clan's hero.
// It gives orders only for the sides the rules say it runs (sim/frontier/war_general.js runs(): a bot clan always, a
// player while his hero is outside that war's circle). When the hero comes back it simply stops: units keep their
// last orders. Its memory (per war and side, and a bot's plan for its next war) is its own and goes into the save
// (saveState / loadState, like the other bots); the hero's walking route is rebuilt after a load.
// Defence (8d-2): fill the chest to the keep line, train the strategy's mix, ranged troops into houses, workers
// douse and mend, the army meets attackers, sorties at the camp, else holds by the hall. A bot's towns build their
// military list in peace. Attack (8d-3): a bot picks a town, packs at its launch town, walks its hero over and
// plants the banner; the camp is built in the strategy's order, workers hired, troops trained, the army pushes at
// the strategy's targets and falls back when spent; the bot's hero takes the hall when morale is 0.
// createGeneralBrain(game, { clan }) -> { tick(): commands, saveState, loadState, view }
import { ringRadius, cellOffset } from './frontier/town_grid.js';
import { SCREEN_RIGHT, SCREEN_DOWN } from './geometry.js';
import { isMilitary, militaryCount, militaryNeeds, militaryWhy, warHallDone, tierMax } from './frontier/town_military.js';
import { buildingCost } from './frontier/tiers.js';

const DET = SCREEN_RIGHT.x * SCREEN_DOWN.z - SCREEN_DOWN.x * SCREEN_RIGHT.z;
const intent = (dx, dz) => ({ right: (dx * SCREEN_DOWN.z - dz * SCREEN_DOWN.x) / DET, down: (SCREEN_RIGHT.x * dz - SCREEN_RIGHT.z * dx) / DET });

export function createGeneralBrain(game, { clan }) {
  const state = game.state, F = () => game.frontier, GEN = () => F()?.warGeneral, gen = GEN;
  const W = () => F().data.war || {};
  GEN()?.enable?.();   // from now on the stand-in defender and stand-in douse are off (war.js, structures.js)
  let mem = { wars: {}, plan: null, walls: {} };   // saved
  let goal = null, path = null;         // where the hero is walking (worked out again at each review)
  const memory = (w, side) => ((mem.wars[w.id] ||= {})[side] ||= {});
  const isBot = () => !!state.clans[clan]?.bot;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const strat = () => gen().rules().strategies?.[gen().strategyOf(clan)] || {};
  const troops = w => Object.values(state.entities).filter(e => e.warTroop === w.id && e.owner === clan && !e.dead && e.type !== 'horse');
  const hero = () => Object.values(state.entities).find(e => e.owner === clan && e.type === 'hero');
  const town = id => state.frontier?.settlements?.[id] || null;
  // a side's workers out in the open (worker units carry workerOwner and their site in town: a town id or a war id)
  const workersOut = (owner, site) => Object.values(state.entities).filter(e => e.worker && e.workerOwner === owner && e.town === site && e.place === 'world' && !e.dead && !e.downed && !e.garrison);
  // workers by a structure the army is breaking are cut down first: menders undo what ranged troops alone can do
  const mendersBy = (owner, site, st) => workersOut(owner, site).map(e => ({ e, d: Math.hypot(e.x - st.x, e.z - st.z) })).filter(o => o.d <= (gen().rules().menderReach ?? 30)).sort((a, b) => a.d - b.d || (a.e.id < b.e.id ? -1 : 1))[0]?.e || null;
  // a mix names roster units or roles (general.roles: special = what this clan trains at the clan hall, kennel or
  // hidden dojo; siege = at the foundry; rider = at the stable), so one list serves every clan
  const mixKey = (mix, u) => { if (mix[u] != null) return u; const R = gen().rules().roles || {}, at = W().units?.[u]?.at || []; return Object.keys(R).find(r => mix[r] != null && at.some(b => R[r].includes(b))) ?? null; };
  const weight = (mix, u) => { const k = mixKey(mix, u); return k ? mix[k] || 0 : 0; };
  // have (by unit) counted by mix key
  const byKey = (mix, have) => { const n = {}; for (const [u, c] of Object.entries(have)) { const k = mixKey(mix, u); if (k) n[k] = (n[k] || 0) + c; } return n; };
  // the unit of list ([{ unit, ryo }]) the mix is shortest of that the chest can pay: { u, need } (need = held / weight)
  const pickUnit = (mix, list, have, chest) => { const n = byKey(mix, have); return list.filter(u => weight(mix, u.unit) > 0 && u.ryo <= chest).map(u => ({ u, need: (n[mixKey(mix, u.unit)] || 0) / weight(mix, u.unit) })).sort((a, c) => a.need - c.need || (have[a.u.unit] || 0) - (have[c.u.unit] || 0) || (a.u.unit < c.u.unit ? -1 : 1))[0] || null; };
  // training buildings in the order the mix needs them; one whose best unit is mixSlack or more ahead of the
  // shortest waits, so a clan hall does not fill the army with specials
  // Tim 2026-11-17 (each side uses all it has): after its strategy's own list a general goes on building: supply
  // tents up to their max (the biggest troop cap), then general.buildOn (the armory for troop upgrades, the clinic),
  // whatever of them its list did not name. Supply tents also jump the list while the side is at its troop cap with
  // ryo to train more (memory `capped`, set by the training step).
  const TENT = 'supply_tents';
  function buildTail(list, more = true) {
    const G = gen().rules(), most = W().buildings?.[TENT]?.max ?? 12, n = list.filter(t => t === TENT).length;
    return [...Array(Math.max(0, most - n)).fill(TENT), ...(more ? G.buildOn || [] : [])];
  }
  function trainPlan(mix, shops, have, chest, room, ahead) {
    const out = [], slack = gen().rules().mixSlack ?? 1;
    for (let guard = 0; guard < 64 && room > 0; guard++) {
      const picks = shops.filter(b => b.queued < ahead).map(b => ({ b, p: pickUnit(mix, b.units, have, chest) })).filter(x => x.p).sort((a, c) => a.p.need - c.p.need || (a.b.id < c.b.id ? -1 : 1));
      if (!picks.length) break;
      // (the shortest it can pay for: a unit the chest cannot buy holds nobody back)
      const held = byKey(mix, have), lowest = Math.min(...Object.keys(mix).filter(k => mix[k] > 0 && shops.some(b => b.units.some(u => u.ryo <= chest && mixKey(mix, u.unit) === k))).map(k => (held[k] || 0) / mix[k]));
      const { b, p } = picks[0], places = Math.max(1, W().units?.[p.u.unit]?.slots ?? 1);   // a gun takes more troop places (Tim 2026-11-21)
      if (p.need > lowest + slack || places > room) break;
      out.push({ building: b.id, unit: p.u.unit });
      have[p.u.unit] = (have[p.u.unit] || 0) + 1; b.queued++; room -= places; chest -= p.u.ryo;
    }
    return out;
  }

  // ---- defence -------------------------------------------------------------------------------------------------
  // the town coffers into the defender's war chest, down to the keep line (a bot keeps general.botKeepShare)
  function fillChest(out, cmd, w) {
    const s = town(w.town); if (!s || s.owner !== clan || s.castle) return;   // Z6: a castle pays from the Clan treasury
    const G = GEN().rules(), keep = state.clans[clan]?.bot ? (G.botKeepShare ?? G.keepShare) : GEN().keepOf(s);
    const m = memory(w, 'defender');
    // the line is a share of the coffers as the war found them (what is already in the chest counted back in), so
    // ryo the town earns later still tops the chest up but the kept part is never spent
    m.base ??= Math.floor((s.stock?.ryo || 0) + (w.defense?.put || 0));
    const line = Math.floor(m.base * keep);
    const spare = Math.floor((s.stock?.ryo || 0) - line);
    if (spare >= (G.chestStep ?? 10)) out.push(cmd({ action: 'warChestTown', war: w.id, amount: spare }));
  }
  // ---- the defending town: troops ---------------------------------------------------------------------------------
  // one more troop at each training building with a short queue: the unit the strategy's mix is shortest of
  function train(out, cmd, w) {
    const v = F().war.defense.view(w.id); if (!v || v.muster > 0) return;
    const G = gen().rules(), mix = strat().defend?.mix || { grunt: 1 }, ahead = G.queueAhead ?? 2;
    let room = v.cap - v.troops - v.queued, chest = v.chest;
    // spent: it cannot grow any more (at the cap, or the chest cannot pay for anything it trains)
    const cheapest = Math.min(...v.buildings.flatMap(b => b.units.filter(u => weight(mix, u.unit) > 0).map(u => u.ryo)), Infinity);
    memory(w, 'defender').spent = v.queued === 0 && (room <= 0 || chest < cheapest);
    memory(w, 'defender').capped = room <= 0 && chest >= cheapest || undefined;   // more supply tents would mean more troops
    memory(w, 'defender').room = Math.max(0, room);
    const have = {};
    for (const e of troops(w)) if (e.warUnit) have[e.warUnit] = (have[e.warUnit] || 0) + 1;
    for (const b of v.buildings) for (const q of b.queue) have[q.unit] = (have[q.unit] || 0) + 1;
    for (const t of trainPlan(mix, v.buildings.map(b => ({ id: b.id, units: b.units, queued: b.queue.length })), have, chest, room, ahead))
      out.push(cmd({ action: 'townTrain', war: w.id, building: t.building, unit: t.unit, count: 1 }));
  }
  // archers and riflemen go into a stockade with room (8d-9), else the nearest house, workshop or farmhouse with room, and shoot from it
  const isFort = st => st.kind === 'building' && st.type === 'stockade';
  const heldIn = () => { const inside = {}; for (const e of Object.values(state.entities)) { const k = e.dead ? null : e.garrison?.zone ? e.garrison.key : e.garrison ? null : e.order?.garrisonKey; if (k) inside[k] = (inside[k] || 0) + 1; } return inside; };
  function garrisonRanged(out, cmd, w) {
    const GA = F().garrison; if (!GA?.capOf) return;
    const G = gen().rules(), ranged = G.rangedUnits || ['archer', 'rifleman'];
    const free = troops(w).filter(e => ranged.includes(e.warUnit) && !e.garrison && !e.order?.garrisonKey && !e.downed && e.order?.kind !== 'raze');
    if (!free.length) return;
    const S = F().structures, inside = heldIn();
    const houses = S.list().filter(st => st.town === w.town && !st.camp && GA.zoneOk(st) && S.hpOf(st) > 0);
    const byHouse = new Map();
    for (const e of free) {
      const st = houses.filter(h => (inside[h.key] || 0) < GA.capOf(h)).map(h => ({ h, d: Math.hypot(h.x - e.x, h.z - e.z) })).sort((a, b) => (isFort(b.h) ? 1 : 0) - (isFort(a.h) ? 1 : 0) || a.d - b.d || (a.h.key < b.h.key ? -1 : 1))[0]?.h;
      if (!st) break;
      inside[st.key] = (inside[st.key] || 0) + 1;
      if (!byHouse.has(st.key)) byHouse.set(st.key, []);
      byHouse.get(st.key).push(e.id);
    }
    for (const [key, units] of byHouse) out.push(cmd({ action: 'garrison', mode: 'enter', structure: key, units, walk: true }));
  }
  // the side's workers put out fires and mend the hall and the military buildings, a few at a time
  // (site = the town, or the war camp as a work site; prefix = the structure keys of that side)
  function mend(out, cmd, site, siteId, prefix, mine) {
    if (!site?.workers?.length) return;
    const G = gen().rules(), S = F().structures, each = G.menders ?? 2, most = G.mendersMax ?? 6;
    const fires = Object.keys(state.frontier.fires || {}).filter(k => k.startsWith(prefix));
    const hurt = S.list().filter(st => mine(st) && (st.military || st.type === 'town_hall' || st.type === 'camp_hall' || W().morale?.weights?.[st.type]) && S.hpOf(st) > 0 && S.hpOf(st) < st.max * (G.mendBelow ?? 0.8))
      .sort((a, b) => S.hpOf(a) / a.max - S.hpOf(b) / b.max || (a.key < b.key ? -1 : 1)).map(st => st.key);
    let busy = site.workers.filter(x => x.job).length;
    const free = site.workers.filter(x => !x.job && !x.project && !x.garrison && !x.shelter).map(x => x.id);
    for (const key of [...fires, ...hurt.filter(k => !fires.includes(k))]) {
      const on = site.workers.filter(x => x.job?.key === key).length, n = Math.min(each - on, most - busy, free.length);
      if (n <= 0) continue;
      out.push(cmd({ action: 'workerOrder', town: siteId, workers: free.splice(0, n), kind: 'work', target: key }));
      busy += n;
    }
  }
  // the army: meets attackers near the town, sorties at the camp when it is strong enough, else waits by the hall
  function army(out, order, w) {
    const t = town(w.town); if (!t) return;
    const G = gen().rules(), D = strat().defend || {}, m = memory(w, 'defender');
    const mine = troops(w).filter(e => !e.garrison && !e.order?.garrisonKey && !e.downed);
    if (!mine.length) return;
    const reach = ringRadius(t, F().data) + (G.defendReach ?? 80);
    const foes = Object.values(state.entities).filter(e => e.owner === w.attacker && e.place === 'world' && !e.dead && !e.downed && !e.rout && !e.hidden && !e.worker && !e.garrison && e.type !== 'civilian' && e.type !== 'horse' && Math.hypot(e.x - t.x, e.z - t.z) <= reach)
      .sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z) || (a.id < b.id ? -1 : 1));
    const far = (e, x, z, r) => Math.hypot((e.order?.x ?? 1e9) - x, (e.order?.z ?? 1e9) - z) > r;
    // an attacker with no troops left: a lone hero near the town does not hold the army back from his empty camp
    const theirs = Object.values(state.entities).filter(e => e.warTroop === w.id && e.owner === w.attacker && !e.dead && e.type !== 'horse').length;
    const empty = theirs === 0 && mine.length >= (G.sortieLeast ?? 4) && foes.every(e => e.type === 'hero');
    if (foes.length && !empty) {
      const f0 = foes[0], ids = mine.filter(e => e.order?.kind !== 'attack' && (e.order?.kind !== 'attackmove' || e.order.arrived || far(e, f0.x, f0.z, G.retarget ?? 40))).map(e => e.id);
      if (ids.length) out.push(order({ kind: 'attackmove', units: ids, x: Math.round(f0.x), z: Math.round(f0.z) }));
      m.mode = 'meet';
      return;
    }
    const S = F().structures, weight = W().morale?.weights || {};
    const camp = S.list().filter(st => st.camp && st.war === w.id && S.hpOf(st) > 0 && weight[st.type]);
    // a sortie starts at sortieAt troops and goes on until the army is down to half of that
    // (or, once it cannot grow any more, when it outnumbers the attacker's troops by sortieEdge)
    // a sally (8d-8): the army in the field is worth sallyEdge times the attacker's troops it can see, so it goes for
    // the camp without waiting for sortieAt; it comes home when it is no longer worth sallyHold times them, and
    // then rests sallyRest seconds before the next
    const worth = l => l.reduce((n, e) => n + (F().war.ryoOf(e.owner, e.warUnit) || 60), 0);
    const seen = Object.values(state.entities).filter(e => e.warTroop === w.id && e.owner === w.attacker && !e.dead && !e.hidden && e.type !== 'horse');
    const sally = mine.length >= (G.sortieLeast ?? 4) && state.tick >= (m.rest || 0) && worth(mine) >= worth(seen) * (m.sally ? G.sallyHold ?? 1 : G.sallyEdge ?? 1.5);
    if (m.sally && !sally) m.rest = state.tick + Math.round((G.sallyRest ?? 120) * 20);
    m.sally = sally || undefined;
    const full = mine.length >= (m.mode === 'sortie' && m.by !== 'sally' ? Math.ceil((D.sortieAt ?? 12) / 2) : D.sortieAt ?? 12)
      || (m.spent && mine.length >= (G.sortieLeast ?? 4) && mine.length >= theirs * (G.sortieEdge ?? 1.3)) || empty;
    const strong = full || sally;
    m.by = full ? undefined : sally ? 'sally' : undefined;
    if (strong && camp.length) {
      // (8d-9: the camp's stockade is left for last)
      const rank = c => c.type === 'camp_station' ? 0 : c.type === 'rail_section' ? 1 : isFort(c) ? 3 : 2;   // 8e-7: the supply line first
      const st = camp.map(c => ({ c, d: Math.hypot(c.x - t.x, c.z - t.z) })).sort((a, b) => rank(a.c) - rank(b.c) || a.d - b.d || (a.c.key < b.c.key ? -1 : 1))[0].c;
      m.mode = 'sortie';
      const md = mendersBy(w.attacker, w.id, st);
      if (md) {
        const ids = mine.filter(e => e.order?.kind !== 'attack' && (e.order?.kind !== 'attackmove' || e.order.arrived || far(e, md.x, md.z, 12))).map(e => e.id);
        if (ids.length) out.push(order({ kind: 'attackmove', units: ids, x: Math.round(md.x), z: Math.round(md.z) }));
        return;
      }
      const ids = mine.filter(e => e.order?.kind !== 'attack' && (e.order?.kind !== 'raze' || e.order.structure !== st.key)).map(e => e.id);
      if (ids.length) out.push(order({ kind: 'raze', units: ids, structure: st.key, fallback: 'attackmove', x: Math.round(st.x), z: Math.round(st.z) }));
      return;
    }
    // Tim 2026-11-17 (a strategy with defend.lineRaid, Raider): while it is not strong enough to sortie, a small party
    // goes out to cut the camp's supply line (the rail section nearest the town, else its camp station), gives up after
    // lineRaid.giveUpSeconds, rests lineRaid.restSeconds after each raid, and only while the army keeps lineRaid.home at home
    const LR = D.lineRaid, line = LR ? S.list().filter(st => st.camp && st.war === w.id && (st.type === 'camp_station' || st.type === 'rail_section') && S.hpOf(st) > 0) : [];
    let raiders = [];
    if (LR) {
      const live = id => mine.find(e => e.id === id);
      if (m.raid) {
        raiders = m.raid.ids.map(live).filter(Boolean);
        const tgt = line.find(c => c.key === m.raid.key);
        if (!tgt || !raiders.length || state.tick - (m.raid.at ?? state.tick) > (LR.giveUpSeconds ?? 150) * 20) { m.raid = undefined; m.lineRest = state.tick + Math.round((LR.restSeconds ?? 180) * 20); raiders = []; }
      } else if (line.length && state.tick >= (m.lineRest || 0) && mine.length >= (LR.party ?? 3) + (LR.home ?? 3)) {
        const rk = c => c.type === 'rail_section' ? 0 : 1;   // a rail section away from the camp first (lightly held), the camp station after
        const tgt = line.map(c => ({ c, d: Math.hypot(c.x - t.x, c.z - t.z) })).sort((a, b) => rk(a.c) - rk(b.c) || a.d - b.d || (a.c.key < b.c.key ? -1 : 1))[0].c;
        const fast = e => (F().data.war?.units?.[e.warUnit]?.group === 'rider' ? 0 : 1);
        raiders = mine.slice().sort((a, b) => fast(a) - fast(b) || Math.hypot(a.x - tgt.x, a.z - tgt.z) - Math.hypot(b.x - tgt.x, b.z - tgt.z) || (a.id < b.id ? -1 : 1)).slice(0, LR.party ?? 3);
        m.raid = { ids: raiders.map(e => e.id), key: tgt.key, at: state.tick }; m.raids = (m.raids || 0) + 1;
      }
      if (m.raid) {
        const tgt = line.find(c => c.key === m.raid.key);
        const ids = raiders.filter(e => e.order?.kind !== 'attack' && (e.order?.kind !== 'raze' || e.order.structure !== tgt.key)).map(e => e.id);
        if (ids.length) out.push(order({ kind: 'raze', units: ids, structure: tgt.key, fallback: 'attackmove', x: Math.round(tgt.x), z: Math.round(tgt.z) }));
      }
    }
    m.mode = m.raid ? 'lineRaid' : 'hold';
    // wait between the hall and the camp, inside the ring
    const d = Math.hypot(w.x - t.x, w.z - t.z) || 1, r = ringRadius(t, F().data) * (G.holdAt ?? 0.5);
    const hx = Math.round(t.x + (w.x - t.x) / d * r), hz = Math.round(t.z + (w.z - t.z) / d * r);
    const ids = mine.filter(e => !raiders.includes(e) && Math.hypot(e.x - hx, e.z - hz) > (G.holdRadius ?? 35) && (e.order?.kind !== 'station' || far(e, hx, hz, 5))).map(e => e.id);
    if (ids.length) out.push(order({ kind: 'station', units: ids, x: hx, z: hz }));
  }
  function defend(out, cmd, order, w) {
    fillChest(out, cmd, w);
    armory(out, cmd, w, 'defender');
    // 8e-7: the Clan treasury by train (keep line and daily share apply, sim side), once the coffers are spent
    // (Tim 2026-11-17: and from the clan's other towns' coffers, chestByTrain)
    if (!town(w.town)?.castle) {   // Z6: a castle has no chest to fill and nothing to sell
      chestByTrain(out, cmd, w, 'defender', w.defense?.chest || 0, (memory(w, 'defender').room || 0) * (gen().rules().troopRyo ?? 120));
      sellSpare(out, cmd, w);
    }
    train(out, cmd, w);
    // the attacker has (almost) no troops left and the town can train no more: the archers come out of the houses and the whole army goes for his camp
    const all = troops(w).filter(e => !e.downed), theirs = Object.values(state.entities).filter(e => e.warTroop === w.id && e.owner === w.attacker && !e.dead && e.type !== 'horse').length;
    if (memory(w, 'defender').spent && all.length >= (gen().rules().sortieLeast ?? 4) && all.length >= theirs * 2 * (gen().rules().sortieEdge ?? 1.3)) {
      const by = new Map(); for (const e of all) if (e.garrison?.key) { if (!by.has(e.garrison.key)) by.set(e.garrison.key, []); by.get(e.garrison.key).push(e.id); }
      for (const [key, units] of by) out.push(cmd({ action: 'garrison', mode: 'leave', structure: key, units }));
    } else garrisonRanged(out, cmd, w);
    mend(out, cmd, town(w.town), w.town, `t|${w.town}|`, st => st.town === w.town && !st.camp);
    rebuildTown(out, cmd, w);
    army(out, order, w);
    // a bot's hero comes to take the camp hall once the camp's morale is 0 (a player does that himself)
    if (isBot() && F().warMorale.ready(w.id, 'camp') && !w.channel) {
      const p = F().warEnd.hallPoint(w, 'camp'), h = hero();
      if (p) { goal = { x: p.x + p.r + 2, z: p.z, near: 3, why: 'take' }; if (h && F().warEnd.check(h, w, 'camp').ok) out.push(cmd({ action: 'warTakeCamp', war: w.id })); }
    }
  }

  // ---- peacetime: a bot clan's towns build their defences by strategy ----------------------------------------
  // the hall war upgrade and the strategy's list of military buildings, one at a time, while the town can spare
  // the cost and a reserve on top (it pays the normal building upkeep for them)
  // zoneOnly (a player's town, 8d-5): only inside the military zone he painted, and never the hall upgrade
  function prepare(out, cmd, s, zoneOnly = false) {
    if (!s.grid || s.capital || s.founded === undefined || (s.buildings || []).some(b => b.type === 'town_hall' && b.stage === 'ruined')) return;
    const G = gen().rules(), data = F().data, list = strat().defend?.build || [], R = G.buildReserve || {};
    const can = cost => Object.entries(cost || {}).every(([r, v]) => (s.stock?.[r] ?? 0) >= v + (R[r] ?? 0));
    if ((s.projects || []).some(p => isMilitary(p.type, data) || p.type === 'stockade') || s.warUpgrade) return;
    // at its troop cap with ryo to train more (a war on the town): the next supply tents come before the list
    const wOn = zoneOnly ? null : F().war.warOn?.(s.id);
    if (wOn && wOn.defender === clan && memory(wOn, 'defender').capped && !militaryWhy(s, TENT, data, state) && militaryNeeds(s, TENT, data).length === 0) {
      if (!can(buildingCost(data, TENT, s))) return;   // saving for it
      const cell = spotFor(s, TENT, zoneOnly);
      if (cell != null) { out.push(cmd({ action: 'place', town: s.id, kind: TENT, cells: [cell] })); return; }
    }
    // (a town at peace: only the supply tents of the tail; the rest of it, general.buildOn, once a war is on the town)
    const seen = {}, full = [...list, ...(zoneOnly ? [] : buildTail(list, !!wOn))];
    const ruinAt = wOn ? townRuins(s)[0]?.at ?? Infinity : Infinity;   // a ruin of the plan is rebuilt before anything later in it is placed (rebuildTown)
    for (const [i, type] of full.entries()) {
      const tail = i >= list.length;
      if (i >= ruinAt) return;
      if (type === 'upgrade') {   // the town hall war upgrade itself (cavalry at the stable need it)
        if (zoneOnly || warHallDone(s)) continue;
        if (can(data.war?.hallUpgrade?.cost)) { out.push(cmd({ action: 'warUpgradeHall', settlement: s.id })); return; }
        if (!wOn) return;   // at peace it saves for it
        continue;           // Tim 2026-11-17: at war (the coffers feed the chest) the rest of the list does not wait for it
      }
      seen[type] = (seen[type] || 0) + 1;
      if (militaryCount(s, type) >= seen[type]) continue;
      const def = data.war?.buildings?.[type] || {};
      if (def.clan && def.clan !== state.clans[clan]?.faction) continue;
      const needs = militaryNeeds(s, type, data);
      if (needs.length) {
        if (zoneOnly) continue;
        if ((def.needs || []).includes('upgrade') && !warHallDone(s) && can(data.war?.hallUpgrade?.cost)) out.push(cmd({ action: 'warUpgradeHall', settlement: s.id }));
        if ((def.needs || []).includes('upgrade') && !warHallDone(s) && !tail && !wOn) return;   // saving for the upgrade (the tail, and a town at war, go on without it)
        continue;   // waits on an earlier building of the list
      }
      if (militaryWhy(s, type, data, state)) continue;
      if (!can(buildingCost(data, type, s))) return;   // saving for it
      const cell = spotFor(s, type, zoneOnly);
      if (cell != null) out.push(cmd({ action: 'place', town: s.id, kind: type, cells: [cell] }));
      if (cell == null) continue;   // no room for this one (in the zone, or at this tier): try the next of the list
      return;
    }
  }
  // ---- peacetime: a bot clan's towns wall themselves by strategy (8d-8) ----------------------------------------
  // defend.wall.share of the ring (1 = all round; less = the side the town's roads leave by, else the side of the
  // nearest town of another clan), one cell inside the edge of the build ring. Gates first: where a road or the
  // railway crosses the line (a road cell there is swapped for a gate) and at least general.wall.gates in all, then
  // the wall, general.wall.step cells at a time, keeping general.wall.reserve timber. Not during a war on the town.
  function wallLine(s, share) {
    const g = s.grid, n = g.n, N = n * n, WG = gen().rules().wall || {}, r = ringRadius(s, F().data) - (WG.inset ?? 1) * g.cell;
    const d = i => Math.hypot(...cellOffset(s, i)), ang = i => { const [x, z] = cellOffset(s, i); return Math.atan2(z, x); };
    let line = [];
    for (let i = 0; i < N; i++) { if (d(i) > r) continue; const col = i % n; if ([col > 0 ? i - 1 : -1, col < n - 1 ? i + 1 : -1, i - n, i + n].some(j => j < 0 || j >= N || d(j) > r)) line.push(i); }
    line.sort((a, b) => ang(a) - ang(b) || a - b);
    if (share < 1) {
      let vx = 0, vz = 0;
      for (let i = 0; i < N; i++) if (g.use[i] === 'r' && d(i) > 3 * g.cell) { const [x, z] = cellOffset(s, i); vx += x; vz += z; }
      if (Math.hypot(vx, vz) < g.cell) { const o = Object.values(state.frontier.settlements).filter(t => t.owner !== clan && Number.isFinite(t.x)).sort((a, b) => dist(a, s) - dist(b, s) || (a.id < b.id ? -1 : 1))[0]; vx = o ? o.x - s.x : 1; vz = o ? o.z - s.z : 0; }
      const a0 = Math.atan2(vz, vx), off = a => Math.abs(Math.atan2(Math.sin(a - a0), Math.cos(a - a0)));
      line = line.filter(i => off(ang(i)) <= share * Math.PI);
    }
    return line;
  }
  function walls(out, cmd, s) {
    const D = strat().defend || {}, WG = gen().rules().wall || {}, share = D.wall?.share ?? 0;
    if (!(share > 0) || !s.grid || s.capital || s.founded === undefined || F().war.warOn(s.id)) return;
    if (!(s.buildings || []).some(b => b.stage === 'built' && isMilitary(b.type, F().data))) return;   // a first military building comes before the wall
    const P = F().modules.find(x => x.name === 'placement')?.placement; if (!P) return;
    const memo = mem.walls[s.id];
    if (memo && memo.tier === (s.tier || 1) && memo.wars === (state.frontier.wars?.history || []).length && state.tick < memo.until) return;   // done: looked at again after a day, a new tier or a war
    const g = s.grid, n = g.n, line = wallLine(s, Math.min(1, share)), at = new Set(line);
    const spare = () => Math.floor((s.stock?.timber ?? 0) - (WG.reserve ?? 250));
    const costW = F().data.placeCosts?.wall?.timber ?? 2, costG = F().data.placeCosts?.gate?.timber ?? 5;
    // gates: road and rail crossings, then up to `gates` in all, spread round the line
    const cross = line.filter(i => g.use[i] === 'r' || g.use[i] === 'g' || s.railCells?.[i]);
    const gates = [...cross];
    const far = i => gates.every(j => Math.hypot(i % n - j % n, Math.floor(i / n) - Math.floor(j / n)) >= (WG.gateGap ?? 8));
    const want = Math.max(1, Math.round((WG.gates ?? 4) * Math.min(1, share)));
    for (let k = 0; k < want && line.length; k++) {
      const from = Math.floor((k + 0.5) * line.length / want);
      for (let j = 0; j < line.length && gates.length < Math.max(want, cross.length); j++) { const i = line[(from + (j % 2 ? -1 : 1) * Math.ceil(j / 2) + line.length * 2) % line.length]; if (g.use[i] === '.' && g.zone[i] === '.' && g.ground[i] !== 'x' && far(i) && P.check(s, { kind: 'gate', cells: [i] }).ok) { gates.push(i); break; } }
    }
    let did = false;
    for (const i of gates) {
      if (g.use[i] === 'g') continue;
      if (spare() < costG) return;   // saving for a gate
      if (g.use[i] === 'r') { out.push(cmd({ action: 'remove', town: s.id, cells: [i] })); out.push(cmd({ action: 'place', town: s.id, kind: 'gate', cells: [i] })); did = true; }
      else if (g.use[i] === '.' && P.check(s, { kind: 'gate', cells: [i] }).ok) { out.push(cmd({ action: 'place', town: s.id, kind: 'gate', cells: [i] })); did = true; }
    }
    if (did) return;   // the wall goes up once the gates stand
    const isGate = new Set(gates), most = Math.min(WG.step ?? 40, Math.floor(spare() / costW)), cells = [];
    let open = 0;
    for (const i of line) {
      if (isGate.has(i) || g.use[i] !== '.' || g.zone[i] !== '.' || g.ground[i] === 'x') continue;
      if (!P.check(s, { kind: 'wall', cells: [i] }).ok) continue;
      open++;
      if (cells.length < most) cells.push(i);
    }
    if (!open) { mem.walls[s.id] = { tier: s.tier || 1, wars: (state.frontier.wars?.history || []).length, until: state.tick + (WG.lookDays ?? 1) * gen().dayTicks }; return; }
    if (!cells.length) return;   // saving timber
    let run = cells;
    while (run.length > 1 && !P.check(s, { kind: 'wall', cells: run }).ok) run = run.slice(0, Math.floor(run.length / 2));
    out.push(cmd({ action: 'place', town: s.id, kind: 'wall', cells: run }));
  }
  // a free spot for a placed building, nearest the hall first
  // (8d-5) the military zone first, wherever it was painted; then, unless zoneOnly, anywhere near the hall
  function spotFor(s, type, zoneOnly = false) {
    const P = F().modules.find(x => x.name === 'placement')?.placement; if (!P) return null;
    const n = s.grid.n, mid = (n - 1) / 2, G = gen().rules(), most = G.buildRadius ?? 9, least = G.buildClear ?? 2;
    const MZ = F().data.zones?.military?.char;
    if (MZ && s.grid.zone.includes(MZ)) {
      const zc = []; for (let i = 0; i < n * n; i++) if (s.grid.zone[i] === MZ) zc.push([Math.hypot(i % n - mid, Math.floor(i / n) - mid), i]);
      zc.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (const [, i] of zc) if (P.check(s, { kind: type, cells: [i] }).ok) return i;
    }
    if (zoneOnly) return null;
    const cells = [];
    for (let i = 0; i < n * n; i++) { const d = Math.hypot(i % n - mid, Math.floor(i / n) - mid); if (d >= least && d <= most) cells.push([d, i]); }
    cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, i] of cells) if (P.check(s, { kind: type, cells: [i] }).ok) return i;
    return null;
  }

  // ---- attack: the war camp ----------------------------------------------------------------------------------------
  const campHall = w => w.camp?.buildings?.find(b => b.type === 'camp_hall') || w.camp;
  const workersIndex = () => F().modules.find(x => x.name === 'workers')?.workers?.index;
  // a free spot for a camp building: a lumber camp or quarry by the nearest of its resource, fighting buildings on the
  // town's side of the camp hall, the rest behind it
  function campSpot(w, type, A) {
    const War = F().war, hall = campHall(w), t = town(w.town), data = F().data;
    const toTown = Math.atan2(t.z - hall.z, t.x - hall.x), tries = [];
    const takes = data.workers?.campTakes?.[type];
    if (takes && (data.workers?.gatherBuildings || []).includes(type)) {
      const spots = (workersIndex()?.spotsNear?.(hall.x, hall.z, A.resourceRange ?? 350) || []).filter(sp => takes.includes(data.workers?.resources?.[sp.kind]))
        .sort((a, b) => dist(a, hall) - dist(b, hall) || (a.id < b.id ? -1 : 1)).slice(0, 4);
      for (const sp of spots) for (const r of [22, 32, 42]) for (let k = 0; k < 8; k++) { const a = Math.atan2(hall.z - sp.z, hall.x - sp.x) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 4; tries.push([sp.x + Math.cos(a) * r, sp.z + Math.sin(a) * r]); }
    }
    const front = ['barracks', 'watchtower', 'rifle_range', 'clan_hall', 'stockade'].includes(type), a0 = front ? toTown : toTown + Math.PI;
    for (let r = 26; r <= (W().chainDistance ?? 120) - 6; r += 14) for (let k = 0; k < 12; k++) { const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 6; tries.push([hall.x + Math.cos(a) * r, hall.z + Math.sin(a) * r]); }
    for (const [x, z] of tries) { const r = War.campCheck(w.id, type, { x, z }); if (r?.ok) return { x: Math.round(x), z: Math.round(z) }; }
    return null;
  }
  // the next building of the strategy's list (and the camp hall upgrade when one needs it), a few sites at a time
  // the siege answer (8d-10): once the town it attacks has a stockade, the camp builds attack.siegeUp.build first
  // and its mix trains siege guns (role siege) at least attack.siegeUp.siege; it keeps to that for the rest of the war
  const siegeUp = (w, m) => { const SU = gen().rules().attack?.siegeUp; if (SU && !m.siegeUp && (town(w.town)?.buildings || []).some(b => b.type === 'stockade' && b.stage === 'built')) m.siegeUp = true; return m.siegeUp ? SU : null; };
  function campBuild(out, cmd, w, A) {
    const camp = w.camp, War = F().war, BD = W().buildings || {};
    const list = War.campBuildList(w.id), seen = {}, m = memory(w, 'attacker');
    // dug in (8d-8): once the fight has gone on for attack.fortify.afterSeconds, a push has been beaten back, or the
    // defenders it can see are worth edge times its own troops, the camp puts up attack.fortify.build first (and
    // the palisade line), and keeps them for the rest of the war
    const FT = A.fortify || gen().rules().attack?.fortify;
    if (FT && !m.fort) {
      const worth = l => l.reduce((n, e) => n + (War.ryoOf(e.owner, e.warUnit) || 60), 0);
      const own = troops(w), foes = Object.values(state.entities).filter(e => e.warTroop === w.id && e.owner === w.defender && !e.dead && !e.hidden && !e.garrison && e.type !== 'horse');
      if (state.tick - (w.started ?? w.at ?? state.tick) >= (FT.afterSeconds ?? 600) * 20 || m.beaten || (foes.length >= (FT.least ?? 4) && worth(foes) >= worth(own) * (FT.edge ?? 1.3))) m.fort = true;
    }
    let nextCost = null;
    const SU = siegeUp(w, m), own = (A.build || []).filter(t => t !== 'camp_station' || stationTown());   // 8e-7: a camp station only with a station town to link to
    if (SU?.build?.length) { const at = Math.max(...['barracks', 'lumber_camp', 'quarry'].map(t => own.indexOf(t))); own.splice(at + 1, 0, ...SU.build); }   // after its first barracks, lumber camp and quarry: troops and gathering first, then the siege answer
    // Tim 2026-11-17: at its troop cap with ryo to train more, the next supply tents come first; after its own list
    // the camp goes on with the tail (buildTail). Neither holds a push back (m.left counts its own list only).
    const tentNow = m.capped && camp.buildings.filter(b => b.type === TENT && b.stage !== 'ruined').length < (list.find(x => x.type === TENT)?.max ?? 4) && !camp.buildings.some(b => b.type === TENT && b.stage === 'site');
    const head = [...(tentNow ? [TENT] : []), ...(m.fort ? FT.build || [] : [])];
    const plan = [...head, ...own, ...buildTail(own)];
    // what is left of the plan (8d-10): the army does not push in full before it is all built (campArmy), and
    // training keeps back the ryo of the camp hall upgrade while a building of the plan still needs it (campTrain)
    { const tally = {}; let left = 0;
      let next = null;   // the first building of its own list not yet placed: a dig-in extra may not eat what it needs
      for (const type of own) {   // (its own list and the siege answer; the dig-in extras do not hold pushes back)
        tally[type] = (tally[type] || 0) + 1;
        const e = list.find(x => x.type === type); if (!e) continue;   // not this clan's
        if (camp.buildings.filter(b => b.type === type && b.stage === 'built').length < Math.min(tally[type], e.max || Infinity)) left++;
        if (!next && camp.buildings.filter(b => b.type === type && b.stage !== 'ruined').length < Math.min(tally[type], e.max || Infinity)) next = e;
      }
      m.left = left; nextCost = next?.cost || null;
      m.upgradeFor = !War.upgraded(camp) && plan.some(t => list.some(x => x.type === t) && (BD[t]?.needs || []).some(n => n === 'upgrade' || n === 'tier2')); }
    // Tim 2026-11-17: the timber and stone the next attack.supply.planAhead buildings of its plan need (not standing,
    // its camp may hold them: a building that needs the camp hall upgrade counts once the upgrade is bought or is
    // the next step, and then the upgrade counts too); campSupply sells what is beyond it
    { const need = { timber: 0, stone: 0 }, cnt = {}, ahead = A.supply?.planAhead ?? gen().rules().attack?.supply?.planAhead ?? 2;
      const upNeed = t => (BD[t]?.needs || []).some(n => n === 'upgrade' || n === 'tier2');
      let taken = 0, upCounted = War.upgraded(camp) || !!campHall(w).upgrade;
      for (const type of plan) {
        if (taken >= ahead) break;
        cnt[type] = (cnt[type] || 0) + 1;
        const e = list.find(x => x.type === type); if (!e) continue;
        if (camp.buildings.filter(b => b.type === type && b.stage !== 'ruined').length >= Math.min(cnt[type], e.max || Infinity)) continue;
        if (upNeed(type) && !upCounted) { for (const r of Object.keys(need)) need[r] += W().hallUpgrade?.cost?.[r] || 0; upCounted = true; }
        for (const r of Object.keys(need)) need[r] += e.cost?.[r] || 0;
        taken++;
      }
      m.planNeed = need; }
    m.want = null;   // what it is saving for (campSupply orders it in by train)
    if (camp.buildings.filter(b => b.stage === 'site').length >= (A.sites ?? 2)) return;
    const extra = head.length;
    // a palisade line between the camp and the town (Siege; any strategy once it digs in): after its own list, before the tail
    const PL = A.palisade || (m.fort ? FT.palisade : null);
    const palisade = () => {
      if (!PL || m.wall || camp.buildings.some(b => b.type === 'palisade')) return false;
      const hall = campHall(w), t = town(w.town), a = Math.atan2(t.z - hall.z, t.x - hall.x), d = PL.out ?? 55, half = (PL.length ?? 60) / 2;
      const cx = hall.x + Math.cos(a) * d, cz = hall.z + Math.sin(a) * d, across = Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a));
      const p0 = across ? { x: cx, z: cz - half } : { x: cx - half, z: cz }, p1 = across ? { x: cx, z: cz + half } : { x: cx + half, z: cz };
      const r = War.campLineCheck(w.id, p0, p1);
      if (!r?.ok) {   // only the timber is short: it saves for the line (the tail waits); no room for it: the tail goes on
        const short = r?.points?.length && r.bad === undefined && Object.entries(r.cost || {}).some(([k, v]) => (camp.stock?.[k] || 0) < v);
        if (short) m.want = r.cost;
        return !!short;
      }
      out.push(cmd({ action: 'campLine', war: w.id, x0: p0.x, z0: p0.z, x1: p1.x, z1: p1.z })); m.wall = true;
      return true;
    };
    for (const [i, type] of plan.entries()) {
      if (i === head.length + own.length && palisade()) return;
      if (!(tentNow && i === 0)) seen[type] = (seen[type] || 0) + 1;   // (the supply tents wanted now are one more than it has, wherever the plan stands)
      if (!(tentNow && i === 0) && camp.buildings.filter(b => b.type === type && b.stage !== 'ruined').length >= seen[type]) continue;   // Tim 2026-11-17: a ruin is a gap in the plan again
      const e = list.find(x => x.type === type); if (!e || (e.max && e.count >= e.max)) continue;
      if (e.need.length) {
        const hall = campHall(w);
        if ((BD[type]?.needs || []).some(n => n === 'upgrade' || n === 'tier2') && !War.upgraded(camp)) {
          const U = W().hallUpgrade?.cost || {};
          if (!hall.upgrade && (camp.chest || 0) >= (U.ryo || 0) && (camp.stock?.timber || 0) >= (U.timber || 0) && (camp.stock?.stone || 0) >= (U.stone || 0)) out.push(cmd({ action: 'campUpgrade', war: w.id }));
          else if (!hall.upgrade) m.want = U;
          return;   // saving for the upgrade
        }
        continue;   // waits on an earlier building
      }
      const now = tentNow && i === 0;
      if (!e.ok) { if (i < extra && !now) continue; m.want = e.cost; return; }   // saving for it (a dig-in extra it cannot pay yet does not hold up its list; the supply tents wanted now do)
      // (8d-10, Tim 2026-11-16) a dig-in extra waits while paying it would leave too little for the next building of its own list
      if (i < extra && !now && nextCost && Object.entries({ ...nextCost, ...e.cost }).some(([r]) => (camp.stock?.[r] || 0) < (e.cost?.[r] || 0) + (nextCost[r] || 0))) continue;
      // its turn in the plan and paid for: clear a ruin of that type and build on its spot (Tim 2026-11-17)
      const ruin = type !== 'camp_station' && camp.buildings.find(b => b.type === type && b.stage === 'ruined' && Number.isFinite(b.x));
      if (ruin) { out.push(cmd({ action: 'campErase', war: w.id, building: ruin.id }), cmd({ action: 'campPlace', war: w.id, kind: type, x: ruin.x, z: ruin.z })); return; }
      const p = campSpot(w, type, A);
      if (p) { out.push(cmd({ action: 'campPlace', war: w.id, kind: type, x: p.x, z: p.z })); return; }
    }
    palisade();
  }
  // hire workers up to the strategy's number; a player's camp workers are sent to the building sites (a bot's go by
  // themselves); fires and damage are seen to
  function campWorkers(out, cmd, w, A) {
    const camp = w.camp, C = W().camp || {}, site = F().modules.find(x => x.name === 'workers')?.workers?.siteOf?.(w.id);
    const n = (Array.isArray(camp.workers) ? camp.workers.length : 0) + (camp.workerTraining?.length || 0);
    if (n < Math.min(A.workers ?? C.startWorkers ?? 8, C.workerCap ?? 24) && (camp.chest || 0) >= (C.workerCost ?? 20) + (A.workerReserve ?? 60)) out.push(cmd({ action: 'train', town: w.id, count: 1 }));
    if (!site) return;
    if (!isBot()) {
      const want = W().builders ?? 3;
      for (const b of camp.buildings.filter(x => x.stage === 'site' || x.upgrade)) {
        const on = site.workers.filter(x => x.project === b.id).length; if (on >= want) continue;
        const free = site.workers.filter(x => !x.project && !x.job).map(x => ({ x, d: Math.hypot((x.departure?.[0] ?? camp.x) - b.x, (x.departure?.[1] ?? camp.z) - b.z) })).sort((p, q) => p.d - q.d || (p.x.id < q.x.id ? -1 : 1)).slice(0, want - on).map(o => o.x.id);
        if (free.length) { out.push(cmd({ action: 'workerOrder', town: w.id, workers: free, kind: 'work', target: b.id })); break; }
      }
    }
    mend(out, cmd, site, w.id, `c|${w.id}|`, st => st.camp && st.war === w.id);
    campGather(out, cmd, w, A, site);
  }
  // gatherers follow what the camp is short of (8d-8): camp hands stay on the resource they first picked, so one
  // is moved at a time from the fuller stock to the emptier (attack.gather: the share on timber when stocks are level,
  // `short` = the share on a resource whose stock is under half the other's)
  function campGather(out, cmd, w, A, site) {
    const idx = workersIndex(), RES = F().data.workers?.resources || {}, t = town(w.town), GA = gen().rules().attack?.gather || {};
    if (!idx?.get || !idx.spotsNear || !t) return;
    const of = x => RES[idx.get(x.spot)?.kind], hands = site.workers.filter(x => x.spot && !x.project && !x.job && !x.order && (of(x) === 'timber' || of(x) === 'stone'));
    if (hands.length < 2) return;
    const stock = r => w.camp.stock?.[r] || 0, share = stock('timber') < stock('stone') / 2 ? GA.short ?? 0.75 : stock('stone') < stock('timber') / 2 ? 1 - (GA.short ?? 0.75) : GA.timber ?? 0.6;
    const want = Math.round(hands.length * share), have = hands.filter(x => of(x) === 'timber').length;
    const on0 = {}; for (const x of hands) on0[x.spot] = (on0[x.spot] || 0) + 1;
    const crowd = hands.filter(x => on0[x.spot] > (GA.perSpot ?? 3)).sort((a, b) => a.id < b.id ? -1 : 1)[0];   // too many on one spot: one moves to the next spot of the same kind
    if (have === want && !crowd) return;
    const to = have === want ? of(crowd) : have < want ? 'timber' : 'stone', from = have === want ? of(crowd) : have < want ? 'stone' : 'timber', hall = campHall(w), R = F().war.data?.circleRadius ?? 900, ring = ringRadius(t, F().data);
    const on = {}; for (const x of site.workers) if (x.spot) on[x.spot] = (on[x.spot] || 0) + 1;
    const spot = idx.spotsNear(t.x, t.z, R).filter(p => RES[p.kind] === to && dist(p, t) > ring && dist(p, hall) <= (GA.far ?? 450) && (on[p.id] || 0) < (GA.perSpot ?? 3)).sort((a, b) => dist(a, hall) - dist(b, hall) || (a.id < b.id ? -1 : 1))[0];
    const hand = have === want ? crowd : hands.filter(x => of(x) === from && !x.carrying).sort((a, b) => a.id < b.id ? -1 : 1)[0] || hands.filter(x => of(x) === from).sort((a, b) => a.id < b.id ? -1 : 1)[0];
    if (spot && hand) out.push(cmd({ action: 'assign', town: w.id, workers: [hand.id], spot: spot.id }));
  }
  function campTrain(out, cmd, w, A) {
    const War = F().war, camp = w.camp, tv = War.troopView(w.id); if (!tv) return;
    const G = gen().rules(), m = memory(w, 'attacker'), SU = siegeUp(w, m), ahead = G.queueAhead ?? 2;
    const mix = SU ? { ...(A.mix || { grunt: 1 }), siege: Math.max(A.mix?.siege || 0, SU.siege ?? 2) } : A.mix || { grunt: 1 };
    const keepUp = m.upgradeFor && !campHall(w).upgrade ? W().hallUpgrade?.cost?.ryo || 0 : 0;   // the camp hall upgrade comes first (8d-10)
    let room = tv.cap - tv.troops - tv.queued, chest = (camp.chest || 0) - (A.chestReserve ?? 0) - keepUp;
    const cheapest = Math.min(...camp.buildings.filter(b => b.stage === 'built').flatMap(b => War.trainsAt(b.type, clan).filter(u => weight(mix, u) > 0).map(u => War.ryoOf(clan, u))), Infinity);
    m.spent = tv.queued === 0 && (room <= 0 || chest < cheapest) && !camp.buildings.some(b => b.stage === 'site');   // it cannot grow any more
    m.capped = room <= 0 && chest >= cheapest || undefined;   // more supply tents would mean more troops (campBuild)
    m.keepUp = keepUp || undefined; m.room = Math.max(0, room);   // for the ryo orders (campSupply)
    const have = {};
    for (const e of troops(w)) if (e.warUnit) have[e.warUnit] = (have[e.warUnit] || 0) + 1;
    for (const b of camp.buildings) for (const q of b.queue || []) have[q.unit] = (have[q.unit] || 0) + 1;
    const shops = camp.buildings.filter(b => b.stage === 'built').map(b => ({ id: b.id, units: War.trainsAt(b.type, clan).map(u => ({ unit: u, ryo: War.ryoOf(clan, u) })), queued: b.queue?.length || 0 })).filter(b => b.units.length);
    for (const t of trainPlan(mix, shops, have, chest, room, ahead)) out.push(cmd({ action: 'campTrain', war: w.id, building: t.building, unit: t.unit, count: 1 }));
  }
  // what the army goes for next, by the strategy's order of targets
  function pickTarget(w, A, from) {
    const S = F().structures, list = S.list().filter(st => st.town === w.town && !st.camp && S.hpOf(st) > 0);
    const near = l => l.map(st => ({ st, d: dist(st, from) })).sort((a, b) => a.d - b.d || (a.st.key < b.st.key ? -1 : 1))[0]?.st || null;
    for (const kind of [...(A.targets || []), 'military', 'hall']) {
      if (kind === 'workers') {
        const u = workersOut(w.defender, w.town).map(e => ({ e, d: dist(e, from) })).sort((a, b) => a.d - b.d || (a.e.id < b.e.id ? -1 : 1))[0]?.e;
        if (u) return { unit: u };
        continue;
      }
      if (kind === 'wall') continue;   // walls and gates are broken only to get in (wayIn)
      const st = near(list.filter(x => kind === 'station' ? x.type === 'station' : kind === 'tower' ? x.type === 'watchtower' : kind === 'wall' ? x.kind === 'wall' || x.kind === 'gate' : kind === 'hall' ? x.type === 'town_hall' : x.military && x.kind === 'building' && !isFort(x)));
      if (st) return { st };
    }
    // whatever else still holds the town's morale up (a stable, an infirmary); the stockades last of all (8d-9)
    const weight = W().morale?.weights || {}, rest = near(list.filter(x => weight[x.type]));
    return rest ? { st: rest } : null;
  }
  // a walled town (8d-8): with the gates shut to the attacker no way may lead to the target; the army then breaks
  // a gate or wall piece it can walk up to, the one nearest its way in, and keeps at that piece until it is through
  function wayIn(w, tg, mine, cx, cz, m) {
    const goal = tg?.st || tg?.unit; if (!goal || tg.st?.kind === 'wall' || tg.st?.kind === 'gate') { delete m.breach; return null; }
    const S = F().structures, bars = S.list().filter(st => st.town === w.town && !st.camp && (st.kind === 'wall' || st.kind === 'gate') && S.hpOf(st) > 0);
    if (!bars.length) { delete m.breach; return null; }
    const lead = mine.map(e => ({ e, d: Math.hypot(e.x - cx, e.z - cz) })).sort((a, b) => a.d - b.d || (a.e.id < b.e.id ? -1 : 1))[0].e;
    const nav = S.gateNav(lead) || game.areas?.nav; if (!nav?.findPath) return null;
    const reach = gen().rules().wallReach ?? 8;
    const way = (to, r) => {   // can the lead walk up to within reach of the point r short of `to`?
      const d = dist(to, lead) || 1, near = nav.nearestFree?.(to.x + (lead.x - to.x) / d * r, to.z + (lead.z - to.z) / d * r);
      const end = near && nav.findPath(lead.x, lead.z, near[0], near[1])?.at(-1);
      return !!end && Math.hypot(end[0] - near[0], end[1] - near[1]) <= reach;
    };
    if (way(goal, (goal.r || 1) + 3)) { delete m.breach; return null; }   // a way in
    const kept = m.breach && bars.find(st => st.key === m.breach);
    if (kept) return { st: kept };
    const pick = bars.map(st => ({ st, d: dist(st, lead) + dist(st, goal) })).sort((a, b) => a.d - b.d || (a.st.key < b.st.key ? -1 : 1)).slice(0, gen().rules().wallTries ?? 8).find(o => way(o.st, (o.st.r || 5) + 3))?.st;
    if (!pick) return null;
    m.breach = pick.key;
    return { st: pick };
  }
  // the camp's ranged troops that are not on a push go into its stockade (8d-9) and shoot from it: ids sent this look
  function campGarrison(out, cmd, w, list) {
    const GA = F().garrison, S = F().structures; if (!cmd || !GA?.capOf || !list.length) return [];
    const st = S.list().find(x => x.camp && x.war === w.id && isFort(x) && S.hpOf(x) > 0); if (!st) return [];
    const ranged = gen().rules().rangedUnits || ['archer', 'rifleman'], room = GA.capOf(st) - (heldIn()[st.key] || 0);
    const ids = list.filter(e => ranged.includes(e.warUnit) && !e.order?.garrisonKey).sort((a, b) => a.id < b.id ? -1 : 1).slice(0, Math.max(0, room)).map(e => e.id);
    if (ids.length) out.push(cmd({ action: 'garrison', mode: 'enter', structure: st.key, units: ids, walk: true }));
    return ids;
  }
  function campArmy(out, order, w, A, cmd = null) {
    const G = gen().rules(), m = memory(w, 'attacker'), hall = campHall(w), t = town(w.town);
    const all = troops(w).filter(e => !e.garrison && !e.downed), held = troops(w).filter(e => e.garrison?.fort && !e.downed), count = all.length + held.length;
    const comeOut = () => { if (cmd) for (const key of new Set(held.map(e => e.garrison.key))) out.push(cmd({ action: 'garrison', mode: 'leave', structure: key })); };
    if (!count) { if (m.mode === 'push') m.beaten = (m.beaten || 0) + 1; m.mode = 'hold'; delete m.wave; return; }
    const far = (e, x, z, r) => Math.hypot((e.order?.x ?? 1e9) - x, (e.order?.z ?? 1e9) - z) > r;
    const foe = e => e.owner === w.defender && e.place === 'world' && !e.dead && !e.downed && !e.rout && !e.hidden && !e.garrison && !e.worker && e.type !== 'civilian' && e.type !== 'hero' && e.type !== 'horse';
    const meet = (list, x, z, r) => {
      const f0 = Object.values(state.entities).filter(e => foe(e) && Math.hypot(e.x - x, e.z - z) <= r).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z) || (a.id < b.id ? -1 : 1))[0];
      if (!f0) return false;
      const ids = list.filter(e => e.order?.kind !== 'attack' && (e.order?.kind !== 'attackmove' || e.order.arrived || far(e, f0.x, f0.z, G.retarget ?? 40))).map(e => e.id);
      if (ids.length) out.push(order({ kind: 'attackmove', units: ids, x: Math.round(f0.x), z: Math.round(f0.z) }));
      return true;
    };
    // gather by the camp, on the town's side; defenders who come near are met
    const gather = list => {
      if (!list.length || meet(list, hall.x, hall.z, A.guard ?? 120)) return;
      const going = new Set(campGarrison(out, cmd, w, list)); list = list.filter(e => !going.has(e.id) && !e.order?.garrisonKey);
      const d = dist(t, hall) || 1, hx = Math.round(hall.x + (t.x - hall.x) / d * (A.rallyOut ?? 32)), hz = Math.round(hall.z + (t.z - hall.z) / d * (A.rallyOut ?? 32));
      const ids = list.filter(e => Math.hypot(e.x - hx, e.z - hz) > (G.holdRadius ?? 35) && (e.order?.kind !== 'station' || far(e, hx, hz, 5))).map(e => e.id);
      if (ids.length) out.push(order({ kind: 'station', units: ids, x: hx, z: hz }));
    };
    // it pushes at pushAt troops, or with what it has once it cannot grow any more. A push is one wave (8d-8): troops
    // trained meanwhile gather at the camp for the next. The wave is given up at fallBack of its size; after each
    // push given up the next waits for regroup times more troops (up to the troop cap). Once it cannot grow, all go.
    const pushAt = A.pushAt ?? 12, cap = F().war.troopView(w.id)?.cap ?? Infinity;
    const need = Math.max(1, Math.min(cap, Math.round(pushAt * (A.regroup ?? G.attack?.regroup ?? 1.5) ** Math.min(m.beaten || 0, G.attack?.regroupMost ?? 3))));
    const everyone = [...all, ...held].map(e => e.id);   // (those in the camp stockade count; they come out when a push starts)
    if (m.mode === 'push' && m.spent && m.wave && count > m.wave.length && (m.left === 0 || state.tick - (w.started ?? w.at ?? state.tick) >= (A.buildWaitSeconds ?? G.attack?.buildWaitSeconds ?? 1200) * 20)) { comeOut(); m.wave = everyone; m.pushed = Math.max(m.pushed || 0, count); }   // it cannot grow any more: the reserve joins the wave
    const mine = m.mode === 'push' && m.wave ? all.filter(e => m.wave.includes(e.id)) : all;
    const waveSize = m.mode === 'push' && m.wave ? mine.length + held.filter(e => m.wave.includes(e.id)).length : count;
    // (8d-10) before every building of its plan stands it pushes only as a probe, attack.probes times at most (the
    // strategy's probes first), unless attack.buildWaitSeconds have passed since the war began
    // Tim 2026-11-17: it may push in full before its list is built: a bold general (gen().temper) once its core troops
    // are up (attack.boldReady: troops, ranged among them), any general when its army is worth attack.edgePush times
    // the defenders it can see near the town. Never into a town with a stockade before it has siege guns (8d-10).
    const UD = F().data.war?.units || {}, BR = A.boldReady || G.attack?.boldReady || {}, groupOf = e => UD[e.warUnit]?.group;
    const worth = l => l.reduce((n, e) => n + (F().war.ryoOf(e.owner, e.warUnit) || 60), 0);
    const seen = Object.values(state.entities).filter(e => foe(e) && Math.hypot(e.x - t.x, e.z - t.z) <= (A.scout ?? G.attack?.scout ?? 600));
    const stockadeShut = !!siegeUp(w, m) && ![...all, ...held].some(e => groupOf(e) === 'siege');
    const bold = gen().temper?.(w, 'attacker') === 'bold' && count >= (BR.troops ?? 10) && [...all, ...held].filter(e => groupOf(e) === 'ranged').length >= (BR.ranged ?? 2);
    const edge = seen.length > 0 && worth([...all, ...held]) >= (A.edgePush ?? G.attack?.edgePush ?? 1.5) * worth(seen);
    const early = !stockadeShut && (bold || edge);
    m.early = early ? (bold ? 'bold' : 'edge') : undefined;
    const ready = m.left === 0 || early || state.tick - (w.started ?? w.at ?? state.tick) >= (A.buildWaitSeconds ?? G.attack?.buildWaitSeconds ?? 1200) * 20;
    const may = ready || (m.probes || 0) < (A.probes ?? G.attack?.probes ?? 1);
    const strong = m.mode === 'push' ? waveSize >= Math.max(1, Math.ceil((m.pushed || pushAt) * (A.fallBack ?? 0.35))) || (m.spent && waveSize > 0) : may && (count >= need || (early && count >= (A.pushLeast ?? 3)) || (m.spent && count >= (A.pushLeast ?? 3)));
    if (strong && m.mode !== 'push') { comeOut(); m.pushed = count; m.wave = everyone; if (!ready) m.probes = (m.probes || 0) + 1; }
    if (!strong && m.mode === 'push') m.beaten = (m.beaten || 0) + 1;   // a push given up: the camp digs in (campBuild)
    if (!strong) { m.mode = 'hold'; delete m.wave; gather(all); return; }
    if (m.wave) { m.wave = m.wave.filter(id => everyone.includes(id)); gather(all.filter(e => !m.wave.includes(e.id))); }
    m.mode = 'push';
    if (!mine.length) return;   // the wave is still coming out of the stockade
    const cx = mine.reduce((n, e) => n + e.x, 0) / mine.length, cz = mine.reduce((n, e) => n + e.z, 0) / mine.length;
    m.mode = 'push';
    if (meet(mine, cx, cz, A.engage ?? 45)) return;   // troops in the way first
    let tg = pickTarget(w, A, { x: cx, z: cz });
    tg = wayIn(w, tg, mine, cx, cz, m) || tg;
    if (!tg) {   // nothing left to break: the army stands at the hall while the hero takes it
      const p = F().warEnd.hallPoint(w, 'town');
      const ids = p ? mine.filter(e => Math.hypot(e.x - p.x, e.z - p.z) > 30 && (e.order?.kind !== 'attackmove' || far(e, p.x, p.z, 10))).map(e => e.id) : [];
      if (ids.length) out.push(order({ kind: 'attackmove', units: ids, x: Math.round(p.x), z: Math.round(p.z) }));
      return;
    }
    if (tg.unit) {
      const ids = mine.filter(e => e.order?.kind !== 'attack' && (e.order?.kind !== 'attackmove' || e.order.arrived || far(e, tg.unit.x, tg.unit.z, G.retarget ?? 40))).map(e => e.id);
      if (ids.length) out.push(order({ kind: 'attackmove', units: ids, x: Math.round(tg.unit.x), z: Math.round(tg.unit.z) }));
      return;
    }
    const md = mendersBy(w.defender, w.town, tg.st);
    if (md) {
      const ids = mine.filter(e => e.order?.kind !== 'attack' && (e.order?.kind !== 'attackmove' || e.order.arrived || far(e, md.x, md.z, 12))).map(e => e.id);
      if (ids.length) out.push(order({ kind: 'attackmove', units: ids, x: Math.round(md.x), z: Math.round(md.z) }));
      return;
    }
    const ids = mine.filter(e => e.order?.kind !== 'attack' && (e.order?.kind !== 'raze' || e.order.structure !== tg.st.key)).map(e => e.id);
    if (ids.length) {
      out.push(order({ kind: 'raze', units: ids, structure: tg.st.key }));
      if (tg.st.kind !== 'wall' && tg.st.kind !== 'gate') out.push(order({ kind: 'raze', units: ids, structure: tg.st.key, torch: true }));   // those who can torch do
    }
  }
  // ---- the supply line (8e-7) -------------------------------------------------------------------------------------
  // an own town (not the capital) with a railway station: a camp station is only worth building with one
  const stationTown = () => Object.values(state.frontier?.settlements || {}).some(s => s.owner === clan && !s.capital && (s.buildings || []).some(b => b.type === 'station' && b.stage === 'built'));
  const openOrders = () => Object.values(state.frontier?.shipping?.orders || {}).filter(o => o.owner === clan && o.state === 'open');
  // a linked camp: the war chest is topped up by train (Clan treasury above its keep line and within the daily share,
  // then town coffers down to the general's keep line) and timber and stone are ordered in from the clan's towns
  // Tim 2026-11-17: a cut supply line is mended first, before the rest of the plan, while it can pay with its
  // buildReserve kept: the station first, then the sections, one at a time (camp workers build each like a site)
  // ryo by train into its war chest (Tim 2026-11-17: each side uses all it has). While the chest holds less than
  // war.supply.chestLow it can spend (`usable`: the chest less what it keeps back), one open auto order from the Clan
  // treasury (keep line, daily share and refill apply, sim side) AND one from an own town's coffers down to the
  // general's keep share, sized to what it can spend (`want`), at least refill, at most a trainload of ryo.
  function chestByTrain(out, cmd, w, side, usable, want, held = 0) {
    const SH = F().shipments, P = W().supply || {}, RS = F().data.railways?.ship || {}, min = RS.ryoMin ?? 10;
    const node = side === 'attacker' ? (w.camp?.station?.linked ? w.camp.station.node : null) : w.town;
    if (!SH || !node || usable >= (P.chestLow ?? 300)) return;
    const open = openOrders().filter(o => o.kind === 'ryo' && o.war === w.id);
    if (!open.some(o => o.auto) && SH.route(clan, 'capital', node) && SH.autoRoom(state.clans[clan]) >= min) out.push(cmd({ action: 'ship', mode: 'autoChest', war: w.id, ...(held > 0 ? { held } : {}) }));
    if (open.some(o => !o.auto)) return;   // (Tim 2026-11-17: a player's defending general too, down to each town's keep line)
    const G = gen().rules(), base = memory(w, side).coffers ||= {}, at = side === 'attacker' ? w.camp : town(w.town);
    const towns = Object.values(state.frontier.settlements || {}).filter(s => s.owner === clan && !s.capital && s.id !== w.town && SH.route(clan, s.id, node))
      .sort((a, b) => dist(a, at) - dist(b, at) || (a.id < b.id ? -1 : 1));
    for (const s of towns) {
      base[s.id] ??= Math.floor(s.stock?.ryo || 0);
      const keep = isBot() ? (G.botKeepShare ?? G.keepShare) : GEN().keepOf(s);
      const spare = Math.floor(Math.min((s.stock?.ryo || 0) - base[s.id] * keep, Math.max(P.refill ?? 500, want || 0), RS.ryoPerTrain ?? 2000));
      if (spare >= min) { out.push(cmd({ action: 'ship', mode: 'ryo', from: s.id, into: 'chest', war: w.id, amount: spare })); break; }
    }
  }
  // a bot's defending town short of ryo sells what it can spare at the capital by train (Tim 2026-11-17: each side
  // uses all it has): the resource of general.sell that pays most, never below the town's keep amount, a trainload
  // at a time, one sale open at a time; the ryo lands in the coffers and goes on into the chest (fillChest)
  function sellSpare(out, cmd, w) {
    const SH = F().shipments, s = town(w.town), list = gen().rules().sell || [];
    if (!isBot() || !SH || !s || !list.length || (w.defense?.chest || 0) >= (W().supply?.chestLow ?? 300) || !SH.route(clan, s.id, 'capital')) return;
    if (Object.values(state.frontier?.shipping?.orders || {}).some(o => o.state === 'open' && o.kind === 'sell' && o.sellFrom === s.id && !o.auto)) return;
    const RS = F().data.railways?.ship || {}, T = F().data.railways?.train || {}, load = Math.max(1, T.consist ? T.consist.filter(k => k === 'goods').length : 1) * (RS.wagonLoad ?? 60);
    const pick = list.map(r => ({ r, n: Math.floor(Math.min(SH.free(s, r), load)), pay: RS.sellPrice?.[r] ?? 2 })).filter(x => x.n >= (RS.minOrder ?? 10)).sort((a, b) => b.n * b.pay - a.n * a.pay || (a.r < b.r ? -1 : 1))[0];
    if (pick) out.push(cmd({ action: 'ship', mode: 'sell', town: s.id, resource: pick.r, amount: pick.n }));
  }
  // Tim 2026-11-17: towns rebuild ruins during a war. The general rebuilds a ruined station, stockade or military
  // building of the town in plan order (the station first, then by its place in defend.build, the tail last), one at
  // a time, when the stores hold its cost above general.buildReserve; never all at once
  function townRuins(s) {
    const data = F().data, list = strat().defend?.build || [], at = t => t === 'station' ? -1 : list.indexOf(t) < 0 ? list.length : list.indexOf(t);
    return (s.buildings || []).filter(b => b.stage === 'ruined' && (b.type === 'station' || b.type === 'stockade' || isMilitary(b.type, data)))
      .map(b => ({ b, at: at(b.type) })).sort((x, y) => x.at - y.at || (x.b.id < y.b.id ? -1 : 1));
  }
  function rebuildTown(out, cmd, w) {
    const s = town(w.town), data = F().data;
    if (!s || s.owner !== clan || (s.buildings || []).some(b => b.type === 'town_hall' && b.stage === 'ruined')) return;
    if ((s.projects || []).some(p => p.replaces) || s.warUpgrade) return;
    const b = townRuins(s)[0]?.b; if (!b) return;
    const R = gen().rules().buildReserve || {}, cost = buildingCost(data, b.type, s) || {};
    if (Object.entries(cost).every(([r, v]) => (s.stock?.[r] ?? 0) >= v + (R[r] ?? 0))) out.push(cmd({ action: 'rebuild', settlement: s.id, building: b.id }));
  }
  function mendLine(out, cmd, w) {
    const c = w.camp;
    if (!c || !c.buildings.some(b => (b.type === 'camp_station' || b.type === 'rail_section') && b.stage === 'ruined')) return;
    if (c.buildings.some(b => (b.type === 'camp_station' || b.type === 'rail_section') && b.stage === 'site')) return;
    const R = gen().rules().buildReserve || {};
    const b = [...c.buildings.filter(x => x.type === 'camp_station'), ...c.buildings.filter(x => x.type === 'rail_section')].find(x => x.stage === 'ruined');
    const r = F().war.campRebuildCheck?.(w.id, b.id);
    if (r?.ok && Object.entries(r.cost || {}).every(([k, v]) => (k === 'ryo' ? c.chest || 0 : c.stock?.[k] || 0) >= v + (R[k] || 0))) out.push(cmd({ action: 'campRebuild', war: w.id, building: b.id }));
  }
  function campSupply(out, cmd, w, A) {
    const c = w.camp, node = c.station?.node, SH = F().shipments;
    const P = W().supply || {}, SU = { ...(gen().rules().attack?.supply || {}), ...(A.supply || {}) };
    if (!node || !c.station.linked || !SH) return;
    const m = memory(w, 'attacker');
    // what the chest can spend: the camp hall upgrade's ryo is kept back while the plan needs it (campTrain), so it
    // does not count; it wants enough to fill its troop room (about a troop's price each) and the upgrade
    chestByTrain(out, cmd, w, 'attacker', (c.chest || 0) - (m.keepUp || 0), (m.room || 0) * (gen().rules().troopRyo ?? 120) + (m.keepUp || 0), m.keepUp || 0);
    // (Tim 2026-11-17: also while the stock is short of the building it is saving for, its buildReserve on top)
    // what is on its way counts as stock; an order is at least `order`, more when the building needs more, and all
    // its open orders stay within what the line queues (railways.ship.queueTrips trainloads)
    const want = m.want, BR = gen().rules().buildReserve || {}, RS = F().data.railways?.ship || {}, T = F().data.railways?.train || {};
    const queue = (RS.queueTrips ?? 3) * Math.max(1, T.consist ? T.consist.filter(k => k === 'goods').length : 1) * (RS.wagonLoad ?? 60);
    let coming = ['timber', 'stone'].reduce((n, r) => n + SH.openIncoming(node, r), 0);
    // Tim 2026-11-17: what its towns cannot spare is bought at the capital with war chest ryo above chestLow (and the
    // camp hall upgrade's ryo it keeps back): a new order carries that much as its offer; an open order no town has
    // filled for attack.supply.buyAfterSeconds gets one
    const buyPrice = r => RS.buyPrice?.[r] ?? 5, purse = () => Math.max(0, (c.chest || 0) - (m.keepUp || 0) - (P.chestLow ?? 300));
    const spareIn = r => Object.values(state.frontier.settlements || {}).filter(s => s.owner === clan && !s.capital && SH.route(clan, s.id, node)).reduce((n, s) => n + SH.free(s, r, { camp: true }), 0);
    for (const r of ['timber', 'stone']) {
      const need = Math.max(SU[r + 'Low'] ?? 150, want?.[r] ? want[r] + (BR[r] || 0) : 0), have = (c.stock?.[r] || 0) + SH.openIncoming(node, r);
      if (have >= need) continue;
      const amount = Math.floor(Math.min(Math.max(SU.order ?? 200, need - have), queue - coming));
      if (amount < (RS.minOrder ?? 10)) continue;
      const short = Math.max(0, amount - spareIn(r)), ryo = Math.floor(Math.min(short * buyPrice(r), purse()));
      out.push(cmd({ action: 'ship', mode: 'order', town: node, resource: r, amount, ...(ryo > 0 ? { ryo } : {}) })); coming += amount;
    }
    const late = (SU.buyAfterSeconds ?? 60) * 20;
    for (const o of openOrders().filter(o => o.camp && o.to === node && o.kind !== 'sell' && !(o.ryo > 0) && !o.sources.length && !(o.got > 0) && state.tick - (o.created ?? 0) >= late)) {
      const ryo = Math.floor(Math.min((o.amount - o.got) * buyPrice(o.resource), purse()));
      if (ryo > 0) { out.push(cmd({ action: 'ship', mode: 'offer', order: o.id, ryo })); break; }
    }
    // Tim 2026-11-17: stores beyond what the rest of its plan needs (and its low marks and buildReserve) are sold at
    // the capital, the better paying first, a trainload at a time, one sale open; the ryo comes into the war chest
    if (!openOrders().some(o => o.kind === 'sell' && o.camp && o.war === w.id)) {
      const load = Math.max(1, T.consist ? T.consist.filter(k => k === 'goods').length : 1) * (RS.wagonLoad ?? 60);
      const pick = ['timber', 'stone'].filter(r => !SH.openIncoming(node, r)).map(r => ({ r, n: Math.floor(Math.min(load,
        (c.stock?.[r] || 0) - (c.reserved?.[r] || 0) - (m.planNeed?.[r] || 0) - (BR[r] || 0) - (SU[r + 'Low'] ?? 150))), pay: RS.sellPrice?.[r] ?? 2 }))
        .filter(x => x.n >= Math.max(RS.minOrder ?? 10, SU.sellMin ?? 100)).sort((a, b) => b.n * b.pay - a.n * a.pay)[0];
      if (pick) out.push(cmd({ action: 'ship', mode: 'sell', town: node, resource: pick.r, amount: pick.n }));
    }
  }
  // ---- armory upgrades (8e-9) -------------------------------------------------------------------------------------
  // with an armory and nothing in the work: the next level for the group it has most troops of (weapons, then armor),
  // while the chest and stock keep general.armory.reserve on top of the cost
  function armory(out, cmd, w, side) {
    const AR = F().war.armory, v = AR?.view(w.id, clan);
    if (!v?.has || v.work) return;
    const R = gen().rules().armory?.reserve || {}, chest = side === 'attacker' ? w.camp?.chest || 0 : town(w.town)?.castle ? Math.max(0, state.clans[clan]?.ryo || 0) : w.defense?.chest || 0;
    const stock = side === 'attacker' ? w.camp?.stock || {} : town(w.town)?.castle ? { timber: Infinity, stone: Infinity } : town(w.town)?.stock || {};
    const count = {}; for (const e of troops(w)) { const g = AR.groupOf(e.warUnit); if (g) count[g] = (count[g] || 0) + 1; }
    const picks = v.groups.flatMap(g => g.tracks.map(t => ({ group: g.group, track: t.track, level: t.level, cost: t.cost, ok: !t.why, n: count[g.group] || 0 })))
      .filter(p => p.ok && p.n > 0 && chest >= (p.cost.ryo || 0) + (R.ryo ?? 300) && ['timber', 'stone'].every(r => (stock[r] || 0) >= (p.cost[r] || 0) + (R[r] ?? 0)))
      .sort((a, b) => b.n - a.n || a.level - b.level || (a.track === 'weapons' ? -1 : 1) - (b.track === 'weapons' ? -1 : 1) || (a.group < b.group ? -1 : 1));
    if (picks.length) out.push(cmd({ action: 'armoryUp', war: w.id, group: picks[0].group, track: picks[0].track }));
  }
  function attack(out, cmd, order, w) {
    if (!w.camp) return;
    const A = strat().attack || {};
    mendLine(out, cmd, w);
    campBuild(out, cmd, w, A);
    campSupply(out, cmd, w, A);
    armory(out, cmd, w, 'attacker');
    campWorkers(out, cmd, w, A);
    campTrain(out, cmd, w, A);
    campArmy(out, order, w, A, cmd);
    if (!isBot()) return;
    // a bot's hero waits behind the camp hall, and takes the town hall once the town's morale is 0
    const h = hero(), hall = campHall(w), t = town(w.town);
    if (goal?.why === 'take') return;   // he is needed at a camp that fell
    if (F().warMorale.ready(w.id, 'town')) {
      const p = F().warEnd.hallPoint(w, 'town');
      if (p) goal = { x: p.x + p.r + 2, z: p.z, near: 3, why: 'take' };
      if (h && !w.channel) {
        const pick = (t?.castle ? ['fall'] : ['capture', 'sack']).find(o => F().warEnd.check(h, w, 'town', o).ok);   // Z6: a keep has one outcome
        if (pick) out.push(cmd({ action: 'warTake', war: w.id, outcome: pick }));
      }
      return;
    }
    const d = dist(t, hall) || 1;
    goal = { x: hall.x - (t.x - hall.x) / d * 20, z: hall.z - (t.z - hall.z) / d * 20, near: 8, why: 'camp' };
  }

  // ---- a bot starts a war ------------------------------------------------------------------------------------------
  // from an own town founded at least launchTownDays ago that can spare the pack; never while it is in another war
  // the pack for a target: attack.packByTier (by the target's town hall tier), else attack.pack
  const packFor = (A, t) => (A.packByTier?.length ? A.packByTier[Math.max(0, Math.min(A.packByTier.length, t?.tier || 1) - 1)] : null) || A.pack || {};
  const canPack = (from, A, t) => ['ryo', 'timber', 'stone'].every(r => (from.stock?.[r] ?? 0) >= (packFor(A, t)[r] ?? 0) + (A.keep?.[r] ?? 0));
  function launchTown(A) {
    const G = gen().rules(), need = packFor(A, null), keep = A.keep || {};
    return Object.values(state.frontier.settlements).filter(s => s.owner === clan && !s.capital && s.grid && Number.isFinite(s.x) && s.founded !== undefined
      && (state.tick - s.founded) >= (G.launchTownDays ?? 3) * gen().dayTicks
      && ['ryo', 'timber', 'stone'].every(r => (s.stock?.[r] ?? 0) >= (need[r] ?? 0) + (keep[r] ?? 0)))
      .sort((a, b) => (b.stock.ryo - a.stock.ryo) || (a.id < b.id ? -1 : 1))[0] || null;
  }
  // any clan's town that is not a capital, not at war, not under truce and not freshly sacked: the nearer, the
  // bigger and the less fortified (as its buildings show), the better
  // Z6 (2026-11-20): a rival castle this clan may besiege now (4 of 6 zones, one of them the castle's own or next to
  // it): the nearest to the launch town, whoever holds it. It never singles out the player. A siege comes before any
  // town: the campaign is won by castles.
  function pickCastle(from, A) {
    const Z = F().campaignZones, War = F().war; if (!Z?.siege) return null;
    return Object.values(state.frontier.settlements).filter(s => s.castle && s.owner != null && s.owner !== clan && !state.clans?.[s.owner]?.out && s.grid && Number.isFinite(s.x)
      && Z.siege(clan, Z.zoneOfTown(s)).ok && canPack(from, A, s) && !War.warOn(s.id) && !War.cooldownDays(s.id))
      .sort((a, b) => dist(a, from) - dist(b, from) || (a.id < b.id ? -1 : 1))[0] || null;
  }
  function pickTown(from, A) {
    const War = F().war, hist = state.frontier.wars?.history || [], data = F().data, tierWorth = W().surrender?.worth?.tier || [0, 300, 900, 2000];
    const skip = ((A.sackedSkipDays ?? 6) + (W().cooldownDays ?? 0)) * gen().dayTicks;
    // Z2: a Warlord (campaign strategy `weakest`) goes for the least defended town it knows, then the usual score
    const weakest = !!F().rivalCampaign?.strategy(clan)?.weakest, forts = s => (s.buildings || []).filter(b => b.stage === 'built' && isMilitary(b.type, data)).length;
    return Object.values(state.frontier.settlements).filter(s => !s.capital && s.owner != null && s.owner !== clan && s.grid && Number.isFinite(s.x) && s.founded !== undefined
      && (F().rivalCampaign?.knows(clan, s) ?? true)   // Z2: only towns it knows (its zones, the zones touching them, its attackers)
      && canPack(from, A, s) && !War.warOn(s.id) && !War.cooldownDays(s.id) && !hist.some(x => x.town === s.id && x.result === 'sacked' && state.tick - (x.ended ?? 0) < skip))
      .map(s => ({ s, score: ((tierWorth[s.tier || 1] ?? 300) + (s.pop || 0) * (A.popWorth ?? 5) - (s.buildings || []).filter(b => b.stage === 'built' && isMilitary(b.type, data)).length * (A.fortPenalty ?? 60)) / (1 + dist(s, from) / (A.distanceScale ?? 1500)) }))
      .sort((a, b) => (weakest ? forts(a.s) - forts(b.s) : 0) || b.score - a.score || (a.s.id < b.s.id ? -1 : 1))[0]?.s || null;
  }
  // a banner spot in the band round the target: one with trees and stone in reach of the camp (attack.resourceRange,
  // outside the town's ring) before one without, then the side the hero comes from first
  function bannerSpot(t, h, A) {
    const War = F().war, [inner, outer] = War.band(t), r = (inner + outer) / 2, a0 = Math.atan2(h.z - t.z, h.x - t.x);
    const idx = workersIndex(), RES = F().data.workers?.resources || {}, ring = ringRadius(t, F().data), reach = A?.resourceRange ?? 350;
    let best = null;
    // a castle's band runs round its walls (Z6): the points of its outline, the nearest to the hero first
    const ringPts = t.castle && War.bandOutline ? War.bandOutline(t, r).map(q => ({ x: Math.round(q.x), z: Math.round(q.z) })).sort((p, q) => dist(p, h) - dist(q, h) || p.x - q.x || p.z - q.z) : null;
    for (let k = 0; k < (ringPts ? ringPts.length : 32); k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 16, p = ringPts ? ringPts[k] : { x: Math.round(t.x + Math.cos(a) * r), z: Math.round(t.z + Math.sin(a) * r) };
      if (!War.check({ type: 'hero', owner: clan, place: 'world', x: p.x, z: p.z }, t.id, p).ok) continue;
      const near = idx?.spotsNear ? idx.spotsNear(p.x, p.z, reach).filter(sp => dist(sp, t) > ring) : null;
      const lack = near ? ['timber', 'stone'].filter(res => !near.some(sp => RES[sp.kind] === res)).length : 0;
      if (!best || lack < best.lack) best = { ...p, lack };
      if (!lack) break;
    }
    return best ? { x: best.x, z: best.z } : null;
  }
  function launch(out, cmd, h) {
    const c = state.clans[clan], G = gen().rules(), A = G.attack || {}, War = F().war;
    const packed = () => ['ryo', 'timber', 'stone'].some(r => (c.warPack?.[r] || 0) > 0);
    const drop = () => { if (packed()) out.push(cmd({ action: 'warUnpack' })); mem.plan = null; goal = null; };
    let p = mem.plan;
    if (!p) {
      if (h.place !== 'world' || h.dead || h.downed || War.warsOf(clan).length >= (G.maxAttacks ?? 1)) return;
      // at peace and out in the wilds (a war just ended): he walks back to his nearest town
      if (!War.potAt(h)) {
        const home = Object.values(state.frontier.settlements).filter(s => s.owner === clan && !s.capital && Number.isFinite(s.x)).sort((a, b) => dist(a, h) - dist(b, h) || (a.id < b.id ? -1 : 1))[0];
        if (home) goal = { x: home.x + 20, z: home.z, near: 25, why: 'home' };
        if (home) return;
      }
      if ((state.tick ?? 0) % Math.max(1, Math.round((A.planSeconds ?? 60) * 20)) !== 0) return;
      if (F().rivalCampaign && !F().rivalCampaign.mayWar(clan)) return;   // Z2: its campaign strategy holds it back (Expander with land left, Fortress short of ryo)
      const from = launchTown(A), target = from && (pickCastle(from, A) || pickTown(from, A));
      if (!target) return;
      p = mem.plan = { from: from.id, town: target.id, stage: 'pack', at: state.tick };
    }
    const from = town(p.from), t = town(p.town);
    const mineNow = War.warsOf(clan).find(w => w.attacker === clan && w.town === p.town);
    if (mineNow) { mem.plan = null; return; }   // the banner is up
    if (!from || from.owner !== clan || !t || t.owner == null || t.owner === clan || War.warOn(t.id) || War.cooldownDays(t.id) || War.warsOf(clan).length
      || state.tick - p.at > (A.planDays ?? 2) * gen().dayTicks) {
      if (p.stage === 'pack' || War.potAt(h) || !packed()) return drop();
      goal = { x: from.x + 20, z: from.z, near: 25, why: 'unpack' };   // back to the launch town to put the pack down
      return;
    }
    if (p.stage === 'pack') {
      if (War.potAt(h)?.id !== from.id) { goal = { x: from.x + 20, z: from.z, near: 25, why: 'pack' }; return; }
      const want = packFor(A, t);
      if (['ryo', 'timber', 'stone'].every(r => (c.warPack?.[r] || 0) >= (want[r] || 0))) { p.stage = 'march'; return; }
      if (!['ryo', 'timber', 'stone'].every(r => (from.stock?.[r] ?? 0) + (c.warPack?.[r] || 0) >= (want[r] || 0))) return drop();
      out.push(cmd({ action: 'warPack', ryo: want.ryo || 0, timber: want.timber || 0, stone: want.stone || 0 }));
      return;
    }
    if (!Number.isFinite(p.x) || !War.check({ type: 'hero', owner: clan, place: 'world', x: p.x, z: p.z }, t.id, p).ok) { const s = bannerSpot(t, h, A); if (!s) return drop(); p.x = s.x; p.z = s.z; }
    goal = { x: p.x, z: p.z, near: Math.max(4, (W().placeRange ?? 60) * 0.4), why: 'banner' };
    if (dist(h, p) <= (W().placeRange ?? 60) * 0.8) out.push(cmd({ action: 'plantBanner', town: t.id, x: p.x, z: p.z }));
  }

  // ---- Z6d: a bot claims an empty town --------------------------------------------------------------------------
  // at peace, with no war planned: the nearest empty town it knows whose zone it has room in. The hero walks to its
  // hall and channels (sim/frontier/empty_towns.js); a town someone else is claiming is left alone.
  function claim(out, cmd, h) {
    const ET = F().emptyTowns, Z = F().campaignZones;
    if (!ET || !Z || mem.plan || h.place !== 'world' || h.dead || h.downed || F().war.warsOf(clan).length) return;
    if (h.claimTown) { goal = { x: h.x, z: h.z, near: 5, why: 'claim' }; return; }   // he stands still until it is his
    const t = ET.list().filter(s => Number.isFinite(s.x) && !s.empty.ruined && (F().rivalCampaign?.knows(clan, s) ?? true) && !Z.full(clan, Z.zoneOfTown(s))
      && !Object.values(state.entities).some(e => e.claimTown?.town === s.id && e.id !== h.id && !e.dead))
      .sort((a, b) => dist(a, h) - dist(b, h) || (a.id < b.id ? -1 : 1))[0];
    if (!t) return;
    const p = F().warEnd.hallPoint({ town: t.id }, 'town');
    goal = { x: p.x + p.r + 2, z: p.z, near: 3, why: 'claim' };
    if (ET.check(h, t.id).ok) out.push(cmd({ action: 'claimTown', town: t.id }));
  }

  // ---- the hero walks (a bot's only): WASD steps along an island route, every tick -------------------------------
  let stuck = 0;
  const dodge = { x: 0, z: 0, check: 0, until: 0, side: 1, n: 0 };
  function walk(out, h) {
    if (!goal || !isBot() || h.place !== 'world' || h.dead || h.downed || h.hallChannel || h.claimTown) { path = null; return; }
    if (Math.hypot(goal.x - h.x, goal.z - h.z) <= goal.near) { if (path) out.push({ id: h.id, type: 'move', right: 0, down: 0 }); path = null; return; }
    const nav = game.areas?.nav; if (!nav) return;
    // a new route when there is none, the goal moved, or he has not got anywhere for 10 s (never on a timer: a fresh
    // route may start at a chunk gate behind him, and re-planning on the way walked him back and forth)
    if (path && state.tick >= path.check) { if (Math.hypot(h.x - path.hx, h.z - path.hz) < 3) { stuck++; path = null; } else { stuck = 0; path.hx = h.x; path.hz = h.z; path.check = state.tick + 200; } }
    if (!path || Math.hypot(path.x - goal.x, path.z - goal.z) > 2) path = { x: goal.x, z: goal.z, pts: nav.findPath(h.x, h.z, goal.x, goal.z), hx: h.x, hz: h.z, check: state.tick + 200, made: state.tick };
    // stuck on something the route does not know (a rock, a cart): head for a later point of the route instead
    if (stuck && path.pts?.length > 1) path.pts.splice(0, Math.min(stuck, path.pts.length - 1));
    if (!path.pts?.length) return;
    while (path.pts.length > 1 && Math.hypot(path.pts[0][0] - h.x, path.pts[0][1] - h.z) < 1.5) path.pts.shift();
    // the end of this stretch of the route but not the goal: plan the next stretch (at most once a second)
    if (path.pts.length === 1 && Math.hypot(path.pts[0][0] - h.x, path.pts[0][1] - h.z) < 1.5) { if (state.tick >= (path.made ?? 0) + 20) path = null; return; }
    const [wx, wz] = path.pts[0];
    // wedged on a tree or a rock the route does not know: step sideways for a second, the other side next time
    if (state.tick >= dodge.check) { if (Math.hypot(h.x - dodge.x, h.z - dodge.z) < 0.5) { dodge.side = -dodge.side; dodge.until = state.tick + 20 + 10 * (dodge.n = Math.min(6, dodge.n + 1)); } else dodge.n = 0; dodge.x = h.x; dodge.z = h.z; dodge.check = state.tick + 20; }
    let dx = wx - h.x, dz = wz - h.z;
    if (state.tick < dodge.until) [dx, dz] = [-dz * dodge.side, dx * dodge.side];
    out.push({ id: h.id, type: 'move', ...intent(dx, dz) });
  }

  function tick() {
    const gen = GEN(), h = hero();
    if (!gen || !h) return [];
    const every = Math.max(1, Math.round((gen.rules().reviewSeconds ?? 5) * 20)), out = [];
    if ((state.tick ?? 0) % every !== 0) { walk(out, h); return out; }
    const cmd = c => ({ id: h.id, type: 'frontier', by: 'general', ...c });
    const order = c => ({ id: h.id, type: 'order', by: 'general', place: 'world', ...c });
    goal = null;
    for (const id of Object.keys(mem.wars)) if (!F().war.byId(id)) delete mem.wars[id];
    if (mem.plan && F().war.warsOf(clan).some(w => w.attacker === clan && w.town === mem.plan.town)) mem.plan = null;   // the banner is up
    for (const { war: w, side } of gen.sides(clan)) {
      if (w.terms) continue;   // a ceasefire: the general stands its side down
      (side === 'defender' ? defend : attack)(out, cmd, order, w);
    }
    if (isBot()) {
      // in peace and war alike a bot's towns build up their defences (less often), and it looks for a war of its own
      const slow = Math.max(every, Math.round((gen.rules().buildSeconds ?? 30) * 20 / every) * every);
      if ((state.tick ?? 0) % slow === 0)
        for (const s of Object.values(state.frontier?.settlements || {}).sort((a, b) => a.id < b.id ? -1 : 1)) if (s.owner === clan) { prepare(out, cmd, s); walls(out, cmd, s); }
      if (!goal) claim(out, cmd, h);   // Z6d: an empty town in reach comes before a new war
      if (!goal) launch(out, cmd, h);
    } else {
      // 8d-5: a player's general builds the war buildings of his strategy on his own only inside the military zone the
      // player painted, and only in towns whose governor has the initiative (autoBuild)
      const MZ = F().data.zones?.military?.char, slow = Math.max(every, Math.round((gen.rules().buildSeconds ?? 30) * 20 / every) * every);
      if (MZ && (state.tick ?? 0) % slow === 0)
        for (const s of Object.values(state.frontier?.settlements || {}).sort((a, b) => a.id < b.id ? -1 : 1)) if (s.owner === clan && s.autoBuild && s.grid?.zone?.includes(MZ) && !F().war.warOn?.(s.id)) prepare(out, cmd, s, true);
    }
    walk(out, h);
    return out;
  }
  return { tick, saveState: () => JSON.parse(JSON.stringify(mem)), loadState: d => { if (d && typeof d === 'object') mem = { wars: d.wars || {}, plan: d.plan || null, walls: d.walls || {} }; }, view: () => ({ ...mem, goal }) };

}
