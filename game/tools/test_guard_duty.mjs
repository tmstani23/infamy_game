import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json') });
import { createDeploymentAI } from '../src/sim/deployment_ai.js';
// Guard duty (Tim 2026-11-10): each day half the sectors where the clan holds a business guard their most expensive
// one and the others patrol; the halves swap each day. A business under a raid or shakedown is guarded at once.
// Going back to patrol restores the old patrol point. A guard duty set by hand is left alone.
const g = createGame(options());
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 3000 }, seed: 9 });
const S = g.state, hero = S.entities[m.heroId], rec = S.deployment.clans.player;
for (let i = 0; i < 30; i++) g.step([]);
assert.ok(S.deployment.restrictionsEnabled, 'deployment rules are on');
for (const b of Object.values(S.businesses)) if (b.owner === 'player' && !b.hideout) g.clans.setOwner(b.id, null);
const price = b => g.businesses.rules[b.kind]?.price || 0, sectorOf = b => g.deployment.sectorAt(...b.ring);
const free = Object.values(S.businesses).filter(x => !x.owner && !x.hideout && x.room && x.ring && sectorOf(x));
const sectors = [...new Set(free.map(sectorOf))].sort().slice(0, 2);
assert.equal(sectors.length, 2, 'two sectors with businesses');
const mine = sectors.map(id => free.filter(b => sectorOf(b) === id).slice(0, 2));
for (const b of mine.flat()) g.clans.setOwner(b.id, 'player');
const best = mine.map(list => list.slice().sort((a, b) => price(b) - price(a))[0]);
const objective0 = sectors.map(id => ({ ...rec.sectors[id].objective }));
let ai = createDeploymentAI(g, { clan: 'player', hero: hero.id });
const tickAI = (after = () => {}) => { S.tick += 40; const c = ai.tick().filter(x => x.type === 'deployment' && x.action === 'assignment'); after(); g.step(c); S.tick--; return c; };
const duty = () => sectors.map(id => rec.sectors[id].task === 'guard' ? rec.sectors[id].business : 'patrol');
// day A: one of the two sectors guards its most expensive business
tickAI();
const a = duty(), ia = a.findIndex(x => x !== 'patrol');
assert.equal(a.filter(x => x !== 'patrol').length, 1, `half the sectors guard: ${a}`);
assert.equal(a[ia], best[ia].id, 'the most expensive business');
assert.equal(tickAI().length, 0, 'no change the same day');
// saved and loaded, next day: the halves swap and the old patrol point is back
const ai2 = createDeploymentAI(g, { clan: 'player', hero: hero.id }); ai2.loadState(JSON.parse(JSON.stringify(ai.saveState()))); ai = ai2;
S.season.day++;
tickAI(); tickAI();
const d2 = duty();
assert.equal(d2[ia], 'patrol', 'yesterday\'s guards patrol'); assert.equal(d2[1 - ia], best[1 - ia].id, 'the other half guards');
const t = rec.sectors[sectors[ia]];
assert.ok(Math.hypot(t.objective.x - objective0[ia].x, t.objective.z - objective0[ia].z) < 3, 'the old patrol point is back');
// a shakedown on a business in the patrolling sector: guarded at once, released when it is over
const rival = Object.keys(S.deployment.clans).find(c => c !== 'player'), rt = Object.values(S.deployment.clans[rival].sectors)[0];
const other = mine[ia].find(b => b.id !== best[ia].id) || best[ia];
rt.operation = { kind: 'shakedown', defender: 'player', business: other.id };
tickAI(() => { delete rt.operation; });
assert.equal(duty()[ia], other.id, 'the business under a shakedown is guarded');
tickAI(); tickAI();
assert.equal(duty()[ia], 'patrol', 'back on patrol when it is over');
// a raid does the same
S.attacks ||= {}; S.attacks.test = { mode: 'raid', defender: 'player', business: other.id, clan: rival };
tickAI(() => { delete S.attacks.test; });
assert.equal(duty()[ia], other.id, 'the business under a raid is guarded');
tickAI(); tickAI();
// a guard duty set by hand is never undone
g.step([{ id: hero.id, type: 'deployment', action: 'assignment', sector: sectors[ia], task: 'guard', business: other.id }]);
S.season.day += 2; tickAI(); tickAI();
assert.equal(duty()[ia], other.id, 'a duty set by hand stays');
console.log('test_guard_duty: ok');
