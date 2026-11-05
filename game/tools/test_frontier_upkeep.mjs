// Economy balance B5: upkeep and goods needs. Run from the repo root: node game/tools/test_frontier_upkeep.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontier } from '../src/sim/frontier/frontier.js';
import { centreCell } from '../src/sim/frontier/town_grid.js';
import { payUpkeep } from '../src/sim/frontier/upkeep.js';

const base = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const U = base.upkeep, K = base.zones.kinds;
function fresh(stock, edit) {
  const data = structuredClone(base); delete data.tiers; edit?.(data);
  const state = { tick: 0, entities: {}, news: [] };
  const fr = createFrontier({ state, data });
  fr.world.addTown({ id: 't', name: 'Town', owner: 'player', x: 3000, z: 3000, pop: 20, stock, buildings: [{ type: 'town_hall', cell: 0 }] });
  void fr.world;
  const s = state.frontier.settlements.t, n = s.grid.n, C = centreCell(n);
  const at = (x, z) => C + z * n + x;
  const put = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);
  // paint grown cells straight into the grid (zone char + stage), cleared ground
  const grow = (kind, list, stage) => { for (const i of list) { s.grid.zone = put(s.grid.zone, i, K[kind].char); s.grid.stage = put(s.grid.stage, i, String(stage)); s.grid.ground = put(s.grid.ground, i, 'c'); } };
  const econ = k => { for (let i = 0; i < k * data.cadenceTicks; i++) { state.tick++; fr.tick(); } };
  return { data, state, fr, s, at, grow, econ };
}
const row = (at, z, k) => Array.from({ length: k }, (_, x) => at(x - 8, z));

// small towns pay nothing (free allowance); bigger ones pay per level above it, in the right resources
{
  const { data, fr, s, at, grow } = fresh({ food: 500, timber: 500, stone: 500, goods: 0, ryo: 50 });
  grow('farm', row(at, 3, U.freeLevels), 1);
  const t0 = s.stock.timber; payUpkeep(s, data, fr.world);
  assert.equal(s.stock.timber, t0, 'free allowance');
  grow('farm', row(at, 4, U.freeLevels), 1);   // twice the allowance: half the levels pay
  payUpkeep(s, data, fr.world);
  assert.ok(Math.abs(t0 - s.stock.timber - U.zones.farm.timber * U.freeLevels * 2 * 0.5) < 1e-9);
  s.workers = [{ id: 'w1' }, { id: 'w2' }];
  const r0 = s.stock.ryo; payUpkeep(s, data, fr.world);
  assert.ok(Math.abs(r0 - s.stock.ryo - U.workerWage.ryo * 2) < 1e-9, 'wages');
  fr.world.checkInvariants();
}

// unpaid zone upkeep lowers that zone's health; stock never goes negative
{
  const { s, at, grow, econ } = fresh({ food: 5000, timber: 0, stone: 0, goods: 0, ryo: 0 });
  grow('farm', row(at, 3, U.freeLevels * 3), 1);
  econ(3);
  assert.ok(s.zones.farm.health < 1, 'short upkeep lowers health');
  assert.ok(s.report.waiting.includes('upkeep'));
  assert.ok(s.stock.timber >= 0);
}

// housing: level 2+ needs goods; without goods it stays (never declines) and mood dips; with goods it grows
{
  const make = goods => {
    const f = fresh({ food: 5000, timber: 5000, stone: 500, goods, ryo: 50 });
    f.fr.command({ owner: 'player' }, { type: 'frontier', town: 't', action: 'place', kind: 'road', cells: [f.at(1, 0)] });
    f.grow('housing', [f.at(1, 1), f.at(2, 1)], 2);
    return f;
  };
  const poor = make(0), rich = make(500);
  poor.econ(K.housing.growTicks * 2 + 5); rich.econ(K.housing.growTicks * 2 + 5);
  assert.equal(poor.s.grid.stage[poor.at(1, 1)], '2', 'no goods: stays at its level');
  assert.equal(rich.s.grid.stage[rich.at(1, 1)], '3', 'goods paid: grows');
  assert.ok(rich.s.stock.goods < 500, 'level 2+ housing uses goods');
  // a town that runs out of goods keeps its levels and loses a little mood
  const f = make(0); f.grow('housing', [f.at(1, 1)], 3); f.econ(5);
  assert.equal(f.s.grid.stage[f.at(1, 1)], '3');
  assert.equal(f.s.goodsShort, true);
  assert.ok(f.s.mood < 100);
}
console.log('test_frontier_upkeep: ok');
