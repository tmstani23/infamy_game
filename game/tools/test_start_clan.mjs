// Phase 1: normal opening resources, explicit test overrides and the two new businesses.
// Run: node game/tools/test_start_clan.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { startClan } from '../src/sim/start_clan.js';
import { generateRoom } from '../src/sim/generate.js';
import { buildingInfo } from '../src/building_panel.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const settings = data('data/settings.json'), district = data('data/port_town.json');
const parts = data('data/interior_parts.json'), recipes = data('data/room_recipes.json');
const make = () => createGame({ district, catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts, recipes, units: data('data/units.json'),
  civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: { ...settings, dayNight: { auto: false } } });

// Exercise both player choices using the same initializer as main.js.
for (const ninja of [false, true]) {
  const g = make();
  if (ninja) Object.values(g.state.businesses).find(b => b.hideout === 'player').hideout = 'yakuza';
  const player = startClan(g, { id: 'player', kind: ninja ? 'ninja' : 'yakuza',
    position: ninja ? district.spawns.ninja : district.spawns.hero });
  startClan(g, { ...data('data/bots.json').clan, bot: true, model: 'rival_yakuza' });
  startClan(g, ninja ? { id: 'yakuza', bot: true } : { id: 'shinobi', kind: 'ninja', bot: true });
  for (const c of Object.values(g.state.clans)) {
    assert.equal(c.ryo, 300, `${c.id} starts with the same treasury`);
    assert.equal(c.queue.length, 0, 'the initial recruit is free, not queued');
    const crew = g.clans.crewOf(c.id), hero = Object.values(g.state.entities).find(e => e.owner === c.id && e.type === 'hero');
    assert.equal(crew.length, 1, `${c.id} starts with one recruit`);
    assert.equal(crew[0].type, c.kind === 'ninja' ? 'ninja' : 'thug');
    assert.equal(crew[0].model, c.kind === 'ninja' ? 'ninja_grunt' : 'thug');
    assert.equal(crew[0].order.kind, 'follow');
    assert.equal(crew[0].order.target, hero.id);
    assert.equal(crew[0].order.slot, 0);
    assert.ok(g.nav.free(crew[0].x, crew[0].z), 'recruit starts on walkable ground');
    assert.ok(g.nav.findPath(crew[0].x, crew[0].z, hero.x, hero.z), 'recruit can reach its leader');
    const owned = Object.values(g.state.businesses).filter(b => b.owner === c.id);
    assert.equal(owned.length, 1, 'only the HQ is owned at the start');
    assert.equal(owned[0].hideout, c.id);
    assert.equal(g.clans.crewCap(c.id), 3);
  }
  assert.ok(Object.values(g.state.businesses).filter(b => g.businesses.rules[b.kind]).every(b => !b.owner));
  assert.ok(g.state.entities[player]);
}
console.log('both normal clan setups: 300 ryo, one matching recruit, HQ only');

// The separate ninja squad test and rich bot test retain explicit overrides.
{
  const g = make();
  Object.values(g.state.businesses).find(b => b.hideout === 'player').hideout = 'yakuza';
  startClan(g, { id: 'player', kind: 'ninja', position: district.spawns.ninja, crew: 2 });
  startClan(g, { id: 'kuroda', bot: true, model: 'rival_yakuza', ryo: 5000 });
  startClan(g, { id: 'yakuza', bot: true, ryo: 3000 });
  assert.equal(g.clans.crewCount('player'), 2);
  assert.equal(g.state.clans.player.ryo, 300);
  assert.equal(g.state.clans.kuroda.ryo, 5000);
  assert.equal(g.state.clans.yakuza.ryo, 3000);
}
console.log('explicit testing overrides preserved');

const expected = { teahouse: [400, 100, 1], shop: [400, 100, 1], warehouse: [700, 175, 2],
  gambling_den: [1200, 300, 2], tenements: [1600, 400, 3] };
const base = data('data/units.json').rules;
const g = make();
const heroId = startClan(g, { id: 'player', position: district.spawns.hero });
const hero = g.state.entities[heroId], clan = g.state.clans.player;
for (const [kind, [price, payout, slots]] of Object.entries(expected)) {
  const b = Object.values(g.state.businesses).find(b => b.kind === kind);
  assert.ok(b?.room && b.ring, `${kind} has an interior and an entrance`);
  assert.equal(base.businesses[kind].price, price);
  assert.equal(base.businesses[kind].payout, payout);
  assert.equal(base.capPerBusiness[kind], slots);
  assert.equal(g.businesses.rules[kind].price, price);
  assert.equal(g.businesses.rules[kind].payout, payout);
  assert.equal(g.settings.units.rules.capPerBusiness[kind], slots);
}

// Real door commands, purchases, guards, payouts, territory, capacity and raid eligibility.
for (const kind of ['shop', 'tenements']) {
  const b = Object.values(g.state.businesses).find(b => b.kind === kind);
  const i = Number(b.id.slice(1)), [price, payout, slots] = expected[kind];
  const room = g.rooms.find(r => r.name === b.room);
  const generated = generateRoom(kind, district.buildings[i].interior.seed, recipes, parts);
  assert.deepEqual(generated.problems, [], `${kind} interior has clear walkways`);
  assert.ok(g.nav.free(...b.ring) && g.nav.findPath(...district.spawns.hero, ...b.ring));
  Object.assign(hero, { x: b.ring[0], z: b.ring[1], place: 'street' });
  g.step([{ id: heroId, type: 'use', units: [] }]);
  assert.equal(hero.place, room.name, `enter ${kind}`);
  Object.assign(hero, { x: room.exit.x, z: room.exit.z });
  g.step([{ id: heroId, type: 'use', units: [] }]);
  assert.equal(hero.place, 'street', `leave ${kind}`);
  const beforeCap = g.clans.crewCap('player');
  clan.ryo = price;
  g.step([{ id: heroId, type: 'business', action: 'buy', business: b.id }]);
  assert.equal(b.owner, 'player');
  assert.equal(clan.ryo, 0, 'purchase charges the exact price');
  assert.equal(g.clans.crewCap('player'), beforeCap + slots);
  assert.equal(g.clans.crewCount('player'), 1, 'buying adds capacity, not free units');
  assert.equal(Object.values(g.state.entities).filter(e => e.guard === b.id && !e.dead).length, 2);
  assert.equal(g.territory.ownerAt(b.x, b.z), 'player');
  const rows = Object.fromEntries(buildingInfo({ state: g.state, district, info: data('data/buildings.json'), units: g.settings.units }, i, 'player').rows);
  assert.equal(rows.Gives, `+${slots} crew slots`);
  assert.equal(rows['Pays you'], `${payout} ryo at dawn`);
  g.step([{ type: 'time', night: true }]);
  g.step([{ type: 'time', night: false }]);
  const totalPay = Object.values(g.state.businesses).filter(b => b.owner === 'player').reduce((n, b) => n + (g.businesses.rules[b.kind]?.payout || 0), 0);
  assert.equal(clan.ryo, totalPay);
  g.clans.addClan('rival', { ryo: 0 });
  const rival = g.spawn('hero', 'rival_yakuza', ...b.ring, { owner: 'rival' });
  g.state.clans.rival.lanterns = 1;
  g.step([{ type: 'time', night: true }]);
  assert.equal(g.businesses.canRaid(rival, b.id).ok, true, `${kind} can be raided`);
  delete g.state.entities[rival];
}
console.log('business prices/caps, Shop and Tenements entrances, purchases, guards, payouts and raids ok');
assert.equal(g.territory.score('player'), 5, 'Shop and Tenements contribute to season scoring');
