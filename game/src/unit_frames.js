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
import { createTargetMemory } from './target_memory.js';

// head-and-shoulders crop of the 160px idle cell, tighter than the small card portraits
const CROP = { x: 0.33, y: 0.17, w: 0.34 };
const EFFECT_NAMES = { charming:'Charming', rally: 'Rally', lantern: 'Red Lantern', intimidated: 'Intimidated', snared: 'Slowed', shroud: 'Smoke', ambush: 'Ambush', veil: 'Vanish', reprisal: 'Reprisal', pursuit: 'Speed', formation: 'Formation', stunned: 'Stunned' };
const DEBUFFS = new Set(['intimidated', 'snared', 'stunned']);
const EFFECT_ICONS = { charming:'✦', rally:'⚡', lantern:'☀', intimidated:'☠', snared:'⛓', shroud:'◌', ambush:'⌖', veil:'◈', reprisal:'⚔', pursuit:'➤', formation:'⬟', stunned:'✹' };

// Which unit the target frame shows (plain state, so Node can check it): a lone left-clicked unit
// that isn't the hero's, else the hero's attack target or swing, else the Tab target
export function frameTarget(state, heroId, selected, tabbed, seen = () => true, place = null) {
  const S = state.entities, h = S[heroId];
  if (!h) return null;
  place ||= h.place;
  const ok = id => S[id] && !S[id].dead && S[id].place === place && seen(S[id]);
  const picked = selected.length === 1 && S[selected[0]]?.owner !== h.owner ? selected[0] : null;
  return [picked, tabbed, h.attackTarget, h.swing?.target].find(ok) || null;
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
#utarget.known { z-index: 34; }
.uf .ambush-action { font: 10px system-ui; padding: 3px 5px; color: #e5d2ff; background: #30203c; border: 1px solid #9779b0; border-radius: 4px; cursor: pointer; }
.uf.down { filter: grayscale(1) brightness(.75); }
#utarget .effects { position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);display:flex;justify-content:center;flex-wrap:wrap;gap:5px;width:max-content;max-width:460px; }
#utarget .effect { position:relative;display:grid;place-items:center;width:38px;height:42px;box-sizing:border-box;border:2px solid #65a968;border-radius:7px;background:linear-gradient(145deg,rgba(37,63,43,.98),rgba(8,15,11,.96));color:#e6ffe5;box-shadow:0 2px 7px #000b,inset 0 0 10px #ffffff12;font:700 21px/1 system-ui,sans-serif;cursor:help; }
#utarget .effect small { position:absolute;right:2px;bottom:2px;color:#fff;font:700 10px/1 system-ui,sans-serif;text-shadow:0 1px 3px #000,0 0 3px #000; }
#utarget .effect.debuff { border-color: #d37163; color: #ffd4ca; }
#utarget .effect::after { content: ''; position: absolute; bottom: 0; left: 0; height: 2px; width: var(--remaining); background: currentColor; }
#uhover { position: fixed; z-index: 8; width: 150px; align-items: stretch; gap: 3px; padding: 5px 7px;
  background: rgba(10,12,16,.52); border-width: 1px; box-shadow: none; pointer-events: none; user-select: none; }
#uhover .pic { display: none; }
#uhover em { font: normal 10px/1.1 system-ui, sans-serif; color: #ccc3b3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
const COLORS = { you: ['#e9c27a', '#6ebe5a'], crew: ['#6ebe5a', '#6ebe5a'], enemy: ['#c8463a', '#c8463a'], neutral: ['#e0b04a', '#d9a23c'] };

export function createUnitFrames({ game, units, catalog, crewInput, heroId, view, where = () => '', jump = () => {}, send = () => {} }) {
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
  self.c.addEventListener('dblclick', e => { if (e.button === 0) view.snapBack?.(); });   // Tim 2026-10-30: camera back to the hero
  let remembered = null, rememberedAtLook = null, rememberedAtTab=null, cached=null;
  let inspected=null, inspectedSelection=null, inspectedTab=null;
  const targetMemory=createTargetMemory();
  const knownTarget = () => game.shinobiIntelligence?.targets(game.state.entities[heroId]?.owner).find(e => e.id === remembered);
  const ambush = document.createElement('button'); ambush.type = 'button'; ambush.className = 'ambush-action'; ambush.textContent = 'Arm Ambush'; target.c.appendChild(ambush);
  ambush.addEventListener('click', e => {
    e.stopPropagation(); const h = game.state.entities[heroId], hunt = game.state.deployment.clans[h.owner].hunt;
    send({ id: heroId, type: 'deployment', action: hunt?.target === target.id ? 'cancelAmbush' : 'armAmbush', target: target.id });
  });
  target.effects = document.createElement('div'); target.effects.className = 'effects'; target.c.appendChild(target.effects);
  const effectStarts = new Map();
  const hover = frame('hover', 'uhover');
  hover.c.hidden = true;
  hover.tag = document.createElement('em');
  hover.name.after(hover.tag);
  target.c.addEventListener('click', () => {
    const known = remembered && knownTarget();
    if (known) view.lookAt(known.x, known.z);
    else { const u = cached?.entity; if (u) jump(u); }
  });
  target.c.addEventListener('mousedown',e=>{e.stopPropagation();if(e.button===2){e.preventDefault();crewInput.attackTarget?.(target.id,e.ctrlKey);}});
  target.c.addEventListener('mouseup',e=>e.stopPropagation());
  target.c.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();});

  const set = (el, prop, v) => { if (el[prop] !== v) el[prop] = v; };
  function fill(f, e, hero) {
    f.c.dataset.owner=e.owner;
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
    if (f === target) {
      const now = game.state.tick, active = Object.entries(e.buffs || {}).filter(([, b]) => b.until > now);
      const html = active.map(([name, b]) => {
        const key = `${e.id}:${name}`, old = effectStarts.get(key);
        if (!old || old.until !== b.until) effectStarts.set(key, { until: b.until, total: Math.max(1, b.until - now) });
        const remaining = Math.max(0, Math.min(100, (b.until - now) / effectStarts.get(key).total * 100));
        const fullName = b.hamstring ? 'Hamstring' : EFFECT_NAMES[name] || name;
        const seconds = Math.ceil((b.until - now) / 20);
        return `<span class="effect ${DEBUFFS.has(name) ? 'debuff' : ''}" style="--remaining:${remaining}%" tabindex="0" role="img" aria-label="${fullName}, ${seconds} seconds remaining" title="${fullName}">${EFFECT_ICONS[name] || '✦'}<small>${seconds}s</small></span>`;
      }).join('');
      if (f.effects.innerHTML !== html) f.effects.innerHTML = html;
    }
    f.c.classList.toggle('down', !!e.downed);
    if (f.tag) set(f.tag, 'textContent', game.state.clans?.[e.owner]?.name || r.tag);
    else set(f.c, 'title', `${f.name.textContent} (${r.tag}): ${frameStatus(e, game.state, heroId)}, ${where(e)}`);
  }

  function update() {
    const S = game.state.entities, h = S[heroId];
    self.c.hidden = !h;
    if (!h) { target.c.hidden = true; return; }
    fill(self, h, h);
    if(inspected&&(crewInput.selected().join(',')!==inspectedSelection||crewInput.tabbed?.()!==inspectedTab))inspected=null;
    if (remembered && (crewInput.looked?.() !== rememberedAtLook||crewInput.tabbed?.()!==rememberedAtTab)) remembered = null;
    const id = frameTarget(game.state, heroId, crewInput.looked?.() ? [crewInput.looked()] : [], crewInput.tabbed?.(), e => !game.vision || game.vision.canSee(h.owner, e), view?.commandPlace(game.state, heroId));
    const memory = remembered && knownTarget();
    const focus=inspected||crewInput.looked?.()||crewInput.tabbed?.()||id;
    const live=focus&&S[focus],visible=live&&(!live.hidden||live.owner===h.owner)&&(!game.vision||game.vision.canSee(h.owner,live));
    cached=targetMemory.read(focus,live,visible,game.state.tick);
    const shown = memory || cached?.entity;
    target.c.hidden = !shown; target.c.classList.toggle('known', !!memory);
    if (memory) {
      target.c.dataset.owner=memory.owner;
      target.id = memory.id;
      const url = portrait(catalog, memory.model, null, CROP); target.pic.style.backgroundImage = url ? `url(${url})` : '';
      target.name.textContent = unitName(units, memory.type === 'hero' ? memory.model : memory.type);
      target.hp.textContent = 'Last sighting'; target.fill.style.width = '0%'; target.effects.replaceChildren();
      target.status.textContent = memory.tracked ? 'Contract tracking' : memory.live ? 'In sight' : `Seen ${Math.floor(memory.age)}s ago`;
      target.c.style.setProperty('--c', '#9779b0'); target.c.title = `${target.name.textContent}: ${target.status.textContent}`;
    } else if(cached){fill(target,cached.entity,h);if(!cached.visible){target.status.textContent='Out of sight · last known';target.effects.replaceChildren();target.c.title='Last observed information; right-click to attack after reacquiring sight';}}
    const eligible = shown && shown.owner !== h.owner && game.state.clans[shown.owner] && !shown.guard && !shown.cop && !shown.wild && shown.type !== 'civilian';
    ambush.hidden = game.state.clans[h.owner]?.kind !== 'ninja' || !eligible;
    ambush.textContent = game.state.deployment.clans[h.owner]?.hunt?.target === target.id ? 'Armed · Cancel' : 'Arm Ambush';
  }
  function updateHover(pointer, overWorld) {
    const h = game.state.entities[heroId], id = overWorld && crewInput.hovered(pointer.x, pointer.y);
    const targeted = h && [h.attackTarget, h.swing?.target, h.execute?.target, crewInput.tabbed?.(), crewInput.looked?.()];
    hover.c.hidden = !h || !id || targeted.includes(id);
    if (hover.c.hidden) return;
    fill(hover, game.state.entities[id], h);
    const x = pointer.x + 18, y = pointer.y + 18;
    hover.c.style.left = `${Math.max(4, Math.min(x, innerWidth - hover.c.offsetWidth - 4))}px`;
    hover.c.style.top = `${Math.max(4, Math.min(y, innerHeight - hover.c.offsetHeight - 4))}px`;
  }
  return { update, updateHover,
    inspect: id => {remembered=null;inspected=id;inspectedSelection=crewInput.selected().join(',');inspectedTab=crewInput.tabbed?.();update();},
    clearInspection:()=>{inspected=null;update();},
    showKnown: id => { inspected=null;remembered = id; rememberedAtLook = crewInput.looked?.();rememberedAtTab=crewInput.tabbed?.(); update(); },
    clearKnown: () => { inspected=null;remembered = null;cached=null;targetMemory.read(null,null,false); } };
}
