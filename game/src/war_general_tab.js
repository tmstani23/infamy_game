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
${id} .keep input{width:54px;background:#0a0c0e;border:1px solid #61543e;border-radius:4px;color:#f6e6bf;font:600 15px system-ui;text-align:right;padding:4px 6px}
${id} .gnote{font-size:11px;color:#9aa3a6;margin-top:6px}`;
// roles a mix may name (war.general.roles): what the clan trains at its clan hall, kennel or hidden dojo, foundry, stable
const ROLE = { special: 'clan specials', siege: 'siege guns', rider: 'cavalry' };
const CLAN_ONLY = { kennel: 'kennel or hidden dojo', hidden_dojo: null };   // one of the two, by clan
const count = list => { const n = {}; for (const t of list || []) { const k = t in CLAN_ONLY ? CLAN_ONLY[t] : t === 'upgrade' ? 'hall upgrade' : nice(t); if (k) n[k] = (n[k] || 0) + 1; } return Object.entries(n).map(([t, k]) => `${t}${k > 1 ? ` ${k}` : ''}`).join(', '); };
// the hover of a strategy card, from the data (frontier.json war.general.strategies)
export function strategyTip(key, rules, camp) {
  const S = rules?.strategies?.[key] || {}, part = camp ? S.attack : S.defend;
  if (!part) return STRATEGY_NAMES[key] || key;
  const mix = Object.entries(part.mix || {}).map(([u, n]) => `${ROLE[u] || nice(u)} ${n}`).join(', ');
  return camp ? `${STRATEGY_NAMES[key]}. Builds in this order: ${count(part.build)}. Hires up to ${part.workers ?? 8} workers. Trains in these shares: ${mix}. Pushes at ${part.pushAt ?? 12} troops, or with what it has when it cannot grow. Goes for ${(part.targets || []).map(t => t === 'military' ? 'military buildings' : t === 'hall' ? 'the hall' : t === 'tower' ? 'watchtowers' : t === 'wall' ? 'walls and gates' : t).join(', then ')}. Breaks a gate or wall when the town is shut. Digs in with watchtowers, a stockade and a palisade when the fight drags on or goes badly. Archers and riflemen who are not on a push hold the camp stockade.`
    : `${STRATEGY_NAMES[key]}. Trains in these shares: ${mix}. Archers and riflemen hold the stockades first, then the houses. The army meets attackers near the town and goes for the war camp at ${part.sortieAt ?? 12} troops, or sooner when it is clearly the stronger.`;
}
// view = { strategy, rules, camp: bool, town?: { name, ryo, keep (0..1) }, typing?: string }
export function generalTab(view) {
  const { strategy, rules, camp, town } = view;
  const cards = Object.keys(STRATEGY_NAMES).map(k => `<div class="s${strategy === k ? ' on' : ''}" data-strategy="${k}" title="${esc(strategyTip(k, rules, camp))}"><b>${STRATEGY_NAMES[k]}</b><span>${SHORT[k]}</span>${strategy === k ? '<i>Chosen</i>' : ''}</div>`).join('');
  const head = `<div class="sec"><span>While you are away</span><b>${camp ? 'He runs this camp when your hero leaves the war' : 'Your general takes over when your hero leaves the war'}</b></div><div class="strat">${cards}</div>`;
  if (camp) return `${head}<div class="gnote">At a camp he spends only the war chest and the camp's timber and stone. Walk back into the war and he stops at once. Your troops keep their last orders. The choice is for your whole clan.</div>`;
  const pct = Math.round((town?.keep ?? rules?.keepShare ?? 0.5) * 100), kept = Math.floor((town?.ryo || 0) * pct / 100);
  return `${head}<div class="gnote">Hover a card for what it trains and how it fights. The choice is for your whole clan.</div>
    <div class="sec"><span>What he may spend here</span><b>Never the Clan treasury</b></div>
    <div class="keep"><span>Keep</span><input type="text" inputmode="numeric" data-keep="1" data-n="keep" value="${esc(view.typing ?? pct)}" title="Share of the town coffers your general leaves alone, 0 to 100"><span>percent of the town coffers. The rest goes into the war chest when a war is on ${esc(town?.name || 'the town')}.</span></div>
    <div class="gnote">Now: he would keep ${kept} ryo in ${esc(town?.name || 'the town')}.</div>`;
}
// what the keep box holds, as a share 0..1, or null when it is not a number from 0 to 100
export function keepShare(text) { const n = Number(String(text).trim()); return String(text).trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) / 100 : null; }
