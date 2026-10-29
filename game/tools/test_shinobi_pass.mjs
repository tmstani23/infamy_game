import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContracts } from '../src/sim/contracts.js';
import { createGame } from '../src/sim/game.js';
import { startClan } from '../src/sim/start_clan.js';
import { createNinjaBot } from '../src/sim/ninja_bot.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json'), STEAL_TICKS = 20 * (units.rules.contracts.steal.seconds + 1), scores = Object.fromEntries(Object.entries(units.rules.businesses).map(([k, v]) => [k, v.score]));

function fixture() {
  const state = { tick: 0, dawn: false, hits: [], news: [], ryoGains: [],
    clans: { shinobi: { id: 'shinobi', kind: 'ninja', ryo: 0, renown: 0 }, rival: { id: 'rival', kind: 'yakuza', ryo: 10000 }, other: { id: 'other', kind: 'yakuza', ryo: 0 } },
    entities: { ninja: { id: 'ninja', type: 'hero', owner: 'shinobi', place: 'street', x: 0, z: 0, hidden: true, hp: 100 },
      boss: { id: 'boss', type: 'hero', owner: 'rival', place: 'street', x: 50, z: 50, hp: 100 } },
    businesses: Object.fromEntries(['teahouse', 'gambling_den', 'manor', 'warehouse'].map(kind => [kind,
      { id: kind, kind, owner: 'rival', room: kind, x: 0, z: 0 }])) };
  state.businesses.home = { id: 'home', kind: 'hideout', hideout: 'rival', owner: 'rival', room: 'home' };
  const contracts = createContracts({ state, rules: units.rules.contracts, scores, backRoom: () => ({ x: 10, z: 10 }), stash: () => ({ x: 20, z: 20 }) });
  const ninja = state.entities.ninja;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { state.tick++; contracts.tick(); } };
  function take(kind, business = kind === 'boss' || kind === 'bandits' ? undefined : 'teahouse') {
    let job;
    for (let i = 0; i < 100 && !job; i++) { contracts.post(); job = state.contracts.board.find(j => j.kind === kind && j.business === business); }
    assert.ok(job, `board offers ${kind}`);
    contracts.command(ninja, { action: 'take', job: job.id }, { menu: 'contracts' });
    return state.contracts.active.shinobi;
  }
  return { state, contracts, ninja, take, tick };
}
{
  const f = fixture();
  assert.equal(f.contracts.businessScore('rival'), 10);
  assert.deepEqual(['scout', 'mark', 'boss'].map(kind => f.contracts.quote({ kind, target: 'rival' }).ryo), [300, 600, 800]);
  for (let i = 0; i < 40; i++) {
    f.contracts.post();
    assert.ok(f.state.contracts.board.every(j => !f.state.businesses[j.business]?.hideout), 'no HQ contracts');
  }
  const job = f.take('scout');
  assert.equal(job.ryo, 300); assert.equal(job.renown, 30);
  assert.equal(job.rewardLocked, true);
  f.state.businesses.manor.owner = 'other';
  assert.equal(f.contracts.quote({ kind: 'scout', target: 'rival' }).ryo, 240, 'new board quotes reflect current strength');
  assert.equal(f.contracts.quote(job).ryo, 300, 'accepted reward stays fixed');
  Object.assign(f.ninja, { place: 'teahouse' }); f.tick(20 * 11);
  assert.equal(f.state.clans.shinobi.ryo, 300); assert.equal(f.state.clans.shinobi.renown, 30);
}
{
  const f = fixture(), job = f.take('steal');
  assert.equal(job.stealCap, 1500); assert.equal(job.renown, 50);
  assert.match(f.contracts.reward(job), /max 1500/);
  f.state.businesses.manor.owner = 'other';
  Object.assign(f.ninja, { place: 'teahouse', x: 20, z: 20 });
  f.tick(STEAL_TICKS);
  assert.equal(f.state.clans.shinobi.ryo, 1500, 'accepted ceiling survives target score changes');
  assert.equal(f.state.clans.rival.ryo, 8500, 'theft transfers the money from its actual victim');
  for (const treasury of [0, 2000]) {
    const t = fixture(); t.take('steal'); t.state.clans.rival.ryo = treasury;
    Object.assign(t.ninja, { place: 'teahouse', x: 20, z: 20 }); t.tick(STEAL_TICKS);
    assert.equal(t.state.clans.shinobi.ryo, treasury * .2, 'actual payout uses completion-time treasury, including zero');
    assert.equal(t.state.clans.shinobi.renown, 50);
  }
}
{
  const f = fixture(), job = f.take('mark');
  assert.equal(job.ryo, 600); assert.equal(job.renown, 60);
  f.state.night = true; Object.assign(f.ninja, { place: 'teahouse', x: 10, z: 10 }); f.tick(20 * 65);
  assert.equal(f.state.businesses.teahouse.sabotaged, true);
  assert.equal(f.state.clans.shinobi.ryo, 600);
  const b = fixture(); b.take('boss'); b.state.hits = [{ a: 'ninja', t: 'boss', kill: true }]; b.tick();
  assert.equal(b.state.clans.shinobi.ryo, 800); assert.equal(b.state.clans.shinobi.renown, 80);
  const town = fixture(), bandits = town.take('bandits');
  assert.equal(bandits.ryo, 200); assert.equal(bandits.renown, 20, 'town contracts never scale with rival strength');
}
for (const reason of ['drop', 'dawn', 'owner']) {
  const f = fixture(); f.take('scout');
  const warning = f.state.news.find(n => n.kind === 'contractWarn');
  assert.equal(warning.contractType, undefined, 'initial warning exposes no type');
  f.state.news = [];
  if (reason === 'drop') f.contracts.command(f.ninja, { action: 'drop' });
  else { if (reason === 'dawn') f.state.dawn = true; else f.state.businesses.teahouse.owner = 'other'; f.tick(); }
  const alert = f.state.news.find(n => n.kind === 'contractFailedOnYou');
  assert.equal(alert.clan, 'rival'); assert.equal(alert.contractType, 'Scout');
  assert.equal(f.state.clans.shinobi.ryo, 0);
}
console.log('Shinobi contracts: business targets, scaling, accepted reward/cap locks, actual treasury, failures and unchanged bandit jobs ok');

const make = () => createGame({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: { ...data('data/settings.json'), dayNight: { auto: false } } });
{
  const g = make(), hero = startClan(g, { id: 'player', kind: 'ninja', position: data('data/port_town.json').spawns.ninja });
  g.clans.addClan('kuroda');
  const rival = Object.values(g.state.businesses).find(b => b.hideout === 'kuroda');
  const window = g.doors.find(d => d.ninja && d.place === rival.room);
  const actor = g.state.entities[hero], crew = g.clans.crewOf('player')[0];
  for (const point of [rival.ring, [window.x, window.z]]) {
    Object.assign(actor, { x: point[0], z: point[1], place: 'street' });
    g.state.contracts.active.player = { kind: 'steal', clan: 'player', business: rival.id, target: 'kuroda', takenAt: g.state.tick, progress: 0 };
    g.step([{ id: hero, type: 'use', units: [crew.id] }]);
    assert.equal(actor.place, 'street', 'even a legacy Steal job cannot open a rival HQ');
    assert.equal(crew.place, 'street');
  }
  g.step([{ id: hero, type: 'order', kind: 'enter', business: rival.id, units: [crew.id] }]);
  assert.notEqual(crew.order.room, rival.room, 'crew orders cannot bypass HQ restrictions');
  assert.equal(g.clans.crewCount('player'), 1); assert.equal(g.state.clans.player.ryo, 200);
}
{
  const g = make(), hero = startClan(g, { id: 'shinobi', kind: 'ninja', ryo: 3000, position: data('data/port_town.json').spawns.ninja });
  g.state.clans.shinobi.renown = 225;
  const bot = createNinjaBot(g, { clan: 'shinobi', hero, rules: { jobs: [] } });
  for (let i = 0; i < 120 * 20 && g.clans.crewCount('shinobi') < 9; i++) g.step(bot.tick());
  assert.equal(g.clans.crewCap('shinobi'), 9, 'crew still grow at one per 75 Renown');
  assert.equal(g.clans.crewCount('shinobi'), 9, 'established bot recruits beyond three toward unlocked capacity');
  assert.ok(g.clans.crewOf('shinobi').some(u => u.type === 'ninja_tanto'), 'bot also recruits the equally capable tanto variant');
  assert.ok(g.state.clans.shinobi.ryo < 3000, 'expanded army is paid for normally');
  assert.equal(g.territory.score('shinobi'), 4, 'season conversion remains 50 Renown per point');
}
console.log('HQ front/window/crew access blocked; fair opening preserved; paid bot army grows with Renown');
