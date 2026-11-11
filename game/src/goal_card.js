// Goal card (quest log, Tim 2026-11-06): the campaign's current goal under the top bar. Reads
// game.goals.current() only (rules in sim/campaign_goals.js). Each requirement is a wax seal with a filling
// bar and its count; a finished one stamps gold. When the whole goal is done a "New goal" callout follows.
// Click the banner to fold or unfold the rows. Hidden outside campaign games.
// drawn seal icons (menu restyle, Tim 2026-11-10: no kanji or glyphs in the UI)
const GLYPH = {
  renown: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.9 4 4.4.5-3.3 3 .9 4.4L8 11.2l-3.9 2.2.9-4.4-3.3-3 4.4-.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  crew: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="4.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><path d="M3 14c0-3 2.2-5 5-5s5 2 5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  business: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 6.5L3 2.5h10l1.5 4z M2.5 6.5V14h11V6.5 M6.5 14v-4h3v4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  office: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><path d="M6 6.5h4M6 9.5h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  settler: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6" cy="4" r="2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><path d="M2.5 14l1-5h5l1 5 M10 7.5l3.5 1v5.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  ryo: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><rect x="6.3" y="6.3" width="3.4" height="3.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  town: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8L8 2.5 14.5 8 M3.5 7v7h9V7 M6.5 14v-3.5h3V14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  influence: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 14.5V1.5 M3.5 2.5h9l-2 3 2 3h-9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  gate: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5c4 1 9 1 13 0 M2.5 6h11 M4.5 3.8V14.5 M11.5 3.8V14.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
};
const FOLD_KEY = 'infamy.goalCard.folded', HIDE_KEY = 'infamy.goalCard.hidden';

export function createGoalCard({ root, button = null, game, heroId, callout = () => {}, stamp = () => {} }) {
  let at = 0, shown = '', lastKey = null, doneSeen = new Set();
  let folded = false; try { folded = localStorage.getItem(FOLD_KEY) === '1'; } catch {}
  // utility-menu icon (Tim 2026-11-06): shows or hides the whole card
  let off = false; try { off = localStorage.getItem(HIDE_KEY) === '1'; } catch {}
  button?.addEventListener('click', e => {
    off = !off; try { localStorage.setItem(HIDE_KEY, off ? '1' : '0'); } catch {}
    at = 0; e.currentTarget.blur();
  });
  root.addEventListener('click', e => {
    if (!e.target.closest('.gc-banner')) return;
    folded = !folded; try { localStorage.setItem(FOLD_KEY, folded ? '1' : '0'); } catch {}
    shown = ''; at = 0;
  });

  function update(now) {
    if (now - at < 250) return;
    at = now;
    const owner = game.state.entities[heroId]?.owner, g = owner && game.goals?.current(owner);
    root.hidden = !g || off;
    if (button) { button.hidden = !g; button.setAttribute('aria-pressed', String(!off)); }
    if (!g) { lastKey = null; return; }
    if (lastKey !== g.key) {
      if (lastKey !== null) callout(`New goal: ${g.title}`, 'news', 4000);
      lastKey = g.key; doneSeen = new Set(g.rows.filter(r => r.done).map(r => r.label));
    }
    const fresh = new Set();
    for (const r of g.rows) if (r.done && !doneSeen.has(r.label)) { doneSeen.add(r.label); fresh.add(r.label); }
    if (fresh.size) stamp();
    const trail = Array.from({ length: g.steps }, (_, i) => `<i class="${i < g.step ? 'past' : i === g.step ? 'now' : ''}"></i>`).join('');
    const rows = folded ? '' : g.rows.map(r => {
      const pct = Math.max(0, Math.min(100, r.need ? (r.have / r.need) * 100 : 100));
      const count = r.need === 1 ? '' : `<span class="gc-count">${Math.min(r.have, 99999)} / ${r.need}</span>`;
      return `<div class="gc-row${r.done ? ' done' : ''}${fresh.has(r.label) ? ' stamped' : ''}">` +
        `<span class="gc-seal">${GLYPH[r.icon] || GLYPH.office}</span>` +
        `<div class="gc-body"><div class="gc-top"><span>${r.label}</span>${count}</div>` +
        `<div class="gc-bar"><b style="width:${pct.toFixed(1)}%"></b></div>` +
        (r.how ? `<em>${r.how}</em>` : '') + '</div></div>';
    }).join('');
    const html = `<div class="gc-banner" title="Click to ${folded ? 'show' : 'hide'} the steps"><small>GOAL</small><span>${g.title}</span><span class="gc-trail">${trail}</span></div>${rows}`;
    if (html !== shown) { root.innerHTML = html; shown = html; }
  }
  return { update };
}
