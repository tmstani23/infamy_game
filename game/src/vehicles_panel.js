// The Vehicles panel (Tim 2026-11-07): Shift+Y or the ⛟ icon. Every horse, rickshaw and omnibus you own: where it is,
// who is aboard, and Look (camera), Select (vehicles: they take crew orders), Whistle (horses), Recall (back to your
// nearest stable and stored there) or Take out (parked beside its stable). Commands: sim/vehicle_garage.js,
// sim/mounts.js whistle. Room per stable comes from the town tiers (sim/frontier/stable.js).
export function createVehiclesPanel({ root, game, heroId, send, view, crewInput }) {
  let open = false, shown = '';
  const hero = () => game.state.entities[heroId];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NAMES = { horse: 'Horses', rickshaw: 'Rickshaws', omnibus: 'Omnibuses' };
  function mine() {
    const me = hero()?.owner, list = [];
    for (const e of Object.values(game.state.entities)) {
      if (e.dead) continue;
      if (e.type === 'horse' && e.horseOwner === me) list.push({ e, kind: 'horse' });
      else if ((e.type === 'rickshaw' || e.type === 'omnibus') && e.omnibusOwner === me) list.push({ e, kind: e.type });
    }
    return list;
  }
  // where it is, in words
  function where(e) {
    const st = game.state, h = hero();
    if (e.stored) return `In the stable at ${st.frontier?.settlements?.[e.stored.town]?.name || 'your town'}`;
    if (e.place !== 'world') return 'Away';
    let near = null;
    for (const t of Object.values(st.frontier?.settlements || {})) { const d = Math.hypot(t.x - e.x, t.z - e.z); if (d < 220 && (!near || d < near.d)) near = { t, d }; }
    const far = h && h.place === 'world' ? ` · ${Math.round(Math.hypot(h.x - e.x, h.z - e.z))} from you` : '';
    return (near ? `In ${near.t.name}` : 'Out on the island') + far;
  }
  function status(e) {
    const st = game.state, me = hero();
    if (e.recall) return 'heading back to the stable';
    if (e.type === 'horse') return e.rider ? (e.rider === heroId ? 'you ride her' : `${st.entities[e.rider]?.name || 'crew'} rides her`) : e.called ? 'coming to you' : (st.clans?.[me?.owner]?.mount === e.id ? 'your mount' : '');
    const n = Object.values(st.entities).filter(u => u.aboard === e.id).length;
    return n ? `${n} aboard${e.driver === heroId ? ', you drive' : ''}` : 'empty';
  }
  root.addEventListener('click', ev => {
    const b = ev.target.closest?.('button'); if (!b || b.disabled) return;
    const d = b.dataset, e = d.id && game.state.entities[d.id];
    if (d.close !== undefined) return close();
    if (!e) return;
    if (d.act === 'look') view.jumpTo(e.x, e.z);
    if (d.act === 'select') { crewInput.selectUnit(e.id, true); view.jumpTo(e.x, e.z); }
    if (d.act === 'whistle') send({ id: heroId, type: 'mount', whistle: e.id });
    if (d.act === 'recall' || d.act === 'takeout') send({ id: heroId, type: 'garage', action: d.act, unit: e.id });
  });
  for (const t of ['mousedown', 'mouseup', 'contextmenu', 'wheel']) root.addEventListener(t, ev => { ev.stopPropagation(); if (t === 'contextmenu') ev.preventDefault(); });
  function close() { open = false; root.hidden = true; shown = ''; }
  function update() {
    if (!open) return;
    const list = mine(), S = game.frontier?.stable, me = hero()?.owner, onIsland = hero()?.place === 'world';
    let k = { horse: 0, rickshaw: 0, omnibus: 0 }, html = '<header><h3>VEHICLES</h3><button data-close aria-label="Close">✕</button></header>';
    if (S) html += `<p>${['horse', 'rickshaw', 'omnibus'].map(c => `${NAMES[c]} <b>${S.have(me, c)}</b> / ${S.room(me, c)}`).join(' · ')}<br><small>Room: all your stables together, by each town's tier. Buy more in a stable menu.</small></p>`;
    for (const cat of ['horse', 'rickshaw', 'omnibus']) {
      const rows = list.filter(r => r.kind === cat);
      if (!rows.length) continue;
      html += `<h4>${NAMES[cat]}</h4>`;
      for (const { e } of rows) {
        const name = e.type === 'horse' ? e.name || 'Horse' : `${e.type === 'omnibus' ? 'Omnibus' : 'Rickshaw'} ${++k[cat]}`, s = status(e);
        const btns = [
          !e.stored && e.place === 'world' ? `<button data-act="look" data-id="${esc(e.id)}">Look</button>` : '',
          e.type !== 'horse' && !e.stored && e.place === 'world' ? `<button data-act="select" data-id="${esc(e.id)}" title="Select it: loaded ones take crew orders">Select</button>` : '',
          e.type === 'horse' ? `<button data-act="whistle" data-id="${esc(e.id)}"${onIsland ? '' : ' disabled title="Island only"'}>Whistle</button>` : '',
          e.stored ? `<button data-act="takeout" data-id="${esc(e.id)}">Take out</button>` : `<button data-act="recall" data-id="${esc(e.id)}"${e.recall ? ' disabled' : ''} title="Riders get off; it goes back to your nearest stable and is stored there">Recall</button>`,
        ].join('');
        html += `<div class="vrow"><div><b>${esc(name)}</b>${s ? ` · ${esc(s)}` : ''}<br><small>${esc(where(e))}</small></div><div class="vbtns">${btns}</div></div>`;
      }
    }
    if (!list.length) html += '<p>No horses or vehicles yet. Build a stable in one of your towns, then click it to buy them.</p>';
    html += '<div class="waiting">Shift+Y / Esc close</div>';
    if (html !== shown) { root.innerHTML = html; shown = html; }
    root.hidden = false;
  }
  return { update, close, isOpen: () => open, toggle() { open = !open; if (!open) close(); else update(); } };
}
