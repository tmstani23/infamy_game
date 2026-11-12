// War camp panel (frontier plan F6, checkpoint 4): presentation only, the sim checks every command again.
// Opens from a left-click on your own camp's buildings or the red war coin. Tabs: Build (camp building cards
// with their art, under-construction list), Train (a queue per training building, troop cap bar), Hall (hall
// upgrade). Picking a building card places it: its art follows the mouse with a green or red ring and the
// reason in a hint; left-click places (Shift keeps placing), right-click or Esc cancels. No scrollbars: pages.
const CSS = `
#warcamp{position:fixed;left:50%;top:50%;transform:translate(-50%,-52%);z-index:40;width:690px;color:#eadfc6;font:13px/1.35 system-ui,sans-serif}
#warcamp[hidden]{display:none}
#warcamp .win{background:linear-gradient(180deg,#171c21,#0f1317);border:1px solid #4d3b2a;border-top:2px solid #c9473d;border-radius:8px;box-shadow:0 10px 40px #000a,0 0 0 1px #000;overflow:hidden}
#warcamp header{display:flex;justify-content:space-between;align-items:flex-start;padding:12px 16px 10px;border-bottom:1px solid #2a2d31;background:linear-gradient(90deg,#2a1513,#14181c 60%)}
#warcamp .eyebrow{color:#e0786c;letter-spacing:.16em;font-size:10px;text-transform:uppercase}
#warcamp h2{margin:2px 0 0;font-size:22px;font-weight:500}
#warcamp button{border:1px solid #61543e;border-radius:5px;background:#20262d;color:#eadfc6;padding:5px 11px;font:600 12px system-ui;cursor:pointer}
#warcamp button:hover{border-color:#ffe0a1}#warcamp button:disabled{opacity:.45;cursor:default}
#warcamp .go{border-color:#e07b6c;background:linear-gradient(#8e2d26,#5e1c18);color:#ffe9dc;letter-spacing:.06em;box-shadow:0 0 12px #c9473d55}
#warcamp .lay{display:grid;grid-template-columns:190px 1fr}
#warcamp aside{padding:12px 14px;border-right:1px solid #303238;background:linear-gradient(180deg,#9a3a3233,#11171d 70%);text-align:center}
#warcamp aside .art{height:140px;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 55%,#c9473d40,transparent 65%);position:relative}
#warcamp aside .art img.hall{max-width:170px;max-height:136px;filter:drop-shadow(0 6px 8px #000)}
#warcamp aside .art img.flag{position:absolute;right:6px;top:0;height:92px;filter:drop-shadow(0 4px 6px #000)}
#warcamp .tier{display:inline-block;margin-top:6px;color:#d8b56c;font-size:10px;letter-spacing:.15em;text-transform:uppercase}
#warcamp .small{font-size:11px;color:#9aa3a6}
#warcamp .coins{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}
#warcamp .coin{border-radius:8px;padding:5px 4px;background:radial-gradient(#2b2520,#121110 75%);box-shadow:0 0 0 2px #6a5636,0 0 0 3px #1a140c;cursor:help}
#warcamp .coin b{display:block;font-size:16px;color:#f6e6bf}#warcamp .coin span{font-size:9px;letter-spacing:.14em;color:#c9b07a;text-transform:uppercase}
#warcamp .coin.red{background:radial-gradient(#2b1714,#0f0a09 75%);box-shadow:0 0 0 2px #8e2d26,0 0 0 3px #2a0f0d,0 0 10px #c9473d55}#warcamp .coin.red span{color:#ee9a8c}
#warcamp .upg{margin-top:12px;border:1px solid #826f4c;border-radius:6px;padding:7px;background:#14130f}
#warcamp .upg b{display:block;color:#d8b56c;font-size:11px;letter-spacing:.1em;text-transform:uppercase}
#warcamp main{padding:10px 14px 12px;min-height:360px}
#warcamp .tabs{display:flex;gap:2px;border-bottom:1px solid #3c3b36}
#warcamp .tab{padding:7px 16px 6px;border:1px solid #3a3530;border-bottom:none;border-radius:6px 6px 0 0;background:#161a1e;color:#9b9c98;font:600 12px system-ui;letter-spacing:.1em;text-transform:uppercase;box-shadow:none}
#warcamp .tab.on{background:linear-gradient(#5e1c18,#2a1513);color:#ffe9dc;border-color:#c9473d}
#warcamp .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
#warcamp .card{position:relative;border:1px solid #3d352a;border-radius:7px;background:radial-gradient(ellipse at 50% 40%,#2a2620,#121314 75%);padding:4px 4px 6px;text-align:center;height:132px;box-sizing:border-box;cursor:pointer}
#warcamp .card .pic{height:74px;display:grid;place-items:center}#warcamp .card .pic img{max-width:110px;max-height:72px;filter:drop-shadow(0 4px 4px #000)}
#warcamp .card .t{font-size:12px;font-weight:600;color:#f3e3bd;margin-top:2px}
#warcamp .cost{display:flex;justify-content:center;gap:5px;margin-top:3px;flex-wrap:wrap}
#warcamp .chip{display:flex;align-items:center;gap:3px;font-size:11px;color:#eadfc6;background:#0a0c0e;border:1px solid #3a3530;border-radius:10px;padding:0 6px 0 3px}
#warcamp .chip i{width:10px;height:10px;border-radius:2px;display:inline-block}#warcamp .chip.timber i{background:linear-gradient(#b07a45,#6b4424)}#warcamp .chip.stone i{background:linear-gradient(#b8b8b0,#6e6e68);border-radius:50%}#warcamp .chip.ryo i{background:radial-gradient(#ffe08a,#b58a2a);border-radius:50%}
#warcamp .chip.short{border-color:#8e2d26;color:#ed8b7c}
#warcamp .badge{position:absolute;top:5px;right:6px;font-size:10px;color:#c9b07a;background:#0a0c0e;border:1px solid #3a3530;border-radius:8px;padding:0 5px}
#warcamp .card.sel{border-color:#65ef88;box-shadow:0 0 12px #65ef8855,inset 0 0 12px #65ef8822}
#warcamp .card.lock .pic,#warcamp .card.lock .t{filter:grayscale(1) brightness(.55)}#warcamp .card.lock{cursor:help}
#warcamp .lockline{font-size:10px;color:#ed8b7c;margin-top:3px}
#warcamp .card:hover{border-color:#ffe0a1}
#warcamp .foot{display:flex;justify-content:space-between;align-items:center;margin-top:9px}
#warcamp .sec{display:flex;justify-content:space-between;color:#9b9c98;font-size:10px;letter-spacing:.12em;text-transform:uppercase;border-bottom:1px solid #3c3b36;padding:10px 0 5px}
#warcamp .sec b{color:#d8b56c;font-weight:500}
#warcamp .site{display:grid;grid-template-columns:44px 1fr 46px 64px;gap:10px;align-items:center;padding:5px 0;border-bottom:1px solid #252c31}
#warcamp .thumb{width:44px;height:36px;border:1px solid #665944;border-radius:6px;background:radial-gradient(#2a2620,#151514);display:grid;place-items:center;overflow:hidden}#warcamp .thumb img{max-width:40px;max-height:32px;opacity:.8}
#warcamp .prog{height:8px;background:#22262e;border-radius:4px;overflow:hidden;border:1px solid #000}#warcamp .prog i{display:block;height:100%;background:linear-gradient(#f0d07a,#b58a2a)}
#warcamp .pipw{display:flex;gap:3px}#warcamp .pipw i{width:9px;height:14px;border-radius:3px 3px 1px 1px;background:#8fb6c9;display:inline-block}#warcamp .pipw i.off{background:#2a2f36}
#warcamp .tq{display:grid;grid-template-columns:96px 1fr;gap:12px;padding:9px 0;border-bottom:1px solid #252c31;align-items:center}
#warcamp .tq .bimg{height:70px;display:grid;place-items:center;border:1px solid #3d352a;border-radius:7px;background:radial-gradient(ellipse at 50% 40%,#2a2620,#121314 75%)}#warcamp .tq .bimg img{max-width:88px;max-height:62px}
#warcamp .unit{display:flex;align-items:center;gap:10px}
#warcamp .port{width:44px;height:44px;border:1px solid #826f4c;border-radius:6px;background:radial-gradient(#3a2a20,#151514);display:grid;place-items:center;overflow:hidden;font:700 16px Georgia,serif;color:#d8b56c}#warcamp .port img{width:44px;height:44px}
#warcamp input.num{width:52px;background:#07090b;border:1px solid #826f4c;border-radius:4px;padding:4px 6px;text-align:right;font:600 15px system-ui;color:#f3e3bd;box-shadow:inset 0 0 8px #000;-moz-appearance:textfield;appearance:textfield}
#warcamp input.num::-webkit-inner-spin-button,#warcamp input.num::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
#warcamp .pips{display:flex;gap:4px;margin-top:6px;align-items:center}#warcamp .pips i{width:16px;height:16px;border-radius:50%;border:1px solid #826f4c;background:#14130f;display:inline-block}#warcamp .pips i.q{background:#5e1c18;border-color:#c9473d}
#warcamp .capbar{display:flex;gap:2px;margin-top:4px}#warcamp .capbar i{flex:1;height:10px;background:#22262e;border-radius:2px}#warcamp .capbar i.u{background:#c9473d}#warcamp .capbar i.w{background:#7e5a28}
#warcamp .why{color:#ed8b7c;font-size:12px;min-height:16px;margin-top:6px}
#warcamp .unl{display:flex;gap:8px;margin-top:6px}#warcamp .unl .thumb{width:60px;height:46px}#warcamp .unl .thumb img{max-width:56px;max-height:42px;opacity:1}
#warcamphint{position:fixed;pointer-events:none;z-index:22;padding:8px 11px;background:rgba(12,18,24,.94);max-width:300px;border:1px solid;border-radius:8px;font:12px/1.4 system-ui}
#warcamphint[hidden]{display:none}
`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nice = t => (t || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const PER_PAGE = 8, ROWS = 3;

export function createWarCampPanel({ game, heroId, view, catalog, frontierData, send, blocked = () => false, onStart = () => {} }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const war = () => game.frontier?.war;
  const W = () => war()?.data || frontierData?.war || {};
  const hero = () => game.state.entities[heroId];
  const rec = id => game.state.frontier?.wars?.list?.[id] || null;
  const artName = type => frontierData?.townArt?.[type] || type;
  const artUrl = type => { const n = artName(type), kind = catalog?.items?.[n]?.kind || 'buildings'; return `art/${kind}/${n}.png`; };
  const images = new Map();
  const imageOf = type => { const u = artUrl(type); if (!images.has(u)) { const i = new Image(); i.src = u; images.set(u, i); } return images.get(u); };
  const chips = (cost, camp) => Object.entries(cost || {}).filter(([, v]) => v).map(([r, v]) => {
    const has = r === 'ryo' ? camp?.chest ?? Infinity : camp?.stock?.[r] ?? Infinity;
    return `<span class="chip ${r}${has < v ? ' short' : ''}" title="${esc(`${v} ${r}`)}"><i></i>${v}</span>`;
  }).join('');

  const root = document.createElement('div'); root.id = 'warcamp'; root.hidden = true; document.body.append(root);
  let open = null, tab = 'build', page = 0, tpage = 0, sig = '', why = '';
  const counts = {};   // typed train / hire counts by box, kept across refreshes
  function show(id) { if (!rec(id) || rec(id).attacker !== hero()?.owner) return false; open = id; tab = 'build'; page = tpage = 0; why = ''; sig = ''; root.hidden = false; onStart(); fill(); return true; }
  function close() { open = null; root.hidden = true; }

  function fill() {
    const w = rec(open); if (!w) { close(); return; }
    const c = w.camp, v = war()?.troopView(open) || { troops: 0, queued: 0, cap: 0 }, B = W().buildings || {}, U = W().units || {};
    const hall = c.buildings.find(b => b.type === 'camp_hall'), tier = hall?.tier || 1, town = game.state.frontier.settlements?.[w.town];
    const clan = game.state.clans?.[w.attacker], C = W().camp || {};
    const list = war()?.campBuildList(open) || [], pages = Math.max(1, Math.ceil(list.length / PER_PAGE)); page = Math.min(page, pages - 1);
    const sites = c.buildings.filter(b => b.stage === 'site' || b.upgrade);
    const mine = game.state.entities[heroId]?.owner;   // checkpoint 7: only this clan's specials show
    const trainers = c.buildings.filter(b => b.stage === 'built' && (war()?.trainsAt(b.type, mine) || []).length);
    const trows = trainers.flatMap(b => war().trainsAt(b.type, mine).map(u => [b, u]));   // one row per building and unit, ROWS a page (checkpoint 5: a barracks trains three)
    const tpages = Math.max(1, Math.ceil(trows.length / ROWS)); tpage = Math.min(tpage, tpages - 1);
    const me = hero()?.owner, ryoOf = u => war()?.ryoOf?.(me, u) ?? U[u]?.ryo ?? 0, ticksOf = u => war()?.ticksOf?.(me, u) ?? U[u]?.trainTicks ?? 0;
    const builders = id => (c.workers || []).filter(k => k.project === id).length, maxB = W().builders ?? 3;
    const next = JSON.stringify([open, tab, page, tpage, why, Math.floor(c.chest), Math.floor(c.stock.timber), Math.floor(c.stock.stone), v, (c.workers || []).length, (c.workerTraining || []).length,
      c.buildings.map(b => [b.id, b.stage, Math.floor(100 * (b.upgrade || b).progress / Math.max(1, (b.upgrade || b).need) || 0), b.queue?.length || 0, b.tier || 1, builders(b.id)]), list.map(x => x.ok), placing?.kind]);
    if (next === sig || root.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    sig = next;
    const num = (key, d = 1) => `<input class="num" type="text" inputmode="numeric" data-n="${esc(key)}" value="${esc(counts[key] ?? d)}">`;
    const coin = (cls, n, label, tip) => `<div class="coin ${cls}" title="${esc(tip)}"><b>${n}</b><span>${label}</span></div>`;
    let body = '';
    if (tab === 'build') {
      body = `<div class="grid">${list.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).map(x => {
        const d = B[x.type] || {}, tip = `${nice(x.type)}: ${Object.entries(d.cost || {}).map(([r, n]) => `${n} ${r}`).join(', ')}.${d.cap ? ` Adds ${d.cap} to the troop cap.` : ''}${(war()?.trainsAt(x.type) || []).length ? ` Trains ${war().trainsAt(x.type).join(', ')}.` : ''}${x.need.length ? ` Needs ${x.need.join(' and ')}.` : ''}${x.reason && !x.need.length ? ` ${x.reason}.` : ''}`;
        return `<div class="card${x.need.length ? ' lock' : ''}${placing?.kind === x.type ? ' sel' : ''}" data-build="${esc(x.type)}" title="${esc(tip)}">${x.max ? `<span class="badge">${x.count}/${x.max}</span>` : ''}
          <div class="pic"><img src="${esc(artUrl(x.type))}" alt=""></div><div class="t">${esc(nice(x.type))}</div>
          ${x.need.length ? `<div class="lockline">Needs ${esc(x.need.map(n => n.replace(/^a built |^the /, '')).join(', '))}</div>` : `<div class="cost">${chips(x.cost, c)}</div>`}</div>`;
      }).join('')}</div>
      <div class="foot"><span class="small">Page ${page + 1} of ${pages}</span><span><button data-page="-1"${page ? '' : ' disabled'}>Prev</button> <button data-page="1"${page < pages - 1 ? '' : ' disabled'}>Next</button></span></div>
      <div class="sec"><span>Under construction</span><b>${maxB} builders at most per site</b></div>
      ${sites.length ? sites.slice(0, 3).map(b => { const j = b.upgrade || b, n = builders(b.id);
        return `<div class="site"><div class="thumb"><img src="${esc(artUrl(b.type))}" alt=""></div><div><div style="font-weight:600">${esc(b.upgrade ? 'Camp hall upgrade' : nice(b.type))}</div><div class="prog"><i style="width:${Math.round(100 * (j.progress || 0) / Math.max(1, j.need))}%"></i></div></div>
          <div class="pipw" title="${n} of ${maxB} builders. Idle camp workers walk over and build; workers you gave their own orders keep them.">${Array.from({ length: maxB }, (_, i) => `<i class="${i < n ? '' : 'off'}"></i>`).join('')}</div>
          ${b.upgrade ? '<span></span>' : `<button data-cancel="${esc(b.id)}" title="${esc(j.progress ? 'Cancel: work has started, nothing comes back' : 'Cancel: everything paid comes back')}">Cancel</button>`}</div>`; }).join('') + (sites.length > 3 ? `<div class="small" style="margin-top:4px">and ${sites.length - 3} more</div>` : '')
        : '<div class="small" style="padding:8px 0">Nothing being built. Pick a building above, then click the ground near your camp.</div>'}`;
    } else if (tab === 'train') {
      const cap = v.cap, cells = Math.max(cap, 1);
      body = `<div class="sec"><span>Troop cap</span><b>${v.troops} out, ${v.queued} training, ${Math.max(0, cap - v.troops - v.queued)} free of ${cap}</b></div>
        <div class="capbar" title="${esc(`Troop cap ${cap}: ${W().troopCap?.base ?? 0} at the start, more for each built supply tents, ${W().troopCap?.max ?? '?'} at most. Troops in training count.`)}">${Array.from({ length: cells }, (_, i) => `<i class="${i < v.troops ? 'u' : i < v.troops + v.queued ? 'w' : ''}"></i>`).join('')}</div>
        ${trows.length ? trows.slice(tpage * ROWS, tpage * ROWS + ROWS).map(([b, u]) => { const idx = c.buildings.filter(x => x.type === b.type).indexOf(b) + 1;
          { const q = b.queue || [], first = q[0], price = ryoOf(u);
            return `<div class="tq"><div class="bimg"><img src="${esc(artUrl(b.type))}" alt=""></div><div>
              <div style="display:flex;justify-content:space-between;align-items:center"><div class="unit"><div class="port">${esc((u[0] || '').toUpperCase())}</div><div><div style="font-weight:600;color:#f3e3bd">${esc(nice(u))}</div><div class="cost" style="justify-content:flex-start"><span class="chip ryo${(c.chest || 0) < price ? ' short' : ''}"><i></i>${price}</span><span class="small">${Math.round(ticksOf(u) / 20)} s</span></div></div></div>
              <div style="display:flex;gap:6px">${num(`t:${b.id}:${u}`)}<button class="go" data-train="${esc(b.id)}" data-unit="${esc(u)}">Train</button></div></div>
              <div class="pips">${q.slice(0, 10).map((x, i) => `<i class="${i ? 'q' : ''}" style="${i ? '' : `background:conic-gradient(#e0b85a 0 ${Math.round(100 * (1 - x.left / Math.max(1, ticksOf(x.unit) || 1)))}%,#14130f 0)`}"></i>`).join('')}
                <span class="small" style="margin-left:6px">${esc(nice(b.type))} ${idx}${first ? `, next in ${Math.ceil(first.left / 20)} s` : ', idle'}</span>
                ${q.length ? `<button style="margin-left:auto;padding:2px 8px" data-untrain="${esc(b.id)}">Cancel last</button>` : ''}</div></div></div>`; } }).join('')
          : '<div class="small" style="padding:10px 0">Build a barracks to train troops.</div>'}
        <div class="foot"><span class="small">Page ${tpage + 1} of ${tpages}</span><span><button data-tpage="-1"${tpage ? '' : ' disabled'}>Prev</button> <button data-tpage="1"${tpage < tpages - 1 ? '' : ' disabled'}>Next</button></span></div>`;
    } else {
      const H = W().hallUpgrade || {}, unlocks = Object.entries(B).filter(([, d]) => (d?.needs || []).includes('upgrade')).map(([t]) => t);
      body = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
        <div><div style="font-size:16px;color:#f3e3bd">${tier >= 2 ? 'Camp hall upgraded' : hall?.upgrade ? 'Upgrade under way' : 'Upgrade the camp hall'}</div>
          <div class="small">Workers build it like a site</div>
          ${tier >= 2 ? '' : hall?.upgrade ? `<div class="prog" style="margin-top:8px"><i style="width:${Math.round(100 * hall.upgrade.progress / Math.max(1, hall.upgrade.need))}%"></i></div>`
            : `<div class="cost" style="justify-content:flex-start;margin-top:8px">${chips(H.cost, c)}</div><div style="margin-top:10px"><button class="go" data-upgrade="1">Upgrade hall</button></div>`}</div>
        <div><div class="sec" style="padding-top:0"><span>Unlocks</span></div><div class="unl">${unlocks.map(t => `<div class="thumb" title="${esc(nice(t))}"><img src="${esc(artUrl(t))}" alt=""></div>`).join('')}</div>
          <div class="small" style="margin-top:4px">${esc(unlocks.map(nice).join(', '))}</div></div></div>`;
    }
    root.innerHTML = `<div class="win" role="dialog" aria-label="War camp"><header><div><div class="eyebrow">${esc(/ clan$/i.test(clan?.name || '') ? clan.name : `${clan?.name || 'Your'} clan`)}, war camp</div><h2>Siege of ${esc(town?.name || 'the town')}</h2></div><button data-close="1">Esc</button></header>
      <div class="lay"><aside><div class="art"><img class="hall" src="${esc(artUrl('camp_hall'))}" alt=""><img class="flag" src="${esc(artUrl('war_banner'))}" alt=""></div>
        <span class="tier">Camp hall, tier ${tier}</span>${hall?.upgrade ? `<div class="small">Upgrading ${Math.round(100 * hall.upgrade.progress / Math.max(1, hall.upgrade.need))}%</div>` : ''}
        <div class="coins">${coin('red', Math.floor(c.chest || 0), 'War chest', 'Ryo for troops and workers. Only this war can spend it.')}${coin('', `${v.troops + v.queued}/${v.cap}`, 'Troops', 'Troops out and in training, of the troop cap')}
          ${coin('', Math.floor(c.stock.timber || 0), 'Timber', 'Camp stores: pays for camp buildings. Camp workers gather more.')}${coin('', Math.floor(c.stock.stone || 0), 'Stone', 'Camp stores: pays for camp buildings. Camp workers gather more.')}</div>
        <div class="upg" title="${esc(`Hire camp workers for ${C.workerCost ?? '?'} ryo each from the war chest, up to ${C.workerCap ?? '?'} in all. They gather timber and stone anywhere in the war circle outside the town ring and build your camp.`)}"><b>Workers ${(c.workers || []).length + (c.workerTraining || []).length} of ${C.workerCap ?? '?'}</b>
          <div style="display:flex;gap:6px;justify-content:center;margin-top:5px">${num('hire')}<button class="go" data-hire="1">Hire</button></div><div class="small" style="margin-top:3px">${C.workerCost ?? '?'} ryo each</div></div></aside>
      <main><div class="tabs">${['build', 'train', 'hall'].map(t => `<button class="tab${tab === t ? ' on' : ''}" data-tab="${t}">${nice(t)}</button>`).join('')}</div>${body}<div class="why">${esc(why)}</div></main></div></div>`;
  }
  root.addEventListener('input', e => { const k = e.target?.dataset?.n; if (k) counts[k] = e.target.value; });
  root.addEventListener('keydown', e => { if (e.target.closest?.('input')) { e.stopPropagation(); if (e.code === 'Enter' || e.code === 'NumpadEnter') e.target.blur(); } });
  for (const ev of ['keyup', 'pointerdown', 'mousedown', 'wheel']) root.addEventListener(ev, e => e.stopPropagation());
  const count = key => { const n = Math.floor(Number(counts[key] ?? 1)); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
  root.addEventListener('click', e => {
    const b = e.target.closest?.('[data-close],[data-tab],[data-page],[data-tpage],[data-build],[data-cancel],[data-train],[data-untrain],[data-upgrade],[data-hire]'); if (!b || !open) return;
    const d = b.dataset; why = ''; sig = '';
    if (d.close) return close();
    if (d.tab) tab = d.tab;
    else if (d.page) page = Math.max(0, page + Number(d.page));
    else if (d.tpage) tpage = Math.max(0, tpage + Number(d.tpage));
    else if (d.build) { const x = (war()?.campBuildList(open) || []).find(y => y.type === d.build); if (x?.need.length) why = `Needs ${x.need.join(' and ')}`; else startPlacing(open, d.build); }
    else if (d.cancel) send({ id: heroId, type: 'frontier', action: 'campCancel', war: open, building: d.cancel });
    else if (d.train) { const n = count(`t:${d.train}:${d.unit}`); if (n) send({ id: heroId, type: 'frontier', action: 'campTrain', war: open, building: d.train, unit: d.unit, count: n }); else why = 'Type how many'; }
    else if (d.untrain) send({ id: heroId, type: 'frontier', action: 'campUntrain', war: open, building: d.untrain });
    else if (d.upgrade) send({ id: heroId, type: 'frontier', action: 'campUpgrade', war: open });
    else if (d.hire) { const n = count('hire'); if (n) send({ id: heroId, type: 'frontier', action: 'train', town: open, count: n }); else why = 'Type how many'; }
    fill();
  });
  addEventListener('keydown', e => { if (!root.hidden && !placing && e.code === 'Escape') { close(); e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true });

  // ---- placing a camp building --------------------------------------------------------------
  const ghost = document.createElement('canvas'), hint = document.createElement('div');
  ghost.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:21'; hint.id = 'warcamphint';
  ghost.hidden = hint.hidden = true; document.body.append(ghost, hint);
  let placing = null, mouse = null, preview = null, key = '';
  function startPlacing(warId, kind) { placing = { war: warId, kind }; root.hidden = true; key = ''; draw(); }
  function cancelPlacing(reopen = true) { const was = placing; placing = null; mouse = null; preview = null; key = ''; ghost.hidden = hint.hidden = true; if (reopen && was && open) { root.hidden = false; sig = ''; fill(); } }
  const ring = (ctx, x, z, r, stroke, width, dash = []) => {
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, p = view.unitToScreen(x + Math.cos(a) * r, z + Math.sin(a) * r, 0); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
    ctx.setLineDash(dash); ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); ctx.setLineDash([]);
  };
  function draw() {
    if (!placing || blocked()) { ghost.hidden = hint.hidden = true; return; }
    const w = rec(placing.war); if (!w) { cancelPlacing(false); return; }
    ghost.hidden = false; ghost.width = innerWidth; ghost.height = innerHeight;
    const ctx = ghost.getContext('2d'), chain = W().chainDistance ?? 120;
    for (const b of w.camp.buildings) ring(ctx, b.x, b.z, chain, 'rgba(224,184,90,.45)', 1.5, [8, 8]);
    if (!mouse) { hint.hidden = true; return; }
    const p = view.screenToGround(mouse.x, mouse.y); if (!p) { hint.hidden = true; return; }
    const next = `${Math.round(p.x)},${Math.round(p.z)}|${game.state.frontier?.econTick}|${w.camp.buildings.length}|${placing.from ? `${placing.from.x},${placing.from.z}` : ''}`;
    // a palisade is a line (checkpoint 6-6): the first click sets the start, the second the end; every piece is shown
    if (placing.kind === 'palisade') {
      const a = placing.from || { x: Math.round(p.x), z: Math.round(p.z) }, b = { x: Math.round(p.x), z: Math.round(p.z) };
      if (next !== key) { key = next; preview = war()?.campLineCheck(placing.war, a, b); }
      const color = preview?.ok ? '#65ef88' : '#ff655f';
      (preview?.points || []).forEach((q, k) => { const c = view.unitToScreen(q.x, q.z, 0); ctx.beginPath(); ctx.ellipse(c.x, c.y, 7, 4, 0, 0, Math.PI * 2); ctx.fillStyle = (preview.bad === k ? '#ff655f' : color) + '66'; ctx.fill(); ctx.strokeStyle = preview.bad === k ? '#ff655f' : color; ctx.lineWidth = 2; ctx.stroke(); });
      if (placing.from) { const c0 = view.unitToScreen(a.x, a.z, 0), c1 = view.unitToScreen(b.x, b.z, 0); ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]); }
      const costText = Object.entries(preview?.cost || {}).map(([r, v]) => `${v} ${r}`).join(', ');
      hint.hidden = false; hint.style.color = color; hint.style.borderColor = color;
      hint.textContent = !placing.from ? (preview?.ok ? 'Palisade: left-click where the line starts. Right-click or Esc cancels.' : `${preview?.reason || 'Not here'}. Right-click or Esc cancels.`)
        : preview?.ok ? `Palisade: ${preview.points.length} pieces, ${costText}. Left-click to build the line, Shift carries on from its end, right-click or Esc cancels.` : `${preview?.reason || 'Not here'}. Right-click or Esc cancels.`;
      hint.style.left = `${Math.max(8, Math.min(innerWidth - 320, mouse.x + 18))}px`; hint.style.top = `${Math.max(8, Math.min(innerHeight - 100, mouse.y + 18))}px`;
      return;
    }
    if (next !== key) { key = next; preview = war()?.campCheck(placing.war, placing.kind, p); }
    const color = preview?.ok ? '#65ef88' : '#ff655f', r = W().buildings?.[placing.kind]?.radius ?? 8;
    const c0 = view.unitToScreen(p.x, p.z, 0), c1 = view.unitToScreen(p.x + r, p.z, 0), px = Math.max(8, Math.abs(c1.x - c0.x));
    ctx.beginPath(); ctx.ellipse(c0.x, c0.y, px, px * 0.45, 0, 0, Math.PI * 2); ctx.fillStyle = color + '33'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    const img = imageOf(placing.kind);
    if (img.complete && img.naturalWidth) { const wpx = px * 2.2, hpx = wpx * img.naturalHeight / img.naturalWidth; ctx.globalAlpha = 0.65; ctx.drawImage(img, c0.x - wpx / 2, c0.y - hpx * 0.8, wpx, hpx); ctx.globalAlpha = 1; }
    hint.hidden = false; hint.style.color = color; hint.style.borderColor = color;
    hint.textContent = preview?.ok ? `${nice(placing.kind)}: left-click to place, Shift keeps placing, right-click or Esc cancels.` : `${preview?.reason || 'Not here'}. Right-click or Esc cancels.`;
    hint.style.left = `${Math.max(8, Math.min(innerWidth - 320, mouse.x + 18))}px`; hint.style.top = `${Math.max(8, Math.min(innerHeight - 100, mouse.y + 18))}px`;
  }
  const consume = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  addEventListener('mousemove', e => { if (placing) { mouse = e.target?.closest?.('canvas#view') ? { x: e.clientX, y: e.clientY } : null; draw(); } });
  addEventListener('mousedown', e => {
    if (!placing || blocked() || !e.target?.closest?.('canvas#view')) return;
    if (e.button === 2) { cancelPlacing(); consume(e); return; }
    if (e.button !== 0) return;
    consume(e); mouse = { x: e.clientX, y: e.clientY }; key = ''; draw();
    if (placing.kind === 'palisade') {
      const p = view.screenToGround(e.clientX, e.clientY); if (!p) return;
      const here = { x: Math.round(p.x), z: Math.round(p.z) };
      if (!placing.from) { if (preview?.ok || preview?.points?.length) { placing.from = here; key = ''; draw(); } return; }
      if (!preview?.ok) return;
      send({ id: heroId, type: 'frontier', action: 'campLine', war: placing.war, x0: placing.from.x, z0: placing.from.z, x1: here.x, z1: here.z });
      if (e.shiftKey) { placing.from = here; key = ''; } else { cancelPlacing(false); close(); }   // 7c: placing closes the build menu (Tim 2026-11-12)
      return;
    }
    if (!preview?.ok) return;
    send({ id: heroId, type: 'frontier', action: 'campPlace', war: placing.war, kind: placing.kind, x: preview.point.x, z: preview.point.z });
    if (!e.shiftKey) { cancelPlacing(false); close(); }   // 7c: placing closes the build menu (Tim 2026-11-12)
  }, { capture: true });
  addEventListener('contextmenu', e => { if (placing && e.target?.closest?.('canvas#view')) consume(e); }, { capture: true });
  addEventListener('keydown', e => { if (placing && e.code === 'Escape') { cancelPlacing(); consume(e); } }, { capture: true });
  addEventListener('blur', () => { if (placing) cancelPlacing(); });

  let seen = 0;
  function update() {
    if (placing) draw();
    if (!root.hidden) { if (!rec(open) || blocked()) close(); else fill(); }
    // say why a camp command was refused (receipts live one tick)
    for (const r of game.state.frontier?.receipts || []) if (r.seq > seen) { seen = r.seq; if (!r.ok && open && r.clan === hero()?.owner && /^camp|^train$/.test(r.action)) { why = r.reason; sig = ''; } }
  }
  return { show, close, update, cancel: () => cancelPlacing(false), isOpen: () => !root.hidden, isPlacing: () => !!placing };
}
