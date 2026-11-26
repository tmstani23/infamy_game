// View a town (Tim 2026-11-25): look at one of your own frontier towns from wherever your hero is, like Watch the
// city. Presentation only, per player: each client looks at its own hero's towns (owner = the hero's clan), so every
// human player has it. The camera goes to the town (render/view.js setWarWatch: the island at x, z), the hero stays
// put and takes no orders or movement meanwhile (movement, viewCommands).
// Tim 2026-11-25 (later): while viewing you run the town as if your hero were there: its town menu, building menus,
// building, workers and orders to your troops and crew out on the island. Orders carry view: <town id> so the sim lets
// island units take them with the hero elsewhere (sim/crew_orders.js, sim/frontier/structures.js); the hero is taken
// out of every command, and his own actions (attack, mount, loot...) and city orders stay blocked. The capital rule
// (Tim 2026-11-08: boss on the island, no city crew orders) is unchanged.
// Opened from the View button on a row of Your towns (Y), or by clicking your town on the World map and confirming.
// Home, the banner button, the hero being hurt, falling or the town being lost end it. Rival towns cannot be viewed
// (Tim 2026-11-25: free viewing would scout them).
// viewableTown, viewCommands, confirmHtml and bannerHtml are pure (the Node test uses them).
import { WATCH_BLOCKED } from './city_watch.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// the town's ground point, or null: own, founded frontier town (not the capital) with a known spot
export function viewableTown(state, sites, owner, id) {
  const t = state?.frontier?.settlements?.[id];
  if (!t || owner == null || t.owner !== owner || t.capital) return null;
  const s = sites?.[t.site ?? ''];
  const x = Number.isFinite(t.x) ? t.x : s?.x, z = Number.isFinite(t.z) ? t.z : s?.z;
  return Number.isFinite(x) && Number.isFinite(z) ? { id, name: t.name || 'your town', x, z } : null;
}
// while viewing: city and hero-only commands are dropped (as Watch the city, but orders pass); every command loses the
// hero (he waits where he stands) and orders are stamped with the viewed town
// Recall and Take out (garage) work too (Tim 2026-11-26: the stable tab's Recall did nothing while viewing)
const VIEW_BLOCKED = new Set([...WATCH_BLOCKED, 'attackmode'].filter(t => t !== 'order' && t !== 'garage'));
export function viewCommands(list, heroId, townId) {
  const out = [];
  for (const c of list) {
    if (VIEW_BLOCKED.has(c.type)) continue;
    let d = c;
    if (Array.isArray(c.units) && c.units.includes(heroId)) d = { ...d, units: c.units.filter(id => id !== heroId) };
    if (d.hero) d = { ...d, hero: false };
    if (c.type === 'order') {
      if (d.kind === 'follow' || !d.units?.length) continue;   // nothing left to send, or "follow the hero" (he is not here)
      d = { ...d, place: 'world', view: townId };
    }
    out.push(d);
  }
  return out;
}
export const confirmHtml = name => `<div class="tv-head"><b>View ${esc(name)}?</b></div>`
  + '<div class="tv-sub">The camera goes there and you run the town as if your boss were there. He waits where he stands until you return.</div>'
  + '<div class="tv-acts"><button type="button" class="tv-go" data-tv="view">View</button><button type="button" class="tv-x" data-tv="cancel">Cancel</button></div>';
export const bannerHtml = name => `<span><b>Viewing ${esc(name)}</b><i>run it from here, your boss stays put</i></span><button type="button" data-back="1" title="Home also returns">Return to hero</button>`;

// lantern style (Tim 2026-11-23): lacquered wood plaques with brass corners, warm light from above, no web pills
const GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='160'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.006 0.11' numOctaves='3' seed='7'/><feColorMatrix values='0 0 0 0 0.2  0 0 0 0 0.12  0 0 0 0 0.06  0 0 0 .55 0'/></filter><rect width='400' height='160' filter='url(%23g)'/></svg>\")";
const FIBER = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='3'/><feColorMatrix values='0 0 0 0 0.45  0 0 0 0 0.35  0 0 0 0 0.2  0 0 0 .22 0'/></filter><rect width='200' height='200' filter='url(%23p)'/></svg>\")";
export const TOWN_VIEW_CSS = `
#townviewask,#townview{font-family:var(--ln-font,Georgia,serif);color:#e8d9b0}
#townviewask{position:fixed;z-index:400;width:290px;max-width:calc(100vw - 16px);box-sizing:border-box;padding:13px 15px 14px;
 background:radial-gradient(ellipse at 20% 30%,rgba(255,170,80,.2) 0%,transparent 55%),radial-gradient(ellipse at 50% 120%,rgba(0,0,0,.45),transparent 60%),${GRAIN},linear-gradient(180deg,#30241b,#1a1310);border:2px solid #0e0b09;
 box-shadow:inset 0 0 0 1px #8a6a3e,inset 0 0 0 3px #1a1411,inset 0 0 0 4px #4a3826,inset 0 0 26px rgba(255,170,80,.10),0 10px 26px #000c,0 0 34px rgba(255,150,60,.16)}
#townviewask[hidden],#townview[hidden]{display:none}
#townviewask::before{content:"";position:absolute;right:100%;top:var(--tail,40px);margin-top:-9px;border:9px solid transparent;border-left-width:0;border-right-color:#8a6a3e}
#townviewask.flip::before{right:auto;left:100%;border-left-width:9px;border-right-width:0;border-right-color:transparent;border-left-color:#8a6a3e}
#townviewask .tv-head b{font-size:20px;font-weight:700;color:#f6e6bc;text-shadow:0 1px 0 #000,0 0 14px rgba(255,170,80,.45)}
#townviewask .tv-sub{margin:7px 0 13px;font-size:15px;color:#e8d9b0;line-height:1.35}
#townviewask .tv-acts{display:flex;gap:10px;align-items:stretch}#townviewask .tv-acts button{height:38px}
#townviewask button,#townview button,#townsoverview button.tv-row{font:700 14px var(--ln-font,Georgia,serif);border:none;border-radius:2px;color:#ead3a6;cursor:pointer;padding:7px 13px;
 background:linear-gradient(180deg,rgba(255,220,170,.10),rgba(0,0,0,.25)),${GRAIN},linear-gradient(180deg,#4e3523,#26180f);
 box-shadow:0 0 0 2px #0a0604,inset 0 0 0 1px rgba(217,173,94,.75),inset 0 2px 0 rgba(255,220,170,.28),inset 0 -3px 0 rgba(0,0,0,.45),0 3px 0 #0a0604;color:#f0d9a8}
#townviewask button:hover,#townview button:hover,#townsoverview button.tv-row:hover{background:linear-gradient(180deg,rgba(255,200,130,.18),rgba(0,0,0,.2)),${GRAIN},linear-gradient(180deg,#6b4b30,#3a2718);color:#ffe6b8}
#townviewask button.tv-go{flex:1;font-size:16px;padding:8px 13px;color:#22150b;text-shadow:0 1px 0 rgba(255,230,180,.35);background:${GRAIN},linear-gradient(180deg,#e9cc88 0%,#c69a4f 40%,#8f6127 70%,#a87b3d 100%);
 box-shadow:0 0 0 2px #0a0604,inset 0 0 0 1px #5a3a16,inset 0 2px 0 rgba(255,240,200,.45),inset 0 -3px 0 rgba(60,35,10,.5),0 3px 0 #2b1c0c,0 0 14px rgba(255,160,60,.35)}
#townviewask button.tv-go:hover{background:${GRAIN},linear-gradient(180deg,#f5daa0 0%,#d6aa5c 40%,#a06e30 70%,#ba8a48 100%);color:#1c1209;box-shadow:0 0 0 2px #0a0604,inset 0 1px 0 rgba(255,245,215,.6),0 3px 0 #2b1c0c,0 0 22px rgba(255,180,80,.6)}
#townviewask button.tv-x{flex:.6;padding:8px 13px;font-size:16px}
#townsoverview button.tv-row{min-width:84px;height:32px;padding:0 16px;font-size:15px}
#townview{position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:18px;padding:10px 12px 10px 20px;max-width:calc(100vw - 40px);
 background:radial-gradient(ellipse at 50% -20%,rgba(255,176,90,.22),transparent 65%),${GRAIN},linear-gradient(180deg,#30241b,#1a1310);border:2px solid #0e0b09;
 box-shadow:inset 0 0 0 1px #8a6a3e,inset 0 0 0 3px #1a1411,inset 0 0 0 4px #4a3826,0 8px 22px #000b,0 0 30px rgba(255,160,70,.14);font-size:16px}
#townview::before,#townview::after{content:"";position:absolute;top:-14px;width:3px;height:14px;background:linear-gradient(#0e0b09,#4a3826)}
#townview::before{left:22%}#townview::after{right:22%}
#townview b{font-weight:700;font-size:17px;color:#f6e6bc}#townview span i{font-style:italic;font-size:15px;color:#d8c49c;margin-left:8px}
body.town-viewing::after{content:"";position:fixed;inset:0;z-index:55;pointer-events:none;box-shadow:inset 0 0 0 3px rgba(201,160,90,.45),inset 0 0 90px rgba(201,160,90,.18)}
`;

export function createTownView({ game, view, heroId, sites = null, notify = () => {}, sound = null, askHost = () => true, onStart = () => {} }) {
  const off = { viewing: () => null, start: () => false, end() {}, ask() {}, canView: () => false, isOn: () => false, update() {}, filterCommands: l => l, movement: m => m, rowButton: () => '' };
  if (typeof document === 'undefined') return off;
  const siteOf = Object.fromEntries((Array.isArray(sites) ? sites : []).map(s => [s.id, s]));
  const style = document.createElement('style'); style.textContent = TOWN_VIEW_CSS; document.head.append(style);
  const ask = document.createElement('div'); ask.id = 'townviewask'; ask.hidden = true; document.body.append(ask);
  const banner = document.createElement('div'); banner.id = 'townview'; banner.hidden = true; document.body.append(banner);
  const hero = () => game.state.entities[heroId];
  const town = id => viewableTown(game.state, siteOf, hero()?.owner, id);
  let on = null, lastHp = null, asking = null;

  const canView = id => { const h = hero(); return !!h && !h.dead && !h.downed && !!town(id); };
  function start(id) {
    hideAsk();
    if (!canView(id) || !view.setWarWatch) { notify('You cannot view that town now', 'loss', 2500); return false; }
    if (on) end();
    onStart(); const t = town(id); on = id; lastHp = hero().hp;
    sound?.clip?.('Audio/bookOpen', 0.5);   // unrolling a map, as Watch the city
    view.setWarWatch(true, t.x, t.z, () => end(false));
    banner.innerHTML = bannerHtml(t.name); banner.hidden = false; document.body.classList.add('town-viewing');
    return true;
  }
  // back to the hero; Home (view.snapBack) lands here too through the exit callback
  function end(tellView = true) {
    if (!on) return; on = null;
    sound?.clip?.('ability_dash_1', 0.3, 1.25);
    banner.hidden = true; document.body.classList.remove('town-viewing');
    if (tellView) view.setWarWatch(false);
    view.snapBack();
  }
  function hideAsk() { asking = null; ask.hidden = true; }
  // the small confirm beside the cursor (World map click on your town)
  function showAsk(id, cx = innerWidth / 2, cy = innerHeight / 2) {
    const t = town(id); if (!t) return false;
    asking = id; ask.innerHTML = confirmHtml(t.name); ask.hidden = false;
    const w = ask.offsetWidth || 280, hgt = ask.offsetHeight || 120;
    const flip = cx + 18 + w > innerWidth - 8, left = flip ? Math.max(8, cx - 18 - w) : cx + 18;   // beside the click, tail pointing at it
    const top = Math.max(8, Math.min(innerHeight - hgt - 8, cy - 40));
    ask.classList.toggle('flip', flip); ask.style.left = `${left}px`; ask.style.top = `${top}px`;
    ask.style.setProperty('--tail', `${Math.max(16, Math.min(hgt - 16, cy - top))}px`);
    return true;
  }
  ask.addEventListener('click', e => {
    const b = e.target.closest?.('[data-tv]'); if (!b) return;
    const id = asking; hideAsk();
    if (b.dataset.tv === 'view') start(id);
  });
  banner.addEventListener('click', e => { if (e.target.closest?.('[data-back]')) end(); });
  for (const el of [ask, banner]) for (const ev of ['pointerdown', 'mousedown', 'mouseup', 'contextmenu', 'wheel']) el.addEventListener(ev, e => e.stopPropagation());
  addEventListener('pointerdown', e => { if (asking && !ask.contains(e.target)) hideAsk(); }, { capture: true });   // a click elsewhere drops the question
  addEventListener('keydown', e => { if (asking && e.code === 'Escape') { hideAsk(); e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true });

  return {
    start, end, canView, isOn: () => !!on, viewing: () => on, hideAsk,
    ask: (id, cx, cy) => showAsk(id, cx, cy),
    // the View button on a Your towns row (towns_overview.js); empty when this town cannot be viewed
    rowButton: id => canView(id) ? `<button type="button" class="tv-row" data-view="${esc(id)}" title="Look at this town from where you are. Home comes back.">View</button>` : '',
    update() {
      if (asking && (!town(asking) || !askHost())) hideAsk();   // the map closed (M, Esc) or the town is gone: drop the question
      if (!on) return;
      const h = hero(), t = town(on);
      if (!t) { end(); notify('That town is no longer yours', 'loss', 4000); return; }
      if (!h || h.dead || h.downed || !view.isWarWatch?.() || !view.isPanned()) { end(); return; }
      if (h.hp < lastHp - 0.5) { end(); notify('Your boss is under attack! Back to the hero.', 'alert', 5000); sound?.bell?.(); return; }
      lastHp = h.hp;
    },
    // viewing: town, building and island orders go through without the hero; no hero movement (viewCommands)
    filterCommands: list => on ? viewCommands(list, heroId, on) : list,
    movement: m => on && m ? { ...m, right: 0, down: 0 } : m,
  };
}
