// RTS-style panel, bottom left: one card per selected crew member (or townsperson) with a
// portrait, its type, health bar and what it is doing. Only reads the state; clicking a card asks the
// crew input to select just that unit.
import { healthBar } from './render/health.js';
import { portrait } from './portraits.js';
import { prisonerOf } from './sim/police.js';

export const unitName = (units, type) => units.types[type]?.name || units.models?.[type]?.name || (type.charAt(0).toUpperCase() + type.slice(1)).replace(/_/g, ' ');

// What a unit is doing, in a word or two, from the state alone (no DOM, so Node can check it)
export function unitStatus(e, state) {
  if (e.prisoner) return `In jail: bail ${e.prisoner.bail} ryo at the police HQ`;
  if (e.dead) return 'Dead';
  if (e.jailed) return `In jail, out in ${Math.ceil((e.jailed.until - state.tick) / 20)}s`;
  if (e.downed) { const x = Object.values(state.entities).find(o => o.execute?.target === e.id)?.execute; return x ? (x.arrest ? 'Being arrested' : 'Being finished off') : 'Downed'; }
  if(e.distracted?.source&&e.distracted.until>state.tick)return 'Charmed';
  if(e.crewJob)return e.crewJob.phase==='returning'?'Rejoining group':e.crewJob.kind==='loot'?'Collecting loot':'Finishing off';
  if (e.markScrub) return 'Removing mark';
  if (e.deployment?.scattered) return 'Scattered: '+e.deployment.scattered.phase.toLowerCase();
  if (e.deployment?.transfer) {
    const t=e.deployment.transfer,to=t.to==='hero'?'Hero group':t.to==='home'?'HQ reserves':state.deployment?.sectors.find(s=>s.id===t.to)?.name||t.to;
    return `${t.status==='blocked'?'Transfer blocked':'Transferring'} → ${to}`;
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
  const task=state.deployment?.clans[e.owner]?.sectors[e.deployment?.group];
  if(!e.deployment?.duty?.manual){if(task?.recovery)return task.recovery.state;if(task?.operation?.units?.includes(e.id))return task.operation.kind.replaceAll('_',' ')+' · '+task.operation.state;if(e.deployment?.duty?.status)return e.deployment.duty.status;}
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

// Where a unit is: "Teahouse · Waterfront" inside a building, just the district outside.
// info = game/data/buildings.json (the building names)
export function unitWhere(e, state, district, info = {}) {
  const zone = district.name || 'Street';
  if (e?.prisoner) return `${info.names?.police_hq || 'Police HQ'} · ${zone}`;
  if (!e || e.place === 'street') return zone;
  const b = Object.values(state.businesses).find(b => b.room === e.place);
  const art = b && district.buildings[Number(b.id.slice(1))]?.art;
  const name = info.names?.[art] || (e.place.charAt(0).toUpperCase() + e.place.slice(1)).replace(/_/g, ' ');
  return `${name} · ${zone}`;
}

const css = ([r, g, b]) => `rgb(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0})`;

// skip(ids): hide the panel for this selection (a lone enemy or townsperson shows in the target frame instead)
export function createSelectionPanel({ root, game, units, catalog, crewInput, where = () => '', skip = () => false, hideOwnedBy = () => null, onInspect = () => {} }) {
  let shown = '';
  const cards = {};
  root.addEventListener('mousedown', e => {
    const card = e.target.closest('.card');
    if (card) {crewInput.select([card.dataset.id]);onInspect(card.dataset.id);}
  });

  function update() {
    const unit = id => game.state.entities[id] || prisonerOf(game.state, id);
    const ids = crewInput.selected().filter(unit);
    const owner = hideOwnedBy();
    root.hidden = !ids.length || (owner && ids.every(id => unit(id).owner === owner)) || skip(ids);
    if (root.hidden) return;
    root.classList.toggle('many', ids.length > 8);
    const key = ids.join(',');
    if (key !== shown) {
      shown = key;
      root.innerHTML = '';
      for (const id in cards) delete cards[id];
      for (const id of ids) {
        const e = unit(id);
        const c = document.createElement('div');
        c.className = 'card';
        c.dataset.id = id;
        c.innerHTML = '<div class="pic"></div><div class="info"><b></b><div class="hp"><div class="fill"></div></div><i></i><s></s></div>';
        c.querySelector('b').textContent = unitName(units, e.civ || e.type);
        root.appendChild(c);
        cards[id] = { c, pic: c.querySelector('.pic'), fill: c.querySelector('.fill'), status: c.querySelector('i'), where: c.querySelector('s'), model: e.model, hasPic: false };
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
      const st = unitStatus(e, game.state);
      if (k.status.textContent !== st) k.status.textContent = st;
      const at = where(e);
      if (k.where.textContent !== at) k.where.textContent = at;
      k.c.classList.toggle('down', !!e.downed);
      k.c.classList.toggle('jailed', !!e.prisoner);
      k.c.title = e.prisoner ? `${unitName(units, e.type)}: ${st}` : `${unitName(units, e.civ || e.type)}: ${Math.ceil(e.hp)} / ${e.maxHp}, ${at}`;
    }
  }
  return { update };
}
