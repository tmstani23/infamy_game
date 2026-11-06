// The lieutenant at the island gate (goal steps, Tim 2026-11-06). Space at his ring opens four short lines on
// what he does; Show me opens Deployment at While I'm away, Later closes. Sends only { type: 'lieutenant',
// guide: 'met' | 'opened' }; the steps and flags are in sim/campaign_goals.js and sim/lieutenant.js.
const LINES = clan => [
  'Boss. While you are out on the island, I run the city for you.',
  clan?.kind === 'ninja' ? 'I defend our people, take shrine jobs and night steals, and hire when we are short.'
    : 'I defend raids, buy back what we lose, run shakedowns and sweeps, and hire when we are short.',
  'I spend from a daily budget you set. A city captain holds the HQ while you are gone.',
  'Set my orders and budget under Deployment → While I’m away.',
];
export function createLieutenantTalk({ panel, game, heroId, send, showOrders }) {
  let open = false, shown = '';
  const hero = () => game.state.entities[heroId];
  const at = () => { const h = hero(), d = game.doors.find(x => x.menu === 'lieutenant'); return !!h && !!d && h.place === 'street' && Math.hypot(h.x - d.x, h.z - d.z) < 3.5; };
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
    const html = `<h3>YOUR LIEUTENANT</h3>${LINES(clan).map(t => `<p>${t}</p>`).join('')}`
      + '<div class="row"><button data-pick="show" class="goal-flash">Show me</button><button data-pick="later">Later</button></div>'
      + '<div class="waiting">Space / Esc close</div>';
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
