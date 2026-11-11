// "While I'm away" page in the Deployment window (frontier C3, Tim 2026-11-02/05). Campaign only.
// Standing order toggles, a daily budget slider and the lieutenant's last 20 log lines. Sends only
// { type: 'lieutenant', orders | budget | defendAtHome }; the rules are in sim/lieutenant.js.
const LABELS = { defend: 'Defend raids', retake: 'Buy back lost businesses', shakedown: 'Shakedowns', sweep: 'Sweeps', contracts: 'Ambush contracts', hire: 'Hire crew',
  buy: 'Buy free businesses (one a day)', jobs: 'Shinobi jobs: Scout, Sabotage or Thin out the bandits (one a day)', steal: 'Steal contracts (one a night)',
  raid: 'Raid rival businesses at night (War Lantern from the treasury, with a Rally)' };
// Tim 2026-11-06: Buy is for clans that own businesses; Jobs and Steal for the Shinobi
const FOR_NINJA = { buy: false, jobs: true, steal: true, raid: false };
import { lieutenantPortrait } from './lieutenant_portrait.js';
export function createLieutenantPanel({ root, game, heroId, send, cityWatch = null }) {
  const L = () => game.lieutenant, tabs = root.querySelector('.page-tabs'), work = root.querySelector('.workspace');
  if (!tabs || !work) return { update() {} };
  const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'show-away'; tab.textContent = "While I'm away";
  const pane = document.createElement('section'); pane.className = 'pane-away';
  pane.innerHTML = '<div class="lt-head"><img class="lt-portrait" alt=""><h4>While I&#39;m away</h4></div><p class="away-status"></p><button type="button" class="away-watch">Watch the city</button><div class="away-orders"></div>'
    // a typeable box and Set (Tim 2026-11-10: no sliders; Set also completes the goal step when the number is unchanged)
    + '<div class="away-budget-row">Budget <input class="away-budget" type="number" min="0" step="50" inputmode="numeric" title="What your lieutenant may spend each day"> ryo a day <button type="button" class="away-budget-set" title="Set the daily budget">Set</button><span class="away-budget-value" hidden></span></div>'
    + '<label><input class="away-home" type="checkbox"> Keep defending when I&#39;m back</label><h4>Log</h4><ol class="away-log"></ol>';
  tabs.appendChild(tab); work.appendChild(pane);
  const style = document.createElement('style');
  style.textContent = '#deploymentpanel:not([data-page="away"]) .pane-away{display:none}#deploymentpanel .pane-away label{display:block;margin:4px 0}#deploymentpanel .away-budget-row{margin:4px 0}#deploymentpanel .away-budget{width:6em}#deploymentpanel .away-log{max-height:160px;overflow-y:auto;font-size:11px;padding-left:18px}';
  document.head.appendChild(style);
  tab.addEventListener('click', () => {
    root.dataset.page = 'away';
    for (const b of tabs.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === tab));
    shown = ''; update();
  });
  for (const b of tabs.querySelectorAll('button')) if (b !== tab) b.addEventListener('click', () => tab.setAttribute('aria-pressed', 'false'));
  const owner = () => game.state.entities[heroId]?.owner;
  const boxes = Object.fromEntries(Object.entries(LABELS).map(([k, label]) => {
    const l = document.createElement('label'), c = document.createElement('input'); c.type = 'checkbox';
    c.addEventListener('change', () => send({ id: heroId, type: 'lieutenant', orders: { [k]: c.checked } }));
    if (k === 'hire') l.title = 'The captain hires one of each of your clan units in turn and keeps the mix even. He waits for the money rather than buy thugs, unless the city is down to a couple of crew or your budget is too small for a real unit. Thugs get swapped for a better unit once he can pay. He also bails out jailed crew and fetches crew from the clinic.';
    l.append(c, ' ' + label); pane.querySelector('.away-orders').appendChild(l); return [k, c];
  }));
  const budget = pane.querySelector('.away-budget'), home = pane.querySelector('.away-home');
  const setBudget = () => { const max = Number(budget.max) || 2000, v = Math.max(0, Math.min(max, Math.round(Number(budget.value) || 0))); budget.value = String(v); send({ id: heroId, type: 'lieutenant', budget: v }); budget.blur(); };
  pane.querySelector('.away-budget-set').addEventListener('click', setBudget);
  budget.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') setBudget(); });
  budget.addEventListener('input', () => { pane.querySelector('.away-budget-value').textContent = budget.value; });
  home.addEventListener('change', () => send({ id: heroId, type: 'lieutenant', defendAtHome: home.checked }));
  const watchBtn = pane.querySelector('.away-watch');
  watchBtn.addEventListener('click', () => { cityWatch?.start(); });
  let shown = '';
  function update() {
    const on = !!L() && game.state.match && game.lieutenant && (game.state.lieutenants || L().away);
    tab.hidden = !game.settings || !game.state.lieutenants && !L()?.away(owner());
    watchBtn.hidden = !cityWatch; watchBtn.disabled = !cityWatch?.canWatch();
    watchBtn.title = watchBtn.disabled ? 'Available while your boss is out on the island' : 'Move the camera to the city; your boss stays here';
    if (root.dataset.page !== 'away' || root.hidden || !on) return;
    const r = game.state.lieutenants?.[owner()];
    if (!r) { pane.querySelector('.away-status').textContent = 'Your lieutenant takes over when you leave the city.'; return; }
    const key = JSON.stringify([r.orders, r.budget, r.defendAtHome, r.spent, r.log.length, r.log.at(-1)?.tick, L().away(owner())]);
    if (key === shown) return; shown = key;
    const ninja = game.state.clans?.[owner()]?.kind === 'ninja';
    const pic = pane.querySelector('.lt-portrait'), src = lieutenantPortrait(game.state.clans?.[owner()]);
    if (pic.getAttribute('src') !== src) pic.setAttribute('src', src);
    for (const [k, c] of Object.entries(boxes)) { c.parentElement.hidden = k in FOR_NINJA && FOR_NINJA[k] !== ninja; if (document.activeElement !== c) c.checked = !!r.orders[k]; }
    budget.max = String(game.settings.lieutenantMax ?? 2000);
    if (document.activeElement !== budget) { budget.value = String(r.budget); pane.querySelector('.away-budget-value').textContent = r.budget; }
    home.checked = !!r.defendAtHome;
    pane.querySelector('.away-status').textContent = L().away(owner()) ? `You are away: the city captain holds the HQ. Spent today ${r.spent} of ${r.budget} ryo.` : 'You are in the city. Your lieutenant takes over when you leave.';
    const ol = pane.querySelector('.away-log'); ol.replaceChildren(...r.log.slice().reverse().map(x => { const li = document.createElement('li'); li.textContent = `Day ${x.day}: ${x.text}`; return li; }));
  }
  return { update };
}
