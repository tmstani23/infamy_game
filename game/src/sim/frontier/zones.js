// Zones, health and growth (Loop 3, card L3.3). Zones decide HOW MUCH a town makes; placed buildings
// decide what it can do. createZones({ state, data, world }) -> { on, zone, migrate, slots, setWorkers,
// tick, autoZone, busy, roadNear }.
// A zoned cell lives in settlement.grid (zone char, by, stage). Stage 0 is zoned ground with nothing on
// it yet; each stage after that is one level (housing: hut, house, large house). Per zone kind and town,
// s.zones[kind] = { health, short, abandoned, wanted, workers, cells, levels, noRoad, output } and
// s.zoneGrow[cell] = healthy ticks towards the next stage (or towards clearing overgrown ground).
// Each economy tick, per kind: health 0-1 = the least-met need (food, workers). A cell grows one stage
// after growTicks healthy ticks, but only with a road (or the town hall) within roadReach cells.
// After abandonTicks short, the kind is abandoned: no output and no housing, stages kept, and it
// recovers as soon as its needs return. Nothing is destroyed.
// Output = sum over cells of stage level x health x per-cell rate x trait factor.
// Every kind, char and number comes from data/frontier.json "zones" (nothing is hard-coded here).
import { cellOffset, inCore, centreCell, hallRoadCell, nearCliff } from './town_grid.js';
import {coversResources} from './resource_clearance.js';
import { residents } from './people.js';
import { cellCap, zoneCells } from './tiers.js';
import { payUpkeep } from './upkeep.js';
import { noteLevelUp } from './arrivals.js';
import { storageCap } from './storage.js';

const put = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);

export function createZones({ state, data, world,resourceIndex }) {
  const Z = () => data.zones;
  const kinds = () => Object.entries(Z().kinds).filter(([name]) => !name.startsWith('_'));
  const on = s => !!(s?.grid && data.zones);
  const wait = (s, what) => { if (!s.report.waiting.includes(what)) s.report.waiting.push(what); };
  const bad = (reason, cells = []) => ({ ok: false, reason, cost: {}, cells });
  const stageOf = (s, i) => Number(s.grid.stage[i]);

  function rec(s) {
    s.zones ||= {};
    s.zoneGrow ||= {};
    for (const [name] of kinds()) s.zones[name] ||= { health: 1, short: 0, abandoned: false, wanted: 0, workers: 0, cells: 0, levels: 0, noRoad: 0, output: 0 };
    return s.zones;
  }

  // cell lists per kind, from one pass over the zone string
  function cellsOf(s) {
    const byChar = {}, out = {};
    for (const [name, k] of kinds()) { out[name] = []; byChar[k.char] = out[name]; }
    const z = s.grid.zone;
    for (let i = 0; i < z.length; i++) if (byChar[z[i]]) byChar[z[i]].push(i);
    return out;
  }

  // Road and gate cells linked to the town hall (Tim 2026-11-05: stray road bits must not count). A chain of
  // road/gate cells (diagonals join) has to reach the hall's apron: within roadReserve + 1 cells of its centre.
  // Cached per grid layout string, so it is recomputed only when roads change.
  const linkedCache = new WeakMap();
  function linkedRoads(s) {
    const { n, use } = s.grid, key = use + '|' + (s.roadReserve || 0);
    const hit = linkedCache.get(s);
    if (hit?.key === key) return hit.mask;
    const mask = new Uint8Array(use.length), hall = centreCell(n), hc = hall % n, hr = (hall - hc) / n, apron = (s.roadReserve || 0) + 1;
    const road = j => use[j] === 'r' || use[j] === 'g', stack = [];
    for (let r = Math.max(0, hr - apron); r <= Math.min(n - 1, hr + apron); r++)
      for (let c = Math.max(0, hc - apron); c <= Math.min(n - 1, hc + apron); c++) { const j = r * n + c; if (road(j)) { mask[j] = 1; stack.push(j); } }
    while (stack.length) {
      const j = stack.pop(), c = j % n, r = (j - c) / n;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc, k = rr * n + cc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n || mask[k] || !road(k)) continue;
        mask[k] = 1; stack.push(k);
      }
    }
    linkedCache.set(s, { key, mask });
    return mask;
  }
  // A road or gate (or the town hall, when hallIsRoad) within `reach` cells (square ring); with zones.roadsConnect
  // the road must be linked to the hall.
  function roadNear(s, i, reach) {
    const { n, use } = s.grid, col = i % n, row = (i - col) / n, hall = centreCell(n);
    const linked = Z().roadsConnect ? linkedRoads(s) : null;
    for (let r = Math.max(0, row - reach); r <= Math.min(n - 1, row + reach); r++)
      for (let c = Math.max(0, col - reach); c <= Math.min(n - 1, col + reach); c++) {
        const j = r * n + c;
        if ((Z().hallIsRoad && j === hall) || ((use[j] === 'r' || use[j] === 'g') && (!linked || linked[j]))) return true;
      }
    return false;
  }

  // ---- the zone action (player via the command, governor directly; same function) ----
  // { kind, rect: [c0, r0, c1, r1] } or { kind, cells }. Used and already-zoned cells inside the
  // rectangle are skipped; unbuildable or out-of-core cells refuse the whole rectangle.
  function zone(s, { kind, rect, cells, by = 'p', dryRun = false }) {
    if (!on(s)) return bad('no grid');
    const k = typeof kind === 'string' && !kind.startsWith('_') ? Z().kinds[kind] : null;
    if (!k) return bad('unknown zone kind');
    const g = s.grid, { n } = g;
    let list = cells;
    if (rect !== undefined) {
      const [x0, y0, x1, y1, ...extra] = Array.isArray(rect) ? rect : [];
      if (extra.length || ![x0, y0, x1, y1].every(Number.isInteger)) return bad('rect must be [c0, r0, c1, r1]');
      const [c0, c1, r0, r1] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
      if (c0 < 0 || r0 < 0 || c1 >= n || r1 >= n) return bad('outside grid');
      list = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) list.push(r * n + c);
    }
    if (!Array.isArray(list) || !list.length || !list.every(Number.isInteger) || new Set(list).size !== list.length) return bad('cells must list each cell once');
    if (list.some(i => i < 0 || i >= n * n)) return bad('outside grid', list);
    if (list.some(i => g.ground[i] === 'x')) return bad('unbuildable', list);
    if (k.cliffMargin && list.some(i => nearCliff(s, i, data))) return bad('too close to a cliff', list);
    if(coversResources(s,list,resourceIndex,data.founding?.unitClearance))return bad('resource area: leave room to harvest',list);
    if (list.some(i => !inCore(s, i, data))) return bad('outside the town ring', list);
    const free = list.filter(i => g.use[i] === '.' && g.zone[i] === '.' && !hallRoadCell(s, i));
    if (!free.length && list.some(i => hallRoadCell(s, i))) return bad('reserved for town hall road', list);
    if (!free.length) return bad('occupied', list);
    // B3: the town hall tier caps zoned cells per kind
    const cap = cellCap(s, kind, data), have = zoneCells(s, k.char);
    if (have + free.length > cap) return { ...bad('town hall tier limit', list), have, cap };
    if (!dryRun) {
      rec(s);
      const mark = by === 'g' ? 'g' : 'p';
      for (const i of free) { g.zone = put(g.zone, i, k.char); g.by = put(g.by, i, mark); g.stage = put(g.stage, i, '0'); delete s.zoneGrow[i]; }
    }
    return { ok: true, reason: '', cost: {}, cells: free };
  }

  // ---- migration: old house / farm / workshop buildings become zones (save shape, L3.3) ----
  // Levels needed = the building's yield over the kind's yield per level, rounded (so totals match);
  // they fill the building's own cells first, then the nearest free cells, up to the top stage each.
  function levelsFor(t, k) {
    if (k.housing) return (t.housing || 0) / k.housing;
    const [r, per] = Object.entries(k.output || {})[0] || [];
    if (!r || !per) return 0;
    const made = (t.output?.[r] || 0) * (t.jobs || 0) + (t.recipe ? (t.recipe.out?.[r] || 0) / (t.recipe.everyTicks || 1) : 0);
    return made / per;
  }

  function migrate(s) {
    if (!on(s)) return false;
    const map = Z().fromBuilding || {};
    const old = s.buildings.filter(b => b.stage === 'built' && map[b.type] && Z().kinds[map[b.type]]);
    if (!old.length) return false;
    rec(s);
    const g = s.grid, { n } = g;
    for (const b of old) {
      const kind = map[b.type], k = Z().kinds[kind], max = k.stages.length;
      let levels = Math.max(1, Math.round(levelsFor(data.buildings[b.type], k)));
      const own = (b.cells || [b.cell]).filter(i => Number.isInteger(i) && i >= 0 && i < n * n);
      s.buildings.splice(s.buildings.indexOf(b), 1);
      for (const i of own) if (g.use[i] === 'B') g.use = put(g.use, i, '.');
      const want = Math.ceil(levels / max), picked = own.slice(0, want);
      if (picked.length < want) {
        const [ax, az] = own.length ? cellOffset(s, own[0]) : [0, 0];
        const cand = [];
        for (let i = 0; i < n * n; i++) {
          if (g.use[i] !== '.' || g.zone[i] !== '.' || g.ground[i] === 'x' || (k.cliffMargin && nearCliff(s, i, data)) || picked.includes(i) || (k.coreOnly && !inCore(s, i, data))) continue;
          const [ox, oz] = cellOffset(s, i);
          cand.push([(ox - ax) * (ox - ax) + (oz - az) * (oz - az), i]);
        }
        cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        for (const [, i] of cand.slice(0, want - picked.length)) picked.push(i);
      }
      for (const i of picked) {
        const st = Math.min(max, levels);
        levels -= st;
        g.zone = put(g.zone, i, k.char); g.stage = put(g.stage, i, String(st));
        g.ground = put(g.ground, i, 'c');
        if (g.by[i] === '.') g.by = put(g.by, i, 'p');
        delete s.zoneGrow[i];
      }
    }
    tick(s, true);   // housing at once, so the town never shows a dip
    return true;
  }

  // ---- jobs: economy.assignJobs fills these beside the building jobs ----
  // [{ zone, jobs, workers, food, as }] (as = building types in the priority lists that mean this kind)
  function slots(s) {
    if (!on(s)) return [];
    const zs = rec(s), lists = cellsOf(s), map = Z().fromBuilding || {}, out = [];
    for (const [name, k] of kinds()) {
      const per = k.needs?.workersPerCell || 0;
      const built = lists[name].filter(i => stageOf(s, i) >= 1).length;
      zs[name].wanted = per ? Math.ceil(built * per) : 0;
      zs[name].workers = 0;
      if (zs[name].wanted) out.push({ zone: name, jobs: zs[name].wanted, workers: 0, food: !!k.output?.food, as: Object.keys(map).filter(b => map[b] === name) });
    }
    return out;
  }
  function setWorkers(s, list) { const zs = rec(s); for (const sl of list) zs[sl.zone].workers = sl.workers; }

  function traitFactor(s, k) {
    const te = data.traitEffects;
    if (!k.trait || !te?.[k.trait] || !s.traits) return 1;
    return te[k.trait][s.traits[k.trait]] ?? 1;
  }

  // ---- one economy tick: health, abandon/recover, growth, output, housing ----
  // housingOnly: recompute housing without moving any counters (used right after migration)
  function tick(s, housingOnly = false) {
    if (!on(s)) return;
    const zs = rec(s), g = s.grid, D = Z(), lists = cellsOf(s);
    const eating = data.rates.food * residents(s), foodScore = eating > 0 ? Math.min(1, s.stock.food / eating) : 1;
    let housing = 0;
    const up = housingOnly ? { zone: {}, goods: 1 } : payUpkeep(s, data, world);   // B5 upkeep and goods
    if (s.wagesShort) wait(s, 'wages');
    for (const [name, k] of kinds()) {
      const z = zs[name], cells = lists[name], max = k.stages.length, needs = k.needs || {};
      const levels = cells.reduce((sum, i) => sum + stageOf(s, i), 0);
      z.cells = cells.length; z.levels = levels;
      if (!housingOnly) {
        const scores = [];
        if (needs.food) scores.push(foodScore);
        if (needs.workersPerCell) scores.push(z.wanted > 0 ? Math.min(1, z.workers / z.wanted) : 1);
        if (up.zone[name] !== undefined) scores.push(up.zone[name]);   // B5: short upkeep lowers health
        if (up.zone[name] !== undefined && up.zone[name] < 1) wait(s, 'upkeep');
        z.health = scores.length ? Math.min(...scores) : 1;
        if (z.health < D.shortBelow) { z.short++; if (z.short >= k.abandonTicks) z.abandoned = true; }
        else { z.short = 0; z.abandoned = false; }
      }
      const live = z.abandoned ? 0 : z.health;
      housing += (k.housing || 0) * levels * live;
      if (housingOnly) continue;
      // growth (and clearing overgrown ground first, as part of the same work)
      z.noRoad = 0;
      for (const i of cells) {
        const st = stageOf(s, i);
        if (st >= max) { delete s.zoneGrow[i]; continue; }
        if (!roadNear(s, i, needs.roadReach)) { z.noRoad++; continue; }
        if (z.abandoned || z.health < D.healthyAt) continue;
        // B5: housing grows to stage 2+ only while its goods are paid (short goods never lower a level)
        if (k.housing && st >= 1 && (data.upkeep?.goodsByStage?.[st] || 0) > 0 && (s.goodsShort || !(s.stock.goods > 0))) { wait(s, 'goods for housing'); continue; }
        const t = (s.zoneGrow[i] || 0) + 1;
        if (g.ground[i] === 'o') {
          if (t >= D.clearTicks) { g.ground = put(g.ground, i, 'c'); delete s.zoneGrow[i]; } else s.zoneGrow[i] = t;
          continue;
        }
        if (t >= k.growTicks) { g.stage = put(g.stage, i, String(st + 1)); delete s.zoneGrow[i]; if (k.housing && st >= 1) noteLevelUp(s, i, st + 1, state); } else s.zoneGrow[i] = t;
      }
      if (z.noRoad) wait(s, 'needs road');
      // output (inputs, if any, are paid per unit made; short inputs scale it down)
      z.output = 0;
      if (k.output && levels && live) {
        const tf = traitFactor(s, k), made = {};
        for (const [r, per] of Object.entries(k.output)) made[r] = per * levels * live * tf;
        const total = Object.values(made).reduce((a, b) => a + b, 0);
        let scale = 1;
        // a full store makes no more (Tim 2026-11-05 governor soak: workshops burned timber/stone into a full goods store)
        if (k.inputs) for (const [r, v] of Object.entries(made)) if (v > 0) scale = Math.min(scale, Math.max(0, storageCap(s, data, r) - (s.stock[r] || 0)) / v);
        for (const [r, per] of Object.entries(k.inputs || {})) { const need = per * total; if (need > 0) scale = Math.min(scale, Math.max(0, s.stock[r]) / need); }
        if (scale < 1) wait(s, 'inputs');
        if (scale > 0) {
          for (const [r, per] of Object.entries(k.inputs || {})) world.change(s.id, r, -Math.min(s.stock[r], per * total * scale), `${name} zone`);
          for (const [r, v] of Object.entries(made)) world.change(s.id, r, v * scale, `${name} zone`);
          z.output = total * scale;
        }
      }
    }
    for (const key of Object.keys(s.zoneGrow)) if (g.zone[key] === '.') delete s.zoneGrow[key];   // erased cells
    s.zoneHousing = housing;
    world.recount(s.id);
  }

  // ---- governor helpers ----
  // A kind is busy while any of its cells with a road is still growing (so the governor waits for it).
  function busy(s, kind) {
    if (!on(s)) return false;
    const k = Z().kinds[kind], max = k.stages.length, ch = k.char, g = s.grid;
    for (let i = 0; i < g.zone.length; i++) if (g.zone[i] === ch && stageOf(s, i) < max && roadNear(s, i, k.needs?.roadReach)) return true;
    return false;
  }
  // The governor's zoning: governorCells free cells nearest the hall, with a road in reach, never on a
  // cell anybody has touched (by must be '.'). Goes through zone() with by = 'g'.
  function autoZone(s, kind) {
    if (!on(s)) return bad('no grid');
    const k = Z().kinds[kind], g = s.grid, { n } = g;
    if (!k) return bad('unknown zone kind');
    const cand = [];
    for (let i = 0; i < n * n; i++) {
      if (g.zone[i] !== '.' || g.use[i] !== '.' || g.by[i] !== '.' || g.ground[i] === 'x' || (k.cliffMargin && nearCliff(s, i, data)) || hallRoadCell(s, i) || !inCore(s, i, data)) continue;
      if(coversResources(s,[i],resourceIndex,data.founding?.unitClearance))continue;
      const [ox, oz] = cellOffset(s, i);
      cand.push([ox * ox + oz * oz, i]);
    }
    cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const picked = [];
    for (const [, i] of cand) {
      if (picked.length >= k.governorCells) break;
      if (roadNear(s, i, k.needs?.roadReach)) picked.push(i);
    }
    if (!picked.length) return bad('needs a road to zone');
    return zone(s, { kind, cells: picked, by: 'g' });
  }

  return { on, zone, migrate, slots, setWorkers, tick, autoZone, busy, roadNear, linkedRoads };
}
