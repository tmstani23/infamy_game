import { unitName } from './selection_panel.js';
import { TASK_LABELS } from './deployment_map_data.js';

export function createDeploymentPanel({ root, button, game, units, heroId, crewInput, send, onPickPoint }) {
  root.innerHTML = '<header><h3>DEPLOYMENT</h3><button type="button" class="close">Close</button></header>'
    + '<p>Assign crew to your hero, HQ reserves, or a town sector. Transfers travel without attacking; joining the hero group does not issue Follow.</p>'
    + '<form class="reserves"><label>Keep at HQ: <input class="reserve-target" type="number" min="0" step="1" aria-label="Ready HQ reserve target"> ready crew</label><button type="submit">Apply</button><small>Full-health idle surplus automatically fills sectors, then eligible overflow. Pinned ready crew count toward this target. Raising it does not recall crew.</small></form>'
    + '<div class="rally-controls"><b>Deployment Rally</b><span class="rally-status" role="status"></span><div class="rally-groups"></div><button class="call-rally" type="button">Call Rally</button><small>Three minutes including travel. Issue Follow or movement orders to assemble. Crew keep their numbered groups.</small></div>'
    + '<div class="destinations"></div><div class="transfer"><span class="picked"></span><label>Destination <select aria-label="Transfer destination"></select></label><button type="button" class="send">Transfer selected</button></div>'
    + '<div class="sector-focus" role="status"></div><div class="assignment" hidden><label>Active task <select class="task" aria-label="Sector assignment"></select></label><label class="business-label">Business <select class="guard-business" aria-label="Business to guard"></select></label><div class="assignment-points"></div><div class="assignment-actions"><button type="button" data-point="objective">Set objective on map</button><button type="button" data-point="fallback">Set fallback on map</button><button type="button" data-point="route">Add route point</button><button type="button" class="clear-route">Clear route</button><button type="button" class="save-assignment">Save assignment</button></div></div>'
    + '<div class="shinobi-ops" hidden><label>Ambush target <select class="ambush-target" aria-label="Visible ambush target"></select></label><span class="ambush-preview" role="status"></span><div class="assignment-actions"><button type="button" class="arm-ambush">Arm ambush</button><button type="button" class="cancel-ambush">Cancel armed ambush</button><button type="button" class="retreat">Retreat</button><button type="button" class="start-dance">Start diversion</button></div><small class="dance-status"></small></div>'
    + '<button class="return-assignment" type="button">Return selected to assignment</button><div class="why" role="status"></div><div class="roster"></div><footer></footer>';
  const destinations = root.querySelector('.destinations'), select = root.querySelector('select');
  const roster = root.querySelector('.roster'), picked = root.querySelector('.picked'), why = root.querySelector('.why');
  const transfer = root.querySelector('.send'), rows = new Map(), groupButtons = new Map();
  const reserveTarget = root.querySelector('.reserve-target');
  const assignmentBox = root.querySelector('.assignment'), taskSelect = root.querySelector('.task'), businessSelect = root.querySelector('.guard-business');
  const isNinja = game.state.clans[game.state.entities[heroId].owner].kind === 'ninja';
  const taskKinds = isNinja ? ['watch', 'extraction', 'diversion'] : ['patrol', 'guard', 'hold'];
  for (const task of taskKinds) { const option = document.createElement('option'); option.value = task; option.textContent = TASK_LABELS[task]; taskSelect.appendChild(option); }
  let draft = null;
  const groupNames = { hero: 'Hero group', home: 'HQ reserves', ...Object.fromEntries(game.state.deployment.sectors.map(s => [s.id, s.name])) };
  const groupLabel = id => groupNames[id] || id;
  const owner = () => game.state.entities[heroId]?.owner;
  const rallyGroups = new Map();
  for (const [id, name] of Object.entries(groupNames)) {
    const label = document.createElement('label'), check = document.createElement('input'); check.type = 'checkbox'; check.checked = true;
    label.append(check, document.createTextNode(name)); root.querySelector('.rally-groups').appendChild(label); rallyGroups.set(id, check);
  }
  root.querySelector('.call-rally').addEventListener('click', () => send({ id: heroId, type: 'deployment', action: 'rally', groups: [...rallyGroups].filter(([, c]) => c.checked).map(([id]) => id) }));
  const mine = () => game.deployment.members(owner());
  let target = 'hero', open = false;
  function focusGroup(id) {
    if (!Object.hasOwn(groupNames, id)) return;
    if (target !== id) draft = null;
    target = id; select.value = id;
  }
  const chosen = () => crewInput.selected().filter(id => mine().some(e => e.id === id));
  for (const [id, name] of Object.entries(groupNames)) {
    const option = document.createElement('option'); option.value = id; option.textContent = name; select.appendChild(option);
    const b = document.createElement('button'); b.type = 'button';
    b.addEventListener('click', () => { focusGroup(id); crewInput.select(mine().filter(e => !e.deployment.transfer && e.deployment.group === id).map(e => e.id), { returnPrevious: true }); update(); b.blur(); });
    destinations.appendChild(b); groupButtons.set(id, b);
  }
  function update() {
    root.hidden = !open; button.setAttribute('aria-expanded', String(open));
    const rally = game.rally.status(owner()), time = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    button.textContent = rally.active ? `Deployment · Rally ${time(rally.seconds)}` : 'Deployment';
    if (!open) return;
    root.querySelector('.rally-status').textContent = rally.active ? `${time(rally.seconds)} left · ${rally.arrived}/${rally.called} near hero` : rally.cooldown ? `Ready in ${time(rally.cooldown)}` : 'Ready';
    root.querySelector('.call-rally').disabled = rally.active || rally.cooldown > 0;
    if (document.activeElement !== reserveTarget) reserveTarget.value = game.state.deployment.clans[owner()].reserveTarget;
    const list = mine(), selected = new Set(chosen()), counts = game.deployment.counts(owner());
    for (const [id, b] of groupButtons) {
      const capacity = id === 'hero' ? '/6' : id === 'home' ? '' : '/3';
      const incoming = list.filter(e => e.deployment.transfer?.to === id).length;
      const task = game.state.deployment.clans[owner()]?.sectors[id]?.task;
      b.textContent = `${groupLabel(id)} · ${counts[id]}${capacity}${incoming ? ` (${incoming} incoming)` : ''}${task ? ` · ${task}` : ''}`;
      b.title = 'Select assigned crew';
      b.setAttribute('aria-pressed', String(id === target));
      b.classList.toggle('sector-alert', game.state.tick - (game.state.deployment.clans[owner()]?.sectors[id]?.alertAt ?? -Infinity) < 100);
    }
    const live = new Set(list.map(e => e.id));
    for (const [id, row] of rows) if (!live.has(id)) { row.root.remove(); rows.delete(id); }
    for (const e of list) {
      let row = rows.get(e.id);
      if (!row) {
        const label = document.createElement('div'); label.className = 'member';
        const check = document.createElement('input'); check.type = 'checkbox'; check.setAttribute('aria-label', `Select ${unitName(units, e.type)} ${e.id}`);
        const name = document.createElement('b'), hp = document.createElement('small'), status = document.createElement('span');
        const pinLabel = document.createElement('label'), pin = document.createElement('input'); pin.type = 'checkbox';
        pinLabel.className = 'pin'; pinLabel.append(pin, document.createTextNode('Keep at HQ'));
        pinLabel.title = 'Retain this crew at HQ when home. Field crew are not recalled; manual transfers remain available.';
        pin.setAttribute('aria-label', `Keep ${unitName(units, e.type)} ${e.id} at HQ`);
        pin.addEventListener('change', () => send({ id: heroId, type: 'deployment', action: 'keepAtHQ', units: [e.id], value: pin.checked }));
        label.append(check, name, hp, status, pinLabel); roster.appendChild(label);
        check.addEventListener('change', () => {
          const selected = crewInput.selected();
          crewInput.select(check.checked ? [...selected, e.id] : selected.filter(id => id !== e.id)); update();
        });
        row = { root: label, check, name, hp, status, pin }; rows.set(e.id, row);
      }
      row.check.checked = selected.has(e.id); row.check.disabled = !!e.downed;
      row.name.textContent = `${unitName(units, e.type)} #${e.id}`;
      row.hp.textContent = `${Math.ceil(e.hp)} / ${e.maxHp} HP`;
      row.pin.checked = e.deployment.keepAtHQ;
      const d = e.deployment, t = d.transfer;
      row.status.textContent = e.downed ? 'Downed' : t ? `${groupLabel(t.to)} · ${t.status === 'blocked' ? 'Transfer blocked; retrying' : 'Transferring'}`
        : `${groupLabel(d.group)}${d.arrivedAt != null && game.state.tick - d.arrivedAt < 40 ? ' · Arrived' : ''}${game.deployment.reserveStatus(e) ? ` · ${game.deployment.reserveStatus(e)}` : ''}`;
      row.root.classList.toggle('selected', selected.has(e.id));
    }
    const ids = [...selected], can = game.deployment.canTransfer(heroId, ids, target);
    picked.textContent = `${ids.length} selected`; transfer.disabled = !can.ok;
    const notice = game.state.clans[owner()]?.notice;
    why.textContent = !can.ok && ids.length ? can.why : notice && game.state.tick - notice.tick < 160 ? notice.text : 'Choose crew, then a destination. In-flight crew can be rerouted through this panel.';
    const clan = game.state.clans[owner()];
    const sector = game.state.deployment.clans[owner()].sectors[target];
    assignmentBox.hidden = !sector;
    root.querySelector('.shinobi-ops').hidden = !isNinja || !sector;
    if (isNinja && sector) {
      const targetSelect = root.querySelector('.ambush-target'), enemies = game.shinobiAssignments.targets(owner(), target), old = targetSelect.value;
      const key = enemies.map(e => e.id).join(',');
      if (targetSelect.dataset.targets !== key) {
        targetSelect.replaceChildren(); targetSelect.dataset.targets = key;
        for (const e of enemies) { const o = document.createElement('option'); o.value = e.id; o.textContent = `${game.state.clans[e.owner]?.name || e.owner} · ${unitName(units, e.type)} #${e.id}`; targetSelect.appendChild(o); }
        if (enemies.some(e => e.id === old)) targetSelect.value = old;
      }
      const op = sector.operation, defenders = game.shinobiAssignments.defenders(owner(), targetSelect.value);
      root.querySelector('.ambush-preview').textContent = `${op?.state || 'Watching'}${op?.reason ? ` · ${op.reason}` : ''} · ${defenders} spotted nearby defenders${enemies.length ? '' : ' · No visible street target'}`;
      root.querySelector('.arm-ambush').disabled = !!op || !enemies.length || !game.deployment.members(owner(), target).some(e => !e.downed && !e.deployment.transfer);
      root.querySelector('.cancel-ambush').disabled = op?.state !== 'Ambush armed';
      root.querySelector('.retreat').disabled = !op || op.state === 'Escaping';
      const geishas = game.deployment.members(owner(), target).filter(e => e.type === 'shinobi_geisha' && !e.downed && !e.deployment.transfer && !game.rally.participating(e));
      const wait = geishas.length ? Math.max(0, Math.ceil((Math.min(...geishas.map(e => e.deployment.diversionReadyAt || 0)) - game.state.tick) / 20)) : null;
      root.querySelector('.start-dance').hidden = sector.task !== 'diversion';
      root.querySelector('.start-dance').disabled = !!op || wait === null || wait > 0;
      root.querySelector('.dance-status').textContent = sector.task !== 'diversion' ? '' : wait === null ? 'Assign a Shinobi geisha to use Diversion.' : wait > 0 ? `Geisha ready in ${wait}s` : 'Ready · 1.5s warning, 6s dance, radius 6 · command crew away or hit to break attraction.';
    }
    if (sector) {
      if (!draft) draft = { sector: target, task: sector.task, business: sector.business || '', objective: { ...sector.objective }, fallback: { ...sector.fallback }, route: (sector.route || []).map(p => ({ ...p })) };
      taskSelect.value = draft.task;
      const businesses = Object.values(game.state.businesses).filter(b => b.owner === owner() && b.room && game.deployment.sectorAt(...b.ring) === target);
      const signature = businesses.map(b => b.id).join(',');
      if (businessSelect.dataset.options !== signature) {
        businessSelect.replaceChildren(); businessSelect.dataset.options = signature;
        for (const b of businesses) { const o = document.createElement('option'); o.value = b.id; o.textContent = `${b.kind.replaceAll('_', ' ')} (${b.id})`; businessSelect.appendChild(o); }
      }
      if (!businesses.some(b => b.id === draft.business)) draft.business = businesses[0]?.id || '';
      businessSelect.value = draft.business; root.querySelector('.business-label').hidden = draft.task !== 'guard';
      root.querySelector('.assignment-points').textContent = `Objective: ${draft.objective.x.toFixed(1)}, ${draft.objective.z.toFixed(1)} · Fallback: ${draft.fallback.x.toFixed(1)}, ${draft.fallback.z.toFixed(1)} · Route: ${draft.route.length}/8 points`;
    }
    root.querySelector('.return-assignment').disabled = !chosen().some(id => game.state.deployment.clans[owner()].sectors[game.state.entities[id]?.deployment?.group]);
    root.querySelector('.sector-focus').textContent = sector ? `${groupLabel(target)} · Saved task: ${sector.task} · Objective ${sector.objective.x.toFixed(1)}, ${sector.objective.z.toFixed(1)} · ${counts[target]}/3 assigned including incoming. Choose crew below to transfer here.` : '';
    root.querySelector('footer').textContent = `Clinic: ${clan.clinic.length} · Jail: ${clan.jail?.length || 0} · Automatic transfers wait for six seconds out of hero combat; recovering crew travel home and wait for full health.`;
  }
  taskSelect.addEventListener('change', () => { if (draft) draft.task = taskSelect.value; update(); });
  root.querySelector('.ambush-target').addEventListener('change', update);
  root.querySelector('.arm-ambush').addEventListener('click', () => send({ id: heroId, type: 'deployment', action: 'armAmbush', sector: target, target: root.querySelector('.ambush-target').value }));
  root.querySelector('.cancel-ambush').addEventListener('click', () => send({ id: heroId, type: 'deployment', action: 'cancelAmbush', sector: target }));
  root.querySelector('.retreat').addEventListener('click', () => send({ id: heroId, type: 'deployment', action: 'retreat', sector: target }));
  root.querySelector('.start-dance').addEventListener('click', () => send({ id: heroId, type: 'deployment', action: 'dance', sector: target }));
  businessSelect.addEventListener('change', () => { if (draft) draft.business = businessSelect.value; });
  root.querySelector('.clear-route').addEventListener('click', () => { if (draft) draft.route = []; update(); });
  for (const pick of root.querySelectorAll('[data-point]')) pick.addEventListener('click', () => {
    if (!draft || !onPickPoint || (pick.dataset.point === 'route' && draft.route.length >= 8)) return;
    const saved = draft, key = pick.dataset.point; open = false; update();
    onPickPoint(target, p => { if (key === 'route') saved.route.push(p); else saved[key] = p; draft = saved; open = true; update(); });
  });
  root.querySelector('.save-assignment').addEventListener('click', () => { if (draft) send({ id: heroId, type: 'deployment', action: 'assignment', ...draft }); });
  root.querySelector('.return-assignment').addEventListener('click', () => send({ id: heroId, type: 'deployment', action: 'return', units: chosen() }));
  root.querySelector('.reserves').addEventListener('submit', e => {
    e.preventDefault();
    if (!reserveTarget.checkValidity() || reserveTarget.value === '') return;
    send({ id: heroId, type: 'deployment', action: 'reserveTarget', value: Number(reserveTarget.value) });
    reserveTarget.blur();
  });
  select.addEventListener('change', () => { focusGroup(select.value); update(); });
  transfer.addEventListener('click', () => { send({ id: heroId, type: 'deployment', action: 'transfer', units: chosen(), to: target }); transfer.blur(); });
  root.querySelector('.close').addEventListener('click', () => { open = false; update(); button.focus(); });
  root.addEventListener('mousedown', e => e.stopPropagation());
  root.addEventListener('wheel', e => e.stopPropagation());
  button.addEventListener('click', () => { open = !open; update(); button.blur(); });
  update();
  return { update, openGroup: id => { focusGroup(id); open = true; update(); }, close: () => { open = false; update(); }, isOpen: () => open };
}
