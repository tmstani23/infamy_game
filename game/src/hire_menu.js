// Hire panel and the crew count in the HUD (ryo has its own badge, src/ryo_badge.js). Reads the game state and sends
// 'hire' commands only; the rules in sim/clans.js decide what actually happens.
import { hireStats, escapeHireText } from './hire_stats.js';
import { portrait } from './portraits.js';
import { msConcept } from './menu_shell.js';
const title = s => s[0].toUpperCase() + s.slice(1);
// Look of the hire page: the shared menu shell (menu_shell.css, menu restyle 2026-11-10) plus the size and place of this window
const STYLE = `
#hire.hm { left: 50%; top: 12vh; transform: translateX(-50%); width: min(860px, 94vw); min-width: min(800px, 94vw); }   /* min-width: a size saved for the old, narrower menu still fits the cards (Tim 2026-11-08) */
#hire.hm .ms-card { cursor: pointer; min-height: 150px; }
#hire.hm .ms-pick { display: flex; align-items: center; gap: 10px; margin-top: 8px; padding: 7px 10px; border: 1px solid #3d352a; border-radius: 7px; background: #0d1013; min-height: 40px; }
#hire.hm .ms-pick.idle { justify-content: center; color: #8c8f8c; }
#hire.hm .ms-total { display: flex; flex-direction: column; align-items: flex-end; min-width: 104px; } #hire.hm .ms-total b { color: #f0d07a; }
@media (max-width: 700px) { #hire.hm .ms-lay { grid-template-columns: 1fr; } #hire.hm .ms-aside { display: none; } }`;


export function createHireMenu({ panel, money, game, units, heroId, send, catalog = null, openStash = () => {} }) {
  if (typeof document !== 'undefined' && !document.getElementById('hm-style')) { const st = document.createElement('style'); st.id = 'hm-style'; st.textContent = STYLE; document.head.appendChild(st); }
  panel.classList?.add('hm', 'ms');
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
    const patient = /^p\d+$/.test(id) ? Number(id.slice(1)) : null, prisoner = /^j\d+$/.test(id) ? Number(id.slice(1)) : null;
    send(patient !== null ? { id: heroId, type: 'dismiss', patient, business: b.id } : prisoner !== null ? { id: heroId, type: 'dismiss', prisoner, business: b.id } : { id: heroId, type: 'dismiss', unit: id, business: b.id });
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
    if(e.target.closest?.('[data-hire-close]')) {open=false;planned=null;update();return;}
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

  // concept art when the model has one (sharper, Tim 2026-11-10), else the sprite portrait
  const face = (type, model) => { const t = units.types[type] || {}, m = model || t.sprite || type; return msConcept(m) || (catalog ? portrait(catalog, m, () => { shown = ''; queueShown = ''; }) : null); };
  const faceStyle = url => url ? ` style="background-image:url('${url}')"` : '';
  const cls = url => url && url.includes('/stills/') ? ' concept' : '';
  // what waits behind the one in training, in order, same kinds grouped: portrait, name and count (Tim 2026-11-08)
  function queuedRow(queue) {
    const rest = queue.slice(1), runs = [];
    rest.forEach((q, i) => { const last = runs.at(-1); if (last?.unit === q.unit) { last.n++; last.end = i + 1; } else runs.push({ unit: q.unit, n: 1, end: i + 1 }); });
    const chip = r => `<span class="ms-qchip"><span class="ms-thumb${cls(face(r.unit))}"${faceStyle(face(r.unit))}></span><b>${escapeHireText(units.types[r.unit]?.name || title(r.unit))}${r.n > 1 ? ` x${r.n}` : ''}</b>`
      + `<button class="ms-btn" data-hire-unqueue="${r.end}" title="Cancel one (full refund)">Cancel</button></span>`;
    return `<div class="ms-sec"><span>Up next</span><b>${rest.length ? `${rest.length} queued` : 'Nothing else queued'}</b></div>${rest.length ? `<div class="ms-chips">${runs.map(chip).join('')}</div>` : ''}`;
  }
  // the one in training now: portrait, name, time left and a bar (built here so the shared training bar text stays as it is)
  function trainingRow(h, c) {
    const total = h.duration || units.types[h.unit].hireSeconds * (game.state.businesses[h.business]?.kind === 'hideout' ? (units.rules.hideout?.hireTimeFactor || 1) : 1);
    const done = Math.max(0, Math.min(1, 1 - h.left / Math.max(0.001, total)));
    return `<div class="ms-sec"><span>In training</span><b>${c.queue.length} in queue</b></div><div class="ms-row"><span class="ms-thumb${cls(face(h.unit))}"${faceStyle(face(h.unit))}></span>`
      + `<span class="ms-grow"><b>${escapeHireText(units.types[h.unit]?.name || title(h.unit))}</b> <span class="ms-small">${Math.max(0, h.left).toFixed(1)} s left</span>`
      + `<div class="ms-prog" role="progressbar" aria-label="Training" aria-valuenow="${Math.round(done * 100)}"><i style="width:${(done * 100).toFixed(1)}%"></i></div></span>`
      + `<button class="ms-btn" data-hire-unqueue="0" title="Cancel the one in training (full refund)">Cancel</button></div>`;
  }
  // the building you hire in, as on the map
  const buildingArt = b => { const i = Number(String(b?.id || '').slice(1)); return game.scenery?.find?.(s => s.building === i)?.item?.file || null; };

  function update() {
    const c = clan();
    if (!c) return;
    const isSettler = k => !!units.types[k]?.settler, crewQueued = c.queue.filter(q => !isSettler(q.unit)).length, settlerQueued = c.queue.length - crewQueued;
    const crew = game.clans.crewCount(c.id), cap = game.clans.crewCap(c.id), settlers = game.clans.settlersOf(c.id).length;
    money.textContent = `crew ${crew + crewQueued}/${cap}${settlers || settlerQueued ? ` · settlers ${settlers + settlerQueued}` : ''}`;

    const b = teahouse();
    if (!b || b.kind !== 'hideout') { armedDismiss = null; dismissView = false; }
    if (!b) open = false;
    panel.hidden = !open;
    if (!open) return;
    // the hire page (Tim 2026-11-08: easy to use, easy to see; restyled 2026-11-10 in the war camp panel look): the building and
    // clan coins on the left, a grid of crew cards (portrait, name, short stats, price), one bar to choose how many and confirm,
    // then the training under way. Pages instead of a scrollbar when a clan has more than hirePerPage kinds.
    const per = units.rules.hirePerPage ?? 6, pages = Math.max(1, Math.ceil(hireable.length / per));
    page = Math.max(0, Math.min(page, pages - 1));
    const pager = (n, at) => `<div class="ms-foot"><span class="ms-small">${n > 1 ? `Page ${at + 1} of ${n}` : ''}</span><span>${n > 1 ? `<button class="ms-btn" data-hire-page="-1" ${at ? '' : 'disabled'}>Prev</button><button class="ms-btn" data-hire-page="1" ${at < n - 1 ? '' : 'disabled'}>Next</button>` : ''}</span></div>`;
    const factor = b.kind === 'hideout' ? units.rules.hideout?.hireTimeFactor ?? 1 : 1;
    const room = k => units.types[k]?.settler ? (units.rules.settlers?.maxQueue ?? 10) - settlerQueued : Math.min(cap - crew - crewQueued, units.rules.maxQueue - crewQueued);
    const cards = hireable.map((k, i) => {
      if (Math.floor(i / per) !== page) return '';
      const t = units.types[k], price = game.clans.hirePrice(c.id, k), st = t.settler ? null : hireStats(k, t);
      const can = price !== null && c.ryo >= price && room(k) > 0;
      const special = t.settler ? 'Unarmed, founds towns' : st.specials.filter(x => !/critical|dodge/.test(x.name)).map(x => x.name).join(', ') || 'Fighter';
      const tip = escapeHireText(`${t.name || title(k)}: ${t.hp} health, ${t.settler ? 'unarmed' : `${st.damage} damage every ${Number(st.interval.toFixed(2))} s (${Number(st.dps.toFixed(1))} per second), reach ${t.attackRange}`}, trains in ${t.hireSeconds * factor} s.${st ? st.specials.map(x => ` ${x.name}: ${x.about}`).join('') : ''}`);
      return `<button class="ms-card${planned === i ? ' sel' : ''}${can ? '' : ' off'}" data-pick="${i}" title="${tip}">`
        + `<span class="ms-hot">${i + 1}</span><span class="ms-face${cls(face(k))}"${faceStyle(face(k))}></span>`
        + `<span class="ms-t">${escapeHireText(t.name || title(k))}</span>`
        + `<span class="ms-small">${t.hp} hp${st ? `, ${Number(st.dps.toFixed(1))} dps, reach ${t.attackRange}` : ''}</span>`
        + `<span class="ms-small">${escapeHireText(special)}</span>`
        + `<span class="ms-cost"><span class="ms-chip${price !== null && c.ryo < price ? ' short' : ''}"><i></i>${price ?? 'none'}</span><span class="ms-small">${t.hireSeconds * factor} s</span></span></button>`;
    }).join('');
    let bar = `<div class="ms-pick idle">Pick a crewman: click a card or press 1 to ${hireable.length}</div>`;
    if (planned !== null) {
      const unit = hireable[planned], t = units.types[unit], total = Array.from({ length: quantity }, (_, i) => game.clans.hirePrice(c.id, unit, i)).reduce((n, v) => n + v, 0);
      const limit = room(unit), seconds = t.hireSeconds * factor * quantity, ok = c.ryo >= total && quantity <= limit;
      const why = c.ryo < total ? `${Math.ceil(total - c.ryo)} ryo short` : quantity > limit ? (limit > 0 ? `room for ${limit}` : 'no room: crew cap or queue full') : `${seconds} s to train`;
      bar = `<div class="ms-pick"><span class="ms-thumb${cls(face(unit))}"${faceStyle(face(unit))}></span><b class="ms-grow" style="flex:1">${escapeHireText(t.name || title(unit))}</b>`
        + `<input type="number" class="ms-num" min="1" data-hire-input value="${quantity}" title="How many to hire">`
        + `<span class="ms-total"><b>${total} ryo</b><small class="ms-small${ok ? '' : ' ms-bad'}">${why}</small></span>`
        + `<button class="ms-btn" data-hire-cancel>Cancel</button><button class="ms-btn ms-go" data-hire-confirm ${ok ? '' : 'disabled'}>Hire ${quantity}</button></div>`;
    }
    const waiting = '<div data-hire-training></div><div data-hire-queue></div>';
    // every crewman from any zone and in any state, and the clinic's patients (Tim 2026-11-08), plus Dismiss all
    const nameOf = type => escapeHireText(units.types[type]?.name || title(type));
    const dbtn = (id, refund) => `<button class="ms-btn${armedDismiss === id ? ' ms-go' : ''}" data-dismiss="${id}">${armedDismiss === id ? `Confirm, ${refund} ryo` : `Dismiss, ${refund} ryo`}</button>`;
    const crewList = b.kind === 'hideout' ? game.clans.crewOf(c.id).filter(u => !u.dead) : [];
    const dismissRows = b.kind === 'hideout' ? [
      ...crewList.map(u => {
        const group = u.deployment?.group || 'home';
        const zone = group === 'hero' ? 'Hero group' : group === 'home' ? 'HQ reserves' : game.state.deployment?.sectors.find(s => s.id === group)?.name || group;
        const state = u.jailed ? 'jailed' : u.downed ? 'downed' : u.maxHp && u.hp < u.maxHp ? `hurt, ${Math.ceil(u.hp)} of ${u.maxHp} hp` : 'healthy';
        return `<div class="ms-row"><span class="ms-thumb${cls(face(u.type, u.model))}"${faceStyle(face(u.type, u.model))}></span><span class="ms-grow"><b>${nameOf(u.type)}</b> <span class="ms-small">${u.id}</span><br><span class="ms-small">${zone}, ${u.place === 'street' ? 'outdoors' : u.place}, ${state}</span></span>${dbtn(u.id, game.clans.dismissRefund(u.type))}</div>`;
      }),
      ...(c.jail || []).map((p, i) => `<div class="ms-row"><span class="ms-thumb${cls(face(p.unit, p.model))}"${faceStyle(face(p.unit, p.model))}></span><span class="ms-grow"><b>${nameOf(p.unit)}</b><br><span class="ms-small">In jail, bail ${p.bail} ryo</span></span>${dbtn(`j${i}`, game.clans.dismissRefund(p.unit))}</div>`),
      ...c.clinic.map((p, i) => `<div class="ms-row"><span class="ms-thumb${cls(face(p.unit, p.model))}"${faceStyle(face(p.unit, p.model))}></span><span class="ms-grow"><b>${nameOf(p.unit)}</b><br><span class="ms-small">In the clinic, ${p.kind === 'heal' ? 'healing' : 'recovering'}</span></span>${dbtn(`p${i}`, game.clans.dismissRefund(p.unit))}</div>`)
    ] : [];
    const allRefund = crewList.reduce((s, u) => s + game.clans.dismissRefund(u.type), 0) + c.clinic.reduce((s, p) => s + game.clans.dismissRefund(p.unit), 0) + (c.jail || []).reduce((s, p) => s + game.clans.dismissRefund(p.unit), 0);
    const allBtn = dismissRows.length > 1 ? `<button class="ms-btn${armedDismiss === 'all' ? ' ms-go' : ''}" data-dismiss="all">${armedDismiss === 'all' ? `Confirm: dismiss all ${dismissRows.length}, ${allRefund} ryo` : `Dismiss all ${dismissRows.length}, ${allRefund} ryo`}</button>` : '';
    const dper = units.rules.dismissPerPage ?? 6, dpages = Math.max(1, Math.ceil(dismissRows.length / dper));
    dpage = Math.max(0, Math.min(dpage, dpages - 1));
    const dpager = `<div class="ms-foot"><span class="ms-small">${dpages > 1 ? `Page ${dpage + 1} of ${dpages}` : ''}</span><span>${allBtn}${dpages > 1 ? `<button class="ms-btn" data-hire-page="-1" ${dpage ? '' : 'disabled'}>Prev</button><button class="ms-btn" data-hire-page="1" ${dpage < dpages - 1 ? '' : 'disabled'}>Next</button>` : ''}</span></div>`;
    const dismiss = `<div class="ms-sec" title="Any crew, anywhere, even in the clinic or in jail. Click twice to confirm."><span>Dismiss crew, all zones</span><b>Click twice to confirm</b></div>${dismissRows.length ? dismissRows.slice(dpage * dper, dpage * dper + dper).join('') + dpager : '<div class="ms-note">No crew</div>'}`;
    const navigation = b.kind === 'hideout' ? `<div class="ms-tabs"><button data-crew-view="hire" class="ms-tab${dismissView ? '' : ' on'}">Hire</button><button data-crew-view="dismiss" class="ms-tab${dismissView ? ' on' : ''}">Dismiss</button><button data-open-stash class="ms-tab" title="Open the HQ stash">Stash</button></div>` : '';
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? `<div class="ms-note hot">${c.notice.text}</div>` : '';
    const clanWord = c.faction === 'shinobi' ? 'Shinobi' : 'Yakuza', place = b.kind === 'hideout' ? 'Your hideout' : b.kind === 'dojo' ? 'Village dojo' : 'Teahouse';
    const art = buildingArt(b);
    const aside = `<aside class="ms-aside"><div class="ms-art">${art ? `<img alt="" src="${art}">` : ''}</div>`
      + `<span class="ms-tier"${factor !== 1 ? ` title="Hiring at your hideout takes ${factor} times as long as at a ${c.faction === 'shinobi' ? 'dojo' : 'teahouse'}"` : ''}>${place}</span>`
      + `<div class="ms-coins"><div class="ms-coin red" title="Your clan's ryo"><b>${Math.floor(c.ryo)}</b><span>Ryo</span></div><div class="ms-coin" title="All your crew, counting the ones in jail, in the clinic and queued, of your crew cap. ${(c.jail?.length || 0)} in jail."><b>${crew + crewQueued}/${cap}</b><span>Crew</span></div>`
      + `<div class="ms-coin" title="Hires waiting to train"><b>${crewQueued}/${units.rules.maxQueue}</b><span>Queue</span></div><div class="ms-coin" title="Crew in the clinic"><b>${c.clinic.length}</b><span>Clinic</span></div></div></aside>`;
    const head = `<header class="ms-head"><div><div class="ms-eyebrow">${clanWord} clan, ${place.toLowerCase()}</div><h2>${dismissView ? 'Dismiss crew' : 'Hire crew'}</h2></div><button class="ms-btn" data-hire-close title="Close (H or Esc)">Esc</button></header>`;
    const main = `<div class="ms-main">${navigation}${dismissView ? dismiss : `<div class="ms-grid">${cards}</div>${pager(pages, page)}${bar}${waiting}`}${notice}</div>`;
    const html = `${head}<div class="ms-lay">${aside}${main}</div>`;
    const typing = typeof document !== 'undefined' && document.activeElement?.hasAttribute?.('data-hire-input') && panel.contains(document.activeElement);
    if (html !== shown && !typing) { panel.innerHTML = html; shown = html; }
    const progress=panel.querySelector?.('[data-hire-training]'),h=c.queue[0];
    if(progress)progress.innerHTML=h?trainingRow(h,c):'';
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
