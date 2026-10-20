// Crew command bar: a strip of crew order buttons right above the crew pips on the action bar,
// styled like the ability slots with the key in the corner (Tim 2026-10-19).
// Each button does exactly what its key does (through crewInput); greyed out when it would do nothing.
// Only reads the state; orders go out as the same commands the keys send.
const CMDS = [
  { key: 'V', name: 'Follow', tip: 'Selected crew follow the hero.', act: c => c.followMe(), need: 'sel' },
  { key: 'T', name: 'Attack', tip: 'All your crew (selected or not) attack the unit you marked with a left-click, or else the hero\'s target; a downed one they finish off. Afterwards they go back to what they were doing (follow, hold, stop).', act: c => c.crewAttack(), need: 'crew' },
  { key: 'Z', name: 'Stop', tip: 'Selected crew stand still and stay passive (no attacking, even when hit) until their next order.', act: c => c.stopSelected(), need: 'sel' },
  { key: 'X', name: 'A-move', tip: 'Attack-move: then left-click the ground; selected crew walk there and fight anything on the way.', act: c => c.armAttackMove(), need: 'sel' },
  { key: 'G', name: 'Clinic', tip: 'Selected crew walk to the clinic to heal (for ryo).', act: c => c.healSelected(), need: 'sel' },
  { key: 'C', name: 'All', tip: 'Select all your crew (not locked ones).', act: c => c.selectAll(), need: 'crew' },
  { key: 'L', name: 'Lock', tip: 'Lock the selected crew (all locked already: unlock them). Locked crew are left out of C, drag boxes and T; crew you send into your businesses lock by themselves.', act: c => c.lockSelected(), need: 'sel' },
];

const CSS = `
  #bar .crewcmds { align-self: flex-start; display: flex; gap: 4px; padding: 5px 6px; background: linear-gradient(#14171d, #0b0d11);
    border: 1px solid rgba(233,194,122,.28); border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,.5); }
  #bar .ccmd { position: relative; width: 40px; height: 34px; border-radius: 5px; border: 1px solid #5c4a2c; cursor: pointer;
    background: radial-gradient(circle at 50% 40%, #2b2f38, #101216); box-shadow: inset 0 0 6px rgba(0,0,0,.8); }
  #bar .ccmd:hover { border-color: #ffd34d; }
  #bar .ccmd .key { position: absolute; left: 3px; top: 1px; font: 700 10px/1 system-ui, sans-serif; color: #fff; text-shadow: 0 1px 2px #000; }
  #bar .ccmd .nm { position: absolute; left: 0; right: 0; bottom: 4px; text-align: center; font: 600 9px/1 system-ui, sans-serif; color: #e9d6a8; text-shadow: 0 1px 2px #000; }
  #bar .ccmd.off { filter: grayscale(1) brightness(.5); cursor: default; }
  #bar .ccmd.press { border-color: #ffd34d; box-shadow: 0 0 8px rgba(255,190,60,.7); }`;

export function createCrewBar({ root, game, heroId, crewInput }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const strip = document.createElement('div');
  strip.className = 'crewcmds';
  root.insertBefore(strip, root.querySelector('.row'));   // between the buffs and the bar, left-aligned over the crew pips
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);

  const buttons = CMDS.map(cmd => {
    const b = document.createElement('div');
    b.className = 'ccmd';
    b.innerHTML = `<span class="key">${cmd.key}</span><span class="nm">${cmd.name}</span>`;
    b.addEventListener('mousedown', e => {
      if (e.button !== 0 || b.classList.contains('off')) return;
      e.stopPropagation();
      cmd.act(crewInput);
      b.classList.add('press');
      setTimeout(() => b.classList.remove('press'), 150);
    });
    b.addEventListener('mouseenter', () => {
      tip.innerHTML = `<b>${cmd.name}</b><i>${cmd.key}</i><p>${cmd.tip}</p>`;
      tip.hidden = false;
      const r = b.getBoundingClientRect();
      tip.style.left = `${Math.min(innerWidth - 270, Math.max(10, r.left + r.width / 2 - 130))}px`;
      tip.style.bottom = `${innerHeight - r.top + 10}px`;
    });
    b.addEventListener('mouseleave', () => { tip.hidden = true; });
    strip.appendChild(b);
    return { b, cmd };
  });

  function update() {
    const S = game.state.entities, h = S[heroId];
    const usable = e => e && e.owner === h?.owner && e.type !== 'hero' && !e.guard && !e.dead;
    const crew = Object.values(S).some(usable);
    const sel = crewInput.selected().some(id => usable(S[id]));
    for (const { b, cmd } of buttons) b.classList.toggle('off', !(cmd.need === 'sel' ? sel : crew));
  }
  return { update };
}
