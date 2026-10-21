// Keyboard -> commands for the game rules, plus view shortcuts.
const keys = new Set();
const handlers = {};

addEventListener('keydown', e => {
  if (['F3', 'Space', 'Tab', 'Slash', 'Quote', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home'].includes(e.code)) e.preventDefault();
  if (!e.repeat) handlers[e.code]?.(e);
  keys.add(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// Run fn when a key is pressed (once per press)
export function onKey(codes, fn) { for (const c of [].concat(codes)) handlers[c] = fn; }

const axis = (neg, pos) => (pos.some(k => keys.has(k)) ? 1 : 0) - (neg.some(k => keys.has(k)) ? 1 : 0);

// Arrow keys pan the camera: -1..1 right and up on screen
export const panAxes = () => ({ right: axis(['ArrowLeft'], ['ArrowRight']), up: axis(['ArrowDown'], ['ArrowUp']) });

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
// Screen-relative WASD for unit `id`; Shift walks
export function moveCommand(id) {
  return {
    id, type: 'move',
    right: axis(['KeyA'], ['KeyD']),
    down: axis(['KeyW'], ['KeyS']),
    walk: keys.has('ShiftLeft') || keys.has('ShiftRight'),
  };
}
