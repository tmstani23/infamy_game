// The Shinobi contract board (ninja build phase 5), opened with Space at the village shrine's ring.
// Same look as the police menu. Reads state.contracts and sends 'contract' commands only; the
// rules in sim/contracts.js decide what happens. Also writes the tracker line for the job you hold.
const KIND = { scout: 'Scout', mark: 'Sabotage', steal: 'Steal', boss: 'Boss', bandits: 'Town' };
import { contractLockoutUntil } from './sim/hq_raids.js';

export function createContractMenu({ panel, tracker, game, heroId, send, selected = () => [], view }) {
  let open = false, shown = '', shownT = '';
  const localCounter = view ? document.createElement('div') : null;
  if (localCounter) { localCounter.className = 'contract-objective-counter'; localCounter.hidden = true; document.body.appendChild(localCounter); }

  const hero = () => game.state.entities[heroId];
  const clan = () => game.state.clans[hero()?.owner];
  const access = () => game.serviceAt ? game.serviceAt(heroId, 'contracts', selected()) : game.doorNear(heroId)?.menu === 'contracts' ? { actor: hero() } : null;
  const atBoard = () => !!access();
  const C = () => game.state.contracts || { board: [], active: {} };
  const clientName = id => id === 'town' ? 'the town' : game.state.clans[id]?.name || 'a clan';
  const reward = j => `${game.contracts.reward(j)} + ${game.contracts.quote(j).renown} Renown`;

  // with a job running: 1 = call it off; else 1 and up = take that job
  function pick(i) {
    const c = clan();
    const h = access()?.actor;
    if (!open || !c || !h) return;
    if (contractLockoutUntil(game.state, c.id) > game.state.tick) return;
    if (C().active[c.id]) { if (i === 0) send({ id: h.id, type: 'contract', action: 'drop' }); return; }
    if (game.contracts.readyIn(c.id)) return;
    const j = C().board[i];
    if (j) send({ id: h.id, type: 'contract', action: 'take', job: j.id });
  }

  panel.addEventListener('click', e => {
    const i = e.target.dataset?.pick;
    if (i !== undefined) { pick(Number(i)); e.target.blur(); }
  });
  tracker.addEventListener?.('click', e => {
    if (!e.target.closest('[data-ambush-contract]')) return;
    const c = clan(), job = c && C().active[c.id], hunt = c && game.state.deployment?.clans?.[c.id]?.hunt;
    if (job?.kind === 'boss') send({ id: heroId, type: 'deployment', action: hunt?.target === job.hero ? 'cancelAmbush' : 'armAmbush', target: job.hero });
    e.stopPropagation();
  });
  for(const type of ['mousedown','mouseup','contextmenu'])tracker.addEventListener?.(type,e=>{e.stopPropagation();if(type==='contextmenu')e.preventDefault();});

  // what is left to do on the job, for the tracker and the menu
  function progress(j) {
    const s = t => Math.max(0, Math.ceil(t / 20));
    if (j.kind === 'bandits') return `${j.progress || 0}/${j.need || '?'} bandits`;
    if (j.kind === 'boss') return 'find him and knock him out';
    if (j.kind === 'mark' && !j.mark) return j.progress ? `PLANTING MARK · ${s(j.need - j.progress)} progress seconds left${j.hiddenEligible?' · hidden: 2× speed':''}` : 'PLANT MARK · stand in the violet back-room circle';
    if (j.kind === 'mark') return `${j.mark.away ? `GET BACK INSIDE · ${s(game.contracts.rules.mark.leaveSeconds * 20 - j.mark.away)}s before failure · ` : 'MARK PLANTED · keep a ninja inside · '}hold ${s(j.need - j.progress)} progress seconds${j.hiddenEligible?' · hidden: 2× speed':''}${j.mark.scrubber ? ` · DEFENDER REMOVING MARK: ${s(game.contracts.rules.mark.clearSeconds*20-j.mark.clear)}s — hit or disable them to interrupt` : j.mark.alerted ? ' · defenders need an uninterrupted removal channel' : ''}`;
    if (j.kind === 'steal') return j.progress ? `TAKING STASH · ${s(j.need - j.progress)} progress seconds left · leaving the circle pauses${j.hiddenEligible?' · hidden: 2× speed':''}` : 'TAKE STASH · enter by the back window, then stand in the stash circle';
    return j.progress ? `watching… ${s(j.need - j.progress)} s` : 'get inside unseen and watch';   // scout
  }

  function update() {
    const c = clan(), h = hero();
    if (!atBoard()) open = false;
    panel.hidden = !open;
    // the tracker: the job you hold, until dawn
    const job = c && C().active[c.id];
    const deployment=c&&game.state.deployment?.clans?.[c.id];
    const hunt=deployment?.hunt, committed=hunt?.committedSector&&deployment.sectors?.[hunt.committedSector];
    const hunting=job?.kind==='boss'&&hunt?.target===job.hero;
    const huntStatus=hunting?(committed?`${committed.recovery?.state||committed.operation?.state||'Engaging'} · ${hunt.committedSector}`:'Hunt armed · waiting for a local sighting'):'Your sectors can hunt this boss when they spot him';
    const locked = c ? Math.max(0, Math.ceil((contractLockoutUntil(game.state, c.id) - game.state.tick) / 20)) : 0;
    const waiting = c ? game.contracts.readyIn(c.id) : 0;
    const t = locked ? `<b>HQ on fire</b><span>Contracts unavailable · reopen in ${locked} s</span>`
      : job ? `<b>${job.label}</b><span>${progress(job)} · ${reward(job)}</span>${job.kind === 'boss' ? `<small>${huntStatus}</small><button data-ambush-contract type="button">${hunting ? 'Cancel boss hunt' : 'Order sectors to hunt this boss'}</button>` : ''}`
      : waiting ? `<b>Contract board</b><span>Next contract in ${waiting} s · any time of day</span>` : '';
    tracker.hidden = !job && !locked && !waiting;
    if (t !== shownT) { tracker.innerHTML = t; shownT = t; }
    const counter = job?.counter;
    if (localCounter) localCounter.hidden = !counter || view.commandPlace(game.state, heroId) !== counter.place;
    if (localCounter && !localCounter.hidden) {
      const p = view.unitToScreen(counter.x, counter.z);
      localCounter.style.left = `${Math.max(8, Math.min(innerWidth - 160, p.x))}px`; localCounter.style.top = `${Math.max(8, Math.min(innerHeight - 60, p.y - 25))}px`;
      localCounter.textContent = `${counter.label} · ${Math.min(counter.need, counter.progress) / 20 | 0}/${Math.ceil(counter.need / 20)}s`;
    }
    if (!open || !c || !h) return;
    let body;
    if (locked) body = `<div class="waiting">Your HQ is on fire. Contracts reopen in ${locked} s. Any active contract was cancelled.</div>`;
    else if (job) body = `<div class="row"><span>${job.label}<br><small>${progress(job)}</small></span><button data-pick="0">Call off</button></div>` +
      '<div class="waiting">One contract at a time · complete at any hour</div>';
    else body = C().board.map((j, k) => `<div class="row"><span>${k + 1}. ${KIND[j.kind]}: ${j.label}<br><small>for ${clientName(j.client)} · ${reward(j)}</small></span>` +
      `<button data-pick="${k}"${waiting ? ' disabled' : ''}>Take</button></div>`).join('') || `<div class="waiting">Board refresh in ${Math.max(0, Math.ceil(((C().nextRefresh || 0) - game.state.tick) / 20))}s</div>`;
    if (!locked && !job && waiting) body = `<div class="waiting">Next contract in ${waiting} s · travel and objective time count · any time of day</div>` + body;
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? `<div class="notice">${c.notice.text}</div>` : '';
    const html = `<h3>CONTRACT BOARD</h3><div class="row"><span>Renown ${c.renown || 0}</span></div>${body}${notice}<div class="waiting">number keys or click · Space / Esc close</div>`;
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }

  return {
    update, pick,
    isOpen: () => open,
    toggle() { open = !open && atBoard(); update(); },
    close() { open = false; update(); },
  };
}
