// The full game map (M, Tim 2026-10-20, docs/territory_plan.md): the whole district over the
// screen with the same fog of war, territory (sim/territory.js) and switches for its layers.
// The game keeps running underneath (no pause, as in multiplayer). Hover a business for its
// owner and payout; click anywhere (a business: its door) to look there and close the map.
// Drawn by src/minimap.js in its big mode. Only reads the state.
import { createMinimap } from './minimap.js';
import { createDeploymentMapData } from './deployment_map_data.js';
import { createDeploymentMapOverlay } from './deployment_map_overlay.js';
import { portrait } from './portraits.js';

const NAMES = { pawnshop: 'Pawnshop', bathhouse: 'Bathhouse', sake_brewery: 'Sake brewery', manor: 'Manor', customs_house: 'Customs house', warehouse: 'Warehouse', teahouse: 'Teahouse', shop: 'Shop', tenements: 'Nagaya tenements', gambling_den: 'Gambling den', clinic: 'Clinic', police_box: 'Police box',
  police_hq: 'Police HQ', moneylender: "Moneylender's house", hideout: 'Hideout', dojo: 'Village dojo', contract_board: 'Contract board' };
const LAYERS = [['deployment', 'Sectors'], ['territory', 'Territory'], ['businesses', 'Businesses'], ['police', 'Police'], ['units', 'Units']];

export function createGameMap({ root, deploymentRoot, game, district, view, fog, heroId, clan = 'player', units, catalog, selected, send, onManageSector, onSelectSector = () => {}, onSelectCrew = () => {}, onSelectTarget = () => {}, onReturnToDuty = null }) {
  if(deploymentRoot)root.appendChild(deploymentRoot);
  const canvas = root.querySelector('canvas'), tip = root.querySelector('.maptip'), bar = root.querySelector('.maplayers'), side = root.querySelector('.mapside');
  const layers = { deployment: false, territory: true, businesses: true, police: true, units: true };
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
    const html = `<h4>Season · day ${Math.min(s.day, s.cycles)} of ${s.cycles}</h4>${rows}${quarters}${legend}`;
    if (side.innerHTML !== html) side.innerHTML = html;
  }

  const isOpen = () => !root.hidden;
  function open() {
    root.hidden = false;
    deploymentData.update(true, true);
    if (!map) {
      // made on first open, when the canvas has its size on screen
      map = createMinimap({ canvas, game, district, view, fog, heroId, clan, selected, send, big: true, layers, onHover: hover, onPick: close, overlay });
    }
    map.invalidate(); drawSide();
  }
  function close() { root.hidden = true; tip.hidden = true; pointPicker = null; destinationPicker=null; }
  const toggle = () => (isOpen() ? close() : open());

  let shownData = null;
  function update() {
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
