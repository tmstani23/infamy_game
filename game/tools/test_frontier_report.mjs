// F2.4b: the dev readout only reads snapshot data. Run: node game/tools/test_frontier_report.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontierWorld } from '../src/sim/frontier/world.js';
import { frontierReport, reportRows, overviewRows, governorSays, talkCommand, hoverCard } from '../src/frontier_report.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const state = { tick: 0 };
createFrontierWorld({ state, data });
const frozen = structuredClone(state.frontier);
const deepFreeze = o => { Object.values(o).forEach(v => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };
deepFreeze(frozen);
const text = frontierReport(frozen);   // would throw on any write to a frozen snapshot
assert.match(text, /First Frontier/);
assert.match(text, /pop 8\/12/);
assert.match(text, /food 60/);
assert.equal(frontierReport(undefined), 'frontier: off');
const before = JSON.stringify(state);
frontierReport(state.frontier);
assert.equal(JSON.stringify(state), before, 'reading writes nothing');
// F4.3: reportRows
{
  const s = structuredClone(state.frontier.settlements.s_frontier_1);
  s.owner = 'player'; s.mood = 61.4; s.report = { doing: 'Building a farm', next: 'a house', waiting: ['food'], moodWhy: [{ factor: 'taxes', text: 'Taxes high', hint: 'Lower taxes' }], idle: 1, unfilled: 2 };
  s.projects = [{ id: 'p1', type: 'farm', cost: { timber: 20 }, paid: true, progress: 30, need: 50, authorized: true }, { id: 'p2', type: 'house', cost: { timber: 10 }, paid: false, progress: 0, need: 20, authorized: false }];
  s.suggestions = [{ type: 'quarry', reason: 'Quarry: stone is low' }];
  s.buildings[0].workers = 4;
  const prev = structuredClone(s); prev.stock.food = 70; prev.stock.timber = s.stock.timber;
  const copy = JSON.stringify([s, prev]);
  const rows = reportRows(s, prev);
  assert.equal(JSON.stringify([s, prev]), copy, 'does not change its input');
  assert.equal(rows.pop.text, '8 townsfolk + 0 workers / 12 beds');
  assert.equal(rows.stock.find(r => r.key === 'food').arrow, 'down');
  assert.equal(rows.stock.find(r => r.key === 'timber').arrow, 'flat');
  assert.equal(rows.stock.find(r => r.key === 'food').delta, -10);
  assert.deepEqual(rows.waiting, ['Waiting for food']);
  assert.equal(rows.doing, 'Building a farm');
  assert.equal(rows.jobs[0].label, 'Farm'); assert.equal(rows.jobs[0].workers, 4);
  assert.equal(rows.jobsText, 'Jobs 4 filled, 2 free, 1 idle (half tax)');
  assert.equal(rows.projects[0].status, '60% built'); assert.equal(rows.projects[0].canAuthorize, false);
  assert.equal(rows.projects[1].status, 'Needs your OK'); assert.equal(rows.projects[1].canAuthorize, true);
  assert.equal(rows.suggestions[0].index, 0);
  assert.equal(rows.mood.value, 61); assert.equal(rows.mood.why[0].hint, 'Lower taxes');
  assert.equal(reportRows({ id: 'x', name: 'Rival', owner: 'k' }), null, 'name-only towns have no rows');
  assert.equal(reportRows(s).stock[0].arrow, 'flat', 'no previous value, no arrow');
}
// F4.4b: overviewRows, F4.4: governor talk
{
  const f = structuredClone(state.frontier);
  for (const id of ['s_frontier_1', 's_frontier_2']) f.settlements[id].owner = 'player';
  f.townOrder = ['s_frontier_2', 's_frontier_1'];
  f.roads.r1.state = 'blocked';
  const copy = JSON.stringify(f);
  const rows = overviewRows(f, 'player', {}, { s_frontier_1: ['road blocked'] });
  assert.equal(JSON.stringify(f), copy, 'does not change its input');
  assert.deepEqual(rows.map(r => r.id), ['s_frontier_2', 's_frontier_1']);
  assert.equal(rows[1].pop, '8/12'); assert.equal(rows[1].road, 'blocked'); assert.deepEqual(rows[1].alerts, ['road blocked']);
  assert.equal(overviewRows(f, 'nobody').length, 0);
  assert.equal(overviewRows(null, 'player').length, 0);
  const rr = reportRows({ ...f.settlements.s_frontier_1, mood: 80 });
  assert.match(governorSays(rr).text, /\S/);
  assert.deepEqual(talkCommand('squeeze', rr), { action: 'setTax', settlement: 's_frontier_1', level: 'high' });
  assert.equal(talkCommand('ease', { id: 'x', steer: { tax: 'low' } }).level, 'low');
  assert.equal(talkCommand('close', rr), null);
}
// F4.4d: hover cards
{
  const mine = { ...structuredClone(state.frontier.settlements.s_frontier_1), owner: 'player', mood: 70 };
  const card = hoverCard(mine, { clan: 'player', roads: state.frontier.roads });
  assert.equal(card.mine, true); assert.ok(card.lines.some(([k, v]) => k === 'Pop' && v === '8 / 12'));
  assert.ok(card.lines.some(([k]) => k === 'Road'));
  const rival = hoverCard({ id: 's_frontier_2', name: 'Second Frontier', owner: 'kuroda', region: 'x', site: 'S29' }, { clan: 'player', clanName: () => 'Kuroda' });
  assert.equal(rival.mine, false); assert.equal(rival.lines.length, 0); assert.match(rival.sub, /Kuroda/);
  assert.equal(hoverCard(null), null);
}
console.log('test_frontier_report: ok');
