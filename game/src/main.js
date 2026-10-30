import { createUtilityMenu } from './utility_menu.js';
import { createWarLanternButton } from './war_lantern_button.js';
import { createFixedStepClock } from './fixed_step_clock.js';
import { createStealthBadge } from './stealth_badge.js';
// Wires the game together: load data, run the rules at a fixed tick, draw every frame.
import { createGame, TICK_RATE } from './sim/game.js';
import { setupMatch } from './sim/setup_match.js';
import { chooseMatch } from './start_screen.js';
import { createView } from './render/view.js';
import { onKey, moveCommand, panAxes, edgeAxes, setGameplayInput } from './input.js';
import { createHireMenu } from './hire_menu.js';
import { createClinicMenu } from './clinic_menu.js';
import { createPoliceMenu } from './police_menu.js';
import { createContractMenu } from './contract_menu.js';
import { createHeatBadge } from './heat_badge.js';
import { createFps } from './fps.js';
import { createRyoBadge } from './ryo_badge.js';
import { drawCrest } from './render/banners.js';
import { createCrewInput } from './crew_input.js';
import { createActionBar } from './action_bar.js';
import { createCrewBar } from './crew_bar.js';
import { createSelectionPanel, unitWhere } from './selection_panel.js';
import { createUnitFrames, frameTarget } from './unit_frames.js';
import { createBuildingPanel } from './building_panel.js';
import { createInteriorInfo } from './interior_info.js';
import { createSound } from './render/sound.js';
import { createFog } from './render/fog.js';
import { createBot } from './sim/bot.js';
import { createNinjaBot } from './sim/ninja_bot.js';
import { bindCrewNumberKeys } from './crew_hotkeys.js';
import { DEV, TEST } from './test_params.js';
import { createMinimap } from './minimap.js';
import { createGameMap } from './game_map.js';
import { createPresentationMode } from './presentation_mode.js';
import { createHudLayout } from './hud_layout.js';
import { hqCampingNoticeVisit } from './hq_camping_notice.js';
import { bindFullscreen } from './fullscreen.js';
import { bindControlTooltips } from './control_tooltips.js';
import { createDeploymentPanel } from './deployment_panel.js';
import { createCharacterPanel } from './character_panel.js';
import { createGameSettings } from './game_settings.js';
import { createGameMusic } from './game_music.js';
import { bindGameShell } from './game_shell.js';
import { createSelectionDock } from './selection_dock.js';
import { createNewsCallouts } from './news_callouts.js';
import { createTopBar } from './top_bar.js';

const $ = id => document.getElementById(id);
bindFullscreen($('fullscreenbtn'));
bindGameShell();
const controlTips = bindControlTooltips($('controls'));
const status = msg => { $('loading').textContent = msg; };
const getJSON = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load ${url}`);
  return r.json();
};

async function start() {
  setGameplayInput(false);
  status('Loading the district…');
  const [district, catalog, cutouts, interiors, parts, recipes, unitsFile, civilians, bandits, buildingInfo, police, settings, bots] = await Promise.all([
    getJSON('data/port_town.json'), getJSON('data/art.json'),
    getJSON('art/cutouts.json'), getJSON('data/interiors.json'), getJSON('data/interior_parts.json'),
    getJSON('data/room_recipes.json'), getJSON('data/units.json'), getJSON('data/civilians.json'), getJSON('data/bandits.json'), getJSON('data/buildings.json'), getJSON('data/police.json'), getJSON('data/settings.json'), getJSON('data/bots.json')]);

  // No sim, bot or game clock runs until Start is pressed. Test presets still boot directly.
  const selected = ['ninja', 'bot', 'shakedown'].includes(TEST.setup)
    ? { clan: TEST.ninja ? 'shinobi' : 'yakuza', difficulty: bots.difficulty }
    : await chooseMatch({ root: $('startscreen'), loading: $('loading'), difficulty: bots.difficulty,
      startRyo: settings.costs?.startRyo ?? unitsFile.rules.startRyo, cycles: settings.season?.cycles ?? 10, drawCrest });
  status('Preparing the city…');
  // Single player runs the rules here. In multiplayer the server runs them instead.
  // data/settings.json (the numbers picked before a game) is laid over the detail files inside the sim
  const game = createGame({ district, catalog, cutouts, interiors, parts, recipes, units: unitsFile, civilians, bandits, police, settings });
  const units = game.settings.units;   // hire prices etc. as the settings made them
  const { heroId, rivals, previewCommands = [] } = setupMatch(game, { ...selected, bots, spawns: district.spawns, test: TEST });

  // Townsfolk walking the streets
  game.civilians.populate();

  const botList = rivals.map(r => (r.kind === 'ninja' ? createNinjaBot : createBot)(game, r));
  const bot = botList.length ? { tick: () => botList.flatMap(b => b.tick()) } : null;

  let view;
  try {
    view = await createView({
      canvas: $('view'), fxLayer: $('fx'), district, catalog, parts, scenery: game.scenery, rooms: game.rooms,
      doors: game.doors.filter(d => !d.ninja || game.state.clans.player.kind === 'ninja'), units,   // back windows: Shinobi only
    });
  } catch (e) {
    status('This browser could not start WebGL, which the game needs.');
    throw e;
  }

  // Fog of war: the screen shows only what your clan can see
  const fog = createFog({ vision: game.vision, clan: 'player', on: true });

  // the button flips day and night (N); with the clock running it also shows the time to the next flip
  const label = () => {
    const c = game.state.clock, s = c ? Math.ceil(c.left / TICK_RATE) : 0;
    const left = c ? ` in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
    $('daynight').textContent = `${view.isNight() ? 'Day' : 'Night'}${left} (N)`;
    document.body.classList.toggle('night', view.isNight());
  };
  // Day and night belong to the sim (townsfolk follow it): N sends a 'time' command and
  // the screen follows the state after each tick
  const pending = [...previewCommands];
  const toggleNight = () => pending.push({ type: 'time' });
  // dev only (test_params.js DEV): flipping day and night by hand
  if (DEV) onKey('KeyN', toggleNight);
  $('daynight').addEventListener('click', e => { if (DEV) toggleNight(); e.currentTarget.blur(); });
  label();
  if (DEV) onKey('F3', () => view.toggleDebug());
  // Space at a door: go through it, or at the clinic's / police box's / HQ's ring open its menu (no interior)
  onKey(['Space', 'Enter'], () => {
    // by a raider's War Lantern at your business: knock it down (checkpoint 5)
    const door0 = interactionDoor();
    const innerDoor = !door0 && game.interiorDoorNear(heroId);
    const lantern = !door0?.menu && raidOnMe(true);
    if (lantern) { pending.push({ id: heroId, type: 'business', action: 'knock', business: lantern.business }); return; }
    if (innerDoor) { pending.push({ id: heroId, type: 'interiorDoor' }); return; }
    // a Shinobi boss by a lantern at night, no door here: snuff it (sim/stealth.js)
    if (!door0 && game.stealth.snuffable(game.state.entities[heroId])) { pending.push({ id: heroId, type: 'snuff' }); return; }
    const menu = door0?.menu;
    if (menu === 'clinic') clinicMenu.toggle();
    else if (menu === 'police_box' || menu === 'police_hq') policeMenu.toggle(menu);
    else if (menu === 'contracts') contractMenu.toggle();
    else { pending.push({ id: heroId, type: 'use', units: crewInput.selected() }); sound.cue('use_1', 0.45); }   // selected crew come in too
  });
  // a rival's raid on one of your businesses (the newest); near = only one whose lantern the hero can knock down now
  const raidOnMe = (near = false) => Object.values(game.state.attacks || {})
    .filter(a => a.mode === 'raid' && a.defender === game.state.entities[heroId]?.owner && (!near || game.businesses.canKnock(heroId, a.business).ok)).pop();
  const alarmSeen = new Set();
  // big callouts at the top of the screen, queued so two at once don't overwrite each other
  const callouts = [];
  let calloutBusy = false;
  function callout(text, kind, ms = 2700) {   // ms: how long it stays (contract results linger 5 s, Tim 2026-10-21)
    callouts.push({ text, kind, ms });
    if (calloutBusy) return;
    const next = () => {
      const c = callouts.shift(), el = $('callout');
      if (!c) { calloutBusy = false; return; }
      calloutBusy = true;
      el.textContent = c.text; el.className = c.kind; el.hidden = false;
      el.style.animationDuration = `${(c.ms - 100) / 1000}s`;
      void el.offsetWidth; el.classList.add('show');
      setTimeout(next, c.ms);
    };
    next();
  }
  const contractCallout = (text, kind = 'news') => callout(text, `${kind} contract`, 5000);
  $('raidalarm').addEventListener('dblclick', () => { const a = raidOnMe(); if (a) { const p = a.lantern || a.spot; view.jumpTo(p.x, p.z); } });
  // Hero abilities aim at the mouse point on the ground
  let mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  addEventListener('mousemove', e => { mouse = { x: e.clientX, y: e.clientY }; });
  // Shinobi (Tim 2026-10-20): a lit lantern under the mouse, within snuffReach of the boss at night,
  // says "Snuff"; a left-click on it snuffs it (before the crew clicks see it)
  let hoverLamp = null;
  function lampAt() {
    const h = game.state.entities[heroId], st = game.stealth;
    if (!st || !h || game.state.clans[h.owner]?.kind !== 'ninja' || (h.place==='street'&&!game.state.night)) return null;
    // measured from where the lantern glows on screen, not its foot (Tim 2026-10-21: it picked the wrong one)
    const off = new Set(game.state.lightsOut), near = l => Math.min(Infinity, ...view.lampScreen(l.prop).map(q => Math.hypot(q.x - mouse.x, q.y - mouse.y)));
    return st.lights.filter(l => l.place===h.place&&!off.has(l.prop) && Math.hypot(l.x - h.x, l.z - h.z) < st.rules.snuffReach && near(l) < 45).sort((a, b) => near(a) - near(b))[0] || null;
  }
  addEventListener('mousedown', e => {
    if (e.button !== 0 || !hoverLamp || e.target.closest('button, #bar, #hud, #partyframes, #utilitymenu')) return;
    pending.push({ id: heroId, type: 'snuff', prop: hoverLamp.prop });
    e.stopImmediatePropagation(); e.preventDefault();
  }, true);
  for (const slot of ['Q', 'E', 'R', 'F']) onKey(`Key${slot}`, () => {
    const p = view.screenToGround(mouse.x, mouse.y);
    // Shinobi Q / F go for the unit in the target frame when there is one (Tim 2026-10-21)
    const h = game.state.entities[heroId], target = h && frameTarget(game.state, heroId, crewInput.looked?.() ? [crewInput.looked()] : [], crewInput.tabbed?.(), e => !game.vision || game.vision.canSee(h.owner, e));
    pending.push({ id: heroId, type: 'ability', slot, ...(p ? { x: p.x, z: p.z } : {}), ...(target ? { target } : {}) });
  });
  // Camera: arrow keys pan, Home or the button snaps back to the hero
  onKey('Home', () => view.snapBack());
  $('snap').addEventListener('click', e => { view.snapBack(); e.currentTarget.blur(); });
  onKey(['Equal', 'NumpadAdd'], () => view.zoomBy(1.1));
  onKey(['Minus', 'NumpadSubtract'], () => view.zoomBy(0.9));
  addEventListener('wheel', e => view.zoomBy(e.deltaY > 0 ? 0.9 : 1.1), { passive: true });

  // Hire menu: only reads the state and sends 'hire' commands, like a bot would
  const hireMenu = createHireMenu({ panel: $('hire'), money: $('money'), game, units, heroId, send: c => pending.push(c) });
  onKey('KeyH', () => hireMenu.toggle());
  const clinicMenu = createClinicMenu({ panel: $('clinic'), game, heroId, selected: () => crewInput.selected(), send: c => pending.push(c) });
  const policeMenu = createPoliceMenu({ panel: $('police'), game, heroId, selected: () => crewInput.selected(), send: c => pending.push(c) });
  const contractMenu = createContractMenu({ panel: $('contracts'), tracker: $('contract'), game, heroId, view, selected: () => crewInput.selected(), send: c => pending.push(c) });
  const heatBadge = createHeatBadge({ root: $('heat'), game, heroId });
  const ryoBadge = createRyoBadge({ root: $('ryo'), game, heroId });
  // your clan's crest and name in the top bar (picked at the start later, Tim 2026-10-19)
  {
    const clan = game.state.clans.player, cv = $('clan').querySelector('canvas'), g = cv.getContext('2d');
    g.fillStyle = clan.color; g.beginPath(); g.arc(28, 28, 26, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d4aa5a'; g.lineWidth = 2; g.stroke();
    drawCrest(g, 28, 28, 15);
    $('clan').querySelector('em').textContent = clan.name;
    $('clan').title = `${selected.difficulty[0].toUpperCase() + selected.difficulty.slice(1)} difficulty`;
  }
  // Crew: click / drag to select, right-click to move (Ctrl = station), right-click the hero to follow
  const crewInput = createCrewInput({ game, view, heroId, send: c => pending.push(c), box: $('selbox') });
  const characterPanel = createCharacterPanel({ game, heroId, catalog, button: $('characterbtn'),
    onOpen: () => setGameplayInput(false), onClose: () => setGameplayInput(true) });
  onKey('KeyJ', () => characterPanel.toggle());
  const deploymentPanel = createDeploymentPanel({ root: $('deploymentpanel'), button: $('deploymentbtn'), game, units, catalog, heroId, crewInput, send: c => pending.push(c),
    onPickPoint: (sector, callback) => gameMap.pickPoint(sector, callback),
    onPickDestination: callback => gameMap.pickDestination(callback), onCancelPick: () => gameMap.cancelPick(),
    // docked beside the open game map with the Sectors layer on (Tim 2026-10-27)
    onOpen: id => gameMap.dock(true, id), onClose: () => { gameMap.dock(false); gameMap.close(); }, onFocus: id => gameMap.focusSector(id), onInspect:id=>unitFrames.inspect(id),
    onViewCrew:ids=>{gameMap.close();if(ids.length===1)jump(game.state.entities[ids[0]]);else watchGroup(null,ids);} });
  $('rallybtn').addEventListener('click', e => { pending.push({ id: heroId, type: 'deployment', action: 'rally' }); e.currentTarget.blur(); });
  // Unstuck (sim/unstuck.js): U or the button; a refusal is shown here, the sim checks again
  const unstuck = () => { const h = game.state.entities[heroId], no = h?.unstuck ? null : game.unstuck.why(h); if (no) callout(no, 'loss'); else pending.push({ id: heroId, type: 'unstuck' }); };
  onKey('KeyU', unstuck);
  $('unstuckbtn').addEventListener('click', e => { unstuck(); e.currentTarget.blur(); });
  function interactionDoor() {
    const selected = crewInput.selected(), access = game.serviceAt(heroId, null, selected);
    return access && selected.includes(access.actor.id) ? access.door : game.doorNear(heroId) || access?.door;
  }
  onKey('KeyC', () => crewInput.selectAll());
  onKey('KeyV', () => crewInput.followMe());
  onKey('KeyX', () => crewInput.armAttackMove());
  onKey('KeyZ', () => crewInput.stopSelected());   // stop + passive until the next order (Tim 2026-10-18)
  onKey('Tab', () => crewInput.tab());
  $('knockbar').addEventListener('click', () => crewInput.target($('knockbar').dataset.by));   // target whoever knocks down your War Lantern
  onKey('KeyT', () => crewInput.crewAttack());
  onKey('KeyG', () => crewInput.healSelected());
  onKey('Escape', () => { hireMenu.close(); clinicMenu.close(); policeMenu.close(); contractMenu.close(); deploymentPanel.close(); crewInput.cancelAction(); crewInput.clear(); $('controls').hidden = true; controlTips.hide(); gameMap.close(); unitFrames.clearKnown(); });
  bindCrewNumberKeys({ onKey, crewInput, menus: [clinicMenu, policeMenu, contractMenu, hireMenu] });
  const sound = createSound();
  const music = createGameMusic({settings:sound.getSettings()});
  sound.subscribe(settings=>music.setSettings(settings));
  const gameSettings=createGameSettings({button:$('settingsbtn'),sound,onOpen:()=>setGameplayInput(false),onClose:()=>setGameplayInput(true)});
  const updateMute=s=>{$('mutebtn').textContent=s.muted?'Unmute (K)':'Mute (K)';};
  sound.subscribe(updateMute);updateMute(sound.getSettings());
  // mute: K or the button (M opens the game map, Tim 2026-10-20)
  const mute = () => { const m = sound.toggleMute(); $('mutebtn').textContent = m ? 'Unmute (K)' : 'Mute (K)'; };
  onKey('KeyK', mute);
  $('mutebtn').addEventListener('click', e => { mute(); e.currentTarget.blur(); });
  // Pause (Tim 2026-10-27, single player): the sim stops stepping, drawing and menus keep going
  let paused = false;
  const togglePause = () => { paused = !paused; $('pausedbanner').hidden = !paused; $('pausebtn').textContent = paused ? 'Resume (`)' : 'Pause (`)'; $('pausebtn').setAttribute('aria-pressed', String(paused)); };
  onKey(['Backquote', 'Pause'], togglePause);
  $('pausebtn').addEventListener('click', e => { togglePause(); e.currentTarget.blur(); });
  const fps = createFps();
  onKey('KeyP', () => fps.toggle());
  // Controls panel: the button or ? opens it, Esc closes it
  const toggleControls = () => { controlTips.hide(); $('controls').hidden = !$('controls').hidden; };
  onKey('Slash', toggleControls);
  $('ctlbtn').addEventListener('click', e => { toggleControls(); e.currentTarget.blur(); });
  const where = e => unitWhere(e, game.state, district, buildingInfo);   // "Teahouse · Waterfront"
  // where the camera should look for a unit: itself, or its building's door if it is inside one the hero isn't in
  const lookPoint = u => {
    const door = u.place !== 'street' && u.place !== game.state.entities[heroId]?.place && game.doors.find(d => d.to && d.place === u.place);
    return door ? { x: door.x, z: door.z } : { x: u.x, z: u.z };
  };
  const usable = u => u && !u.dead && !u.jailed;
  // double-click a crew name: the camera follows him (Tim 2026-10-28) until you pan, click the map or press Home
  const jump = u => {
    if (!u.id) { view.jumpTo(u.x, u.z); return; }
    view.watch(() => { const e = game.state.entities[u.id]; return usable(e) ? lookPoint(e) : null; });
  };
  // double-click a group header: follow the middle of the group's biggest cluster
  const watchGroup = (group,ids=null) => view.watch(() => {
    const S = game.state.entities, me = S[heroId]?.owner;
    const crew = Object.values(S).filter(e => e.owner === me && e.type !== 'hero' && usable(e) && !e.guard && (ids?ids.includes(e.id):(e.deployment?.group || 'home') === group)).map(lookPoint);
    if (!crew.length) return null;
    const near = p => crew.filter(q => Math.hypot(q.x - p.x, q.z - p.z) < 8);
    const best = crew.map(near).reduce((a, b) => b.length > a.length ? b : a);
    return { x: best.reduce((n, p) => n + p.x, 0) / best.length, z: best.reduce((n, p) => n + p.z, 0) / best.length };
  });
  const bar = createActionBar({ root: $('bar'), game, units, heroId, tickRate: TICK_RATE, crewInput, where, jump, watchGroup, crewRoot:$('partyframes'), send: c => pending.push(c), onInspect: id => unitFrames.inspect(id), onHeroFocus: () => view.snapBack() });
  let nameplatesOn = false;
  onKey('KeyL', () => { nameplatesOn = !nameplatesOn; view.setNameplates(nameplatesOn); });
  const actionCommands=document.createElement('div');actionCommands.className='action-commands';
  const lanternButton=document.createElement('button');lanternButton.id='warlanternbtn';lanternButton.type='button';lanternButton.dataset.icon='♨';
  $('rallybtn').dataset.icon='⚑';actionCommands.append($('rallybtn'),lanternButton);$('bar').querySelector('.row').appendChild(actionCommands);
  const warLantern=createWarLanternButton({button:lanternButton,game,heroId,send:c=>pending.push(c)});
  const utilityMenu=createUtilityMenu({root:$('utilitymenu'),anchor:$('ryo'),buttons:['deploymentbtn','characterbtn','settingsbtn','unstuckbtn','pausebtn','mutebtn','fullscreenbtn','ctlbtn','daynight'].map($)});
  const crewBar = createCrewBar({ root: $('partyframes'), game, heroId, crewInput });   // crew order buttons over the crew pips
  // a lone left-clicked enemy or townsperson shows in the target frame (top left), not the unit card
  const lone = ids => ids.length === 1 && game.state.entities[ids[0]]?.owner !== game.state.entities[heroId]?.owner;
  const selPanel = createSelectionPanel({ root: $('selpanel'), game, units, catalog, crewInput, where, skip: lone, hideOwnedBy:()=>game.state.entities[heroId]?.owner, onInspect:id=>unitFrames.inspect(id) });
  const unitFrames = createUnitFrames({ game, units, catalog, crewInput, heroId, view, where, jump, send: c => pending.push(c) });   // own + target frames, top middle
  const interiorInfo = createInteriorInfo({ root: $('interiorinfo'), game, district, info: buildingInfo, units, heroId, clan: 'player' });
  const bldPanel = createBuildingPanel({ root: $('bldpanel'), game, district, info: buildingInfo, units, scenery: game.scenery, crewInput, clan: 'player', heroId, send: c => pending.push(c), openService: menu => {
    if (menu === 'clinic' && !clinicMenu.isOpen()) clinicMenu.toggle();
    else if ((menu === 'police_box' || menu === 'police_hq') && !policeMenu.isOpen()) policeMenu.toggle(menu);
    else if (menu === 'contracts' && !contractMenu.isOpen()) contractMenu.toggle();
  } });
  const minimap = createMinimap({ canvas: $('minimapcanvas'), game, district, view, fog, heroId, selected: () => crewInput.selected(), send: c => pending.push(c) });
  const mapZoom = factor => {
    const level = minimap.zoomBy(factor);
    $('minimapout').disabled = level <= 1;
    $('minimapin').disabled = level >= 4;
  };
  $('minimapout').addEventListener('click', () => mapZoom(1 / 1.25));
  $('minimapin').addEventListener('click', () => mapZoom(1.25));
  mapZoom(1);

  // the full game map (M or the button): territory, businesses, police, units, the season score (src/game_map.js)
  const gameMap = createGameMap({ root: $('gamemap'), deploymentRoot:$('deploymentpanel'), game, district, view, fog, heroId, units, catalog, selected: () => crewInput.selected(), send: c => pending.push(c),
    onSelectCrew: id => {crewInput.selectUnit(id);unitFrames.inspect(id);},
    onSelectTarget: id => unitFrames.showKnown(id),
    onReturnToDuty: ids => crewInput.returnToDutyAndSelectHero(ids),
    onManageSector: id => deploymentPanel.openGroup(id),
    onSelectSector: id => deploymentPanel.openGroup(id), onClose:()=>deploymentPanel.close() });
  onKey('KeyM', () => { if(gameMap.isOpen())gameMap.close();else deploymentPanel.open(); });
  // the season score in the top bar (sim/territory.js): day of the season, then every clan's points
  const scoreText = () => {
    const s = game.state.season, t = game.territory;
    if (!s || !t) return '';
    const parts = t.standings().map(r => `${r.clan === 'player' ? 'You' : (game.state.clans[r.clan]?.name || r.clan).replace(/ clan$/, '')} <b>${r.score}</b>`);
    return `Day ${Math.min(s.day, s.cycles)}/${s.cycles} · ${parts.join(' · ')}`;
  };
  // the season is over: the results, then a new game (reload) or keep playing
  function showResults() {
    const s = game.state.season, el = $('seasonend');
    if (!s?.final) return;
    const me = 'player', win = s.winner === me;
    el.querySelector('h2').textContent = win ? 'You win the season!' : s.winner ? `${game.state.clans[s.winner]?.name || 'A rival'} wins the season` : 'The season ends in a draw';
    const points = Object.entries(units.rules.businesses).map(([kind, rule]) => `${kind.replace(/_/g, ' ')} ${rule.score || 0}`).join(', ');
    el.querySelector('.sub').textContent = `${s.cycles} days and nights · the clan with the most points wins (${points})`;
    el.querySelector('.list').innerHTML = s.final.map(r => `<div class="row"><i style="background:${game.state.clans[r.clan]?.color}"></i><span>${r.clan === me ? 'You' : game.state.clans[r.clan]?.name}</span><b>${r.score}</b></div>`).join('');
    el.hidden = false;
  }
  $('seasonend').querySelector('.again').addEventListener('click', () => location.reload());
  $('seasonend').querySelector('.keep').addEventListener('click', e => { $('seasonend').hidden = true; e.currentTarget.blur(); });
  // every HUD panel can be unlocked (its lock icon), moved and resized; Reset layout in the Controls panel.
  // Positions and sizes live in data/ui_layout.json (written through server.mjs)
  const uiFile = await fetch('data/ui_layout.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));   // saved HUD layout
  const stealthBadge = createStealthBadge({ root: $('stealth'), game, heroId, view });
  const hudLayout = createHudLayout({ fromFile: uiFile.panels });
  const deploymentCards=document.createElement('section'),mapCards=document.createElement('section');
  deploymentCards.className=mapCards.className='selection-dock';
  deploymentCards.setAttribute('aria-label','Selected unit and transfer details');mapCards.setAttribute('aria-label','Selected unit and transfer details');
  deploymentCards.hidden=mapCards.hidden=true;
  $('deploymentpanel').querySelector('.workspace').before(deploymentCards);
  $('gamemap').querySelector('.mapcol').insertBefore(mapCards,$('gamemap').querySelector('.mapside'));
  const selectionDock=createSelectionDock({panels:[$('utarget'),$('selpanel')],
    visible:el=>el.id==='utarget'&&(!deploymentPanel.isOpen()||el.dataset.owner!==game.state.entities[heroId]?.owner),
    destination:()=>deploymentPanel.isOpen()?deploymentCards:gameMap.isOpen()?mapCards:null,onRestore:()=>unitFrames.clearInspection()});
  $('layoutreset').addEventListener('click', e => { hudLayout.reset(); e.currentTarget.blur(); });
  if (DEV) window.infamy = { game, view };   // handy from the browser console
  $('loading').remove();
  $('startscreen').remove();
  document.body.classList.remove('prematch');
  utilityMenu.update(true);
  setGameplayInput(true);

  // Fixed-tick loop: the rules advance TICK_RATE times a second, the screen
  // draws as often as it can and slides units between the last two ticks.
  const tick = 1 / TICK_RATE;
  // last tick's units, only what the view reads from it (render/view.js: sliding between ticks, heal pops);
  // a full copy of the state 20 times a second was wasted work (Tim 2026-10-26). Add a field here if the view needs more.
  const snapshot = state => { const entities = {}; for (const id in state.entities) { const e = state.entities[id]; entities[id] = { x: e.x, z: e.z, hp: e.hp, downed: e.downed }; } return { tick: state.tick, entities }; };
  let prev = snapshot(game.state);
  const presentation=createPresentationMode({
    suspend(){document.body.classList.add('map-active');view.setPresentationActive(false);},
    resume(){document.body.classList.remove('map-active');prev=snapshot(game.state);view.setPresentationActive(true);fog.update(100);}
  });
  const clock = createFixedStepClock({ tick });
  if(DEV)window.infamy.mapPerformance=()=>({...presentation.diagnostics(),...gameMap.diagnostics(),clock:clock.diagnostics(),worldResources:{...view.renderer.info.memory}});
  const newsCallouts = createNewsCallouts({ game, heroId, $, TICK_RATE, callout, contractCallout, minimap, gameMap, view, presentation, showResults });
  const topBar = createTopBar({ game, heroId, $, TICK_RATE, heatBadge, ryoBadge, scoreText });
  let last = performance.now() / 1000, labelTick = -Infinity, lostCops = false;
  function observeRaidAlarms() {
    const a = raidOnMe();
    if (a) { const key = `${a.business}:${a.opensAt}`; if (!alarmSeen.has(key)) { alarmSeen.add(key); sound.bell(); } }
    const mine = Object.values(game.state.attacks || {}).find(r => r.clan === game.state.entities[heroId]?.owner && r.knock);
    if (mine) { const key = `knock:${mine.business}:${mine.opensAt}`; if (!alarmSeen.has(key)) { alarmSeen.add(key); sound.bell(); } }
  }
  view.renderer.setAnimationLoop(() => {
    fps.frame();
    presentation.sync(gameMap.isOpen());
    const now = performance.now() / 1000;
    const dt = Math.max(0, Math.min(now - last, 1.0));
    const elapsed = now - last; last = now;
    clock.advance(elapsed, () => {
      if(!presentation.map)prev = snapshot(game.state);
      game.step([moveCommand(heroId), ...pending.splice(0), ...(bot ? bot.tick() : [])]);
      gameMap.observe();
      observeRaidAlarms();
      if (game.state.policeNews.some(n => n.kind === 'lost' && n.clan === game.state.entities[heroId]?.owner)) lostCops = true;
      // big moments (Tim 2026-10-19): a rival boss knocked out or arrested where you can see him,
      // and a War Lantern knocked down in a raid you are in; shown one after another at the top
      newsCallouts.update();
      if (!presentation.map && game.state.hits.length) view.addHits(fog.seenEvents(game.state.hits, game.state, 't'), game.state, heroId);
      if (!presentation.map && game.state.dodges.length) view.addDodges(fog.seenEvents(game.state.dodges, game.state, 't'));
      if (!presentation.map && game.state.casts.length) view.addCasts(fog.seenEvents(game.state.casts, game.state, 'target'), game.state, heroId);
      sound.update(game.state, view.audioFocus(game.state, heroId, crewInput.selected()));
      topBar.observe();
    }, paused);
    if (game.state.night !== view.isNight()) { view.toggleNight(); label(); labelTick = game.state.tick; }
    else if (game.state.tick - labelTick >= TICK_RATE) { label(); labelTick = game.state.tick; }
      // your attack on a business (sim/businesses.js): waves left, then the hold timer
      {
        const a = Object.values(game.state.attacks || {}).find(a => a.clan === game.state.entities[heroId]?.owner && a.phase !== 'over'), bar = $('attackbar');
        bar.hidden = !a;
        if (a) {
          const where = a.hq ? 'Shinobi HQ' : a.kind.replace(/_/g, ' ');
          bar.classList.toggle('hold', a.phase === 'hold');
          const wait = Math.ceil((a.startsAt - game.state.tick) / TICK_RATE), opens = Math.ceil((a.opensAt - game.state.tick) / TICK_RATE);
          bar.textContent = a.phase === 'warmup' ? `Raid on the ${where}: the doors open in ${opens} s`
            : wait > 0 ? `Attacking the ${where}: police arrive in ${wait} s, get inside` : a.phase === 'hold'
            ? a.mode === 'raid' && a.away > 0   // nobody of yours inside: get in before the raid fails (Tim 2026-10-20)
              ? `Get inside the ${where}: ${Math.max(0, Math.ceil(((game.businesses.raidRules.leaveSeconds || 10) * TICK_RATE - a.away) / TICK_RATE))} s or the raid fails`
              : `Hold the back room of the ${where}: ${Math.ceil(a.holdLeft / TICK_RATE)} s${a.holding ? '' : ' (stand in the gold ring)'}`
            : `Attacking the ${where}: police wave ${a.wave} of ${a.waves}`;
        }
      }
      // HQ camping: a small persistent notice accompanies the ground boundary.
      {
        const visit = hqCampingNoticeVisit(game.state, heroId);
        const el = $('campingnotice');
        el.hidden = !visit;
        if (visit) {
          const name = game.state.clans[visit.owner]?.name || 'Rival clan';
          el.classList.toggle('penalty', visit.active);
          el.querySelector('.label').textContent = visit.active ? visit.inside ? `Leave ${name}'s HQ area · camping adds infamy`
            : `Stay clear of ${name}'s HQ · reset in ${Math.ceil(visit.remaining)}s`
            : `Leave ${name}'s HQ area · camping penalty in ${Math.max(0, Math.ceil(game.hqCamping.rules.activateSeconds - visit.seconds))}s`;
          const decay = el.querySelector('.decay');
          decay.hidden = !visit.active;
          if (visit.active) {
            decay.querySelector('.fill').style.width = `${100 * Math.max(0, Math.min(1, visit.remaining / visit.clearSeconds))}%`;
            el.querySelector('.decaylabel').textContent = visit.inside ? `${visit.clearSeconds}s outside needed to reset`
              : `${Math.ceil(visit.remaining)}s remaining outside · re-entry restarts decay`;
          }
        }
      }
      // your business is being raided: bell once, red banner, a channel bar while knocking the lantern down
      {
        const a = raidOnMe(), el = $('raidalarm');
        el.hidden = !a;
        if (a) {
          const where = a.hq ? 'Shinobi HQ' : a.kind.replace(/_/g, ' '), who = game.state.clans[a.clan]?.name || 'A rival clan';
          const s = Math.ceil((a.phase === 'warmup' ? a.opensAt - game.state.tick : a.holdLeft) / TICK_RATE);
          const b = `Your ${where} is being raided!`, t = a.phase === 'warmup' ? `${who} planted a War Lantern · doors open in ${s} s`
            : `${who} ${a.holding ? 'hold' : 'fight for'} the back room · ${s} s left${a.holding ? '' : ' (held off)'}`;
          if (el.querySelector('b').textContent !== b) el.querySelector('b').textContent = b;
          if (el.querySelector('span').textContent !== t) el.querySelector('span').textContent = t;
        }
        // ...or a rival knocking down your own War Lantern (Tim 2026-10-20): the same bar in red, a bell
        // when it starts, and a click on it targets him
        const mine = Object.values(game.state.attacks || {}).find(r => r.clan === game.state.entities[heroId]?.owner && r.knock);
        const foe = mine?.knock || null, k = a?.knock?.by === heroId ? a.knock : foe, kb = $('knockbar');
        kb.hidden = !k;
        kb.classList.toggle('foe', !!k && k === foe);
        if (k) {
          kb.querySelector('i').style.width = `${Math.min(100, (game.state.tick - k.start) / (k.ticks || (game.businesses.raidRules.knockSeconds || 4) * TICK_RATE) * 100)}%`;
          const u = game.state.entities[k.by], who = `${game.state.clans[u?.owner]?.name || 'A rival'}${u?.type === 'hero' ? ' boss' : ''}`;
          const txt = k === foe ? `${who} is knocking down your War Lantern · click to target` : 'Knocking down the War Lantern';
          if (kb.querySelector('span').textContent !== txt) kb.querySelector('span').textContent = txt;
          kb.dataset.by = k.by;
        }
      }
      { const n = game.state.clans.player?.lanterns || 0, el = $('lanterns'); el.hidden = !n; el.textContent = `War Lantern ${n}`; }
      { const c = game.state.clans.player, el = $('renown'), t = `Renown ${c?.renown || 0}`; el.hidden = c?.kind !== 'ninja'; if (el.textContent !== t) el.textContent = t; }
    if (lostCops) {
      lostCops = false;
      const el = $('lostcops');
      el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    }
      const door = interactionDoor(), innerDoor = !door && game.interiorDoorNear(heroId), knockable = raidOnMe(true);
      const shut = door?.to && game.businesses.entryStatus(game.state.entities[heroId], door.place);
      const lamp = !door && game.stealth.snuffable(game.state.entities[heroId]), left = lamp ? game.stealth.snuffsLeft(game.state.entities[heroId].owner) : 0;
      $('prompt').textContent = knockable ? 'Space  Knock down the War Lantern' : shut && !shut.ok ? shut.why : door ? `Space  ${door.label}`
        : innerDoor ? `Space  ${game.state.interiorDoors[innerDoor.id] ? 'Close' : 'Open'} sliding door`
        : lamp ? (game.state.entities[heroId].snuffing ? 'Snuffing the lantern…' : left ? `Space  Snuff the lantern (${left} left tonight)` : 'No more lanterns tonight') : '';
      $('prompt').hidden = !door && !innerDoor && !knockable && !lamp;
      stealthBadge.update();
      characterPanel.update();
      hireMenu.update();
      clinicMenu.update();
      policeMenu.update();
      contractMenu.update();
      if (deploymentPanel.isOpen() && !gameMap.isOpen()) deploymentPanel.close();   // closing the map closes its docked menu
      deploymentPanel.update();
      topBar.update();
      crewInput.update();
      selPanel.update();
      unitFrames.update();
      bldPanel.update();
      interiorInfo.update();
    if(!presentation.map){
    const pan = panAxes();
    // the mouse at the screen edge pans too (Tim 2026-10-20): only when the camera is off the hero
    // (not in hero follow; Home goes back to it), and not with the game map open
    const edge = !gameSettings.isOpen() && !characterPanel.isOpen() && !gameMap.isOpen() && !deploymentPanel.isOpen() && view.isPanned() ? edgeAxes() : { right: 0, up: 0 };
    view.pan(Math.max(-1, Math.min(1, pan.right + edge.right)), Math.max(-1, Math.min(1, pan.up + edge.up)), dt);
    $('snap').hidden = !view.isPanned();
    fog.update(dt);
    presentation.measure('world',()=>view.render(fog.seen(game.state), prev, clock.alpha(), dt, now, heroId));
    crewInput.drawMarkers($('lock'));
    unitFrames.updateHover(mouse, document.elementFromPoint(mouse.x, mouse.y) === $('view'));
    { hoverLamp = lampAt(); const el = $('snuffhint'), h = game.state.entities[heroId];
      el.hidden = !hoverLamp;
      if (hoverLamp) { const n = game.stealth.snuffsLeft(h.owner), t = n ? `Snuff (${n} left tonight)` : 'No snuffs left tonight';
        if (el.textContent !== t) el.textContent = t; el.style.left = `${mouse.x + 16}px`; el.style.top = `${mouse.y - 8}px`; } }
    minimap.update();
    }else{
      $('snuffhint').hidden=true;
      presentation.measure('map',()=>gameMap.update());
    }
    if(!presentation.map){bar.update(game.state.tick - 1 + clock.alpha());crewBar.update();}
    selectionDock.update();
    hudLayout.update();
    warLantern.update();utilityMenu.update();
  });
}

start().catch(e => { console.error(e); status(`Could not start: ${e.message}`); });
