// Presentation only: browser fullscreen keeps normal app switching available.
export function bindFullscreen(button, doc = document, win = window) {
  const root = doc.documentElement;
  const available = !!root.requestFullscreen && doc.fullscreenEnabled !== false;
  let pending = false, escapeLocked=false, locking=false;
  const keyboard=win.navigator?.keyboard;
  function update() {
    const active = !!doc.fullscreenElement;
    button.textContent = active ? 'Windowed (Alt+Enter)' : 'Fullscreen (Alt+Enter)';
    button.setAttribute('aria-pressed', String(active));
    button.disabled = !available || pending;
    button.title = available ? escapeLocked?'Escape controls the game · Alt+Enter toggles fullscreen · hold Escape for the browser exit':'Alt+Enter toggles fullscreen · Escape capture requires browser keyboard-lock support and permission'
      : 'Fullscreen is unavailable in this browser; try opening the game in a normal browser window';
  }
  async function reserveEscape(){
    if(!doc.fullscreenElement||!keyboard?.lock||escapeLocked||locking)return;
    locking=true;
    try{await keyboard.lock(['Escape']);escapeLocked=!!doc.fullscreenElement;if(!escapeLocked)keyboard.unlock?.();}
    catch{escapeLocked=false;}
    finally{locking=false;update();}
  }
  async function toggle() {
    if (!available || pending) return;
    pending = true; update();
    let failure;
    try {
      if (doc.fullscreenElement) await doc.exitFullscreen();
      else {await root.requestFullscreen({ navigationUI: 'hide' });await reserveEscape();}
    } catch (error) {
      failure = error?.message || 'The browser could not enter fullscreen';
    } finally {
      pending = false; update();
      if (failure) button.title = failure;
    }
  }
  button.addEventListener('click', () => { void toggle(); button.blur(); });
  doc.addEventListener('fullscreenchange',()=>{if(!doc.fullscreenElement){keyboard?.unlock?.();escapeLocked=false;}else void reserveEscape();update();});
  // Capture before gameplay's Enter handler, so toggling never enters a door.
  win.addEventListener('keydown', e => {
    if(e.code==='Escape'&&doc.fullscreenElement&&escapeLocked){e.preventDefault();return;}
    if (e.code !== 'Enter' || !e.altKey || e.ctrlKey || e.metaKey
      || e.target?.closest?.('input, select, textarea, [contenteditable="true"]')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) void toggle();
  }, { capture: true });
  update();
  return {toggle,status:()=>({active:!!doc.fullscreenElement,escapeLocked})};
}
