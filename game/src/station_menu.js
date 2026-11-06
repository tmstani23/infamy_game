// The island travel menu (Tim 2026-11-06): Space on the island at your omnibus station lists where its rickshaws
// can go (sim/station_travel.js destinations); Space beside or inside your omnibus away from the gate adds
// "Drive back to the gate" (sim/omnibus.js home). The city side is the island gate menu (src/site_menu.js).
// Sends { type: 'rickshaw', to } or { type: 'omnibus', action: 'home' }. Closes when you walk away, after a trip,
// or on Esc / Space. Number keys pick: drive back first, then the towns.
export function createStationMenu({ panel, game, heroId, send }) {
  let open = false, shown = '';
  const hero = () => game.state.entities[heroId];
  const onIsland = () => hero()?.place === 'world';
  const trip = () => onIsland() ? game.stationTravel?.destinations(hero()) || null : null;
  // drive back: in your omnibus or rickshaw, or beside one of yours, and not already at the gate
  const homeable = () => {
    const h = hero(), O = game.omnibus, g = game.gate?.island;
    if (!onIsland() || !O || !g || Math.hypot(h.x - g[0], h.z - g[1]) < 24) return false;
    return !!O.of(h) || O.near(h, 6).some(b => b.omnibusOwner === h.owner);
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const go = to => { if (to === 'home') send({ id: heroId, type: 'omnibus', action: 'home' }); else send({ id: heroId, type: 'rickshaw', to }); close(); };
  panel.addEventListener('click', e => {
    const to = e.target.dataset?.to;
    if (to === 'close') return close();
    if (to) go(to);
  });
  function pick(i) {
    if (!open) return;
    const t = trip(), opts = [...(homeable() ? ['home'] : []), ...(t?.rickshaws ? t.list.map(d => d.id) : [])];
    if (opts[i]) go(opts[i]);
  }
  function update() {
    const t = open && trip(), home = open && homeable();
    if (open && !t && !home) open = false;
    panel.hidden = !open;
    if (!open) return;
    let k = 0, html = `<h3>${t ? `RICKSHAWS · ${esc(t.here)}` : 'YOUR OMNIBUS'}</h3>`;
    if (home) html += `<div class="row"><button data-to="home">${++k}. Drive back to the gate</button></div><p>At once, everyone aboard; it parks outside the island gate. Not with a fight on.</p>`;
    if (t) {
      const rows = t.list.length ? t.list.map(d => `<button data-to="${esc(d.id)}"${t.rickshaws ? '' : ' disabled'}>${t.rickshaws ? `${++k}. ` : ''}${esc(d.name)}</button>`).join('')
        : '<p>No other station yet: build an omnibus station in another of your towns.</p>';
      html += `<p>${t.rickshaws ? `${t.rickshaws} rickshaw${t.rickshaws > 1 ? 's' : ''} waiting, 2 seats each: you and your followers go at once.` : 'No rickshaw waiting here. Build one at an omnibus station (town panel).'}</p><div class="row">${rows}</div>`;
    }
    html += `<div class="row"><button data-to="close">Close</button></div><div class="waiting">number keys pick · Space / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }
  function close() { open = false; update(); }
  const at = () => !!trip() || homeable();
  return { update, close, pick, isOpen: () => open, toggle() { open = !open && at(); update(); }, at };
}
