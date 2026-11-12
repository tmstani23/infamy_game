// Key rebinding (Tim 2026-11-12): one table of every key action, its default key(s) and the player's
// changes, kept in this browser (localStorage 'infamy.keys.v1'). Keys only: mouse buttons stay fixed.
// A binding is a combo string: optional modifiers then a KeyboardEvent.code, e.g. 'KeyQ', 'Shift+KeyH', 'Ctrl+Digit1'.
// Each action has up to two slots (main and second key). An action with no key at all is "Unbound" (shown red).
// Actions in different contexts may share a key: 'build' actions win while placing buildings, 'world' otherwise.
// Fixed rows (fixed: true) are shown in the Settings Controls tab and cannot be changed.

export const KEY_TYPES = ['Movement', 'Camera', 'Crew orders', 'Crew groups', 'Hero abilities', 'Horses and vehicles', 'Panels and menus', 'Interface', 'Building'];

const A = (id, name, type, keys, more = {}) => ({ id, name, type, keys: [].concat(keys), context: 'world', ...more });
export const KEY_ACTIONS = [
  // Movement (held keys)
  A('moveUp', 'Move up', 'Movement', 'KeyW', { held: true }),
  A('moveLeft', 'Move left', 'Movement', 'KeyA', { held: true }),
  A('moveDown', 'Move down', 'Movement', 'KeyS', { held: true }),
  A('moveRight', 'Move right', 'Movement', 'KeyD', { held: true }),
  A('walk', 'Walk while held; a clean tap while riding switches gallop', 'Movement', [], { fixed: true, text: 'Shift' }),
  A('use', 'Use door, shop, station or talk', 'Movement', ['Space', 'Enter']),
  A('unstuck', 'Unstuck', 'Movement', 'KeyU'),
  // Camera
  A('panUp', 'Pan camera up', 'Camera', 'ArrowUp', { held: true }),
  A('panDown', 'Pan camera down', 'Camera', 'ArrowDown', { held: true }),
  A('panLeft', 'Pan camera left', 'Camera', 'ArrowLeft', { held: true }),
  A('panRight', 'Pan camera right', 'Camera', 'ArrowRight', { held: true }),
  A('cameraHero', 'Camera back to the hero', 'Camera', 'Home'),
  A('zoomIn', 'Zoom in', 'Camera', ['Equal', 'NumpadAdd']),
  A('zoomOut', 'Zoom out', 'Camera', ['Minus', 'NumpadSubtract']),
  A('interiorPeek', 'Inside or outside view', 'Camera', 'End'),
  // Crew orders
  A('selectAll', 'Select all crew', 'Crew orders', 'KeyC'),
  A('followMe', 'Crew follow me', 'Crew orders', 'KeyV'),
  A('attackMove', 'Attack move', 'Crew orders', 'KeyX'),
  A('stop', 'Stop and hold', 'Crew orders', 'KeyZ'),
  A('cycleTarget', 'Next target', 'Crew orders', 'Tab'),
  A('crewAttack', 'Crew attack target', 'Crew orders', 'KeyT'),
  A('heal', 'Heal selected', 'Crew orders', 'KeyG'),
  A('special1', 'Unit ability 1', 'Crew orders', 'Shift+KeyQ'),
  A('special2', 'Unit ability 2', 'Crew orders', 'Shift+KeyE'),
  A('special3', 'Unit ability 3', 'Crew orders', 'Shift+KeyR'),
  A('special4', 'Unit ability 4', 'Crew orders', 'Shift+KeyF'),
  A('torch', 'Torch an enemy structure in a war', 'Crew orders', [], { fixed: true, text: 'Shift + right-click' }),
  A('autoCast', 'Unit ability auto on or off', 'Crew orders', [], { fixed: true, text: 'Right-click the button' }),
  A('evacuate', 'Evacuate garrison', 'Crew orders', 'Shift+KeyK'),
  // Crew groups
  ...[1, 2, 3, 4].map(n => A(`group${n}`, `Select group ${n}`, 'Crew groups', `Digit${n}`)),
  ...[1, 2, 3, 4].map(n => A(`assignGroup${n}`, `Make group ${n}`, 'Crew groups', `Ctrl+Digit${n}`)),
  A('menuPick', 'Pick in an open menu', 'Crew groups', [], { fixed: true, text: '1 to 9' }),
  // Hero abilities
  A('ability1', 'Ability 1', 'Hero abilities', 'KeyQ'),
  A('ability2', 'Ability 2', 'Hero abilities', 'KeyE'),
  A('ability3', 'Ability 3', 'Hero abilities', 'KeyR'),
  A('ability4', 'Ability 4', 'Hero abilities', 'KeyF'),
  A('useItem', 'Use item', 'Hero abilities', 'KeyB'),
  // Horses and vehicles
  A('horse', 'Whistle summon, or hire menu indoors', 'Horses and vehicles', 'KeyH'),
  A('mountGroup', 'Mount up or all off', 'Horses and vehicles', 'Shift+KeyH'),
  // Panels and menus
  A('character', 'Character page', 'Panels and menus', 'KeyJ'),
  A('inventory', 'Inventory', 'Panels and menus', 'KeyI'),
  A('map', 'Map and deployments', 'Panels and menus', 'KeyM'),
  A('townPanel', 'Town panel', 'Panels and menus', 'KeyO'),
  A('overview', 'Overview', 'Panels and menus', 'KeyY'),
  A('vehicles', 'Vehicles', 'Panels and menus', 'Shift+KeyY'),
  A('controls', 'Controls panel', 'Panels and menus', 'Slash'),
  A('close', 'Close or cancel', 'Panels and menus', [], { fixed: true, text: 'Esc' }),
  // Interface
  A('pause', 'Pause', 'Interface', ['Backquote', 'Pause']),
  A('mute', 'Mute', 'Interface', 'KeyK'),
  A('fps', 'Show FPS', 'Interface', 'KeyP'),
  A('nameplates', 'Nameplates', 'Interface', 'KeyL'),
  A('hideUi', 'Hide the HUD', 'Interface', 'F2'),
  A('fullscreen', 'Fullscreen', 'Interface', [], { fixed: true, text: 'Alt + Enter' }),
  // Building (only while placing, or with workers selected)
  A('rotateBuilding', 'Turn a station while placing', 'Building', 'KeyR', { context: 'build' }),
  A('workersHold', 'Selected workers hold', 'Building', 'KeyZ', { context: 'build' }),
];
const BY_ID = new Map(KEY_ACTIONS.map(a => [a.id, a]));
export const SLOTS = 2;
// the hero's ability slots (sim slot names) and the actions that press them
export const SLOT_ACTION = { Q: 'ability1', E: 'ability2', R: 'ability3', F: 'ability4' };

// keys the player cannot bind (browser, system, or fixed game keys)
const RESERVED = new Set(['Escape', 'F1', 'F3', 'F5', 'F11', 'F12', 'Alt+Enter', 'Alt+F4', 'Ctrl+KeyW', 'Ctrl+KeyR', 'Ctrl+KeyT', 'Ctrl+KeyN', 'Ctrl+Tab', 'Alt+Tab']);
const MODS = ['Ctrl', 'Alt', 'Shift'];
const MOD_CODES = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'CapsLock', 'ContextMenu']);

// the combo a key press makes, or null for a lone modifier key
export function comboFromEvent(e) {
  if (!e?.code || MOD_CODES.has(e.code)) return null;
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.code].filter(Boolean).join('+');
}
export function parseCombo(c) {
  if (typeof c !== 'string' || !c) return null;
  const parts = c.split('+'), code = parts.pop(), mods = new Set(parts);
  if (!code || MOD_CODES.has(code) || ![...mods].every(m => MODS.includes(m))) return null;
  return { code, ctrl: mods.has('Ctrl'), alt: mods.has('Alt'), shift: mods.has('Shift') };
}
export const normalCombo = c => { const p = parseCombo(c); return p ? [p.ctrl && 'Ctrl', p.alt && 'Alt', p.shift && 'Shift', p.code].filter(Boolean).join('+') : null; };
export const isReserved = c => RESERVED.has(normalCombo(c) || c);

// plain words, no special characters (Tim 2026-11-10)
const WORDS = { Space: 'Space', Enter: 'Enter', NumpadEnter: 'Numpad Enter', Tab: 'Tab', Backspace: 'Backspace', Escape: 'Esc',
  Slash: 'Slash', Backslash: 'Backslash', Backquote: 'Backtick', Quote: 'Quote', Semicolon: 'Semicolon', Comma: 'Comma', Period: 'Period',
  Equal: 'Equals', Minus: 'Minus', BracketLeft: 'Left bracket', BracketRight: 'Right bracket', ArrowUp: 'Up arrow', ArrowDown: 'Down arrow',
  ArrowLeft: 'Left arrow', ArrowRight: 'Right arrow', Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down', Insert: 'Insert',
  Delete: 'Delete', Pause: 'Pause', NumpadAdd: 'Numpad Plus', NumpadSubtract: 'Numpad Minus', NumpadMultiply: 'Numpad Times',
  NumpadDivide: 'Numpad Divide', NumpadDecimal: 'Numpad Point', IntlBackslash: 'Extra key' };
export function codeText(code) {
  if (WORDS[code]) return WORDS[code];
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return m[1];
  if ((m = /^Numpad(\d)$/.exec(code))) return `Numpad ${m[1]}`;
  return code.replace(/([a-z])([A-Z0-9])/g, '$1 $2');
}
// 'Shift+KeyQ' -> 'Shift + Q'; short: 'S+Q' (button badges)
export function comboText(c, short = false) {
  const p = parseCombo(c); if (!p) return 'Unbound';
  const mods = [p.ctrl && 'Ctrl', p.alt && 'Alt', p.shift && 'Shift'].filter(Boolean);
  return short ? [...mods.map(m => m[0]), codeText(p.code)].join('+') : [...mods, codeText(p.code)].join(' + ');
}

const defaults = a => Array.from({ length: SLOTS }, (_, i) => a.keys[i] || null);

// saved changes: { actionId: [slot0, slot1] } for changed actions only; anything unknown or broken is dropped
export function normalizeOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, keys] of Object.entries(raw)) {
    const a = BY_ID.get(id);
    if (!a || a.fixed || !Array.isArray(keys)) continue;
    const seen = new Set();
    out[id] = Array.from({ length: SLOTS }, (_, i) => { const c = normalCombo(keys[i]); if (!c || isReserved(c) || seen.has(c)) return null; seen.add(c); return c; });
  }
  return out;
}

export function createKeybinds(storage = globalThis.localStorage) {
  const KEY = 'infamy.keys.v1';
  let over = {};
  try { over = normalizeOverrides(JSON.parse(storage?.getItem(KEY) || '{}')); } catch { over = {}; }
  const subs = new Set();
  const get = id => { const a = BY_ID.get(id); if (!a || a.fixed) return []; return (over[id] || defaults(a)).slice(); };
  // two actions of one context on one key (a later game version gives a new action a key the player
  // already took, or a hand-edited save): the player's own choices keep it, a default loses it
  const claimOrder = [...KEY_ACTIONS.filter(a => over[a.id]), ...KEY_ACTIONS.filter(a => !over[a.id])];
  for (const ctx of new Set(KEY_ACTIONS.map(a => a.context))) {
    const seen = new Set();
    for (const a of claimOrder) {
      if (a.context !== ctx || a.fixed) continue;
      const keys = get(a.id); let changed = false;
      keys.forEach((c, i) => { if (!c) return; if (seen.has(c)) { keys[i] = null; changed = true; } else seen.add(c); });
      if (changed) over[a.id] = keys;
    }
  }
  let table = {};   // context -> combo -> action id
  const rebuild = () => { table = {}; for (const a of KEY_ACTIONS) { if (a.fixed) continue; const t = (table[a.context] ||= {}); for (const c of get(a.id)) if (c) t[c] = a.id; } };
  rebuild();
  const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  const save = () => {
    for (const id of Object.keys(over)) if (same(over[id], defaults(BY_ID.get(id)))) delete over[id];
    try { storage?.setItem(KEY, JSON.stringify(over)); } catch {}
    rebuild();
    for (const f of subs) { try { f(); } catch (e) { console.error(e); } }
  };
  const ctxOf = id => BY_ID.get(id)?.context;
  const api = {
    actions: KEY_ACTIONS, types: KEY_TYPES,
    action: id => BY_ID.get(id) || null,
    get,
    isFixed: id => !!BY_ID.get(id)?.fixed,
    isUnbound: id => { const a = BY_ID.get(id); return !!a && !a.fixed && get(id).every(c => !c); },
    isDefault: id => !over[id],
    // key text for buttons, tooltips and the Controls panel ('Unbound' when none)
    label(id, short = false) {
      const a = BY_ID.get(id); if (!a) return '';
      if (a.fixed) return a.text || '';
      const keys = get(id).filter(Boolean);
      return keys.length ? keys.map(c => comboText(c, short)).join(short ? '/' : ' or ') : 'Unbound';
    },
    // the first key only, for small badges ('Unbound' when none)
    badge(id) { const a = BY_ID.get(id); if (a?.fixed) return a.text || ''; const c = get(id).find(Boolean); return c ? comboText(c, true) : 'Unbound'; },
    // ' (Q)' after a button name, ' (Unbound)' when the action has no key
    hint: id => ` (${api.label(id)})`,
    // plain codes of a held action (WASD, arrows): modifiers are ignored so Shift-walking still moves
    codesFor: id => get(id).map(parseCombo).filter(Boolean).map(p => p.code),
    // the action a key press runs in the given contexts (first context wins): exact combo first, then,
    // when only Shift is held, the bare key, so Shift + J still opens the Character page while walking.
    // Ctrl or Alt with a key runs only an action bound to exactly that.
    lookup(e, contexts = ['world']) {
      const combo = typeof e === 'string' ? normalCombo(e) : comboFromEvent(e);
      if (!combo) return null;
      const p = parseCombo(combo), tries = p.ctrl || p.alt || !p.shift ? [combo] : [combo, p.code];
      for (const ctx of contexts) for (const c of tries) { const id = table[ctx]?.[c]; if (id) return id; }
      return null;
    },
    // other actions in the same context already on this key
    conflicts(id, combo) {
      const c = normalCombo(combo); if (!c) return [];
      return KEY_ACTIONS.filter(a => a.id !== id && !a.fixed && a.context === ctxOf(id) && get(a.id).includes(c)).map(a => a.id);
    },
    // set a slot to a key. mode 'swap': the other action gets this slot's old key; 'take': the other loses it
    set(id, slot, combo, mode = 'take') {
      const a = BY_ID.get(id), c = normalCombo(combo);
      if (!a || a.fixed || !c || isReserved(c) || !(slot >= 0 && slot < SLOTS)) return false;
      const mine = get(id), old = mine[slot];
      for (const other of api.conflicts(id, c)) {
        const keys = get(other), i = keys.indexOf(c);
        const canSwap = mode === 'swap' && old && !keys.includes(old) && api.conflicts(other, old).every(x => x === id);
        keys[i] = canSwap ? old : null;
        over[other] = keys;
      }
      const dup = mine.indexOf(c); if (dup >= 0 && dup !== slot) mine[dup] = null;
      mine[slot] = c; over[id] = mine; save(); return true;
    },
    clear(id, slot) { const a = BY_ID.get(id); if (!a || a.fixed || !(slot >= 0 && slot < SLOTS)) return false; const k = get(id); k[slot] = null; over[id] = k; save(); return true; },
    // back to the default keys; any other action holding one of them loses it
    reset(id) {
      const a = BY_ID.get(id); if (!a || a.fixed) return false;
      delete over[id];
      for (const c of get(id)) if (c) for (const o of api.conflicts(id, c)) { const k = get(o); k[k.indexOf(c)] = null; over[o] = k; }
      save(); return true;
    },
    resetAll() { over = {}; save(); },
    unboundIds: () => KEY_ACTIONS.filter(a => api.isUnbound(a.id)).map(a => a.id),
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
  return api;
}

// the game's one table (input.js, panels, Settings); tests make their own with createKeybinds(memory)
let shared = null;
export const sharedKeybinds = () => (shared ||= createKeybinds());
