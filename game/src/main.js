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
import { drawCrest } from './render/banners.js';
import { createCrewInput } from './crew_input.js';
import { createActionBar } from './action_bar.js';
import { createCrewBar } from './crew_bar.js';
import { createSelectionPanel, unitWhere } from './selection_panel.js';
import { createUnitFrames } from './unit_frames.js';
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
  const [district, catalog, cutouts, interiors, parts, recipes, unitsFile, civilians, bandits, buildingInfo, police, settings] = await Promise.all([
    getJSON(`data/${params.get('district') || 'port_town'}.json`), getJSON('data/art.json'),
    getJSON('art/cutouts.json'), getJSON('data/interiors.json'), getJSON('data/interior_parts.json'),
    getJSON('data/room_recipes.json'), getJSON('data/units.json'), getJSON('data/civilians.json'), getJSON('data/bandits.json'), getJSON('data/buildings.json'), getJSON('data/police.json'), getJSON('data/settings.json')]);

  // ?room=gambling_den&seed=3 swaps in a generated room and starts you inside it
  const tryRoom = params.get('room');
  if (tryRoom) {
    const seed = Number(params.get('seed')) || 1;
    const g = generateRoom(tryRoom, seed, recipes, parts);
    if (g.problems.length) console.warn(`Generated ${tryRoom} has problems:\n  ${g.problems.join('\n  ')}`);
    for (const b of district.buildings) if ((b.interior?.type || b.interior) === tryRoom) b.interior = { type: tryRoom, seed };
  }

  // Single player runs the rules here. In multiplayer the server runs them instead.
  // data/settings.json (the numbers picked before a game) is laid over the detail files inside the sim
  const game = createGame({ district, catalog, cutouts, interiors, parts, recipes, units: unitsFile, civilians, bandits, police, settings });
  const units = game.settings.units;   // hire prices etc. as the settings made them
  game.clans.addClan('player', { name: 'Your clan' });
  const inRoom = tryRoom && game.rooms.find(r => r.name === tryRoom);
  const [hx, hz] = inRoom ? [inRoom.spawn.x, inRoom.spawn.z] : district.spawns.hero;
  const heroId = game.spawn('hero', 'ronin', Number(params.get('x')) || hx, Number(params.get('z')) || hz,
    { owner: 'player', home: district.spawns.hero, dir: Number(params.get('dir')) || 0, ...(inRoom ? { place: inRoom.name } : {}) });

  // Test only: ?enemies=3 puts that many rival thugs at the gambling den (none by default, Tim 2026-10-19).
  // Stand-in until the rival bot clan is built.
  const enemies = params.has('enemies') ? Number(params.get('enemies')) : 0;
  const den = Object.values(game.state.businesses).find(b => b.kind === 'gambling_den');
  if (enemies > 0 && den) {
    game.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
    for (let i = 0; i < enemies; i++) {
      const x = den.door[0] - 1.2 + i * 1.2, z = den.door[1] + 4;
      game.spawn('thug', 'thug', x, z, { owner: 'kuroda', order: { kind: 'station', x, z } });
    }
  }

  // Test only: ?rival=gambling_den (or teahouse / warehouse; 'den' works too) gives a stand-in rival clan
  // that business with its guards, to try War Lantern raids until the rival bot clan exists
  const rivalKind = params.get('rival') === 'den' ? 'gambling_den' : params.get('rival');
  const rivalBiz = rivalKind && Object.values(game.state.businesses).find(b => b.kind === rivalKind);
  if (rivalBiz) {
    if (!game.state.clans.kuroda) game.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
    game.clans.setOwner(rivalBiz.id, 'kuroda');
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
  if (params.get('night') === '1') pending.push({ type: 'time', night: true });
  // Test only: ?raidme=den (or teahouse / warehouse) makes that business yours and gives you 3 crew, then at night a stand-in
  // Kuroda boss and 3 thugs plant a War Lantern at it, to try defending until the rival bot clan exists
  const raidKind = params.get('raidme') === 'den' ? 'gambling_den' : params.get('raidme');
  const raidBiz = raidKind && Object.values(game.state.businesses).find(b => b.kind === raidKind && b.room);
  if (raidBiz) {
    if (!game.state.clans.kuroda) game.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
    game.clans.setOwner(raidBiz.id, 'player');
    game.state.clans.kuroda.lanterns = 1;
    const boss = game.spawn('hero', 'rival_yakuza', raidBiz.ring[0], raidBiz.ring[1], { owner: 'kuroda' });
    for (let i = 0; i < 3; i++) {
      const [x, z] = game.nav.nearestFree(raidBiz.ring[0] + (i - 1) * 1.1, raidBiz.ring[1] + 1.2) || raidBiz.ring;
      game.spawn('thug', 'thug', x, z, { owner: 'kuroda', order: { kind: 'station', x, z } });
    }
    // and you start with 3 crew following you
    const me = game.state.entities[heroId];
    for (let i = 0; i < 3; i++) {
      const [x, z] = game.nav.nearestFree(me.x + (i - 1) * 1.1, me.z + 1.2) || [me.x, me.z];
      game.spawn('thug', 'thug', x, z, { owner: 'player', order: { kind: 'follow', target: heroId } });
    }
    pending.push({ type: 'time', night: true }, { id: boss, type: 'business', action: 'raid', business: raidBiz.id });
  }
  onKey('KeyN', toggleNight);
  $('daynight').addEventListener('click', e => { toggleNight(); e.currentTarget.blur(); });
  label();
  onKey('F3', () => view.toggleDebug());
  // Space at a door: go through it, or at the clinic's / police box's / HQ's ring open its menu (no interior)
  onKey(['Space', 'Enter'], () => {
    // by a raider's War Lantern at your business: knock it down (checkpoint 5)
    const lantern = raidOnMe(true);
    if (lantern) { pending.push({ id: heroId, type: 'business', action: 'knock', business: lantern.business }); return; }
    const menu = game.doorNear(heroId)?.menu;
    if (menu === 'clinic') clinicMenu.toggle();
    else if (menu === 'police_box' || menu === 'police_hq') policeMenu.toggle();
    else pending.push({ id: heroId, type: 'use', units: crewInput.selected() });   // selected crew come in too
  });
  // a rival's raid on one of your businesses (the newest); near = only one whose lantern the hero can knock down now
  const raidOnMe = (near = false) => Object.values(game.state.attacks || {})
    .filter(a => a.mode === 'raid' && a.defender === game.state.entities[heroId]?.owner && (!near || game.businesses.canKnock(heroId, a.business).ok)).pop();
  const alarmSeen = new Set();
  $('raidalarm').addEventListener('dblclick', () => { const a = raidOnMe(); if (a) view.jumpTo(a.lantern.x, a.lantern.z); });
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
  // your clan's crest and name in the top bar (picked at the start later, Tim 2026-10-19)
  {
    const clan = game.state.clans.player, cv = $('clan').querySelector('canvas'), g = cv.getContext('2d');
    g.fillStyle = clan.color; g.beginPath(); g.arc(28, 28, 26, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d4aa5a'; g.lineWidth = 2; g.stroke();
    drawCrest(g, 28, 28, 15);
    $('clan').querySelector('em').textContent = clan.name;
  }
  // Crew: click / drag to select, right-click to move (Ctrl = station), right-click the hero to follow
  const crewInput = createCrewInput({ game, view, heroId, send: c => pending.push(c), box: $('selbox') });
  onKey('KeyC', () => crewInput.selectAll());
  onKey('KeyV', () => crewInput.followMe());
  onKey('KeyX', () => crewInput.armAttackMove());
  onKey('KeyZ', () => crewInput.stopSelected());   // stop + passive until the next order (Tim 2026-10-18)
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
  const crewBar = createCrewBar({ root: $('bar'), game, heroId, crewInput });   // crew order buttons over the crew pips
  // a lone left-clicked enemy or townsperson shows in the target frame (top left), not the unit card
  const lone = ids => ids.length === 1 && game.state.entities[ids[0]]?.owner !== game.state.entities[heroId]?.owner;
  const selPanel = createSelectionPanel({ root: $('selpanel'), game, units, catalog, crewInput, where, skip: lone });
  const unitFrames = createUnitFrames({ game, units, catalog, crewInput, heroId, where, jump });   // own + target frames, top middle
  const bldPanel = createBuildingPanel({ root: $('bldpanel'), game, district, info: buildingInfo, units, scenery: game.scenery, crewInput, clan: 'player', heroId, send: c => pending.push(c) });
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
      else if (game.state.tick % TICK_RATE === 0) label();   // the clock's countdown
      // your attack on a business (sim/businesses.js): waves left, then the hold timer
      {
        const a = Object.values(game.state.attacks || {}).find(a => a.clan === game.state.entities[heroId]?.owner && a.phase !== 'over'), bar = $('attackbar');
        bar.hidden = !a;
        if (a) {
          const where = a.kind.replace(/_/g, ' ');
          bar.classList.toggle('hold', a.phase === 'hold');
          const wait = Math.ceil((a.startsAt - game.state.tick) / TICK_RATE), opens = Math.ceil((a.opensAt - game.state.tick) / TICK_RATE);
          bar.textContent = a.phase === 'warmup' ? `Raid on the ${where}: the doors open in ${opens} s`
            : wait > 0 ? `Attacking the ${where}: police arrive in ${wait} s, get inside` : a.phase === 'hold'
            ? `Hold the back room of the ${where}: ${Math.ceil(a.holdLeft / TICK_RATE)} s${a.holding ? '' : ' (stand in the gold ring)'}`
            : `Attacking the ${where}: police wave ${a.wave} of ${a.waves}`;
        }
      }
      // your business is being raided: bell once, red banner, a channel bar while knocking the lantern down
      {
        const a = raidOnMe(), el = $('raidalarm');
        el.hidden = !a;
        if (a) {
          const key = `${a.business}:${a.opensAt}`;
          if (!alarmSeen.has(key)) { alarmSeen.add(key); sound.bell(); }
          const where = a.kind.replace(/_/g, ' '), who = game.state.clans[a.clan]?.name || 'A rival clan';
          const s = Math.ceil((a.phase === 'warmup' ? a.opensAt - game.state.tick : a.holdLeft) / TICK_RATE);
          const b = `Your ${where} is being raided!`, t = a.phase === 'warmup' ? `${who} planted a War Lantern · doors open in ${s} s`
            : `${who} ${a.holding ? 'hold' : 'fight for'} the back room · ${s} s left${a.holding ? '' : ' (held off)'}`;
          if (el.querySelector('b').textContent !== b) el.querySelector('b').textContent = b;
          if (el.querySelector('span').textContent !== t) el.querySelector('span').textContent = t;
        }
        const k = a?.knock?.by === heroId ? a.knock : null, kb = $('knockbar');
        kb.hidden = !k;
        if (k) kb.querySelector('i').style.width = `${Math.min(100, (game.state.tick - k.start) / ((game.businesses.raidRules.knockSeconds || 4) * TICK_RATE) * 100)}%`;
      }
      { const n = game.state.clans.player?.lanterns || 0, el = $('lanterns'); el.hidden = !n; el.textContent = `War Lantern ${n}`; }
      // the hunters lost your boss (sim/police.js): a short notice at the top
      if (game.state.policeNews.some(n => n.kind === 'lost' && n.clan === game.state.entities[heroId]?.owner)) {
        const el = $('lostcops');
        el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      }
      if (game.state.hits.length) view.addHits(fog.seenEvents(game.state.hits, game.state, 't'), game.state, heroId);
      if (game.state.casts.length) view.addCasts(fog.seenEvents(game.state.casts, game.state, 'target'), game.state, heroId);
      sound.update(game.state, heroId);
      acc -= tick;
      const door = game.doorNear(heroId), knockable = raidOnMe(true);
      $('prompt').textContent = knockable ? 'Space  Knock down the War Lantern' : door ? `Space  ${door.label}` : '';
      $('prompt').hidden = !door && !knockable;
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
      unitFrames.update();
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
    crewBar.update();
    hudLayout.update();
  });
}

start().catch(e => { console.error(e); status(`Could not start: ${e.message}`); });
