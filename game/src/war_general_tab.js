// The General tab of the town war window and the war camp panel (war 8d-4, Tim 2026-11-15): pick Rush, Siege or
// Raider for your own bot general (one choice for the whole clan), and in a town the share of the coffers he must
// leave alone. Pure HTML builders; the windows handle data-strategy (rush | siege | raider) and the keep box
// (input[data-keep], sent on change). Rules: sim/frontier/war_general.js (commands warStrategy, warKeep).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nice = t => String(t || '').replace(/_/g, ' ');
export const STRATEGY_NAMES = { rush: 'Rush', siege: 'Siege', raider: 'Raider' };
const SHORT = { rush: 'A fast, cheap army that hits early', siege: 'Towers, a big army and siege guns', raider: 'Many workers, then strikes at workers' };
export const GENERAL_CSS = id => `
${id} .strat{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
${id} .strat .s{border:1px solid #3d352a;border-radius:7px;background:radial-gradient(ellipse at 50% 30%,#2a2620,#121314 75%);padding:8px 8px 9px;text-align:center;cursor:pointer;min-height:74px}
${id} .strat .s:hover{border-color:#ffe0a1}
${id} .strat .s b{display:block;font-size:14px;color:#f3e3bd}${id} .strat .s span{font-size:11px;color:#9aa3a6;display:block;margin-top:3px;line-height:1.3}
${id} .strat .s.on{border-color:#e07b6c;background:linear-gradient(#5e1c18,#2a1513);box-shadow:0 0 12px #c9473d55}${id} .strat .s.on span{color:#f0cfc6}
${id} .strat .s i{display:inline-block;margin-top:6px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#d8b56c}
${id} .keep{display:flex;align-items:center;gap:8px;margin-top:10px}
${id} .keep>span:first-child:not([style]){flex:none;white-space:nowrap}
${id} .keep input{width:54px;background:#0a0c0e;border:1px solid #61543e;border-radius:4px;color:#f6e6bf;font:600 15px system-ui;text-align:right;padding:4px 6px}
${id} .gnote{font-size:11px;color:#9aa3a6;margin-top:6px}
${id} .keep button.fstep{flex:none;width:26px;height:26px;padding:0;font:600 15px system-ui}
${id} .fres{display:flex;gap:8px;margin-top:8px}
${id} .fres div{flex:1;text-align:center;padding:5px 0 4px;background:#16120f;border:1px solid #3c3b36;border-radius:4px}
${id} .fres b{display:block;font-size:17px;line-height:20px;color:#f3e3bd}${id} .fres em{display:block;font-style:normal;font-size:11px;color:#9aa3a6;margin-top:1px}${id} .fres small{color:#9b9c98;font-size:10px;letter-spacing:.12em;text-transform:uppercase}
${id} .fstat{margin-top:7px;font-size:12px;color:#d8c9a8}
${id} .fstat.bad{padding:6px 10px;color:#f1c6bb;background:#120807;border:1px solid #b8433a;border-left:4px solid #ff6b5a;border-radius:4px;box-shadow:0 0 10px rgba(224,87,74,.25)}
${id} .fstat.bad b{display:flex;align-items:center;gap:7px;color:#ffb0a0;font-weight:600}
${id} .fstat.bad b::before{content:'!';flex:none;display:grid;place-items:center;width:16px;height:16px;border-radius:50%;background:#e0574a;color:#1a0806;font:800 11px/1 system-ui}
${id} .fstat.bad span{display:block;margin-top:2px;padding-left:23px}`;
// roles a mix may name (war.general.roles): what the clan trains at its clan hall, kennel or hidden dojo, foundry, stable
const ROLE = { special: 'clan specials', siege: 'siege guns', rider: 'cavalry' };
const CLAN_ONLY = { kennel: 'kennel or hidden dojo', hidden_dojo: null };   // one of the two, by clan
const count = list => { const n = {}; for (const t of list || []) { const k = t in CLAN_ONLY ? CLAN_ONLY[t] : t === 'upgrade' ? 'hall upgrade' : nice(t); if (k) n[k] = (n[k] || 0) + 1; } return Object.entries(n).map(([t, k]) => `${t}${k > 1 ? ` ${k}` : ''}`).join(', '); };
// the hover of a strategy card, from the data (frontier.json war.general.strategies)
export function strategyTip(key, rules, camp) {
  const S = rules?.strategies?.[key] || {}, part = camp ? S.attack : S.defend;
  if (!part) return STRATEGY_NAMES[key] || key;
  const mix = Object.entries(part.mix || {}).map(([u, n]) => `${ROLE[u] || nice(u)} ${n}`).join(', ');
  return camp ? `${STRATEGY_NAMES[key]}. Builds in this order: ${count(part.build)}. Hires up to ${part.workers ?? 8} workers. Trains in these shares: ${mix}. Pushes at ${part.pushAt ?? 12} troops, or with what it has when it cannot grow. Goes for ${(part.targets || []).map(t => t === 'military' ? 'military buildings' : t === 'hall' ? 'the hall' : t === 'tower' ? 'watchtowers' : t === 'wall' ? 'walls and gates' : t).join(', then ')}. Breaks a gate or wall when the town is shut. Builds its whole list before it pushes in full, with a probe before that. Answers a town stockade with a foundry and siege guns. Digs in with watchtowers, a stockade and a palisade when the fight drags on or goes badly. Archers and riflemen who are not on a push hold the camp stockade.`
    : `${STRATEGY_NAMES[key]}. Trains in these shares: ${mix}. Archers and riflemen hold the stockades first, then the houses. The army meets attackers near the town and goes for the war camp at ${part.sortieAt ?? 12} troops, or sooner when it is clearly the stronger.`;
}
// 8e-2 (mock C, Tim 2026-11-16): the Clan treasury keep line, for auto ryo orders only (governors and the general,
// during a war); typeable box input[data-tkeep], sent on change as { action: 'ship', mode: 'treasuryKeep', ryo }
const fmt = n => Math.floor(n).toLocaleString('en-US');
function treasuryRow(t, share) {
  if (!t) return '';
  const tip = `During a war your general and your governors may send Clan treasury ryo by train to a war chest. They never take it below this line, and at most ${Math.round((share ?? 0.25) * 100)}% of what is above it each day. Your own orders can go below it.`;
  return `<div class="sec"><span>Clan treasury</span><b>Limits your general and governors, not you</b></div>
    <div class="keep" title="${esc(tip)}"><span style="flex:1"><b style="color:#f3e3bd;font-weight:600">They never take it below</b><br><span class="gnote" style="margin:0">Treasury ${fmt(t.ryo)}. They can send up to ${fmt(t.room)} today.</span></span><input type="text" inputmode="numeric" data-tkeep="1" data-n="tkeep" value="${esc(t.typing ?? t.keep)}" style="width:80px"></div>`;
}
// The town's safety fund (sim/frontier/fund.js; Tim 2026-11-22 moved here from the Governor tab): the share box
// (input[data-fund], sent on change as setFund) with -/+ (data-fundstep), what is in the fund, and what he saves for,
// or the red reason he cannot build. fund = { pct, timber, stone, ryo, next, warn, auto, typing }
const cap1 = t => String(t || '').replace(/^./, c => c.toUpperCase());
function fundRow(fund, tn) {
  if (!fund) return '';
  const pct = Math.round(fund.pct ?? 10), warn = fund.warn;
  const tip = `This share of ${tn}'s timber, stone and ryo income is set aside for your general. He builds his military quarter, its road, his military buildings and the hall war upgrade only from it, while the governor's Initiative is on. It is always set aside, whatever he is saving for. 0 means he builds nothing and the fund goes back to the town. If the town is attacked, the fund's ryo goes into the war chest and its timber and stone into town stock.`;
  const [lead, ...why] = String(warn || '').split(': ');
  const stat = warn ? `<div class="fstat bad"><b>${esc(lead)}</b>${why.length ? why.join(': ').split('. ').map(l => `<span>${esc(cap1(l))}</span>`).join('') : ''}</div>`
    : `<div class="fstat">${esc(!fund.auto ? 'The governor\'s Initiative is off: he builds nothing here' : fund.next ? `Saving for ${fund.next}` : pct ? 'His list is built: the fund keeps for an attack' : 'Set to 0: he builds nothing')}</div>`;
  // each tile: what is in the fund, and how much his list at this tier still needs of it (the fund keeps filling past it, Tim 2026-11-22)
  const tiles = ['timber', 'stone', 'ryo'].map(r => { const need = Math.ceil(fund.cap?.[r] || 0); return `<div title="${esc(need ? `The rest of his list at this tier costs ${need} ${r}. The fund keeps filling past that.` : r === 'ryo' ? 'Nothing left on his list at this tier costs ryo. It is kept for the war chest if the town is attacked.' : `Nothing left on his list at this tier costs ${r}. It goes into town stock if the town is attacked.`)}"><b>${Math.floor(fund[r] || 0)}</b><small>${cap1(r)}</small><em>${need ? `he needs ${need}` : r === 'ryo' ? 'for the war chest' : 'none needed'}</em></div>`; }).join('');
  return `<div class="sec" title="${esc(tip)}"><span>Safety fund</span><b>Pays for his military buildings</b></div>
    <div class="keep" title="${esc(tip)}"><span>Set aside</span><button class="fstep" data-fundstep="-5" title="5 less">-</button><input type="text" inputmode="numeric" data-fund="1" data-n="fund" value="${esc(fund.typing ?? pct)}" title="Type 0 to 100, then Enter"><button class="fstep" data-fundstep="5" title="5 more">+</button><span>% of all the timber, stone and ryo ${tn} earns</span></div>
    <div class="fres">${tiles}</div>${stat}`;
}
// view = { strategy, rules, camp: bool, town?: { name, ryo, keep (0..1) }, typing?: string, treasury?: { ryo, keep, room, typing }, fund? }
export function generalTab(view) {
  const { strategy, rules, camp, town } = view;
  const cards = Object.keys(STRATEGY_NAMES).map(k => `<div class="s${strategy === k ? ' on' : ''}" data-strategy="${k}" title="${esc(strategyTip(k, rules, camp))}"><b>${STRATEGY_NAMES[k]}</b><span>${SHORT[k]}</span>${strategy === k ? '<i>Chosen</i>' : ''}</div>`).join('');
  const head = `<div class="sec"><span>How your general fights</span><b>${camp ? 'He runs this camp while your hero is out of the war' : 'He takes over while your hero is out of the war'}</b></div><div class="strat">${cards}</div>`;
  const share = view.share;
  if (camp) return `${head}<div class="gnote">He spends the camp's war chest, timber and stone. Once the camp station is linked he orders more by train: treasury ryo above the line below, town coffers above their keep share, and timber and stone from your towns. Walk back into the war and he stops at once, and your troops keep their last orders. This choice is for all your wars.</div>${treasuryRow(view.treasury, share)}`;
  const pct = Math.round((town?.keep ?? rules?.keepShare ?? 0.5) * 100), kept = Math.floor((town?.ryo || 0) * pct / 100), sent = Math.floor(town?.ryo || 0) - kept, tn = esc(town?.name || 'the town');
  return `${head}<div class="gnote">Hover a card to see what it trains and how it fights. This choice is for all your wars.</div>${fundRow(view.fund, tn)}
    <div class="sec"><span>If ${tn} is attacked</span><b>The war chest pays for its troops</b></div>
    <div class="keep"><span>Keep</span><input type="text" inputmode="numeric" data-keep="1" data-n="keep" value="${esc(view.typing ?? pct)}" title="Type 0 to 100, then Enter"><span>% of the town coffers safe. The rest, and the safety fund's ryo, go into the war chest.</span></div>
    <div class="gnote">Right now: ${kept} ryo would stay in ${tn} and ${sent} would go to the war chest.</div>${treasuryRow(view.treasury, share)}`;
}
// what the keep box holds, as a share 0..1, or null when it is not a number from 0 to 100
export function keepShare(text) { const n = Number(String(text).trim()); return String(text).trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) / 100 : null; }
