// The outcome picker (war checkpoint 8a-3, 2026-11-14): presentation only, the sim checks every command again.
// When every counted building of the enemy town is down and its hall is a ruin, your hero at the hall ruin opens
// this with the Use key (Space): three art cards, Capture, Sack and Burn. Picking one starts the hero's channel at
// the hall; the channel carries the choice out (sim/frontier/war_end.js). Long text sits in the hovers.
// The defender at the attacker's ruined camp hall has no choice to make: Use starts his channel at once.
// Use again while channelling stops it. outcomeHtml(model) is pure (the mock page uses it too).
// createWarOutcomeMenu({ game, heroId, send, blocked }) -> { update, use, prompt, channelOf, close, isOpen }
// model = { clan, town, seconds, cards: [{ id, title, art, flag?, lines: [a, b], tip, why?, button }], note }
export const OUTCOME_CSS = `
#waroutcome{position:fixed;left:50%;top:50%;transform:translate(-50%,-52%);z-index:41;width:720px;max-width:calc(100vw - 30px);color:#eadfc6;font:13px/1.35 system-ui,sans-serif}
#waroutcome[hidden]{display:none}
#waroutcome .win{background:linear-gradient(180deg,#171c21,#0f1317);border:1px solid #4d3b2a;border-top:2px solid #c9473d;border-radius:8px;box-shadow:0 10px 40px #000a,0 0 0 1px #000;overflow:hidden}
#waroutcome header{display:flex;justify-content:space-between;align-items:flex-start;padding:12px 16px 10px;border-bottom:1px solid #2a2d31;background:linear-gradient(90deg,#2a1513,#14181c 60%)}
#waroutcome .eyebrow{color:#e0786c;letter-spacing:.16em;font-size:10px;text-transform:uppercase}
#waroutcome h2{margin:2px 0 0;font-size:22px;font-weight:500}
#waroutcome button{border:1px solid #61543e;border-radius:5px;background:#20262d;color:#eadfc6;padding:5px 11px;font:600 12px system-ui;cursor:pointer}
#waroutcome button:hover{border-color:#ffe0a1}#waroutcome button:disabled{opacity:.45;cursor:default}
#waroutcome .go{border-color:#e07b6c;background:linear-gradient(#8e2d26,#5e1c18);color:#ffe9dc;letter-spacing:.06em;box-shadow:0 0 12px #c9473d55;padding:7px 18px;font-size:13px}
#waroutcome .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:14px 16px 6px}
#waroutcome .cards.one{grid-template-columns:minmax(0,280px);justify-content:center}
#waroutcome .ocard{border:1px solid #4a4335;border-radius:8px;background:radial-gradient(ellipse at 50% 30%,#2b2520,#14130f 75%);padding:10px 10px 12px;text-align:center;cursor:help}
#waroutcome .ocard:hover{border-color:#d8b56c}
#waroutcome .ocard.lock{opacity:.6}
#waroutcome .opic{height:128px;display:grid;place-items:center;position:relative;background:radial-gradient(ellipse at 50% 60%,#c9473d33,transparent 65%)}
#waroutcome .opic img.main{max-width:170px;max-height:124px;filter:drop-shadow(0 6px 8px #000)}
#waroutcome .opic img.flag{position:absolute;right:8px;top:0;height:84px;filter:drop-shadow(0 4px 6px #000)}
#waroutcome .opic.burn img.main{filter:drop-shadow(0 0 14px #ff6a2c) drop-shadow(0 6px 8px #000)}
#waroutcome .ot{font-size:18px;color:#f3e3bd;margin-top:6px}
#waroutcome .ol{font-size:12px;color:#c8c2b3;margin-top:3px;min-height:16px}
#waroutcome .ol b{color:#f6e6bf;font-weight:600}
#waroutcome .owhy{font-size:11px;color:#ee9a8c;margin-top:8px;min-height:30px}
#waroutcome .obtn{margin-top:10px;min-height:30px}
#waroutcome .note{padding:8px 16px 14px;color:#9aa3a6;font-size:12px;text-align:center}
`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function outcomeHtml(m) {
  const card = c => `<div class="ocard${c.why ? ' lock' : ''}" title="${esc(c.tip)}"><div class="opic${c.id === 'burn' ? ' burn' : ''}"><img class="main" src="${esc(c.art)}" alt="">${c.flag ? `<img class="flag" src="${esc(c.flag)}" alt="">` : ''}</div>
    <div class="ot">${esc(c.title)}</div>${c.lines.map(l => `<div class="ol">${l}</div>`).join('')}
    ${c.warn && !c.why ? `<div class="owhy">${esc(c.warn)}</div>` : ''}${c.why ? `<div class="owhy">${esc(c.why)}</div>` : `<div class="obtn"><button class="go" data-outcome="${esc(c.id)}">${esc(c.button || c.title)}</button></div>`}</div>`;
  return `<div class="win" role="dialog" aria-label="${esc(m.title || 'Take the town hall')}"><header><div><div class="eyebrow">${esc(m.clan)}, war on ${esc(m.town)}</div><h2>${esc(m.title || 'Take the town hall')}</h2></div><button data-close="1">Esc</button></header>
    <div class="cards${m.cards.length === 1 ? ' one' : ''}">${m.cards.map(card).join('')}</div><div class="note">${esc(m.note)}</div></div>`;
}

const ART = { capture: 'art/buildings/manor.png', flag: 'art/buildings/war_banner.png', sack: 'art/buildings/storehouse.png', burn: 'art/buildings/burned_ruin.png' };
// the picker's cards for one war (pure: the state in, the model out)
export function outcomeModel(game, heroId, w) {
  const st = game.state, me = st.entities?.[heroId]?.owner, WE = game.frontier.warEnd, t = st.frontier?.settlements?.[w.town], name = t?.name || 'the town';
  const R = WE.rules(), ryo = Math.floor(Math.max(0, t?.stock?.ryo || 0) * R.sackShare), why = Object.fromEntries(WE.outcomeList(w).map(o => [o.id, o.ok ? '' : o.why]));
  const days = game.frontier.war.data?.cooldownDays ?? 6, share = Math.round(R.sackShare * 100);
  if (t?.castle) {   // Z6: a castle has one outcome, its clan is out
    const foe = st.clans?.[w.defender]?.name || 'Their clan';
    return { clan: st.clans?.[me]?.name || 'Your clan', town: name, title: 'Take the keep', cards: [
      { id: 'fall', title: 'Take the castle', art: 'art/buildings/castle_gate.png', lines: [`<b>${esc(foe)}</b> is out of the campaign`, 'Their towns stand empty'], button: 'Take the castle',
        tip: `Take the castle: ${foe} is out. Its towns go empty for anyone to claim, its city hideout closes and its crews are gone. The castle cannot be held or sacked.` }],
      note: `Your hero channels at the keep for ${R.channel.seconds} seconds. Any hit on him starts it over, and the enemy is warned.` };
  }
  return { clan: st.clans?.[me]?.name || 'Your clan', town: name, cards: [
    { id: 'capture', title: 'Capture', art: ART.capture, flag: ART.flag, lines: [`${name} becomes <b>yours</b>`, 'Keeps its people and stores'], button: 'Capture', why: why.capture,
      tip: `Capture: the town changes hands with everything in it: people, workers, stores, its station and the track inside its ring. Its lines to other towns are torn up. Its ruined buildings must be rebuilt. It has no defences until you build them, and it can be attacked again after the ${days} day truce. A captured town does not count toward your founding limit.` },
    { id: 'sack', title: 'Sack', art: ART.sack, lines: [`Take <b>${ryo} ryo</b>, ${share === 50 ? 'half' : `${share} in 100 of`} its coffers`, 'The town stays theirs'], button: 'Sack', why: why.sack,
      tip: 'Sack: that share of the town coffers goes to your Clan treasury. The town stays with its clan, with its military buildings in ruins. Good for a town you cannot hold.' },
    { id: 'burn', title: 'Burn', art: ART.burn, lines: ['The town is <b>wiped out</b>', 'The land is free to found on'], button: 'Burn', why: why.burn,
      warn: game.landOffice?.atLimit?.(me) ? 'You are at your founding limit: you could not found a town here' : '',
      tip: 'Burn: the town is destroyed and its land goes empty. You gain nothing, and have nothing to defend. Anyone may found a new town there, under the usual founding limit.' }],
    note: `Your hero channels at the hall for ${R.channel.seconds} seconds. Any hit on him starts it over, and the enemy is warned.` };
}
export function createWarOutcomeMenu({ game, heroId, send, blocked = () => false }) {
  const off = { update() {}, use: () => false, prompt: () => '', channelOf: () => null, close() {}, isOpen: () => false };
  if (typeof document === 'undefined') return off;
  if (!document.getElementById('waroutcomecss')) { const s = document.createElement('style'); s.id = 'waroutcomecss'; s.textContent = OUTCOME_CSS; document.head.appendChild(s); }
  const root = document.createElement('div'); root.id = 'waroutcome'; root.hidden = true; document.body.appendChild(root);
  const hero = () => game.state.entities?.[heroId], WE = () => game.frontier?.warEnd, MO = () => game.frontier?.warMorale;
  let open = null, shown = '';
  // the war whose hall my hero stands at and can take now (or is taking): { w, side, mine }
  function at() {
    const h = hero(), we = WE(), mo = MO();
    if (!h || !we || !mo || h.place !== 'world' || h.dead || h.downed) return null;
    for (const w of Object.values(game.state.frontier?.wars?.list || {})) {
      if (w.channel?.by === h.id) return { w, side: w.channel.side, mine: true };
      const side = w.attacker === h.owner ? 'town' : w.defender === h.owner ? 'camp' : null;
      if (side && !w.channel && mo.ready(w.id, side) && we.atHall(h, w, side)) return { w, side, mine: false };
    }
    return null;
  }
  function close() { if (!open) return; open = null; shown = ''; root.hidden = true; root.innerHTML = ''; }
  // the Use key: true when it was ours
  // Z6d: an empty town whose hall my hero stands at (or the claim he is making)
  const ET = () => game.frontier?.emptyTowns;
  function claimAt() {
    const h = hero(), et = ET(); if (!h || !et || h.place !== 'world' || h.dead || h.downed) return null;
    if (h.claimTown) return { claiming: et.view(h) };
    const s = et.at(h); return s ? { town: s } : null;
  }
  function use() {
    if (open) { close(); return true; }
    const a = at();
    if (!a && !blocked()) {
      const c = claimAt();
      if (c?.claiming) { send({ id: heroId, type: 'frontier', action: 'claimStop' }); return true; }
      if (c?.town) { send({ id: heroId, type: 'frontier', action: 'claimTown', town: c.town.id }); return true; }
    }
    if (!a || blocked()) return false;
    if (a.mine) send({ id: heroId, type: 'frontier', action: 'warTakeStop', war: a.w.id });
    else if (a.side === 'camp') send({ id: heroId, type: 'frontier', action: 'warTakeCamp', war: a.w.id });
    else open = a.w.id;
    return true;
  }
  // the prompt line over the hero ('' when there is nothing to take)
  function prompt() {
    const a = open ? null : at();
    if (!a && !open) {
      const c = claimAt();
      if (c?.claiming) return `Space  Stop claiming ${c.claiming.name} (${c.claiming.seconds} s left)`;
      if (c?.town) { const why = ET().check(hero(), c.town.id); return why.ok ? `Space  Claim ${c.town.name}` : why.reason; }
    }
    if (!a) return '';
    return a.mine ? 'Space  Stop taking the hall' : a.side === 'camp' ? 'Space  Take their camp hall and end the war' : game.state.frontier?.settlements?.[a.w.town]?.castle ? 'Space  Take the keep' : 'Space  Take the town hall';
  }
  root.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b || !open) return;
    if (b.dataset.outcome) send({ id: heroId, type: 'frontier', action: 'warTake', war: open, outcome: b.dataset.outcome });
    close();
  });
  function update() {
    if (!open) return;
    const a = at();
    if (!a || a.mine || a.w.id !== open || blocked()) { close(); return; }
    const html = outcomeHtml(outcomeModel(game, heroId, a.w));
    if (html !== shown) { root.innerHTML = html; shown = html; }
    root.hidden = false;
  }
  // for the war bar: the running channel of a war as { text, frac, mine }
  function channelOf(warId) {
    const v = WE()?.view(warId); if (!v) return null;
    const mine = v.clan === hero()?.owner, hall = v.side === 'town' ? 'town hall' : 'camp hall';
    return { text: mine ? `Taking the ${hall}: ${v.seconds} s` : `Your ${hall} is being taken: ${v.seconds} s`, frac: v.frac, mine };
  }
  return { update, use, prompt, channelOf, close, isOpen: () => !!open };
}
