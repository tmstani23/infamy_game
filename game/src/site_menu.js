// The island gate menu (Tim 2026-11-06 20:40, option B): Space at the island gate in the city opens a small menu
// when there is more than one way out; otherwise Space just walks through. Choices:
//   1. Walk out: on foot (with a permit and settlers along, they come in the omnibus: expedition 'walk').
//   2. Ride to a known site: permit and settlers; a second page of the sites you have found, nearest first, 5 a page.
//   3. Take the train (Tim 2026-11-07, train plan step 4): once a line runs to the capital; a third page of the Since the city railway station (Tim 2026-11-07) trains board there, so this page only shows when one stands within reach of the gate.
//      trains standing at the gate or due in (sim/frontier/rail.js service). Instant rickshaw trips are off.
// Sends 'expedition', 'use' or frontier 'rail' board commands only; the rules are in sim/frontier/land_office.js.
// Look: the shared menu shell (menu_shell.js, menu restyle 2026-11-10).
import { msInstall, msShell, msAside, msArt, msSec, msRow, msBtn, msNote } from './menu_shell.js';
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
  msInstall(panel, () => close());
  panel.addEventListener('click', e => {
    const b = e.target.closest?.('button'); if (!b || b.dataset.msClose !== undefined) return;
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
    let body = '';
    if (page === 'main') {
      const rows = [msRow({ key: 1, name: 'Walk out', sub: expedition() ? 'Through the gate, settlers in the omnibus' : 'Through the gate on foot',
        hover: expedition() ? 'Found anywhere far enough from other towns.' : '', right: msBtn({ label: 'Walk', data: 'data-go="walk"', go: true }) })];
      if (expedition()) rows.push(msRow({ key: rows.length + 1, name: 'Ride to a known site', sub: n < N ? `${N} settlers needed` : 'Straight there by omnibus', subClass: n < N ? 'ms-bad' : '',
        right: msBtn({ label: 'Sites', data: 'data-go="sites"' }) }));
      if (t) rows.push(msRow({ key: rows.length + 1, name: 'Take the train', sub: t.some(s => s.eta === 0) ? 'A train is standing at the gate' : `Next one ${when(t[0])}`,
        right: msBtn({ label: 'Trains', data: 'data-go="train"' }) }));
      body = msSec('Ways out', expedition() ? `${n} settler${n === 1 ? '' : 's'} with you` : '', expedition() ? 'Your settlers ride in the omnibus. Crew stay in the city.' : 'The road out to the frontier.') + rows.join('');
    } else if (page === 'sites') {
      const all = known(), list = all.slice(from, from + PAGE);
      body = msSec('Known sites', all.length ? `${from + 1} to ${Math.min(from + PAGE, all.length)} of ${all.length}` : '', 'You and your settlers ride straight there by omnibus. Found your town there.');
      body += all.length ? list.map((s, i) => {
        const tags = s.tags.map(x => TAGS[x]).filter(Boolean).join(', ');
        return msRow({ key: i + 1, name: `${esc(s.id)}, ${esc(s.region)}`, sub: `${tags ? `${tags}, ` : ''}${(s.far / 1000).toFixed(1)}k away. Soil ${s.traits.soil}, water ${s.traits.water}, defence ${s.traits.defense}`
          + `${s.campWarn ? `. <span class="ms-bad">Bandit camp ${s.campDistance} away</span>` : ''}`, right: msBtn({ label: 'Go', data: `data-site="${esc(s.id)}"`, go: true, off: n < N }) });
      }).join('') + (n < N ? msNote(`${N} settlers needed to ride to a site`) : '') : msNote('No sites known yet. Walk out and scout first: sites you find on the island show up here.');
      body += `<div class="ms-foot"><span></span><span>${all.length > PAGE ? msBtn({ label: 'More', data: 'data-go="more"' }) : ''}${msBtn({ label: 'Back', data: 'data-go="back"' })}</span></div>`;
    } else {
      body = msSec('Trains', '', 'All aboard: everyone of yours in the gold zone after 10 s gets on (Space boards at once). Ride along, or Skip after a few seconds.');
      body += t ? t.map((s, i) => msRow({ key: i + 1, name: `To ${esc(s.toName)}`, sub: when(s), right: msBtn({ label: 'Board', data: `data-train="${esc(s.train)}"`, go: true, off: !(s.eta === 0 && s.riders < s.seats) }) })).join('') : '';
      body += `<div class="ms-foot"><span></span><span>${msBtn({ label: 'Back', data: 'data-go="back"' })}</span></div>`;
    }
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? msNote(c.notice.text, true) : '';
    const aside = msAside({ art: msArt('gatehouse'), label: 'Island gate', coins: [
      { v: n, label: 'Settlers', red: true, tip: 'Settlers coming with you' }, { v: known().length, label: 'Sites', tip: 'Sites you have found' }] });
    const html = msShell({ eyebrow: 'Leave the city', title: 'The island gate', escTip: 'Close (Space or Esc). Number keys pick.', aside, body: body + notice });
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }
  function close() { open = false; page = 'main'; update(); }

  return { update, pick, wanted, choices, isOpen: () => open, toggle() { open = !open && wanted(); page = 'main'; update(); }, close };
}
