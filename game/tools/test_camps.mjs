// Persistent camps, opening income, map access and dawn-only repopulation.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { startClan } from '../src/sim/start_clan.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const district = data('data/port_town.json'), settings = data('data/settings.json');
const make = () => createGame({ district, catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: { ...settings, dayNight: { auto: false } } });
const living = (g, c) => c.units.map(id => g.state.entities[id]).filter(e => e && !e.dead);
const run = (g, seconds) => { for (let i = 0; i < seconds * 20; i++) g.step(); };

{
  const g = make();
  startClan(g, { id: 'player', position: district.spawns.hero });
  g.step();
  const camps = g.state.banditCamps;
  assert.equal(camps.length, 8);
  assert.equal(camps.reduce((n, c) => n + living(g, c).length, 0), 20);
  const travel = [];
  for (const [region, home] of [['yakuza', 'player'], ['kuroda', 'kuroda'], ['shinobi', 'ninja']]) {
    const start = Object.values(g.state.businesses).find(b => b.hideout === home).ring;
    const small = camps.filter(c => c.region === region);
    assert.equal(small.length, 2);
    let total = 0;
    for (const c of small) {
      assert.equal(c.members.length, 2);
      const path = g.nav.findPath(...start, c.x, c.z);
      assert.ok(path && g.nav.free(c.x, c.z), `${c.id} can be reached`);
      let prev = start;
      for (const p of path) { total += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; }
    }
    travel.push(total);
  }
  assert.ok(Math.max(...travel) / Math.min(...travel) < 1.4, `comparable opening travel: ${travel}`);
  for (const c of camps) for (const e of living(g, c)) {
    assert.ok(g.nav.free(e.x, e.z), `resident ${e.id} is not in scenery`);
    assert.ok(g.nav.findPath(c.x, c.z, e.x, e.z));
  }
  run(g, 20);
  assert.equal(camps.reduce((n, c) => n + living(g, c).length, 0), 20, 'residents stay during daylight');
  assert.ok(camps.every(c => living(g, c).every(e => Math.hypot(e.x - c.x, e.z - c.z) < 11)), 'local patrols stay at their camps');
  g.step([{ type: 'time', night: true }]);
  assert.equal(Object.values(g.state.entities).filter(e => e.wild && !e.camp && !e.dead).length, 2, 'night roamers have a separate cap');

  const cleared = camps[0], partial = camps[1];
  for (const e of living(g, cleared)) Object.assign(e, { dead: true, diedAt: g.state.tick, loot: 25 });
  const survivor = living(g, partial)[1];
  Object.assign(living(g, partial)[0], { dead: true, diedAt: g.state.tick, loot: 25 });
  run(g, 2);
  assert.equal(living(g, cleared).length, 0, 'no refill before dawn');
  const bodies = [...cleared.units];
  g.step([{ type: 'time', night: false }]);
  assert.equal(living(g, cleared).length, 2, 'cleared camp returns at dawn');
  assert.ok(cleared.units.every(id => !bodies.includes(id)), 'new residents, not revived corpses');
  assert.ok(bodies.every(id => g.state.entities[id]?.loot === 25), 'respawning does not remove unlooted bodies');
  assert.deepEqual(living(g, partial).map(e => e.id), [survivor.id], 'partial losses are not replaced');
  for (const e of living(g, cleared)) Object.assign(e, { dead: true, diedAt: g.state.tick });
  run(g, 2);
  assert.equal(living(g, cleared).length, 0, 'cannot repeatedly refill during the same day');
  console.log('camp placement, patrols, separate roamer caps and dawn lifecycle ok');
}

// A real hero and its one free recruit can clear and loot two starter camps.
for (const region of ['yakuza', 'kuroda', 'shinobi']) {
  const ninja = region === 'shinobi', clanId = region === 'kuroda' ? 'kuroda' : 'player';
  const g = make();
  if (ninja) Object.values(g.state.businesses).find(b => b.hideout === 'player').hideout = 'yakuza';
  const heroId = startClan(g, { id: clanId, kind: ninja ? 'ninja' : 'yakuza',
    model: ninja ? 'ninja_leader' : region === 'kuroda' ? 'rival_yakuza' : 'ronin',
    position: ninja ? district.spawns.ninja : region === 'yakuza' ? district.spawns.hero : undefined });
  const hero = g.state.entities[heroId], crew = g.clans.crewOf(clanId)[0];
  g.step();
  const camps = g.state.banditCamps.filter(c => c.region === region);
  for (const c of camps) {
    const point = g.nav.nearestFree(c.x, c.z - 3);
    Object.assign(hero, { x: point[0], z: point[1] });
    const recruit = g.nav.nearestFree(point[0] + 1, point[1]);
    Object.assign(crew, { x: recruit[0], z: recruit[1] });
    for (const id of c.units) {
      g.step([{ id: heroId, type: 'attack', target: id }, { id: heroId, type: 'order', units: [crew.id], kind: 'attack', target: id }]);
      for (let tick = 0; tick < 20 * 35 && !g.state.entities[id].dead; tick++) g.step();
      assert.ok(g.state.entities[id].dead && !hero.dead, `${ninja ? 'Shinobi' : 'Yakuza'} wins the starter fight`);
    }
    for (const id of c.units) {
      assert.equal(g.state.entities[id].loot, 25);
      g.step([{ id: heroId, type: 'loot', target: id }]);
      for (let tick = 0; tick < 20 * 10 && g.state.entities[id]?.loot; tick++) g.step();
      assert.ok(!g.state.entities[id]?.loot, 'loot collected');
    }
  }
  assert.equal(g.state.clans[clanId].ryo, 400, 'two camps bridge the opening 100-ryo gap');
  assert.equal(g.state.clans[clanId].heat, 0, 'bandit fights give no heat');
  console.log(`${region} opening: 300 to 400 ryo with one starting recruit`);
}
