// Local RTS groups and actual pip/hotkey handlers, exercised in Node without a browser.
import assert from 'node:assert/strict';
import { createCrewInput } from '../src/crew_input.js';
import { bindCrewNumberKeys } from '../src/crew_hotkeys.js';
import { createActionBar } from '../src/action_bar.js';

class Element {
  children = []; handlers = {}; style = { setProperty() {} }; dataset = {}; hidden = false;
  textContent = ''; innerHTML = ''; classes = new Set();
  classList = { add: (...xs) => xs.forEach(x => this.classes.add(x)),
    remove: (...xs) => xs.forEach(x => this.classes.delete(x)),
    toggle: (x, on) => on ? this.classes.add(x) : this.classes.delete(x) };
  appendChild(n) { this.children.push(n); n.parent = this; return n; }
  get firstChild() { return this.children[0]; }
  get lastChild() { return this.children.at(-1); }
  remove() { this.parent.children = this.parent.children.filter(n => n !== this); }
  addEventListener(k, fn) { (this.handlers[k] ||= []).push(fn); }
  emit(k, e) { for (const fn of this.handlers[k] || []) fn(e); }
}
const originalEvents = globalThis.addEventListener, originalDocument = globalThis.document;
const handlers = {};
globalThis.addEventListener = (k, fn) => (handlers[k] ||= []).push(fn);
globalThis.document = { body: new Element(), createElement: () => new Element(), addEventListener() {} };
try {
  const h = { id: 'h', owner: 'player', type: 'hero', place: 'street', x: 0, z: 0, hp: 560, maxHp: 560 };
  const a = { id: 'a', owner: 'player', type: 'thug', place: 'street', x: 10, z: 10, hp: 200, maxHp: 200, order: { kind: 'station', x: 10, z: 10 } };
  const b = { ...a, id: 'b', x: 20, order: { kind: 'move', x: 50, z: 10 } };
  const c = { ...a, id: 'c', place: 'room', x: 30, order: { kind: 'stop' } };
  const foe = { ...a, id: 'foe', owner: 'rival' }, guard = { ...a, id: 'guard', guard: 'shop' };
  const game = { state: { tick: 0, entities: { h, a, b, c, foe, guard }, clans: { player: { clinic: [], jail: [] } } }, scenery: [] };
  const sent = [], view = { setSelected() {}, unitToScreen: (x, z) => ({ x, y: z }), screenToGround: (x, y) => ({ x, z: y }), buildingAt: () => null };
  const input = createCrewInput({ game, view, heroId: 'h', send: cmd => sent.push(cmd), box: new Element() });
  const orders = structuredClone([a.order, b.order, c.order]);
  input.select(['a', 'b']); input.assignGroup(1);
  input.select(['c']); input.assignGroup(2);
  input.selectGroup(1); assert.deepEqual(input.selected(), ['a', 'b']);
  input.followMe(); assert.deepEqual(sent.pop().units, ['a', 'b'], 'orders use the selected group only');
  input.selectGroup(2); assert.deepEqual(input.selected(), ['c'], 'groups can recall crew inside a building');
  assert.deepEqual([a.order, b.order, c.order], orders, 'group switching never rewrites previous orders');
  input.selectAll(); assert.deepEqual(input.selected(), ['a', 'b', 'c']);
  assert.equal(input.groupOf('a'), 1); assert.equal(input.groupOf('c'), 2);
  input.clear(); input.selectGroup(1); assert.deepEqual(input.selected(), ['a', 'b'], 'Escape clears selection without dissolving groups');
  input.assignGroup(1); assert.equal(input.groupOf('a'), null, 'same membership and number dissolves the group');
  input.assignGroup(1); input.select(['a']); input.assignGroup(2);
  assert.equal(input.groupOf('a'), 2); assert.equal(input.groupOf('b'), 1); assert.equal(input.groupOf('c'), null, 'reassignment replaces the destination group');
  input.select(['a', 'c']); input.assignGroup(3);
  assert.equal(input.groupOf('a'), 3); assert.equal(input.groupOf('c'), 3);
  input.select(['h', 'foe', 'guard']); input.assignGroup(4);
  assert.equal(input.groupOf('h'), null); assert.equal(input.groupOf('foe'), null); assert.equal(input.groupOf('guard'), null);
  input.select(['b']); input.selectGroup(4); assert.deepEqual(input.selected(), ['b'], 'empty group keys preserve selection');
  // Indoors, a drag box must select crew even when no unlocked companion is present.
  h.place = 'room'; sent.length = 0;
  const pointer = { button: 0, target: { closest: () => null }, clientX: 25, clientY: 5 };
  handlers.mousedown.forEach(fn => fn(pointer));
  handlers.mouseup.forEach(fn => fn({ ...pointer, clientX: 35, clientY: 15 }));
  assert.deepEqual(input.selected(), ['c']); assert.equal(sent.length, 0, 'indoor selection issues no orders');
  assert.equal(input.groupOf('c'), 3, 'drag selection keeps membership');
  input.selectAll(); assert.deepEqual(input.selected(), ['a', 'b', 'c'], 'C includes indoor and outdoor crew');

  const keys = {}, menus = [0, 1, 2, 3].map(() => ({ open: false, picks: [], isOpen() { return this.open; }, pick(i) { this.picks.push(i); } }));
  bindCrewNumberKeys({ onKey: (key, fn) => keys[key] = fn, crewInput: input, menus });
  const keyEvent = ctrlKey => ({ ctrlKey, preventDefault() { this.prevented = true; } });
  input.select(['a', 'b']); keys.Digit4(keyEvent(true));
  input.clear(); keys.Digit4(keyEvent(false)); assert.deepEqual(input.selected(), ['a', 'b']);
  for (const menu of menus) {
    menu.open = true;
    keys.Digit1(keyEvent(false)); keys.Digit4(keyEvent(true)); keys.Digit9(keyEvent(false));
    assert.deepEqual(menu.picks, [0, 3, 8], 'each open service/hiring menu consumes number keys');
    assert.deepEqual(input.selected(), ['a', 'b']); assert.equal(input.groupOf('a'), 4);
    menu.open = false;
  }
  // Exercise modifier forwarding through the real keyboard dispatcher as well.
  const { onKey } = await import('../src/input.js');
  bindCrewNumberKeys({ onKey, crewInput: input, menus });
  input.select(['a', 'c']);
  const press = ctrlKey => handlers.keydown.forEach(fn => fn({ ...keyEvent(ctrlKey), code: 'Digit2', repeat: false }));
  press(true); input.clear(); press(false);
  assert.deepEqual(input.selected(), ['a', 'c'], 'real keydown forwards Ctrl for assignment versus recall');
  input.select(['a', 'b']); keys.Digit4(keyEvent(true));

  const root = new Element(), jumps = [];
  const bar = createActionBar({ root, game, units: { types: { hero: {}, thug: { name: 'Thug' } } }, heroId: 'h', tickRate: 20, crewInput: input, jump: u => jumps.push(u.id) });
  bar.update(0);
  const crew = root.children[1].children[0], mate = crew.children[0];
  assert.equal(mate.children[2].textContent, '4', 'pip displays control group');
  const click = { button: 0, target: { closest: selector => selector === '.mate' ? mate : null } };
  crew.emit('mousedown', click); crew.emit('mousedown', click); crew.emit('dblclick', click);
  assert.deepEqual(input.selected(), ['a'], 'double-click pip overrides both preceding toggle clicks');
  assert.deepEqual(jumps, ['a']); assert.equal(input.groupOf('a'), 4, 'pip selection preserves group');
  b.dead = true; delete game.state.entities.c; input.update();
  assert.equal(input.groupOf('b'), null); assert.equal(input.groupOf('c'), null);
  input.selectGroup(4); assert.deepEqual(input.selected(), ['a'], 'dead or removed crew are pruned');
  assert.deepEqual([a.order, b.order, c.order], orders, 'all local group and pip actions preserve orders');
  // Escape releases temporary sector control; the explicit Duty action also
  // selects only permanently assigned available hero crew, without orders.
  game.state.deployment = { clans: { player: { sectors: { nw: {}, ne: {} } } } };
  a.deployment = { group: 'hero' };
  b.dead = false; b.deployment = { group: 'nw', duty: { manual: true } };
  const d = { ...b, id: 'd', deployment: { group: 'ne', duty: { manual: true } } };
  game.state.entities.d = d;
  input.select(['b', 'd']); sent.length = 0;
  input.cancelAction(); input.clear();
  assert.deepEqual(input.selected(), []);
  assert.deepEqual(sent.find(c => c.type === 'deployment').units, ['b', 'd'], 'Escape returns released sector crew');
  assert.equal(sent.find(c => c.type === 'deployment').selectionChange, true, 'selection release does not cancel autonomous duties');
  input.select(['b', 'd']); sent.length = 0;
  input.returnToDutyAndSelectHero();
  assert.deepEqual(input.selected(), ['a'], 'Duty button selects assigned hero crew');
  assert.equal(sent.length, 1, 'no duplicate selection-change return');
  assert.deepEqual(sent[0], { id: 'h', type: 'deployment', action: 'return', units: ['b', 'd'] });
  assert.ok(!sent.some(c => c.type === 'order'), 'return/select never issues Follow or movement to hero party');
  assert.equal(input.groupOf('a'), 4, 'Duty keeps numbered shortcuts');
  input.select(['b', 'd']); sent.length = 0;
  input.returnToDutyAndSelectHero(['b']);
  assert.deepEqual(sent[0].units, ['b'], 'map sector button scopes its return to that sector');
  assert.deepEqual(sent[1].units, ['d'], 'other released manual sector selection also returns normally');
  assert.equal(sent[1].action, 'release', 'group switching lets another manual order finish before returning');
  assert.deepEqual(input.selected(), ['a']);
  game.state.deployment.restrictionsEnabled=true;
  game.state.deployment.sectors=[{id:'nw',name:'North west'},{id:'ne',name:'North east'}];
  const f={...b,id:'f',deployment:{group:'nw'}};game.state.entities.f=f;
  input.selectAll();assert.deepEqual(input.selected(),['a'],'C selects permanent hero group only');
  input.selectUnit('b');assert.deepEqual(input.selected(),['b','f'],'ordinary pip selection selects its group');
  input.selectUnit('f',true);assert.deepEqual(input.selected(),['f'],'double-click can select one member');
  input.selectUnit('a');assert.deepEqual(input.selected(),['a'],'clicking a hero-group crew member drops all other groups');
  input.select(['b','d']);assert.deepEqual(input.selected(),['b'],'mixed-group box/number selection never creates a mini Rally');
  game.state.deployment.clans.player.rally={active:true,endsAt:100,participants:[{id:'b'}]};
  input.selectAll();assert.deepEqual(input.selected(),['a','b'],'C includes actual active Rally participants');
  console.log('groups: assign, dissolve, transfer, preserve orders, C, indoor drag, menu priority, pip double-click and cleanup ok');
} finally {
  globalThis.addEventListener = originalEvents; globalThis.document = originalDocument;
}
