// Z2 (Tim 2026-11-19): rival homes and strategies, the two towns a zone cap, castle ground closed, and the rivals'
// later towns (settlers land at the home harbour, walk to a site in the home zone and found there).
//   node game/tools/test_rival_campaign.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const frontier = data('data/frontier.json'), world = data('data/world.json'), zonesFile = data('data/campaign_zones.json');
zonesFile.rivals.trekSpeed = 80;   // a quick walk for the test
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'),
  frontier: { ...frontier, fixtureTowns: false, castleBlueprint: data('data/castle_default.json'), campaignZones: zonesFile } });
function match(seed = 5) {
  const g = createGame(options());
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 3000, botRyo: 3000 }, seed });
  return { g, bots: makeBots(g, m.rivals) };
}
const kinds = Object.keys(zonesFile.rivals.strategies);

// --- homes and strategies: rolled once, saved, never the player's home, never the same home twice -------------
{
  const { g } = match(5), R = g.frontier.rivalCampaign, rec = R.ensure(), ids = Object.keys(rec);
  assert.equal(ids.length, 2, 'both rivals have a record');
  assert.equal(g.state.frontier.rivals, rec, 'saved with the game');
  const homes = ids.map(id => rec[id].home);
  assert.ok(homes.every(h => h && h !== 'east_plains' && h !== 'sutra_heartland') && new Set(homes).size === 2, `homes ${homes}`);
  assert.ok(ids.every(id => kinds.includes(rec[id].strategy)), JSON.stringify(rec));
  assert.deepEqual(match(5).g.frontier.rivalCampaign.ensure(), rec, 'the same roll for the same seed');
  const seen = new Set(); for (let s = 1; s <= 12; s++) { const r = match(s).g.frontier.rivalCampaign.ensure(); for (const id of ids) seen.add(`${r[id].home}/${r[id].strategy}`); }
  assert.ok(seen.size >= 5, 'rolls vary with the seed');
  // Z5: each rival's castle stands at its home from the start, the default layout turned to the sea; its rail hub is there
  g.step([]);
  const castles = Object.values(g.state.frontier.settlements).filter(s => s.castle);
  assert.equal(castles.length, 3, 'three castles: yours and two rivals');
  for (const id of ids) { const c = g.castles.castleOf(id), spot = g.frontier.campaignZones.castles().find(x => x.zone === rec[id].home);
    assert.ok(c && c.x === spot.x && c.z === spot.z && c.capital && c.owner === id, `${id} castle at its home`);
    assert.equal(rec[id].castle, c.id);
    const end = g.frontier.rail.endpoint(id, 'capital'); assert.ok(Math.hypot(end.x - c.x, end.z - c.z) < 300, 'its rail hub is its castle station');
    const a = g.castles.approach(id), h = R.homePoint(id); assert.ok(a && h.x === a.x && h.z === a.z, 'settlers land before the drawbridge');
    assert.ok(c.grid.use.includes('m') && c.buildings.some(b => b.type === 'station'), 'the default layout'); }
  // a rival castle is remembered like a rival town once your units have seen it (sim/sightings.js)
  { const c = g.castles.castleOf(ids[0]), hero = Object.values(g.state.entities).find(e => e.type === 'hero' && e.owner === 'player');
    assert.equal(Object.keys(g.sightings.remembered('player', c.id)).length, 0, 'unseen at first');
    Object.assign(hero, { place: 'world', x: c.x, z: c.z + 70 }); for (let i = 0; i < 12; i++) g.step([]);
    assert.ok(Object.keys(g.sightings.remembered('player', c.id)).length > 0, 'seen once your hero is inside'); }
  console.log('rival homes, strategies and castles ok');
}

// --- the zone cap and castle ground, for everyone ----------------------------------------------------------------
{
  const { g } = match(5), L = g.landOffice, Z = g.frontier.campaignZones, S = g.state;
  for (const id of ['S55', 'S43', 'S56', 'S41', 'S47']) assert.match(L.siteBlocked(world.sites.find(s => s.id === id), 'player') || '', /castle/i, `${id} is castle ground`);
  const closed = Z.closedSites(), inZone = world.sites.filter(s => Z.zoneOfSite(s) === 'sutra_heartland' && !closed.has(s.id));
  const [a, b, c] = inZone;
  assert.equal(L.siteBlocked(c, 'player'), null);
  for (const [k, si] of [a, b].entries()) S.frontier.settlements[`p${k}`] = { id: `p${k}`, owner: 'player', founded: true, name: `P${k}`, x: si.x, z: si.z, site: si.id };
  assert.match(L.siteBlocked(c, 'player') || '', /Zone full/, 'a third town in the zone');
  assert.ok(!/Zone full/.test(L.siteBlocked(c, 'kuroda') || ''), 'the cap is per clan');
  // founding on foot is held to the same cap
  const hero = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === 'player');
  S.clans.player.permit = true;
  Object.assign(hero, { place: 'world', x: c.x, z: c.z });
  assert.match(g.frontier.founding.check(hero, undefined, { x: c.x + 20, z: c.z }).reason || '', /Zone full|settlers/);
  console.log('zone cap and castle ground ok');
}

// --- later towns: paid in the city, settlers land at the home harbour, walk and found -----------------------------
{
  const { g } = match(5), R = g.frontier.rivalCampaign, L = g.landOffice, Z = g.frontier.campaignZones, S = g.state;
  const rec = R.ensure(), id = 'kuroda', r = rec[id], clan = S.clans[id], home = R.homePoint(id);
  r.strategy = 'expander';
  const first = world.sites.find(s => s.id === L.botSite(id));
  assert.equal(Z.zoneOfSite(first), r.home, 'a rival settles in its home zone first');
  g.frontier.world.addTown({ id: 'tK', name: 'Kuroda one', owner: id, x: first.x, z: first.z, site: first.id, pop: 3, stock: {}, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
  S.frontier.settlements.tK.founded = true; S.frontier.settlements.tK.foundedTick = 0;
  clan.ryo = 5000;
  for (let i = 0; i < 40; i++) g.step([]);
  assert.ok(r.founded && r.nextDay > 0 && !r.party, 'the first town starts the clock');
  assert.equal(L.botDue(id, 0), false, 'the boss does not go out again');
  assert.equal(R.mayWar(id), false, 'an Expander with land left starts no war');
  S.clock.day = r.nextDay;
  const before = clan.ryo;
  for (let i = 0; i < 40 && !r.party; i++) g.step([]);
  assert.ok(r.party, `the settlers are sent: ${JSON.stringify({ r, day: S.clock.day, ryo: clan.ryo, budget: R.budget(), may: R.mayFound(id), home, site: L.botSite(id, r.skip || []) })}`);
  const party = r.party.ids.map(i => S.entities[i]);
  assert.equal(party.length, frontier.founding.minSettlers);
  assert.ok(party.every(u => u.type === 'settler' && u.owner === id && u.place === 'world' && Math.hypot(u.x - home.x, u.z - home.z) < 60), 'landed before the castle drawbridge');
  assert.equal(before - clan.ryo, (frontier.founding.permit.ryo || 0) + party.length * data('data/units.json').types.settler.price + frontier.founding.cost, 'permit, settlers and the founding paid');
  const site = world.sites.find(s => s.id === r.party.site);
  assert.equal(Z.zoneOfSite(site), r.home);
  assert.equal(S.frontier.siteClaims[site.id], id, 'the site is claimed');
  for (let i = 0; i < 20 * 600 && r.party; i++) g.step([]);
  assert.ok(!r.party, 'the walk ends');
  const towns = Object.values(S.frontier.settlements).filter(s => s.owner === id && s.founded !== undefined);
  assert.equal(towns.length, 2, `a second town stands (${r.lastLoss || ''})`);
  const t2 = towns.find(s => s.id !== 'tK');
  assert.ok(Math.hypot(t2.x - site.x, t2.z - site.z) <= frontier.founding.botSiteRadius && Z.zoneOfTown(t2) === r.home, 'at its site, in the home zone');
  assert.ok(!party.some(u => S.entities[u.id]), 'the settlers became the town');
  assert.equal(r.nextDay, S.clock.day + zonesFile.rivals.strategies.expander.everyDays);
  // the home zone is full now: the next one goes to a zone touching home
  const next = world.sites.find(s => s.id === L.botSite(id));
  assert.ok(next && Z.touches(r.home, Z.zoneOfSite(next)), 'then a zone next to home');
  // Tim 2026-11-21: every strategy founds like an Expander (a Warlord used to stop at two towns)
  r.strategy = 'warlord';
  assert.equal(R.mayFound(id), true, 'a Warlord goes on founding past two towns');
  assert.equal(R.mayWar(id), true);
  // a lost walk: the held founding cost comes back, the claim is dropped
  // (a site with no way to it on foot is skipped and another is tried the next day)
  r.strategy = 'expander'; clan.ryo = 5000;
  for (let d = 0; d < 6 && !r.party; d++) { S.clock.day = r.nextDay; for (let i = 0; i < 40 && !r.party; i++) g.step([]); }
  assert.ok(r.party, `a third trip: ${JSON.stringify({ r, day: S.clock.day, ryo: clan.ryo, may: R.mayFound(id), wars: Object.keys(S.frontier.wars?.list || {}) })}`);
  const held = r.party.held, mid = clan.ryo;
  S.entities[r.party.ids[0]].dead = true;
  g.step([]);
  assert.ok(!r.party && clan.ryo === mid + held && r.lost === 1, 'the trip is lost, the founding cost comes back');
  assert.ok(!Object.values(S.frontier.siteClaims).includes(id));
  // what it knows: towns in its zones and the zones touching them
  const far = Z.zones().map(z => z.id).find(z => z !== r.home && !Z.touches(r.home, z) && !towns.some(t => Z.touches(Z.zoneOfTown(t), z)));
  if (far) { const si = world.sites.find(s => Z.zoneOfSite(s) === far); assert.equal(R.knows(id, { owner: 'player', x: si.x, z: si.z, site: si.id }), false, 'a town far away is not known'); }
  assert.equal(R.knows(id, { owner: 'player', x: t2.x + 300, z: t2.z }), true);
  console.log('rival later towns ok');
}
// --- the war goals wait for a rival town in reach ---------------------------------------------------------------
{
  const { g } = match(5), Z = g.frontier.campaignZones, S = g.state;
  const closed = Z.closedSites(), inZone = z => world.sites.find(s => Z.zoneOfSite(s) === z && !closed.has(s.id));
  const add = (id, owner, si) => { g.frontier.world.addTown({ id, name: id, owner, x: si.x, z: si.z, site: si.id, pop: 3, stock: {}, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] }); S.frontier.settlements[id].founded = true; };
  add('pA', 'player', inZone('east_plains'));
  assert.equal(g.goals.rivalInReach('player'), false, 'no rival town yet');
  add('kA', 'kuroda', inZone('western_reach'));
  assert.equal(g.goals.rivalInReach('player'), false, 'a rival town far away');
  add('kB', 'kuroda', inZone('northern_thaw'));
  assert.equal(g.goals.rivalInReach('player'), true, 'a rival town in a zone next to yours');
  console.log('war goals wait for a rival in reach ok');
}
console.log('rival campaign OK');
