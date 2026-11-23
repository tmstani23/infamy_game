// Town window Stable tab (Tim 2026-11-23, mock project files stable_tab/stable_tab_mock.png): the stable shown right in
// the town window instead of an "Open stable" button. Three columns (two or one on a narrow window):
//  - this town's stables (max 2), each with Go to (camera only); room over all your stables (owned + queued); town stock
//  - buy cards (cost from town stock when queued, refunded on cancel, no upkeep) and the queue of the town's first stable
//  - every horse, rickshaw and omnibus you own: Ride / Go to / Recall or Take out, Recall all; pages, no scrollbars
// Only the first built stable in a town gives room and runs the queue (sim/frontier/stable.js of()); in a war every built
// stable trains cavalry (town war window). The stable menu (src/stable_menu.js, click the stable or Space) stays.
// createStableTab({ game, heroId, send, data, focus }) -> { html(s), click(dataset, s) }
import { listVehicles } from './vehicles_panel.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tip = t => t ? ` data-tip="${esc(t)}"` : '';
const CATS = ['horse', 'rickshaw', 'omnibus'];
const NAMES = { horse: 'Horses', rickshaw: 'Rickshaws', omnibus: 'Omnibuses' };
const TAG = { horse: 'horse, 1 seat', rickshaw: 'cart, 2 seats', omnibus: 'coach, 8 seats' };
const TIP = { horse: 'A horse for you or your crew, 3.75x speed when galloping', rickshaw: '2 seats, 3.5x speed', omnibus: '8 seats, 3x speed, 800 health: settlers and workers ride here' };
const ART = k => `art/ui/stable/${k === 'black_beauty' ? 'black_beauty' : k === 'rickshaw' || k === 'omnibus' ? k : 'calico'}.png`;
const PER = 9;   // owned rows a page

export const STABLE_TAB_CSS = `
#townpanel{container-type:inline-size}
#townpanel .pbody.stabbody{display:grid;grid-template-columns:1fr;gap:0;align-items:start}
@container (min-width:620px){#townpanel .pbody.stabbody{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"a c" "b c"}#townpanel .stabbody .sa{grid-area:a}#townpanel .stabbody .sb{grid-area:b}#townpanel .stabbody .sc{grid-area:c;border-left:1px solid #2a2d31;padding-left:12px;margin-left:12px}}
@container (min-width:980px){#townpanel .stabbody .stab .bgrid{grid-template-columns:repeat(4,minmax(0,1fr))}#townpanel .pbody.stabbody{grid-template-columns:250px minmax(0,1fr) minmax(330px,430px);grid-template-areas:"a b c"}#townpanel .stabbody .sb{border-left:1px solid #2a2d31;padding-left:12px;margin-left:12px}}
#townpanel .stabbody .sbox{display:grid;grid-template-columns:56px 1fr auto;gap:8px;align-items:center;border:1px solid #3d352a;border-radius:7px;background:radial-gradient(ellipse at 20% 50%,#2a2620,#121314 80%);padding:4px 8px 4px 4px;margin-bottom:6px}
#townpanel .stabbody .sbox.first{border-color:var(--ms-accent-lt,#a98cff)}
#townpanel .stabbody .sbox img{width:54px;filter:drop-shadow(0 3px 3px #000)}
#townpanel .stabbody .sbox b,#townpanel .stab .vrow b,#townpanel .stab .bcard b{color:#f3e3bd;font-weight:600}
#townpanel .stab .sm{font-size:11px;color:#a3aaad}
#townpanel .stab .room{display:grid;grid-template-columns:74px 1fr 40px;gap:8px;align-items:center;margin:5px 0}
#townpanel .stab .room em{font-style:normal;text-align:right;font-weight:600;color:#f3e3bd}
#townpanel .stab .rbar{position:relative;height:10px;background:#22262e;border-radius:3px;overflow:hidden;border:1px solid #000}
#townpanel .stab .rbar i{position:absolute;top:0;bottom:0;left:0;background:var(--ms-accent,#8f6cff)}
#townpanel .stab .rbar i.q{background:repeating-linear-gradient(45deg,#d8b56c99 0 3px,#d8b56c44 3px 6px)}
#townpanel .stab .legend{font-size:10px;color:#a3aaad}#townpanel .stab .legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin:0 3px -1px 6px;background:var(--ms-accent,#8f6cff)}#townpanel .stab .legend i.q{background:repeating-linear-gradient(45deg,#d8b56c99 0 3px,#d8b56c44 3px 6px)}
#townpanel .stab .coins{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
#townpanel .stab .coin{border-radius:7px;padding:4px;text-align:center;background:radial-gradient(#2b2520,#121110 75%);box-shadow:0 0 0 1px #4a4236}
#townpanel .stab .coin b{display:block;font-size:15px;color:#f6e6bf}#townpanel .stab .coin span{font-size:9px;letter-spacing:.14em;color:#c9b07a;text-transform:uppercase}
#townpanel .stab .bgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:7px}
#townpanel .stab .bcard{position:relative;border:1px solid #3d352a;border-radius:7px;background:radial-gradient(ellipse at 50% 40%,#2a2620,#121314 75%);padding:16px 5px 7px;text-align:center}
#townpanel .stab .bcard .pic{height:62px;display:grid;place-items:center}#townpanel .stab .bcard .pic img{max-width:100px;max-height:60px;filter:drop-shadow(0 4px 4px #000)}
#townpanel .stab .bcard .tag{position:absolute;top:4px;right:5px;font-size:10px;color:#c9b07a;background:#0a0c0e;border:1px solid #3a3530;border-radius:8px;padding:0 5px}
#townpanel .stab .bcard.off .pic,#townpanel .stab .bcard.off b{filter:grayscale(1) brightness(.6)}
#townpanel .stab .bcard .why{color:#ed8b7c;font-size:11px;min-height:15px;margin:3px 0 5px}
#townpanel .stab .cost{display:flex;justify-content:center;gap:4px;margin:4px 0 6px;flex-wrap:wrap}
#townpanel .stab .chip{white-space:nowrap;font-size:10.5px;background:#0a0c0e;border:1px solid #3a3530;border-radius:10px;padding:0 6px}
#townpanel .stab .chip.short{border-color:#8e2d26;color:#ed8b7c}
#townpanel .stab .brow{display:flex;justify-content:center;gap:4px}
#townpanel .stab button{padding:3px 9px;font-size:11.5px}#townpanel .stab button[disabled]{opacity:.38;cursor:default}
#townpanel .stab .lab{display:flex;justify-content:space-between;gap:8px}
#townpanel .stab .job{display:grid;grid-template-columns:58px 1fr auto;gap:10px;align-items:center;padding:4px 0}
#townpanel .stab .thumb{width:54px;height:38px;border:1px solid #665944;border-radius:6px;background:radial-gradient(#7a6a56,#3a332b 85%);display:grid;place-items:center;overflow:hidden}
#townpanel .stab .thumb img{max-width:50px;max-height:34px;filter:brightness(1.3) drop-shadow(0 1px 1px #000)}
#townpanel .stab .prog{height:8px;background:#22262e;border-radius:4px;overflow:hidden;border:1px solid #000;margin-top:4px}#townpanel .stab .prog i{display:block;height:100%;background:linear-gradient(#f0d07a,#b58a2a)}
#townpanel .stab .slots{display:grid;grid-template-columns:repeat(10,1fr);gap:3px;margin-top:6px}
#townpanel .stab .slot{position:relative;height:40px;border:1px solid #3a3530;border-radius:5px;background:#101215;display:grid;place-items:center}
#townpanel .stab .slot img{max-width:90%;max-height:28px}#townpanel .stab .slot.now{border-color:#d8b56c}
#townpanel .stab .slot span{position:absolute;top:0;left:3px;font-size:9px;color:#8c8f8c}
#townpanel .stab .foot{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:6px}
#townpanel .stab .grp{color:#9b9c98;font-size:10px;letter-spacing:.12em;text-transform:uppercase;padding:4px 0 1px}
#townpanel .stab .vrow{display:grid;grid-template-columns:54px minmax(0,1fr) 172px;gap:8px;align-items:center;padding:3px 0;border-bottom:1px solid #252c31}
#townpanel .stab .vrow .sm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#townpanel .stab .vbtn{display:grid;grid-template-columns:44px 54px 66px;gap:4px}#townpanel .stab .vbtn button{padding:3px 0}
#townpanel .stab .pill{font-size:10px;border-radius:8px;padding:0 6px;margin-left:5px;border:1px solid #5a5b62;color:#c4c6cb;white-space:nowrap}
#townpanel .stab .pill.ride{border-color:#4a6a3a;color:#a6d98f}#townpanel .stab .pill.move{border-color:#7a5a28;color:#e8bf6c}#townpanel .stab .pill.board{border-color:#3c5a7a;color:#8fc0ef}
`;

export function createStableTab({ game, heroId, send, data, focus = () => {} }) {
  let page = 0;
  const C = () => data?.buildings?.stable?.stable || {};
  const S = () => game.frontier?.stable;
  const me = () => game.state.entities[heroId]?.owner;
  const stablesOf = s => (s.buildings || []).filter(b => b.type === 'stable' && b.stage === 'built');
  const kname = k => C().kinds?.[k]?.name || k;
  const secs = t => { t = Math.max(0, Math.ceil(t)); return t >= 60 ? `${Math.floor(t / 60)} min ${t % 60} s` : `${t} s`; };
  // queued jobs of a category over all your towns (have() counts them; the bars show them apart)
  function queued(cat) {
    const st = S(); let n = 0;
    for (const t of Object.values(game.state.frontier?.settlements || {})) if (t.owner === me() && !t.capital) n += (stablesOf(t)[0]?.stableJobs || []).filter(j => st.category(j.kind) === cat).length;
    return n;
  }
  function options(s) {
    const st = S(), owner = me(), jobs = stablesOf(s)[0]?.stableJobs || [], qmax = C().queue ?? 10;
    return Object.entries(C().kinds || {}).map(([k, spec]) => {
      const cat = st.category(k), room = st.room(owner, cat), have = st.have(owner, cat), free = Math.max(0, room - have);
      const short = Object.entries(spec.cost || {}).filter(([r, n]) => (s.stock?.[r] || 0) < n);
      const why = free <= 0 ? (room ? `Room full, ${have} of ${room}` : 'No room yet: upgrade this town') : jobs.length >= qmax ? 'The queue is full'
        : short.length ? `Short of ${short.map(([r, n]) => `${n - Math.floor(s.stock?.[r] || 0)} ${r}`).join(', ')}` : '';
      return { k, spec, cat, why, free: Math.min(free, qmax - jobs.length), short: new Set(short.map(([r]) => r)) };
    });
  }
  function html(s) {
    const st = S(); if (!st) return '<div class="hint">No stable here.</div>';
    const owner = me(), list = stablesOf(s), first = list[0], jobs = first?.stableJobs || [], j = jobs[0];
    // A: this town's stables, room, stock
    let a = `<div class="lab">Stables in ${esc(s.name)} <span class="dim">${list.length} of ${data?.war?.buildings?.stable?.max ?? 2}</span></div>`;
    a += list.map((b, i) => {
      const what = i ? 'Trains cavalry in war' : j ? `Making ${kname(j.kind)}, ${secs(j.left / 20)}` : 'Idle';
      const hover = i ? 'Only the first stable in a town makes horses and vehicles and adds room. In a war on this town every stable trains cavalry.' : 'Makes this town\'s horses and vehicles. Click it on the map or Space beside it for the stable menu.';
      return `<div class="sbox${i ? '' : ' first'}"${tip(hover)}><img src="art/buildings/stable.png" alt=""><div><b>Stable ${i + 1}</b><div class="sm">${esc(what)}</div></div><button data-act="stab-goto" data-id="${esc(b.id)}"${tip('Move the camera to this stable')}>Go to</button></div>`;
    }).join('');
    a += `<div class="lab"${tip('How many you can have, over all your stables. Room grows with each town\'s tier. Queued ones count.')}>Room, all your stables</div>`;
    a += CATS.map(c => {
      const room = st.room(owner, c), have = st.have(owner, c), q = Math.min(have, queued(c)), own = have - q, pc = n => room ? Math.min(100, n / room * 100) : 0;
      return `<div class="room"><span>${NAMES[c]}</span><div class="rbar"><i class="q" style="width:${pc(have)}%"></i><i style="width:${pc(own)}%"></i></div><em>${have}/${room}</em></div>`;
    }).join('') + '<div class="legend"><i></i>owned<i class="q"></i>queued</div>';
    const res = [...new Set(Object.values(C().kinds || {}).flatMap(k => Object.keys(k.cost || {})))];
    a += `<div class="lab"${tip('Buying takes the cost from this town\'s stock when you queue it (cancel refunds it). Horses and vehicles have no upkeep.')}>Town stock</div><div class="coins">`
      + res.map(r => `<div class="coin"><b>${Math.floor(s.stock?.[r] || 0)}</b><span>${esc(r)}</span></div>`).join('') + '</div>';
    // B: buy and the queue
    let b = `<div class="lab">Buy <span class="dim">made one at a time</span></div><div class="bgrid">` + options(s).map(o => {
      const can = !o.why, chips = Object.entries(o.spec.cost || {}).map(([r, n]) => `<span class="chip${o.short.has(r) ? ' short' : ''}">${n} ${esc(r)}</span>`).join('');
      return `<div class="bcard${can ? '' : ' off'}"${tip(TIP[o.cat] || TIP.horse)}><span class="tag">${TAG[o.cat]}</span><div class="pic"><img src="${ART(o.k)}" alt=""></div><b>${esc(o.spec.name)}</b>`
        + (can ? `<div class="sm">${o.spec.seconds} s each${o.free < 5 ? `, room for ${o.free}` : ''}</div><div class="cost">${chips}</div>` : `<div class="why">${esc(o.why)}</div>`)
        + `<div class="brow"><button data-act="stab-buy" data-id="${esc(o.k)}" data-n="1"${can ? ' class="on"' : ' disabled'}>Buy 1</button><button data-act="stab-buy" data-id="${esc(o.k)}" data-n="5"${can && o.free >= 5 ? '' : ' disabled'}${tip(can && o.free < 5 ? `Room for ${o.free} more` : '')}>Buy 5</button></div></div>`;
    }).join('') + '</div>';
    const qmax = C().queue ?? 10;
    b += `<div class="lab">Making at Stable 1 <span class="dim">queue ${jobs.length} of ${qmax}</span></div>`;
    if (j) {
      const total = j.left / 20 + jobs.slice(1).reduce((n, x) => n + (C().kinds?.[x.kind]?.seconds || 0), 0);
      b += `<div class="job"><div class="thumb"><img src="${ART(j.kind)}" alt=""></div><div><b>${esc(kname(j.kind))}</b> <span class="sm">${secs(j.left / 20)} left</span><div class="prog"><i style="width:${Math.round((1 - j.left / j.total) * 100)}%"></i></div></div>`
        + `<button data-act="stab-cancel"${tip('Cancel the last job in the queue; its cost goes back to the town stock')}>Cancel last</button></div>`
        + `<div class="slots">${Array.from({ length: qmax }, (_, i) => `<div class="slot${i ? '' : ' now'}"${jobs[i] ? tip(kname(jobs[i].kind)) : ''}><span>${i + 1}</span>${jobs[i] ? `<img src="${ART(jobs[i].kind)}" alt="">` : ''}</div>`).join('')}</div>`
        + `<div class="foot"><span class="sm">${jobs.length - 1} waiting</span><span class="sm">All done in <b>${secs(total)}</b></span></div>`;
    } else b += '<div class="hint">Nothing being made. Buy above to start.</div>';
    // C: yours
    const all = listVehicles(game, heroId), mount = game.state.clans?.[owner]?.mount;
    const horses = all.filter(v => v.kind === 'horse'), vehicles = all.filter(v => v.kind !== 'horse');
    const rows = [...(horses.length ? [{ grp: `Horses ${horses.length}` }] : []), ...horses, ...(vehicles.length ? [{ grp: `Vehicles ${vehicles.length}` }] : []), ...vehicles];
    const pages = Math.max(1, Math.ceil(rows.length / PER)); page = Math.max(0, Math.min(page, pages - 1));
    const pill = t => !t ? '' : `<span class="pill ${/ride|you drive/.test(t) ? 'ride' : /coming|heading/.test(t) ? 'move' : /aboard/.test(t) ? 'board' : ''}">${esc(t)}</span>`;
    const row = v => {
      if (v.grp) return `<div class="grp">${esc(v.grp)}</div>`;
      const e = v.e, horse = e.type === 'horse';
      const ride = horse ? `<button data-act="stab-ride" data-id="${esc(e.id)}"${mount === e.id ? ' disabled' : ' class="on"'}${tip(mount === e.id ? 'Your mount (H rides or calls her)' : 'Make her your mount (H rides or calls her)')}>${mount === e.id ? 'Mount' : 'Ride'}</button>` : '<i></i>';
      const go = e.stored ? '<i></i>' : `<button data-act="stab-look" data-id="${esc(e.id)}"${tip('Move the camera to it')}>Go to</button>`;
      const back = e.stored ? `<button data-act="stab-takeout" data-id="${esc(e.id)}"${tip('Parked beside its stable')}>Take out</button>`
        : `<button data-act="stab-recall" data-id="${esc(e.id)}"${e.recall ? ' disabled' : ''}${tip(e.recall ? 'Already heading back' : 'Riders get off; back to your nearest stable and stored there')}>Recall</button>`;
      return `<div class="vrow"><div class="thumb"><img src="${ART(horse ? e.horseKind : e.type)}" alt=""></div><div><div><b>${esc(v.name)}</b>${pill(e.stored ? 'stored' : v.status)}</div><div class="sm"${tip(v.where)}>${esc(v.where)}</div></div><div class="vbtn">${ride}${go}${back}</div></div>`;
    };
    const out = all.some(v => !v.e.stored && !v.e.recall);
    let c = `<div class="lab">Your horses and vehicles <span class="dim">${all.length} owned</span></div>`
      + (rows.length ? rows.slice(page * PER, page * PER + PER).map(row).join('') : '<div class="hint">None yet</div>')
      + `<div class="foot"><span class="sm">${pages > 1 ? `Page ${page + 1} of ${pages}` : 'Recall sends it to your nearest stable'}</span><span>`
      + (pages > 1 ? `<button data-act="stab-page" data-id="-1"${page ? '' : ' disabled'}>Prev</button> <button data-act="stab-page" data-id="1"${page < pages - 1 ? '' : ' disabled'}>Next</button> ` : '')
      + `<button data-act="stab-recallall"${out ? '' : ' disabled'}${tip('Everyone gets off; every horse and vehicle goes back to your nearest stable')}>Recall all</button></span></div>`;
    return `<div class="stab sa">${a}</div><div class="stab sb">${b}</div><div class="stab sc">${c}</div>`;
  }
  // true when the click was ours
  function click(d, s) {
    const act = d.act, id = d.id;
    if (!act?.startsWith('stab-')) return false;
    const st = S(), ent = id && game.state.entities[id];
    switch (act) {
      case 'stab-goto': { const b = (s.buildings || []).find(x => x.id === id || String(x.id) === id); if (b && st) focus(...st.centre(s, b)); break; }
      case 'stab-buy': { const k = id, n = Number(d.n) || 1; send({ id: heroId, type: 'frontier', action: 'stable', town: s.id, count: n, ...(C().kinds?.[k]?.vehicle ? { mode: k } : { mode: 'horse', kind: k }) }); break; }
      case 'stab-cancel': send({ id: heroId, type: 'frontier', action: 'stable', town: s.id, mode: 'cancel' }); break;
      case 'stab-ride': send({ id: heroId, type: 'frontier', action: 'stable', town: s.id, mode: 'choose', horse: id }); break;
      case 'stab-look': if (ent) focus(ent.x, ent.z); break;
      case 'stab-recall': send({ id: heroId, type: 'garage', action: 'recall', unit: id }); break;
      case 'stab-takeout': send({ id: heroId, type: 'garage', action: 'takeout', unit: id }); break;
      case 'stab-recallall': send({ id: heroId, type: 'garage', action: 'recallAll' }); break;
      case 'stab-page': page += Number(id) || 0; break;
    }
    return true;
  }
  return { html, click };
}
