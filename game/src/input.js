// Keyboard -> commands for the game rules, plus view shortcuts.
const keys = new Set();
const handlers = {};

addEventListener('keydown', e => {
  if (e.code === 'F3') e.preventDefault();
  if (!e.repeat) handlers[e.code]?.();
  keys.add(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// Run fn when a key is pressed (once per press)
export function onKey(codes, fn) { for (const c of [].concat(codes)) handlers[c] = fn; }

const axis = (neg, pos) => (pos.some(k => keys.has(k)) ? 1 : 0) - (neg.some(k => keys.has(k)) ? 1 : 0);

// Screen-relative WASD for unit `id`; Shift walks
export function moveCommand(id) {
  return {
    id, type: 'move',
    right: axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']),
    down: axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']),
    walk: keys.has('ShiftLeft') || keys.has('ShiftRight'),
  };
}
