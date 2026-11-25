// Field guide (Tim 2026-11-25): one notebook page that answers "what is good against what" with the real numbers.
// Every number is read live from the data (war.structures.damage and .stone, war.ships.hullDamage, the cannons'
// unitShare, war.structures.fire, war.armory.step, the hero's frontierDamage), so it follows any later change.
// Own button in the utility menu and its own key (fieldGuide, Shift+G). Presentation only.

const ICON = { siege: 'bow_cannon', melee: 'attack', ranged: 'hamstring', gatling: 'gatling', bomb: 'firebomb', torch: 'torch' };
// the damage kinds (keys of war.structures.damage and war.ships.hullDamage) that have a named row
export const KNOWN_KINDS = ['siege', 'melee', 'ranged', 'gatling', 'bomb'];
const COLS = [['troops', 'Troops', 'hero and crew too'], ['wood', 'Wood', 'most buildings'], ['stone', 'Stone', 'town hall, walls'], ['ships', 'Ships', 'hulls']];
const pct = f => Math.round(f * 100);
const num = (v, d) => typeof v === 'number' ? v : d;

// { cols, rows: [{ k, name, sub, icon, cells: { troops, wood, stone, ships } }], notes }
// a cell is { pct, lo?, hi? (pct as a range), fire? (it lights the building) } or { none: true } or { fire: true } alone
export function fieldGuideData(frontierData, unitsFile) {
  const W = frontierData?.war || {}, D = W.structures?.damage || {}, H = W.ships?.hullDamage || {};
  const stoneBomb = num(W.structures?.stone?.bomb, 1), fire = W.structures?.fire, types = unitsFile?.types || {};
  // a cannonball on a troop: unitShare of its damage, from every cannon (siege units, cannon towers, ship guns)
  const shares = [...Object.values(types).filter(u => u?.siege).map(u => num(u.unitShare, 1)),
    ...Object.values(W.buildings || {}).filter(b => b?.fire).map(b => num(b.fire.unitShare, 1)),
    ...Object.values(W.ships?.guns || {}).filter(g => typeof g?.unitShare === 'number').map(g => g.unitShare)];
  const lo = shares.length ? Math.min(...shares) : 1, hi = shares.length ? Math.max(...shares) : 1;
  const cell = f => ({ pct: pct(num(f, 1)) });
  const ranged = num(D.gatling, num(D.ranged, 1));   // buildings: a Gatling hit counts as ranged
  const rows = [
    { k: 'siege', name: 'Cannons', sub: 'Siege guns, towers, ship guns', cells: { troops: lo === hi ? cell(lo) : { pct: pct(lo), to: pct(hi) }, wood: cell(D.siege), stone: cell(D.siege), ships: cell(H.siege) } },
    { k: 'melee', name: 'Swords and hero', sub: 'Melee troops and heroes', cells: { troops: cell(1), wood: cell(D.melee), stone: cell(D.melee), ships: cell(H.melee) } },
    { k: 'ranged', name: 'Arrows and rifles', sub: 'Archers, riflemen, towers', cells: { troops: cell(1), wood: cell(D.ranged), stone: cell(D.ranged), ships: cell(H.ranged) } },
    { k: 'gatling', name: 'Gatling', sub: 'Gatling crews and deck guns', cells: { troops: cell(1), wood: cell(ranged), stone: cell(ranged), ships: cell(num(H.gatling, H.ranged)) } },
    { k: 'bomb', name: 'Fire-bombs', sub: 'Fire-bomb throwers', cells: { troops: cell(1), wood: { ...cell(D.bomb), fire: !!fire }, stone: cell(num(D.bomb, 1) * stoneBomb), ships: cell(H.bomb) } },
  ];
  // a damage kind added to either table later still shows (plain row, named by its key) until it gets a name and icon here
  const extra = [...new Set([...Object.keys(D), ...Object.keys(H)])].filter(k => !k.startsWith('_') && !KNOWN_KINDS.includes(k) && (typeof D[k] === 'number' || typeof H[k] === 'number'));
  for (const k of extra) rows.push({ k, name: k[0].toUpperCase() + k.slice(1), sub: 'Not yet in the field guide', unknown: true, cells: { troops: cell(1), wood: cell(D[k]), stone: cell(D[k]), ships: cell(H[k]) } });
  if (fire) rows.push({ k: 'torch', name: 'Torch', sub: 'Melee cast at a building', cells: { troops: { none: true }, wood: { fire: true }, stone: { fire: true }, ships: { none: true } } });
  for (const r of rows) r.icon = ICON[r.k] || 'attack';
  const heroX = num(types.hero?.frontierDamage, 1), step = num(W.armory?.step, 0), burn = num(fire?.burnTicks, 0);
  const notes = {
    fireDamage: num(fire?.damage, 0),
    fireLine: !fire ? '' : burn > 0 ? `Fire burns ${Math.round(burn / 20)} seconds, or until workers put it out` : 'Fire burns until workers put it out',
    armory: step > 0 ? `${pct(step)}% less per level against Troops` : '',
    hero: heroX === 1 ? '' : `hit ${heroX === 2 ? 'twice' : `${heroX} times`} as hard on the island`,
  };
  return { cols: COLS, rows, notes };
}

const RING = (w, cls) => `<svg class="${cls}" preserveAspectRatio="none" viewBox="0 0 ${w} 60" aria-hidden="true"><path d="${w > 100
  ? `M14 34 C 10 14, ${w * .3} 6, ${w * .53} 7 C ${w * .78} 8, ${w - 8} 14, ${w - 10} 32 C ${w - 12} 50, ${w * .73} 56, ${w / 2} 55 C ${w * .27} 54, 12 52, 8 36 C 6 24, 30 16, 60 13`
  : 'M8 32 C 6 12, 40 4, 62 7 C 86 10, 97 22, 92 38 C 86 54, 46 58, 24 52 C 10 47, 6 38, 14 26 C 20 18, 30 14, 40 12'}"/></svg>`;

export function fieldGuideHtml(data) {
  const { cols, rows, notes } = data;
  const per = `${notes.fireDamage} damage a second`;
  const td = (c, ring) => {
    if (c.none) return '<td class="na">no effect</td>';
    if (c.pct === undefined) return `<td class="fire"><span class="stamp">FIRE</span><small>${per}</small></td>`;
    const text = c.to !== undefined ? `${c.pct} to ${c.to}%` : `${c.pct}%`, top = c.to ?? c.pct;
    const cls = c.pct > 100 ? 'hi' : top < 100 ? 'lo' : 'mid';
    return `<td class="${cls}${c.fire ? ' fire' : ''}"${c.fire ? ` title="and sets it on fire, ${per}"` : ''}>${ring || ''}<b>${text}</b>${c.fire ? '<span class="stamp sm">+ FIRE</span>' : ''}</td>`;
  };
  // one hand-drawn loop round each run of cells that take extra (pct over 100)
  const row = r => {
    const cells = cols.map(([k]) => r.cells[k]);
    const html = cells.map((c, i) => {
      const hi = x => x && x.pct > 100;
      if (!hi(c) || hi(cells[i - 1])) return td(c);
      let n = 1; while (hi(cells[i + n])) n++;
      return td(c, `<span class="fg-loop" style="--n:${n}">${RING(n > 1 ? 100 * n : 100, 'ring')}</span>`);
    }).join('');
    return `<tr data-k="${r.k}"><th><img src="../assets/ui/abilities/${r.icon}.png" alt="" draggable="false"><div><span>${r.name}</span><small>${r.sub}</small></div></th>${html}</tr>`;
  };
  const foot = [notes.armory && `<div><b>Armory armor</b> ${notes.armory}</div>`, notes.hero && `<div><b>Heroes</b> ${notes.hero}</div>`].filter(Boolean).join('');
  return `<div class="fg-head"><h2>Field guide</h2><button type="button" class="fg-x">Esc</button></div>
<div class="fg-page"><div class="fg-spine">${STITCH}</div>
<div class="fg-sub">How much of each blow a target takes. 100% is a normal hit.</div>
<table><colgroup><col class="w"><col><col><col><col></colgroup><thead><tr><td>Weapon</td>${cols.map(([, n, s]) => `<td>${n}<small>${s}</small></td>`).join('')}</tr></thead>
<tbody>${rows.map(row).join('')}</tbody></table>
<div class="fg-slip"><div class="fg-key"><span class="kk"><span class="fg-seal">${RING(100, 'ring')}</span>hits harder</span><span><i>25%</i>faded ink, hits softer</span>${notes.fireLine ? `<span>${notes.fireLine}</span>` : ''}</div><div class="fg-notes">${foot}</div></div>
</div>`;
}

// Japanese stab binding: four holes, the thread wraps over the spine at each
const STITCH = (() => {
  const ys = [90, 250, 410, 570];
  return `<svg viewBox="0 0 40 660" preserveAspectRatio="none" aria-hidden="true"><g class="th"><line x1="26" y1="${ys[0]}" x2="26" y2="${ys[3]}"/>${ys.map(y => `<line x1="26" y1="${y}" x2="0" y2="${y}"/>`).join('')}</g>${ys.map(y => `<circle cx="26" cy="${y}" r="3.2"/>`).join('')}</svg>`;
})();

const PAPER = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='500' height='500'><filter id='w'><feTurbulence type='fractalNoise' baseFrequency='0.012 0.5' numOctaves='3' seed='3'/><feColorMatrix values='0 0 0 0 0.45 0 0 0 0 0.32 0 0 0 0 0.15 0 0 0 0.28 -0.05'/></filter><rect width='500' height='500' filter='url(%23w)'/></svg>"),url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' seed='7'/><feColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.25 0 0 0 0 0.12 0 0 0 0.16 0'/></filter><rect width='400' height='400' filter='url(%23p)'/></svg>")`;
const CLOTH = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='c'><feTurbulence type='fractalNoise' baseFrequency='0.9 0.08' numOctaves='2'/><feColorMatrix values='0 0 0 0 0.8 0 0 0 0 0.85 0 0 0 0 0.9 0 0 0 0.12 0'/></filter><rect width='300' height='300' filter='url(%23c)'/></svg>")`;
const F = 'var(--ln-font,"Lantern",Georgia,serif)';
const ICO = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' fill-rule='evenodd' d='M4 3.5h6.5c.9 0 1.5.6 1.5 1.5v15c0-.8-.7-1.5-1.5-1.5H4zM20 3.5h-6.5c-.9 0-1.5.6-1.5 1.5v15c0-.8.7-1.5 1.5-1.5H20zM6 7v1.4h4V7zm0 3v1.4h4V10zm8-3v1.4h4V7zm0 3v1.4h4V10zm0 3v1.4h3V13z'/%3E%3C/svg%3E")`;

const CSS = `
body #fieldguidebtn{--ico:${ICO}}
#fieldguide{position:fixed;left:50%;top:50%;z-index:31;width:980px;box-sizing:border-box;transform:translate(-50%,-50%) scale(var(--fg-s,1));font-family:${F};
 background:#1b120d;border:11px solid transparent;border-image:url(art/ui/lantern_frame.png) 36 round;background-clip:padding-box;box-shadow:0 20px 50px rgba(0,0,0,.85);user-select:none}
#fieldguide[hidden]{display:none}
#fieldguide .fg-head{display:flex;align-items:center;padding:12px 18px 10px;background:linear-gradient(180deg,rgba(120,30,20,.6),rgba(70,18,12,.4));box-shadow:inset 0 -2px 0 rgba(0,0,0,.5)}
#fieldguide .fg-head h2{margin:0;flex:1;font:800 26px/1 ${F};color:#f2e2c0}
#fieldguide .fg-x{font:500 14px ${F};color:#d9c39a;background:none;border:1px solid rgba(201,160,78,.5);padding:5px 10px;cursor:pointer}
#fieldguide .fg-x:hover{border-color:#e9c27a;color:#f2e2c0}
#fieldguide .fg-page{position:relative;margin:10px;padding:14px 30px 18px 74px;color:#3a2716;background-color:#e3d2a8;
 background-image:radial-gradient(ellipse 70% 60% at 50% 45%,transparent 55%,rgba(70,40,12,.28)),radial-gradient(ellipse 9% 7% at 93% 12%,rgba(130,85,35,.16),transparent 70%),radial-gradient(ellipse 5% 4% at 20% 92%,rgba(130,85,35,.14),transparent 70%),radial-gradient(circle at 0 0,rgba(90,55,20,.35),transparent 120px),radial-gradient(circle at 100% 100%,rgba(90,55,20,.45),transparent 160px),radial-gradient(circle at 100% 0,rgba(90,55,20,.3),transparent 120px),${PAPER};
 box-shadow:inset 0 0 70px rgba(110,70,25,.45),inset 0 0 0 1px rgba(80,50,20,.4)}
#fieldguide .fg-page::before{content:'';position:absolute;left:58px;top:0;bottom:0;width:2px;background:rgba(170,50,35,.45)}
#fieldguide .fg-spine{position:absolute;left:0;top:0;bottom:0;width:40px;background:${CLOTH},linear-gradient(90deg,#161c24,#232d39 60%,#141a21);box-shadow:inset -2px 0 3px rgba(0,0,0,.5),2px 0 4px rgba(40,25,10,.35)}
#fieldguide .fg-spine svg{width:100%;height:100%;display:block}
#fieldguide .fg-spine .th{stroke:#c9b58c;stroke-width:2.2;stroke-linecap:round;fill:none;opacity:.85;filter:url(#fg-rough)}
#fieldguide .fg-spine circle{fill:#120a05}
#fieldguide .fg-sub{font:italic 500 15.5px ${F};color:#5a3f26;margin:0 0 2px}
#fieldguide table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:6px}
#fieldguide col.w{width:290px}
#fieldguide thead td{font:800 17px ${F};color:#2c1a0e;text-align:center;padding:8px 4px 6px;background:linear-gradient(90deg,transparent,rgba(50,30,12,.75) 4%,rgba(50,30,12,.75) 96%,transparent) bottom/100% 2px no-repeat}
#fieldguide thead td small{display:block;font:italic 500 13px ${F};color:#6a4e32;margin-top:2px}
#fieldguide thead td:first-child{text-align:left;font:italic 500 15px ${F};color:#6a4e32;vertical-align:bottom;padding-bottom:10px}
#fieldguide tbody tr{background:linear-gradient(90deg,transparent,rgba(70,45,20,.38) 6%,rgba(70,45,20,.38) 94%,transparent) bottom/100% 1.5px no-repeat}
#fieldguide tbody tr:nth-child(odd){background:linear-gradient(90deg,transparent,rgba(120,80,35,.09) 8%,rgba(120,80,35,.09) 92%,transparent),linear-gradient(90deg,transparent,rgba(70,45,20,.3) 6%,rgba(70,45,20,.3) 94%,transparent) bottom/100% 1.5px no-repeat}
#fieldguide th{display:flex;align-items:center;gap:10px;padding:7px 6px;text-align:left;font-weight:500}
#fieldguide th img{flex:none;width:48px;height:48px;object-fit:cover;filter:sepia(1) saturate(.5) contrast(1.05) brightness(2.1);mix-blend-mode:multiply;
 -webkit-mask:radial-gradient(circle,#000 55%,transparent 71%);mask:radial-gradient(circle,#000 55%,transparent 71%)}
#fieldguide th span{display:block;font:800 17px ${F};color:#2c1a0e}
#fieldguide th small{display:block;font:500 13.5px ${F};color:#6a4e32;margin-top:1px}
#fieldguide td{text-align:center;vertical-align:middle;padding:6px 2px;position:relative}
#fieldguide td b{font:500 19px ${F};color:#5a4630}
#fieldguide td.lo b{color:#7a6247;font-size:17px}
#fieldguide td.hi b{position:relative;color:#a12a18;font-weight:800;font-size:21px}
#fieldguide td small{display:block;font:500 13px ${F};color:#9a3a22;margin-top:2px}
#fieldguide td.na{font:italic 500 13.5px ${F};color:#7d6a52}
#fieldguide .fg-loop{position:absolute;left:-10px;top:2px;bottom:2px;width:calc(var(--n) * 100% + 4px);pointer-events:none}
#fieldguide .ring{position:absolute;inset:0;width:100%;height:100%;overflow:visible;mix-blend-mode:multiply;opacity:.9}
#fieldguide .ring path{fill:none;stroke:#a8301c;stroke-width:3.4;stroke-linecap:round;filter:url(#fg-rough)}
#fieldguide .stamp{display:inline-block;font:800 14px ${F};letter-spacing:.12em;color:#a8301c;border:2.5px solid #a8301c;padding:3px 8px 2px;transform:rotate(-4deg);opacity:.9;mix-blend-mode:multiply;border-radius:2px}
#fieldguide .stamp.sm{margin:0 0 0 8px;font-size:11px;padding:2px 5px 1px;vertical-align:middle}
#fieldguide td.fire b{vertical-align:middle}
#fieldguide .fg-slip{position:relative;display:flex;gap:56px;align-items:flex-start;margin-top:14px;padding:10px 14px 12px;background:rgba(245,232,200,.55);box-shadow:0 2px 5px rgba(60,35,15,.35),inset 0 0 0 1px rgba(120,80,35,.3);transform:rotate(-.6deg)}
#fieldguide .fg-slip::before{content:'';position:absolute;left:50%;top:-9px;width:60px;height:18px;margin-left:-30px;background:rgba(214,196,150,.85);transform:rotate(2deg);box-shadow:0 1px 2px rgba(0,0,0,.3),inset 0 0 0 1px rgba(120,90,50,.25)}
#fieldguide .fg-key{display:flex;flex-direction:column;gap:6px;font:italic 500 14px ${F};color:#5a3f26}
#fieldguide .fg-key i{font-style:italic;color:#9a8a72;margin-right:8px}
#fieldguide .kk{display:inline-flex;align-items:center}
#fieldguide .fg-seal{position:relative;display:inline-block;width:34px;height:22px;margin-right:12px}
#fieldguide .fg-notes{display:flex;flex-direction:column;gap:10px;font:500 14.5px ${F};color:#4a3320}
#fieldguide .fg-notes b{color:#2c1a0e}`;

export function createFieldGuide({ frontierData, unitsFile, doc = document, onOpen, onClose }) {
  const style = doc.createElement('style'); style.textContent = CSS; doc.head.append(style);
  const el = Object.assign(doc.createElement('div'), { id: 'fieldguide', hidden: true });
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Field guide');
  doc.body.append(el);
  // the shared rough-ink filter for the loops and the binding thread
  const defs = doc.createElement('div');
  defs.innerHTML = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="fg-rough"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5"/><feDisplacementMap in="SourceGraphic" scale="3"/></filter></svg>';
  doc.body.append(defs.firstChild);
  el.addEventListener('click', e => { if (e.target.closest?.('.fg-x')) close(); });
  // shrink to fit a small window (no scrollbars)
  function fit() {
    const win = doc.defaultView; if (!win || el.hidden) return;
    el.style.setProperty('--fg-s', '1');
    const s = Math.min(1, (win.innerWidth - 24) / el.offsetWidth, (win.innerHeight - 24) / el.offsetHeight);
    el.style.setProperty('--fg-s', String(Math.max(.5, s)));
  }
  doc.defaultView?.addEventListener('resize', fit);
  function open() { el.innerHTML = fieldGuideHtml(fieldGuideData(frontierData, unitsFile)); el.hidden = false; fit(); doc.fonts?.ready?.then(fit); onOpen?.(); }
  function close() { if (el.hidden) return; el.hidden = true; onClose?.(); }
  return { open, close, toggle: () => el.hidden ? open() : close(), isOpen: () => !el.hidden, el };
}
