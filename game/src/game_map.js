// The full game map (M, Tim 2026-10-20, docs/territory_plan.md): the whole district over the
// screen with the same fog of war, territory (sim/territory.js) and switches for its layers.
// The game keeps running underneath (no pause, as in multiplayer). Hover a business for its
// owner and payout; click anywhere (a business: its door) to look there and close the map.
// Drawn by src/minimap.js in its big mode. Only reads the state.
import { hoverCard } from './frontier_report.js';
import { createMinimap } from './minimap.js';
import { createDeploymentMapData } from './deployment_map_data.js';
import { createDeploymentMapOverlay } from './deployment_map_overlay.js';
import { portrait } from './portraits.js';
import { createWorldMap, canvasToWorld } from './world_map.js';

const NAMES = { pawnshop: 'Pawnshop', bathhouse: 'Bathhouse', sake_brewery: 'Sake brewery', manor: 'Manor', customs_house: 'Customs house', warehouse: 'Warehouse', teahouse: 'Teahouse', shop: 'Shop', tenements: 'Nagaya tenements', gambling_den: 'Gambling den', clinic: 'Clinic', police_box: 'Police box',
  police_hq: 'Police HQ', moneylender: "Moneylender's house", hideout: 'Hideout', dojo: 'Village dojo', contract_board: 'Contract board' };
const LAYERS = [['deployment', 'Sectors'], ['territory', 'Territory'], ['businesses', 'Businesses'], ['police', 'Police'], ['units', 'Units']];

export function createGameMap({ openTown = () => {}, root, deploymentRoot, game, district, world = null, view, fog, heroId, clan = 'player', units, catalog, selected, send, devTravel = false, onManageSector, onSelectSector = () => {}, onSelectCrew = () => {}, onSelectTarget = () => {}, onReturnToDuty = null, onClose = () => {} }) {
  if(deploymentRoot)root.appendChild(deploymentRoot);
  const canvas = root.querySelector('canvas'), tip = root.querySelector('.maptip'), bar = root.querySelector('.maplayers'), side = root.querySelector('.mapside');
  const layers = { deployment: true, territory: true, businesses: true, police: true, units: true };
  const deploymentData = createDeploymentMapData({ game, clan });
  const deploymentSide = root.querySelector('.mapdeployment');
  const layerButtons = new Map(), sectorButtons = new Map();
  let selectedSector = game.state.deployment.sectors[0]?.id;
  let pointPicker = null, destinationPicker = null, flashUntil = 0;
  // one map (Tim 2026-10-27): managing a sector docks the Deployment menu beside the open map
  const selectSector = id => {
    if (destinationPicker) { destinationPicker(id);return; }
    selectedSector = id; flashUntil=performance.now()+1200; onSelectSector(id); drawDeployment(); map?.invalidate();
  };
  const manage = id => { selectedSector = id; onManageSector?.(id); map?.invalidate(); };
  const overlay = createDeploymentMapOverlay({ game, clan, data: deploymentData,
    selectedSector: () => selectedSector, flashing: () => performance.now()<flashUntil, onPick: (id, p) => {
      if (!pointPicker) return selectSector(id);
      if (game.deployment.sectorAt(p.x, p.z) !== pointPicker.sector) return;
      const callback = pointPicker.callback; pointPicker = null; callback(p); map?.invalidate();
    }, onHover: hoverSector, onContact: onSelectTarget });
  let map = null;
  for (const [k, label] of LAYERS) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    b.addEventListener('click', e => {
      layers[k] = !layers[k];
      syncLayers(); tip.hidden = true; e.currentTarget.blur(); deploymentData.update(true, true); map?.invalidate(); drawSide();
    });
    bar.appendChild(b); layerButtons.set(k, b);
  }
  function syncLayers() {
    for (const [id, b] of layerButtons) { b.className = layers[id] ? 'on' : ''; b.setAttribute('aria-pressed', String(layers[id])); }
    root.classList.toggle('deployment', layers.deployment);
    deploymentSide.hidden = !layers.deployment || root.classList.contains('docked');
    root.querySelector('h3').textContent = 'MAP';
  }
  deploymentSide.innerHTML = '<h4>YOUR SECTORS</h4><div class="sector-list"></div><div class="sector-detail" role="status"></div><button class="manage-sector" type="button">Manage sector</button><div class="deployment-key">Borders identify sectors. Divided tints show known clan presence.<br>Hollow squares: last seen (10 s). Arrows: last observed heading.<br>Dashed links: your transfer destinations.</div>';
  const controls = document.createElement('div'); controls.className = 'sector-actions';
  controls.innerHTML = '<label>Duty <select class="quick-task"></select></label><label>Staffing goal <input class="staffing" type="number" min="0" step="1" value="3"></label><button class="staffing-save" type="button">Set goal</button><button class="quick-return" type="button">Back to duty</button><small class="sector-notice" role="status"></small>';
  deploymentSide.querySelector('.manage-sector').before(controls);
  const quickTask = controls.querySelector('.quick-task'), staffing = controls.querySelector('.staffing');
  const tray = document.createElement('div'); tray.className = 'map-crew-tray'; tray.title = 'Select a command group. Use Transfer selected crew in Deployment to transfer.'; controls.after(tray);
  const portraits = new Map();
  for (const task of game.state.clans[clan].kind === 'ninja' ? ['watch', 'ambush'] : ['patrol', 'guard']) quickTask.add(new Option(task.replaceAll('_', ' '), task));
  const recent = document.createElement('div'); recent.className = 'recent-targets'; controls.after(recent);
  if (game.state.clans[clan].kind === 'ninja') {
    const next = document.createElement('button'); next.textContent = 'Ambush next enemy'; next.type = 'button';
    next.addEventListener('click', () => send({ id: heroId, type: 'deployment', action: 'armAmbush', sector: selectedSector })); controls.appendChild(next);
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel target'; cancel.type = 'button';
    cancel.addEventListener('click', () => send({ id: heroId, type: 'deployment', action: 'cancelAmbush', sector: selectedSector })); controls.appendChild(cancel);
  }
  quickTask.addEventListener('change', () => {
    const business = Object.values(game.state.businesses).find(b => b.owner === clan && b.room && game.deployment.sectorAt(...b.ring) === selectedSector);
    send({ id: heroId, type: 'deployment', action: 'assignment', sector: selectedSector, task: quickTask.value, ...(quickTask.value === 'guard' ? { business: business?.id } : {}) });
  });
  controls.querySelector('.staffing-save').addEventListener('click', () => { if (staffing.value !== '' && staffing.checkValidity()) send({ id: heroId, type: 'deployment', action: 'staffing', sector: selectedSector, value: Number(staffing.value) }); });
  controls.querySelector('.quick-return').addEventListener('click', () => {
    const ids = game.deployment.members(clan, selectedSector).map(e => e.id);
    if (onReturnToDuty) onReturnToDuty(ids);
    else send({ id: heroId, type: 'deployment', action: 'return', units: ids });
  });
  for (const s of overlay.sectors) {
    const b = document.createElement('button'), name = document.createElement('span'), status = document.createElement('small');
    b.type = 'button'; b.className = 'sector-select'; b.style.setProperty('--sector-color', s.color); name.textContent = s.name;
    b.append(name, status); deploymentSide.querySelector('.sector-list').appendChild(b);
    b.addEventListener('click', () => selectSector(s.id));
    sectorButtons.set(s.id, { button: b, status });
  }
  deploymentSide.querySelector('.manage-sector').addEventListener('click', () => manage(selectedSector));
  function drawDeployment() {
    if(deploymentSide.hidden)return;
    const snapshot = deploymentData.get();
    for (const s of snapshot.sectors) {
      const row = sectorButtons.get(s.id);
      row.status.textContent = `${s.taskLabel} · ${s.count}/${s.desired} · ${s.status}${s.missing ? ` · needs ${s.missing}` : ''}`;
      row.button.setAttribute('aria-pressed', String(s.id === selectedSector));
      row.button.classList.toggle('sector-alert', game.state.tick - (s.alertAt ?? -Infinity) < 100);
    }
    const s = snapshot.sectors.find(s => s.id === selectedSector);
    if (!s) return;
    {
      const crew = game.deployment.members(clan).filter(e => !e.downed), ids = new Set(crew.map(e => e.id));
      for (const [id, b] of portraits) if (!ids.has(id)) { b.remove(); portraits.delete(id); }
      for (const e of crew) {
        let b = portraits.get(e.id);
        if (!b) {
          b = document.createElement('button'); b.type = 'button';
          b.addEventListener('click', () => onSelectCrew(e.id));
          tray.appendChild(b); portraits.set(e.id, b);
        }
        const image = catalog && portrait(catalog, e.model);
        if (image) { b.style.backgroundImage = `url(${image})`; b.textContent = ''; }
        else b.textContent = (units?.types[e.type]?.name || e.type).slice(0, 2);
        b.title = `${units?.types[e.type]?.name || e.type} #${e.id} · ${e.deployment.group} · ${Math.ceil(e.hp)}/${e.maxHp} HP. Select group.`;
        b.classList.toggle('selected', selected().includes(e.id));
      }
    }
    quickTask.value = s.task;
    const targets = game.shinobiIntelligence?.targets(clan) || [], hunt = game.state.deployment.clans[clan].hunt;
    const targetKey = targets.map(t => `${t.id}:${t.live}:${Math.floor(t.age)}`).join(',') + ':' + hunt?.target;
    if (recent.dataset.key !== targetKey) {
      recent.dataset.key = targetKey; recent.replaceChildren();
      for (const t of targets) {
        const row = document.createElement('div'), inspect = document.createElement('button'), arm = document.createElement('button');
        inspect.type = arm.type = 'button'; inspect.textContent = `${units?.types[t.type]?.name || units?.models[t.model]?.name || t.type} · ${t.tracked ? 'tracked' : t.live ? 'in sight' : `${Math.floor(t.age)}s ago`} · ${t.sector || 'town'}`;
        inspect.addEventListener('click', () => onSelectTarget(t.id));
        arm.textContent = hunt?.target === t.id ? 'Armed · Cancel' : 'Ambush';
        arm.addEventListener('click', () => send({ id: heroId, type: 'deployment', action: hunt?.target === t.id ? 'cancelAmbush' : 'armAmbush', target: t.id }));
        row.append(inspect, arm); recent.appendChild(row);
      }
    }
    if (document.activeElement !== staffing) staffing.value = s.desired;
    const notice = game.state.clans[clan]?.notice;
    controls.querySelector('.sector-notice').textContent = notice && game.state.tick - notice.tick < 160 ? notice.text : '';
    const presence = s.presence.map(c => `${c.owner === clan ? 'Your crew' : c.name}: ${c.count}`).join(' · ');
    const lost = snapshot.contacts.filter(c => !c.live && c.sector === s.id).length;
    deploymentSide.querySelector('.sector-detail').textContent = `${s.name}\nSaved task: ${s.taskLabel}\n${s.living} available · ${s.incoming} incoming${s.assigned > s.living ? ` · ${s.assigned - s.living} downed` : ''}\n${Math.ceil(s.hp)} / ${s.maxHp} HP · ${s.status}${presence ? `\nSpotted presence: ${presence}` : ''}${lost ? `\n${lost} last-known contact${lost === 1 ? '' : 's'}` : ''}`;
  }
  function positionTip(e) {
    const r = root.querySelector('.mapbox').getBoundingClientRect(), width=tip.offsetWidth, height=tip.offsetHeight;
    tip.style.left = `${Math.max(4, Math.min(r.width - width - 8, e.clientX - r.left + 14))}px`;
    tip.style.top = `${Math.max(4, Math.min(r.height - height - 8, e.clientY - r.top + 10))}px`;
  }
  function hoverSector(s, e) {
    if (!s) { tip.hidden = true; return; }
    const presence = s.presence.map(c => `${c.owner === clan ? 'Your crew' : c.name}: ${c.count}`).join(' · ');
    const text = `${s.name}\n${s.taskLabel} (saved) · ${s.count}/3 · ${s.status}${presence ? `\n${presence}` : ''}\n${pointPicker ? 'Choose a point inside the selected sector' : 'Click to manage your crew'}`;
    if(tip.textContent!==text)tip.textContent=text;
    tip.hidden = false; positionTip(e);
  }
  syncLayers();
  // clicks on the map screen never reach the crew controls underneath (they listen on the window)
  for (const type of ['mousedown', 'mouseup', 'click', 'contextmenu', 'pointerdown', 'pointerup']) root.addEventListener(type, e => { e.stopPropagation(); if (type === 'contextmenu') e.preventDefault(); });
  root.querySelector('.mapclose').textContent='Close map ✕';
  root.querySelector('.mapclose').addEventListener('click', e => { close(); e.currentTarget.blur(); });

  // hover: what is known about that business (a rival's owner once you have seen it)
  function hover(b, e, quarter) {
    if (!b && quarter) return hoverQuarter(quarter, e);
    if (!b) { tip.hidden = true; return; }
    const st = game.state, vg = game.vision.grid(clan), seen = b.owner === clan || vg.explored[game.vision.cellOf(b.x, b.z)] === 1;
    const R = units?.rules?.businesses?.[b.kind], q = game.territory?.quarters.find(q => q.businesses.includes(b.id));
    const owner = !b.owner ? (R ? 'Unclaimed' : '') : seen ? (b.owner === clan ? 'Yours' : st.clans[b.owner]?.name || 'A rival clan') : 'Owner unknown';
    const lines = [`<b>${NAMES[b.kind] || b.kind}</b>`];
    if (b.kind === 'bandit_camp') {
      const cell = game.vision.cellOf(b.x, b.z), visible = !fog.isOn() || (cell >= 0 && vg.visible[cell]);
      const loot = b.members.reduce((n, kind) => n + (game.settings.bandits?.types?.[kind]?.ryo || 0), 0);
      lines[0] = `<b>${b.name}</b>`;
      lines.push(`${b.members.length} bandits · ${loot} ryo to loot`);
      lines.push(visible ? `${b.units.filter(id => st.entities[id] && !st.entities[id].dead).length} remaining` : 'Not in sight');
      lines.push('Cleared camps return at dawn');
    }
    if (b.hideout) lines.push(b.owner === clan ? 'Your hideout' : `${st.clans[b.owner]?.name || 'Rival'} hideout`);
    else if (owner) lines.push(owner);
    if (R?.payout) lines.push(`Pays ${R.payout} ryo at dawn · ${R.score || 0} season point${R.score === 1 ? '' : 's'}`);
    if (q) lines.push(q.name);
    if (b.owner && seen && R) {
      const guards = Object.values(st.entities).filter(g => g.guard === b.id && !g.dead).length;
      lines.push(`${guards} house guard${guards === 1 ? '' : 's'}`);
    }
    const html=lines.join('<br>');if(tip.innerHTML!==html)tip.innerHTML=html;
    tip.hidden = false; positionTip(e);
  }

  // hover a quarter: who holds it (Tim 2026-10-20: just that)
  function hoverQuarter(q, e) {
    const st = game.state, t = game.territory;
    const o = map?.shownHolder(q);
    const lines = [`<b>${q.name}</b>`, o ? `Held by ${o === clan ? 'you' : st.clans[o]?.name || 'a rival'} (+${Math.round(t.rules.quarterBonus * 100)}% payout)` : 'Not held by one clan'];
    const html=lines.join('<br>');if(tip.innerHTML!==html)tip.innerHTML=html;
    tip.hidden = false; positionTip(e);
  }
  // a clan's score, spelled out (hover): "Teahouse 1 + Gambling den 3 = 4"
  const why = id => { const p = game.territory.breakdown(id); return p.length ? `${p.map(x => `${x.label} ${x.points}`).join(' + ')} = ${game.territory.score(id)}` : 'No businesses yet = 0'; };

  // the side panel: season day and every clan's score (sim/territory.js), quarters held
  function drawSide() {
    if (layers.deployment) drawDeployment();
    const st = game.state, s = st.season, t = game.territory;
    if (!t || !s) { side.innerHTML = ''; return; }
    const rows = t.standings().map(r => {
      const c = st.clans[r.clan];
      return `<div class="row" title="${why(r.clan)}"><i style="background:${c.color}"></i><span>${r.clan === clan ? 'You' : c.name}</span><b>${r.score}</b></div>`;
    }).join('');
    const quarters = !layers.territory ? '' : '<details class="quarter-summary"><summary>Quarter ownership</summary>' + t.quarters.map(q => {
      const o = t.heldBy(q);
      return `<div class="row q"><span>${q.name}</span><em>${!o ? 'nobody holds it all' : o === clan ? 'yours (+payout)' : `held by ${st.clans[o]?.name}`}</em></div>`;
    }).join('')+'</details>';
    // a short key (Tim 2026-10-20: just these three)
    const legend = `<h4>Key</h4><div class="key">B · Bandit camp</div><div class="key">Q · Pawnshop · A · Bathhouse</div><div class="key">K · Sake brewery · R · Manor</div><div class="key">U · Customs house</div><div class="key"><i class="k-turf"></i>Territory</div>`
      + `<div class="key"><i class="k-quarter"></i>Quarter: hold it all for +${Math.round(t.rules.quarterBonus * 100)}% payout</div>`
      + `<div class="key"><i class="k-cam"></i>Camera view</div>`;
    const html = `<h4>${st.match?.mode === 'campaign' ? `Campaign · day ${s.day}` : `Season · day ${Math.min(s.day, s.cycles)} of ${s.cycles}`}</h4>${rows}${quarters}${legend}`;
    if (side.innerHTML !== html) side.innerHTML = html;
  }

  // World tab (frontier W2.4): the island (data/world.json) with this clan's fog, scouted sites and
  // pins from the snapshot (sim/discovery.js). Drag pans, the wheel zooms, click a site or camp for its
  // box, right-click drops a pin with a note (right-click a pin removes it). Only reads the state.
  let tab = 'city', worldMap = null, worldCanvas = null, pinDraft = null, picked = null;
  let travelTo = null;   // dev-only instant travel (Tim 2026-11-02): click empty ground on the World tab, then confirm
  const canTravel = () => devTravel && game.state.match?.mode === 'campaign' && ['street', 'world'].includes(game.state.entities[heroId]?.place);
  const tabs = document.createElement('div'), worldSide = document.createElement('div');
  tabs.className = 'maptabs'; worldSide.className = 'worldside'; worldSide.hidden = true;
  if (world) {
    tabs.innerHTML = '<button type="button" data-tab="city" class="on">City</button><button type="button" data-tab="world">World</button>';
    root.querySelector('h3').after(tabs); root.querySelector('.mapside').after(worldSide);
    tabs.addEventListener('click', e => { const t = e.target.closest('button')?.dataset.tab; if (t) { setTab(t); e.target.blur(); } });
  }
  const worldState = () => {
    const w = game.state.world, h = game.state.entities[heroId];
    return { discovered: w?.discovered?.[clan] ?? '0', scoutedSites: w?.scouted?.[clan] || [], pins: w?.pins?.[clan] || [],
      lastSeen: w?.lastSeen?.[clan] || {}, hero: h && game.discovery?.worldPos ? game.discovery.worldPos(h) : null, towns: townsOnMap() };
  };
  // Frontier towns to draw and hover (F4.4d): your own, plus rival towns on ground you have discovered
  // (the snapshot only carries those). Placed at their world site.
  const siteXZ = Object.fromEntries((world?.sites || []).map(t => [t.id, t]));
  function townsOnMap() {
    const f = game.state.frontier; if (!f) return [];
    return Object.values(f.settlements || {}).filter(t => !t.capital && siteXZ[t.site ?? ''] ).map(t => ({ ...t, x: siteXZ[t.site].x, z: siteXZ[t.site].z }));
  }
  const TRAIT = v => '●'.repeat(v) + '○'.repeat(Math.max(0, 3 - v));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function drawWorldSide() {
    const st = worldState(), scouted = new Set(st.scoutedSites);
    let box = '<div class="key">Click a site or camp to see it.</div>';
    if (picked?.kind === 'site') {
      const region = world.regions.find(r => r.id === picked.region);
      box = `<h4>Site ${esc(picked.id)}</h4><div class="key">${esc(region?.name || 'Region ' + picked.region)} · ${picked.tags.includes('coast') ? 'coast' : 'inland'}</div>`
        + (scouted.has(picked.id) ? Object.entries(picked.traits).map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${TRAIT(v)}</b></div>`).join('')
          + `<div class="key">${picked.routesToCapital} routes to the capital${picked.harbor ? ' · harbor' : ''}</div>` : '<div class="key">Not scouted: walk your hero close to learn its traits.</div>');
    } else if (picked?.kind === 'capital') box = `<h4>The Capital</h4><div class="key">Your home port city.</div>`;
    else if (picked?.kind === 'camp') box = `<h4>${picked.campKind === 'bandit' ? 'Bandit camp' : picked.campKind === 'ruin' ? 'Ruin' : 'Cache'}</h4><div class="key">Tier ${picked.tier}</div>`;
    else if (picked?.kind === 'pin') box = `<h4>Your pin</h4><div class="key">${esc(picked.note || '(no note)')}</div><div class="key">Right-click it to remove.</div>`;
    const form = pinDraft ? '<h4>New pin</h4><input class="pinnote" maxlength="40" placeholder="Note (optional)"><button type="button" class="pinsave">Save pin</button> <button type="button" class="pincancel">Cancel</button>' : '';
    const legend = '<h4>Key</h4><div class="key"><i style="background:#e6c85a"></i>Site (hollow: not scouted)</div><div class="key"><i style="background:#be3228"></i>Camp</div>'
      + '<div class="key"><i style="background:#c82828"></i>The Capital</div><div class="key"><i style="background:#5adc78"></i>You</div><div class="key"><i style="background:#ff78c8"></i>Your pin</div>'
      + '<div class="key"><i style="background:#0a0e1c;border:1px solid #555"></i>Unexplored</div><div class="key">Drag: pan · Wheel: zoom · Right-click: pin</div>';
    const travel = travelTo ? `<h4>${travelTo.city ? 'Travel back to the city? (test)' : 'Travel here? (test)'}</h4><div class="key">Your hero and the crew following him jump there at once.</div><button type="button" class="travelgo">Travel</button> <button type="button" class="travelcancel">Cancel</button>` : '';
    const zoom = '<div class="wzoom"><button type="button" data-zoom="1.4" title="Zoom in">+</button><button type="button" data-zoom="0.714" title="Zoom out">−</button></div>';
    worldSide.innerHTML = `${zoom}${travel}${box}${form}${legend}`;
    if (travelTo) {
      worldSide.querySelector('.travelgo').addEventListener('click', () => { send({ id: heroId, type: 'travel', ...travelTo, units: selected() }); travelTo = null; picked = null; drawWorldSide(); close(); });
      worldSide.querySelector('.travelcancel').addEventListener('click', () => { travelTo = null; drawWorldSide(); });
    }
    if (pinDraft) {
      const note = worldSide.querySelector('.pinnote'); note.focus();
      const save = () => { send({ id: heroId, type: 'world', action: 'pin', x: pinDraft.x, z: pinDraft.z, note: note.value.trim() }); pinDraft = null; drawWorldSide(); };
      note.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { e.stopPropagation(); pinDraft = null; drawWorldSide(); } });
      worldSide.querySelector('.pinsave').addEventListener('click', save);
      worldSide.querySelector('.pincancel').addEventListener('click', () => { pinDraft = null; drawWorldSide(); });
    }
  }
  function ensureWorldMap() {
    if (worldMap) return;
    worldSide.addEventListener('click', e => { const z = e.target.closest('[data-zoom]'); if (z && worldMap) { worldMap.zoomBy(+z.dataset.zoom); z.blur(); } });   // + / - (Tim 2026-11-02)
    worldCanvas = document.createElement('canvas'); worldCanvas.className = 'worldcanvas'; worldCanvas.setAttribute('aria-label', 'World map');
    canvas.after(worldCanvas);
    worldCanvas.width = worldCanvas.clientWidth || 1200; worldCanvas.height = worldCanvas.clientHeight || 686;
    worldMap = createWorldMap({ canvas: worldCanvas, world, getState: worldState }); worldMap.attach();
    const local = e => { const r = worldCanvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const card = document.createElement('div'); card.className = 'townhover'; card.hidden = true; root.appendChild(card);
    const esc2 = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    worldCanvas.addEventListener('mousemove', e => {
      const [px, py] = local(e), hit = worldMap.hit(px, py);
      const c = hit?.kind === 'town' ? hoverCard(hit, { clan, clanName: id => game.state.clans?.[id]?.name || id, roads: game.state.frontier?.roads }) : null;
      if (!c) { card.hidden = true; return; }
      card.innerHTML = `<b>${esc2(c.title)}</b><i>${esc2(c.sub)}</i>` + c.lines.map(([k, v]) => `<div><span>${esc2(k)}</span>${esc2(v)}</div>`).join('');
      const r = root.getBoundingClientRect();
      card.style.left = `${e.clientX - r.left + 14}px`; card.style.top = `${e.clientY - r.top + 14}px`; card.hidden = false;
    });
    worldCanvas.addEventListener('mouseleave', () => { card.hidden = true; });
    worldCanvas.addEventListener('click', e => {
      if (worldMap.wasDrag()) return;
      picked = worldMap.hit(...local(e));
      travelTo = !canTravel() ? null : picked?.kind === 'capital' ? { city: true } : !picked ? canvasToWorldPoint(...local(e)) : null;
      if (picked?.kind === 'town' && picked.owner === clan && picked.stock) { card.hidden = true; openTown(picked.id); return; }   // your town: the full panel (F4.4d)
      drawWorldSide();
    });
    worldCanvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      const [px, py] = local(e), hit = worldMap.hit(px, py);
      if (hit?.kind === 'pin') { send({ id: heroId, type: 'world', action: 'unpin', pin: hit.id }); picked = null; pinDraft = null; }
      else { const p = canvasToWorldPoint(px, py); pinDraft = p; }
      drawWorldSide();
    });
  }
  const canvasToWorldPoint = (px, py) => { const p = canvasToWorld(px, py, worldMap.view); return { x: Math.round(p.x), z: Math.round(p.z) }; };
  function setTab(t) {
    if (!world) t = 'city';
    tab = t; root.classList.toggle('world', t === 'world'); worldSide.hidden = t !== 'world';
    for (const b of tabs.querySelectorAll('button')) b.className = b.dataset.tab === t ? 'on' : '';
    if (t === 'world') {
      tip.hidden = true; ensureWorldMap();
      const w = worldCanvas.clientWidth, h = worldCanvas.clientHeight;
      if (w && h && (w !== worldCanvas.width || h !== worldCanvas.height)) { worldCanvas.width = w; worldCanvas.height = h; worldMap.fit(); }
      worldMap.invalidate(); drawWorldSide();
    } else map?.invalidate();
  }

  const isOpen = () => !root.hidden;
  function open() {
    root.hidden = false;
    // M opens straight to World while the hero is out on the island (W3 puts heroes there)
    if (world && game.state.entities[heroId]?.place === 'world') setTab('world');
    deploymentData.update(true, true);
    if (!map) {
      // made on first open, when the canvas has its size on screen
      map = createMinimap({ canvas, game, district, view, fog, heroId, clan, selected, send, big: true, layers, onHover: hover, onPick: close, overlay });
    }
    map.invalidate(); drawSide();
  }
  function close() { if(root.hidden)return;root.hidden = true; tip.hidden = true; pointPicker = null; destinationPicker=null;onClose(); }
  const toggle = () => (isOpen() ? close() : open());

  let shownData = null;
  function update() {
    if (isOpen() && tab === 'world' && worldMap) { const w = game.state.world?.pins?.[clan]; worldMap.frame(Math.floor(game.state.tick / 10) + ':' + (w?.length || 0)); return; }
    if (!isOpen() || !map) return;
    const data = deploymentData.update();
    const changed = data !== shownData;
    map.update(changed);
    if (changed) { shownData = data; drawSide(); }
  }
  // Deployment menu docked on the right of the map: Sectors on, the map's own sector list hidden
  function dock(on, sector) {
    root.classList.toggle('docked', on);
    if (sector && overlay.sectors.some(s => s.id === sector)) selectedSector = sector;
    if (on) { layers.deployment = true; if (!isOpen()) open(); }
    else pointPicker = null;
    syncLayers(); drawSide(); map?.invalidate();
  }
  return { open, close, toggle, isOpen, update, dock, observe:()=>deploymentData.update(false),
    diagnostics:()=>({raster:map?.diagnostics(),overlay:overlay.diagnostics?.(),portraits:portraits.size}),
    focusSector: id => { if (overlay.sectors.some(s => s.id === id)) { selectedSector = id; flashUntil=performance.now()+1200; map?.invalidate(); } },
    pickDestination(callback) { pointPicker=null;destinationPicker=callback;layers.deployment=true;syncLayers();open(); },
    cancelPick() {pointPicker=null;destinationPicker=null;},
    pickPoint(sector, callback) { selectedSector = sector; pointPicker = { sector, callback }; layers.deployment = true; syncLayers(); open(); }, picking: () => !!pointPicker, ping: (x, z) => map?.ping(x, z) };
}
