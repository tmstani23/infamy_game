import assert from 'node:assert/strict';
import { createKeybinds, KEY_ACTIONS, KEY_TYPES, comboFromEvent, comboText, codeText, normalizeOverrides, isReserved } from '../src/keybinds.js';

const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
const saved = s => JSON.parse(s.m.get('infamy.keys.v1') || '{}');

// table: unique ids, known types, defaults free of clashes inside a context
assert.equal(new Set(KEY_ACTIONS.map(a => a.id)).size, KEY_ACTIONS.length, 'unique ids');
for (const a of KEY_ACTIONS) assert.ok(KEY_TYPES.includes(a.type), a.id + ' type');
for (const a of KEY_ACTIONS) assert.ok(a.fixed ? a.text : a.keys.length, a.id + ' has keys or text');
for (const t of KEY_TYPES) assert.ok(KEY_ACTIONS.some(a => a.type === t), t + ' has rows');
{
  const seen = new Map();
  for (const a of KEY_ACTIONS) if (!a.fixed) for (const c of a.keys) { const k = a.context + ':' + c; assert.ok(!seen.has(k), `${a.id} and ${seen.get(k)} share ${c}`); seen.set(k, a.id); }
}
// no special characters in any shown text (Tim 2026-11-10)
const plain = s => /^[A-Za-z0-9 ,;]*$/.test(s);
for (const a of KEY_ACTIONS) assert.ok(plain(a.name.replace(/[.]/g, '')), a.name);

// defaults: today's keys, nothing saved
{
  const s = memory(), k = createKeybinds(s);
  assert.equal(k.lookup('KeyQ'), 'ability1');
  assert.equal(k.lookup('Shift+KeyQ'), 'special1');
  assert.equal(k.lookup('Shift+KeyJ'), 'character', 'bare key fallback while Shift is held');
  assert.equal(k.lookup('Ctrl+Digit2'), 'assignGroup2');
  assert.equal(k.lookup('Digit2'), 'group2');
  assert.equal(k.lookup('Alt+Digit2'), null, 'Alt + number does nothing, as before');
  assert.equal(k.lookup('Ctrl+KeyJ'), null, 'Ctrl only runs exact bindings');
  assert.equal(k.lookup('Space'), 'use');
  assert.equal(k.lookup('Enter'), 'use');
  assert.equal(k.lookup('KeyR', ['build', 'world']), 'rotateBuilding', 'build context first');
  assert.equal(k.lookup('KeyR'), 'ability3');
  assert.equal(k.lookup('KeyN'), null, 'dev keys are not in the table');
  assert.equal(k.lookup({ code: 'ShiftLeft', shiftKey: true }), null, 'lone modifier');
  assert.equal(k.lookup({ code: 'KeyH', shiftKey: true }), 'mountGroup');
  assert.deepEqual(k.codesFor('moveUp'), ['KeyW']);
  assert.equal(k.label('pause'), 'Backtick or Pause');
  assert.equal(k.label('special1'), 'Shift + Q');
  assert.equal(k.badge('special1'), 'S+Q');
  assert.equal(k.label('torch'), 'Shift + right-click');
  assert.equal(k.unboundIds().length, 0);
  assert.equal(s.m.size, 0, 'nothing written until a change');
}

// set, take, swap, clear, reset
{
  const s = memory(), k = createKeybinds(s); let calls = 0; k.subscribe(() => calls++);
  assert.ok(k.set('ability1', 0, 'KeyE', 'take'));
  assert.equal(k.lookup('KeyE'), 'ability1');
  assert.ok(k.isUnbound('ability2'), 'took E from ability 2');
  assert.equal(k.label('ability2'), 'Unbound');
  assert.equal(k.badge('ability2'), 'Unbound');
  assert.equal(k.hint('ability2'), ' (Unbound)');
  assert.deepEqual(k.unboundIds(), ['ability2']);
  assert.equal(k.lookup('KeyQ'), null);
  k.resetAll();
  assert.ok(k.set('ability1', 0, 'KeyE', 'swap'));
  assert.equal(k.lookup('KeyE'), 'ability1');
  assert.equal(k.lookup('KeyQ'), 'ability2', 'swapped');
  assert.deepEqual(saved(s), { ability1: ['KeyE', null], ability2: ['KeyQ', null] });
  assert.ok(k.clear('ability1', 0));
  assert.ok(k.isUnbound('ability1'));
  k.reset('ability1');
  assert.equal(k.lookup('KeyQ'), 'ability1');
  assert.ok(k.isUnbound('ability2'), 'reset takes the default key back');
  k.reset('ability2');
  assert.deepEqual(saved(s), {}, 'back to defaults saves nothing');
  // second slot, same key twice moves it
  assert.ok(k.set('heal', 1, 'KeyN'));
  assert.equal(k.label('heal'), 'G or N');
  assert.ok(k.set('heal', 0, 'KeyN'));
  assert.deepEqual(k.get('heal'), ['KeyN', null]);
  // contexts: building R does not clash with ability R
  assert.deepEqual(k.conflicts('rotateBuilding', 'KeyR'), []);
  assert.deepEqual(k.conflicts('ability1', 'KeyR'), ['ability3']);
  // refusals
  assert.equal(k.set('close', 0, 'KeyQ'), false, 'fixed');
  assert.equal(k.set('ability1', 0, 'Escape'), false, 'reserved');
  assert.equal(k.set('ability1', 0, 'F5'), false, 'reserved');
  assert.equal(k.set('ability1', 0, 'Alt+Enter'), false, 'reserved');
  assert.equal(k.set('ability1', 0, 'ShiftLeft'), false, 'lone modifier');
  assert.equal(k.set('ability1', 2, 'KeyN'), false, 'bad slot');
  assert.equal(k.set('nope', 0, 'KeyN'), false, 'unknown');
  assert.ok(calls > 0);
  // a modifier key: the bare key still reaches another action
  k.resetAll();
  assert.ok(k.set('map', 0, 'Ctrl+KeyM'));
  assert.equal(k.lookup('Ctrl+KeyM'), 'map');
  assert.equal(k.lookup('KeyM'), null);
}

// saved changes come back; broken saves fall back safely
{
  const s = memory({ 'infamy.keys.v1': JSON.stringify({ stop: ['KeyQ', null] }) });
  const k = createKeybinds(s);
  assert.equal(k.lookup('KeyQ'), 'stop', 'the player\'s choice keeps the key over a default');
  assert.ok(k.isUnbound('ability1'), 'the default that lost it shows Unbound');
  assert.equal(k.lookup('KeyZ'), null);
  for (const bad of ['{', 'null', '[]', '"x"', JSON.stringify({ ability1: 'KeyQ', zzz: ['KeyQ'], close: ['KeyQ'], heal: ['Escape', 'Alt+Shift+F9', 'x'] })]) {
    const k2 = createKeybinds(memory({ 'infamy.keys.v1': bad }));
    assert.equal(k2.lookup('KeyQ'), 'ability1', bad);
  }
  assert.deepEqual(normalizeOverrides({ heal: ['Escape', 'Shift+Alt+F9'] }).heal, [null, 'Alt+Shift+F9'], 'reserved dropped, modifiers ordered');
  assert.doesNotThrow(() => createKeybinds(null).set('heal', 0, 'KeyN'));
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const k3 = createKeybinds(throwing);
  assert.ok(k3.set('heal', 0, 'KeyN'));
  assert.equal(k3.lookup('KeyN'), 'heal');
}

// text helpers
assert.equal(comboFromEvent({ code: 'KeyQ', shiftKey: true, ctrlKey: true }), 'Ctrl+Shift+KeyQ');
assert.equal(comboText('Ctrl+Shift+KeyQ'), 'Ctrl + Shift + Q');
assert.equal(codeText('ArrowUp'), 'Up arrow');
assert.equal(codeText('Numpad7'), 'Numpad 7');
assert.equal(codeText('F9'), 'F9');
assert.equal(codeText('Backquote'), 'Backtick');
assert.ok(isReserved('Escape'));
for (const c of ['Slash', 'Backquote', 'Equal', 'Minus', 'BracketLeft', 'Quote', 'Comma', 'Period', 'NumpadAdd', 'NumpadDecimal', 'IntlBackslash']) assert.ok(plain(codeText(c)), c);

console.log('keybinds tests passed');

// every action the game asks for exists in the table (literal names in the source)
{
  const { readFileSync } = await import('node:fs');
  const ids = new Set(KEY_ACTIONS.map(a => a.id));
  for (const f of ['main.js', 'crew_hotkeys.js', 'frontier_build_ui.js', 'character_panel.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/(?:onAction\(|lookup\([^)]*\)\s*===\s*|label\(|badge\()'([A-Za-z0-9]+)'/g)) assert.ok(ids.has(m[1]), `${f}: unknown action ${m[1]}`);
    for (const m of src.matchAll(/\[('[A-Za-z0-9]+'(?:,\s*'[A-Za-z0-9]+')*)\]\.includes\(keybinds\.lookup/g)) for (const id of m[1].match(/[A-Za-z0-9]+/g)) assert.ok(ids.has(id), `${f}: unknown action ${id}`);
  }
  console.log('keybinds source names checked');
}

// the Controls panel templates: every {action} is known, and an unbound one turns the row red
{
  const { readFileSync } = await import('node:fs');
  const { fillKeyTemplate } = await import('../src/key_hints.js');
  const ids = new Set(KEY_ACTIONS.map(a => a.id));
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tpls = [...html.matchAll(/data-k="([^"]*)"/g)].map(m => m[1]);
  assert.ok(tpls.length > 50, 'Controls panel rows follow the key table');
  for (const t of tpls) for (const m of t.matchAll(/\{([A-Za-z0-9]+)\}/g)) assert.ok(ids.has(m[1]), `index.html: unknown action ${m[1]}`);
  const k = createKeybinds(memory());
  assert.deepEqual(fillKeyTemplate('{moveUp} {moveLeft} {moveDown} {moveRight}', k), { text: 'W A S D', unbound: false });
  assert.deepEqual(fillKeyTemplate('{use} at a door ring', k), { text: 'Space or Enter at a door ring', unbound: false });
  k.clear('heal', 0);
  assert.deepEqual(fillKeyTemplate('{heal}', k), { text: 'Unbound', unbound: true });
  for (const f of ['main.js', 'action_bar.js', 'crew_bar.js', 'ability_rows.js', 'character_panel.js', 'top_bar.js', 'deployment_panel_ui.js', 'frontier_panel.js', 'key_hints.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    const re = f === 'crew_bar.js' ? /(?:hint|label|badge|isUnbound)\('([A-Za-z0-9]+)'\)|key: '[^']*', action: '([A-Za-z0-9]+)'/g : /(?:hint|label|badge|isUnbound)\('([A-Za-z0-9]+)'\)/g;
    for (const m of src.matchAll(re)) { const id = m[1] || m[2]; assert.ok(ids.has(id), `${f}: unknown action ${id}`); }
  }
  console.log('Controls panel and HUD key names checked');
}
