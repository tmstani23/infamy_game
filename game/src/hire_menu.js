// Hire panel and the crew count in the HUD (ryo has its own badge, src/ryo_badge.js). Reads the game state and sends
// 'hire' commands only; the rules in sim/clans.js decide what actually happens.
const title = s => s[0].toUpperCase() + s.slice(1);

export function createHireMenu({ panel, money, game, units, heroId, send }) {
  // what your clan may hire (units.json "clan": ninja crew for the Shinobi clan only)
  const owner = game.state.entities[heroId]?.owner;
  const hireable = Object.keys(units.types).filter(type => game.clans.hirePrice(owner, type) !== null);
  let open = false, shown = '', armedDismiss = null, dismissView = false;
  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans[hero()?.owner];
  // the teahouse (Shinobi: the village dojo) the hero is standing in, if any
  // (or your own hideout: slower hiring)
  const teahouse = () => Object.values(game.state.businesses).find(b => (b.kind === game.clans.hallOf(hero()?.owner) || (b.kind === 'hideout' && b.owner === hero()?.owner)) && b.room && b.room === hero()?.place);

  function pick(i) {
    const b = teahouse();
    if (!open || dismissView || !b || !hireable[i]) return;
    send({ id: heroId, type: 'hire', business: b.id, unit: hireable[i] });
  }

  function dismiss(id) {
    const b = teahouse(), c = clan(), u = game.state.entities[id];
    if (!open || !b || b.kind !== 'hideout' || !c || !u) return;
    if (armedDismiss !== id) { armedDismiss = id; shown = ''; update(); return; }
    armedDismiss = null;
    send({ id: heroId, type: 'dismiss', unit: id, business: b.id });
  }

  panel.addEventListener('click', e => {
    const view = e.target.closest?.('[data-crew-view]')?.dataset.crewView;
    if (view) { dismissView = view === 'dismiss'; armedDismiss = null; shown = ''; update(); return; }
    const id = e.target.closest?.('[data-dismiss]')?.dataset.dismiss;
    if (id) { dismiss(id); e.target.blur?.(); return; }
    const i = e.target.dataset?.pick;
    if (i !== undefined) { pick(Number(i)); e.target.blur(); }
  });

  function update() {
    const c = clan();
    if (!c) return;
    const crew = game.clans.crewOf(c.id).length, cap = game.clans.crewCap(c.id);
    money.textContent = `crew ${crew + c.queue.length}/${cap}`;

    const b = teahouse();
    if (!b || b.kind !== 'hideout') { armedDismiss = null; dismissView = false; }
    if (!b) open = false;
    panel.hidden = !open;
    if (!open) return;
    const rows = hireable.map((k, i) => {
      const t = units.types[k], price = game.clans.hirePrice(c.id, k);
      const can = price !== null && c.ryo >= price && crew + c.queue.length < cap && c.queue.length < units.rules.maxQueue;
      const taunt = t.taunt ? `<br>Instant Taunt · ${t.taunt.radius} ${k === 'yakuza_enforcer' ? 'radius · all nearby enemies' : t.taunt.coneDegrees ? 'range · forward cone' : 'range · one enemy'}` : '';
      return `<div class="row"><span>${i + 1}. ${t.name || title(k)}<br><small>${t.hp} hp · ${t.damage} dmg · ${t.hireSeconds * (b.kind === 'hideout' ? units.rules.hideout?.hireTimeFactor ?? 1 : 1)}s${taunt}</small></span>` +
        `<button data-pick="${i}" ${can ? '' : 'disabled'}>${price} ryo</button></div>`;
    }).join('');
    const h = c.queue[0];
    const waiting = c.queue.length ? `<div class="waiting">Coming: ${c.queue.map(q => units.types[q.unit]?.name || q.unit).join(', ')} (next in ${Math.ceil(h.left)}s, at the door)</div>` : '';
    const dismissRows = b.kind === 'hideout' ? game.clans.crewOf(c.id)
      .filter(u => !u.guard && !u.dead)
      .map(u => {
        const refund = game.clans.dismissRefund(u.type), confirm = armedDismiss === u.id;
        const available = !u.downed && !u.jailed && u.maxHp && u.hp >= u.maxHp;
        const group = u.deployment?.group || 'home';
        const zone = group === 'hero' ? 'Hero group' : group === 'home' ? 'HQ reserves' : game.state.deployment?.sectors.find(s => s.id === group)?.name || group;
        return `<div class="row"><span>${units.types[u.type]?.name || title(u.type)} · ${u.id}<br><small>${zone} · ${u.place === 'street' ? 'outdoors' : u.place} · ${available ? 'healthy' : 'must be healthy and active'}</small></span>` +
          `<button data-dismiss="${u.id}" ${available ? '' : 'disabled'}>${confirm ? `Confirm · ${refund} ryo` : `Dismiss · ${refund} ryo`}</button></div>`;
      }).join('') : '';
    const dismiss = `<h3>DISMISS CREW · ALL ZONES</h3>${dismissRows || '<div class="waiting">No active crew</div>'}<div class="waiting">Healthy crew from any zone · click twice to confirm</div>`;
    const navigation = b.kind === 'hideout' ? `<div><button data-crew-view="hire">Hire crew</button><button data-crew-view="dismiss">Dismiss crew · all zones</button></div>` : '';
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? `<div class="notice">${c.notice.text}</div>` : '';
    const html = `${navigation}${dismissView ? dismiss : `<h3>HIRE CREW</h3>${rows}${waiting}`}${notice}<div class="waiting">${dismissView ? 'Select crew above' : `1-${hireable.length} or click`} · H / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }

  return {
    update, pick, isOpen: () => open,
    toggle() { open = !open && !!teahouse(); update(); },
    close() { open = false; update(); },
  };
}
