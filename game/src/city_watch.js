// "Watch the city" (Tim 2026-11-08): the boss stays on the island while the camera looks at the capital.
// Presentation only: the camera shows the capital street (render/view.js setCityWatch), what you see is what
// your city units see (fog is per clan), you can pan, click crew and businesses for status and open the
// lieutenant's orders, but no orders reach the crew (filterCommands). The sim is told with { type: 'watchCity', on }
// so the capital thinks at full speed meanwhile (sim/game.js). Home, Esc, the big banner button, or the boss
// being hurt end it.
const BLOCKED = new Set(['order', 'deployment', 'attack', 'stopattack', 'cancel', 'execute', 'loot', 'mount', 'omnibus', 'garage', 'rickshaw', 'business', 'hire', 'contract', 'clinic', 'police']);
export function createCityWatch({ game, view, heroId, send, notify = () => {}, sound = null, onStart = () => {} }) {
  let on = false, lastHp = null;
  const hero = () => game.state.entities[heroId];
  const hqSpot = () => {
    const owner = hero()?.owner, hq = game.lieutenant?.hq?.(owner);
    const door = hq && game.doors.find(d => d.to && !d.ninja && d.place === hq.room);
    return door ? { x: door.x, z: door.z } : null;
  };
  const canWatch = () => { const h = hero(); return !!h && h.place === 'world' && !h.dead && !h.downed && !!game.lieutenant?.away?.(h.owner) && !!hqSpot(); };
  const banner = document.createElement('div');
  banner.id = 'citywatch'; banner.hidden = true;
  banner.innerHTML = '<span>Watching your city. Your boss is still out on the island.</span><button type="button">Return to hero (Home / Esc)</button>';
  const style = document.createElement('style');
  style.textContent = '#citywatch{position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:16px;padding:10px 18px;'
    + 'background:rgba(10,12,16,.9);border:2px solid #e9c27a;border-radius:6px;color:#f3e6c4;font-size:15px;box-shadow:0 0 24px rgba(233,194,122,.45)}'
    + '#citywatch[hidden]{display:none}#citywatch button{padding:10px 20px;font-size:17px;font-weight:700;color:#14110a;background:#e9c27a;border:0;border-radius:4px;cursor:pointer}'
    + 'body.city-watching #attackbar{top:164px;z-index:61}'   // the raid bar (doors, back room hold timer) sits under the watch banner and the Outside button, not behind them (Tim 2026-11-10)
    + '#citywatch button:hover{background:#ffd98f}body.city-watching::after{content:"";position:fixed;inset:0;z-index:55;pointer-events:none;box-shadow:inset 0 0 0 4px rgba(233,194,122,.55),inset 0 0 90px rgba(233,194,122,.25)}';
  document.head.appendChild(style); document.body.appendChild(banner);
  function start() {
    if (on || !canWatch()) return false;
    onStart(); const p = hqSpot(); on = true; lastHp = hero().hp;
    send({ id: heroId, type: 'watchCity', on: true });
    sound?.clip('Audio/bookOpen', 0.5);   // unrolling a map
    view.setCityWatch(true, p.x, p.z, () => end(false));
    banner.hidden = false; document.body.classList.add('city-watching');
    return true;
  }
  // back to the hero; view.snapBack() (Home) lands here too through the exit callback
  function end(tellView = true) {
    if (!on) return; on = false;
    send({ id: heroId, type: 'watchCity', on: false });
    sound?.clip('ability_dash_1', 0.3, 1.25);   // snap back
    banner.hidden = true; document.body.classList.remove('city-watching');
    if (tellView) view.setCityWatch(false); 
    view.snapBack();
  }
  banner.querySelector('button').addEventListener('click', e => { end(); e.currentTarget.blur(); });
  return {
    start, end, canWatch, isOn: () => on,
    // each frame: drop out if the boss is hit, falls, or leaves the island
    update() {
      if (!on) return;
      const h = hero();
      if (!h || h.place !== 'world' || h.dead || h.downed || !game.lieutenant?.away?.(h.owner)) { end(); return; }
      if (h.hp < lastHp - 0.5) { end(); notify('Your boss is under attack! Back to the hero.', 'alert', 5000); sound?.bell(); return; }
      lastHp = h.hp;
    },
    // no orders from here: crew and hero commands are dropped while watching
    filterCommands: list => on ? list.filter(c => !BLOCKED.has(c.type)) : list,
  };
}
