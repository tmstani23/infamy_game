// L3.8: local tools and selection. Rules are queried in sim modules; changes are commands only.
import { createPlacement } from './sim/frontier/placement.js';
import { createZones } from './sim/frontier/zones.js';
import { cellToWorld, worldToCell } from './sim/frontier/town_grid.js';
import { bodyDistance } from './crew_input.js';
import { townCellTip, townName } from './frontier_tips.js';
import { spotInfo } from './resource_spot_props.js';
import { spotYield } from './sim/resource_spots.js';
import { townPlots } from './town_props.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const costs = cost => Object.entries(cost || {}).map(([r, n]) => `${n} ${r}`).join(', ') || 'free';

export function rectangleCells(s, first, last) {
  const n = s.grid.n;
  if (first < 0 || last < 0) return [];
  const c0 = Math.min(first % n, last % n), c1 = Math.max(first % n, last % n);
  const r0 = Math.min(Math.floor(first / n), Math.floor(last / n)), r1 = Math.max(Math.floor(first / n), Math.floor(last / n));
  const cells = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.push(r * n + c);
  return cells;
}

export function buildRequest(s, tool, first, last, data) {
  const building = !!data.buildings[tool]?.size && !data.zones.kinds[tool];
  return { town: s.id, action: tool === 'eraser' ? 'remove' : data.zones.kinds[tool] ? 'zone' : 'place',
    ...(tool === 'eraser' ? {} : { kind: tool }), cells: building ? [last] : rectangleCells(s, first, last) };
}

// The same dry-run functions the sim commands use, applied to the read-only snapshot.
// Erasing has no query entry point: run its real validation against an isolated copy.
export function buildPreview(s, request, data) {
  const placement = createPlacement({ data, construction: { cancel() {} } });
  const zones = createZones({ data });
  const result = request.action === 'zone' ? zones.zone(s, { ...request, dryRun: true })
    : request.action === 'remove' ? placement.remove(structuredClone(s), request) : placement.check(s, request);
  if (result.ok && request.action === 'zone') {
    const reach = data.zones.kinds[request.kind].needs?.roadReach;
    if (result.cells.some(i => !zones.roadNear(s, i, reach))) return { ...result, warning: 'Needs road to grow' };
  }
  if (result.ok && request.action === 'place' && data.buildings[request.kind]) {
    const short = Object.entries(result.cost).some(([r, n]) => (s.stock[r] || 0) < n);
    if (short) return { ...result, warning: 'Queued; waiting for materials' };
  }
  return result;
}

export function createFrontierBuildUI({ game, view, heroId, data, spotIndex, spotRules, known, send, crewInput, blocked = () => false }) {
  let town = null, opened = false, tool = null, drag = null, mouse = null, selected = [], inspect = null;
  let lastPreview = '', preview = null, seen = 0, messageUntil = 0;
  const overlay = document.createElement('canvas'), hint = document.createElement('div'), card = document.createElement('div');
  overlay.id = 'townbuildoverlay'; hint.id = 'townbuildhint'; card.id = 'towninspect';
  hint.hidden = card.hidden = true; overlay.hidden = true;
  document.body.append(overlay, hint, card);
  const hero = () => game.state.entities[heroId];
  const towns = () => Object.values(game.state.frontier?.settlements || {}).filter(s => !s.capital && s.owner === hero()?.owner && s.grid);
  const current = () => towns().find(s => s.id === town);
  const outdoors = () => (view.commandPlace?.(game.state, heroId) || hero()?.place) === 'world';
  const command = c => send({ id: heroId, type: 'frontier', ...c });
  const workers = () => towns().flatMap(s => (s.workers || []).map(w => ({ s, w, e: game.state.entities[w.entity] })).filter(p => p.e && !p.e.dead && !p.e.downed));
  const selectedLive = () => towns().flatMap(s => (s.workers || []).filter(w => selected.includes(w.id)).map(w => ({ s, w })));
  const canvasEvent = e => e.target?.closest?.('canvas#view') && outdoors() && !blocked();
  const consume = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  function cancel() { tool = null; drag = null; mouse = null; preview = null; lastPreview = ''; hint.hidden = true; crewInput.cancelPointer(); }
  function close() { cancel(); opened = false; }
  function say(text) { hint.textContent = text; delete hint.dataset.ok; hint.hidden = false; messageUntil = Date.now() + 5000; }
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
    return towns().map(s => ({ s, cell: cellAt(x,y,s) })).find(p => townCellTip(p.s,p.cell,data));
  }
  function select(ids) {
    selected = ids;
    if (ids.length) { crewInput.cancelPointer(); crewInput.clear(); }
    inspect = null; card.hidden = true;
  }
  function assign(spot) {
    for (const s of towns()) {
      const ids = selectedLive().filter(p => p.s.id === s.id).map(p => p.w.id);
      if (ids.length) command({ action: 'assign', town: s.id, workers: ids, spot: spot.id });
    }
    say(`Harvest order: ${townName(spot.kind)}`);
  }
  function showInspection() {
    if (!inspect || !outdoors() || blocked()) { card.hidden = true; return; }
    let info, trainTown;
    if (inspect.spot) {
      const spot = spotIndex.get(inspect.spot);
      if (!spot || !known(spot.x, spot.z)) { card.hidden = true; return; }
      info = spotInfo(spot, game.state.frontier?.spots?.[spot.id]);
      const assigned = towns().flatMap(s => (s.workers || []).filter(w => w.spot === spot.id || w.nextSpot === spot.id).map(w => `${w.id} (${s.name})`));
      info.lines.push(`Amount per harvest: ${spotYield(spot, game.state.frontier?.spots?.[spot.id], spotRules.stages)}`,
        `Your workers: ${assigned.length ? assigned.join(', ') : 'none'}`);
    } else {
      trainTown = towns().find(s => s.id === inspect.town);
      info = townCellTip(trainTown, inspect.cell, data);
    }
    if (!info) { card.hidden = true; return; }
    const html = `<button data-close aria-label="Close inspection">×</button><b>${esc(info.title)}</b>`
      + info.lines.map(l => `<div>${esc(l)}</div>`).join('')
      + (info.hall ? `<button data-train="${esc(trainTown.id)}">Train worker · ${data.workers.cost} ryo, ${data.workers.personCost} person</button>` : '');
    if (card.innerHTML !== html) card.innerHTML = html;
    card.hidden = false;
  }
  card.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b?.dataset.train) command({ action: 'train', town: b.dataset.train, count: 1 });
    if (b?.hasAttribute('data-close')) { inspect = null; card.hidden = true; }
  });
  card.addEventListener('mousedown', e => e.stopPropagation());
  addEventListener('keydown', e => {
    if (e.code !== 'Escape' || e.target?.closest?.('input, select, textarea')) return;
    const active = outdoors() && !blocked() && (!!tool || !!drag);
    cancel(); selected = []; inspect = null; card.hidden = true;
    // First Escape cancels a brush; a second follows the normal close-menu shortcut.
    if (active) consume(e);
  }, { capture: true });
  addEventListener('blur', cancel);
  addEventListener('mousedown', e => {
    if (!canvasEvent(e)) return;
    if (e.button === 2 && tool) { cancel(); consume(e); return; }
    const spot = e.button === 2 && selectedLive().length ? spotAt(e.clientX, e.clientY) : null;
    if (spot) { assign(spot); consume(e); return; }
    if (e.button !== 0) return;
    const cell = cellAt(e.clientX, e.clientY);
    drag = { x: e.clientX, y: e.clientY, first: cell, build: opened && !!tool };
    if (drag.build) { consume(e); return; }
    if (workers().some(p => bodyDistance(view, p.e, e.clientX, e.clientY) < 22)) consume(e);
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
        const request = buildRequest(s, tool, d.first, last, data), result = buildPreview(s, request, data);
        if (result.ok) command(request);
        say(result.ok ? `${townName(tool)}: ordered${result.warning ? ' · ' + result.warning : ''}` : result.reason);
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
    } else selected = [];
  }, { capture: true });

  function polygon(ctx, s, i, color) {
    const [x, z] = cellToWorld(s, i), r = s.grid.cell / 2;
    const points = [[x-r,z-r], [x+r,z-r], [x+r,z+r], [x-r,z+r]].map(([a,b]) => view.unitToScreen(a,b,0.08));
    if (points.every(p => p.x < 0) || points.every(p => p.x > innerWidth) || points.every(p => p.y < 0) || points.every(p => p.y > innerHeight)) return;
    ctx.beginPath(); points.forEach((p,j) => j ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.closePath();
    ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.stroke();
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
  function update() {
    for (const r of game.state.frontier?.receipts || []) if (r.seq > seen) {
      seen = r.seq;
      if (!r.ok && ['place', 'remove', 'zone', 'assign', 'train'].includes(r.action)) say(`Not possible: ${r.reason}`);
    }
    selected = selectedLive().map(p => p.w.id);
    if (crewInput.selected().length) selected = [];
    const s = current(), show = outdoors() && !blocked();
    if (!show && drag) { cancel(); }
    overlay.hidden = !show || (!opened && !selected.length && !drag);
    showInspection();
    if (!show) { hint.hidden = true; return; }
    if (!s && opened) close();
    if ((!tool || !mouse) && Date.now() > messageUntil) hint.hidden = true;
    if (overlay.hidden) return;
    if (overlay.width !== innerWidth || overlay.height !== innerHeight) { overlay.width = innerWidth; overlay.height = innerHeight; }
    const ctx = overlay.getContext('2d'); ctx.clearRect(0,0,overlay.width,overlay.height);
    if (opened && s) {
      const visible = visibleCells(s), definitions = Object.fromEntries(Object.entries(data.zones.kinds).map(([kind,k]) => [k.char,kind]));
      for (const i of visible) {
        const entry = definitions[s.grid.zone[i]];
        if (!entry) continue;
        const z = s.zones?.[entry], color = z?.abandoned ? 'rgba(160,55,50,.45)' : (z?.health ?? 1) < data.zones.healthyAt ? 'rgba(230,160,40,.35)' : ({ h:'rgba(90,160,240,.3)',f:'rgba(100,200,100,.3)',k:'rgba(190,120,230,.3)' }[s.grid.zone[i]]);
        polygon(ctx,s,i,color);
      }
      if (tool && mouse) {
        const last = cellAt(mouse.x,mouse.y), first = drag?.build ? drag.first : last;
        const request = buildRequest(s,tool,first,last,data), key = JSON.stringify([game.state.tick,s.id,request]);
        if (key !== lastPreview) { lastPreview = key; preview = buildPreview(s,request,data); }
        const cells = new Set(preview.cells?.length ? preview.cells : request.cells);
        for (const i of visible) if (cells.has(i)) polygon(ctx,s,i,preview.ok ? 'rgba(80,235,120,.45)' : 'rgba(245,70,60,.5)');
        if (Date.now() > messageUntil) {
          hint.textContent = preview.ok ? `${townName(tool)} · ${costs(preview.cost)}${preview.warning ? ' · ' + preview.warning : ''}` : preview.reason;
          hint.hidden = false; hint.dataset.ok = String(preview.ok);
        }
      }
    }
    const position = mouse || { x: 420, y: innerHeight - 100 };
    hint.style.left = `${Math.max(8,Math.min(innerWidth - 280,position.x + 16))}px`; hint.style.top = `${Math.min(innerHeight - 65,position.y + 20)}px`;
    for (const p of workers().filter(p => selected.includes(p.w.id))) {
      const u = view.unitToScreen(p.e.x,p.e.z,0.1); ctx.beginPath(); ctx.ellipse(u.x,u.y,15,7,0,0,Math.PI*2); ctx.strokeStyle = '#ffe08b'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (drag && !drag.build) { ctx.strokeStyle='#ffe08b'; ctx.strokeRect(drag.x,drag.y,mouse?.x-drag.x || 0,mouse?.y-drag.y || 0); }
  }
  function html(s) {
    if (town !== s.id) { close(); town = s.id; }
    const button = (id, label) => `<button data-act="build-tool" data-id="${esc(id)}" class="${tool === id ? 'on' : ''}" aria-pressed="${tool === id}">${esc(label)}</button>`;
    return `<div class="townbuild"><button data-act="build-toggle" aria-expanded="${opened}">${opened ? 'Close build bar' : 'Build bar'}</button>`
      + (opened ? `<div class="buildtools">${['road','wall','gate','housing','farm','work','eraser'].map(t => button(t,townName(t))).join('')}`
        + Object.entries(data.buildings).filter(([k,v]) => v.size && !data.zones.fromBuilding[k]).map(([k]) => button(k,townName(k))).join('')
        + `</div><div class="hint">Drag a rectangle · green allowed · red shows why · right click / Esc cancels.<br>Zones: blue housing, green farm, purple work; amber short, red abandoned.</div>` : '')
      + `<div class="row"><button data-act="build-train">Train worker · ${data.workers.cost} ryo</button><span>${s.workers?.length || 0} workers · ${s.workerTraining?.length || 0} training</span></div>`
      + (selected.length ? `<div>${selected.length} selected · right-click a spot to harvest</div>` : '') + '</div>';
  }
  return { update, html, close, cancel, isBuilding: () => opened && !!tool,
    click(ds, s) {
      if (!ds.act.startsWith('build-')) return false;
      if (ds.act === 'build-toggle') { if (opened) close(); else { town = s.id; opened = true; } }
      if (ds.act === 'build-tool') { cancel(); tool = ds.id; }
      if (ds.act === 'build-train') command({ action: 'train', town: s.id, count: 1 });
      return true;
    }
  };
}
