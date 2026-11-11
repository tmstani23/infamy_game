// The lieutenant at the island gate (goal steps, Tim 2026-11-06). Space at his ring opens four short lines on
// what he does; Show me opens Deployment at While I'm away, Later closes. Sends only { type: 'lieutenant',
// guide: 'met' | 'opened' }; the steps and flags are in sim/campaign_goals.js and sim/lieutenant.js.
import { lieutenantPortrait } from './lieutenant_portrait.js';
import { msInstall, msShell, msAside, msBtn, msNote, msConcept, msEsc } from './menu_shell.js';
const LINES = clan => [
  'Boss. While you are out on the island, I run the city for you.',
  clan?.kind === 'ninja' ? 'I defend our people, take shrine jobs and night steals, and hire when we are short.'
    : 'I defend raids, buy back what we lose, run shakedowns and sweeps, and hire when we are short.',
  'I spend from a daily budget you set. A city captain holds the HQ while you are gone.',
  'Set my orders and budget under Deployment, While I\'m away.',
];
export function createLieutenantTalk({ panel, game, heroId, send, showOrders }) {
  let open = false, shown = '';
  const hero = () => game.state.entities[heroId];
  const at = () => { const h = hero(), d = game.doors.find(x => x.menu === 'lieutenant'); return !!h && !!d && h.place === 'street' && Math.hypot(h.x - d.x, h.z - d.z) < 3.5; };
  msInstall(panel, () => close());
  panel.addEventListener('click', e => {
    const a = e.target.dataset?.pick;
    if (a === 'show') { send({ id: heroId, type: 'lieutenant', guide: 'opened' }); close(); showOrders(); }
    else if (a === 'later') close();
  });
  function update() {
    if (open && !at()) open = false;
    panel.hidden = !open;
    if (!open) return;
    const clan = game.state.clans?.[hero()?.owner];
    // menu restyle (Tim 2026-11-10): the shared shell, his 3D still on the left, his lines as speech
    const aside = msAside({ art: msConcept('lieutenant1') || lieutenantPortrait(clan), label: 'City captain', labelTip: 'He runs the city while you are out on the island.' });
    const body = `<div class="ms-speech">${LINES(clan).map(t => `<p>${msEsc(t)}</p>`).join('')}</div>`
      + `<div class="ms-foot"><span class="ms-small">Space or Esc closes</span><span><button class="ms-btn ms-go goal-flash" data-pick="show" title="Open Deployment at While I am away">Show me</button>${msBtn({ label: 'Later', data: 'data-pick="later"' })}</span></div>`;
    const html = msShell({ eyebrow: `${clan?.name || 'Your'} clan, island gate`, title: 'Your lieutenant', escTip: 'Close (Space or Esc)', aside, body });
    if (html !== shown) { panel.innerHTML = html; shown = html; }
  }
  function close() { open = false; update(); }
  return {
    update, close, isOpen: () => open,
    toggle() {
      open = !open && at();
      if (open) send({ id: heroId, type: 'lieutenant', guide: 'met' });
      update();
    },
  };
}
