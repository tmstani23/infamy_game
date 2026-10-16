// Wires the game together: load data, run the rules at a fixed tick, draw every frame.
import { createGame, TICK_RATE } from './sim/game.js';
import { generateRoom } from './sim/generate.js';
import { createView } from './render/view.js';
import { onKey, moveCommand } from './input.js';
import { createHireMenu } from './hire_menu.js';
import { createCrewInput } from './crew_input.js';

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
  const [district, catalog, cutouts, interiors, parts, recipes, units] = await Promise.all([
    getJSON(`data/${params.get('district') || 'waterfront'}.json`), getJSON('data/art.json'),
    getJSON('art/cutouts.json'), getJSON('data/interiors.json'), getJSON('data/interior_parts.json'),
    getJSON('data/room_recipes.json'), getJSON('data/units.json')]);

  // ?room=gambling_den&seed=3 swaps in a generated room and starts you inside it
  const tryRoom = params.get('room');
  if (tryRoom) {
    const seed = Number(params.get('seed')) || 1;
    const g = generateRoom(tryRoom, seed, recipes, parts);
    if (g.problems.length) console.warn(`Generated ${tryRoom} has problems:\n  ${g.problems.join('\n  ')}`);
    for (const b of district.buildings) if ((b.interior?.type || b.interior) === tryRoom) b.interior = { type: tryRoom, seed };
  }

  // Single player runs the rules here. In multiplayer the server runs them instead.
  const game = createGame({ district, catalog, cutouts, interiors, parts, recipes, units });
  game.clans.addClan('player', { name: 'Your clan' });
  const inRoom = tryRoom && game.rooms.find(r => r.name === tryRoom);
  const [hx, hz] = inRoom ? [inRoom.spawn.x, inRoom.spawn.z] : district.spawns.hero;
  const heroId = game.spawn('hero', 'ronin', Number(params.get('x')) || hx, Number(params.get('z')) || hz,
    { owner: 'player', dir: Number(params.get('dir')) || 0, ...(inRoom ? { place: inRoom.name } : {}) });

  let view;
  try {
    view = await createView({
      canvas: $('view'), district, catalog, parts, scenery: game.scenery, rooms: game.rooms, doors: game.doors,
      zoom: Number(params.get('zoom')) || undefined, night: params.get('night') === '1', debug: params.get('debug') === '1',
    });
  } catch (e) {
    status('This browser could not start WebGL, which the game needs.');
    throw e;
  }

  const label = () => { $('daynight').textContent = view.isNight() ? 'Day (N)' : 'Night (N)'; document.body.classList.toggle('night', view.isNight()); };
  const toggleNight = () => { view.toggleNight(); label(); };
  onKey('KeyN', toggleNight);
  $('daynight').addEventListener('click', e => { toggleNight(); e.currentTarget.blur(); });
  label();
  onKey('F3', () => view.toggleDebug());
  const pending = [];
  onKey(['KeyE', 'Enter'], () => pending.push({ id: heroId, type: 'use' }));
  onKey(['Equal', 'NumpadAdd'], () => view.zoomBy(1.1));
  onKey(['Minus', 'NumpadSubtract'], () => view.zoomBy(0.9));
  addEventListener('wheel', e => view.zoomBy(e.deltaY > 0 ? 0.9 : 1.1), { passive: true });

  // Hire menu: only reads the state and sends 'hire' commands, like a bot would
  const hireMenu = createHireMenu({ panel: $('hire'), money: $('money'), game, units, heroId, send: c => pending.push(c) });
  onKey('KeyH', () => hireMenu.toggle());
  // Crew: click / drag to select, right-click to move (Ctrl = station), right-click the hero to follow
  const crewInput = createCrewInput({ game, view, heroId, send: c => pending.push(c), box: $('selbox') });
  onKey('KeyC', () => crewInput.selectAll());
  onKey('KeyV', () => crewInput.followMe());
  onKey('Escape', () => { hireMenu.close(); crewInput.clear(); });
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].forEach((k, i) => onKey(k, () => hireMenu.pick(i)));
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
      acc -= tick;
      const door = game.doorNear(heroId);
      $('prompt').textContent = door ? `E  ${door.label}` : '';
      $('prompt').hidden = !door;
      hireMenu.update();
      crewInput.update();
    }
    view.render(game.state, prev, acc / tick, dt, now, heroId);
  });
}

start().catch(e => { console.error(e); status(`Could not start: ${e.message}`); });
