// MMO-style unit frames, top middle under the alerts (Tim 2026-10-19); each one can be locked, moved
// and resized like the other HUD panels (src/hud_layout.js, ids uself / utarget): the hero's own frame (portrait, name, HP, what
// he is doing) and, right of it, the current target's frame. The target is the unit you left-clicked,
// else the hero's attack target, else the Tab target (the same pick as T). Border and bar colour say
// who it is: red rivals and police, gold townsfolk and bandits, green your crew. Downed = grey.
// Clicking the target frame jumps the camera to it. Only reads the state.
import { portrait } from './portraits.js';
import { unitName, unitStatus } from './selection_panel.js';
import { POLICE } from './sim/police.js';
import { WILD } from './sim/bandits.js';

// head-and-shoulders crop of the 160px idle cell, tighter than the small card portraits
const CROP = { x: 0.33, y: 0.17, w: 0.34 };

// Which unit the target frame shows (plain state, so Node can check it): a lone left-clicked unit
// that isn't the hero's, else the hero's attack target or swing, else the Tab target
export function frameTarget(state, heroId, selected, tabbed, seen = () => true) {
  const S = state.entities, h = S[heroId];
  if (!h) return null;
  const ok = id => S[id] && !S[id].dead && S[id].place === h.place && seen(S[id]);
  const picked = selected.length === 1 && S[selected[0]]?.owner !== h.owner ? selected[0] : null;
  return [picked, h.attackTarget, h.swing?.target, tabbed].find(ok) || null;
}

// Who a unit is to the hero: { tag, kind } with kind 'you' | 'crew' | 'enemy' | 'neutral'
export function relation(e, hero) {
  if (e.id === hero.id) return { tag: 'You', kind: 'you' };
  if (e.owner === POLICE) return { tag: 'Police', kind: 'enemy' };
  if (e.owner === WILD) return { tag: 'Bandit', kind: 'neutral' };
  if (!e.owner) return { tag: 'Townsfolk', kind: 'neutral' };
  if (e.owner === hero.owner) return { tag: e.guard ? 'Your guard' : 'Your crew', kind: 'crew' };
  return { tag: e.guard ? 'Rival guard' : 'Rival clan', kind: 'enemy' };
}

// The line under the HP bar: "Attacking you" when it is after the hero, else the usual status
export function frameStatus(e, state, heroId) {
  if (!e.downed && !e.dead && [e.swing?.target, e.attackTarget, e.order?.kind === 'attack' && e.order.target].includes(heroId)) return 'Attacking you';
  return unitStatus(e, state);
}

const STYLE = `
#uself, #utarget { position: fixed; top: 100px; z-index: 6; user-select: none; }
#uself { left: calc(50% - 92px); }
#utarget { left: calc(50% + 4px); }
.uf[hidden] { display: none; }
.uf { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 88px; padding: 5px; box-sizing: border-box; border-radius: 6px;
  background: rgba(10,12,16,.85); border: 2px solid var(--c); box-shadow: 0 3px 12px rgba(0,0,0,.5); }
.uf .pic { width: 50px; height: 50px; border: 1px solid var(--c); border-radius: 3px; background: #1e222a center / cover no-repeat; }
.uf b { max-width: 100%; font: 600 11px/1.1 system-ui, sans-serif; color: #e6dcc6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uf .hp { position: relative; width: 100%; height: 12px; background: rgba(0,0,0,.75); border: 1px solid #000; box-sizing: border-box; }
.uf .fill { height: 100%; background: var(--bar); }
.uf .hp span { position: absolute; inset: 0; text-align: center; font: 600 9px/10px system-ui, sans-serif; color: #fff; text-shadow: 0 0 2px #000, 0 0 2px #000; }
.uf i { max-width: 100%; font: 10px/1.1 system-ui, sans-serif; font-style: normal; color: #9a968c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uf.target { cursor: pointer; }
.uf.down { filter: grayscale(1) brightness(.75); }
`;
const COLORS = { you: ['#e9c27a', '#6ebe5a'], crew: ['#6ebe5a', '#6ebe5a'], enemy: ['#c8463a', '#c8463a'], neutral: ['#e0b04a', '#d9a23c'] };

export function createUnitFrames({ game, units, catalog, crewInput, heroId, where = () => '', jump = () => {} }) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  function frame(cls, id) {
    const c = document.createElement('div');
    c.className = `uf ${cls}`;
    c.id = id;
    c.innerHTML = '<div class="pic"></div><b></b><div class="hp"><div class="fill"></div><span></span></div><i></i>';
    document.body.appendChild(c);
    return { c, pic: c.querySelector('.pic'), name: c.querySelector('b'), tag: null, fill: c.querySelector('.fill'),
      hp: c.querySelector('.hp span'), status: c.querySelector('i'), id: null, model: null };
  }
  const self = frame('self', 'uself'), target = frame('target', 'utarget');
  target.c.addEventListener('click', () => { const u = game.state.entities[target.id]; if (u) jump(u); });

  const set = (el, prop, v) => { if (el[prop] !== v) el[prop] = v; };
  function fill(f, e, hero) {
    if (f.model !== e.model) {
      const url = portrait(catalog, e.model, null, CROP);
      f.pic.style.backgroundImage = url ? `url(${url})` : '';
      if (url) f.model = e.model;
    }
    if (f.id !== e.id) { f.id = e.id; set(f.name, 'textContent', unitName(units, e.type === 'hero' ? e.model : (e.civ || e.type))); }
    const r = relation(e, hero), [c, bar] = COLORS[r.kind];
    f.c.style.setProperty('--c', c);
    f.c.style.setProperty('--bar', bar);
    const hp = Math.max(0, Math.ceil(e.hp));
    f.fill.style.width = `${Math.min(100, Math.max(0, e.hp / e.maxHp * 100))}%`;
    set(f.hp, 'textContent', `${hp} / ${e.maxHp}`);
    set(f.status, 'textContent', frameStatus(e, game.state, heroId));
    f.c.classList.toggle('down', !!e.downed);
    set(f.c, 'title', `${f.name.textContent} (${r.tag}): ${frameStatus(e, game.state, heroId)}, ${where(e)}`);
  }

  function update() {
    const S = game.state.entities, h = S[heroId];
    self.c.hidden = !h;
    if (!h) { target.c.hidden = true; return; }
    fill(self, h, h);
    const id = frameTarget(game.state, heroId, crewInput.looked?.() ? [crewInput.looked()] : [], crewInput.tabbed?.(), e => !game.vision || game.vision.canSee(h.owner, e));
    target.c.hidden = !id;
    if (id) fill(target, S[id], h);
  }
  return { update };
}
