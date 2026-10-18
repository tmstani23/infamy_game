// Hire panel and the crew count in the HUD (ryo has its own badge, src/ryo_badge.js). Reads the game state and sends
// 'hire' commands only; the rules in sim/clans.js decide what actually happens.
const title = s => s[0].toUpperCase() + s.slice(1);

export function createHireMenu({ panel, money, game, units, heroId, send }) {
  const hireable = Object.entries(units.types).filter(([, t]) => t.price && !t.later).map(([k]) => k);
  let open = false, shown = '';
  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans[hero()?.owner];
  // the teahouse the hero is standing in, if any
  const teahouse = () => Object.values(game.state.businesses).find(b => b.kind === 'teahouse' && b.room && b.room === hero()?.place);

  function pick(i) {
    const b = teahouse();
    if (!open || !b || !hireable[i]) return;
    send({ id: heroId, type: 'hire', business: b.id, unit: hireable[i] });
  }

  panel.addEventListener('click', e => {
    const i = e.target.dataset?.pick;
    if (i !== undefined) { pick(Number(i)); e.target.blur(); }
  });

  function update() {
    const c = clan();
    if (!c) return;
    const crew = game.clans.crewOf(c.id).length, cap = game.clans.crewCap(c.id);
    money.textContent = `crew ${crew + c.queue.length}/${cap}`;

    const b = teahouse();
    if (!b) open = false;
    panel.hidden = !open;
    if (!open) return;
    const rows = hireable.map((k, i) => {
      const t = units.types[k], price = game.clans.hirePrice(c.id, k);
      const can = price !== null && c.ryo >= price && crew + c.queue.length < cap && c.queue.length < units.rules.maxQueue;
      return `<div class="row"><span>${i + 1}. ${title(k)}<br><small>${t.hp} hp · ${t.damage} dmg · ${t.hireSeconds}s</small></span>` +
        `<button data-pick="${i}" ${can ? '' : 'disabled'}>${price} ryo</button></div>`;
    }).join('');
    const h = c.queue[0];
    const waiting = c.queue.length ? `<div class="waiting">Coming: ${c.queue.map(q => q.unit).join(', ')} (next in ${Math.ceil(h.left)}s, at the door)</div>` : '';
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? `<div class="notice">${c.notice.text}</div>` : '';
    const html = `<h3>HIRE CREW</h3>${rows}${waiting}${notice}<div class="waiting">1-${hireable.length} or click · H / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }

  return {
    update, pick,
    toggle() { open = !open && !!teahouse(); update(); },
    close() { open = false; update(); },
  };
}
