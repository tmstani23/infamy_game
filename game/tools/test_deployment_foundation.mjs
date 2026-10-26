import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNav } from '../src/sim/nav.js';
import { createDeployment } from '../src/sim/deployment.js';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const district = { bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, buildings: [] };
const state = { clans: { p: { id: 'p', kind: 'yakuza' }, n: { id: 'n', kind: 'ninja' } }, entities: {}, businesses: {} };
const deployment = createDeployment({ state, district, nav: createNav([], district.bounds) });
const sectors = state.deployment.sectors.map(s => s.id);
let seq = 0;
const add = (group = 'home', extra = {}) => {
  const e = { id: String(++seq), owner: 'p', type: 'thug', hp: 200, maxHp: 200, deployment: { group }, ...extra };
  state.entities[e.id] = e; deployment.onSpawn(e); return e;
};
assert.equal(state.deployment.clans.p.reserveTarget, 2);
assert.ok(Object.values(state.deployment.clans.p.sectors).every(s => s.task === 'patrol'));
assert.ok(Object.values(state.deployment.clans.n.sectors).every(s => s.task === 'watch'));
assert.equal(state.deployment.restrictionsEnabled, false, 'do not restrict orders before transfers/UI exist');
const heroCrew = Array.from({ length: 6 }, () => add('hero'));
const local = Object.fromEntries(sectors.map(id => [id, Array.from({ length: 3 }, () => add(id))]));
const spare = add();
assert.equal(deployment.overflowAvailable('p'), true);
assert.equal(deployment.canAssign('p', [spare.id], 'hero').ok, false);
assert.equal(deployment.canAssign('p', [spare.id], sectors[0]).ok, true);
assert.equal(deployment.nextAutomaticSector('p'), sectors[0]);
spare.deployment.group = sectors[0];
assert.equal(deployment.nextAutomaticSector('p'), sectors[1], 'balance additional overflow across sectors');
const reserve = add();
local[sectors[1]][0].dead = true;
assert.equal(deployment.counts('p')[sectors[0]], 4, 'existing overflow survives a casualty elsewhere');
assert.equal(deployment.canAssign('p', [reserve.id], sectors[0]).ok, false, 'further overflow needs every normal sector full');
assert.equal(deployment.canAssign('p', [spare.id], sectors[0]).ok, true, 'keeping existing overflow is not a new placement');
assert.equal(deployment.canAssign('p', [reserve.id], sectors[1]).ok, true, 'normal vacancy can be filled');
assert.equal(deployment.nextAutomaticSector('p'), sectors[1]);
assert.equal(deployment.canAssign('p', [local[sectors[2]][0].id], sectors[0]).ok, false, 'cannot create overflow by emptying a normal source slot');
for (let i = 0; i < 25; i++) add();
assert.equal(deployment.counts('p').home, 26, 'home deployment has no separate slot cap');
assert.equal(deployment.canAssign('p', [reserve.id], 'home').ok, true);
const guard = add('home', { guard: 'b0' }), enemy = add('home', { owner: 'n' });
assert.equal(deployment.canAssign('p', [guard.id], 'hero').ok, false);
assert.equal(deployment.canAssign('p', [enemy.id], 'hero').ok, false);
delete state.entities[heroCrew[0].id];
assert.equal(deployment.counts('p').hero, 5, 'dismissal releases membership without a stale roster entry');
const before = JSON.stringify(state.deployment);
deployment.counts('p'); deployment.canAssign('p', [reserve.id], 'hero'); deployment.nextAutomaticSector('p');
assert.equal(JSON.stringify(state.deployment), before, 'UI queries never mutate deployment state');
assert.deepEqual(JSON.parse(JSON.stringify(state.deployment)), state.deployment, 'membership/tasks are plain syncable data');

// Exercise the real public map/nav and actual match initialization once.
const g = createGame({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), settings: { ...data('data/settings.json'), dayNight: { auto: false } } });
setupMatch(g, { clan: 'kuroda', difficulty: 'easy', bots: data('data/bots.json') });
for (const clan of Object.values(g.state.clans)) {
  const crew = g.clans.crewOf(clan.id);
  assert.equal(crew[0].deployment.group, 'hero', 'starting escorts belong to each hero group');
  assert.equal(crew[0].order.kind, 'follow', 'membership does not replace existing starting orders');
  assert.equal(g.state.deployment.clans[clan.id].reserveTarget, 2);
}
const recruit = g.state.entities[g.spawn('thug', 'thug', 6, 8, { owner: 'player' })];
assert.equal(recruit.deployment.group, 'home');
assert.equal(recruit.order, undefined, 'reserve membership never creates automatic Follow');
assert.equal(g.deployment.sectorAt(-97, 48), 'village');
assert.equal(g.deployment.sectorAt(Infinity, 0), null);
for (const b of Object.values(g.state.businesses).filter(b => b.room && !b.hideout)) {
  const expected = g.deployment.sectorAt(...b.ring);
  assert.ok(expected, `${b.id} entrance belongs to a town sector or village`);
  assert.equal(g.deployment.sectorAt(0, 0, b.room), expected, `${b.id} interior belongs to its entrance sector`);
}
const grid = g.deployment.cellGrid();
for (const [label, s] of g.state.deployment.sectors.entries()) {
  const start = grid.cells.indexOf(label), visited = new Set([start]), queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head], x = k % grid.w, z = Math.floor(k / grid.w);
    for (const next of [x > 0 ? k - 1 : -1, x + 1 < grid.w ? k + 1 : -1, z > 0 ? k - grid.w : -1, z + 1 < grid.h ? k + grid.w : -1]) {
      if (next >= 0 && grid.cells[next] === label && !visited.has(next)) { visited.add(next); queue.push(next); }
    }
  }
  assert.equal(visited.size, grid.cells.reduce((n, v) => n + Number(v === label), 0), `${s.name} is connected around public blockers`);
  assert.equal(g.deployment.sectorAt(s.anchor.x, s.anchor.z), s.id);
}
g.step();
assert.notEqual(recruit.order?.kind, 'follow', 'automatic reserve relocation never issues Follow');
console.log('Deployment foundation: connected sectors, public-map entrances, clan membership, home reserves, capacities/overflow, no automatic Follow and serializable state passed');
