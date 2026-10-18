// Ryo badge, left of the heat gauge (Tim OK'd the mock 2026-10-17): a gold ring with a mon
// coin and the clan's ryo. The number counts up toward the real amount after a gain (spending
// snaps straight down), the badge flares, and a notice like "Bandit killed +20 ryo" rises above
// it, from state.ryoGains. Only reads the state.
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

  // one notice per gain; several at once stack upward instead of overlapping
  function notify(g) {
    live = live.filter(p => p.isConnected);
    const pop = document.createElement('div');
    pop.className = 'heatgain ryogain';
    pop.innerHTML = `<span></span><b></b>`;
    pop.firstChild.textContent = g.reason || 'Ryo';
    pop.lastChild.textContent = `+${g.amount} ryo`;
    // just above the badge, wherever the movable HUD put it
    const r = root.getBoundingClientRect();
    pop.style.right = `${Math.max(0, innerWidth - r.right)}px`;
    pop.style.bottom = `${innerHeight - r.top + 2 + live.length * 44}px`;
    pop.addEventListener('animationend', () => pop.remove());
    setTimeout(() => pop.remove(), 6000);   // in case the animation never ends (hidden tab)
    document.body.appendChild(pop);
    live.push(pop);
  }

  function update() {
    const clan = game.state.clans?.[game.state.entities[heroId]?.owner];
    if (!clan) return;
    const gains = (game.state.ryoGains || []).filter(g => g.clan === clan.id);
    for (const g of gains) notify(g);
    if (gains.length) { root.classList.remove('flare'); void root.offsetWidth; root.classList.add('flare'); }
    const ryo = Math.round(clan.ryo || 0);
    shown = shown === null || ryo < shown ? ryo : Math.min(ryo, shown + Math.max(1, Math.ceil((ryo - shown) * 0.15)));
    num.textContent = shown;
  }
  return { update };
}
