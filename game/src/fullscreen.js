// Presentation only: browser fullscreen keeps normal app switching available.
export function bindFullscreen(button, doc = document, win = window) {
  const root = doc.documentElement;
  const available = !!root.requestFullscreen && doc.fullscreenEnabled !== false;
  let pending = false;
  function update() {
    const active = !!doc.fullscreenElement;
    button.textContent = active ? 'Windowed (Alt+Enter)' : 'Fullscreen (Alt+Enter)';
    button.setAttribute('aria-pressed', String(active));
    button.disabled = !available || pending;
    button.title = available ? 'Toggle borderless fullscreen · Escape exits fullscreen'
      : 'Fullscreen is unavailable in this browser; try opening the game in a normal browser window';
  }
  async function toggle() {
    if (!available || pending) return;
    pending = true; update();
    let failure;
    try {
      if (doc.fullscreenElement) await doc.exitFullscreen();
      else await root.requestFullscreen({ navigationUI: 'hide' });
    } catch (error) {
      failure = error?.message || 'The browser could not enter fullscreen';
    } finally {
      pending = false; update();
      if (failure) button.title = failure;
    }
  }
  button.addEventListener('click', () => { void toggle(); button.blur(); });
  doc.addEventListener('fullscreenchange', update);
  // Capture before gameplay's Enter handler, so toggling never enters a door.
  win.addEventListener('keydown', e => {
    if (e.code !== 'Enter' || !e.altKey || e.ctrlKey || e.metaKey
      || e.target?.closest?.('input, select, textarea, [contenteditable="true"]')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) void toggle();
  }, { capture: true });
  update();
}
