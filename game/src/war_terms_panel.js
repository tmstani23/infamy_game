// The surrender screens (war checkpoint 8c-3, 2026-11-15): presentation only, the sim (sim/frontier/war_terms.js)
// checks every command again. One window with four faces:
//   you surrendered        -> type a ransom (filled with the suggested price) and Offer; Leave without terms
//   they surrendered       -> their offer with a fair offer hint: Accept, No, Refuse for good
//   they left / you refused for good (you attack) -> the next phase: Capture, Sack or Burn cards, no hall channel
//   you left / were refused (you defend)          -> a line saying the attacker is choosing
// It opens by itself when a surrender starts and on every new offer or answer; Esc closes it and the Surrender line on
// the camp panel and the town war window's War chest tab opens it again (war_surrender_foot.js draws that line).
// termsModel(game, heroId, w) and termsHtml(model, ui) are pure.
// createWarTermsPanel({ game, heroId, send, blocked, onStart }) -> { update, show, close, isOpen, warOf }
import { WAR_PANEL_CSS } from './war_camp_panel.js';
import { OUTCOME_CSS, outcomeModel } from './war_outcome_menu.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const EXTRA = `
#warterms{position:fixed;left:50%;top:50%;transform:translate(-50%,-52%);z-index:42;width:700px;max-width:calc(100vw - 30px)}
#warterms .cease{display:flex;justify-content:space-between;align-items:center;padding:7px 16px;border-bottom:1px solid #2a2d31;background:linear-gradient(90deg,#3a1512,#14181c)}
#warterms .cease b{color:#ffe9dc;letter-spacing:.1em;font-size:12px;text-transform:uppercase}#warterms .cease span{color:#ee9a8c;font-size:12px}
#warterms main{padding:10px 16px 14px}
#warterms .putrow{display:flex;gap:8px;align-items:center;margin-top:10px}
#warterms input.num{width:90px}
#warterms .hint{color:#d8b56c;font-size:12px;cursor:help}
#warterms .said{margin-top:8px;color:#ee9a8c;font-size:13px;min-height:18px}
#warterms .big{font-size:20px;color:#f3e3bd;margin-top:6px}#warterms .big b{color:#ffd98a}
#warterms .row3{display:flex;gap:10px;margin-top:12px}
#warterms .what{margin-top:10px}
#warterms .clock{margin-top:12px;border:1px solid #826f4c;border-radius:6px;padding:6px;background:#14130f;cursor:help}
#warterms .clock b{display:block;font-size:20px;color:#f6e6bf;font-variant-numeric:tabular-nums}#warterms .clock span{font-size:9px;letter-spacing:.14em;color:#c9b07a;text-transform:uppercase}
#warterms button.quiet{background:#171b20;border-color:#4a4335;color:#c8c2b3}
#warterms .waitline{font-size:16px;color:#f3e3bd;margin-top:14px}
#warterms .cards{padding:14px 0 6px}`;
export const termsCss = () => WAR_PANEL_CSS.replaceAll('#warcamp', '#warterms') + OUTCOME_CSS.replaceAll('#waroutcome', '#warterms') + EXTRA;
const ART = { hall: 'art/buildings/manor.png', flag: 'art/buildings/war_banner.png' };
const clanTitle = c => /clan$/i.test(c?.name || '') ? c.name : `${c?.name || 'Rival'} clan`;
// the window for one war as my clan may know it (null when there are no terms)
export function termsModel(game, heroId, w) {
  const st = game.state, me = st.entities?.[heroId]?.owner, WT = game.frontier?.warTerms, v = WT?.view(w.id, me); if (!v) return null;
  const t = st.frontier?.settlements?.[w.town], town = t?.name || 'the town', attacking = w.attacker === me;
  const foe = clanTitle(st.clans?.[attacking ? w.defender : w.attacker]), mineName = clanTitle(st.clans?.[me]);
  const R = WT.rules(), days = R.cooldownDays ?? 3;
  const base = { war: w.id, eyebrow: `${mineName}, war on ${town}`, town, foe, attacking, seconds: v.seconds, offers: v.offers, tier: t?.tier || 1 };
  if (v.state === 'outcome') {
    if (!attacking) return { ...base, face: 'lost', title: `${town} is lost`, bar: ['No terms', `${foe} are choosing`], line: `${foe} are choosing to capture, sack or burn ${town}. Your troops walked off and your hero and crew went to your nearest other town.` };
    const om = outcomeModel(game, heroId, w);
    return { ...base, face: 'outcome', title: `${town} is yours to take`, bar: ['They have left', 'if you do not choose'], cards: om.cards,
      note: `No channel at the hall. If you do not choose in time the town is sacked. Nobody can declare war here again for ${game.frontier.war.data?.cooldownDays ?? 3} days.` };
  }
  if (v.mine) {
    const waiting = !!v.offer;
    return { ...base, face: 'offer', title: 'Offer terms', bar: ['Ceasefire', 'Nobody attacks while terms are on the table'], tier: 'You surrendered', sub: `${foe} decide`,
      coins: [[v.purse, 'You can pay', attacking ? 'Your Clan treasury. Never the war chest.' : 'Town coffers plus your Clan treasury. Never the war chest.'], [v.offers, 'Offers made', 'How many ransoms you have offered in this surrender']],
      clock: waiting ? 'for their answer' : 'to offer again', clockTip: waiting ? 'If they do not answer in time, the terms count as refused for good.' : 'If you make no offer in time, the terms count as refused for good.',
      sec: [attacking ? 'Ransom to end the war' : `Ransom to keep ${town}`, attacking ? 'paid from your Clan treasury' : 'paid from coffers, then treasury'],
      waiting, suggest: v.suggest, purse: v.purse,
      said: waiting ? `Your offer of ${v.offer.amount} ryo is being weighed.` : v.last != null ? `${foe} said no to ${v.last} ryo.` : '',
      what: attacking ? [['If they accept', `You pay the ransom. Your hero and crew go to your nearest town, your camp packs up and your war chest comes home. Nobody can declare war on ${town} for ${days} days.`],
          ['If they refuse for good', `Your troops walk off unharmed and your hero and crew go to your nearest town. Your war chest goes to the coffers of ${town}.`]]
        : [['If they accept', `You pay the ransom and keep ${town} and its buildings. Their camp packs up and leaves. Nobody can declare war on ${town} for ${days} days.`],
          ['If they refuse for good', `Your troops walk off unharmed. Your hero and crew go to your nearest other town. They choose to capture, sack or burn ${town}.`]] };
  }
  const amount = v.offer?.amount;
  return { ...base, face: 'answer', title: `${foe} surrender`, bar: ['Ceasefire', 'Nobody attacks while terms are on the table'], tier: `${town}, tier ${t?.tier || 1}`, sub: `${foe} surrendered`,
    coins: [[v.offers, 'Offers made', 'How many ransoms they have offered'], [v.last != null ? v.last : 'None', 'Last refused', 'The last offer you said no to']],
    clock: amount != null ? 'to answer' : 'for their offer', clockTip: amount != null ? 'If you do not answer in time, it counts as refused for good.' : 'If they make no offer in time, they lose the war.',
    amount, fair: v.fair,
    what: amount == null ? [] : attacking ? [['Accept', `${amount} ryo goes to your Clan treasury. They keep ${town}. Your hero and crew go to your nearest town, your camp packs up, and your war chest and unused timber and stone come home.`],
        ['No', 'They may offer again.'], ['Refuse for good', `Their troops walk off and ${town} is yours to capture, sack or burn.`]]
      : [['Accept', `${amount} ryo goes to the coffers of ${town}. Their camp packs up and leaves, and their war chest goes home with them.`],
        ['No', 'They may offer again.'], ['Refuse for good', `Their troops walk off and their war chest goes to the coffers of ${town}.`]] };
}
// 2026-11-18: with an offer waiting for your answer the window cannot be put away: Esc does nothing and the
// close button asks to refuse the terms for good first (ui.confirm). Otherwise it closes as before.
export const owesAnswer = m => !!m && m.face === 'answer' && m.amount != null;
// ui = { amount: text in the box, why: refusal line, confirm: the close button asked to refuse for good }
export function termsHtml(m, ui = {}) {
  if (!m) return '';
  const owes = owesAnswer(m);
  const head = `<header><div><div class="eyebrow">${esc(m.eyebrow)}</div><h2>${esc(m.title)}</h2></div><button data-close="1"${owes ? ' title="Closing refuses these terms for good (it asks first)"' : ''}>${owes ? 'Close' : 'Esc'}</button></header>`;
  const why = `<div class="why">${esc(ui.why || '')}</div>`;
  if (m.face === 'outcome') {
    const card = c => `<div class="ocard${c.why ? ' lock' : ''}" title="${esc(c.tip)}"><div class="opic${c.id === 'burn' ? ' burn' : ''}"><img class="main" src="${esc(c.art)}" alt="">${c.flag ? `<img class="flag" src="${esc(c.flag)}" alt="">` : ''}</div>
      <div class="ot">${esc(c.title)}</div>${c.lines.map(l => `<div class="ol">${l}</div>`).join('')}
      ${c.warn && !c.why ? `<div class="owhy">${esc(c.warn)}</div>` : ''}${c.why ? `<div class="owhy">${esc(c.why)}</div>` : `<div class="obtn"><button class="go" data-outcome="${esc(c.id)}">${esc(c.button || c.title)}</button></div>`}</div>`;
    return `<div class="win" role="dialog" aria-label="Take the town">${head}<div class="cease"><b>${esc(m.bar[0])}</b><span>Sacked in <span data-clock="1">${mmss(m.seconds)}</span> ${esc(m.bar[1])}</span></div>
      <main><div class="cards">${m.cards.map(card).join('')}</div><div class="note">${esc(m.note)}</div>${why}</main></div>`;
  }
  if (m.face === 'lost') return `<div class="win" role="dialog" aria-label="Surrender">${head}<div class="cease"><b>${esc(m.bar[0])}</b><span>${esc(m.bar[1])}</span></div><main><div class="waitline">${esc(m.line)}</div></main></div>`;
  const aside = `<aside><div class="art"><img class="hall" src="${ART.hall}" alt="">${m.attacking === (m.face === 'offer') ? `<img class="flag" src="${ART.flag}" alt="">` : ''}</div><span class="tier">${esc(m.tier)}</span><div class="small">${esc(m.sub)}</div>
    <div class="coins">${m.coins.map(([n, l, tip]) => `<div class="coin" title="${esc(tip)}"><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join('')}</div>
    <div class="clock" title="${esc(m.clockTip)}"><b data-clock="1">${mmss(m.seconds)}</b><span>${esc(m.clock)}</span></div></aside>`;
  const what = `<div class="what">${m.what.map(([a, b]) => `<div class="vrow"><div class="vn"><b>${esc(a)}</b><span class="small">${esc(b)}</span></div></div>`).join('')}</div>`;
  let main;
  if (m.face === 'offer') main = `<div class="sec"><span>${esc(m.sec[0])}</span><b>${esc(m.sec[1])}</b></div>
    <div class="putrow"><input class="num" type="text" inputmode="numeric" data-amount="1" value="${esc(ui.amount ?? m.suggest ?? '')}"${m.waiting ? ' disabled' : ''}><button class="go" data-offer="1"${m.waiting ? ' disabled' : ''}>Offer</button>
      <span class="hint" title="A rough guess of what they would take, from what you have seen of them in this war.">Suggested: ${esc(m.suggest ?? 0)} ryo</span></div>
    <div class="said">${esc(m.said)}</div>${what}
    <div class="foot"><span class="small">Give up with no ransom.</span><button class="quiet" data-leave="1" title="Leave without terms: ends the same way as refused for good."${m.waiting ? ' disabled' : ''}>Leave without terms</button></div>`;
  else if (owes && ui.confirm) main = `<div class="big">Refuse these terms for good?</div><div class="small" style="margin-top:6px">${esc(m.what.find(([a]) => a === 'Refuse for good')?.[1] || '')}</div>
    <div class="row3"><button class="quiet" data-answer="never">Refuse for good</button><button class="go" data-back="1">Back to the offer</button></div>`;
  else main = m.amount == null ? `<div class="waitline">Waiting for their offer.</div><div class="small" style="margin-top:6px">${m.offers ? 'You said no. They may offer again or leave.' : 'They will offer a ransom to end the war, or leave with nothing.'}</div>`
    : `<div class="big">${esc(m.foe)} offer <b>${esc(m.amount)} ryo</b> to end the war</div>
    ${m.fair ? `<div class="hint" style="margin-top:4px" title="A rough guess from what you have seen: the town, its buildings and how the war is going.">Fair offer: about ${esc(m.fair[0])} to ${esc(m.fair[1])} ryo</div>` : ''}
    <div class="row3"><button class="go" data-answer="accept">Accept</button><button data-answer="no">No</button><button class="quiet" data-answer="never">Refuse for good</button></div>${what}`;
  return `<div class="win" role="dialog" aria-label="Surrender terms">${head}<div class="cease"><b>${esc(m.bar[0])}</b><span>${esc(m.bar[1])}</span></div><div class="lay">${aside}<main>${main}${why}</main></div></div>`;
}

export function createWarTermsPanel({ game, heroId, send, blocked = () => false, onStart = () => {} }) {
  const off = { update() {}, show: () => false, close() {}, isOpen: () => false, warOf: () => null };
  if (typeof document === 'undefined') return off;
  const style = document.createElement('style');
  style.textContent = termsCss(); document.head.append(style);
  const root = document.createElement('div'); root.id = 'warterms'; root.hidden = true; document.body.append(root);
  const hero = () => game.state.entities?.[heroId];
  const wars = () => Object.values(game.state.frontier?.wars?.list || {}).filter(w => w.terms && (w.attacker === hero()?.owner || w.defender === hero()?.owner));
  let open = null, sig = '', why = '', amount = null, popped = '', seen = 0, confirm = false;
  const owes = () => { const w = wars().find(x => x.id === open); return !!w && owesAnswer(termsModel(game, heroId, w)); };
  const cmd = c => send({ id: heroId, type: 'frontier', ...c });
  function close() { open = null; sig = ''; root.hidden = true; root.innerHTML = ''; }
  function show(warId) {
    const w = wars().find(x => x.id === warId) || (warId == null ? wars()[0] : null); if (!w || blocked()) return false;
    if (open !== w.id) { amount = null; why = ''; confirm = false; }
    open = w.id; sig = ''; onStart(); fill(); return true;
  }
  function fill() {
    const w = wars().find(x => x.id === open), m = w && termsModel(game, heroId, w);
    if (!m) { close(); return; }
    if (!owesAnswer(m)) confirm = false;
    const { seconds, ...rest } = m, next = JSON.stringify([rest, why, confirm]);
    if (next !== sig) {
      // a new face or a new round: the box goes back to the suggestion only when it was never typed in
      const box = root.querySelector('input[data-amount]'), focused = box && document.activeElement === box, at = focused ? box.selectionStart : null;
      root.innerHTML = termsHtml(m, { amount: amount ?? m.suggest, why, confirm }); sig = next;
      if (focused) { const nb = root.querySelector('input[data-amount]'); if (nb && !nb.disabled) { nb.focus(); try { nb.setSelectionRange(at, at); } catch { /* not a text box */ } } }
    }
    const clock = root.querySelector('[data-clock]'); if (clock) { const t = mmss(seconds); if (clock.textContent !== t) clock.textContent = t; }
    root.hidden = false;
  }
  root.addEventListener('input', e => { if (e.target?.dataset?.amount) amount = e.target.value; });
  root.addEventListener('keydown', e => { if (e.target.closest?.('input')) { e.stopPropagation(); if (e.code === 'Enter' || e.code === 'NumpadEnter') root.querySelector('[data-offer]')?.click(); } });
  for (const ev of ['keyup', 'pointerdown', 'mousedown', 'wheel']) root.addEventListener(ev, e => e.stopPropagation());
  root.addEventListener('click', e => {
    const b = e.target.closest?.('[data-close],[data-back],[data-offer],[data-leave],[data-answer],[data-outcome]'); if (!b || !open || b.disabled) return;
    const d = b.dataset; why = ''; sig = '';
    if (d.close) { if (owes()) { confirm = true; return fill(); } return close(); }
    if (d.back) { confirm = false; return fill(); }
    confirm = false;
    if (d.offer) { const box = root.querySelector('input[data-amount]'), n = Math.floor(Number(String(box?.value ?? '').trim())); if (Number.isSafeInteger(n) && n > 0) cmd({ action: 'warOffer', war: open, amount: n }); else why = 'Type how much ryo to offer'; }
    else if (d.leave) cmd({ action: 'warLeave', war: open });
    else if (d.answer) cmd({ action: 'warAnswer', war: open, answer: d.answer });
    else if (d.outcome) cmd({ action: 'warOutcome', war: open, outcome: d.outcome });
    fill();
  });
  addEventListener('keydown', e => { if (!root.hidden && e.code === 'Escape') { if (!owes()) close(); e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true });   // owed answer: Esc does nothing
  const ACTS = /^(warSurrender|warOffer|warAnswer|warLeave|warOutcome)$/;
  function update() {
    for (const r of game.state.frontier?.receipts || []) if (r.seq > seen) { seen = r.seq; if (!r.ok && open && r.clan === hero()?.owner && ACTS.test(r.action)) { why = r.reason; sig = ''; } }
    // it opens by itself on a surrender and on each new offer, answer and phase
    const ws = wars(), key = ws.map(w => `${w.id}:${w.terms.by}:${w.terms.state || ''}:${w.terms.offers}:${w.terms.offer ? 1 : 0}:${w.terms.last ?? ''}`).join('|');
    // (while the map, Controls or settings cover the screen it waits, and opens when they close)
    if (key !== popped && !blocked()) { popped = key; if (ws.length) show(ws.find(w => w.id === open)?.id ?? ws[0].id); }
    if (!root.hidden) { if (blocked()) { close(); popped = ''; } else fill(); }
  }
  return { update, show, close, isOpen: () => !root.hidden, warOf: id => wars().find(w => w.id === id) || null };
}
