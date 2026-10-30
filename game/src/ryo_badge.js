// Ryo badge, left of the heat gauge (Tim OK'd the mock 2026-10-17): a gold ring with a mon
// coin and the clan's ryo. The number counts up toward the real amount after a gain (spending
// snaps straight down), the badge flares, and a notice like "Bandit killed +20 ryo" rises above
// it, from state.ryoGains. Renown for the same reward sits above it in purple.
const lossLabel = (state, loss) => `${loss.reason}${loss.by ? ` · ${state.clans?.[loss.by]?.name || loss.by}` : ''}`;
export function treasuryHistory(state, clan) {
  return (clan.ryoHistory || []).slice(-6).reverse().map(l =>
    `−${l.amount} ryo · ${lossLabel(state, l)} (${l.before} → ${l.after})`).join('\n');
}
export function rewardPopups(state, clanId) {
  const gains = (state.ryoGains || []).filter(g => g.clan === clanId).map(g => ({ ...g, renown: 0 }));
  for (const n of state.news || []) {
    if (n.clan !== clanId || !['combatRenown', 'contractDone'].includes(n.kind)) continue;
    const amount = n.kind === 'combatRenown' ? n.amount : n.renown;
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
        <stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#c8901e"/></linearGradient></defs>
      <circle class="disc" r="54"/>
      <circle class="ring" r="44"/>
      <g class="coin" transform="translate(0,-17)"><circle r="13" fill="#e8b23a" stroke="#8a5e12" stroke-width="2"/>
        <circle r="9.5" fill="none" stroke="#a87414" stroke-width="1.2"/><rect x="-4" y="-4" width="8" height="8" fill="#1a1410"/></g>
    </svg><b class="num">0</b><i class="lvl">RYO</i>`;
  const num = root.querySelector('.num');
  let shown = null, live = [];
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
    const title = `Treasury · recent spending and losses\n${treasuryHistory(game.state, clan) || 'No spending or losses yet'}`;
    if (root.title !== title) root.title = title;
    const ryo = Math.round(clan.ryo || 0);
    shown = shown === null || ryo < shown ? ryo : Math.min(ryo, shown + Math.max(1, Math.ceil((ryo - shown) * 0.15)));
    num.textContent = shown;
  }
  return { update, observe };
}
