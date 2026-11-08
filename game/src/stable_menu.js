// The stable menu (Tim 2026-11-07): click one of your stables (the inspection card's Open stable, or the town
// panel's) or Space beside it. Buy horses, rickshaws and omnibuses for this town's stock: +1 or +5 queue them on its
// production bar (made one at a time); how many you can have comes from your stables' town tiers
// (sim/frontier/stable.js room()). Your horses and vehicles: Ride picks your mount, Recall / Take out / Recall all
// (sim/vehicle_garage.js). Number keys buy one, in the order shown; Esc / Space close.
// The capital stable (Tim 2026-11-07, openCapital(): Space at its ring in the city) sells the same for clan ryo, no
// waiting (stable.capital.prices); what you buy waits on the island side of the gate.
import { listVehicles } from './vehicles_panel.js';
export function createStableMenu({ panel, game, heroId, send, data }) {
  let open = false, townId = null, shown = '';
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
  const LABEL = { rickshaw: 'Rickshaw · 2 seats', omnibus: 'Omnibus · 8 seats' };
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
  panel.addEventListener('click', e => {
    const b = e.target.closest?.('button'); if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.close !== undefined) return close();
    if (d.buy) buy(d.buy, +d.count || 1);
    if (d.recall) send({ id: heroId, type: 'garage', action: 'recall', unit: d.recall });
    if (d.takeout) send({ id: heroId, type: 'garage', action: 'takeout', unit: d.takeout });
    if (d.recallall !== undefined) send({ id: heroId, type: 'garage', action: 'recallAll' });
    if (d.cancel) send({ id: heroId, type: 'frontier', action: 'stable', town: townId, mode: 'cancel' });
    if (d.choose) send({ id: heroId, type: 'frontier', action: 'stable', town: townId, mode: 'choose', horse: d.choose });
  });
  function close() { open = false; panel.hidden = true; shown = ''; }
  function openCapital() { townId = 'capital'; open = true; update(); }
  function openFor(id) { if (!builtStable(game.state.frontier?.settlements?.[id])) return; townId = id; open = true; update(); }
  function pick(i) { if (!open) return; const o = options().filter(o => !o.why)[i]; if (o) buy(o.k); }
  function update() {
    if (!open) { panel.hidden = true; return; }
    const s = town(), b = builtStable(s), st = S(), me = owner();
    if (capital() ? !st || hero()?.place !== 'street' : !b || !st) return close();
    const jobs = b?.stableJobs || [], j = jobs[0];
    const name = k => C().kinds?.[k]?.name || k;
    // the queue in order, runs of the same kind counted: "5x Calico, 1x Rickshaw" (Tim 2026-11-07)
    const runs = list => list.reduce((r, x) => { const last = r.at(-1); if (last?.k === x.kind) last.n++; else r.push({ k: x.kind, n: 1 }); return r; }, []).map(r => `${r.n}x ${name(r.k)}`);
    const bar = j ? `<div class="row"><span style="display:inline-block;width:90px;height:8px;background:#3a2f1e;border:1px solid #5c4a2c"><i style="display:block;height:100%;width:${Math.round(100 * (1 - j.left / j.total))}%;background:#ffd34d"></i></span><span>${esc(name(j.kind))} ${Math.ceil(j.left / 20)} s</span></div><p>Queue ${jobs.length} / ${C().queue ?? 10}: <b>${esc(runs(jobs).join(', '))}</b></p>` : '<p>Nothing being made.</p>';
    const room = ['horse', 'rickshaw', 'omnibus'].map(c => `${NAMES[c]} <b>${st.have(me, c)}</b> / ${st.room(me, c)}`).join(' · ');
    let k = 0;
    const rows = options().map(o => {
      const off = o.why ? ` disabled title="${esc(o.why)}"` : ` title="${esc(TIP[o.k] || TIP.horse)}"`;
      return `<div class="srow"><span${o.why ? ' class="off"' : ''}>${o.why ? '' : `${++k}. `}${esc(LABEL[o.k] || `${o.spec.name} (horse)`)} · ${capital() ? `${price(o.k)} ryo` : `${esc(cost(o.spec.cost))} · ${o.spec.seconds} s`}${o.why ? `<br><small>${esc(o.why)}</small>` : ''}</span><span><button data-buy="${esc(o.k)}"${off}>+1</button><button data-buy="${esc(o.k)}" data-count="5"${off}>+5</button></span></div>`;
    }).join('');
    const myClan = game.state.clans?.[me];
    const list = listVehicles(game, heroId);
    const unit = v => {
      const e = v.e, btns = [
        e.type === 'horse' ? `<button data-choose="${esc(e.id)}"${myClan?.mount === e.id ? ' disabled' : ''} title="Make her your mount (H rides or calls her)">Ride</button>` : '',
        e.stored ? `<button data-takeout="${esc(e.id)}">Take out</button>` : `<button data-recall="${esc(e.id)}"${e.recall ? ' disabled' : ''} title="Riders get off; back to your nearest stable and stored there">Recall</button>`,
      ].join('');
      return `<div class="srow"><span><b>${esc(v.name)}</b>${v.status ? ` · ${esc(v.status)}` : ''}<br><small>${esc(v.where)}</small></span><span>${btns}</span></div>`;
    };
    let html = capital()
      ? `<h3>CAPITAL STABLE</h3><p>Paid in clan ryo (you have <b>${Math.floor(myClan?.ryo || 0)}</b>). What you buy waits outside the island gate.</p><h3>BUY</h3>${rows}<p>Yours, all stables: ${room}. Room grows with each town's tier.</p>`
      : `<h3>STABLE · ${esc(s.name)}</h3>${bar}`
      + (jobs.length ? `<div class="row"><button data-cancel="1">Cancel the last job (refunded)</button></div>` : '')
      + `<h3>BUY</h3>${rows}<p>Yours, all stables: ${room}. Room grows with each town's tier.</p>`;
    if (list.length) {
      const out = list.some(v => !v.e.stored && !v.e.recall);
      html += `<h3>YOUR HORSES AND VEHICLES</h3><div class="row"><button data-recallall${out ? '' : ' disabled'} title="Everyone gets off; every horse and vehicle goes back to your nearest stable">Recall all</button></div>`
        + ['horse', 'rickshaw', 'omnibus'].map(c => list.filter(v => v.kind === c).map(unit).join('')).join('');
    }
    html += `<div class="row"><button data-close>Close</button></div><div class="waiting">number keys buy one · Space / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
    panel.hidden = false;
  }
  return { update, close, pick, openFor, openCapital, isOpen: () => open, at: () => !!nearStable(), toggle() { if (open) return close(); const id = nearStable(); if (id) openFor(id); } };
}
