// Frontier E5: plots of a founded town and the hover card text (src/town_props.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawableTowns, townPlots, plotInfo } from '../src/town_props.js';
const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const fr = { settlements: { t1: { id: 't1', name: 'Test Town', owner: 'player', x: 100, z: 100, pop: 5, housing: 6, mood: 90, stock: { food: 50.4, timber: 10, stone: 3 },
  buildings: [{ id: 't1:0', type: 'town_hall', cell: 0, stage: 'built', workers: 0 }, { id: 't1:1', type: 'farm', cell: 1, stage: 'built', workers: 3 }],
  projects: [{ id: 'p1', type: 'stockade', cell: 2, cost: { timber: 40 }, paid: true, progress: 30, need: 60, authorized: true }] } } };
const towns = drawableTowns(fr, 'player'), plots = townPlots(towns);
assert.equal(plots.length, 3);
const hall = plotInfo(fr, plots[0], data), farm = plotInfo(fr, plots[1], data), proj = plotInfo(fr, plots[2], data);
assert.match(hall.lines.join('|'), /Test Town: 5 people/); assert.match(hall.lines.at(-1), /Right-click/);
assert.match(farm.lines.join('|'), /Workers 3\/4/);
assert.match(proj.lines.join('|'), /50%/);
assert.equal(plotInfo(fr, { town: 'zz', kind: 'building', id: 'x' }, data), null);
console.log('test_town_hover: ok');
