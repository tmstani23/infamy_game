// F2.2b: frontier guards. Run from the repo root: node game/tools/test_frontier_guards.mjs
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, cpSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createFrontierWorld } from '../src/sim/frontier/world.js';
import { scan } from './frontier_lint.mjs';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));

// 1. clean tree has no violations
assert.deepEqual(scan(src), [], 'clean tree');

// 2. planted bad lines in a temp copy are caught, in each rule
const tmp = mkdtempSync(tmpdir() + '/frontier_guards_') + '/';   // outside the project folder
mkdirSync(tmp + 'sim/frontier', { recursive: true });
mkdirSync(tmp + 'render', { recursive: true });
cpSync(src + 'sim/frontier/world.js', tmp + 'sim/frontier/world.js');
assert.deepEqual(scan(tmp), [], 'the owning module may write');
const bad = {
  'sim/frontier/economy.js': ['s.stock.food = 5;', 'settlement.stock.food -= 1;', 'settlement.owner = "x";', 'shipment.cargo.timber += 3;', 'army.units = [];'],
  'render/town_view.js': ['game.state.frontier.settlements.s1.pop = 3;']
};
for (const [file, lines] of Object.entries(bad)) {
  for (const line of lines) {
    writeFileSync(tmp + file, `const ok = 1;\n${line}\n`);
    const hits = scan(tmp);
    assert.equal(hits.length, 1, `caught: ${line}`);
    assert.equal(hits[0].file, file);
  }
  rmSync(tmp + file);
}
// things that must NOT be flagged: comparisons, reads, other records' owner
writeFileSync(tmp + 'sim/frontier/economy.js', [
  'if (settlement.owner === e.owner) {}', 'const x = s.stock.food;', 'e.owner = "player";', 'b.owner = id;', '// s.stock.food = 5', 'op.units = [];'
].join('\n'));
assert.deepEqual(scan(tmp), [], 'reads and unrelated writes are fine');
rmSync(tmp, { recursive: true, force: true });

// 3. checkInvariants throws when stock is set negative by hand, or totals no longer match
{
  const state = { tick: 0 };
  const world = createFrontierWorld({ state, data });
  world.checkInvariants();
  state.frontier.settlements.s_frontier_1.stock.food = -1;
  assert.throws(() => world.checkInvariants(), /frontier invariant/);
  state.frontier.settlements.s_frontier_1.stock.food = 61;   // not through change(): totals disagree
  assert.throws(() => world.checkInvariants(), /start\+in-out/);
  state.frontier.settlements.s_frontier_1.stock.food = 60;
  world.checkInvariants();
  const dup = state.frontier.settlements.s_frontier_1.buildings;
  dup[1].id = dup[0].id;
  assert.throws(() => world.checkInvariants(), /twice/);
}
console.log('test_frontier_guards: ok');
