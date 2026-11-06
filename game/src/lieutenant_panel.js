// "While I'm away" page in the Deployment window (frontier C3, Tim 2026-11-02/05). Campaign only.
// Standing order toggles, a daily budget slider and the lieutenant's last 20 log lines. Sends only
// { type: 'lieutenant', orders | budget | defendAtHome }; the rules are in sim/lieutenant.js.
const LABELS = { defend: 'Defend raids', retake: 'Buy back lost businesses', shakedown: 'Shakedowns', sweep: 'Sweeps', contracts: 'Ambush contracts', hire: 'Hire crew',
  buy: 'Buy free businesses (one a day)', jobs: 'Shinobi jobs: Scout or Thin out the bandits (one a day)', steal: 'Steal contracts (one a night)' };
// Tim 2026-11-06: Buy is for clans that own businesses; Jobs and Steal for the Shinobi
const FOR_NINJA = { buy: false, jobs: true, steal: true };
export function createLieutenantPanel({ root, game, heroId, send }) {
  const L = () => game.lieutenant, tabs = root.querySelector('.page-tabs'), work = root.querySelector('.workspace');
  if (!tabs || !work) return { update() {} };
  const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'show-away'; tab.textContent = 'While I’m away';
  const pane = document.createElement('section'); pane.className = 'pane-away';
  pane.innerHTML = '<h4>While I’m away</h4><p class="away-status"></p><div class="away-orders"></div>'
    + '<label>Budget <input class="away-budget" type="range" min="0" step="50"> <span class="away-budget-value"></span> ryo a day</label>'
    + '<label><input class="away-home" type="checkbox"> Keep defending when I’m back</label><h4>Log</h4><ol class="away-log"></ol>';
  tabs.appendChild(tab); work.appendChild(pane);
  const style = document.createElement('style');
  style.textContent = '#deploymentpanel:not([data-page="away"]) .pane-away{display:none}#deploymentpanel .pane-away label{display:block;margin:4px 0}#deploymentpanel .away-log{max-height:160px;overflow-y:auto;font-size:11px;padding-left:18px}';
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
    l.append(c, ' ' + label); pane.querySelector('.away-orders').appendChild(l); return [k, c];
  }));
  const budget = pane.querySelector('.away-budget'), home = pane.querySelector('.away-home');
  budget.addEventListener('change', () => send({ id: heroId, type: 'lieutenant', budget: Number(budget.value) }));
  budget.addEventListener('input', () => { pane.querySelector('.away-budget-value').textContent = budget.value; });
  home.addEventListener('change', () => send({ id: heroId, type: 'lieutenant', defendAtHome: home.checked }));
  let shown = '';
  function update() {
    const on = !!L() && game.state.match && game.lieutenant && (game.state.lieutenants || L().away);
    tab.hidden = !game.settings || !game.state.lieutenants && !L()?.away(owner());
    if (root.dataset.page !== 'away' || root.hidden || !on) return;
    const r = game.state.lieutenants?.[owner()];
    if (!r) { pane.querySelector('.away-status').textContent = 'Your lieutenant takes over when you leave the city.'; return; }
    const key = JSON.stringify([r.orders, r.budget, r.defendAtHome, r.spent, r.log.length, r.log.at(-1)?.tick, L().away(owner())]);
    if (key === shown) return; shown = key;
    const ninja = game.state.clans?.[owner()]?.kind === 'ninja';
    for (const [k, c] of Object.entries(boxes)) { c.parentElement.hidden = k in FOR_NINJA && FOR_NINJA[k] !== ninja; if (document.activeElement !== c) c.checked = !!r.orders[k]; }
    budget.max = String(game.settings.lieutenantMax ?? 2000);
    if (document.activeElement !== budget) { budget.value = String(r.budget); pane.querySelector('.away-budget-value').textContent = r.budget; }
    home.checked = !!r.defendAtHome;
    pane.querySelector('.away-status').textContent = L().away(owner()) ? `You are away: the city captain holds the HQ. Spent today ${r.spent} of ${r.budget} ryo.` : 'You are in the city. Your lieutenant takes over when you leave.';
    const ol = pane.querySelector('.away-log'); ol.replaceChildren(...r.log.slice().reverse().map(x => { const li = document.createElement('li'); li.textContent = `Day ${x.day}: ${x.text}`; return li; }));
  }
  return { update };
}
