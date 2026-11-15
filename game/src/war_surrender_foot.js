// The Surrender line of the war camp panel and the town war window's War chest tab (war 8c-3, Tim 2026-11-15):
// a quiet Surrender button, a confirm box that says it cannot be taken back, and Open terms while a ceasefire is on.
// The windows handle data-surrender (ask | yes | no) and data-terms; war_terms_panel.js is the terms window itself.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// the same Surrender line for the camp panel and the town war window (their own CSS ids): ui = { confirm: bool }
export const SURRENDER_CSS = id => `
${id} .surr{margin-top:14px}
${id} button.quiet{background:#171b20;border-color:#4a4335;color:#c8c2b3}
${id} .confirm{margin-top:8px;border:1px solid #c9473d;border-radius:6px;padding:8px 10px;background:linear-gradient(90deg,#3a1512,#14181c)}
${id} .confirm b{color:#ffe9dc}${id} .confirm .btns{display:flex;gap:8px;margin-top:8px}`;
export function surrenderFoot({ side, town, terms, confirm, first }) {
  const head = `<div class="surr"><div class="sec"><span>Ending the war</span><b>cannot be taken back</b></div>`;
  if (terms) return `${head}<div class="foot"><span class="small">A ceasefire is on: terms are on the table.</span><button class="go" data-terms="1">Open terms</button></div></div>`;
  const line = side === 'defender' ? `Offer the attacker a ransom to keep ${esc(town)}.` : `Offer ${esc(town)} a ransom to leave with your war chest.`;
  const lose = side === 'defender' ? `you lose: the enemy decides what happens to ${esc(town)}, and you may lose all of it.` : 'you lose: your war chest goes to the town.';
  return `${head}<div class="foot"><span class="small">${line}</span><button class="quiet" data-surrender="ask" title="Surrender: the fighting stops and you offer a ransom. It cannot be taken back and always ends the war.">Surrender</button></div>`
    + (confirm ? `<div class="confirm"><b>Surrender the war on ${esc(town)}?</b><div class="small" style="margin-top:3px">Once you say yes, you have surrendered. The war ends either on your terms or in your defeat. You get ${Math.round(first || 60)} seconds to make your first offer. If you make no offer in time, or they refuse for good, ${lose} You cannot take this back.</div>
      <div class="btns"><button class="go" data-surrender="yes">Yes, surrender</button><button data-surrender="no">Keep fighting</button></div></div>` : '') + '</div>';
}

