// Town panel (frontier plan F4.4). A DOM window built from reportRows (frontier_report.js), in the
// look of the building panel. It only reads the snapshot copy of state.frontier and sends
// { type: 'frontier', action, ... } commands for the hero; rejections show the receipt's reason.
// Talk to the governor is a button for now; the Space-at-the-town-hall version arrives with the town in the world (E5).
import { bindTips } from './frontier_tips.js';
import {resourceUsage} from './sim/frontier/resource_usage.js';
// Lantern style (Tim 2026-11-23): the game's painted props stand on the storehouse shelf in the Town panel
const STOCK_ART = { food: 'art/props/sake_barrels.png', timber: 'art/props/firewood.png', stone: 'art/props/sandstone_stones.png', goods: 'art/props/crates.png', ryo: 'art/props/iron_chest.png', fish: 'art/props/barrels.png', people: 'art/buildings/tenements.png' };
import { usageView, housingView, flowFocus } from './sim/frontier/usage_view.js';
import { reportRows, peopleRows, governorSays, talkCommand } from './frontier_report.js';
import { tierOf, nextTier } from './sim/frontier/tiers.js';
import { hallUpgradeHTML } from './hall_upgrade.js';
import { warUpgradeSeconds } from './sim/frontier/town_military.js';
import { defaultKeep } from './sim/frontier/storage.js';
import { workerCount } from './sim/frontier/people.js';
import { createShipmentsTab } from './shipments_tab.js';
import { createStableTab, STABLE_TAB_CSS } from './stable_tab.js';
import { msPaginate, msConcept } from './menu_shell.js';
import { sharedKeybinds } from './keybinds.js';
import { logRowHtml, logPageHtml, logHover, logTurn, LOG_CSS } from './action_log_ui.js';   // governor's log (Tim 2026-11-22)
const keybinds = sharedKeybinds();   // key text follows rebinding (Tim 2026-11-12)
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tip = t => t ? ` data-tip="${esc(t)}"` : '';
const arrow = { up: '<span class="up tri"></span>', down: '<span class="dn tri"></span>', flat: '<span class="dim">-</span>' }   // drawn triangles, no glyphs (Tim 2026-11-10);

export function ownTowns(frontier, clan) {
  return Object.values(frontier?.settlements || {}).filter(s => s.owner === clan && !s.capital && s.stock);
}

// Plain one-line effects of each steering choice (Tim 2026-11-05: what do the focus buttons actually do?)
// Short captions shown under each choice (Tim 2026-11-08: no long lines across the card); the full lines above are tooltips
const SHORT = {
  focus: { grow: 'Farms first, more farms and houses', produce: 'Workshops first, builds for your scarcest material', trade: 'Workshops first, more goods to sell', fortify: 'Builds a stockade first' },
  tax: { low: 'Little ryo, happier town', normal: 'Steady ryo', high: 'Most ryo, mood falls', auto: 'Kept where mood stays healthy' },
  initiative: { off: 'He suggests, you approve', on: 'He builds by himself' }
};
// Governor tab redesign (Tim 2026-11-11): drawn focus icons, no glyphs
const FOCUS_ICON = {
  grow: '<svg viewBox="0 0 28 24"><g stroke="#24331a" stroke-width="1"><path d="M14 23V9M14 15c-4-1-7-4-8-8 4 0 7 3 8 7M14 13c4-1 7-4 8-8-4 0-7 3-8 7M14 10c-2-2-2-5 0-8 2 3 2 6 0 8" fill="#7fae4e"/></g><path d="M7 23h14" stroke="#6e5428" stroke-width="2"/></svg>',
  produce: '<svg viewBox="0 0 28 24"><g stroke="#2a1d10" stroke-width="1"><path d="M12 9 21 22l2-1.5L14 7.5Z" fill="#a8784a"/><path d="M5 6.5 13.5 2l4 4.5L9 11Z" fill="#9c988c"/><path d="M5 6.5 9 11 7 12.5 3.5 8Z" fill="#7d796f"/></g></svg>',
  trade: '<svg viewBox="0 0 28 24"><circle cx="14" cy="12" r="9.5" fill="#c9a03a" stroke="#5a4416" stroke-width="1.2"/><circle cx="14" cy="12" r="7" fill="none" stroke="#e9c870" stroke-width="1"/><rect x="11.5" y="9.5" width="5" height="5" fill="#1a140c" stroke="#5a4416"/></svg>',
  fortify: '<svg viewBox="0 0 28 24"><g stroke="#2a1d10" stroke-width="1" fill="#8a5f34"><path d="M3 22V7l2.5-3L8 7v15Z"/><path d="M9.5 22V6l2.5-3 2.5 3v16Z"/><path d="M16 22V7l2.5-3L21 7v15Z"/><path d="M22.5 22V8l2.5-3 2 3v14Z"/></g><path d="M2 12h25M2 18h25" stroke="#4a3018" stroke-width="1.6"/></svg>'
};
const cap1 = t => t ? t[0].toUpperCase() + t.slice(1) : '';
const CLOSE = '<button type="button" data-act="panel-close" class="pclose" aria-label="Close" title="Close (O or Esc)">Esc</button>';
const USAGE_STATE = { 'Producing': 'working', 'Active recipe': 'working', 'Waiting for inputs/workers': 'waiting', 'Waiting for workers': 'waiting', 'Waiting for materials': 'waiting', 'Awaiting approval': 'needs approval' };
const rateS = v => v >= 0.1 ? v.toFixed(1) : v > 0 ? v.toFixed(2) : '0';
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
export function createFrontierPanel({ root, game, heroId, clan = 'player', send, buildUI = null, miniRoot = null, nearbyTown = null, selected: pickedUnits = () => [], focus=()=>{}, onOpen = () => {}, onClose = () => {}, onStable = null, onTownWar = null, afterRender = () => {} }) {
  // Tim 2026-11-07: the old "More: projects & steering" page is gone; each part is a tab along the top (like Workers)
  // Tim 2026-11-07: Steer merged into Governor (his talk, focus, taxes, market, stockade and initiative on one tab)
  const TABS = [['town', 'Overview'], ['governor', 'Governor'], ['stable', 'Stable'], ['ship', 'Shipments']];   // Shipments: rail shipments S4 (Tim 2026-11-09)
  let selected = null, mode = 'town', tab = 'town', prevStock = {}, prevAt = 0, lastHtml = '', failure = null;
  // A press on the panel holds its redraw until the mouse is let go (2026-11-22: the once-a-second redraw swapped the
  // button out from under a press and the click was lost, about one press in ten on the Workers view). Never over 2 s.
  let pressedAt = 0;
  const held = () => pressedAt > 0 && performance.now() - pressedAt < 2000;
  globalThis.addEventListener?.('mouseup', () => { if (pressedAt) { pressedAt = 0; setTimeout(() => { if (!root.hidden) render(); }, 0); } });
  globalThis.addEventListener?.('blur', () => { pressedAt = 0; });
  let govLog = false, glpage = 0;   // the governor's log: open view and its page
  if (typeof document !== 'undefined' && document.head) { const st = document.createElement('style'); st.textContent = LOG_CSS('#townpanel'); document.head.append(st); const st2 = document.createElement('style'); st2.textContent = STABLE_TAB_CSS; document.head.append(st2); }
  const tips = bindTips(root); if (miniRoot) bindTips(miniRoot);
  // pages instead of a scrollbar (menu restyle, Tim 2026-11-10): the body splits by height, per tab
  const pageState = { page: 0 }; let pageKey = '';
  if (typeof addEventListener === 'function') addEventListener('resize', () => paginate());
  // Lantern style: the serif face loads its weights on first use and text grows, so the pages are cut again then
  if (typeof document !== 'undefined') document.fonts?.addEventListener?.('loadingdone', () => paginate());
  // room in screen pixels (msPaginate measures boxes on screen): the window's own max height and frame, shrunk by a layout
  // scale, bound the body as well as the screen does (Lantern style frame, Tim 2026-11-23)
  const paginate = () => { const body = root.querySelector?.('.pbody'); if (!body || typeof innerHeight === 'undefined') return;
    const rr = root.getBoundingClientRect?.(), cs = typeof getComputedStyle === 'function' ? getComputedStyle(root) : null, sc = rr && root.offsetHeight ? rr.height / root.offsetHeight || 1 : 1;
    const bt = body.getBoundingClientRect().top, screen = innerHeight - 24 - bt;
    const maxH = parseFloat(cs?.maxHeight), own = rr && maxH > 0 ? (maxH - parseFloat(cs.borderBottomWidth || 0) - parseFloat(cs.paddingBottom || 0) - (bt - rr.top) / sc - 4) * sc : Infinity;
    msPaginate(body, pageState, Math.min(screen, own)); };
  const data=game.frontier?.data;
  let usageResource='timber',usagePage=0;
  const usageTip=(s,r)=>{
    if(!data)return '';
    const u=resourceUsage(s,r,data);
    // Tim 2026-11-22 (fix list 13-15, item 14): one line per kind ("31 farm plots, 1.0/s, all working"), not one per plot
    const groups=new Map();
    for(const e of u.entries){
      const kind=e.name.replace(/\s+\d+$/,''),key=kind+(e.once?':once':''),g=groups.get(key)||{kind,n:0,rate:0,once:0,states:{}};
      g.n++;g.rate+=e.rate;g.once+=e.once||0;const st=USAGE_STATE[e.state]||e.state.toLowerCase();g.states[st]=(g.states[st]||0)+1;groups.set(key,g);
    }
    const lines=[...groups.values()].sort((a,b)=>b.rate-a.rate||b.once-a.once).map(g=>{
      const name=g.n>1?`${g.n} ${g.kind.toLowerCase()}s`:cap1(g.kind),st=Object.entries(g.states);
      const how=st.length===1?(g.n>1?`all ${st[0][0]}`:st[0][0]):st.sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${v} ${k}`).join(', ');
      return `${name}: ${g.once?Math.round(g.once)+' once':rateS(g.rate)+'/s'}, ${how}`;
    });
    const shown=lines.slice(0,8),more=lines.length-shown.length;
    return `Using ${rateS(u.consumption)}/s (${rateS(u.demand)}/s at full work), gathering ${rateS(u.gathering)}/s, net ${u.net<0?'-':''}${rateS(Math.abs(u.net))}/s`
      +(shown.length?'\n'+shown.join('\n'):'')+(more>0?`\nand ${more} more`:'')+'\nClick for the Usage page.';
  };
  const cmd = c => send({ id: heroId, type: 'frontier', ...c });
  // Typed keep and fund boxes (Tim 2026-11-22): Enter always sends, even the number already shown (the browser fires no
  // 'change' then), and the box holds the typed number until the sim has it, so it does not flash the old value.
  const pending = {};
  const shown = (s, act, res, now) => {
    const k = `${s.id}:${act}:${res}`, p = pending[k];
    if (p && p.v !== now && Date.now() < p.until) return p.v;
    delete pending[k]; return now;
  };
  function keepCmd(s, res, v) {
    pending[`${s.id}:keepinput:${res}`] = { v, until: Date.now() + 3000 };
    cmd({ action: 'setMarketKeep', settlement: s.id, keep: v, ...(res === 'goods' ? {} : { resource: res }) });
  }
  function sendTyped(el) {
    const act = el?.dataset?.act; if (act !== 'keepinput' && act !== 'fundinput') return false;
    const s = pick(), v = Math.round(Number(el.value));
    if (s && el.value !== '' && Number.isFinite(v)) {
      if (act === 'keepinput' && v >= 0) keepCmd(s, el.dataset.id || 'goods', Math.min(v, data?.market?.keepMax ?? 100000));
      if (act === 'fundinput') { const pct = Math.max(0, Math.min(100, v)); pending[`${s.id}:fundinput:`] = { v: pct, until: Date.now() + 3000 }; cmd({ action: 'setFund', settlement: s.id, pct }); }
    }
    lastHtml = ''; render(); return true;
  }
  const shipTab = createShipmentsTab({ game, data, cmd, usage: resourceUsage });
  const stableTab = createStableTab({ game, heroId, send, data, focus });   // Stable tab shows the stable itself (Tim 2026-11-23)
  const towns = () => ownTowns(game.state.frontier, clan);
  function pick() {
    const list = towns();
    if (!list.find(s => s.id === selected)) selected = nearbyTown ? nearbyTown() : list[0]?.id ?? null;
    return list.find(s => s.id === selected) || null;
  }
  // Usage page (Tim 2026-11-05 redesign): one tab per resource plus Housing. Rates per minute.
  const pm = v => { const a = Math.abs(v); return (v < 0 ? '-' : '+') + (a >= 10 ? Math.round(a) : a >= 1 ? a.toFixed(1) : a.toFixed(2)); };
  const num = v => Math.floor(v).toLocaleString();
  const stateCls = t => /short|abandoned|unhealthy|empty/.test(t) ? 'bad' : /paid|fed|producing|making/.test(t) ? 'good' : 'dim';
  function usagePage_(s, rows) {
    const tabs = [...data.resources, 'housing'].map(r => `<button data-act="usage" data-id="${r}" class="${usageResource === r ? 'on' : ''}">${r[0].toUpperCase() + r.slice(1)}</button>`).join('');
    let h = `<div class="row"><h1>${esc(rows.title)}, Usage</h1><button data-act="usage-back">Back</button></div><div class="utabs">${tabs}</div>`;
    if (usageResource === 'housing') return h + housingHtml(s);
    const u = usageView(s, usageResource, data), full = u.cap != null && u.stock >= u.cap * 0.99;
    const fill = u.cap ? Math.min(100, u.stock / u.cap * 100) : 0;
    h += `<div class="ucard"><div class="row"><div><b class="big">${num(u.stock)}</b><span class="dim"> ${u.cap != null ? '/ ' + num(u.cap) + ' stored' : 'stored'}</span></div>`
      + `<div class="r"><b class="net ${u.net > 0.05 ? 'good' : u.net < -0.05 ? 'bad' : 'dim'}">${Math.abs(u.net) < 0.05 ? 'steady' : pm(u.net) + '/min'}</b><div class="dim">${esc(u.eta)}</div></div></div>`
      + (u.cap != null ? `<div class="ubar"><i class="${full ? 'full' : ''}" style="width:${fill}%"></i></div>` : '') + '</div>';
    const big = Math.max(1, ...u.incoming.map(x => x.rate), ...u.outgoing.map(x => -x.rate));
    const list = (title, items, sum, cls) => `<div class="lab">${title}, ${sum ? pm(cls === 'in' ? sum : -sum) + '/min' : 'nothing'}</div>` + items.map(x =>
      `<button class="urow" data-act="usage-focus" data-id="${esc(x.id)}"><span class="row"><span>${esc(x.name)}</span><b class="${cls === 'in' ? 'good' : 'bad'}">${pm(x.rate)}/min</b></span>`
      + `<span class="row"><span class="ubar s ${cls}"><i style="width:${Math.max(3, Math.abs(x.rate) / big * 100)}%"></i></span><small class="${stateCls(x.state)}">${esc(x.once ? 'one-time' : x.state)}</small></span></button>`).join('');
    h += list('Coming in', u.incoming, u.inSum, 'in') + list('Going out', u.outgoing, u.outSum, 'out');
    if (u.once.length) h += '<div class="lab">Waiting to be paid once</div>' + u.once.map(x => `<button class="urow" data-act="usage-focus" data-id="${esc(x.id)}"><span class="row"><span>${esc(x.name)} <small class="dim">${esc(x.state)}</small></span><b class="gold">${num(x.amount)} ${esc(usageResource)}</b></span></button>`).join('');
    return h + '<div class="hint">Rates are averaged over the last minute. Click a row to see it on the map.</div>';
  }
  function housingHtml(s) {
    const v = housingView(s, data), fill = x => v.beds ? Math.min(100, x / v.beds * 100) : 0;
    let h = `<div class="ucard"><div class="row"><div><b class="big">${v.used}</b><span class="dim"> / ${v.beds} beds used</span></div><div class="r"><b class="${v.growthBlock ? 'warn' : 'good'}">${esc(v.growth || '')}</b><div class="dim">${v.pop} townsfolk, ${v.workers} workers</div></div></div>`
      + `<div class="ubar"><i style="width:${fill(v.pop)}%"></i><i class="w" style="width:${fill(v.workers)}%"></i></div></div>`;
    h += '<div class="lab">Houses by level</div>' + v.levels.map(l => `<div class="hlev"><span><b>${esc(l.name)}</b><small class="dim">${esc(l.needs)}</small></span><span class="dim">${l.count === '' ? '' : 'x ' + l.count}</span><span class="dim">${l.bedsEach === '' ? '' : l.bedsEach + ' beds'}</span><b class="gold">${l.beds}</b></div>`).join('')
      + (v.empty ? `<div class="hint">${v.empty} zoned cell${v.empty > 1 ? 's' : ''} still empty (needs a road within reach and food).</div>` : '');
    h += '<div class="lab">What housing uses</div>' + v.uses.map(x => `<div class="row"><span>${esc(x.name)}</span><span><b class="bad">${x.rate > 0 ? pm(-x.rate) + '/min' : '-'}</b> <small class="${stateCls(x.state)}">${esc(x.state)}</small></span></div>`).join('');
    if (v.limits.length) h += '<div class="lab">Limits</div>' + v.limits.map(x => `<div class="row"><span>${esc(x.name)}</span><b class="${x.full ? 'warn' : 'gold'}">${esc(x.value)}${x.note ? ` <small class="dim">(${esc(x.note)})</small>` : ''}</b></div>`).join('');
    return h;
  }
// the Governor tab's steering rows (Tim 2026-11-07: were the Steer tab): taxes, goods keep, initiative.
  // Redesign (Tim 2026-11-11): one strip per choice, captions in hovers; the stockade buttons moved to the stockade card
  // (send in selected, hero and crew) and the Workers pane (To stockade).
  function steerExtras(s, rows) {
    const st = rows.steer, taxNow = st.taxLocked ? st.tax : 'auto';
    const seg = (act, opts) => `<span class="gseg">${opts.map(([v, l, on, t]) => `<button data-act="${act}" data-id="${v}" class="${on ? 'on' : ''}"${tip(t)}>${l}</button>`).join('')}</span>`;
    let x = '<div class="lab">Steer</div>';
    x += `<div class="gst"><span class="gstl"${tip(SHORT.tax[taxNow] + (st.taxLocked ? '' : `, now ${st.tax}`) + (st.tips.tax ? '\n' + st.tips.tax : ''))}>Taxes<span class="gchip">${esc(cap1(st.tax))}</span></span>`
      + seg('tax', [...['low', 'normal', 'high'].map(p => [p, cap1(p), st.taxLocked && st.tax === p, STEER.tax[p]]), ['auto', 'Auto', !st.taxLocked, STEER.tax.auto]]) + '</div>';
    // Economy pass 2 D, Tim 2026-11-09: one keep for the market and rail shipments, shown with a market or a rail line.
    // Tim 2026-11-22 (fix list 15): goods, timber and stone each have a box, on their own card like the safety fund.
    const hasMarket = s.buildings?.some(x => x.type === 'market' && x.stage === 'built');
    let keepCard = '';
    if (data?.market && (hasMarket || railLinked(s))) {
      const mk = data.market, sold = { goods: { price: mk.price, perTick: mk.perTick }, ...(mk.resources || {}) };
      const boxes = Object.entries(sold).map(([r, m]) => {
        const keep = shown(s, 'keepinput', r, r === 'goods' ? s.marketKeep ?? defaultKeep(s, data, 'goods') : s.keep?.[r] ?? defaultKeep(s, data, r));
        const how = `${hasMarket ? `The market sells ${r} above this for ${m.price} ryo each, up to ${m.perTick} a second${r === 'goods' ? '' : ' (trains to the capital pay more)'}. ` : ''}Trains ship ${r} out only above it too. If it falls below half of this, the governor orders more by rail${r === 'goods' ? ' from your own towns' : ''}.`;
        return `<div${tip(how)}><span class="gkeep"><button data-act="keepstep" data-id="${r}:-100"${tip('100 less')}>-</button><input class="keepin" type="number" min="0" max="${mk.keepMax ?? 100000}" step="10" value="${keep}" data-act="keepinput" data-id="${r}"${tip(`Type how many ${r} to keep, then Enter`)}><button data-act="keepstep" data-id="${r}:100"${tip('100 more')}>+</button></span><small>${cap1(r)}</small></div>`;
      }).join('');
      keepCard = `<div class="fundcard keepcard" data-goal="keepbox"><div class="fchead"><div><span class="fceye"${tip('How much of each the town always keeps. The market sells only what is above it, and trains ship out only what is above it.')}>Keep in town</span><span class="fcsub">${hasMarket ? 'The market sells everything above these' : 'Trains ship out only what is above these'}</span></div></div><div class="fcres">${boxes}</div></div>`;
    }
    x += `<div class="gst"><span class="gstl"${tip(SHORT.initiative[st.autoBuild ? 'on' : 'off'] + (st.tips.initiative ? '\n' + st.tips.initiative : ''))}>Initiative</span>`
      + seg('auto', [['off', 'Asks first', !st.autoBuild, STEER.initiative.off], ['on', 'Builds himself', st.autoBuild, STEER.initiative.on]]) + '</div>';
    // Safety fund (Tim 2026-11-21, sim/frontier/fund.js): a typed share of timber, stone and ryo income for the general.
    // Tim 2026-11-22: the safety fund itself is set on the Military window's General tab (war_general_tab.js); here a
    // one-line row says what he saves for and opens it, with the red reason when he has no room
    const f = s.fund;
    if (f && !s.capital && !s.camp) {
      const pct = Math.round(f.pct ?? 10), warn = s.report?.military || f.warn;
      const [lead, ...why] = String(warn || '').split(': '), bad = warn ? `<div class="fcstat bad"><b>${esc(lead)}</b>${why.length ? why.join(': ').split('. ').map(l => `<span>${esc(cap1(l))}</span>`).join('') : ''}</div>` : '';
      const now = !st.autoBuild ? 'Initiative off: he builds nothing' : !pct ? 'Set to 0: he builds nothing' : f.next ? `Saving for ${f.next}` : 'His list is built: the fund keeps for an attack';
      const open = onTownWar && data?.war?.town ? `<button data-act="townwar-general"${tip('Set the safety fund on the General tab of the Military window')}>Set</button>` : '';
      x = `<div class="gst" data-goal="fundbox"><span class="gstl"${tip('Safety fund: a share of this town\'s timber, stone and ryo income set aside for your general. He builds his military quarter and buildings only from it. Set it on the Military window\'s General tab.')}>Safety fund<span class="gchip">${pct}%</span></span><span class="fcnow">${esc(now)}</span>${open}</div>${bad}` + keepCard + x;
    } else x = keepCard + x;
    return x;
  }
  const railLinked = s => Object.values(game.state.frontier?.rail?.links || {}).some(l => l.done && !l.closed && (l.from === s.id || l.to === s.id));
  // suggestions (Approve) first, then projects under way (Tim 2026-11-09: one section in the Governor tab)
  function plansHtml(s, rows) {
    if (!rows.projects.length && !rows.suggestions.length) return '<div class="hint">Nothing planned right now.</div>';
    return '<div class="gplans">' + rows.suggestions.map(x => `<div class="gplan ask"><span><b>${esc(x.label)}</b><small>${esc(x.reason)}</small></span><button class="go" data-act="approve" data-id="${x.index}">Approve</button></div>`).join('')
      + rows.projects.map(p => `<div class="gplan"><span><b>${esc(p.label)}</b><small>${esc(p.status)}${p.canAuthorize ? ', ' + esc(p.cost) : ''}</small></span><span>${p.canAuthorize ? `<button data-act="authorize" data-id="${p.id}">OK</button> ` : ''}<button class="no" data-act="cancel" data-id="${p.id}">Cancel</button></span></div>`).join('') + '</div>';
  }
  // Tim 2026-11-10: while the build bar is open only the small Build box shows (the rest of the HUD hides via body.buildmode)
  let miniHtml = '';
  function showMini(on, s) {
    document.body?.classList?.toggle('buildmode', !!on);
    if (!miniRoot) return;
    miniRoot.hidden = !on; root.style.display = on ? 'none' : '';
    if (on) { const h = buildUI.miniHtml(s); if (h !== miniHtml && !held()) { miniRoot.innerHTML = h; miniHtml = h; afterRender(); } } else miniHtml = '';
  }
  function render() {
    if (root.hidden) { showMini(false); return; }
    const s = pick();
    const building = !!(miniRoot && s && buildUI?.isOpen?.() && !buildUI.isRosterOpen?.());
    showMini(building, s);
    if (building) return;
    if (!s) { root.innerHTML = CLOSE + '<h1>Town</h1><div class="sub">Go near your town, or choose one in Towns' + keybinds.hint('overview') + ' or the World map.</div>'; return; }
    // arrows compare with the numbers from about a second ago
    const now = Date.now();
    if (now - prevAt > 1000) { prevAt = now; prevStock[s.id] = { prev: prevStock[s.id]?.cur, cur: structuredClone(s) }; }
    const rows = reportRows(s, prevStock[s.id]?.prev);
    let h = '', overH = '', projectsH = '', stableH = '';
    const hasStable = !!s.buildings?.some(x => x.type === 'stable' && x.stage === 'built');
    if (tab === 'stable' && !hasStable) tab = 'town';
    if (tab === 'projects') tab = 'governor';
    if (mode === 'town' && tab === 'governor' && govLog) {
      h += logPageHtml('Governor\'s log', s.log?.governor, glpage, game.state.tick);
    } else if (mode === 'town' && tab === 'governor') {
      const say = governorSays(rows), face = msConcept('governer1');
      h += `<div class="govhead"><div class="govface"${face ? ` style="background-image:url('${face}')"` : ''}></div><div class="govmain"><div class="goveye">Governor</div><h1>${esc(rows.title)}</h1><div class="chat">"${esc(say.text)}"</div></div></div>`
        + '<div class="choices">' + say.choices.filter(c => c.id !== 'close').map(c => `<button data-act="talk" data-id="${c.id}">${esc(c.label)}</button>`).join('') + '</div>';
      // Tim 2026-11-09: projects live here now (no separate tab), open under a plain header; approving matters most
      h += `<div class="lab"${tip('What the governor wants to build (Approve starts it) and what is being built now. With Initiative On he starts them himself, within his budget.')}>Building plans</div>` + plansHtml(s, rows);
      // focus cards with drawn icons; what each does is in its hover, the chosen one is spelled out under the cards
      const st = rows.steer, pri = s.priority || st.priority;
      h += '<div class="lab">Focus</div><div class="gfocus">'
        + ['grow', 'produce', 'trade', 'fortify'].map(p => `<button data-act="priority" data-id="${p}" class="gcard${pri === p ? ' on' : ''}"${tip(STEER.focus[p])}>${FOCUS_ICON[p]}<b>${cap1(p)}</b></button>`).join('')
        + `</div><div class="focuscap">${esc(SHORT.focus[pri] || '')}</div>` + steerExtras(s, rows);
      h += logRowHtml('Governor\'s log', s.log?.governor, game.state.tick, 'Nothing yet: he logs what he places, zones and trains here');
    } else if(mode==='usage' && data) {
      h = usagePage_(s, rows);
    } else {
      const mood = rows.mood;
      h += `<div><h1>${esc(rows.title)}</h1><div class="sub">Yours, mood <b${tip(mood.tip)}>${mood.value}</b> / 100</div></div>`;
      // B3: town hall tier and its upgrade
      if (data?.tiers?.list) {
        const tier = tierOf(s, data), next = nextTier(s, data);
        const what = t => t ? `ring ${t.ring}, housing ${t.cells.housing} / farm ${t.cells.farm} / work ${t.cells.work} cells, ${t.workers} workers, storehouses ${t.placed.storehouse}, camps ${t.placed.camps}` : '';
        h += `<div class="row"><span${tip('Town hall tier limits:\n' + what(tier))}>Town hall: <b>${esc(tier.name)}</b> <span class="dim">(tier ${s.tier || 1}), workers ${workerCount(s)} / ${tier.workers}</span></span>`
          + (next ? '' : '<span class="dim">Highest tier</span>') + '</div>'
          + (next ? hallUpgradeHTML(s, data, game.state, { act: 'upgrade' }) : '');   // Tim 2026-11-25: the requirements block, as on the hall card
      }
      // war 8b: the town's military buildings, war chest and hall war upgrade live in the town war window
      if (onTownWar && data?.war?.town) h += `<div class="row"><span${tip('Military buildings go inside the town ring and are built by town builders. Some need the town hall war upgrade. Troops train only while a war is on this town, paid from its war chest.')}>War upgrade: <b>${s.warHall ? 'Done' : s.warUpgrade ? (s.builders ? `Building, about ${warUpgradeSeconds(s, data)} s` : 'Waiting for builders') : 'Not bought'}</b></span></div>`;
      const people = peopleRows(s, prevStock[s.id]?.prev, data);
      h += '<div class="lab">Stock <button data-act="usage" data-id="timber">Usage</button></div><div class="stock">' + rows.stock.map(r => `<div${tip((r.tip || '')+'\n'+usageTip(s,r.key))}${(s.stock[r.key] ?? 0) < 50 ? ' class="low"' : ''}>${STOCK_ART[r.key] ? `<img class="sprop" src="${STOCK_ART[r.key]}" alt="">` : ''}<button data-act="usage" data-id="${r.key}">${esc(r.label)}</button><b${r.full ? ' class="full"' : ''}>${r.value}</b>${r.cap != null ? `<span class="dim cap">/ ${r.cap}${r.full ? ' full' : ''}</span>` : ''}${arrow[r.arrow]}</div>`).join('')
        // Tim 2026-11-16: townspeople are a stock too; the hover says what they do and how the town grows
        + `<div class="ppl"${tip(people.tip)}><img class="sprop" src="${STOCK_ART.people}" alt=""><button data-act="usage" data-id="housing">People</button><b>${people.pop}</b><span class="dim cap">/ ${people.beds} beds</span>${arrow[people.arrow]}</div>` + '</div>';
      // Tim 2026-11-16: the growth line (green, or red with what blocks it) and one chip per job type, short ones red
      h += `<div class="lab">People</div><div class="row"><span>${esc(rows.pop.text)}</span><span class="${people.growth.bad ? 'pwarn' : 'pgood'}">${esc(people.growth.text)}</span></div><div class="bar"><i style="width:${Math.round(rows.pop.fill * 100)}%"></i></div>`
        + (people.chips.length ? `<div class="pjobs"${tip(rows.jobsTip)}>` + people.chips.map(c => `<span class="pjob${c.short ? ' short' : ''}">Job: ${esc(c.label)} <b>${c.want == null ? c.have : `${c.have} / ${c.want}`}</b>${c.short ? ` <i>short ${c.short}</i>` : ''}</span>`).join('') + '</div>' : '')
        + `<div class="row"><span class="dim">Idle: ${people.idle}${people.idle ? ' (half tax)' : ''}</span><span class="dim">${people.short ? `Short ${people.short} people for jobs` : 'Every job filled'}</span></div>`;
      if (rows.pop.goodsWait) h += '<div class="hint">Houses need goods to level up (workshops make goods)</div>';   // B7
      h += `<div class="row" style="margin-top:5px"><span>Mood</span><span class="dim"${tip(mood.why.map(w=>w.tip).join('\n'))}>${mood.why.length ? esc(mood.why.map(w => w.text).join(', ')) : 'Content'}</span></div><div class="bar m"><i style="width:${mood.value}%"></i></div>`;
      if (mood.why.length) h += '<div class="hint">' + esc(mood.why.map(w => w.hint).join(', ')) + '</div>';
      h += buildUI?.workersHtml?.(s) || '';   // Tim 2026-11-16: training and first steps, as their own section
      h += `<div class="govnote"><div class="lab">From the governor</div><div>Doing: <b>${esc(rows.doing || 'Nothing yet')}</b></div>` + (rows.next ? `<div>Next: <span class="dim">${esc(rows.next)}</span></div>` : '')
        + rows.waiting.map((w, i) => { const wi = rows.waitingInfo?.[i]; return `<span class="pill red"${wi ? tip(wi.tip) + ` style="background:linear-gradient(90deg,#3d5a2a ${Math.round(wi.fill * 100)}%,#2a1714 ${Math.round(wi.fill * 100)}%)"` : ''}>${esc(w)}</span>`; }).join(' ') + '</div>';
      { // 7c-5 (Tim 2026-11-12): the town's ox carts in their own section: recall them into the town (also in a war), send parked ones out again
        const camps = (s.buildings || []).filter(b => b.stage === 'built' && (b.carts || []).length), all = camps.flatMap(b => b.carts);
        if (all.length) {
          const parked = all.filter(c => c.at === 'parked').length, wrecked = all.filter(c => c.at === 'wrecked').length, coming = all.filter(c => c.recall).length, road = all.length - parked - wrecked - coming;
          const parts = [road ? `${road} working` : '', coming ? `${coming} coming in` : '', parked ? `${parked} parked in town` : '', wrecked ? `${wrecked} destroyed` : ''].filter(Boolean).join(', ');
          h += `<div class="lab">Ox carts</div><div class="row"><span>${esc(parts)}</span><span><button data-act="carts-recall"${road ? '' : ' disabled'}${tip('Every cart drives into the town and stays parked there, safe from a raid. Camps keep what workers bring until the carts go out again. Works during a war too.')}>Recall</button> <button data-act="carts-send"${parked || coming ? '' : ' disabled'}${tip('Parked carts drive back to their camps and carry on.')}>Send out</button></span></div>`;
        }
      }
      overH = h; h = '';
      if (!rows.projects.length && !rows.suggestions.length) h += '<div class="hint">No projects or suggestions right now.</div>';
      if (rows.projects.length) h += '<div class="lab">Projects</div>' + rows.projects.map(p => `<div class="row"><span>${esc(p.label)} <span class="dim">, ${esc(p.status)}${p.canAuthorize ? ', ' + esc(p.cost) : ''}</span></span><span>${p.canAuthorize ? `<button data-act="authorize" data-id="${p.id}">OK</button> ` : ''}<button class="no" data-act="cancel" data-id="${p.id}">Cancel</button></span></div>`).join('');
      if (rows.suggestions.length) h += `<div class="lab"${tip(rows.suggestionsTip)}>Suggestions</div>` + rows.suggestions.map(x => `<div class="row"><span>${esc(x.label)} <span class="dim">, ${esc(x.reason)}</span></span><button data-act="approve" data-id="${x.index}">Approve</button></div>`).join('');
      // Tim 2026-11-05: every choice says what it does (hover) and the current one is spelled out under its row
      const b = (act, val, label, on, t = '') => `<button data-act="${act}" data-id="${val}" class="${on ? 'on' : ''}"${t ? tip(t) : ''}>${label}</button>`;
      projectsH = `<h1>${esc(rows.title)}</h1>` + h; h = '';
      if (hasStable) stableH = stableTab.html(s);   // Tim 2026-11-23: the whole stable in the tab (src/stable_tab.js)
    }
    if (mode === 'town' && tab !== 'governor') {
      // h now holds the steer section; pick the body of the current tab
      h = tab === 'projects' ? projectsH : tab === 'stable' ? stableH : tab === 'ship' ? `<div class="shiptab">${shipTab.html(s)}</div>` : overH;
    }
    const rosterOpen = !!buildUI?.isRosterOpen?.();
    let tabsH = '';
    if (mode === 'town') {
      tabsH = '<div class="ptabs">' + TABS.filter(([id]) => id !== 'stable' || hasStable).map(([id, label]) => `<button data-act="tab" data-id="${id}" class="${!rosterOpen && tab === id ? 'on' : ''}${id === 'ship' && !railLinked(s) ? ' dimtab' : ''}"${id === 'ship' && !railLinked(s) ? ' title="Needs a rail line"' : id === 'governor' && rows.suggestions.length ? ` title="${rows.suggestions.length} suggestion(s) waiting for your Approve"` : ''}>${label}${id === 'governor' && rows.suggestions.length ? ` <span class="badge">${rows.suggestions.length}</span>` : ''}</button>`).join('')
        + `<button data-act="build-workers" class="${rosterOpen ? 'on' : ''}"${s.tiredCamps?.length ? tip(`${s.tiredCamps.length} work camp${s.tiredCamps.length > 1 ? 's' : ''} over their max: open Workers to move the extras`) : ''}>Workers (${s.workers?.length || 0})${s.tiredCamps?.length ? `<i class="wcount">${s.tiredCamps.length}</i>` : ''}</button></div>`;
      // Tim 2026-11-22: the Military window opens from a big button beside the Build bar
      const warBtn = onTownWar && data?.war?.town ? `<button data-act="townwar" class="warbig"${tip('Military: build barracks and other war buildings, fill the war chest, buy the hall war upgrade and pick how your general fights.')}><svg class="warico" viewBox="0 0 20 20" aria-hidden="true"><g stroke-linecap="round" fill="none"><path d="M4.5 15.5 L16.5 2.5" stroke="#f3e3bd" stroke-width="2.2"/><path d="M15.5 15.5 L3.5 2.5" stroke="#f3e3bd" stroke-width="2.2"/><path d="M2.5 17.5 L5.5 14.5" stroke="#e6c47a" stroke-width="3"/><path d="M17.5 17.5 L14.5 14.5" stroke="#e6c47a" stroke-width="3"/><path d="M3.5 12.5 L7 15.8" stroke="#e6c47a" stroke-width="2.2"/><path d="M16.5 12.5 L13 15.8" stroke="#e6c47a" stroke-width="2.2"/></g></svg>Military</button>` : '';
      const build = (tab === 'town' || rosterOpen) ? buildUI?.html(s, false, warBtn) || '' : '';
      h = rosterOpen ? build : build + h;
    }
    // Tim 2026-11-08: a close button on the panel itself (O and Esc still work)
    h = CLOSE + tabsH + `<div class="pbody${mode === 'town' && tab === 'stable' && !rosterOpen ? ' stabbody' : ''}">` + h + (failure && Date.now() - failure.at < 5000 ? `<div class="why">${esc(failure.text)}</div>` : '') + '</div>';
    const key = h + tab;
    if (['keepinput', 'shipinput', 'fundinput'].includes(document.activeElement?.dataset?.act) && root.contains(document.activeElement)) return;   // typing a keep level
    const pk = `${mode}|${tab}|${rosterOpen}|${usageResource}`; if (pk !== pageKey) { pageKey = pk; pageState.page = 0; }
    if (key !== lastHtml && !held()) { root.innerHTML = h; lastHtml = key; paginate(); if (tab === 'ship') shipTab.fit(root); afterRender(); }
  }
  if (miniRoot) {
    miniRoot.addEventListener('mousedown', e => { pressedAt = performance.now(); e.stopPropagation(); });
    miniRoot.addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'), s = pick();
      if (b && s && buildUI?.click(b.dataset, s, e)) { lastHtml = ''; render(); b.blur?.(); }
    });
  }
  // Tim 2026-11-20: a click anywhere on a worker card selects it (not only the portrait); the group dropdown and buttons keep their own clicks
  const btnOf = e => e.target.closest('button[data-act]') || (e.target.closest('select, input, button, a') ? null : e.target.closest('.wcard')?.querySelector('button.wface'));
  root.addEventListener('mousedown', e => {
    pressedAt = performance.now(); e.stopPropagation();
    // a typed Shipments amount counts before the button under the mouse is clicked (its change event would redraw the row first)
    const t = document.activeElement;
    if (t?.dataset?.act === 'shipinput' && t !== e.target && root.contains(t)) { shipTab.input(t.dataset, t.value, pick()); t.dataset.act = 'shipdone'; }
  });
  root.addEventListener('mouseover', e => logHover(root, e));
  root.addEventListener('dblclick',e=>{
    const b=btnOf(e),s=pick();
    if(b && s && buildUI?.doubleClick?.(b.dataset,s)){lastHtml='';render();}
  });
  // order slip (Tim 2026-11-25): Enter sends, Esc closes the slip (before the panel's own Esc)
  window.addEventListener('keydown', e => {
    if (root.hidden || mode !== 'town' || tab !== 'ship' || !shipTab.slipOpen()) return;
    if (shipTab.key(e, pick())) { e.preventDefault(); e.stopImmediatePropagation(); lastHtml = ''; render(); }
  }, true);
  root.addEventListener('keydown', e => { if (e.target.closest?.('input')) { e.stopPropagation(); if (e.code === 'Enter' || e.code === 'NumpadEnter') { sendTyped(e.target); e.target.blur(); } } });
  root.addEventListener('change', e => {
    if (sendTyped(e.target)) return;
    if (e.target.dataset?.act === 'shipinput') { shipTab.input(e.target.dataset, e.target.value, pick()); lastHtml = ''; render(); return; }
    const s=pick();if(s && buildUI?.change?.(e.target.dataset,e.target.value,s)) {lastHtml='';render();}
  });
  root.addEventListener('click', e => {
    const turn = e.target.closest?.('[data-ms-page]'); if (turn?.dataset?.msPage !== undefined) { pageState.page += Number(turn.dataset.msPage); paginate(); return; }
    const lg = e.target.closest?.('[data-logopen],[data-logback],[data-lpage]');
    if (lg?.dataset && (lg.dataset.logopen || lg.dataset.logback || lg.dataset.lpage)) { const d = lg.dataset; if (d.lpage) glpage = logTurn(glpage, Number(d.lpage), pick()?.log?.governor); else { govLog = !!d.logopen; glpage = 0; } lastHtml = ''; render(); return; }
    const b = btnOf(e); if (!b) return;
    if (b.dataset.act === 'panel-close') { close(); return; }
    const s = pick(), id = b.dataset.id, sid = s?.id;
    if (s && buildUI?.click(b.dataset, s, e)) { lastHtml = ''; render(); b.blur?.(); return; }
    if (s && shipTab.click(b.dataset, s)) { lastHtml = ''; render(); b.blur?.(); return; }
    if (s && stableTab.click(b.dataset, s)) { lastHtml = ''; render(); b.blur?.(); return; }
    if (b.dataset.act === 'talk') buildUI?.close();
    switch (b.dataset.act) {
      case 'usage': if(data && (data.resources.includes(id) || id==='housing')){usageResource=id;mode='usage';usagePage=0;buildUI?.close();}break;
      case 'usage-back':mode='town';break;
      case 'usage-page':usagePage=Number(id);break;
      case 'usage-focus':{const p=data && flowFocus(s,id,usageResource,data);if(p)focus(p[0],p[1]);break;}
      case 'town': selected = id; mode = 'town'; break;
      case 'tab': buildUI?.close(); govLog = false; tab = TABS.some(t => t[0] === id) ? id : 'town'; mode = 'town'; break;
      case 'talk': if (id && s) { const c = id === 'close' ? null : talkCommand(id, reportRows(s)); if (c) cmd(c); tab = id === 'close' ? 'town' : 'governor'; } else tab = 'governor'; mode = 'town'; break;
      case 'authorize': cmd({ action: 'authorize', project: id }); break;
      case 'cancel': cmd({ action: 'cancel', project: id }); break;
      case 'approve': cmd({ action: 'approveSuggestion', settlement: sid, index: Number(id) }); break;
      case 'priority': cmd({ action: 'setPriority', settlement: sid, priority: id }); break;
      case 'tax': cmd({ action: 'setTax', settlement: sid, level: id }); break;
      case 'auto': cmd({ action: 'setAutoBuild', settlement: sid, on: id === 'on' }); break;
      case 'upgrade': cmd({ action: 'upgradeHall', settlement: sid }); break;   // B3
      case 'carts-recall': cmd({ action: 'cartOrder', town: sid, mode: 'recall' }); break;   // 7c-5
      case 'carts-send': cmd({ action: 'cartOrder', town: sid, mode: 'send' }); break;
      case 'garrison-in': {   // Stockade garrison: who goes in
        const mine = game.state.entities[heroId]?.owner;
        const ids = id === 'selected' ? pickedUnits() : Object.values(game.state.entities).filter(u => (u.owner ?? u.workerOwner) === mine && !u.garrison && u.place === 'world' && (id === 'workers' ? u.worker : !u.worker && u.type !== 'civilian')).map(u => u.id);
        if (ids.length) cmd({ action: 'garrison', mode: 'enter', town: sid, units: ids });
        break;
      }
      case 'garrison-out': cmd({ action: 'garrison', mode: 'leave', town: sid }); break;
      case 'openstable': onStable?.(sid); break;
      case 'townwar': onTownWar?.(sid); break;   // war 8b
      case 'townwar-general': onTownWar?.(sid, 'general'); break;   // the safety fund row (Tim 2026-11-22)
      case 'stable': cmd(id.startsWith('choose:') ? { action: 'stable', mode: 'choose', town: sid, horse: id.slice(7) } : id === 'cancel' || id === 'omnibus' ? { action: 'stable', mode: id, town: sid } : { action: 'stable', mode: 'horse', kind: id, town: sid }); break;
      case 'keep': cmd({ action: 'setMarketKeep', settlement: sid, keep: Number(id) }); break;   // economy pass 2 D
      case 'keepstep': if (s) {   // Keep in town card -/+ (Tim 2026-11-22)
        const [r, d] = id.split(':'), now = shown(s, 'keepinput', r, r === 'goods' ? s.marketKeep ?? defaultKeep(s, data, 'goods') : s.keep?.[r] ?? defaultKeep(s, data, r));
        keepCmd(s, r, Math.max(0, Math.min(data?.market?.keepMax ?? 100000, now + Number(d))));
      } break;
      case 'fund': if (s?.fund) { const pct = Math.max(0, Math.min(100, shown(s, 'fundinput', '', Math.round(s.fund.pct ?? 10)) + Number(id))); pending[`${sid}:fundinput:`] = { v: pct, until: Date.now() + 3000 }; cmd({ action: 'setFund', settlement: sid, pct }); } break;   // safety fund -/+
    }
    lastHtml = ''; render(); b.blur?.();
  });
  // rejected commands: show the newest rejection's reason for a few seconds
  let seen = 0;
  function watchReceipts() {
    for (const r of game.state.frontier?.receipts || []) if (r.clan === clan && r.seq > seen) { seen = r.seq; if (!r.ok) failure = { text: `Not possible: ${r.reason}`, at: Date.now() }; }
  }
  setInterval(() => { watchReceipts(); render(); }, 1000);
  function open(id) { if (id) selected = id; else if (nearbyTown) selected = nearbyTown(); mode = 'town'; tab = 'town'; govLog = false; root.hidden = false; lastHtml = ''; render(); onOpen(); }
  function close() { buildUI?.close(); showMini(false); if (!root.hidden) { root.hidden = true; tips.hide(); onClose(); } }
  return { open, close, toggle() { root.hidden ? open() : close(); }, isOpen: () => !root.hidden, talk(id) { open(id); tab = 'governor'; render(); }, render };
}
