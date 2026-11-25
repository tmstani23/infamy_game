// L3.8: local tools and selection. Rules are queried in sim modules; changes are commands only.
import { createPlacement } from './sim/frontier/placement.js';
import { createZones } from './sim/frontier/zones.js';
import { cellToWorld, worldToCell, ringRadius, hallArtCell } from './sim/frontier/town_grid.js';
import { bodyDistance } from './crew_input.js';
import { townCellTip, townName, siteBuilders } from './frontier_tips.js';
import { spotInfo } from './resource_spot_props.js';
import { spotYield, richReach, overwork, regrowChance, supportsWorkers } from './sim/resource_spots.js';
import { townPlots } from './town_props.js';
import { workerPanelHTML, workerJob, workerTask, workerStatus } from './worker_panel.js';
import { isRich } from './sim/resource_spots.js';
import { cargoIcon, CARGO_ICON_SIZE } from './cargo_icons.js';
import {workerDetails,workerPresentation,campSitesOf} from './worker_details.js';
import {watchCrewGroup} from './crew_watch.js';
import { buildTooltip } from './build_tooltips.js';
import { tierOf, placedGroup, placedCount } from './sim/frontier/tiers.js';
import { workerTrainingHTML,workerTrainingPreview } from './training_ui.js';
import { cellCap, zoneCells, nextTier, upgradeCheck } from './sim/frontier/tiers.js';
import { residents, workerCount } from './sim/frontier/people.js';
import { msArt, msConcept } from './menu_shell.js';
import { workerCap } from './sim/frontier/tiers.js';
import { hallUpgradeHTML } from './hall_upgrade.js';
import { shapeOf, stationParts } from './sim/frontier/station_layout.js';
import { sharedKeybinds } from './keybinds.js';
import { isMilitary, militaryFor, militaryNeeds, militaryCount, tierMax, townMilitaryTier, townTierFor } from './sim/frontier/town_military.js';
import { openMenu, placeBeside, unplace } from './card_beside.js';
import { tiredCamps } from './tired_camps.js';
import { campLoad, spotCounts } from './sim/frontier/camp_load.js';
const keybinds = sharedKeybinds();   // rebindable keys (Tim 2026-11-12): Turn a station, Workers hold

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
  const zoneTool = !!data.zones.kinds[tool] || (tool === 'military' && !!data.zones.military);   // 8d-5: the military zone is painted like a zone
  const building = !!data.buildings[tool]?.size && !zoneTool;
  return { town: s.id, action: tool === 'eraser' ? 'remove' : zoneTool ? 'zone' : 'place',
    ...(tool === 'eraser' ? {} : { kind: tool }), cells: building ? [last] : rectangleCells(s, first, last),
    ...(building && shapeOf(data.buildings[tool]) ? { rot } : {}) };
}

// The same dry-run functions the sim commands use, applied to the read-only snapshot.
// Erasing has no query entry point: run its real validation against an isolated copy.
export function buildPreview(s, request, data, {state,resourceIndex,worldData=null}={}) {
  const placement = createPlacement({ data, state, resourceIndex, worldData, construction: { cancel() {} } });
  const zones = createZones({ data,resourceIndex });
  const result = request.action === 'zone' ? zones.zone(s, { ...request, dryRun: true })
    : request.action === 'remove' ? placement.remove(s, {...request,dryRun:true}) : placement.check(s, request);
  if (result.ok && request.action === 'zone') {
    const reach = data.zones.kinds[request.kind]?.needs?.roadReach;
    if (reach && result.cells.some(i => !zones.roadNear(s, i, reach))) return { ...result, warning: 'Needs a road linked to the town hall within ' + reach + ' cells to grow' };
  }
  if (result.ok && request.action === 'place' && data.buildings[request.kind]) {
    const short = Object.entries(result.cost).some(([r, n]) => (s.stock[r] || 0) < n);
    if (short) return { ...result, warning: 'Queued; waiting for materials' };
  }
  return result;
}

export function createFrontierBuildUI({ game, view, heroId, data, spotIndex, spotRules, known, send, crewInput, onBuild = () => {}, onMode = () => {}, onStable = () => {}, blocked = () => false, menuAt = () => false }) {
  let pickedSig = '', town = null, opened = false, tool = null, drag = null, mouse = null, selected = [], inspect = null, rot = 0;   // rot: R turns a station
  let eraseConfirm = null;   // { k, until }: the station erase waiting for its second click
  // how many railway lines run from the station under these cells (0 if none or no station)
  const stationLines = (s, cells) => s.buildings.some(b => b.type === 'station' && (b.cells || [b.cell]).some(i => cells.includes(i)))
    ? Object.values(game.state.frontier?.rail?.links || {}).filter(l => l.owner === s.owner && (l.from === s.id || l.to === s.id)).length : 0;
  let inspectionHtml = '', inspectionPressed = false;
  let pendingPlan = null, reviewHtml = '', reviewPressed = false;
  let pointer = { x: 420, y: 300 };   // the last pointer spot anywhere: the confirm box opens next to it (Tim 2026-11-22)
  let workerPage = 0;
  let workerTab='roster',workerLogPage=0,workerSpotPage=0,workerFilter=null;   // workerFilter: the job coin showing only its workers (Tim 2026-11-12)
  let workersOpen = false;
  let rosterClick=null,toolClick=null;const builtTurn={};   // builtTurn: town|kind -> the last one shown (showBuilt)
  // Tim 2026-11-22 building finder: the next built building of this kind in this town (only this town), camera on it and its card open
  function showBuilt(s,kind) {
    const list=(s.buildings || []).filter(b=>b.type===kind && b.stage==='built');
    if(!list.length)return false;
    const k=s.id+'|'+kind,i=((builtTurn[k] ?? -1)+1)%list.length,b=list[i];builtTurn[k]=i;
    const cells=b.cells?.length ? b.cells : [b.cell],pts=Number.isFinite(b.x) ? [[b.x,b.z]] : cells.filter(Number.isFinite).map(c=>cellToWorld(s,c));
    if(!pts.length)return false;
    view.jumpTo?.(pts.reduce((a,p)=>a+p[0],0)/pts.length,pts.reduce((a,p)=>a+p[1],0)/pts.length);
    say(`${townName(kind)} ${i+1} of ${list.length}`);
    if(s.grid && Number.isFinite(cells[0])){inspect={town:s.id,cell:cells[0]};showInspection();}
    return true;
  }
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
  const previewBuild=(s,r)=>buildPreview(s,r,data,{state:game.state,resourceIndex:spotIndex,worldData:game.ships?.world});
  const workSites = () => [...towns(), ...campSitesOf(game.state.frontier, hero()?.owner)];   // towns plus own war camps (checkpoint 3)
  const workers = () => workSites().flatMap(s => (s.workers || []).map(w => ({ s, w, e: workerPresentation(w,s,data,game.state.entities,game.state.workerAt) })).filter(p => !p.e.dead && !p.e.downed));
  const selectedLive = () => workSites().flatMap(s => (s.workers || []).filter(w => selected.includes(w.id)).map(w => ({ s, w })));
  const canvasEvent = e => e.target?.closest?.('canvas#view') && outdoors() && !blocked();
  const consume = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  crewInput.onPick?.(() => { if (selected.length) { selected = []; if (inspect?.hover) inspect = null; } });   // one selection at a time: troops or workers
  // a unit under the pointer (troops, crew, enemies; not workers, they are this file's) wins over the building behind it (Tim 2026-11-19)
  const unitNear = (x, y) => Object.values(game.state.entities || {}).some(e => e.place === 'world' && !e.dead && !e.garrison && !e.hidden && !e.worker && e.type !== 'horse' && e.type !== 'civilian' && !e.stored && (() => { const u = view.unitToScreen(e.x, e.z, 1); return Math.hypot(u.x - x, u.y - y) < 26; })());
  // Workers row on a spot card (Tim 2026-11-06 22:23): how worked out the spot is now and about how many workers it
  // keeps at full speed. Live estimate: aim to keep at most `aim` of its value worked out (workers.overwork).
  function workRow(spot, n) {
    if (!n || !spotRules?.stages) return '';
    const { speed, best, over } = overwork(spot, game.state.frontier?.spots?.[spot.id], spotRules.stages, n, data.workers?.overwork, tripSecondsAt(spot));
    const cap = best ?? n, pct = Math.min(100, Math.round(100 * Math.min(n, cap) / Math.max(n, cap))), col = over ? '#d9a25a' : '#7fc27a';
    return `<div style="margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:12px"><span>Workers ${n}${best != null ? `, max ${best}` : ''}</span><span>${speed}% full</span></div>`
      + `<div style="height:8px;border-radius:4px;background:${over ? 'rgba(217,162,90,.35)' : 'rgba(0,0,0,.45)'};overflow:hidden;margin:3px 0"><div style="height:100%;width:${pct}%;background:#7fc27a"></div></div>`
      + `<div style="font-size:12px;color:${col}">${over ? `Tired: ${n - best} over the max, they add little` : best != null && n >= best ? 'At the max' : 'Room for more workers'}</div>`
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
      + row('Tired when', q ? 'more workers than its max' : `more than ${Math.round(aim * 100)}% of its value is worked out`)
      + `</details>`;
  }
  // average full-speed trip (walk out + back, at full harvest) of the workers on a spot, in seconds; null if none
  // drop = only trips to that building (the camp card: one carrying on to a far hall while the camp is full is not a camp trip)
  function tripSecondsAt(spot, drop = null) {
    const ws = towns().flatMap(t => t.workers || []).filter(w => w.spot === spot.id && w.trip && !w.trip.kind && (!drop || w.dropoff === drop));
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
  // Workers on the spots of a work camp (Tim 2026-11-22; sim/frontier/camp_load.js): the spots of its kind in reach that
  // have no nearer camp, the workers on them and the camp's max (each spot's fixed max, summed). Over that = Tired.
  function campWork(b, s) {
    const W = data.workers || {};
    if (!s?.grid || !Number.isInteger(b.cell)) return null;
    const load = campLoad(s, b, { R: W, index: spotIndex, stages: spotRules?.stages, count: spotCounts(towns()), known });
    return load && { n: load.n, cap: load.max, extra: load.extra, spots: load.spots.length, res: W.campTakes[b.type].join(' and '), reach: W.campReach ?? 0 };
  }
  // Move extras pressed (Tim 2026-11-22): the button reads Moving for a moment, so the press shows before the numbers change
  const movedAt = new Map(), moving = id => performance.now() - (movedAt.get(id) ?? -1e9) < 2500;
  function moveExtras(townId, id) { movedAt.set(id, performance.now()); command({ action: 'campExtras', town: townId, building: id }); }
  const campHead = t => `<div style="font:600 10px/12px system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#b9a77e;margin:10px 0 3px">${t}</div>`;
  function campWorkHTML(b, s) {
    const c = campWork(b, s); if (!c) return '';
    const most = Math.max(1, c.n, Math.ceil(c.cap * 1.5)), fill = Math.round(100 * Math.min(c.n, c.cap) / most), over = Math.round(100 * c.extra / most), mark = Math.round(100 * c.cap / most), tired = c.extra > 0;
    const tip = `Workers on this camp's ${c.res} spots (${c.spots} spot${c.spots === 1 ? '' : 's'}: the ones in reach with no nearer camp). The max is what the governor puts on them. Past it the spots get tired and extra workers add little.`;
    const note = !c.spots ? `No ${c.res} spots within reach of this camp` : tired ? `${c.extra} over the max of ${c.cap}` : c.n < c.cap ? `Room for ${c.cap - c.n} more (max ${c.cap})` : `At the max of ${c.cap}`;
    return `<div title="${esc(tip)}">${campHead('Workers')}<div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:#b9b3a6">Workers at this camp</span><span><b style="color:${tired ? '#e3b06a' : '#eadfc6'}">${c.n}</b></span></div>`
      + `<div style="position:relative;height:8px;border-radius:4px;background:rgba(0,0,0,.45);overflow:hidden;margin:3px 0"><div style="position:absolute;left:0;top:0;bottom:0;width:${fill}%;background:#7fc27a"></div>`
      + (over ? `<div style="position:absolute;left:${fill}%;top:0;bottom:0;width:${over}%;background:repeating-linear-gradient(135deg,#e3b06a 0 4px,#9a6a2e 4px 8px)"></div>` : '')
      + (c.cap ? `<div style="position:absolute;left:calc(${mark}% - 1px);top:0;bottom:0;width:2px;background:#f2e6c9"></div>` : '') + `</div>`
      + `<div style="display:flex;align-items:center;gap:8px;min-height:22px"><div style="flex:1;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${tired || !c.spots ? '#d9a25a' : '#7fc27a'}">${note}</div>`
      // Move extras (Tim 2026-11-22): hands the extra workers back to the governor (a camp spot with room, or a wait in the hall)
      + (tired && moving(b.id) ? '<button disabled style="flex:none;font-size:11px;padding:2px 8px;opacity:.6">Moving</button>' : tired ? `<button data-camp-extras="${esc(b.id)}" data-cart-town="${esc(s.id)}" title="${esc(`Hand the ${c.extra} extra worker${c.extra > 1 ? 's' : ''} back to the governor. He puts them on a spot beside a camp with room, or they wait in the town hall until one opens. With Initiative off they stand idle.`)}" style="flex:none;font-size:11px;padding:2px 8px">Move extras</button>` : '') + `</div></div>`;
  }
  // Workers in shelter, on the town hall card (Tim 2026-11-22): how many of the hall's room, why (hiding from an attack,
  // sent in by hand, waiting for room at their camp, in a work camp), Back to work, and Send the others in (in peace too, Tim 2026-11-22).
  // The small pill over the hall (town_hover.js) points here.
  const PILL_ICON = '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><circle cx="7" cy="4" r="2.7" fill="#f2e6c9"/><path d="M1.6 13.5c.4-3.6 2.5-5.4 5.4-5.4s5 1.8 5.4 5.4Z" fill="#f2e6c9"/></svg>';
  function hallShelterHTML(s) {
    const ws = s.workers || [], inside = ws.filter(w => w.shelter), war = Object.values(game.state.frontier?.wars?.list || {}).some(w => w.town === s.id);
    if (!ws.length) return '';   // Tim 2026-11-22: the section shows in peace too, so workers can be called into the hall any time
    const hall = s.buildings?.find(b => b.type === 'town_hall' && b.stage === 'built'), SH = data.war?.structures?.shelter || {}, t = SH.capacityByTier;
    const cap = t?.length ? t[Math.min(t.length, Math.max(1, s.tier || 1)) - 1] : SH.capacity, inHall = inside.filter(w => !w.shelter.b || w.shelter.b === hall?.id).length;
    const why = { attack: 0, hand: 0, wait: 0, camp: 0 };
    for (const w of inside) why[w.shelter.b && hall && w.shelter.b !== hall.id ? 'camp' : w.shelter.wait || w.wait ? 'wait' : w.shelter.manual ? 'hand' : 'attack']++;
    const rows = [['attack', 'Hiding from the attack', '#e0786c', 'They go back by themselves once no enemy is near'], ['hand', 'Sent in by you', '#e9c27a', 'They stay until Back to work'],
      ['wait', 'Waiting for room at their camp', '#8fa6b8', 'Their camp spots are full; they wait here until one frees up'], ['camp', 'In a work camp', '#9b9c98', 'Caught out near a lumber camp, quarry or food camp; they shelter there']]
      .filter(([k]) => why[k]).map(([k, label, col, tip], i) => `<div title="${esc(tip)}" style="display:flex;justify-content:space-between;padding:2px 0;${i ? 'border-top:1px solid #25272a;' : ''}"><span style="color:#9b9c98"><i style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${col};margin-right:6px"></i>${label}</span><b style="color:#f2e6c9">${why[k]}</b></div>`).join('');
    const out = ws.length - inside.length, pct = cap ? Math.min(100, Math.round(100 * inHall / cap)) : 0;
    const back = inside.length ? `<button data-shelter="${esc(s.id)}" data-shelter-mode="leave" title="Every worker in shelter goes back to the job they had" style="background:linear-gradient(#35603b,#1f3a24);border-color:#7fc27a;color:#e8f5e4">Back to work <small style="color:#cfe6cb">all ${inside.length} inside</small></button>` : '';
    const send = out > 0 ? `<button data-shelter="${esc(s.id)}" data-shelter-mode="enter" title="Every worker runs to the town hall and waits inside, safe, until Back to work${cap ? ` (room for ${cap})` : ''}">${inside.length ? `Send the other ${out} in` : `Send all ${out} workers in`}</button>` : '';
    return `<div style="margin-top:10px;padding:8px 9px;border:1px solid #6a5636;border-radius:7px;background:rgba(242,199,92,.05)">`
      + `<div style="display:flex;align-items:center;justify-content:space-between"><span style="display:flex;align-items:center;gap:5px;white-space:nowrap;font:600 10px/12px system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#b9a77e">${PILL_ICON}Workers inside</span><span><b style="color:#f2e6c9;font-size:13px">${inHall}</b>${cap ? ` <span style="color:#9b9c98">/ ${cap} room</span>` : ''}</span></div>`
      + (cap ? `<div style="height:7px;border-radius:4px;background:rgba(0,0,0,.5);overflow:hidden;margin:5px 0 6px"><div style="height:100%;width:${pct}%;background:#e9c27a"></div></div>` : '')
      + (rows || `<div style="color:#9b9c98">Nobody in shelter.${war ? ' Your town is at war.' : ''}</div>`)
      + (back || send ? `<div class="ti-acts" style="margin-top:7px">${back}${send}</div>` : '') + `</div>`
      + `<div style="border-top:1px solid #3c3b36;margin-top:10px"></div>`;
  }
  // Camp card (Tim 2026-11-06 21:20: a bar and chips, not a wall of text): storage used / cap, each cart, worker limit, Buy cart.
  // Tim 2026-11-22: the card kept resizing (the full note, cart chips and the carts line came and went or wrapped as carts
  // ran), so every row is always there, one line each.
  function campCardHTML(b, s) {
    const C = data.workers.carts, used = Object.values(b.store || {}).reduce((a, v) => a + v, 0), pct = Math.min(100, Math.round(100 * used / C.cap));
    const col = pct >= 100 ? '#d9694a' : pct >= 75 ? '#d9a25a' : '#7fc27a', carts = b.carts || [];
    const res = Object.entries(b.store || {}).filter(([, v]) => v > 0).map(([r, v]) => `${Math.round(v)} ${esc(r)}`).join(', ') || 'Nothing stored yet';
    const where = { camp: 'at camp', out: 'to town', back: 'returning', parked: 'parked in town', wrecked: 'destroyed, new cart in' }, secs = t => `${Math.ceil((t || 0) / 20)}s`;
    const one = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    const chip = c => { const load = Object.values(c.load || {}).reduce((a, v) => a + v, 0);
      return `<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 6px;margin:2px 0;border:1px solid transparent;border-radius:4px;background:rgba(255,255,255,.06)"><span style="${one}">Cart ${where[c.at] || c.at}${c.t ? `, ${secs(c.t)} left` : ''}</span><span style="flex:none">${c.at === 'out' ? `${Math.round(load)} of ${C.maxLoad} ${esc(Object.keys(c.load || {})[0] || '')}` : `holds ${C.maxLoad}`}</span></div>`; };
    const empty = `<div style="padding:2px 6px;margin:2px 0;border-radius:4px;border:1px dashed rgba(255,255,255,.22);color:#a8a294;${one}">Empty slot</div>`;
    const perMin = b.cartTicks ? carts.length * C.maxLoad * 1200 / (2 * b.cartTicks) : null, keep = perMin && C.workerPerMin ? Math.floor(perMin / C.workerPerMin) : null;
    const cost = Object.entries(C.extraCost).map(([r, v]) => `${v} ${r}`).join(', ');
    return `<div>${campHead('Camp storage')}<div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:#b9b3a6">Held here</span><span>${Math.round(used)} of ${C.cap}</span></div>`
      + `<div style="height:8px;border-radius:4px;background:rgba(0,0,0,.45);overflow:hidden;margin:3px 0"><div style="height:100%;width:${pct}%;background:${col}"></div></div>`
      + `<div style="font-size:12px;color:#b9b3a6;${one}">${pct >= 100 ? '<span style="color:#d9a25a">Full: workers walk to town</span>, ' : ''}${res}</div>`
      + campHead('Ox carts') + `<div style="font-size:12px;color:#b9b3a6">${carts.length} of ${C.max}, each haul takes ${Math.round(C.share * 100)}% of storage, up to ${C.maxLoad}</div>${carts.map(chip).join('')}${empty.repeat(Math.max(0, C.max - carts.length))}`
      + `<div style="font-size:12px;color:#b9b3a6;${one}">${keep != null ? `Carts keep up with about ${keep} workers${b.cartTicks ? `, round trip ${secs(2 * b.cartTicks)}` : ''}` : 'Carts keep up with: known after one trip'}</div>`
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
  // byClick: only a real left-click on one worker opens its card; a drag box over one does not (Tim 2026-11-25)
  let clickPicked = false;
  function select(ids, byClick = false) {
    selected = ids;
    if (ids.length) { cancel(); crewInput.clear(); }
    clickPicked = byClick && ids.length === 1;
    if(clickPicked)crewInput.inspect?.(selectedLive()[0]?.w.entity);
    inspect = null; card.hidden = true;
  }
  function focusWorkers(ids) {
    select(ids, true);   // a double-click or a card: a click, so one worker shows its card
    const follow=()=>{
      const entities=selectedLive().filter(p=>ids.includes(p.w.id)).map(p=>({...workerPresentation(p.w,p.s,data,game.state.entities,game.state.workerAt),owner:p.s.owner}));
      return watchCrewGroup({entities:Object.fromEntries(entities.map(e=>[e.id,e]))},hero()?.owner,null,entities.map(e=>e.id));
    };
    const p=follow();if(p){view.jumpTo?.(p.x,p.z);view.watch?.(follow);}
  }
  function assign(spot) {
    for (const s of workSites()) {
      const ids = selectedLive().filter(p => p.s.id === s.id).map(p => p.w.id);
      if (ids.length) command({ action: 'assign', town: s.id, workers: ids, spot: spot.id });
    }
    say(`Harvest order: ${townName(spot.kind)}`);
  }
  // 7c-4 (Tim 2026-11-12: builders, repair and douse are manual). What the selected workers can work on under the
  // pointer: a camp building site or the camp hall while it is upgraded (build), one of their site's damaged or
  // burning structures or a ruined town hall (douse, repair), or a ruined placed building of their town (the Rebuild
  // order). Sends the order and returns true when there was something.
  // A camp building under the pointer by its drawn shape (as the Building pane picks it, structure_card.js), not by the
  // ground point: a tall watchtower's top is far from its base on the ground (Tim 2026-11-24: right-click repair missed).
  // `want` buildings (a site, or one with work to do) win over others standing in the same spot.
  function campBuildingAt(s, x, y, want) {
    let best = null, bd = Infinity;
    for (const b of s.war?.camp?.buildings || []) {
      const r = data.war?.buildings?.[b.type]?.radius ?? 5, u = view.unitToScreen(b.x, b.z, 0), a = view.unitToScreen(b.x + 1, b.z, 0);
      const k = Math.hypot(a.x - u.x, a.y - u.y) || 1, big = Math.max(1, r / 5.5), dx = Math.abs(x - u.x), dy = y - u.y;
      if (dx > 5 * k * big || dy < -7 * k * big || dy > 3 * k * big) continue;
      const d = dx + Math.abs(dy) - (want(b) ? 1e6 : 0);
      if (d < bd) { best = b; bd = d; }
    }
    return best;
  }
  // What the selected workers would do on a right-click here: orders to send, and a label for the pointer hint
  // (Tim 2026-11-24: show whether it works before and after the click). fail = your own building with nothing to do.
  // what mending the rest of it costs: paid bit by bit from the town or camp stock while they work (war.structures.repair.cost per health point)
  function repairCost(s, key) {
    const st = game.frontier?.structures?.find?.(key), hp = st ? Math.max(0, (st.max || 0) - (game.frontier.structures.hpOf(st) || 0)) : 0;
    const cost = data.war?.structures?.repair?.cost || {}, stock = s.camp ? s.war?.camp?.stock || {} : s.stock || {};
    const parts = Object.entries(cost).map(([r, v]) => ({ r, n: Math.ceil(hp * v) })).filter(q => q.n > 0);
    if (!parts.length) return '';
    const short = parts.some(q => (stock[q.r] || 0) < q.n);
    return `\n${parts.map(q => `${q.n} ${q.r}`).join(', ')}, paid as they work${short ? ' (not enough in stock to finish)' : ''}`;
  }
  const atWar = s => Object.values(game.state?.frontier?.wars?.list || {}).some(w => w.town === s?.id);
  function workPlan(x, y) {
    const p = view.screenToGround(x, y), ST = game.frontier?.structures, orders = [];
    if (!p) return { orders };
    let fail = null;
    for (const s of workSites()) {
      const ids = selectedLive().filter(q => q.s.id === s.id).map(q => q.w.id);
      if (!ids.length) continue;
      if (s.camp) {
        const key = b => `c|${s.id}|${b.id}`, isSite = b => b.stage === 'site' || !!b.upgrade, work = b => b.stage === 'built' && !!ST?.workTarget?.(s, key(b));
        const b = campBuildingAt(s, x, y, b => isSite(b) || work(b));
        if (b && isSite(b)) orders.push({ s, ids, target: b.id, what: 'Workers: build', label: `Right-click: build the ${townName(b.type).toLowerCase()}` });
        else if (b && work(b)) { const fire = game.state.frontier?.fires?.[key(b)]; orders.push({ s, ids, target: key(b), what: 'Workers: put out the fire and repair', label: `Right-click: ${fire ? 'put out the fire and repair' : 'repair'} the ${townName(b.type).toLowerCase()}${repairCost(s, key(b))}` }); }
        else if (b) fail = `${townName(b.type)}: ${b.stage === 'built' ? 'not damaged, nothing to repair' : 'nothing to do yet'}`;
      } else if (s.grid) {
        const cell = worldToCell(s, p.x, p.z), b = cell >= 0 ? (s.buildings || []).find(q => (q.cells || [q.cell]).includes(cell)) : null;
        const pk = cell >= 0 ? ST?.projectKeyAt?.(s, cell) : null;   // a town building site (Tim 2026-11-15): workers speed it up
        if (pk && ST?.workTarget?.(s, pk)) { orders.push({ s, ids, target: pk, what: 'Workers: build', label: 'Right-click: help build' }); continue; }
        if (b?.stage === 'ruined' && b.type !== 'town_hall') {   // Tim 2026-11-24: no rebuilding during a war on the town
          if (atWar(s)) fail = `${townName(b.type)} (ruin): no rebuilding during a war. Place a new one, on it or anywhere you can build, or rebuild it after the war`;
          else orders.push({ s, rebuild: b.id, what: 'Rebuild order given', label: 'Right-click: order it rebuilt' });
          continue;
        }
        const key = cell >= 0 ? `t|${s.id}|${b ? (b.cells || [b.cell])[0] : cell}` : null;
        if (key && ST?.workTarget?.(s, key)) orders.push({ s, ids, target: key, what: b?.stage === 'ruined' ? 'Workers: repair the town hall' : 'Workers: put out the fire and repair', label: (b?.stage === 'ruined' ? 'Right-click: repair the town hall' : 'Right-click: repair') + repairCost(s, key) });
      }
    }
    return { orders, fail, label: orders[0]?.label || fail, ok: !!orders.length };
  }
  // 7c-4 (Tim 2026-11-12: builders, repair and douse are manual): sends what workPlan found; true when the click was used.
  // Your own camp building with nothing to do takes the click too and says so, instead of sending the workers off to it.
  function workAt(x, y) {
    const plan = workPlan(x, y);
    for (const o of plan.orders) {
      if (o.rebuild) command({ action: 'rebuild', settlement: o.s.id, building: o.rebuild });
      else command({ action: 'workerOrder', town: o.s.id, workers: o.ids, kind: 'work', target: o.target });
    }
    if (plan.orders.length) { say(plan.orders[0].what); return true; }
    if (plan.fail) { say(plan.fail); hint.dataset.ok = 'false'; return true; }
    return false;
  }
  function orderSelected(kind,position={}) {
    for(const s of workSites()) {
      const ids=selectedLive().filter(p=>p.s.id===s.id).map(p=>p.w.id);
      if(ids.length)command({action:'workerOrder',town:s.id,workers:ids,kind,...position});
    }
    say(kind==='hold'?'Workers: stand here':kind==='return'?'Return carried resources':kind==='drop'?'Carried resources dropped':'Worker move order sent');
  }
  function requestTraining(id) {cancel();pendingPlan={tool:'worker training',request:{action:'train',town:id,count:1},at:{...pointer}};}
  function requestDrop() {
    cancel();pendingPlan={at:{...pointer},drop:workSites().map(s=>({town:s.id,workers:(s.workers || []).filter(w=>selected.includes(w.id) && w.carrying>0).map(w=>w.id)})).filter(p=>p.workers.length)};
  }
  // Tim 2026-11-05: the town hall card can also upgrade the hall (same upgradeHall command as the town panel)
  // Tim 2026-11-25: the requirements block (hall_upgrade.js) with have / need per requirement and the Upgrade button
  const hallUpgradeButton = s => hallUpgradeHTML(s, data, game.state);
  const trainingTip = s => resourceRequirements(s,{ryo:data.workers.cost,...(data.workers.goodsCost?{goods:data.workers.goodsCost}:{})},data.workers.personCost)
    + `\nTrains a selectable worker for harvesting and ground clearing.\nRequires a finished town hall. Training: ${data.workers.trainTicks / 20} seconds. Keep ${data.opening?.reservePeople || 0} townsperson for food/building.\nTechnology: none.\nEnables manual move, stop, group and resource orders.`;
  // card look (menu restyle, Tim 2026-11-11): a header with art, eyebrow and title, label / value rows, plain text
  const tiHead = (eyebrow, title, art = '') => `<div class="ti-head">${art ? `<img class="ti-art" src="${art}" alt="" onerror="this.remove()">` : ''}<div class="ti-name"><div class="ti-eye">${esc(eyebrow)}</div><b class="ti-title">${esc(title)}</b></div><button data-close class="ti-x" aria-label="Close inspection" title="Close (Esc)">Close</button></div>`;
  const tiRow = l => {
    const good = l[0] === '\u0001', warn = l[0] === '\u0002', t = String(l).replace(/^[\u0001\u0002]/, '').replace(/ · /g, ', ').replace(/…/g, '...'), m = /^([A-Z][A-Za-z ]{1,26}): (.{1,40})$/.exec(t);   // a long sentence after the colon reads as text (Tim 2026-11-22)
    return `<div class="ti-row${good ? ' good' : warn ? ' warn' : ''}">${m ? `<span>${esc(m[1])}</span><b>${esc(m[2])}</b>` : `<span class="ti-txt">${esc(t)}</span>`}</div>`;
  };
  function showInspection() {
    // a card opened with a building menu sits beside it and goes when the menu closes (Tim 2026-11-20)
    const menu = inspect?.menu ? openMenu() : null;
    if (inspect?.menu && !menu) inspect = null;
    if (!inspect?.menu) unplace(card);
    if(!inspect && selected.length===1 && clickPicked && outdoors() && !blocked()) {
      const p=selectedLive()[0];if(!p){card.hidden=true;return;}
      const d=workerDetails(p.w,spotIndex),html=tiHead(p.w.spot?`Worker, ${p.w.spot}`:'Worker',/^w\d+$/.test(p.w.id)?`Worker ${p.w.id.slice(1)}`:`Worker ${p.w.id}`)
        +`<div class="ti-row"><span class="ti-txt">${d.harvesting?`Harvesting ${esc(d.resource)}, ${d.left} s left, load ${d.gathered.toFixed(1)} of ${p.w.trip.load}`:d.cargo?`Carrying ${d.cargo} ${esc(d.resource)}`:esc(p.w.status || 'Ready for orders')}</span></div>`
        +(d.harvesting?`<div class="ti-prog"><i style="width:${Math.round(Math.max(0,Math.min(1,1-d.progress))*100)}%"></i></div>`:'')
        +(d.cargo?'<div class="ti-acts"><button data-return>Return resources</button><button data-drop>Drop resources...</button></div>':'');
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
      info = townCellTip(trainTown, inspect.cell, data, game.state?.clans);
    }
    // 7c-4: a ruined placed building comes back only by a Rebuild order (the town hall: by workers sent to repair it)
    const ruin = !inspect.spot && trainTown ? trainTown.buildings?.find(b => (b.cells || [b.cell]).includes(inspect.cell) && b.stage === 'ruined') : null;
    if (ruin) {
      const rebuilding = (trainTown.projects || []).some(p => p.replaces === ruin.id), cost = Object.entries(data.buildings?.[ruin.type]?.cost || {}).filter(([, v]) => v).map(([r, v]) => `${v} ${r}`).join(', ');
      const warNow = ruin.type !== 'town_hall' && !rebuilding && atWar(trainTown);   // Tim 2026-11-24: no rebuilding during a war on the town
      info = { title: `${townName(ruin.type)} (ruin)`, lines: [ruin.type === 'town_hall' ? 'Select workers and right-click it to repair it' : rebuilding ? 'Being rebuilt' : warNow ? 'No rebuilding during a war: place a new one, on it or anywhere you can build, or rebuild it once the war ends' : 'Stays a ruin until you order it rebuilt'] };
      if (ruin.type === 'station') info.lines.push('No trains run here until it is rebuilt');   // Tim 2026-11-17
      // the rebuild cost in plain sight (Tim 2026-11-16), paid from this town's stores; what the stores lack is named
      if (ruin.type !== 'town_hall' && cost) {
        const short = Object.entries(data.buildings?.[ruin.type]?.cost || {}).filter(([r, v]) => v && (trainTown.stock?.[r] || 0) < v).map(([r]) => r);
        if (!rebuilding && !warNow) info.lines.push(`Rebuild cost: ${cost}, from the town stores`);
        if (!rebuilding && !warNow && short.length) info.lines.push(`The town is short of ${short.join(' and ')}`);
      }
      const rp = rebuilding && trainTown.projects.find(p => p.replaces === ruin.id);
      if (rp) info.lines.push(...siteBuilders(trainTown, rp, data, game.state?.clans));
      if (ruin.type !== 'town_hall' && !rebuilding && !warNow) info.work = `<div class="ti-acts"><button class="ti-go" data-rebuild="${esc(ruin.id)}" data-rebuild-town="${esc(trainTown.id)}" title="The townspeople rebuild it on the same spot at the normal cost (${esc(cost)}). Not while a war is on this town. You can also right-click the ruin with workers selected; right-click again to send them to build it faster.">Rebuild</button></div>`;
    }
    if (!info) { card.hidden = true; return; }
    const bt = !inspect.spot && trainTown ? trainTown.buildings?.find(b => (b.cells || [b.cell]).includes(inspect.cell))?.type : null;
    const art = bt && data.townArt?.[bt] ? msArt(data.townArt[bt]) : '';
    const lines = info.lines.filter(l => !/^Town: /.test(l) && !/^Zone: none/.test(l));
    let hallH = '';
    if (info.hall) {   // the town hall: its tier, people and workers as coins, then Build, Train worker and Upgrade
      const t = tierOf(trainTown, data), nw = (trainTown.workers || []).length;
      hallH = `<div class="ti-coins"><div title="Town hall tier"><b>${esc(t.name)}</b><span>Tier ${trainTown.tier || 1}</span></div><div title="Townsfolk and beds"><b>${Math.floor(trainTown.pop || 0)} / ${Math.floor(trainTown.housing || 0)}</b><span>People</span></div><div title="Workers and the most this tier allows"><b>${nw} / ${t.workers}</b><span>Workers</span></div></div>`
        + hallShelterHTML(trainTown) + `<div class="ti-acts"><button class="ti-go" data-build="${esc(trainTown.id)}" title="Open this town's construction and zoning tools. No cost or technology requirement.">Build</button><button data-train="${esc(trainTown.id)}" title="${esc(trainingTip(trainTown))}">Train worker <small>${data.workers.cost} ryo${data.workers.goodsCost ? `, ${data.workers.goodsCost} goods` : ''}, ${data.workers.personCost} person</small></button></div><div data-worker-training></div>` + hallUpgradeButton(trainTown);
    }
    const html = tiHead(inspect.spot ? 'Resource spot' : info.hall ? `${trainTown.name}, town hall` : trainTown?.name || 'Your town', info.title, art)
      + (info.camp && info.camp.id ? campWorkHTML(info.camp, trainTown) : '')
      + (info.camp && info.camp.id ? (() => { const keepRow = l => /^[A-Z][A-Za-z ]{1,26}: .{1,40}$/.test(l) && !/^Zone state: not zoned/.test(l), note = lines.filter(l => !keepRow(l) && !/^Zone state: not zoned/.test(l));
          return `<div class="ti-rows">${lines.filter(keepRow).map(tiRow).join('')}</div>` + (note.length ? `<details style="font-size:12px;margin-top:4px;color:#b9b3a6"><summary style="cursor:pointer">About this camp</summary>${note.map(l => `<div style="margin-top:3px">${esc(l)}</div>`).join('')}</details>` : ''); })()
        : `<div class="ti-rows">${lines.map(tiRow).join('')}</div>`)
      + (info.work || '')
      + (info.camp && info.camp.id ? campCardHTML(info.camp, trainTown) : '')
      + (info.camp && !info.camp.id ? `<button data-camp="${esc(info.camp.town)}" data-camp-type="${esc(info.camp.type)}" title="Open this town's build tools with a work camp selected. Workers reach spots within ${data.workers?.campReach ?? 0} of a built work camp of the same kind.">Place camp here</button>` : '')
      + (info.stable ? `<div class="ti-acts"><button class="ti-go" data-stable="${esc(trainTown.id)}" title="Buy horses, rickshaws and omnibuses here">Open stable</button></div>` : '')
      + hallH;
    // Compare source strings, not browser-normalized innerHTML (data-close becomes data-close="").
    if (inspectionHtml !== html && !inspectionPressed) { const open = card.querySelector?.('details')?.open; card.innerHTML = html; inspectionHtml = html; if (open) { const d = card.querySelector?.('details'); if (d) d.open = true; } }
    const training=card.querySelector?.('[data-worker-training]');
    if(training && info.hall)training.innerHTML=workerTrainingHTML(trainTown,game.state.tick,data);
    card.hidden = false;
    if (menu) placeBeside(card, menu);
  }
  card.addEventListener('click', e => {
    inspectionPressed = false;
    const b = e.target.closest('button');
    if(b?.hasAttribute('data-return'))orderSelected('return');
    if(b?.hasAttribute('data-drop'))requestDrop();
    if (b?.dataset.train) requestTraining(b.dataset.train);
    if (b?.dataset.upgrade) command({ action: 'upgradeHall', settlement: b.dataset.upgrade });
    if (b?.dataset.rebuild) { command({ action: 'rebuild', settlement: b.dataset.rebuildTown, building: b.dataset.rebuild }); return; }
    if (b?.dataset.shelter) { command({ action: 'hallShelter', town: b.dataset.shelter, mode: b.dataset.shelterMode }); return; }
    if (b?.dataset.buyCart) { command({ action: 'buyCart', town: b.dataset.cartTown, building: b.dataset.buyCart }); return; }
    if (b?.dataset.campExtras) { moveExtras(b.dataset.cartTown, b.dataset.campExtras); return; }
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
    if(keybinds.lookup(e,['build'])==='rotateBuilding' && tool && !pendingPlan && shapeOf(data.buildings[tool]) && outdoors() && !blocked() && !e.target?.closest?.('input,select,textarea')) {
      rot=(rot+1)%4;lastPreview='';consume(e);return;
    }
    if(keybinds.lookup(e,['build'])==='workersHold' && selected.length && outdoors() && !blocked() && !e.target?.closest?.('input,select,textarea')) {
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
  addEventListener('mousedown', e => { pointer = { x: e.clientX, y: e.clientY }; }, { capture: true });
  addEventListener('mousedown', e => {
    if (e.button === 0 && !inspect?.menu && !e.target?.closest?.('#towninspect')) { inspect = null; card.hidden = true; }   // beside a menu the card stays until the menu closes
    if (!canvasEvent(e)) return;
    if (e.button === 0) { pendingPlan = null; review.hidden = true; }
    if (e.button === 2 && tool) { cancel(); consume(e); return; }
    // 7c-4: right-click a building site, a damaged or burning building of yours, or a ruin, with workers selected
    if (e.button === 2 && selectedLive().length && workAt(e.clientX, e.clientY)) { consume(e); return; }
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
  }, { capture: true });   // a press on a worker is not consumed: the crew's drag box may start there too (Tim 2026-11-19)
  // no card on hover any more (Tim 2026-11-20, was 2026-11-19: it got in the way of moving units): a left-click shows it
  addEventListener('mousemove', e => { mouse = canvasEvent(e) ? { x: e.clientX, y: e.clientY } : null; });
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
        // the confirm box opens beside the cursor and says it all, so no extra hint (Tim 2026-11-22)
        if (data.buildUI?.confirmDrag) { pendingPlan = { request, tool, at: { x: e.clientX, y: e.clientY } }; hint.hidden = true; }
        else { if (result.ok) command(request); say(result.ok ? `${townName(tool)}: ordered${result.warning ? ' · ' + result.warning : ''}` : result.reason); }
      } else say('Outside town grid');
      crewInput.cancelPointer(); consume(e); return;
    }
    const click = Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6;
    // Tim 2026-11-19: a drag box with any of your troops or crew in it is theirs (crew_input.js); workers only when none are
    if (!click) {
      const [x0, x1, y0, y1] = [Math.min(d.x, e.clientX), Math.max(d.x, e.clientX), Math.min(d.y, e.clientY), Math.max(d.y, e.clientY)];
      const me = hero()?.owner, inBox = u => { const p = view.unitToScreen(u.x, u.z); return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1; };
      if (Object.values(game.state.entities || {}).some(u => u.owner === me && u.place === 'world' && !u.dead && !u.worker && !u.garrison && !u.aboard && u.type !== 'horse' && u.type !== 'civilian' && inBox(u))) return;
    }
    const picked = workers().filter(p => {
      if (click) return bodyDistance(view, p.e, e.clientX, e.clientY) < 22;
      const u = view.unitToScreen(p.e.x, p.e.z);
      return u.x >= Math.min(d.x, e.clientX) && u.x <= Math.max(d.x, e.clientX) && u.y >= Math.min(d.y, e.clientY) && u.y <= Math.max(d.y, e.clientY);
    });
    if (picked.length) {
      const ids = click ? [picked.sort((a, b) => bodyDistance(view, a.e, e.clientX, e.clientY) - bodyDistance(view, b.e, e.clientX, e.clientY))[0].w.id] : picked.map(p => p.w.id);
      select(click ? selected.includes(ids[0]) ? selected.filter(id => id !== ids[0]) : [...selected, ...ids] : ids, click);
      crewInput.cancelPointer(); consume(e); return;
    }
    if (!click) return;   // Tim 2026-11-19: a drag box with no workers in it is the crew's (crew_input.js); the worker selection stays
    if (unitNear(e.clientX, e.clientY)) return;   // a click on a unit selects it (crew_input.js), not the building behind it
    const spot = spotAt(e.clientX, e.clientY);
    const hit = townAt(e.clientX,e.clientY);
    // Tim 2026-11-19: a left-click on your military building (or stockade, or the hall while your town is attacked) opens its menu
    // Tim 2026-11-20: and the building's card opens beside the menu
    if (!spot && hit && menuAt(e.clientX, e.clientY)) { inspect = { town: hit.s.id, cell: hit.cell, menu: true }; showInspection(); crewInput.cancelPointer(); consume(e); return; }
    if (spot || hit) {
      inspect = spot ? { spot: spot.id } : { town: hit.s.id, cell: hit.cell };
      showInspection(); crewInput.cancelPointer(); consume(e);
    } else if (!inspect?.menu) { inspect = null; card.hidden = true; }   // open ground: the card goes, the worker selection stays (only Esc or a new drag clears it)
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
  // the confirm box (Tim 2026-11-22): rows per resource, short ones red
  function requirementRows(s, cost = {}, people = 0) {
    const row = (r, need, have) => `<div class="br-row${have < need ? ' short' : ''}" title="need ${need}, have ${have}"><i class="br-ic ${esc(r)}"></i>${esc(townName(r))} <b>${have < need ? `${have} of ${need}` : need}</b></div>`;
    const out = Object.entries(cost).map(([r,n]) => row(r, n, Math.floor((s.stock?.[r] || 0)*100)/100));
    if (people) out.push(row('people', people, s.pop));
    return out.join('') || '<div class="br-row muted">No resource cost</div>';
  }
  function shortLabel(s, cost = {}, people = 0) {
    const r = Object.entries(cost).find(([r,n]) => (s.stock?.[r] || 0) < n);
    if (r) return `${Math.ceil((r[1] - (s.stock?.[r[0]] || 0))*100)/100} ${townName(r[0]).toLowerCase()} short`;
    return people > s.pop ? `${people - s.pop} people short` : 'Confirm';
  }
  function refundRows(refund = {}) {
    const out = Object.entries(refund).map(([r,n]) => `<div class="br-row"><i class="br-ic ${esc(r)}"></i>${esc(townName(r))} <b>back ${n}</b></div>`);
    return out.join('') || '<div class="br-row muted">No paid resources to refund</div>';
  }
  // Tim 2026-11-22: the confirm box sits beside the cursor, kept on screen and off the spot being placed
  function footprintBox() {
    const r = pendingPlan?.request, s = r && towns().find(t => t.id === r.town);
    const cells = preview?.cells?.length ? preview.cells : r?.cells;
    if (!s?.grid || !cells?.length || r.action === 'train') return null;
    const half = s.grid.cell / 2; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const i of cells) { const [x, z] = cellToWorld(s, i);
      for (const [a, b] of [[x-half,z-half],[x+half,z-half],[x+half,z+half],[x-half,z+half]]) { const p = view.unitToScreen(a, b, 0.08); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } }
    if (!Number.isFinite(x0)) return null;
    if (!data.zones.kinds[pendingPlan.tool] && r.action !== 'remove') y0 -= (y1 - y0) * 1.2;   // a building's art stands up above its cells
    return { x0, y0, x1, y1 };
  }
  function placeReview() {
    const w = review.offsetWidth, h = review.offsetHeight;
    if (!w || !h) return;
    const at = pendingPlan.at || pointer, gap = 18, m = 8, box = footprintBox();
    const fit = ([x, y]) => [Math.max(m, Math.min(innerWidth - m - w, x)), Math.max(m, Math.min(innerHeight - m - h, y))];
    const clear = ([x, y]) => !box || x >= box.x1 + m || x + w <= box.x0 - m || y >= box.y1 + m || y + h <= box.y0 - m;
    const spots = [[at.x + gap, at.y + gap], [at.x - gap - w, at.y + gap], [at.x + gap, at.y - gap - h], [at.x - gap - w, at.y - gap - h]];
    if (box) spots.push([box.x1 + gap, at.y - h / 2], [box.x0 - gap - w, at.y - h / 2], [at.x - w / 2, box.y1 + gap], [at.x - w / 2, box.y0 - gap - h]);
    const [x, y] = spots.map(fit).find(clear) || fit(spots[0]);
    review.style.left = `${Math.round(x)}px`; review.style.top = `${Math.round(y)}px`;
    // a little tail on the side facing the cursor
    const side = at.x < x ? 'l' : at.x > x + w ? 'r' : at.y < y ? 't' : at.y > y + h ? 'b' : '';
    const t = side === 'l' || side === 'r' ? Math.max(12, Math.min(h - 12, at.y - y)) : Math.max(12, Math.min(w - 12, at.x - x));
    if (review.dataset.tail !== side) review.dataset.tail = side;
    review.style.setProperty?.('--tail', `${Math.round(t)}px`);
  }
  function update() {
    for (const r of game.state.frontier?.receipts || []) if (r.seq > seen) {
      seen = r.seq;
      if (!r.ok && ['place', 'remove', 'zone', 'assign', 'train', 'workerOrder'].includes(r.action)) say(`Not possible: ${r.reason}`);
    }
    selected = selectedLive().map(p => p.w.id);
    if (crewInput.selected().length) selected = [];
    { const live = selected.length ? selectedLive() : [], sig = live.map(p => `${p.s.id}|${p.w.id}`).join(',');   // Tim 2026-11-25: selected workers do not run for shelter by themselves
      if (sig !== pickedSig) { pickedSig = sig; command({ action: 'workerPicked', picks: live.map(p => [p.s.id, p.w.id]) }); } }
    const s = current(), show = outdoors() && !blocked();
    if (!show && drag) { cancel(); }
    overlay.hidden = !show || (!opened && !selected.length && !drag && !pendingPlan && !workers().length);
    showInspection();
    review.hidden = !show || !pendingPlan;
    if(show && pendingPlan?.drop) {
      const html='<div class="br-head"><b>Drop carried resources?</b><button data-cancel class="br-x" title="Cancel (Esc or right click)">Esc</button></div><div class="br-note bad">All carried cargo on these workers will be permanently lost. You can then reassign them without returning.</div><button data-confirm class="go">Drop resources</button>';
      if(html!==reviewHtml && !reviewPressed){review.innerHTML=html;reviewHtml=html;}
    } else if (show && pendingPlan) {
      const plannedTown = towns().find(t => t.id === pendingPlan.request.town);
      if (!plannedTown) { pendingPlan = null; review.hidden = true; }
      else {
        const isTraining=pendingPlan.request.action==='train';
        const result = isTraining?workerTrainingPreview(plannedTown,pendingPlan.request.count,data):previewBuild(plannedTown,pendingPlan.request), enough = affordable(plannedTown,result.cost);
        const rows=pendingPlan.request.action==='remove' ? refundRows(result.refund) : requirementRows(plannedTown,result.cost,isTraining?result.people:0);
        const quantity=isTraining?`<div><button data-training-count="-1">−</button> <input type="number" class="numbox" min="1" data-training-input value="${pendingPlan.request.count}"> workers <button data-training-count="1">+</button></div><div>Keep ${data.opening?.reservePeople || 0} townsperson for food/building. Training time: ${pendingPlan.request.count*data.workers.trainTicks/20}s, plus existing queue.</div>`:'';
        const n=result.cells?.length || pendingPlan.request.cells?.length || 0, note=result.reason || result.warning || '';
        const act=isTraining?'Train workers':pendingPlan.request.action==='remove'?'Erase':data.zones.kinds[pendingPlan.tool]?'Lay zone':'Place';
        const html = `<div class="br-head" title="${esc(act)} in ${esc(plannedTown.name || 'town')}"><b>${esc(townName(pendingPlan.tool))}${isTraining?'':`<span>${n} cell${n===1?'':'s'}</span>`}</b><button data-cancel class="br-x" title="Cancel (Esc or right click)">Esc</button></div>${quantity}<div class="br-rows">${rows}</div>`
          + (note ? `<div class="br-note${result.ok?'':' bad'}">${esc(note)}</div>` : '') + `<button data-confirm class="go" ${result.ok && enough ? '' : 'disabled'}>${esc(result.ok && !enough ? shortLabel(plannedTown,result.cost,isTraining?result.people:0) : result.ok ? 'Confirm' : 'Cannot place here')}</button>`;
        if (html !== reviewHtml && !reviewPressed && !(document.activeElement?.hasAttribute?.('data-training-input') && review.contains(document.activeElement))) { review.innerHTML = html; reviewHtml = html; }
      }
    }
    if (show && pendingPlan) placeReview();
    if (!show) { hint.hidden = true; return; }
    if (!s && opened) close();
    // workers selected, no build tool: the pointer hint says what a right-click on the building under it would do
    const wp = !tool && mouse && !pendingPlan && Date.now() > messageUntil && selectedLive().length ? workPlan(mouse.x, mouse.y) : null;
    if (wp?.label) { hint.textContent = wp.label; hint.dataset.ok = String(wp.ok); hint.hidden = false;
      hint.style.left = `${Math.max(8, Math.min(innerWidth - 280, mouse.x + 16))}px`; hint.style.top = `${Math.min(innerHeight - 65, mouse.y + 20)}px`; }
    else if ((!tool || !mouse) && Date.now() > messageUntil) hint.hidden = true;
    if (overlay.hidden) return;
    if (overlay.width !== innerWidth || overlay.height !== innerHeight) { overlay.width = innerWidth; overlay.height = innerHeight; }
    const ctx = overlay.getContext('2d'); ctx.clearRect(0,0,overlay.width,overlay.height);
    if (opened && s) {
      const visible = visibleCells(s), definitions = Object.fromEntries(Object.entries(data.zones.kinds).map(([kind,k]) => [k.char,kind]));
      for (const i of visible) {
        if (s.grid.ground[i] !== 'x') polygon(ctx,s,i,'rgba(235,225,200,.025)');
        // Tim 2026-11-22: cells under a placed building (or a site) and the cells under the town hall's art are dark red: nothing can be built there
        if (s.grid.use[i] === 'B' || hallArtCell(s,i)) { polygon(ctx,s,i,'rgba(150,30,25,.38)','#b8382e'); continue; }
        const entry = definitions[s.grid.zone[i]];
        if (!entry && data.zones.military && s.grid.zone[i] === data.zones.military.char) { const mc = data.buildUI?.zoneColors?.military || '#e0584a'; polygon(ctx,s,i,mc + '40',mc); }   // 8d-5: the military zone, red
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
        if (Date.now() > messageUntil && !pendingPlan) {
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
  function html(s, mini = false, extra = '') {
    if (town !== s.id) { close(); town = s.id; }
    if(workersOpen)return `<div class="townbuild"><button data-act="build-workers">Back to town</button><h3>${esc(s.name)}</h3>${workerPanelHTML(s,{moving,tired:tiredCamps(game.state.frontier,s.owner).filter(c=>c.town===s.id),overworked:overworkedSpots(s),selected,index:spotIndex,data,page:workerPage,known,tab:workerTab,logPage:workerLogPage,filter:workerFilter,stockade:!!data.buildings?.stockade?.garrison && !!s.buildings?.some(b=>b.type==='stockade' && b.stage==='built')})}</div>`;
    // Tim 2026-11-08: a capped building shows used / allowed, one the tier doesn't allow yet is greyed with the tier that does
    const capOf = id => {
      // 8b-1: a military building shows used / the war limit, greyed with what it still needs
      if (isMilitary(id, data)) { const max = tierMax(data.war?.buildings?.[id], 'town', townTierFor(s, data.war?.buildings?.[id])), need = militaryNeeds(s, id, data); if (!max && !need.length) return null;
        return { max: max ?? Infinity, used: militaryCount(s, id), locked: need.length > 0, unlock: need.includes('the town hall war upgrade') ? 'War upgrade' : need.length ? 'Needs ' + need[0].replace(/^a built /, '') : '' }; }
      const g = placedGroup(id, data), max = tierOf(s, data)?.placed?.[g]; if (max === undefined) return null;
      const used = placedCount(s, id, data), next = (data.tiers?.list || []).find(t => (t.placed?.[g] ?? 0) > 0);
      return { max, used, locked: max === 0, unlock: next?.name || '' }; };
    const button = (id, label) => {
      const color = data.buildUI?.zoneColors?.[id],built=(s.buildings || []).filter(b=>b.type===id && b.stage==='built').length,text=buildTooltip(id,s,data,resourceRequirements)+(built?`\nDouble-click: show your ${built === 1 ? 'one' : built} in this town in turn`:''), cap = capOf(id);
      // Tim 2026-11-25 (replaces 11-22 own / own plus free slots): work camps share one cap, shown once on the Camps row (Camps 4/4); a camp button shows only how many of its kind the town has
      const own = cap && !cap.locked && placedGroup(id, data) !== id ? (s.buildings || []).filter(b => b.type === id && b.stage !== 'ruined').length + (s.projects || []).filter(p => p.type === id).length : null;
      const tag = !cap ? '' : cap.locked ? `<small>${esc(cap.unlock)}</small>` : own != null ? `<small>${own}</small>` : `<small>${cap.used}/${cap.max}</small>`;
      const cls = [tool === id ? 'on' : '', cap?.locked ? 'locked' : '', cap && !cap.locked && cap.used >= cap.max ? 'full' : '', id === 'eraser' ? 'eraser' : ''].filter(Boolean).join(' ');
      return `<button data-act="build-tool" data-id="${esc(id)}" data-tip="${esc(text)}" ${color && !cap?.locked ? `style="border-color:${color};color:${color}"` : ''} class="${cls}" aria-pressed="${tool === id}">${esc(label)}${tag}</button>`;
    };
    // the build bar in groups, one row each, the eraser apart at the right of the first row
    const camps = data.tiers?.camps || ['lumber_camp', 'food_camp', 'quarry'];
    const others = Object.entries(data.buildings).filter(([k, v]) => v.size && !v.military && !data.zones.fromBuilding[k] && !camps.includes(k)).map(([k]) => k);
    const military = militaryFor(s, data, game.state, game.ships?.world);   // 8b-1: the war camp's military buildings, in their own row
    const group = (name, ids, extra = '') => `<div class="bgroup"><span class="blab">${name}</span><div class="btns">${ids.map(t => button(t, camps.includes(t) ? townName(t).replace(/ camp$/i, '') : townName(t))).join('')}${extra}</div></div>`;
    // Tim 2026-11-10: in build mode only this small box shows (top left); long text lives in the hovers
    if (mini) return `<div class="bmhead"><b>Build · ${esc(s.name)}</b><button data-act="build-toggle" class="bmexit" data-tip="Leave build mode and go back to the town panel (Esc).">Exit build</button></div>`
      + `<div class="buildtools">` + group('Lay out', ['road', 'wall', 'gate'], `<span class="gap"></span>${button('eraser', townName('eraser'))}`)
      + group('Zones', ['housing', 'farm', 'work', ...(data.zones.military ? ['military'] : [])]) + group((() => { const c = camps.find(k => data.buildings[k]?.size), cap = c && capOf(c); return cap && !cap.locked ? `Camps <small>${cap.used}/${cap.max}</small>` : 'Camps'; })(), camps.filter(k => data.buildings[k]?.size)) + group('Buildings', others) + (military.length ? group('Military', military) : '')
      + `</div><div class="hint" data-tip="Drag, release, review requirements, then Confirm or Cancel. Right click or Esc cancels.\nZone previews match their buttons; amber border = short, red border = abandoned.\nDark red cells = a building or site stands there (or the town hall), nothing can be built on them.">Drag on the map, then Confirm. Right click cancels.</div>`;
    // Tim 2026-11-16: training and the first steps moved into the Workers section of the town panel (workersHtml)
    return `<div class="townbuild"><div class="bigrow"><button data-act="build-toggle" class="buildbig" data-tip="Open the build bar: roads, walls, zones, camps and buildings. Other menus hide while you build.">Build bar</button>${extra}</div>`
      + (selected.length ? `<div>${selected.length} selected, right-click a spot to harvest</div>` : '') + '</div>';
  }
  // The town panel's Workers section (Tim 2026-11-16 mock): worker art, count of the tier cap, the training queue,
  // a Train button with coin costs (the old hint text is in its hover), and in a new town the first steps track,
  // which hides once all five are done.
  function workersHtml(s) {
    if (!s?.grid) return '';
    const W = data.workers, have = workerCount(s), cap = workerCap(s, data), queue = s.workerTraining || [], tick = game.state.tick || 0;
    const art = msConcept(W.model || 'rail_worker'), pic = cls => `<span class="${cls}"${art ? ` style="background-image:url('${art}')"` : ''}></span>`;
    const pre = workerTrainingPreview(s, 1, data), total = W.trainTicks / 20;
    const tipText = `${trainingTip(s)}\nKeep ${data.opening?.reservePeople || 0} townsperson for food and building. The hall is a drop-off; a lumber camp is optional.${pre.ok ? '' : `\nNot now: ${pre.reason}`}`;
    const coin = (n, k) => `<span class="tcoin ${k}"><i></i>${n}</span>`;
    let q = '';
    if (queue.length) {
      const left = Math.max(0, (queue[0].readyAt - tick) / 20), frac = 1 - Math.min(1, left / Math.max(0.001, total));
      q = `<div class="wqueue">${queue.slice(0, 6).map(() => pic('wqp')).join('')}<div class="wqbar"><i style="width:${(frac * 100).toFixed(1)}%"></i></div><span class="dim">${left.toFixed(1)} s${queue.length > 1 ? `, ${queue.length - 1} more` : ''}</span></div>`;
    }
    let h = `<div class="lab">Workers</div><div class="wcard">${pic('wart')}<div class="wmain"><div class="wbig"><b>${have}</b> <span class="dim">/ ${cap} workers</span></div>`
      + `<div class="dim">${queue.length ? `${queue.length} training` : 'None training'}${selected.length ? `, ${selected.length} selected` : ''}</div>${q}</div>`
      + `<button data-act="build-train" class="wtrain${pre.ok ? '' : ' no'}" data-tip="${esc(tipText)}">Train worker ${coin(W.cost, 'ryo')}${W.goodsCost ? coin(W.goodsCost, 'goods') : ''}</button></div>`;
    const steps = [[s.grid.zone.includes('h'), 'Housing', 'zone housing with the Build bar'], [s.grid.zone.includes('f'), 'Farms', 'zone farms with the Build bar'], [/[rg]/.test(s.grid.use), 'Roads', 'lay a road from the town hall'],
      [!!s.workers?.length, 'Train worker', 'press Train worker'], [(s.workers || []).some(w => spotIndex.get(w.spot)?.kind === 'timber'), 'Assign timber', 'select a worker and right-click a timber spot']];
    const next = steps.find(x => !x[0]);
    if (next) h += `<div class="lab">First steps</div><div class="wsteps">${steps.map(x => `<div class="wst${x[0] ? ' done' : x === next ? ' now' : ''}"><span class="pip"></span>${esc(x[1])}</div>`).join('')}</div><div class="wnext">Next: ${esc(next[2])}</div>`;
    return h;
  }
  // 7c-4 (items 25 and 26): the war camp's Workers tab. The same worker pane as a town's (every worker with status
  // and job, task coins as filters, groups, log), and its Spots view lists every timber and stone spot in the camp's
  // reach, rich or not. The camp panel (war_camp_panel.js) shows this html and passes clicks to click() with campSite(id).
  const campSite = warId => workSites().find(s => s.camp && s.id === warId) || null;
  function campWorkersHtml(warId) {
    const s = campSite(warId), t = s && game.state.frontier?.settlements?.[s.war.town];
    if (!s) return '';
    const res = data.war?.camp?.resources || ['timber', 'stone'], R = data.war?.circleRadius ?? 0;
    const spots = t && Number.isFinite(t.x) ? spotIndex.spotsNear(t.x, t.z, R).filter(p => res.includes(data.workers?.resources?.[p.kind]) && Math.hypot(p.x - t.x, p.z - t.z) > ringRadius(t, data) && known(p.x, p.z)) : [];
    const spotState = p => ({ rich: isRich(p), yieldText: spotRules?.stages ? `${spotYield(p, game.state.frontier?.spots?.[p.id], spotRules.stages)} a trip` : '' });
    return `<div class="campworkers">${workerPanelHTML(s, { overworked: overworkedSpots(s), selected, index: spotIndex, data, page: workerPage, known, tab: workerTab, logPage: workerLogPage, filter: workerFilter, camp: true, spots, spotPage: workerSpotPage, spotState })}</div>`;
  }
  return { update, html, workersHtml, miniHtml: s => html(s, true), isOpen: () => opened, close, cancel, isBuilding: () => opened && !!tool, isRosterOpen: () => workersOpen, campWorkersHtml, campSite,
    // 8b: a card in the town hall war window hands its building type to the place tool
    placeTool(id, kind) { town = id; opened = true; onBuild(town); inspect = null; card.hidden = true; cancel(); tool = kind; return true; },
    // two or more workers picked: one small card each in the selection panel (Tim 2026-11-08); a click picks just that one
    selectedWorkers:()=>selected.length>1?selectedLive().map(p=>({...workerPresentation(p.w,p.s,data,game.state.entities,game.state.workerAt),id:`worker:${p.w.id}`,wid:p.w.id,worker:true,status:workerStatus(p.w,spotIndex)})):[],
    pickWorker:wid=>{const p=selectedLive().find(p=>String(p.w.id)===String(wid));if(p)select([p.w.id],true);},
    workerTarget:()=>{const p=selected.length===1 && clickPicked && selectedLive()[0];return p?{...workerPresentation(p.w,p.s,data,game.state.entities,game.state.workerAt),workerDetail:workerDetails(p.w,spotIndex)}:null;},
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
      if (ds.act === 'build-tool') {
        // Tim 2026-11-22: a double-click on a build button shows this town's built ones of that kind in turn (camera + card)
        const key='tool:'+s.id+':'+ds.id,now=Date.now(),twice=toolClick?.key===key && now-toolClick.at<(data.buildUI?.doubleClickMs || 400);
        toolClick={key,at:now};
        if(twice && (s.buildings || []).some(b=>b.type===ds.id && b.stage==='built')){cancel();tool=null;toolClick=null;showBuilt(s,ds.id);return true;}
        cancel(); tool = ds.id;
      }
      if (ds.act === 'build-train') requestTraining(s.id);
      if (ds.act === 'build-workers') {cancel();opened=false;workersOpen=!workersOpen;}
      if (ds.act === 'build-worker-select')select(selected.includes(ds.id)?selected.filter(id=>id!==ds.id):[...selected,ds.id],true);
      if (ds.act === 'build-worker-all'){select((s.workers || []).map(w=>w.id));workerFilter=null;if(workerTab==='idle')workerTab='roster';workerPage=0;}
      if (ds.act === 'build-worker-job') {workerFilter=ds.id;if(workerTab==='idle')workerTab='roster';workerPage=0;const ids=(s.workers || []).filter(w=>workerTask(w,spotIndex)===ds.id).map(w=>w.id);select(e?.ctrlKey || e?.shiftKey?[...new Set([...selected,...ids])]:ids);}
      if (ds.act === 'build-worker-group')select((s.workers || []).filter(w=>w.group===Number(ds.id)).map(w=>w.id));
      if (ds.act === 'build-worker-stop')orderSelected('hold');
      if (ds.act === 'build-worker-return')orderSelected('return');
      if (ds.act === 'build-worker-drop')requestDrop();
      // Tim 2026-11-11: sending workers into the stockade moved here from the Governor tab
      if (ds.act === 'build-worker-hall')for(const t of workSites()){const ids=selectedLive().filter(p=>p.s.id===t.id && !p.w.garrison).map(p=>p.w.id);if(ids.length)command({action:'hallShelter',mode:'enter',town:t.id,workers:ids});}   // Tim 2026-11-19
      if (ds.act === 'build-worker-stockade')for(const t of workSites()){const units=selectedLive().filter(p=>p.s.id===t.id && p.w.entity!=null && !p.w.garrison).map(p=>p.w.entity);if(units.length)command({action:'garrison',mode:'enter',town:t.id,units});}
      if (ds.act === 'build-worker-page')workerPage=Number(ds.id);
      if (ds.act === 'build-worker-tab') {workerFilter=null;workerTab=ds.id==='idle' && workerTab==='idle'?'roster':['log','idle','groups','spots'].includes(ds.id)?ds.id:'roster';workerLogPage=0;workerPage=0;}
      if (ds.act === 'build-worker-log-page')workerLogPage=Number(ds.id);
      if (ds.act === 'build-worker-spot-page')workerSpotPage=Number(ds.id);
      if (ds.act === 'build-worker-spot') {const spot=spotIndex.get(ds.id);if(spot)view.jumpTo?.(spot.x,spot.z);}
      // camps over their max (Tim 2026-11-22): Move extras as on the camp card; Go to puts the camera on the camp
      if (ds.act === 'build-worker-campextras')moveExtras(s.id,ds.id);
      if (ds.act === 'build-worker-campgo') {const c=tiredCamps(game.state.frontier,s.owner).find(c=>c.town===s.id && c.id===ds.id);if(c)view.jumpTo?.(c.x,c.z);}
      return true;
    },
    change(ds,value,s) {
      const ids=ds.act==='build-worker-assign'?[ds.id]:ds.act==='build-worker-assign-selected'?(s.workers || []).filter(w=>selected.includes(w.id)).map(w=>w.id):[];
      if(!ids.length || value==='')return false;
      command({action:'workerOrder',town:s.id,workers:ids,kind:'group',group:Number(value)});return true;
    }
  };
}
