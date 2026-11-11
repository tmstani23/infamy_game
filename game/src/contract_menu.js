// The Shinobi contract board (ninja build phase 5), opened with Space at the village shrine's ring.
// Menu restyle (Tim 2026-11-10): the shared war camp look (menu_shell.js), shrine art and Renown coins, one row per job. Reads state.contracts and sends 'contract' commands only; the
// rules in sim/contracts.js decide what happens. Also writes the tracker line for the job you hold.
const KIND = { scout: 'Scout', mark: 'Sabotage', steal: 'Steal', boss: 'Boss', bandits: 'Town' };
import { contractLockoutUntil } from './sim/hq_raids.js';
import { msInstall, msShell, msAside, msArt, msSec, msRow, msBtn, msChip, msPager, msNote, msEsc } from './menu_shell.js';
const PER = 5;

export function createContractMenu({ panel, tracker, game, heroId, send, selected = () => [], view }) {
  let open = false, shown = '', shownT = '', page = 0;
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

  msInstall(panel, () => { open = false; update(); });
  panel.addEventListener('click', e => {
    const turn = e.target.closest?.('[data-contract-page]');
    if (turn?.dataset?.contractPage !== undefined) { page += Number(turn.dataset.contractPage); shown = ''; update(); return; }
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
    if (j.kind === 'mark' && !j.mark) return j.progress ? `PLANTING MARK, ${s(j.need - j.progress)} progress seconds left${j.hiddenEligible?', hidden: double speed':''}` : 'PLANT MARK, stand in the violet back-room circle';
    if (j.kind === 'mark') return `${j.mark.away ? `GET BACK INSIDE, ${s(game.contracts.rules.mark.leaveSeconds * 20 - j.mark.away)}s before failure, ` : 'MARK PLANTED, keep a ninja inside, '}hold ${s(j.need - j.progress)} progress seconds${j.hiddenEligible?', hidden: double speed':''}${j.mark.scrubber ? `, DEFENDER REMOVING MARK: ${s(game.contracts.rules.mark.clearSeconds*20-j.mark.clear)}s, hit or disable them to interrupt` : j.mark.alerted ? ', defenders need an uninterrupted removal channel' : ''}`;
    if (j.kind === 'steal') return j.progress ? `TAKING STASH, ${s(j.need - j.progress)} progress seconds left, leaving the circle pauses${j.hiddenEligible?', hidden: double speed':''}` : 'TAKE STASH, enter by the back window, then stand in the stash circle';
    return j.progress ? `watching, ${s(j.need - j.progress)} s` : 'get inside unseen and watch';   // scout
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
    const huntStatus=hunting?(committed?`${committed.recovery?.state||committed.operation?.state||'Engaging'}, ${hunt.committedSector}`:'Hunt armed, waiting for a local sighting'):'Your sectors can hunt this boss when they spot him';
    const locked = c ? Math.max(0, Math.ceil((contractLockoutUntil(game.state, c.id) - game.state.tick) / 20)) : 0;
    const waiting = c ? game.contracts.readyIn(c.id) : 0;
    const t = locked ? `<b>HQ on fire</b><span>Contracts unavailable, reopen in ${locked} s</span>`
      : job ? `<b>${job.label}</b><span>${progress(job)}, ${reward(job)}</span>${job.kind === 'boss' ? `<small>${huntStatus}</small><button data-ambush-contract type="button">${hunting ? 'Cancel boss hunt' : 'Order sectors to hunt this boss'}</button>` : ''}`
      : waiting ? `<b>Contract board</b><span>Next contract in ${waiting} s, any time of day</span>` : '';
    tracker.hidden = !job && !locked && !waiting;
    if (t !== shownT) { tracker.innerHTML = t; shownT = t; }
    const counter = job?.counter;
    if (localCounter) localCounter.hidden = !counter || view.commandPlace(game.state, heroId) !== counter.place;
    if (localCounter && !localCounter.hidden) {
      const p = view.unitToScreen(counter.x, counter.z);
      localCounter.style.left = `${Math.max(8, Math.min(innerWidth - 160, p.x))}px`; localCounter.style.top = `${Math.max(8, Math.min(innerHeight - 60, p.y - 25))}px`;
      localCounter.textContent = `${counter.label}, ${Math.min(counter.need, counter.progress) / 20 | 0}/${Math.ceil(counter.need / 20)}s`;
    }
    if (!open || !c || !h) return;
    const board = C().board, refresh = Math.max(0, Math.ceil(((C().nextRefresh || 0) - game.state.tick) / 20));
    let body;
    if (locked) body = msSec('HQ on fire') + msNote(`Your HQ is on fire. Contracts reopen in ${locked} s. Any active contract was cancelled.`, true);
    else if (job) body = msSec('Your contract', 'One at a time', 'You can hold one contract at a time and finish it at any hour.')
      + msRow({ name: msEsc(job.label), sub: msEsc(progress(job)), right: msChip(reward(job)) + msBtn({ label: 'Call off', data: 'data-pick="0"' }), hover: 'Call off: press 1 or click' });
    else {
      const pages = Math.max(1, Math.ceil(board.length / PER)); page = Math.max(0, Math.min(page, pages - 1));
      body = msSec('On the board', `${board.length} jobs`, 'Take one with its number key or a click. Travel and objective time count; any time of day.')
        + (waiting ? msNote(`Next contract in ${waiting} s`, true) : '')
        + (board.slice(page * PER, page * PER + PER).map((j, n) => { const k = page * PER + n, q = game.contracts.quote(j);
          return msRow({ key: k + 1, name: `${KIND[j.kind] || 'Job'}: ${msEsc(j.label)}`, sub: `for ${msEsc(clientName(j.client))}`,
            right: msChip(game.contracts.reward(j)) + `<span class="ms-chip renown" title="Renown for finishing it"><i></i>${q.renown} Renown</span>` + msBtn({ label: 'Take', data: `data-pick="${k}"`, go: true, off: !!waiting }) });
        }).join('') || msNote(`Board refresh in ${refresh}s`))
        + (pages > 1 ? msPager(pages, page, 'data-contract-page') : '');
    }
    const notice = c.notice && game.state.tick - c.notice.tick < 20 * 4 ? msNote(c.notice.text, true) : '';
    const aside = msAside({ art: msArt('ninja_shrine'), label: 'Shrine board', labelTip: 'Shinobi contracts: scout, sabotage, steal, hunt a boss, clear bandits for the town.',
      coins: [{ v: c.renown || 0, label: 'Renown', red: true }, { v: job ? 1 : 0, label: 'Active' }, { v: board.length, label: 'Jobs' }, { v: locked ? `${locked}s` : waiting ? `${waiting}s` : 'Now', label: 'Next', tip: 'Time until you can take the next contract' }] });
    const html = msShell({ eyebrow: `${c.name || 'Your'} clan, village shrine`, title: 'Contract board', escTip: 'Close (Space or Esc)', aside, body: body + notice + msNote('Number keys or click to take a job. Space or Esc closes.') });
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }

  return {
    update, pick,
    isOpen: () => open,
    toggle() { open = !open && atBoard(); update(); },
    close() { open = false; update(); },
  };
}
