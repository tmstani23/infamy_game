// Rickshaw travel menu (Tim 2026-11-06): Space at your omnibus station on the island, or at the rickshaw
// stand inside the city gate, lists where you can go (sim/station_travel.js destinations). A click sends
// { type: 'rickshaw', to }. Closes when you walk away, after a trip, or on Esc / Space.
export function createStationMenu({ panel, game, heroId, send }) {
  let open = false, shown = '';
  const hero = () => game.state.entities[heroId];
  const trip = () => game.stationTravel?.destinations(hero()) || null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  panel.addEventListener('click', e => {
    const to = e.target.dataset?.to;
    if (to === 'close') return close();
    if (to) { send({ id: heroId, type: 'rickshaw', to }); close(); }
  });
  function update() {
    const t = open && trip();
    if (open && !t) open = false;
    panel.hidden = !open;
    if (!open) return;
    const rows = t.list.length ? t.list.map(d => `<button data-to="${esc(d.id)}"${t.rickshaws ? '' : ' disabled'}>${esc(d.name)}</button>`).join('')
      : '<p>No other station yet: build an omnibus station in another of your towns.</p>';
    const html = `<h3>RICKSHAWS · ${esc(t.here)}</h3><p>${t.rickshaws ? `${t.rickshaws} rickshaw${t.rickshaws > 1 ? 's' : ''} waiting, 2 seats each: you and your followers go at once.` : 'No rickshaw waiting here. Build one at an omnibus station (town panel).'}</p>`
      + `<div class="row">${rows}</div><div class="row"><button data-to="close">Close</button></div><div class="waiting">Space / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }
  function close() { open = false; update(); }
  return { update, close, isOpen: () => open, toggle() { open = !open && !!trip(); update(); }, at: () => !!trip() };
}
