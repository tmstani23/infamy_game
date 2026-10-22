// The Shinobi contract board (ninja build phase 5), opened with Space at the village shrine's ring.
// Same look as the police menu. Reads state.contracts and sends 'contract' commands only; the
// rules in sim/contracts.js decide what happens. Also writes the tracker line for the job you hold.
const KIND = { scout: 'Scout', mark: 'Sabotage', steal: 'Steal', boss: 'Boss', bandits: 'Town' };

export function createContractMenu({ panel, tracker, game, heroId, send, selected = () => [] }) {
  let open = false, shown = '', shownT = '';

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
    if (C().active[c.id]) { if (i === 0) send({ id: h.id, type: 'contract', action: 'drop' }); return; }
    const j = C().board[i];
    if (j) send({ id: h.id, type: 'contract', action: 'take', job: j.id });
  }

  panel.addEventListener('click', e => {
    const i = e.target.dataset?.pick;
    if (i !== undefined) { pick(Number(i)); e.target.blur(); }
  });

  // what is left to do on the job, for the tracker and the menu
  function progress(j) {
    const s = t => Math.max(0, Math.ceil(t / 20));
    if (j.kind === 'bandits') return `${j.progress || 0}/${j.need || '?'} bandits`;
    if (j.kind === 'boss') return 'find him and knock him out';
    if (j.kind === 'mark' && !j.mark) return !game.state.night ? 'wait for night, then plant the mark in the back room'
      : j.progress ? `planting the mark… ${s(j.need - j.progress)} s` : 'plant the mark on the back-room spot';
    if (j.kind === 'mark') return `${j.mark.away ? `nobody inside: ${s(game.contracts.rules.mark.leaveSeconds * 20 - j.mark.away)} s to get back in · ` : ''}hold ${s(j.need - j.progress)} s${j.mark.alerted ? ' · they know' : ''}`;
    if (j.kind === 'steal') return j.progress ? `taking the ryo… ${s(j.need - j.progress)} s` : 'in by the back window, stand on the stash';
    return j.progress ? `watching… ${s(j.need - j.progress)} s` : 'get inside unseen and watch';   // scout
  }

  function update() {
    const c = clan(), h = hero();
    if (!atBoard()) open = false;
    panel.hidden = !open;
    // the tracker: the job you hold, until dawn
    const job = c && C().active[c.id];
    const t = job ? `<b>${job.label}</b><span>${progress(job)} · ${reward(job)} · until dawn</span>` : '';
    tracker.hidden = !job;
    if (t !== shownT) { tracker.innerHTML = t; shownT = t; }
    if (!open || !c || !h) return;
    let body;
    if (job) body = `<div class="row"><span>${job.label}<br><small>${progress(job)}</small></span><button data-pick="0">Call off</button></div>` +
      '<div class="waiting">One contract at a time; it runs until dawn</div>';
    else body = C().board.map((j, k) => `<div class="row"><span>${k + 1}. ${KIND[j.kind]}: ${j.label}${j.night ? ' (night)' : ''}<br><small>for ${clientName(j.client)} · ${reward(j)}</small></span>` +
      `<button data-pick="${k}">Take</button></div>`).join('') || '<div class="waiting">No jobs left today; new ones at dawn</div>';
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
