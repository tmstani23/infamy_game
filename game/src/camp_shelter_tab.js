// The camp hall's Shelter tab (Tim 2026-11-25): who is inside the camp hall and why, the room left, Release all and
// Send all in; a click on a worker's name tag sends that one back to work. A board of up to 14 hanging name tags
// (nafuda), hiding ones first: a vermilion seal for those who fled an attack, an ink mark for those sent in by hand.
// Rules live in sim/frontier/structures.js (hallShelter).

const PER_PAGE = 14;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nameOf = id => /^w\d+$/.test(id) ? `Worker ${id.slice(1)}` : `Worker ${id}`;
// why one is inside: hiding from an attack (he comes out by himself) or sent in by hand (stays until released)
const whyOf = w => w.shelter.manual ? 'hand' : 'attack';
const WHY = { attack: ['Hiding', 'Hiding from the attack: comes out by himself once no enemy is near'], hand: ['Sent in', 'Sent in by you: stays until you release him'] };

export function shelterTabSig(c) {
  return (c.workers || []).filter(w => w.shelter).map(w => `${w.id}:${whyOf(w)}:${w.shelter.in ? 1 : 0}`).join(',') + `|${(c.workers || []).length}`;
}

// c = the war record's camp; room = shelter.campHallRoom; page = Shelter tab page; jobOf(w) = the job he left ('timber', 'stone', '')
export function shelterTabHtml(c, room, page = 0, jobOf = () => '') {
  const ws = c.workers || [], hall = (c.buildings || []).find(b => b.type === 'camp_hall' && b.stage === 'built');
  const inside = ws.filter(w => w.shelter && (w.shelter.b == null || w.shelter.b === hall?.id)).sort((a, b) => (whyOf(a) === 'attack' ? 0 : 1) - (whyOf(b) === 'attack' ? 0 : 1));   // hiding ones first
  const elsewhere = ws.filter(w => w.shelter && !inside.includes(w)).length, out = ws.length - inside.length - elsewhere, cap = Number.isFinite(room) ? room : 0;
  const pages = Math.max(1, Math.ceil(inside.length / PER_PAGE)), p = Math.max(0, Math.min(page, pages - 1));
  const n = { attack: inside.filter(w => whyOf(w) === 'attack').length, hand: inside.filter(w => whyOf(w) === 'hand').length };
  const tags = inside.slice(p * PER_PAGE, (p + 1) * PER_PAGE).map(w => {
    const k = whyOf(w), [, tip] = WHY[k], going = !w.shelter.in, job = jobOf(w);
    return `<button class="stag ${k}${going ? ' going' : ''}" data-shelterone="${esc(w.id)}" title="${esc(`${nameOf(w.id)}${job ? `, left the ${job}` : ''}. ${tip}${going ? '. On his way in' : ''}. Click to send him back to work.`)}">`
      + `<i class="speg"></i><em>worker</em><b>${esc(nameOf(w.id).replace('Worker ', ''))}</b><small>${esc(job || 'idle')}</small><i class="sseal"></i><span class="srel">Release</span></button>`;
  }).join('') + Array.from({ length: Math.max(0, Math.min(PER_PAGE, cap - p * PER_PAGE) - Math.min(PER_PAGE, inside.length - p * PER_PAGE)) }, () => '<span class="speg free" title="Room for one more"></span>').join('');   // empty pegs: the room left
  const board = inside.length ? `<div class="sboard">${tags}</div>` : `<div class="sboard empty"><div class="snone">The camp hall stands empty. Send workers in when the enemy comes near.</div></div>`;
  const pager = pages > 1 ? `<div class="spager"><button class="sturn back" data-spage="-1"${p ? '' : ' disabled'} title="Previous board"></button><span>Board ${p + 1} of ${pages}</span><button class="sturn" data-spage="1"${p < pages - 1 ? '' : ' disabled'} title="Next board"></button></div>` : '';
  return `<div class="shelterbox">`
    + `<div class="shead" title="Workers inside the camp hall, of the room it has"><b>${inside.length}</b><span>of ${cap} in the hall</span>`
    + `${n.attack ? `<span class="attack"><i class="sseal"></i>${n.attack} fled the attack</span>` : ''}${n.hand ? `<span class="hand"><i class="sseal"></i>${n.hand} by your order</span>` : ''}</div>`
    + board + pager
    + `<div class="sacts"><button class="go" data-shelterall="leave"${ws.some(w => w.shelter) ? '' : ' disabled'} title="Every sheltering worker goes back to the job he had">Release all</button>`
    + `<button data-shelterall="enter"${out > 0 && inside.length < cap ? '' : ' disabled'} title="Every camp worker outside runs to the camp hall and waits inside, safe, until released">Send all in${out > 0 ? ` (${out})` : ''}</button>`
    + `<span class="small">Click a worker's tag to send him back to work</span>`
    + (elsewhere ? `<span class="small">${elsewhere} more in a lumber camp or quarry</span>` : '') + `</div>`
    + `</div>`;
}

export const SHELTER_CSS = `
body #warcamp .tabs{gap:2px}body #warcamp .tabs .tab{white-space:nowrap;padding:6px 9px 8px}   /* six tabs on one line */
#warcamp .shelterbox{margin-top:8px;min-width:0}
#warcamp .shead{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 14px;margin-bottom:10px;color:var(--ln-dim,#9aa3a6)}
#warcamp .shead > b{font:800 30px/1 var(--ln-font,serif);color:var(--ln-num,#f6e6bf);margin-right:-8px}
#warcamp .shead .attack{color:#ff9d7d}#warcamp .shead .hand{color:#e2cfa8}
#warcamp .shead .sseal{display:inline-block;width:10px;height:10px;margin-right:5px;vertical-align:-1px}
/* the board: dark lacquered wood lit by a lantern from above; name tags hang from pegs in two rows of seven */
#warcamp .sboard{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-auto-rows:108px;gap:16px 8px;box-sizing:border-box;width:100%;height:268px;padding:14px 12px 10px;align-content:start;
  background:radial-gradient(ellipse 70% 60% at 50% 0%,rgba(255,170,80,.22),transparent 70%),repeating-linear-gradient(90deg,rgba(0,0,0,.18) 0 2px,transparent 2px 9px),linear-gradient(180deg,#3a2616,#24160c);
  box-shadow:inset 0 0 0 2px #0a0604,inset 0 0 26px rgba(0,0,0,.8),0 0 0 1px #6a5032,0 4px 10px rgba(0,0,0,.6)}
#warcamp .sboard.empty{display:flex;align-items:center;justify-content:center}
#warcamp .snone{color:#c9b896;font-style:italic;font-size:13px}
body #warcamp .stag{position:relative;display:block!important;box-sizing:border-box;height:108px;padding:16px 0 0!important;border:none!important;border-radius:4px 4px 2px 2px!important;cursor:pointer;color:#2a1a10!important;text-align:center;
  background:linear-gradient(90deg,rgba(0,0,0,.1),transparent 18%,transparent 82%,rgba(0,0,0,.14)),repeating-linear-gradient(180deg,rgba(120,80,40,.1) 0 3px,transparent 3px 7px),linear-gradient(180deg,#e8cf9e,#cfae74)!important;
  box-shadow:0 0 0 1px #3a2616,0 4px 6px rgba(0,0,0,.55)!important;transform:rotate(-1deg);transition:transform .12s}
body #warcamp .stag:nth-child(2n){transform:rotate(1.2deg)}body #warcamp .stag:nth-child(3n){transform:rotate(-.4deg)}
#warcamp .speg.free{position:relative;justify-self:center;width:8px;height:8px;margin-top:-6px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#8a6a3c,#3a2616);box-shadow:0 1px 2px #000;opacity:.6}
#warcamp .stag .speg{position:absolute;left:50%;top:-6px;width:8px;height:8px;margin-left:-4px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#e2b96e,#6a4a24);box-shadow:0 1px 2px #000}
#warcamp .stag em{position:absolute;left:0;right:0;top:12px;font:700 10px/1 var(--ln-font,serif)!important;font-style:normal;color:#8a6a44}
#warcamp .stag b{position:absolute;left:0;right:0;top:24px;display:block;font:800 22px/1 var(--ln-font,serif)!important;color:#2a1a10}
#warcamp .stag small{position:absolute;left:0;right:0;top:50px;display:block;font:700 11px/1 var(--ln-font,serif)!important;color:#6a4a2a}
#warcamp .sseal{display:block;border-radius:3px 2px 4px 2px;transform:rotate(-7deg)}
#warcamp .stag .sseal{position:absolute;left:50%;bottom:10px;width:22px;height:22px;margin-left:-11px}
#warcamp .attack .sseal,#warcamp .stag.attack .sseal{background:linear-gradient(135deg,rgba(255,255,255,.12),transparent 40%,rgba(0,0,0,.18)),#b8302a;box-shadow:inset 0 0 0 2px #e2cfa8,inset 0 0 0 4px #b8302a,inset 4px 4px 0 6px rgba(226,207,168,.0);opacity:.9}
#warcamp .hand .sseal,#warcamp .stag.hand .sseal{background:transparent;box-shadow:inset 0 0 0 3px #1e140c,inset 0 0 0 5px transparent;opacity:.8;transform:rotate(5deg)}
#warcamp .stag.hand .sseal::after,#warcamp .shead .hand .sseal::after{content:'';position:absolute;inset:6px;background:#1e140c}
#warcamp .stag .sseal{position:absolute}#warcamp .shead .sseal{position:relative}
#warcamp .shead .hand .sseal{box-shadow:inset 0 0 0 2px #e2cfa8;opacity:1}#warcamp .shead .hand .sseal::after{inset:4px;background:#e2cfa8}
#warcamp .shead .sseal{width:12px!important;height:12px!important}
#warcamp .stag.going{filter:brightness(.8)}
#warcamp .stag .srel{position:absolute;left:3px;right:3px;bottom:12px;padding:4px 0;display:none;font:800 11.5px/1 var(--ln-font,serif)!important;color:#ffe4d6;background:linear-gradient(180deg,#a3342a,#6a1c16);box-shadow:0 0 0 1px #2a0806,0 2px 4px rgba(0,0,0,.5);transform:rotate(-6deg)}
body #warcamp .stag:hover{transform:translateY(-3px) rotate(0)!important;box-shadow:0 0 0 1px #3a2616,0 0 14px rgba(255,180,90,.55),0 6px 8px rgba(0,0,0,.6)!important}
#warcamp .stag:hover .srel{display:block}#warcamp .stag:hover .sseal{opacity:.25}
#warcamp .spager{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:8px;color:var(--ln-dim,#9aa3a6);font-size:12.5px}
body #warcamp .spager .sturn{width:22px;height:22px;padding:0;position:relative}
body #warcamp .spager .sturn::after{content:'';position:absolute;left:8px;top:6px;border:5px solid transparent;border-left:7px solid #e2b96e;border-right:0}
body #warcamp .spager .sturn.back::after{left:6px;border-left:0;border-right:7px solid #e2b96e}
#warcamp .sacts{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;margin-top:12px}
`;
