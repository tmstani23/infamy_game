// Minimap military badges (Tim 2026-11-19): town and war camp military buildings get lettered badges, two letters
// where another badge has the first; enemy ones only as last seen (the snapshot sends remembered buildings only).
import assert from 'node:assert/strict';
import { majorBuildings, MAJOR_BUILDINGS, drawBuildingBadge } from '../src/minimap_icons.js';
import { frontierFor } from '../src/sim_snapshot.js';

// letters are unique and one or two characters
const letters = Object.values(MAJOR_BUILDINGS).map(x => x[0]);
for (const l of letters) assert.ok(/^[A-Z][a-z]?$/.test(l), l);
const dupes = letters.filter((l, i) => letters.indexOf(l) !== i);
assert.deepEqual(dupes, ['R'], 'only the railway and camp station share R');
for (const k of ['barracks', 'armory', 'watchtower', 'rifle_range', 'supply_tents', 'field_clinic', 'foundry', 'clan_hall', 'kennel', 'hidden_dojo']) assert.equal(MAJOR_BUILDINGS[k][2], true, k);

const grid = { n: 9, cell: 10, use: [], zone: [] };
const town = (id, owner, buildings) => ({ id, name: id, owner, x: 0, z: 0, tier: 2, grid, buildings });
const f = {
  settlements: {
    a: town('a', 'player', [{ id: 'b1', type: 'barracks', cell: 10, stage: 'built' }, { id: 'b2', type: 'rifle_range', cell: 20, stage: 'site' }, { id: 'b3', type: 'stockade', cell: 30, stage: 'built' }, { id: 'b4', type: 'house', cell: 40, stage: 'built' }]),
    k: town('k', 'kuroda', [{ id: 'k1', type: 'armory', cell: 10, stage: 'built' }, { id: 'k2', type: 'watchtower', cell: 20, stage: 'built' }]),
  },
  wars: { list: { w1: { id: 'w1', town: 'k', attacker: 'player', defender: 'kuroda', camp: { x: 300, z: 0, buildings: [
    { id: 'c1', type: 'camp_hall', x: 300, z: 0, stage: 'built' }, { id: 'c2', type: 'barracks', x: 310, z: 0, stage: 'built' },
    { id: 'c3', type: 'stable', x: 320, z: 0, stage: 'built' }, { id: 'c4', type: 'lumber_camp', x: 330, z: 0, stage: 'built' }, { id: 'c5', type: 'foundry', x: 340, z: 0, stage: 'building' }] } } } },
};
const all = majorBuildings(f), by = t => all.filter(b => b.type === t);
assert.equal(by('barracks').length, 2, 'town and camp barracks');
assert.equal(by('rifle_range').length, 0, 'unfinished: no badge');
assert.equal(by('house').length + by('lumber_camp').length, 0, 'minor buildings: none');
assert.equal(by('stockade')[0].military, true);
assert.equal(by('stable')[0].military, true, 'a camp stable is military');
assert.equal(by('camp_hall')[0].letter, 'Ca');
assert.equal(by('camp_hall')[0].town, 'War camp at k');
assert.equal(by('camp_hall')[0].owner, 'player');
assert.equal(by('armory')[0].owner, 'kuroda');

// the defender's view: the camp shows only what it has seen; an unseen rival town shows nothing
const seen = { remembered: () => ({}), campRemembered: () => ({ c2: { id: 'c2', type: 'barracks', x: 310, z: 0, stage: 'built' } }), seenMask: () => null };
const view = frontierFor(f, 'kuroda', null, [], null, null, null, null, seen);
const theirs = majorBuildings(view);
assert.deepEqual(theirs.filter(b => b.owner === 'player').map(b => b.type).sort(), ['barracks'], `only the seen camp barracks: ${JSON.stringify(theirs.map(b => b.type))}`);

// drawing: a two-letter badge is wider, a military one has a red rim
const calls = [];
const ctx = new Proxy({}, { get: (o, k) => k in o ? o[k] : (...a) => calls.push([k, ...a]), set: (o, k, v) => { o[k] = v; calls.push(['set', k, v]); return true; } });
drawBuildingBadge(ctx, 50, 50, 'Ri', '#333', 8, true);
const rects = calls.filter(c => c[0] === 'strokeRect');
assert.equal(rects[0][3], 12, 'two letters: 1.5x wide');
assert.ok(calls.some(c => c[0] === 'set' && c[1] === 'strokeStyle' && c[2] === '#d23a2a'), 'red rim');
console.log('minimap military badges ok');
