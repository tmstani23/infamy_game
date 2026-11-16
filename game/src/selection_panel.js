// RTS-style panel, bottom left: one card per selected crew member (or townsperson) with a
// portrait, its type, health bar and what it is doing. Only reads the state; clicking a card asks the
// crew input to select just that unit.
import { healthBar } from './render/health.js';
import { portrait } from './portraits.js';
import { prisonerOf } from './sim/police.js';

// frontier town workers read as Worker, not Civilian (Tim 2026-11-08)
export const entityName = (units, e, type = e.type) => e.worker ? 'Worker' : unitName(units, type);
export const unitName = (units, type) => units.types[type]?.name || units.models?.[type]?.name || (type.charAt(0).toUpperCase() + type.slice(1)).replace(/_/g, ' ');

// What a unit is doing, in a word or two, from the state alone (no DOM, so Node can check it)
export function unitStatus(e, state) {
  if (e.prisoner) return `In jail: bail ${e.prisoner.bail} ryo at the police HQ`;
  if (e.dead) return 'Dead';
  if (e.garrison) return e.garrison.zone && !e.garrison.fort ? 'Inside a building' : 'Garrisoned in stockade';
  if (e.jailed) return `In jail, out in ${Math.ceil((e.jailed.until - state.tick) / 20)}s`;
  if (e.downed) { const x = Object.values(state.entities).find(o => o.execute?.target === e.id)?.execute; return x ? (x.arrest ? 'Being arrested' : 'Being finished off') : 'Downed'; }
  if(e.distracted?.source&&e.distracted.until>state.tick)return 'Charmed';
  if(e.crewJob)return e.crewJob.phase==='returning'?'Rejoining group':e.crewJob.kind==='loot'?'Collecting loot':'Finishing off';
  if (e.markScrub) return 'Removing mark';
  if (e.deployment?.scattered) return 'Scattered: '+e.deployment.scattered.phase.toLowerCase();
  if (e.deployment?.transfer) {
    const t=e.deployment.transfer,to=t.to==='hero'?'Hero group':t.to==='home'?'HQ reserves':state.deployment?.sectors.find(s=>s.id===t.to)?.name||t.to;
    return `${t.status==='blocked'?'Transfer blocked':'Transferring'} to ${to}`;
  }
  if(e.deployment?.awaitingAssignment)return 'Waiting for assignment';
  if(e.buffs?.charming?.until>state.tick)return 'Charming';
  if (e.execute) return e.execute.arrest ? 'Arresting' : 'Finishing off';
  if ((e.buffs?.stunned?.until ?? 0) > state.tick) return 'Stunned';
  if (e.brace) return 'Bracing (Reprisal)';
  if (e.spearSweep) return 'Sweeping Cut';
  if (e.spearCombo) return 'Threefold Thrust';
  if (e.swing) return 'Fighting';
  if (e.type === 'civilian') {
    if (e.scared) return 'Scared';
    if (e.flee) return 'Running away';
    if (e.talk) return 'Chatting';
    if (e.anim === 'bow') return 'Praying';
    return e.anim === 'walk' || e.anim === 'run' ? 'Walking' : 'Idle';
  }
  // a rickshaw or omnibus says what it is doing itself (Tim 2026-11-10: a staying omnibus read 'Patrolling')
  if (e.type === 'omnibus' || e.type === 'rickshaw') return e.stored ? 'In the stable' : e.recall ? 'Going to the stable' : e.driver ? 'Driven by you' : e.vorder?.kind === 'stay' ? 'Staying' : e.vorder?.kind === 'move' ? 'Driving there' : e.vorder?.kind === 'follow' && (e.anim === 'run' || e.anim === 'trot') ? 'Following' : e.vorder?.kind === 'follow' ? 'Waiting to follow' : 'Parked';
  const task=state.deployment?.clans[e.owner]?.sectors[e.deployment?.group];
  if(!e.deployment?.duty?.manual){if(task?.recovery)return task.recovery.state;if(task?.operation?.units?.includes(e.id))return task.operation.kind.replaceAll('_',' ')+', '+task.operation.state;if(e.deployment?.duty?.status)return e.deployment.duty.status;}
  const k = e.order?.kind, moving = e.anim === 'walk' || e.anim === 'run';
  if (k === 'stop') return 'Passive (stopped)';
  if (e.order?.garrison) return 'Patrolling';
  if (k === 'follow') return 'Following';
  if (k === 'attack') return 'Attacking';
  if (k === 'attackmove') return 'Attack-moving';
  if (k === 'heal') return 'Going to clinic';
  if (k === 'station') return moving ? 'Moving to hold' : 'Holding';
  return moving ? 'Moving' : 'Idle';
}

// Where a unit is: "Teahouse, Waterfront" inside a building, just the district outside.
// info = game/data/buildings.json (the building names)
export function unitWhere(e, state, district, info = {}) {
  const zone = district.name || 'Street';
  if (e?.prisoner) return `${info.names?.police_hq || 'Police HQ'}, ${zone}`;
  if (!e || e.place === 'street') return zone;
  const b = Object.values(state.businesses).find(b => b.room === e.place);
  const art = b && district.buildings[Number(b.id.slice(1))]?.art;
  const name = info.names?.[art] || (e.place.charAt(0).toUpperCase() + e.place.slice(1)).replace(/_/g, ' ');
  return `${name}, ${zone}`;
}

const css = ([r, g, b]) => `rgb(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0})`;

// skip(ids): hide the panel for this selection (a lone enemy or townsperson shows in the target frame instead)
// workers(): town workers picked with a box (Tim 2026-11-08): [{ id, wid, status, ...unit-like }] when two or more are
// selected; a card click asks pickWorker(wid) to select just that one (it then shows in the target frame)
export function createSelectionPanel({ root, game, units, catalog, crewInput, where = () => '', skip = () => false, hideOwnedBy = () => null, onInspect = () => {}, workers = () => [], pickWorker = () => {} }) {
  let shown = '';
  const cards = {};
  let lastDown = { id: null, t: 0 };   // a second press on the same unit's card within 400 ms: all of its type nearby
  root.addEventListener('mousedown', e => {
    const card = e.target.closest('.card');
    const did = card?.dataset.id || card?.dataset.ids?.split(',')[0], now = performance.now();
    if (did && lastDown.id === did && now - lastDown.t < 400 && crewInput.selectTypeOf?.(did)) { lastDown = { id: null, t: 0 }; return; }
    lastDown = { id: did || null, t: now };
    if (card?.dataset.wid) { pickWorker(card.dataset.wid); return; }
    if (card?.dataset.ids) { crewInput.select(card.dataset.ids.split(',')); return; }
    if (card) {crewInput.select([card.dataset.id]);onInspect(card.dataset.id);}
  });

  // Fit (Tim 2026-11-16): every selected unit shows in the pane, its picture and health bar; the cards shrink step by
  // step until they all fit (no scrolling, nothing cut off). Only when even the smallest tiles do not fit, one card per
  // unit type takes over (count and their health together).
  const LEVELS = [[], ['snug'], ['tight'], ['many'], ['many', 'tiny'], ['many', 'tiny', 'micro']], ALL = [...new Set(LEVELS.flat())];
  let fitKey = '', fitDirty = true, grouping = false;
  const overflows = () => root.scrollHeight > root.clientHeight + 1 || root.scrollWidth > root.clientWidth + 1;
  function setLevel(i) { for (const c of ALL) root.classList.toggle(c, LEVELS[i].includes(c)); }
  function fit() { for (let i = 0; i < LEVELS.length; i++) { setLevel(i); if (!overflows()) return true; } return false; }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { fitDirty = true; }).observe(root);
  function drawGroups(groups) {
    groups.sort((a, b) => b.ids.length - a.ids.length || (a.t < b.t ? -1 : 1));
    const key = 'g|' + groups.map(g => `${g.t}:${g.ids.join('.')}`).join(',');
    if (key !== shown) {
      shown = key; root.innerHTML = ''; for (const id in cards) delete cards[id];
      for (const g of groups) {
        const e = game.state.entities[g.ids[0]], c = document.createElement('div');
        c.className = 'card'; c.dataset.ids = g.ids.join(',');
        c.innerHTML = '<div class="pic"><em class="grp"></em></div><div class="info"><b></b><div class="hp"><div class="fill"></div></div><i></i><s></s></div>';
        c.querySelector('b').textContent = `${entityName(units, e, e.civ || e.type)} x${g.ids.length}`;
        root.appendChild(c);
        cards['g:' + g.t] = { c, pic: c.querySelector('.pic'), grp: c.querySelector('.grp'), fill: c.querySelector('.fill'), status: c.querySelector('i'), where: c.querySelector('s'), model: e.model, hasPic: false };
      }
    }
    for (const g of groups) {
      const k = cards['g:' + g.t]; if (!k) continue;
      if (!k.hasPic) { const url = portrait(catalog, k.model); if (url) { k.pic.style.backgroundImage = `url(${url})`; k.hasPic = true; } }
      let hp = 0, max = 0, down = 0; for (const id of g.ids) { const e = game.state.entities[id]; if (!e) continue; hp += Math.max(0, e.hp || 0); max += e.maxHp || 0; if (e.downed) down++; }
      const { frac, color } = healthBar(hp, max || 1);
      k.fill.style.width = `${frac * 100}%`; k.fill.style.background = css(color);
      const st = down ? `${down} down` : 'Click to pick these';
      if (k.status.textContent !== st) k.status.textContent = st;
      k.c.title = `${g.ids.length} selected: ${Math.ceil(hp)} of ${max} health in all`;
      { const ns = new Set(g.ids.map(id => crewInput.groupOf?.(id) || 0)), n = ns.size === 1 ? [...ns][0] || '' : ''; if (k.grp.textContent !== String(n)) k.grp.textContent = n; }   // their group, when they share one
    }
  }
  function update() {
    const picked = crewInput.selected().length ? [] : workers();
    const byId = picked.length ? Object.fromEntries(picked.map(w => [w.id, w])) : null;
    const unit = id => byId ? byId[id] : game.state.entities[id] || prisonerOf(game.state, id);
    const owner = hideOwnedBy();
    // your own crew show in the crew panel, not here; your war troops (and other units that are not crew) show here only (Tim 2026-11-12)
    const crewOf = u => owner && (u.owner ?? u.omnibusOwner ?? u.horseOwner) === owner && !u.warTroop;
    let ids = byId ? picked.map(w => w.id) : crewInput.selected().filter(unit).filter(id => !crewOf(unit(id)));
    root.hidden = !ids.length || (!byId && skip(ids));
    if (root.hidden) return;
    const selKey = ids.join(',');
    if (selKey !== fitKey) { fitKey = selKey; fitDirty = true; grouping = false; }
    // one card per unit type only when the single cards cannot fit even as the smallest tiles; a click picks that type
    const groups = !byId && grouping ? Object.values(ids.reduce((o, id) => { const u = unit(id), t = u.type; (o[t] ||= { t, ids: [] }).ids.push(id); return o; }, {})) : null;
    root.classList.toggle('grouped', !!groups);
    if (groups) { drawGroups(groups); if (fitDirty) { fitDirty = false; fit(); } return; }
    draw(ids, unit);
    if (fitDirty) { fitDirty = false; if (!fit() && !byId && ids.length > 1) { grouping = true; fitDirty = true; } }
  }
  function draw(ids, unit) {
    const key = ids.join(',');
    if (key !== shown) {
      shown = key; fitDirty = true;
      root.innerHTML = '';
      for (const id in cards) delete cards[id];
      for (const id of ids) {
        const e = unit(id);
        const c = document.createElement('div');
        c.className = 'card';
        c.dataset.id = id;
        if (e.wid != null) c.dataset.wid = e.wid;
        c.innerHTML = '<div class="pic"><em class="grp"></em></div><div class="info"><b></b><div class="hp"><div class="fill"></div></div><i></i><s></s></div>';
        c.querySelector('b').textContent = ((e.cannon || e.surveyor) && e.name) || entityName(units, e, e.civ || e.type);
        root.appendChild(c);
        cards[id] = { c, pic: c.querySelector('.pic'), grp: c.querySelector('.grp'), fill: c.querySelector('.fill'), status: c.querySelector('i'), where: c.querySelector('s'), model: e.model, hasPic: false };
      }
    }
    for (const id of ids) {
      const e = unit(id), k = cards[id];
      if (!k.hasPic) {
        const url = portrait(catalog, k.model);
        if (url) { k.pic.style.backgroundImage = `url(${url})`; k.hasPic = true; }
      }
      const { frac, color } = healthBar(e.hp, e.maxHp);
      k.fill.style.width = `${frac * 100}%`;
      k.fill.style.background = css(color);
      const st = e.status ?? unitStatus(e, game.state);
      if (k.status.textContent !== st) k.status.textContent = st;
      const at = where(e);
      if (k.where.textContent !== at) k.where.textContent = at;
      { const n = crewInput.groupOf?.(id) || ''; if (k.grp.textContent !== String(n)) k.grp.textContent = n; }   // control group number (Tim 2026-11-12)
      k.c.classList.toggle('down', !!e.downed);
      k.c.classList.toggle('jailed', !!e.prisoner);
      k.c.title = e.prisoner ? `${unitName(units, e.type)}: ${st}` : `${((e.cannon || e.surveyor) && e.name) || entityName(units, e, e.civ || e.type)}: ${Math.ceil(e.hp)} / ${e.maxHp}, ${at}`;
    }
  }
  return { update };
}
