import { modeRules } from './sim/modes/index.js';
// Top bar standings (Tim 2026-11-10): a clock block and one chip per clan, you first then by rank.
// Campaign: Influence is the big number, Renown the small one. Classic: season points.
// standingsModel reads the state only (no DOM, tested in tools/test_top_bar.mjs).
const RENOWN_WHY = c => c.kind === 'ninja'
  ? 'Renown comes from finished contracts. It counts toward Influence and season points, and unlocks more crew.'
  : 'Renown comes from raids won, shakedowns, paid sweeps, cleared sectors and stopped Shinobi jobs. It counts toward Influence, season points and the founding permit.';
export function standingsModel(game, owner, TICK_RATE = 20) {
  const S = game.state, s = S.season, t = game.territory;
  if (!s || !t) return null;
  const campaign = !modeRules(S).seasonEnds, c0 = S.clans[owner];
  const left = S.clock ? Math.max(0, Math.ceil(S.clock.left / TICK_RATE)) : null;
  const clock = { day: campaign ? `Day ${s.day}` : `Day ${Math.min(s.day, s.cycles)} of ${s.cycles}`,
    time: left == null ? '' : `${S.night ? 'Night' : 'Day'} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`,
    crew: `Crew ${game.clans.crewCount(owner)} of ${game.clans.crewCap(owner)}`, mode: campaign ? 'Campaign' : 'Season',
    hover: `Crew ${game.clans.crewOf(owner).length} in roster (hero and house guards excluded). Occupied slots ${game.clans.crewCount(owner) + (c0?.queue?.length || 0)} of unlocked cap ${game.clans.crewCap(owner)}: roster + clinic ${c0?.clinic?.length || 0} + jail ${c0?.jail?.length || 0} + respawning ${c0?.respawning?.length || 0} + queued hires ${c0?.queue?.length || 0}.` };
  const rows = t.standings().filter(r => S.clans[r.clan]).map(r => {
    const c = S.clans[r.clan], me = r.clan === owner, name = me ? 'You' : (c.name || r.clan).replace(/ clan$/, ''), renown = Math.floor(c.renown || 0);
    if (campaign) {
      const st = game.influence?.status(r.clan) || { value: 0, tier: 0, next: null }, ir = S.influence?.[r.clan];
      return { clan: r.clan, me, name, color: c.color, label: 'Influence', big: st.value, tier: st.tier, renown,
        hover: [`${c.name || r.clan}: Influence ${st.value}, Tier ${st.tier}`,
          `Renown ${renown} + businesses held ${Math.floor(ir?.days || 0)} + town trade ${Math.floor(ir?.trade || 0)}.`,
          st.next ? `Next tier at ${st.next.at}: ${st.next.label}` : 'All Influence tiers reached',
          'Influence is a clan\'s standing in the campaign. Each tier gives better Market prices or one more town permit.',
          RENOWN_WHY(c), 'Click for the full standings.'].join('\n') };
    }
    return { clan: r.clan, me, name, color: c.color, label: 'Points', big: r.score, tier: null, renown,
      hover: [`${c.name || r.clan}: ${r.score} season points`, t.breakdown(r.clan).map(x => `${x.label} ${x.points}`).join(' + ') || 'no businesses', RENOWN_WHY(c), 'Click for the full standings.'].join('\n') };
  });
  rows.sort((a, b) => (b.me - a.me) || (b.big - a.big));
  return { campaign, clock, rows };
}

// paints the model into the #score element; elements are kept and only their text changes, so hovers stay up
export function createStandingsBar(root, onClan = null) {
  let sig = '', parts = null;
  const el = (cls, parent) => { const e = document.createElement('span'); e.className = cls; parent.appendChild(e); return e; };
  const set = (e, k, v) => { if (e[k] !== v) e[k] = v; };
  root.addEventListener('click', ev => { const c = ev.target.closest?.('.tb-clan'); if (c && onClan) onClan(c.dataset.clan); });
  function build(m) {
    root.textContent = ''; root.removeAttribute('title');
    const ck = el('tb-clock', root);
    parts = { ck, day: el('tb-day', ck), time: el('tb-time', ck), crew: el('tb-crew', ck), rows: m.rows.map(r => {
      const chip = el(`tb-clan${r.me ? ' me' : ''}`, root); chip.style.setProperty('--c', r.color || '#888'); chip.dataset.clan = r.clan;
      el('tb-crest', chip);
      const name = el('tb-name', chip), big = el('tb-big', chip), sub = el('tb-sub', chip), ren = el('tb-ren', chip);
      return { chip, name, big, sub, ren };
    }) };
  }
  return function paint(m) {
    if (!m) { if (sig) { root.textContent = ''; sig = ''; } return; }
    const k = m.rows.map(r => r.clan).join('|') + (m.campaign ? 'c' : 's');
    if (k !== sig) { sig = k; build(m); }
    set(parts.day, 'textContent', m.clock.day); set(parts.time, 'textContent', m.clock.time); set(parts.crew, 'textContent', m.clock.crew); set(parts.ck, 'title', m.clock.hover);
    m.rows.forEach((r, i) => { const p = parts.rows[i];
      set(p.name, 'textContent', r.name); set(p.big, 'textContent', String(r.big));
      set(p.sub, 'textContent', r.tier == null ? r.label : `Tier ${r.tier}`);
      set(p.ren, 'textContent', String(r.renown)); set(p.ren, 'hidden', !m.campaign && !r.renown); set(p.chip, 'title', r.hover); });
  };
}

// One clan's full standing for the Standings panel (src/standings_panel.js): coins and rows in plain words.
// rows: { name, sub, right, off }; rows is the paged list (tiers in campaign, point sources in classic).
export function standingsDetail(game, owner, clan) {
  const S = game.state, c = S.clans[clan], t = game.territory;
  if (!c || !t) return null;
  const campaign = !modeRules(S).seasonEnds, renown = Math.floor(c.renown || 0), me = clan === owner;
  const held = Object.values(S.businesses || {}).filter(b => b.owner === clan && !b.hideout).length;
  const base = { clan, me, name: c.name || clan, color: c.color, campaign, renownWhy: RENOWN_WHY(c) };
  if (!campaign) {
    const score = t.standings().find(r => r.clan === clan)?.score ?? 0;
    return { ...base, coins: [{ v: score, label: 'Points', red: true, tip: 'Season points: businesses by weight, Renown and HQ raids. Most points when the season ends wins.' },
      { v: renown, label: 'Renown', tip: base.renownWhy }, { v: held, label: 'Businesses' }, { v: game.clans.crewCount(clan), label: 'Crew' }],
      from: [], next: null, listTitle: 'Where the points come from',
      rows: t.breakdown(clan).map(x => ({ name: x.label, sub: '', right: `${x.points}` })) };
  }
  const st = game.influence?.status(clan) || { value: 0, tier: 0, next: null }, ir = S.influence?.[clan], tiers = game.influence?.tiers?.() || [];
  const prev = st.tier ? tiers[st.tier - 1]?.at || 0 : 0;
  return { ...base, coins: [{ v: st.value, label: 'Influence', red: true, tip: 'A clan\'s standing in the campaign: Renown plus businesses held each day plus town trade. It never goes down.' },
    { v: st.tier, label: 'Tier', tip: 'Each tier gives better Market prices or one more town permit.' }, { v: renown, label: 'Renown', tip: base.renownWhy }, { v: held, label: 'Businesses', tip: 'Businesses held now. Each adds Influence at every dawn.' }],
    from: [{ name: 'Renown', sub: c.kind === 'ninja' ? 'Finished contracts' : 'Raids, shakedowns, sweeps and defence', right: `${renown}` },
      { name: 'Businesses held', sub: 'Added at every dawn for each business', right: `${Math.floor(ir?.days || 0)}` },
      { name: 'Town trade', sub: 'Goods sold at town Markets', right: `${Math.floor(ir?.trade || 0)}` }],
    next: st.next ? { at: st.next.at, label: st.next.label, frac: (st.value - prev) / Math.max(1, st.next.at - prev), left: st.next.at - st.value } : null,
    listTitle: 'Influence tiers',
    rows: tiers.map((x, i) => ({ name: `Tier ${i + 1}: ${x.label}`, sub: i < st.tier ? 'Reached' : `At ${x.at} Influence`, right: i < st.tier ? 'Reached' : `${x.at - st.value} to go`, off: i < st.tier })) };
}
