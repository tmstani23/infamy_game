import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { townCellsToProps, townProps } from '../src/town_props.js';

const { townArt: art } = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const grid = { n: 3, cell: 11, ground: 'ccccccccc', use: '.........', zone: '.........', stage: '000000000' };
const patches = townCellsToProps(grid, art).filter(p => p.key.endsWith(':clear'));
assert.equal(patches.length, 9);
assert.deepEqual(patches.find(p => p.cell === 4).edges, [0, 0, 0, 0], 'interior cells have no faded seams');
assert.deepEqual(patches.find(p => p.cell === 0).edges, [1, 0, 1, 0], 'corner fades only towards outside');
const blocked = townCellsToProps({ ...grid, ground: 'ccccxcccc' }, art);
assert.equal(blocked.some(p => p.cell === 4), false, 'unbuildable ground is preserved');
assert.equal(blocked.find(p => p.cell === 3 && p.dirt).edges[1], 1, 'clearing fades beside an unbuildable cell');
for (const p of patches) {
  assert.ok(existsSync(new URL(`../${p.texture}`, import.meta.url)), 'uses an existing texture');
  assert.ok(p.tile > 0 && p.edgeFade > 0 && p.opacity > 0 && p.opacity <= 1);
}
const town = { id: 't', x: 0, z: 0, grid, buildings: [], projects: [{ id: 'p', cell: 4, phase: 'cleared' }] };
const project = townProps([town], art).find(p => p.key === 't:p:dirt');
assert.equal(project.texture, art._ground.clearTexture, 'construction footprints use the same earth');
assert.deepEqual(project.edges, [1, 1, 1, 1]);
console.log('test_town_ground: ok');
{
  // every road tile and the field texture exist
  const { existsSync } = await import('node:fs');
  for (let m = 0; m < 16; m++) assert.ok(existsSync(new URL(`../art/ground/road/road_${m}.png`, import.meta.url)), `road tile ${m}`);
  assert.ok(existsSync(new URL(`../${art._ground.fieldTexture}`, import.meta.url)), 'field texture');
  console.log('test_town_ground: road tiles ok');
}
