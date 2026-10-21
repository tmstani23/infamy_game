// Police box and police HQ panel, opened with Space at their door rings. Same look as the
// clinic menu. Reads the game state and sends 'police' commands only; the rules in
// sim/police.js (menu) decide what happens.
const title = s => s[0].toUpperCase() + s.slice(1);

export function createPoliceMenu({ panel, game, heroId, send, selected = () => [] }) {
  let open = false, shown = '', location = null;

  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans[hero()?.owner];
  const access = () => game.serviceAt ? location ? game.serviceAt(heroId, location, selected())
    : game.serviceAt(heroId, 'police_box', selected()) || game.serviceAt(heroId, 'police_hq', selected())
    : { actor: hero(), door: game.doorNear(heroId) };
  const where = () => { const m = access()?.door?.menu; return m === 'police_box' || m === 'police_hq' ? m : null; };

  // box: 1 = bribe; HQ: 1 and up = bail the jailed crew in the list (in order)
  function pick(i) {
    const c = clan(), w = where();
    const h = access()?.actor;
    if (!open || !c || !w || !h) return;
    if (w === 'police_box' && i === 0) send({ id: h.id, type: 'police', action: 'bribe' });
    if (w === 'police_hq' && c.jail?.[i]) send({ id: h.id, type: 'police', action: 'bail', prisoner: i });
  }

  panel.addEventListener('click', e => {
    const i = e.target.dataset?.pick;
    if (i !== undefined) { pick(Number(i)); e.target.blur(); }
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
      body = `<div class="row"><span>Heat ${heat} · ${tier}</span></div>` +
        `<div class="row"><span>1. Bribe the officer<br><small>${blocked ? 'not while the police are hitting you' : `-${P.rules.bribeHeat} heat`}</small></span>` +
        `<button data-pick="0" ${c.heat > 0 && c.ryo >= cost && !blocked ? '' : 'disabled'}>${c.heat > 0 ? `${cost} ryo` : 'no heat'}</button></div>`;
    } else {
      const rows = (c.jail || []).map((p, k) => `<div class="row"><span>${k + 1}. ${title(p.unit)}<br><small>in jail until bailed out</small></span>` +
        `<button data-pick="${k}" ${c.ryo >= p.bail ? '' : 'disabled'}>Bail ${p.bail}</button></div>`).join('');
      body = rows || '<div class="waiting">None of your crew in jail</div>';
    }
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? `<div class="notice">${c.notice.text}</div>` : '';
    const html = `<h3>${w === 'police_box' ? 'POLICE BOX' : 'POLICE HQ'}</h3>${body}${notice}<div class="waiting">number keys or click · Space / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }

  return {
    update, pick,
    isOpen: () => open,
    toggle(menu = null) { if (menu) location = menu; open = !open && !!where(); update(); },
    close() { open = false; location = null; update(); },
  };
}
