// The Vehicles panel (Tim 2026-11-07): Shift+Y or the Vehicles icon. Menu restyle 2026-11-10: shared shell, a tab per kind, pages. Every horse, rickshaw and omnibus you own: where it is,
// who is aboard, and Look (camera), Select (vehicles: they take crew orders), Call (horses), Recall (back to your
// nearest stable and stored there) or Take out (parked beside its stable). Commands: sim/vehicle_garage.js,
// sim/mounts.js whistle. Room per stable comes from the town tiers (sim/frontier/stable.js).
// Your horses and vehicles with name, status and where, in words (also used by the stable menu).
export function listVehicles(game, heroId) {
  const hero = () => game.state.entities[heroId];
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
    if (e.stored) return e.stored.town === 'capital' ? 'In the capital stable' : `In the stable at ${st.frontier?.settlements?.[e.stored.town]?.name || 'your town'}`;
    if (e.place !== 'world') return 'Away';
    let near = null;
    for (const t of Object.values(st.frontier?.settlements || {})) { const d = Math.hypot(t.x - e.x, t.z - e.z); if (d < 220 && (!near || d < near.d)) near = { t, d }; }
    const far = h && h.place === 'world' ? `, ${Math.round(Math.hypot(h.x - e.x, h.z - e.z))} from you` : '';
    return (near ? `In ${near.t.name}` : 'Out on the island') + far;
  }
  function status(e) {
    const st = game.state, me = hero();
    if (e.recall) return 'heading back to the stable';
    if (e.type === 'horse') return e.rider ? (e.rider === heroId ? 'you ride her' : `${st.entities[e.rider]?.name || 'crew'} rides her`) : e.called ? 'coming to you' : (st.clans?.[me?.owner]?.mount === e.id ? 'your mount' : '');
    const n = Object.values(st.entities).filter(u => u.aboard === e.id).length;
    return n ? `${n} aboard${e.driver === heroId ? ', you drive' : ''}` : 'empty';
  }
  const k = { horse: 0, rickshaw: 0, omnibus: 0 };
  return mine().map(({ e, kind }) => ({ e, kind, name: e.type === 'horse' ? e.name || 'Horse' : `${e.type === 'omnibus' ? 'Omnibus' : 'Rickshaw'} ${++k[kind]}`, status: status(e), where: where(e) }));
}

import { msInstall, msShell, msAside, msArt, msSec, msRow, msBtn, msPager, msNote, msEsc } from './menu_shell.js';
const PER = 5, KINDS = ['horse', 'rickshaw', 'omnibus'];

export function createVehiclesPanel({ root, game, heroId, send, view, crewInput }) {
  let open = false, shown = '', tab = 'horse', page = 0;
  const hero = () => game.state.entities[heroId];
  const NAMES = { horse: 'Horses', rickshaw: 'Rickshaws', omnibus: 'Omnibuses' };
  const mine = () => listVehicles(game, heroId);
  msInstall(root, () => close());
  root.addEventListener('click', ev => {
    const b = ev.target.closest?.('button'); if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.vtab) { tab = d.vtab; page = 0; shown = ''; return update(); }
    if (d.vpage) { page += Number(d.vpage); shown = ''; return update(); }
    const e = d.id && game.state.entities[d.id];
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
    const count = c => list.filter(r => r.kind === c).length;
    if (!count(tab)) tab = KINDS.find(count) || tab;
    const coins = KINDS.map(c => ({ v: S ? `${S.have(me, c)}/${S.room(me, c)}` : count(c), label: NAMES[c], red: c === tab,
      tip: 'Owned and room: all your stables together, by each town tier. Buy more in a stable menu.' }));
    const aside = msAside({ art: msArt('stable'), label: 'Your stables', labelTip: 'Room: all your stables together, by each town tier. Buy more in a stable menu.', coins });
    let body = `<div class="ms-tabs">${KINDS.map(c => `<button class="ms-tab${c === tab ? ' on' : ''}" data-vtab="${c}">${NAMES[c]} ${count(c)}</button>`).join('')}</div>`;
    const rows = list.filter(r => r.kind === tab), pages = Math.max(1, Math.ceil(rows.length / PER)); page = Math.max(0, Math.min(page, pages - 1));
    body += msSec(NAMES[tab], rows.length ? `${rows.length} owned` : '');
    body += rows.slice(page * PER, page * PER + PER).map(({ e, name, status: s, where: w }) => {
      const id = msEsc(e.id), out = !e.stored && e.place === 'world';
      const btns = [
        out ? msBtn({ label: 'Look', data: `data-act="look" data-id="${id}"`, hover: 'Move the camera to it' }) : '',
        e.type !== 'horse' && out ? msBtn({ label: 'Select', data: `data-act="select" data-id="${id}"`, hover: 'Select it: loaded ones take crew orders' }) : '',
        e.type === 'horse' ? msBtn({ label: 'Call', data: `data-act="whistle" data-id="${id}"`, off: !onIsland, hover: onIsland ? 'Make her your mount and call her: she gallops to you (from far off she turns up a little way away first)' : 'Island only' }) : '',
        e.stored ? msBtn({ label: 'Take out', data: `data-act="takeout" data-id="${id}"`, go: true, hover: 'Parked beside its stable' }) : msBtn({ label: 'Recall', data: `data-act="recall" data-id="${id}"`, off: !!e.recall, hover: 'Riders get off; it goes back to your nearest stable and is stored there' }),
      ].join('');
      return msRow({ name: msEsc(name) + (s ? ` <span class="ms-small">${msEsc(s)}</span>` : ''), sub: msEsc(w), right: btns });
    }).join('') || msNote('No horses or vehicles yet. Build a stable in one of your towns, then click it to buy them.');
    if (pages > 1) body += msPager(pages, page, 'data-vpage');
    body += msNote('Shift+Y or Esc closes.');
    const html = msShell({ eyebrow: 'Horses and vehicles', title: 'Vehicles', escTip: 'Close (Shift+Y or Esc)', aside, body });
    if (html !== shown) { root.innerHTML = html; shown = html; }
    root.hidden = false;
  }
  return { update, close, isOpen: () => open, toggle() { open = !open; if (!open) close(); else update(); } };
}
