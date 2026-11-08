// Town panel (frontier plan F4.4). A DOM window built from reportRows (frontier_report.js), in the
// look of the building panel. It only reads the snapshot copy of state.frontier and sends
// { type: 'frontier', action, ... } commands for the hero; rejections show the receipt's reason.
// Talk to the governor is a button for now; the Space-at-the-town-hall version arrives with the town in the world (E5).
import { bindTips } from './frontier_tips.js';
import {resourceUsage} from './sim/frontier/resource_usage.js';
import { usageView, housingView, flowFocus } from './sim/frontier/usage_view.js';
import { reportRows, governorSays, talkCommand } from './frontier_report.js';
import { tierOf, nextTier, upgradeCheck } from './sim/frontier/tiers.js';
import { workerCount } from './sim/frontier/people.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tip = t => t ? ` data-tip="${esc(t)}"` : '';
const arrow = { up: '<span class="up">▲</span>', down: '<span class="dn">▼</span>', flat: '<span class="dim">–</span>' };

export function ownTowns(frontier, clan) {
  return Object.values(frontier?.settlements || {}).filter(s => s.owner === clan && !s.capital && s.stock);
}

// Plain one-line effects of each steering choice (Tim 2026-11-05: what do the focus buttons actually do?)
// Short captions shown under each choice (Tim 2026-11-08: no long lines across the card); the full lines above are tooltips
const SHORT = {
  focus: { grow: 'Farms first · more farms and houses', produce: 'Workshops first · builds for your scarcest material', trade: 'Workshops first · more goods to sell', fortify: 'Builds a stockade first' },
  tax: { low: 'Little ryo · happier town', normal: 'Steady ryo', high: 'Most ryo · mood falls', auto: 'Kept where mood stays healthy' },
  initiative: { off: 'He suggests, you approve', on: 'He builds by himself' }
};
const CLOSE = '<button type="button" data-act="panel-close" class="pclose" aria-label="Close" title="Close (O or Esc)">✕</button>';
const STEER = {
  focus: {
    grow: 'Grow: people work farms first; the governor adds farms and houses so the town gets bigger.',
    produce: 'Produce: people work workshops first; the governor adds whatever makes your lowest of timber, stone or goods.',
    trade: 'Trade: people work workshops first, so more goods for upkeep, upgrades and the market.',
    fortify: 'Fortify: the governor builds a stockade first.'
  },
  tax: {
    low: 'Low taxes: little ryo, happier town.', normal: 'Normal taxes: steady ryo, mood a little lower than low taxes.',
    high: 'High taxes: most ryo, but mood falls (low mood drives people away).', auto: 'Auto taxes: the governor raises or lowers them to keep mood healthy.'
  },
  initiative: {
    off: 'Ask first: the governor only suggests; nothing is built until you press Approve.',
    on: 'On: the governor zones, builds, lays roads, trains workers and sends idle workers gathering by himself.'
  }
};
export function createFrontierPanel({ root, game, heroId, clan = 'player', send, buildUI = null, nearbyTown = null, selected: pickedUnits = () => [], focus=()=>{}, onOpen = () => {}, onClose = () => {}, onStable = null }) {
  // Tim 2026-11-07: the old "More: projects & steering" page is gone; each part is a tab along the top (like Workers)
  // Tim 2026-11-07: Steer merged into Governor (his talk, focus, taxes, market, stockade and initiative on one tab)
  const TABS = [['town', 'Overview'], ['projects', 'Projects'], ['governor', 'Governor'], ['stable', 'Stable']];
  let selected = null, mode = 'town', tab = 'town', prevStock = {}, prevAt = 0, lastHtml = '', failure = null;
  const tips = bindTips(root);
  const data=game.frontier?.data;
  let usageResource='timber',usagePage=0;
  const usageTip=(s,r)=>{
    if(!data)return '';
    const u=resourceUsage(s,r,data);
    return `Stock ${u.stock.toFixed(2)} · actual consumption ${u.consumption.toFixed(3)}/s · full production needs ${u.demand.toFixed(3)}/s · estimated gathering ${u.gathering.toFixed(3)}/s · net production ${u.net.toFixed(3)}/s\n${u.entries.map(e=>`${e.name}: ${e.once?e.once+' once':e.rate.toFixed(3)+'/s'} · ${e.state}`).join('\n')}\nClick for Stock → Usage.`;
  };
  const cmd = c => send({ id: heroId, type: 'frontier', ...c });
  const towns = () => ownTowns(game.state.frontier, clan);
  function pick() {
    const list = towns();
    if (!list.find(s => s.id === selected)) selected = nearbyTown ? nearbyTown() : list[0]?.id ?? null;
    return list.find(s => s.id === selected) || null;
  }
  // Usage page (Tim 2026-11-05 redesign): one tab per resource plus Housing. Rates per minute.
  const pm = v => { const a = Math.abs(v); return (v < 0 ? '−' : '+') + (a >= 10 ? Math.round(a) : a >= 1 ? a.toFixed(1) : a.toFixed(2)); };
  const num = v => Math.floor(v).toLocaleString();
  const stateCls = t => /short|abandoned|unhealthy|empty/.test(t) ? 'bad' : /paid|fed|producing|making/.test(t) ? 'good' : 'dim';
  function usagePage_(s, rows) {
    const tabs = [...data.resources, 'housing'].map(r => `<button data-act="usage" data-id="${r}" class="${usageResource === r ? 'on' : ''}">${r[0].toUpperCase() + r.slice(1)}</button>`).join('');
    let h = `<div class="row"><h1>${esc(rows.title)} · Usage</h1><button data-act="usage-back">‹ Town</button></div><div class="utabs">${tabs}</div>`;
    if (usageResource === 'housing') return h + housingHtml(s);
    const u = usageView(s, usageResource, data), full = u.cap != null && u.stock >= u.cap * 0.99;
    const fill = u.cap ? Math.min(100, u.stock / u.cap * 100) : 0;
    h += `<div class="ucard"><div class="row"><div><b class="big">${num(u.stock)}</b><span class="dim"> ${u.cap != null ? '/ ' + num(u.cap) + ' stored' : 'stored'}</span></div>`
      + `<div class="r"><b class="net ${u.net > 0.05 ? 'good' : u.net < -0.05 ? 'bad' : 'dim'}">${Math.abs(u.net) < 0.05 ? 'steady' : pm(u.net) + '/min'}</b><div class="dim">${esc(u.eta)}</div></div></div>`
      + (u.cap != null ? `<div class="ubar"><i class="${full ? 'full' : ''}" style="width:${fill}%"></i></div>` : '') + '</div>';
    const big = Math.max(1, ...u.incoming.map(x => x.rate), ...u.outgoing.map(x => -x.rate));
    const list = (title, items, sum, cls) => `<div class="lab">${title} · ${sum ? pm(cls === 'in' ? sum : -sum) + '/min' : 'nothing'}</div>` + items.map(x =>
      `<button class="urow" data-act="usage-focus" data-id="${esc(x.id)}"><span class="row"><span>${esc(x.name)}</span><b class="${cls === 'in' ? 'good' : 'bad'}">${pm(x.rate)}/min</b></span>`
      + `<span class="row"><span class="ubar s ${cls}"><i style="width:${Math.max(3, Math.abs(x.rate) / big * 100)}%"></i></span><small class="${stateCls(x.state)}">${esc(x.once ? 'one-time' : x.state)}</small></span></button>`).join('');
    h += list('Coming in', u.incoming, u.inSum, 'in') + list('Going out', u.outgoing, u.outSum, 'out');
    if (u.once.length) h += '<div class="lab">Waiting to be paid once</div>' + u.once.map(x => `<button class="urow" data-act="usage-focus" data-id="${esc(x.id)}"><span class="row"><span>${esc(x.name)} <small class="dim">${esc(x.state)}</small></span><b class="gold">${num(x.amount)} ${esc(usageResource)}</b></span></button>`).join('');
    return h + '<div class="hint">Rates are averaged over the last minute. Click a row to see it on the map.</div>';
  }
  function housingHtml(s) {
    const v = housingView(s, data), fill = x => v.beds ? Math.min(100, x / v.beds * 100) : 0;
    let h = `<div class="ucard"><div class="row"><div><b class="big">${v.used}</b><span class="dim"> / ${v.beds} beds used</span></div><div class="r"><b class="${v.growthBlock ? 'warn' : 'good'}">${esc(v.growth || '')}</b><div class="dim">${v.pop} townsfolk · ${v.workers} workers</div></div></div>`
      + `<div class="ubar"><i style="width:${fill(v.pop)}%"></i><i class="w" style="width:${fill(v.workers)}%"></i></div></div>`;
    h += '<div class="lab">Houses by level</div>' + v.levels.map(l => `<div class="hlev"><span><b>${esc(l.name)}</b><small class="dim">${esc(l.needs)}</small></span><span class="dim">${l.count === '' ? '' : '× ' + l.count}</span><span class="dim">${l.bedsEach === '' ? '' : l.bedsEach + ' beds'}</span><b class="gold">${l.beds}</b></div>`).join('')
      + (v.empty ? `<div class="hint">${v.empty} zoned cell${v.empty > 1 ? 's' : ''} still empty (needs a road within reach and food).</div>` : '');
    h += '<div class="lab">What housing uses</div>' + v.uses.map(x => `<div class="row"><span>${esc(x.name)}</span><span><b class="bad">${x.rate > 0 ? pm(-x.rate) + '/min' : '–'}</b> <small class="${stateCls(x.state)}">${esc(x.state)}</small></span></div>`).join('');
    if (v.limits.length) h += '<div class="lab">Limits</div>' + v.limits.map(x => `<div class="row"><span>${esc(x.name)}</span><b class="${x.full ? 'warn' : 'gold'}">${esc(x.value)}${x.note ? ` <small class="dim">(${esc(x.note)})</small>` : ''}</b></div>`).join('');
    return h;
  }
  // the Governor tab's steering rows (Tim 2026-11-07: were the Steer tab): taxes, market keep, stockade, initiative
  function steerExtras(s, rows) {
    const st = rows.steer, b = (act, val, label, on, t = '') => `<button data-act="${act}" data-id="${val}" class="${on ? 'on' : ''}"${t ? tip(t) : ''}>${label}</button>`;
    // label with a short caption under it on the left, the choices on the right
    const label = (name, cap, t = '') => `<span class="steerlab"${t ? tip(t) : ''}>${name}<small>${esc(cap)}</small></span>`, taxNow = st.taxLocked ? st.tax : 'auto';
    let x = '<div class="lab">Steer</div>';
    x += `<div class="row">${label('Taxes', SHORT.tax[taxNow] + (st.taxLocked ? '' : ` · now ${st.tax}`), st.tips.tax)}<span>${['low', 'normal', 'high'].map(p => b('tax', p, p[0].toUpperCase() + p.slice(1), st.taxLocked && st.tax === p, STEER.tax[p])).join(' ')} ${b('tax', 'auto', 'Auto', !st.taxLocked, STEER.tax.auto)}</span></div>`;
    // Economy pass 2 D: market keep level (players and bots share setMarketKeep)
    if (data?.market && s.buildings?.some(x => x.type === 'market' && x.stage === 'built')) {
      const keep = s.marketKeep ?? data.market.keep, step = 100;
      x += `<div class="row">${label('Market keeps', `sells goods above ${keep}`, `Market: sells goods above the keep level for ${data.market.price} ryo each, up to ${data.market.perTick} goods per second.`)}<span>${b('keep', Math.max(0, keep - step), '−' + step, false, `Keep ${step} fewer goods: more are sold for ryo.`)} <input class="keepin" type="number" min="0" max="${data.market.keepMax ?? 100000}" step="10" value="${keep}" data-act="keepinput"${tip('Type how many goods to keep, then Enter')}> ${b('keep', keep + step, '+' + step, false, `Keep ${step} more goods for upkeep and upgrades.`)}</span></div>`;
    }
    // Stockade garrison (Tim 2026-11-06): shelter units inside a finished stockade
    const fort = data?.buildings?.stockade?.garrison;
    if (fort && s.buildings?.some(x => x.type === 'stockade' && x.stage === 'built')) {
      const inside = Object.values(game.state.entities).filter(u => u.garrison?.town === s.id);
      const fb = s.buildings.find(x => x.type === 'stockade' && x.stage === 'built'), fhp = fort.hp ? ` · health <b>${Math.round(fb?.hp ?? fort.hp)}</b> / ${fort.hp}` : '';
      x += `<div class="lab">Stockade</div><div class="row"><span${tip(`Hits on units inside land on the stockade instead${fort.hp ? ` (${fort.hp} health); if it breaks, everyone inside piles out and the governor rebuilds it` : ''}. Units inside heal ${fort.healFactor}x faster. They must be within ${fort.range} of the stockade to go in. Holds ${fort.capacity}.`)}>Garrison <b>${inside.length}</b> / ${fort.capacity}${fhp}</span><span>${b('garrison-in', 'selected', 'Send in selected', false, 'Send your selected units into the stockade')} ${b('garrison-in', 'crew', 'Hero &amp; crew', false, 'Send your hero and crew nearby into the stockade')} ${b('garrison-in', 'workers', 'Workers', false, 'Send your workers nearby into the stockade; they count as idle there')} ${b('garrison-out', 'all', 'Leave', false, 'Everyone inside walks out')}</span></div>`;
    }
    x += `<div class="row">${label('Initiative', SHORT.initiative[st.autoBuild ? 'on' : 'off'], st.tips.initiative)}<span>${b('auto', 'off', 'Ask first', !st.autoBuild, STEER.initiative.off)} ${b('auto', 'on', 'On', st.autoBuild, STEER.initiative.on)}</span></div>`;
    return x;
  }
  function render() {
    if (root.hidden) return;
    const s = pick();
    if (!s) { root.innerHTML = CLOSE + '<h1>Town</h1><div class="sub">Go near your town, or choose one in Towns (Y) or the World map.</div>'; return; }
    // arrows compare with the numbers from about a second ago
    const now = Date.now();
    if (now - prevAt > 1000) { prevAt = now; prevStock[s.id] = { prev: prevStock[s.id]?.cur, cur: structuredClone(s) }; }
    const rows = reportRows(s, prevStock[s.id]?.prev);
    let h = '', overH = '', projectsH = '', stableH = '';
    const hasStable = !!s.buildings?.some(x => x.type === 'stable' && x.stage === 'built');
    if (tab === 'stable' && !hasStable) tab = 'town';
    if (mode === 'town' && tab === 'governor') {
      const say = governorSays(rows);
      h += `<h1>Governor</h1><div class="sub">${esc(rows.title)}</div><div class="chat">“${esc(say.text)}”</div><div class="choices">`
        + say.choices.map(c => `<button data-act="talk" data-id="${c.id}">${esc(c.label)}</button>`).join('') + '</div>';
      // Tim 2026-11-06: he says what each focus does, and you can pick one right here
      const st = rows.steer, pri = s.priority || st.priority;
      h += `<div class="lab">Focus</div><div class="row"><span class="focuscap">${esc(SHORT.focus[pri] || '')}</span><span class="seg">`
        + ['grow', 'produce', 'trade', 'fortify'].map(p => `<button data-act="priority" data-id="${p}" class="${pri === p ? 'on' : ''}"${tip(STEER.focus[p])}>${p[0].toUpperCase() + p.slice(1)}</button>`).join(' ')
        + '</span></div>' + steerExtras(s, rows);
    } else if(mode==='usage' && data) {
      h = usagePage_(s, rows);
    } else {
      const mood = rows.mood;
      h += `<div><h1>${esc(rows.title)}</h1><div class="sub">Yours · mood <b${tip(mood.tip)}>${mood.value}</b> / 100</div></div>`;
      // B3: town hall tier and its upgrade
      if (data?.tiers?.list) {
        const tier = tierOf(s, data), next = nextTier(s, data), up = s.tierUpgrade, chk = upgradeCheck(s, data);
        const cost = next?.upgrade ? Object.entries(next.upgrade.cost).map(([r, v]) => `${v} ${r}`).join(', ') + `, ${next.upgrade.pop} people` : '';
        const what = t => t ? `ring ${t.ring} · housing ${t.cells.housing} / farm ${t.cells.farm} / work ${t.cells.work} cells · ${t.workers} workers · storehouses ${t.placed.storehouse} · camps ${t.placed.camps}` : '';
        h += `<div class="row"><span${tip('Town hall tier limits:\n' + what(tier))}>Town hall: <b>${esc(tier.name)}</b> <span class="dim">(tier ${s.tier || 1}) · workers ${workerCount(s)} / ${tier.workers}</span></span>`
          + (up ? `<span class="dim">Upgrading to ${esc(next?.name || '')}… ${Math.max(0, up.left)}s</span>`
            : next ? `<button data-act="upgrade"${tip(`Upgrade to ${next.name}: ${cost}.\nUnlocks ${what(next)}.${chk.ok ? '' : '\nNot yet: ' + chk.reason}`)}${chk.ok ? '' : ' class="no"'}>Upgrade to ${esc(next.name)}</button>` : '<span class="dim">Highest tier</span>') + '</div>';
      }
      h += '<div class="lab">Stock <button data-act="usage" data-id="timber">Usage</button></div><div class="stock">' + rows.stock.map(r => `<div${tip((r.tip || '')+'\n'+usageTip(s,r.key))}><button data-act="usage" data-id="${r.key}">${esc(r.label)}</button><b${r.full ? ' class="full"' : ''}>${r.value}</b>${r.cap != null ? `<span class="dim cap">/ ${r.cap}${r.full ? ' full' : ''}</span>` : ''}${arrow[r.arrow]}</div>`).join('') + '</div>';
      h += `<div class="lab">People</div><div class="row"><span>${esc(rows.pop.text)}</span><span class="dim"${tip(rows.jobsTip)}>${esc(rows.jobsText)}</span></div><div class="bar"><i style="width:${Math.round(rows.pop.fill * 100)}%"></i></div>`;
      if (rows.pop.growth || rows.pop.goodsWait) h += `<div class="hint">${esc([rows.pop.growth, rows.pop.goodsWait ? 'Houses need goods to level up (workshops make goods)' : ''].filter(Boolean).join(' · '))}</div>`;   // B7
      h += `<div class="row" style="margin-top:5px"><span>Mood</span><span class="dim"${tip(mood.why.map(w=>w.tip).join('\n'))}>${mood.why.length ? esc(mood.why.map(w => w.text).join(' · ')) : 'Content'}</span></div><div class="bar m"><i style="width:${mood.value}%"></i></div>`;
      if (mood.why.length) h += '<div class="hint">' + esc(mood.why.map(w => w.hint).join(' · ')) + '</div>';
      h += `<div class="lab">Governor says</div><div>Doing: <b>${esc(rows.doing || 'Nothing yet')}</b></div>` + (rows.next ? `<div>Next: <span class="dim">${esc(rows.next)}</span></div>` : '')
        + rows.waiting.map((w, i) => { const wi = rows.waitingInfo?.[i]; return `<span class="pill red"${wi ? tip(wi.tip) + ` style="background:linear-gradient(90deg,#3d5a2a ${Math.round(wi.fill * 100)}%,#2a1714 ${Math.round(wi.fill * 100)}%)"` : ''}>${esc(w)}</span>`; }).join(' ');
      overH = h; h = '';
      if (!rows.projects.length && !rows.suggestions.length) h += '<div class="hint">No projects or suggestions right now.</div>';
      if (rows.projects.length) h += '<div class="lab">Projects</div>' + rows.projects.map(p => `<div class="row"><span>${esc(p.label)} <span class="dim">· ${esc(p.status)}${p.canAuthorize ? ' · ' + esc(p.cost) : ''}</span></span><span>${p.canAuthorize ? `<button data-act="authorize" data-id="${p.id}">OK</button> ` : ''}<button class="no" data-act="cancel" data-id="${p.id}">Cancel</button></span></div>`).join('');
      if (rows.suggestions.length) h += `<div class="lab"${tip(rows.suggestionsTip)}>Suggestions</div>` + rows.suggestions.map(x => `<div class="row"><span>${esc(x.label)} <span class="dim">· ${esc(x.reason)}</span></span><button data-act="approve" data-id="${x.index}">Approve</button></div>`).join('');
      // Tim 2026-11-05: every choice says what it does (hover) and the current one is spelled out under its row
      const b = (act, val, label, on, t = '') => `<button data-act="${act}" data-id="${val}" class="${on ? 'on' : ''}"${t ? tip(t) : ''}>${label}</button>`;
      projectsH = `<h1>${esc(rows.title)}</h1>` + h; h = '';
      // Stable (Tim 2026-11-07): horses, rickshaws and omnibuses are bought in the stable menu (src/stable_menu.js)
      if (hasStable) stableH = `<h1>${esc(rows.title)}</h1><div class="lab">Stable</div><div class="row"><span${tip('Horses, rickshaws and omnibuses are made at the stable: click it or Space beside it.')}>Horses and vehicles</span><span>${b('openstable', 'open', 'Open stable', false, 'Open the stable menu for this town')}</span></div>`;
    }
    if (mode === 'town' && tab !== 'governor') {
      // h now holds the steer section; pick the body of the current tab
      h = tab === 'projects' ? projectsH : tab === 'stable' ? stableH : overH;
    }
    const rosterOpen = !!buildUI?.isRosterOpen?.();
    let tabsH = '';
    if (mode === 'town') {
      tabsH = '<div class="ptabs">' + TABS.filter(([id]) => id !== 'stable' || hasStable).map(([id, label]) => `<button data-act="tab" data-id="${id}" class="${!rosterOpen && tab === id ? 'on' : ''}">${label}</button>`).join('')
        + `<button data-act="build-workers" class="${rosterOpen ? 'on' : ''}">Workers (${s.workers?.length || 0})</button></div>`;
      const build = (tab === 'town' || rosterOpen) ? buildUI?.html(s) || '' : '';
      h = rosterOpen ? build : build + h;
    }
    // Tim 2026-11-08: a close button on the panel itself (O and Esc still work)
    h = CLOSE + tabsH + h;
    if (failure && Date.now() - failure.at < 5000) h += `<div class="why">${esc(failure.text)}</div>`;
    const key = h + tab;
    if (document.activeElement?.dataset?.act === 'keepinput' && root.contains(document.activeElement)) return;   // typing a keep level
    if (key !== lastHtml) { root.innerHTML = h; lastHtml = key; }
  }
  root.addEventListener('mousedown', e => e.stopPropagation());
  root.addEventListener('dblclick',e=>{
    const b=e.target.closest('button[data-act]'),s=pick();
    if(b && s && buildUI?.doubleClick?.(b.dataset,s)){lastHtml='';render();}
  });
  root.addEventListener('keydown', e => { if (e.target.closest?.('input')) { e.stopPropagation(); if (e.code === 'Enter' || e.code === 'NumpadEnter') e.target.blur(); } });
  root.addEventListener('change', e => {
    if (e.target.dataset?.act === 'keepinput') { const s = pick(), v = Math.round(Number(e.target.value)); if (s && Number.isFinite(v) && v >= 0) cmd({ action: 'setMarketKeep', settlement: s.id, keep: v }); lastHtml = ''; render(); return; }
    const s=pick();if(s && buildUI?.change?.(e.target.dataset,e.target.value,s)) {lastHtml='';render();}
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    if (b.dataset.act === 'panel-close') { close(); return; }
    const s = pick(), id = b.dataset.id, sid = s?.id;
    if (s && buildUI?.click(b.dataset, s, e)) { lastHtml = ''; render(); b.blur?.(); return; }
    if (b.dataset.act === 'talk') buildUI?.close();
    switch (b.dataset.act) {
      case 'usage': if(data && (data.resources.includes(id) || id==='housing')){usageResource=id;mode='usage';usagePage=0;buildUI?.close();}break;
      case 'usage-back':mode='town';break;
      case 'usage-page':usagePage=Number(id);break;
      case 'usage-focus':{const p=data && flowFocus(s,id,usageResource,data);if(p)focus(p[0],p[1]);break;}
      case 'town': selected = id; mode = 'town'; break;
      case 'tab': buildUI?.close(); tab = TABS.some(t => t[0] === id) ? id : 'town'; mode = 'town'; break;
      case 'talk': if (id && s) { const c = id === 'close' ? null : talkCommand(id, reportRows(s)); if (c) cmd(c); tab = id === 'close' ? 'town' : 'governor'; } else tab = 'governor'; mode = 'town'; break;
      case 'authorize': cmd({ action: 'authorize', project: id }); break;
      case 'cancel': cmd({ action: 'cancel', project: id }); break;
      case 'approve': cmd({ action: 'approveSuggestion', settlement: sid, index: Number(id) }); break;
      case 'priority': cmd({ action: 'setPriority', settlement: sid, priority: id }); break;
      case 'tax': cmd({ action: 'setTax', settlement: sid, level: id }); break;
      case 'auto': cmd({ action: 'setAutoBuild', settlement: sid, on: id === 'on' }); break;
      case 'upgrade': cmd({ action: 'upgradeHall', settlement: sid }); break;   // B3
      case 'garrison-in': {   // Stockade garrison: who goes in
        const mine = game.state.entities[heroId]?.owner;
        const ids = id === 'selected' ? pickedUnits() : Object.values(game.state.entities).filter(u => (u.owner ?? u.workerOwner) === mine && !u.garrison && u.place === 'world' && (id === 'workers' ? u.worker : !u.worker && u.type !== 'civilian')).map(u => u.id);
        if (ids.length) cmd({ action: 'garrison', mode: 'enter', town: sid, units: ids });
        break;
      }
      case 'garrison-out': cmd({ action: 'garrison', mode: 'leave', town: sid }); break;
      case 'openstable': onStable?.(sid); break;
      case 'stable': cmd(id.startsWith('choose:') ? { action: 'stable', mode: 'choose', town: sid, horse: id.slice(7) } : id === 'cancel' || id === 'omnibus' ? { action: 'stable', mode: id, town: sid } : { action: 'stable', mode: 'horse', kind: id, town: sid }); break;
      case 'keep': cmd({ action: 'setMarketKeep', settlement: sid, keep: Number(id) }); break;   // economy pass 2 D
    }
    lastHtml = ''; render(); b.blur?.();
  });
  // rejected commands: show the newest rejection's reason for a few seconds
  let seen = 0;
  function watchReceipts() {
    for (const r of game.state.frontier?.receipts || []) if (r.clan === clan && r.seq > seen) { seen = r.seq; if (!r.ok) failure = { text: `Not possible: ${r.reason}`, at: Date.now() }; }
  }
  setInterval(() => { watchReceipts(); render(); }, 1000);
  function open(id) { if (id) selected = id; else if (nearbyTown) selected = nearbyTown(); mode = 'town'; tab = 'town'; root.hidden = false; lastHtml = ''; render(); onOpen(); }
  function close() { buildUI?.close(); if (!root.hidden) { root.hidden = true; tips.hide(); onClose(); } }
  return { open, close, toggle() { root.hidden ? open() : close(); }, isOpen: () => !root.hidden, talk(id) { open(id); tab = 'governor'; render(); }, render };
}
