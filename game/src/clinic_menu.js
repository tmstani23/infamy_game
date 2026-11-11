// Clinic panel, opened with Space at the clinic's door ring. Reads the game state and sends
// 'clinic' commands only; the rules in sim/clans.js (clinicMenu) decide what happens.
// Look: the shared menu shell (menu_shell.js, menu restyle 2026-11-10).
import { msInstall, msShell, msAside, msArt, msSec, msRow, msBtn, msPager, msNote, msConcept, msEsc } from './menu_shell.js';
import { portrait } from './portraits.js';
const title = s => s[0].toUpperCase() + s.slice(1);
const PER = 5;   // patients a page (no scrollbars, Tim 2026-11-08)

export function createClinicMenu({ panel, game, heroId, send, selected = () => [], catalog = null }) {
  let open = false, shown = '', armedRelease = null, page = 0;

  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans[hero()?.owner];
  const access = () => game.serviceAt ? game.serviceAt(heroId, 'clinic', selected()) : game.doorNear(heroId)?.menu === 'clinic' ? { actor: hero() } : null;
  const atDoor = () => !!access();
  const face = (unit, model) => msConcept(model || unit) || (catalog && typeof document !== 'undefined' ? portrait(catalog, model || unit, () => { shown = ''; }) : null) || '';

  // 1 = heal, 2 and up = revive the patients in the list (in order)
  function pick(i) {
    const c = clan();
    const h = access()?.actor;
    if (!open || !c || !h) return;
    if (i === 0) { send({ id: h.id, type: 'clinic', action: 'heal' }); return; }
    const patients = c.clinic.map((p, k) => ({ p, k })).filter(({ p }) => p.kind === 'recover');
    if (patients[i - 1]) send({ id: h.id, type: 'clinic', action: 'revive', patient: patients[i - 1].k });
  }

  function release(i) {
    const h = access()?.actor, c = clan();
    if (!open || !h || !c || !c.clinic[i]) return;
    if (armedRelease !== i) { armedRelease = i; shown = ''; update(); return; }
    armedRelease = null;
    send({ id: h.id, type: 'clinic', action: 'release', patient: i });
  }

  msInstall(panel, () => close());
  panel.addEventListener('click', e => {
    const releaseIndex = e.target.closest?.('[data-release]')?.dataset.release;
    if (releaseIndex !== undefined) { release(Number(releaseIndex)); e.target.blur?.(); return; }
    const turn = e.target.closest?.('[data-clinic-page]')?.dataset.clinicPage;
    if (turn) { page += Number(turn); shown = ''; update(); return; }
    const i = e.target.closest?.('[data-pick]')?.dataset.pick ?? e.target.dataset?.pick;
    if (i !== undefined) { pick(Number(i)); e.target.blur?.(); }
  });

  function update() {
    const c = clan(), h = access()?.actor;
    if (!atDoor()) open = false;
    panel.hidden = !open;
    if (!open || !c || !h) return;
    const { who, cost } = game.clans.healCost(h);
    // hit in the last few seconds: the clinic waits until the fight is over (Tim 2026-10-20)
    const hitW = Math.ceil(game.clans.hitWait?.(h) || 0), off = hitW > 0;
    const heal = msSec('Heal', hitW > 0 ? `Opens in ${hitW} s` : '', 'Clan members near the door are healed to full. Anyone hit in the last 5 s waits.')
      + msRow({ key: 1, name: who.length ? `Heal ${who.length} hurt` : 'Nobody hurt', sub: hitW > 0 ? 'You were hit: wait for the fight to end' : 'Clan members near the door, to full', subClass: hitW > 0 ? 'ms-bad' : '',
        right: msBtn({ label: who.length ? `${cost} ryo` : 'Heal', data: 'data-pick="0"', go: !!who.length, off: !(who.length && c.ryo >= cost && !off) }) });
    let n = 0;
    const rows = c.clinic.map((p, index) => {
      const releaseButton = msBtn({ label: armedRelease === index ? 'Confirm' : 'Release', data: `data-release="${index}"`, go: armedRelease === index, hover: 'Send them home and free their clinic slot. Click twice.' });
      const thumb = face(p.unit, p.model);
      if (p.kind !== 'recover') return msRow({ thumb, name: msEsc(title(p.unit)), sub: `Healing, out in ${Math.ceil(p.left)} s`, right: releaseButton });
      n++;
      const now = game.clans.reviveCost(p, c.id), wait = p.left > 0 ? `Downed, ${p.cost} ryo in ${Math.ceil(p.left)} s` : 'Recovered, waiting for you';
      return msRow({ key: n + 1 <= 9 ? n + 1 : null, thumb, name: msEsc(title(p.unit)), sub: wait,
        right: msBtn({ label: `Revive ${now}`, data: `data-pick="${n}"`, go: true, off: !(c.ryo >= now && !off) }) + releaseButton });
    });
    const pages = Math.max(1, Math.ceil(rows.length / PER)); page = Math.max(0, Math.min(page, pages - 1));
    const patients = msSec('Patients', `${c.clinic.length} in the clinic`, 'Downed crew recover here. Revive them for ryo, or release them to free a slot.')
      + (rows.length ? rows.slice(page * PER, page * PER + PER).join('') + msPager(pages, page, 'data-clinic-page') : msNote('No crew in the clinic'));
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? msNote(c.notice.text, true) : '';
    const aside = msAside({ art: msArt('clinic'), label: 'Bonesetter', coins: [
      { v: Math.floor(c.ryo), label: 'Ryo', red: true, tip: "Your clan's ryo" },
      { v: c.clinic.length, label: 'Patients', tip: 'Your crew in the clinic' }] });
    const html = msShell({ eyebrow: 'Town clinic', title: "Bonesetter's clinic", escTip: 'Close (Space or Esc). Number keys pick.', aside, body: heal + patients + (armedRelease !== null ? msNote('Click release again to confirm', true) : '') + notice });
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }
  function close() { open = false; update(); }

  return {
    update, pick,
    isOpen: () => open,
    toggle() { open = !open && atDoor(); page = 0; update(); },
    close,
  };
}
