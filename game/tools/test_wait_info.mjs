// Frontier E5 polish: the "Waiting for <resource>" chip knows how full it is and how long it will take.
import assert from 'node:assert/strict';
import { waitInfo } from '../src/frontier_report.js';
const s = { stock: { timber: 10, food: 0, stone: 0, goods: 0, ryo: 0 }, report: { rate: { timber: 0.5 } },
  projects: [{ id: 'p1', type: 'stockade', authorized: true, paid: false, cost: { timber: 40 } }] };
const w = waitInfo(s, 'timber');
assert.equal(w.fill, 0.25);
assert.match(w.tip, /needs 40 timber: 10 in stock, 30 short/); assert.match(w.tip, /about 60 s/);
s.report.rate.timber = 0; assert.match(waitInfo(s, 'timber').tip, /No timber is coming in/);
assert.equal(waitInfo(s, 'forest node'), null);
s.projects[0].paid = true; assert.equal(waitInfo(s, 'timber'), null);
console.log('test_wait_info: ok');
