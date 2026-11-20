// The end of a campaign (Z6, Tim OK'd the mocks 2026-11-20: zones_build/shots/victory_mock_v2.png, defeat_mock_v2.png;
// then chose the live castle shot over the side banners).
// Over the game when state.campaignEnd is set (sim/frontier/war_outcomes.js clanOut). The camera goes to your castle
// (victory) or your fallen castle (defeat) and drifts slowly; the HUD is hidden and the screen frames the real scene,
// with the words in the lower part so the castle shows above them.
//   victory: gold light rays over the castle, rising embers, your crest as a gold medallion, the rival crests struck
//            through with the day each castle fell; Main menu or Keep playing (the screen goes away, the HUD comes back)
//   defeat:  the scene drained of colour, a fire glow and sparks rising, falling ash, a cracked grey crest, the clan
//            still standing glowing in its colour; Load a save or Main menu (both go back to the start screen)
// Presentation only: reads the state. endModel(game) is pure (tests use it).
// createCampaignEnd({ game, root, view, hero }) -> { update, isOpen }   view: render/view.js, hero() -> your hero
import { ELEVATION, PPU, SCREEN_RIGHT, SCREEN_DOWN } from './sim/geometry.js';
const SHOT_ZOOM = 0.2;   // the end shot's zoom (view.js: 1 is close, 0.175 the furthest on the island)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// the clan crest (mon) as SVG: a ring with three commas, as render/banners.js drawCrest draws it
export function monSvg(fill, ink, size, extra = '') {
  const parts = [0, 1, 2].map(k => {
    const a = k * 2.094 - 1.57, f = n => n.toFixed(1);
    return `<circle cx="${f(Math.cos(a) * 16)}" cy="${f(Math.sin(a) * 16)}" r="10" stroke="none"/><path d="M${f(Math.cos(a) * 24)} ${f(Math.sin(a) * 24)} A24 24 0 0 1 ${f(Math.cos(a + 1.2) * 24)} ${f(Math.sin(a + 1.2) * 24)}" fill="none"/>`;
  }).join('');
  return `<svg viewBox="-50 -50 100 100" width="${size}" height="${size}" aria-hidden="true" ${extra}><circle r="47" fill="${fill}"/><g fill="${ink}" stroke="${ink}" stroke-width="5" stroke-linecap="round"><circle r="38" fill="none"/>${parts}</g></svg>`;
}

// what the screen shows, or null when the campaign is not over
export function endModel(game) {
  const S = game.state, end = S.campaignEnd; if (!end) return null;
  const me = Object.keys(S.clans || {}).find(id => !S.clans[id].bot) || 'player';
  const win = end.winner === me, Z = game.frontier?.campaignZones;
  const set = Object.values(S.frontier?.settlements || {});
  const towns = set.filter(s => s.owner === me && !s.capital).length;
  const taken = set.filter(s => s.castle && s.fallen?.by === me).length;
  const zones = Z?.held ? Z.held(me).length : 0, all = Z?.zones ? Z.zones().length : 6;
  const name = id => S.clans[id]?.name || id;
  const rivals = Object.keys(S.clans).filter(id => win ? id !== me : true).map(id => {
    const c = S.clans[id], out = !!c.out;
    const sub = out ? (c.out.day != null ? `Castle fell on day ${c.out.day}` : 'Castle fell') : `Still standing, ${Z?.held ? Z.held(id).length : 0} zones`;
    return { id, name: name(id), color: c.color || '#888', out, sub };
  }).sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || (a.id === me ? -1 : 0));
  const day = end.day ?? S.season?.day ?? '';
  return { win, me, color: S.clans[me]?.color || '#2aa198', clan: name(me),
    title: win ? 'Victory' : 'Defeat', eyebrow: win ? 'The campaign is won' : 'The campaign is lost',
    sub: win ? `The ${name(me)} rules the island` : end.by ? `Your castle has fallen to the ${name(end.by)}` : 'Your castle has fallen',
    rivals, stats: [[day, 'Days'], [`${zones} of ${all}`, 'Zones'], [towns, 'Towns'], [taken, 'Castles taken']],
    buttons: win ? [['menu', 'Main menu', false], ['keep', 'Keep playing', true]] : [['menu', 'Load a save', false], ['menu', 'Main menu', true]] };
}

const CSS = `
body.campaign-end > :not(#view):not(#vignette):not(#campaignend), body.campaign-end > :not(#view):not(#vignette):not(#campaignend) * { visibility: hidden !important; }
#campaignend{position:fixed;inset:0;z-index:90;display:grid;place-items:end center;padding-bottom:4vh;font-family:system-ui,sans-serif;overflow:hidden}
#campaignend[hidden]{display:none}
#campaignend .stage{position:relative;width:min(1000px,96vw);text-align:center}
#campaignend .medal{position:relative;width:104px;height:104px;margin:0 auto;display:grid;place-items:center;border-radius:50%}
#campaignend .eyebrow{margin-top:14px;letter-spacing:.42em;font-size:13px;text-transform:uppercase;text-shadow:0 0 10px #000,0 0 3px #000}
#campaignend h1{margin:2px 0 0;font:700 92px/1 Georgia,'Times New Roman',serif;letter-spacing:.14em;text-transform:uppercase;-webkit-background-clip:text;background-clip:text;color:transparent}
#campaignend .sub{font:italic 21px Georgia,serif;text-shadow:0 2px 6px #000,0 0 2px #000;margin-top:4px}
#campaignend .rule{height:2px;width:520px;max-width:80vw;margin:14px auto}
#campaignend .clans{display:flex;justify-content:center;gap:22px;flex-wrap:wrap}
#campaignend .fc{display:flex;align-items:center;gap:12px;text-align:left;border-radius:40px 8px 8px 40px;padding:5px 18px 5px 5px}
#campaignend .fm{position:relative;width:52px;height:52px}
#campaignend .fm .ring{position:absolute;inset:-3px;border:2px solid;border-radius:50%;opacity:.7}
#campaignend .fm .slash{position:absolute;left:-6px;top:23px;width:64px;height:7px;transform:rotate(-38deg);border-radius:4px}
#campaignend .fc b{display:block;font-size:16px}#campaignend .fc span{font-size:12px;letter-spacing:.04em}
#campaignend .stats{display:flex;justify-content:center;gap:14px;margin-top:16px}
#campaignend .st{width:118px;padding:9px 0 7px;border-radius:6px;box-shadow:inset 0 0 0 1px #000,0 6px 16px #000a}
#campaignend .st b{display:block;font:700 28px Georgia,serif}#campaignend .st span{font-size:10px;letter-spacing:.2em;text-transform:uppercase}
#campaignend .btns{display:flex;justify-content:center;gap:14px;margin-top:20px}
#campaignend .btns button{font:600 14px system-ui;letter-spacing:.12em;text-transform:uppercase;padding:11px 26px;border-radius:5px;cursor:pointer}
#campaignend .fx{position:absolute;inset:0;pointer-events:none}#campaignend .fx i{position:absolute;border-radius:50%}
#campaignend .shade{position:absolute;inset:0;pointer-events:none}
/* victory: the castle in warm light */
#campaignend.win{color:#efe4c8;backdrop-filter:saturate(1.15) contrast(1.04)}
#campaignend.win .shade{background:radial-gradient(ellipse 70% 55% at 50% 30%, color-mix(in srgb,#e6c27a 14%,transparent) 0%, transparent 60%),
 radial-gradient(ellipse 120% 90% at 50% 40%, transparent 45%, #000a 100%),
 linear-gradient(180deg, #0000 0%, #0000 38%, #08090bb0 60%, #050607ee 82%, #000 100%)}
#campaignend.win .rays{position:absolute;left:50%;top:30%;width:2400px;height:2400px;margin:-1200px 0 0 -1200px;pointer-events:none;mix-blend-mode:screen;
 background:repeating-conic-gradient(from 0deg, #f3d58e2e 0deg 3deg, transparent 3deg 14deg);
 -webkit-mask:radial-gradient(circle, transparent 0%, #000a 8%, #0006 24%, transparent 46%);mask:radial-gradient(circle, transparent 0%, #000a 8%, #0006 24%, transparent 46%);animation:ceSpin 120s linear infinite}
@keyframes ceSpin{to{transform:rotate(360deg)}}
#campaignend.win .fx i{background:radial-gradient(circle,#ffe2a0,#ff9a3c 60%,transparent 70%);filter:blur(.4px);animation:ceRise 9s linear infinite}
@keyframes ceRise{from{transform:translateY(40px)}to{transform:translateY(-160px)}}
#campaignend.win .medal{background:radial-gradient(circle at 35% 30%, #fff3c9, #e6c27a 38%, #8a6526 75%, #4a3412);box-shadow:0 0 0 4px #1a140c,0 0 0 6px #e6c27a,0 0 40px #e6c27aaa,0 0 100px color-mix(in srgb,var(--c) 55%,transparent)}
#campaignend.win .medal svg{filter:drop-shadow(0 3px 4px #000a)}
#campaignend.win .eyebrow{color:#f0d08a}
#campaignend.win h1{background-image:linear-gradient(180deg,#fff6d8 0%,#e6c27a 45%,#a8792c 70%,#f3d58e 100%);filter:drop-shadow(0 4px 0 #2a1a08) drop-shadow(0 0 22px #e6c27a88)}
#campaignend.win .sub{color:#f4ead2}#campaignend.win .rule{background:linear-gradient(90deg,transparent,#e6c27a,transparent)}
#campaignend.win .fc{background:linear-gradient(90deg,#14100cdd,#14100c66);border:1px solid #5a4528}
#campaignend.win .fm .slash{background:linear-gradient(90deg,transparent,#d8382c 15%,#ff5a3c 50%,#d8382c 85%,transparent);box-shadow:0 0 8px #ff3a2088}
#campaignend.win .fc b{color:#e9dcc0}#campaignend.win .fc span{color:#b6a98e}
#campaignend.win .st{background:linear-gradient(180deg,#221a10ee,#0f0c08ee);border:1px solid #e6c27aaa}
#campaignend.win .st b{color:#fff0c8}#campaignend.win .st span{color:#e6c27a}
#campaignend.win .btns button{border:1px solid #6d5a3c;background:#1a1612dd;color:#e8dcc0}
#campaignend.win .btns .go{border-color:#e6c27a;background:linear-gradient(180deg,#b88a3a,#7a5418);color:#fff6dc;box-shadow:0 0 18px #e6c27a77}
/* defeat: the fallen castle, colour drained, fire below */
#campaignend.loss{color:#e4d8c2;backdrop-filter:saturate(.45) sepia(.25) brightness(.85)}
#campaignend.loss .shade{background:radial-gradient(ellipse 120% 90% at 50% 40%, transparent 40%, #000c 100%),
 linear-gradient(180deg, #1a0806aa 0%, #0000 22%, #0000 40%, #0a0504c0 60%, #050303f0 82%, #000 100%)}
#campaignend.loss .glow{position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;
 background:radial-gradient(ellipse 55% 38% at 50% 34%, #ff5a2455 0%, #b8392c30 45%, transparent 75%),radial-gradient(ellipse 90% 30% at 50% 58%, #ff6a2a3a, transparent 70%);animation:ceFlick 3.2s ease-in-out infinite alternate}
@keyframes ceFlick{0%{opacity:.75}35%{opacity:1}60%{opacity:.82}100%{opacity:.95}}
#campaignend.loss .fx i{border-radius:40%;background:#a39a8c;filter:blur(.6px);animation:ceFall 12s linear infinite}
@keyframes ceFall{from{transform:translate(0,-60px)}to{transform:translate(30px,160px)}}
#campaignend.loss .fx.sparks i{border-radius:50%;background:radial-gradient(circle,#ffd08a,#ff5a24 55%,transparent 70%);filter:none;animation:ceSpark 6s ease-out infinite}
@keyframes ceSpark{0%{transform:translate(0,0);opacity:0}10%{opacity:1}100%{transform:translate(-24px,-220px);opacity:0}}
#campaignend.loss .medal{filter:grayscale(.75) brightness(.8);background:radial-gradient(circle at 35% 30%, #d6cdbb, #8d8170 40%, #4a4036 78%, #1e1914);box-shadow:0 0 0 4px #120d0a,0 0 0 6px #5d5146,0 0 40px #b8392c66}
#campaignend.loss .medal .crack{position:absolute;inset:0}
#campaignend.loss .eyebrow{color:#d98a7c}
#campaignend.loss h1{background-image:linear-gradient(180deg,#e8ddd0 0%,#9a8f80 40%,#5a3a32 72%,#a0574a 100%);filter:drop-shadow(0 4px 0 #0c0706) drop-shadow(0 0 26px #b8392c88)}
#campaignend.loss .sub{color:#ddd0bb}#campaignend.loss .rule{background:linear-gradient(90deg,transparent,#b8392c,transparent)}
#campaignend.loss .fc{background:linear-gradient(90deg,#120d0bdd,#120d0b66);border:1px solid #4a3a30}
#campaignend.loss .fc.up{border-color:var(--rc);box-shadow:0 0 18px color-mix(in srgb,var(--rc) 35%,transparent)}
#campaignend.loss .fm .slash{background:linear-gradient(90deg,transparent,#7a2a22 15%,#a8382c 50%,#7a2a22 85%,transparent)}
#campaignend.loss .fc b{color:#e4d6bc}#campaignend.loss .fc span{color:#a99b84}
#campaignend.loss .st{background:linear-gradient(180deg,#1c1411ee,#0b0807ee);border:1px solid #6a4a40}
#campaignend.loss .st b{color:#e8dccb}#campaignend.loss .st span{color:#d98a7c}
#campaignend.loss .btns button{border:1px solid #5a4a3c;background:#151110dd;color:#ddd0bb}
#campaignend.loss .btns .go{border-color:#c0392b;background:linear-gradient(180deg,#8e2d26,#5e1c18);color:#ffe9dc;box-shadow:0 0 18px #c9473d66}
`;

export function endHtml(m) {
  let r = m.win ? 7 : 11; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647, f = (n, d = 1) => n.toFixed(d);
  const dots = (n, size, op, secs, top = [0, 100]) => Array.from({ length: n }, () => `<i style="left:${f(rnd() * 100)}%;top:${f(top[0] + rnd() * (top[1] - top[0]))}%;width:${f(2 + rnd() * size)}px;height:${f(2 + rnd() * size)}px;opacity:${f(op[0] + rnd() * op[1], 2)};animation-delay:-${f(rnd() * secs)}s"></i>`).join('');
  const fx = m.win ? `<div class="fx">${dots(70, 4, [0.35, 0.6], 9)}</div>`
    : `<div class="glow"></div><div class="fx sparks">${dots(64, 4, [0.55, 0.45], 6, [25, 75])}</div><div class="fx">${dots(80, 3, [0.25, 0.45], 12)}</div>`;
  const crack = `<svg class="crack" viewBox="0 0 200 200" width="104" height="104" aria-hidden="true"><path d="M96 4 L104 46 L88 70 L110 98 L92 128 L106 160 L98 196" fill="none" stroke="#120d0a" stroke-width="6" stroke-linejoin="round"/><path d="M104 46 L132 58 M110 98 L140 108 M92 128 L64 140" fill="none" stroke="#120d0a" stroke-width="4"/></svg>`;
  const medal = m.win ? monSvg(m.color, '#f6edd8', 80) : monSvg('#3c4a47', '#bdb4a3', 80) + crack;
  const clan = c => {
    const up = !c.out, glow = up && !m.win;
    const icon = glow ? monSvg(c.color, '#f0e8d6', 52, `style="filter:drop-shadow(0 0 10px ${esc(c.color)})"`)
      : monSvg('#2a2622', m.win ? '#8d877c' : '#7d776c', 52, m.win ? `style="filter:drop-shadow(0 0 6px ${esc(c.color)})"` : '');
    return `<div class="fc${glow ? ' up' : ''}" style="--rc:${esc(c.color)}"><div class="fm">${icon}${m.win ? `<span class="ring" style="border-color:${esc(c.color)}"></span>` : ''}${c.out ? '<span class="slash"></span>' : ''}</div><div><b>${esc(c.name)}</b><span>${esc(c.sub)}</span></div></div>`;
  };
  return `<style>${CSS}</style><div class="shade"></div>${m.win ? '<div class="rays"></div>' : ''}${fx}
    <div class="stage"><div class="medal">${medal}</div>
    <div class="eyebrow">${esc(m.eyebrow)}</div><h1>${esc(m.title)}</h1><div class="sub">${esc(m.sub)}</div><div class="rule"></div>
    <div class="clans">${m.rivals.map(clan).join('')}</div>
    <div class="stats">${m.stats.map(([v, l]) => `<div class="st"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
    <div class="btns">${m.buttons.map(([a, label, go]) => `<button data-end="${a}"${go ? ' class="go"' : ''}>${esc(label)}</button>`).join('')}</div></div>`;
}

// the castle the shot is of: yours (victory) or the one you lost (defeat)
export function endCastle(game, m) {
  const set = Object.values(game.state.frontier?.settlements || {}).filter(s => s.castle);
  return (m.win ? null : set.find(s => s.fallen?.from === m.me)) || set.find(s => s.owner === m.me) || null;
}

export function createCampaignEnd({ game, root, view = null, hero = () => null, toMenu = () => location.reload() }) {
  let shownFor = null, dismissed = null, shot = false, zoomBack = 1;
  root.id = 'campaignend'; root.hidden = true;
  // the camera: look a little below the castle so it sits above the words, and drift slowly side to side
  function frame(m) {
    const c = view && endCastle(game, m); if (!c || !view.screenToGround) return;
    if (hero()?.place !== 'world') view.setWarWatch?.(true, c.x, c.z);
    // ground units per screen pixel: measured along the screen-right line (a raised terrace only shifts a point along the
    // view ray, which is square to it); a pixel down the screen is 1 / sin(elevation) of that on the ground
    const W = innerWidth, H = innerHeight, a = view.screenToGround(W / 2 - 200, H / 2), b = view.screenToGround(W / 2 + 200, H / 2);
    const u0 = a && b ? Math.abs((b.x - a.x) * SCREEN_RIGHT.x + (b.z - a.z) * SCREEN_RIGHT.z) / 400 : 0; if (!(u0 > 0)) return;
    // zoom out far enough to see the whole castle (the island allows further out than the city); put it back on close
    const was = 1 / (PPU * u0), want = hero()?.place === 'world' ? SHOT_ZOOM : Math.max(SHOT_ZOOM, 0.35);
    view.zoomBy?.(want / was); zoomBack = was / want;
    const u = view.zoomBy ? 1 / (PPU * want) : u0;
    const lift = H * 0.1 * u / Math.sin(ELEVATION), sway = W * 0.06 * u, t0 = performance.now();
    const base = { x: c.x + SCREEN_DOWN.x * lift, z: c.z + SCREEN_DOWN.z * lift };
    view.watch(() => { const k = Math.sin((performance.now() - t0) / 1000 * 0.09) * sway;
      return { x: base.x + SCREEN_RIGHT.x * k, z: base.z + SCREEN_RIGHT.z * k, place: 'world' }; });
    view.setUnitOverlays?.(false); shot = true;
  }
  function unframe() {
    document.body.classList.remove('campaign-end');
    if (!shot) return; shot = false;
    view.watch(null); view.snapBack?.(); view.setUnitOverlays?.(true); view.zoomBy?.(zoomBack); zoomBack = 1;
  }
  const close = () => { root.hidden = true; root.innerHTML = ''; shownFor = null; unframe(); };
  root.addEventListener('click', e => {
    const b = e.target.closest?.('button[data-end]'); if (!b) return;
    if (b.dataset.end === 'keep') { dismissed = game.state.campaignEnd?.tick ?? null; close(); }
    else toMenu();
  });
  for (const t of ['mousedown', 'mouseup', 'contextmenu', 'wheel']) root.addEventListener(t, ev => { ev.stopPropagation(); if (t === 'contextmenu') ev.preventDefault(); });
  function update() {
    const end = game.state.campaignEnd;
    if (!end || end.tick === dismissed) { if (!root.hidden) close(); return; }
    if (shownFor === end.tick) return;
    const m = endModel(game); if (!m) return;
    root.className = m.win ? 'win' : 'loss'; root.style.setProperty('--c', m.color);
    root.innerHTML = endHtml(m); root.hidden = false; shownFor = end.tick;
    document.body.classList.add('campaign-end'); frame(m);
  }
  return { update, isOpen: () => !root.hidden };
}
