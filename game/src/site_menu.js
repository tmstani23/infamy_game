// Choose site menu (frontier E1, Tim 2026-11-05): Space at the island gate with a founding permit and
// settlers in the group. "Walk out" steps through the gate on foot; a site puts the hero and the settlers
// there at once. Only settlers go: crew stay in the city. Sends 'expedition' commands only; the rules are
// in sim/frontier/land_office.js. Key 1 = Walk out.
const TAGS = { coast: 'coast', pass: 'pass', river: 'river', crossing: 'crossing', lake: 'lake' };
export function createSiteMenu({ panel, game, heroId, selected = () => [], send }) {
  let open = false, shown = '';
  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans[hero()?.owner];
  const L = () => game.landOffice;
  const party = () => L()?.partyAtGate(hero(), selected()) || [];
  // the menu is for a hero at the gate holding a permit with settlers along
  const waiting = () => L()?.settlersWaiting?.(hero()?.owner) || 0;   // settlers held at the HQ come along (2026-11-06)
  const wanted = () => { const h = hero(); return !!L() && L().atGate(h) && !!clan()?.permit && party().length + waiting() > 0; };

  function go(site) {
    const h = hero();
    if (!open || !h) return;
    send(site ? { id: h.id, type: 'expedition', action: 'site', site, units: party().map(u => u.id) }
      : { id: h.id, type: 'expedition', action: 'walk', units: party().map(u => u.id) });
    open = false; update();
  }
  const pick = i => { if (i === 0) go(null); };
  panel.addEventListener('click', e => {
    const b = e.target.closest?.('[data-site]');
    if (b) { go(b.dataset.site || null); b.blur(); }
  });

  function update() {
    if (!wanted()) open = false;
    panel.hidden = !open;
    const c = clan();
    if (!open || !c) return;
    const F = game.frontier?.data?.founding || {}, n = party().length + waiting(), need = F.minSettlers ?? 5;
    const all = L().sites(c.id), list = all.filter(s => s.open)
      .sort((a, b) => (b.traits.soil + b.traits.water + b.traits.defense) - (a.traits.soil + a.traits.water + a.traits.defense) || (a.travel ?? 0) - (b.travel ?? 0));
    const rows = list.map(s => {
      const tags = s.tags.map(t => TAGS[t]).filter(Boolean).join(', ');
      return `<div class="row"><span>${s.id} · ${s.region}${tags ? ` · ${tags}` : ''}<br><small>soil ${s.traits.soil} · water ${s.traits.water} · defence ${s.traits.defense}` +
        `${s.campWarn ? ` · <span class="warn">bandit camp ${s.campDistance} away</span>` : ''}</small></span>` +
        `<button data-site="${s.id}" ${n >= need ? '' : 'disabled'}>Go</button></div>`;
    }).join('');
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? `<div class="notice">${c.notice.text}</div>` : '';
    const html = `<h3>CHOOSE SITE</h3><div class="waiting">${n} settler${n === 1 ? '' : 's'} with you${n < need ? ` · ${need} needed to go to a site` : ''} · crew stay in the city</div>` +
      `<div class="row"><span>1. Walk out<br><small>through the gate on foot; found anywhere ${(F.minSpacing ?? 1600).toLocaleString()}+ from other towns</small></span><button data-site="">Walk</button></div>` +
      `${rows}<div class="waiting">${all.length - list.length} sites taken or too close to a town</div>${notice}<div class="waiting">click a site · 1 walks out · Space / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }

  return { update, pick, wanted, isOpen: () => open, toggle() { open = !open && wanted(); update(); }, close() { open = false; update(); } };
}
