// War alert and "Watch a war" (war 8d-4, mock OK'd by Tim 2026-11-16): presentation only.
// Alert: when a war is declared on one of your towns a card shows at the top of the screen wherever your hero is (the
// city too), with a bell and a map ping. Its buttons: Watch and Show on map.
// Watch: the camera goes to a war of yours that your hero is not in (render/view.js setWarWatch), like Watch the
// city. No orders and no hero movement leave this client meanwhile (filterCommands, movement); only your general's
// settings and surrender answers pass. Esc, Home, the banner button, the hero being hurt or walking into the war end it.
// alertHtml and watchLine are pure (the Node test and the mock use them).
import { STRATEGY_NAMES } from './war_general_tab.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// frontier commands that still pass while watching: the general's settings and the surrender window
export const WATCH_ALLOWED = new Set(['warStrategy', 'warKeep', 'warAnswer', 'warOffer', 'warOutcome', 'warLeave']);
export const WAR_WATCH_CSS = `
#waralert{position:fixed;left:50%;top:176px;transform:translateX(-50%);z-index:59;width:520px;max-width:calc(100vw - 40px);box-sizing:border-box;border:1px solid #c9473d;border-radius:8px;background:linear-gradient(90deg,#3a1512,#14181c 70%);box-shadow:0 0 22px #c9473d66,0 10px 30px #000a;padding:12px 14px;display:grid;grid-template-columns:64px 1fr auto;gap:12px;align-items:center;color:#eadfc6;font:13px system-ui,sans-serif}
#waralert[hidden]{display:none}
#waralert img{height:64px;max-width:64px;object-fit:contain;filter:drop-shadow(0 4px 6px #000)}
#waralert b{font-size:17px;color:#ffe9dc;display:block;font-weight:600}#waralert .small{font-size:12px;color:#d9b9b0;margin-top:2px}
#waralert .btns{display:flex;flex-direction:column;gap:6px}
#waralert button,#warwatch button{border:1px solid #61543e;border-radius:5px;background:#20262d;color:#eadfc6;padding:5px 11px;font:600 12px system-ui;cursor:pointer}
#waralert button:hover,#warwatch button:hover{border-color:#ffe0a1}
#waralert button.go{border-color:#e07b6c;background:linear-gradient(#8e2d26,#5e1c18);color:#ffe9dc}
#warwatch{position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:16px;padding:9px 16px;max-width:calc(100vw - 40px);background:#14130fee;border:1px solid #826f4c;border-top:2px solid #c9473d;border-radius:8px;color:#f3e3bd;font:13px system-ui,sans-serif;box-shadow:0 6px 22px #000a}
#warwatch[hidden]{display:none}#warwatch b{font-weight:600}
body.war-watching::after{content:"";position:fixed;inset:0;z-index:55;pointer-events:none;box-shadow:inset 0 0 0 3px #c9473d88,inset 0 0 90px #c9473d33}
`;
// a = { town, foe, general: bool (your general runs it now), muster: seconds left or 0, watch: bool, art }
export function alertHtml(a) {
  const lead = `${esc(a.foe || 'A rival clan')} planted a war banner by your town.`;
  const who = a.general ? 'Your general is in command.' : 'You are in command.';
  const muster = a.muster > 0 ? ` Training opens in ${mmss(a.muster)}.` : '';
  return `${a.art ? `<img src="${esc(a.art)}" alt="">` : '<span></span>'}<div><b>War on ${esc(a.town || 'your town')}</b><div class="small">${lead} ${who}${muster}</div></div>
    <div class="btns">${a.watch ? '<button class="go" data-watch="1" title="Look at the war from where you are. You give no orders while you watch.">Watch</button>' : ''}<button data-map="1" title="Open the map on this town">Show on map</button><button data-x="1">Close</button></div>`;
}
// w = { town, strategy, general: bool, attacking: bool }
export function watchLine(w) {
  return `<span><b>Watching the ${w.attacking ? 'siege of' : 'war on'} ${esc(w.town || 'the town')}.</b> ${w.general ? `Your general is in command (${esc(STRATEGY_NAMES[w.strategy] || w.strategy || 'Siege')}).` : 'Nobody is in command.'} You give no orders from here.</span><button type="button" data-back="1">Back to hero (Esc)</button>`;
}

export function createWarWatch({ game, view, heroId, catalog = null, frontierData = null, notify = () => {}, sound = null, ping = () => {}, showOnMap = () => false, busy = () => false, onStart = () => {}, alertSeconds = 25 }) {
  const off = { start: () => false, end() {}, canWatch: () => false, isOn: () => false, watching: () => null, update() {}, filterCommands: l => l, movement: m => m };
  if (typeof document === 'undefined') return off;
  const style = document.createElement('style'); style.textContent = WAR_WATCH_CSS; document.head.append(style);
  const alert = document.createElement('div'); alert.id = 'waralert'; alert.hidden = true; document.body.append(alert);
  const banner = document.createElement('div'); banner.id = 'warwatch'; banner.hidden = true; document.body.append(banner);
  const hero = () => game.state.entities[heroId];
  const wars = () => game.state.frontier?.wars?.list || {};
  const townOf = w => game.state.frontier?.settlements?.[w?.town] || null;
  const R = () => game.frontier?.war?.data?.circleRadius ?? frontierData?.war?.circleRadius ?? 900;
  const general = () => game.frontier?.warGeneral;
  const art = (() => { const n = frontierData?.townArt?.war_banner || 'war_banner', kind = catalog?.items?.[n]?.kind || 'buildings'; return `art/${kind}/${n}.png`; })();
  const inside = (h, w) => { const t = townOf(w); return !!h && !!t && h.place === 'world' && Math.hypot(h.x - t.x, h.z - t.z) <= R(); };
  let on = null, lastHp = null, seen = null, shown = null, shownUntil = 0, alertSig = '', bannerSig = '';

  function canWatch(id) {
    const h = hero(), w = wars()[id];
    return !!h && !!w && !h.dead && !h.downed && (w.attacker === h.owner || w.defender === h.owner) && !!townOf(w) && !inside(h, w);
  }
  const spot = w => { const t = townOf(w), me = hero()?.owner; return w.attacker === me && Number.isFinite(w.camp?.x) ? { x: w.camp.x, z: w.camp.z } : { x: t.x, z: t.z }; };
  function start(id) {
    if (on === id) return true;
    if (!canWatch(id) || !view.setWarWatch) return false;
    if (on) end();
    onStart(); on = id; lastHp = hero().hp; bannerSig = '';
    const p = spot(wars()[id]);
    sound?.clip?.('Audio/bookOpen', 0.5);
    view.setWarWatch(true, p.x, p.z, () => end(false));
    banner.hidden = false; document.body.classList.add('war-watching'); alert.hidden = true; shown = null;
    return true;
  }
  // back to the hero; Home (view.snapBack) lands here too through the exit callback
  function end(tellView = true) {
    if (!on) return; on = null;
    sound?.clip?.('ability_dash_1', 0.3, 1.25);
    banner.hidden = true; document.body.classList.remove('war-watching');
    if (tellView) view.setWarWatch(false);
    view.snapBack();
  }
  banner.addEventListener('click', e => { if (e.target.closest?.('[data-back]')) end(); });
  alert.addEventListener('click', e => {
    const b = e.target.closest?.('button'); if (!b) return;
    const id = shown, w = wars()[id], t = townOf(w);
    if (b.dataset.watch) { if (!start(id)) notify('You cannot watch that war from here', 'loss', 2500); }
    else if (b.dataset.map && t) { showOnMap(t.x, t.z); ping(t.x, t.z); }
    alert.hidden = true; shown = null;
  });
  for (const el of [alert, banner]) for (const ev of ['pointerdown', 'mousedown', 'wheel']) el.addEventListener(ev, e => e.stopPropagation());
  addEventListener('keydown', e => { if (on && e.code === 'Escape' && !busy() && !e.target?.closest?.('input,select,textarea')) { end(); e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true });

  function update() {
    const h = hero(), me = h?.owner, list = wars(), ids = Object.keys(list), now = game.state.tick;
    // new wars on a town of yours: the alert card, the bell and the ping (wars already on at load stay quiet)
    if (seen === null) seen = new Set(ids);
    for (const id of ids) if (!seen.has(id)) {
      seen.add(id); const w = list[id], t = townOf(w);
      if (!me || w.defender !== me || !t) continue;
      shown = id; shownUntil = now + alertSeconds * 20; alertSig = '';
      sound?.bell?.(); ping(t.x, t.z);
    }
    if (shown) {
      const w = list[shown], t = townOf(w);
      if (!w || !t || now > shownUntil || on) { shown = null; alert.hidden = true; }
      else {
        const muster = game.frontier?.war?.defense?.view?.(w.id)?.muster || 0;
        const a = { town: t.name, foe: game.state.clans?.[w.attacker]?.name, general: !!general()?.runs?.(w, me), muster, watch: canWatch(shown), art };
        const sig = JSON.stringify(a);
        if (sig !== alertSig) { alert.innerHTML = alertHtml(a); alertSig = sig; }
        alert.hidden = false;
      }
    }
    if (!on) return;
    const w = list[on];
    if (!w) { end(); notify('The war is over', 'news', 3000); return; }
    if (!h || h.dead || h.downed || inside(h, w) || !view.isWarWatch?.() || !view.isPanned()) { end(); return; }
    if (h.hp < lastHp - 0.5) { end(); notify('Your boss is under attack! Back to the hero.', 'alert', 5000); sound?.bell?.(); return; }
    lastHp = h.hp;
    const line = watchLine({ town: townOf(w)?.name, strategy: general()?.strategyOf?.(me), general: !!general()?.runs?.(w, me), attacking: w.attacker === me });
    if (line !== bannerSig) { banner.innerHTML = line; bannerSig = line; }
  }
  return {
    start, end, canWatch, isOn: () => !!on, watching: () => on, update,
    // watching only: nothing but the general's settings and surrender answers leaves this client
    filterCommands: list => on ? list.filter(c => c.type === 'frontier' && WATCH_ALLOWED.has(c.action)) : list,
    movement: m => on && m ? { ...m, right: 0, down: 0 } : m,
  };
}
