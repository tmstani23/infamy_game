// Clinic panel, opened with Space at the clinic's door ring. Reads the game state and sends
// 'clinic' commands only; the rules in sim/clans.js (clinicMenu) decide what happens.
const title = s => s[0].toUpperCase() + s.slice(1);

export function createClinicMenu({ panel, game, heroId, send }) {
  let open = false, shown = '';

  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans[hero()?.owner];
  const atDoor = () => game.doorNear(heroId)?.menu === 'clinic';

  // 1 = heal, 2 and up = revive the patients in the list (in order)
  function pick(i) {
    const c = clan();
    if (!open || !c) return;
    if (i === 0) { send({ id: heroId, type: 'clinic', action: 'heal' }); return; }
    const patients = c.clinic.map((p, k) => ({ p, k })).filter(({ p }) => p.kind === 'recover');
    if (patients[i - 1]) send({ id: heroId, type: 'clinic', action: 'revive', patient: patients[i - 1].k });
  }

  panel.addEventListener('click', e => {
    const i = e.target.dataset?.pick;
    if (i !== undefined) { pick(Number(i)); e.target.blur(); }
  });

  function update() {
    const c = clan(), h = hero();
    if (!atDoor()) open = false;
    panel.hidden = !open;
    if (!open || !c || !h) return;
    const { who, cost } = game.clans.healCost(h);
    const heal = `<div class="row"><span>1. Heal${who.length ? ` ${who.length} hurt` : ''}<br><small>you and crew near the door, to full</small></span>` +
      `<button data-pick="0" ${who.length && c.ryo >= cost ? '' : 'disabled'}>${who.length ? `${cost} ryo` : 'nobody hurt'}</button></div>`;
    let n = 0;
    const rows = c.clinic.map(p => {
      if (p.kind !== 'recover') return `<div class="row"><span>${title(p.unit)}<br><small>healing, out in ${Math.ceil(p.left)}s</small></span></div>`;
      n++;
      const now = game.clans.reviveCost(p, c.id), wait = p.left > 0 ? `${p.cost} ryo in ${Math.ceil(p.left)}s` : 'recovered, waiting for you';
      return `<div class="row"><span>${n + 1}. ${title(p.unit)}<br><small>downed · ${wait}</small></span>` +
        `<button data-pick="${n}" ${c.ryo >= now ? '' : 'disabled'}>Revive ${now}</button></div>`;
    }).join('');
    const none = c.clinic.length ? '' : '<div class="waiting">No crew in the clinic</div>';
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? `<div class="notice">${c.notice.text}</div>` : '';
    const html = `<h3>BONESETTER'S CLINIC</h3>${heal}${rows}${none}${notice}<div class="waiting">number keys or click · Space / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }

  return {
    update, pick,
    isOpen: () => open,
    toggle() { open = !open && atDoor(); update(); },
    close() { open = false; update(); },
  };
}
