// Wires the game together: load data, run the rules at a fixed tick, draw every frame.
import { createGame, TICK_RATE } from './sim/game.js';
import { generateRoom } from './sim/generate.js';
import { createView } from './render/view.js';
import { onKey, moveCommand, panAxes } from './input.js';
import { createHireMenu } from './hire_menu.js';
import { createClinicMenu } from './clinic_menu.js';
import { createHeatBadge } from './heat_badge.js';
import { createCrewInput } from './crew_input.js';
import { createActionBar } from './action_bar.js';
import { createSelectionPanel } from './selection_panel.js';
import { createSound } from './render/sound.js';

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
  const [district, catalog, cutouts, interiors, parts, recipes, units, civilians] = await Promise.all([
    getJSON(`data/${params.get('district') || 'waterfront'}.json`), getJSON('data/art.json'),
    getJSON('art/cutouts.json'), getJSON('data/interiors.json'), getJSON('data/interior_parts.json'),
    getJSON('data/room_recipes.json'), getJSON('data/units.json'), getJSON('data/civilians.json')]);

  // ?room=gambling_den&seed=3 swaps in a generated room and starts you inside it
  const tryRoom = params.get('room');
  if (tryRoom) {
    const seed = Number(params.get('seed')) || 1;
    const g = generateRoom(tryRoom, seed, recipes, parts);
    if (g.problems.length) console.warn(`Generated ${tryRoom} has problems:\n  ${g.problems.join('\n  ')}`);
    for (const b of district.buildings) if ((b.interior?.type || b.interior) === tryRoom) b.interior = { type: tryRoom, seed };
  }

  // Single player runs the rules here. In multiplayer the server runs them instead.
  const game = createGame({ district, catalog, cutouts, interiors, parts, recipes, units, civilians });
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
  // Space at a door: go through it, or at the clinic's ring open the clinic menu (no interior)
  onKey(['Space', 'Enter'], () => {
    if (game.doorNear(heroId)?.menu === 'clinic') clinicMenu.toggle();
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
  const heatBadge = createHeatBadge({ root: $('heat'), game, heroId });
  // Crew: click / drag to select, right-click to move (Ctrl = station), right-click the hero to follow
  const crewInput = createCrewInput({ game, view, heroId, send: c => pending.push(c), box: $('selbox') });
  onKey('KeyC', () => crewInput.selectAll());
  onKey('KeyV', () => crewInput.followMe());
  onKey('KeyX', () => crewInput.armAttackMove());
  onKey('KeyG', () => crewInput.healSelected());
  onKey('Escape', () => { hireMenu.close(); clinicMenu.close(); crewInput.clear(); });
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9']
    .forEach((k, i) => onKey(k, () => clinicMenu.isOpen() ? clinicMenu.pick(i) : hireMenu.pick(i)));
  const sound = createSound();
  onKey('KeyM', () => sound.toggleMute());
  const bar = createActionBar({ root: $('bar'), game, units, heroId, tickRate: TICK_RATE, crewInput });
  const selPanel = createSelectionPanel({ root: $('selpanel'), game, units, catalog, crewInput });
  window.infamy = { game, view };   // handy from the browser console
  $('loading').remove();

  // Fixed-tick loop: the rules advance TICK_RATE times a second, the screen
  // draws as often as it can and slides units between the last two ticks.
  const tick = 1 / TICK_RATE;
  let prev = structuredClone(game.state);
  let acc = 0, last = performance.now() / 1000;
  view.renderer.setAnimationLoop(() => {
    const now = performance.now() / 1000;
    const dt = Math.min(now - last, 0.1);
    last = now;
    acc += dt;
    while (acc >= tick) {
      prev = structuredClone(game.state);
      game.step([moveCommand(heroId), ...pending.splice(0)]);
      if (game.state.night !== view.isNight()) { view.toggleNight(); label(); }
      if (game.state.hits.length) view.addHits(game.state.hits, game.state, heroId);
      if (game.state.casts.length) view.addCasts(game.state.casts, game.state, heroId);
      sound.update(game.state, heroId);
      acc -= tick;
      const door = game.doorNear(heroId);
      $('prompt').textContent = door ? `Space  ${door.label}` : '';
      $('prompt').hidden = !door;
      hireMenu.update();
      clinicMenu.update();
      heatBadge.update();
      crewInput.update();
      selPanel.update();
    }
    const pan = panAxes();
    view.pan(pan.right, pan.up, dt);
    $('snap').hidden = !view.isPanned();
    view.render(game.state, prev, acc / tick, dt, now, heroId);
    bar.update(game.state.tick - 1 + acc / tick);
  });
}

start().catch(e => { console.error(e); status(`Could not start: ${e.message}`); });
