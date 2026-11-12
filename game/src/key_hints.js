// Key text on HUD buttons and in the Controls panel follows rebinding (Tim 2026-11-12).
// Buttons: 'Character (J)'. Controls panel rows: a kbd with data-k="{character} or Character button" shows the
// bound keys in place of each {action}; a row with any unbound action shows Unbound there and turns red.
import { sharedKeybinds } from './keybinds.js';

const BUTTONS = [['characterbtn', 'Character', 'character'], ['inventorybtn', 'Inventory', 'inventory'], ['townbtn', 'Town', 'townPanel'],
  ['townsbtn', 'Towns', 'overview'], ['ctlbtn', 'Controls', 'controls']];

export function fillKeyTemplate(tpl, keybinds = sharedKeybinds()) {
  let unbound = false;
  const text = tpl.replace(/\{([A-Za-z0-9]+)\}/g, (_, id) => { const t = keybinds.label(id) || id; if (t === 'Unbound') unbound = true; return t; });
  return { text, unbound };
}

export function refreshKeyHints(doc = document, keybinds = sharedKeybinds()) {
  for (const [id, base, action] of BUTTONS) { const b = doc.getElementById(id); if (b) b.textContent = base + keybinds.hint(action); }
  for (const k of doc.querySelectorAll('#controls [data-k]')) {
    const { text, unbound } = fillKeyTemplate(k.dataset.k, keybinds);
    if (k.textContent !== text) k.textContent = text;
    k.classList.toggle('unbound', unbound);
  }
}
