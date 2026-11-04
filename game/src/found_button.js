// "Found a town here" button (frontier E3). Shows only out on the island in a campaign while the
// hero has settlers with him. It asks the sim's own check (sim/frontier/founding.js) why a spot is
// no good and sends the same { type: 'frontier', action: 'found' } command a bot would.
export function createFoundButton({ root, game, heroId, send }) {
  let shown = '';
  const hero = () => game.state.entities[heroId];
  function update() {
    const h = hero(), f = game.frontier?.founding;
    const near = h && f && h.place === 'world' && game.state.match?.mode === 'campaign' ? f.settlersWith(h).length : 0;
    if (!near) { root.hidden = true; return; }
    const c = f.check(h), text = c.ok ? `Found a town here · ${c.settlers} settlers · ${c.cost} ryo` : `Can't found here: ${c.reason}`;
    root.hidden = false; root.disabled = !c.ok;
    if (text !== shown) { root.textContent = text; shown = text; }
  }
  root.addEventListener('click', () => { if (!root.disabled) send({ id: heroId, type: 'frontier', action: 'found' }); root.blur(); });
  return { update };
}
