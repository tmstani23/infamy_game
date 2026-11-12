// War banner (frontier plan F6, checkpoint 2): presentation only, the sim checks every command again.
// One action-bar button beside War Lantern. In the city or inside one of your town rings it opens
// Pack for war; inside a rival town's war circle it plants the war camp banner (placement ghost with
// the banner band drawn on the ground); anywhere else it is greyed with the reason on hover.
// Also the red war coin above the ryo coin while a pack is carried, and the War declared splash.
// No special characters in game text (Tim 2026-11-10); long text lives in hover titles.
import { modeRules } from './sim/modes/index.js';
const FLAG = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M5 2v20" stroke="#3a2614" stroke-width="2.4"/><path d="M5 2v20" stroke="#c9a46a" stroke-width="1.2"/>
  <path d="M6 3h12v12l-3-2-3 2-3-2-3 2z" fill="#b8372e" stroke="#2a0d0a" stroke-width="1"/><path d="M4 2h9" stroke="#3a2614" stroke-width="2"/></svg>`;
const ICON = {
  ryo: `<svg viewBox="0 0 30 30" width="30" height="30"><circle cx="15" cy="15" r="12" fill="#d7b154" stroke="#3a2a0e" stroke-width="2"/><circle cx="15" cy="15" r="8.5" fill="none" stroke="#a7822e" stroke-width="1.5"/><rect x="12" y="12" width="6" height="6" fill="#3a2a0e"/></svg>`,
  timber: `<svg viewBox="0 0 22 18" width="32" height="26"><g stroke="#2a1d10" stroke-width="1"><rect x="4" y="9.5" width="12" height="7" rx="2" fill="#7a4f2a"/><ellipse cx="4" cy="13" rx="2.6" ry="3.5" fill="#d9a866"/><rect x="9" y="9.5" width="12" height="7" rx="2" fill="#7a4f2a"/><ellipse cx="9" cy="13" rx="2.6" ry="3.5" fill="#d9a866"/><rect x="6.5" y="3.5" width="12" height="7" rx="2" fill="#7a4f2a"/><ellipse cx="6.5" cy="7" rx="2.6" ry="3.5" fill="#d9a866"/></g></svg>`,
  stone: `<svg viewBox="0 0 22 16" width="30" height="24"><g stroke="#2a1d10" stroke-width="1"><path d="M11 1 19 4.5 11 8 3 4.5Z" fill="#d4d0c4"/><path d="M3 4.5 11 8 11 15 3 11.5Z" fill="#9c988c"/><path d="M19 4.5 11 8 11 15 19 11.5Z" fill="#7d796f"/></g></svg>`
};
const NAME = { ryo: 'War chest (ryo)', timber: 'Timber', stone: 'Stone' };
const CSS = `
#warpack{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:rgba(4,7,10,.6);color:#e6dfcf;font:13px/1.45 system-ui,sans-serif}
#warpack[hidden]{display:none}
#warpack .win{width:min(640px,calc(100vw - 32px));background:#10151a;border:1px solid #514a3d;border-top:2px solid #c9473d;border-radius:6px;box-shadow:0 18px 50px #000a;overflow:hidden}
#warpack header{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;background:#151b21;border-bottom:1px solid #303238}
#warpack .eyebrow{color:#e0786c;letter-spacing:.16em;font-size:10px;text-transform:uppercase}
#warpack h2{margin:2px 0 0;font-size:22px;font-weight:500}
#warpack button{border:1px solid #61543e;border-radius:5px;background:#20262d;color:#eadfc6;padding:7px 12px;cursor:pointer;font:600 12px system-ui}
#warpack button:hover{border-color:#ffe0a1}
#warpack .lay{display:grid;grid-template-columns:170px 1fr}
#warpack aside{padding:16px;border-right:1px solid #303238;background:linear-gradient(180deg,#9a3a3233,#11171d 70%);text-align:center}
#warpack aside .art{height:150px;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 45%,#c9473d40,transparent 65%)}
#warpack aside img{width:118px;height:118px;object-fit:contain;image-rendering:auto;border-radius:6px}
#warpack .clan{display:block;color:#d8b56c;font-size:11px;text-transform:uppercase;letter-spacing:.15em;margin-top:8px}
#warpack .name{font-size:19px;font-weight:500}
#warpack main{padding:12px 18px}
#warpack .from{display:flex;justify-content:space-between;color:#9b9c98;font-size:10px;letter-spacing:.12em;text-transform:uppercase;border-bottom:1px solid #3c3b36;padding-bottom:7px;cursor:help}
#warpack .from b{color:#d8b56c;font-weight:500}
#warpack .res{display:grid;grid-template-columns:44px 1fr 78px;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #252c31}
#warpack .res.off{opacity:.42}
#warpack .ico{width:44px;height:44px;border:1px solid #665944;border-radius:6px;background:radial-gradient(#2a2620,#151514);display:grid;place-items:center}
#warpack .rn{display:flex;justify-content:space-between}#warpack .rn span{color:#9aa3a6;font-size:11px}
#warpack input[type=range]{width:100%;margin:6px 0 0;accent-color:#e0b85a}
#warpack input.num{width:66px;background:#07090b;border:1px solid #826f4c;border-radius:4px;padding:5px 6px;text-align:right;font:600 15px system-ui;color:#f3e3bd;box-shadow:inset 0 0 8px #000}
#warpack .keep{font-size:11px;color:#9aa3a6}#warpack .keep b{color:#a5d8a4;font-weight:600}#warpack .keep b.low{color:#ed8b7c}
#warpack .foot{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
#warpack .go{border-color:#e07b6c;background:linear-gradient(#8e2d26,#5e1c18);color:#ffe9dc;letter-spacing:.06em;box-shadow:0 0 14px #c9473d66}
#warpack .why{color:#ed8b7c;font-size:12px;min-height:16px;margin-top:6px}
#warcoin{position:fixed;right:165px;bottom:150px;width:90px;height:90px;border-radius:50%;display:grid;place-items:center;text-align:center;z-index:19;cursor:help;
  background:radial-gradient(#2b1714,#0f0a09 70%);box-shadow:0 0 0 4px #8e2d26,0 0 0 6px #2a0f0d,0 0 16px #c9473d88;color:#f6e6bf;font:600 11px/1.15 system-ui}
#warcoin[hidden]{display:none}#warcoin b{display:block;font-size:18px}#warcoin small{display:block;font-size:9px;letter-spacing:.14em;color:#ee9a8c}
#warcoin.camp{cursor:pointer}
#warsplash{position:fixed;left:0;right:0;top:22%;height:96px;z-index:58;pointer-events:none;text-align:center;
  background:linear-gradient(90deg,transparent,#7e231dee 14%,#a3332aee 50%,#7e231dee 86%,transparent);box-shadow:0 0 30px #c9473d55;animation:warsplash 4.2s ease-out forwards}
#warsplash[hidden]{display:none}
#warsplash .t{padding-top:16px;font:600 34px/1 Georgia,serif;letter-spacing:.22em;color:#fff2de;text-shadow:0 2px 6px #000}
#warsplash .s{margin-top:10px;font:13px system-ui;letter-spacing:.14em;color:#f2cdbb;text-transform:uppercase}
@keyframes warsplash{0%{opacity:0;transform:scaleY(.4)}8%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
#warbannerhint{position:fixed;pointer-events:none;z-index:22;padding:8px 11px;background:rgba(12,18,24,.94);max-width:300px;border:1px solid;border-radius:8px;font:12px/1.4 system-ui}
`;

export function createWarBanner({ button, game, heroId, view, catalog, send, blocked = () => false, onStart = () => {}, openCamp = () => {} }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  button.id = 'warbannerbtn'; button.type = 'button'; button.dataset.icon = '';
  const war = () => game.frontier?.war;
  const hero = () => game.state.entities[heroId];
  const clanOf = () => game.state.clans?.[hero()?.owner];
  const W = () => war()?.data;

  // ---- what the button does here ---------------------------------------------------------
  function rivalTownNear(h) {
    const R = W()?.circleRadius ?? 900;
    let best = null, bd = Infinity;
    for (const s of Object.values(game.state.frontier?.settlements || {})) {
      if (s.capital || s.owner === h.owner || s.owner == null || !Number.isFinite(s.x)) continue;
      const d = Math.hypot(h.x - s.x, h.z - s.z);
      if (d <= R && d < bd) { bd = d; best = s; }
    }
    return best;
  }
  function mode() {
    const h = hero(), w = war();
    if (!w?.data || !h) return { kind: 'none', why: '' };
    if (!modeRules(game.state).island) return { kind: 'none', why: '' };
    if (h.dead || h.downed) return { kind: 'off', why: 'Your hero is down' };
    const v = w.packView(h);
    if (v.ok) return { kind: 'pack', view: v };
    if (h.place === 'world') { const t = rivalTownNear(h); if (t) return { kind: 'plant', town: t }; }
    return { kind: 'off', why: 'Pack for war in the city or one of your towns. Plant the banner near a rival town (inside its war circle).' };
  }

  // ---- Pack for war window ---------------------------------------------------------------
  const root = document.createElement('div'); root.id = 'warpack'; root.hidden = true;
  root.innerHTML = `<div class="win" role="dialog" aria-label="Pack for war"><header><div><div class="eyebrow"></div><h2>Pack for war</h2></div><button data-a="close">Esc</button></header>
    <div class="lay"><aside><div class="art"><img alt=""></div><span class="clan">Carried by</span><div class="name"></div></aside>
    <main><div class="from"><span>From <b></b></span><span class="where"></span></div>
    ${['ryo', 'timber', 'stone'].map(r => `<div class="res" data-r="${r}"><div class="ico">${ICON[r]}</div><div><div class="rn">${NAME[r]}<span class="lim"></span></div>
      <input type="range" min="0" step="10"><div class="keep"></div></div><input class="num" type="text" inputmode="numeric" aria-label="${NAME[r]}"></div>`).join('')}
    <div class="why"></div><div class="foot"><button data-a="unpack">Unpack</button><button class="go" data-a="pack">Pack for war</button></div></main></div></div>`;
  document.body.append(root);
  const $ = q => root.querySelector(q);
  let want = { ryo: 0, timber: 0, stone: 0 }, lastView = null;
  function rowMax(r, v) {
    const L = v.limits[r], packed = v.pack?.[r] || 0;
    return Math.max(packed, Math.min(L.max ?? Infinity, packed + (L.has || 0)));
  }
  function fill() {
    const h = hero(), v = war()?.packView(h); if (!v) return;
    lastView = v;
    const clan = clanOf();
    const cn = clan?.name || 'Your';   // clan names may already end in "clan" (Kuroda clan)
    $('.eyebrow').textContent = `${/ clan$/i.test(cn) ? cn : `${cn} clan`}, prepare for war`;
    $('.name').textContent = h?.name || 'Your hero';
    $('.from b').textContent = v.pot ? (v.pot.kind === 'city' ? 'Clan treasury' : `${v.pot.name} coffers and stores`) : 'nowhere';
    $('.from').title = 'The hero carries the pack. Planting a war banner by a rival town turns it into the camp\'s war chest and stores. Unpack returns every part to where it came from.';
    $('.where').textContent = v.pot ? (v.pot.kind === 'city' ? 'In the city' : `In ${v.pot.name}`) : '';
    for (const r of ['ryo', 'timber', 'stone']) {
      const row = $(`.res[data-r="${r}"]`), L = v.limits[r], max = rowMax(r, v), off = v.pot?.kind === 'city' && r !== 'ryo' && !(v.pack?.[r]);
      row.classList.toggle('off', !!off);
      row.title = off ? 'Timber and stone are packed at one of your towns. Order them from the capital by rail first if a town is short.' : '';
      const range = row.querySelector('input[type=range]'), num = row.querySelector('.num');
      range.max = String(max); range.disabled = num.disabled = !!off;
      if (document.activeElement !== num) num.value = String(want[r]);
      range.value = String(want[r]);
      row.querySelector('.lim').textContent = r === 'ryo' ? 'no limit' : `${L.max} max`;
      const left = (L.has || 0) - Math.max(0, want[r] - (v.pack?.[r] || 0));
      const pot = v.pot ? (v.pot.kind === 'city' ? 'Treasury' : v.pot.name) : '';
      const low = r === 'ryo' && v.pot?.kind === 'town' && left < 100;
      row.querySelector('.keep').innerHTML = off ? 'Pack timber and stone at a town' : `${pot} keeps <b class="${low ? 'low' : ''}">${Math.max(0, Math.floor(left))}</b>`;
      row.querySelector('.keep').title = low ? 'Little ryo left for this town\'s own defence if it is attacked' : '';
    }
  }
  function open() {
    const v = war()?.packView(hero()); if (!v?.ok) return;
    want = { ryo: v.pack?.ryo || 0, timber: v.pack?.timber || 0, stone: v.pack?.stone || 0 };
    root.hidden = false; $('.why').textContent = '';
    const img = $('aside img'), model = hero()?.model;
    // the hero's sharp concept cut-out (menu_shell msConcept, Tim 2026-11-10: the sprite crop was blurry), else the sprite portrait
    const sprite = () => import('./portraits.js').then(({ portrait }) => { const u = portrait(catalog, model, () => { img.src = portrait(catalog, model) || ''; }); if (u) img.src = u; }).catch(() => {});
    import('./menu_shell.js').then(({ msConcept }) => { const u = msConcept?.(model); if (u) { img.onerror = () => { img.onerror = null; sprite(); }; img.src = u; } else sprite(); }).catch(sprite);
    fill();
  }
  function close() { root.hidden = true; }
  root.addEventListener('input', e => {
    const row = e.target.closest('.res'); if (!row) return;
    const r = row.dataset.r, n = Math.max(0, Math.floor(Number(String(e.target.value).replace(/[^0-9]/g, '')) || 0));
    want[r] = lastView ? Math.min(n, rowMax(r, lastView)) : n;
    if (e.target.type === 'range') row.querySelector('.num').value = String(want[r]);
    fill();
  });
  root.addEventListener('click', e => {
    const a = e.target.closest('button')?.dataset.a;
    if (e.target === root || a === 'close') close();
    else if (a === 'unpack') { send({ id: heroId, type: 'frontier', action: 'warUnpack' }); close(); }
    else if (a === 'pack') { send({ id: heroId, type: 'frontier', action: 'warPack', ...want }); close(); }
  });
  addEventListener('keydown', e => { if (!root.hidden && e.code === 'Escape') { close(); e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true });

  // ---- planting: ghost banner and the band on the ground ---------------------------------
  const ghost = document.createElement('canvas'), hint = document.createElement('div');
  ghost.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:21'; hint.id = 'warbannerhint';
  ghost.hidden = hint.hidden = true; document.body.append(ghost, hint);
  let placing = null, mouse = null, preview = null, key = '', confirmEmpty = false;
  function cancel() { placing = null; mouse = null; preview = null; key = ''; confirmEmpty = false; ghost.hidden = hint.hidden = true; }
  const ring = (ctx, x, z, r, stroke, width, dash = []) => {
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, p = view.unitToScreen(x + Math.cos(a) * r, z + Math.sin(a) * r, 0); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
    ctx.setLineDash(dash); ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); ctx.setLineDash([]);
  };
  function draw() {
    if (!placing || blocked()) { ghost.hidden = hint.hidden = true; return; }
    const t = game.state.frontier?.settlements?.[placing], h = hero();
    if (!t || !h) { cancel(); return; }
    ghost.hidden = false; ghost.width = innerWidth; ghost.height = innerHeight;
    const ctx = ghost.getContext('2d');
    const band = war().band(t), R = W().circleRadius;
    ring(ctx, t.x, t.z, R, 'rgba(224,162,74,.75)', 2, [14, 10]);
    ring(ctx, t.x, t.z, band[0], '#7dffa0', 2); ring(ctx, t.x, t.z, band[1], '#7dffa0', 2);
    ring(ctx, t.x, t.z, (band[0] + band[1]) / 2, 'rgba(101,239,136,.18)', Math.max(4, Math.abs(view.unitToScreen(t.x + band[1], t.z, 0).x - view.unitToScreen(t.x + band[0], t.z, 0).x)));
    ring(ctx, t.x, t.z, band[0] - (W().band?.inner ?? 150), 'rgba(228,106,94,.9)', 2, [7, 6]);
    if (!mouse) { hint.hidden = true; return; }
    const p = view.screenToGround(mouse.x, mouse.y); if (!p) { hint.hidden = true; return; }
    const next = JSON.stringify([game.state.tick, Math.round(p.x), Math.round(p.z)]);
    if (next !== key) { key = next; preview = war().check(h, placing, p); }
    const pack = clanOf()?.warPack, empty = !(pack?.timber || pack?.stone);
    const warn = preview.ok && empty, color = !preview.ok ? '#ff655f' : warn ? '#f0c060' : '#65ef88';
    const base = view.unitToScreen(preview.point.x, preview.point.z, 0), top = view.unitToScreen(preview.point.x, preview.point.z, 9);
    ctx.beginPath(); ctx.ellipse(base.x, base.y, 26, 11, 0, 0, Math.PI * 2); ctx.fillStyle = color + '44'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.strokeStyle = '#2a1d10'; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    const fh = (base.y - top.y) * 0.55; ctx.fillStyle = color + 'aa'; ctx.fillRect(top.x + 1, top.y + 2, fh * 0.5, fh); ctx.strokeRect(top.x + 1, top.y + 2, fh * 0.5, fh);
    hint.hidden = false; hint.style.color = color; hint.style.borderColor = color;
    hint.textContent = !preview.ok ? `${preview.reason}. Right-click or Esc cancels.`
      : warn ? (confirmEmpty ? 'No timber or stone packed: the camp starts empty and must gather. Left-click again to plant anyway.' : 'No timber or stone packed. Left-click to see the warning, right-click or Esc cancels.')
      : `War camp banner: declares war on ${t.name}. Left-click to plant, right-click or Esc cancels.`;
    hint.style.left = `${Math.max(8, Math.min(innerWidth - 320, mouse.x + 18))}px`; hint.style.top = `${Math.max(8, Math.min(innerHeight - 100, mouse.y + 18))}px`;
  }
  const consume = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  addEventListener('mousemove', e => { if (placing) { mouse = e.target?.closest?.('canvas#view') ? { x: e.clientX, y: e.clientY } : null; draw(); } });
  addEventListener('mousedown', e => {
    if (!placing || blocked() || !e.target?.closest?.('canvas#view')) return;
    if (e.button === 2) { cancel(); consume(e); return; }
    if (e.button !== 0) return;
    mouse = { x: e.clientX, y: e.clientY }; key = ''; draw(); consume(e);
    if (!preview?.ok) return;
    const pack = clanOf()?.warPack;
    if (!(pack?.timber || pack?.stone) && !confirmEmpty) { confirmEmpty = true; draw(); return; }
    send({ id: heroId, type: 'frontier', action: 'plantBanner', town: placing, ...preview.point }); cancel();
  }, { capture: true });
  addEventListener('contextmenu', e => { if (placing && e.target?.closest?.('canvas#view')) consume(e); }, { capture: true });
  addEventListener('keydown', e => { if (placing && e.code === 'Escape') { cancel(); consume(e); } }, { capture: true });
  addEventListener('blur', cancel);

  button.addEventListener('click', () => {
    const m = mode(); button.blur();
    if (m.kind === 'pack') { cancel(); open(); }
    else if (m.kind === 'plant') { if (placing) cancel(); else { onStart(); placing = m.town.id; draw(); } }
  });

  // ---- war coin and splash ---------------------------------------------------------------
  const coin = document.createElement('div'); coin.id = 'warcoin'; coin.hidden = true; document.body.append(coin);
  // Camp readout (checkpoint 3): inside the circle of a war you are fighting, the coin shows the camp chest.
  // Checkpoint 4: clicking it opens the camp panel (build, train, hire workers, hall upgrade).
  let campId = null;
  coin.addEventListener('click', () => { if (campId) openCamp(campId); });
  function ownCamp() {
    const h = hero(), R = W()?.circleRadius ?? 900;
    if (!h) return null;
    for (const w of Object.values(game.state.frontier?.wars?.list || {})) {
      const t = game.state.frontier.settlements?.[w.town];
      if (w.attacker === h.owner && w.camp?.chest !== undefined && t && Math.hypot(h.x - t.x, h.z - t.z) <= R) return w;
    }
    return null;
  }
  const splash = document.createElement('div'); splash.id = 'warsplash'; splash.hidden = true; splash.innerHTML = '<div class="t">WAR DECLARED</div><div class="s"></div>'; document.body.append(splash);
  let seenWars = null, splashTimer = 0, coinSig = '';
  function warsTick() {
    const list = game.state.frontier?.wars?.list || {}, me = hero()?.owner, ids = Object.keys(list);
    if (seenWars === null) { seenWars = new Set(ids); return; }   // wars already on at load: no splash
    for (const id of ids) if (!seenWars.has(id)) {
      seenWars.add(id); const w = list[id];
      if (w.attacker !== me && w.defender !== me) continue;
      const name = c => game.state.clans?.[c]?.name || c, town = game.state.frontier.settlements?.[w.town]?.name || 'a town';
      splash.querySelector('.s').textContent = `${name(w.attacker)} vs ${name(w.defender)}, ${town}`;
      splash.hidden = true; void splash.offsetWidth; splash.hidden = false;
      clearTimeout(splashTimer); splashTimer = setTimeout(() => { splash.hidden = true; }, 4300);
    }
  }

  function update() {
    const m = mode();
    button.hidden = m.kind === 'none';
    const label = m.kind === 'plant' ? (placing ? 'Cancel' : 'Plant banner') : 'Pack for war';
    if (button.dataset.label !== label) { button.dataset.label = label; button.innerHTML = `${FLAG}<span style="display:block">${label}</span>`; }
    button.disabled = m.kind === 'off';
    button.title = m.kind === 'pack' ? 'Pack ryo, timber and stone for a war camp' : m.kind === 'plant' ? `Plant a war camp banner by ${m.town.name}: this declares war` : m.why;
    if (placing && m.kind !== 'plant') cancel();
    if (placing) draw();
    if (!root.hidden) { if (m.kind !== 'pack') close(); else fill(); }
    const pack = clanOf()?.warPack, sig = pack ? `${pack.ryo}|${pack.timber}|${pack.stone}` : '';
    const camp = ownCamp(), C = W()?.camp || {};
    campId = camp?.id || null;
    const csig = camp ? `${camp.id}|${Math.floor(camp.camp.chest)}|${Math.floor(camp.camp.stock.timber)}|${Math.floor(camp.camp.stock.stone)}|${camp.camp.workers.length}|${(camp.camp.workerTraining || []).length}` : '';
    coin.classList.toggle('camp', !pack && !!camp);
    if (!pack && camp) {
      if (csig !== coinSig) {
        coinSig = csig; coin.hidden = false;
        const k = camp.camp, n = k.workers.length, tr = (k.workerTraining || []).length;
        coin.innerHTML = `<div><b>${Math.floor(k.chest)}</b><small>WAR CHEST</small>${n} workers</div>`;
        coin.title = `Your war camp: ${Math.floor(k.chest)} ryo in the war chest, ${Math.floor(k.stock.timber)} timber and ${Math.floor(k.stock.stone)} stone in the camp stores, ${n} workers${tr ? ` (${tr} in training)` : ''}. Camp workers gather timber and stone anywhere in the war circle outside the town ring and drop it at the camp hall. A camp holds at most ${C.workerCap ?? '?'} workers. Click to open the camp panel.`;
      }
    } else if (sig !== coinSig) {
      coinSig = sig; coin.hidden = !pack;
      if (pack) { coin.innerHTML = `<div><b>${pack.ryo || 0}</b><small>WAR PACK</small>${pack.timber || pack.stone ? `${pack.timber || 0} / ${pack.stone || 0}` : ''}</div>`;
        coin.title = `War pack carried by your hero: ${pack.ryo || 0} ryo, ${pack.timber || 0} timber, ${pack.stone || 0} stone. Plant a war banner by a rival town to use it.`; }
    }
    warsTick();
  }
  return { update, cancel, isPlacing: () => !!placing, isOpen: () => !root.hidden };
}
