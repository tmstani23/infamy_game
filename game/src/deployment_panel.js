import { unitName } from './selection_panel.js';
import { TASK_LABELS } from './deployment_map_data.js';

// Deployment menu (simplified, Tim 2026-10-27): docked on the right of the open game map with the
// Sectors layer on. One crew list grouped by Hero / HQ / sector, "Send selected to", then small
// folding sections for the focused sector's duty, Rally and the HQ reserve. Same sim commands as before.
export function createDeploymentPanel({ root, button, game, units, heroId, crewInput, send, onPickPoint, onOpen = () => {}, onClose = () => {}, onFocus = () => {} }) {
  root.innerHTML = '<header><h3>DEPLOYMENT</h3><button type="button" class="close" title="Close (Esc)">✕</button></header>'
    + '<div class="tabs"></div>'
    + '<details class="roster-details"><summary>Crew roster</summary><div class="roster"></div></details>'
    + '<div class="transfer"><span class="picked"></span><select class="dest" aria-label="Send selected to"></select><button type="button" class="send">Send</button><button type="button" class="return-assignment" title="Selected sector crew stop manual orders and go back to their saved duty">Back to duty</button></div>'
    + '<div class="why" role="status"></div>'
    + '<details class="duty" open><summary></summary><div class="duty-body"><label>Task <select class="task" aria-label="Sector duty"></select></label> <label class="business-label">Business <select class="guard-business" aria-label="Business to guard"></select></label>'
    + '<details><summary>Optional position / route</summary><div class="assignment-actions"><button type="button" data-point="objective" title="Pick the duty point on the map">Set point</button><button type="button" data-point="route" title="Add a route point (up to 8)">+ Route</button><button type="button" class="clear-route">Clear route</button></div></details><button type="button" class="save-assignment">Save assignment</button><small class="assignment-points"></small>'
    + '<div class="shinobi-ops" hidden><button type="button" class="arm-next">Ambush next enemy</button><button type="button" class="cancel-ambush">Cancel target</button><button type="button" class="retreat">Retreat</button><small class="ambush-preview" role="status"></small><div class="recent-targets"></div></div></div></details>'
    + '<details class="rally-controls"><summary>Rally <span class="rally-status"></span></summary><div class="rally-groups"></div><button class="call-rally" type="button">Call Rally</button><small>Ticked groups join your hero for 3 minutes, then walk back.</small></details>'
    + '<details class="reserves"><summary>HQ reserve</summary><form><label>Keep <input class="reserve-target" type="number" min="0" step="1" aria-label="Ready crew kept at HQ"> ready crew at HQ</label> <button type="submit">Apply</button><small>New crew fill your hero group (6) first. Then spare healthy crew go out to empty sectors.</small></form></details>'
    + '<footer></footer>';
  const $ = s => root.querySelector(s);
  const tabs = $('.tabs'), roster = $('.roster'), dest = $('.dest'), sendButton = $('.send'), why = $('.why');
  const reserveTarget = $('.reserve-target'), taskSelect = $('.task'), businessSelect = $('.guard-business');
  const isNinja = game.state.clans[game.state.entities[heroId].owner].kind === 'ninja';
  for (const task of isNinja ? ['watch', 'ambush', 'extraction'] : ['patrol', 'guard']) taskSelect.add(new Option(TASK_LABELS[task], task));
  const sectors = game.state.deployment.sectors;
  const groupNames = { hero: 'Hero group', home: 'HQ', ...Object.fromEntries(sectors.map(s => [s.id, s.name])) };
  const owner = () => game.state.entities[heroId]?.owner;
  const mine = () => game.deployment.members(owner());
  const chosen = () => crewInput.selected().filter(id => mine().some(e => e.id === id));
  const record = id => game.state.deployment.clans[owner()]?.sectors[id];
  let focus = 'hero', open = false, draft = null, dragging = false;
  const tabButtons = new Map(), heads = new Map(), rows = new Map(), rallyChecks = new Map();
  for (const [id, name] of Object.entries(groupNames)) {
    const b = document.createElement('button'); b.type = 'button';
    b.addEventListener('click', () => { setFocus(id); update(); b.blur(); });
    tabs.appendChild(b); tabButtons.set(id, b);
    dest.add(new Option(name, id));
    const head = document.createElement('div'), all = document.createElement('input'), label = document.createElement('b');
    head.className = 'group-head'; all.type = 'checkbox'; all.title = 'Select all of this group';
    all.addEventListener('change', () => {
      const ids = mine().filter(e => (e.deployment.transfer?.to || e.deployment.group) === id && !e.downed).map(e => e.id), sel = crewInput.selected();
      crewInput.select(all.checked ? [...new Set([...sel, ...ids])] : sel.filter(x => !ids.includes(x)), { returnPrevious: true }); update();
    });
    label.addEventListener('click', () => { setFocus(id); update(); });
    head.append(all, label); roster.appendChild(head); heads.set(id, { head, all, label });
    const r = document.createElement('label'), c = document.createElement('input'); c.type = 'checkbox'; c.checked = true;
    r.append(c, document.createTextNode(name)); $('.rally-groups').appendChild(r); rallyChecks.set(id, c);
  }
  function setFocus(id) {
    if (!Object.hasOwn(groupNames, id)) return;
    if (focus !== id) draft = null;
    focus = id; dest.value = id;
    if (record(id)) onFocus(id);
  }
  function row(e) {
    let r = rows.get(e.id);
    if (r) return r;
    const el = document.createElement('div'); el.className = 'member';
    el.draggable = true;
    el.addEventListener('dragstart', ev => {
      const ids = chosen(); dragging = true;
      ev.dataTransfer.setData('application/x-infamy-crew', JSON.stringify(ids.includes(e.id) ? ids : [e.id])); ev.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => { dragging = false; update(); });
    const check = document.createElement('input'); check.type = 'checkbox';
    const name = document.createElement('b'), hp = document.createElement('small'), status = document.createElement('span');
    const pinLabel = document.createElement('label'), pin = document.createElement('input'); pin.type = 'checkbox';
    pinLabel.className = 'pin'; pinLabel.title = 'Keep this one at HQ'; pinLabel.append(pin, document.createTextNode('Keep'));
    pin.addEventListener('change', () => send({ id: heroId, type: 'deployment', action: 'keepAtHQ', units: [e.id], value: pin.checked }));
    check.addEventListener('change', () => { const s = crewInput.selected(); crewInput.select(check.checked ? [...s, e.id] : s.filter(id => id !== e.id)); update(); });
    el.append(check, name, hp, status, pinLabel);
    r = { el, check, name, hp, status, pin, pinLabel }; rows.set(e.id, r); return r;
  }
  const time = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  function update() {
    root.hidden = !open; button.setAttribute('aria-expanded', String(open));
    const rally = game.rally.status(owner());
    button.textContent = rally.active ? `Deployment · Rally ${time(rally.seconds)}` : 'Deployment';
    if (!open) return;
    if (dragging) return;
    const list = mine(), selected = new Set(chosen()), counts = game.deployment.counts(owner());
    for (const [id, b] of tabButtons) {
      const cap = id === 'hero' ? '/6' : id === 'home' ? '' : '/3';
      b.textContent = `${groupNames[id]} ${counts[id]}${cap}`;
      b.setAttribute('aria-pressed', String(id === focus));
      b.classList.toggle('sector-alert', game.state.tick - (record(id)?.alertAt ?? -Infinity) < 100);
    }
    // grouped roster: each heading, then its crew (incoming crew listed under where they are going)
    const live = new Set(list.map(e => e.id));
    for (const [id, r] of rows) if (!live.has(id)) { r.el.remove(); rows.delete(id); }
    const frag = document.createDocumentFragment();
    for (const [id, h] of heads) {
      const members = list.filter(e => (e.deployment.transfer?.to || e.deployment.group) === id);
      h.label.textContent = `${groupNames[id]} · ${members.length}${record(id) ? ` · ${TASK_LABELS[record(id).task] || record(id).task}` : ''}`;
      h.head.classList.toggle('focus', id === focus);
      h.all.checked = members.length > 0 && members.every(e => selected.has(e.id));
      frag.appendChild(h.head);
      for (const e of members) {
        const r = row(e), d = e.deployment, t = d.transfer;
        r.check.checked = selected.has(e.id); r.check.disabled = !!e.downed;
        r.name.textContent = `${unitName(units, e.type)} #${e.id}`;
        r.hp.textContent = `${Math.ceil(e.hp)}/${e.maxHp}`;
        r.status.textContent = e.downed ? 'Downed' : t ? (t.status === 'blocked' ? 'Blocked, retrying' : 'On the way')
          : d.duty?.manual ? 'Manual orders' : e.geishaMode === 'fleeing' ? 'Fleeing' : d.arrivedAt != null && game.state.tick - d.arrivedAt < 40 ? 'Arrived' : id === 'home' ? (game.deployment.reserveStatus(e).split(' · ')[0] || 'Ready') : '';
        r.pinLabel.hidden = id !== 'home'; r.pin.checked = d.keepAtHQ;
        r.el.classList.toggle('selected', selected.has(e.id));
        frag.appendChild(r.el);
      }
    }
    roster.replaceChildren(frag);
    const ids = [...selected], can = game.deployment.canTransfer(heroId, ids, dest.value);
    $('.picked').textContent = `${ids.length} selected → `;
    sendButton.disabled = !ids.length || !can.ok;
    $('.return-assignment').disabled = !ids.some(id => record(game.state.entities[id]?.deployment?.group));
    const notice = game.state.clans[owner()]?.notice;
    why.textContent = ids.length && !can.ok ? can.why : notice && game.state.tick - notice.tick < 160 ? notice.text : '';
    // the focused sector's duty
    const sector = record(focus);
    $('.duty').hidden = !sector;
    if (sector) {
      $('.duty summary').textContent = `${groupNames[focus]} duty`;
      if (!draft) draft = { sector: focus, task: sector.task === 'diversion' ? 'watch' : sector.task, business: sector.business || '', objective: { ...sector.objective }, fallback: { ...sector.fallback }, route: (sector.route || []).map(p => ({ ...p })) };
      taskSelect.value = draft.task;
      const businesses = Object.values(game.state.businesses).filter(b => b.owner === owner() && b.room && game.deployment.sectorAt(...b.ring) === focus);
      const signature = businesses.map(b => b.id).join(',');
      if (businessSelect.dataset.options !== signature) {
        businessSelect.replaceChildren(); businessSelect.dataset.options = signature;
        for (const b of businesses) businessSelect.add(new Option(b.kind.replaceAll('_', ' '), b.id));
      }
      if (!businesses.some(b => b.id === draft.business)) draft.business = businesses[0]?.id || '';
      businessSelect.value = draft.business; $('.business-label').hidden = draft.task !== 'guard';
      const changed = JSON.stringify([draft.task, draft.business, draft.objective, draft.fallback, draft.route]) !== JSON.stringify([sector.task, sector.business || '', sector.objective, sector.fallback, sector.route || []]);
      $('.save-assignment').disabled = !changed;
      $('.assignment-points').textContent = `${counts[focus]}/3 crew · route ${draft.route.length}/8 points${changed ? ' · unsaved changes' : ''}`;
      $('.shinobi-ops').hidden = !isNinja;
      if (isNinja) {
        const own = game.state.deployment.clans[owner()], op = sector.operation, hunt = own.hunt;
        $('.ambush-preview').textContent = sector.recovery?.state || op?.state || (hunt ? 'Hunting selected target' : sector.ambushNext ? 'Waiting for next enemy' : 'Select a remembered target below');
        $('.cancel-ambush').disabled = !hunt && !sector.ambushNext;
        $('.retreat').disabled = !op;
        const list = $('.recent-targets'), enemies = game.shinobiIntelligence.targets(owner());
        const key = enemies.map(e => `${e.id}:${Math.floor(e.age)}:${e.live}`).join(',') + ':' + hunt?.target;
        if (list.dataset.key !== key) {
          list.dataset.key = key; list.replaceChildren();
          for (const e of enemies) {
            const row = document.createElement('button'); row.type = 'button'; row.dataset.target = e.id;
            row.textContent = `${unitName(units, e.type === 'hero' ? e.model : e.type)} · ${e.sector || 'town'} · ${e.tracked ? 'tracked' : e.live ? 'in sight' : `seen ${Math.floor(e.age)}s ago`} · ${hunt?.target === e.id ? 'Armed' : 'Ambush'}`;
            row.addEventListener('click', () => send({ id: heroId, type: 'deployment', action: 'armAmbush', target: e.id })); list.appendChild(row);
          }
        }
      }
    }
    $('.rally-status').textContent = rally.active ? `· ${time(rally.seconds)} left · ${rally.arrived}/${rally.called} near you` : rally.cooldown ? `· ready in ${time(rally.cooldown)}` : '· ready';
    $('.call-rally').disabled = rally.active || rally.cooldown > 0;
    if (document.activeElement !== reserveTarget) reserveTarget.value = game.state.deployment.clans[owner()].reserveTarget;
    const clan = game.state.clans[owner()];
    $('footer').textContent = `Clinic ${clan.clinic.length} · Jail ${clan.jail?.length || 0} · Coming round at HQ ${clan.respawning?.length || 0}`;
  }
  taskSelect.addEventListener('change', () => { if (draft) draft.task = taskSelect.value; update(); });
  businessSelect.addEventListener('change', () => { if (draft) draft.business = businessSelect.value; update(); });
  $('.clear-route').addEventListener('click', () => { if (draft) draft.route = []; update(); });
  for (const pick of root.querySelectorAll('[data-point]')) pick.addEventListener('click', () => {
    if (!draft || !onPickPoint || (pick.dataset.point === 'route' && draft.route.length >= 8)) return;
    const saved = draft, key = pick.dataset.point;
    why.textContent = 'Click a point inside the sector on the map';
    onPickPoint(focus, p => { if (key === 'route') saved.route.push(p); else saved[key] = p; draft = saved; update(); });
  });
  $('.save-assignment').addEventListener('click', () => { if (draft) send({ id: heroId, type: 'deployment', action: 'assignment', ...draft }); });
  $('.arm-next').addEventListener('click', () => send({ id: heroId, type: 'deployment', action: 'armAmbush', sector: focus }));
  $('.cancel-ambush').addEventListener('click', () => send({ id: heroId, type: 'deployment', action: 'cancelAmbush', sector: focus }));
  $('.retreat').addEventListener('click', () => send({ id: heroId, type: 'deployment', action: 'retreat', sector: focus }));
  $('.call-rally').addEventListener('click', () => send({ id: heroId, type: 'deployment', action: 'rally', groups: [...rallyChecks].filter(([, c]) => c.checked).map(([id]) => id) }));
  $('.return-assignment').addEventListener('click', () => crewInput.returnToDutyAndSelectHero());
  $('.reserves form').addEventListener('submit', e => {
    e.preventDefault();
    if (!reserveTarget.checkValidity() || reserveTarget.value === '') return;
    send({ id: heroId, type: 'deployment', action: 'reserveTarget', value: Number(reserveTarget.value) }); reserveTarget.blur();
  });
  dest.addEventListener('change', () => { setFocus(dest.value); update(); });
  sendButton.addEventListener('click', () => { send({ id: heroId, type: 'deployment', action: 'transfer', units: chosen(), to: dest.value }); sendButton.blur(); });
  const show = on => { if (open === on) return; open = on; on ? onOpen(record(focus) ? focus : null) : onClose(); update(); };
  $('.close').addEventListener('click', () => { show(false); button.focus(); });
  for (const type of ['mousedown', 'mouseup', 'click', 'contextmenu', 'pointerdown', 'pointerup', 'wheel']) root.addEventListener(type, e => e.stopPropagation());
  button.addEventListener('click', () => { show(!open); button.blur(); });
  update();
  return { update, openGroup: id => { setFocus(id); show(true); update(); }, close: () => show(false), isOpen: () => open };
}
