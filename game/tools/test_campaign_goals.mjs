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
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier,
  resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json') });
function match(mode) {
  const g = createGame(options());
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode, bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 }, seed: 77 });
  return { g, hero: g.state.entities[m.heroId], clan: g.state.clans.player };
}

{ const { g } = match('classic'); assert.equal(g.goals.current('player'), null, 'Classic has no goal card'); }

const { g, clan } = match('campaign');
const before = JSON.stringify(g.state.clans);
// starter goals (Tim 2026-11-06): Yakuza loot, gear up, 3 crew, first business, win a raid; each says how
let goal = g.goals.current('player');
assert.equal(goal.key, 'starter0'); assert.ok(goal.rows.every(r => r.done || r.how), 'starters say how');
const marks = () => clan.milestones;
assert.match(goal.title, /Loot a bandit/);
const bandit = Object.values(g.state.entities).find(e => e.type === 'hero' && e.owner === 'player');
g.state.tick = 10; g.goals.record([], [{ kind: 'loot', a: bandit.id }], [{ reason: 'Shop purchase', clan: 'player', target: 'x' }]);
assert.ok(marks().loots === 1 && marks().gearBought === 1, 'loot and gear purchase recorded');
assert.equal(marks().starters, 1, 'loot done; gear waits for equipping');
assert.match(g.goals.current('player').title, /Gear up/);
marks().starters = 4; assert.match(g.goals.current('player').title, /shakedown/);
marks().starters = 5;
assert.match(g.goals.current('player').title, /Win a raid/);
g.goals.record([{ kind: 'raidWon', raider: 'player', hq: false }]);
assert.equal(marks().raids, 1, 'raid recorded');
g.goals.record([]);
assert.equal(marks().starters, 6, 'raid starter done');
goal = g.goals.current('player');
assert.equal(goal.step, 6); assert.match(goal.title, /founding permit/);
const st = g.landOffice.permitStatus('player');
for (const r of st.rows) {
  const row = goal.rows.find(x => x.have === r.have && x.need === r.need);
  assert.ok(row && row.done === r.ok, `row ${r.label} matches permitStatus`);
  assert.ok(row.done || row.how.length > 0, `unmet ${r.label} says how`);
}
assert.ok(goal.rows.every(r => r.icon && r.label), 'every row has a seal and a label');
{ const before = JSON.stringify(g.state.clans); g.goals.current('player'); assert.equal(JSON.stringify(g.state.clans), before, 'current() writes nothing'); }

clan.permit = true;
goal = g.goals.current('player');
assert.equal(goal.step, 8); assert.match(goal.rows[0].how, /telegraph office/);
// the old surveyor's card comes between the permit and the settlers while his report waits (Tim 2026-11-10)
clan.surveyPending = true;
goal = g.goals.current('player');
assert.equal(goal.step, 7); assert.match(goal.title, /old surveyor/); assert.ok(goal.rows[0].where, 'the surveyor is pinged');
delete clan.surveyPending;

const settlers = g.clans.settlersOf;
g.clans.settlersOf = () => Array(frontier.founding.minSettlers).fill({});
goal = g.goals.current('player');
const hero = Object.values(g.state.entities).find(e => e.type === 'hero' && e.owner === 'player'), place = hero.place;
// lieutenant goal steps (Tim 2026-11-06): meet him at the gate, then open While I'm away and set his budget
assert.equal(goal.step, 9); assert.match(goal.title, /Meet your lieutenant/);
assert.ok(goal.rows[0].where, 'the gate lieutenant is pinged');
g.step([]);
const guide = g.lieutenant.guideOf('player');
assert.ok(guide && guide.guide && guide.place === 'street', 'he waits by the gate');
assert.ok(Math.hypot(guide.x - g.gate.city[0], guide.z - g.gate.city[1]) < 8, 'beside the gate');
assert.ok(!g.clans.crewOf('player').includes(guide), 'not crew');
const door = g.doors.find(d => d.menu === 'lieutenant');
assert.ok(door && /lieutenant/.test(door.label), 'Space here talks to him');
g.step([{ id: hero.id, type: 'lieutenant', guide: 'met' }]);
goal = g.goals.current('player');
assert.equal(goal.step, 10); assert.match(goal.title, /orders/);
assert.deepEqual(goal.rows.map(r => r.done), [false, false]);
g.step([{ id: hero.id, type: 'lieutenant', guide: 'opened' }]);
assert.deepEqual(g.goals.current('player').rows.map(r => r.done), [true, false]);
g.step([{ id: hero.id, type: 'lieutenant', budget: 500 }]);
goal = g.goals.current('player');
assert.equal(goal.step, 11); assert.match(goal.title, /Leave the city/); assert.ok(goal.gate, 'the gate gets the gold hint');
g.step([]);
assert.ok(g.lieutenant.guideOf('player'), 'he stays by the gate while the boss is in the city (Tim 2026-11-10)');
hero.place = 'world';
goal = g.goals.current('player');
assert.equal(goal.step, 12); assert.match(goal.title, /Found your town/);
assert.ok(goal.rows.some(r => r.label === 'Town founded' && !r.done && /Found a town button/.test(r.how)));
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
  assert.equal(g.goals.current('player').step, 11, 'goal: leave the city');
  const gc = g.gate.city;
  Object.assign(hero, { place: 'street', x: gc[0], z: gc[1] });
  g.step([{ id: hero.id, type: 'expedition', action: 'walk', units: [] }]);
  assert.equal(hero.place, 'world', 'out on the island');
  const out = g.clans.settlersOf('player');
  assert.equal(out.length, 5, 'the waiting settlers stepped out with the hero');
  assert.ok(out.every(u => u.place === 'world' && Math.hypot(u.x - hero.x, u.z - hero.z) < 10));
  assert.equal(clan.settlersWaiting, 0);
  assert.equal(g.goals.current('player').step, 12, 'goal: found the town');
  console.log('settlers wait at HQ ok');
}

// once the clan holds every town it may found, the goal is the next Influence tier
g.state.frontier.settlements.__t = { owner: 'player', founded: true, name: 'Test' };
clan.permit = false;
goal = g.goals.current('player');
assert.equal(goal.step, 25); assert.match(goal.title, /Influence/);
assert.equal(goal.rows[0].label, 'Influence');
delete g.state.frontier.settlements.__t;
console.log('campaign goals ok');

// Shinobi (Tim 2026-11-06): no business requirement, a ryo cost instead
{
  const g2 = createGame(options());
  setupMatch(g2, { clan: 'shinobi', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 100 }, seed: 77 });
  const c = g2.state.clans.player, S = frontier.founding.permit.shinobi;
  assert.equal(g2.goals.current('player').key, 'starter0', 'Shinobi start with starters too');
  g2.goals.record([{ kind: 'contractTaken', clan: 'player' }, { kind: 'contractDone', clan: 'player' }]);
  assert.equal(c.milestones.contractsDone, 1);
  c.milestones.starters = 3; assert.match(g2.goals.current('player').title, /Finish a contract/);
  assert.equal(g2.goals.current('player').rows.length, 2, 'the step shows all its requirements');
  c.milestones.starters = 4;
  const st2 = g2.landOffice.permitStatus('player');
  assert.ok(!st2.rows.some(r => r.label === 'Businesses held'), 'Shinobi need no businesses');
  const ryo = st2.rows.find(r => r.label === 'Ryo');
  assert.ok(ryo && ryo.need === S.ryo && !ryo.ok, 'Shinobi permit costs ryo');
  assert.ok(g2.goals.current('player').rows.some(r => r.label === 'Ryo' && /contracts/.test(r.how)), 'goal card shows the ryo seal');
  c.ryo = S.ryo; assert.ok(g2.landOffice.permitStatus('player').rows.find(r => r.label === 'Ryo').ok);
  console.log('shinobi permit ok');
}
// Kuroda (Tim 2026-11-06): Yakuza starters with a sweep in place of the shakedown
{
  const g3 = createGame(options());
  setupMatch(g3, { clan: 'kuroda', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 100 }, seed: 77 });
  const k = g3.state.clans.player; g3.goals.record([{ kind: 'sweepSuccess', clan: 'player' }]);
  k.milestones.starters = 4; const kg = g3.goals.current('player');
  assert.match(kg.title, /sweep/); assert.ok(kg.rows[0].done, 'sweep recorded');
  console.log('kuroda starters ok');
}

// Goal pings (Tim 2026-11-06): unfinished rows name a spot; looting a body counts in the same tick
{
  const { g, clan } = match('campaign');
  g.step([]);
  const where = () => g.goals.current('player').rows.find(r => !r.done)?.where;
  assert.ok(where()?.place === 'street', 'Loot a bandit points at a camp');
  const hero = Object.values(g.state.entities).find(e => e.type === 'hero' && e.owner === 'player');
  const body = g.state.entities[g.spawn('bandit', 'thug', hero.x + 1, hero.z, { wild: true, place: hero.place })];
  Object.assign(body, { dead: true, downed: false, hp: 0, loot: 50 });
  assert.deepEqual([where().x, where().z], [body.x, body.z], 'a glinting body comes first');
  g.step([{ id: hero.id, type: 'loot', target: body.id }]);
  for (let i = 0; i < 40 && !clan.milestones.loots; i++) g.step([]);
  assert.equal(clan.milestones.loots, 1, 'the loot counts (recorded at the end of the tick)');
  for (let i = 0; i < 20; i++) g.step([]);
  assert.equal(g.goals.current('player').title, 'Gear up');
  assert.ok(where(), 'Gear up points at the blacksmith');
  clan.milestones.starters = 99;
  assert.equal(g.goals.current('player').rows.find(r => r.label === 'Permit bought').where, null, 'the office only once the permit is buyable');
  console.log('goal pings ok');
}

// Town setup goals and the town-tier permit row (Tim 2026-11-06)
{
  const { g, clan } = match('campaign');
  g.step([]);
  clan.milestones.starters = 99;
  const town = Object.values(g.state.frontier.settlements).find(s => !s.owner) || null;
  // found a town the quick way: borrow the founding module through a fresh settlement record
  const id = 'tgoal', base = Object.values(g.state.frontier.settlements)[0];
  const n = 9, grid = { n, cell: 50, ground: 'c'.repeat(n * n), use: '.'.repeat(n * n), zone: '.'.repeat(n * n), by: '.'.repeat(n * n), stage: '0'.repeat(n * n) };
  g.state.frontier.settlements[id] = { id, name: 'Test', owner: 'player', founded: true, x: 100, z: 100, tier: 1, pop: 5, stock: { food: 100, timber: 0, stone: 0, goods: 0 }, mood: 100, grid, buildings: [{ type: 'town_hall', stage: 'built', cell: 40 }], workers: [{ id: 'w1' }, { id: 'w2' }] };
  const cur = () => g.goals.current('player');
  assert.equal(cur().key, 'layout');
  assert.deepEqual(cur().rows.map(r => r.label), ['Road cells', 'Housing cells', 'Farm cells', 'Capital businesses']);
  assert.equal(cur().rows[0].where.place, 'world', 'layout rows point at the town');
  grid.use = 'rrr' + grid.use.slice(3); grid.zone = 'hhhhffff' + grid.zone.slice(8);
  assert.equal(cur().key, 'workers');
  const T = g.state.frontier.settlements[id], spots = data('data/world_spots.json').spots, spotOf = k => spots.find(p => p.kind === k).id;
  T.workers[0].spot = spotOf('timber');
  assert.equal(cur().key, 'stone');
  T.workers[1].spot = spotOf('stone');
  assert.equal(cur().key, 'goods');
  grid.zone = grid.zone.slice(0, 8) + 'kk' + grid.zone.slice(10);
  // the governor (Tim 2026-11-06): meet him by the hall, then a focus plus initiative or an approved suggestion
  assert.equal(cur().key, 'governor');
  const me = Object.values(g.state.entities).find(e => e.type === 'hero' && e.owner === 'player');
  g.lieutenant.command(me, { type: 'lieutenant', guide: 'governor' });   // Space beside him (spawn: test_island_respawn)
  assert.equal(cur().key, 'govorders');
  assert.deepEqual(cur().rows.map(r => r.done).slice(0, 2), [false, false]);
  T.focusSet = true;
  assert.deepEqual(cur().rows.map(r => r.done).slice(0, 2), [true, false]);
  T.autoBuild = true;
  assert.equal(cur().key, 'storehouse');
  T.buildings.push({ type: 'storehouse', stage: 'built' });
  assert.equal(cur().key, 'camps');
  T.projects = [{ type: 'lumber_camp' }, { type: 'quarry' }];
  assert.equal(cur().key, 'infirmary');
  T.buildings.push({ type: 'infirmary', stage: 'built' });
  assert.equal(cur().key, 'people');
  T.pop = 40;
  assert.equal(cur().key, 'village');
  assert.deepEqual(cur().rows.map(r => r.label).slice(0, 3), ['Timber', 'Stone', 'Goods']);
  g.state.frontier.settlements[id].tier = 2;
  assert.equal(cur().key, 'market');
  g.state.frontier.settlements[id].buildings.push({ type: 'market', stage: 'built' });
  assert.equal(cur().key, 'market', 'built: now set the goods to keep');
  assert.deepEqual(cur().rows.map(r => r.done).slice(0, 2), [true, false]);
  g.step([{ id: g.state.clans.player.heroId ?? Object.values(g.state.entities).find(e => e.type === 'hero' && e.owner === 'player').id, type: 'frontier', action: 'setMarketKeep', settlement: id, keep: 250 }]);
  assert.notEqual(cur().key, 'market', 'past the setup goals');
  // the 2nd permit asks for a Village-tier town
  g.state.frontier.settlements[id].tier = 1;
  const row = g.landOffice.permitStatus('player').rows.find(r => r.label === 'Town tier');
  assert.ok(row && row.need === 2 && !row.ok, '2nd permit needs a Village');
  g.state.frontier.settlements[id].tier = 2;
  assert.ok(g.landOffice.permitStatus('player').rows.find(r => r.label === 'Town tier').ok);
  void town; void base;
  console.log('town setup goals ok');
}
