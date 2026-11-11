// Frontier governor (frontier plan F2.7). A fixed rule list, checked top to bottom every
// data.governor.reviewTicks economy ticks (same style as sim/bot.js). Players, bots and the
// governor share one set of commands; the governor never orders armies or attacks.
//
// The governor MAINTAINS, it does not expand (Tim, 2026-11-02): rules 1-5 only write suggestions
// (settlement.suggestions, at most 3, each with a reason) that wait for the player's OK. On its own it
// always: repairs damaged buildings and rebuilds ruined ones on the same spot, keeps mood decent with
// auto taxes (rule 6), and writes report.doing / report.next. With settlement.autoBuild = true a suggestion
// within budget is queued and authorized by itself. Never more than one governor project at a time.
// Every rule fires only when its cause is the real limit, so it never loops.
// createGovernor({ state, data, world, economy, construction }) -> { review, run, approve }
import { residents } from './people.js';
import { placedRoom, upgradeCheck, startUpgrade, tierOf, nextTier, zoneCells, cellCap } from './tiers.js';
import { isFull, storageCap } from './storage.js';
import { workerCount } from './people.js';
import { inCore, centreCell, hallRoadCell, worldToCell, cellToWorld } from './town_grid.js';
const EPS = 1e-9;
const TAX_STEPS = ['low', 'normal', 'high'];
// one-off or surplus flows that say nothing about the town's running goods balance
const ONCE_FLOW = new Set(['build', 'train', 'upgrade', 'refund', 'market', 'test']);

export function createGovernor({ state, data, world, economy, construction, zones = null, workers = null, placement = () => null, ship = {} }) {
  const G = data.governor, f = () => state.frontier;

  function init(s) {
    if (s.gov) return;
    s.gov = { foodLast: s.stock.food, falling: 0, moodHigh: 0, window: 0, nBuilt: s.buildings.filter(b => b.stage === 'built').length };
    s.autoBuild = !!s.autoBuild;
    s.suggestions ||= [];
    s.budget = { ryo: s.budget?.ryo || 0, spent: s.budget?.spent || 0 };
  }

  const value = cost => Object.entries(cost).reduce((n, [r, v]) => n + v * (data.values[r] ?? 1), 0);
  const pending = (s, type) => s.projects.some(p => p.type === type && !p.replaces) || s.suggestions.some(x => x.type === type);
  const has = (s, type) => s.buildings.some(b => b.type === type);

  // L3.3: in grid towns house/farm/workshop are zones. The governor zones free untouched cells itself
  // (autoBuild) or suggests it; it waits while that kind is still growing, so it never over-zones.
  const zoneKind = (s, type) => (zones?.on(s) && data.zones.fromBuilding?.[type]) || null;
  function suggest(s, type, reason) {
    const zk = zoneKind(s, type);
    if (zk && zones.busy(s, zk)) return true;
    if (zk && s.autoBuild) {
      let r = zones.autoZone(s, zk);
      // Tim 2026-11-05: with initiative the governor lays a short road out from its network when zones run out of road access
      if (!r.ok && /road/.test(r.reason) && roadSpur(s, zk)) r = { ok: true };
      if (!r.ok) s.report.next = `${reason} (${r.reason})`;
      return true;
    }
    if (pending(s, type) || s.suggestions.length >= G.maxSuggestions) return true;   // already on the list: this rule has fired
    if (!zk && placedRoom(s, type, data) < 1) { s.report.next = `${reason} (town hall tier limit)`; return true; }   // B3
    s.suggestions.push({ type, reason });
    return true;
  }

  // A straight road spur (up to G.roadSpur cells) from a road linked to the hall, or from the hall itself, in the
  // direction that opens the most free zonable cells without road access. Same place() as the player, by = 'g'.
  function roadSpur(s, kind) {
    const pl = placement(); if (!pl || !s.grid) return false;
    const g = s.grid, n = g.n, reach = data.zones.kinds[kind]?.needs?.roadReach ?? 3, len = G.roadSpur ?? 6;
    const linked = zones.linkedRoads(s), hall = centreCell(n);
    const free = i => g.ground[i] === 'c' && g.use[i] === '.' && g.zone[i] === '.' && g.by[i] === '.' && !hallRoadCell(s, i) && inCore(s, i, data);
    const open = new Uint8Array(n * n);   // free cells that have no road access yet
    for (let i = 0; i < n * n; i++) if (free(i) && !zones.roadNear(s, i, reach)) open[i] = 1;
    const seeds = [hall]; for (let i = 0; i < n * n; i++) if (linked[i]) seeds.push(i);
    let best = null;
    for (const seed of seeds) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cells = []; let c = seed % n, r = (seed - c) / n;
      for (let k = 0; k < len; k++) {
        c += dc; r += dr; const i = r * n + c;
        if (c < 0 || r < 0 || c >= n || r >= n || g.use[i] !== '.' || g.zone[i] !== '.' || g.ground[i] !== 'c' || !inCore(s, i, data)) break;
        cells.push(i);
      }
      if (cells.length < 2) continue;
      const seen = new Set();
      for (const i of cells) { const ic = i % n, ir = (i - ic) / n;
        for (let rr = Math.max(0, ir - reach); rr <= Math.min(n - 1, ir + reach); rr++) for (let cc = Math.max(0, ic - reach); cc <= Math.min(n - 1, ic + reach); cc++) { const j = rr * n + cc; if (open[j] && !cells.includes(j)) seen.add(j); } }
      if (seen.size >= (G.roadSpurMinCells ?? 6) && (!best || seen.size > best.gain || seen.size === best.gain && cells.length < best.cells.length)) best = { cells, gain: seen.size };
    }
    if (!best) return false;
    if (!pl.check(s, { kind: 'road', cells: best.cells }).ok) return false;
    const r = pl.place(s, { kind: 'road', cells: best.cells, by: 'g' });
    if (r.ok) s.report.next = 'Laying a road for new zones';
    return !!r.ok;
  }

  // Self-running governor (Tim 2026-11-05): with initiative, a lumber camp / quarry beside the spot its workers use
  // most, once that spot is far from every drop-off (shorter trips = much more income). One per review.
  function campRule(s) {
    if (!s.autoBuild || s.projects.some(p => !p.replaces) || !workers?.index || !placement()) return false;
    const R = data.workers, hall = [s.x, s.z];
    for (const [type, res] of [['lumber_camp', 'timber'], ['quarry', 'stone'], ['food_camp', 'food']].filter(([t]) => data.buildings?.[t])) {
      if (placedRoom(s, type, data) < 1 || s.buildings.some(b => b.type === type)) continue;
      const use = {};
      for (const w of s.workers || []) { const sp = w.spot && workers.index.get(w.spot); if (sp && R.resources[sp.kind] === res) use[w.spot] = (use[w.spot] || 0) + 1; }
      const [top, n] = Object.entries(use).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] || [];
      if (!top || n < 2) continue;
      const sp = workers.index.get(top), drops = s.buildings.filter(b => b.stage === 'built' && R.dropoffs.includes(b.type));
      // far from every drop-off (a start quarry no longer blocks a lumber camp by being a second drop-off, 2026-11-06)
      const dropXZ = b => { const pts = (b.cells?.length ? b.cells : [b.cell]).filter(i => i !== null && i !== undefined).map(i => cellToWorld(s, i)); return pts.length ? pts[0] : hall; };
      if (Math.hypot(sp.x - hall[0], sp.z - hall[1]) < (G.campDistance ?? 70) || drops.some(b => { const [x, z] = dropXZ(b); return Math.hypot(sp.x - x, sp.z - z) < (G.campDistance ?? 70); })) continue;
      const cost = data.buildings[type].cost;
      if (!Object.entries(cost).every(([r, v]) => (s.stock[r] || 0) >= v)) continue;   // never blocks the other rules while saving
      const g = s.grid, n2 = g.n, c0 = worldToCell(s, sp.x, sp.z);
      if (c0 < 0) continue;
      const cc = c0 % n2, cr = (c0 - cc) / n2, cand = [];
      for (let r = cr - 4; r <= cr + 4; r++) for (let c = cc - 4; c <= cc + 4; c++) if (r >= 0 && c >= 0 && r < n2 && c < n2) cand.push([(r - cr) ** 2 + (c - cc) ** 2, r * n2 + c]);
      cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (const [, i] of cand) {
        if (!placement().check(s, { kind: type, cells: [i] }).ok) continue;
        const r = placement().place(s, { kind: type, cells: [i], by: 'g' });
        if (r.ok && r.project) { construction.authorize(r.project); s.report.next = `Building a ${type.replace('_', ' ')} by the ${res}`; return true; }
      }
    }
    return false;
  }

  // Tim 2026-11-06 22:33: rich deposits. Once the town's own spots are full (a governor worker has no spot with room)
  // and a camp slot is free, the governor puts a camp on the grid cell nearest the closest rich deposit it could then
  // reach (campReach), one per review, within the tier camp limit, so it never overextends. Ask first only reports it.
  function richCampRule(s) {
    if (!workers?.index || !placement() || s.projects.some(p => !p.replaces)) return false;
    const R = data.workers, reach = R.campReach || 0;
    if (!reach || !(s.workers || []).some(w => w.by !== 'p' && !w.spot && !w.project && !w.order)) return false;
    // a camp only reaches its own resource (workers.campTakes, Tim 2026-11-07)
    const camps = s.buildings.filter(b => (R.gatherBuildings || []).includes(b.type) && b.stage === 'built' && Number.isInteger(b.cell)).map(b => [...cellToWorld(s, b.cell), b.type]);
    // the work camp that takes a spot kind's resource (lumber camp, quarry, food camp)
    const campFor = kind => (R.gatherBuildings || []).find(t => data.buildings?.[t] && R.campTakes?.[t]?.includes(R.resources[kind]));
    const fits = (type, kind) => !R.campTakes?.[type] || R.campTakes[type].includes(R.resources[kind]);
    const near = (x, z, kind) => Math.hypot(x - s.x, z - s.z) <= R.range || camps.some(([cx, cz, t]) => fits(t, kind) && Math.hypot(x - cx, z - cz) <= reach);
    const grid = (data.townGrid?.radius ?? 600) - 2 * (s.grid?.cell || 11);
    const deps = [...workers.index.byId.values()].filter(p => p.deposit && campFor(p.kind) && !near(p.x, p.z, p.kind) && !isFull(s, data, R.resources[p.kind]))
      .map(p => ({ p, d: Math.hypot(p.x - s.x, p.z - s.z) })).filter(o => o.d <= grid + reach).sort((a, b) => a.d - b.d || (a.p.id < b.p.id ? -1 : 1));
    for (const { p, d } of deps) {
      const type = campFor(p.kind);
      if (placedRoom(s, type, data) < 1) continue;
      const cost = data.buildings[type].cost;
      if (!Object.entries(cost).every(([r, v]) => (s.stock[r] || 0) >= v)) continue;
      const k = Math.min(1, grid / d), tx = s.x + (p.x - s.x) * k, tz = s.z + (p.z - s.z) * k;   // grid cell toward the deposit
      if (Math.hypot(p.x - tx, p.z - tz) > reach) continue;
      if (!s.autoBuild) { s.report.next = `Rich deposit within camp reach: place a ${type.replace('_', ' ')} toward it`; return false; }
      if (placeNear(s, type, tx, tz, `Building a ${type.replace('_', ' ')} toward a rich deposit`)) return true;
    }
    return false;
  }
  // a camp on the free grid cell nearest a point, authorized at once
  function placeNear(s, type, tx, tz, text) {
    const g = s.grid, n2 = g.n, c0 = worldToCell(s, tx, tz);
    if (c0 < 0) return false;
    const cc = c0 % n2, cr = (c0 - cc) / n2, cand = [];
    for (let r = cr - 4; r <= cr + 4; r++) for (let c = cc - 4; c <= cc + 4; c++) if (r >= 0 && c >= 0 && r < n2 && c < n2) cand.push([(r - cr) ** 2 + (c - cc) ** 2, r * n2 + c]);
    cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, i] of cand) {
      if (!placement().check(s, { kind: type, cells: [i] }).ok) continue;
      const r = placement().place(s, { kind: type, cells: [i], by: 'g' });
      if (r.ok && r.project) { construction.authorize(r.project); s.report.next = text; return true; }
    }
    return false;
  }

  // Tim 2026-11-11: no trees in worker reach (4 of the 60 sites) and the town can never earn timber: a bot town spent
  // its start timber on a quarry and sat at 5 people for good. With initiative the governor first puts a lumber camp
  // on the grid toward the nearest trees a camp reaches. true = placed; 'save' = wanted but not affordable yet (the
  // other camp rules wait, so they never spend its timber).
  function timberCampRule(s) {
    const R = data.workers, reach = R.campReach || 0;
    if (!s.autoBuild || !workers?.index?.spotsNear || !placement() || !data.buildings?.lumber_camp || !reach) return false;
    if (s.buildings.some(b => b.type === 'lumber_camp') || s.projects.some(p => p.type === 'lumber_camp')) return false;
    const grid = (data.townGrid?.radius ?? 600) - 2 * (s.grid?.cell || 11);
    const trees = workers.index.spotsNear(s.x, s.z, grid + reach).filter(p => R.resources[p.kind] === 'timber')
      .map(p => ({ p, d: Math.hypot(p.x - s.x, p.z - s.z) })).sort((a, b) => a.d - b.d || (a.p.id < b.p.id ? -1 : 1));
    if (!trees.length || trees[0].d <= R.range) return false;
    if (placedRoom(s, 'lumber_camp', data) < 1) return false;
    if (s.projects.some(p => !p.replaces)) return 'save';
    if (!Object.entries(data.buildings.lumber_camp.cost).every(([r, v]) => (s.stock[r] || 0) >= v)) { s.report.next = 'Saving for a lumber camp: no trees within reach of the town'; return 'save'; }
    for (const { p, d } of trees) {
      const k = Math.min(1, grid / d), tx = s.x + (p.x - s.x) * k, tz = s.z + (p.z - s.z) * k;
      if (Math.hypot(p.x - tx, p.z - tz) > reach) continue;
      if (placeNear(s, 'lumber_camp', tx, tz, 'Building a lumber camp toward the nearest trees')) return true;
    }
    return false;
  }

  // Tim 2026-11-05: with initiative the governor trains a worker when every worker is busy, people are idle,
  // nobody is training and there is ryo and goods to spare (bots use the same rule).
  function trainWorker(s) {
    if (!s.autoBuild || !workers?.train || s.workerTraining?.length) return;
    const R = data.workers, idle = s.report.idle || 0;
    if (idle < 1 || (s.workers || []).some(w => !w.spot && !w.project && !w.order)) return;
    if ((s.stock.ryo || 0) < R.cost + (G.trainRyoKeep ?? 20) || (s.stock.goods || 0) < (R.goodsCost || 0) + (G.trainGoodsKeep ?? 10)) return;
    workers.train(s, 1);
  }

  // Rules 1 to 5: returns true when one fired (checked top to bottom, the first that fires wins).
  function rules(s) {
    const idle = s.report.idle || 0, unfilled = s.report.unfilled || 0;
    // 1. food falling: a farm, but only if there are workers to run it
    if (s.gov.falling >= G.foodFallingReviews) {
      // more farm cells only help when the farms are healthy (short timber/workers make new cells useless too)
      const farmZone = s.zones?.farm, sick = farmZone && farmZone.cells > 0 && (farmZone.health ?? 1) < data.zones.healthyAt;
      if (idle >= G.idleNeeded && !sick) return suggest(s, 'farm', 'Farm: food falling');
      s.report.next = sick ? 'Food falling: farms are short of upkeep or hands' : 'Food falling, need workers';
    }
    // 1b goods target (2026-11-06 soak fix): at least goodsProfitPerMin, and while the next hall tier's goods cost is
    // not yet in stock, enough to save it up within upgradeGoalMinutes
    const goodsTarget = s => {
      const need = nextTier(s, data)?.upgrade?.cost?.goods || 0, short = need - (s.stock.goods || 0);
      return Math.max(G.goodsProfitPerMin ?? 3, short > 0 && G.upgradeGoalMinutes ? short / G.upgradeGoalMinutes : 0);
    };
    // 1b. goods not growing (Tim 2026-11-05: the governor runs the town at a slight profit so the hall upgrade
    // comes within reach): more work cells while there is room, idle people and no input shortage
    if (zones?.on(s) && !zones.busy(s, 'work')) {
      const k = data.zones.kinds.work, net = Object.entries(s.flow?.goods || {}).filter(([why]) => !ONCE_FLOW.has(why)).reduce((n, [, v]) => n + v, 0);
      const room = k && zoneCells(s, k.char) + (k.governorCells || 1) <= cellCap(s, 'work', data);
      // workshops burn timber and stone: only add them while those are stocked and still rising,
      // or already sitting at half their cap or more (a full store shows no rise but has plenty to burn)
      const rising = r => Object.values(s.flow?.[r] || {}).reduce((n, v) => n + v, 0) > 0
        || (s.stock[r] || 0) >= (G.inputFullShare ?? 0.5) * storageCap(s, data, r), stocked = r => (s.stock[r] || 0) >= (G.inputBuffer ?? 60);
      if (room && idle >= G.idleNeeded && net < goodsTarget(s) && (zoneCells(s, k.char) === 0 || stocked('timber') && stocked('stone') && rising('timber') && rising('stone')) && !isFull(s, data, 'goods'))
        return suggest(s, 'workshop', 'Workshop: goods not growing');
    }
    // 2. housing full and food not falling: a house
    if (residents(s) >= s.housing && s.gov.falling === 0) {
      // Economy pass 2 fix (Tim 2026-11-05): at the tier's housing cell cap the limit is the hall, not free land.
      const zk = zoneKind(s, 'house'), char = zk && data.zones.kinds[zk]?.char;
      if (char && zoneCells(s, char) >= cellCap(s, zk, data)) {
        s.suggestions = s.suggestions.filter(x => x.type !== 'house');
        s.report.next = 'House: town hall tier limit (upgrade the hall for more housing cells)';
        return true;
      }
      return suggest(s, 'house', 'House: no free housing');
    }
    const spare = idle >= G.idleNeeded && unfilled === 0;
    // 3. priority produce: the building for the scarcest of timber, stone and goods
    if (s.priority === 'produce' && spare) {
      const low = [['lumber_camp', 'timber'], ['quarry', 'stone'], ['workshop', 'goods']].sort((a, b) => s.stock[a[1]] - s.stock[b[1]])[0];
      return suggest(s, low[0], `${low[0].replace('_', ' ')}: ${low[1]} is low`);
    }
    // 4. priority fortify: a stockade if none
    if (s.priority === 'fortify' && !has(s, 'stockade')) return suggest(s, 'stockade', 'Stockade: fortify');
    // 5. priority trade: a workshop if none
    if (s.priority === 'trade' && spare && !has(s, 'workshop')) return suggest(s, 'workshop', 'Workshop: trade goods');
    // 6-8 (2026-11-06), with initiative only: a storehouse when stock nears its cap, a market once goods pass the keep
    // level, an infirmary once the town has people to look after (so bot towns and Initiative On towns use them)
    if (s.autoBuild) {
      const room = t => data.buildings?.[t] && placedRoom(s, t, data) >= 1 && !pending(s, t);
      if (room('storehouse') && data.resources.some(r => r !== 'ryo' && (s.stock[r] || 0) >= 0.8 * storageCap(s, data, r))) return suggest(s, 'storehouse', 'Storehouse: stock near its cap');
      if (room('market') && !has(s, 'market') && (s.stock.goods || 0) >= (data.market?.keep ?? 400)) return suggest(s, 'market', 'Market: goods to sell');
      if (room('infirmary') && !has(s, 'infirmary') && residents(s) >= 20) return suggest(s, 'infirmary', 'Infirmary: look after our people');
      // 9 (Tim 2026-11-06): a stable once the town is a Village
      if (room('stable') && !has(s, 'stable') && (s.tier || 1) >= 2) return suggest(s, 'stable', 'Stable: horses for the boss');
      // 10 (Tim 2026-11-06): an omnibus station once the town is a Village
      if (room('station') && !has(s, 'station') && (s.tier || 1) >= 2) return suggest(s, 'station', 'Railway station: trains between our towns');
    }
    return false;
  }

  // Repairs and rebuilds on the same spot, at normal cost; materials may be short, construction waits.
  function maintain(s) {
    if (s.projects.length) return;
    const b = s.buildings.find(x => x.stage !== 'built' && !s.projects.some(p => p.replaces === x.id));
    if (!b) return;
    construction.authorize(construction.queue(s.id, b.type, b.cell, { replaces: b.id }));
  }

  // no budget set (the town panel has no budget control): initiative spends up to governor.initiativeBudget per window (2026-11-06)
  // Fix (Tim 2026-11-09, storehouse stuck "waiting for OK" forever): a project dearer than the whole budget may start
  // at the top of a fresh window (nothing spent yet) when you set no budget, and his own project left waiting is retried
  // every review.
  function tryAuthorize(s, pid) {
    const cost = value(construction.find(pid).project.cost), cap = s.budget.ryo || (G.initiativeBudget ?? 400);
    if (s.budget.spent + cost <= cap + EPS || (!s.budget.ryo && s.budget.spent <= EPS)) { construction.authorize(pid); s.budget.spent += cost; }
  }
  function promote(s) {
    if (!s.autoBuild) return;
    // any project left waiting for an OK (his own, or one from an older save / the first project) is his to start
    const waiting = s.projects.find(p => !p.authorized);
    if (waiting) { tryAuthorize(s, waiting.id); return; }
    if (s.projects.length || !s.suggestions.length) return;
    const sg = s.suggestions.shift();
    const zk = zoneKind(s, sg.type);
    if (zk) { zones.autoZone(s, zk); return; }
    const pid = construction.queue(s.id, sg.type, null);
    if (!pid) return;
    construction.find(pid).project.byGov = true;
    tryAuthorize(s, pid);
  }

  // Rule 6: mood keeper, only on auto taxes. The player's locked level is never touched.
  function moodKeeper(s) {
    if (s.taxLocked) return;
    const i = TAX_STEPS.indexOf(s.taxLevel);
    s.gov.moodHigh = s.mood > G.moodHigh ? s.gov.moodHigh + 1 : 0;
    if (s.mood < G.moodLow && i > 0) { economy.setAutoTax(s.id, TAX_STEPS[i - 1]); s.gov.moodHigh = 0; }
    else if (s.gov.moodHigh >= G.moodHighReviews && i < TAX_STEPS.length - 1) { economy.setAutoTax(s.id, TAX_STEPS[i + 1]); s.gov.moodHigh = 0; }
  }

  function review(s) {
    init(s);
    // a bot clan's towns run themselves: its governor always takes initiative (2026-11-06)
    if (s.owner && state.clans?.[s.owner]?.bot) s.autoBuild = true;
    if (s.autoBuild) { workers?.assignIdle(s); workers?.rebalance?.(s); }
    const gov = s.gov;
    // a building finished or came back since the last review: give it time before judging food again
    const nBuilt = s.buildings.filter(b => b.stage === 'built').length;
    // Economy pass 2 fix (Tim 2026-11-05): a full or well stocked store is never "food falling".
    const foodCap = storageCap(s, data, 'food'), plenty = isFull(s, data, 'food') || (Number.isFinite(foodCap) && s.stock.food >= foodCap * (G.foodPlentyShare ?? 0.5));
    gov.falling = !plenty && nBuilt === gov.nBuilt && s.stock.food < gov.foodLast - EPS ? gov.falling + 1 : 0;
    gov.nBuilt = nBuilt;
    gov.foodLast = s.stock.food;
    if(gov.falling===0 && (plenty || (s.report.rate?.food || 0)>0))s.suggestions=s.suggestions.filter(x=>!(x.type==='farm' && x.reason==='Farm: food falling'));
    if (++gov.window >= G.budgetWindowReviews) { gov.window = 0; s.budget.spent = 0; }
    s.report.next = '';
    maintain(s);
    trainWorker(s);
    const timber = timberCampRule(s);
    if (timber === 'save' || (!timber && !campRule(s) && !richCampRule(s))) rules(s);
    promote(s);
    moodKeeper(s);
    const p = s.projects.find(x => x.authorized) || s.projects[0];
    s.report.doing = p ? `${p.replaces ? 'Rebuilding' : 'Building'} ${p.type.replace('_', ' ')}${p.paid ? ` (${p.progress}/${p.need})` : p.authorized ? ' (waiting for materials)' : ' (waiting for OK)'}` : 'Keeping the town running';
    if (!s.report.next && s.suggestions.length) s.report.next = s.suggestions[0].reason;
    upgradeHint(s);
    if (s.autoBuild) ship.clerk?.(s);   // rail shipments S3: the rail clerk works only while the governor is on auto (Tim 2026-11-09)
  }

  // B3: when the town presses on a tier limit and can afford the next tier, say so. The upgrade itself is
  // the player's choice (town panel); towns owned by a bot clan with autoBuild upgrade on their own.
  function upgradeHint(s) {
    if (!data.tiers?.list || !upgradeCheck(s, data).ok) return;
    const t = tierOf(s, data), atLimit = (zones?.on(s) && Object.entries(t.cells || {}).some(([k, cap]) => zoneCells(s, data.zones.kinds[k]?.char) >= cap))
      || workerCount(s) >= t.workers || data.resources.some(r => isFull(s, data, r));
    if (!atLimit) return;
    if (s.autoBuild && s.owner && s.owner !== 'player') {
      startUpgrade(s, data, world);
      s.report.next = 'Upgrading the town hall';
    } else s.report.next = `Upgrade the town hall to ${nextTier(s, data).name}: the town is at its tier limits`;
  }

  // The player's OK on a suggestion (also used by the F2.8 command): queue it and authorize it.
  function approve(sid, index) {
    const s = world.settlement(sid);
    if (!s) return false;
    init(s);
    const sg = s.suggestions[index];
    if (!sg) return false;
    const zk = zoneKind(s, sg.type);
    if (zk) { if (!zones.autoZone(s, zk).ok) return false; s.suggestions.splice(index, 1); return true; }
    const pid = construction.queue(s.id, sg.type, null);
    if (!pid) return false;
    construction.authorize(pid);
    s.suggestions.splice(index, 1);
    return pid;
  }

  function run() {
    if (f().econTick % G.reviewTicks !== 0) return;
    for (const s of Object.values(f().settlements)) if (!s.capital) review(s);
  }

  return { review, run, approve };
}
