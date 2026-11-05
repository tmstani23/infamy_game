// Hire panel and the crew count in the HUD (ryo has its own badge, src/ryo_badge.js). Reads the game state and sends
// 'hire' commands only; the rules in sim/clans.js decide what actually happens.
import { hireStatsHtml } from './hire_stats.js';
import { trainingBar } from './training_ui.js';
const title = s => s[0].toUpperCase() + s.slice(1);

export function createHireMenu({ panel, money, game, units, heroId, send, openStash = () => {} }) {
  // what your clan may hire (units.json "clan": ninja crew for the Shinobi clan only)
  const owner = game.state.entities[heroId]?.owner;
  const hireable = Object.keys(units.types).filter(type => game.clans.hirePrice(owner, type) !== null);
  let open = false, shown = '', armedDismiss = null, dismissView = false;
  let planned = null,quantity = 1;
  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans[hero()?.owner];
  // the teahouse (Shinobi: the village dojo) the hero is standing in, if any
  // (or your own hideout: slower hiring)
  const teahouse = () => Object.values(game.state.businesses).find(b => (b.kind === game.clans.hallOf(hero()?.owner) || (b.kind === 'hideout' && b.owner === hero()?.owner)) && b.room && b.room === hero()?.place);

  function pick(i) {
    const b = teahouse();
    if (!open || dismissView || !b || !hireable[i]) return;
    planned=i;quantity=1;shown='';update();
  }

  function dismiss(id) {
    const b = teahouse(), c = clan(), u = game.state.entities[id];
    if (!open || !b || b.kind !== 'hideout' || !c || !u) return;
    if (armedDismiss !== id) { armedDismiss = id; shown = ''; update(); return; }
    armedDismiss = null;
    send({ id: heroId, type: 'dismiss', unit: id, business: b.id });
  }

  panel.addEventListener('click', e => {
    const change=e.target.closest?.('[data-hire-quantity]')?.dataset.hireQuantity;
    if(change) {quantity=Math.max(1,Math.min(Math.max(units.rules.maxQueue,units.rules.settlers?.maxQueue || 10),quantity+Number(change)));shown='';update();return;}
    if(e.target.closest?.('[data-hire-cancel]')) {planned=null;shown='';update();return;}
    if(e.target.closest?.('[data-hire-confirm]') && planned!==null) {
      const b=teahouse();if(b)send({id:heroId,type:'hire',business:b.id,unit:hireable[planned],count:quantity});
      planned=null;shown='';update();return;
    }
    if (e.target.closest?.('[data-open-stash]')) {openStash(); return;}
    const view = e.target.closest?.('[data-crew-view]')?.dataset.crewView;
    if (view) { dismissView = view === 'dismiss'; armedDismiss = null; shown = ''; update(); return; }
    const id = e.target.closest?.('[data-dismiss]')?.dataset.dismiss;
    if (id) { dismiss(id); e.target.blur?.(); return; }
    const i = e.target.dataset?.pick;
    if (i !== undefined) { pick(Number(i)); e.target.blur(); }
  });

  function update() {
    const c = clan();
    if (!c) return;
    const isSettler = k => !!units.types[k]?.settler, crewQueued = c.queue.filter(q => !isSettler(q.unit)).length, settlerQueued = c.queue.length - crewQueued;
    const crew = game.clans.crewOf(c.id).length, cap = game.clans.crewCap(c.id), settlers = game.clans.settlersOf(c.id).length;
    money.textContent = `crew ${crew + crewQueued}/${cap}${settlers || settlerQueued ? ` · settlers ${settlers + settlerQueued}` : ''}`;

    const b = teahouse();
    if (!b || b.kind !== 'hideout') { armedDismiss = null; dismissView = false; }
    if (!b) open = false;
    panel.hidden = !open;
    if (!open) return;
    const rows = hireable.map((k, i) => {
      const t = units.types[k], price = game.clans.hirePrice(c.id, k);
      const can = price !== null && c.ryo >= price && (t.settler ? settlerQueued < (units.rules.settlers?.maxQueue ?? 10) : crew + crewQueued < cap && crewQueued < units.rules.maxQueue);
      return `<div class="row"><span>${i + 1}. ${t.name || title(k)}<br><small>${t.hp} hp · hire ${t.hireSeconds * (b.kind === 'hideout' ? units.rules.hideout?.hireTimeFactor ?? 1 : 1)}s<br>${t.settler ? 'unarmed · follows you · 5 are needed to found a town' : hireStatsHtml(k, t)}</small></span>` +
        `<button data-pick="${i}" ${can ? '' : 'disabled'}>${price} ryo</button></div>`;
    }).join('');
    const waiting = '<div data-hire-training></div>';
    let confirmation='';
    if(planned!==null) {
      const unit=hireable[planned],t=units.types[unit],total=Array.from({length:quantity},(_,i)=>game.clans.hirePrice(c.id,unit,i)).reduce((n,v)=>n+v,0);
      const limit=t.settler?(units.rules.settlers?.maxQueue || 10)-settlerQueued:Math.min(cap-crew-crewQueued,units.rules.maxQueue-crewQueued);
      const seconds=t.hireSeconds*(b.kind==='hideout'?(units.rules.hideout?.hireTimeFactor || 1):1)*quantity;
      confirmation=`<div class="hireconfirm"><b>Queue ${quantity} ${t.name || title(unit)}</b><div><button data-hire-quantity="-1">−</button> ${quantity} <button data-hire-quantity="1">+</button></div><div>Total: ${total} ryo · have ${Math.floor(c.ryo)}${c.ryo<total?' · missing '+Math.ceil(total-c.ryo):''}</div><div>Queue space: need ${quantity}, available ${limit}. Training: ${seconds}s plus existing queue. Technology: none.</div><button data-hire-confirm ${c.ryo>=total && quantity<=limit?'':'disabled'}>Confirm training</button><button data-hire-cancel>Cancel</button></div>`;
    }
    const dismissRows = b.kind === 'hideout' ? game.clans.crewOf(c.id)
      .filter(u => !u.guard && !u.dead)
      .map(u => {
        const refund = game.clans.dismissRefund(u.type), confirm = armedDismiss === u.id;
        const available = !u.downed && !u.jailed && u.maxHp && u.hp >= u.maxHp;
        const group = u.deployment?.group || 'home';
        const zone = group === 'hero' ? 'Hero group' : group === 'home' ? 'HQ reserves' : game.state.deployment?.sectors.find(s => s.id === group)?.name || group;
        return `<div class="row"><span>${units.types[u.type]?.name || title(u.type)} · ${u.id}<br><small>${zone} · ${u.place === 'street' ? 'outdoors' : u.place} · ${available ? 'healthy' : 'must be healthy and active'}</small></span>` +
          `<button data-dismiss="${u.id}" ${available ? '' : 'disabled'}>${confirm ? `Confirm · ${refund} ryo` : `Dismiss · ${refund} ryo`}</button></div>`;
      }).join('') : '';
    const dismiss = `<h3>DISMISS CREW · ALL ZONES</h3>${dismissRows || '<div class="waiting">No active crew</div>'}<div class="waiting">Healthy crew from any zone · click twice to confirm</div>`;
    const navigation = b.kind === 'hideout' ? `<div><button data-open-stash>HQ stash</button><button data-crew-view="hire">Hire crew</button><button data-crew-view="dismiss">Dismiss crew · all zones</button></div>` : '';
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? `<div class="notice">${c.notice.text}</div>` : '';
    const html = `${navigation}${dismissView ? dismiss : `<h3>HIRE CREW</h3>${rows}${confirmation}${waiting}`}${notice}<div class="waiting">${dismissView ? 'Select crew above' : `1-${hireable.length} or click, choose quantity, then confirm`} · H / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
    const progress=panel.querySelector?.('[data-hire-training]'),h=c.queue[0];
    if(progress)progress.innerHTML=h?trainingBar(units.types[h.unit]?.name || h.unit,h.left,h.duration || units.types[h.unit].hireSeconds*(game.state.businesses[h.business]?.kind==='hideout'?(units.rules.hideout?.hireTimeFactor || 1):1))+`<div class="waiting">${c.queue.length-1} more queued</div>`:'';
  }

  return {
    update, pick, isOpen: () => open,
    toggle() { open = !open && !!teahouse(); update(); },
    close() { open = false;planned=null; update(); },
  };
}
