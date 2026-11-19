// War camp panel (frontier plan F6, checkpoint 4): presentation only, the sim checks every command again.
// 7c-3 (Tim 2026-11-12): one menu per building. A left-click on the camp hall (or the red war coin) opens the hall:
// tabs Build (camp building cards with their art, under-construction list), War chest, Hall (hall upgrade), and the
// worker hire box. A left-click on any other camp building opens only its own menu: a training building shows a card
// per unit it trains (sprite still, health, damage a second, range, speed, cost, time; abilities in the hover) and
// its queue; a site shows its progress; the rest say what they do. Picking a building card places it: its art follows the mouse with a green or red ring and the
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
#warcamp .vrow{display:flex;align-items:center;gap:10px;padding:7px 2px;border-bottom:1px solid #2a2d31}#warcamp .vrow .vn{flex:1;min-width:0}#warcamp .vrow .vn b{font-weight:600}#warcamp .vrow .vn .small{display:block}
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
#warcamp .ugrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
#warcamp .ucard{min-width:0;border:1px solid #3d352a;border-radius:7px;background:radial-gradient(ellipse at 50% 30%,#2a2620,#121314 80%);padding:7px;cursor:help}
#warcamp .ucard:hover{border-color:#ffe0a1}#warcamp .ucard .uhead{display:grid;grid-template-columns:62px 1fr;gap:7px}
#warcamp .ustill{height:84px;border:1px solid #826f4c;border-radius:6px;background:#2a2620 center 20%/cover no-repeat}#warcamp .ustill.concept{background-size:140%;background-position:center 18%}
#warcamp .un{font-weight:700;color:#f3e3bd;font-size:13px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#warcamp .sr{display:flex;justify-content:space-between;font-size:11px;color:#9aa3a6;line-height:1.45}#warcamp .sr b{color:#eadfc6}
#warcamp .ab{min-height:14px;margin-top:3px;color:#d8b56c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#warcamp .chestbox{display:grid;grid-template-columns:150px 1fr;gap:16px;margin-top:14px;align-items:start}
#warcamp .chestcoin{border-radius:50%;width:140px;height:140px;display:grid;place-content:center;text-align:center;background:radial-gradient(#5a2a20,#1a0c0a 72%);box-shadow:0 0 0 3px #c9473d,0 0 0 5px #2a0f0d,0 0 24px #c9473d77;cursor:help}
#warcamp .chestcoin b{font-size:28px;color:#ffe9b0}#warcamp .chestcoin span{font-size:10px;letter-spacing:.12em;color:#ee9a8c;text-transform:uppercase;padding:0 18px}
#warcamphint{position:fixed;pointer-events:none;z-index:22;padding:8px 11px;background:rgba(12,18,24,.94);max-width:300px;border:1px solid;border-radius:8px;font:12px/1.4 system-ui}
#warcamphint[hidden]{display:none}
`;
export const WAR_PANEL_CSS = CSS;   // 8b-3: the town war window (town_war_panel.js) uses the same look under #townwar
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nice = t => (t || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const PER_PAGE = 8, UPP = 3;
import { msConcept } from './menu_shell.js';
import { surrenderFoot, SURRENDER_CSS } from './war_surrender_foot.js';
import { generalTab, GENERAL_CSS, STRATEGY_NAMES } from './war_general_tab.js';
import { portrait } from './portraits.js';
import { SPECIALS } from './sim/special_cast.js';
import { ABOUT } from './ability_rows.js';
import { specialHover } from './special_stats.js';
import { listVehicles } from './vehicles_panel.js';
import { sharedKeybinds } from './keybinds.js';
import { drawBuildArea } from './camp_build_area.js';
import { chestSendHtml, chestSendSig, chestSendClick, CHEST_SEND_CSS } from './war_chest_send.js';   // 8e-3
import { armoryHtml, armorySig, ARMORY_CSS } from './war_armory_menu.js';   // 8e-9   // 7c-4: one merged build outline, darkened outside
// what a unit without a cast ability does well (train card hover); the cast abilities come from ability_rows.js
export const TRAITS = {
  kunoichi: 'Hidden on the island until she attacks or is hit; her first hit is an ambush. Vanish on a move order while seen. Dog handlers, Teppo riflemen and watchtowers can spot her.',
  fire_bomber: 'Knife and fire bomb. Fights with a weak knife. His fire bomb is a special with a long cooldown and a short throw.',
  spearman: 'Spear grunt. Longer reach and more damage than the sword grunt, a little less health. Can torch buildings.', swordsman: 'Sword grunt. Can torch buildings.', ninja: 'Sword grunt, fast and light. Can torch buildings.', shinobi_spearman: 'Spear grunt. Longer reach and more damage than the ninja, a little less health. Can torch buildings.',
  field_cannon: 'Siege gun: heavy damage to buildings, long range, slow to reload. Hard to push.',
  wooden_cannon: 'Siege gun: heavy damage to buildings, long range, slow to reload. Hard to push.',
  gatling_crew: 'Sets up before it fires a cone of bullets, packs up to move. Cannot fire up close or fight hand to hand.',
  war_enforcer: 'Heavy infantry: lots of health, holds the line.', brute: 'Tough brawler.',
  sword_rider: 'Cavalry: fast, hits hard on the charge.', mounted_pikeman: 'Cavalry with a long reach.',
};
// what a building does (its own menu, when it trains nothing)
export const DOES = {
  supply_tents: d => `Adds ${d.cap ?? 0} to the troop cap.`, watchtower: () => 'Shoots arrows at enemies in range and lets you see the ground round it, day and night.',
  field_clinic: () => 'Your troops, hero and crew near it recover much faster once they are out of the fight.', armory: () => 'Troop upgrades for this war: more damage and less damage taken by unit group. Troops only.',
  camp_station: () => 'Links the camp to your rail network: a spur is laid to your nearest town with a railway station. Then ryo, timber and stone come by train.',
  rail_section: () => 'Camp supply line: the camp station or any red section down cuts the camp off from the rail network until all are rebuilt (from the camp station menu).',
  stockade: () => 'A fortress, very hard to break. Your troops go in with Ctrl + right-click on it: they recover faster, hits on them go to the building, and ranged troops shoot out.',
  palisade: () => 'A wall: blocks the way.', gate: () => 'A gate in the palisade: your troops pass, enemies must break it.',
  lumber_camp: () => 'Camp workers drop timber here.', quarry: () => 'Camp workers drop stone here.',
};

export function createWarCampPanel({ game, heroId, view, catalog, frontierData, units = null, send, blocked = () => false, onStart = () => {}, buildUI = () => null, openTerms = () => false }) {
  // 7c-4: the Workers tab shows the town worker pane for the camp (frontier_build_ui.js campWorkersHtml); its styles are
  // written for #townpanel in menu_shell.css, so they are copied once for #warcamp .campworkers
  let workerCss = false;
  function ensureWorkerCss() {
    if (workerCss) return; workerCss = true;
    const out = [];
    for (const sheet of document.styleSheets) { let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules || []) if (r.selectorText?.includes('#townpanel') && /\.(w[a-z]+|workerroster|hint|harvestline)\b/.test(r.selectorText)) out.push(r.cssText.replaceAll('#townpanel', '#warcamp .campworkers')); }
    const st = document.createElement('style'); st.textContent = out.join('\n') + '\n#warcamp .campworkers{margin-top:8px}'; document.head.appendChild(st);
  }
  const style = document.createElement('style'); style.textContent = CSS + SURRENDER_CSS('#warcamp') + GENERAL_CSS('#warcamp') + CHEST_SEND_CSS('#warcamp') + ARMORY_CSS('#warcamp'); document.head.append(style);
  const war = () => game.frontier?.war;
  const W = () => war()?.data || frontierData?.war || {};
  // Tim 2026-11-13: camp workers in training show in the hall menu like the town's (a bar, the seconds left, how many more)
  const workerLeft = c => { const q = c?.workerTraining || []; return q.length ? Math.max(0, Math.ceil((q[0].readyAt - (game.state.tick ?? 0)) / 20)) : -1; };
  function workerQueueHtml(c) {
    const q = c?.workerTraining || []; if (!q.length) return '';
    const now = game.state.tick ?? 0, total = frontierData?.workers?.trainTicks ?? 100, left = Math.max(0, q[0].readyAt - now), all = Math.max(0, q.at(-1).readyAt - now);
    return `<div class="small" style="margin-top:7px;color:#e9d6a8">Training worker, ${Math.ceil(left / 20)} s</div><div class="prog" style="margin-top:3px"><i style="width:${Math.round(100 * (1 - Math.min(1, left / Math.max(1, total))))}%"></i></div>${q.length > 1 ? `<div class="small" style="margin-top:3px">${q.length - 1} more queued, all done in ${Math.ceil(all / 20)} s</div>` : ''}`;
  }
  const hero = () => game.state.entities[heroId];
  const rec = id => game.state.frontier?.wars?.list?.[id] || null;
  const artName = type => frontierData?.townArt?.[type] || type;
  const artUrl = type => { const n = artName(type), kind = catalog?.items?.[n]?.kind || 'buildings'; return `art/${kind}/${n}.png`; };
  const images = new Map();
  const lineArtUrl = (type, z) => { const n = frontierData?.townArt?._campLine?.[type]?.[z ? 'z' : 'x']; return n ? `art/${catalog?.items?.[n]?.kind || 'buildings'}/${n}.png` : artUrl(type); };
  const imageAt = u => { if (!images.has(u)) { const i = new Image(); i.src = u; images.set(u, i); } return images.get(u); };
  const imageOf = type => { const u = artUrl(type); if (!images.has(u)) { const i = new Image(); i.src = u; images.set(u, i); } return images.get(u); };
  const chips = (cost, camp) => Object.entries(cost || {}).filter(([, v]) => v).map(([r, v]) => {
    const has = r === 'ryo' ? camp?.chest ?? Infinity : camp?.stock?.[r] ?? Infinity;
    return `<span class="chip ${r}${has < v ? ' short' : ''}" title="${esc(`${v} ${r}`)}"><i></i>${v}</span>`;
  }).join('');

  const root = document.createElement('div'); root.id = 'warcamp'; root.hidden = true; document.body.append(root);
  let open = null, bid = null, tab = 'build', page = 0, tpage = 0, sig = '', why = '', confirm = false, stOrder = false, stSell = false;
  let stab = 'train', ypage = 0;   // a camp stable's own tabs: Train (cavalry) and Yours (your horses and vehicles, Tim 2026-11-14)
  const counts = {};   // typed train / hire counts by box, kept across refreshes
  function show(id, buildingId = null) { if (!rec(id) || rec(id).attacker !== hero()?.owner) return false; const b = buildingId && rec(id).camp.buildings.find(x => x.id === buildingId); bid = b && b.type !== 'camp_hall' ? b.id : null; open = id; tab = 'build'; stab = 'train'; page = tpage = ypage = 0; why = ''; sig = ''; root.hidden = false; onStart(); fill(); return true; }
  function close() { open = null; bid = null; root.hidden = true; }

  function fill() {
    const w = rec(open); if (!w) { close(); return; }
    const c = w.camp, v = war()?.troopView(open) || { troops: 0, queued: 0, cap: 0 }, B = W().buildings || {}, U = W().units || {};
    const hall = c.buildings.find(b => b.type === 'camp_hall'), tier = hall?.tier || 1, town = game.state.frontier.settlements?.[w.town];
    const clan = game.state.clans?.[w.attacker], C = W().camp || {};
    const list = war()?.campBuildList(open) || [], pages = Math.max(1, Math.ceil(list.length / PER_PAGE)); page = Math.min(page, pages - 1);
    const sites = c.buildings.filter(b => b.stage === 'site' || b.upgrade);
    const mine = game.state.entities[heroId]?.owner;   // checkpoint 7: only this clan's specials show
    const me = hero()?.owner, ryoOf = u => war()?.ryoOf?.(me, u) ?? U[u]?.ryo ?? 0, ticksOf = u => war()?.ticksOf?.(me, u) ?? U[u]?.trainTicks ?? 0;
    const builders = id => (c.workers || []).filter(k => k.project === id).length, maxB = W().builders ?? 3;
    const bld = bid ? c.buildings.find(x => x.id === bid) || null : null; if (bid && !bld) bid = null;
    const faction = clan?.faction, ST = game.frontier?.structures, stOf = x => ST?.find?.(`c|${open}|${x.id}`) || null;
    const yoursOn = bld?.type === 'stable' && bld.stage === 'built', mineV = yoursOn ? listVehicles(game, heroId) : [];
    const workersH = !bld && tab === 'workers' ? (ensureWorkerCss(), buildUI()?.campWorkersHtml?.(open) || '<div class="small" style="padding:8px 0">The worker list is not ready yet.</div>') : '';
    const strat = game.frontier?.warGeneral?.strategyOf?.(w.attacker) || 'siege';
    const next = JSON.stringify([open, bid, tab, page, tpage, why, confirm, !!w.terms, strat, Math.floor(clan?.ryo ?? 0), clan?.treasuryKeep, Math.floor(c.chest), Math.floor(c.stock.timber), Math.floor(c.stock.stone), v, (c.workers || []).length, (c.workerTraining || []).length, workerLeft(c),
      c.buildings.map(b => [b.id, b.stage, Math.floor(100 * (b.upgrade || b).progress / Math.max(1, (b.upgrade || b).need) || 0), b.queue?.length || 0, b.tier || 1, builders(b.id)]), list.map(x => x.ok), placing?.kind,
      bld?.queue?.[0] ? Math.ceil(bld.queue[0].left / 20) : 0, bld ? Math.ceil(ST?.find?.(`c|${open}|${bld.id}`) ? ST.hpOf(ST.find(`c|${open}|${bld.id}`)) : 0) : 0, workersH, stab, ypage, mineV.map(v => [v.e.id, v.status, v.where]), chestSendSig(game, w, w.attacker), armorySig(game, w, w.attacker), stOrder, stSell, JSON.stringify(c.station || null), (() => { const l = game.state.frontier?.rail?.links?.[c.station?.link]; return l ? [Math.floor(100 * l.built / Math.max(1, l.length)), l.waiting, l.done, l.closed] : null; })(),
      Object.values(game.state.frontier?.shipping?.orders || {}).filter(o => o.camp && o.war === w.id && o.state === 'open').map(o => [o.id, o.got])]);   // the queue countdown ticks every second (Tim 2026-11-12: it stalled for seconds)
    if (next === sig) return;
    sig = next;
    // a count box being typed in keeps its focus and text across the redraw (it used to block the redraw instead)
    const typing = root.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' ? { n: document.activeElement.dataset.n, a: document.activeElement.selectionStart, b: document.activeElement.selectionEnd } : null;
    const stats = key => {
      const e = U[key] || {}, t = typeof e.type === 'string' ? e.type : e.type?.[faction] || Object.values(e.type || {})[0], u = units?.types?.[t] || {};
      const model = (typeof e.model === 'string' ? e.model : e.model?.[faction] || Object.values(e.model || {})[0]) || u.sprite || t;
      const dps = u.gatling ? u.gatling.damage * 20 / Math.max(1, u.gatling.everyTicks) : (u.damage || 0) / Math.max(0.1, u.attackSpeed || 1);
      const range = u.rifle?.range ?? u.gatling?.range ?? u.attackRange ?? 1;
      const abil = Object.entries(SPECIALS).filter(([, S]) => S.has(u, { type: t })).map(([id, S]) => specialHover(id, S.name, ABOUT[id], u));   // with its numbers (Tim 2026-11-18)
      if (TRAITS[t]) abil.push(TRAITS[t]);
      return { t, u, model, name: u.name || nice(key), hp: u.hp ?? 0, dps, range, speed: u.run ?? 0, abil };
    };
    const face = model => msConcept(model) || (catalog && typeof document !== 'undefined' ? portrait(catalog, model, () => { sig = ''; }) : null) || '';
    function buildingBody(b) {
      const d = B[b.type] || {}, idx = c.buildings.filter(x => x.type === b.type).indexOf(b) + 1;
      if (b.stage === 'site' || b.upgrade) {
        const j = b.upgrade || b, n = builders(b.id);
        return `<div class="sec"><span>Under construction</span><b>${n} of ${maxB} builders</b></div><div class="prog" style="margin-top:10px"><i style="width:${Math.round(100 * (j.progress || 0) / Math.max(1, j.need))}%"></i></div>
          <div class="small" style="margin-top:8px">${Math.round(100 * (j.progress || 0) / Math.max(1, j.need))}% built. Camp workers build it.</div>
          ${b.upgrade ? '' : `<div style="margin-top:10px"><button data-cancel="${esc(b.id)}" title="${esc(j.progress ? 'Cancel: work has started, nothing comes back' : 'Cancel: everything paid comes back')}">Cancel</button></div>`}`;
      }
      if (b.stage === 'ruined' && b.type !== 'camp_station') return `<div class="sec"><span>Ruin</span></div><div class="small" style="margin-top:8px">It takes no building slot. Erase it (Eraser on the camp hall menu) to build on this spot again.</div>`;   // Tim 2026-11-17
      if (b.type === 'camp_station') return stationBody();
      if (b.type === 'armory') return armoryHtml({ game, war: w, owner: w.attacker, artUrl, chip: (r, n) => chips({ [r]: n }, c) });
      const list = war()?.trainsAt(b.type, mine) || [];
      if (!list.length) return `<div class="sec"><span>${esc(nice(b.type))} ${idx}</span></div><div style="margin-top:10px;font-size:14px">${esc((DOES[b.type] || (() => 'A camp building.'))(d))}</div>`;
      const tps = Math.max(1, Math.ceil(list.length / UPP)); tpage = Math.min(tpage, tps - 1);
      const q = b.queue || [], first = q[0], cap = v.cap;
      const cards = list.slice(tpage * UPP, tpage * UPP + UPP).map(u => {
        const S = stats(u), price = ryoOf(u), pic = face(S.model);
        const tip = `${S.name}. Health ${S.hp}, damage a second ${S.dps.toFixed(1)}, range ${S.range}, speed ${S.speed}. ${price} ryo from the war chest, ${Math.round(ticksOf(u) / 20)} s to train.${S.abil.length ? ' ' + S.abil.join(' ') : ''}`;
        return `<div class="ucard" title="${esc(tip)}"><div class="uhead"><div class="ustill${pic.includes('/stills/') ? ' concept' : ''}"${pic ? ` style="background-image:url('${esc(pic)}')"` : ''}></div><div class="ustats"><div class="un">${esc(S.name)}</div>
          <div class="sr"><span>Health</span><b>${S.hp}</b></div><div class="sr"><span>Damage a sec</span><b>${S.dps.toFixed(S.dps < 10 ? 1 : 0)}</b></div><div class="sr"><span>Range</span><b>${S.range}</b></div><div class="sr"><span>Speed</span><b>${S.speed}</b></div></div></div>
          <div class="cost" style="justify-content:flex-start;margin-top:6px"><span class="chip ryo${(c.chest || 0) < price ? ' short' : ''}"><i></i>${price}</span><span class="small">${Math.round(ticksOf(u) / 20)} s each</span></div>
          <div class="small ab">${S.abil.length ? S.abil.map(x => `<span title="${esc(x)}">${esc(x.split(':')[0].split('.')[0])}</span>`).join(', ') : '&nbsp;'}</div>
          <div style="display:flex;gap:6px;margin-top:6px">${num(`t:${b.id}:${u}`)}<button class="go" data-train="${esc(b.id)}" data-unit="${esc(u)}">Train</button></div></div>`;
      }).join('');
      const sameRun = q.slice(1).reduce((out, x) => { const l = out.at(-1); if (l?.unit === x.unit) l.n++; else out.push({ unit: x.unit, n: 1 }); return out; }, []);
      return `<div class="sec"><span>Train</span><b>One at a time per building</b></div><div class="ugrid">${cards}</div>
        ${tps > 1 ? `<div class="foot"><span class="small">Page ${tpage + 1} of ${tps}</span><span><button data-tpage="-1"${tpage ? '' : ' disabled'}>Prev</button> <button data-tpage="1"${tpage < tps - 1 ? '' : ' disabled'}>Next</button></span></div>` : ''}
        <div class="sec"><span>Queue</span><b>Troop cap: ${v.troops} out, ${v.queued} training, ${Math.max(0, cap - v.troops - v.queued)} free of ${cap}</b></div>
        <div class="pips">${q.slice(0, 10).map((x, i) => `<i class="${i ? 'q' : ''}" style="${i ? '' : `background:conic-gradient(#e0b85a 0 ${Math.round(100 * (1 - x.left / Math.max(1, ticksOf(x.unit) || 1)))}%,#14130f 0)`}"></i>`).join('')}
          <span class="small" style="margin-left:6px">${first ? `${esc(stats(first.unit).name)}, next in ${Math.ceil(first.left / 20)} s${sameRun.length ? `. Then ${esc(sameRun.map(r => `${r.n} ${stats(r.unit).name.toLowerCase()}`).join(', '))}` : ''}` : 'Idle'}</span>
          ${q.length ? `<button style="margin-left:auto;padding:2px 8px" data-untrain="${esc(b.id)}">Cancel last</button>` : ''}</div>`;
    }
    const num = (key, d = 1) => `<input class="num" type="text" inputmode="numeric" data-n="${esc(key)}" value="${esc(counts[key] ?? d)}">`;
    // 8e-4 (mock F): the camp station's menu: the spur being laid or linked, and timber and stone ordered in by train
    const SHIP = () => game.frontier?.data?.railways?.ship || {};
    function stationBody() {
      const S0 = c.station || {}, RL = game.state.frontier?.rail?.links || {}, l = RL[S0.link], RW = game.frontier?.data?.railways?.link || {};
      const toName = id => game.state.frontier?.settlements?.[id]?.name || id, per = RW.campCostPer100 || {};
      let h = `<div class="sec"><span>${l ? `Spur to ${esc(toName(l.to))} station` : 'Camp spur'}</span><b>${l ? `${Math.round(l.length).toLocaleString('en-US')} long` : ''}</b></div>`;
      if (!l) h += `<div class="small" style="margin-top:8px${S0.why ? ';color:#ee8a7c' : ''}">${esc(S0.why || 'The rail gang sets out as soon as the camp station stands.')}</div>`;
      else if (!l.done) {
        const p = Math.round(100 * l.built / Math.max(1, l.length));
        h += `<div class="small" style="margin-top:8px">Being laid, ${p}%. Paid from the camp stores as it goes.</div><div class="prog" style="margin-top:6px"><i style="width:${p}%"></i></div>
          <div class="cost" style="justify-content:flex-start;margin-top:6px">${chips(per, c)}<span class="small" title="Timber and stone from the camp stores for every 100 of track">per 100 of track</span>${l.waiting ? `<span class="small" style="color:#ee8a7c">Waiting for ${esc(l.waiting)}</span>` : ''}</div>`;
      } else h += `<div class="small" style="margin-top:8px;color:${l.closed ? '#ee8a7c' : '#9ad48f'}">${l.closed ? 'Cut off from the rail network: rebuild the station and every rail section to run trains again.' : `Linked by rail to ${esc(toName(l.to))}.`}</div>`;
      // Tim 2026-11-17: the pieces of the supply line that are down, each rebuilt here (camp workers build it like a site)
      const pieces = c.buildings.filter(b => (b.type === 'camp_station' && (b.stage === 'ruined' || b.rebuild)) || (b.type === 'rail_section' && b.stage !== 'built'));
      if (l?.done && pieces.length) {
        h += `<div class="sec"><span>Supply line down</span><b>${pieces.length} to rebuild</b></div>`;
        for (const b of pieces) {
          const name = b.type === 'rail_section' ? `Rail section ${b.n || 1} of ${b.of || 1}` : 'Camp station';
          if (b.stage === 'site') { const pc = Math.round(100 * (b.progress || 0) / Math.max(1, b.need)); h += `<div class="rrow"><div><div class="rn">${name}</div><div class="rk">Rebuilding, ${pc}%. ${builders(b.id)} of ${maxB} builders.</div></div><span></span><button data-cancel="${esc(b.id)}" title="${esc(b.progress ? 'Cancel: work has started, nothing comes back' : 'Cancel: everything paid comes back')}">Cancel</button></div>`; continue; }
          const r = war()?.campRebuildCheck?.(w.id, b.id) || { ok: false, reason: '' };
          h += `<div class="rrow"><div><div class="rn">${name}</div><div class="rk">${chips(r.cost || {}, c)}</div></div><span></span><button class="go" data-rebuild="${esc(b.id)}"${r.ok ? ' title="Rebuild it where it stood. Send camp workers to build it."' : ` disabled title="${esc(r.reason)}"`}>Rebuild</button></div>`;
        }
      }
      h += `<div class="sec"><span>When linked</span></div><div class="small" style="margin-top:6px">Ryo comes in through the War chest tab. Timber and stone come through orders like any town. Trains from the capital pass through ${esc(l ? toName(l.to) : 'your town')}.</div>`;
      const linked = !!(l?.done && !l.closed && S0.linked);
      h += `<div style="margin-top:10px"><button class="go" data-campord="open"${linked ? '' : ' disabled title="Needs the spur linked"'}>Order timber and stone</button></div>`;
      if (stOrder && linked) {
        for (const r of ['timber', 'stone']) h += `<div class="rrow"><div><div class="rn">${r[0].toUpperCase() + r.slice(1)}</div><div class="rk">Camp stores ${Math.floor(c.stock?.[r] || 0)}. From your towns' spare stock.</div></div>${num(`co:${r}`, 200)}<button class="go" data-campord="${r}">Order</button></div>`;
        // Tim 2026-11-17: what your towns cannot spare may be bought at the capital, paid from the war chest
        h += `<div class="rrow" title="${esc(`Ryo from the war chest each new order may spend buying at the capital (timber ${SHIP().buyPrice?.timber ?? 4}, stone ${SHIP().buyPrice?.stone ?? 5} ryo each) when your towns cannot spare enough. 0 = your towns only.`)}"><div><div class="rn">Buy at the capital</div><div class="rk">Up to this much ryo from the war chest (${Math.floor(c.chest || 0)}).</div></div>${num('co:ryo', 0)}<span></span></div>`;
        const on = Object.values(game.state.frontier?.shipping?.orders || {}).filter(o => o.camp && o.war === w.id && o.state === 'open');
        if (on.length) h += `<div class="rsrc">On order: ${esc(on.map(o => `${o.resource} ${Math.floor(o.amount - o.got)}`).join(', '))}</div>`;
      }
      // Tim 2026-11-17: the camp sells spare stores at the capital by train; the ryo goes into its war chest
      h += `<div style="margin-top:10px"><button class="go" data-campsell="open"${linked ? '' : ' disabled title="Needs the spur linked"'}>Sell to the capital</button></div>`;
      if (stSell && linked) {
        const sellable = ['timber', 'stone', 'food', 'goods'].filter(r => r === 'timber' || r === 'stone' || (c.stock?.[r] || 0) > 0);
        for (const r of sellable) h += `<div class="rrow" title="${esc(`Leaves the camp stores on the next train and pays ${SHIP().sellPrice?.[r] ?? 2} ryo each into the war chest when it reaches the capital.`)}"><div><div class="rn">${r[0].toUpperCase() + r.slice(1)}</div><div class="rk">Camp stores ${Math.floor(c.stock?.[r] || 0)}. ${SHIP().sellPrice?.[r] ?? 2} ryo each.</div></div>${num(`cs:${r}`, 100)}<button class="go" data-campsell="${r}">Sell</button></div>`;
        const sale = Object.values(game.state.frontier?.shipping?.orders || {}).filter(o => o.kind === 'sell' && o.camp && o.war === w.id && o.state === 'open');
        if (sale.length) h += `<div class="rsrc">For sale: ${esc(sale.map(o => `${o.resource} ${Math.floor(o.amount - o.got)}`).join(', '))}</div>`;
      }
      return h;
    }
    const coin = (cls, n, label, tip) => `<div class="coin ${cls}" title="${esc(tip)}"><b>${n}</b><span>${label}</span></div>`;
    // a built camp stable (Tim 2026-11-14): Yours lists every horse and vehicle you own; Take out brings a stored one
    // out beside this stable (from any stable), Recall sends one to your nearest stable. It makes none and adds no room.
    function yoursBody() {
      const PER = 5, all = ['horse', 'rickshaw', 'omnibus'].flatMap(k => mineV.filter(v => v.kind === k)), ps = Math.max(1, Math.ceil(all.length / PER)); ypage = Math.max(0, Math.min(ypage, ps - 1));
      const out = all.some(v => !v.e.stored && !v.e.recall);
      const row = v => `<div class="vrow"><div class="vn"><b>${esc(v.name)}</b>${v.status ? ` <span class="small" style="display:inline">${esc(v.status)}</span>` : ''}<span class="small">${esc(v.where)}</span></div>`
        + (v.e.stored ? `<button data-takeout="${esc(v.e.id)}" title="Bring it out beside this camp stable">Take out</button>` : `<button data-recall="${esc(v.e.id)}"${v.e.recall ? ' disabled' : ''} title="Riders get off; back to your nearest stable and stored there">Recall</button>`) + '</div>';
      return `<div class="sec"><span>Your horses and vehicles</span><b>${all.length}</b></div>`
        + (all.length ? all.slice(ypage * PER, ypage * PER + PER).map(row).join('') : '<div class="small" style="padding:8px 0">None yet</div>')
        + `<div class="foot"><span class="small">${ps > 1 ? `Page ${ypage + 1} of ${ps}` : 'This stable stores and brings out what you own. It makes none and adds no room.'}</span><span><button data-recallall="1"${out ? '' : ' disabled'} title="Everyone gets off; every horse and vehicle goes back to your nearest stable">Recall all</button>`
        + (ps > 1 ? ` <button data-ypage="-1"${ypage ? '' : ' disabled'}>Prev</button> <button data-ypage="1"${ypage < ps - 1 ? '' : ' disabled'}>Next</button>` : '') + '</span></div>';
    }
    let body = '';
    if (bld) body = (yoursOn ? `<div class="tabs">${[['train', 'Train'], ['yours', `Yours (${mineV.length})`]].map(([t, n]) => `<button class="tab${stab === t ? ' on' : ''}" data-stab="${t}">${n}</button>`).join('')}</div>` : '')
      + (yoursOn && stab === 'yours' ? yoursBody() : buildingBody(bld));
    else if (tab === 'build') {
      body = `<div class="grid">${list.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).map(x => {
        const d = B[x.type] || {}, tip = `${nice(x.type)}: ${Object.entries(d.cost || {}).map(([r, n]) => `${n} ${r}`).join(', ')}.${d.cap ? ` Adds ${d.cap} to the troop cap.` : ''}${(war()?.trainsAt(x.type) || []).length ? ` Trains ${war().trainsAt(x.type).join(', ')}.` : ''}${x.need.length ? ` Needs ${x.need.join(' and ')}.` : ''}${x.reason && !x.need.length ? ` ${x.reason}.` : ''}`;
        return `<div class="card${x.need.length ? ' lock' : ''}${placing?.kind === x.type ? ' sel' : ''}" data-build="${esc(x.type)}" title="${esc(tip)}">${x.max ? `<span class="badge">${x.count}/${x.max}</span>` : ''}
          <div class="pic"><img src="${esc(artUrl(x.type))}" alt=""></div><div class="t">${esc(nice(x.type))}</div>
          ${x.need.length ? `<div class="lockline">Needs ${esc(x.need.map(n => n.replace(/^a built |^the /, '')).join(', '))}</div>` : `<div class="cost">${chips(x.cost, c)}</div>`}</div>`;
      }).join('')}</div>
      <div class="foot"><span class="small">Page ${page + 1} of ${pages}</span><span><button data-erase="1" title="Eraser: click a camp building, wall piece, gate or building site to take it down. Everything it cost comes back to the war chest; a ruin is cleared for nothing. The camp hall stays. Keeps erasing until you right-click or press Esc.">Eraser</button> <button data-page="-1"${page ? '' : ' disabled'}>Prev</button> <button data-page="1"${page < pages - 1 ? '' : ' disabled'}>Next</button></span></div>
      <div class="sec"><span>Under construction</span><b>select workers, right-click the site</b></div>
      ${sites.length ? sites.slice(0, 3).map(b => { const j = b.upgrade || b, n = builders(b.id);
        return `<div class="site"><div class="thumb"><img src="${esc(artUrl(b.type))}" alt=""></div><div><div style="font-weight:600">${esc(b.upgrade ? 'Camp hall upgrade' : nice(b.type))}</div><div class="prog"><i style="width:${Math.round(100 * (j.progress || 0) / Math.max(1, j.need))}%"></i></div></div>
          <div class="pipw" title="${n} builders. Builders are sent by hand: select camp workers and right-click the site. More workers build faster. A site with nobody on it flashes.">${n ? `${n} building` : 'no workers'}</div>
          ${b.upgrade ? '<span></span>' : `<button data-cancel="${esc(b.id)}" title="${esc(j.progress ? 'Cancel: work has started, nothing comes back' : 'Cancel: everything paid comes back')}">Cancel</button>`}</div>`; }).join('') + (sites.length > 3 ? `<div class="small" style="margin-top:4px">and ${sites.length - 3} more</div>` : '')
        : '<div class="small" style="padding:8px 0">Nothing being built. Pick a building above, then click the ground near your camp.</div>'}`;
    } else if (tab === 'workers') {
      body = workersH;
    } else if (tab === 'general') {
      body = generalTab({ strategy: strat, rules: game.frontier?.warGeneral?.rules?.() || W().general || {}, camp: true,
        treasury: { ryo: clan?.ryo ?? 0, keep: clan?.treasuryKeep ?? W().supply?.treasuryKeep ?? 1000, room: game.frontier?.shipments?.autoRoom?.(clan) ?? 0, typing: counts.tkeep }, share: W().supply?.autoShare });
    } else if (tab === 'chest') {
      const linked = !!(c.station?.linked);
      body = `<div class="chestbox"><div class="chestcoin" title="Ryo for troops and camp workers. Every troop trained at a camp building and every camp worker hired is paid from here; camp buildings are paid in timber and stone. Only this war can spend it; what is left comes home when the war ends."><b>${Math.floor(c.chest || 0)}</b><span>ryo in the war chest</span></div>
        <div><div class="rhead">Send ryo by train</div><div class="small" style="margin-top:4px">${c.station?.cut ? 'The supply line is cut: orders wait and carry on when it is mended.' : linked ? 'Arrives on the next train to the camp station. Robbers and a cut line can hold it up.' : 'Build a camp station: a spur is laid to your nearest town with a railway station, then ryo comes by train. Until then the chest has what your hero packed.'}</div></div></div>
        ${chestSendHtml({ game, war: w, owner: w.attacker, counts, data: game.frontier?.data || {} })}${surrenderFoot({ side: 'attacker', town: town?.name || 'the town', terms: !!w.terms, confirm })}`;
    } else {
      const H = W().hallUpgrade || {}, unlocks = Object.entries(B).filter(([, d]) => (d?.needs || []).some(n => n === 'upgrade' || n === 'tier2')).map(([t]) => t);
      body = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
        <div><div style="font-size:16px;color:#f3e3bd">${tier >= 2 ? 'Camp hall upgraded' : hall?.upgrade ? 'Upgrade under way' : 'Upgrade the camp hall'}</div>
          <div class="small">Workers build it like a site</div>
          ${tier >= 2 ? '' : hall?.upgrade ? `<div class="prog" style="margin-top:8px"><i style="width:${Math.round(100 * hall.upgrade.progress / Math.max(1, hall.upgrade.need))}%"></i></div>`
            : `<div class="cost" style="justify-content:flex-start;margin-top:8px">${chips(H.cost, c)}</div><div style="margin-top:10px"><button class="go" data-upgrade="1">Upgrade hall</button></div>`}</div>
        <div><div class="sec" style="padding-top:0"><span>Unlocks</span></div><div class="unl">${unlocks.map(t => `<div class="thumb" title="${esc(nice(t))}"><img src="${esc(artUrl(t))}" alt=""></div>`).join('')}</div>
          <div class="small" style="margin-top:4px">${esc(unlocks.map(nice).join(', '))}</div></div></div>`;
    }
    root.innerHTML = `<div class="win" role="dialog" aria-label="War camp"><header><div><div class="eyebrow">${esc(/ clan$/i.test(clan?.name || '') ? clan.name : `${clan?.name || 'Your'} clan`)}, war camp</div><h2>${bld ? esc(nice(bld.type)) : `Siege of ${esc(town?.name || 'the town')}`}</h2></div><button data-close="1">Esc</button></header>
      <div class="lay"><aside>${bld ? (() => { const st = stOf(bld), idx = c.buildings.filter(x => x.type === bld.type).indexOf(bld) + 1;
        return `<div class="art"><img class="hall" src="${esc(artUrl(bld.type))}" alt=""></div><span class="tier">${esc(nice(bld.type))} ${idx}</span>${st ? `<div class="small">Health ${Math.ceil(ST.hpOf(st))} of ${st.max}</div>` : bld.stage === 'site' ? '<div class="small">Under construction</div>' : ''}
        <div class="coins">${coin('red', Math.floor(c.chest || 0), 'War chest', 'Ryo for troops and workers. Only this war can spend it. Right-click the camp hall for more.')}${coin('', `${v.troops + v.queued}/${v.cap}`, 'Troops', 'Troops out and in training, of the troop cap. Your hero crew in the war circle count too.')}</div>
        <div class="small" style="margin-top:10px">Right-click the camp hall to build and upgrade. Each training building has its own menu.</div></aside>`; })() : `<div class="art"><img class="hall" src="${esc(artUrl('camp_hall'))}" alt=""><img class="flag" src="${esc(artUrl('war_banner'))}" alt=""></div>
        <span class="tier">Camp hall, tier ${tier}</span>${(() => { const st = stOf(hall || {}); return st ? `<div class="small">Health ${Math.ceil(ST.hpOf(st))} of ${st.max}</div>` : ''; })()}${hall?.upgrade ? `<div class="small">Upgrading ${Math.round(100 * hall.upgrade.progress / Math.max(1, hall.upgrade.need))}%</div>` : ''}
        <div class="coins">${coin('red', Math.floor(c.chest || 0), 'War chest', 'Ryo for troops and workers. Only this war can spend it.')}${coin('', `${v.troops + v.queued}/${v.cap}`, 'Troops', 'Troops out and in training, of the troop cap')}
          ${coin('', Math.floor(c.stock.timber || 0), 'Timber', 'Camp stores: pays for camp buildings. Camp workers gather more.')}${coin('', Math.floor(c.stock.stone || 0), 'Stone', 'Camp stores: pays for camp buildings. Camp workers gather more.')}${coin('', STRATEGY_NAMES[strat] || strat, 'General', 'How your general fights while your hero is away from a war. Change it on the General tab.')}</div>
        ${c.station?.cut ? '<div class="small" style="color:#ee8a7c;margin-top:6px">Cut off from the rail network: orders wait until it is mended</div>' : c.station?.linked ? `<div class="small" style="color:#9ad48f;margin-top:6px">Linked by rail to ${esc(game.state.frontier?.settlements?.[c.station.to]?.name || '')}</div>` : ''}
        <div class="upg" title="${esc(`Hire camp workers for ${C.workerCost ?? '?'} ryo each from the war chest, up to ${C.workerCap ?? '?'} in all. They gather timber and stone anywhere in the war circle outside the town ring and build your camp.`)}"><b>Workers ${(c.workers || []).length + (c.workerTraining || []).length} of ${C.workerCap ?? '?'}</b>
          <div style="display:flex;gap:6px;justify-content:center;margin-top:5px">${num('hire')}<button class="go" data-hire="1">Hire</button></div><div class="small" style="margin-top:3px">${C.workerCost ?? '?'} ryo each</div>${workerQueueHtml(c)}</div></aside>`}
      <main>${bld ? '' : `<div class="tabs">${[['build', 'Build'], ['workers', 'Workers'], ['chest', 'War chest'], ['hall', 'Hall'], ['general', 'General']].map(([t, n]) => `<button class="tab${tab === t ? ' on' : ''}" data-tab="${t}">${n}</button>`).join('')}</div>`}${body}<div class="why">${esc(why)}</div></main></div></div>`;
    if (typing?.n) { const el = [...root.querySelectorAll('input')].find(x => x.dataset.n === typing.n); if (el) { el.focus(); try { el.setSelectionRange(typing.a, typing.b); } catch {} } }
  }
  root.addEventListener('input', e => { const k = e.target?.dataset?.n; if (k) counts[k] = e.target.value; });
  root.addEventListener('keydown', e => { if (e.target.closest?.('input')) { e.stopPropagation(); if (e.code === 'Enter' || e.code === 'NumpadEnter') e.target.blur(); } });
  for (const ev of ['keyup', 'pointerdown', 'mousedown', 'wheel']) root.addEventListener(ev, e => e.stopPropagation());
  const count = key => { const n = Math.floor(Number(counts[key] ?? 1)); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
  // 7c-4: the Workers tab's buttons and group boxes belong to the worker pane (frontier_build_ui.js)
  root.addEventListener('click', e => { const a = e.target.closest?.('[data-act]'); if (!a || !open) return; const ui = buildUI(), s = ui?.campSite?.(open); if (s && ui.click(a.dataset, s, e)) { sig = ''; fill(); } });
  root.addEventListener('dblclick', e => { const a = e.target.closest?.('[data-act]'); if (!a || !open) return; const ui = buildUI(), s = ui?.campSite?.(open); if (s) ui.doubleClick?.(a.dataset, s); });
  root.addEventListener('change', e => { if (!e.target?.dataset?.tkeep || !open) return; const n = Math.floor(Number(e.target.value)); delete counts.tkeep; sig = ''; if (!Number.isSafeInteger(n) || n < 0) why = 'Type 0 or more'; else { why = ''; send({ id: heroId, type: 'frontier', action: 'ship', mode: 'treasuryKeep', ryo: n }); } fill(); });   // 8e-2
  root.addEventListener('change', e => { const a = e.target.closest?.('[data-act]'); if (!a || !open) return; const ui = buildUI(), s = ui?.campSite?.(open); if (s && ui.change?.(a.dataset, e.target.value, s)) { sig = ''; fill(); } });
  root.addEventListener('click', e => {
    const b = e.target.closest?.('[data-close],[data-tab],[data-stab],[data-ypage],[data-takeout],[data-recall],[data-recallall],[data-page],[data-tpage],[data-build],[data-erase],[data-cancel],[data-armcancel],[data-train],[data-untrain],[data-upgrade],[data-hire],[data-surrender],[data-terms],[data-strategy],[data-rsend],[data-rcancel],[data-armup],[data-campord],[data-campsell],[data-rebuild]'); if (!b || !open) return;
    const d = b.dataset; why = ''; sig = '';
    if (d.rsend || d.rcancel) { why = chestSendClick(d, { war: rec(open), heroId, counts, send }) || ''; fill(); return; }   // 8e-3
    if (d.armcancel != null && open) { send({ id: heroId, type: 'frontier', action: 'armoryCancel', war: open, index: Number(d.armcancel) }); fill(); return; }   // armory queue (Tim 2026-11-18)
    if (d.armup) { const [group, track] = d.armup.split(':'); send({ id: heroId, type: 'frontier', action: 'armoryUp', war: open, group, track }); fill(); return; }   // 8e-9
    if (d.campord) { if (d.campord === 'open') stOrder = !stOrder; else { const n = Math.floor(Number(counts[`co:${d.campord}`] ?? 200)) || 0, ryo = Math.max(0, Math.floor(Number(counts['co:ryo'] ?? 0)) || 0); const node = rec(open)?.camp?.station?.node; if (n && node) send({ id: heroId, type: 'frontier', action: 'ship', mode: 'order', town: node, resource: d.campord, amount: n, ...(ryo ? { ryo } : {}) }); else why = 'Type how much'; } fill(); return; }   // 8e-5
    if (d.campsell) { if (d.campsell === 'open') stSell = !stSell; else { const n = Math.floor(Number(counts[`cs:${d.campsell}`] ?? 100)) || 0; const node = rec(open)?.camp?.station?.node; if (n && node) send({ id: heroId, type: 'frontier', action: 'ship', mode: 'sell', town: node, resource: d.campsell, amount: n }); else why = 'Type how much'; } fill(); return; }   // Tim 2026-11-17
    if (d.close) return close();
    if (d.terms) { const id = open; close(); openTerms(id); return; }
    if (d.surrender) { confirm = d.surrender === 'ask'; if (d.surrender === 'yes') { send({ id: heroId, type: 'frontier', action: 'warSurrender', war: open }); close(); return; } }
    else if (d.tab) { tab = d.tab; confirm = false; }
    else if (d.stab) { stab = d.stab; ypage = 0; }
    else if (d.ypage) ypage = Math.max(0, ypage + Number(d.ypage));
    else if (d.takeout) send({ id: heroId, type: 'garage', action: 'takeout', unit: d.takeout, at: `war:${open}` });
    else if (d.recall) send({ id: heroId, type: 'garage', action: 'recall', unit: d.recall });
    else if (d.recallall) send({ id: heroId, type: 'garage', action: 'recallAll' });
    else if (d.page) page = Math.max(0, page + Number(d.page));
    else if (d.tpage) tpage = Math.max(0, tpage + Number(d.tpage));
    else if (d.build) { const x = (war()?.campBuildList(open) || []).find(y => y.type === d.build); if (x?.need.length) why = `Needs ${x.need.join(' and ')}`; else startPlacing(open, d.build); }
    else if (d.erase) startPlacing(open, 'eraser');
    else if (d.cancel) send({ id: heroId, type: 'frontier', action: 'campCancel', war: open, building: d.cancel });
    else if (d.rebuild) send({ id: heroId, type: 'frontier', action: 'campRebuild', war: open, building: d.rebuild });   // Tim 2026-11-17
    else if (d.train) { const n = count(`t:${d.train}:${d.unit}`); if (n) send({ id: heroId, type: 'frontier', action: 'campTrain', war: open, building: d.train, unit: d.unit, count: n }); else why = 'Type how many'; }
    else if (d.strategy) send({ id: heroId, type: 'frontier', action: 'warStrategy', strategy: d.strategy });
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
  const keybinds = sharedKeybinds();
  // a gold diamond where a run or a gate has locked onto the end of a wall (Tim 2026-11-15)
  const lockMark = (ctx, q) => { if (!q) return; const c = view.unitToScreen(q.x, q.z, 0); ctx.beginPath(); ctx.moveTo(c.x, c.y - 9); ctx.lineTo(c.x + 11, c.y); ctx.lineTo(c.x, c.y + 9); ctx.lineTo(c.x - 11, c.y); ctx.closePath(); ctx.fillStyle = '#ffd34d55'; ctx.fill(); ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2.5; ctx.stroke(); };
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
    drawBuildArea(ctx, view, w, W(), placing.kind, frontierData?.workers?.gatherBuildings || []);   // 7c-4: one outline, the ground outside darkened
    if (!mouse) { hint.hidden = true; return; }
    const p = view.screenToGround(mouse.x, mouse.y); if (!p) { hint.hidden = true; return; }
    const next = `${Math.round(p.x)},${Math.round(p.z)}|${game.state.frontier?.econTick}|${w.camp.buildings.length}|${placing.from ? `${placing.from.x},${placing.from.z}` : ''}`;
    // the Eraser (Tim 2026-11-15): the camp building under the cursor shows red with what comes back
    if (placing.kind === 'eraser') {
      const nextE = `${Math.round(p.x * 2)},${Math.round(p.z * 2)}|${game.state.frontier?.econTick}|${w.camp.buildings.length}`;
      if (nextE !== key) { key = nextE; preview = war()?.campEraseCheck(placing.war, p); }
      const b = preview?.building && w.camp.buildings.find(x => x.id === preview.building), color = preview?.ok ? '#ff655f' : '#c9b68a';
      if (b) { const r = W().buildings?.[b.type]?.line ? 2.4 : W().buildings?.[b.type]?.radius ?? 8, c0 = view.unitToScreen(b.x, b.z, 0), c1 = view.unitToScreen(b.x + r, b.z, 0), px = Math.max(8, Math.abs(c1.x - c0.x));
        ctx.beginPath(); ctx.ellipse(c0.x, c0.y, px, px * 0.45, 0, 0, Math.PI * 2); ctx.fillStyle = color + '44'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke(); }
      const back = Object.entries(preview?.refund || {}).filter(([, v]) => v).map(([r, v]) => `${v} ${r}`).join(', ');
      hint.hidden = false; hint.style.color = color; hint.style.borderColor = color;
      hint.textContent = preview?.ok ? `Erase the ${nice(preview.type)}: ${back ? `${back} back` : 'nothing back for a ruin'}. Left-click erases, right-click or Esc stops.` : `Eraser: ${preview?.reason || 'point at a camp building'}. Right-click or Esc stops.`;
      hint.style.left = `${Math.max(8, Math.min(innerWidth - 320, mouse.x + 18))}px`; hint.style.top = `${Math.max(8, Math.min(innerHeight - 100, mouse.y + 18))}px`;
      return;
    }
    // a palisade is a line (checkpoint 6-6): the first click sets the start, the second the end; every piece is shown
    if (placing.kind === 'palisade') {
      const a = placing.from || { x: Math.round(p.x), z: Math.round(p.z) }, b = { x: Math.round(p.x), z: Math.round(p.z) };
      if (next !== key) { key = next; preview = war()?.campLineCheck(placing.war, a, b); }
      const color = preview?.ok ? '#65ef88' : '#ff655f';
      (preview?.points || []).forEach((q, k) => { const c = view.unitToScreen(q.x, q.z, 0); ctx.beginPath(); ctx.ellipse(c.x, c.y, 7, 4, 0, 0, Math.PI * 2); ctx.fillStyle = (preview.bad === k ? '#ff655f' : color) + '66'; ctx.fill(); ctx.strokeStyle = preview.bad === k ? '#ff655f' : color; ctx.lineWidth = 2; ctx.stroke(); });
      lockMark(ctx, preview?.locks?.start); lockMark(ctx, preview?.locks?.end);
      const locked = !placing.from ? (preview?.locks?.start ? ' Locked onto the wall end.' : '') : preview?.locks?.end ? (preview.locks.end.level ? ' End level with the other wall.' : ' End locked onto the wall.') : '';
      if (placing.from && !preview?.locks?.start) { const c0 = view.unitToScreen(a.x, a.z, 0), c1 = view.unitToScreen(b.x, b.z, 0); ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]); }
      const costText = Object.entries(preview?.cost || {}).map(([r, v]) => `${v} ${r}`).join(', ');
      hint.hidden = false; hint.style.color = color; hint.style.borderColor = color;
      hint.textContent = !placing.from ? (preview?.ok ? `Palisade: left-click where the line starts.${locked} Right-click or Esc cancels.` : `${preview?.reason || 'Not here'}. Right-click or Esc cancels.`)
        : preview?.ok ? `Palisade: ${preview.points.length} pieces, ${costText}. Left-click to build the line, Shift carries on from its end, right-click or Esc cancels.${locked}` : `${preview?.reason || 'Not here'}. Right-click or Esc cancels.`;
      hint.style.left = `${Math.max(8, Math.min(innerWidth - 320, mouse.x + 18))}px`; hint.style.top = `${Math.max(8, Math.min(innerHeight - 100, mouse.y + 18))}px`;
      return;
    }
    const gate = placing.kind === 'gate', nextG = gate ? `${next}|${Math.round(p.x * 2)},${Math.round(p.z * 2)}|${placing.turn ? 't' : ''}` : next;
    if (nextG !== key) { key = nextG; preview = war()?.campCheck(placing.war, placing.kind, p, { turn: !!placing.turn }); }
    const color = preview?.ok ? '#65ef88' : '#ff655f', r = W().buildings?.[placing.kind]?.radius ?? 8;
    const at = gate && preview?.point ? preview.point : p;   // a gate shows where it will stand: in the wall, on its end, or under the cursor
    const c0 = view.unitToScreen(at.x, at.z, 0), c1 = view.unitToScreen(at.x + r, at.z, 0), px = Math.max(8, Math.abs(c1.x - c0.x));
    ctx.beginPath(); ctx.ellipse(c0.x, c0.y, px, px * 0.45, 0, 0, Math.PI * 2); ctx.fillStyle = color + '33'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    const img = gate ? imageAt(lineArtUrl('gate', Math.abs(Math.sin(preview?.rot || 0)) > 0.7)) : imageOf(placing.kind);
    if (gate) lockMark(ctx, preview?.lock);
    if (img.complete && img.naturalWidth) { const wpx = px * 2.2, hpx = wpx * img.naturalHeight / img.naturalWidth; ctx.globalAlpha = 0.65; ctx.drawImage(img, c0.x - wpx / 2, c0.y - hpx * 0.8, wpx, hpx); ctx.globalAlpha = 1; }
    hint.hidden = false; hint.style.color = color; hint.style.borderColor = color;
    const turnKey = keybinds.label('rotateBuilding', true) || 'R';
    hint.textContent = preview?.ok ? gate ? `Gate: ${preview.replaces?.length ? 'set into the wall' : preview.lock ? 'locked onto the wall end' : 'standing alone'}. ${preview.replaces?.length ? '' : `${turnKey} turns it. `}Left-click to place, Shift keeps placing, right-click or Esc cancels.` : `${nice(placing.kind)}: left-click to place, Shift keeps placing, right-click or Esc cancels.` : `${preview?.reason || 'Not here'}. Right-click or Esc cancels.`;
    hint.style.left = `${Math.max(8, Math.min(innerWidth - 320, mouse.x + 18))}px`; hint.style.top = `${Math.max(8, Math.min(innerHeight - 100, mouse.y + 18))}px`;
  }
  const consume = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  addEventListener('mousemove', e => { if (placing) { mouse = e.target?.closest?.('canvas#view') ? { x: e.clientX, y: e.clientY } : null; draw(); } });
  addEventListener('mousedown', e => {
    if (!placing || blocked() || !e.target?.closest?.('canvas#view')) return;
    if (e.button === 2) { cancelPlacing(); consume(e); return; }
    if (e.button !== 0) return;
    consume(e); mouse = { x: e.clientX, y: e.clientY }; key = ''; draw();
    if (placing.kind === 'eraser') { if (preview?.ok) { send({ id: heroId, type: 'frontier', action: 'campErase', war: placing.war, building: preview.building }); key = ''; } return; }
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
    // a gate goes by the cursor spot again, so the sim makes the same pick the preview showed
    if (placing.kind === 'gate') { const p = view.screenToGround(e.clientX, e.clientY); if (!p) return; send({ id: heroId, type: 'frontier', action: 'campPlace', war: placing.war, kind: 'gate', x: p.x, z: p.z, turn: !!placing.turn }); }
    else send({ id: heroId, type: 'frontier', action: 'campPlace', war: placing.war, kind: placing.kind, x: preview.point.x, z: preview.point.z });
    if (!e.shiftKey) { cancelPlacing(false); close(); }   // 7c: placing closes the build menu (Tim 2026-11-12)
  }, { capture: true });
  addEventListener('contextmenu', e => { if (placing && e.target?.closest?.('canvas#view')) consume(e); }, { capture: true });
  addEventListener('keydown', e => { if (placing && e.code === 'Escape') { cancelPlacing(); consume(e); } }, { capture: true });
  // R (Turn a building while placing) turns a camp gate between the two wall directions (Tim 2026-11-15)
  addEventListener('keydown', e => { if (placing?.kind === 'gate' && !blocked() && !e.repeat && !e.target?.closest?.('input,select,textarea') && keybinds.lookup(e, ['build']) === 'rotateBuilding') { placing.turn = !placing.turn; key = ''; draw(); consume(e); } }, { capture: true });
  addEventListener('blur', () => { if (placing) cancelPlacing(); });

  let seen = 0;
  function update() {
    if (placing) draw();
    if (!root.hidden) { if (!rec(open) || blocked()) close(); else fill(); }
    // say why a camp command was refused (receipts live one tick)
    for (const r of game.state.frontier?.receipts || []) if (r.seq > seen) { seen = r.seq; if (!r.ok && open && r.clan === hero()?.owner && /^camp|^train$|^warStrategy$|^ship$|^armoryUp$|^armoryCancel$/.test(r.action)) { why = r.reason; sig = ''; } }
  }
  return { show, close, update, cancel: () => cancelPlacing(false), isOpen: () => !root.hidden, isPlacing: () => !!placing };
}
