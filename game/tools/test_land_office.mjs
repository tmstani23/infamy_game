// Frontier E1 (Tim 2026-11-05): the Land Office sells a founding permit (Renown, crew, businesses for players)
// and hires settlers, who wait outside; the island gate opens a Choose site menu (site or Walk out) that
// takes the hero and settlers only; a new town has a 2-day grace from camp bandits; E6b: real games have no
// fixture towns. Classic has none of it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), U = data('data/units.json');
const options = (fr = frontier) => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: fr });
const P = frontier.founding.permit;
function match(mode, fr) {
  const g = createGame(options(fr));
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode, bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 }, seed: 77 });
  return { g, hero: g.state.entities[m.heroId], clan: g.state.clans.player };
}

// --- Classic: no Land Office door, no permit, no settlers ---------------------------------------
{
  const { g, hero, clan } = match('classic');
  assert.ok(!g.doors.some(d => d.menu === 'land_office') || !g.landOffice.permitStatus('player').ok, 'Classic sells no permit');
  const office = Object.values(g.state.businesses).find(b => b.kind === 'land_office');
  Object.assign(hero, { place: 'street', x: office.ring[0], z: office.ring[1] });
  g.step([{ id: hero.id, type: 'landOffice', action: 'permit' }, { id: hero.id, type: 'hire', business: office.id, unit: 'settler' }]);
  assert.ok(!clan.permit && clan.queue.length === 0, 'nothing happens in Classic');
}

const { g, hero, clan } = match('campaign');
const L = g.landOffice, office = L.office(), door = g.doors.find(d => d.menu === 'land_office');
assert.ok(office && door, 'the telegraph office is the Land Office');
const atOffice = () => { Object.assign(hero, { place: 'street', x: door.x, z: door.z }); };

// --- permit: requirements, then bought, one at a time -----------------------------------------------
atOffice();
g.step([{ id: hero.id, type: 'landOffice', action: 'permit' }]);
assert.ok(!clan.permit, 'requirements not met: no permit');
assert.deepEqual(L.permitStatus('player').rows.map(r => r.label), ['Renown', 'Crew', 'Businesses held']);
clan.renown = P.renown;
for (let i = 0; i < P.crew; i++) g.spawn('thug', 'thug', hero.x + 3 + i * 0.6, hero.z + 3, { owner: 'player', hp: 100 });
const biz = Object.values(g.state.businesses).filter(b => !b.owner && !b.hideout && U.rules.businesses[b.kind]).slice(0, P.businesses);
for (const b of biz) g.clans.setOwner(b.id, 'player');
assert.equal(L.businessesHeld('player'), P.businesses);
Object.assign(hero, { x: 0, z: 0 });
g.step([{ id: hero.id, type: 'landOffice', action: 'permit' }]);
assert.ok(!clan.permit, 'only at the Land Office door');
atOffice();
const ryo0 = clan.ryo;
g.step([{ id: hero.id, type: 'landOffice', action: 'permit' }]);
assert.ok(clan.permit, `permit bought: ${clan.notice?.text}`);
assert.equal(clan.ryo, ryo0 - (P.ryo || 0));
assert.equal(L.permitStatus('player').ok, false, 'one permit at a time');

// --- settlers: hired here, then wait safely at the HQ as a count (Tim 2026-11-06), not as units -------
g.step([{ id: hero.id, type: 'hire', business: office.id, unit: 'settler', count: 5 }]);
assert.equal(clan.queue.filter(q => q.unit === 'settler').length, 5);
g.step([{ id: hero.id, type: 'hire', business: office.id, unit: 'thug' }]);
assert.equal(clan.queue.length, 5, 'the Land Office hires settlers only');
for (let i = 0; i < 2000 && (clan.settlersWaiting || 0) < 5; i++) g.step([]);
assert.equal(clan.settlersWaiting, 5, 'five settlers wait at the HQ');
assert.equal(g.clans.settlersOf('player').length, 0, 'no settler units in the city streets');

// --- the island gate: Choose site takes the hero and the settlers only ---------------------------------
const gate = g.doors.find(d => d.gate && d.place === 'world');
const toGate = () => {
  Object.assign(hero, { place: 'street', x: gate.x, z: gate.z });
};
toGate();
const crew = g.clans.crewOf('player').filter(u => u.type === 'thug');
crew.forEach((u, i) => Object.assign(u, { place: 'street', x: gate.x - 0.6 * (i + 1), z: gate.z - 0.6, order: { kind: 'follow', target: hero.id } }));
const sites = L.sites('player'), open = sites.filter(s => s.open);
assert.ok(sites.length === world.sites.length && open.length > 10, 'sites listed with traits');
assert.ok(sites.every(s => s.traits.soil >= 1 && s.traits.water >= 1 && s.traits.defense >= 1 && typeof s.campWarn === 'boolean'));
assert.ok(sites.some(s => s.campWarn), 'some sites warn of a nearby camp');
const pickSite = open[0];
// not enough settlers
clan.settlersWaiting = 4;
g.step([{ id: hero.id, type: 'expedition', action: 'site', site: pickSite.id, units: [] }]);
assert.equal(hero.place, 'street', 'four settlers are not enough for a site');
clan.settlersWaiting = 5;
toGate();
g.step([{ id: hero.id, type: 'expedition', action: 'site', site: pickSite.id, units: [] }]);
assert.equal(hero.place, 'world', clan.notice?.text);
assert.ok(Math.hypot(hero.x - pickSite.x, hero.z - pickSite.z) < 40, 'the hero stands at the site');
const settlers = g.clans.settlersOf('player');
assert.equal(settlers.length, 5, 'the waiting settlers stepped out at the site');
assert.equal(clan.settlersWaiting, 0);
assert.ok(settlers.every(u => u.place === 'world' && Math.hypot(u.x - hero.x, u.z - hero.z) < 15), 'the settlers came along');
assert.ok(crew.every(u => u.place === 'street'), 'crew stay in the city');
assert.equal(g.state.frontier.siteClaims[pickSite.id], 'player', 'the site is claimed');
assert.equal(L.sites('kuroda').find(s => s.id === pickSite.id).open, false, 'a claimed site is shut to others');

// --- found at the site: the permit is used up, the claim becomes the town, grace runs ------------------
const cell = frontier.townGrid.cellSize;
let spot = null;
for (const r of [2, 2.5, 3]) for (let a = 0; a < 8 && !spot; a++) {
  const x = Math.round(hero.x + Math.cos(a * Math.PI / 4) * r * cell), z = Math.round(hero.z + Math.sin(a * Math.PI / 4) * r * cell);
  if (g.frontier.founding.check(hero, undefined, { x, z }).ok) spot = { x, z };
}
assert.ok(spot, 'a hall spot near the site');
g.step([{ id: hero.id, type: 'frontier', action: 'found', ...spot }]);
const town = Object.values(g.state.frontier.settlements).find(s => s.owner === 'player' && s.founded !== undefined);
assert.ok(town, 'founded');
assert.equal(clan.permit, false);
assert.ok(!Object.values(g.state.frontier.siteClaims).includes('player'), 'claim released');
assert.equal(g.state.frontier.firstPlayerTownDay, g.state.clock.day, 'bots start counting from the player\'s first town');
const near = { owner: 'player', place: 'world', x: town.x + 10, z: town.z };
assert.ok(L.inGrace(near), 'grace for the new town');
assert.ok(!L.inGrace({ ...near, x: town.x + 5000 }), 'grace only near the town');
assert.ok(!L.inGrace({ ...near, owner: 'kuroda' }), 'grace only for its own people');
g.state.tick += frontier.founding.graceDays * g.dayTicks;
assert.ok(!L.inGrace(near), 'grace ends after graceDays');
assert.equal(L.permitStatus('player').ok, false, 'maxTowns: no second permit until Influence (C4)');

// --- Walk out: through the gate on foot, settlers only ------------------------------------------------
{
  const { g, hero } = match('campaign');
  const gate = g.doors.find(d => d.gate && d.place === 'world');
  Object.assign(hero, { place: 'street', x: gate.x, z: gate.z });
  const s = g.spawn('settler', 'laborer', gate.x + 1, gate.z + 1, { owner: 'player', holdFire: true, order: { kind: 'follow', target: hero.id } });
  g.step([{ id: hero.id, type: 'expedition', action: 'walk', units: [] }]);
  assert.equal(hero.place, 'world'); assert.equal(g.state.entities[s].place, 'world');
  assert.ok(Math.hypot(hero.x - gate.to.x, hero.z - gate.to.z) < 3, 'just outside the gate');
}

// --- save / load keeps permit and claims ------------------------------------------------------------
{
  const { g, clan } = match('campaign');
  clan.permit = true; g.landOffice.claim('player', 'S05');
  const g2 = createGame(options()); loadSave(g2, JSON.parse(JSON.stringify(makeSave(g, { bots: [] }))));
  assert.equal(g2.state.clans.player.permit, true); assert.equal(g2.state.frontier.siteClaims.S05, 'player');
}

// --- E6b: a real campaign starts with the capital only; fixtures stay for tests -----------------------
{
  const real = match('campaign', { ...frontier, fixtureTowns: false }).g.state.frontier;
  assert.deepEqual(Object.keys(real.settlements), ['capital'], 'only the capital');
  assert.deepEqual(Object.keys(real.roads), [], 'no fixture roads');
  assert.ok(Object.keys(g.state.frontier.settlements).includes('s_frontier_1'), 'tests keep the fixture towns');
}
console.log('test_land_office: ok');
