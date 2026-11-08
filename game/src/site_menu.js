// The island gate menu (Tim 2026-11-06 20:40, option B): Space at the island gate in the city opens a small menu
// when there is more than one way out; otherwise Space just walks through. Choices:
//   1. Walk out: on foot (with a permit and settlers along, they come in the omnibus: expedition 'walk').
//   2. Ride to a known site: permit and settlers; a second page of the sites you have found, nearest first, 5 a page.
//   3. Take the train (Tim 2026-11-07, train plan step 4): once a line runs to the capital; a third page of the Since the city railway station (Tim 2026-11-07) trains board there, so this page only shows when one stands within reach of the gate.
//      trains standing at the gate or due in (sim/frontier/rail.js service). Instant rickshaw trips are off.
// Sends 'expedition', 'use' or frontier 'rail' board commands only; the rules are in sim/frontier/land_office.js.
const TAGS = { coast: 'coast', pass: 'pass', river: 'river', crossing: 'crossing', lake: 'lake' };
const PAGE = 5;
export function createSiteMenu({ panel, game, heroId, selected = () => [], send }) {
  let open = false, shown = '', page = 'main', from = 0;
  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans[hero()?.owner];
  const L = () => game.landOffice;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const party = () => L()?.partyAtGate(hero(), selected()) || [];
  const waiting = () => L()?.settlersWaiting?.(hero()?.owner) || 0;   // settlers held at the HQ come along (2026-11-06)
  const settlers = () => party().length + waiting();
  const atGate = () => !!L() && L().atGate(hero());
  const expedition = () => !!clan()?.permit && settlers() > 0;
  const trips = () => { const h = hero(), t = h?.place === 'street' ? (game.frontier?.rail?.service(h) || []).filter(s => s.at === 'capital') : []; return t.length ? t : null; };
  const when = s => s.eta === 0 ? 'standing at the gate' : s.eta < 90 ? `in ${s.eta} s` : `in ${Math.round(s.eta / 60)} min`;
  const known = () => {
    const c = clan(), g = game.gate?.island || game.state.gate?.island;
    const d = s => g ? Math.hypot(s.x - g[0], s.z - g[1]) : (s.travel ?? 0);
    return (L()?.sites(c?.id) || []).filter(s => s.open && s.known).map(s => ({ ...s, far: d(s) })).sort((a, b) => (a.travel ?? a.far) - (b.travel ?? b.far));
  };
  // how many ways out: the menu opens only for two or more
  const choices = () => atGate() ? 1 + (expedition() ? 1 : 0) + (trips() ? 1 : 0) : 0;
  const wanted = () => choices() > 1;

  function walk() {
    const h = hero();
    if (!h) return;
    send(expedition() ? { id: h.id, type: 'expedition', action: 'walk', units: party().map(u => u.id) } : { id: h.id, type: 'use', units: selected() });
    close();
  }
  function ride(site) { const h = hero(); if (h) send({ id: h.id, type: 'expedition', action: 'site', site, units: party().map(u => u.id) }); close(); }
  function board(train) { send({ id: heroId, type: 'frontier', action: 'rail', mode: 'board', train }); close(); }
  function choose(what) {
    if (what === 'walk') walk();
    else if (what === 'sites' && expedition()) { page = 'sites'; from = 0; update(); }
    else if (what === 'train' && trips()) { page = 'train'; update(); }
    else if (what === 'back') { page = 'main'; update(); }
    else if (what === 'more') { from = from + PAGE < known().length ? from + PAGE : 0; update(); }
    else if (what === 'close') close();
  }
  // number keys: the main page's choices in order, a page's rows
  function pick(i) {
    if (!open) return;
    if (page === 'main') return choose(['walk', expedition() ? 'sites' : null, trips() ? 'train' : null].filter(Boolean)[i]);
    if (page === 'sites') { const s = known().slice(from, from + PAGE)[i]; if (s && settlers() >= need()) ride(s.id); return; }
    const s = trips()?.[i]; if (s && s.eta === 0 && s.riders < s.seats) board(s.train);
  }
  const need = () => game.frontier?.data?.founding?.minSettlers ?? 5;
  panel.addEventListener('click', e => {
    const b = e.target.closest?.('button'); if (!b) return;
    if (b.dataset.site) ride(b.dataset.site);
    else if (b.dataset.train) board(b.dataset.train);
    else if (b.dataset.go) choose(b.dataset.go);
    b.blur();
  });

  function update() {
    if (open && !wanted()) open = false;
    panel.hidden = !open;
    const c = clan();
    if (!open || !c) return;
    const n = settlers(), N = need(), t = trips();
    const head = `<h3>THE ISLAND GATE</h3><p>${expedition() ? `${n} settler${n === 1 ? '' : 's'} with you: they ride in the omnibus. Crew stay in the city.` : 'The road out to the frontier.'}</p>`;
    let body = '';
    if (page === 'main') {
      const rows = [`<button data-go="walk">Walk out</button><small>through the gate${expedition() ? ', settlers in the omnibus; found anywhere far enough from other towns' : ''}</small>`];
      if (expedition()) rows.push(`<button data-go="sites">Ride to a known site</button><small>straight there by omnibus${n < N ? ` · ${N} settlers needed` : ''}</small>`);
      if (t) rows.push(`<button data-go="train">Take the train</button><small>${t.some(s => s.eta === 0) ? 'a train is standing at the gate' : `next one ${when(t[0])}`}</small>`);
      body = rows.map((r, i) => `<div class="row"><span>${i + 1}.</span>${r}</div>`).join('');
    } else if (page === 'sites') {
      const all = known(), list = all.slice(from, from + PAGE);
      body = all.length ? `<p>You and your settlers ride straight there by omnibus. Found your town there.</p>` + list.map((s, i) => {
        const tags = s.tags.map(x => TAGS[x]).filter(Boolean).join(', ');
        return `<div class="row"><span>${i + 1}. ${esc(s.id)} · ${esc(s.region)}${tags ? ` · ${tags}` : ''} · ${(s.far / 1000).toFixed(1)}k<br><small>soil ${s.traits.soil} · water ${s.traits.water} · defence ${s.traits.defense}`
          + `${s.campWarn ? ` · <span class="warn">bandit camp ${s.campDistance} away</span>` : ''}</small></span><button data-site="${esc(s.id)}"${n >= N ? '' : ' disabled'}>Go</button></div>`;
      }).join('') + (n < N ? `<div class="waiting">${N} settlers needed to ride to a site</div>` : '')
        : `<p>No sites known yet. Walk out and scout first: sites you find on the island show up here.</p>`;
      body += `<div class="row">${all.length > PAGE ? `<button data-go="more">More (${from + 1}-${Math.min(from + PAGE, all.length)} of ${all.length})</button>` : ''}<button data-go="back">Back</button></div>`;
    } else {
      body = t ? `<p>Boarding calls All aboard: everyone of yours in the gold zone after 10 s gets on (Space boards at once). Ride along, or Skip after a few seconds.</p>`
        + t.map((s, i) => `<div class="row"><span>${i + 1}. To ${esc(s.toName)} · ${when(s)}</span><button data-train="${esc(s.train)}"${s.eta === 0 && s.riders < s.seats ? '' : ' disabled'}>Board</button></div>`).join('') : '';
      body += `<div class="row"><button data-go="back">Back</button></div>`;
    }
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? `<div class="notice">${esc(c.notice.text)}</div>` : '';
    const html = `${head}${body}${notice}<div class="waiting">number keys pick · Space / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }
  function close() { open = false; page = 'main'; update(); }

  return { update, pick, wanted, choices, isOpen: () => open, toggle() { open = !open && wanted(); page = 'main'; update(); }, close };
}
