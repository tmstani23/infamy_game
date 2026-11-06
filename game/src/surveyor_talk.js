// The old surveyor outside the Land Office (Tim 2026-11-06 20:45). Space beside him: without a permit he says
// to buy one; with a new permit "Show me on the map" sends { type: 'landOffice', action: 'survey' } (sim/frontier/
// land_office.js survey: the nearest sites become known) and then walks you round them on the World map, one
// stop at a time, with a short word on resources the first time. "Show me again" replays the last report.
// Reads the state and sends commands only. Wording on resources only states what the rules do today.
import { RICH_NAME, RICH_GIVES } from './sim/resource_spots.js';
// each world node near a site is a rich deposit (names from sim/resource_spots.js); camps and quarries near
// forests and stone veins work faster (frontier.json traits.nodeKinds)
const BONUS = { forest: 'lumber camps here cut faster', quarry: 'quarries here dig faster' };
const NODE = Object.fromEntries(Object.keys(RICH_NAME).map(k => [k, n => `${n > 1 ? `${n} × ` : ''}${RICH_NAME[k]}: ${RICH_GIVES[k]}${BONUS[k] ? `; ${BONUS[k]}` : ''}`]));
const INTRO = [
  'Every site has three marks. Soil feeds your farms: good soil, more food. Water and defence are noted too, for the wells and walls to come.',
  'Then the ground round it. A Rich forest or a Rich stone vein near a town makes its lumber camps and quarries work faster, more for each one close by. Rich fishing and fertile grounds are food your people can gather. Ore veins are dug as stone for now; iron comes later.',
  'Small glowing spots near a town are its first supply. The rich deposits give much more and grow back faster.',
];
export function createSurveyorTalk({ panel, card, game, heroId, send, map }) {
  let open = false, shown = '', waitFor = null, tour = null, cardShown = '';
  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans?.[hero()?.owner];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const at = () => { const h = hero(), d = game.doors?.find(x => x.menu === 'surveyor'); return !!h && !!d && h.place === 'street' && Math.hypot(h.x - d.x, h.z - d.z) < 3.5; };
  const siteRows = ids => { const all = game.landOffice?.sites(clan()?.id) || []; return ids.map(id => all.find(s => s.id === id)).filter(Boolean); };
  const score = s => s.traits.soil + s.traits.water + s.traits.defense + ((s.traits.nodes?.forest || 0) + (s.traits.nodes?.quarry || 0)) * 0.5 - (s.campWarn ? 1.5 : 0);
  const nodesOf = s => Object.entries(s.traits.nodes || {}).filter(([k, n]) => n && NODE[k]).map(([k, n]) => NODE[k](n));

  function lines(c) {
    if (c?.surveyPending) return [c.survey ? 'Another permit? Then I ride out past your last town and see what lies beyond.' : 'A founding permit! Good. I have walked every road on this island. Let me show you where a town could stand.'];
    if (c?.survey) return ['Those sites are on your map. Take your settlers through the island gate and ride straight to one.'];
    return ['I have walked every road on this island. Buy a founding permit at the Land Office and I will tell you where to settle.'];
  }
  // tour stops: the intro (first report only), each site, then his pick
  function stops(c) {
    const list = siteRows(c.survey?.sites || []), out = [];
    if (!list.length) return [{ text: 'I found no open sites near enough. Walk out and scout; sites you find show up on your map.' }];
    if (c.survey.n === 1) out.push({ site: list[0].id, span: 5200, title: 'HOW TO READ A SITE', text: INTRO });
    for (const s of list) out.push({ site: s.id, title: `${s.region} · ${s.id}`, text: [`Soil ${s.traits.soil} · water ${s.traits.water} · defence ${s.traits.defense}`, ...(nodesOf(s).length ? nodesOf(s) : ['No resource nodes close by']),
      ...(s.campWarn ? [`Bandits camp ${s.campDistance} away: bring crew`] : [])] });
    const best = [...list].sort((a, b) => score(b) - score(a))[0], why = [];
    if (best.traits.soil >= 2) why.push('the soil is good'); if ((best.traits.nodes?.forest || 0) + (best.traits.nodes?.quarry || 0)) why.push('timber and stone are close');
    if (!best.campWarn) why.push('no bandits nearby'); if (best.traits.defense >= 2) why.push('it is easy to hold');
    out.push({ site: best.id, title: 'MY PICK', text: [`${best.region} · ${best.id}${why.length ? `: ${why.join(', ')}.` : '.'}`, 'Take at least 5 settlers through the island gate and choose Ride to a known site.'] });
    return out;
  }
  function startTour() { const c = clan(); if (!c?.survey) return; tour = { list: stops(c), i: 0 }; close(); show(); }
  function show() {
    if (!tour) { card.hidden = true; return; }
    const s = tour.list[tour.i];
    if (s.site) map.tourTo(s.site, s.span);
    const last = tour.i === tour.list.length - 1;
    const html = `<h3>THE OLD SURVEYOR${s.title ? ` · ${esc(s.title)}` : ''}</h3>${[].concat(s.text).map(t => `<p>${esc(t)}</p>`).join('')}`
      + `<div class="row">${tour.i ? '<button data-sv="back">Back</button>' : ''}<button data-sv="${last ? 'done' : 'next'}" class="goal-flash">${last ? 'Done' : 'Next'}</button></div>`
      + `<div class="waiting">${tour.i + 1} of ${tour.list.length} · Esc closes</div>`;
    card.hidden = false;
    if (html !== cardShown) { card.innerHTML = html; cardShown = html; }
  }
  function endTour() { if (!tour) return; tour = null; card.hidden = true; map.endTour(); }
  card.addEventListener('click', e => {
    const a = e.target.dataset?.sv; if (!a || !tour) return;
    if (a === 'next') tour.i++; else if (a === 'back') tour.i--; else if (a === 'done') { endTour(); map.close(); return; }
    show();
  });
  function act(a) {
    const c = clan();
    if (a === 'survey' && c?.surveyPending) { waitFor = (c.survey?.n || 0) + 1; send({ id: heroId, type: 'landOffice', action: 'survey' }); }
    else if (a === 'again') startTour();
    else close();
  }
  panel.addEventListener('click', e => { const a = e.target.dataset?.pick; if (a) act(a); });
  function buttons(c) { return c?.surveyPending ? [['survey', 'Show me on the map']] : c?.survey ? [['again', 'Show me again'], ['close', 'Later']] : [['close', 'Later']]; }
  function update() {
    const c = clan();
    if (waitFor && (c?.survey?.n || 0) >= waitFor) { waitFor = null; startTour(); }
    if (tour && !map.isOpen()) endTour();
    if (open && !at()) open = false;
    panel.hidden = !open;
    if (!open) return;
    const html = `<h3>THE OLD SURVEYOR</h3>${lines(c).map(t => `<p>${esc(t)}</p>`).join('')}<div class="row">${buttons(c).map(([a, t], i) => `<button data-pick="${a}"${!i && a !== 'close' ? ' class="goal-flash"' : ''}>${i + 1}. ${t}</button>`).join('')}</div>`
      + '<div class="waiting">Space / Esc close</div>';
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }
  function close() { open = false; update(); }
  return {
    update, isOpen: () => open, at,
    pick(i) { const b = buttons(clan())[i]; if (b) act(b[0]); },
    touring: () => !!tour,
    close() { close(); endTour(); },
    toggle() { open = !open && at(); update(); },
  };
}
