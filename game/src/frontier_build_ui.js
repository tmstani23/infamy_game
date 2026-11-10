// L3.8: local tools and selection. Rules are queried in sim modules; changes are commands only.
import { createPlacement } from './sim/frontier/placement.js';
import { createZones } from './sim/frontier/zones.js';
import { cellToWorld, worldToCell, ringRadius } from './sim/frontier/town_grid.js';
import { bodyDistance } from './crew_input.js';
import { townCellTip, townName } from './frontier_tips.js';
import { spotInfo } from './resource_spot_props.js';
import { spotYield, richReach, overwork, regrowChance, supportsWorkers } from './sim/resource_spots.js';
import { townPlots } from './town_props.js';
import { workerPanelHTML, workerJob, workerStatus } from './worker_panel.js';
import { cargoIcon, CARGO_ICON_SIZE } from './cargo_icons.js';
import {workerDetails,workerPresentation} from './worker_details.js';
import {watchCrewGroup} from './crew_watch.js';
import { buildTooltip } from './build_tooltips.js';
import { tierOf, placedGroup, placedCount } from './sim/frontier/tiers.js';
import { workerTrainingHTML,workerTrainingPreview } from './training_ui.js';
import { cellCap, zoneCells, nextTier, upgradeCheck } from './sim/frontier/tiers.js';
import { residents } from './sim/frontier/people.js';
import { shapeOf, stationParts } from './sim/frontier/station_layout.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function resourceRequirements(s, cost = {}, people = 0) {
  return [...Object.entries(cost).map(([r,n]) => `${townName(r)}: need ${n}, have ${Math.floor((s.stock?.[r] || 0)*100)/100}${(s.stock?.[r] || 0)<n ? ` · missing ${Math.ceil((n-(s.stock?.[r] || 0))*100)/100}` : ''}`),
    ...(people ? [`People: need ${people}, have ${s.pop}${s.pop<people ? ` · missing ${people-s.pop}` : ''}`] : [])].join('\n') || 'No resource cost';
}
export const affordable = (s, cost) => Object.entries(cost || {}).every(([r,n]) => (s.stock?.[r] || 0) >= n);

export function rectangleCells(s, first, last) {
  const n = s.grid.n;
  if (first < 0 || last < 0) return [];
  const c0 = Math.min(first % n, last % n), c1 = Math.max(first % n, last % n);
  const r0 = Math.min(Math.floor(first / n), Math.floor(last / n)), r1 = Math.max(Math.floor(first / n), Math.floor(last / n));
  const cells = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.push(r * n + c);
  return cells;
}

// rot: which way a shaped building (the 3x2 railway station) is turned, 0..3 (R while placing)
export function buildRequest(s, tool, first, last, data, rot = 0) {
  const building = !!data.buildings[tool]?.size && !data.zones.kinds[tool];
  return { town: s.id, action: tool === 'eraser' ? 'remove' : data.zones.kinds[tool] ? 'zone' : 'place',
    ...(tool === 'eraser' ? {} : { kind: tool }), cells: building ? [last] : rectangleCells(s, first, last),
    ...(building && shapeOf(data.buildings[tool]) ? { rot } : {}) };
}

// The same dry-run functions the sim commands use, applied to the read-only snapshot.
// Erasing has no query entry point: run its real validation against an isolated copy.
export function buildPreview(s, request, data, {state,resourceIndex}={}) {
  const placement = createPlacement({ data, state, resourceIndex, construction: { cancel() {} } });
  const zones = createZones({ data,resourceIndex });
  const result = request.action === 'zone' ? zones.zone(s, { ...request, dryRun: true })
    : request.action === 'remove' ? placement.remove(s, {...request,dryRun:true}) : placement.check(s, request);
  if (result.ok && request.action === 'zone') {
    const reach = data.zones.kinds[request.kind].needs?.roadReach;
    if (result.cells.some(i => !zones.roadNear(s, i, reach))) return { ...result, warning: 'Needs a road linked to the town hall within ' + reach + ' cells to grow' };
  }
  if (result.ok && request.action === 'place' && data.buildings[request.kind]) {
    const short = Object.entries(result.cost).some(([r, n]) => (s.stock[r] || 0) < n);
    if (short) return { ...result, warning: 'Queued; waiting for materials' };
  }
  return result;
}

export function createFrontierBuildUI({ game, view, heroId, data, spotIndex, spotRules, known, send, crewInput, onBuild = () => {}, onMode = () => {}, onStable = () => {}, blocked = () => false }) {
  let town = null, opened = false, tool = null, drag = null, mouse = null, selected = [], inspect = null, rot = 0;   // rot: R turns a station
  let eraseConfirm = null;   // { k, until }: the station erase waiting for its second click
  // how many railway lines run from the station under these cells (0 if none or no station)
  const stationLines = (s, cells) => s.buildings.some(b => b.type === 'station' && (b.cells || [b.cell]).some(i => cells.includes(i)))
    ? Object.values(game.state.frontier?.rail?.links || {}).filter(l => l.owner === s.owner && (l.from === s.id || l.to === s.id)).length : 0;
  let inspectionHtml = '', inspectionPressed = false;
  let pendingPlan = null, reviewHtml = '', reviewPressed = false;
  let workerPage = 0;
  let workerTab='roster',workerLogPage=0;
  let workersOpen = false;
  let rosterClick=null;
  let lastPreview = '', preview = null, seen = 0, messageUntil = 0;
  const overlay = document.createElement('canvas'), hint = document.createElement('div'), card = document.createElement('div');
  const review = document.createElement('div'); review.id = 'townbuildreview'; review.hidden = true;
  overlay.id = 'townbuildoverlay'; hint.id = 'townbuildhint'; card.id = 'towninspect';
  hint.hidden = card.hidden = true; overlay.hidden = true;
  document.body.append(overlay, hint, card, review);
  const hero = () => game.state.entities[heroId];
  const towns = () => Object.values(game.state.frontier?.settlements || {}).filter(s => !s.capital && s.owner === hero()?.owner && s.grid);
  const current = () => towns().find(s => s.id === town);
  const outdoors = () => (view.commandPlace?.(game.state, heroId) || hero()?.place) === 'world';
  const command = c => send({ id: heroId, type: 'frontier', ...c });
  const previewBuild=(s,r)=>buildPreview(s,r,data,{state:game.state,resourceIndex:spotIndex});
  const workers = () => towns().flatMap(s => (s.workers || []).map(w => ({ s, w, e: workerPresentation(w,s,data,game.state.entities,game.state.workerAt) })).filter(p => !p.e.dead && !p.e.downed));
  const selectedLive = () => towns().flatMap(s => (s.workers || []).filter(w => selected.includes(w.id)).map(w => ({ s, w })));
  const canvasEvent = e => e.target?.closest?.('canvas#view') && outdoors() && !blocked();
  const consume = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  // Workers row on a spot card (Tim 2026-11-06 22:23): how worked out the spot is now and about how many workers it
  // keeps at full speed. Live estimate: aim to keep at most `aim` of its value worked out (workers.overwork).
  function workRow(spot, n) {
    if (!n || !spotRules?.stages) return '';
    const { speed, best, over } = overwork(spot, game.state.frontier?.spots?.[spot.id], spotRules.stages, n, data.workers?.overwork, tripSecondsAt(spot));
    const cap = best ?? n, pct = Math.min(100, Math.round(100 * Math.min(n, cap) / Math.max(n, cap))), col = over ? '#d9a25a' : '#7fc27a';
    return `<div style="margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:12px"><span>Workers ${n}${best != null ? ` / about ${best} best` : ''}</span><span>${speed}% full</span></div>`
      + `<div style="height:8px;border-radius:4px;background:${over ? 'rgba(217,162,90,.35)' : 'rgba(0,0,0,.45)'};overflow:hidden;margin:3px 0"><div style="height:100%;width:${pct}%;background:#7fc27a"></div></div>`
      + `<div style="font-size:12px;color:${col}">${over ? `Overworked: ${n - best} extra worker${n - best > 1 ? 's' : ''} add little` : 'Room for more workers'}</div>`
      + spotDetails(spot, n) + `</div>`;
  }
  // The actual numbers behind the workers row (Tim 2026-11-06 22:25), folded away under Details.
  function spotDetails(spot, n) {
    const st = spotRules.stages, saved = game.state.frontier?.spots?.[spot.id], chars = saved && saved.length === spot.pieces.length ? saved : 'f'.repeat(spot.pieces.length);
    const c = ch => [...chars].filter(x => x === ch).length, now = spotYield(spot, saved, st), full = spotYield(spot, null, st);
    const W = data.workers, rich = spot.deposit ? st.rich || {} : {}, hz = 20, cad = data.cadenceTicks || 20;
    const harvest = t => (W.harvestTicks * spot.pieces.length / t / hz).toFixed(1), aim = W.overwork ?? 0.35;
    const q = regrowChance(spot, st), regrowSec = Math.round((q ? 2 / q : 1 / st.regrow.h + 1 / st.regrow.s) * cad / hz), trip = tripSecondsAt(spot);
    const row = (a, b) => `<div style="display:flex;justify-content:space-between;gap:10px"><span style="opacity:.75">${a}</span><span>${b}</span></div>`;
    return `<details style="font-size:12px;margin-top:4px"><summary style="cursor:pointer;opacity:.8">Details</summary>`
      + row('Pieces', `${c('f')} full · ${c('s')} regrowing · ${c('h')} worked`)
      + row('Piece value', `full ${st.value.f} · regrowing ${st.value.s} · worked ${st.value.h}`)
      + row('Harvest value now / full', `${now.toFixed(1)} / ${full.toFixed(1)} (${Math.round(100 * now / full)}%)`)
      + (spot.deposit ? row('Rich deposit', `x${rich.yield ?? 1} harvest speed`) : '')
      + (q ? row('Keeps busy (camp beside it)', `${supportsWorkers(spot, st)} workers · ${st.supports.campTripSeconds}s trip`) : '')
      + (trip ? row('Your workers\' trip now', `${trip.toFixed(1)}s`) : '')
      + row('Harvest time per trip', `${harvest(now)}s now · ${harvest(full)}s when full`)
      + row('Load per trip', `${W.load}`)
      + row('Worked piece back to full', `about ${regrowSec}s${q ? ` (${Math.round(q * 100)}% chance per stage each second)` : ''}`)
      + row('Each trip works out', '1 piece')
      + row('Workers here', `${n}`)
      + row('Overworked when', q ? 'more workers than it keeps busy at your trip length' : `more than ${Math.round(aim * 100)}% of its value is worked out`)
      + `</details>`;
  }
  // average full-speed trip (walk out + back, at full harvest) of the workers on a spot, in seconds; null if none
  function tripSecondsAt(spot) {
    const ws = towns().flatMap(t => t.workers || []).filter(w => w.spot === spot.id && w.trip && !w.trip.kind);
    if (!ws.length) return null;
    const full = data.workers.harvestTicks * spot.pieces.length / spotYield(spot, null, spotRules.stages);
    return ws.reduce((a, w) => a + (w.trip.out + w.trip.back + full) / 20, 0) / ws.length;
  }
  // spots this town's workers are overworking (for the worker roster)
  function overworkedSpots(s) {
    const out = new Set(), count = {};
    if (!spotRules?.stages) return out;
    for (const t of towns()) for (const w of t.workers || []) if (w.spot) count[w.spot] = (count[w.spot] || 0) + 1;
    for (const w of s.workers || []) if (w.spot && !out.has(w.spot)) { const p = spotIndex.get(w.spot); if (p && overwork(p, game.state.frontier?.spots?.[p.id], spotRules.stages, count[w.spot], data.workers?.overwork, tripSecondsAt(p)).over) out.add(w.spot); }
    return out;
  }
  // Camp card (Tim 2026-11-06 21:20: a bar and chips, not a wall of text): storage used / cap, each cart, worker limit, Buy cart.
  function campCardHTML(b, s) {
    const C = data.workers.carts, used = Object.values(b.store || {}).reduce((a, v) => a + v, 0), pct = Math.min(100, Math.round(100 * used / C.cap));
    const col = pct >= 100 ? '#d9694a' : pct >= 75 ? '#d9a25a' : '#7fc27a', carts = b.carts || [];
    const res = Object.entries(b.store || {}).filter(([, v]) => v > 0).map(([r, v]) => `${Math.round(v)} ${esc(r)}`).join(' · ') || 'empty';
    const where = { camp: 'At camp', out: 'To town', back: 'Returning' }, secs = t => `${Math.ceil((t || 0) / 20)}s`;
    const chip = c => { const load = Object.values(c.load || {}).reduce((a, v) => a + v, 0);
      return `<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 6px;margin:2px 0;border-radius:4px;background:rgba(255,255,255,.06)"><span>🐂 ${where[c.at] || c.at}${c.t ? ` · ${secs(c.t)}` : ''}</span><span>${c.at === 'out' ? `${Math.round(load)} / ${C.maxLoad}` : `max ${C.maxLoad}`}</span></div>`; };
    const perMin = b.cartTicks ? carts.length * C.maxLoad * 1200 / (2 * b.cartTicks) : null, keep = perMin && C.workerPerMin ? Math.floor(perMin / C.workerPerMin) : null;
    const cost = Object.entries(C.extraCost).map(([r, v]) => `${v} ${r}`).join(', ');
    return `<div style="margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:12px"><span>Camp storage</span><span>${Math.round(used)} / ${C.cap} · ${Math.max(0, Math.round(C.cap - used))} free</span></div>`
      + `<div style="height:8px;border-radius:4px;background:rgba(0,0,0,.45);overflow:hidden;margin:3px 0"><div style="height:100%;width:${pct}%;background:${col}"></div></div>`
      + `<div style="font-size:12px;opacity:.8">${res}${pct >= 100 ? ' · <span style="color:#d9a25a">full: workers walk to town</span>' : ''}</div>`
      + `<div style="font-size:12px;margin-top:6px">Ox carts ${carts.length} / ${C.max} · take ${Math.round(C.share * 100)}% each visit</div>${carts.map(chip).join('')}`
      + (keep != null ? `<div style="font-size:12px;opacity:.8">Carts keep up with about ${keep} workers${b.cartTicks ? ` · round trip ${secs(2 * b.cartTicks)}` : ''}</div>` : '')
      + (carts.length < C.max ? `<button data-buy-cart="${esc(b.id)}" data-cart-town="${esc(s.id)}" title="One more ox cart for this camp">Buy cart (${esc(cost)})</button>` : '')
      + `</div>`;
  }
  // Reach anchors for rich deposits: own town halls (workers.range) and their built work camps (workers.campReach).
  function reachAnchors(kind = null) {
    const W = data.workers || {}, out = [];
    for (const s of towns()) {
      out.push({ town: s.id, name: s.name, x: s.x, z: s.z, r: W.range ?? 600 });
      for (const b of s.buildings || []) if (b.stage === 'built' && (W.gatherBuildings || []).includes(b.type) && s.grid && Number.isInteger(b.cell)
        && (!kind || !W.campTakes?.[b.type] || W.campTakes[b.type].includes(W.resources?.[kind]))) {   // a camp reaches only its own resource
        const [x, z] = cellToWorld(s, b.cell); out.push({ town: s.id, name: s.name, x, z, r: W.campReach ?? 0, camp: true });
      }
    }
    return out;
  }
  function cancel() { tool = null; drag = null; pendingPlan = null; review.hidden = true; mouse = null; preview = null; lastPreview = ''; hint.hidden = true; crewInput.cancelPointer(); }
  function close() { const was = opened; cancel(); opened = false; workersOpen = false; if (was) onMode(); }
  function say(text) { hint.textContent = text; delete hint.dataset.ok; hint.hidden = false; hint.style.left = '24px'; hint.style.top = '130px'; messageUntil = Date.now() + 5000; }
  function spotAt(x, y) {
    const p = view.screenToGround(x, y), cfg = data.townArt._spots;
    if (!p) return null;
    let best = null, distance = cfg.hoverRadius;
    for (const spot of spotIndex.spotsNear(p.x, p.z, cfg.pieceReach).filter(s => known(s.x, s.z))) {
      for (const [dx, dz] of spot.pieces) {
        const d = Math.hypot(p.x - spot.x - dx, p.z - spot.z - dz);
        if (d < distance) { best = spot; distance = d; }
      }
    }
    return best;
  }
  function cellAt(x, y, s = current()) {
    const p = view.screenToGround(x, y);
    return s && p ? worldToCell(s, p.x, p.z) : -1;
  }
  function townAt(x, y) {
    let best = null, distance = Infinity;
    // Match the existing town hover's upright art hit area before trying ground cells.
    for (const p of townPlots(towns())) {
      const u = view.unitToScreen(p.x,p.z,0), a = view.unitToScreen(p.x+1,p.z,0), k = Math.hypot(a.x-u.x,a.y-u.y) || 1;
      const dx = Math.abs(x-u.x), dy = y-u.y, d = dx + Math.abs(dy);
      if (dx <= 5*k && dy >= -7*k && dy <= 3*k && d < distance) { distance = d; best = p; }
    }
    if (best) {
      const s = towns().find(s => s.id === best.town);
      const record = (best.kind === 'project' ? s.projects : s.buildings).find(b => b.id === best.id);
      return { s, cell: record.cell };
    }
    // Tim 2026-11-07: a click on bare road, wall or gate ground opens no card (too easy to hit, and it covers the screen)
    const bare = (s, c) => 'rwg'.includes(s.grid.use[c]) && !s.buildings.some(b => (b.cells || [b.cell]).includes(c))
      && !s.projects.some(p => (p.cells || [p.cell]).includes(c)) && !Object.values(data.zones.kinds).some(k => k.char === s.grid.zone[c]);
    return towns().map(s => ({ s, cell: cellAt(x,y,s) })).find(p => townCellTip(p.s,p.cell,data) && !bare(p.s,p.cell));
  }
  function select(ids) {
    selected = ids;
    if (ids.length) { cancel(); crewInput.clear(); }
    if(ids.length===1)crewInput.inspect?.(selectedLive()[0]?.w.entity);
    inspect = null; card.hidden = true;
  }
  function focusWorkers(ids) {
    select(ids);
    const follow=()=>{
      const entities=selectedLive().filter(p=>ids.includes(p.w.id)).map(p=>({...workerPresentation(p.w,p.s,data,game.state.entities,game.state.workerAt),owner:p.s.owner}));
      return watchCrewGroup({entities:Object.fromEntries(entities.map(e=>[e.id,e]))},hero()?.owner,null,entities.map(e=>e.id));
    };
    const p=follow();if(p){view.jumpTo?.(p.x,p.z);view.watch?.(follow);}
  }
  function assign(spot) {
    for (const s of towns()) {
      const ids = selectedLive().filter(p => p.s.id === s.id).map(p => p.w.id);
      if (ids.length) command({ action: 'assign', town: s.id, workers: ids, spot: spot.id });
    }
    say(`Harvest order: ${townName(spot.kind)}`);
  }
  function orderSelected(kind,position={}) {
    for(const s of towns()) {
      const ids=selectedLive().filter(p=>p.s.id===s.id).map(p=>p.w.id);
      if(ids.length)command({action:'workerOrder',town:s.id,workers:ids,kind,...position});
    }
    say(kind==='hold'?'Workers: stand here':kind==='return'?'Return carried resources':kind==='drop'?'Carried resources dropped':'Worker move order sent');
  }
  function requestTraining(id) {cancel();pendingPlan={tool:'worker training',request:{action:'train',town:id,count:1}};}
  function requestDrop() {
    cancel();pendingPlan={drop:towns().map(s=>({town:s.id,workers:(s.workers || []).filter(w=>selected.includes(w.id) && w.carrying>0).map(w=>w.id)})).filter(p=>p.workers.length)};
  }
  // Tim 2026-11-05: the town hall card can also upgrade the hall (same upgradeHall command as the town panel)
  function hallUpgradeButton(s) {
    const next = nextTier(s, data);
    if (s.tierUpgrade) return `<div class="hint">Upgrading to ${esc(next?.name || '')}… ${Math.max(0, s.tierUpgrade.left)}s</div>`;
    if (!next?.upgrade) return '';
    const chk = upgradeCheck(s, data), cost = Object.entries(next.upgrade.cost).map(([r, v]) => `${v} ${r}`).join(', ') + `, ${next.upgrade.pop} people`;
    return `<button data-upgrade="${esc(s.id)}"${chk.ok ? '' : ' class="no"'} title="${esc(`Upgrade the town hall to ${next.name}: ${cost}.${chk.ok ? '' : '\nNot yet: ' + chk.reason}`)}">Upgrade to ${esc(next.name)}</button>`;
  }
  const trainingTip = s => resourceRequirements(s,{ryo:data.workers.cost,...(data.workers.goodsCost?{goods:data.workers.goodsCost}:{})},data.workers.personCost)
    + `\nTrains a selectable worker for harvesting and ground clearing.\nRequires a finished town hall. Training: ${data.workers.trainTicks / 20} seconds. Keep ${data.opening?.reservePeople || 0} townsperson for food/building.\nTechnology: none.\nEnables manual move, stop, group and resource orders.`;
  function showInspection() {
    if(!inspect && selected.length===1 && outdoors() && !blocked()) {
      const p=selectedLive()[0];if(!p){card.hidden=true;return;}
      const d=workerDetails(p.w,spotIndex),html=`<button data-close aria-label="Close inspection">×</button><b>Worker ${esc(p.w.id)}</b>`
        +`<div>${d.harvesting?`Harvesting ${esc(d.resource)} · ${d.left}s left · load progress ${d.gathered.toFixed(2)}/${p.w.trip.load}`:d.cargo?`Carrying ${d.cargo} ${esc(d.resource)}`:esc(p.w.status || 'Ready for orders')}</div>`
        +(d.harvesting?`<progress value="${1-d.progress}" max="1"></progress>`:'')
        +(d.cargo?'<button data-return>Return resources</button><button data-drop>Drop resources…</button>':'');
      if(html!==inspectionHtml && !inspectionPressed){card.innerHTML=html;inspectionHtml=html;}card.hidden=false;return;
    }
    if (!inspect || !outdoors() || blocked()) { card.hidden = true; return; }
    let info, trainTown;
    if (inspect.spot) {
      const spot = spotIndex.get(inspect.spot);
      if (!spot || !known(spot.x, spot.z)) { card.hidden = true; return; }
      const reach = spot.deposit ? richReach(spot, reachAnchors(spot.kind)) : null;
      info = spotInfo(spot, game.state.frontier?.spots?.[spot.id], reach?.text);
      const campType = (data.workers?.gatherBuildings || []).find(t => data.workers?.campTakes?.[t]?.includes(data.workers?.resources?.[spot.kind]));
      if (reach && !reach.ok && reach.town && campType) info.camp = { town: reach.town, type: campType };
      const assigned = towns().flatMap(s => (s.workers || []).filter(w => w.spot === spot.id || w.nextSpot === spot.id).map(w => `${w.id} (${s.name})`));
      info.lines.push(`Amount per harvest: ${spotYield(spot, game.state.frontier?.spots?.[spot.id], spotRules.stages)}`,
        `Your workers: ${assigned.length ? assigned.join(', ') : 'none'}`);
      info.work = workRow(spot, assigned.length);
    } else {
      trainTown = towns().find(s => s.id === inspect.town);
      info = townCellTip(trainTown, inspect.cell, data);
    }
    if (!info) { card.hidden = true; return; }
    const html = `<button data-close aria-label="Close inspection">×</button><b>${esc(info.title)}</b>`
      + info.lines.map(l => `<div>${esc(l)}</div>`).join('')
      + (info.work || '')
      + (info.camp && info.camp.id ? campCardHTML(info.camp, trainTown) : '')
      + (info.camp && !info.camp.id ? `<button data-camp="${esc(info.camp.town)}" data-camp-type="${esc(info.camp.type)}" title="Open this town's build tools with a work camp selected. Workers reach spots within ${data.workers?.campReach ?? 0} of a built work camp of the same kind.">Place camp here</button>` : '')
      + (info.stable ? `<button data-stable="${esc(trainTown.id)}" title="Buy horses, rickshaws and omnibuses here">Open stable</button>` : '')
      + (info.hall ? `<button data-build="${esc(trainTown.id)}" title="Open this town's construction and zoning tools. No cost or technology requirement.">Build</button><button data-train="${esc(trainTown.id)}" title="${esc(trainingTip(trainTown))}">Train worker · ${data.workers.cost} ryo${data.workers.goodsCost ? `, ${data.workers.goodsCost} goods` : ''}, ${data.workers.personCost} person</button><div data-worker-training></div>` + hallUpgradeButton(trainTown) : '');
    // Compare source strings, not browser-normalized innerHTML (data-close becomes data-close="").
    if (inspectionHtml !== html && !inspectionPressed) { const open = card.querySelector?.('details')?.open; card.innerHTML = html; inspectionHtml = html; if (open) { const d = card.querySelector?.('details'); if (d) d.open = true; } }
    const training=card.querySelector?.('[data-worker-training]');
    if(training && info.hall)training.innerHTML=workerTrainingHTML(trainTown,game.state.tick,data);
    card.hidden = false;
  }
  card.addEventListener('click', e => {
    inspectionPressed = false;
    const b = e.target.closest('button');
    if(b?.hasAttribute('data-return'))orderSelected('return');
    if(b?.hasAttribute('data-drop'))requestDrop();
    if (b?.dataset.train) requestTraining(b.dataset.train);
    if (b?.dataset.upgrade) command({ action: 'upgradeHall', settlement: b.dataset.upgrade });
    if (b?.dataset.buyCart) { command({ action: 'buyCart', town: b.dataset.cartTown, building: b.dataset.buyCart }); return; }
    if (b?.dataset.camp) { town = b.dataset.camp; opened = true; onBuild(town); inspect = null; card.hidden = true; cancel(); tool = b.dataset.campType; return; }
    if (b?.dataset.stable) { onStable(b.dataset.stable); inspect = null; card.hidden = true; return; }
    if (b?.dataset.build) { town = b.dataset.build; opened = true; onBuild(town); inspect = null; card.hidden = true; }
    if (b?.hasAttribute('data-close')) { inspect = null; selected=[]; card.hidden = true; }
  });
  card.addEventListener('mousedown', e => { inspectionPressed = true; e.stopPropagation(); });
  review.addEventListener('mousedown', e => { reviewPressed = true; e.stopPropagation(); });
  // typed worker count (Tim 2026-11-09: number settings are typeable boxes)
  review.addEventListener('keydown', e => { if (e.target.closest?.('input')) { e.stopPropagation(); if (e.code === 'Enter' || e.code === 'NumpadEnter') e.target.blur(); } });
  review.addEventListener('change', e => {
    if (!e.target.hasAttribute?.('data-training-input') || !pendingPlan?.request) return;
    pendingPlan.request.count = Math.max(1, Math.round(Number(e.target.value)) || 1); reviewHtml = '';
  });
  review.addEventListener('click', e => {
    reviewPressed = false;
    const b = e.target.closest('button');
    if (!b || !pendingPlan) return;
    if(pendingPlan.drop) {
      if(b.hasAttribute('data-confirm'))for(const plan of pendingPlan.drop)command({action:'workerOrder',town:plan.town,workers:plan.workers,kind:'drop',confirm:true});
      pendingPlan=null;review.hidden=true;return;
    }
    if(b.dataset?.trainingCount) {pendingPlan.request.count=Math.max(1,pendingPlan.request.count+Number(b.dataset.trainingCount));return;}
    if (b.hasAttribute('data-confirm')) {
      const s = towns().find(s => s.id === pendingPlan.request.town);
      const result = s && (pendingPlan.request.action==='train'?workerTrainingPreview(s,pendingPlan.request.count,data):previewBuild(s,pendingPlan.request));
      if (!result?.ok || !affordable(s,result.cost)) { say(result?.reason || 'Resources changed; review the requirements'); return; }
      command(pendingPlan.request); say(`${townName(pendingPlan.tool)}: ordered`);
    }
    pendingPlan = null; review.hidden = true;
  });
  addEventListener('mouseup', () => { inspectionPressed = false; reviewPressed = false; });
  addEventListener('keydown', e => {
    // R turns a station while placing it (Tim 2026-11-07); otherwise R stays the hero's ability
    if(e.code==='KeyR' && tool && !pendingPlan && shapeOf(data.buildings[tool]) && outdoors() && !blocked() && !e.target?.closest?.('input,select,textarea')) {
      rot=(rot+1)%4;lastPreview='';consume(e);return;
    }
    if(e.code==='KeyZ' && selected.length && outdoors() && !blocked() && !e.target?.closest?.('input,select,textarea')) {
      orderSelected('hold');consume(e);return;
    }
    if (e.code !== 'Escape' || e.target?.closest?.('input, select, textarea')) return;
    const active = outdoors() && !blocked() && (!!tool || !!drag || !!pendingPlan);
    cancel(); selected = []; inspect = null; card.hidden = true;
    // Tim 2026-11-10: Esc with no brush in hand leaves build mode and the town panel comes back
    if (!active && opened && outdoors() && !blocked()) { close(); consume(e); return; }
    // First Escape cancels a brush; a second follows the normal close-menu shortcut.
    if (active) consume(e);
  }, { capture: true });
  addEventListener('blur', cancel);
  addEventListener('mousedown', e => {
    if (e.button === 0 && !e.target?.closest?.('#towninspect')) { inspect = null; card.hidden = true; }
    if (!canvasEvent(e)) return;
    if (e.button === 0) { pendingPlan = null; review.hidden = true; }
    if (e.button === 2 && tool) { cancel(); consume(e); return; }
    const spot = e.button === 2 && selectedLive().length ? spotAt(e.clientX, e.clientY) : null;
    if (spot) { assign(spot); consume(e); return; }
    if(e.button===2 && selectedLive().length) {
      const point=view.screenToGround(e.clientX,e.clientY);
      if(point)orderSelected('move',point);
      consume(e);return;
    }
    if (e.button !== 0) return;
    const cell = cellAt(e.clientX, e.clientY);
    const workerHit = !tool && workers().some(p => bodyDistance(view, p.e, e.clientX, e.clientY) < 22);
    drag = { x: e.clientX, y: e.clientY, first: cell, build: opened && !!tool && !workerHit };
    if (drag.build) { consume(e); return; }
    if (workerHit) consume(e);
  }, { capture: true });
  addEventListener('mousemove', e => {
    mouse = canvasEvent(e) ? { x: e.clientX, y: e.clientY } : null;
  });
  addEventListener('mouseup', e => {
    if (!drag || e.button !== 0) return;
    const d = drag; drag = null;
    if (!canvasEvent(e)) { crewInput.cancelPointer(); return; }
    if (d.build) {
      const s = current(), last = cellAt(e.clientX, e.clientY);
      if (s && d.first >= 0 && last >= 0) {
        const request = buildRequest(s, tool, d.first, last, data, rot), result = previewBuild(s, request);
        // erasing a station with railway lines (Tim 2026-11-07): a second erase within 6 s confirms tearing them up
        const lines = request.action === 'remove' && result.ok ? stationLines(s, request.cells) : 0;
        if (lines) {
          const k = `${s.id}:${request.cells.join(',')}`;
          if (eraseConfirm?.k !== k || Date.now() > eraseConfirm.until) {
            eraseConfirm = { k, until: Date.now() + 6000 };
            say(`This station has ${lines === 1 ? 'a railway line' : `${lines} railway lines`}: erase it again to tear ${lines === 1 ? 'it' : 'them'} up (lay new ones from your next station)`);
            crewInput.cancelPointer(); consume(e); return;
          }
          eraseConfirm = null; request.confirmLines = true;
        }
        if (data.buildUI?.confirmDrag) { pendingPlan = { request, tool }; }
        else if (result.ok) command(request);
        say(result.ok ? data.buildUI?.confirmDrag ? 'Review requirements, then Confirm or Cancel' : `${townName(tool)}: ordered${result.warning ? ' · ' + result.warning : ''}` : result.reason);
      } else say('Outside town grid');
      crewInput.cancelPointer(); consume(e); return;
    }
    const click = Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6;
    const picked = workers().filter(p => {
      if (click) return bodyDistance(view, p.e, e.clientX, e.clientY) < 22;
      const u = view.unitToScreen(p.e.x, p.e.z);
      return u.x >= Math.min(d.x, e.clientX) && u.x <= Math.max(d.x, e.clientX) && u.y >= Math.min(d.y, e.clientY) && u.y <= Math.max(d.y, e.clientY);
    });
    if (picked.length) {
      const ids = click ? [picked.sort((a, b) => bodyDistance(view, a.e, e.clientX, e.clientY) - bodyDistance(view, b.e, e.clientX, e.clientY))[0].w.id] : picked.map(p => p.w.id);
      select(click ? selected.includes(ids[0]) ? selected.filter(id => id !== ids[0]) : [...selected, ...ids] : ids);
      crewInput.cancelPointer(); consume(e); return;
    }
    if (!click) { selected = []; return; }
    const spot = spotAt(e.clientX, e.clientY);
    const hit = townAt(e.clientX,e.clientY);
    if (spot || hit) {
      inspect = spot ? { spot: spot.id } : { town: hit.s.id, cell: hit.cell };
      showInspection(); crewInput.cancelPointer(); consume(e);
    } else { selected = []; inspect = null; card.hidden = true; }
  }, { capture: true });

  function polygon(ctx, s, i, color, status = null) {
    const [x, z] = cellToWorld(s, i), r = s.grid.cell / 2;
    const points = [[x-r,z-r], [x+r,z-r], [x+r,z+r], [x-r,z+r]].map(([a,b]) => view.unitToScreen(a,b,0.08));
    if (points.every(p => p.x < 0) || points.every(p => p.x > innerWidth) || points.every(p => p.y < 0) || points.every(p => p.y > innerHeight)) return;
    const round=data.buildUI?.cornerRoundness || 0.08;
    ctx.beginPath();
    points.forEach((p,j)=>{
      const prev=points[(j+3)%4],next=points[(j+1)%4];
      const incoming={x:p.x+(prev.x-p.x)*round,y:p.y+(prev.y-p.y)*round};
      const outgoing={x:p.x+(next.x-p.x)*round,y:p.y+(next.y-p.y)*round};
      if(j)ctx.lineTo(incoming.x,incoming.y);else ctx.moveTo(incoming.x,incoming.y);
      ctx.quadraticCurveTo(p.x,p.y,outgoing.x,outgoing.y);
    });ctx.closePath();
    ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = status || 'rgba(245,237,208,.45)'; ctx.lineWidth = status ? 2 : 1; ctx.stroke();
  }
  function visibleCells(s) {
    const corners = [[0,0],[innerWidth,0],[innerWidth,innerHeight],[0,innerHeight]].map(([x,y]) => view.screenToGround(x,y)).filter(Boolean);
    if (!corners.length) return [];
    const { n,cell } = s.grid, mid = (n-1)/2;
    const cols = corners.map(p => Math.round((p.x-s.x)/cell)+mid), rows = corners.map(p => Math.round((p.z-s.z)/cell)+mid);
    const out = [];
    for (let r = Math.max(0,Math.min(...rows)-1); r <= Math.min(n-1,Math.max(...rows)+1); r++)
      for (let c = Math.max(0,Math.min(...cols)-1); c <= Math.min(n-1,Math.max(...cols)+1); c++) out.push(r*n+c);
    return out;
  }
  let roadZones = null;   // road-link query for the overlay (cached per road layout)
  function update() {
    for (const r of game.state.frontier?.receipts || []) if (r.seq > seen) {
      seen = r.seq;
      if (!r.ok && ['place', 'remove', 'zone', 'assign', 'train', 'workerOrder'].includes(r.action)) say(`Not possible: ${r.reason}`);
    }
    selected = selectedLive().map(p => p.w.id);
    if (crewInput.selected().length) selected = [];
    const s = current(), show = outdoors() && !blocked();
    if (!show && drag) { cancel(); }
    overlay.hidden = !show || (!opened && !selected.length && !drag && !pendingPlan && !workers().length);
    showInspection();
    review.hidden = !show || !pendingPlan;
    if(show && pendingPlan?.drop) {
      const html='<b>Drop carried resources?</b><div>All carried cargo on these workers will be permanently lost. You can then reassign them without returning.</div><button data-confirm>Drop resources permanently</button><button data-cancel>Cancel</button>';
      if(html!==reviewHtml && !reviewPressed){review.innerHTML=html;reviewHtml=html;}
    } else if (show && pendingPlan) {
      const plannedTown = towns().find(t => t.id === pendingPlan.request.town);
      if (!plannedTown) { pendingPlan = null; review.hidden = true; }
      else {
        const isTraining=pendingPlan.request.action==='train';
        const result = isTraining?workerTrainingPreview(plannedTown,pendingPlan.request.count,data):previewBuild(plannedTown,pendingPlan.request), enough = affordable(plannedTown,result.cost);
        const requirements=pendingPlan.request.action==='remove' ? '100% refund: '+(Object.entries(result.refund || {}).map(([r,n])=>`${n} ${r}`).join(', ') || 'no paid resources') : resourceRequirements(plannedTown,result.cost,isTraining?result.people:0);
        const quantity=isTraining?`<div><button data-training-count="-1">−</button> <input type="number" class="numbox" min="1" data-training-input value="${pendingPlan.request.count}"> workers <button data-training-count="1">+</button></div><div>Keep ${data.opening?.reservePeople || 0} townsperson for food/building. Training time: ${pendingPlan.request.count*data.workers.trainTicks/20}s, plus existing queue.</div>`:'';
        const html = `<b>${esc(townName(pendingPlan.tool))}${isTraining?'':' · '+(result.cells?.length || pendingPlan.request.cells.length)+' cell(s)'}</b>${quantity}<div class="requirements">${esc(requirements)}</div>`
          + `<div>${esc(result.reason || result.warning || '')}</div><button data-confirm ${result.ok && enough ? '' : 'disabled'}>Confirm</button><button data-cancel>Cancel</button>`;
        if (html !== reviewHtml && !reviewPressed && !(document.activeElement?.hasAttribute?.('data-training-input') && review.contains(document.activeElement))) { review.innerHTML = html; reviewHtml = html; }
      }
    }
    if (!show) { hint.hidden = true; return; }
    if (!s && opened) close();
    if ((!tool || !mouse) && Date.now() > messageUntil) hint.hidden = true;
    if (overlay.hidden) return;
    if (overlay.width !== innerWidth || overlay.height !== innerHeight) { overlay.width = innerWidth; overlay.height = innerHeight; }
    const ctx = overlay.getContext('2d'); ctx.clearRect(0,0,overlay.width,overlay.height);
    if (opened && s) {
      const visible = visibleCells(s), definitions = Object.fromEntries(Object.entries(data.zones.kinds).map(([kind,k]) => [k.char,kind]));
      for (const i of visible) {
        if (s.grid.ground[i] !== 'x') polygon(ctx,s,i,'rgba(235,225,200,.025)');
        const entry = definitions[s.grid.zone[i]];
        if (!entry) continue;
        const z = s.zones?.[entry], color = data.buildUI?.zoneColors?.[entry] || ({h:'#5aa0f0',f:'#64c864',k:'#f0923c'}[s.grid.zone[i]]);
        let status = z?.abandoned ? '#ff635a' : (z?.health ?? 1) < data.zones.healthyAt ? '#ffbe48' : null;
        // B7 housing overlay: white = no free beds, green = room for more, violet = waiting for goods to level up
        const kdef = data.zones.kinds[entry];
        if (!status && kdef.housing) {
          const st = Number(s.grid.stage[i]) || 0, needsGoods = st > 0 && st < kdef.stages.length && (data.upkeep?.goodsByStage?.[st] || 0) > 0 && (s.goodsShort || !(s.stock.goods > 0));
          status = needsGoods ? '#c58cff' : residents(s) >= s.housing ? '#f4f0e0' : '#7be08a';
        }
        polygon(ctx,s,i,color + '30',status || color);
      }
      // Tim 2026-11-05: a warning icon over each group of road/gate cells not linked to the town hall
      if (data.zones.roadsConnect) {
        const linked = (roadZones ||= createZones({ data })).linkedRoads(s), n = s.grid.n, use = s.grid.use, seen = new Uint8Array(use.length), road = j => use[j] === 'r' || use[j] === 'g';
        for (let i0 = 0; i0 < use.length; i0++) {
          if (!road(i0) || linked[i0] || seen[i0]) continue;
          const group = [i0], stack = [i0]; seen[i0] = 1;
          while (stack.length) { const j = stack.pop(), c = j % n, r = (j - c) / n;
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc, k = rr * n + cc;
              if (rr >= 0 && cc >= 0 && rr < n && cc < n && !seen[k] && road(k) && !linked[k]) { seen[k] = 1; stack.push(k); group.push(k); } } }
          for (const j of group) polygon(ctx, s, j, 'rgba(255,150,60,.28)', '#ff9a3c');
          // the icon sits over the group's middle cell
          const mid = group.reduce((m, j) => { const [x, z] = cellToWorld(s, j); return [m[0] + x / group.length, m[1] + z / group.length]; }, [0, 0]);
          const at = group.map(j => [j, ...cellToWorld(s, j)]).sort((a, b) => Math.hypot(a[1] - mid[0], a[2] - mid[1]) - Math.hypot(b[1] - mid[0], b[2] - mid[1]))[0];
          const u = view.unitToScreen(at[1], at[2], s.grid.cell * 0.15);
          if (u.x < -20 || u.y < -20 || u.x > innerWidth + 20 || u.y > innerHeight + 20) continue;
          ctx.save(); ctx.fillStyle = '#ffb347'; ctx.strokeStyle = 'rgba(40,24,10,.9)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(u.x, u.y - 13); ctx.lineTo(u.x + 12, u.y + 8); ctx.lineTo(u.x - 12, u.y + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#2a1a0a'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', u.x, u.y + 6); ctx.restore();
          // hover note (Tim 2026-11-05): over the icon or any cell of the unlinked road
          if (mouse && (Math.hypot(mouse.x - u.x, mouse.y - u.y) < 18 || group.includes(cellAt(mouse.x, mouse.y, s)))) {
            const lines = ['Road not connected', 'Roads must connect through other roads or gates', 'to the town hall. Zones near this road cannot grow.'];
            ctx.save(); ctx.font = '13px sans-serif';
            const w = Math.max(...lines.map(l => ctx.measureText?.(l)?.width ?? l.length * 7)) + 20, h = lines.length * 17 + 12;
            const x = Math.min(innerWidth - w - 8, mouse.x + 16), y = Math.max(8, mouse.y - h - 12);
            ctx.fillStyle = 'rgba(18,16,14,.94)'; ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 6) : ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
            ctx.textAlign = 'left';
            lines.forEach((l, k) => { ctx.fillStyle = k ? '#efe3c4' : '#ffb347'; ctx.font = k ? '13px sans-serif' : 'bold 13px sans-serif'; ctx.fillText(l, x + 10, y + 20 + k * 17); });
            ctx.restore();
          }
        }
      }
      // B3: the town hall tier's build ring (everything but roads and work camps goes inside it)
      { const R = ringRadius(s,data), pts = [];
        for (let k = 0; k <= 72; k++) { const a = k / 72 * Math.PI * 2; pts.push(view.unitToScreen(s.x + Math.cos(a) * R, s.z + Math.sin(a) * R, 0.08)); }
        ctx.save(); ctx.setLineDash([8,6]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(233,194,122,.55)';
        ctx.beginPath(); pts.forEach((p,k) => k ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.stroke(); ctx.restore(); }
      if (pendingPlan?.request && pendingPlan.request.action!=='train' || !pendingPlan && tool && mouse) {
        const last = mouse ? cellAt(mouse.x,mouse.y) : -1, first = drag?.build ? drag.first : last;
        const request = pendingPlan?.request || buildRequest(s,tool,first,last,data,rot), key = JSON.stringify([game.state.tick,s.id,request]);
        if (key !== lastPreview) { lastPreview = key; preview = previewBuild(s,request); }
        const cells = new Set(preview.cells?.length ? preview.cells : request.cells);
        const zoneColor = data.buildUI?.zoneColors?.[pendingPlan?.tool || tool];
        // a station (Tim 2026-11-07): the railway slot, where the track leaves, shows blue
        const parts = Number.isInteger(request.rot) && preview.cells?.length === 6 ? stationParts(s, { cells: preview.cells, rot: request.rot }) : null;
        const slot = parts ? new Set(parts.slotCells) : null;
        for (const i of visible) if (cells.has(i)) {
          if(preview.reason==='occupied' && s.grid.zone[i]!=='.')continue;
          polygon(ctx,s,i,preview.ok ? slot?.has(i) ? 'rgba(90,170,245,.5)' : zoneColor ? zoneColor + '66' : 'rgba(80,235,120,.4)' : 'rgba(245,70,60,.4)');
        }
        // the track's mouth (Tim 2026-11-07): an arrow out of the railway slot, the way the track leaves, for every turn
        if (parts) { const c = s.grid.cell, [dx, dz] = parts.dir, [sx, sz] = parts.slot;
          const a = view.unitToScreen(s.x + sx, s.z + sz, 0.1), b = view.unitToScreen(s.x + sx + dx * c * 1.6, s.z + sz + dz * c * 1.6, 0.1);
          const ang = Math.atan2(b.y - a.y, b.x - a.x), head = Math.max(9, Math.min(18, Math.hypot(b.x - a.x, b.y - a.y) * 0.35));
          ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (const [w, col] of [[7, 'rgba(20,24,30,.75)'], [3.5, preview.ok ? '#8fd0ff' : '#ffb0a0']]) {
            ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.moveTo(b.x - Math.cos(ang - 0.5) * head, b.y - Math.sin(ang - 0.5) * head); ctx.lineTo(b.x, b.y);
            ctx.lineTo(b.x - Math.cos(ang + 0.5) * head, b.y - Math.sin(ang + 0.5) * head); ctx.stroke();
          }
          ctx.restore(); }
        if (Date.now() > messageUntil) {
          const zk = data.zones.kinds[pendingPlan?.tool || tool], cap = zk ? cellCap(s,pendingPlan?.tool || tool,data) : Infinity;
          const count = Number.isFinite(cap) ? ` · ${zoneCells(s,zk.char)} / ${cap} cells` : '';   // B3: tier cell cap
          const turn = Number.isInteger(request.rot) ? ` · R turns it: the track leaves to the ${['lower right', 'lower left', 'upper left', 'upper right'][request.rot]} (arrow)` : '';
          hint.textContent = (preview.ok ? `${townName(pendingPlan?.tool || tool)} · ${resourceRequirements(s,preview.cost)}${preview.warning ? ' · ' + preview.warning : ''}` : `${preview.reason} · ${resourceRequirements(s,preview.cost)}`) + count + turn;
          hint.hidden = false; hint.dataset.ok = String(preview.ok);
        }
      }
    }
    const position = mouse || { x: 420, y: innerHeight - 100 };
    hint.style.left = `${Math.max(8,Math.min(innerWidth - 280,position.x + 16))}px`; hint.style.top = `${Math.min(innerHeight - 65,position.y + 20)}px`;
    for (const p of workers()) {
      const u = view.unitToScreen(p.e.x,p.e.z,0.1),d=workerDetails(p.w,spotIndex);
      if(u.x<0 || u.y<0 || u.x>innerWidth || u.y>innerHeight)continue;
      const chosen=selected.includes(p.w.id);
      if(chosen){ctx.beginPath(); ctx.ellipse(u.x,u.y,15,7,0,0,Math.PI*2); ctx.strokeStyle = '#ffe08b'; ctx.lineWidth = 2; ctx.stroke();}
      if(d.cargo) {
        // a little load icon over the worker (Tim 2026-11-08: logs, stone block, fish in a net, forage basket, rice sack)
        // with the amount beside it; the icons are drawn once and only copied here
        const icon=cargoIcon(spotIndex.get(p.w.spot)?.kind || d.resource),{w:iw,h:ih}=CARGO_ICON_SIZE;
        ctx.drawImage(icon,u.x-iw/2,u.y-30-ih/2,iw,ih);
        ctx.font='bold 11px sans-serif';ctx.lineWidth=3;ctx.strokeStyle='#1a1208';ctx.strokeText(String(d.cargo),u.x+iw/2+1,u.y-26);ctx.fillStyle='#fff0c8';ctx.fillText(String(d.cargo),u.x+iw/2+1,u.y-26);
      }
      if(game.state.tick-(p.e.harvestedAt ?? -Infinity)<20){ctx.fillStyle='#e9dc96';ctx.font='12px sans-serif';ctx.fillText(`+${d.cargo} ${d.resource}`,u.x+10,u.y-40-(game.state.tick-p.e.harvestedAt)/2);}
      if(chosen && d.harvesting) {
        ctx.fillStyle='#222';ctx.fillRect(u.x-30,u.y-43,60,5);ctx.fillStyle='#e4bb50';ctx.fillRect(u.x-30,u.y-43,60*(1-d.progress),5);
        ctx.fillStyle='#fff';ctx.font='12px sans-serif';ctx.fillText(`${d.left}s · ${d.gathered.toFixed(2)}/${p.w.trip.load}`,u.x-30,u.y-48);
      }
    }
    if (drag && !drag.build) { ctx.strokeStyle='#ffe08b'; ctx.strokeRect(drag.x,drag.y,mouse?.x-drag.x || 0,mouse?.y-drag.y || 0); }
  }
  function html(s, mini = false) {
    if (town !== s.id) { close(); town = s.id; }
    if(workersOpen)return `<div class="townbuild"><button data-act="build-workers">Back to town</button><h3>${esc(s.name)}</h3>${workerPanelHTML(s,{overworked:overworkedSpots(s),selected,index:spotIndex,data,page:workerPage,known,tab:workerTab,logPage:workerLogPage})}</div>`;
    // Tim 2026-11-08: a capped building shows used / allowed, one the tier doesn't allow yet is greyed with the tier that does
    const capOf = id => { const g = placedGroup(id, data), max = tierOf(s, data)?.placed?.[g]; if (max === undefined) return null;
      const used = placedCount(s, id, data), next = (data.tiers?.list || []).find(t => (t.placed?.[g] ?? 0) > 0);
      return { max, used, locked: max === 0, unlock: next?.name || '' }; };
    const button = (id, label) => {
      const color = data.buildUI?.zoneColors?.[id],text=buildTooltip(id,s,data,resourceRequirements), cap = capOf(id);
      const tag = !cap ? '' : cap.locked ? `<small>${esc(cap.unlock)}</small>` : `<small>${cap.used}/${cap.max}</small>`;
      const cls = [tool === id ? 'on' : '', cap?.locked ? 'locked' : '', cap && !cap.locked && cap.used >= cap.max ? 'full' : '', id === 'eraser' ? 'eraser' : ''].filter(Boolean).join(' ');
      return `<button data-act="build-tool" data-id="${esc(id)}" data-tip="${esc(text)}" ${color && !cap?.locked ? `style="border-color:${color};color:${color}"` : ''} class="${cls}" aria-pressed="${tool === id}">${esc(label)}${tag}</button>`;
    };
    // the build bar in groups, one row each, the eraser apart at the right of the first row
    const camps = data.tiers?.camps || ['lumber_camp', 'food_camp', 'quarry'];
    const others = Object.entries(data.buildings).filter(([k, v]) => v.size && !data.zones.fromBuilding[k] && !camps.includes(k)).map(([k]) => k);
    const group = (name, ids, extra = '') => `<div class="bgroup"><span class="blab">${name}</span><div class="btns">${ids.map(t => button(t, camps.includes(t) ? townName(t).replace(/ camp$/i, '') : townName(t))).join('')}${extra}</div></div>`;
    const steps = [[s.grid.zone.includes('h'),'Housing'],[s.grid.zone.includes('f'),'Farms'],[/[rg]/.test(s.grid.use),'Roads'],[!!s.workers?.length,'Train worker'],[(s.workers || []).some(w=>spotIndex.get(w.spot)?.kind==='timber'),'Assign timber']];
    const guide = steps.map(([done,label])=>`${done ? '✓' : '○'} ${label}`).join(' → ');
    // Tim 2026-11-10: in build mode only this small box shows (top left); long text lives in the hovers
    if (mini) return `<div class="bmhead"><b>Build · ${esc(s.name)}</b><button data-act="build-toggle" class="bmexit" data-tip="Leave build mode and go back to the town panel (Esc).">Exit build</button></div>`
      + `<div class="buildtools">` + group('Lay out', ['road', 'wall', 'gate'], `<span class="gap"></span>${button('eraser', townName('eraser'))}`)
      + group('Zones', ['housing', 'farm', 'work']) + group('Camps', camps.filter(k => data.buildings[k]?.size)) + group('Buildings', others)
      + `</div><div class="hint" data-tip="Drag, release, review requirements, then Confirm or Cancel. Right click or Esc cancels.\nZone previews match their buttons; amber border = short, red border = abandoned.">Drag on the map, then Confirm. Right click cancels.</div>`;
    return `<div class="townbuild"><button data-act="build-toggle" class="buildbig" data-tip="Open the build bar: roads, walls, zones, camps and buildings. Other menus hide while you build.">Build bar</button>`
      + `<div class="row"><button data-act="build-train" data-tip="${esc(trainingTip(s))}">Train worker · ${data.workers.cost} ryo${data.workers.goodsCost ? `, ${data.workers.goodsCost} goods` : ''}</button><span>${s.workers?.length || 0} workers · ${s.workerTraining?.length || 0} training</span></div>`
      + workerTrainingHTML(s,game.state.tick,data)
      + `<div class="hint">${guide}<br>Keep ${data.opening?.reservePeople || 0} townsperson for food/building. The hall is a drop-off; a lumber camp is optional.</div>`
      + (selected.length ? `<div>${selected.length} selected · right-click a spot to harvest</div>` : '') + '</div>';
  }
  return { update, html, miniHtml: s => html(s, true), isOpen: () => opened, close, cancel, isBuilding: () => opened && !!tool, isRosterOpen: () => workersOpen,
    // two or more workers picked: one small card each in the selection panel (Tim 2026-11-08); a click picks just that one
    selectedWorkers:()=>selected.length>1?selectedLive().map(p=>({...workerPresentation(p.w,p.s,data,game.state.entities,game.state.workerAt),id:`worker:${p.w.id}`,wid:p.w.id,worker:true,status:workerStatus(p.w,spotIndex)})):[],
    pickWorker:wid=>{const p=selectedLive().find(p=>String(p.w.id)===String(wid));if(p)select([p.w.id]);},
    workerTarget:()=>{const p=selected.length===1 && selectedLive()[0];return p?{...workerPresentation(p.w,p.s,data,game.state.entities,game.state.workerAt),workerDetail:workerDetails(p.w,spotIndex)}:null;},
    doubleClick(ds,s) {
      if(ds.act==='build-worker-select'){focusWorkers([ds.id]);return true;}
      if(ds.act==='build-worker-group'){focusWorkers((s.workers || []).filter(w=>w.group===Number(ds.id)).map(w=>w.id));return true;}
      return false;
    },
    click(ds, s, e) {
      if (!ds.act.startsWith('build-')) return false;
      if(['build-worker-select','build-worker-group'].includes(ds.act)) {
        const key=ds.act+':'+ds.id,now=Date.now(),twice=rosterClick?.key===key && now-rosterClick.at< (data.buildUI?.doubleClickMs || 400);
        rosterClick={key,at:now};
        if(twice){focusWorkers(ds.act==='build-worker-select'?[ds.id]:(s.workers || []).filter(w=>w.group===Number(ds.id)).map(w=>w.id));return true;}
      }
      if (ds.act === 'build-toggle') { if (opened) close(); else { town = s.id; opened = true; } }
      if (ds.act === 'build-tool') { cancel(); tool = ds.id; }
      if (ds.act === 'build-train') requestTraining(s.id);
      if (ds.act === 'build-workers') {cancel();opened=false;workersOpen=!workersOpen;}
      if (ds.act === 'build-worker-select')select(selected.includes(ds.id)?selected.filter(id=>id!==ds.id):[...selected,ds.id]);
      if (ds.act === 'build-worker-all')select((s.workers || []).map(w=>w.id));
      if (ds.act === 'build-worker-job') {const ids=(s.workers || []).filter(w=>workerJob(w,spotIndex)===ds.id).map(w=>w.id);select(e?.ctrlKey || e?.shiftKey?[...new Set([...selected,...ids])]:ids);}
      if (ds.act === 'build-worker-group')select((s.workers || []).filter(w=>w.group===Number(ds.id)).map(w=>w.id));
      if (ds.act === 'build-worker-stop')orderSelected('hold');
      if (ds.act === 'build-worker-return')orderSelected('return');
      if (ds.act === 'build-worker-drop')requestDrop();
      if (ds.act === 'build-worker-page')workerPage=Number(ds.id);
      if (ds.act === 'build-worker-tab') {workerTab=['log','idle'].includes(ds.id)?ds.id:'roster';workerLogPage=0;}
      if (ds.act === 'build-worker-log-page')workerLogPage=Number(ds.id);
      if (ds.act === 'build-worker-spot') {const spot=spotIndex.get(ds.id);if(spot)view.jumpTo?.(spot.x,spot.z);}
      return true;
    },
    change(ds,value,s) {
      const ids=ds.act==='build-worker-assign'?[ds.id]:ds.act==='build-worker-assign-selected'?(s.workers || []).filter(w=>selected.includes(w.id)).map(w=>w.id):[];
      if(!ids.length || value==='')return false;
      command({action:'workerOrder',town:s.id,workers:ids,kind:'group',group:Number(value)});return true;
    }
  };
}
