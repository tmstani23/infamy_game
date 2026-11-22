// The general's, governor's and lieutenant's logs (Tim 2026-11-22): sim/frontier/action_log.js and src/action_log_ui.js.
// Run: node game/tools/test_action_log.mjs
import assert from 'node:assert/strict';
import { logAct, generalLine, aName } from '../src/sim/frontier/action_log.js';
import { logRowHtml, logPageHtml, logTurn, ago, LOG_PER_PAGE } from '../src/action_log_ui.js';

const data = { logs: { keep: 30, sameSeconds: 120 } };
const state = { tick: 0, clock: { day: 4 }, night: true };
const s = {};
logAct(state, data, s, 'general', 'build', 'Placed a barracks', 'detail');
assert.equal(s.log.general.length, 1);
assert.deepEqual(s.log.general[0], { tick: 0, day: 4, night: true, k: 'build', x: 'Placed a barracks', d: 'detail' });
state.tick = 100; logAct(state, data, s, 'general', 'build', 'Placed a barracks');
assert.equal(s.log.general.length, 1, 'the same line within sameSeconds is not repeated');
assert.equal(s.log.general[0].tick, 100, 'its time moves up');
state.tick = 100 + 121 * 20; logAct(state, data, s, 'general', 'build', 'Placed a barracks');
assert.equal(s.log.general.length, 2, 'after sameSeconds it is written again');
for (let i = 0; i < 40; i++) { state.tick += 20; logAct(state, data, s, 'general', 'save', `Line ${i}`); }
assert.equal(s.log.general.length, 30, 'keeps data.logs.keep lines');
assert.equal(s.log.general[0].x, 'Line 39', 'newest first');
logAct(state, data, s, 'governor', 'work', 'Started training a worker');
assert.equal(s.log.governor.length, 1, 'each log is its own list');
{ const g = {}; const st = { tick: 0, clock: { day: 1 } };
  for (let i = 0; i < 3; i++) { st.tick += 200; logAct(st, data, g, 'governor', 'work', 'Started training a worker'); st.tick += 200; logAct(st, data, g, 'governor', 'land', 'Zoned farm cells'); }
  assert.equal(g.log.governor.length, 2, 'lines that come again between others count up instead of filling the log');
  assert.deepEqual([g.log.governor[0].x, g.log.governor[0].n, g.log.governor[1].n], ['Zoned farm cells', 3, 3]);
  assert.match(logRowHtml('x', g.log.governor, st.tick), /Zoned farm cells \(3 times\)/); }
assert.deepEqual(['supply_tents', 'barracks', 'armory', 'stockade'].map(aName), ['supply tents', 'a barracks', 'an armory', 'a stockade']);
logAct(state, data, null, 'general', 'build', 'x'); logAct(state, data, s, 'general', 'build', '');
assert.equal(s.log.general.length, 30, 'no holder or no text writes nothing');

assert.deepEqual(generalLine({ action: 'place', kind: 'armory' }).slice(0, 2), ['build', 'Placed an armory']);
assert.equal(generalLine({ action: 'rebuild', building: 'b1' }, { buildings: [{ id: 'b1', type: 'supply_tents' }] })[1], 'Rebuilding the ruined supply tents');
assert.equal(generalLine({ action: 'train' }), null, 'training is not logged');

const list = s.log.general, now = state.tick;
const row = logRowHtml('General\'s log', list, now);
assert.match(row, /30 entries/); assert.match(row, /Line 39/); assert.match(row, /data-logopen/);
assert.match(logRowHtml('General\'s log', [], now, 'Nothing yet here'), /Nothing yet here/);
const p0 = logPageHtml('General\'s log', list, 0, now);
assert.equal((p0.match(/class="lrow"/g) || []).length, LOG_PER_PAGE, 'ten lines a page');
assert.match(p0, /Page 1 of 3/); assert.match(p0, /data-lpage="-1" disabled/); assert.doesNotMatch(p0, /data-lpage="1" disabled/);
const p2 = logPageHtml('General\'s log', list, 2, now);
assert.match(p2, /Page 3 of 3/); assert.match(p2, /data-lpage="1" disabled/);
assert.match(logPageHtml('x', [], 0, now), /Nothing logged yet/);
assert.match(logPageHtml('x', [{ tick: 0, day: 2, k: 'bad', x: '<b>' }], 0, 0), /&lt;b&gt;/, 'text is escaped');
assert.equal(logTurn(0, -1, list), 0); assert.equal(logTurn(0, 1, list), 1); assert.equal(logTurn(2, 1, list), 2);
assert.equal(ago(0, 20 * 30), 'just now'); assert.equal(ago(0, 20 * 300), '5 min ago');

// the Governor tab shows his log row, and its clicks open and page it
const handlers = {};
const mkEl = () => ({ hidden: true, innerHTML: '', style: {}, textContent: '', dataset: {}, addEventListener(t, f) { handlers[t] = f; }, getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 0, width: 0, height: 0 }) });
globalThis.document = { createElement: mkEl, body: { appendChild() {} } };
globalThis.innerWidth = 1000; globalThis.innerHeight = 800;
const { readFileSync } = await import('node:fs');
const { createFrontier } = await import('../src/sim/frontier/frontier.js');
const { createFrontierPanel } = await import('../src/frontier_panel.js');
const fdata = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const gs = { tick: 0, clans: {} };
const fr = createFrontier({ state: gs, data: fdata });
fr.world.assignStartOwners({ player: 'player', bot: 'kuroda' });
const town = Object.values(gs.frontier.settlements).find(t => t.name === 'First Frontier');
for (let i = 0; i < 12; i++) { gs.tick += 20 * 200; logAct(gs, fdata, town, 'governor', 'build', `Placed house ${i}`); }
const root = mkEl();
const panel = createFrontierPanel({ root, game: { state: gs }, heroId: 'h1', send() {} });
panel.open();
const click = ds => { const el = { dataset: ds }; handlers.click({ target: { closest: () => el } }); };
click({ act: 'tab', id: 'governor' });
assert.match(root.innerHTML, /Governor&#39;s log/); assert.match(root.innerHTML, /Placed house 11/);
click({ logopen: '1' });
assert.match(root.innerHTML, /Page 1 of 2/); assert.doesNotMatch(root.innerHTML, /Building plans/, 'the open log takes the tab');
click({ lpage: '1' }); assert.match(root.innerHTML, /Page 2 of 2/); assert.match(root.innerHTML, /Placed house 0/);
click({ logback: '1' }); assert.match(root.innerHTML, /Building plans/);
console.log('test_action_log: ok');
process.exit(0);
