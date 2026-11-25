// Tim 2026-11-25: a left-click on your own war camp's buildings (hall, barracks, ...) opens the camp menu
// (town_hover.js menuAt). Camp plots carry foreign: true from drawableWarSites, which once blocked the menu.
import assert from 'node:assert/strict';
const noop = () => {};
const el = () => ({ style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop, append: noop, appendChild: noop, querySelector: () => null, querySelectorAll: () => [], remove: noop, hidden: true });
Object.assign(globalThis, { addEventListener: noop, setInterval: () => 0, innerWidth: 1600, innerHeight: 900,
  document: { createElement: el, body: el(), getElementById: () => null, querySelector: () => null } });
const { createTownHover } = await import('../src/town_hover.js');
const war = { id: 'w1', attacker: 'player', defender: 'rival', town: 't9',
  camp: { x: 100, z: 100, buildings: [{ id: 'h', type: 'camp_hall', stage: 'built', x: 100, z: 100 }, { id: 'b1', type: 'barracks', stage: 'built', x: 110, z: 100 }, { id: 'r1', type: 'barracks', stage: 'ruined', x: 120, z: 100 }] } };
const game = { state: { entities: { hero: { id: 'hero', owner: 'player', place: 'world' } }, frontier: { settlements: {}, wars: { list: { w1: war } } } } };
const view = { unitToScreen: (x, z) => ({ x: x * 10, y: z * 10 }) };   // 10 px per cell
const opened = [];
const hover = createTownHover({ game, view, heroId: 'hero', tipEl: el(), flashEl: el(), openTown: noop, frontierData: {}, openCamp: (id, b) => (opened.push([id, b]), true) });
assert.equal(hover.menuAt(1000, 1000), true, 'camp hall opens the camp menu');
assert.equal(hover.menuAt(1100, 1000), true, 'camp barracks opens the camp menu');
assert.deepEqual(opened, [['w1', 'h'], ['w1', 'b1']]);
assert.equal(hover.menuAt(1200, 1000), false, 'a ruin has no menu');
war.attacker = 'rival';
assert.equal(hover.menuAt(1100, 1000), false, "a rival's camp has no menu for you");
console.log('test_camp_menu_click: ok');
