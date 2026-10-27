import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { createHQRaidEffects } from '../src/sim/hq_raids.js';
import { buildingInfo } from '../src/building_panel.js';
import { createBot } from '../src/sim/bot.js';
import { createNinjaBot } from '../src/sim/ninja_bot.js';
import { createContractMenu } from '../src/contract_menu.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
function fixture({ bot = false, warmup = 1 } = {}) {
  const units = data('data/units.json');
  Object.assign(units.rules.raid, { warmupSeconds: warmup, holdSeconds: 1 });
  units.rules.houseGuards.hideoutCount = 0;
  const g = createGame({ district: data('data/port_town.json'), catalog: data('data/art.json'),
    cutouts: data('art/cutouts.json'), interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'),
    recipes: data('data/room_recipes.json'), units, settings: { ...data('data/settings.json'), dayNight: { auto: false } } });
  g.clans.addClan('player', { bot });
  g.clans.addClan('shinobi', { kind: 'ninja', name: 'Shinobi' });
  g.clans.addClan('kuroda', { faction: 'kuroda' });
  g.step();
  const b = Object.values(g.state.businesses).find(b => b.hideout === 'shinobi');
  const h = g.state.entities[g.spawn('hero', 'ronin', ...b.ring, { owner: 'player', holdFire: true })];
  const d = g.state.entities[g.spawn('hero', 'ninja_leader', ...b.ring, { owner: 'shinobi', holdFire: true })];
  const t = g.state.entities[g.spawn('hero', 'rival_yakuza', ...b.ring, { owner: 'kuroda', holdFire: true })];
  g.state.clans.player.lanterns = 1;
  const raid = () => g.step([{ id: h.id, type: 'business', action: 'raid', business: b.id }]);
  const run = n => { for (let i = 0; i < n; i++) g.step(); };
  return { g, b, h, d, t, raid, run };
}

for (const bot of [false, true]) {
  const { g, b, h, d, t, raid, run } = fixture({ bot });
  const clan = g.state.clans.player;
  g.state.clans.shinobi.ryo = 1234;
  const beforeRyo = clan.ryo, beforeScore = g.territory.score('player');
  assert.equal(g.businesses.canRaid(h.id, b.id).why, 'Raid at night');
  assert.equal(g.businesses.entryStatus(h, b.room).ok, false, 'HQ is normally closed');
  const ordinaryHQ = Object.values(g.state.businesses).find(x => x.hideout === 'player');
  assert.equal(g.businesses.canRaid(t.id, ordinaryHQ.id).ok, false, 'ordinary clan HQ stays unraidable');
  g.step([{ type: 'time', night: true }]);
  raid();
  const a = g.state.attacks[b.id];
  assert.ok(a.hq && a.phase === 'warmup');
  assert.equal(clan.lanterns, 0);
  assert.equal(g.businesses.entryStatus(h, b.room).ok, false);
  assert.equal(g.businesses.entryStatus(d, b.room).ok, true, 'defender can enter during warmup');
  assert.equal(g.businesses.entryStatus(t, b.room).ok, false, 'third clan cannot piggyback');
  assert.ok(g.state.news.some(n => n.kind === 'businessAttack' && n.clan === 'shinobi'));
  run(20);
  assert.equal(a.phase, 'hold');
  const crew = Array.from({ length: 7 }, () => g.spawn('thug', 'thug', ...b.ring, { owner: 'player', holdFire: true, order: { kind: 'stop' } }));
  Object.assign(h, { x: b.ring[0], z: b.ring[1] });
  g.step([{ id: h.id, type: 'use', units: crew }]);
  assert.equal(h.place, b.room);
  assert.equal(crew.filter(id => g.state.entities[id].place === b.room).length, 6, 'normal six-crew interior limit');
  assert.equal(g.businesses.entryStatus(g.state.entities[crew[6]], b.room).ok, false, 'late independent entry cannot bypass the cap');
  Object.assign(h, { x: a.hold.x, z: a.hold.z });
  Object.assign(d, { place: b.room, x: a.hold.x, z: a.hold.z });
  const left = a.holdLeft;
  g.step();
  assert.equal(a.holdLeft, left, 'defender contests interior hold');
  Object.assign(d, { place: 'street', x: b.ring[0], z: b.ring[1] });
  run(a.holdLeft - 1);
  // This contract could complete on the victory tick; suppression must win.
  const den = Object.values(g.state.businesses).find(x => x.kind === 'gambling_den');
  g.clans.setOwner(den.id, 'player');
  const room = g.rooms.find(r => r.name === den.room);
  Object.assign(d, { place: den.room, x: room.spawn.x, z: room.spawn.z, hidden: true });
  g.state.contracts.active.shinobi = { id: 999, kind: 'scout', clan: 'shinobi', business: den.id, target: 'player',
    takenAt: g.state.tick, progress: 199, need: 200, ryo: 150, renown: 15, label: 'Victory-tick scout' };
  g.step();
  assert.equal(g.state.attacks[b.id], undefined);
  assert.equal(b.owner, 'shinobi', 'victory never captures the HQ');
  assert.ok(g.state.news.some(n => n.kind === 'raidWon' && n.hq && n.raider === 'player' && n.defender === 'shinobi'), 'every clan hears the raid was won');
  const wasInside = h.place === b.room;
  assert.equal(b.hideout, 'shinobi');
  assert.equal(clan.ryo, beforeRyo + 723, '600 bounty plus floor(10% treasury)');
  assert.equal(g.state.clans.shinobi.ryo, 1111, 'only theft is charged to defender');
  assert.equal(g.state.clans.shinobi.renown, 0, 'cancelled contract grants no Renown');
  assert.equal(g.state.contracts.active.shinobi, undefined, 'active contract cancelled before completion');
  assert.ok(g.state.news.some(n => n.kind === 'contractFailed' && n.why === 'your HQ was raided'));
  assert.equal(clan.raidPoints, 2);
  assert.equal(g.territory.score('player'), beforeScore + 5, 'two raid points plus den ownership added by fixture');
  assert.ok(g.territory.breakdown('player').some(x => x.label === 'Shinobi HQ raids' && x.points === 2));
  const recovery = g.state.hqRaids[b.id];
  assert.equal(recovery.suppressedUntil - recovery.wonAt, 180 * 20);
  assert.equal(recovery.protectedUntil - recovery.suppressedUntil, 600 * 20);
  assert.equal(g.businesses.canRaid(t.id, b.id).ok, false, 'protection applies to other attacking clan too');
  const job = g.state.contracts.board[0];
  const boardSize = g.state.contracts.board.length;
  g.contracts.command(d, { action: 'take', job: job.id }, { menu: 'contracts' });
  assert.equal(g.state.contracts.active.shinobi, undefined, 'cannot accept a new contract during suppression');
  assert.equal(g.state.contracts.board.length, boardSize, 'blocked take does not consume a job');
  const details = buildingInfo({ state: g.state, district: data('data/port_town.json'), units: g.settings.units }, Number(b.id.slice(1)), 'shinobi');
  assert.ok(details.rows.some(([label]) => label === 'On fire'), 'building panel explains active suppression');
  run(2);
  assert.equal(clan.ryo, beforeRyo + 723, 'victory effects paid exactly once');
  assert.equal(clan.raidPoints, 2);
  run(50);
  assert.ok(wasInside && h.place === 'street', 'raiders are put out front a few seconds after the win');
  g.state.tick = recovery.suppressedUntil;
  g.step();
  assert.ok(g.state.news.some(n => n.kind === 'hqRecovered'), 'reopens automatically without waiting for dawn');
  g.contracts.command(d, { action: 'take', job: g.state.contracts.board[0].id }, { menu: 'contracts' });
  assert.ok(g.state.contracts.active.shinobi, 'current board contract can be taken immediately on recovery');
  assert.match(g.businesses.canRaid(t.id, b.id).why, /protected/);
  g.state.tick = recovery.protectedUntil;
  Object.assign(h, { place: 'street', x: b.ring[0], z: b.ring[1] });
  clan.lanterns = 1;
  assert.equal(g.businesses.canRaid(h.id, b.id).ok, true, 'raid protection expires at exact tick');
  g.state.season.day = g.state.season.cycles;
  g.step([{ type: 'time', night: false }]);
  assert.equal(g.state.season.final.find(s => s.clan === 'player').score, g.territory.score('player'), 'raid points are included in the final season score');
  assert.equal(g.businesses.entryStatus(t, b.room).ok, false);
  assert.equal(g.businesses.entryStatus(h, b.room).ok, false, 'raid entry exception ends with the raid');
}

{
  const { g, b, h, d, raid, run } = fixture({ warmup: 40 });
  g.step([{ type: 'time', night: true }]);
  raid();
  run(31 * 20);
  assert.equal(g.state.clans.player.heat, 0, 'formal warmup is not HQ camping');
  const a = g.state.attacks[b.id];
  Object.assign(d, { x: a.lantern.x, z: a.lantern.z });
  g.step([{ id: d.id, type: 'business', action: 'knock', business: b.id }]);
  run(g.businesses.raidRules.knockSeconds * 20);
  assert.equal(g.state.attacks[b.id], undefined, 'defender knocks down the lantern normally');
  assert.equal(b.owner, 'shinobi');
  assert.equal(g.state.clans.player.lanterns, 0, 'failed raid still spends the lantern');
  assert.equal(g.state.hqRaids[b.id], undefined, 'failure has no suppression or protection');
  assert.equal(g.state.clans.player.raidPoints || 0, 0, 'failure grants no points');
}

for (const [treasury, stolen] of [[0, 0], [9, 0], [1234, 123], [10000, 400]]) {
  const state = { tick: 50, businesses: { h: { id: 'h', owner: 's', hideout: 's' } },
    clans: { a: { ryo: 0 }, s: { kind: 'ninja', ryo: treasury } }, ryoGains: [],
    news: [{ kind: 'hqRaidWon', at: 50, business: 'h', raider: 'a', defender: 's' }] };
  const fx = createHQRaidEffects({ state, dayNight: { daySeconds: 120, nightSeconds: 180 } });
  fx.tick(); fx.tick();
  assert.equal(state.clans.a.ryo, 600 + stolen, 'treasury cap/rounding and duplicate-event safety');
  assert.equal(state.clans.s.ryo, treasury - stolen);
  assert.equal(state.clans.a.raidPoints, 2);
  assert.equal(state.hqRaids.h.protectedUntil - state.hqRaids.h.suppressedUntil, 300 * 20, 'protection follows configured day/night length');
  const saved = structuredClone(state);
  saved.tick = saved.hqRaids.h.suppressedUntil;
  saved.news = [];
  createHQRaidEffects({ state: saved }).tick();
  assert.equal(saved.hqRaids.h.recovered, true, 'state timers survive a serialization round trip');
  assert.equal(saved.clans.a.ryo, 600 + stolen, 'restoring state never repeats a payout');
}

{
  const { g, b, h, d, t } = fixture({ bot: true, warmup: 40 });
  Object.assign(d, { x: -90, z: -80 }); Object.assign(t, { x: -90, z: -80 });
  for (const x of Object.values(g.state.businesses)) if (!x.hideout && g.businesses.rules[x.kind]) g.clans.setOwner(x.id, 'player');
  for (let i = 0; i < 6; i++) g.spawn('thug', 'thug', ...b.ring, { owner: 'player', holdFire: true, order: { kind: 'follow', target: h.id } });
  g.step([{ type: 'time', night: true }]);
  const brain = createBot(g, { clan: 'player', hero: h.id, rules: { raidChance: 1, raidMinCrew: 6,
    escort: 0, stationPerBusiness: 0, huntBandits: false, abilities: [], patrolChance: 0 } });
  for (let i = 0; i < 240 && !g.state.attacks[b.id]; i++) g.step(brain.tick());
  assert.equal(g.state.attacks[b.id]?.hq, true, `business-clan bot can scout and choose the Shinobi HQ: ${JSON.stringify(brain.goal())}`);
}

{
  const { g, b, h, d, raid } = fixture({ warmup: 40 });
  g.step([{ type: 'time', night: true }]); raid();
  Object.assign(h, { x: b.ring[0] + 20, z: b.ring[1] });
  const brain = createNinjaBot(g, { clan: 'shinobi', hero: d.id, rules: { abilities: [], fleeHp: 0 } });
  brain.tick();
  assert.equal(brain.goal()?.kind, 'defend', 'Shinobi bot prioritizes its formally raided HQ');
  delete g.state.attacks[b.id];
  g.state.hqRaids[b.id] = { defender: 'shinobi', suppressedUntil: g.state.tick + 3600, protectedUntil: g.state.tick + 15600 };
  for (let i = 0; i < 100; i++) {
    const commands = brain.tick();
    assert.ok(!commands.some(c => c.type === 'contract' && c.action === 'take'), 'bot does not try to accept blocked contracts');
    g.step(commands);
  }
}

{
  const panel = { addEventListener() {}, innerHTML: '', hidden: true };
  const tracker = { innerHTML: '', hidden: true }, sent = [];
  const h = { id: 'h', owner: 's' }, clan = { id: 's', renown: 0 };
  const game = { state: { tick: 0, entities: { h }, clans: { s: clan },
    hqRaids: { hq: { defender: 's', suppressedUntil: 3600, protectedUntil: 15600 } },
    contracts: { board: [{ id: 1, kind: 'bandits', label: 'Test job', client: 'town' }], active: {} } },
    serviceAt: () => ({ actor: h }), contracts: { reward: () => '200 ryo', quote: () => ({ renown: 20 }) } };
  const menu = createContractMenu({ panel, tracker, game, heroId: 'h', send: c => sent.push(c) });
  menu.toggle();
  assert.match(panel.innerHTML, /reopen in 180 s/);
  assert.ok(!panel.innerHTML.includes('>Take<'), 'board has no Take buttons while suppressed');
  assert.equal(tracker.hidden, false);
  assert.match(tracker.innerHTML, /HQ on fire/);
  menu.pick(0);
  assert.equal(sent.length, 0, 'number-key acceptance is blocked too');
  game.state.tick = 3600; menu.update(); menu.pick(0);
  assert.equal(tracker.hidden, true);
  assert.ok(panel.innerHTML.includes('>Take<'), 'board reopens at the recovery tick');
  assert.equal(sent[0].job, 1);
}
console.log('Shinobi HQ: eligibility, warmup, entry isolation/caps, contested hold, no takeover, camping exemption and defense passed');

{
  // a Shinobi knocking the lantern down is seen even in its smoke or Vanish; attacking in smoke shows it too (Tim 2026-10-26)
  const { g, b, h, d, raid, run } = fixture({ warmup: 40 });
  g.step([{ type: 'time', night: true }]);
  raid();
  run(20);
  const a = g.state.attacks[b.id];
  Object.assign(d, { x: a.lantern.x, z: a.lantern.z });
  g.state.smokes = [{ x: d.x, z: d.z, r: 4, place: d.place, clan: 'shinobi', until: g.state.tick + 200, heal: 0, fadeSeconds: 0 }];
  run(2);
  assert.equal(d.hidden, true, 'hidden in smoke');
  d.attackTarget = h.id; run(2);
  assert.equal(d.hidden, false, 'attacking in its smoke shows it');
  delete d.attackTarget; delete d.swing; run(2);
  assert.equal(d.hidden, true, 'stopping the attack hides it again');
  d.buffs = { ...(d.buffs || {}), veil: { until: g.state.tick + 200 } };
  g.step([{ id: d.id, type: 'business', action: 'knock', business: b.id }]);
  run(2);
  assert.ok(a.knock, 'knock started');
  assert.equal(d.hidden, false, 'knocking shows it, smoke or not');
  assert.equal((d.buffs?.veil?.until ?? -1) > g.state.tick, false, 'knocking ends Vanish');
}
