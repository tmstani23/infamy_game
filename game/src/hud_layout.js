// Movable HUD (Tim 2026-10-18): every HUD panel has a small lock icon at its top-right corner.
// Locked (the default on every start) it stays put; unlocked, drag the panel to move it and
// drag the gold corner handle to resize it. Resizing scales the whole panel, so the round
// badges keep their shape. Each panel remembers the screen edges it sits nearest to, so it
// stays in place when the window changes size. Saved to game/data/ui_layout.json through the
// local server (Tim 2026-10-18, so it survives another browser or port), with localStorage as
// a fallback; reset() restores the CSS defaults. Screen only, no game state.
const KEY = 'infamy.hudLayout.v1';
const PANELS = [['hud', 'Top bar'], ['minimap', 'Minimap'], ['bar', 'Action bar'], ['selpanel', 'Unit card'],
  ['bldpanel', 'Building card'], ['ryo', 'Ryo badge'], ['heat', 'Heat gauge'],
  ['uself', 'Your frame'], ['utarget', 'Target frame'], ['stealth', 'Stealth badge']];   // src/unit_frames.js
const MIN_SCALE = 0.5, MAX_SCALE = 2.5;
const LOCKED = '<svg viewBox="0 0 16 16"><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/></svg>';
const OPEN = '<svg viewBox="0 0 16 16"><path d="M5 7V5a3 3 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/></svg>';

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const FILE = 'data/ui_layout.json';
const store = s => {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window: the file still has it */ }
  fetch(FILE, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ panels: s }, null, 2) })
    .catch(() => { /* no game server (old start_game.bat): localStorage still has it */ });
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// fromFile: the panels in data/ui_layout.json (main.js reads it at start); used when it has any
export function createHudLayout({ fromFile } = {}) {
  let saved = fromFile && Object.keys(fromFile).length ? fromFile : load();
  const layer = document.createElement('div');
  layer.id = 'hudlayout';
  document.body.appendChild(layer);
  const stop = e => { e.stopImmediatePropagation(); e.preventDefault(); };

  // saved entry { ax: 'l'|'r', ay: 't'|'b', dx, dy, s }: distance of the scaled panel from its nearest edges
  function place(p) {
    const L = saved[p.id], st = p.el.style;
    if (!L) { st.left = st.top = st.right = st.bottom = st.transform = st.scale = ''; return; }
    const w = p.el.offsetWidth, h = p.el.offsetHeight, s = L.s;
    const vx = clamp(L.ax === 'l' ? L.dx : innerWidth - L.dx - w * s, 0, Math.max(0, innerWidth - w * s));
    const vy = clamp(L.ay === 't' ? L.dy : innerHeight - L.dy - h * s, 0, Math.max(0, innerHeight - h * s));
    // the scale works around the panel's centre (so the badges' flare animations still look right)
    Object.assign(st, { left: `${vx - w * (1 - s) / 2}px`, top: `${vy - h * (1 - s) / 2}px`, right: 'auto', bottom: 'auto', transform: 'none', scale: String(s) });
  }
  // remember a scaled panel at screen pixel (vx, vy), anchored to the edges it is nearest
  function keep(p, vx, vy, s) {
    const w = p.el.offsetWidth * s, h = p.el.offsetHeight * s;
    const ax = vx + w / 2 < innerWidth / 2 ? 'l' : 'r', ay = vy + h / 2 < innerHeight / 2 ? 't' : 'b';
    saved[p.id] = { ax, ay, dx: Math.round(ax === 'l' ? vx : innerWidth - vx - w), dy: Math.round(ay === 't' ? vy : innerHeight - vy - h), s: +s.toFixed(3) };
    place(p);
  }
  const scaleOf = p => saved[p.id]?.s || 1;

  const panels = PANELS.map(([id, name]) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const p = { id, name, el, open: false };
    p.lock = document.createElement('button');
    p.lock.className = 'hudlock';
    p.grip = document.createElement('div');
    p.grip.className = 'hudgrip';
    p.grip.title = `Drag to resize the ${name.toLowerCase()}`;
    layer.append(p.lock, p.grip);
    const show = () => {
      p.lock.innerHTML = p.open ? OPEN : LOCKED;
      p.lock.title = p.open ? `${name}: drag to move, corner to resize. Click to lock` : `${name} is locked. Click to move or resize it`;
      p.lock.classList.toggle('open', p.open);
      el.classList.toggle('hudedit', p.open);
    };
    p.show = show;
    show();
    p.lock.addEventListener('mousedown', e => e.stopPropagation());
    p.lock.addEventListener('click', e => { finish(); p.open = !p.open; show(); if (!p.open) store(saved); e.currentTarget.blur(); });

    // unlocked: a press anywhere on the panel drags it (nothing inside it reacts meanwhile)
    let drag = null;
    function finish() { if (drag) { drag = null; store(saved); } }
    p.finish = finish;
    const begin = (e, mode) => {
      if (e.button !== 0) return;
      stop(e);
      const r = el.getBoundingClientRect();
      drag = { mode, x: e.clientX, y: e.clientY, r, s: scaleOf(p) };
    };
    el.addEventListener('mousedown', e => { if (p.open) begin(e, 'move'); }, { capture: true });
    el.addEventListener('click', e => { if (p.open) stop(e); }, { capture: true });
    el.addEventListener('contextmenu', e => { if (p.open) stop(e); }, { capture: true });
    p.grip.addEventListener('mousedown', e => begin(e, 'size'));
    addEventListener('mousemove', e => {
      if (!drag) return;
      if (typeof e.buttons === 'number' && !(e.buttons & 1)) { finish(); return; }
      const { r } = drag, dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.mode === 'move') keep(p, r.left + dx, r.top + dy, drag.s);
      else {
        // the top-left corner stays put; the corner handle sets the size, aspect ratio kept
        const k = Math.max((r.width + dx) / r.width, (r.height + dy) / r.height);
        keep(p, r.left, r.top, clamp(drag.s * k, MIN_SCALE, MAX_SCALE));
      }
    });
    // Frames may stop bubbling mouse events to keep clicks out of the world.
    // Capture release before those handlers so dragging always ends.
    addEventListener('mouseup', finish, { capture: true });
    addEventListener('blur', finish);
    new ResizeObserver(() => place(p)).observe(el);   // keeps right / bottom anchors right when a panel grows
    place(p);
    return p;
  }).filter(Boolean);
  addEventListener('resize', () => panels.forEach(place));

  return {
    // every frame: park the lock icon (and the resize handle when unlocked) on each visible panel
    update() {
      for (const p of panels) {
        const r = p.el.getBoundingClientRect(), on = r.width > 0 && !p.el.hidden;
        p.lock.hidden = !on;
        p.grip.hidden = !on || !p.open;
        if (!on) continue;
        p.lock.style.transform = `translate(${Math.round(Math.min(r.right, innerWidth) - 19)}px, ${Math.round(Math.max(r.top, 0) + 3)}px)`;
        if (p.open) p.grip.style.transform = `translate(${Math.round(r.right - 12)}px, ${Math.round(r.bottom - 12)}px)`;
      }
    },
    // back to the default spots and sizes, all locked
    reset() {
      saved = {};
      store(saved);
      for (const p of panels) { p.finish(); p.open = false; p.show(); place(p); }
    },
  };
}
