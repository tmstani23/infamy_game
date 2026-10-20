// Wires the game together: load data, run the rules at a fixed tick, draw every frame.
import { createGame, TICK_RATE } from './sim/game.js';
import { createView } from './render/view.js';
import { onKey, moveCommand, panAxes, edgeAxes } from './input.js';
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
import { createBot } from './sim/bot.js';
import { DEV, TEST } from './test_params.js';
import { createMinimap } from './minimap.js';
import { createGameMap } from './game_map.js';
import { createHudLayout } from './hud_layout.js';

const $ = id => document.getElementById(id);
const status = msg => { $('loading').textContent = msg; };
const getJSON = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load ${url}`);
  return r.json();
};

async function start() {
  status('Loading the district…');
  const [district, catalog, cutouts, interiors, parts, recipes, unitsFile, civilians, bandits, buildingInfo, police, settings, bots] = await Promise.all([
    getJSON('data/port_town.json'), getJSON('data/art.json'),
    getJSON('art/cutouts.json'), getJSON('data/interiors.json'), getJSON('data/interior_parts.json'),
    getJSON('data/room_recipes.json'), getJSON('data/units.json'), getJSON('data/civilians.json'), getJSON('data/bandits.json'), getJSON('data/buildings.json'), getJSON('data/police.json'), getJSON('data/settings.json'), getJSON('data/bots.json')]);

  // Single player runs the rules here. In multiplayer the server runs them instead.
  // data/settings.json (the numbers picked before a game) is laid over the detail files inside the sim
  const game = createGame({ district, catalog, cutouts, interiors, parts, recipes, units: unitsFile, civilians, bandits, police, settings });
  const units = game.settings.units;   // hire prices etc. as the settings made them
  game.clans.addClan('player', { name: 'Your clan' });
  const [hx, hz] = district.spawns.hero;
  const heroId = game.spawn('hero', 'ronin', hx, hz, { owner: 'player', home: district.spawns.hero, dir: 0 });
  // ?test=bot (test_params.js): you start richer and with a business the bot can raid
  if (TEST.playerRyo !== undefined) game.state.clans.player.ryo = TEST.playerRyo;
  const startBiz = TEST.playerOwns && Object.values(game.state.businesses).find(b => b.kind === TEST.playerOwns);
  if (startBiz) game.clans.setOwner(startBiz.id, 'player');

  // Townsfolk walking the streets
  game.civilians.populate();

  // The rival bot clan (docs/rival_bot_plan.md): its boss starts at its hideout (the izakaya) and
  // plays through the same commands as you (sim/bot.js); ?test=bot gives it 5000 ryo
  let bot = null;
  {
    const bc = bots.clan;
    if (!game.state.clans[bc.id]) game.clans.addClan(bc.id, { name: bc.name, bot: true });
    if (TEST.botRyo !== undefined) game.state.clans[bc.id].ryo = TEST.botRyo;
    const home = Object.values(game.state.businesses).find(b => b.hideout === bc.id);
    if (home) {
      const boss = game.spawn('hero', bc.boss, home.ring[0], home.ring[1], { owner: bc.id, home: home.ring });
      bot = createBot(game, { clan: bc.id, hero: boss, rules: bots.levels[bots.difficulty] });
    }
  }

  let view;
  try {
    view = await createView({
      canvas: $('view'), fxLayer: $('fx'), district, catalog, parts, scenery: game.scenery, rooms: game.rooms, doors: game.doors,
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
  // big callouts at the top of the screen, queued so two at once don't overwrite each other
  const callouts = [];
  let calloutBusy = false;
  function callout(text, kind) {
    callouts.push({ text, kind });
    if (calloutBusy) return;
    const next = () => {
      const c = callouts.shift(), el = $('callout');
      if (!c) { calloutBusy = false; return; }
      calloutBusy = true;
      el.textContent = c.text; el.className = c.kind; el.hidden = false;
      void el.offsetWidth; el.classList.add('show');
      setTimeout(next, 2700);
    };
    next();
  }
  $('raidalarm').addEventListener('dblclick', () => { const a = raidOnMe(); if (a) { const p = a.lantern || a.spot; view.jumpTo(p.x, p.z); } });
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
  $('knockbar').addEventListener('click', () => crewInput.target($('knockbar').dataset.by));   // target whoever knocks down your War Lantern
  onKey('KeyT', () => crewInput.crewAttack());
  onKey('KeyL', () => crewInput.lockSelected());   // lock / unlock the selected crew (Tim 2026-10-20)
  onKey('KeyG', () => crewInput.healSelected());
  onKey('Escape', () => { hireMenu.close(); clinicMenu.close(); policeMenu.close(); crewInput.clear(); $('controls').hidden = true; gameMap.close(); });
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9']
    .forEach((k, i) => onKey(k, () => clinicMenu.isOpen() ? clinicMenu.pick(i) : policeMenu.isOpen() ? policeMenu.pick(i) : hireMenu.pick(i)));
  const sound = createSound();
  // mute: K or the button (M opens the game map, Tim 2026-10-20)
  const mute = () => { const m = sound.toggleMute(); $('mutebtn').textContent = m ? 'Unmute (K)' : 'Mute (K)'; };
  onKey('KeyK', mute);
  $('mutebtn').addEventListener('click', e => { mute(); e.currentTarget.blur(); });
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
  // the full game map (M or the button): territory, businesses, police, units, the season score (src/game_map.js)
  const gameMap = createGameMap({ root: $('gamemap'), game, district, view, fog, heroId, units, selected: () => crewInput.selected(), send: c => pending.push(c) });
  onKey('KeyM', () => gameMap.toggle());
  $('mapbtn').addEventListener('click', e => { gameMap.toggle(); e.currentTarget.blur(); });
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
    el.querySelector('.sub').textContent = `${s.cycles} days and nights · the clan with the most points wins (teahouse 1, warehouse 2, den 3)`;
    el.querySelector('.list').innerHTML = s.final.map(r => `<div class="row"><i style="background:${game.state.clans[r.clan]?.color}"></i><span>${r.clan === me ? 'You' : game.state.clans[r.clan]?.name}</span><b>${r.score}</b></div>`).join('');
    el.hidden = false;
  }
  $('seasonend').querySelector('.again').addEventListener('click', () => location.reload());
  $('seasonend').querySelector('.keep').addEventListener('click', e => { $('seasonend').hidden = true; e.currentTarget.blur(); });
  // every HUD panel can be unlocked (its lock icon), moved and resized; Reset layout in the Controls panel.
  // Positions and sizes live in data/ui_layout.json (written through server.mjs)
  const uiFile = await fetch('data/ui_layout.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));   // saved HUD layout
  const hudLayout = createHudLayout({ fromFile: uiFile.panels });
  $('layoutreset').addEventListener('click', e => { hudLayout.reset(); e.currentTarget.blur(); });
  if (DEV) window.infamy = { game, view };   // handy from the browser console
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
      game.step([moveCommand(heroId), ...pending.splice(0), ...(bot ? bot.tick() : [])]);
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
          const key = `knock:${mine?.business}:${mine?.opensAt}`;
          if (k === foe && !alarmSeen.has(key)) { alarmSeen.add(key); sound.bell(); }
        }
      }
      { const n = game.state.clans.player?.lanterns || 0, el = $('lanterns'); el.hidden = !n; el.textContent = `War Lantern ${n}`; }
      // the hunters lost your boss (sim/police.js): a short notice at the top
      if (game.state.policeNews.some(n => n.kind === 'lost' && n.clan === game.state.entities[heroId]?.owner)) {
        const el = $('lostcops');
        el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      }
      // big moments (Tim 2026-10-19): a rival boss knocked out or arrested where you can see him,
      // and a War Lantern knocked down in a raid you are in; shown one after another at the top
      for (const n of game.state.news) {
        const me = game.state.entities[heroId]?.owner, boss = game.state.clans[n.clan]?.name || 'Rival clan';
        if (n.kind === 'bossDown' && n.clan !== me && game.vision.canSee(me, game.state.entities[n.hero])) callout(`${boss} boss knocked out!`, n.by === me ? 'win' : 'news');
        if (n.kind === 'bossArrested' && n.clan !== me && game.vision.canSee(me, game.state.entities[n.hero])) callout(`${boss} boss arrested!`, 'news');
        if (n.kind === 'lanternDown' && n.defender === me) callout('War Lantern destroyed!', 'win');
        if (n.kind === 'lanternDown' && n.raider === me) callout('Your War Lantern was destroyed', 'loss');
        if (n.kind === 'backRoom' && n.state === 'taking' && n.defender === me) callout('Your back room is being taken!', 'loss');
        if (n.kind === 'backRoom' && n.state === 'contested' && (n.defender === me || n.raider === me)) callout('Back room contested!', 'news');
        if (n.kind === 'crewOut' && n.clan === me) view.flashBuilding(n.building);   // your crew stepping out
        // territory (sim/territory.js): rivals walking into your streets, quarters held whole, the season's end
        if (n.kind === 'intruder' && n.clan === me) { callout('Rivals in your territory!', 'loss'); minimap.ping(n.x, n.z); gameMap.ping(n.x, n.z); }
        if (n.kind === 'quarter' && n.clan === me) callout(`You hold the ${n.name.replace(/^The /, '')}!`, 'win');
        if (n.kind === 'quarterLost' && n.clan === me) callout(`You lost the ${n.name.replace(/^The /, '')}`, 'loss');
        if (n.kind === 'quarter' && n.clan !== me && game.territory.quarters.find(q => q.id === n.quarter)?.businesses.every(id => game.vision.grid(me).explored[game.vision.cellOf(game.state.businesses[id].x, game.state.businesses[id].z)] === 1))
          callout(`${game.state.clans[n.clan]?.name || 'A rival'} holds the ${n.name.replace(/^The /, '')}`, 'news');
        if (n.kind === 'seasonEnd') showResults();
      }
      if (game.state.hits.length) view.addHits(fog.seenEvents(game.state.hits, game.state, 't'), game.state, heroId);
      if (game.state.casts.length) view.addCasts(fog.seenEvents(game.state.casts, game.state, 'target'), game.state, heroId);
      sound.update(game.state, heroId);
      acc -= tick;
      const door = game.doorNear(heroId), knockable = raidOnMe(true);
      const shut = door && Object.values(game.state.businesses).find(b => b.room === door.place && b.hideout && b.hideout !== game.state.entities[heroId]?.owner);   // a rival's hideout: closed
      $('prompt').textContent = knockable ? 'Space  Knock down the War Lantern' : shut ? `${game.state.clans[shut.hideout]?.name || 'Rival'} hideout: no way in` : door ? `Space  ${door.label}` : '';
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
      if (game.state.tick % 10 === 0) {
        const t = scoreText(); if ($('score').innerHTML !== t) $('score').innerHTML = t;
        // hover: where each clan's points come from (sim/territory.js breakdown)
        const why = game.territory ? game.territory.standings().map(r => `${r.clan === 'player' ? 'You' : game.state.clans[r.clan]?.name}: ${game.territory.breakdown(r.clan).map(x => `${x.label} ${x.points}`).join(' + ') || 'no businesses'} = ${r.score}`).join('\n') : '';
        if ($('score').title !== why) $('score').title = why;
      }
      crewInput.update();
      selPanel.update();
      unitFrames.update();
      bldPanel.update();
    }
    const pan = panAxes();
    // the mouse at the screen edge pans too (Tim 2026-10-20): only when the camera is off the hero
    // (not in hero follow; Home goes back to it), and not with the game map open
    const edge = !gameMap.isOpen() && view.isPanned() ? edgeAxes() : { right: 0, up: 0 };
    view.pan(Math.max(-1, Math.min(1, pan.right + edge.right)), Math.max(-1, Math.min(1, pan.up + edge.up)), dt);
    $('snap').hidden = !view.isPanned();
    fog.update(dt);
    view.render(fog.seen(game.state), prev, acc / tick, dt, now, heroId);
    crewInput.drawMarkers($('lock'));
    minimap.update();
    gameMap.update();
    bar.update(game.state.tick - 1 + acc / tick);
    crewBar.update();
    hudLayout.update();
  });
}

start().catch(e => { console.error(e); status(`Could not start: ${e.message}`); });
