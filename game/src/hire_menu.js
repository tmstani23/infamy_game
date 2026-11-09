// Hire panel and the crew count in the HUD (ryo has its own badge, src/ryo_badge.js). Reads the game state and sends
// 'hire' commands only; the rules in sim/clans.js decide what actually happens.
import { hireStats, escapeHireText } from './hire_stats.js';
import { portrait } from './portraits.js';
import { trainingBar } from './training_ui.js';
const title = s => s[0].toUpperCase() + s.slice(1);
// Look of the hire page: dark lacquer panel, gold accents, one card per crew kind
const STYLE = `
#hire.hm { left: 50%; top: 14vh; transform: translateX(-50%); width: min(820px, 94vw); min-width: min(780px, 94vw); max-height: none;   /* min-width: a size saved for the old, narrower menu still fits the cards (Tim 2026-11-08) */
  overflow: hidden; padding: 14px 16px 10px;
  background: linear-gradient(#17140f, #0d0b08); border: 1px solid #6b5326; border-radius: 10px; box-shadow: 0 10px 40px #000c, inset 0 0 0 1px #000; }
#hire.hm .hm-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
#hire.hm .hm-head h3 { margin: 0; font-size: 15px; letter-spacing: .14em; color: #e9c27a; }
#hire.hm .hm-head span { color: #b9ae96; font-size: 13px; } #hire.hm .hm-head b { color: #f3e3bb; }
#hire.hm .hm-tabs { display: flex; gap: 6px; margin-bottom: 8px; }
#hire.hm .hm-tabs button { padding: 4px 10px; border-radius: 5px; border: 1px solid #4a3c22; background: #1c1810; color: #cbbd9c; cursor: pointer; }
#hire.hm .hm-tabs button.on { border-color: #d4aa5a; color: #ffe2a0; background: #2a2214; }
#hire.hm .hm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
#hire.hm .hm-card { position: relative; display: grid; grid-template-columns: 54px 1fr; grid-template-rows: auto auto auto auto; column-gap: 9px; row-gap: 3px; text-align: left;
  padding: 8px; border-radius: 8px; border: 1px solid #3e3420; background: linear-gradient(#211c13, #15120c); color: #e9d6a8; cursor: pointer; font: inherit; transition: border-color .12s, transform .12s, box-shadow .12s; }
#hire.hm .hm-card:hover { border-color: #b8914a; transform: translateY(-1px); box-shadow: 0 4px 12px #0008; }
#hire.hm .hm-card.sel { border-color: #ffd34d; box-shadow: 0 0 0 1px #ffd34d, 0 0 16px #ffd34d40; background: linear-gradient(#2c2414, #19140b); }
#hire.hm .hm-card.off { opacity: .45; }
#hire.hm .hm-key { position: absolute; top: 5px; right: 7px; font: 700 10px/1 system-ui; font-style: normal; color: #8c7c58; }
#hire.hm .hm-pic { grid-row: 1 / span 4; width: 54px; height: 66px; border-radius: 6px; border: 1px solid #000; background: #2a2620 center 20% / cover no-repeat; box-shadow: inset 0 0 8px #0008; }
#hire.hm .hm-name { font-size: 13.5px; color: #f6e6bd; padding-right: 12px; }
#hire.hm .hm-stats { display: flex; gap: 8px; font-size: 12px; color: #d8c9a4; font-variant-numeric: tabular-nums; }
#hire.hm .hm-special { font-size: 11px; color: #a89c80; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#hire.hm .hm-foot { display: flex; align-items: baseline; justify-content: space-between; }
#hire.hm .hm-price { font-weight: 700; color: #ffd34d; font-size: 13px; } #hire.hm .hm-foot small { color: #8c826c; font-size: 11px; }
#hire.hm .hm-pager { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 6px; color: #a89c80; }
#hire.hm .hm-bar { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 8px 10px; border-radius: 8px; background: #0a0907; border: 1px solid #3e3420; min-height: 38px; }
#hire.hm .hm-bar.hm-idle { color: #8c826c; font-style: italic; justify-content: center; }
#hire.hm .hm-pick { font-weight: 700; color: #f6e6bd; flex: 1; }
#hire.hm .hm-qty { display: flex; align-items: center; gap: 6px; } #hire.hm .hm-qty b { min-width: 22px; text-align: center; font-size: 15px; color: #fff3d0; }
#hire.hm .hm-qty button { width: 28px; height: 28px; border-radius: 5px; border: 1px solid #4a3c22; background: #1c1810; color: #e9d6a8; font-size: 16px; cursor: pointer; }
#hire.hm .hm-total { display: flex; flex-direction: column; align-items: flex-end; min-width: 110px; } #hire.hm .hm-total b { color: #ffd34d; }
#hire.hm .hm-total small { color: #9a9078; font-size: 11px; } #hire.hm .hm-total small.bad { color: #ff8a6b; }
#hire.hm .hm-cancel { padding: 7px 12px; border-radius: 6px; border: 1px solid #4a3c22; background: #1c1810; color: #cbbd9c; cursor: pointer; }
#hire.hm .hm-go { padding: 7px 18px; border-radius: 6px; border: 1px solid #ffd34d; background: linear-gradient(#e0b04c, #a57a26); color: #1a1208; font-weight: 800; cursor: pointer; box-shadow: 0 0 12px #ffd34d40; }
#hire.hm .hm-go:disabled { opacity: .4; cursor: default; box-shadow: none; }
#hire.hm .hm-train:empty { display: none; }
#hire.hm .hm-queue { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
#hire.hm .hm-queue small { color: #9a8e74; letter-spacing: .06em; text-transform: uppercase; font-size: 11px; margin-right: 2px; }
#hire.hm .hm-q { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px 3px 3px; border: 1px solid #5a4724; border-radius: 6px; background: #1d1810; color: #efe0b8; font-size: 13px; }
#hire.hm .hm-q i { width: 26px; height: 30px; border-radius: 4px; background: #2a2620 center 20% / cover no-repeat; border: 1px solid #000; }
#hire.hm .hm-q em { font-style: normal; color: #ffd36a; font-weight: 700; }
#hire.hm .hm-arrow { color: #6b5a38; }
#hire.hm .hm-q button { margin-left: 2px; width: 20px; height: 20px; padding: 0; border-radius: 4px; border: 1px solid #6b3a2a; background: #2a1712; color: #e8a08a; font-size: 11px; cursor: pointer; }
#hire.hm .hm-q button:hover, #hire.hm .hm-stop:hover { background: #4a2218; color: #fff; }
#hire.hm .hm-stop { padding: 4px 10px; border-radius: 6px; border: 1px solid #6b3a2a; background: #2a1712; color: #e8a08a; font-size: 12px; cursor: pointer; margin-right: 6px; } #hire.hm .hm-train { margin-top: 8px; }
@media (max-width: 700px) { #hire.hm .hm-grid { grid-template-columns: repeat(2, 1fr); } }`;


export function createHireMenu({ panel, money, game, units, heroId, send, catalog = null, openStash = () => {} }) {
  if (typeof document !== 'undefined' && !document.getElementById('hm-style')) { const st = document.createElement('style'); st.id = 'hm-style'; st.textContent = STYLE; document.head.appendChild(st); }
  panel.classList?.add('hm');
  // what your clan may hire (units.json "clan": ninja crew for the Shinobi clan only)
  const owner = game.state.entities[heroId]?.owner;
  const hireable = Object.keys(units.types).filter(type => !units.types[type].settler && game.clans.hirePrice(owner, type) !== null);   // settlers: Land Office (E1 2026-11-05)
  let open = false, shown = '', armedDismiss = null, dismissView = false;
  let queueShown = '';
  let planned = null,quantity = 1,page = 0,dpage = 0;   // no scrollbars (Tim 2026-11-08): the list pages, picking a type opens its own confirm view
  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans[hero()?.owner];
  // the teahouse (Shinobi: the village dojo) the hero is standing in, if any
  // (or your own hideout: slower hiring)
  const teahouse = () => Object.values(game.state.businesses).find(b => (b.kind === game.clans.hallOf(hero()?.owner) || (b.kind === 'hideout' && b.owner === hero()?.owner)) && b.room && b.room === hero()?.place);

  function pick(i) {
    const b = teahouse();
    if (!open || dismissView || !b || !hireable[i]) return;
    if (planned === i) planned = null; else { planned = i; quantity = 1; }
    shown = ''; update();
  }

  // id: a crewman's entity id, 'pN' for clinic patient N, or 'all'; two clicks to confirm
  function dismiss(id) {
    const b = teahouse(), c = clan();
    if (!open || !b || b.kind !== 'hideout' || !c) return;
    if (armedDismiss !== id) { armedDismiss = id; shown = ''; update(); return; }
    armedDismiss = null;
    const patient = /^p\d+$/.test(id) ? Number(id.slice(1)) : null;
    send(patient !== null ? { id: heroId, type: 'dismiss', patient, business: b.id } : { id: heroId, type: 'dismiss', unit: id, business: b.id });
  }

  const maxQty = () => Math.max(units.rules.maxQueue, units.rules.settlers?.maxQueue || 10);
  // typed hire count (Tim 2026-11-09: number settings are typeable boxes)
  panel.addEventListener('keydown', e => { if (e.target.closest?.('input')) { e.stopPropagation(); if (e.code === 'Enter' || e.code === 'NumpadEnter') e.target.blur(); } });
  panel.addEventListener('change', e => {
    if (!e.target.hasAttribute?.('data-hire-input')) return;
    quantity = Math.max(1, Math.min(maxQty(), Math.round(Number(e.target.value)) || 1)); shown = ''; update();
  });
  panel.addEventListener('click', e => {
    const change=e.target.closest?.('[data-hire-quantity]')?.dataset.hireQuantity;
    if(change) {quantity=Math.max(1,Math.min(maxQty(),quantity+Number(change)));shown='';update();return;}
    const unqueue=e.target.closest?.('[data-hire-unqueue]')?.dataset.hireUnqueue;
    if(unqueue!==undefined) {send({id:heroId,type:'hire',action:'cancel',index:Number(unqueue)});queueShown='';return;}
    if(e.target.closest?.('[data-hire-cancel]')) {planned=null;shown='';update();return;}
    const turn=e.target.closest?.('[data-hire-page]')?.dataset.hirePage;
    if(turn) {if(dismissView)dpage+=Number(turn);else page+=Number(turn);shown='';update();return;}
    if(e.target.closest?.('[data-hire-confirm]') && planned!==null) {
      const b=teahouse();if(b)send({id:heroId,type:'hire',business:b.id,unit:hireable[planned],count:quantity});
      planned=null;shown='';update();return;
    }
    if (e.target.closest?.('[data-open-stash]')) {openStash(); return;}
    const view = e.target.closest?.('[data-crew-view]')?.dataset.crewView;
    if (view) { dismissView = view === 'dismiss'; armedDismiss = null; shown = ''; update(); return; }
    const id = e.target.closest?.('[data-dismiss]')?.dataset.dismiss;
    if (id) { dismiss(id); e.target.blur?.(); return; }
    const card = e.target.closest?.('[data-pick]');
    if (card) { pick(Number(card.dataset.pick)); card.blur(); }
  });

  // what waits behind the one in training, in order, same kinds grouped: portrait, name and ×N (Tim 2026-11-08)
  function queuedRow(queue) {
    const rest = queue.slice(1), runs = [];
    rest.forEach((q, i) => { const last = runs.at(-1); if (last?.unit === q.unit) { last.n++; last.end = i + 1; } else runs.push({ unit: q.unit, n: 1, end: i + 1 }); });
    const chip = r => {
      const t = units.types[r.unit] || {}, pic = catalog ? portrait(catalog, t.sprite || r.unit, () => { queueShown = ''; }) : null;
      return `<span class="hm-q">${pic ? `<i style="background-image:url('${pic}')"></i>` : ''}<b>${escapeHireText(t.name || title(r.unit))}</b>${r.n > 1 ? `<em>×${r.n}</em>` : ''}`
        + `<button data-hire-unqueue="${r.end}" title="Cancel one (full refund)">✕</button></span>`;
    };
    const now = queue[0] ? `<button class="hm-stop" data-hire-unqueue="0">✕ Cancel training</button>` : '';
    return `<div class="hm-queue">${now}${rest.length ? `<small>Up next · ${rest.length}</small>${runs.map(chip).join('<span class="hm-arrow">›</span>')}` : '<small>Nothing else queued</small>'}</div>`;
  }

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
    // the hire page (Tim 2026-11-08: easy to use, easy to see): a grid of crew cards (portrait, price, health, damage
    // per second, reach, special), then one bar to choose how many and confirm, then the training under way. Pages
    // instead of a scrollbar when a clan has more than hirePerPage kinds.
    const per = units.rules.hirePerPage ?? 6, pages = Math.max(1, Math.ceil(hireable.length / per));
    page = Math.max(0, Math.min(page, pages - 1));
    const pager = (n, at) => n > 1 ? `<div class="hm-pager"><button data-hire-page="-1" ${at ? '' : 'disabled'}>◀ Previous</button><small>Page ${at + 1} of ${n}</small><button data-hire-page="1" ${at < n - 1 ? '' : 'disabled'}>Next ▶</button></div>` : '';
    const factor = b.kind === 'hideout' ? units.rules.hideout?.hireTimeFactor ?? 1 : 1;
    const room = k => units.types[k]?.settler ? (units.rules.settlers?.maxQueue ?? 10) - settlerQueued : Math.min(cap - crew - crewQueued, units.rules.maxQueue - crewQueued);
    const cards = hireable.map((k, i) => {
      if (Math.floor(i / per) !== page) return '';
      const t = units.types[k], price = game.clans.hirePrice(c.id, k), st = t.settler ? null : hireStats(k, t);
      const can = price !== null && c.ryo >= price && room(k) > 0, pic = catalog ? portrait(catalog, t.sprite || k, () => { shown = ''; }) : null;
      const special = t.settler ? 'Unarmed · founds towns' : st.specials.filter(x => !/critical|dodge/.test(x.name)).map(x => x.name).join(' · ') || 'Fighter';
      const tip = escapeHireText(`${t.name || title(k)}: ${t.hp} health, ${t.settler ? 'unarmed' : `${st.damage} damage every ${Number(st.interval.toFixed(2))} s (${Number(st.dps.toFixed(1))} per second), reach ${t.attackRange}`}, trains in ${t.hireSeconds * factor} s.${st ? st.specials.map(x => ` ${x.name}: ${x.about}`).join('') : ''}`);
      return `<button class="hm-card${planned === i ? ' sel' : ''}${can ? '' : ' off'}" data-pick="${i}" title="${tip}">`
        + `<i class="hm-key">${i + 1}</i><span class="hm-pic"${pic ? ` style="background-image:url(${pic})"` : ''}></span>`
        + `<b class="hm-name">${escapeHireText(t.name || title(k))}</b>`
        + `<span class="hm-stats"><span title="Health">♥ ${t.hp}</span>${st ? `<span title="Damage per second">⚔ ${Number(st.dps.toFixed(1))}</span><span title="Reach">↔ ${t.attackRange}</span>` : ''}</span>`
        + `<span class="hm-special">${escapeHireText(special)}</span>`
        + `<span class="hm-foot"><span class="hm-price">${price ?? '—'} ryo</span><small>${t.hireSeconds * factor} s</small></span></button>`;
    }).join('');
    let bar = `<div class="hm-bar hm-idle">Pick a crewman: click a card or press 1–${hireable.length}</div>`;
    if (planned !== null) {
      const unit = hireable[planned], t = units.types[unit], total = Array.from({ length: quantity }, (_, i) => game.clans.hirePrice(c.id, unit, i)).reduce((n, v) => n + v, 0);
      const limit = room(unit), seconds = t.hireSeconds * factor * quantity, ok = c.ryo >= total && quantity <= limit;
      const why = c.ryo < total ? `${Math.ceil(total - c.ryo)} ryo short` : quantity > limit ? (limit > 0 ? `room for ${limit}` : 'no room: crew cap or queue full') : `${seconds} s to train`;
      bar = `<div class="hm-bar"><span class="hm-pick">${escapeHireText(t.name || title(unit))}</span>`
        + `<span class="hm-qty"><button data-hire-quantity="-1" ${quantity > 1 ? '' : 'disabled'}>−</button><input type="number" class="numbox" min="1" data-hire-input value="${quantity}"><button data-hire-quantity="1">+</button></span>`
        + `<span class="hm-total"><b>${total} ryo</b><small class="${ok ? '' : 'bad'}">${why}</small></span>`
        + `<button class="hm-cancel" data-hire-cancel>Cancel</button><button class="hm-go" data-hire-confirm ${ok ? '' : 'disabled'}>Hire ${quantity}</button></div>`;
    }
    const waiting = '<div class="hm-train" data-hire-training></div><div data-hire-queue></div>';
    // every crewman from any zone and in any state, and the clinic's patients (Tim 2026-11-08), plus Dismiss all
    const nameOf = type => escapeHireText(units.types[type]?.name || title(type));
    const dbtn = (id, refund) => `<button data-dismiss="${id}">${armedDismiss === id ? `Confirm · ${refund} ryo` : `Dismiss · ${refund} ryo`}</button>`;
    const crewList = b.kind === 'hideout' ? game.clans.crewOf(c.id).filter(u => !u.dead) : [];
    const dismissRows = b.kind === 'hideout' ? [
      ...crewList.map(u => {
        const group = u.deployment?.group || 'home';
        const zone = group === 'hero' ? 'Hero group' : group === 'home' ? 'HQ reserves' : game.state.deployment?.sectors.find(s => s.id === group)?.name || group;
        const state = u.jailed ? 'jailed' : u.downed ? 'downed' : u.maxHp && u.hp < u.maxHp ? `hurt · ${Math.ceil(u.hp)}/${u.maxHp} hp` : 'healthy';
        return `<div class="row"><span>${nameOf(u.type)} · ${u.id}<br><small>${zone} · ${u.place === 'street' ? 'outdoors' : u.place} · ${state}</small></span>${dbtn(u.id, game.clans.dismissRefund(u.type))}</div>`;
      }),
      ...c.clinic.map((p, i) => `<div class="row"><span>${nameOf(p.unit)}<br><small>In the clinic · ${p.kind === 'heal' ? 'healing' : 'recovering'}</small></span>${dbtn(`p${i}`, game.clans.dismissRefund(p.unit))}</div>`)
    ] : [];
    const allRefund = crewList.reduce((s, u) => s + game.clans.dismissRefund(u.type), 0) + c.clinic.reduce((s, p) => s + game.clans.dismissRefund(p.unit), 0);
    const allBtn = dismissRows.length > 1 ? `<div class="hm-pager"><button data-dismiss="all">${armedDismiss === 'all' ? `Confirm: dismiss all ${dismissRows.length} · ${allRefund} ryo` : `Dismiss all ${dismissRows.length} · ${allRefund} ryo`}</button></div>` : '';
    const dper = units.rules.dismissPerPage ?? 6, dpages = Math.max(1, Math.ceil(dismissRows.length / dper));
    dpage = Math.max(0, Math.min(dpage, dpages - 1));
    const dismissShown = dismissRows.slice(dpage * dper, dpage * dper + dper).join('') + pager(dpages, dpage) + allBtn;
    const dismiss = `<h3>DISMISS CREW · ALL ZONES</h3>${dismissRows.length ? dismissShown : '<div class="waiting">No crew</div>'}<div class="waiting">Any crew, anywhere, even in the clinic · click twice to confirm</div>`;
    const navigation = b.kind === 'hideout' ? `<div class="hm-tabs"><button data-crew-view="hire" class="${dismissView ? '' : 'on'}">Hire crew</button><button data-crew-view="dismiss" class="${dismissView ? 'on' : ''}">Dismiss crew</button><button data-open-stash>HQ stash</button></div>` : '';
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? `<div class="notice">${c.notice.text}</div>` : '';
    const head = `<div class="hm-head"><h3>${b.kind === 'hideout' ? 'YOUR HIDEOUT' : 'HIRE CREW'}</h3><span>Crew <b>${crew + crewQueued} / ${cap}</b> · <b>${Math.floor(c.ryo).toLocaleString()}</b> ryo</span></div>`;
    const html = `${head}${navigation}${dismissView ? dismiss : `<div class="hm-grid">${cards}</div>${pager(pages, page)}${bar}${waiting}`}${notice}<div class="waiting">${dismissView ? 'Select crew above' : 'Hover a card for full stats'} · H / Esc close</div>`;
    const typing = document.activeElement?.hasAttribute?.('data-hire-input') && panel.contains(document.activeElement);
    if (html !== shown && !typing) { panel.innerHTML = html; shown = html; }
    const progress=panel.querySelector?.('[data-hire-training]'),h=c.queue[0];
    if(progress)progress.innerHTML=h?trainingBar(units.types[h.unit]?.name || title(h.unit),h.left,h.duration || units.types[h.unit].hireSeconds*(game.state.businesses[h.business]?.kind==='hideout'?(units.rules.hideout?.hireTimeFactor || 1):1)):'';
    // the queue list is only rebuilt when it changes, so its cancel buttons take clicks
    const qbox=panel.querySelector?.('[data-hire-queue]'),qhtml=h?queuedRow(c.queue):'';
    if(qbox&&(qhtml!==queueShown||!qbox.innerHTML&&qhtml)){qbox.innerHTML=qhtml;queueShown=qhtml;}
  }

  return {
    update, pick, isOpen: () => open,
    toggle() { open = !open && !!teahouse(); update(); },
    close() { open = false;planned=null; update(); },
  };
}
