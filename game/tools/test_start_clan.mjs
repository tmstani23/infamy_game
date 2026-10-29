// Phase 1: normal opening resources, explicit test overrides and the two new businesses.
// Run: node game/tools/test_start_clan.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { startClan } from '../src/sim/start_clan.js';
import { generateRoom } from '../src/sim/generate.js';
import { buildingInfo } from '../src/building_panel.js';
import { createBot } from '../src/sim/bot.js';
import { createNav, ROOM_NAV } from '../src/sim/nav.js';

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
    assert.equal(c.ryo, 200, `${c.id} starts with the same treasury`);
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
    assert.equal(g.clans.crewCap(c.id), g.settings.units.rules.baseCap);
  }
  assert.ok(Object.values(g.state.businesses).filter(b => g.businesses.rules[b.kind]).every(b => !b.owner));
  assert.ok(g.state.entities[player]);
}
console.log('both normal clan setups: 200 ryo, one matching recruit, HQ only');

// Explicit initializer overrides remain available; the Ninja URL uses the fair opening.
{
  const g = make();
  Object.values(g.state.businesses).find(b => b.hideout === 'player').hideout = 'yakuza';
  startClan(g, { id: 'player', kind: 'ninja', position: district.spawns.ninja, crew: 2 });
  startClan(g, { id: 'kuroda', bot: true, model: 'rival_yakuza', ryo: 5000 });
  startClan(g, { id: 'yakuza', bot: true, ryo: 3000 });
  assert.equal(g.clans.crewCount('player'), 2);
  assert.equal(g.state.clans.player.ryo, 200);
  assert.equal(g.state.clans.kuroda.ryo, 5000);
  assert.equal(g.state.clans.yakuza.ryo, 3000);
}
console.log('explicit testing overrides preserved');

const expected = { teahouse: [400, 200, 1], shop: [400, 200, 1], warehouse: [700, 350, 2],
  gambling_den: [1200, 600, 2], tenements: [1600, 800, 3], pawnshop: [400, 200, 1],
  bathhouse: [700, 350, 2], sake_brewery: [700, 350, 2], manor: [1600, 800, 3], customs_house: [1600, 800, 3] };
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
for (const kind of ['shop', 'tenements', 'pawnshop', 'bathhouse', 'sake_brewery', 'manor', 'customs_house']) {
  const b = Object.values(g.state.businesses).find(b => b.kind === kind);
  const i = Number(b.id.slice(1)), [price, payout, slots] = expected[kind];
  const room = g.rooms.find(r => r.name === b.room);
  const generated = generateRoom(kind, district.buildings[i].interior.seed, recipes, parts);
  assert.deepEqual(generated.problems, [], `${kind} interior has clear walkways`);
  assert.ok(g.nav.free(...b.ring) && g.nav.findPath(...district.spawns.hero, ...b.ring));
  if (kind === 'manor') {
    const foot = g.scenery.find(s => s.building === i).foot;
    assert.ok(b.ring[0] - 1.2 > foot.maxX, 'Manor entrance ring clears the courtyard wall on the gate side');
  }
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
  const totalPay = Object.values(g.state.businesses).filter(b => b.owner === 'player').reduce((n, b) => n + Math.round((g.businesses.rules[b.kind]?.payout || 0) * g.territory.payoutBonus(b)), 0);
  assert.equal(clan.ryo, totalPay);
  g.clans.addClan('rival', { ryo: 0 });
  const rival = g.spawn('hero', 'rival_yakuza', ...b.ring, { owner: 'rival' });
  g.state.clans.rival.lanterns = 1;
  g.step([{ type: 'time', night: true }]);
  assert.equal(g.businesses.canRaid(rival, b.id).ok, true, `${kind} can be raided`);
  delete g.state.entities[rival];
}
console.log('business prices/caps, seven converted building entrances, purchases, guards, payouts and raids ok');
assert.equal(g.territory.score('player'), 18, 'all purchased businesses contribute to season scoring');

// Every scoring business belongs to exactly one intended quarter. A partial
// holding earns no bonus, and losing any member removes it from the whole quarter.
const composition = { bund: ['warehouse', 'tenements'], west: ['shop', 'bathhouse', 'manor'],
  east: ['pawnshop', 'sake_brewery', 'customs_house'], pleasure: ['teahouse', 'gambling_den'] };
const businesses = Object.values(g.state.businesses).filter(b => g.businesses.rules[b.kind]);
assert.equal(businesses.length, 10);
for (const b of businesses) b.owner = null;
for (const q of g.territory.quarters) {
  assert.deepEqual(q.businesses.map(id => g.state.businesses[id].kind).sort(), [...composition[q.id]].sort());
  const members = q.businesses.map(id => g.state.businesses[id]);
  members[0].owner = 'player';
  assert.equal(g.territory.payoutBonus(members[0]), 1, 'single-property holdings have no quarter bonus');
  for (const b of members) b.owner = 'player';
  assert.ok(members.every(b => g.territory.payoutBonus(b) === 1.25));
  members.at(-1).owner = 'rival';
  assert.ok(members.every(b => g.territory.payoutBonus(b) === 1));
  members.at(-1).owner = 'player';
}
assert.equal(new Set(g.territory.quarters.flatMap(q => q.businesses)).size, 10);
assert.equal(g.clans.crewCap('player'), g.settings.units.rules.baseCap + (g.state.season.day - 1) * g.settings.units.rules.capPerDawn + 20, 'all ten businesses grow capacity without a separate hard cap');
assert.equal(g.territory.score('player'), 24);
console.log('all four quarter memberships, partial/full/lost bonuses and expanded crew capacity ok');

// New types must be real investment alternatives, not merely player-only doors.
// Keep one unclaimed option at a time and let the ordinary bot choose and buy it.
for (const kind of ['pawnshop', 'bathhouse', 'sake_brewery', 'manor', 'customs_house']) {
  const game = make();
  const id = startClan(game, { id: 'kuroda', bot: true, ryo: expected[kind][0] });
  const target = Object.values(game.state.businesses).find(b => b.kind === kind);
  for (const b of Object.values(game.state.businesses)) {
    if (game.businesses.rules[b.kind] && b !== target) game.clans.setOwner(b.id, 'kuroda');
  }
  Object.assign(game.state.entities[id], { x: target.ring[0], z: target.ring[1] });
  const bot = createBot(game, { clan: 'kuroda', hero: id, rules: {
    escort: 0, stationPerBusiness: 0, reserve: 0, huntBandits: false,
    patrolChance: 0, raidChance: 0, attackChance: 0,
  } });
  for (let i = 0; i < 20 * 15 && !target.owner; i++) game.step(bot.tick());
  assert.equal(target.owner, 'kuroda', `rival AI invests in ${kind}`);
  assert.equal(game.state.clans.kuroda.ryo, 0, 'AI pays the same purchase price');
}
console.log('rival AI can choose and purchase each new business type');

// All ownable interiors expose Shinobi back-window entry/exit and reachable
// contract spots. Sabotage generates a marker only while that job is active;
// Scout needs no interior circle, and business Steal jobs are a later pass.
{
  const game = make();
  game.clans.addClan('rival');
  const id = startClan(game, { id: 'shinobi', kind: 'ninja', position: district.spawns.ninja });
  const ninja = game.state.entities[id];
  for (const b of Object.values(game.state.businesses).filter(b => game.businesses.rules[b.kind])) {
    game.clans.setOwner(b.id, 'rival');
    const win = game.doors.find(d => d.ninja && d.place === b.room);
    assert.ok(win?.to, `${b.kind} has a Shinobi entrance ring`);
    assert.ok(game.nav.free(win.x, win.z) && game.nav.findPath(...district.spawns.ninja, win.x, win.z));
    Object.assign(ninja, { x: win.x, z: win.z, place: 'street' });
    game.step([{ id, type: 'use', units: [] }]);
    assert.equal(ninja.place, b.room, `${b.kind} back window enters its own interior`);
    const room = game.rooms.find(r => r.name === b.room);
    const nav = createNav(room.blockers, { minX: room.origin.x, minZ: room.origin.z,
      maxX: room.origin.x + room.size[0], maxZ: room.origin.z + room.size[1] }, ROOM_NAV);
    const mark = game.contracts.backRoom(b), stash = game.contracts.stash(b);
    for (const spot of [mark, stash]) {
      assert.ok(spot && nav.free(spot.x, spot.z) && nav.findPath(win.to.x, win.to.z, spot.x, spot.z), `${b.kind} contract location is reachable from the window`);
    }
    const job = { kind: 'mark', business: b.id, target: 'rival', clan: 'shinobi', progress: 0 };
    game.state.contracts.active.shinobi = job;
    game.step();
    assert.deepEqual([job.spot.x, job.spot.z], [mark.x, mark.z], `${b.kind} active sabotage exposes the interior ring`);
    delete game.state.contracts.active.shinobi;
    Object.assign(ninja, { x: win.to.x, z: win.to.z });
    game.step([{ id, type: 'use', units: [] }]);
    assert.equal(ninja.place, 'street', `${b.kind} has a working Shinobi exit ring`);
  }
}
console.log('all ten businesses: Shinobi back-window entry/exit and reachable interior contract markers ok');
