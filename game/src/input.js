// Keyboard -> commands for the game rules, plus view shortcuts.
// Keys are rebindable (Tim 2026-11-12): game code asks for an action ('heal', 'moveUp'), keybinds.js says which keys
// run it. onKey(code) stays only for keys that never move (Escape, dev keys).
import { sharedKeybinds } from './keybinds.js';
export const keybinds = sharedKeybinds();
const keys = new Set();
const handlers = {};        // raw code -> fn (fixed keys)
const actions = {};         // action id -> fn
const firsts = [];          // fn(e) -> true when it used the key (menu number picks)
let gameplayInput = true;
export function setGameplayInput(enabled) { gameplayInput = enabled; keys.clear(); }

addEventListener('keydown', e => {
  if (!gameplayInput || e.target?.closest?.('input, select, textarea')) return;
  const id = keybinds.lookup(e);
  if (id || ['F2', 'F3', 'Space', 'Tab', 'Slash', 'Quote', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home'].includes(e.code)) e.preventDefault();
  if (!e.repeat) {
    if (firsts.some(f => f(e))) { keys.add(e.code); return; }
    if (id && actions[id]) actions[id](e);
    else handlers[e.code]?.(e);
  }
  keys.add(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
// a browser menu (Shift+right-click forces it in some browsers) swallows the key-ups, so held keys stuck and the hero
// kept moving or galloping (Tim 2026-11-07): forget held keys when a menu opens, and drop a Shift the mouse says is up
addEventListener('contextmenu', () => keys.clear(), { capture: true });
addEventListener('mousedown', e => { if (e.button === 2 && e.shiftKey) keys.clear(); }, { capture: true });
const shiftCheck = e => { if (!e.shiftKey) { keys.delete('ShiftLeft'); keys.delete('ShiftRight'); } };
addEventListener('mousemove', shiftCheck, { capture: true });
addEventListener('mousedown', shiftCheck, { capture: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) keys.clear(); });

// Run fn when a fixed key (event code) is pressed, once per press
export function onKey(codes, fn) { for (const c of [].concat(codes)) handlers[c] = fn; }
// Run fn when the key(s) bound to an action are pressed, once per press
export function onAction(ids, fn) { for (const id of [].concat(ids)) actions[id] = fn; }
// fn(e) runs before any action and returns true when it used the key
export function onKeyFirst(fn) { firsts.push(fn); }

const axis = (neg, pos) => (pos.some(k => keys.has(k)) ? 1 : 0) - (neg.some(k => keys.has(k)) ? 1 : 0);

// Arrow keys pan the camera: -1..1 right and up on screen
export const panAxes = () => ({ right: axis(keybinds.codesFor('panLeft'), keybinds.codesFor('panRight')), up: axis(keybinds.codesFor('panDown'), keybinds.codesFor('panUp')) });

// Edge scrolling (Tim 2026-10-20): the mouse at the edge of the window pans the camera like the
// arrow keys, -1..1 right and up on screen; nothing while it is outside the window
let mouse = null;
addEventListener('mousemove', e => { mouse = { x: e.clientX, y: e.clientY }; });
document.addEventListener('mouseleave', () => { mouse = null; });
addEventListener('blur', () => { mouse = null; });
const EDGE = 12;
export function edgeAxes() {
  if (!mouse) return { right: 0, up: 0 };
  const right = mouse.x <= EDGE ? -1 : mouse.x >= innerWidth - 1 - EDGE ? 1 : 0;
  const up = mouse.y <= EDGE ? 1 : mouse.y >= innerHeight - 1 - EDGE ? -1 : 0;
  return { right, up };
}
// Sprint toggle (Tim 2026-11-07): the Sprint button in Mount controls makes the hero's horse gallop without
// holding Shift; it switches off when he gets off (crew_bar.js)
let sprintLock = false;
export const sprintOn = () => sprintLock;
export function setSprint(on) { sprintLock = !!on; }
// Screen-relative WASD for unit `id`; Shift held walks on foot (on a horse or driving, Shift toggles sprint: main.js)
export function moveCommand(id) {
  return {
    id, type: 'move',
    right: axis(keybinds.codesFor('moveLeft'), keybinds.codesFor('moveRight')),
    down: axis(keybinds.codesFor('moveUp'), keybinds.codesFor('moveDown')),
    walk: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    sprint: sprintLock,
  };
}
