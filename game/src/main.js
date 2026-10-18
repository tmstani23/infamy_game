// Wires the game together: load data, run the rules at a fixed tick, draw every frame.
import { createGame, TICK_RATE } from './sim/game.js';
import { generateRoom } from './sim/generate.js';
import { createView } from './render/view.js';
import { onKey, moveCommand, panAxes } from './input.js';
import { createHireMenu } from './hire_menu.js';
import { createClinicMenu } from './clinic_menu.js';
import { createPoliceMenu } from './police_menu.js';
import { createHeatBadge } from './heat_badge.js';
import { createFps } from './fps.js';
import { createRyoBadge } from './ryo_badge.js';
import { createCrewInput } from './crew_input.js';
import { createActionBar } from './action_bar.js';
import { createSelectionPanel, unitWhere } from './selection_panel.js';
import { createBuildingPanel } from './building_panel.js';
import { createSound } from './render/sound.js';
import { createFog } from './render/fog.js';
import { createMinimap } from './minimap.js';
import { createHudLayout } from './hud_layout.js';

const $ = id => document.getElementById(id);
const status = msg => { $('loading').textContent = msg; };
const params = new URLSearchParams(location.search);
const getJSON = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load ${url}`);
  return r.json();
};

async function start() {
  status('Loading the district…');
  const [district, catalog, cutouts, interiors, parts, recipes, units, civilians, bandits, buildingInfo, police] = await Promise.all([
    getJSON(`data/${params.get('district') || 'waterfront'}.json`), getJSON('data/art.json'),
    getJSON('art/cutouts.json'), getJSON('data/interiors.json'), getJSON('data/interior_parts.json'),
    getJSON('data/room_recipes.json'), getJSON('data/units.json'), getJSON('data/civilians.json'), getJSON('data/bandits.json'), getJSON('data/buildings.json'), getJSON('data/police.json')]);

  // ?room=gambling_den&seed=3 swaps in a generated room and starts you inside it
  const tryRoom = params.get('room');
  if (tryRoom) {
    const seed = Number(params.get('seed')) || 1;
    const g = generateRoom(tryRoom, seed, recipes, parts);
    if (g.problems.length) console.warn(`Generated ${tryRoom} has problems:\n  ${g.problems.join('\n  ')}`);
    for (const b of district.buildings) if ((b.interior?.type || b.interior) === tryRoom) b.interior = { type: tryRoom, seed };
  }

  // Single player runs the rules here. In multiplayer the server runs them instead.
  const game = createGame({ district, catalog, cutouts, interiors, parts, recipes, units, civilians, bandits, police });
  game.clans.addClan('player', { name: 'Your clan' });
  const inRoom = tryRoom && game.rooms.find(r => r.name === tryRoom);
  const [hx, hz] = inRoom ? [inRoom.spawn.x, inRoom.spawn.z] : district.spawns.hero;
  const heroId = game.spawn('hero', 'ronin', Number(params.get('x')) || hx, Number(params.get('z')) || hz,
    { owner: 'player', home: district.spawns.hero, dir: Number(params.get('dir')) || 0, ...(inRoom ? { place: inRoom.name } : {}) });

  // A few rival thugs guard the gambling den so there is something to fight (?enemies=0 turns them off).
  // Stand-in until the rival bot clan is built.
  const enemies = params.has('enemies') ? Number(params.get('enemies')) : 3;
  const den = Object.values(game.state.businesses).find(b => b.kind === 'gambling_den');
  if (enemies > 0 && den) {
    game.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
    for (let i = 0; i < enemies; i++) {
      const x = den.door[0] - 1.2 + i * 1.2, z = den.door[1] + 4;
      game.spawn('thug', 'thug', x, z, { owner: 'kuroda', order: { kind: 'station', x, z } });
    }
  }

  // Townsfolk walking the streets (?civilians=0 turns them off)
  if (params.get('civilians') !== '0') game.civilians.populate();

  let view;
  try {
    view = await createView({
      canvas: $('view'), fxLayer: $('fx'), district, catalog, parts, scenery: game.scenery, rooms: game.rooms, doors: game.doors,
      zoom: Number(params.get('zoom')) || undefined, night: params.get('night') === '1', debug: params.get('debug') === '1',
    });
  } catch (e) {
    status('This browser could not start WebGL, which the game needs.');
    throw e;
  }

  // Fog of war: the screen shows only what your clan can see (?fog=0 turns it off)
  const fog = createFog({ vision: game.vision, clan: 'player', on: params.get('fog') !== '0' });

  const label = () => { $('daynight').textContent = view.isNight() ? 'Day (N)' : 'Night (N)'; document.body.classList.toggle('night', view.isNight()); };
  // Day and night belong to the sim (townsfolk follow it): N sends a 'time' command and
  // the screen follows the state after each tick
  const pending = [];
  const toggleNight = () => pending.push({ type: 'time' });
  if (params.get('night') === '1') pending.push({ type: 'time', night: true });
  onKey('KeyN', toggleNight);
  $('daynight').addEventListener('click', e => { toggleNight(); e.currentTarget.blur(); });
  label();
  onKey('F3', () => view.toggleDebug());
  // Space at a door: go through it, or at the clinic's / police box's / HQ's ring open its menu (no interior)
  onKey(['Space', 'Enter'], () => {
    const menu = game.doorNear(heroId)?.menu;
    if (menu === 'clinic') clinicMenu.toggle();
    else if (menu === 'police_box' || menu === 'police_hq') policeMenu.toggle();
    else pending.push({ id: heroId, type: 'use', units: crewInput.selected() });   // selected crew come in too
  });
  // Hero abilities aim at the mouse point on the ground
  let mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  addEventListener('mousemove', e => { mouse = { x: e.clientX, y: e.clientY }; });
  for (const slot of ['Q', 'E', 'R', 'F']) onKey(`Key${slot}`, () => {
    const p = view.screenToGround(mouse.x, mouse.y);
    pending.push({ id: heroId, type: 'ability', slot, ...(p ? { x: p.x, z: p.z } : {}) });
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
  const clinicMenu = createClinicMenu({ panel: $('clinic'), game, heroId, send: c => pending.push(c) });
  const policeMenu = createPoliceMenu({ panel: $('police'), game, heroId, send: c => pending.push(c) });
  const heatBadge = createHeatBadge({ root: $('heat'), game, heroId });
  const ryoBadge = createRyoBadge({ root: $('ryo'), game, heroId });
  // Crew: click / drag to select, right-click to move (Ctrl = station), right-click the hero to follow
  const crewInput = createCrewInput({ game, view, heroId, send: c => pending.push(c), box: $('selbox') });
  onKey('KeyC', () => crewInput.selectAll());
  onKey('KeyV', () => crewInput.followMe());
  onKey('KeyX', () => crewInput.armAttackMove());
  onKey('Tab', () => crewInput.tab());
  onKey('KeyT', () => crewInput.crewAttack());
  onKey('KeyG', () => crewInput.healSelected());
  onKey('Escape', () => { hireMenu.close(); clinicMenu.close(); policeMenu.close(); crewInput.clear(); $('controls').hidden = true; });
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9']
    .forEach((k, i) => onKey(k, () => clinicMenu.isOpen() ? clinicMenu.pick(i) : policeMenu.isOpen() ? policeMenu.pick(i) : hireMenu.pick(i)));
  const sound = createSound();
  onKey('KeyM', () => sound.toggleMute());
  const fps = createFps();
  onKey('KeyP', () => fps.toggle());
  // Controls panel: the button or ? opens it, Esc closes it
  const toggleControls = () => { $('controls').hidden = !$('controls').hidden; };
  onKey('Slash', toggleControls);
  $('ctlbtn').addEventListener('click', e => { toggleControls(); e.currentTarget.blur(); });
  const where = e => unitWhere(e, game.state, district, buildingInfo);   // "Teahouse · Waterfront"
  // double-click a crew name: the camera jumps to him, or to the building's door if he is
  // inside one the hero isn't in
  const jump = u => {
    const door = u.place !== 'street' && u.place !== game.state.entities[heroId]?.place && game.doors.find(d => d.to && d.place === u.place);
    if (door) view.jumpTo(door.x, door.z); else view.jumpTo(u.x, u.z);
  };
  const bar = createActionBar({ root: $('bar'), game, units, heroId, tickRate: TICK_RATE, crewInput, where, jump });
  const selPanel = createSelectionPanel({ root: $('selpanel'), game, units, catalog, crewInput, where });
  const bldPanel = createBuildingPanel({ root: $('bldpanel'), game, district, info: buildingInfo, units, scenery: game.scenery, crewInput, clan: 'player' });
  const minimap = createMinimap({ canvas: $('minimap'), game, district, view, fog, heroId, selected: () => crewInput.selected(), send: c => pending.push(c) });
  // every HUD panel can be unlocked (its lock icon), moved and resized; Reset layout in the Controls panel.
  // Positions and sizes live in data/ui_layout.json (written through server.mjs)
  const uiFile = await fetch('data/ui_layout.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));   // saved HUD layout
  const hudLayout = createHudLayout({ fromFile: uiFile.panels });
  $('layoutreset').addEventListener('click', e => { hudLayout.reset(); e.currentTarget.blur(); });
  window.infamy = { game, view };   // handy from the browser console
  $('loading').remove();

  // Fixed-tick loop: the rules advance TICK_RATE times a second, the screen
  // draws as often as it can and slides units between the last two ticks.
  const tick = 1 / TICK_RATE;
  let prev = structuredClone(game.state);
  let acc = 0, last = performance.now() / 1000;
  view.renderer.setAnimationLoop(() => {
    fps.frame();
    const now = performance.now() / 1000;
    const dt = Math.min(now - last, 0.1);
    last = now;
    acc += dt;
    while (acc >= tick) {
      prev = structuredClone(game.state);
      game.step([moveCommand(heroId), ...pending.splice(0)]);
      if (game.state.night !== view.isNight()) { view.toggleNight(); label(); }
      // the hunters lost your boss (sim/police.js): a short notice at the top
      if (game.state.policeNews.some(n => n.kind === 'lost' && n.clan === game.state.entities[heroId]?.owner)) {
        const el = $('lostcops');
        el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      }
      if (game.state.hits.length) view.addHits(fog.seenEvents(game.state.hits, game.state, 't'), game.state, heroId);
      if (game.state.casts.length) view.addCasts(fog.seenEvents(game.state.casts, game.state, 'target'), game.state, heroId);
      sound.update(game.state, heroId);
      acc -= tick;
      const door = game.doorNear(heroId);
      $('prompt').textContent = door ? `Space  ${door.label}` : '';
      $('prompt').hidden = !door;
      hireMenu.update();
      clinicMenu.update();
      policeMenu.update();
      // in jail (sim/police.js): big red banner with the time left
      const jailed = game.state.entities[heroId]?.jailed, jailEl = $('jail');
      jailEl.hidden = !jailed;
      if (jailed) { const t = `IN JAIL<small>out in ${Math.max(0, Math.ceil((jailed.until - game.state.tick) / TICK_RATE))}s</small>`; if (jailEl.innerHTML !== t) jailEl.innerHTML = t; }
      heatBadge.update();
      ryoBadge.update();
      crewInput.update();
      selPanel.update();
      bldPanel.update();
    }
    const pan = panAxes();
    view.pan(pan.right, pan.up, dt);
    $('snap').hidden = !view.isPanned();
    fog.update(dt);
    view.render(fog.seen(game.state), prev, acc / tick, dt, now, heroId);
    crewInput.drawMarkers($('lock'));
    minimap.update();
    bar.update(game.state.tick - 1 + acc / tick);
    hudLayout.update();
  });
}

start().catch(e => { console.error(e); status(`Could not start: ${e.message}`); });
