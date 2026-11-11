// Police box and police HQ panel, opened with Space at their door rings. Same look as the
// clinic menu (the shared menu shell, menu restyle 2026-11-10). Reads the game state and sends 'police' commands only;
// the rules in sim/police.js (menu) decide what happens.
import { msInstall, msShell, msAside, msArt, msSec, msRow, msBtn, msPager, msNote, msConcept, msEsc } from './menu_shell.js';
import { portrait } from './portraits.js';
const title = s => s[0].toUpperCase() + s.slice(1);
const PER = 6;   // prisoners a page (no scrollbars)

export function createPoliceMenu({ panel, game, heroId, send, selected = () => [], catalog = null }) {
  let open = false, shown = '', location = null, page = 0;

  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans[hero()?.owner];
  const access = () => game.serviceAt ? location ? game.serviceAt(heroId, location, selected())
    : game.serviceAt(heroId, 'police_box', selected()) || game.serviceAt(heroId, 'police_hq', selected())
    : { actor: hero(), door: game.doorNear(heroId) };
  const where = () => { const m = access()?.door?.menu; return m === 'police_box' || m === 'police_hq' ? m : null; };
  const face = (unit, model) => msConcept(model || unit) || (catalog && typeof document !== 'undefined' ? portrait(catalog, model || unit, () => { shown = ''; }) : null) || '';

  // box: 1 = bribe; HQ: 1 and up = bail the jailed crew in the list (in order)
  function pick(i) {
    const c = clan(), w = where();
    const h = access()?.actor;
    if (!open || !c || !w || !h) return;
    if (w === 'police_box' && i === 0) send({ id: h.id, type: 'police', action: 'bribe' });
    if (w === 'police_hq' && c.jail?.[i]) send({ id: h.id, type: 'police', action: 'bail', prisoner: i });
  }

  msInstall(panel, () => close());
  panel.addEventListener('click', e => {
    const turn = e.target.closest?.('[data-police-page]')?.dataset.policePage;
    if (turn) { page += Number(turn); shown = ''; update(); return; }
    const i = e.target.closest?.('[data-pick]')?.dataset.pick ?? e.target.dataset?.pick;
    if (i !== undefined) { pick(Number(i)); e.target.blur?.(); }
  });

  function update() {
    const c = clan(), h = access()?.actor, w = where(), P = game.police;
    if (!w) open = false;
    panel.hidden = !open;
    if (!open || !c || !h || !P) return;
    const tier = P.rules.tiers[P.tierOf(c.id)].name, heat = Math.round(c.heat || 0);
    let body;
    if (w === 'police_box') {
      const cost = P.bribeCost(c.id), blocked = P.bribeBlocked(h);
      body = msSec('Bribe', tier, 'A bribe lowers your heat. Not while the police are hitting you.')
        + msRow({ key: 1, name: 'Bribe the officer', sub: blocked ? 'Not while the police are hitting you' : `Heat down by ${P.rules.bribeHeat}`, subClass: blocked ? 'ms-bad' : '',
          right: msBtn({ label: c.heat > 0 ? `${cost} ryo` : 'No heat', data: 'data-pick="0"', go: c.heat > 0, off: !(c.heat > 0 && c.ryo >= cost && !blocked) }) });
    } else {
      const jail = c.jail || [], pages = Math.max(1, Math.ceil(jail.length / PER)); page = Math.max(0, Math.min(page, pages - 1));
      const rows = jail.map((p, k) => msRow({ key: k < 9 ? k + 1 : null, thumb: face(p.unit, p.model), name: msEsc(title(p.unit)), sub: 'In jail until bailed out',
        right: msBtn({ label: `Bail ${p.bail}`, data: `data-pick="${k}"`, go: true, off: c.ryo < p.bail }) }));
      body = msSec('Jail', `${jail.length} of yours held`, 'Crew the police arrest sit here until you pay their bail.')
        + (rows.length ? rows.slice(page * PER, page * PER + PER).join('') + msPager(pages, page, 'data-police-page') : msNote('None of your crew in jail'));
    }
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? msNote(c.notice.text, true) : '';
    const box = w === 'police_box';
    const aside = msAside({ art: msArt(w), label: box ? tier : 'Jail', labelTip: box ? 'Your heat tier' : 'Your crew held here', coins: [
      { v: Math.floor(c.ryo), label: 'Ryo', red: true, tip: "Your clan's ryo" },
      box ? { v: heat, label: 'Heat', tip: `Heat ${heat}, ${tier}` } : { v: (c.jail || []).length, label: 'In jail', tip: 'Your crew in jail' }] });
    const html = msShell({ eyebrow: box ? `Street police, ${tier}` : 'Police headquarters', title: box ? 'Police box' : 'Police HQ', escTip: 'Close (Space or Esc). Number keys pick.', aside, body: body + notice });
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }
  function close() { open = false; location = null; update(); }

  return {
    update, pick,
    isOpen: () => open,
    toggle(menu = null) { if (menu) location = menu; open = !open && !!where(); page = 0; update(); },
    close,
  };
}
