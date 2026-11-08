// Frontier C2 + C3 (Tim 2026-11-02/05): while a boss is out on the island, a lieutenant runs the city with the
// same commands, inside the clan's standing orders and daily budget; a city captain takes charge at the HQ and
// stands down when the boss returns. Campaign pacing: raid cooldown, no leader bounties. Classic is untouched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots, makeSave, loadSave } from '../src/sim/save.js';
import { ORDERS } from '../src/sim/lieutenant.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const settings = data('data/settings.json'), CC = settings.campaignCity;
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json') });
function match(mode) {
  const g = createGame(options());
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode, bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 3000 }, seed: 9 });
  return { g, m, hero: g.state.entities[m.heroId], clan: g.state.clans.player };
}
const away = (g, hero) => { const gate = g.doors.find(d => d.gate && d.place === 'world'); Object.assign(hero, { place: 'world', x: gate.to.x, z: gate.to.z }); };

// Classic: no lieutenants, no captain, leader bounties as before
{
  const { g, m, hero } = match('classic');
  assert.ok(!makeBots(g, m.rivals).some(b => b.config?.lieutenant), 'no lieutenant brains in Classic');
  g.step([{ id: hero.id, type: 'lieutenant', budget: 10 }]);
  assert.equal(g.state.lieutenants, undefined);
}

const { g, m, hero, clan } = match('campaign');
const L = g.lieutenant, brains = makeBots(g, m.rivals);
const mine = brains.find(b => b.config?.lieutenant && b.config.clan === 'player');
assert.ok(mine && brains.filter(b => b.config?.lieutenant).length === Object.keys(g.state.clans).length, 'one lieutenant per clan, bots too');

// standing orders: validated, a rejected command changes nothing
const before = JSON.stringify(L.record('player'));
for (const bad of [{ orders: { pillage: true } }, { orders: { defend: 'yes' } }, { budget: -5 }, { budget: CC.lieutenant.maxBudget + 1 }, { budget: 1.5 }])
  g.step([{ id: hero.id, type: 'lieutenant', ...bad }]);
assert.equal(JSON.stringify(L.record('player')), before, 'rejected commands change nothing');
assert.deepEqual(Object.keys(L.record('player').orders), ORDERS);
assert.ok(ORDERS.every(o => L.record('player').orders[o]), 'all standing orders on by default');

// the captain takes charge while the boss is away and is not crew
const crew0 = g.clans.crewCount('player');
away(g, hero); g.step([]);
const cap = L.captainOf('player'), hq = L.hq('player');
assert.ok(cap && cap.place === hq.room, 'the captain is at the HQ');
assert.equal(g.clans.crewCount('player'), crew0, 'the captain is not crew');
assert.ok(L.active('player'));
assert.ok(L.record('player').log.some(x => /captain takes charge/.test(x.text)));

// defend + retake only: he never hires, never starts a Shakedown or Sweep
g.step([{ id: hero.id, type: 'lieutenant', orders: { defend: true, retake: true, shakedown: false, sweep: false, contracts: false, hire: false, buy: false, jobs: false, steal: false } }]);
const sent = [];
for (let i = 0; i < 1200; i++) { const out = mine.tick(); sent.push(...out); g.step(out); }
assert.ok(sent.every(c => c.by === 'lieutenant'), 'tagged');
assert.ok(!sent.some(c => c.type === 'hire' || (c.type === 'deployment' && ['shakedown', 'sweep', 'armAmbush', 'transfer'].includes(c.action))), 'only allowed orders');
assert.ok(!sent.some(c => ['move', 'frontier', 'expedition', 'use', 'dismiss', 'travel'].includes(c.type) && c.id === hero.id), 'never moves the boss or touches the frontier');
assert.equal(hero.place, 'world');

// a forbidden command is refused by the rules even if sent
const queue0 = clan.queue.length;
g.step([{ id: cap.id, type: 'hire', business: hq.id, unit: 'thug', by: 'lieutenant' }]);
assert.equal(clan.queue.length, queue0, 'hire is off: refused');

// hire on with a small budget: the captain hires, spending stays within the budget
const budget = 150;
g.step([{ id: hero.id, type: 'lieutenant', orders: { hire: true }, budget }]);
const ryo0 = clan.ryo;
for (let i = 0; i < 1500; i++) g.step(mine.tick());
const spent = L.record('player').spent;
assert.ok(spent > 0 && spent <= budget, `spent ${spent} of ${budget}`);
assert.ok(ryo0 - clan.ryo <= budget + 1e-9, 'never over the budget');
assert.ok(clan.queue.length + g.clans.crewCount('player') > crew0, 'he hired');

// the log keeps the last logEntries entries
for (let i = 0; i < 30; i++) L.log('player', `entry ${i}`);
assert.equal(L.record('player').log.length, CC.lieutenant.logEntries);

// the boss comes home: the captain stands down and the lieutenant stops (defend only if asked)
Object.assign(hero, { place: 'street' }); g.step([]);
assert.ok(!L.captainOf('player') && !g.state.entities[cap.id], 'captain stands down');
assert.ok(!L.active('player'));
g.step([{ id: hero.id, type: 'lieutenant', defendAtHome: true }]);
assert.ok(L.active('player'));
assert.equal(L.gate(hero, { type: 'deployment', action: 'shakedown' }).ok, false, 'at home: defend only');
assert.equal(L.gate(hero, { type: 'deployment', action: 'rally' }).ok, true);

// campaign pacing: raid cooldown, no leader bounties
{
  const b = Object.values(g.state.businesses).find(x => x.kind === 'teahouse');
  g.clans.setOwner(b.id, 'kuroda'); b.raidedDay = g.state.clock.day;
  assert.match(g.businesses.canRaid(hero.id, b.id).why, /Raided lately/);
  b.raidedDay = g.state.clock.day - CC.raidCooldownDays;
  assert.doesNotMatch(g.businesses.canRaid(hero.id, b.id).why, /Raided lately/);
  const r0 = Object.values(g.state.clans).map(c => c.ryo).join();
  g.leader.tick([{ kind: 'raidWon', raider: 'player', defender: 'kuroda' }]);
  assert.equal(Object.values(g.state.clans).map(c => c.ryo).join(), r0, 'no leader bounty in a campaign');
}

// saved with the game: the brains come back in order
{
  away(g, hero); g.step([]);
  const file = JSON.parse(JSON.stringify(makeSave(g, { bots: brains })));
  const g2 = createGame(options()), back = loadSave(g2, file);
  assert.equal(back.filter(b => b.config?.lieutenant).length, brains.filter(b => b.config?.lieutenant).length);
  assert.ok(g2.lieutenant.captainOf('player'), 'captain kept');
}
console.log('test_lieutenant: ok');
