// Goal card (quest log, Tim 2026-11-06): the campaign's current goal under the top bar. Reads
// game.goals.current() only (rules in sim/campaign_goals.js). Each requirement is a wax seal with a filling
// bar and its count; a finished one stamps gold. When the whole goal is done a "New goal" callout follows.
// Click the banner to fold or unfold the rows. Hidden outside campaign games.
const GLYPH = { renown: '名', crew: '人', business: '店', office: '印', settler: '民', ryo: '両', town: '町', influence: '威', gate: '門' };
const FOLD_KEY = 'infamy.goalCard.folded';

export function createGoalCard({ root, game, heroId, callout = () => {}, stamp = () => {} }) {
  let at = 0, shown = '', lastKey = null, doneSeen = new Set();
  let folded = false; try { folded = localStorage.getItem(FOLD_KEY) === '1'; } catch {}
  root.addEventListener('click', e => {
    if (!e.target.closest('.gc-banner')) return;
    folded = !folded; try { localStorage.setItem(FOLD_KEY, folded ? '1' : '0'); } catch {}
    shown = ''; at = 0;
  });

  function update(now) {
    if (now - at < 250) return;
    at = now;
    const owner = game.state.entities[heroId]?.owner, g = owner && game.goals?.current(owner);
    root.hidden = !g;
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
        `<span class="gc-seal">${GLYPH[r.icon] || '印'}</span>` +
        `<div class="gc-body"><div class="gc-top"><span>${r.label}</span>${count}</div>` +
        `<div class="gc-bar"><b style="width:${pct.toFixed(1)}%"></b></div>` +
        (r.how ? `<em>${r.how}</em>` : '') + '</div></div>';
    }).join('');
    const html = `<div class="gc-banner" title="Click to ${folded ? 'show' : 'hide'} the steps"><small>GOAL</small><span>${g.title}</span><span class="gc-trail">${trail}</span></div>${rows}`;
    if (html !== shown) { root.innerHTML = html; shown = html; }
  }
  return { update };
}
