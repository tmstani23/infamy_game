// Ryo badge, left of the heat gauge (approved the mock 2026-10-17): a gold ring with a mon
// coin and the clan's ryo. The number counts up toward the real amount after a gain (spending
// snaps straight down), the badge flares, and a notice like "Bandit killed +20 ryo" rises above
// it, from state.ryoGains. Renown for the same reward sits above it in purple.
import { ringRadius } from './sim/frontier/town_grid.js';
// 8e-8 (2026-11-09, mock H 2026-11-16): the badge shows the pot where the hero stands: in the city (or anywhere
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

// Stolen chest cashed at a war camp (2026-11-25, mock loot_turnin): koban coins arc from the camp up and down into
// the badge, a few at a time and a little see-through; when they land the badge blooms gold with embers, the number
// counts up, and "+N ryo / stolen chest" sits beside the badge on an ink stroke, drifting up as it fades.
const KOBAN = '<svg viewBox="0 0 22 22"><defs><radialGradient id="kobanG" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#fff0b0"/>'
  + '<stop offset=".45" stop-color="#e8b83a"/><stop offset="1" stop-color="#8a5a12"/></radialGradient></defs>'
  + '<ellipse cx="11" cy="11" rx="7" ry="9" fill="url(#kobanG)" stroke="#3a250c" stroke-width="1"/>'
  + '<path d="M8 6.5h6M8 9.5h6M8 12.5h6M8 15.5h6" stroke="#a87a1c" stroke-width=".7"/>'
  + '<ellipse cx="8.2" cy="6.2" rx="1.2" ry="1.9" fill="#fff6d0" transform="rotate(-23 8.2 6.2)"/></svg>';
const FLY_MS = 1000, STAGGER_MS = 55;
function flyCoins(from, to, amount) {
  const n = Math.min(18, 6 + Math.round(amount / 80)), ctrl = { x: (from.x + to.x) / 2 + 120, y: Math.min(from.y, to.y) - 260 };
  const at = (t, jx, jy) => { const u = 1 - t, k = Math.sin(Math.PI * t);
    return { x: u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x + jx * k, y: u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y + jy * k }; };
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'kobanfly'; el.innerHTML = KOBAN; document.body.appendChild(el);
    const size = 20 + Math.random() * 16, jx = (Math.random() - .5) * 40, jy = (Math.random() - .5) * 30, spin = (Math.random() - .5) * 90, flips = 1 + Math.random() * 2;
    el.style.width = `${size}px`; el.style.height = `${size * 1.24}px`;
    const frames = [];
    for (let f = 0; f <= 12; f++) {
      const t = f / 12, p = at(t, jx, jy), burst = t < .15 ? (1 - t / .15) * 24 : 0;   // a little upward pop out of the camp
      frames.push({ transform: `translate(${p.x - size / 2}px, ${p.y - size * .62 - burst}px) rotate(${spin * t}deg) scaleX(${.2 + .8 * Math.abs(Math.cos(Math.PI * flips * t))})`,
        opacity: t === 0 ? 0 : t > .94 ? .4 : .5 + .32 * t * t });
    }
    const anim = el.animate(frames, { duration: FLY_MS * (.9 + Math.random() * .25), delay: i * STAGGER_MS * (.6 + Math.random() * .8), easing: 'cubic-bezier(.35,.05,.55,1)', fill: 'both' });
    anim.onfinish = () => el.remove();
    setTimeout(() => el.remove(), 4000);
  }
  return FLY_MS * .9 + n * STAGGER_MS * .7;   // about when the bulk has landed
}
function embers(root) {
  const r = root.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 12; i++) {
    const el = document.createElement('i'), a = Math.random() * Math.PI * 2, d0 = 52 + Math.random() * 10, d1 = d0 + 18 + Math.random() * 26, s = 3 + Math.random() * 4;
    el.className = 'ryoember'; el.style.width = el.style.height = `${s}px`; document.body.appendChild(el);
    el.animate([{ transform: `translate(${cx + Math.cos(a) * d0}px, ${cy + Math.sin(a) * d0}px)`, opacity: .85 },
      { transform: `translate(${cx + Math.cos(a) * d1}px, ${cy + Math.sin(a) * d1 - 22}px)`, opacity: 0 }],
      { duration: 700 + Math.random() * 500, easing: 'ease-out', fill: 'both' }).onfinish = () => el.remove();
  }
}

export function createRyoBadge({ root, game, heroId, toScreen = null }) {
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
  root.addEventListener('animationend', e => { if (e.animationName === 'ryobloom') root.classList.remove('bloom'); });
  let shown = null, live = [], lastKind = '', holdUntil = 0;
  let observedTick = null, pending = [];
  function observe() {
    if (observedTick === game.state.tick) return;
    observedTick = game.state.tick;
    const clan = game.state.entities[heroId]?.owner;
    pending.push(...rewardPopups(game.state, clan));
  }

  // one notice per gain; several at once stack upward instead of overlapping
  function notify(g) {
    if (g.pot === 'chest' && g.amount > 0) return chestGain(g);
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

  // a stolen chest cashed at your war camp: coins fly in, then the badge blooms and the notice shows beside it
  function chestGain(g) {
    const r = root.getBoundingClientRect(), to = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    let from = g.from && toScreen ? toScreen(g.from.x, g.from.z) : null;
    if (!from || !(from.x > -50 && from.x < innerWidth + 50 && from.y > -50 && from.y < innerHeight + 50)) from = { x: innerWidth / 2, y: innerHeight / 2 };
    const land = flyCoins(from, to, g.amount);
    holdUntil = performance.now() + land;   // the number waits for the coins
    setTimeout(() => {
      root.classList.remove('bloom'); void root.offsetWidth; root.classList.add('bloom');
      embers(root);
      const pop = document.createElement('div');
      pop.className = 'chestgain';
      pop.innerHTML = '<b></b><span></span>';
      pop.querySelector('b').textContent = `+${g.amount} ryo`;
      pop.querySelector('span').textContent = (g.reason || 'Stolen chest').toLowerCase();
      const rr = root.getBoundingClientRect();
      pop.style.right = `${Math.max(0, innerWidth - rr.left - 4)}px`;
      pop.style.bottom = `${Math.max(0, innerHeight - rr.bottom + rr.height * .2)}px`;
      pop.addEventListener('animationend', () => pop.remove());
      setTimeout(() => pop.remove(), 6000);
      document.body.appendChild(pop);
    }, land);
  }

  function update() {
    const clan = game.state.clans?.[game.state.entities[heroId]?.owner];
    if (!clan) return;
    observe();
    const gains = pending; pending = [];
    for (const g of gains) notify(g);
    if (gains.some(g => (g.amount > 0 && g.pot !== 'chest') || g.renown > 0)) { root.classList.remove('flare'); void root.offsetWidth; root.classList.add('flare'); }
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
    if (shown !== null && ryo > shown && performance.now() < holdUntil) { num.textContent = shown.toLocaleString('en-US'); return; }   // coins still in the air
    shown = shown === null || ryo < shown ? ryo : Math.min(ryo, shown + Math.max(1, Math.ceil((ryo - shown) * (root.classList.contains('bloom') ? 0.06 : 0.15))));
    num.textContent = shown.toLocaleString('en-US');
  }
  return { update, observe };
}
