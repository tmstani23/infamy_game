// Settings > Controls (Tim 2026-11-12): rebind keys. Types down the left, one type at a time on the right,
// Prev / Next pages when a type has more rows than fit (no scrollbars). Click a key, press the new one;
// Esc cancels. A key another action uses asks Swap, Take it or Cancel. Unbound actions show red.
import { comboFromEvent, comboText, isReserved, SLOTS } from './keybinds.js';

export const ROWS_PER_PAGE = 7;

export function createControlsPane({ pane, keybinds, win = globalThis }) {
  const doc = pane.ownerDocument;
  pane.innerHTML = '<div class="kb-wrap"><nav class="kb-types"></nav><div class="kb-body"><div class="kb-rows"></div>'
    + '<p class="kb-note" aria-live="polite"></p><div class="kb-ask" hidden><span></span> <button type="button" class="ms-btn kb-swap">Swap</button> '
    + '<button type="button" class="ms-btn kb-take">Take it</button> <button type="button" class="ms-btn kb-cancel">Cancel</button></div>'
    + '<div class="kb-foot ms-foot"><span class="kb-pager"></span><span><button type="button" class="ms-btn kb-reset-all">Reset all keys</button></span></div></div></div>';
  const $ = s => pane.querySelector(s);
  pane.tabIndex = -1;
  let type = keybinds.types[0], page = 0, capture = null, ask = null, resetArmed = false;
  const note = t => { $('.kb-note').textContent = t || ''; };
  const name = id => keybinds.action(id)?.name || id;
  const rowsOf = t => keybinds.actions.filter(a => a.type === t);
  const btn = (text, cls, on) => { const b = doc.createElement('button'); b.type = 'button'; b.className = 'ms-btn ' + cls; b.textContent = text; b.addEventListener('click', e => { on(e); e.currentTarget.blur?.(); }); return b; };

  function render() {
    // a click that rebuilds the rows drops focus out of Settings, and Esc would no longer reach it: keep it in the pane
    const hadFocus = pane.contains(doc.activeElement);
    // the type list: a type with any unbound action is red
    const nav = $('.kb-types'); nav.textContent = '';
    for (const t of keybinds.types) {
      const b = btn(t, 'kb-type' + (t === type ? ' on' : ''), () => { type = t; page = 0; stopCapture(); render(); });
      if (rowsOf(t).some(a => keybinds.isUnbound(a.id))) { b.classList.add('unbound'); b.title = 'Has an unbound control'; }
      nav.append(b);
    }
    const rows = rowsOf(type), pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
    page = Math.max(0, Math.min(page, pages - 1));
    const box = $('.kb-rows'); box.textContent = '';
    for (const a of rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE)) {
      const row = doc.createElement('div'); row.className = 'kb-row';
      const label = doc.createElement('span'); label.className = 'kb-name'; label.textContent = a.name; row.append(label);
      if (a.fixed) {
        row.classList.add('fixed');
        const k = doc.createElement('span'); k.className = 'kb-fixed'; k.textContent = a.text; k.title = 'This control cannot be changed'; row.append(k);
      } else {
        const keys = keybinds.get(a.id), unbound = keybinds.isUnbound(a.id);
        row.classList.toggle('unbound', unbound);
        for (let slot = 0; slot < SLOTS; slot++) {
          const waiting = capture?.id === a.id && capture.slot === slot;
          const text = waiting ? 'Press a key' : keys[slot] ? comboText(keys[slot]) : slot === 0 ? 'Unbound' : 'None';
          const b = btn(text, 'kb-key' + (waiting ? ' waiting' : '') + (!keys[slot] && slot === 0 ? ' unbound' : '') + (!keys[slot] && slot ? ' empty' : ''), () => startCapture(a.id, slot));
          b.title = slot ? 'Second key: click, then press a key' : 'Click, then press a key';
          row.append(b);
        }
        const clear = btn('Clear', 'kb-clear', () => { stopCapture(); for (let s = 0; s < SLOTS; s++) keybinds.clear(a.id, s); note(a.name + ' is now unbound.'); });
        clear.disabled = unbound; clear.title = 'Remove its keys';
        const reset = btn('Reset', 'kb-reset', () => { stopCapture(); keybinds.reset(a.id); note(a.name + ' is back to its default key.'); });
        reset.disabled = keybinds.isDefault(a.id); reset.title = 'Back to the default key';
        row.append(clear, reset);
      }
      box.append(row);
    }
    const pager = $('.kb-pager'); pager.textContent = '';
    if (pages > 1) {
      const info = doc.createElement('span'); info.className = 'ms-small'; info.textContent = `Page ${page + 1} of ${pages} `;
      pager.append(info, btn('Prev', 'kb-prev', () => { page--; render(); }), btn('Next', 'kb-next', () => { page++; render(); }));
      pager.querySelector('.kb-prev').disabled = page === 0; pager.querySelector('.kb-next').disabled = page >= pages - 1;
    }
    const n = keybinds.unboundIds().length;
    $('.kb-reset-all').textContent = resetArmed ? 'Click again to reset all' : 'Reset all keys';
    if (!$('.kb-note').textContent && n) note(`${n} control${n === 1 ? ' is' : 's are'} unbound (red).`);
    $('.kb-ask').hidden = !ask;
    if (ask) $('.kb-ask span').textContent = `${comboText(ask.combo)} is used by ${ask.others.map(name).join(' and ')}.`;
    if (hadFocus && !pane.contains(doc.activeElement)) pane.focus({ preventScroll: true });
  }

  // key capture: the next key press (with Ctrl, Alt or Shift held if wanted) becomes the key; Esc cancels
  function onCaptureKey(e) {
    if (!capture) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') { stopCapture(); note('Cancelled.'); render(); return; }
    const combo = comboFromEvent(e);
    if (!combo) return;   // a lone Shift, Ctrl or Alt: wait for the key
    const { id, slot } = capture; stopCapture();
    if (isReserved(combo)) { note(`${comboText(combo)} cannot be used.`); render(); return; }
    const others = keybinds.conflicts(id, combo);
    if (others.length) { ask = { id, slot, combo, others }; note(''); render(); return; }
    keybinds.set(id, slot, combo); note(`${name(id)}: ${comboText(combo)}.`);
  }
  function startCapture(id, slot) {
    ask = null; resetArmed = false;
    capture = { id, slot };
    win.addEventListener('keydown', onCaptureKey, { capture: true });
    note(`Press the new key for ${name(id)}. Esc cancels.`); render();
  }
  function stopCapture() { if (!capture) return; capture = null; win.removeEventListener('keydown', onCaptureKey, { capture: true }); }
  const answer = mode => { if (!ask) return; const { id, slot, combo, others } = ask; ask = null; pane.focus({ preventScroll: true });
    if (mode) { keybinds.set(id, slot, combo, mode); note(mode === 'swap' ? `Swapped with ${others.map(name).join(' and ')}.` : `${others.map(name).join(' and ')} now unbound.`); }
    else { note('Cancelled.'); render(); } };
  $('.kb-swap').addEventListener('click', () => answer('swap'));
  $('.kb-take').addEventListener('click', () => answer('take'));
  $('.kb-cancel').addEventListener('click', () => answer(null));
  $('.kb-reset-all').addEventListener('click', () => {
    stopCapture(); ask = null;
    if (!resetArmed) { resetArmed = true; note('Every key goes back to its default.'); render(); return; }
    resetArmed = false; keybinds.resetAll(); note('All keys are back to their defaults.');
  });
  keybinds.subscribe(render);
  render();
  return {
    render,
    capturing: () => !!capture,
    // leaving the tab or closing Settings drops a key capture or question in progress
    stop() { stopCapture(); ask = null; resetArmed = false; note(''); render(); },
  };
}
