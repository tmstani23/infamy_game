import { sprintOn, setSprint } from './input.js';
import { portrait } from './portraits.js';
// Independent crew command panel; wraps buttons into the chosen width,
// styled like the ability slots with the key in the corner (Tim 2026-10-19).
// Each button does exactly what its key does (through crewInput); greyed out when it would do nothing.
// Only reads the state; orders go out as the same commands the keys send.
const CMDS = [
  { key: '↩', name: 'Duty', tip: 'Return selected sector crew to their saved duty, deselect them and select your hero group. Escape also returns released manual sector crew to duty while clearing selection.', act: c => c.returnToDutyAndSelectHero(), need: 'sector' },
  { key: 'V', name: 'Follow', tip: 'Selected crew follow the hero; outdoor crew enter your building. Tell them to Follow while inside and keep them selected to bring them out with you. Follow from outside never recalls indoor crew; an explicit street move can bring them out.', act: c => c.followMe(), need: 'follow' },
  { key: 'T', name: 'Attack', tip: 'Attack the selected target with the current command group. Tab selects only. Right-click a target portrait, enemy nameplate or enemy body also attacks.', act: c => c.crewAttack(), need: 'sel' },
  { key: 'Z', name: 'Stop', tip: 'Selected crew stand still and stay passive (no attacking, even when hit) until their next order.', act: c => c.stopSelected(), need: 'sel' },
  { key: 'X', name: 'A-move', tip: 'Attack-move: then left-click the ground; selected crew walk there and fight anything on the way.', act: c => c.armAttackMove(), need: 'sel' },
  { key: 'G', name: 'Clinic', tip: 'Selected outdoor crew walk to the clinic to heal (for ryo). Move indoor crew outside first.', act: c => c.healSelected(), need: 'street' },
  { key: 'C', name: 'Hero', tip: 'Select your hero group, replacing the current selection. During Rally, select the active Rally force. Ctrl+1–4 assigns a shortcut; 1–4 recalls it.', act: c => c.selectAll(), need: 'crew' },
];
// Mount controls (Tim 2026-11-06): their own headed row under the crew commands
const MOUNT_CMDS = [
  { key: 'H', name: 'Horse', tip: 'On the island: ride your horse (she trots at your run speed), get off, or call her and she gallops to you. Raise horses at a stable in your town and pick which one is yours there. You cannot fight on horseback, and a bad hit throws you off. In the city H still hires crew.', act: c => c.mountKey(), need: 'horse' },
  { key: 'Shift', name: 'Sprint', tip: 'On a horse or driving a rickshaw or omnibus: gallop at full speed (horse 3.75x, rickshaw 3.5x, omnibus 3x run speed). Press Shift or click here: it stays on until you press or click again, or get off.', act: () => setSprint(!sprintOn()), need: 'riding' },
  { key: 'Shift+H', name: 'Mount up', tip: 'On the island: you and your selected crew (or the crew following you) get on horses. Free horses of yours nearby trot over, spare ones come out of your stables. Again: everyone off. Mounted crew follow at horse speed and jump off when hit or told to attack; their horse waits there. Settlers and workers ride the omnibus instead.', act: c => c.mountUpKey(), need: 'horse' },
  { key: 'Q', name: 'Omnibus', tip: 'Out on the island: Q inside the omnibus steps everyone out (it parks); Q right beside a parked one gets the hero and his followers back in. Right-click the omnibus does the same (a flashing label shows which); with crew selected, they get in.', act: c => c.omnibusKey(), need: 'bus' },
];

const CSS = `
  #crewcommands .crewcmds { display: grid; grid-template-columns:repeat(auto-fit,minmax(min(38px,100%),1fr)); gap: 4px; padding: 5px 6px; background: linear-gradient(#14171d, #0b0d11);
    border: 1px solid rgba(233,194,122,.28); border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,.5); }
  #crewcommands .ccmd { position: relative; width: auto; min-height: 38px; height: auto; border-radius: 5px; border: 1px solid #5c4a2c; cursor: pointer;
    background: radial-gradient(circle at 50% 40%, #2b2f38, #101216); box-shadow: inset 0 0 6px rgba(0,0,0,.8); }
  #crewcommands .ccmd:hover { border-color: #ffd34d; }
  #crewcommands .ccmd .key { position: absolute; left: 3px; top: 1px; font: 700 10px/1 system-ui, sans-serif; color: #fff; text-shadow: 0 1px 2px #000; }
  #crewcommands .ccmd .nm { position: absolute; left: 0; right: 0; bottom: 4px; text-align: center; font: 600 9px/1 system-ui, sans-serif; color: #e9d6a8; text-shadow: 0 1px 2px #000; }
  #crewcommands .ccmd.off { filter: grayscale(1) brightness(.5); cursor: default; }
  #crewcommands .mounthead { display: flex; align-items: center; gap: 6px; margin-top: 4px; padding: 3px 5px; background: linear-gradient(#14171d, #0b0d11);
    border: 1px solid rgba(233,194,122,.28); border-radius: 8px; font: 11px/1.2 system-ui, sans-serif; color: #e9d6a8; }
  #crewcommands .mounthead .mpic { flex: none; width: 30px; height: 30px; border-radius: 5px; border: 1px solid #5c4a2c; background: #101216 center/cover no-repeat;
    display: grid; place-items: center; color: #c9b27a; font-size: 16px; cursor: pointer; }
  #crewcommands .mounthead .minfo { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  #crewcommands .mounthead .minfo b { font-weight: 700; color: #e9d6a8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #crewcommands .mounthead .minfo small { color: #b8a77e; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #crewcommands .mounthead .mmore { flex: none; width: 20px; height: 20px; padding: 0; border-radius: 4px; border: 1px solid #5c4a2c; background: #1a1d24; color: #e9d6a8; cursor: pointer; font-size: 10px; }
  #crewcommands .mountdetail[hidden] { display: none; }
  #crewcommands .mountacts { display: flex; gap: 3px; padding: 4px 5px 0; }
  #crewcommands .mountacts button { flex: 1; padding: 2px 4px; border-radius: 4px; border: 1px solid #5c4a2c; background: #1a1d24; color: #e9d6a8; font: 600 10px system-ui, sans-serif; cursor: pointer; }
  #crewcommands .mountacts button:disabled { opacity: .4; cursor: default; }
  #crewcommands .mountcmds { grid-template-columns: repeat(auto-fit, minmax(min(40px,100%),1fr)); gap: 3px; padding: 4px 5px; margin-top: 3px; }
  #crewcommands .mountcmds .ccmd { min-height: 26px; }
  #crewcommands .mountcmds .ccmd .key { font-size: 8px; } #crewcommands .mountcmds .ccmd .nm { bottom: 2px; font-size: 8px; }
  #crewcommands .ccmd.on { border-color: #ffd34d; box-shadow: 0 0 6px rgba(255,190,60,.6); }
  #crewcommands .ccmd.press { border-color: #ffd34d; box-shadow: 0 0 8px rgba(255,190,60,.7); }`;

// The Mount panel (Tim 2026-11-07): compact by default, your horse's portrait, name and status; double-click the portrait
// moves the camera to her (H calls her); ▸ opens Stay here, Send to stable and the mount controls.
export function createCrewBar({ root, game, heroId, crewInput, catalog = null, jump = () => {}, send = () => {} }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const strip = document.createElement('div');
  strip.className = 'crewcmds';
  root.appendChild(strip);
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);

  const mountHead = document.createElement('div');
  mountHead.className = 'mounthead';
  const make = (tag, cls, text = '', title = '') => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; if (title) n.title = title; return n; };
  const mPic = make('span', 'mpic', '♞', 'Double-click: the camera goes to her (H calls her)'), mInfo = make('span', 'minfo'), mName = make('b', '', 'Mount'), mStat = make('small');
  const mMore = make('button', 'mmore', '▸', 'Stay here, Send to stable and the mount controls'); mMore.type = 'button';
  mInfo.append(mName, mStat); mountHead.append(mPic, mInfo, mMore);
  const mountDetail = document.createElement('div');
  mountDetail.className = 'mountdetail'; mountDetail.hidden = true;
  const mountActs = document.createElement('div');
  mountActs.className = 'mountacts';
  const stayBtn = make('button', '', 'Stay here', 'She stays where she is: you get off if you ride her, and a call is off'), stableBtn = make('button', '', 'Send to stable', 'Back to your nearest stable, where she is stored (H or her whistle brings her out)');
  stayBtn.type = stableBtn.type = 'button'; stayBtn.dataset.m = 'stay'; stableBtn.dataset.m = 'stable'; mountActs.append(stayBtn, stableBtn);
  const mountStrip = document.createElement('div');
  mountStrip.className = 'crewcmds mountcmds';
  mountDetail.append(mountActs, mountStrip);
  root.appendChild(mountHead); root.appendChild(mountDetail);
  const myHorse = () => { const h = game.state.entities[heroId]; return h && game.mounts?.mountOf(h.owner); };
  for (const el of [mountHead, mountDetail]) el.addEventListener('mousedown', e => e.stopPropagation());
  mMore.addEventListener('click', () => { mountDetail.hidden = !mountDetail.hidden; mMore.textContent = mountDetail.hidden ? '▸' : '▾'; mMore.blur(); });
  mPic.addEventListener('dblclick', () => { const horse = myHorse(), h = game.state.entities[heroId]; if (horse && !horse.stored && horse.place === h?.place) jump(horse); });
  mountActs.addEventListener('click', e => {
    const m = e.target.closest?.('button')?.dataset.m, horse = myHorse(); if (!m || !horse) return;
    if (m === 'stay') send({ id: heroId, type: 'mount', stay: true });
    else send({ id: heroId, type: 'garage', action: 'recall', unit: horse.id });
    e.target.blur();
  });
  let mKey = '';
  function updateMount(h) {
    const horse = myHorse();
    const status = !horse ? 'Raise or buy one at a stable' : horse.stored ? 'At the stable' : horse.recall ? 'Going to the stable'
      : horse.rider === heroId ? 'With you' : horse.rider ? 'Ridden by your crew' : horse.called === heroId ? 'Coming to you' : horse.called ? 'Going to your crew'
      : h && horse.place === h.place && Math.hypot(horse.x - h.x, horse.z - h.z) < 12 ? 'Beside you' : 'Staying';
    const url = horse && catalog ? portrait(catalog, horse.model, () => { mKey = ''; }, { x: 0.26, y: 0.26, w: 0.48 }) : null;
    const key = `${horse?.id}|${horse?.name}|${status}|${url ? 1 : 0}`;
    if (key === mKey) return;
    mKey = key;
    mName.textContent = horse ? horse.name || 'Your horse' : 'No horse';
    mStat.textContent = status;
    mPic.style.backgroundImage = url ? `url(${url})` : ''; mPic.textContent = url ? '' : '♞';
    const stay = stayBtn, stable = stableBtn;
    stay.disabled = !horse || !!horse.stored || horse.place !== 'world';
    stable.disabled = !horse || !!horse.stored || !!horse.recall;
  }
  const buttons = [...CMDS, ...MOUNT_CMDS].map(cmd => {
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
      if (r.top < 170) { tip.style.top = `${r.bottom + 10}px`; tip.style.bottom = 'auto'; }   // near the top of the screen the tip opens below
      else { tip.style.top = 'auto'; tip.style.bottom = `${innerHeight - r.top + 10}px`; }
    });
    b.addEventListener('mouseleave', () => { tip.hidden = true; });
    (MOUNT_CMDS.includes(cmd) ? mountStrip : strip).appendChild(b);
    return { b, cmd };
  });

  function update() {
    const S = game.state.entities, h = S[heroId];
    const usable = e => e && e.owner === h?.owner && e.type !== 'hero' && !e.guard && !e.dead;
    const crew = Object.values(S).some(usable);
    const outdoor = h?.place === 'street' && Object.values(S).some(e => usable(e) && e.place === 'street' && !e.downed && !e.jailed);
    const sel = crewInput.selected().some(id => usable(S[id]));
    const follow = crewInput.selected().some(id => usable(S[id]) && ['street', h?.place].includes(S[id].place));
    const street = crewInput.selected().some(id => usable(S[id]) && S[id].place === 'street');
    const sector = crewInput.selected().some(id => { const e = S[id]; return usable(e) && !e.downed && !e.jailed && !e.deployment?.transfer && game.state.deployment?.clans[h?.owner]?.sectors[e.deployment?.group]; });
    const busNear = h?.place === 'world' && !!game.omnibus?.near(h, 4).some(b => !game.omnibus.riders(b).length);
    const bus = !!h?.aboard || busNear;
    const setName = (b, t) => { const nm = b.querySelector('.nm'); if (nm && nm.textContent !== t) nm.textContent = t; };   // the label under a mount button
    for (const { b, cmd } of buttons) if (cmd.need === 'bus') setName(b, h?.aboard ? 'Step out' : busNear ? 'Get in' : 'Omnibus');
    const horse = h?.place === 'world' && !!game.mounts?.mountOf(h.owner);
    const crewRiding = Object.values(S).some(e => usable(e) && e.mounted);
    for (const { b, cmd } of buttons) if (cmd.need === 'horse') setName(b, cmd.key === 'H' ? (h?.mounted ? 'Get off' : 'Horse') : crewRiding ? 'All off' : 'Mount up');
    const riding = !!h?.ride;   // on a horse or driving a rickshaw / omnibus
    if (!riding && sprintOn()) setSprint(false);
    for (const { b, cmd } of buttons) if (cmd.need === 'riding') { b.classList.toggle('on', sprintOn()); setName(b, sprintOn() ? 'Galloping' : 'Sprint'); }
    const available = { sel, follow, street, outdoor, crew, sector, bus, horse, riding };
    updateMount(h);
    for (const { b, cmd } of buttons) b.classList.toggle('off', !available[cmd.need]);
  }
  return { update };
}
