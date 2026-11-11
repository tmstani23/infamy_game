// The stable menu (Tim 2026-11-07): click one of your stables (the inspection card's Open stable, or the town
// panel's) or Space beside it. Buy horses, rickshaws and omnibuses for this town's stock: +1 or +5 queue them on its
// production bar (made one at a time); how many you can have comes from your stables' town tiers
// (sim/frontier/stable.js room()). Your horses and vehicles: Ride picks your mount, Recall / Take out / Recall all
// (sim/vehicle_garage.js). Number keys buy one, in the order shown; Esc / Space close.
// The capital stable (Tim 2026-11-07, openCapital(): Space at its ring in the city) sells the same for clan ryo, no
// waiting (stable.capital.prices); what you buy waits on the island side of the gate.
import { listVehicles } from './vehicles_panel.js';
import { msInstall, msShell, msAside, msArt, msSec, msRow, msBtn, msPager, msNote, msProg } from './menu_shell.js';
const PER = 5;   // rows a page, no scrollbars (look: shared menu shell, menu restyle 2026-11-10)
export function createStableMenu({ panel, game, heroId, send, data }) {
  let open = false, townId = null, shown = '', view = 'buy', bpage = 0, ypage = 0;
  const hero = () => game.state.entities[heroId];
  const owner = () => hero()?.owner;
  const S = () => game.frontier?.stable;
  const C = () => data?.buildings?.stable?.stable || {};
  const town = () => game.state.frontier?.settlements?.[townId];
  const capital = () => townId === 'capital';
  const price = k => C().capital?.prices?.[k];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const builtStable = s => s?.owner === owner() && s.buildings?.find(b => b.type === 'stable' && b.stage === 'built');
  // standing beside one of your built stables, out on the island
  function nearStable() {
    const h = hero(), st = S();
    if (!h || h.place !== 'world' || h.aboard || !st) return null;
    const reach = (data?.townGrid?.cellSize || 11) + 5;
    for (const s of Object.values(game.state.frontier?.settlements || {})) {
      const b = builtStable(s); if (!b) continue;
      const [x, z] = st.centre(s, b);
      if (Math.hypot(h.x - x, h.z - z) <= reach) return s.id;
    }
    return null;
  }
  const kinds = () => Object.entries(C().kinds || {});
  const cost = c => Object.entries(c || {}).map(([r, n]) => `${n} ${r}`).join(', ');
  const NAMES = { horse: 'Horses', rickshaw: 'Rickshaws', omnibus: 'Omnibuses' };
  const LABEL = { rickshaw: 'Rickshaw, 2 seats', omnibus: 'Omnibus, 8 seats' };
  const TIP = { rickshaw: '2 seats, 3.5x speed', omnibus: '8 seats, 3x speed, 800 health: settlers and workers ride here', horse: 'a horse for you or your crew (3.75x speed)' };
  function options() {
    const s = town(), st = S(), me = owner();
    if (capital() && st) return kinds().filter(([k]) => price(k)).map(([k, spec]) => {
      const cat = st.category(k), room = st.room(me, cat), have = st.have(me, cat), ryo = Math.floor(game.state.clans?.[me]?.ryo || 0);
      const why = have >= room ? `Full: your stables hold ${room} ${NAMES[cat].toLowerCase()}` : ryo < price(k) ? `Short of ${price(k) - ryo} ryo` : '';
      return { k, spec, cat, why };
    });
    if (!s || !st) return [];
    return kinds().map(([k, spec]) => {
      const cat = st.category(k), room = st.room(me, cat), have = st.have(me, cat);
      const short = Object.entries(spec.cost || {}).filter(([r, n]) => (s.stock?.[r] || 0) < n).map(([r, n]) => `${n - Math.floor(s.stock?.[r] || 0)} ${r}`).join(', ');
      const queued = (st.of(s)?.stableJobs || []).length, qmax = C().queue ?? 10;
      const why = have >= room ? (room ? `Full: your stables hold ${room} ${NAMES[cat].toLowerCase()}` : 'No room yet: upgrade this town') : queued >= qmax ? 'The queue is full' : short ? `Short of ${short}` : '';
      return { k, spec, cat, why };
    });
  }
  function buy(k, count = 1) {
    if (!townId || (!capital() && !town())) return;
    const vehicle = C().kinds?.[k]?.vehicle;
    send({ id: heroId, type: 'frontier', action: 'stable', town: townId, count, ...(vehicle ? { mode: k } : { mode: 'horse', kind: k }) });
  }
  msInstall(panel, () => close());
  panel.addEventListener('click', e => {
    const b = e.target.closest?.('button'); if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.close !== undefined || d.msClose !== undefined) return close();
    if (d.stableView) { view = d.stableView; shown = ''; return update(); }
    if (d.stablePage) { bpage += +d.stablePage; shown = ''; return update(); }
    if (d.stableYpage) { ypage += +d.stableYpage; shown = ''; return update(); }
    if (d.buy) buy(d.buy, +d.count || 1);
    if (d.recall) send({ id: heroId, type: 'garage', action: 'recall', unit: d.recall });
    if (d.takeout) send({ id: heroId, type: 'garage', action: 'takeout', unit: d.takeout });
    if (d.recallall !== undefined) send({ id: heroId, type: 'garage', action: 'recallAll' });
    if (d.cancel) send({ id: heroId, type: 'frontier', action: 'stable', town: townId, mode: 'cancel' });
    if (d.choose) send({ id: heroId, type: 'frontier', action: 'stable', town: townId, mode: 'choose', horse: d.choose });
  });
  function close() { open = false; panel.hidden = true; shown = ''; }
  function openCapital() { townId = 'capital'; open = true; view = 'buy'; bpage = ypage = 0; update(); }
  function openFor(id) { if (!builtStable(game.state.frontier?.settlements?.[id])) return; townId = id; open = true; view = 'buy'; bpage = ypage = 0; update(); }
  function pick(i) { if (!open) return; const o = options().filter(o => !o.why)[i]; if (o) buy(o.k); }
  function update() {
    if (!open) { panel.hidden = true; return; }
    const s = town(), b = builtStable(s), st = S(), me = owner();
    if (capital() ? !st || hero()?.place !== 'street' : !b || !st) return close();
    const jobs = b?.stableJobs || [], j = jobs[0];
    const name = k => C().kinds?.[k]?.name || k;
    // the queue in order, runs of the same kind counted: "5x Calico, 1x Rickshaw" (Tim 2026-11-07)
    const runs = list => list.reduce((r, x) => { const last = r.at(-1); if (last?.k === x.kind) last.n++; else r.push({ k: x.kind, n: 1 }); return r; }, []).map(r => `${r.n}x ${name(r.k)}`);
    const myClan = game.state.clans?.[me];
    const list = listVehicles(game, heroId);
    let body = `<div class="ms-tabs"><button class="ms-tab${view === 'buy' ? ' on' : ''}" data-stable-view="buy">Buy</button><button class="ms-tab${view === 'yours' ? ' on' : ''}" data-stable-view="yours">Yours (${list.length})</button></div>`;
    if (view === 'buy') {
      if (!capital()) body += msSec('Making', j ? `Queue ${jobs.length} of ${C().queue ?? 10}` : 'Nothing being made', j ? runs(jobs).join(', ') : '')
        + (j ? msRow({ name: `${esc(name(j.kind))}, ${Math.ceil(j.left / 20)} s`, sub: msProg(1 - j.left / j.total), right: msBtn({ label: 'Cancel last', data: 'data-cancel="1"', hover: 'Cancel the last job in the queue (refunded)' }) }) : '');
      const opts = options(), pages = Math.max(1, Math.ceil(opts.length / PER)); bpage = Math.max(0, Math.min(bpage, pages - 1));
      let k = 0;
      const rows = opts.map(o => {
        const key = o.why ? null : ++k;
        return msRow({ key: key && key <= 9 ? key : null, off: !!o.why, name: esc(LABEL[o.k] || `${o.spec.name} (horse)`), hover: o.why || TIP[o.k] || TIP.horse,
          sub: o.why ? `<span class="ms-bad">${esc(o.why)}</span>` : capital() ? `${price(o.k)} ryo` : `${esc(cost(o.spec.cost))}, ${o.spec.seconds} s`,
          right: msBtn({ label: 'Buy 1', data: `data-buy="${esc(o.k)}"`, go: !o.why, off: !!o.why }) + msBtn({ label: 'Buy 5', data: `data-buy="${esc(o.k)}" data-count="5"`, off: !!o.why }) });
      });
      body += msSec('Buy', capital() ? 'Paid in clan ryo' : 'Paid from town stock', capital() ? 'What you buy waits outside the island gate.' : 'Made one at a time on this stable.')
        + rows.slice(bpage * PER, bpage * PER + PER).join('') + msPager(pages, bpage, 'data-stable-page');
    } else {
      const out = list.some(v => !v.e.stored && !v.e.recall);
      const all = ['horse', 'rickshaw', 'omnibus'].flatMap(c => list.filter(v => v.kind === c)), pages = Math.max(1, Math.ceil(all.length / PER)); ypage = Math.max(0, Math.min(ypage, pages - 1));
      const unit = v => {
        const e = v.e, btns = [
          e.type === 'horse' ? msBtn({ label: 'Ride', data: `data-choose="${esc(e.id)}"`, off: myClan?.mount === e.id, hover: 'Make her your mount (H rides or calls her)' }) : '',
          e.stored ? msBtn({ label: 'Take out', data: `data-takeout="${esc(e.id)}"` }) : msBtn({ label: 'Recall', data: `data-recall="${esc(e.id)}"`, off: !!e.recall, hover: 'Riders get off; back to your nearest stable and stored there' }),
        ].join('');
        return msRow({ name: `${esc(v.name)}${v.status ? ` <span class="ms-small">${esc(v.status)}</span>` : ''}`, sub: esc(v.where), right: btns });
      };
      body += msSec('Your horses and vehicles', `${list.length}`, 'Every horse, rickshaw and omnibus you own.')
        + (all.length ? all.slice(ypage * PER, ypage * PER + PER).map(unit).join('') : msNote('None yet'))
        + `<div class="ms-foot"><span class="ms-small">${pages > 1 ? `Page ${ypage + 1} of ${pages}` : ''}</span><span>${msBtn({ label: 'Recall all', data: 'data-recallall', off: !out, hover: 'Everyone gets off; every horse and vehicle goes back to your nearest stable' })}`
        + (pages > 1 ? msBtn({ label: 'Prev', data: 'data-stable-ypage="-1"', off: !ypage }) + msBtn({ label: 'Next', data: 'data-stable-ypage="1"', off: ypage >= pages - 1 }) : '') + '</span></div>';
    }
    const coins = ['horse', 'rickshaw', 'omnibus'].map(c => ({ v: `${st.have(me, c)}/${st.room(me, c)}`, label: NAMES[c], tip: `${NAMES[c]} you have, of the room in all your stables. Room grows with each town's tier.` }));
    const aside = msAside({ art: msArt('stable'), label: capital() ? 'Capital stable' : 'Town stable', coins: [{ v: Math.floor(myClan?.ryo || 0), label: 'Ryo', red: true, tip: "Your clan's ryo" }, ...coins] });
    const html = msShell({ eyebrow: capital() ? 'The capital' : `Town of ${s.name}`, title: 'Stable', escTip: 'Close (Space or Esc). Number keys buy one.', aside, body });
    if (html !== shown) { panel.innerHTML = html; shown = html; }
    panel.hidden = false;
  }
  return { update, close, pick, openFor, openCapital, isOpen: () => open, at: () => !!nearStable(), toggle() { if (open) return close(); const id = nearStable(); if (id) openFor(id); } };
}
