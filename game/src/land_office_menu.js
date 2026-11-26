// Land Office panel (frontier E1, 2026-11-05), opened with Space at the telegraph office's door ring.
// Same look as the police and clinic menus (the shared menu shell, menu restyle 2026-11-10). Reads the state and sends
// commands only: 'landOffice' { action: 'permit' } and 'hire' { business: <Land Office>, unit: 'settler', count }; the rules
// are in sim/frontier/land_office.js and sim/clans.js. Keys: 1 = buy the permit, 2 = hire all the settlers
// a town still needs (2026-11-20: the full amount is the only choice).
import { msInstall, msShell, msAside, msArt, msSec, msRow, msBtn, msNote, msConcept, msEsc } from './menu_shell.js';
export function createLandOfficeMenu({ panel, game, heroId, units, send }) {
  let open = false, shown = '';
  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans[hero()?.owner];
  const L = () => game.landOffice;
  const at = () => !!L() && L().atOffice(hero());
  // settlers a town still needs: the founding number less those you have and those signing up
  const missing = () => { const c = clan(); if (!c) return 0;
    const have = game.clans.settlersOf(c.id).length + (c.settlersWaiting || 0), queued = c.queue.filter(q => q.unit === 'settler').length;
    return Math.max(0, (game.frontier?.data?.founding?.minSettlers ?? 5) - have - queued); };

  function pick(i) {
    const h = hero(), b = L()?.office();
    if (!open || !h || !b || !at()) return;
    if (i === 0) send({ id: h.id, type: 'landOffice', action: 'permit' });
    const n = missing();
    if (i === 1 && n) send({ id: h.id, type: 'hire', business: b.id, unit: 'settler', count: n });
  }
  msInstall(panel, () => close());
  panel.addEventListener('click', e => {
    const i = e.target.closest?.('[data-pick]')?.dataset.pick ?? e.target.dataset?.pick;
    if (i !== undefined) { pick(Number(i)); e.target.blur?.(); }
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
    // requirements as small chips: green when met, red when not
    const reqs = st.rows.map(r => `<span class="ms-chip${r.ok ? '' : ' short'}" style="padding:0 7px">${msEsc(r.label)} ${r.have} of ${r.need}</span>`).join('');
    const permit = msSec('Founding permit', c.permit ? 'Held' : '', `Founding a town costs ${F.cost ?? 0} ryo more when you found it. One permit at a time; it is used up when you found a town.`)
      + (c.permit ? msRow({ name: 'Founding permit held', sub: 'Go out through the island gate: your settlers come along', subClass: 'ms-good' })
        : msRow({ key: 1, name: 'Buy a founding permit', sub: `Founding itself costs ${F.cost ?? 0} ryo`, hover: st.reason || '',
          right: msBtn({ label: st.ryo ? `${st.ryo} ryo` : 'Buy', data: 'data-pick="0"', go: st.ok, off: !st.ok, hover: st.reason || '' }) })
          + `<div class="ms-chips">${reqs}</div>` + (st.reason && st.reason !== 'Requirements not met' ? msNote(st.reason) : ''));
    const cap = units.rules.settlers?.max ?? Infinity, full = have + queued >= cap;   // 2026-11-06: 5 is all a new town takes
    const canHire = n => price !== null && c.ryo >= price * n && queued + n <= maxQ && have + queued + n <= cap;
    const face = msConcept('laborer') || '';
    const settlers = msSec('Settlers', `${have}${queued ? ` and ${queued} signing up` : ''}${full ? `, ${cap} is the most` : ''}`,
      `Settlers are unarmed and do not count as crew. ${F.minSettlers ?? 5} found a town. They wait safely at your HQ and all come along through the island gate.`)
      + (price === null ? msNote('Settlers sign up in campaign games only')
        : missing() ? msRow({ key: 2, thumb: face, name: `Hire ${missing()} settler${missing() > 1 ? 's' : ''}`, sub: `Enough to found a town. ${t.hp || 0} hp each, unarmed, wait at your HQ`,
          right: msBtn({ label: `${price * missing()} ryo`, data: 'data-pick="1"', go: true, off: !canHire(missing()) }) })
        : msRow({ thumb: face, name: 'Settlers ready', sub: 'Enough to found a town', subClass: 'ms-good' }));
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? msNote(c.notice.text, true) : '';
    const aside = msAside({ art: msArt('telegraph_office'), label: 'Telegraph office', coins: [
      { v: Math.floor(c.ryo), label: 'Ryo', red: true, tip: "Your clan's ryo" },
      { v: have + queued, label: 'Settlers', tip: 'Settlers you have, counting the ones signing up' }] });
    const html = msShell({ eyebrow: 'Frontier land', title: 'Land Office', escTip: 'Close (Space or Esc). Number keys pick.', aside, body: permit + settlers + notice });
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }
  function close() { open = false; update(); }

  return {
    update, pick,
    isOpen: () => open,
    toggle() { open = !open && at(); update(); },
    close,
  };
}
