// Global stealth feedback. Reads only the hero's own authoritative summary.
export function stealthBadgeState(hero, rules, tick, veiled = false) {
  const status = hero.stealthStatus || {}, suspicion = hero.hidden ? status.suspicion || 0 : 1;
  const held = hero.hiddenAt == null ? 0 : (tick - hero.hiddenAt) / 20;
  return { hidden: !!hero.hidden, suspicion, warning: !!hero.hidden && suspicion >= .65,
    concealment: status.concealment || 0, movement: status.movement || 'still', lighting: status.lighting || 'dark', mode: status.mode || 'normal',
    f: hero.hidden && (veiled || held >= rules.hiddenSeconds) ? 'F' : hero.hidden && hero.hiddenAt != null ? String(Math.ceil(Math.max(0, rules.hiddenSeconds - held))) : '' };
}

const STYLE = `
#stealth { position:fixed; left:50%; bottom:216px; transform:translateX(-50%); width:64px; height:64px; padding:0; border:0; border-radius:50%; box-sizing:border-box; display:grid; place-items:center; z-index:7; pointer-events:auto; user-select:none; color:#d8c6ff; background:rgba(90,56,140,var(--conceal,.5)); box-shadow:inset 0 0 16px #100a22,0 0 10px #8058ae44; transition:background .2s,color .2s; }
#stealth[hidden] { display:none; }
#stealth .stealth-ring { position:absolute; inset:0; width:100%; height:100%; transform:rotate(-90deg); pointer-events:none; }
#stealth .ring-track { fill:none; stroke:#a68ac955; stroke-width:3; }
#stealth .ring-meter { fill:none; stroke:#e7b65e; stroke-width:4; stroke-linecap:round; }
#stealth .stealth-eye { width:30px; height:24px; fill:none; stroke:currentColor; stroke-width:1.7; }
#stealth .eye-open,#stealth.seen .eye-closed { display:none; }
#stealth.seen .eye-open { display:block; }
#stealth.seen { color:#ff9983; background:#561f2dcc; }
#stealth.seen .ring-meter { stroke:#f56d58; }
#stealth .stealth-move { position:absolute; right:8px; bottom:8px; font:bold 10px system-ui; }
#stealth .stealth-ready { position:absolute; left:9px; bottom:7px; font:bold 10px system-ui; color:#e4d2ff; }
#stealth.warning { color:#ffe0a1; animation:stealth-warning 1s ease-in-out infinite; }
@keyframes stealth-warning { 50% { box-shadow:inset 0 0 12px #6e421c,0 0 13px #e4ac5b99; } }
@media(prefers-reduced-motion:reduce) { #stealth { transition:none; } #stealth.warning { animation:none; outline:2px solid #e7b65e; } }
.stealth-observer { position:fixed; z-index:7; pointer-events:none; color:#f3bf69; font:bold 15px system-ui; text-shadow:0 1px 3px #000; transform:translate(-50%,-100%); }
`;

export function createStealthBadge({ root, game, heroId, view }) {
  const style = document.createElement('style'); style.textContent = STYLE; document.head.appendChild(style);
  root.innerHTML = '<svg class="stealth-ring" viewBox="0 0 64 64"><circle class="ring-track" cx="32" cy="32" r="29"/><circle class="ring-meter" cx="32" cy="32" r="29" pathLength="100"/></svg><svg class="stealth-eye eye-closed" viewBox="0 0 28 22"><path d="M2 8q12 14 24 0M6 12l-2 4m10-1v4m8-7 2 4"/></svg><svg class="stealth-eye eye-open" viewBox="0 0 28 22"><path d="M2 11Q14-3 26 11Q14 25 2 11Z"/><circle cx="14" cy="11" r="4"/></svg><span class="stealth-ready"></span><span class="stealth-move"></span>';
  root.setAttribute('role', 'img'); root.tabIndex = 0;
  for (const type of ['mousedown', 'mouseup', 'click', 'contextmenu']) root.addEventListener(type, e => e.stopPropagation());
  const meter = root.querySelector('.ring-meter'), ready = root.querySelector('.stealth-ready'), move = root.querySelector('.stealth-move'), observers = new Map();
  function update() {
    const hero = game.state.entities[heroId], visible = hero && game.state.clans[hero.owner]?.kind === 'ninja' && !hero.dead && !hero.jailed;
    root.hidden = !visible;
    const active = new Set();
    if (visible) {
      const a = game.settings.units.models?.ninja_leader?.abilities?.F || { hiddenSeconds: 3 };
      const state = stealthBadgeState(hero, a, game.state.tick, game.stealth.veiled(hero));
      root.classList.toggle('hid', state.hidden); root.classList.toggle('seen', !state.hidden); root.classList.toggle('warning', state.warning);
      root.style.setProperty('--conceal', String(.2 + state.concealment * .65));
      meter.setAttribute('stroke-dasharray', `${state.suspicion * 100} 100`);
      ready.textContent = state.f; move.textContent = state.movement === 'running' ? '»' : state.movement === 'walking' ? '›' : '·';
      const text = `${state.hidden ? state.suspicion > 0 ? 'HIDDEN · suspicion rising' : 'HIDDEN' : 'SEEN'} · ${state.movement} · ${state.lighting}${state.mode !== 'normal' ? ` · ${state.mode}` : ''} · ${state.f === 'F' ? 'F ready' : state.f ? `F in ${state.f}s` : 'F unavailable'} · snuffs ${game.stealth.snuffsLeft(hero.owner)}/${game.stealth.rules.snuffPerNight}`;
      root.title = text; root.setAttribute('aria-label', text);
      for (const observer of hero.stealthStatus?.observers || []) {
        const e = game.state.entities[observer.id];
        if (!hero.hidden || !e || !game.vision.canSee(hero.owner, e) || view.commandPlace(game.state, heroId) !== e.place) continue;
        active.add(e.id); let el = observers.get(e.id);
        if (!el) { el = document.createElement('div'); el.className = 'stealth-observer'; document.body.appendChild(el); observers.set(e.id, el); }
        const p = view.unitToScreen(e.x, e.z); el.style.left = `${p.x}px`; el.style.top = `${p.y - 35}px`; el.textContent = `? ${Math.round(observer.progress * 100)}%`;
      }
    }
    for (const [id, el] of observers) if (!active.has(id)) { el.remove(); observers.delete(id); }
  }
  return { update };
}
