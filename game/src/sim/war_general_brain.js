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
import { ringRadius } from './frontier/town_grid.js';
import { SCREEN_RIGHT, SCREEN_DOWN } from './geometry.js';
import { isMilitary, militaryCount, militaryNeeds, militaryWhy, warHallDone } from './frontier/town_military.js';

const DET = SCREEN_RIGHT.x * SCREEN_DOWN.z - SCREEN_DOWN.x * SCREEN_RIGHT.z;
const intent = (dx, dz) => ({ right: (dx * SCREEN_DOWN.z - dz * SCREEN_DOWN.x) / DET, down: (SCREEN_RIGHT.x * dz - SCREEN_RIGHT.z * dx) / DET });

export function createGeneralBrain(game, { clan }) {
  const state = game.state, F = () => game.frontier, GEN = () => F()?.warGeneral, gen = GEN;
  const W = () => F().data.war || {};
  GEN()?.enable?.();   // from now on the stand-in defender and stand-in douse are off (war.js, structures.js)
  let mem = { wars: {}, plan: null };   // saved
  let goal = null, path = null;         // where the hero is walking (worked out again at each review)
  const memory = (w, side) => ((mem.wars[w.id] ||= {})[side] ||= {});
  const isBot = () => !!state.clans[clan]?.bot;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const strat = () => gen().rules().strategies?.[gen().strategyOf(clan)] || {};
  const troops = w => Object.values(state.entities).filter(e => e.warTroop === w.id && e.owner === clan && !e.dead && e.type !== 'horse');
  const hero = () => Object.values(state.entities).find(e => e.owner === clan && e.type === 'hero');
  const town = id => state.frontier?.settlements?.[id] || null;

  // ---- defence -------------------------------------------------------------------------------------------------
  // the town coffers into the defender's war chest, down to the keep line (a bot keeps general.botKeepShare)
  function fillChest(out, cmd, w) {
    const s = town(w.town); if (!s || s.owner !== clan) return;
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
    const cheapest = Math.min(...v.buildings.flatMap(b => b.units.filter(u => mix[u.unit] > 0).map(u => u.ryo)), Infinity);
    memory(w, 'defender').spent = v.queued === 0 && (room <= 0 || chest < cheapest);
    const have = {};
    for (const e of troops(w)) if (e.warUnit) have[e.warUnit] = (have[e.warUnit] || 0) + 1;
    for (const b of v.buildings) for (const q of b.queue) have[q.unit] = (have[q.unit] || 0) + 1;
    for (const b of v.buildings) {
      if (room <= 0) break;
      if (b.queue.length >= ahead) continue;
      const pick = b.units.filter(u => mix[u.unit] > 0 && u.ryo <= chest).map(u => ({ u, need: (have[u.unit] || 0) / mix[u.unit] })).sort((a, c) => a.need - c.need || (a.u.unit < c.u.unit ? -1 : 1))[0]?.u;
      if (!pick) continue;
      out.push(cmd({ action: 'townTrain', war: w.id, building: b.id, unit: pick.unit, count: 1 }));
      have[pick.unit] = (have[pick.unit] || 0) + 1; room--; chest -= pick.ryo;
    }
  }
  // archers and riflemen go into the nearest house, workshop or farmhouse with room and shoot from it
  function garrisonRanged(out, cmd, w) {
    const Q = W().structures?.zoneGarrison; if (!Q) return;
    const G = gen().rules(), ranged = G.rangedUnits || ['archer', 'rifleman'];
    const free = troops(w).filter(e => ranged.includes(e.warUnit) && !e.garrison && !e.order?.garrisonKey && !e.downed && e.order?.kind !== 'raze');
    if (!free.length) return;
    const S = F().structures, inside = {};
    for (const e of Object.values(state.entities)) { const k = e.dead ? null : e.garrison?.key || e.order?.garrisonKey; if (k) inside[k] = (inside[k] || 0) + 1; }
    const houses = S.list().filter(st => st.town === w.town && (Q.types || []).includes(st.type) && S.hpOf(st) > 0);
    const byHouse = new Map();
    for (const e of free) {
      const st = houses.filter(h => (inside[h.key] || 0) < (Q.capacity ?? 10)).map(h => ({ h, d: Math.hypot(h.x - e.x, h.z - e.z) })).sort((a, b) => a.d - b.d || (a.h.key < b.h.key ? -1 : 1))[0]?.h;
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
    const strong = mine.length >= (m.mode === 'sortie' ? Math.ceil((D.sortieAt ?? 12) / 2) : D.sortieAt ?? 12)
      || (m.spent && mine.length >= (G.sortieLeast ?? 4) && mine.length >= theirs * (G.sortieEdge ?? 1.3)) || empty;
    if (strong && camp.length) {
      const st = camp.map(c => ({ c, d: Math.hypot(c.x - t.x, c.z - t.z) })).sort((a, b) => a.d - b.d || (a.c.key < b.c.key ? -1 : 1))[0].c;
      const ids = mine.filter(e => e.order?.kind !== 'attack' && (e.order?.kind !== 'raze' || e.order.structure !== st.key)).map(e => e.id);
      if (ids.length) out.push(order({ kind: 'raze', units: ids, structure: st.key, fallback: 'attackmove', x: Math.round(st.x), z: Math.round(st.z) }));
      m.mode = 'sortie';
      return;
    }
    m.mode = 'hold';
    // wait between the hall and the camp, inside the ring
    const d = Math.hypot(w.x - t.x, w.z - t.z) || 1, r = ringRadius(t, F().data) * (G.holdAt ?? 0.5);
    const hx = Math.round(t.x + (w.x - t.x) / d * r), hz = Math.round(t.z + (w.z - t.z) / d * r);
    const ids = mine.filter(e => Math.hypot(e.x - hx, e.z - hz) > (G.holdRadius ?? 35) && (e.order?.kind !== 'station' || far(e, hx, hz, 5))).map(e => e.id);
    if (ids.length) out.push(order({ kind: 'station', units: ids, x: hx, z: hz }));
  }
  function defend(out, cmd, order, w) {
    fillChest(out, cmd, w);
    train(out, cmd, w);
    // the attacker has (almost) no troops left and the town can train no more: the archers come out of the houses and the whole army goes for his camp
    const all = troops(w).filter(e => !e.downed), theirs = Object.values(state.entities).filter(e => e.warTroop === w.id && e.owner === w.attacker && !e.dead && e.type !== 'horse').length;
    if (memory(w, 'defender').spent && all.length >= (gen().rules().sortieLeast ?? 4) && all.length >= theirs * 2 * (gen().rules().sortieEdge ?? 1.3)) {
      const by = new Map(); for (const e of all) if (e.garrison?.key) { if (!by.has(e.garrison.key)) by.set(e.garrison.key, []); by.get(e.garrison.key).push(e.id); }
      for (const [key, units] of by) out.push(cmd({ action: 'garrison', mode: 'leave', structure: key, units }));
    } else garrisonRanged(out, cmd, w);
    mend(out, cmd, town(w.town), w.town, `t|${w.town}|`, st => st.town === w.town && !st.camp);
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
    if ((s.projects || []).some(p => isMilitary(p.type, data)) || s.warUpgrade) return;
    const seen = {};
    for (const type of list) {
      seen[type] = (seen[type] || 0) + 1;
      if (militaryCount(s, type) >= seen[type]) continue;
      const def = data.war?.buildings?.[type] || {};
      if (def.clan && def.clan !== state.clans[clan]?.faction) continue;
      const needs = militaryNeeds(s, type, data);
      if (needs.length) {
        if (zoneOnly) continue;
        if ((def.needs || []).includes('upgrade') && !warHallDone(s) && can(data.war?.hallUpgrade?.cost)) out.push(cmd({ action: 'warUpgradeHall', settlement: s.id }));
        if ((def.needs || []).includes('upgrade') && !warHallDone(s)) return;   // saving for the upgrade
        continue;   // waits on an earlier building of the list
      }
      if (militaryWhy(s, type, data, state)) continue;
      if (!can(data.buildings?.[type]?.cost)) return;   // saving for it
      const cell = spotFor(s, type, zoneOnly);
      if (cell != null) out.push(cmd({ action: 'place', town: s.id, kind: type, cells: [cell] }));
      if (cell == null && zoneOnly) continue;   // no room for this one in the zone: try the next of the list
      return;
    }
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
    const front = ['barracks', 'watchtower', 'rifle_range', 'clan_hall'].includes(type), a0 = front ? toTown : toTown + Math.PI;
    for (let r = 26; r <= (W().chainDistance ?? 120) - 6; r += 14) for (let k = 0; k < 12; k++) { const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 6; tries.push([hall.x + Math.cos(a) * r, hall.z + Math.sin(a) * r]); }
    for (const [x, z] of tries) { const r = War.campCheck(w.id, type, { x, z }); if (r?.ok) return { x: Math.round(x), z: Math.round(z) }; }
    return null;
  }
  // the next building of the strategy's list (and the camp hall upgrade when one needs it), a few sites at a time
  function campBuild(out, cmd, w, A) {
    const camp = w.camp, War = F().war, BD = W().buildings || {};
    if (camp.buildings.filter(b => b.stage === 'site').length >= (A.sites ?? 2)) return;
    const list = War.campBuildList(w.id), seen = {};
    for (const type of A.build || []) {
      seen[type] = (seen[type] || 0) + 1;
      if (camp.buildings.filter(b => b.type === type).length >= seen[type]) continue;
      const e = list.find(x => x.type === type); if (!e || (e.max && e.count >= e.max)) continue;
      if (e.need.length) {
        const hall = campHall(w);
        if ((BD[type]?.needs || []).includes('upgrade') && !War.upgraded(camp)) {
          const U = W().hallUpgrade?.cost || {};
          if (!hall.upgrade && (camp.chest || 0) >= (U.ryo || 0) && (camp.stock?.timber || 0) >= (U.timber || 0) && (camp.stock?.stone || 0) >= (U.stone || 0)) out.push(cmd({ action: 'campUpgrade', war: w.id }));
          return;   // saving for the upgrade
        }
        continue;   // waits on an earlier building
      }
      if (!e.ok) return;   // saving for it
      const p = campSpot(w, type, A);
      if (p) { out.push(cmd({ action: 'campPlace', war: w.id, kind: type, x: p.x, z: p.z })); return; }
    }
    // a palisade line between the camp and the town (Siege)
    const m = memory(w, 'attacker');
    if (A.palisade && !m.wall && !camp.buildings.some(b => b.type === 'palisade')) {
      const hall = campHall(w), t = town(w.town), a = Math.atan2(t.z - hall.z, t.x - hall.x), d = A.palisade.out ?? 55, half = (A.palisade.length ?? 60) / 2;
      const cx = hall.x + Math.cos(a) * d, cz = hall.z + Math.sin(a) * d, across = Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a));
      const p0 = across ? { x: cx, z: cz - half } : { x: cx - half, z: cz }, p1 = across ? { x: cx, z: cz + half } : { x: cx + half, z: cz };
      if (War.campLineCheck(w.id, p0, p1)?.ok) { out.push(cmd({ action: 'campLine', war: w.id, x0: p0.x, z0: p0.z, x1: p1.x, z1: p1.z })); m.wall = true; }
    }
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
  }
  function campTrain(out, cmd, w, A) {
    const War = F().war, camp = w.camp, tv = War.troopView(w.id); if (!tv) return;
    const G = gen().rules(), mix = A.mix || { grunt: 1 }, ahead = G.queueAhead ?? 2;
    let room = tv.cap - tv.troops - tv.queued, chest = (camp.chest || 0) - (A.chestReserve ?? 0);
    const cheapest = Math.min(...camp.buildings.filter(b => b.stage === 'built').flatMap(b => War.trainsAt(b.type, clan).filter(u => mix[u] > 0).map(u => War.ryoOf(clan, u))), Infinity);
    memory(w, 'attacker').spent = tv.queued === 0 && (room <= 0 || chest < cheapest) && !camp.buildings.some(b => b.stage === 'site');   // it cannot grow any more
    const have = {};
    for (const e of troops(w)) if (e.warUnit) have[e.warUnit] = (have[e.warUnit] || 0) + 1;
    for (const b of camp.buildings) for (const q of b.queue || []) have[q.unit] = (have[q.unit] || 0) + 1;
    for (const b of camp.buildings) {
      if (room <= 0) break;
      if (b.stage !== 'built' || (b.queue?.length || 0) >= ahead) continue;
      const pick = War.trainsAt(b.type, clan).filter(u => mix[u] > 0 && War.ryoOf(clan, u) <= chest).map(u => ({ u, need: (have[u] || 0) / mix[u] })).sort((a, c) => a.need - c.need || (a.u < c.u ? -1 : 1))[0]?.u;
      if (!pick) continue;
      out.push(cmd({ action: 'campTrain', war: w.id, building: b.id, unit: pick, count: 1 }));
      have[pick] = (have[pick] || 0) + 1; room--; chest -= War.ryoOf(clan, pick);
    }
  }
  // what the army goes for next, by the strategy's order of targets
  function pickTarget(w, A, from) {
    const S = F().structures, list = S.list().filter(st => st.town === w.town && !st.camp && S.hpOf(st) > 0);
    const near = l => l.map(st => ({ st, d: dist(st, from) })).sort((a, b) => a.d - b.d || (a.st.key < b.st.key ? -1 : 1))[0]?.st || null;
    for (const kind of [...(A.targets || []), 'military', 'hall']) {
      if (kind === 'workers') {
        const u = Object.values(state.entities).filter(e => e.owner === w.defender && e.worker && e.place === 'world' && !e.dead && !e.garrison).map(e => ({ e, d: dist(e, from) })).sort((a, b) => a.d - b.d || (a.e.id < b.e.id ? -1 : 1))[0]?.e;
        if (u) return { unit: u };
        continue;
      }
      const st = near(list.filter(x => kind === 'tower' ? x.type === 'watchtower' : kind === 'wall' ? x.kind === 'wall' || x.kind === 'gate' : kind === 'hall' ? x.type === 'town_hall' : x.military && x.kind === 'building'));
      if (st) return { st };
    }
    // whatever else still holds the town's morale up (a stable, an infirmary)
    const weight = W().morale?.weights || {}, rest = near(list.filter(x => weight[x.type]));
    return rest ? { st: rest } : null;
  }
  function campArmy(out, order, w, A) {
    const G = gen().rules(), m = memory(w, 'attacker'), hall = campHall(w), t = town(w.town);
    const mine = troops(w).filter(e => !e.garrison && !e.downed);
    if (!mine.length) { m.mode = 'hold'; return; }
    const far = (e, x, z, r) => Math.hypot((e.order?.x ?? 1e9) - x, (e.order?.z ?? 1e9) - z) > r;
    const cx = mine.reduce((n, e) => n + e.x, 0) / mine.length, cz = mine.reduce((n, e) => n + e.z, 0) / mine.length;
    const foe = e => e.owner === w.defender && e.place === 'world' && !e.dead && !e.downed && !e.rout && !e.hidden && !e.garrison && !e.worker && e.type !== 'civilian' && e.type !== 'hero' && e.type !== 'horse';
    const meet = (x, z, r) => {
      const f0 = Object.values(state.entities).filter(e => foe(e) && Math.hypot(e.x - x, e.z - z) <= r).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z) || (a.id < b.id ? -1 : 1))[0];
      if (!f0) return false;
      const ids = mine.filter(e => e.order?.kind !== 'attack' && (e.order?.kind !== 'attackmove' || e.order.arrived || far(e, f0.x, f0.z, G.retarget ?? 40))).map(e => e.id);
      if (ids.length) out.push(order({ kind: 'attackmove', units: ids, x: Math.round(f0.x), z: Math.round(f0.z) }));
      return true;
    };
    // it pushes at pushAt troops, or with what it has once it cannot grow any more; a push is given up at fallBack of that
    const pushAt = A.pushAt ?? 12, strong = m.mode === 'push' ? mine.length >= Math.max(1, Math.ceil(Math.min(pushAt, m.pushed || pushAt) * (A.fallBack ?? 0.35))) || m.spent : mine.length >= pushAt || (m.spent && mine.length >= (A.pushLeast ?? 3));
    if (strong && m.mode !== 'push') m.pushed = mine.length;
    if (!strong) {
      // gather by the camp, on the town's side; defenders who come near are met
      m.mode = 'hold';
      if (meet(hall.x, hall.z, A.guard ?? 120)) return;
      const d = dist(t, hall) || 1, hx = Math.round(hall.x + (t.x - hall.x) / d * (A.rallyOut ?? 32)), hz = Math.round(hall.z + (t.z - hall.z) / d * (A.rallyOut ?? 32));
      const ids = mine.filter(e => Math.hypot(e.x - hx, e.z - hz) > (G.holdRadius ?? 35) && (e.order?.kind !== 'station' || far(e, hx, hz, 5))).map(e => e.id);
      if (ids.length) out.push(order({ kind: 'station', units: ids, x: hx, z: hz }));
      return;
    }
    m.mode = 'push';
    if (meet(cx, cz, A.engage ?? 45)) return;   // troops in the way first
    const tg = pickTarget(w, A, { x: cx, z: cz });
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
    const ids = mine.filter(e => e.order?.kind !== 'attack' && (e.order?.kind !== 'raze' || e.order.structure !== tg.st.key)).map(e => e.id);
    if (ids.length) {
      out.push(order({ kind: 'raze', units: ids, structure: tg.st.key }));
      if (tg.st.kind !== 'wall' && tg.st.kind !== 'gate') out.push(order({ kind: 'raze', units: ids, structure: tg.st.key, torch: true }));   // those who can torch do
    }
  }
  function attack(out, cmd, order, w) {
    if (!w.camp) return;
    const A = strat().attack || {};
    campBuild(out, cmd, w, A);
    campWorkers(out, cmd, w, A);
    campTrain(out, cmd, w, A);
    campArmy(out, order, w, A);
    if (!isBot()) return;
    // a bot's hero waits behind the camp hall, and takes the town hall once the town's morale is 0
    const h = hero(), hall = campHall(w), t = town(w.town);
    if (goal?.why === 'take') return;   // he is needed at a camp that fell
    if (F().warMorale.ready(w.id, 'town')) {
      const p = F().warEnd.hallPoint(w, 'town');
      if (p) goal = { x: p.x + p.r + 2, z: p.z, near: 3, why: 'take' };
      if (h && !w.channel) {
        const pick = ['capture', 'sack'].find(o => F().warEnd.check(h, w, 'town', o).ok);
        if (pick) out.push(cmd({ action: 'warTake', war: w.id, outcome: pick }));
      }
      return;
    }
    const d = dist(t, hall) || 1;
    goal = { x: hall.x - (t.x - hall.x) / d * 20, z: hall.z - (t.z - hall.z) / d * 20, near: 8, why: 'camp' };
  }

  // ---- a bot starts a war ------------------------------------------------------------------------------------------
  // from an own town founded at least launchTownDays ago that can spare the pack; never while it is in another war
  function launchTown(A) {
    const G = gen().rules(), need = A.pack || {}, keep = A.keep || {};
    return Object.values(state.frontier.settlements).filter(s => s.owner === clan && !s.capital && s.grid && Number.isFinite(s.x) && s.founded !== undefined
      && (state.tick - s.founded) >= (G.launchTownDays ?? 3) * gen().dayTicks
      && ['ryo', 'timber', 'stone'].every(r => (s.stock?.[r] ?? 0) >= (need[r] ?? 0) + (keep[r] ?? 0)))
      .sort((a, b) => (b.stock.ryo - a.stock.ryo) || (a.id < b.id ? -1 : 1))[0] || null;
  }
  // any clan's town that is not a capital, not at war, not under truce and not freshly sacked: the nearer, the
  // bigger and the less fortified (as its buildings show), the better
  function pickTown(from, A) {
    const War = F().war, hist = state.frontier.wars?.history || [], data = F().data, tierWorth = W().surrender?.worth?.tier || [0, 300, 900, 2000];
    const skip = ((A.sackedSkipDays ?? 6) + (W().cooldownDays ?? 0)) * gen().dayTicks;
    return Object.values(state.frontier.settlements).filter(s => !s.capital && s.owner != null && s.owner !== clan && s.grid && Number.isFinite(s.x) && s.founded !== undefined
      && !War.warOn(s.id) && !War.cooldownDays(s.id) && !hist.some(x => x.town === s.id && x.result === 'sacked' && state.tick - (x.ended ?? 0) < skip))
      .map(s => ({ s, score: ((tierWorth[s.tier || 1] ?? 300) + (s.pop || 0) * (A.popWorth ?? 5) - (s.buildings || []).filter(b => b.stage === 'built' && isMilitary(b.type, data)).length * (A.fortPenalty ?? 60)) / (1 + dist(s, from) / (A.distanceScale ?? 1500)) }))
      .sort((a, b) => b.score - a.score || (a.s.id < b.s.id ? -1 : 1))[0]?.s || null;
  }
  // a banner spot in the band round the target, on the side the hero comes from first
  function bannerSpot(t, h) {
    const War = F().war, [inner, outer] = War.band(t), r = (inner + outer) / 2, a0 = Math.atan2(h.z - t.z, h.x - t.x);
    for (let k = 0; k < 32; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 16, p = { x: Math.round(t.x + Math.cos(a) * r), z: Math.round(t.z + Math.sin(a) * r) };
      if (War.check({ type: 'hero', owner: clan, place: 'world', x: p.x, z: p.z }, t.id, p).ok) return p;
    }
    return null;
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
      const from = launchTown(A), target = from && pickTown(from, A);
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
      const want = A.pack || {};
      if (['ryo', 'timber', 'stone'].every(r => (c.warPack?.[r] || 0) >= (want[r] || 0))) { p.stage = 'march'; return; }
      if (!['ryo', 'timber', 'stone'].every(r => (from.stock?.[r] ?? 0) + (c.warPack?.[r] || 0) >= (want[r] || 0))) return drop();
      out.push(cmd({ action: 'warPack', ryo: want.ryo || 0, timber: want.timber || 0, stone: want.stone || 0 }));
      return;
    }
    if (!Number.isFinite(p.x) || !War.check({ type: 'hero', owner: clan, place: 'world', x: p.x, z: p.z }, t.id, p).ok) { const s = bannerSpot(t, h); if (!s) return drop(); p.x = s.x; p.z = s.z; }
    goal = { x: p.x, z: p.z, near: Math.max(4, (W().placeRange ?? 60) * 0.4), why: 'banner' };
    if (dist(h, p) <= (W().placeRange ?? 60) * 0.8) out.push(cmd({ action: 'plantBanner', town: t.id, x: p.x, z: p.z }));
  }

  // ---- the hero walks (a bot's only): WASD steps along an island route, every tick -------------------------------
  let stuck = 0;
  const dodge = { x: 0, z: 0, check: 0, until: 0, side: 1, n: 0 };
  function walk(out, h) {
    if (!goal || !isBot() || h.place !== 'world' || h.dead || h.downed || h.hallChannel) { path = null; return; }
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
        for (const s of Object.values(state.frontier?.settlements || {}).sort((a, b) => a.id < b.id ? -1 : 1)) if (s.owner === clan) prepare(out, cmd, s);
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
  return { tick, saveState: () => JSON.parse(JSON.stringify(mem)), loadState: d => { if (d && typeof d === 'object') mem = { wars: d.wars || {}, plan: d.plan || null }; }, view: () => ({ ...mem, goal }) };

}
