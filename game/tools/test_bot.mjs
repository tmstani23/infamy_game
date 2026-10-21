// Rival bot clan, B1 (sim/bot.js, docs/rival_bot_plan.md): home hideouts, and a bot that hires at
// home and buys an unclaimed business through the same commands as a player.
// Run: node tools/test_bot.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { createBot } from '../src/sim/bot.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const newGame = () => createGame({
  district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: { ...data('data/settings.json'), dayNight: { auto: false } },
});
const bots = data('data/bots.json');

// hideouts: each clan owns its own from the start; never for sale
{
  const g = newGame();
  g.clans.addClan('player', { name: 'Your clan' });
  g.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
  const inn = Object.values(g.state.businesses).find(b => b.hideout === 'player'), iz = Object.values(g.state.businesses).find(b => b.hideout === 'kuroda');
  assert.equal(inn.owner, 'player'); assert.equal(iz.owner, 'kuroda');
  assert.ok(inn.room && iz.room && inn.room !== iz.room, 'own rooms');
  const h = g.spawn('hero', 'ronin', inn.ring[0], inn.ring[1], { owner: 'player' }), H = g.state.entities[h];
  assert.equal(g.businesses.canBuy(h, iz.id).ok, false);
  g.step([{ type: 'time', night: true }]);
  assert.equal(g.businesses.canAttack(h, iz.id).ok, false);
  // a rival's hideout is shut to you, and yours to them (Tim 2026-10-20)
  Object.assign(H, { x: iz.ring[0], z: iz.ring[1] });
  g.step([{ id: h, type: 'use', units: [] }]);
  assert.equal(H.place, 'street', "can't walk into the rival's hideout");
  const k = g.state.entities[g.spawn('hero', 'rival_yakuza', inn.ring[0], inn.ring[1], { owner: 'kuroda' })];
  g.step([{ id: k.id, type: 'use', units: [] }]);
  assert.equal(k.place, 'street', "and they can't walk into yours");
  Object.assign(H, { x: inn.ring[0], z: inn.ring[1] });
  // hire at home: slower
  g.step([{ id: h, type: 'use', units: [] }]);
  assert.equal(H.place, inn.room, 'in the inn');
  g.step([{ id: h, type: 'hire', business: inn.id, unit: 'thug' }]);
  const q = g.state.clans.player.queue[0];
  assert.ok(q.left > g.settings.units.types.thug.hireSeconds * g.settings.units.rules.hideout.hireTimeFactor - 0.1, 'hiring at home takes longer');
  // lay low: heat cools faster inside
  const every = g.settings.units.rules.heatCoolSeconds * 20;
  g.state.clans.player.heat = 50;
  for (let i = 0; i < every; i++) g.step();
  assert.ok(50 - g.state.clans.player.heat >= 2, 'cools at least twice as fast at home');
  // rest: hurt boss heals faster at home
  H.hp = H.maxHp / 2; H.hitAt = -1e9;
  const hp0 = H.hp; g.step();
  assert.ok(H.hp - hp0 > H.maxHp * g.settings.units.rules.regenPerSecond / 20 * 1.5, 'rests faster at home');
  // knocked out: wakes up in the hideout
  H.hp = 0; H.dead = true; H.diedAt = g.state.tick; H.place = 'street';
  for (let i = 0; i < (g.settings.units.rules.heroRespawnSeconds + 1) * 20; i++) g.step();
  assert.ok(!H.dead); assert.equal(H.place, inn.room, 'woke up at home');
  console.log('hideouts ok');
}

// The bot invests in a nearby efficient property, then hires at home.
{
  const g = newGame();
  g.clans.addClan('player', { name: 'Your clan' });
  g.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true, ryo: 1500 });
  const iz = Object.values(g.state.businesses).find(b => b.hideout === 'kuroda');
  const boss = g.spawn('hero', 'rival_yakuza', iz.ring[0], iz.ring[1], { owner: 'kuroda' });
  const bot = createBot(g, { clan: 'kuroda', hero: boss, rules: bots.levels[bots.difficulty] });
  const c = g.state.clans.kuroda;
  let bought = null;
  for (let i = 0; i < 20 * 120 && !bought; i++) {
    g.step(bot.tick());
    bought = Object.values(g.state.businesses).find(b => b.owner === 'kuroda' && !b.hideout);
  }
  assert.ok(bought, 'bought a business');
  assert.ok(g.businesses.rules[bought.kind].price <= 700, 'chooses a nearby low/mid-tier property instead of spending nearly everything on the den');
  for (let i = 0; i < 20 * 120 && g.clans.crewCount('kuroda') < 1; i++) g.step(bot.tick());
  assert.ok(g.clans.crewCount('kuroda') + c.queue.length >= 1, 'hired crew at home');
  console.log('bot buys and hires ok', bought.kind, 'crew', g.clans.crewCount('kuroda'), 'ryo', c.ryo);
}

// --- B2-B5 ------------------------------------------------------------------------------
const setup = ({ ryo = 0, crew = 0, level = 'easy', rules = {}, own = [], night = false } = {}) => {
  const g = newGame();
  g.clans.addClan('player', { name: 'Your clan' });
  g.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true, ryo });
  const biz = k => Object.values(g.state.businesses).find(b => b.kind === k);
  for (const k of own) g.clans.setOwner(biz(k).id, 'kuroda');
  if (night) g.step([{ type: 'time', night: true }]);
  const iz = Object.values(g.state.businesses).find(b => b.hideout === 'kuroda');
  const boss = g.spawn('hero', 'rival_yakuza', iz.ring[0], iz.ring[1], { owner: 'kuroda' });
  const B = g.state.entities[boss];
  Object.assign(B, { hp: 1e6, maxHp: 1e6 });
  const ids = [];
  for (let i = 0; i < crew; i++) {
    const [x, z] = g.nav.nearestFree(iz.ring[0] + (i % 3) * 0.9, iz.ring[1] + 1 + Math.floor(i / 3) * 0.9);
    ids.push(g.spawn('thug', 'thug', x, z, { owner: 'kuroda', order: { kind: 'follow', target: boss } }));
  }
  const bot = createBot(g, { clan: 'kuroda', hero: boss, rules: { ...bots.levels[level], ...rules } });
  const run = (seconds, until) => { for (let i = 0; i < seconds * 20; i++) { g.step(bot.tick()); if (until?.()) return true; } return false; };
  return { g, biz, boss, B, ids, bot, run, S: g.state.entities };
};

// B2 stationing: spare crew (beyond the escort) go into its businesses and hold them
{
  const t = setup({ crew: 5, own: ['gambling_den'], rules: { patrolChance: 0, raidChance: 0, attackChance: 0 } });
  const den = t.biz('gambling_den');
  assert.ok(t.run(90, () => t.ids.some(id => t.S[id].place === den.room)), 'a crew member is stationed in the den');
  console.log('B2 station crew ok');
}

// B2 defend: a raid on its den: the boss runs to the War Lantern and knocks it down
{
  const t = setup({ crew: 3, own: ['gambling_den'], night: true, rules: { patrolChance: 0, raidChance: 0, attackChance: 0 } });
  const den = t.biz('gambling_den');
  const raider = t.g.spawn('hero', 'ronin', den.ring[0], den.ring[1], { owner: 'player' });
  t.g.state.clans.player.lanterns = 1;
  t.g.step([{ id: raider, type: 'business', action: 'raid', business: den.id }]);
  Object.assign(t.S[raider], { x: den.ring[0] + 15, z: den.ring[1] + 10 });   // walks off, out of the way
  assert.ok(t.run(60, () => !t.g.state.attacks[den.id]), 'raid over');
  assert.equal(den.owner, 'kuroda');
  assert.match(t.g.state.clans.player.notice.text, /knocked down/);
  console.log('B2 defend (knock the lantern down) ok');
}

// B3 bribe: at Wanted heat it walks to a police box and pays
{
  const t = setup({ ryo: 500, rules: { patrolChance: 0 } });
  const c = t.g.state.clans.kuroda;
  c.heat = 70;
  assert.ok(t.run(90, () => c.heat < 60), 'bribed the police');
  console.log('B3 bribe ok');
}

// clinic: its downed crew wait at the clinic until the boss walks there and pays (Tim 2026-10-19)
{
  const t = setup({ ryo: 500, rules: { patrolChance: 0, attackChance: 0, raidChance: 0, huntBandits: false } });
  const c = t.g.state.clans.kuroda;
  c.clinic.push({ unit: 'thug', model: 'thug', kind: 'recover', left: 0, cost: 15, hp: 0 });
  assert.ok(t.run(120, () => c.clinic.length === 0), 'revived at the clinic');
  const ring = t.g.doors.find(d => d.menu === 'clinic');
  assert.ok(Math.hypot(t.B.x - ring.x, t.B.z - ring.z) < 2, 'the boss went there');
  assert.equal(c.ryo, 485, 'paid the recovered price');
  console.log('bot clinic revive ok');
}

// B3 night attack: with a crew and no money to buy, it attacks an unclaimed business
{
  const t = setup({ crew: 4, night: true, rules: { attackChance: 1, patrolChance: 0, huntBandits: false } });
  for (const id of t.ids) Object.assign(t.S[id], { hp: 1e6, maxHp: 1e6 });
  assert.ok(t.run(120, () => Object.values(t.g.state.attacks).some(a => a.clan === 'kuroda')), 'started an attack');
  const a = Object.values(t.g.state.attacks).find(a => a.clan === 'kuroda');
  assert.ok(t.run(30, () => t.B.place === a.room), 'went in');
  console.log('B3 night attack ok', a.kind);
}

// B3 bandits: hunts one near its boss at night
{
  const t = setup({ crew: 3, night: true, rules: { attackChance: 0, patrolChance: 0, raidChance: 0 } });
  const bandit = t.g.spawn('bandit', 'bandit', t.B.x + 3, t.B.z + 3, { owner: 'bandits', wild: true });
  assert.ok(t.run(40, () => !t.S[bandit] || t.S[bandit].dead), 'bandit down');
  console.log('B3 bandit hunt ok');
}

// B4 raid: buys a War Lantern, scouts your den, raids it at night
{
  const t = setup({ ryo: 3000, crew: 6, rules: { raidChance: 1, attackChance: 0, patrolChance: 0, huntBandits: false } });
  const den = t.biz('gambling_den');
  const mine = Object.values(t.g.state.businesses).filter(b => t.g.businesses.rules[b.kind]);
  for (const b of mine) t.g.clans.setOwner(b.id, 'player');   // nothing left to buy, including new business kinds
  for (const id of t.ids) Object.assign(t.S[id], { hp: 1e6, maxHp: 1e6 });
  assert.ok(t.run(150, () => t.g.state.clans.kuroda.lanterns === 1), 'bought a War Lantern');
  assert.ok(t.run(30 * mine.length, () => mine.every(b => t.bot.seen[b.id])), 'scouted every business without repeatedly refreshing early targets');
  t.g.step([{ type: 'time', night: true }]);
  let raid = null;
  assert.ok(t.run(150, () => (raid = Object.values(t.g.state.attacks).find(a => a.mode === 'raid' && a.clan === 'kuroda'))), 'raid started');
  const target = t.g.state.businesses[raid.business];
  assert.ok(t.run(150, () => target.owner === 'kuroda'), `raid won (nobody defending): ${JSON.stringify({ kind: target.kind, goal: t.bot.goal(), boss: [t.B.place, t.B.x, t.B.z], attack: t.g.state.attacks[target.id] })}`);
  console.log('B4 raid ok', target.kind);
}

// B5 knobs: medium sends hurt crew to the clinic; hard has every crew member hit the weakest enemy
{
  const t = setup({ ryo: 100, crew: 3, level: 'medium', rules: { patrolChance: 0 } });
  const u = t.S[t.ids[0]]; u.hp = u.maxHp * 0.2;
  t.run(3);
  assert.equal(u.order.kind, 'heal', 'hurt crew off to the clinic');
  const h = setup({ crew: 3, level: 'hard', rules: { patrolChance: 0 } });
  const foes = [0, 1].map(i => h.g.spawn('thug', 'thug', h.B.x + 2 + i, h.B.z + 1, { owner: 'player', order: { kind: 'stop' } }));
  h.S[foes[1]].hp = 20;
  h.run(0.05);
  assert.ok(h.ids.every(id => h.S[id].order?.kind === 'attack' && h.S[id].order.target === foes[1]), 'focus fire on the weakest');
  // executes on their own when safe: how often follows the difficulty (Tim 2026-10-20)
  assert.deepEqual(['easy', 'medium', 'hard'].map(l => setup({ level: l }).g.state.clans.kuroda.aggression), [0.25, 0.5, 0.8]);
  console.log('B5 difficulty knobs ok');
}

// revenge (Tim 2026-10-19, any level): it leaves your boss alone, until he cuts down its crew nearby
{
  const t = setup({ crew: 3, rules: { patrolChance: 0, raidChance: 0, attackChance: 0 } });
  const you = t.g.spawn('hero', 'ronin', t.B.x + 1.5, t.B.z + 1.5, { owner: 'player' });
  Object.assign(t.S[you], { hp: 1e6, maxHp: 1e6 });
  t.run(0.1);
  assert.notEqual(t.B.attackTarget, you, 'no grudge yet');
  for (const id of t.ids.slice(0, 2)) Object.assign(t.S[id], { x: t.S[you].x + 0.6, z: t.S[you].z, hp: 1, order: { kind: 'attack', target: you } });
  assert.ok(t.run(10, () => t.B.attackTarget === you), 'after two of its crew went down to you, the boss comes for you');
  console.log('revenge on your boss ok');
}

// hit its boss and he fights back; badly hurt he runs home to his hideout and rests (Tim 2026-10-19)
{
  const t = setup({ crew: 0, rules: { patrolChance: 0, raidChance: 0, attackChance: 0 } });
  const iz = Object.values(t.g.state.businesses).find(b => b.hideout === 'kuroda');
  Object.assign(t.B, { x: iz.ring[0] + 6, z: iz.ring[1] + 3, hp: 1000, maxHp: 1000 });
  const you = t.g.spawn('hero', 'ronin', t.B.x + 1, t.B.z, { owner: 'player' });
  Object.assign(t.S[you], { hp: 1e6, maxHp: 1e6 });
  t.g.step([{ id: you, type: 'attack', target: t.boss }]);
  // Let the strike land before the now-active bot starts walking elsewhere.
  for (let i = 0; i < 20; i++) t.g.step();
  assert.ok(t.B.hitBy?.id === you, 'the boss was actually hit');
  assert.ok(t.run(5, () => t.B.attackTarget === you), 'fights back when hit');
  t.B.hp = 200;
  assert.ok(t.run(30, () => t.B.place === iz.room), 'ran home when low');
  console.log('fights back, flees home when low ok');
}
