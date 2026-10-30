// Crew frame selection (Tim 2026-10-30): gold box + dimming, "N selected" header, tabs 1-4,
// click = one member + target frame, Shift+click toggles, drag feedback and refused-drop flash. Node only.
import assert from 'node:assert/strict';
import { createGroupedCrew } from '../src/grouped_crew.js';
import { createActionBar } from '../src/action_bar.js';

class Element {
  children = []; handlers = {}; style = { setProperty() {} }; dataset = {}; hidden = false; title = '';
  textContent = ''; classes = new Set();
  classList = { add: (...xs) => xs.forEach(x => this.classes.add(x)), remove: (...xs) => xs.forEach(x => this.classes.delete(x)),
    toggle: (x, on) => on ? this.classes.add(x) : this.classes.delete(x), contains: x => this.classes.has(x) };
  appendChild(n) { this.children.push(n); n.parent = this; return n; }
  append(...ns) { ns.forEach(n => this.appendChild(n)); }
  insertBefore(n, ref) { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); const i = ref ? this.children.indexOf(ref) : -1; i < 0 ? this.children.push(n) : this.children.splice(i, 0, n); n.parent = this; }
  get firstChild() { return this.children[0]; } get lastChild() { return this.children.at(-1); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
  setAttribute(k, v) { this[k] = v; } blur() {}
  contains(n) { for (let x = n; x; x = x.parent) if (x === this) return true; return false; }
  closest(sel) { for (let x = this; x; x = x.parent) if (sel === '.mate' ? x.className === 'mate' : x.className === sel.slice(1)) return x; return null; }
  addEventListener(k, fn) { (this.handlers[k] ||= []).push(fn); }
  emit(k, e) { for (const fn of this.handlers[k] || []) fn(e); }
}
const original = globalThis.document;
globalThis.document = { body: new Element(), head: new Element(), createElement: () => new Element(), addEventListener() {} };
try {
  const mk = (id, group) => ({ id, owner: 'player', type: 'thug', place: 'street', x: 0, z: 0, hp: 200, maxHp: 200, deployment: { group } });
  const crew = [mk('a', 'hero'), mk('b', 'hero'), mk('c', 'hero'), mk('d', 'nw')];
  const S = Object.fromEntries(crew.map(e => [e.id, e])); S.h = { id: 'h', owner: 'player', type: 'hero', hp: 1, maxHp: 1 };
  let sel = [], refuseTo = null, sent = [];
  const groups = { a: 1, b: 1 };
  const crewInput = { selected: () => sel, select: ids => { sel = ids; }, selectUnit: id => { sel = [id]; }, groupOf: id => groups[id] || null,
    assignGroup: n => sent.push(['assign', n]), selectGroup: n => sent.push(['recall', n]) };
  const game = { state: { tick: 0, entities: S, deployment: { clans: {}, sectors: [{ id: 'nw', name: 'Harbor' }] } },
    deployment: { canTransfer: (h, ids, to) => to === refuseTo ? { ok: false, why: 'Hero group holds six crew outside Rally' } : { ok: true, why: '' } } };
  const root = new Element();
  const g = createGroupedCrew({ root, game, heroId: 'h', units: { types: { thug: { name: 'Thug' } } }, crewInput, send: c => sent.push(c) });
  sel = ['a', 'b']; g.update(crew, [], []);
  const [tabs, hero, harbor] = root.children;
  assert.equal(tabs.className, 'crew-tabs');
  assert.equal(tabs.children[0].textContent, '1'); assert.equal(tabs.children[0].children[0].textContent, 2, 'tab shows group size');
  assert.ok(tabs.children[0].classes.has('on') && tabs.children[1].classes.has('empty'));
  assert.equal(hero.children[0].children.at(-1).textContent, ' · 2 selected', 'partial selection named in header');
  const pip = id => [hero, harbor].flatMap(s => s.children[1].children).find(p => p.dataset.id === id);
  assert.ok(pip('a').classes.has('picked') && pip('c').classes.has('dim') && !pip('a').classes.has('dim'));
  tabs.children[2].emit('click', { ctrlKey: true }); tabs.children[3].emit('click', { ctrlKey: false });
  assert.deepEqual(sent.splice(0), [['assign', 3], ['recall', 4]]);
  // drag a selected member onto a full group: red while over it, refused drop flashes the reason and sends nothing
  const dt = { setData() {} }, ev = (t, extra = {}) => ({ target: t, dataTransfer: dt, preventDefault() {}, ...extra });
  root.emit('dragstart', ev(pip('d'))); refuseTo = 'hero';
  root.emit('dragover', ev(hero.children[0]));
  assert.ok(hero.classes.has('drop-full') && !hero.classes.has('drop-target'), 'full group shows red');
  root.emit('drop', ev(hero.children[0]));
  assert.ok(hero.classes.has('drop-refused')); assert.match(hero.children[2].textContent, /six/); assert.equal(sent.length, 0);
  root.emit('dragstart', ev(pip('a'))); refuseTo = null; root.emit('dragover', ev(harbor.children[0]));
  assert.ok(harbor.classes.has('drop-target'), 'room shows gold');
  root.emit('drop', ev(harbor.children[0]));
  assert.deepEqual(sent.at(-1), { id: 'h', type: 'deployment', action: 'transfer', units: ['a', 'b'], to: 'nw' }, 'selected crew move together');
  // action bar clicks: one member + target frame, Shift toggles, a click inside a bigger selection waits for mouseup
  const inspected = [], focus = [], barRoot = new Element(), frame = new Element();
  createActionBar({ root: barRoot, game, units: { types: { hero: {}, thug: { name: 'Thug' } } }, heroId: 'h', tickRate: 20, crewInput, crewRoot: frame, onInspect: id => inspected.push(id), onHeroFocus: () => focus.push(1) });
  const crewEl = frame.children[0], at = id => ({ button: 0, target: { closest: () => ({ dataset: { id } }) } });
  sel = []; crewEl.emit('mousedown', at('c')); assert.deepEqual(sel, ['c']); assert.deepEqual(inspected, ['c']);
  crewEl.emit('mousedown', { ...at('a'), shiftKey: true }); assert.deepEqual(sel, ['c', 'a'], 'Shift adds');
  crewEl.emit('mousedown', at('a')); assert.deepEqual(sel, ['c', 'a'], 'mousedown inside a selection keeps it for dragging');
  crewEl.emit('click', at('a')); assert.deepEqual(sel, ['a']); assert.deepEqual(inspected, ['c', 'a']);
  barRoot.children[1].children.find(n => n.className === 'portrait').emit('dblclick', { button: 0 }); assert.equal(focus.length, 1, 'double-click hero portrait = camera to hero');
  console.log('crew frame selection: highlight, header count, tabs, drag feedback, click/Shift/drag selection and hero refocus ok');
} finally { globalThis.document = original; }
