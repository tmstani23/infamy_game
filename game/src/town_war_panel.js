// Town war window (war checkpoint 8b-3, mock OK'd by Tim 2026-11-15): presentation only, the sim checks every
// command again. The same look as the war camp menus (war_camp_panel.js CSS under #townwar).
// show(townId): the town hall's War window, tabs Military (the military building cards: picking one hands the
// build bar its tool), War chest (only while a war is on the town: fill it from the coffers with a typeable box) and
// Hall (the town hall war upgrade). show(townId, buildingId): one military building's (or, in a war, the stable's)
// own menu: the camp's training cards paid from the town's war chest, greyed while the muster runs.
// Opened by right-clicking your town hall in a war or one of your military buildings (town_hover.js), the red war
// coin when your hero is in a war on your town, and the stable menu's Cavalry button in a war.
import { WAR_PANEL_CSS, TRAITS, DOES } from './war_camp_panel.js';
import { msConcept } from './menu_shell.js';
import { surrenderFoot, SURRENDER_CSS } from './war_surrender_foot.js';
import { generalTab, GENERAL_CSS, keepShare, STRATEGY_NAMES } from './war_general_tab.js';
import { portrait } from './portraits.js';
import { SPECIALS } from './sim/special_cast.js';
import { ABOUT } from './ability_rows.js';
import { militaryFor, militaryNeeds, militaryCount, warUpgradeCheck, warUpgradeSeconds } from './sim/frontier/town_military.js';
import { cellToWorld } from './sim/frontier/town_grid.js';
import { chestSendHtml, chestSendSig, chestSendClick, CHEST_SEND_CSS } from './war_chest_send.js';   // 8e-3
import { armoryHtml, armorySig, ARMORY_CSS } from './war_armory_menu.js';   // 8e-9

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nice = t => (t || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const PER_PAGE = 8, UPP = 3;
const EXTRA = `
#townwar .muster{margin-top:8px;border:1px solid #c9473d;border-radius:6px;padding:7px 10px;background:linear-gradient(90deg,#3a1512,#14181c);display:flex;justify-content:space-between;align-items:center}
#townwar .muster b{color:#ffe9dc;letter-spacing:.08em;font-size:12px;text-transform:uppercase}#townwar .muster span{color:#ee9a8c;font-size:12px}
#townwar .coin.warn{box-shadow:0 0 0 2px #8e2d26,0 0 0 3px #1a140c}#townwar .coin.warn b{color:#ffb0a0}
#townwar .putrow{display:flex;gap:8px;align-items:center;margin-top:8px}
#townwar .card .pic img{max-width:104px}`;
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function createTownWarPanel({ game, heroId, catalog, frontierData, units = null, send, blocked = () => false, onStart = () => {}, placeTool = () => false, openTerms = () => false }) {
  const style = document.createElement('style'); style.textContent = WAR_PANEL_CSS.replaceAll('#warcamp', '#townwar') + EXTRA + SURRENDER_CSS('#townwar') + GENERAL_CSS('#townwar') + CHEST_SEND_CSS('#townwar') + ARMORY_CSS('#townwar'); document.head.append(style);
  const root = document.createElement('div'); root.id = 'townwar'; root.hidden = true; document.body.append(root);
  const F = frontierData || {}, W = () => game.frontier?.war?.data || F.war || {};
  const war = () => game.frontier?.war;
  const hero = () => game.state.entities[heroId];
  const town = id => game.state.frontier?.settlements?.[id] || null;
  const warOn = id => Object.values(game.state.frontier?.wars?.list || {}).find(w => w.town === id) || null;
  const artName = type => F.townArt?.[type] || type;
  const artUrl = type => { const n = artName(type), kind = catalog?.items?.[n]?.kind || 'buildings'; return `art/${kind}/${n}.png`; };
  let open = null, bid = null, tab = 'military', page = 0, tpage = 0, sig = '', why = '', confirm = false;
  const counts = {};
  const mine = s => !!s && s.owner === hero()?.owner && !s.capital;
  // the town's buildings with a menu here: military ones, and the stable while a war is on the town
  const hasMenu = (s, b) => !!b && (F.buildings?.[b.type]?.military || (b.type === 'stable' && !!warOn(s.id)));
  function show(townId, buildingId = null) {
    const s = town(townId); if (!mine(s)) return false;
    const b = buildingId ? s.buildings?.find(x => x.id === buildingId) : null;
    if (buildingId && !hasMenu(s, b)) return false;
    open = townId; bid = b ? b.id : null; tab = warOn(townId) ? 'chest' : 'military'; page = tpage = 0; why = ''; sig = ''; root.hidden = false; onStart(); fill(); return true;
  }
  function close() { open = null; bid = null; root.hidden = true; }
  const chips = (cost, have) => Object.entries(cost || {}).filter(([, v]) => v).map(([r, v]) => `<span class="chip ${r}${(have?.[r] ?? Infinity) < v ? ' short' : ''}" title="${esc(`${v} ${r}`)}"><i></i>${v}</span>`).join('');
  const num = (key, d = 1) => `<input class="num" type="text" inputmode="numeric" data-n="${esc(key)}" value="${esc(counts[key] ?? d)}">`;
  const coin = (cls, n, label, tip) => `<div class="coin ${cls}" title="${esc(tip)}"><b>${n}</b><span>${label}</span></div>`;
  const face = model => msConcept(model) || (catalog && typeof document !== 'undefined' ? portrait(catalog, model, () => { sig = ''; }) : null) || '';

  function fill() {
    const s = town(open); if (!mine(s)) { close(); return; }
    const w = warOn(open), defending = !!w && w.defender === s.owner, D = war()?.defense, v = defending ? D?.view?.(w.id) : null;
    const me = s.owner, clan = game.state.clans?.[me], faction = clan?.faction, U = W().units || {}, B = W().buildings || {};
    const bld = bid ? s.buildings.find(x => x.id === bid) || null : null; if (bid && !bld) bid = null;
    const ST = game.frontier?.structures, stOf = b => b && ST?.list?.().find(st => st.b?.id === b.id && st.town === s.id) || null;
    const hall = s.buildings.find(b => b.type === 'town_hall'), hallSt = stOf(hall);
    const types = militaryFor(s, F, game.state), pages = Math.max(1, Math.ceil(types.length / PER_PAGE)); page = Math.min(page, pages - 1);
    const sites = (s.projects || []).filter(p => F.buildings?.[p.type]?.military);
    const strat = game.frontier?.warGeneral?.strategyOf?.(me) || 'siege', GR = game.frontier?.warGeneral?.rules?.() || W().general || {};
    const next = JSON.stringify([open, bid, tab, page, tpage, why, confirm, !!w?.terms, v, strat, s.warKeep, Math.floor(s.stock?.ryo || 0), Math.floor(s.stock?.timber || 0), Math.floor(s.stock?.stone || 0), s.warHall, s.warUpgrade?.left, s.builders, Math.floor(clan?.ryo ?? 0), clan?.treasuryKeep,
      s.buildings.map(b => [b.id, b.stage, b.queue?.length || 0, b.queue?.[0] ? Math.ceil(b.queue[0].left / 20) : 0]), sites.map(p => [p.id, Math.floor(100 * p.progress / Math.max(1, p.need)), p.paid]), hallSt ? Math.ceil(ST.hpOf(hallSt)) : 0, bld && stOf(bld) ? Math.ceil(ST.hpOf(stOf(bld))) : 0, w && defending ? chestSendSig(game, w, me) : '', w && defending ? armorySig(game, w, me) : '']);
    if (next === sig) return;
    sig = next;
    const typing = root.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' ? { n: document.activeElement.dataset.n, a: document.activeElement.selectionStart, b: document.activeElement.selectionEnd } : null;
    const musterBox = v?.muster > 0 ? `<div class="muster"><b>Mustering</b><span>Training opens in ${mmss(v.muster)}${bld ? '' : '. You can fill the war chest now.'}</span></div>` : '';
    const coins = (extra = true) => (defending ? coin('red', v?.chest ?? 0, 'War chest', 'Ryo for the troops this town trains in this war. Filled from the town coffers (War chest tab). What is left goes back to the coffers when the war ends.')
        + coin('', `${(v?.troops || 0) + (v?.queued || 0)}/${v?.cap || 0}`, 'Troops', 'Troops out and in training, of the troop cap. Your hero crew in the war circle count too. Supply tents raise it.') : '')
      + (extra ? coin('', Math.floor(s.stock?.ryo || 0), 'Coffers', `${s.name} coffers: the town's own ryo`) + (defending ? coin(v?.muster > 0 ? 'warn' : '', v?.muster > 0 ? mmss(v.muster) : 'Open', 'Muster', 'Training opens this long after the war was declared') : '')
        + coin('', STRATEGY_NAMES[strat] || strat, 'General', 'How your general fights while your hero is away from a war. Change it on the General tab.') : '');
    const stats = key => {
      const e = U[key] || {}, t = typeof e.type === 'string' ? e.type : e.type?.[faction] || Object.values(e.type || {})[0], u = units?.types?.[t] || {};
      const model = (typeof e.model === 'string' ? e.model : e.model?.[faction] || Object.values(e.model || {})[0]) || u.sprite || t;
      const dps = u.gatling ? u.gatling.damage * 20 / Math.max(1, u.gatling.everyTicks) : (u.damage || 0) / Math.max(0.1, u.attackSpeed || 1);
      const range = u.rifle?.range ?? u.gatling?.range ?? u.attackRange ?? 1;
      const abil = Object.entries(SPECIALS).filter(([, S]) => S.has(u, { type: t })).map(([id, S]) => `${S.name}: ${ABOUT[id] || ''}`);
      if (TRAITS[t]) abil.push(TRAITS[t]);
      return { name: u.name || nice(key), model, hp: u.hp ?? 0, dps, range, speed: u.run ?? 0, abil };
    };
    let body = '', title = `Defence of ${s.name}`;
    if (bld) {
      title = nice(bld.type);
      const list = war()?.trainsAt(bld.type, me) || [];
      if (bld.type !== 'armory' && (!list.length || (bld.type !== 'stable' && !F.buildings?.[bld.type]?.military))) body = `<div class="sec"><span>${esc(nice(bld.type))}</span></div><div style="margin-top:10px;font-size:14px">${esc((DOES[bld.type] || (() => 'A military building.'))(B[bld.type] || {}))}</div>`;
      else if (bld.type === 'armory') body = defending ? armoryHtml({ game, war: w, owner: me, artUrl, chip: (r, n) => `<span class="chip ${r}${(r === 'ryo' ? v?.chest ?? 0 : s.stock?.[r] ?? 0) < n ? ' short' : ''}"><i></i>${n}</span>` }) : '<div style="margin-top:10px;font-size:14px">Troop upgrades for a war on this town: more damage and less damage taken by unit group, bought here while the war is on. Troops only.</div>';
      else if (!defending) body = `<div class="sec"><span>Train</span></div><div style="margin-top:10px;font-size:14px">It trains ${esc(list.map(u => stats(u).name.toLowerCase()).join(', '))} while a war is on ${esc(s.name)}, paid from the town's war chest.</div>`;
      else {
        const bv = v.buildings.find(x => x.id === bld.id), ulist = bv?.units || [], tps = Math.max(1, Math.ceil(ulist.length / UPP)); tpage = Math.min(tpage, tps - 1);
        const q = bld.queue || [], first = q[0], locked = v.muster > 0 || !bv;
        const lockWhy = bld.type === 'stable' && !s.warHall ? 'Cavalry need the town hall war upgrade (Hall tab)' : '';
        const cards = ulist.slice(tpage * UPP, tpage * UPP + UPP).map(({ unit, ryo, seconds }) => {
          const S = stats(unit), pic = face(S.model);
          const tip = `${S.name}. Health ${S.hp}, damage a second ${S.dps.toFixed(1)}, range ${S.range}, speed ${S.speed}. ${ryo} ryo from the war chest, ${Math.round(seconds)} s to train.${S.abil.length ? ' ' + S.abil.join(' ') : ''}`;
          return `<div class="ucard" title="${esc(tip)}"><div class="uhead"><div class="ustill${pic.includes('/stills/') ? ' concept' : ''}"${pic ? ` style="background-image:url('${esc(pic)}')"` : ''}></div><div class="ustats"><div class="un">${esc(S.name)}</div>
            <div class="sr"><span>Health</span><b>${S.hp}</b></div><div class="sr"><span>Damage a sec</span><b>${S.dps.toFixed(S.dps < 10 ? 1 : 0)}</b></div><div class="sr"><span>Range</span><b>${S.range}</b></div><div class="sr"><span>Speed</span><b>${S.speed}</b></div></div></div>
            <div class="cost" style="justify-content:flex-start;margin-top:6px"><span class="chip ryo${v.chest < ryo ? ' short' : ''}"><i></i>${ryo}</span><span class="small">${Math.round(seconds)} s each</span></div>
            <div class="small ab">${S.abil.length ? esc(S.abil.map(x => x.split(':')[0].split('.')[0]).join(', ')) : '&nbsp;'}</div>
            <div style="display:flex;gap:6px;margin-top:6px">${num(`t:${bld.id}:${unit}`)}<button class="go" data-train="${esc(bld.id)}" data-unit="${esc(unit)}"${locked ? ' disabled' : ''}>Train</button></div></div>`;
        }).join('');
        const tl = first ? (v.buildings.find(x => x.id === bld.id)?.units.find(u => u.unit === first.unit)?.seconds || 1) * 20 : 1;
        body = `<div class="sec"><span>Train</span><b>One at a time per building</b></div>${musterBox}${lockWhy ? `<div class="muster"><b>Locked</b><span>${esc(lockWhy)}</span></div>` : ''}<div class="ugrid">${cards}</div>
          ${tps > 1 ? `<div class="foot"><span class="small">Page ${tpage + 1} of ${tps}</span><span><button data-tpage="-1"${tpage ? '' : ' disabled'}>Prev</button> <button data-tpage="1"${tpage < tps - 1 ? '' : ' disabled'}>Next</button></span></div>` : ''}
          <div class="sec"><span>Queue</span><b>Troop cap: ${v.troops} out, ${v.queued} training, ${Math.max(0, v.cap - v.troops - v.queued)} free of ${v.cap}</b></div>
          <div class="pips">${q.slice(0, 10).map((x, i) => `<i class="${i ? 'q' : ''}" style="${i ? '' : `background:conic-gradient(#e0b85a 0 ${Math.round(100 * (1 - x.left / Math.max(1, tl)))}%,#14130f 0)`}"></i>`).join('')}
            <span class="small" style="margin-left:6px">${first ? `${esc(stats(first.unit).name)}, next in ${Math.ceil(first.left / 20)} s${q.length > 1 ? `. Then ${q.length - 1} more` : ''}` : 'Idle'}</span>
            ${q.length ? `<button style="margin-left:auto;padding:2px 8px" data-untrain="${esc(bld.id)}">Cancel last</button>` : ''}</div>`;
      }
    } else if (tab === 'chest' && defending) {
      const putN = Math.max(0, Math.floor(Number(counts.put ?? 500)) || 0), keepsT = Math.floor((s.stock?.ryo || 0) - putN);
      body = `<div class="rsec"><span>Put in now</span><b>Town coffers</b></div>
        <div class="rrow"><div><div class="rn">${esc(s.name)} coffers</div><div class="rk${keepsT < 0 ? ' red' : ''}" title="${esc(`Ryo for the troops this town trains in this war: ${v.chest} in the war chest now. Every troop your town's military buildings and stable train is paid from it; buildings are paid from town stock. What is left, and the ryo of troops still in training, goes back to the coffers when the war ends.`)}">Keeps ${Math.max(0, keepsT)}</div></div>${num('put', 500)}<button class="go" data-put="1">Put in</button></div>
        ${chestSendHtml({ game, war: w, owner: me, counts, data: game.frontier?.data || F })}${musterBox}${surrenderFoot({ side: 'defender', town: s.name, terms: !!w.terms, confirm })}`;
    } else if (tab === 'general') {
      body = generalTab({ strategy: strat, rules: GR, camp: false, town: { name: s.name, ryo: Math.floor(s.stock?.ryo || 0), keep: game.frontier?.warGeneral?.keepOf?.(s) ?? GR.keepShare ?? 0.5 }, typing: counts.keep,
        treasury: { ryo: clan?.ryo ?? 0, keep: clan?.treasuryKeep ?? W().supply?.treasuryKeep ?? 1000, room: game.frontier?.shipments?.autoRoom?.(clan) ?? 0, typing: counts.tkeep }, share: W().supply?.autoShare });
    } else if (tab === 'hall') {
      const H = W().hallUpgrade || {}, chk = warUpgradeCheck(s, F, game.state), unlocks = Object.entries(B).filter(([t, d]) => (d?.needs || []).includes('upgrade') && (!d.clan || d.clan === faction)).map(([t]) => t);
      const up = s.warUpgrade;
      body = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
        <div><div style="font-size:16px;color:#f3e3bd">${s.warHall ? 'War upgrade done' : up ? 'War upgrade under way' : 'Town hall war upgrade'}</div>
          <div class="small">Paid from town stock, then the town builders build it, about ${chk.ticks} s with ${F.rates?.maxBuilders || 3} builders. Other building waits meanwhile. Any town tier.</div>
          ${s.warHall ? '' : up ? `<div class="prog" style="margin-top:8px"><i style="width:${Math.round(100 * (1 - up.left / Math.max(1, up.total)))}%"></i></div><div class="small" style="margin-top:4px">${s.builders ? `About ${warUpgradeSeconds(s, F)} s left` : 'Waiting for builders'}</div>`
            : `<div class="cost" style="justify-content:flex-start;margin-top:8px">${chips(H.cost, s.stock)}</div><div style="margin-top:10px"><button class="go" data-upgrade="1"${chk.ok ? '' : ` disabled title="${esc(chk.reason)}"`}>Upgrade</button></div>${chk.ok ? '' : `<div class="small" style="margin-top:4px">${esc(chk.reason)}</div>`}`}</div>
        <div><div class="sec" style="padding-top:0"><span>Unlocks</span></div><div class="unl">${['stable', ...unlocks.filter(t => t !== 'stable')].map(t => `<div class="thumb" title="${esc(t === 'stable' ? 'Cavalry at your town stable' : nice(t))}"><img src="${esc(artUrl(t))}" alt=""></div>`).join('')}</div>
          <div class="small" style="margin-top:4px">Cavalry at the town stable, ${esc(unlocks.filter(t => t !== 'stable').map(t => nice(t).toLowerCase()).join(', '))}</div></div></div>`;
    } else {
      tab = 'military';
      body = `<div class="grid">${types.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).map(t => {
        const d = F.buildings[t] || {}, wd = B[t] || {}, need = militaryNeeds(s, t, F), n = militaryCount(s, t);
        const tip = `${nice(t)}: ${Object.entries(d.cost || {}).map(([r, k]) => `${k} ${r}`).join(', ')} from town stock.${wd.cap ? ` Adds ${wd.cap} to the troop cap.` : ''}${(war()?.trainsAt(t, me) || []).length ? ` Trains in a war: ${war().trainsAt(t, me).map(u => stats(u).name.toLowerCase()).join(', ')}.` : ` ${(DOES[t] || (() => ''))(wd)}`}${need.length ? ` Needs ${need.join(' and ')}.` : ''}`;
        return `<div class="card${need.length ? ' lock' : ''}" data-build="${esc(t)}" title="${esc(tip)}">${wd.max ? `<span class="badge">${n}/${wd.max}</span>` : ''}
          <div class="pic"><img src="${esc(artUrl(t))}" alt=""></div><div class="t">${esc(nice(t))}</div>
          ${need.length ? `<div class="lockline">Needs ${esc(need.map(x => x.replace(/^a built |^the /, '').replace('town hall war upgrade', 'war upgrade').replace('a town hall at tier 2', 'tier 2 hall')).join(', '))}</div>` : `<div class="cost">${chips(d.cost, s.stock)}</div>`}</div>`;
      }).join('')}</div>
      <div class="foot"><span class="small">Page ${page + 1} of ${pages}. Paid from town stock. Upkeep like any placed building.</span><span><button data-page="-1"${page ? '' : ' disabled'}>Prev</button> <button data-page="1"${page < pages - 1 ? '' : ' disabled'}>Next</button></span></div>
      <div class="sec"><span>Being built</span><b>town builders</b></div>
      ${sites.length ? sites.slice(0, 2).map(p => `<div class="site"><div class="thumb"><img src="${esc(artUrl(p.type))}" alt=""></div><div><div style="font-weight:600">${esc(nice(p.type))}</div><div class="prog"><i style="width:${Math.round(100 * p.progress / Math.max(1, p.need))}%"></i></div></div>
        <div class="small">${p.paid ? 'building' : 'waiting'}</div><button data-cancel="${esc(p.id)}" title="${esc(p.progress ? 'Cancel: work has started, nothing comes back' : 'Cancel: everything paid comes back')}">Cancel</button></div>`).join('') + (sites.length > 2 ? `<div class="small" style="margin-top:4px">and ${sites.length - 2} more</div>` : '')
        : '<div class="small" style="padding:8px 0">Nothing being built. Pick a building above, then click a spot in town.</div>'}`;
    }
    const tabs = [['military', 'Military'], ...(defending ? [['chest', 'War chest']] : []), ['hall', 'Hall'], ['general', 'General']];
    const art = bld ? `<div class="art"><img class="hall" src="${esc(artUrl(bld.type))}" alt=""></div>` : `<div class="art"><img class="hall" src="${esc(artUrl('town_hall'))}" alt="">${w ? `<img class="flag" src="${esc(artUrl('war_banner'))}" alt="">` : ''}</div>`;
    const st = stOf(bld || hall);
    root.innerHTML = `<div class="win" role="dialog" aria-label="Town war"><header><div><div class="eyebrow">${esc(/ clan$/i.test(clan?.name || '') ? clan.name : `${clan?.name || 'Your'} clan`)}, ${bld ? esc(s.name) : 'town hall'}</div><h2>${esc(bld ? title : w ? title : `${s.name} military`)}</h2></div><button data-close="1">Esc</button></header>
      <div class="lay"><aside>${art}<span class="tier">${bld ? esc(nice(bld.type)) : `Town hall, tier ${s.tier || 1}`}</span>${st ? `<div class="small">Health ${Math.ceil(ST.hpOf(st))} of ${st.max}</div>` : ''}
        <div class="coins">${coins(!bld)}</div>
        ${bld ? `<div class="small" style="margin-top:10px">Right-click the town hall to build and fill the war chest. Each military building has its own menu.</div>`
          : s.warHall ? '<div class="upg"><b>War upgrade done</b><div class="small" style="margin-top:3px">Stables train cavalry. Foundry and armory open.</div></div>' : s.warUpgrade ? `<div class="upg"><b>War upgrade</b><div class="small" style="margin-top:3px">${s.builders ? `About ${warUpgradeSeconds(s, F)} s left` : 'Waiting for builders'}</div></div>` : ''}</aside>
      <main>${bld ? '' : `<div class="tabs">${tabs.map(([t, n]) => `<button class="tab${tab === t ? ' on' : ''}" data-tab="${t}">${n}</button>`).join('')}</div>`}${body}<div class="why">${esc(why)}</div></main></div></div>`;
    if (typing?.n) { const el = [...root.querySelectorAll('input')].find(x => x.dataset.n === typing.n); if (el) { el.focus(); try { el.setSelectionRange(typing.a, typing.b); } catch {} } }
  }
  root.addEventListener('input', e => { const k = e.target?.dataset?.n; if (k) counts[k] = e.target.value; });
  // the General tab's keep box: sent when the box is left or Enter is pressed
  root.addEventListener('change', e => { if (!e.target?.dataset?.tkeep || !open) return; const n = Math.floor(Number(e.target.value)); delete counts.tkeep; sig = ''; if (!Number.isSafeInteger(n) || n < 0) why = 'Type 0 or more'; else { why = ''; send({ id: heroId, type: 'frontier', action: 'ship', mode: 'treasuryKeep', ryo: n }); } fill(); });   // 8e-2
  root.addEventListener('change', e => { if (!e.target?.dataset?.keep || !open) return; const k = keepShare(e.target.value); delete counts.keep; sig = ''; if (k === null) why = 'Type a number from 0 to 100'; else { why = ''; send({ id: heroId, type: 'frontier', action: 'warKeep', town: open, share: k }); } fill(); });
  root.addEventListener('keydown', e => { if (e.target.closest?.('input')) { e.stopPropagation(); if (e.code === 'Enter' || e.code === 'NumpadEnter') e.target.blur(); } });
  for (const ev of ['keyup', 'pointerdown', 'mousedown', 'wheel']) root.addEventListener(ev, e => e.stopPropagation());
  const count = (key, d = 1) => { const n = Math.floor(Number(counts[key] ?? d)); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
  root.addEventListener('click', e => {
    const b = e.target.closest?.('[data-close],[data-tab],[data-page],[data-tpage],[data-build],[data-cancel],[data-train],[data-untrain],[data-upgrade],[data-put],[data-surrender],[data-terms],[data-strategy],[data-rsend],[data-rcancel],[data-armup]'); if (!b || !open) return;
    const d = b.dataset, s = town(open), w = warOn(open); why = ''; sig = '';
    if ((d.rsend || d.rcancel) && w) { why = chestSendClick(d, { war: w, heroId, counts, send }) || ''; fill(); return; }   // 8e-3
    if (d.armup && w) { const [group, track] = d.armup.split(':'); send({ id: heroId, type: 'frontier', action: 'armoryUp', war: w.id, group, track }); fill(); return; }   // 8e-9
    if (d.close) return close();
    if (d.terms) { if (w) { close(); openTerms(w.id); } return; }
    if (d.surrender) { confirm = d.surrender === 'ask'; if (d.surrender === 'yes' && w) { send({ id: heroId, type: 'frontier', action: 'warSurrender', war: w.id }); close(); return; } }
    else if (d.tab) { tab = d.tab; confirm = false; }
    else if (d.page) page = Math.max(0, page + Number(d.page));
    else if (d.tpage) tpage = Math.max(0, tpage + Number(d.tpage));
    else if (d.build) { const need = militaryNeeds(s, d.build, F); if (need.length) why = `Needs ${need.join(' and ')}`; else { const t = open; close(); if (!placeTool(t, d.build)) why = 'Open the build bar from the town panel'; return; } }
    else if (d.cancel) send({ id: heroId, type: 'frontier', action: 'cancel', project: d.cancel });
    else if (d.upgrade) send({ id: heroId, type: 'frontier', action: 'warUpgradeHall', settlement: open });
    else if (d.put) { const n = count('put', 500); if (n && w) send({ id: heroId, type: 'frontier', action: 'warChestTown', war: w.id, amount: n }); else why = 'Type how much'; }
    else if (d.train) { const n = count(`t:${d.train}:${d.unit}`); if (n && w) send({ id: heroId, type: 'frontier', action: 'townTrain', war: w.id, building: d.train, unit: d.unit, count: n }); else why = 'Type how many'; }
    else if (d.strategy) send({ id: heroId, type: 'frontier', action: 'warStrategy', strategy: d.strategy });
    else if (d.untrain && w) send({ id: heroId, type: 'frontier', action: 'townUntrain', war: w.id, building: d.untrain });
    fill();
  });
  addEventListener('keydown', e => { if (!root.hidden && e.code === 'Escape') { close(); e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true });
  let seen = 0;
  const ACTS = /^(warChestTown|townTrain|townUntrain|warUpgradeHall|cancel|warSurrender|warStrategy|warKeep|ship|armoryUp|treasuryKeep)$/;
  function update() {
    for (const r of game.state.frontier?.receipts || []) if (r.seq > seen) { seen = r.seq; if (!r.ok && open && r.clan === hero()?.owner && ACTS.test(r.action)) { why = r.reason; sig = ''; } }   // refusals first, so this frame shows them
    if (!root.hidden) { if (!mine(town(open)) || blocked()) close(); else fill(); }
  }
  // the war on a town of yours that your hero stands in (the red war coin opens this window)
  function defendingHere() {
    const h = hero(), R = W().circleRadius ?? 900; if (!h || h.place !== 'world') return null;
    for (const w of Object.values(game.state.frontier?.wars?.list || {})) { const t = town(w.town); if (w.defender === h.owner && t && Math.hypot(h.x - t.x, h.z - t.z) <= R) return w; }
    return null;
  }
  return { show, close, update, isOpen: () => !root.hidden, hasMenu: (townId, buildingId) => { const s = town(townId); return mine(s) && hasMenu(s, s.buildings?.find(b => b.id === buildingId)); }, defendingHere };
}
