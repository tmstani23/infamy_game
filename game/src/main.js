import { modeRules } from './sim/modes/index.js';
import {createShopUI} from './shop_ui.js';
import { createHQStash } from './inventory_ui.js';
import {watchCrewGroup} from './crew_watch.js';
import { createUtilityMenu } from './utility_menu.js';
import { createWarLanternButton } from './war_lantern_button.js';
import { createSimWorkerClient } from './sim_worker_client.js';
import { createStealthBadge } from './stealth_badge.js';
// Wires the game together: load data, run the rules at a fixed tick, draw every frame.
import { createGame, TICK_RATE } from './sim/game.js';
import { setupMatch } from './sim/setup_match.js';
import { loadSave, heroOf, decode } from './sim/save.js';
import { chooseMatch } from './start_screen.js';
import { createView } from './render/view.js';
import { onKey, moveCommand, panAxes, edgeAxes, setGameplayInput } from './input.js';
import { createHireMenu } from './hire_menu.js';
import { interactionDoor as selectInteractionDoor } from './door_interaction.js';
import { createClinicMenu } from './clinic_menu.js';
import { createPoliceMenu } from './police_menu.js';
import { createLieutenantTalk } from './lieutenant_talk.js';
import { createSurveyorTalk } from './surveyor_talk.js';
import { createStationMenu } from './station_menu.js';
import { createStableMenu } from './stable_menu.js';
import { createVehiclesPanel } from './vehicles_panel.js';
import { createLandOfficeMenu } from './land_office_menu.js';
import { createGoalCard } from './goal_card.js';
import { createSiteMenu } from './site_menu.js';
import { createLieutenantPanel } from './lieutenant_panel.js';
import { createContractMenu } from './contract_menu.js';
import { createHeatBadge } from './heat_badge.js';
import { createFps } from './fps.js';
import { frontierReport } from './frontier_report.js';
import { createFrontierPanel } from './frontier_panel.js';
import { createFrontierBuildUI } from './frontier_build_ui.js';
import { createFoundButton } from './found_button.js';
import {withWorkerPresentations,workerLocation} from './worker_details.js';
import { drawableTowns, townSignature, townProps } from './town_props.js';
import { createTownGrowthFx } from './town_growth_fx.js';
import { createTownHover } from './town_hover.js';
import { makeSpotIndex } from './sim/resource_spots.js';
import { visibleSpots, spotInfo } from './resource_spot_props.js';
import { isDiscovered } from './world_map.js';
import { createTownsOverview } from './towns_overview.js';
import { createRyoBadge } from './ryo_badge.js';
import { createLootNotice } from './loot_notice.js';
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
import { createSaveStore, serverBackend, usable as usableSave } from './save_store.js';
import { saveLoadURL, saveFromURL } from './save_menu.js';
import { createGameMusic } from './game_music.js';
import { bindGameShell } from './game_shell.js';
import { createSelectionDock } from './selection_dock.js';
import { createNewsCallouts } from './news_callouts.js';
import { createTopBar } from './top_bar.js';

const $ = id => document.getElementById(id);
bindFullscreen($('fullscreenbtn'));
bindGameShell();
const controlTips = bindControlTooltips($('controls'));
const status = msg => { const el = $('loading'); if (el) el.textContent = msg; };
const getJSON = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load ${url}`);
  return r.json();
};

async function start() {
  setGameplayInput(false);
  status('Loading the district…');
  const [district, catalog, cutouts, interiors, parts, recipes, unitsFile, civilians, bandits, buildingInfo, police, settings, bots, world, frontier, worldChunksFile, worldPaint, crossings, biomeProps, coastline, worldAtlas, resourceSpots, resourceSpotRules] = await Promise.all([
    getJSON('data/port_town.json'), getJSON('data/art.json'),
    getJSON('art/cutouts.json'), getJSON('data/interiors.json'), getJSON('data/interior_parts.json'),
    getJSON('data/room_recipes.json'), getJSON('data/units.json'), getJSON('data/civilians.json'), getJSON('data/bandits.json'), getJSON('data/buildings.json'), getJSON('data/police.json'), getJSON('data/settings.json'), getJSON('data/bots.json'), getJSON('data/world.json'), getJSON('data/frontier.json'), getJSON('data/world_chunks.json'), getJSON('data/world_paint.json'), getJSON('data/world_crossings.json'), getJSON('data/biome_props.json'), getJSON('data/coastline.json'), getJSON('data/world_atlas.json'), getJSON('data/world_spots.json'), getJSON('data/resource_spots.json')]);

  const worldChunks = { ...worldChunksFile, paint: { ...worldPaint, ...crossings }, biomeProps, coastline };   // island art and painting settings

  // No sim, bot or game clock runs until Start is pressed. Test presets still boot directly.
  const startSaves = createSaveStore(serverBackend('/saves'));
  const bootSave = saveFromURL(location.href);
  const selected = bootSave ? { loadSave: bootSave } : ['ninja', 'bot', 'shakedown'].includes(TEST.setup)
    ? { clan: TEST.ninja ? 'shinobi' : 'yakuza', difficulty: bots.difficulty }
    : await chooseMatch({ root: $('startscreen'), loading: $('loading'), difficulty: bots.difficulty,
      startRyo: settings.costs?.startRyo ?? unitsFile.rules.startRyo, cycles: settings.season?.cycles ?? 10, drawCrest, saves: startSaves });
  status('Preparing the city…');
  // Single player runs the rules here. In multiplayer the server runs them instead.
  // data/settings.json (the numbers picked before a game) is laid over the detail files inside the sim
  // Lean Classic (Tim 2026-11-05): the mode is fixed once here (start screen or the save), and a match
  // without the island never builds the island, its camps or the frontier, in the sim or the view.
  const bootFile = selected.loadSave ? await startSaves.read(selected.loadSave) : null;
  const island = modeRules(bootFile ? decode(bootFile.state) : { match: selected }).island;
  const islandOnly = v => island ? v : null;
  const railways = await getJSON('data/railways.json').catch(() => null);   // train plan: railway rules
  const simOptions = { district, catalog, cutouts, interiors, parts, recipes, units: unitsFile, civilians, bandits, police, settings, world: islandOnly(world), worldChunks: islandOnly(worldChunks), resourceSpots: islandOnly(resourceSpots), resourceSpotRules: islandOnly(resourceSpotRules), frontier: islandOnly(frontier && { ...frontier, railways, ...(DEV ? { dev: true } : {}), fixtureTowns: false }) };   // E6b: no fixture towns in real games   // the worker gets the same options, frontier included
  const matchOptions = { ...selected, bots, spawns: district.spawns, test: TEST, seed: Math.floor(Math.random() * 2147483646) + 1 };   // seed: per-game bot site picks (E6)
  // A read-only replica supplies existing UI queries and static geometry. Only
  // the worker advances the match, including while Map/Deployment is open.
  const game = createGame(simOptions);
  const units = game.settings.units;   // hire prices etc. as the settings made them
  // Continue / Load from the start screen: the display copy and the worker both boot from the file.
  let saveFile = null, heroId;
  if (selected.loadSave) {
    saveFile = bootFile;
    loadSave(game, saveFile);   // migrates the file in place; only the display copy uses the result
    heroId = heroOf(game);
    selected.difficulty = game.state.match?.difficulty ?? bots.difficulty;
    if (bootSave) history.replaceState(null, '', location.pathname);   // consume the one-shot load request
  } else ({ heroId } = setupMatch(game, matchOptions));
  const simClient = await createSimWorkerClient({game,options:simOptions,match:matchOptions,save:saveFile,
    onError:error=>{status(error.message);const banner=$('pausedbanner');banner.hidden=false;
      banner.textContent='Simulation stopped: '+error.message+' · Reload to restart';console.error(error);}});
  // Prevent accidental browser-console calls from creating a second simulation.
  game.step = () => { throw new Error('Simulation runs in its worker; send commands instead'); };
  addEventListener('pagehide',()=>simClient.dispose(),{once:true});

  let view;
  try {
    view = await createView({
      canvas: $('view'), fxLayer: $('fx'), district, catalog, parts, scenery: game.scenery, rooms: game.rooms, world: simOptions.world, worldChunks: simOptions.worldChunks, cutouts, resourceSpots: simOptions.resourceSpots, spotConfig: frontier?.townArt?._spots,
      doors: game.doors.filter(d => (!d.ninja || game.state.clans.player.kind === 'ninja') && (!d.gate || modeRules(game.state).island)), units,   // back windows: Shinobi only; the island gate: campaign only (W3.5)
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
  const pending = [];
  const toggleNight = () => pending.push({ type: 'time' });
  // dev only (test_params.js DEV): flipping day and night by hand
  if (DEV) onKey('KeyN', toggleNight);
  $('daynight').addEventListener('click', e => { if (DEV) toggleNight(); e.currentTarget.blur(); });
  label();
  if (DEV) onKey('F3', () => view.toggleDebug());
  // Space at a door: go through it, or at the clinic's / police box's / HQ's ring open its menu (no interior)
  onKey(['Space', 'Enter'], () => {
    if(game.itemServices.near(game.state.entities[heroId])){shop.open();return;}
    // on the island at your omnibus station, or by your omnibus away from the gate: travel (Tim 2026-11-06)
    if (stableMenu.isOpen() || stableMenu.at()) { stableMenu.toggle(); return; }
    if (stationMenu.at()) { stationMenu.toggle(); return; }
    // at your town hall: talk to its governor (Tim 2026-11-07: no figure stands there any more)
    const gov = game.governorNear?.(heroId);
    if (gov) { pending.push({ id: heroId, type: 'lieutenant', guide: 'governor' }); townTalk(gov.governor); return; }
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
    else if (menu === 'land_office') landOfficeMenu.toggle();   // E1: founding permit and settlers
    else if (menu === 'surveyor') surveyorTalk.toggle();   // the old surveyor by the Land Office (Tim 2026-11-06 20:45)
    else if (menu === 'lieutenant') lieutenantTalk.toggle();   // goal steps: the lieutenant at the gate (Tim 2026-11-06)
    else if (menu === 'rail_station') stationMenu.toggle();   // the city railway station by the gate (Tim 2026-11-07)
    else if (door0?.gate && siteMenu.wanted()) siteMenu.toggle();   // the island gate menu when there is more than one way out (Tim 20:40)
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
  // hovering your omnibus: a small flashing icon says what a right-click does (Tim 2026-11-06)
  const busIcon = $('busicon');
  setInterval(() => {
    if (!busIcon) return;
    let b = null;
    try { b = crewInput.omnibusAt(mouse.x, mouse.y); } catch { return; }   // crewInput is made further down
    busIcon.hidden = !b;
    if (!b) return;
    const s = view.unitToScreen(b.x, b.z);
    busIcon.textContent = b.full ? 'Step out' : 'Get in';
    busIcon.style.left = `${s.x}px`; busIcon.style.top = `${s.y - 70}px`;
  }, 100);
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
    if (e.button !== 0 || !hoverLamp || e.target.closest('button, #bar, #hud, #partyframes, #crewcommands, #utilitymenu')) return;
    pending.push({ id: heroId, type: 'snuff', prop: hoverLamp.prop });
    e.stopImmediatePropagation(); e.preventDefault();
  }, true);
  for (const slot of ['Q', 'E', 'R', 'F']) onKey(`Key${slot}`, () => {
    // the omnibus (sim/omnibus.js, Tim 2026-11-06): Q inside steps everyone out; Q right by a parked one gets in
    if (slot === 'Q' && crewInput.omnibusKey()) return;
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

  const hqStash = createHQStash({game, heroId, send:c => pending.push(c),
    onOpen:() => {characterPanel.close();setGameplayInput(false);}, onClose:() => setGameplayInput(true)});
  const shop=createShopUI({game,heroId,view,send:c=>pending.push(c),hidden:()=>gameMap.isOpen()||hudLayout.isEditing(),onOpen:()=>{characterPanel.close();hqStash.close();setGameplayInput(false);},onClose:()=>setGameplayInput(true)});
  // Hire menu: only reads the state and sends 'hire' commands, like a bot would
  let townSig = '', townGrowthFx = null;
  const spotIndex = makeSpotIndex(resourceSpots), spotConfig = frontier?.townArt?._spots;
  const spotTip = document.createElement('div'), twinkle = document.createElement('div');
  spotTip.className = 'townhover'; spotTip.hidden = twinkle.hidden = true;
  twinkle.textContent = '✦';
  twinkle.style.cssText = 'position:fixed;pointer-events:none;color:#fff0bd;z-index:12;line-height:1';
  document.body.append(spotTip, twinkle);
  let spotMouse = null;
  addEventListener('mousemove', e => { spotMouse = e.target?.closest?.('canvas#view') ? { x: e.clientX, y: e.clientY } : null; });
  addEventListener('blur', () => { spotMouse = null; });
  function updateSpotHover() {
    const hero = game.state.entities[heroId];
    spotTip.hidden = twinkle.hidden = true;
    if (!spotMouse || !spotConfig || hero?.place !== 'world' || gameMap.isOpen() || !$('controls').hidden) return;
    const point = view.screenToGround(spotMouse.x, spotMouse.y);
    if (!point) return;
    const candidates = visibleSpots(spotIndex, { ...point, radius: spotConfig.pieceReach,
      known: (x, z) => isDiscovered(world, game.state.world?.discovered?.[hero.owner] ?? '0', x, z) });
    let picked = null, best = spotConfig.hoverRadius;
    for (const spot of candidates) for (const [dx, dz] of spot.pieces) {
      const distance = Math.hypot(point.x - spot.x - dx, point.z - spot.z - dz);
      if (distance < best) { best = distance; picked = { spot, x: spot.x + dx, z: spot.z + dz }; }
    }
    if (!picked) return;
    const info = spotInfo(picked.spot, game.state.frontier?.spots?.[picked.spot.id]);
    spotTip.textContent = `${info.title}: ${info.lines.join(' · ')}`;
    Object.assign(spotTip.style, { left: `${Math.min(innerWidth - 260, spotMouse.x + 16)}px`, top: `${Math.min(innerHeight - 110, spotMouse.y + 16)}px` });
    const screen = view.unitToScreen(picked.x, picked.z, 1);
    Object.assign(twinkle.style, { left: `${screen.x}px`, top: `${screen.y}px`, fontSize: `${spotConfig.twinkleSize * (1 + spotConfig.twinklePulse * Math.sin(performance.now() / spotConfig.twinklePeriodMs))}px` });
    spotTip.hidden = twinkle.hidden = false;
  }
  const foundButton = createFoundButton({ root: $('foundtown'), game, heroId, view, send: c => pending.push(c), onStart:()=>{frontierBuildUI?.cancel();crewInput.clear();}, blocked:()=>gameMap.isOpen() || !$('controls').hidden || hudLayout.isEditing() || gameSettings.isOpen() });
  const hireMenu = createHireMenu({ panel: $('hire'), money: $('money'), game, units, heroId, openStash:() => {hireMenu.close();hqStash.open();}, send: c => pending.push(c) });
  // H: on the island it is your horse (ride, get off, call her; sim/mounts.js, Tim 2026-11-06); in the city it hires
  // H: your horse; Shift+H: Mount up, you and your selected crew (else those following you) on horses (Tim 2026-11-07)
  onKey('KeyH', e => { if (game.state.entities[heroId]?.place === 'world') pending.push(e?.shiftKey ? { id: heroId, type: 'mount', group: true, units: crewInput.selected() } : { id: heroId, type: 'mount' }); else hireMenu.toggle(); });
  const clinicMenu = createClinicMenu({ panel: $('clinic'), game, heroId, selected: () => crewInput.selected(), send: c => pending.push(c) });
  // telegraph office hint (Tim 2026-11-06): once the hero's clan can buy a founding permit, the office
  // blinks gold in the street and on the maps, and a one-time callout says where to go. Read-only.
  // Every Goal card step with a place pings the same way (the minimap pulse and the street blink).
  let hintAt = 0, calloutShown = false, gateCallout = false, leaveSince = 0;
  let ordersSent = false, reportSent = false, lastPlace = null;   // While I'm away opened during the orders step: told to the sim once
  function officeHint(now) {
    if (now - hintAt < 250) return;
    hintAt = now;
    const h = game.state.entities[heroId], L = game.landOffice, b = L?.office(), c = h && game.state.clans[h.owner];
    const goal = c && !c.bot ? game.goals?.current(h.owner) : null;
    const ready = !!(b && c && !c.bot && !c.permit && L.permitStatus(c.id).ok) && !landOfficeMenu.isOpen();
    // Leave the city goal (Tim 2026-11-06): the island gate gets the same gold blink and minimap pulse
    const leave = !ready && h?.place !== 'world' && !!goal?.gate && game.gate?.city;
    // Goal pings (Tim 2026-11-06): otherwise the first unfinished row of the Goal card that names a spot (shown when the hero is in that place)
    const row = goal?.rows.find(r => !r.done && r.where), where = row?.where && row.where.place === h?.place ? row.where : null;
    // Tim 2026-11-06: when the last settler arrives, the HQ blinks for a few seconds first (they wait there), then the gate
    if (leave && !leaveSince) leaveSince = now; else if (!leave) leaveSince = 0;
    const hq = leave && now - leaveSince < 8000 && Object.values(game.state.businesses).find(x => x.hideout === h.owner && x.ring);
    const door = hq ? hq.ring : leave ? game.gate.city : ready ? b && (b.ring || b.door || [b.x, b.z]) : where && !landOfficeMenu.isOpen() ? [where.x, where.z] : null;
    view.setOfficeHint(door || null);
    game.officeHint = door ? { x: door[0], z: door[1] } : null;
    // Shakedown / Sweep goal (Tim 2026-11-06): lead the player with gold flashes, one at a time:
    // the Deployment icon, then your sectors with crew on the map, then the Start Shakedown / Dispatch Sweep button
    const op = goal?.rows.find(r => !r.done && (r.label === 'Shakedown done' || r.label === 'Sweep done'));
    const ops = op && $('deploymentpanel').querySelector(op.label === 'Sweep done' ? '.sweep-ops' : '.shakedown-ops');
    const opsShown = !!ops && !ops.hidden && deploymentPanel.isOpen(), menuOpen = deploymentPanel.isOpen() || gameMap.isOpen();
    // lieutenant goal steps (Tim 2026-11-06): Deployment icon, then the While I'm away tab, then the budget slider
    const orders = goal?.key === 'orders', awayPage = $('deploymentpanel').dataset.page === 'away' && deploymentPanel.isOpen();
    $('deploymentbtn').classList.toggle('goal-flash', (!!op || orders) && !menuOpen);
    document.querySelector('#deploymentpanel .show-away')?.classList.toggle('goal-flash', orders && deploymentPanel.isOpen() && !awayPage);
    document.querySelector('#deploymentpanel .away-budget')?.classList.toggle('goal-flash', orders && awayPage);
    if (orders && awayPage && !goal.rows[0].done && !ordersSent) { ordersSent = true; pending.push({ id: heroId, type: 'lieutenant', guide: 'opened' }); }
    // Lieutenant's report (Tim 2026-11-06): the first time the boss walks back into the city, a callout and the log flashes until read
    const ms = c?.milestones || {};
    if (h && lastPlace === 'world' && h.place !== 'world' && !ms.reportDue && !ms.reportRead && game.state.lieutenants?.[c.id]) {
      pending.push({ id: heroId, type: 'lieutenant', guide: 'back' });
      callout('Lieutenant’s report: open Deployment → While I’m away to read what he did while you were out', 'news', 8000);
    }
    if (h) lastPlace = h.place;
    const report = !!ms.reportDue && !ms.reportRead && !orders && !op;
    if (report) {
      if (!menuOpen) $('deploymentbtn').classList.add('goal-flash');
      document.querySelector('#deploymentpanel .show-away')?.classList.toggle('goal-flash', deploymentPanel.isOpen() && !awayPage);
      document.querySelector('#deploymentpanel .away-log')?.classList.toggle('goal-flash', awayPage);
      if (awayPage && !reportSent) { reportSent = true; setTimeout(() => pending.push({ id: heroId, type: 'lieutenant', guide: 'report' }), 4000); }
    } else if (!orders) document.querySelector('#deploymentpanel .away-log')?.classList.remove('goal-flash');
    for (const btn of $('deploymentpanel').querySelectorAll('.start-shakedown, .start-sweep')) btn.classList.toggle('goal-flash', opsShown && ops.contains(btn));
    game.goalGuide = op && menuOpen && !opsShown ? { sectors: (game.state.deployment?.sectors || []).map(s => s.id)
      .filter(id => Object.values(game.state.entities).some(e => e.owner === h.owner && e.type !== 'hero' && !e.dead && e.deployment?.group === id)) } : null;
    // Land Office menu (Tim 2026-11-06): the permit's Buy button flashes once it can be bought; Five settlers during the settlers goal
    for (const btn of $('landoffice').querySelectorAll('[data-pick]')) btn.classList.toggle('goal-flash',
      !btn.disabled && ((btn.dataset.pick === '0' && !!goal?.key?.startsWith('permit') && L.permitStatus(c.id).ok) || (btn.dataset.pick === '2' && !!goal?.key?.startsWith('settlers'))));
    // Town setup goals (Tim 2026-11-06): flash the next button in the town panel, or the Town icon while it is shut
    const TOOL = { 'Road cells': 'road', 'Housing cells': 'housing', 'Farm cells': 'farm', 'Work cells': 'work', Storehouse: 'storehouse', 'Lumber camp': 'lumber_camp', Quarry: 'quarry', People: 'housing', Infirmary: 'infirmary' };
    const toolSteps = () => [`[data-act="build-tool"][data-id="${TOOL[goal.rows.find(r => !r.done)?.label] || 'road'}"]`, '[data-act="build-toggle"]', '[data-act="build-workers"]', '[data-build]'];
    const step = goal && { layout: toolSteps, goods: toolSteps, storehouse: toolSteps, camps: toolSteps, people: toolSteps, infirmary: toolSteps,
      govorders: () => goal.rows[0].done ? ['[data-act="auto"][data-id="on"]', '[data-act="approve"]'] : ['[data-act="priority"]'],
      stone: () => ['@stone', '[data-act="build-workers"]'],
      workers: () => ['@timber', '[data-act="build-workers"]'], village: () => ['[data-upgrade]'],
      market: () => ['[data-act="build-tool"][data-id="market"]', '[data-act="build-toggle"]', '[data-build]'] }[goal.key];
    for (const el of document.querySelectorAll('#townpanel .goal-flash, #towninspect .goal-flash')) el.classList.remove('goal-flash');
    let target = null;
    // '@timber' (Tim 2026-11-06): the nearest timber button under "Nearby discovered spots" on the Workers pane
    const pick = sel => sel[0] === '@' ? [...document.querySelectorAll('#townpanel [data-act="build-worker-spot"]')].find(el => el.textContent.startsWith(sel.slice(1)) && el.offsetParent !== null)
      : [...document.querySelectorAll(`#townpanel ${sel}, #towninspect ${sel}`)].find(el => el.offsetParent !== null);
    if (step) for (const sel of step()) { target = pick(sel); if (target) break; }
    target?.classList.add('goal-flash');
    $('townbtn').classList.toggle('goal-flash', !!step && !target && h?.place === 'world');
    if (leave && !gateCallout) { gateCallout = true; callout('Your settlers are all at your HQ (gold): they will join you outside the island gate. Walk to the gate (G on the minimap) and press Space', 'news', 7000); }
    if (ready && !calloutShown) { calloutShown = true; callout('You can buy a founding permit: go to the telegraph office (gold marker on the map)', 'news', 5000); }
  }
  // quest log (Tim 2026-11-06): the campaign's current goal; reads game.goals only
  const goalCard = createGoalCard({ root: $('goalcard'), button: $('goalbtn'), game, heroId, callout: (t, k, ms) => callout(t, k, ms), stamp: () => sound.cue('knockdown_thud_1', 0.25) });
  const stationMenu = createStationMenu({ panel: $('stationmenu'), game, heroId, send: c => pending.push(c) });
  const stableMenu = createStableMenu({ panel: $('stablemenu'), game, heroId, send: c => pending.push(c), data: frontier });   // Tim 2026-11-07: buy horses and vehicles
  // the old surveyor's map tour runs on the World tab of the game map (made further down; called only after a click)
  const surveyorTalk = createSurveyorTalk({ panel: $('svtalk'), card: $('svtour'), game, heroId, send: c => pending.push(c),
    map: { tourTo: (id, span) => gameMap.tourTo(id, span), endTour: () => gameMap.endTour(), isOpen: () => gameMap.isOpen(), close: () => gameMap.close() } });
  const lieutenantTalk = createLieutenantTalk({ panel: $('lttalk'), game, heroId, send: c => pending.push(c), showOrders: () => { if (!deploymentPanel.isOpen()) $('deploymentbtn').click(); setTimeout(() => document.querySelector('#deploymentpanel .show-away')?.click(), 0); } });
  const landOfficeMenu = createLandOfficeMenu({ panel: $('landoffice'), game, heroId, units, send: c => pending.push(c) });
  const siteMenu = createSiteMenu({ panel: $('sitemenu'), game, heroId, selected: () => crewInput.selected(), send: c => pending.push(c) });
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
  const characterPanel = createCharacterPanel({ game, heroId, catalog, button: $('characterbtn'), send:c => pending.push(c),
    onOpen: () => setGameplayInput(false), onClose: () => setGameplayInput(true) });
  onKey(['KeyJ'], () => characterPanel.toggle());
  onKey(['KeyI'], () => characterPanel.showInventory());
  $('inventorybtn').addEventListener('click', () => characterPanel.showInventory());
  const lootNotice = createLootNotice({ game, heroId, view, button: $('inventorybtn') });
  const deploymentPanel = createDeploymentPanel({ root: $('deploymentpanel'), button: $('deploymentbtn'), game, units, catalog, heroId, crewInput, send: c => pending.push(c),
    onPickPoint: (sector, callback) => gameMap.pickPoint(sector, callback),
    onPickDestination: callback => gameMap.pickDestination(callback), onCancelPick: () => gameMap.cancelPick(),
    // docked beside the open game map with the Sectors layer on (Tim 2026-10-27)
    onOpen: id => gameMap.dock(true, id), onClose: () => { gameMap.dock(false); gameMap.close(); }, onFocus: id => gameMap.focusSector(id), onInspect:id=>unitFrames.inspect(id),
    onViewCrew:ids=>{gameMap.close();if(ids.length===1)jump(game.state.entities[ids[0]]);else watchGroup(null,ids);} });
  const lieutenantPanel = createLieutenantPanel({ root: $('deploymentpanel'), game, heroId, send: c => pending.push(c), maxBudget: settings.campaignCity?.lieutenant?.maxBudget });   // C3: While I'm away
  $('rallybtn').addEventListener('click', e => { pending.push({ id: heroId, type: 'deployment', action: 'rally' }); e.currentTarget.blur(); });
  // Unstuck (sim/unstuck.js): U or the button; a refusal is shown here, the sim checks again
  const unstuck = () => { const h = game.state.entities[heroId], no = h?.unstuck ? null : game.unstuck.why(h); if (no) callout(no, 'loss'); else pending.push({ id: heroId, type: 'unstuck' }); };
  onKey('KeyU', unstuck);
  $('unstuckbtn').addEventListener('click', e => { unstuck(); e.currentTarget.blur(); });
  function interactionDoor() {
    return selectInteractionDoor(game, heroId, crewInput.selected());
  }
  onKey('KeyC', () => crewInput.selectAll());
  onKey('KeyV', () => crewInput.followMe());
  onKey('KeyX', () => crewInput.armAttackMove());
  onKey('KeyZ', () => crewInput.stopSelected());   // stop + passive until the next order (Tim 2026-10-18)
  onKey('Tab', () => crewInput.tab());
  $('knockbar').addEventListener('click', () => crewInput.target($('knockbar').dataset.by));   // target whoever knocks down your War Lantern
  onKey('KeyT', () => crewInput.crewAttack());
  onKey('KeyG', () => crewInput.healSelected());
  let openTownHook = () => {};   // opens a town panel (F4.4d)
  let evacuateGarrison = () => {};   // Shift+K: everyone out of your stockades (Tim 2026-11-07)
  let townTalk = () => {};       // opens a town panel at the governor's talk (Tim 2026-11-06)
  let townAlertHook = () => {};   // set when the frontier town windows exist (F4.4c)
  let closeTown = () => {};   // set when the frontier town panel exists (F4.4)
  onKey('Escape', () => { closeTown(); hireMenu.close(); clinicMenu.close(); policeMenu.close(); landOfficeMenu.close(); lieutenantTalk.close(); surveyorTalk.close(); stationMenu.close(); stableMenu.close(); vehiclesPanel?.close(); siteMenu.close(); contractMenu.close(); deploymentPanel.close(); crewInput.cancelAction(); crewInput.clear(); $('controls').hidden = true; controlTips.hide(); gameMap.close(); unitFrames.clearKnown(); });
  bindCrewNumberKeys({ onKey, crewInput, menus: [clinicMenu, policeMenu, landOfficeMenu, surveyorTalk, siteMenu, stableMenu, stationMenu, contractMenu, hireMenu] });
  const sound = createSound();
  const music = createGameMusic({settings:sound.getSettings()});
  sound.subscribe(settings=>music.setSettings(settings));
  // Save files (frontier F1.6): Settings uses the same full startup path as the main menu,
  // rebuilding faction/mode-specific UI, doors, hero bindings and the authoritative worker.
  const saveStore=createSaveStore(serverBackend('/saves'));
  const saveMeta=()=>({day:game.state.clock?.day??null,clan:game.state.clans.player?.kind??'player',mode:game.state.match?.mode??'classic'});
  const saves={meta:saveMeta,list:()=>saveStore.list(),remove:n=>saveStore.remove(n),
    async save(name,label){await saveStore.write(name,await simClient.save(),{...saveMeta(),label});},
    async load(name){const file=await saveStore.read(name);
      const hero=Object.values(file.state?.entities||{}).find(e=>e.type==='hero'&&e.owner==='player')?.id;
      const check=usableSave(file);if(!check.ok)throw new Error(check.message);
      if(!hero||!file.state?.clans?.player)throw new Error('This save has no player hero');
      location.assign(saveLoadURL(name,location.href));}};
  const gameSettings=createGameSettings({button:$('settingsbtn'),sound,saves,onOpen:()=>setGameplayInput(false),onClose:()=>setGameplayInput(true),onEditLayout:()=>{gameMap.close();shop.close();hqStash.close();characterPanel.close();$('controls').hidden=true;hudLayout.begin();}});
  const updateMute=s=>{$('mutebtn').textContent=s.muted?'Unmute (K)':'Mute (K)';};
  sound.subscribe(updateMute);updateMute(sound.getSettings());
  // mute: K or the button (M opens the game map, Tim 2026-10-20)
  const mute = () => { const m = sound.toggleMute(); $('mutebtn').textContent = m ? 'Unmute (K)' : 'Mute (K)'; };
  onKey('KeyK', e => e?.shiftKey ? evacuateGarrison() : mute());
  $('mutebtn').addEventListener('click', e => { mute(); e.currentTarget.blur(); });
  // Pause (Tim 2026-10-27, single player): the sim stops stepping, drawing and menus keep going
  let paused = false;
  let gatePlace = null;   // the hero's place last frame, for the gate fade
  const togglePause = () => { paused = !paused; $('pausedbanner').hidden = !paused; $('pausebtn').textContent = paused ? 'Resume (`)' : 'Pause (`)'; $('pausebtn').setAttribute('aria-pressed', String(paused)); };
  onKey(['Backquote', 'Pause'], togglePause);
  $('pausebtn').addEventListener('click', e => { togglePause(); e.currentTarget.blur(); });
  const fps = createFps({diagnostics:()=>view.graphicsStats(),sim:()=>simClient.diagnostics()});
  onKey('KeyP', () => fps.toggle());
  // Controls panel: the button or ? opens it, Esc closes it
  const toggleControls = () => { controlTips.hide(); $('controls').hidden = !$('controls').hidden; };
  onKey('Slash', toggleControls);
  $('ctlbtn').addEventListener('click', e => { toggleControls(); e.currentTarget.blur(); });
  const where = e => unitWhere(e, game.state, district, buildingInfo);   // "Teahouse · Waterfront"
  // where the camera should look for a unit: itself, or its building's door if it is inside one the hero isn't in
  const lookPoint = u => {
    const door = u.owner !== game.state.entities[heroId]?.owner && u.place !== 'street' && u.place !== game.state.entities[heroId]?.place && game.doors.find(d => d.to && d.place === u.place);
    return door ? { x: door.x, z: door.z,place:'street' } : { id:u.id,x: u.x, z: u.z,place:u.place };
  };
  const usable = u => u && !u.dead && !u.jailed;
  // double-click a crew name: the camera follows him (Tim 2026-10-28) until you pan, click the map or press Home
  const jump = u => {
    if (!u.id) { view.jumpTo(u.x, u.z); return; }
    view.watch(() => { const e = game.state.entities[u.id]; return usable(e) ? lookPoint(e) : null; });
  };
  // double-click a group header: follow the middle of the group's biggest cluster
  const watchGroup=(group,ids=null)=>view.watch(()=>watchCrewGroup(game.state,game.state.entities[heroId]?.owner,group,ids));
  const bar = createActionBar({ root: $('bar'), game, units, heroId, tickRate: TICK_RATE, crewInput, where, jump, watchGroup, crewRoot:$('partyframes'), send: c => pending.push(c), onInspect: id => unitFrames.inspect(id), onHeroFocus: () => view.snapBack() });
  onKey('KeyB', () => bar.useItem());   // usable-item slot
  let nameplatesOn = false;
  onKey('KeyL', () => { nameplatesOn = !nameplatesOn; view.setNameplates(nameplatesOn); });
  const actionCommands=document.createElement('div');actionCommands.className='action-commands';
  const lanternButton=document.createElement('button');lanternButton.id='warlanternbtn';lanternButton.type='button';lanternButton.dataset.icon='♨';
  $('rallybtn').dataset.icon='⚑';actionCommands.append($('rallybtn'),lanternButton);$('bar').querySelector('.row').appendChild(actionCommands);
  const warLantern=createWarLanternButton({button:lanternButton,game,heroId,send:c=>pending.push(c)});
  const utilityMenu=createUtilityMenu({root:$('utilitymenu'),anchor:$('ryo'),buttons:['deploymentbtn','characterbtn','inventorybtn','settingsbtn','unstuckbtn','pausebtn','mutebtn','fullscreenbtn','townbtn','townsbtn','vehiclesbtn','goalbtn','ctlbtn','daynight'].map($)});
  const crewCommands=document.createElement('div');crewCommands.id='crewcommands';document.body.appendChild(crewCommands);
  const crewBar = createCrewBar({ root: crewCommands, game, heroId, crewInput });
  // a lone left-clicked enemy or townsperson shows in the target frame (top left), not the unit card
  const lone = ids => ids.length === 1 && game.state.entities[ids[0]]?.owner !== game.state.entities[heroId]?.owner;
  const selPanel = createSelectionPanel({ root: $('selpanel'), game, units, catalog, crewInput, where, skip: lone, hideOwnedBy:()=>game.state.entities[heroId]?.owner, onInspect:id=>unitFrames.inspect(id) });
  const unitFrames = createUnitFrames({ game, units, catalog, crewInput, heroId, view, where, jump, workerTarget:()=>frontierBuildUI?.workerTarget(), send: c => pending.push(c) });
  const interiorInfo = createInteriorInfo({ root: $('interiorinfo'), game, district, info: buildingInfo, units, heroId, clan: 'player' });
  const bldPanel = createBuildingPanel({ root: $('bldpanel'), game, district, info: buildingInfo, units, scenery: game.scenery, crewInput, clan: 'player', heroId, send: c => pending.push(c), openService: menu => {
    if (menu === 'clinic' && !clinicMenu.isOpen()) clinicMenu.toggle();
    else if ((menu === 'police_box' || menu === 'police_hq') && !policeMenu.isOpen()) policeMenu.toggle(menu);
    else if (menu === 'contracts' && !contractMenu.isOpen()) contractMenu.toggle();
    else if (menu === 'land_office' && !landOfficeMenu.isOpen()) landOfficeMenu.toggle();
  } });
  const minimap = createMinimap({ canvas: $('minimapcanvas'), game, district, world: simOptions.world, resourceSpots: simOptions.resourceSpots, spotConfig, atlasConfig: worldAtlas, view, fog, heroId, selected: () => crewInput.selected(), send: c => pending.push(c) });
  const mapZoom = factor => {
    const level = minimap.zoomBy(factor);
    $('minimapout').disabled = level <= 1;
    $('minimapin').disabled = level >= 4;
  };
  $('minimapout').addEventListener('click', () => mapZoom(1 / 1.25));
  $('minimapin').addEventListener('click', () => mapZoom(1.25));
  mapZoom(1);

  // the full game map (M or the button): territory, businesses, police, units, the season score (src/game_map.js)
  const gameMap = createGameMap({ openTown: id => { gameMap.close(); openTownHook(id); }, root: $('gamemap'), deploymentRoot:$('deploymentpanel'), game, district, world: simOptions.world, resourceSpots: simOptions.resourceSpots, spotConfig, paintConfig:worldPaint, atlasConfig:worldAtlas, view, fog, heroId, units, catalog, selected: () => crewInput.selected(), send: c => pending.push(c), devTravel: DEV,
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
    const clock = game.state.clock;
    const timeLeft = clock ? Math.max(0, Math.ceil(clock.left / TICK_RATE)) : null;
    const timer = timeLeft == null ? '' : ` · ${game.state.night ? 'Night' : 'Day'} ${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`;
    const owner = game.state.entities[heroId]?.owner;
    return `Crew ${game.clans.crewOf(owner).length} (cap ${game.clans.crewCap(owner)}) · ${!modeRules(game.state).seasonEnds ? `Campaign · Day ${s.day}` : `Day ${Math.min(s.day, s.cycles)}/${s.cycles}`}${timer} · ${parts.join(' · ')}`;
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
  const hudLayout = createHudLayout({ fromFile: uiFile.panels,onBegin:()=>setGameplayInput(false),onEnd:()=>{setGameplayInput(true);$('settingsbtn').focus();} });
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
  let frontierBuildUI = null, vehiclesPanel = null;
  // Town panel (frontier F4.4, replaces the F2.4b dev text box): key O. The console helper stays in the dev build.
  if (game.state.frontier) {
    let townPanel;
    frontierBuildUI = createFrontierBuildUI({ game, view, heroId, data: frontier, spotIndex, spotRules: resourceSpotRules,
      known: (x,z) => isDiscovered(world, game.state.world?.discovered?.[game.state.entities[heroId]?.owner] ?? '0', x,z),
      send: c => pending.push(c), crewInput, onBuild: id => townPanel.open(id), onStable: id => stableMenu.openFor(id),
      blocked: () => foundButton.isPlacing() || gameMap.isOpen() || !$('controls').hidden || hudLayout.isEditing() || gameSettings.isOpen() || characterPanel.isOpen() || hqStash.isOpen() || shop.isOpen() });
    const nearTown = () => {
      const h = game.state.entities[heroId];
      if (h?.place !== 'world') return null;
      return Object.values(game.state.frontier.settlements).filter(s => s.owner === h.owner && !s.capital && Math.hypot(s.x-h.x,s.z-h.z) <= frontier.workers.range)
        .sort((a,b) => Math.hypot(a.x-h.x,a.z-h.z)-Math.hypot(b.x-h.x,b.z-h.z))[0]?.id || null;
    };
    townPanel = createFrontierPanel({ root: $('townpanel'), game, heroId, selected: () => crewInput.selected(), send: c => pending.push(c), buildUI: frontierBuildUI, focus:(x,z)=>view.jumpTo(x,z),
      nearbyTown: () => nearTown(), onStable: id => stableMenu.openFor(id) });
    const overview = createTownsOverview({ root: $('townsoverview'), game, heroId, send: c => pending.push(c), openTown: id => townPanel.open(id) });
    onKey('KeyO', () => townPanel.toggle());
    // the Vehicles panel (Tim 2026-11-07): Shift+Y or its icon
    vehiclesPanel = createVehiclesPanel({ root: $('vehiclespanel'), game, heroId, send: c => pending.push(c), view, crewInput });
    onKey('KeyY', e => e?.shiftKey ? vehiclesPanel.toggle() : overview.toggle());
    for (const [id, f] of [['townbtn', () => townPanel.toggle()], ['townsbtn', () => overview.toggle()], ['vehiclesbtn', () => vehiclesPanel.toggle()]]) { $(id).hidden = false; $(id).addEventListener('click', e => { f(); e.currentTarget.blur(); }); }   // utility menu icons for the frontier windows
    openTownHook = id => townPanel.open(id);
    townTalk = id => townPanel.talk(id);
    const townHover = createTownHover({ game, view, heroId, tipEl: $('townhover'), flashEl: $('townflash'), openTown: id => townPanel.open(id), frontierData: simOptions.frontier,
      send: c => pending.push(c), selected: () => crewInput.selected(), badgeEl: $('garrisonbadges') });
    evacuateGarrison = () => townHover.evacuateAll();
    closeTown = () => { townPanel.close(); overview.close(); };
    // F4.4c: clickable alert under the big callout (click opens that town), and a flag on its overview row
    // Tim 2026-11-06: alerts from many towns must not spam. Urgent ones (attack, lost building, road
    // blocked) and alerts for the town you stand in show on their own; the rest fold into one
    // "Towns: N need attention" line. Every alert opens the all-towns window (Y), worst towns first.
    // At most 3 lines on screen.
    const folded = new Map(); let foldBtn = null, foldTimer = 0;
    const showLine = (b, ms) => { const box = $('townalerts'); box.append(b); while (box.children.length > 3) box.firstElementChild.remove(); setTimeout(() => b.remove(), ms); };
    townAlertHook = n => {
      overview.alert(n.settlement, n.event, n.urgent);
      const here = nearTown() === n.settlement;
      if (n.urgent || here) {
        const b = document.createElement('button'); b.textContent = n.text; b.className = n.urgent ? 'urgent' : ''; b.title = n.tip || n.text;
        b.addEventListener('click', () => { here && !n.urgent ? townPanel.open(n.settlement) : overview.showNeed(n.settlement); b.remove(); });
        return showLine(b, n.urgent ? 10000 : 6000);
      }
      folded.set(n.settlement, n.text);
      if (!foldBtn?.isConnected) {
        foldBtn = document.createElement('button'); foldBtn.className = 'fold';
        foldBtn.addEventListener('click', () => { overview.showNeed(); foldBtn.remove(); folded.clear(); });
        showLine(foldBtn, 600000);
      }
      foldBtn.textContent = folded.size === 1 ? `${n.text} (Y)` : `Towns: ${folded.size} need attention (Y)`;
      foldBtn.title = [...folded.values()].join('\n');
      clearTimeout(foldTimer); foldTimer = setTimeout(() => { foldBtn?.remove(); folded.clear(); }, 8000);
    };
    if (DEV) window.infamy.blockRoad = (road = 'r1', st = 'blocked') => pending.push({ id: heroId, type: 'frontier', action: 'devRoadState', road, state: st });   // try the F4.4c alerts
    if (DEV) window.infamy.frontierReport = () => { const text = frontierReport(game.state.frontier); console.log(text); return text; };
  }
  $('loading').remove();
  $('startscreen').remove();
  document.body.classList.remove('prematch');
  utilityMenu.update(true);
  setGameplayInput(true);

  // Fixed-tick loop: the rules advance TICK_RATE times a second, the screen
  // draws as often as it can and slides units between the last two ticks.
  // last tick's units, only what the view reads from it (render/view.js: sliding between ticks, heal pops);
  // a full copy of the state 20 times a second was wasted work (Tim 2026-10-26). Add a field here if the view needs more.
  const snapshot = state => { const entities = {}; for (const id in state.entities) { const e = state.entities[id]; entities[id] = { x: e.x, z: e.z, hp: e.hp, downed: e.downed }; }
    // sleeping workers are drawn from their trip records (withWorkerPresentations); keep their last spot too so they glide, not tick (Tim 2026-11-05)
    for (const s of Object.values(state.frontier?.settlements || {})) for (const w of s.workers || []) if (!state.entities[w.entity]) { const p = workerLocation(w, state.entities, state.workerAt); if (p) entities[`worker:${w.id}`] = { x: p[0], z: p[1] }; }
    return { tick: state.tick, entities }; };
  let prev = snapshot(game.state);
  const presentation=createPresentationMode({
    suspend(){document.body.classList.add('map-active');view.setPresentationActive(false);},
    resume(){document.body.classList.remove('map-active');prev=snapshot(game.state);view.setPresentationActive(true);fog.update(100);}
  });
  const clock = {alpha:()=>simClient.alpha(),diagnostics:()=>simClient.diagnostics()};
  if(DEV)window.infamy.mapPerformance=()=>({...presentation.diagnostics(),...gameMap.diagnostics(),clock:clock.diagnostics(),worldResources:{...view.renderer.info.memory}});
  const newsCallouts = createNewsCallouts({ game, heroId, $, TICK_RATE, callout, contractCallout, minimap, gameMap, view, presentation, showResults, townAlert: n => townAlertHook(n) });
  const topBar = createTopBar({ game, heroId, $, TICK_RATE, heatBadge, ryoBadge, scoreText });
  let last = performance.now() / 1000, labelTick = -Infinity, lostCops = false;
  function observeRaidAlarms() {
    const a = raidOnMe();
    if (a) { const key = `${a.business}:${a.opensAt}`; if (!alarmSeen.has(key)) { alarmSeen.add(key); sound.bell(); } }
    const mine = Object.values(game.state.attacks || {}).find(r => r.clan === game.state.entities[heroId]?.owner && r.knock);
    if (mine) { const key = `knock:${mine.business}:${mine.opensAt}`; if (!alarmSeen.has(key)) { alarmSeen.add(key); sound.bell(); } }
  }
  simClient.observe((stage,newTick)=>{
    if(stage==='before'){if(!presentation.map&&newTick)prev=snapshot(game.state);return;}
    gameMap.observe();observeRaidAlarms();
    if(newTick&&game.state.dawn&&!game.state.test)simClient.save().then(sv=>saveStore.autosave(sv,saveMeta())).catch(()=>{});   // 3 rotating dawn autosaves
    if(game.state.policeNews.some(n=>n.kind==='lost'&&n.clan===game.state.entities[heroId]?.owner))lostCops=true;
    newsCallouts.update();
    if(!presentation.map){
      if(game.state.hits.length)view.addHits(fog.seenEvents(game.state.hits,game.state,'t'),game.state,heroId);
      if(game.state.dodges.length)view.addDodges(fog.seenEvents(game.state.dodges,game.state,'t'));
      if(game.state.casts.length)view.addCasts(fog.seenEvents(game.state.casts,game.state,'target'),game.state,heroId);
    }
    sound.update(game.state,view.audioFocus(game.state,heroId,crewInput.selected()));topBar.observe();
  });
  // Input publication is small and independent of render cadence. Movement is
  // latest-value; discrete commands stay ordered and are consumed exactly once.
  const inputTimer=setInterval(()=>simClient.input({movement:moveCommand(heroId),commands:pending.splice(0),
    paused,map:gameMap.isOpen(),selected:[...crewInput.selected(),crewInput.looked?.(),crewInput.tabbed?.()].filter(Boolean)}),50);
  addEventListener('pagehide',()=>clearInterval(inputTimer),{once:true});
  view.renderer.setAnimationLoop(() => {
    fps.frame();
    presentation.sync(gameMap.isOpen() || simClient.map);
    const now = performance.now() / 1000;
    const dt = Math.max(0, Math.min(now - last, 1.0));
    last = now;
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
        const a = game.state.entities[heroId]?.place === 'world' ? null : raidOnMe(), el = $('raidalarm');   // quiet on the island (Tim 2026-11-06): the lieutenant defends
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
      const stablePrompt = !door && !innerDoor && !knockable && stableMenu.at() && !stableMenu.isOpen();
      const travel = !door && !innerDoor && !knockable && !stablePrompt && stationMenu.at() && !stationMenu.isOpen();
      const lamp = !door && !travel && game.stealth.snuffable(game.state.entities[heroId]), left = lamp ? game.stealth.snuffsLeft(game.state.entities[heroId].owner) : 0;
      $('prompt').textContent = knockable ? 'Space  Knock down the War Lantern' : shut && !shut.ok ? shut.why : door ? (door.menu === 'rail_station' && stationMenu.trainPrompt()) || `Space  ${door.gate && siteMenu.wanted() ? 'The island gate: walk out or ride' : door.label}`
        : innerDoor ? `Space  ${game.state.interiorDoors[innerDoor.id] ? 'Close' : 'Open'} sliding door`
        : stablePrompt ? 'Space  Stable: buy horses, rickshaws, omnibuses'
        : travel ? (stationMenu.riding() ? 'Space  Skip to the station' : stationMenu.trainPrompt() || 'Space  Station: trains, track, or drive back to the gate')
        : lamp ? (game.state.entities[heroId].snuffing ? 'Snuffing the lantern…' : left ? `Space  Snuff the lantern (${left} left tonight)` : 'No more lanterns tonight') : '';
      $('prompt').hidden = !door && !innerDoor && !knockable && !lamp && !travel && !stablePrompt;
      stealthBadge.update();
      characterPanel.update(); hqStash.update(); shop.update(); lootNotice.update();
      hireMenu.update(); foundButton.update(); updateSpotHover();
      { const towns = drawableTowns(game.state.frontier, game.state.entities[heroId]?.owner), sig = townSignature(towns);   // E5: founded towns follow their records
        if (sig !== townSig) { townSig = sig; view.setTowns(townProps(towns, simOptions.frontier?.townArt || {}, simOptions.frontier?.townLights || {})); }
        if (simOptions.frontier) { townGrowthFx ||= createTownGrowthFx({ view, data: simOptions.frontier }); townGrowthFx.update(towns, game.state.tick, game.state.entities[heroId]?.place === 'world'); } }   // B7 growth effects
      clinicMenu.update();
      policeMenu.update();
      landOfficeMenu.update(); lieutenantTalk.update(); surveyorTalk.update(); stationMenu.update(); stableMenu.update(); vehiclesPanel?.update(); siteMenu.update();
      contractMenu.update();
      if (deploymentPanel.isOpen() && !gameMap.isOpen()) deploymentPanel.close();   // closing the map closes its docked menu
      deploymentPanel.update();
      lieutenantPanel.update();
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
    const edge = !hudLayout.isEditing() && !gameSettings.isOpen() && !characterPanel.isOpen() && !hqStash.isOpen() && !shop.isOpen() && !gameMap.isOpen() && !deploymentPanel.isOpen() && view.isPanned() ? edgeAxes() : { right: 0, up: 0 };
    view.pan(Math.max(-1, Math.min(1, pan.right + edge.right)), Math.max(-1, Math.min(1, pan.up + edge.up)), dt);
    $('snap').hidden = !view.isPanned();
    fog.update(dt);
    // through the island gate (W3.5): a one-second fade from black
    { const place = game.state.entities[heroId]?.place;
      if (place !== gatePlace) { if (gatePlace && (place === 'world' || gatePlace === 'world')) { const f = $('gatefade'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); } gatePlace = place; } }
    presentation.measure('world',()=>view.render(withWorkerPresentations(fog.seen(game.state),frontier,{...view.audioFocus(game.state,heroId),owner:game.state.entities[heroId]?.owner}), prev, clock.alpha(), dt, now, heroId));
    crewInput.drawMarkers($('lock'));
    unitFrames.updateHover(mouse, document.elementFromPoint(mouse.x, mouse.y) === $('view'));
    frontierBuildUI?.update();
    { hoverLamp = lampAt(); const el = $('snuffhint'), h = game.state.entities[heroId];
      el.hidden = !hoverLamp;
      if (hoverLamp) { const n = game.stealth.snuffsLeft(h.owner), t = n ? `Snuff (${n} left tonight)` : 'No snuffs left tonight';
        if (el.textContent !== t) el.textContent = t; el.style.left = `${mouse.x + 16}px`; el.style.top = `${mouse.y - 8}px`; } }
    officeHint(now * 1000); goalCard.update(now * 1000);   // both throttle in ms (now is in seconds here)
    minimap.update();
    }else{
      $('snuffhint').hidden=true;
      frontierBuildUI?.update();
      view.updateCamera(game.state, heroId, dt);   // live map footprint; scene painting stays suspended
      presentation.measure('map',()=>gameMap.update());
    }
    if(!presentation.map){bar.update(game.state.tick - 1 + clock.alpha());crewBar.update();}
    selectionDock.update();
    warLantern.update();utilityMenu.update();
    hudLayout.update();
  });
}

start().catch(e => { console.error(e); status(`Could not start: ${e.message}`); });
