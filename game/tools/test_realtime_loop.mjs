import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFixedStepClock } from '../src/fixed_step_clock.js';
import { createDeploymentMapData } from '../src/deployment_map_data.js';
import { createRyoBadge } from '../src/ryo_badge.js';
import { createHeatBadge } from '../src/heat_badge.js';
import { createMinimap } from '../src/minimap.js';

for (const fps of [60, 20, 8, 5, 2]) {
  const clock = createFixedStepClock(); let ticks = 0;
  for (let i = 0; i < fps * 10; i++) clock.advance(1 / fps, () => ticks++);
  assert.equal(ticks, 200, `${fps} fps still advances 10 real seconds`);
  assert.equal(clock.diagnostics().droppedSteps, 0);
}
{
  const clock = createFixedStepClock(); let ticks = 0, events = [];
  clock.advance(.025, () => ticks++);
  clock.advance(.5, () => { ticks++; events.push(ticks); });
  assert.equal(ticks, 10); assert.equal(events.length, 10);
  assert.ok(Math.abs(clock.alpha() - .5) < 1e-8);
  clock.advance(60, () => ticks++);
  assert.equal(ticks, 20, 'extreme return stall is capped to ten steps');
  assert.equal(clock.diagnostics().droppedSteps, 10);
  assert.equal(clock.diagnostics().cappedSeconds, 59);
  assert.ok(clock.alpha() >= 0 && clock.alpha() < 1);
  clock.advance(10, () => assert.fail('paused step'), true);
  clock.advance(.025, () => ticks++);
  assert.equal(ticks, 21, 'paused frames never accumulate catch-up debt');
}
// Test the production loop wiring as well as its clock: one presentation pass,
// but all one-tick contacts, news, effects, sound and reward events are consumed.
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const loop = main.slice(main.indexOf('clock.advance(elapsed'), main.indexOf('}, paused);'));
for (const call of ['game.step(', 'gameMap.observe()', 'newsCallouts.update()', 'view.addHits(', 'view.addCasts(', 'sound.update(', 'topBar.observe()']) assert.ok(loop.includes(call), call);
for (const name of ['stealthBadge', 'characterPanel', 'hireMenu', 'clinicMenu', 'policeMenu', 'contractMenu', 'deploymentPanel', 'topBar', 'crewInput', 'selPanel', 'unitFrames', 'bldPanel', 'interiorInfo']) {
  assert.ok(!loop.includes(`${name}.update()`), `${name} paints outside catch-up`);
  assert.equal(main.split(`${name}.update()`).length - 1, 1, `${name} has one frame update`);
}
{
  let visits = 0;
  const inside = { id: 'u', owner: 'p', place: 'room', x: 9, z: 9, hp: 10, maxHp: 20, deployment: { group: 'a' } };
  const foe = { id: 'f', owner: 'r', place: 'room', type: 'thug', hp: 10 };
  const business = { get room() { visits++; return 'room'; }, ring: [1, 2] };
  const state = { tick: 0, entities: { u: inside, f: foe }, businesses: { b: business }, clans: { p: {}, r: {} },
    deployment: { sectors: [{ id: 'a' }, { id: 'b' }], sectorLimit: 3, clans: { p: { sectors: { a: { task: 'watch' }, b: { task: 'watch' } } } } } };
  const data = createDeploymentMapData({ clan: 'p', game: { state, deployment: { members: () => [inside], counts: () => ({ a: 1, b: 0 }), sectorAt: () => 'a' }, vision: { canSee: () => true } } });
  const initial = data.update();
  assert.equal(visits, 1, 'rooms indexed once for all contacts and own crew');
  assert.deepEqual(initial.own[0], { id: 'u', x: 1, z: 2, group: 'a', downed: false, interior: true });
  state.tick = 1; inside.hp = 7;
  assert.equal(data.update(), initial, 'roster snapshot is cached between half-second updates');
  assert.equal(visits, 2, 'contacts still observe each tick');
  assert.equal(data.update(), initial); assert.equal(visits, 2);
  assert.equal(data.update(true, true).sectors[0].hp, 7, 'explicit input refreshes immediately');
  const forced = data.get(); state.tick = 10; assert.equal(data.update(), forced);
  state.tick = 11; assert.notEqual(data.update(), forced);
  const before = data.get(); state.deployment.clans.p.feedback = { sequence: 1 };
  assert.notEqual(data.update(), before, 'accepted local commands invalidate the cached snapshot');
}
// Minimal DOM for event hand-off: two ticks' rewards must survive a single UI
// paint and must not be replayed when a frame advances no simulation ticks.
const saved = { document: globalThis.document, innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight, setTimeout: globalThis.setTimeout };
try {
  const node = () => ({ children: new Map(), classList: { remove() {}, add() {}, toggle() {} }, style: { setProperty() {} },
    querySelector(k) { if (!this.children.has(k)) this.children.set(k, node()); return this.children.get(k); },
    setAttribute() {}, addEventListener() {}, getBoundingClientRect: () => ({ right: 100, top: 100 }) });
  const pops = [];
  globalThis.document = { createElement() { const n = node(); n.firstChild = node(); n.lastChild = node(); return n; }, body: { appendChild(n) { n.isConnected = true; pops.push(n); } } };
  globalThis.innerWidth = 1000; globalThis.innerHeight = 800; globalThis.setTimeout = () => {};
  const game = { state: { tick: 1, entities: { h: { owner: 'p' } }, clans: { p: { id: 'p', ryo: 100, heat: 10 } }, news: [], ryoGains: [], heatGains: [] } };
  const ryo = createRyoBadge({ root: node(), game, heroId: 'h' }), heat = createHeatBadge({ root: node(), game, heroId: 'h' });
  for (let tick = 1; tick <= 2; tick++) {
    game.state.tick = tick; game.state.ryoGains = [{ clan: 'p', amount: tick, reason: 'Loot' }]; game.state.heatGains = [{ clan: 'p', amount: tick, reason: 'Fight' }];
    ryo.observe(); heat.observe();
  }
  ryo.update(); heat.update(); assert.equal(pops.length, 4, 'both ticks reward and heat notices survive');
  ryo.update(); heat.update(); assert.equal(pops.length, 4, 'zero-tick frames do not duplicate notices');
} finally { Object.assign(globalThis, saved); }
{
  const keys = ['document', 'ImageData', 'devicePixelRatio', 'addEventListener', 'innerWidth', 'innerHeight'];
  const saved = Object.fromEntries(keys.map(k => [k, globalThis[k]]));
  try {
    const ctx = new Proxy({}, { get: (o, k) => o[k] ?? (() => {}) });
    const canvas = () => ({ clientWidth: 200, getContext: () => ctx, handlers: {},
      addEventListener(k, fn) { this.handlers[k] = fn; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) });
    globalThis.document = { createElement: canvas }; globalThis.devicePixelRatio = 1;
    globalThis.addEventListener = () => {}; globalThis.innerWidth = 1000; globalThis.innerHeight = 800;
    globalThis.ImageData = class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); } };
    const grid = { w: 2, h: 2, minX: 0, minZ: 0, visible: new Uint8Array(4), explored: new Uint8Array(4) };
    const game = { scenery: [], vision: { grid: () => grid }, state: { tick: 0, entities: {}, businesses: {}, clans: {} } };
    const c = canvas(), map = createMinimap({ canvas: c, game, district: { ground: [] }, view: { screenToGround: () => null },
      fog: { isOn: () => false, seen: s => s }, selected: () => [], heroId: 'h', big: true, onHover() {} });
    map.draw();
    for (let i = 0; i < 100; i++) map.update();
    assert.equal(map.diagnostics().draws, 1, 'idle big map does not repaint every third frame');
    map.update(true); assert.equal(map.diagnostics().draws, 2, 'changed snapshot paints immediately');
    c.handlers.mousemove({ clientX: 100, clientY: 100 }); assert.equal(map.diagnostics().draws, 2, 'tooltip hover does not repaint the map');
    map.zoomBy(1.2); assert.equal(map.diagnostics().draws, 3, 'zoom paints immediately');
    map.ping(0, 0); map.update(); assert.equal(map.diagnostics().draws, 4, 'news ping invalidates independently of roster cadence');
    c.clientWidth = 220; map.update(); assert.equal(map.diagnostics().draws, 5, 'resize paints immediately');
    map.update(); assert.equal(map.diagnostics().draws, 5);
    for(let i=0;i<100;i++)map.invalidate();
    assert.equal(map.diagnostics().draws,5,'click callback chains do no synchronous painting');
    map.update();assert.equal(map.diagnostics().draws,6,'all input redraw requests coalesce into one frame');
  } finally { Object.assign(globalThis, saved); }
}
console.log('Real-time loop: 2–60 fps timing, bounded stalls/pause, per-tick hand-off, once-per-frame UI, half-second roster/index/cache, idle/input-driven canvas and badge event retention passed');
