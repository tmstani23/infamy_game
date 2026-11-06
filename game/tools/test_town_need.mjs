// Tim 2026-11-06: town Need score (sim/frontier/alerts.js townNeed) and the all-towns window sort.
// Run: node game/tools/test_town_need.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontierWorld } from '../src/sim/frontier/world.js';
import { createAlerts, townNeed } from '../src/sim/frontier/alerts.js';
import { overviewRows, SORTS } from '../src/frontier_report.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const state = { tick: 0 };
createFrontierWorld({ state, data });
const f = state.frontier, s = f.settlements.s_frontier_1;
s.owner = 'player'; s.mood = 80; s.safety = 100; s.suggestions = []; s.report = { waiting: [] }; s.housing = 999;
// a calm town is OK
let n = townNeed(s, f, data);
assert.equal(n.level, 'ok', JSON.stringify(n)); assert.equal(n.score, 0);
// a governor suggestion alone is Low
s.suggestions = [{ type: 'farm' }];
assert.equal(townNeed(s, f, data).level, 'low');
// food running out is High; add low mood and it stays High or worse
s.report.waiting = ['food'];
assert.equal(townNeed(s, f, data).level, 'high');
s.mood = 20;
n = townNeed(s, f, data);
assert.equal(n.level, 'urgent'); assert.equal(n.why[0].text, 'mood 20', 'worst reason first');
// a recent attack is Urgent on its own, and fades after recentEcon economy ticks
s.mood = 80; s.report.waiting = []; s.suggestions = [];
f.econTick = 100;
assert.equal(townNeed(s, f, data, { at: { attack: 95 } }).level, 'urgent');
assert.equal(townNeed(s, f, data, { at: { attack: 100 - data.alerts.need.recentEcon } }).level, 'ok');
// a blocked road counts
f.roads = { rx: { from: s.id, to: 'capital', state: 'blocked' } };
assert.equal(townNeed(s, f, data).level, 'high');
f.roads = {};
// the alerts tick stores it on the town (so the snapshot carries it to the screen)
const alerts = createAlerts({ state, data });
s.report.waiting = ['food']; state.news = [];
alerts.econTick();
assert.equal(s.need.level, 'high');
// the all-towns rows carry it and the Need sort puts the worst first
const t2 = structuredClone(s); t2.id = 's_two'; t2.name = 'Second'; t2.need = { score: 60, level: 'urgent', why: [{ text: 'under attack', score: 50 }] };
f.settlements.s_two = t2; f.townOrder = [s.id, 's_two'];
const rows = overviewRows(f, 'player').sort(SORTS.need);
assert.deepEqual(rows.map(r => r.id), ['s_two', s.id]);
assert.equal(rows[0].need, 'urgent'); assert.deepEqual(rows[0].needWhy, ['under attack']);
console.log('town need: ok');
