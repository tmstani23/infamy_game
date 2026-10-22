// Phase 3 core acceptance: normal openings, competing properties, real camp
// income, fog-safe decisions, recovery and failed-route/job handling. Node only.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { startClan } from '../src/sim/start_clan.js';
import { createBot } from '../src/sim/bot.js';
import { createNinjaBot } from '../src/sim/ninja_bot.js';
import { createAISupport } from '../src/sim/ai_support.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const bots = data('data/bots.json');
function world(dayNight = { auto: false }) {
  return createGame({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: { ...data('data/settings.json'), dayNight } });
}
function run(g, brains, seconds, until = () => false) {
  for (let i = 0; i < seconds * 20; i++) { g.step(brains.flatMap(b => b.tick())); if (until()) return true; }
  return false;
}
const own = (g, id) => Object.values(g.state.businesses).filter(b => b.owner === id && !b.hideout);

if (!process.env.AI_CASE || process.env.AI_CASE === 'openings') {
  for (const level of ['easy', 'medium', 'hard']) {
  for (const clan of ['player', 'kuroda', 'shinobi']) {
    const g = world(), ninja = clan === 'shinobi';
    const h = startClan(g, { id: clan, kind: ninja ? 'ninja' : 'yakuza', bot: true });
    const brain = ninja ? createNinjaBot(g, { clan, hero: h, rules: { ...bots.shinobiLevels[level], jobs: ['bandits'] } })
      : createBot(g, { clan, hero: h, rules: { ...bots.levels[level], attackChance: 0, raidChance: 0 } });
    let looted = 0, done = false;
    for (let i = 0; i < 240 * 20; i++) {
      g.step(brain.tick());
      for (const gain of g.state.ryoGains || []) if (gain.clan === clan && gain.reason !== 'Contract') looted += gain.amount;
      done ||= (g.state.clans[clan].renown || 0) >= 20;
      if (ninja ? done && looted >= 100 : own(g, clan).length > 0) break;
    }
    const c = g.state.clans[clan];
    console.log('opening', level, clan, 'loot', looted, 'owned', own(g, clan).map(b => b.kind), 'renown', c.renown || 0);
    assert.ok(looted >= 100, `${level} ${clan} earns 100 ryo from actual camp loot at the fair start`);
    if (ninja) assert.ok(done, 'completes the five-bandit contract');
    else assert.ok(own(g, clan).length > 0, `${clan} earns and buys a first business without a dawn payout`);
  }
  }
}

if (!process.env.AI_CASE || process.env.AI_CASE === 'match') {
  // Match acceptance uses the real clock: dusk restores camp income and starts
  // night roamers, unlike the frozen daytime used by focused decision fixtures.
  const g = world(data('data/settings.json').dayNight), brains = [];
  let contracts = 0;
  const contractEvents = [];
  for (const clan of ['player', 'kuroda', 'shinobi']) {
    const ninja = clan === 'shinobi';
    const h = startClan(g, { id: clan, kind: ninja ? 'ninja' : 'yakuza', bot: true });
    brains.push(ninja ? createNinjaBot(g, { clan, hero: h, rules: bots.shinobiLevels.medium })
      : createBot(g, { clan, hero: h, rules: bots.levels.medium }));
  }
  // Observe through the first new dawn: business contracts enter the board only
  // at dawn, and all normal clans begin with no businesses to infiltrate.
  run(g, brains, 900, () => {
    contracts += g.state.news.filter(n => n.kind === 'contractDone').length;
    contractEvents.push(...g.state.news.filter(n => ['contractTaken', 'contractFailed'].includes(n.kind)).map(n => ({ tick: g.state.tick, ...n })));
    return contracts > 0 && ['player', 'kuroda'].every(id => own(g, id).length > 0);
  });
  console.log('three-clan match', ['player', 'kuroda', 'shinobi'].map(id => ({ clan: id, properties: own(g, id).map(b => b.kind), ryo: g.state.clans[id].ryo, renown: g.state.clans[id].renown || 0 })), 'contracts', contracts);
  for (const id of ['player', 'kuroda']) assert.ok(own(g, id).length > 0, `${id} expands while competing for the same starter properties`);
  assert.ok(contracts > 0, `Shinobi complete a contract with two live rivals: ${JSON.stringify({ events: contractEvents, active: g.state.contracts.active.shinobi,
    goal: brains[2].goal(), crew: Object.values(g.state.entities).filter(e => e.owner === 'shinobi').map(e => ({ type: e.type, place: e.place, hp: e.hp, x: e.x, z: e.z, order: e.order?.kind })) })}`);
}

if (!process.env.AI_CASE || process.env.AI_CASE === 'decisions') {
  // Losing the preferred property must lead to another actual purchase.
  {
    const g = world(); g.clans.addClan('player');
    const h = startClan(g, { id: 'kuroda', bot: true, ryo: 400 });
    const brain = createBot(g, { clan: 'kuroda', hero: h });
    g.step(brain.tick()); const first = brain.goal();
    assert.equal(first?.kind, 'buy');
    g.clans.setOwner(first.business, 'player');
    assert.ok(run(g, [brain], 120, () => own(g, 'kuroda').length > 0), 'buys a different property after losing the race');
    assert.notEqual(own(g, 'kuroda')[0].id, first.business);
  }
  // A failed path cools down the target instead of retrying it every thought.
  {
    const g = world(), h = startClan(g, { id: 'kuroda', bot: true, ryo: 400 });
    const brain = createBot(g, { clan: 'kuroda', hero: h }), find = g.nav.findPath;
    const first = brain.tick(), goal = { ...brain.goal() };
    assert.equal(goal.kind, 'buy');
    const b = g.state.businesses[goal.business];
    g.step(first);
    g.nav.findPath = (ax, az, x, z) => Math.hypot(x - b.ring[0], z - b.ring[1]) < 1 ? null : find(ax, az, x, z);
    // Invalidate the already-built route by briefly taking another place.
    const H = g.state.entities[h], home = Object.values(g.state.businesses).find(b => b.hideout === 'kuroda');
    const room = g.rooms.find(r => r.name === home.room);
    Object.assign(H, { place: room.name, x: room.spawn.x, z: room.spawn.z });
    let failed = false;
    for (let i = 0; i < 400; i++) {
      g.step(brain.tick());
      if (!brain.goal() || brain.goal().business !== b.id) { failed = true; break; }
    }
    assert.ok(failed, 'unreachable goal is abandoned');
    for (let i = 0; i < 100; i++) {
      g.step(brain.tick());
      assert.ok(brain.goal()?.kind !== 'buy' || brain.goal()?.business !== b.id, 'failed business is not selected again during cooldown');
    }
  }
  // Private enemy treasury, heat, positions and unseen camp runtime are irrelevant.
  {
    const make = () => {
      const g = world(), h = startClan(g, { id: 'kuroda', bot: true });
      startClan(g, { id: 'player', position: [-100, -40] });
      g.step();
      return { g, h, brain: createBot(g, { clan: 'kuroda', hero: h, rules: bots.levels.hard }) };
    };
    const a = make(), b = make();
    b.g.state.clans.player.ryo = 99999; b.g.state.clans.player.heat = 100;
    for (const e of Object.values(b.g.state.entities)) if (e.owner === 'player') Object.assign(e, { x: -100, z: 90 });
    for (const c of b.g.state.banditCamps) if (!b.g.vision.canSee('kuroda', { ...c, place: 'street' })) {
      c.clearedAt = b.g.state.tick; c.units = [];
    }
    assert.deepEqual(a.brain.tick(), b.brain.tick(), 'identical commands despite different hidden state');
    assert.deepEqual(a.brain.goal(), b.brain.goal());
    const support = createAISupport(a.g, 'kuroda', a.h);
    const camp = a.g.state.banditCamps.find(c => c.id === 'north_village');
    const H = a.g.state.entities[a.h]; Object.assign(H, { x: camp.x, z: camp.z });
    for (const e of Object.values(a.g.state.entities)) if (e.camp === camp.id) { e.dead = true; e.loot = 0; }
    support.pickHunt();
    assert.ok(support.camps.get(camp.id).empty, 'remembers a visibly cleared camp');
    Object.assign(H, { x: 33, z: 5 }); a.g.state.contracts.day++;
    support.pickHunt();
    assert.ok(!support.camps.has(camp.id), 'dawn permits revisiting camps without peeking at respawns');
  }
  // Retreat recalls the crew, including those too far away to use the door together.
  for (const ninja of [false, true]) {
    const g = world(), clan = ninja ? 'shinobi' : 'kuroda';
    const h = startClan(g, { id: clan, kind: ninja ? 'ninja' : 'yakuza', bot: true });
    const H = g.state.entities[h], unit = Object.values(g.state.entities).find(e => e.owner === clan && e.type !== 'hero');
    const home = Object.values(g.state.businesses).find(b => b.hideout === clan);
    const spot = g.nav.nearestFree(home.ring[0] + 8, home.ring[1] + 2);
    Object.assign(H, { x: spot[0], z: spot[1], hp: H.maxHp * .2 });
    Object.assign(unit, { x: spot[0] + 2, z: spot[1] + 1, hp: unit.maxHp * .2, order: { kind: 'stop' } });
    const brain = ninja ? createNinjaBot(g, { clan, hero: h }) : createBot(g, { clan, hero: h });
    assert.ok(run(g, [brain], 35, () => H.place === home.room && unit.place === home.room), `${clan} brings the whole mobile squad home`);
    const hp = unit.hp;
    run(g, [brain], 10);
    assert.ok(unit.hp > hp, 'crew recover at home');
    assert.equal(unit.order.kind, 'follow', 'recalled crew remain in the mobile squad');
  }
  // An impossible active job is dropped and cannot be taken straight back.
  {
    const g = world(), h = startClan(g, { id: 'shinobi', kind: 'ninja', bot: true });
    const brain = createNinjaBot(g, { clan: 'shinobi', hero: h });
    g.state.contracts.active.shinobi = { id: 999, kind: 'steal', business: 'missing', target: 'player', takenAt: 0 };
    const commands = brain.tick();
    assert.ok(commands.some(c => c.type === 'contract' && c.action === 'drop'));
    g.step(commands);
    assert.equal(g.state.contracts.active.shinobi, undefined);
  }
  // Between contracts, Shinobi keep a persistent hunt and collect its bodies.
  {
    const g = world(), clan = 'shinobi';
    const h = startClan(g, { id: clan, kind: 'ninja', bot: true });
    const brain = createNinjaBot(g, { clan, hero: h, rules: { jobs: [] } });
    let loot = 0;
    assert.ok(run(g, [brain], 180, () => {
      loot += g.state.ryoGains.filter(x => x.clan === clan && x.reason !== 'Contract').reduce((n, x) => n + x.amount, 0);
      return loot >= 100;
    }), 'Shinobi can earn camp income without an active contract');
  }
  console.log('adaptive decisions, discovery, cooldowns, recovery and job failure ok');
}

if (!process.env.AI_CASE || process.env.AI_CASE === 'tuning') {
  // Difficulty affects optional risk, with identical money, HP and crew.
  const camps = [];
  for (const level of ['easy', 'hard']) {
    const g = world(), h = startClan(g, { id: 'kuroda', bot: true, crew: 2 });
    g.step();
    const brain = createBot(g, { clan: 'kuroda', hero: h, rules: bots.levels[level] });
    brain.tick();
    const goal = brain.goal(), camp = g.state.banditCamps.find(c => c.id === goal?.camp);
    assert.equal(goal?.kind, 'hunt');
    assert.ok(camp, `${level} selects a public camp`);
    camps.push(camp.members.length);
    assert.equal(g.state.clans.kuroda.ryo, 200);
    assert.equal(g.state.entities[h].maxHp, 560);
    assert.equal(g.clans.crewCount('kuroda'), 2);
  }
  assert.deepEqual(camps, [2, 4], 'easy chooses a small camp; hard accepts a bigger opening fight');
  // The clock permits a mark to wait over four minutes for night without
  // being treated as stuck. Take the job using the real shrine command.
  {
    const g = world({ auto: true, daySeconds: 300, nightSeconds: 360 });
    g.clans.addClan('player');
    const tea = Object.values(g.state.businesses).find(b => b.kind === 'teahouse');
    g.clans.setOwner(tea.id, 'player');
    const s = g.doors.find(d => d.menu === 'contracts');
    const h = startClan(g, { id: 'shinobi', kind: 'ninja', bot: true, position: [s.x, s.z] });
    g.state.contracts.board = [{ id: 999, kind: 'mark', business: tea.id, target: 'player', ryo: 300, renown: 30, night: true }];
    g.state.contracts.posted = true;
    g.step([{ id: h, type: 'contract', action: 'take', job: 999 }]);
    assert.equal(g.state.contracts.active.shinobi?.id, 999);
    const brain = createNinjaBot(g, { clan: 'shinobi', hero: h, rules: bots.shinobiLevels.medium });
    run(g, [brain], 245);
    assert.equal(g.state.night, false);
    assert.equal(g.state.contracts.active.shinobi?.id, 999, 'valid wait for night does not expire the AI job budget');
  }
  // A mark taken seconds before dawn cannot finish its mandatory hold.
  {
    const g = world({ auto: true, daySeconds: 240, nightSeconds: 360 });
    g.clans.addClan('player');
    const tea = Object.values(g.state.businesses).find(b => b.kind === 'teahouse');
    g.clans.setOwner(tea.id, 'player');
    const s = g.doors.find(d => d.menu === 'contracts');
    const h = startClan(g, { id: 'shinobi', kind: 'ninja', bot: true, position: [s.x, s.z] });
    g.state.night = true; g.state.clock.left = 40 * 20;
    g.state.contracts.board = [{ id: 999, kind: 'mark', business: tea.id, target: 'player', ryo: 300, renown: 30, night: true }];
    g.state.contracts.posted = true;
    const brain = createNinjaBot(g, { clan: 'shinobi', hero: h, rules: bots.shinobiLevels.hard });
    run(g, [brain], 5);
    assert.equal(g.state.contracts.active.shinobi, undefined, 'rejects a contract that cannot finish before dawn');
  }
  console.log('difficulty risk, equal resources and contract timing ok');
}
