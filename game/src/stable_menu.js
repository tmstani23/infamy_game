// The stable menu (Tim 2026-11-07): click one of your stables (the inspection card's Open stable, or the town
// panel's) or Space beside it. Buy horses, rickshaws and omnibuses for this town's stock, one at a time on its
// production bar; how many you can have comes from your stables' town tiers (sim/frontier/stable.js room()).
// Your horses: pick which one is your mount. Number keys buy in the order shown; Esc / Space close.
export function createStableMenu({ panel, game, heroId, send, data }) {
  let open = false, townId = null, shown = '';
  const hero = () => game.state.entities[heroId];
  const owner = () => hero()?.owner;
  const S = () => game.frontier?.stable;
  const C = () => data?.buildings?.stable?.stable || {};
  const town = () => game.state.frontier?.settlements?.[townId];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const builtStable = s => s?.owner === owner() && s.buildings?.find(b => b.type === 'stable' && b.stage === 'built');
  // standing beside one of your built stables, out on the island
  function nearStable() {
    const h = hero(), st = S();
    if (!h || h.place !== 'world' || h.aboard || !st) return null;
    const reach = (data?.townGrid?.cellSize || 11) + 5;
    for (const s of Object.values(game.state.frontier?.settlements || {})) {
      const b = builtStable(s); if (!b) continue;
      const [x, z] = st.centre(s, b);
      if (Math.hypot(h.x - x, h.z - z) <= reach) return s.id;
    }
    return null;
  }
  const kinds = () => Object.entries(C().kinds || {});
  const cost = c => Object.entries(c || {}).map(([r, n]) => `${n} ${r}`).join(', ');
  const NAMES = { horse: 'Horses', rickshaw: 'Rickshaws', omnibus: 'Omnibuses' };
  const LABEL = { rickshaw: 'Rickshaw · 2 seats, 3.5x speed', omnibus: 'Omnibus · 8 seats, 3x speed, 800 health: settlers and workers ride here' };
  function options() {
    const s = town(), st = S(), me = owner();
    if (!s || !st) return [];
    return kinds().map(([k, spec]) => {
      const cat = st.category(k), room = st.room(me, cat), have = st.have(me, cat);
      const short = Object.entries(spec.cost || {}).filter(([r, n]) => (s.stock?.[r] || 0) < n).map(([r, n]) => `${n - Math.floor(s.stock?.[r] || 0)} ${r}`).join(', ');
      const why = have >= room ? (room ? `Full: your stables hold ${room} ${NAMES[cat].toLowerCase()}` : 'No room yet: upgrade this town') : short ? `Short of ${short}` : '';
      return { k, spec, cat, why };
    });
  }
  function buy(k) {
    const s = town(); if (!s) return;
    const vehicle = C().kinds?.[k]?.vehicle;
    send({ id: heroId, type: 'frontier', action: 'stable', town: s.id, ...(vehicle ? { mode: k } : { mode: 'horse', kind: k }) });
  }
  panel.addEventListener('click', e => {
    const b = e.target.closest?.('button'); if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.close !== undefined) return close();
    if (d.buy) buy(d.buy);
    if (d.cancel) send({ id: heroId, type: 'frontier', action: 'stable', town: townId, mode: 'cancel' });
    if (d.choose) send({ id: heroId, type: 'frontier', action: 'stable', town: townId, mode: 'choose', horse: d.choose });
  });
  function close() { open = false; panel.hidden = true; shown = ''; }
  function openFor(id) { if (!builtStable(game.state.frontier?.settlements?.[id])) return; townId = id; open = true; update(); }
  function pick(i) { if (!open) return; const o = options().filter(o => !o.why)[i]; if (o) buy(o.k); }
  function update() {
    if (!open) { panel.hidden = true; return; }
    const s = town(), b = builtStable(s), st = S(), me = owner();
    if (!b || !st) return close();
    const jobs = b.stableJobs || [], j = jobs[0];
    const bar = j ? `<div class="row"><span style="display:inline-block;width:90px;height:8px;background:#3a2f1e;border:1px solid #5c4a2c"><i style="display:block;height:100%;width:${Math.round(100 * (1 - j.left / j.total))}%;background:#ffd34d"></i></span><span>${esc(C().kinds?.[j.kind]?.name || j.kind)} ${Math.ceil(j.left / 20)} s${jobs.length > 1 ? ` (+${jobs.length - 1} waiting)` : ''}</span></div>` : '<p>Nothing being made.</p>';
    const room = ['horse', 'rickshaw', 'omnibus'].map(c => `${NAMES[c]} <b>${st.have(me, c)}</b> / ${st.room(me, c)}`).join(' · ');
    let k = 0;
    const rows = options().map(o => `<button data-buy="${esc(o.k)}"${o.why ? ` disabled title="${esc(o.why)}"` : ''}>${o.why ? '' : `${++k}. `}${esc(LABEL[o.k] || `${o.spec.name} (horse)`)} · ${esc(cost(o.spec.cost))} · ${o.spec.seconds} s${o.why ? ` · ${esc(o.why)}` : ''}</button>`).join('');
    const myClan = game.state.clans?.[me];
    const horses = Object.values(game.state.entities).filter(u => u.type === 'horse' && u.horseOwner === me && !u.dead);
    let html = `<h3>STABLE · ${esc(s.name)}</h3>${bar}<h3>BUY</h3><div class="row">${rows}</div>`
      + (jobs.length ? `<div class="row"><button data-cancel="1">Cancel the last job (refunded)</button></div>` : '')
      + `<p>Yours, all stables: ${room}. Room grows with each town's tier.</p>`;
    if (horses.length) html += `<h3>YOUR HORSES</h3><div class="row">${horses.map(x => `<button data-choose="${esc(x.id)}"${myClan?.mount === x.id ? ' disabled' : ''}>${esc(x.name || 'Horse')}${myClan?.mount === x.id ? ' (your mount)' : ''}</button>`).join('')}</div><p>Click a horse to make her your mount (H rides or calls her).</p>`;
    html += `<div class="row"><button data-close>Close</button></div><div class="waiting">number keys buy · Space / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
    panel.hidden = false;
  }
  return { update, close, pick, openFor, isOpen: () => open, at: () => !!nearStable(), toggle() { if (open) return close(); const id = nearStable(); if (id) openFor(id); } };
}
