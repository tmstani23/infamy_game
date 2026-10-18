// FPS readout, top left, toggled with P: frames a second over the last half second,
// plus the slowest frame in that time (a spike shows up there before the average drops)
export function createFps() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:50;padding:3px 7px;border-radius:4px;background:rgba(0,0,0,.6);color:#9f9;font:700 12px/1.3 monospace;pointer-events:none';
  el.hidden = true;
  document.body.appendChild(el);
  let frames = 0, worst = 0, since = performance.now(), last = since;
  return {
    toggle() { el.hidden = !el.hidden; },
    frame() {
      const now = performance.now();
      worst = Math.max(worst, now - last); last = now; frames++;
      if (now - since < 500) return;
      if (!el.hidden) {
        const mem = performance.memory ? `  ${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : '';
        el.textContent = `${Math.round(frames * 1000 / (now - since))} fps  worst ${Math.round(worst)} ms${mem}`;
      }
      frames = 0; worst = 0; since = now;
    },
  };
}
