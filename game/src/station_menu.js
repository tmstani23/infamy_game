// The island travel menu (Tim 2026-11-06): Space on the island at your omnibus station (which doubles as the
// railway station) or at the island end of the gate. Trains (Tim 2026-11-07, train plan step 4): board one standing
// here, see when the next one comes in, lay track to another of your towns (sim/frontier/rail.js). While you ride,
// the panel stays up with Skip (Space or the button, after a few seconds; number keys do nothing while you ride). Instant rickshaw trips are off (rickshaws are
// driven like the omnibus). Drive back to the gate was taken out (Tim 2026-11-07). The city side is the island gate
// menu (src/site_menu.js). Closes when you walk away, or on Esc / Space. Number keys board the trains standing here.
import { msInstall, msShell, msAside, msArt, msSec, msRow, msBtn, msPager, msNote, msProg } from './menu_shell.js';
const PER = 4;   // track offers a page, no scrollbars (look: shared menu shell, menu restyle 2026-11-10)
export function createStationMenu({ panel, game, heroId, send }) {
  let open = false, shown = '', rpage = 0;
  const hero = () => game.state.entities[heroId];
  const onIsland = () => hero()?.place === 'world';
  const trip = () => onIsland() ? game.stationTravel?.destinations(hero()) || null : null;
  const rail = () => game.frontier?.rail;
  const riding = () => String(hero()?.aboard || '').startsWith('rail:');
  // the city's railway station by the gate (Tim 2026-11-07): its door ring opens this menu too (main.js)
  const atCity = () => { const h = hero(), st = game.gate?.station; return !!st && h?.place === 'street' && Math.hypot(h.x - st[0], h.z - st[1]) <= 6; };
  // trains serving the station you stand at (an island station or the city's)
  const trains = () => (onIsland() || atCity()) && !riding() ? rail()?.service(hero()) || [] : [];
  const boardNow = () => trains().filter(s => s.eta === 0);
  const placeName = id => id === 'capital' ? 'the capital' : game.state.frontier?.settlements?.[id]?.name || id;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // railway (train plan step 2): lay track from this station to another of yours, or watch the line being laid
  const here = () => { const h = hero(); return onIsland() ? game.stationTravel?.from(h)?.town || null : null; };
  // a route takes tens of milliseconds, so previews are kept a few seconds instead of worked out every frame
  const previews = new Map();
  const preview = (R, owner, from, to, n) => {
    const key = `${owner}|${from}|${to}|${n}`, c = previews.get(key), now = performance.now();
    if (c && now - c.at < 3000) return c.p;
    const p = R.preview(owner, from, to);
    previews.set(key, { p, at: now });
    if (previews.size > 40) previews.delete(previews.keys().next().value);
    return p;
  };
  const railRows = t => {
    const s = here(), R = rail(), h = hero();
    if (!s || !R) return null;
    const mine = Object.values(game.state.frontier?.rail?.links || {}).filter(l => l.owner === h.owner);
    const building = mine.find(l => !l.done);
    const name = id => id === 'capital' ? 'the capital' : game.state.frontier.settlements[id]?.name || id;
    const targets = [...t.list.map(d => d.id).filter(id => id !== 'capital'), 'capital'].filter(id => id !== s.id && !mine.some(l => (l.from === s.id && l.to === id) || (l.to === s.id && l.from === id)));
    return { building, name, offers: building ? [] : targets.map(id => ({ id, p: preview(R, h.owner, s.id, id, mine.length) })) };
  };
  const skip = () => send({ id: heroId, type: 'frontier', action: 'rail', mode: 'skip' });
  const go = to => { if (to === 'skip') return skip();
    if (to?.startsWith('board:')) { send({ id: heroId, type: 'frontier', action: 'rail', mode: 'board', train: to.slice(6) }); return close(); }
    if (to?.startsWith('rail:')) { send({ id: heroId, type: 'frontier', action: 'rail', mode: 'link', town: here().id, to: to.slice(5) }); return close(); }
    if (to?.startsWith('railcancel:')) { send({ id: heroId, type: 'frontier', action: 'rail', mode: 'cancel', link: to.slice(11) }); return close(); }
    close(); };
  msInstall(panel, () => riding() ? skip() : close());
  panel.addEventListener('click', e => {
    const turn = e.target.closest?.('[data-station-page]')?.dataset.stationPage;
    if (turn) { rpage += Number(turn); shown = ''; return update(); }
    const to = e.target.closest?.('[data-to]')?.dataset.to;
    if (to === 'close') return close();
    if (to) go(to);
  });
  function pick(i) {
    if (riding() || !open) return;
    const opts = boardNow().map(s => `board:${s.train}`);
    if (opts[i]) go(opts[i]);
  }
  // on the train: where to, how long, Skip
  function ridePanel() {
    const h = hero(), t = game.state.frontier?.rail?.trains?.[h.railRide?.train], l = t && game.state.frontier.rail.links[t.link];
    if (!t || !l) return msShell({ eyebrow: 'Railway', title: 'On the train', escTip: 'Space skips' });
    const to = t.dir > 0 ? l.to : l.from, left = Math.ceil((Math.max(0, t.wait) + Math.abs((t.dir > 0 ? l.length : 0) - t.d) / Math.max(1, t.speed) * 20) / 20);
    const wait = Math.max(0, (game.frontier.data?.railways?.ride?.skipSeconds ?? 5) - Math.floor((game.state.tick - (h.railRide.since ?? 0)) / 20));
    return msShell({ eyebrow: 'Railway', title: `On the train to ${placeName(to)}`, escTip: 'Space skips', body:
      msRow({ name: t.wait > 0 ? 'Standing at the platform' : 'Under way', sub: `About ${left} s to go. Your crew aboard come along.`,
        right: msBtn({ label: wait ? `Skip in ${wait} s` : 'Skip', data: 'data-to="skip"', go: !wait, off: !!wait }) }) });
  }
  function update() {
    if (riding()) { panel.hidden = false; const html = ridePanel(); if (html !== shown) { panel.innerHTML = html; shown = html; } return; }
    const t = open && trip(), tr = open ? trains() : [];
    if (open && !t && !tr.length && !atCity()) open = false;
    panel.hidden = !open;
    if (!open) return;
    const now = tr.filter(s => s.eta === 0), next = tr.filter(s => s.eta > 0 && !now.some(n => n.to === s.to));
    const name = t?.here || (atCity() ? 'The capital' : tr[0] ? placeName(tr[0].at) : '');
    let k = 0, body = msSec('Trains', now.length ? `${now.length} boarding` : '', 'All aboard: everyone of yours in the gold zone after 10 s gets on (Space boards at once). Ride along, or Skip after a few seconds.');
    if (now.length || next.length) {
      body += now.map(s => msRow({ key: ++k <= 9 ? k : null, name: `To ${esc(s.toName)}`, sub: `${s.seats - s.riders} seats, leaves in ${s.leaves ?? 0} s`,
        right: msBtn({ label: 'Board', data: `data-to="board:${esc(s.train)}"`, go: true, off: s.riders >= s.seats }) })).join('')
        + next.map(s => msRow({ off: true, name: `To ${esc(s.toName)}`, sub: `Due in ${s.eta < 90 ? `${s.eta} s` : `${Math.round(s.eta / 60)} min`}` })).join('');
    } else if (atCity()) body += msNote('No train here yet: lay track to the capital from the station in one of your towns.');
    else if (t) body += msNote(Object.values(game.state.frontier?.rail?.links || {}).some(l => l.owner === hero().owner && !l.done) ? 'No train here yet: it starts once the line is laid.'
      : t.list.length ? 'No train here yet: lay track to another of your towns below.' : 'No other station yet: build a railway station in another of your towns.');
    const r = t && railRows(t);
    if (r) {
      body += msSec('Railway', '', "The game picks the route. Paid a stretch at a time from this town's stock.");
      if (r.building) {
        const b = r.building, pct = Math.floor(100 * b.built / b.length), mins = Math.ceil((1 - b.built / b.length) * (game.frontier.data?.railways?.link?.seconds ?? 600) / 60);
        body += msRow({ name: `Laying track: ${esc(r.name(b.from))} to ${esc(r.name(b.to))}`, sub: `${pct} percent, about ${mins} min left${b.waiting ? `, <span class="ms-bad">waiting for ${esc(b.waiting)}</span>` : ''}${msProg(b.built / b.length)}`,
          right: msBtn({ label: 'Stop', data: `data-to="railcancel:${esc(b.id)}"`, hover: 'Stop laying. The track so far is lost.' }) });
      } else if (r.offers.length) {
        const pages = Math.max(1, Math.ceil(r.offers.length / PER)); rpage = Math.max(0, Math.min(rpage, pages - 1));
        body += r.offers.slice(rpage * PER, rpage * PER + PER).map(o => o.p.error
          ? msRow({ off: true, name: `To ${esc(r.name(o.id))}`, sub: `<span class="ms-bad">${esc(o.p.error)}</span>` })
          : msRow({ name: `To ${esc(r.name(o.id))}`, sub: `${Math.round(o.p.line.length)} long, 10 min, ${Object.entries(o.p.cost).map(([k, v]) => `${v} ${k}`).join(', ')}`,
            right: msBtn({ label: 'Lay track', data: `data-to="rail:${esc(o.id)}"`, go: true }) })).join('') + msPager(pages, rpage, 'data-station-page');
      } else body += msNote('All your stations here are linked.');
    }
    const aside = msAside({ art: msArt('railway_station'), label: name || 'Station', coins: [{ v: tr.length, label: 'Trains', red: true, tip: 'Trains standing here or due in' }] });
    const html = msShell({ eyebrow: 'Railway station', title: name ? `Station, ${name}` : 'Station', escTip: 'Close (Space or Esc). Number keys board.', aside, body });
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }
  function close() { open = false; update(); }
  const at = () => riding() || !!trip() || trains().length > 0;
  // the on-screen prompt while a train stands here (main.js): which way it goes and when it leaves
  // the All aboard call you made (Tim 2026-11-08): Space boards at once; the prompt counts down and counts the zone
  const call = () => { return Object.values(game.state.frontier?.rail?.trains || {}).find(t => t.call?.hero === heroId) || null; };
  const calling = () => !!call();
  const boardCall = () => { const t = call(); if (t) send({ id: heroId, type: 'frontier', action: 'rail', mode: 'board', train: t.id }); };
  const callPrompt = () => { const t = call(); if (!t) return ''; const n = rail()?.inZone?.(t)?.length ?? 0, s = Math.max(0, Math.ceil((t.call.until - game.state.tick) / 20));
    return `Space  All aboard now: ${n} crew in the zone · boarding in ${s} s`; };
  const trainPrompt = () => { const s = boardNow()[0]; return s ? `Space  Board the train to ${s.toName}: leaves in ${s.leaves ?? 0} s` : ''; };
  return { update, close, pick, riding, trainPrompt, calling, boardCall, callPrompt, isOpen: () => open || riding(), toggle() { if (riding()) return skip(); open = !open && (at() || atCity()); update(); }, at };
}
