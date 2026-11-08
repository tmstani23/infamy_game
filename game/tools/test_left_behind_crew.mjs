// Tim 2026-11-08: when the boss is out on the island, Hero group crew left in the city become HQ reserves (the
// lieutenant can staff sectors with them); city crew cannot transfer out to the island Hero group; sector crew or
// reserves who are out on the island with him join his Hero group. Run: node game/tools/test_left_behind_crew.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const opts = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json') };
const g = createGame(opts);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: opts.district.spawns, test: { playerRyo: 3000 }, seed: 9 });
const S = g.state.entities, hero = S[m.heroId], me = hero.owner, D = g.deployment;
const left = [0, 1, 2].map(i => g.spawn('thug', 'thug', hero.x + i * 0.6, hero.z + 1, { owner: me, place: hero.place, deployment: { group: 'hero', everAssigned: true }, order: { kind: 'follow', target: hero.id } }));
g.step([]);
assert.ok(left.every(id => S[id].deployment.group === 'hero'));
const gate = g.doors.find(d => d.gate && d.place === 'world');
Object.assign(hero, { place: 'world', x: gate.to.x, z: gate.to.z });
for (let i = 0; i < 25; i++) g.step([]);
assert.ok(left.every(id => (S[id].deployment.transfer?.to ?? S[id].deployment.group) === 'home'), 'left-behind Hero group crew head for the HQ reserves');
for (let i = 0; i < 20 * 30; i++) g.step([]);
assert.ok(left.every(id => S[id].deployment.group === 'home' && S[id].place !== 'world'), 'they are HQ reserves in the city');
// a city crewman cannot transfer out to the Hero group on the island
const r = D.canTransfer(hero.id, [left[0]], 'hero');
assert.equal(r.ok, false); assert.match(r.why, /island/);
// a sector crewman out on the island joins the Hero group there and follows the boss
const sector = g.state.deployment.sectors[0].id;
const stray = g.spawn('thug', 'thug', hero.x + 2, hero.z + 2, { owner: me, place: 'world', deployment: { group: sector, everAssigned: true }, order: { kind: 'stop' } });
for (let i = 0; i < 25; i++) g.step([]);
assert.equal(S[stray].deployment.group, 'hero', 'stray sector crew on the island join the Hero group');
assert.equal(S[stray].order?.kind, 'follow');
// back in the city: reserves stay reserves (no automatic walk back into the Hero group)
const d = g.doors.find(x => x.to && x.gate && x.place === 'street');
Object.assign(hero, { place: 'street', x: d.to.x, z: d.to.z });
for (let i = 0; i < 60; i++) g.step([]);
assert.ok(left.every(id => (S[id].deployment.transfer?.to ?? S[id].deployment.group) !== 'hero' || !S[id].deployment.everAssigned), 'reserves are not pulled back by an old saved group');
console.log('test_left_behind_crew: ok');
