// The war bar (war checkpoint 8a-2, Tim 2026-11-14): presentation only. While your clan is in a war a bar sits at
// the top of the screen with both sides' morale (sim/frontier/war_morale.js): yours on the left, the enemy's on the
// right, each draining toward the middle. A drop flashes that side and a line under the bar names the cause for a few
// seconds. Hovering a side lists what still stands and what is down. A side at 0 shows that its hall can be taken, and
// a running channel (8a-3) shows its countdown in the middle with a strip under the bar.
// With several wars it shows the one whose town is nearest to the hero.
// warBarHtml(model) is pure (the mock page uses it too); warBarModel(game, heroId) reads the state only.
export const WAR_BAR_CSS = `
#warbar{position:fixed;left:50%;top:104px;transform:translateX(-50%);z-index:18;width:620px;max-width:calc(100vw - 40px);color:#eadfc6;font:12px/1.3 system-ui,sans-serif;pointer-events:none}
#warbar[hidden]{display:none}
#warbar .wb{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;padding:7px 12px 8px;background:linear-gradient(180deg,#171c21ee,#0f1317ee);border:1px solid #4d3b2a;border-top:2px solid #c9473d;border-radius:8px;box-shadow:0 6px 22px #000a,0 0 0 1px #000;pointer-events:auto}
#warbar .wb-side{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;cursor:help;min-width:0}
#warbar .wb-side.foe{grid-template-columns:auto 1fr auto}
#warbar .wb-crest{width:18px;height:18px;border-radius:50%;background:var(--c,#888);box-shadow:0 0 0 2px #d4aa5a,0 0 0 3px #1a140c;margin:0 3px}
#warbar .wb-col{min-width:0}
#warbar .wb-name{font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:#c9b07a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#warbar .wb-side.me .wb-name{text-align:right}
#warbar .wb-track{position:relative;height:11px;margin-top:3px;border-radius:6px;background:#0a0c0e;box-shadow:inset 0 0 0 1px #3a3530;overflow:hidden}
#warbar .wb-track i{position:absolute;top:0;bottom:0;background:linear-gradient(180deg,color-mix(in srgb,var(--c,#888) 80%,#fff),var(--c,#888) 55%,color-mix(in srgb,var(--c,#888) 60%,#000));transition:width .5s ease-out}
#warbar .wb-side.me .wb-track i{right:0;border-radius:6px 0 0 6px}
#warbar .wb-side.foe .wb-track i{left:0;border-radius:0 6px 6px 0}
#warbar .wb-pct{font-size:19px;font-weight:600;color:#f6e6bf;font-variant-numeric:tabular-nums;min-width:30px;text-align:center}
#warbar .wb-mid{text-align:center;padding:0 4px;white-space:nowrap}
#warbar .wb-eyebrow{display:block;color:#e0786c;letter-spacing:.16em;font-size:9px;text-transform:uppercase}
#warbar .wb-title{display:block;font-size:14px;font-weight:500;color:#f3e3bd}
#warbar .wb-side.hit .wb-track{animation:wbhit 1s ease-out}
#warbar .wb-side.hit .wb-pct{animation:wbpct 1s ease-out}
@keyframes wbhit{0%{box-shadow:inset 0 0 0 1px #ff8a6b,0 0 14px #ff5a3c}100%{box-shadow:inset 0 0 0 1px #3a3530,0 0 0 #0000}}
@keyframes wbpct{0%{color:#ff8a6b;transform:scale(1.25)}100%{color:#f6e6bf;transform:scale(1)}}
#warbar .wb-side.ready .wb-track{box-shadow:inset 0 0 0 1px #e07b6c,0 0 10px #c9473d88}
#warbar .wb-ready{position:absolute;inset:0;display:grid;place-items:center;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#ffb9a8;animation:wbpulse 1.6s ease-in-out infinite}
@keyframes wbpulse{0%,100%{opacity:.55}50%{opacity:1}}
#warbar .wb-line{margin:5px auto 0;width:max-content;max-width:100%;padding:3px 12px;border-radius:10px;background:#0f1317e6;border:1px solid #8e2d26;color:#ffb4a4;font-size:12px;text-align:center}
#warbar .wb-line.good{color:#d9f0c4;border-color:#4d6b3a}
#warbar .wb-chan{grid-column:1 / 4;height:6px;border-radius:4px;background:#0a0c0e;box-shadow:inset 0 0 0 1px #3a3530;overflow:hidden;margin-top:2px}
#warbar .wb-chan i{display:block;height:100%;background:linear-gradient(90deg,#8e2d26,#e07b6c);transition:width .25s linear}
#warbar .wb-chan.mine i{background:linear-gradient(90deg,#8a6a2a,#f0c96a)}
`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// model = { eyebrow, title, mine: side, foe: side, line?: { text, good }, channel?: { text, frac, mine } }
// side = { name, pct, color, ready, readyText, hit, tip }
export function warBarHtml(m) {
  if (!m) return '';
  const side = (s, cls) => {
    const crest = `<span class="wb-crest"></span>`, pct = `<b class="wb-pct">${Math.round(s.pct)}</b>`;
    const col = `<div class="wb-col"><div class="wb-name">${esc(s.name)}</div><div class="wb-track"><i style="width:${Math.max(0, Math.min(100, s.pct))}%"></i>${s.ready ? `<span class="wb-ready">${esc(s.readyText || '')}</span>` : ''}</div></div>`;
    return `<div class="wb-side ${cls}${s.hit ? ' hit' : ''}${s.ready ? ' ready' : ''}" style="--c:${esc(s.color || '#888')}" title="${esc(s.tip || '')}">${cls === 'me' ? crest + col + pct : pct + col + crest}</div>`;
  };
  return `<div class="wb">${side(m.mine, 'me')}<div class="wb-mid"><span class="wb-eyebrow">${esc(m.channel?.text || m.eyebrow || 'War')}</span><span class="wb-title">${esc(m.title)}</span></div>${side(m.foe, 'foe')}`
    + (m.channel ? `<div class="wb-chan${m.channel.mine ? ' mine' : ''}"><i style="width:${(Math.max(0, Math.min(1, m.channel.frac)) * 100).toFixed(1)}%"></i></div>` : '') + '</div>'
    + (m.line ? `<div class="wb-line${m.line.good ? ' good' : ''}">${esc(m.line.text)}</div>` : '');
}
const nice = t => String(t || 'building').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const LINE_TICKS = 6 * 20, HIT_TICKS = 20;
export function warBarModel(game, heroId) {
  const st = game.state, hero = st.entities?.[heroId], me = hero?.owner, MO = game.frontier?.warMorale;
  const wars = Object.values(st.frontier?.wars?.list || {}).filter(w => w.attacker === me || w.defender === me);
  if (!wars.length || !MO) return null;
  const townOf = w => st.frontier.settlements?.[w.town];
  const dist = w => { const t = townOf(w); return hero?.place === 'world' && t ? Math.hypot(t.x - hero.x, t.z - hero.z) : 0; };
  const w = wars.slice().sort((a, b) => dist(a) - dist(b) || (a.id < b.id ? -1 : 1))[0], v = MO.view(w.id), t = townOf(w);
  if (!v) return null;
  const attacking = w.attacker === me, foeClan = st.clans?.[attacking ? w.defender : w.attacker];
  const mySide = attacking ? 'camp' : 'town', foeSide = attacking ? 'town' : 'camp';
  const names = { town: t?.name || 'The town', camp: attacking ? 'Your camp' : `${foeClan?.name || 'Enemy'} camp` };
  const listOf = l => l.map(x => `${nice(x.type)}${x.n > 1 ? ` ${x.n}` : ''}`).join(', ');
  const last = v.last && st.tick - v.last.tick < LINE_TICKS ? v.last : null;
  const side = (key, mine) => {
    const s = v[key], hall = key === 'town' ? 'town hall' : 'camp hall';
    return { name: names[key], pct: s.pct, color: st.clans?.[mine ? me : (attacking ? w.defender : w.attacker)]?.color, ready: s.ready,
      readyText: mine ? 'Your hall can be taken' : 'Hall can be taken', hit: !!last && last.side === key && st.tick - last.tick < HIT_TICKS,
      tip: `${names[key]}: morale ${s.pct} of 100. Standing: ${listOf(s.up) || 'nothing'}. Down: ${listOf(s.down) || 'nothing'}. Morale falls only when military buildings and the hall are destroyed. Walls, gates, houses and workshops do not count. At 0 the enemy hero can take the ${hall}.` };
  };
  const line = last ? { text: `${last.side === mySide ? 'Your' : 'Enemy'} ${nice(last.type).toLowerCase()} destroyed, morale down ${last.amount}`, good: last.side !== mySide } : null;
  // 8c: a ceasefire while surrender terms are on the table
  const T = w.terms, truce = T ? { text: T.state === 'outcome' ? (attacking ? 'They left: choose what happens to the town' : 'No terms: the attacker is choosing') : `Ceasefire: ${T.by === (attacking ? 'attacker' : 'defender') ? 'you' : foeClan?.name || 'they'} surrendered, terms are on the table`, good: T.by !== (attacking ? 'attacker' : 'defender') } : null;
  return { eyebrow: T ? 'Ceasefire' : 'War', title: `${attacking ? 'Siege' : 'Defence'} of ${t?.name || 'the town'}`, mine: side(mySide, true), foe: side(foeSide, false), line: truce || line, war: w.id };
}
export function createWarBar({ game, heroId, channelOf = () => null }) {
  if (typeof document === 'undefined') return { update() {} };
  if (!document.getElementById('warbarcss')) { const s = document.createElement('style'); s.id = 'warbarcss'; s.textContent = WAR_BAR_CSS; document.head.appendChild(s); }
  const root = document.createElement('div'); root.id = 'warbar'; root.hidden = true; document.body.appendChild(root);
  let shown = '';
  function update() {
    const m = warBarModel(game, heroId);
    if (!m) { if (!root.hidden) { root.hidden = true; shown = ''; } return; }
    m.channel = channelOf(m.war) || null;
    const html = warBarHtml(m);
    if (html !== shown) { root.innerHTML = html; shown = html; }
    root.hidden = false;
  }
  return { update };
}
