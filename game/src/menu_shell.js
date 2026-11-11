// Shared menu shell (menu restyle, Tim 2026-11-10): builds the war camp panel look out of plain HTML strings
// for the classes in menu_shell.css. Presentation only. Plain text in game words; long text goes in title hovers.
export const msEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tip = t => t ? ` title="${msEsc(t)}"` : '';

// Opt a panel in: adds the class and closes on its Esc button (data-ms-close).
export function msInstall(panel, close) {
  panel.classList?.add('ms');
  panel.addEventListener('click', e => { if (e.target.closest?.('[data-ms-close]')) { e.stopPropagation?.(); close(); } });
}
// a building image from game/art/buildings
export const msArt = name => name ? `art/buildings/${name}.png` : '';

// The window: header (eyebrow, title, Esc), optional left aside, main body.
export function msShell({ eyebrow = '', title = '', escTip = 'Close (Space or Esc)', aside = '', body = '' }) {
  const head = `<header class="ms-head"><div><div class="ms-eyebrow">${msEsc(eyebrow)}</div><h2>${msEsc(title)}</h2></div><button class="ms-btn" data-ms-close${tip(escTip)}>Esc</button></header>`;
  return aside ? `${head}<div class="ms-lay">${aside}<div class="ms-main">${body}</div></div>` : `${head}<div class="ms-main">${body}</div>`;
}
// The left column: art, a gold label and up to four coins [{ v, label, red, tip }]
export function msAside({ art = '', label = '', labelTip = '', coins = [], extra = '' }) {
  return `<aside class="ms-aside"><div class="ms-art">${art ? `<img alt="" src="${msEsc(art)}">` : ''}</div>${label ? `<span class="ms-tier"${tip(labelTip)}>${msEsc(label)}</span>` : ''}`
    + (coins.length ? `<div class="ms-coins">${coins.map(c => `<div class="ms-coin${c.red ? ' red' : ''}"${tip(c.tip)}><b>${msEsc(c.v)}</b><span>${msEsc(c.label)}</span></div>`).join('')}</div>` : '') + `${extra}</aside>`;
}
// A section line: label left, gold note right, long text in its hover
export const msSec = (left, right = '', hover = '') => `<div class="ms-sec"${tip(hover)}><span>${msEsc(left)}</span>${right ? `<b>${msEsc(right)}</b>` : ''}</div>`;
// A row: optional number key, optional thumb (image url), name, small line, then the buttons (raw html)
export function msRow({ key = null, thumb = null, name = '', sub = '', subClass = '', right = '', hover = '', off = false }) {
  return `<div class="ms-row${off ? ' off' : ''}"${tip(hover)}>${key !== null ? `<span class="ms-key">${key}</span>` : ''}${thumb !== null ? `<span class="ms-thumb"${thumb ? ` style="background-image:url('${thumb}')"` : ''}></span>` : ''}`
    + `<span class="ms-grow"><b>${name}</b>${sub ? `<br><span class="ms-small${subClass ? ` ${subClass}` : ''}">${sub}</span>` : ''}</span>${right ? `<span class="ms-acts">${right}</span>` : ''}</div>`;
}
// A button: { label, data: 'data-x="1"', go (red), off, hover }
export const msBtn = ({ label, data = '', go = false, off = false, hover = '' }) => `<button class="ms-btn${go ? ' ms-go' : ''}" ${data}${off ? ' disabled' : ''}${tip(hover)}>${msEsc(label)}</button>`;
// A cost chip: kind ryo | wood | stone, short when you cannot pay
export const msChip = (n, kind = 'ryo', short = false, hover = '') => `<span class="ms-chip ${kind}${short ? ' short' : ''}"${tip(hover)}><i></i>${msEsc(n)}</span>`;
// Prev / Next pages, no scrollbars: data attribute name for the step (+1 / -1)
export function msPager(pages, at, attr) {
  return `<div class="ms-foot"><span class="ms-small">${pages > 1 ? `Page ${at + 1} of ${pages}` : ''}</span><span>${pages > 1 ? `<button class="ms-btn" ${attr}="-1"${at ? '' : ' disabled'}>Prev</button><button class="ms-btn" ${attr}="1"${at < pages - 1 ? '' : ' disabled'}>Next</button>` : ''}</span></div>`;
}
export const msNote = (text, hot = false) => text ? `<div class="ms-note${hot ? ' hot' : ''}">${msEsc(text)}</div>` : '';
export const msProg = frac => `<div class="ms-prog"><i style="width:${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%"></i></div>`;
// Menu portraits (Tim 2026-11-10: the 3D look, zoomed out, sharp): stills cut from frame 0 of each model's idle sheet
// (or its 512 px portrait strip), cropped head to knees, 256 px, in assets/sprites/portraits/stills/<model>.png.
// The name stays msConcept for the callers (hire, clinic, police, land office, Pack for war). Unknown models give null
// and callers fall back to the sprite portrait.
const STILLS = new Set(['gunslinger', 'western_dockworker', 'archer', 'ronin', 'bandit', 'police', 'thug', 'brute', 'koruda_enforcer', 'shinobi_enforcer', 'enforcer',
  'demolitions', 'lieutenant1', 'lookout', 'swordsman', 'ninja_leader', 'ninja_grunt', 'ninja_tanto', 'rival_yakuza', 'kuroda_spearman', 'mercenary', 'monk', 'monk2',
  'old_woman', 'merchant', 'governer1', 'surveyor1', 'geisha', 'shinobi_geisha', 'fisherman', 'sailor', 'laborer', 'rail_worker', 'kunoichi', 'dog_handler', 'fire_bomber',
  'train_guard', 'rickshaw_driver']);
export const msConcept = model => STILLS.has(model) ? `../assets/sprites/portraits/stills/${model}.png` : null;

// Pages by height for windows whose content is built elsewhere (Town panel, menu restyle 2026-11-10: no scrollbars).
// box: the element holding the body; its direct children are the units a page is made of. state: { page } kept by the
// caller. maxPx: height the body may use. Children that do not fit go to later pages; a section heading (.lab, .ms-sec)
// never ends a page. Adds a Prev / Next footer (data-ms-page) when more than one page is needed. Browser only.
export function msPaginate(box, state, maxPx) {
  if (!box || typeof getComputedStyle === 'undefined') return;
  box.querySelector(':scope > .ms-pagefoot')?.remove();
  const kids = [...box.children];
  for (const k of kids) k.style.display = '';
  if (box.scrollHeight <= maxPx + 1) { state.pages = 1; state.page = 0; return; }
  const limit = maxPx - 40, pages = [[]];
  let used = 0;
  const heightOf = k => { const cs = getComputedStyle(k); return k.getBoundingClientRect().height + parseFloat(cs.marginTop || 0) + parseFloat(cs.marginBottom || 0); };
  for (const k of kids) {
    const h = heightOf(k), cur = pages.at(-1);
    if (used + h > limit && cur.length) {
      const carry = [];
      while (cur.length > 1 && cur.at(-1).matches('.lab, .ms-sec, h1')) carry.unshift(cur.pop());   // keep a heading with what follows it
      pages.push(carry); used = carry.reduce((n, c) => n + heightOf(c), 0);
    }
    pages.at(-1).push(k); used += h;
  }
  state.pages = pages.length; state.page = Math.max(0, Math.min(state.page || 0, pages.length - 1));
  if (pages.length === 1) return;   // one tall block: no Page 1 of 1 footer
  pages.forEach((p, i) => { if (i !== state.page) for (const k of p) k.style.display = 'none'; });
  const foot = document.createElement('div');
  foot.className = 'ms-foot ms-pagefoot';
  foot.innerHTML = `<span class="ms-small">Page ${state.page + 1} of ${pages.length}</span><span><button type="button" data-ms-page="-1"${state.page ? '' : ' disabled'}>Prev</button> <button type="button" data-ms-page="1"${state.page < pages.length - 1 ? '' : ' disabled'}>Next</button></span>`;
  box.append(foot);
}
