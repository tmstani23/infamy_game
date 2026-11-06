// Quest log (Tim 2026-11-06): sim/campaign_goals.js gives the campaign's current goal, read-only.
// Classic has none; Campaign walks permit -> settlers -> found -> Influence, and the permit rows match
// landOffice.permitStatus() (the telegraph office blink check).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const frontier = data('data/frontier.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier });
function match(mode) {
  const g = createGame(options());
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode, bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 }, seed: 77 });
  return { g, hero: g.state.entities[m.heroId], clan: g.state.clans.player };
}

{ const { g } = match('classic'); assert.equal(g.goals.current('player'), null, 'Classic has no goal card'); }

const { g, clan } = match('campaign');
const before = JSON.stringify(g.state.clans);
let goal = g.goals.current('player');
assert.equal(goal.step, 0); assert.match(goal.title, /founding permit/);
const st = g.landOffice.permitStatus('player');
for (const r of st.rows) {
  const row = goal.rows.find(x => x.have === r.have && x.need === r.need);
  assert.ok(row && row.done === r.ok, `row ${r.label} matches permitStatus`);
  assert.ok(row.done || row.how.length > 0, `unmet ${r.label} says how`);
}
assert.ok(goal.rows.every(r => r.icon && r.label), 'every row has a seal and a label');
assert.equal(JSON.stringify(g.state.clans), before, 'goals write nothing');

clan.permit = true;
goal = g.goals.current('player');
assert.equal(goal.step, 1); assert.match(goal.rows[0].how, /telegraph office/);

const settlers = g.clans.settlersOf;
g.clans.settlersOf = () => Array(frontier.founding.minSettlers).fill({});
goal = g.goals.current('player');
assert.equal(goal.step, 2); assert.match(goal.title, /Leave the city/); assert.ok(goal.gate, 'the gate gets the gold hint');
const hero = Object.values(g.state.entities).find(e => e.type === 'hero' && e.owner === 'player'), place = hero.place;
hero.place = 'world';
goal = g.goals.current('player');
assert.equal(goal.step, 3); assert.match(goal.title, /Found your town/);
assert.ok(goal.rows.some(r => r.label === 'Town founded' && !r.done && /Found a town here/.test(r.how)));
hero.place = place;
g.clans.settlersOf = settlers;

// settlers (Tim 2026-11-06) wait safely at the HQ as a count, then step out beside the hero at the gate
{
  const office = g.landOffice.office();
  Object.assign(hero, { place: 'street', x: office.ring[0], z: office.ring[1] });
  g.step([{ id: hero.id, type: 'hire', business: office.id, unit: 'settler', count: 5 }]);
  for (let i = 0; i < 20 * 120 && clan.queue.length; i++) g.step([]);
  assert.equal(clan.settlersWaiting, 5, 'five settlers wait at the HQ');
  assert.equal(g.clans.settlersOf('player').length, 0, 'no settler units in the city to be hurt');
  assert.equal(g.goals.current('player').step, 2, 'goal: leave the city');
  const gc = g.gate.city;
  Object.assign(hero, { place: 'street', x: gc[0], z: gc[1] });
  g.step([{ id: hero.id, type: 'expedition', action: 'walk', units: [] }]);
  assert.equal(hero.place, 'world', 'out on the island');
  const out = g.clans.settlersOf('player');
  assert.equal(out.length, 5, 'the waiting settlers stepped out with the hero');
  assert.ok(out.every(u => u.place === 'world' && Math.hypot(u.x - hero.x, u.z - hero.z) < 10));
  assert.equal(clan.settlersWaiting, 0);
  assert.equal(g.goals.current('player').step, 3, 'goal: found the town');
  console.log('settlers wait at HQ ok');
}

// once the clan holds every town it may found, the goal is the next Influence tier
g.state.frontier.settlements.__t = { owner: 'player', founded: true, name: 'Test' };
clan.permit = false;
goal = g.goals.current('player');
assert.equal(goal.step, 4); assert.match(goal.title, /Influence/);
assert.equal(goal.rows[0].label, 'Influence');
delete g.state.frontier.settlements.__t;
console.log('campaign goals ok');

// Shinobi (Tim 2026-11-06): no business requirement, a ryo cost instead
{
  const g2 = createGame(options());
  setupMatch(g2, { clan: 'shinobi', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 100 }, seed: 77 });
  const c = g2.state.clans.player, S = frontier.founding.permit.shinobi;
  const st2 = g2.landOffice.permitStatus('player');
  assert.ok(!st2.rows.some(r => r.label === 'Businesses held'), 'Shinobi need no businesses');
  const ryo = st2.rows.find(r => r.label === 'Ryo');
  assert.ok(ryo && ryo.need === S.ryo && !ryo.ok, 'Shinobi permit costs ryo');
  assert.ok(g2.goals.current('player').rows.some(r => r.label === 'Ryo' && /contracts/.test(r.how)), 'goal card shows the ryo seal');
  c.ryo = S.ryo; assert.ok(g2.landOffice.permitStatus('player').rows.find(r => r.label === 'Ryo').ok);
  console.log('shinobi permit ok');
}
