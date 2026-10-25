// Clinic panel, opened with Space at the clinic's door ring. Reads the game state and sends
// 'clinic' commands only; the rules in sim/clans.js (clinicMenu) decide what happens.
const title = s => s[0].toUpperCase() + s.slice(1);

export function createClinicMenu({ panel, game, heroId, send, selected = () => [] }) {
  let open = false, shown = '', armedRelease = null;

  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans[hero()?.owner];
  const access = () => game.serviceAt ? game.serviceAt(heroId, 'clinic', selected()) : game.doorNear(heroId)?.menu === 'clinic' ? { actor: hero() } : null;
  const atDoor = () => !!access();

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

  panel.addEventListener('click', e => {
    const releaseIndex = e.target.closest?.('[data-release]')?.dataset.release;
    if (releaseIndex !== undefined) { release(Number(releaseIndex)); e.target.blur?.(); return; }
    const i = e.target.dataset?.pick;
    if (i !== undefined) { pick(Number(i)); e.target.blur(); }
  });

  function update() {
    const c = clan(), h = access()?.actor;
    if (!atDoor()) open = false;
    panel.hidden = !open;
    if (!open || !c || !h) return;
    const { who, cost } = game.clans.healCost(h);
    // hit in the last few seconds: the clinic waits until the fight is over (Tim 2026-10-20)
    const hitW = Math.ceil(game.clans.hitWait?.(h) || 0), off = hitW > 0 ? 'disabled' : '';
    const heal = (hitW > 0 ? `<div class="notice">You were hit: the clinic opens in ${hitW} s</div>` : '') +
      `<div class="row"><span>1. Heal${who.length ? ` ${who.length} hurt` : ''}<br><small>clan members near the door, to full (not anyone hit in the last 5 s)</small></span>` +
      `<button data-pick="0" ${who.length && c.ryo >= cost && !off ? '' : 'disabled'}>${who.length ? `${cost} ryo` : 'nobody hurt'}</button></div>`;
    let n = 0;
    const rows = c.clinic.map((p, index) => {
      const releaseButton = `<button data-release="${index}">${armedRelease === index ? 'Confirm release' : 'Release · free slot'}</button>`;
      if (p.kind !== 'recover') return `<div class="row"><span>${title(p.unit)}<br><small>healing, out in ${Math.ceil(p.left)}s</small></span>${releaseButton}</div>`;
      n++;
      const now = game.clans.reviveCost(p, c.id), wait = p.left > 0 ? `${p.cost} ryo in ${Math.ceil(p.left)}s` : 'recovered, waiting for you';
      return `<div class="row"><span>${n + 1}. ${title(p.unit)}<br><small>downed · ${wait}</small></span>` +
        `<div><button data-pick="${n}" ${c.ryo >= now && !off ? '' : 'disabled'}>Revive ${now}</button>${releaseButton}</div></div>`;
    }).join('');
    const none = c.clinic.length ? '' : '<div class="waiting">No crew in the clinic</div>';
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? `<div class="notice">${c.notice.text}</div>` : '';
    const html = `<h3>BONESETTER'S CLINIC</h3>${heal}${rows}${none}${armedRelease !== null ? '<div class="notice">Click release again to confirm</div>' : ''}${notice}<div class="waiting">number keys or click · Space / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }

  return {
    update, pick,
    isOpen: () => open,
    toggle() { open = !open && atDoor(); update(); },
    close() { open = false; update(); },
  };
}
