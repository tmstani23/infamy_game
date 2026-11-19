// The old surveyor outside the Land Office (Tim 2026-11-06 20:45). Space beside him: without a permit he says
// to buy one; with a new permit "Show me on the map" sends { type: 'landOffice', action: 'survey' } (sim/frontier/
// land_office.js survey: the nearest sites become known) and then walks you round them on the World map, one
// stop at a time, with a short word on resources the first time. "Show me again" replays the last report.
// Goals pass (Tim 2026-11-19): once after your first town (clan.warTalkDue, the "News of rival towns" goal) he talks
// about the rival towns and making war, a page at a time; the last page sends { type: 'landOffice', action: 'rivals' }
// (sim/frontier/land_office.js rivalsTalk: a question mark area for each rival on your World map).
// Reads the state and sends commands only. Wording on resources only states what the rules do today.
import { RICH_NAME, RICH_GIVES } from './sim/resource_spots.js';
import { msInstall, msShell, msAside, msBtn, msConcept, msEsc } from './menu_shell.js';
// each world node near a site is a rich deposit (names from sim/resource_spots.js); camps and quarries near
// forests and stone veins work faster (frontier.json traits.nodeKinds)
const BONUS = { forest: 'lumber camps here cut faster', quarry: 'quarries here dig faster' };
const NODE = Object.fromEntries(Object.keys(RICH_NAME).map(k => [k, n => `${n > 1 ? `${n} x ` : ''}${RICH_NAME[k]}: ${RICH_GIVES[k]}${BONUS[k] ? `; ${BONUS[k]}` : ''}`]));
const INTRO = [
  'Every site has three marks. Soil feeds your farms: good soil, more food. Water and defence are noted too, for the wells and walls to come.',
  'Then the ground round it. A Rich forest or a Rich stone vein near a town makes its lumber camps and quarries work faster, more for each one close by. Rich fishing and fertile grounds are food your people can gather. Ore veins are dug as stone for now; iron comes later.',
  'Small glowing spots near a town are its first supply. The rich deposits give much more and grow back faster.',
];
export function createSurveyorTalk({ panel, card, game, heroId, send, map }) {
  let open = false, shown = '', waitFor = null, tour = null, cardShown = '', page = 0, hintsWait = false;
  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans?.[hero()?.owner];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const at = () => { const h = hero(), d = game.doors?.find(x => x.menu === 'surveyor'); return !!h && !!d && h.place === 'street' && Math.hypot(h.x - d.x, h.z - d.z) < 3.5; };
  const siteRows = ids => { const all = game.landOffice?.sites(clan()?.id) || []; return ids.map(id => all.find(s => s.id === id)).filter(Boolean); };
  const score = s => s.traits.soil + s.traits.water + s.traits.defense + ((s.traits.nodes?.forest || 0) + (s.traits.nodes?.quarry || 0)) * 0.5 - (s.campWarn ? 1.5 : 0);
  const nodesOf = s => Object.entries(s.traits.nodes || {}).filter(([k, n]) => n && NODE[k]).map(([k, n]) => NODE[k](n));

  // the talk on rival towns and war (goals pass): one page at a time
  const rivals = () => Object.values(game.state.clans || {}).filter(r => r.bot && r.id !== clan()?.id).map(r => r.name || r.id);
  const WAR = () => { const n = rivals(), who = n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0] || 'The other clans';
    return [
      ['Your trains are running. Good. Now hear what my riders tell me of the other clans.'],
      [`${who} are building towns of their own out on the island. I know roughly where, not the exact spot.`, 'I will mark the ground on your map. Ride out there and you will soon find them.'],
      ['A rival town can be taken. In one of your towns press the War banner on your action bar and pack a war chest: ryo to train troops, timber and stone to build.',
        'Ride into the rival town’s war circle and plant the banner. That declares war, and your war camp goes up on that spot.'],
      ['From the camp your workers raise barracks and your troops train and push on their town hall. Take the hall and the town is yours.'],
      ['They can come for you too. Keep ryo in each town’s coffers: in a war it fills the defenders’ war chest, which trains your troops. Walls, watchtowers and a stockade help hold a town.'],
    ]; };
  const warTalk = c => !!c?.warTalkDue && !c?.surveyPending;
  function lines(c) {
    if (warTalk(c)) return WAR()[Math.min(page, WAR().length - 1)];
    if (c?.surveyPending) return [c.survey ? 'Another permit? Then I ride out past your last town and see what lies beyond.' : 'A founding permit! Good. I have walked every road on this island. Let me show you where a town could stand.'];
    if (c?.survey) return ['Those sites are on your map. Take your settlers through the island gate and ride straight to one.'];
    return ['I have walked every road on this island. Buy a founding permit at the Land Office and I will tell you where to settle.'];
  }
  // tour stops: the intro (first report only), each site, then his pick
  function stops(c) {
    const list = siteRows(c.survey?.sites || []), out = [];
    if (!list.length) return [{ text: 'I found no open sites near enough. Walk out and scout; sites you find show up on your map.' }];
    if (c.survey.n === 1) out.push({ site: list[0].id, span: 5200, title: 'HOW TO READ A SITE', text: INTRO });
    for (const s of list) out.push({ site: s.id, title: `${s.region}, ${s.id}`, text: [`Soil ${s.traits.soil}, water ${s.traits.water}, defence ${s.traits.defense}`, ...(nodesOf(s).length ? nodesOf(s) : ['No resource nodes close by']),
      ...(s.campWarn ? [`Bandits camp ${s.campDistance} away: bring crew`] : [])] });
    const best = [...list].sort((a, b) => score(b) - score(a))[0], why = [];
    if (best.traits.soil >= 2) why.push('the soil is good'); if ((best.traits.nodes?.forest || 0) + (best.traits.nodes?.quarry || 0)) why.push('timber and stone are close');
    if (!best.campWarn) why.push('no bandits nearby'); if (best.traits.defense >= 2) why.push('it is easy to hold');
    out.push({ site: best.id, title: 'MY PICK', text: [`${best.region}, ${best.id}${why.length ? `: ${why.join(', ')}.` : '.'}`, 'Take at least 5 settlers through the island gate and choose Ride to a known site.'] });
    return out;
  }
  function startTour() { const c = clan(); if (!c?.survey) return; tour = { list: stops(c), i: 0 }; close(); show(); }
  function show() {
    if (!tour) { card.hidden = true; return; }
    const s = tour.list[tour.i];
    if (s.site) map.tourTo(s.site, s.span);
    const last = tour.i === tour.list.length - 1;
    const html = `<div class="ms-eyebrow">The old surveyor</div><h3>${esc(s.title || 'On the map')}</h3>${[].concat(s.text).map(t => `<p>${esc(t)}</p>`).join('')}`
      + `<div class="row">${tour.i ? '<button data-sv="back">Back</button>' : ''}<button data-sv="${last ? 'done' : 'next'}" class="goal-flash">${last ? 'Done' : 'Next'}</button></div>`
      + `<div class="waiting">${tour.i + 1} of ${tour.list.length}, Esc closes</div>`;
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
    else if (a === 'wnext') page++;
    else if (a === 'wback') page = Math.max(0, page - 1);
    else if (a === 'wmark' && warTalk(c)) { hintsWait = true; send({ id: heroId, type: 'landOffice', action: 'rivals' }); }
    else close();
    shown = ''; update();
  }
  msInstall(panel, () => close());
  panel.addEventListener('click', e => { const a = e.target.dataset?.pick; if (a) act(a); });
  function buttons(c) {
    if (warTalk(c)) { const last = page >= WAR().length - 1;
      return [last ? ['wmark', 'Mark them on my map'] : ['wnext', 'Go on'], ...(page ? [['wback', 'Back']] : []), ['close', 'Later']]; }
    return c?.surveyPending ? [['survey', 'Show me on the map']] : c?.survey ? [['again', 'Show me again'], ['close', 'Later']] : [['close', 'Later']]; }
  function update() {
    const c = clan();
    if (waitFor && (c?.survey?.n || 0) >= waitFor) { waitFor = null; startTour(); }
    if (hintsWait && c?.rivalHints) { hintsWait = false; page = 0; open = false; map.showRivalHints?.(); }
    if (tour && !map.isOpen()) endTour();
    if (open && !at()) open = false;
    panel.hidden = !open;
    if (!open) return;
    // menu restyle (Tim 2026-11-10): the shared shell with his 3D still
    const aside = msAside({ art: msConcept('surveyor1') || '', label: 'Land Office', labelTip: 'He walks you round the sites a founding permit shows.' });
    const body = `<div class="ms-speech">${lines(c).map(t => `<p>${msEsc(t)}</p>`).join('')}</div>`
      + `<div class="ms-foot"><span class="ms-small">Number keys, Space or Esc</span><span>${buttons(c).map(([a, t], i) => `<button class="ms-btn${!i && a !== 'close' ? ' ms-go goal-flash' : ''}" data-pick="${a}">${i + 1}. ${msEsc(t)}</button>`).join('')}</span></div>`;
    const html = msShell({ eyebrow: 'Outside the Land Office', title: 'The old surveyor', escTip: 'Close (Space or Esc)', aside, body });
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
