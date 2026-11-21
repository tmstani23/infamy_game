// Safety fund (Tim 2026-11-21, src/sim/frontier/fund.js): the share, the cap, paying, pouring out. No graphics.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fundOf, fundPct, takeShare, fundHas, fundPay, fundEmpty, setFundPct, setFundCap } from '../src/sim/frontier/fund.js';
const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const R = data.war.general.fund;
const town = (owner = 'p', extra = {}) => ({ id: 't', owner, grid: { n: 3 }, founded: 0, autoBuild: true, stock: { timber: 0, stone: 0, ryo: 0, food: 0 }, ...extra });
const state = { clans: { p: {}, b: { bot: true, warStrategy: 'rush' } }, frontier: {} };
const world = s => ({ change: (id, r, v) => { s.stock[r] += v; }, fundIn: (id, r, v) => { s.stock[r] += v; } });

{ // a new town starts at startPct; a typed share is kept, copied to the next town, and must be a whole 0 to 100
  const s = town(); assert.equal(fundOf(s, data, state).pct, R.startPct);
  for (const bad of [-1, 101, 2.5, NaN, '5']) assert.ok(setFundPct(s, data, state, bad), `${bad} is refused`);
  assert.equal(setFundPct(s, data, state, 25), ''); assert.equal(s.fund.pct, 25); assert.equal(s.fund.set, true);
  assert.equal(fundOf(town(), data, state).pct, 25, 'the next town copies his last value');
  for (const no of [{ capital: true }, { camp: true }, { castle: true }]) assert.equal(fundOf(town('p', no), data, state), null, 'capital, castle and war camp have none');
}
{ // income is shared up to the cap; other gains, other resources and spending are not
  const s = town(); fundOf(s, data, state); s.fund.pct = 10;
  assert.equal(takeShare(s, data, state, 'timber', 100, 'gather'), 0, 'no cap yet (the general has not looked): nothing is taken');
  setFundCap(s, world(s), { timber: 15, ryo: 50 }, 'barracks');
  assert.equal(takeShare(s, data, state, 'timber', 100, 'gather'), 10);
  assert.equal(takeShare(s, data, state, 'timber', 100, 'work zone'), 5, 'only up to the cap');
  assert.equal(takeShare(s, data, state, 'timber', 100, 'gather'), 0, 'full: the share stays with the town');
  assert.equal(takeShare(s, data, state, 'ryo', 100, 'fund'), 0, 'money coming back from the fund is not income');
  assert.equal(takeShare(s, data, state, 'food', 100, 'gather'), 0);
  assert.equal(takeShare(s, data, state, 'ryo', -100, 'tax'), 0);
  assert.equal(takeShare(s, data, state, 'stone', 100, 'gather'), 0, 'no stone on his list: none taken');
  // Initiative Off in a player's town: nothing more is set aside, the fund keeps what it has
  s.autoBuild = false; assert.equal(fundPct(s, data, state), 0); assert.equal(takeShare(s, data, state, 'ryo', 100, 'tax'), 0);
  s.autoBuild = true; assert.equal(takeShare(s, data, state, 'ryo', 100, 'tax'), 10);
  s.fund.pct = 0; assert.equal(takeShare(s, data, state, 'ryo', 100, 'tax'), 0, '0 = nothing set aside');
  // paying: only when the whole cost is there, straight into the stock
  assert.equal(fundHas(s.fund, { timber: 15, ryo: 10 }), true); assert.equal(fundHas(s.fund, { timber: 16 }), false);
  assert.equal(fundPay(s, { timber: 16 }, world(s)), false); assert.equal(s.stock.timber, 0);
  assert.equal(fundPay(s, { timber: 15 }, world(s)), true); assert.equal(s.stock.timber, 15); assert.equal(s.fund.timber, 0);
  // a lower cap hands the rest back to the town
  setFundCap(s, world(s), { ryo: 4 }, ''); assert.equal(s.fund.ryo, 4); assert.equal(s.stock.ryo, 6);
  // attacked: ryo into the war chest, the rest into the stock
  s.fund.timber = 7; let chest = 0;
  assert.deepEqual(fundEmpty(s, world(s), v => { chest += v; }), { timber: 7, ryo: 4 });
  assert.equal(chest, 4); assert.equal(s.stock.timber, 22); assert.equal(s.fund.ryo + s.fund.timber, 0);
}
{ // a rival's share comes from its hidden strategy, whatever its town's box says
  const s = town('b', { autoBuild: false }); fundOf(s, data, state).pct = 0;
  assert.equal(fundPct(s, data, state), R.byStrategy.rush);
  state.clans.b.warStrategy = 'siege'; assert.equal(fundPct(s, data, state), R.byStrategy.siege);
  assert.ok(R.byStrategy.rush > R.byStrategy.siege, 'Rush saves more than Siege');
}
console.log('test_safety_fund: ok');
