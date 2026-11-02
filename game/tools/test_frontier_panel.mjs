// F4.4: the town panel with a stub DOM (no browser). Run: node game/tools/test_frontier_panel.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontier } from '../src/sim/frontier/frontier.js';

const handlers = {};
const mkEl = () => ({ hidden: true, innerHTML: '', style: {}, textContent: '', dataset: {}, addEventListener(t, f) { handlers[t] = f; }, getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 0, width: 0, height: 0 }) });
globalThis.document = { createElement: mkEl, body: { appendChild() {} } };
globalThis.innerWidth = 1000; globalThis.innerHeight = 800;
const { createFrontierPanel } = await import('../src/frontier_panel.js');

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const state = { tick: 0, clans: {} };
const fr = createFrontier({ state, data });
fr.world.assignStartOwners({ player: 'player', bot: 'kuroda' });
const sent = [];
const root = mkEl();
const panel = createFrontierPanel({ root, game: { state }, heroId: 'h1', send: c => sent.push(c) });
panel.open();
assert.equal(root.hidden, false);
assert.match(root.innerHTML, /First Frontier/);
assert.doesNotMatch(root.innerHTML, /Second Frontier/, 'rival town is not shown');
assert.match(root.innerHTML, /data-tip=/, 'non-obvious items carry tooltips');
const click = (act, id) => { const b = { dataset: { act, id } }; handlers.click({ target: { closest: () => b } }); };
click('priority', 'produce');
assert.deepEqual(sent.at(-1), { id: 'h1', type: 'frontier', action: 'setPriority', settlement: 's_frontier_1', priority: 'produce' });
click('tax', 'high'); assert.equal(sent.at(-1).level, 'high');
click('auto', 'on'); assert.equal(sent.at(-1).on, true);
click('talk'); assert.match(root.innerHTML, /Governor/); assert.match(root.innerHTML, /Take more initiative/);
click('talk', 'initiative'); assert.equal(sent.at(-1).action, 'setAutoBuild');
click('talk', 'close'); assert.doesNotMatch(root.innerHTML, /class="chat"/);
const before = JSON.stringify(state);
panel.render(); assert.equal(JSON.stringify(state), before, 'the panel writes nothing');
panel.close(); assert.equal(root.hidden, true);
// F4.4b: overview window
{
  const { createTownsOverview } = await import('../src/towns_overview.js');
  fr.world.setOwner('s_frontier_2', 'player');
  const oroot = mkEl(), opened = [], sent2 = [];
  for (const k of Object.keys(handlers)) delete handlers[k];
  const ov = createTownsOverview({ root: oroot, game: { state }, heroId: 'h1', send: c => sent2.push(c), openTown: id => opened.push(id) });
  ov.open();
  assert.match(oroot.innerHTML, /First Frontier/); assert.match(oroot.innerHTML, /Second Frontier/);
  assert.match(oroot.innerHTML, /data-tip=/, 'column tips');
  const el = (ds, tag = 'tr') => ({ dataset: ds, tagName: tag, closest: sel => (sel.includes(tag) || sel.includes('[data-id]') && tag === 'tr' ? { dataset: ds } : null) });
  handlers.click({ target: { closest: sel => sel.startsWith('tr') ? { dataset: { id: 's_frontier_2' } } : null } });
  assert.deepEqual(opened, ['s_frontier_2']);
  handlers.change({ target: { dataset: { act: 'tax', id: 's_frontier_1' }, value: 'low' } });
  assert.deepEqual(sent2.at(-1), { id: 'h1', type: 'frontier', action: 'setTax', settlement: 's_frontier_1', level: 'low' });
  const rowOf = id => ({ target: { closest: sel => sel.startsWith('tr') ? { dataset: { id } } : null }, preventDefault() {} });
  handlers.dragstart(rowOf('s_frontier_2')); handlers.drop(rowOf('s_frontier_1'));
  assert.deepEqual(sent2.at(-1), { id: 'h1', type: 'frontier', action: 'setTownOrder', order: ['s_frontier_2', 's_frontier_1'] });
  ov.alert('s_frontier_1', 'road blocked', true);
  assert.match(oroot.innerHTML, /road blocked/); assert.match(oroot.innerHTML, /class="flash"/);
  ov.close(); assert.equal(oroot.hidden, true);
}
console.log('test_frontier_panel: ok');
process.exit(0);
