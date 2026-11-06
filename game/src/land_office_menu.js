// Land Office panel (frontier E1, Tim 2026-11-05), opened with Space at the telegraph office's door ring.
// Same look as the police and clinic menus. Reads the state and sends commands only: 'landOffice'
// { action: 'permit' } and 'hire' { business: <Land Office>, unit: 'settler', count }; the rules are in
// sim/frontier/land_office.js and sim/clans.js. Keys: 1 = buy the permit, 2 = hire a settler, 3 = hire 5.
export function createLandOfficeMenu({ panel, game, heroId, units, send }) {
  let open = false, shown = '';
  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans[hero()?.owner];
  const L = () => game.landOffice;
  const at = () => !!L() && L().atOffice(hero());

  function pick(i) {
    const h = hero(), b = L()?.office();
    if (!open || !h || !b || !at()) return;
    if (i === 0) send({ id: h.id, type: 'landOffice', action: 'permit' });
    if (i === 1 || i === 2) send({ id: h.id, type: 'hire', business: b.id, unit: 'settler', count: i === 1 ? 1 : 5 });
  }
  panel.addEventListener('click', e => {
    const i = e.target.dataset?.pick;
    if (i !== undefined) { pick(Number(i)); e.target.blur(); }
  });

  function update() {
    if (!at()) open = false;
    panel.hidden = !open;
    const c = clan();
    if (!open || !c) return;
    const st = L().permitStatus(c.id), F = game.frontier?.data?.founding || {};
    const price = game.clans.hirePrice(c.id, 'settler'), t = units.types.settler || {};
    const have = game.clans.settlersOf(c.id).length + (c.settlersWaiting || 0), queued = c.queue.filter(q => q.unit === 'settler').length;
    const maxQ = units.rules.settlers?.maxQueue ?? 10;
    const reqs = st.rows.map(r => `<div class="${r.ok ? 'good' : 'bad'}"><small>${r.ok ? '✓' : '✗'} ${r.label} ${r.have} / ${r.need}</small></div>`).join('');
    const permit = c.permit
      ? '<div class="row"><span>Founding permit held<br><small>go out through the island gate: your settlers come along</small></span></div>'
      : `<div class="row"><span>1. Founding permit<br><small>founding itself costs ${F.cost ?? 0} ryo</small></span>` +
        `<button data-pick="0" ${st.ok ? '' : 'disabled'} title="${st.reason || ''}">${st.ryo ? `${st.ryo} ryo` : 'Buy'}</button></div>${reqs}` +
        (st.reason && st.reason !== 'Requirements not met' ? `<div class="waiting">${st.reason}</div>` : '');
    const canHire = n => price !== null && c.ryo >= price * n && queued + n <= maxQ;
    const settlers = price === null ? '<div class="waiting">Settlers sign up in campaign games only</div>'
      : `<div class="row"><span>2. Settler<br><small>${t.hp || 0} hp · unarmed · ${F.minSettlers ?? 5} found a town · wait safely at your HQ</small></span>` +
        `<button data-pick="1" ${canHire(1) ? '' : 'disabled'}>${price} ryo</button></div>` +
        `<div class="row"><span>3. Five settlers</span><button data-pick="2" ${canHire(5) ? '' : 'disabled'}>${price * 5} ryo</button></div>` +
        `<div class="waiting">settlers ${have}${queued ? ` (+${queued} signing up)` : ''}</div>`;
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? `<div class="notice">${c.notice.text}</div>` : '';
    const html = `<h3>LAND OFFICE</h3>${permit}${settlers}${notice}<div class="waiting">number keys or click · Space / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }

  return {
    update, pick,
    isOpen: () => open,
    toggle() { open = !open && at(); update(); },
    close() { open = false; update(); },
  };
}
