// Heat gauge, bottom right (Tim OK'd the mock 2026-10-17): a flame, the clan's heat number
// and a ring filling toward 100, with a level name under it. The glow grows and reddens with
// heat, flares whenever heat goes up (with a notice like "Townsperson killed +30" rising
// above it, from state.heatGains) and pulses at the top level. Only reads the state.
const LEVELS = [[75, 'INFAMOUS'], [50, 'HUNTED'], [25, 'WANTED'], [0, 'CALM']];
const R = 44, LEN = 2 * Math.PI * R;
const FLAME = 'M0,-31 C9,-19 15,-12 13,-1 C12,7 6,12 0,12 C-6,12 -12,7 -13,-1 C-14,-9 -9,-14 -6,-20 C-4,-13 -2,-10 1,-8 C2,-15 0,-23 0,-31 Z';
const CORE = 'M1,-15 C6,-8 8,-3 6,3 C5,7 2,8 0,8 C-3,8 -6,6 -6,2 C-6,-3 -3,-6 -2,-9 C-1,-6 0,-5 1,-4 C2,-8 2,-12 1,-15 Z';

export function createHeatBadge({ root, game, heroId }) {
  root.innerHTML = `<svg viewBox="-60 -60 120 120">
      <defs><linearGradient id="heatArc" x1="0" y1="-1" x2="0" y2="1">
        <stop offset="0" stop-color="#ffc24a"/><stop offset="1" stop-color="#ff3a1e"/></linearGradient></defs>
      <circle class="disc" r="54"/>
      <circle class="track" r="${R}"/>
      <circle class="arc" r="${R}" stroke-dasharray="0 ${LEN}" transform="rotate(-90)"/>
      ${[25, 50, 75].map(t => `<line class="tick" x1="0" y1="-${R + 8}" x2="0" y2="-${R - 7}" transform="rotate(${t * 3.6})"/>`).join('')}
      <g class="flame" transform="translate(0,-14) scale(0.95)"><path d="${FLAME}" fill="#ff6e28"/><path d="${CORE}" fill="#ffd27a" transform="translate(0,1)"/></g>
    </svg><b class="num">0</b><i class="lvl">CALM</i>`;
  const arc = root.querySelector('.arc'), num = root.querySelector('.num'), lvl = root.querySelector('.lvl');
  let last = null, live = [];

  // one notice per heat rise; several at once stack upward instead of overlapping
  function notify(g) {
    live = live.filter(p => p.isConnected);
    const pop = document.createElement('div');
    pop.className = 'heatgain';
    pop.innerHTML = `<span></span><b></b>`;
    pop.firstChild.textContent = g.reason || 'Heat';
    pop.lastChild.textContent = `+${g.amount}`;
    pop.style.bottom = `${140 + live.length * 44}px`;
    pop.addEventListener('animationend', () => pop.remove());
    document.body.appendChild(pop);
    live.push(pop);
  }

  function update() {
    const clan = game.state.clans?.[game.state.entities[heroId]?.owner];
    if (!clan) return;
    for (const g of game.state.heatGains || []) if (g.clan === clan.id) notify(g);
    const heat = Math.round(clan.heat || 0), k = Math.min(1, heat / 100);
    if (heat === last) return;
    if (last !== null && heat > last) {
      root.classList.remove('flare'); void root.offsetWidth; root.classList.add('flare');
    }
    last = heat;
    num.textContent = heat;
    arc.setAttribute('stroke-dasharray', `${k * LEN} ${LEN}`);
    const level = LEVELS.find(([min]) => heat >= min)[1];
    lvl.textContent = level;
    root.style.setProperty('--k', k.toFixed(3));
    root.classList.toggle('infamous', level === 'INFAMOUS');
  }
  return { update };
}
