// Building stats beside its menu (2026-11-20): buildings no longer show a card on hover (it got in the way of
// moving units). A left-click on a building with a menu (town war window, garrison card, war camp menu) opens the menu
// and the building's card beside it; the card goes when the menu closes. Used by frontier_build_ui.js (town card) and
// structure_card.js (Building pane). Presentation only.
export const MENU_IDS = ['warcamp', 'townwar', 'garrisoncard'];
export const MENU_SELECTOR = MENU_IDS.map(id => `#${id}`).join(', ');

// the building menu that is open now, or null
export function openMenu(doc = globalThis.document) {
  for (const id of MENU_IDS) { const el = doc?.getElementById?.(id); if (el && !el.hidden && el.offsetWidth) return el; }
  return null;
}

// where the card goes: right of the menu, else left of it, else against the right edge; top level with the menu
export function besidePos(menu, card, view, gap = 10, pad = 8) {
  let left = menu.right + gap;
  if (left + card.w > view.w - pad) left = menu.left - gap - card.w;
  if (left < pad) left = Math.max(pad, view.w - card.w - pad);
  const top = Math.max(pad, Math.min(menu.top, view.h - card.h - pad));
  return { left: Math.round(left), top: Math.round(top) };
}

const KEYS = ['left', 'top', 'right', 'bottom', 'transform'];
// put the card beside the menu; its own place (Edit layout) is kept and comes back with unplace
// 2026-11-22: a card the player dragged (hud_layout pins it) stays where he put it
export function placeBeside(card, menu) {
  if (!card || !menu || card.dataset?.layoutPinned === 'true') return;
  if (card.dataset.besideSaved == null) card.dataset.besideSaved = JSON.stringify(Object.fromEntries(KEYS.map(k => [k, card.style[k] || ''])));
  const r = menu.getBoundingClientRect(), p = besidePos(r, { w: card.offsetWidth || 320, h: card.offsetHeight || 200 }, { w: innerWidth, h: innerHeight });
  Object.assign(card.style, { left: `${p.left}px`, top: `${p.top}px`, right: 'auto', bottom: 'auto', transform: 'none' });
}
export function unplace(card) {
  if (!card || card.dataset.besideSaved == null) return;
  if (card.dataset.layoutPinned === 'true') { delete card.dataset.besideSaved; return; }
  try { Object.assign(card.style, JSON.parse(card.dataset.besideSaved)); } catch { for (const k of KEYS) card.style[k] = ''; }
  delete card.dataset.besideSaved;
}
