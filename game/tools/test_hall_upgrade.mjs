// hall upgrade block (2026-11-25): have / need per requirement, what is short, button names what is missing
import assert from 'assert';
import fs from 'fs';
import { hallUpgradeRows, hallUpgradeHTML } from '../src/hall_upgrade.js';
const data = JSON.parse(fs.readFileSync(new URL('../data/frontier.json', import.meta.url), 'utf8'));
const town = () => ({ id: 't1', tier: 2, pop: 20, housing: 32, workers: [{}, {}, {}], workerTraining: [{}], stock: { timber: 1840, stone: 2250, goods: 960 },
  buildings: [{ type: 'town_hall', stage: 'built' }], flow: { timber: { gather: 60, build: -500 } } });
const s = town(), m = hallUpgradeRows(s, data, null), by = k => m.rows.find(r => r.key === k);
assert.equal(m.name, 'Town');
assert.deepEqual([by('timber').have, by('timber').need, by('timber').ok], [1840, 2250, false]);
assert.ok(by('stone').ok, 'stone at the need is ready');
assert.equal(by('people').have, 24, 'people = townsfolk + workers + in training (as upgradeCheck counts)');
assert.match(by('timber').note, /^410 short, 7 min more$/, 'rate from flows, one-off spends left out');
assert.match(by('goods').note, /not rising now/);
assert.match(by('people').note, /Only 32 beds, build housing/);
let h = hallUpgradeHTML(s, data, null);
assert.ok(h.includes('1 of 4 ready') && h.includes('Needs more timber, goods and people') && h.includes('data-upgrade="t1"') && h.includes('class="ti-up tg-btn no"'));
assert.ok(hallUpgradeHTML(s, data, null, { act: 'upgrade' }).includes('data-act="upgrade"'), 'town panel button');
Object.assign(s, { pop: 57, stock: { timber: 2500, stone: 2300, goods: 2250 } });
h = hallUpgradeHTML(s, data, null);
assert.ok(h.includes('Ready to raise the hall') && h.includes('ti-go') && h.includes('Uses 2,250 each of timber, stone and goods'));
h = hallUpgradeHTML(s, data, { frontier: { wars: { list: { w: { town: 't1' } } } } });
assert.ok(h.includes('Not while a war is on this town') && !h.includes('Ready to raise'));
s.tierUpgrade = { to: 3, left: 200, total: 300 };
h = hallUpgradeHTML(s, data, null);
assert.ok(h.includes('3 min 20 s left') && h.includes('of 5 min'));
assert.equal(hallUpgradeHTML({ ...town(), tier: 3 }, data, null), '', 'highest tier: no block');
console.log('test_hall_upgrade: ok');
