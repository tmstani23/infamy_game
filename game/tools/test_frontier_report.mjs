// F2.4b: the dev readout only reads snapshot data. Run: node game/tools/test_frontier_report.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontierWorld } from '../src/sim/frontier/world.js';
import { frontierReport } from '../src/frontier_report.js';

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
console.log('test_frontier_report: ok');
