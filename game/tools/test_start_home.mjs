// Z7 (Tim 2026-11-20): a new game starts with no castle (home 'pick'); after the founding permit the player chooses
// his home with the old surveyor, the castle goes up there and the rivals roll their homes from the sites left (or
// from the fallback day, when he has not chosen). Tests and dev saves may still pass a zone. Every site gives a castle,
// a rail hub, a ship dock and a route out.
// Run: node game/tools/test_start_home.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { matchOptions } from '../src/sim/match_options.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), zonesData = data('data/campaign_zones.json');
const base = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json') };
const frontier = () => ({ ...data('data/frontier.json'), railways: data('data/railways.json'), fixtureTowns: false, castleBlueprint: data('data/castle_default.json'), campaignZones: JSON.parse(JSON.stringify(zonesData)) });
function match(home, seed = 41) {
  const g = createGame({ ...base, frontier: frontier() });
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', home, bots: data('data/bots.json'), spawns: base.district.spawns, test: { playerRyo: 5000 }, seed });
  g.step([]);
  return { g, m, S: g.state };
}

// the options: a home only in a campaign, the default East Plains, a bad id falls back
assert.deepEqual(matchOptions({ mode: 'classic', home: 'red_desert' }), { clan: 'yakuza', difficulty: 'easy', mode: 'classic' });
assert.equal(matchOptions({ mode: 'campaign' }).home, 'east_plains');
assert.equal(matchOptions({ mode: 'campaign', home: '<x>' }).home, 'east_plains');
assert.equal(matchOptions({ mode: 'campaign', home: 'pick' }).home, 'pick');

const sites = zonesData.zones.filter(z => z.castle).map(z => z.id);
assert.equal(sites.length, 5, 'five castle sites');
for (const home of sites) {
  const { g, S } = match(home), Z = g.frontier.campaignZones, c = g.castles.castleOf('player');
  assert.ok(c, `${home}: the player has a castle`);
  assert.equal(Z.zoneOfTown(c), home, `${home}: it stands in the chosen zone`);
  assert.equal(S.match.home, home);
  const rec = g.frontier.rivalCampaign.ensure(), homes = Object.values(rec).map(r => r.home);
  assert.ok(homes.every(h => h && h !== home && sites.includes(h)) && new Set(homes).size === homes.length, `${home}: rivals at other sites (${homes})`);
  for (const id of Object.keys(rec)) assert.equal(Z.zoneOfTown(g.castles.castleOf(id)), rec[id].home, `${home}: ${id}'s castle at its home`);
  const end = g.frontier.rail.endpoint('player', 'capital'), st = c.buildings.find(b => b.type === 'station');
  assert.ok(end && st, `${home}: the rail hub is at the castle station`);
  assert.ok(Math.hypot(end.x - c.x, end.z - c.z) < 400, `${home}: the hub is at the castle`);
  const d = g.castles.dock('player');
  assert.ok(d?.land && d?.sea, `${home}: a ship dock`);
  assert.ok(g.castles.approach('player'), `${home}: open ground before the drawbridge`);
  console.log(`  ${home}: castle ${c.id}, rivals ${homes.join(', ')}`);
}

// Random: a real site, the same for the same seed, and not always the same one
const rolled = [1, 2, 3, 4, 5, 6, 7, 8].map(seed => match('random', seed).S.match.home);
assert.ok(rolled.every(h => sites.includes(h)), `random gives a castle site (${rolled})`);
assert.equal(match('random', 3).S.match.home, rolled[2], 'the same seed, the same home');
assert.ok(new Set(rolled).size > 1, 'random varies with the seed');

// --- the in-game pick: no castle, then the surveyor ---------------------------------------------------------------
{
  const { g, m, S } = match('pick'), Z = g.frontier.campaignZones, L = g.landOffice, hero = S.entities[m.heroId], clan = S.clans.player;
  assert.equal(g.castles.castleOf('player'), null, 'no castle at the start');
  assert.equal(S.match.home, null);
  for (let i = 0; i < 40; i++) g.step([]);
  assert.equal(g.frontier.rivalCampaign.ensure(), null, 'the rivals wait for the player');
  assert.ok(!Object.values(S.frontier.settlements).some(s => s.castle), 'no castles yet');
  assert.ok(L.needsHome('player'));
  const door = g.doors.find(d => d.menu === 'surveyor');
  Object.assign(hero, { place: 'street', x: door.x, z: door.z }); delete hero.order;
  const cmd = zone => g.step([{ id: hero.id, type: 'landOffice', action: 'home', zone }]);
  cmd('red_desert');
  assert.equal(g.castles.castleOf('player'), null, 'no pick without a permit');
  assert.match(clan.notice.text, /permit/);
  clan.permit = true; clan.surveyPending = true;
  assert.equal(g.goals?.goalOf?.('player')?.title ?? 'Choose your home', 'Choose your home');
  g.step([{ id: hero.id, type: 'landOffice', action: 'survey' }]);
  assert.match(clan.notice.text, /home first/, 'the site survey waits for the home');
  cmd('sutra_heartland');
  assert.equal(g.castles.castleOf('player'), null, 'only a castle site');
  cmd('western_reach');
  const c = g.castles.castleOf('player');
  assert.ok(c && Z.zoneOfTown(c) === 'western_reach', `the castle goes up at the chosen site (${clan.notice.text})`);
  assert.equal(S.match.home, 'western_reach');
  assert.ok(!L.needsHome('player'));
  g.step([]);
  const rec = g.frontier.rivalCampaign.ensure(), homes = Object.values(rec).map(r => r.home);
  assert.ok(homes.length === 2 && homes.every(h => sites.includes(h) && h !== 'western_reach'), `the rivals roll from the rest (${homes})`);
  for (let i = 0; i < 3; i++) g.step([]);
  for (const id of Object.keys(rec)) assert.ok(g.castles.castleOf(id), `${id} has its castle`);
  cmd('east_plains');
  assert.equal(Z.zoneOfTown(g.castles.castleOf('player')), 'western_reach', 'chosen once');
  // the survey is measured from the castle
  g.step([{ id: hero.id, type: 'landOffice', action: 'survey' }]);
  const near = clan.survey.sites.map(id => world.sites.find(s => s.id === id));
  assert.ok(near.length && near.every(s => Math.hypot(s.x - c.x, s.z - c.z) < 4000), `sites near the castle (${near.map(s => Math.round(Math.hypot(s.x - c.x, s.z - c.z)))})`);
  // the goal card sends him to the harbour; the settlers waiting at the HQ board with him
  clan.settlersWaiting = 5; Object.assign((clan.milestones ||= {}), { metLieutenant: 1, budgetSet: 1 });
  g.step([]);
  const goal = g.goals.current('player');
  assert.equal(goal?.title, 'Sail to your castle', `the sail card (${goal?.title})`);
  const pier = g.ferry.pier;
  Object.assign(hero, { place: 'street', x: pier[0], z: pier[1] });
  g.step([{ id: hero.id, type: 'frontier', action: 'ferry', mode: 'board' }]);   // All aboard: the call runs out and they sail
  assert.ok(hero.shipCall && !hero.aboard, 'All aboard called');
  for (let i = 0; i < 10 * 20 + 1; i++) g.step([]);
  const aboard = Object.values(S.entities).filter(u => u.aboard === 'ship:player');
  assert.ok(aboard.includes(hero) && aboard.filter(u => u.type === 'settler').length === 5, `he and 5 settlers sail (${aboard.map(u => u.type)})`);
  assert.equal(clan.settlersWaiting, 0);
  for (let i = 0; i < 30 * 20 && hero.aboard; i++) g.step([]);
  const d = g.castles.dock('player');
  assert.ok(!hero.aboard && hero.place === 'world' && Math.hypot(hero.x - d.land.x, hero.z - d.land.z) < 20, 'landed at the castle dock');
  assert.equal(Object.values(S.entities).filter(u => u.type === 'settler' && u.owner === 'player' && u.place === 'world').length, 5, 'with the settlers');
  // Tim 2026-11-20: your horse, 2 crew horses and 2 omnibuses wait outside the castle gate; Mount up, then the Found card
  // with a Ride to a town site row pointing at the surveyor's picks
  const cm = clan.castleMounts;
  assert.ok(cm, 'mounts placed at the castle gate');
  const mine = Object.values(S.entities).filter(u => !u.dead && ((u.type === 'horse' && u.horseOwner === 'player') || (g.omnibus.isVehicle(u) && u.omnibusOwner === 'player')));
  const horses = mine.filter(u => u.type === 'horse'), buses = mine.filter(u => u.type === 'omnibus');
  assert.equal(horses.length, 3, `3 horses (${horses.length})`); assert.equal(buses.length, 2, `2 omnibuses (${buses.length})`);
  assert.ok(mine.every(u => Math.hypot(u.x - cm.x, u.z - cm.z) < 40), 'all by the gate');
  assert.ok(clan.mount && horses.some(h => h.id === clan.mount), 'one is your mount');
  let goal2 = g.goals.current('player');
  assert.equal(goal2.key, 'mount'); assert.ok(goal2.rows[0].where?.place === 'world', 'the mounts are pinged on the minimap');
  for (let i = 0; i < 60 * 20 && !hero.mounted; i++) g.step(i % 20 ? [] : [{ id: hero.id, type: 'mount', horse: clan.mount }]);
  assert.ok(hero.mounted, 'he rides');
  for (let i = 0; i < 21; i++) g.step([]);
  assert.ok(Math.hypot(cm.x - d.land.x, cm.z - d.land.z) < 20, 'the mounts wait at the dock');
  goal2 = g.goals.current('player');
  assert.equal(goal2.key, 'castleOut', `then out through the land gate (${goal2.key})`);
  const ap = g.castles.approach('player');
  assert.ok(goal2.rows[0].where && Math.hypot(goal2.rows[0].where.x - ap.x, goal2.rows[0].where.z - ap.z) < 1, 'the land gate is pinged');
  Object.assign(hero, { x: ap.x, z: ap.z });
  for (let i = 0; i < 21; i++) g.step([]);
  goal2 = g.goals.current('player');
  assert.equal(goal2.key, 'found0', `then the Found card (${goal2.key})`);
  const siteRow = goal2.rows.find(r => r.label === 'Ride to a town site');
  assert.ok(siteRow && !siteRow.done && siteRow.where && /Any open ground/.test(siteRow.how), 'Ride to a town site, optional picks');
  assert.ok(goal2.sites?.length, 'the picks go on the World map');
  const far = goal2.sites.map(s => Math.round(Math.hypot(s.x - c.x, s.z - c.z)));
  const pick = goal2.sites[0]; Object.assign(hero, { x: pick.x + 50, z: pick.z });
  assert.ok(g.goals.current('player').rows.find(r => r.label === 'Ride to a town site').done, 'near a site: done');
  console.log(`  castle mounts ok; site picks at ${far.join(', ')} from the castle`);
  console.log(`  pick: western_reach, rivals ${homes.join(', ')}; sailed with 5 settlers`);
}
// --- nobody chose by the fallback day: the rivals go first and their sites are taken --------------------------------
{
  const { g, m, S } = match('pick'), L = g.landOffice, hero = S.entities[m.heroId], clan = S.clans.player;
  const fb = data('data/frontier.json').founding.bots.fallbackDay;
  S.clock ? S.clock.day = fb : S.tick = fb * g.dayTicks;
  const rec = g.frontier.rivalCampaign.ensure();
  assert.ok(rec && Object.values(rec).every(r => r.home), 'the rivals roll on the fallback day');
  g.step([]);
  const taken = L.homeSites().filter(s => !s.free).map(s => s.zone);
  assert.deepEqual(taken.sort(), Object.values(rec).map(r => r.home).sort(), 'their sites are taken');
  const door = g.doors.find(d => d.menu === 'surveyor');
  Object.assign(hero, { place: 'street', x: door.x, z: door.z }); clan.permit = true;
  g.step([{ id: hero.id, type: 'landOffice', action: 'home', zone: taken[0] }]);
  assert.equal(g.castles.castleOf('player'), null, 'a taken site is refused');
  const free = L.homeSites().find(s => s.free).zone;
  g.step([{ id: hero.id, type: 'landOffice', action: 'home', zone: free }]);
  assert.ok(g.castles.castleOf('player'), 'a free one is not');
}
console.log('test_start_home: ok');
