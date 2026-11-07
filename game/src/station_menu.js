// The island travel menu (Tim 2026-11-06): Space on the island at your omnibus station (which doubles as the
// railway station) or at the island end of the gate. Trains (Tim 2026-11-07, train plan step 4): board one standing
// here, see when the next one comes in, lay track to another of your towns (sim/frontier/rail.js). While you ride,
// the panel stays up with Skip (Space or the button, after a few seconds; number keys do nothing while you ride). Instant rickshaw trips are off (rickshaws are
// driven like the omnibus). Space beside or inside your omnibus away from the gate adds "Drive back to the gate"
// (sim/omnibus.js home). The city side is the island gate menu (src/site_menu.js). Closes when you walk away, or on
// Esc / Space. Number keys board the trains standing here; Drive back to the gate is click only (Tim 2026-11-07:
// a stray number key had jumped him back from a frontier station).
export function createStationMenu({ panel, game, heroId, send }) {
  let open = false, shown = '';
  const hero = () => game.state.entities[heroId];
  const onIsland = () => hero()?.place === 'world';
  const trip = () => onIsland() ? game.stationTravel?.destinations(hero()) || null : null;
  const rail = () => game.frontier?.rail;
  const riding = () => String(hero()?.aboard || '').startsWith('rail:');
  // the city's railway station by the gate (Tim 2026-11-07): its door ring opens this menu too (main.js)
  const atCity = () => { const h = hero(), st = game.gate?.station; return !!st && h?.place === 'street' && Math.hypot(h.x - st[0], h.z - st[1]) <= 6; };
  // trains serving the station you stand at (an island station or the city's)
  const trains = () => (onIsland() || atCity()) && !riding() ? rail()?.service(hero()) || [] : [];
  const boardNow = () => trains().filter(s => s.eta === 0);
  const placeName = id => id === 'capital' ? 'the capital' : game.state.frontier?.settlements?.[id]?.name || id;
  // drive back: in your omnibus or rickshaw, or beside one of yours, and not already at the gate
  const homeable = () => {
    const h = hero(), O = game.omnibus, g = game.gate?.island;
    if (!onIsland() || !O || !g || Math.hypot(h.x - g[0], h.z - g[1]) < 24) return false;
    return !!O.of(h) || O.near(h, 6).some(b => b.omnibusOwner === h.owner);
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // railway (train plan step 2): lay track from this station to another of yours, or watch the line being laid
  const here = () => { const h = hero(); return onIsland() ? game.stationTravel?.from(h)?.town || null : null; };
  // a route takes tens of milliseconds, so previews are kept a few seconds instead of worked out every frame
  const previews = new Map();
  const preview = (R, owner, from, to, n) => {
    const key = `${owner}|${from}|${to}|${n}`, c = previews.get(key), now = performance.now();
    if (c && now - c.at < 3000) return c.p;
    const p = R.preview(owner, from, to);
    previews.set(key, { p, at: now });
    if (previews.size > 40) previews.delete(previews.keys().next().value);
    return p;
  };
  const railRows = t => {
    const s = here(), R = rail(), h = hero();
    if (!s || !R) return null;
    const mine = Object.values(game.state.frontier?.rail?.links || {}).filter(l => l.owner === h.owner);
    const building = mine.find(l => !l.done);
    const name = id => id === 'capital' ? 'the capital' : game.state.frontier.settlements[id]?.name || id;
    const targets = [...t.list.map(d => d.id).filter(id => id !== 'capital'), 'capital'].filter(id => id !== s.id && !mine.some(l => (l.from === s.id && l.to === id) || (l.to === s.id && l.from === id)));
    return { building, name, offers: building ? [] : targets.map(id => ({ id, p: preview(R, h.owner, s.id, id, mine.length) })) };
  };
  const skip = () => send({ id: heroId, type: 'frontier', action: 'rail', mode: 'skip' });
  const go = to => { if (to === 'skip') return skip();
    if (to?.startsWith('board:')) { send({ id: heroId, type: 'frontier', action: 'rail', mode: 'board', train: to.slice(6) }); return close(); }
    if (to?.startsWith('rail:')) { send({ id: heroId, type: 'frontier', action: 'rail', mode: 'link', town: here().id, to: to.slice(5) }); return close(); }
    if (to?.startsWith('railcancel:')) { send({ id: heroId, type: 'frontier', action: 'rail', mode: 'cancel', link: to.slice(11) }); return close(); }
    if (to === 'home') send({ id: heroId, type: 'omnibus', action: 'home' }); close(); };
  panel.addEventListener('click', e => {
    const to = e.target.dataset?.to;
    if (to === 'close') return close();
    if (to) go(to);
  });
  function pick(i) {
    if (riding() || !open) return;
    const opts = boardNow().map(s => `board:${s.train}`);
    if (opts[i]) go(opts[i]);
  }
  // on the train: where to, how long, Skip
  function ridePanel() {
    const h = hero(), t = game.state.frontier?.rail?.trains?.[h.railRide?.train], l = t && game.state.frontier.rail.links[t.link];
    if (!t || !l) return '<h3>ON THE TRAIN</h3>';
    const to = t.dir > 0 ? l.to : l.from, left = Math.ceil((Math.max(0, t.wait) + Math.abs((t.dir > 0 ? l.length : 0) - t.d) / Math.max(1, t.speed) * 20) / 20);
    const wait = Math.max(0, (game.frontier.data?.railways?.ride?.skipSeconds ?? 5) - Math.floor((game.state.tick - (h.railRide.since ?? 0)) / 20));
    return `<h3>ON THE TRAIN · to ${esc(placeName(to))}</h3><p>${t.wait > 0 ? 'Standing at the platform' : 'Under way'}, about ${left} s to go. Your crew aboard come along.</p>`
      + `<div class="row"><button data-to="skip"${wait ? ' disabled' : ''}>Skip to ${esc(placeName(to))}${wait ? ` (in ${wait} s)` : ''}</button></div><div class="waiting">Space skip</div>`;
  }
  function update() {
    if (riding()) { panel.hidden = false; const html = ridePanel(); if (html !== shown) { panel.innerHTML = html; shown = html; } return; }
    const t = open && trip(), home = open && homeable(), tr = open ? trains() : [];
    if (open && !t && !home && !tr.length && !atCity()) open = false;
    panel.hidden = !open;
    if (!open) return;
    const now = tr.filter(s => s.eta === 0), next = tr.filter(s => s.eta > 0 && !now.some(n => n.to === s.to));
    const name = t?.here || (atCity() ? 'The capital' : tr[0] ? placeName(tr[0].at) : '');
    let k = 0, html = `<h3>${name ? `STATION · ${esc(name)}` : 'YOUR OMNIBUS'}</h3>`;
    if (home) html += `<div class="row"><button data-to="home">Drive back to the gate (click)</button></div><p>At once, everyone aboard; it parks outside the island gate. Not with a fight on.</p>`;
    if (now.length || next.length) {
      html += '<h3>TRAINS</h3><div class="row">' + now.map(s => `<button data-to="board:${esc(s.train)}"${s.riders >= s.seats ? ' disabled' : ''}>${++k}. Board the train to ${esc(s.toName)} (${s.seats - s.riders} seats)</button>`).join('')
        + next.map(s => `<button disabled>Train to ${esc(s.toName)} in ${s.eta < 90 ? `${s.eta} s` : `${Math.round(s.eta / 60)} min`}</button>`).join('') + '</div><p>You and the crew following you get on. Ride along, or Skip after a few seconds.</p>';
    } else if (atCity()) html += '<p>No train here yet: lay track to the capital from the station in one of your towns.</p>';
    else if (t) html += `<p>${Object.values(game.state.frontier?.rail?.links || {}).some(l => l.owner === hero().owner && !l.done) ? 'No train here yet: it starts once the line is laid.'
      : t.list.length ? 'No train here yet: lay track to another of your towns below.' : 'No other station yet: build an omnibus station in another of your towns.'}</p>`;
    const r = t && railRows(t);
    if (r) {
      html += '<h3>RAILWAY</h3>';
      if (r.building) {
        const b = r.building, pct = Math.floor(100 * b.built / b.length), mins = Math.ceil((1 - b.built / b.length) * (game.frontier.data?.railways?.link?.seconds ?? 600) / 60);
        html += `<p>Laying track: ${esc(r.name(b.from))} to ${esc(r.name(b.to))}, ${pct}% (about ${mins} min left)${b.waiting ? `, <b>waiting for ${esc(b.waiting)}</b>` : ''}.</p><div class="row"><button data-to="railcancel:${esc(b.id)}">Stop laying (track so far is lost)</button></div>`;
      } else if (r.offers.length) {
        html += '<div class="row">' + r.offers.map(o => o.p.error ? `<button disabled title="${esc(o.p.error)}">Lay track to ${esc(r.name(o.id))}: ${esc(o.p.error)}</button>`
          : `<button data-to="rail:${esc(o.id)}">Lay track to ${esc(r.name(o.id))} · ${Math.round(o.p.line.length)} long · 10 min · ${Object.entries(o.p.cost).map(([k, v]) => `${v} ${k}`).join(', ')}</button>`).join('') + '</div><p>The game picks the route. Paid a stretch at a time from this town\'s stock.</p>';
      } else html += '<p>All your stations here are linked.</p>';
    }
    html += `<div class="row"><button data-to="close">Close</button></div><div class="waiting">number keys pick · Space / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }
  function close() { open = false; update(); }
  const at = () => riding() || !!trip() || homeable() || trains().length > 0;
  return { update, close, pick, riding, isOpen: () => open || riding(), toggle() { if (riding()) return skip(); open = !open && (at() || atCity()); update(); }, at };
}
