// The full game map (M, Tim 2026-10-20, docs/territory_plan.md): the whole district over the
// screen with the same fog of war, territory (sim/territory.js) and switches for its layers.
// The game keeps running underneath (no pause, as in multiplayer). Hover a business for its
// owner and payout; click anywhere (a business: its door) to look there and close the map.
// Drawn by src/minimap.js in its big mode. Only reads the state.
import { createMinimap } from './minimap.js';

const NAMES = { warehouse: 'Warehouse', teahouse: 'Teahouse', gambling_den: 'Gambling den', clinic: 'Clinic', police_box: 'Police box',
  police_hq: 'Police HQ', moneylender: "Moneylender's house", hideout: 'Hideout' };
const LAYERS = [['territory', 'Territory'], ['businesses', 'Businesses'], ['police', 'Police'], ['units', 'Units']];

export function createGameMap({ root, game, district, view, fog, heroId, clan = 'player', units, selected, send }) {
  const canvas = root.querySelector('canvas'), tip = root.querySelector('.maptip'), bar = root.querySelector('.maplayers'), side = root.querySelector('.mapside');
  const layers = { territory: true, businesses: true, police: true, units: true };
  let map = null;
  for (const [k, label] of LAYERS) {
    const b = document.createElement('button');
    b.textContent = label; b.className = 'on';
    b.addEventListener('click', e => { layers[k] = !layers[k]; b.className = layers[k] ? 'on' : ''; e.currentTarget.blur(); map?.draw(); });
    bar.appendChild(b);
  }
  // clicks on the map screen never reach the crew controls underneath (they listen on the window)
  for (const type of ['mousedown', 'mouseup', 'click', 'contextmenu', 'pointerdown', 'pointerup']) root.addEventListener(type, e => { e.stopPropagation(); if (type === 'contextmenu') e.preventDefault(); });
  root.querySelector('.mapclose').addEventListener('click', e => { close(); e.currentTarget.blur(); });

  // hover: what is known about that business (a rival's owner once you have seen it)
  function hover(b, e, quarter) {
    if (!b && quarter) return hoverQuarter(quarter, e);
    if (!b) { tip.hidden = true; return; }
    const st = game.state, vg = game.vision.grid(clan), seen = b.owner === clan || vg.explored[game.vision.cellOf(b.x, b.z)] === 1;
    const R = units?.rules?.businesses?.[b.kind], q = game.territory?.quarters.find(q => q.businesses.includes(b.id));
    const owner = !b.owner ? (R ? 'Unclaimed' : '') : seen ? (b.owner === clan ? 'Yours' : st.clans[b.owner]?.name || 'A rival clan') : 'Owner unknown';
    const lines = [`<b>${NAMES[b.kind] || b.kind}</b>`];
    if (b.hideout) lines.push(b.owner === clan ? 'Your hideout' : `${st.clans[b.owner]?.name || 'Rival'} hideout`);
    else if (owner) lines.push(owner);
    if (R?.payout) lines.push(`Pays ${R.payout} ryo at dawn · ${R.score || 0} season point${R.score === 1 ? '' : 's'}`);
    if (q) lines.push(q.name);
    if (b.owner && seen && R) {
      const guards = Object.values(st.entities).filter(g => g.guard === b.id && !g.dead).length;
      lines.push(`${guards} house guard${guards === 1 ? '' : 's'}`);
    }
    tip.innerHTML = lines.join('<br>');
    const r = root.getBoundingClientRect();
    tip.style.left = `${e.clientX - r.left + 14}px`; tip.style.top = `${e.clientY - r.top + 10}px`;
    tip.hidden = false;
  }

  // hover a quarter: who holds it (Tim 2026-10-20: just that)
  function hoverQuarter(q, e) {
    const st = game.state, t = game.territory;
    const o = map?.shownHolder(q);
    const lines = [`<b>${q.name}</b>`, o ? `Held by ${o === clan ? 'you' : st.clans[o]?.name || 'a rival'} (+${Math.round(t.rules.quarterBonus * 100)}% payout)` : 'Not held by one clan'];
    tip.innerHTML = lines.join('<br>');
    const r = root.getBoundingClientRect();
    tip.style.left = `${e.clientX - r.left + 14}px`; tip.style.top = `${e.clientY - r.top + 10}px`;
    tip.hidden = false;
  }
  // a clan's score, spelled out (hover): "Teahouse 1 + Gambling den 3 = 4"
  const why = id => { const p = game.territory.breakdown(id); return p.length ? `${p.map(x => `${x.label} ${x.points}`).join(' + ')} = ${game.territory.score(id)}` : 'No businesses yet = 0'; };

  // the side panel: season day and every clan's score (sim/territory.js), quarters held
  function drawSide() {
    const st = game.state, s = st.season, t = game.territory;
    if (!t || !s) { side.innerHTML = ''; return; }
    const rows = t.standings().map(r => {
      const c = st.clans[r.clan];
      return `<div class="row" title="${why(r.clan)}"><i style="background:${c.color}"></i><span>${r.clan === clan ? 'You' : c.name}</span><b>${r.score}</b></div>`;
    }).join('');
    const quarters = t.quarters.map(q => {
      const o = t.heldBy(q);
      return `<div class="row q"><span>${q.name}</span><em>${!o ? 'nobody holds it all' : o === clan ? 'yours (+payout)' : `held by ${st.clans[o]?.name}`}</em></div>`;
    }).join('');
    // a short key (Tim 2026-10-20: just these three)
    const legend = `<h4>Key</h4><div class="key"><i class="k-turf"></i>Territory</div>`
      + `<div class="key"><i class="k-quarter"></i>Quarter: hold it all for +${Math.round(t.rules.quarterBonus * 100)}% payout</div>`
      + `<div class="key"><i class="k-cam"></i>Camera view</div>`;
    const html = `<h4>Season · day ${Math.min(s.day, s.cycles)} of ${s.cycles}</h4>${rows}<h4>Quarters</h4>${quarters}${legend}`;
    if (side.innerHTML !== html) side.innerHTML = html;
  }

  const isOpen = () => !root.hidden;
  function open() {
    root.hidden = false;
    if (!map) {
      // made on first open, when the canvas has its size on screen
      map = createMinimap({ canvas, game, district, view, fog, heroId, clan, selected, send, big: true, layers, onHover: hover, onPick: close });
    }
    map.draw(); drawSide();
  }
  function close() { root.hidden = true; tip.hidden = true; }
  const toggle = () => (isOpen() ? close() : open());

  let frame = 0;
  function update() {
    if (!isOpen() || !map) return;
    map.update();
    if (frame++ % 20 === 0) drawSide();
  }
  return { open, close, toggle, isOpen, update, ping: (x, z) => map?.ping(x, z) };
}
