// Ryo badge, left of the heat gauge (Tim OK'd the mock 2026-10-17): a gold ring with a mon
// coin and the clan's ryo. The number counts up toward the real amount after a gain (spending
// snaps straight down), the badge flares, and a notice like "Bandit killed +20 ryo" rises above
// it, from state.ryoGains. Renown for the same reward sits above it in purple.
import { ringRadius } from './sim/frontier/town_grid.js';
// 8e-8 (Tim 2026-11-09, mock H 2026-11-16): the badge shows the pot where the hero stands: in the city (or anywhere
// else) the Clan treasury; inside one of your towns' build rings that town's coffers; inside the circle of a war you
// fight in that side's war chest (red). The hover lists all three and the ryo on the train.
export function potAt(game, heroId) {
  const st = game.state, h = st.entities?.[heroId], me = h?.owner, clan = st.clans?.[me], F = st.frontier || {}, data = game.frontier?.data || {};
  const pots = { treasury: Math.floor(clan?.ryo || 0), kind: 'treasury', label: 'Clan treasury', ryo: Math.floor(clan?.ryo || 0) };
  if (!h || h.place !== 'world') return pots;
  const R = data.war?.circleRadius ?? 900;
  for (const w of Object.values(F.wars?.list || {})) {
    if (w.attacker !== me && w.defender !== me) continue;
    const t = F.settlements?.[w.town]; if (!t || Math.hypot(h.x - t.x, h.z - t.z) > R) continue;
    const chest = Math.floor(w.attacker === me ? w.camp?.chest || 0 : w.defense?.chest || 0);
    return { ...pots, kind: 'chest', label: 'War chest', ryo: chest, war: w, warName: `${w.attacker === me ? 'Siege' : 'Defence'} of ${t.name}` };
  }
  for (const t of Object.values(F.settlements || {})) {
    if (t.owner !== me || t.capital || !Number.isFinite(t.x)) continue;
    if (Math.hypot(h.x - t.x, h.z - t.z) <= ringRadius(t, data)) return { ...pots, kind: 'coffers', label: `${t.name} coffers`, ryo: Math.floor(t.stock?.ryo || 0), town: t };
  }
  return pots;
}
const lossLabel = (state, loss) => `${loss.reason}${loss.by ? ` · ${state.clans?.[loss.by]?.name || loss.by}` : ''}`;
export function treasuryHistory(state, clan) {
  return (clan.ryoHistory || []).slice(-6).reverse().map(l =>
    `−${l.amount} ryo · ${lossLabel(state, l)} (${l.before} → ${l.after})`).join('\n');
}
export function rewardPopups(state, clanId) {
  const gains = (state.ryoGains || []).filter(g => g.clan === clanId).map(g => ({ ...g, renown: 0 }));
  for (const n of state.news || []) {
    if (n.clan !== clanId || !['combatRenown', 'renown', 'contractDone'].includes(n.kind)) continue;
    const amount = n.kind === 'contractDone' ? n.renown : n.amount;
    if (!(amount > 0)) continue;
    const gain = gains.find(g => n.kind === 'contractDone' ? g.reason === 'Contract' : n.target != null && g.target === n.target);
    if (gain) gain.renown += amount;
    else gains.push({ clan: clanId, amount: 0, renown: amount, target: n.target, reason: n.reason || 'Contract' });
  }
  return gains.concat((state.ryoLosses || []).filter(l => l.clan === clanId && l.notify).map(l =>
    ({ ...l, amount: -l.amount, renown: 0, reason: lossLabel(state, l) })));
}

export function createRyoBadge({ root, game, heroId }) {
  root.innerHTML = `<svg viewBox="-60 -60 120 120">
      <defs><linearGradient id="ryoRing" x1="0" y1="-1" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#c8901e"/></linearGradient>
        <linearGradient id="ryoRingCoffers" x1="0" y1="-1" x2="0" y2="1"><stop offset="0" stop-color="#c9a46a"/><stop offset="1" stop-color="#6e5330"/></linearGradient>
        <linearGradient id="ryoRingChest" x1="0" y1="-1" x2="0" y2="1"><stop offset="0" stop-color="#ff8a74"/><stop offset="1" stop-color="#a3261c"/></linearGradient></defs>
      <circle class="disc" r="54"/>
      <circle class="ring" r="44"/>
      <g class="coin" transform="translate(0,-17)"><circle r="13" fill="#e8b23a" stroke="#8a5e12" stroke-width="2"/>
        <circle r="9.5" fill="none" stroke="#a87414" stroke-width="1.2"/><rect x="-4" y="-4" width="8" height="8" fill="#1a1410"/></g>
    </svg><b class="num">0</b><i class="lvl">RYO</i>`;
  const num = root.querySelector('.num'), lvl = root.querySelector('.lvl');
  let shown = null, live = [], lastKind = '';
  let observedTick = null, pending = [];
  function observe() {
    if (observedTick === game.state.tick) return;
    observedTick = game.state.tick;
    const clan = game.state.entities[heroId]?.owner;
    pending.push(...rewardPopups(game.state, clan));
  }

  // one notice per gain; several at once stack upward instead of overlapping
  function notify(g) {
    live = live.filter(p => p.isConnected);
    const pop = document.createElement('div');
    pop.className = `heatgain ryogain${g.amount < 0 ? ' loss' : ''}`;
    pop.innerHTML = `<div class="renownline" hidden></div><div class="ryoline"><span></span><b></b></div>`;
    const renown = pop.querySelector('.renownline');
    renown.hidden = !g.renown;
    renown.textContent = g.renown ? `+${g.renown} Renown` : '';
    pop.querySelector('span').textContent = g.reason || 'Ryo';
    pop.querySelector('b').textContent = g.amount ? `${g.amount > 0 ? '+' : '−'}${Math.abs(g.amount)} ryo` : '';
    // just above the badge, wherever the movable HUD put it
    const r = root.getBoundingClientRect();
    pop.style.right = `${Math.max(0, innerWidth - r.right)}px`;
    const stacked = live.reduce((height, el) => height + Math.max(44, el.offsetHeight + 8), 0);
    pop.style.bottom = `${innerHeight - r.top + 2 + stacked}px`;
    pop.addEventListener('animationend', () => pop.remove());
    setTimeout(() => pop.remove(), 6000);   // in case the animation never ends (hidden tab)
    document.body.appendChild(pop);
    live.push(pop);
  }

  function update() {
    const clan = game.state.clans?.[game.state.entities[heroId]?.owner];
    if (!clan) return;
    observe();
    const gains = pending; pending = [];
    for (const g of gains) notify(g);
    if (gains.some(g => g.amount > 0 || g.renown > 0)) { root.classList.remove('flare'); void root.offsetWidth; root.classList.add('flare'); }
    const pot = potAt(game, heroId), me = game.state.entities[heroId]?.owner, F = game.state.frontier || {};
    // the hover: all three pots, the ryo on the train, then the treasury's recent spending
    const near = pot.town || Object.values(F.settlements || {}).filter(t => t.owner === me && !t.capital).sort((a, b) => (b.stock?.ryo || 0) - (a.stock?.ryo || 0))[0];
    const myWar = pot.war || Object.values(F.wars?.list || {}).find(w => w.attacker === me || w.defender === me);
    const chestOf = w => Math.floor(w.attacker === me ? w.camp?.chest || 0 : w.defense?.chest || 0);
    const onTrain = Object.values(F.shipping?.orders || {}).filter(o => o.kind === 'ryo' && o.owner === me && o.state === 'open').reduce((n, o) => n + o.amount - o.got, 0);
    const lines = [`Clan treasury ${Math.floor(clan.ryo || 0)} (capital)`];
    if (near) lines.push(`${near.name} coffers ${Math.floor(near.stock?.ryo || 0)}`);
    if (myWar) lines.push(`War chest, ${myWar.attacker === me ? 'Siege' : 'Defence'} of ${F.settlements?.[myWar.town]?.name || 'the town'} ${chestOf(myWar)}`);
    if (onTrain > 0) lines.push(`On the train: ${Math.floor(onTrain)}`);
    const title = `Your ryo\n${lines.join('\n')}\n\nTreasury, recent spending and losses\n${treasuryHistory(game.state, clan) || 'No spending or losses yet'}`;
    if (root.title !== title) root.title = title;
    const kind = `${pot.kind}:${pot.label}`;
    if (root.dataset.pot !== pot.kind) root.dataset.pot = pot.kind;
    if (lvl.textContent !== pot.label.toUpperCase()) lvl.textContent = pot.label.toUpperCase();
    if (kind !== lastKind) { lastKind = kind; shown = null; }   // another pot: no count-up from the old one
    const ryo = Math.round(pot.ryo || 0);
    shown = shown === null || ryo < shown ? ryo : Math.min(ryo, shown + Math.max(1, Math.ceil((ryo - shown) * 0.15)));
    num.textContent = shown.toLocaleString('en-US');
  }
  return { update, observe };
}
