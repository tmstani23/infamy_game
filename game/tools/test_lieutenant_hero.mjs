// The lieutenant together with the hero (Tim 2026-11-06: "governor" = the lieutenant who runs the capital while
// the hero is out). test_lieutenant.mjs covers his rules (orders, budget, hire, standing down); this file plays
// him in a running campaign: the hero walks out through the real gate with the Hero group, the lieutenant defends
// a raid and buys back a lost business, the hero is knocked out on the island, the captain falls, a rival boss
// leaves, the budget resets at dawn, and a save keeps it all. Run from the repo root: node game/tools/test_lieutenant_hero.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots, makeSave, loadSave } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const settings = data('data/settings.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json') });
const g = createGame(options());
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 }, seed: 9 });
const hero = g.state.entities[m.heroId], clan = g.state.clans.player, L = g.lieutenant;
const mine = makeBots(g, m.rivals).find(b => b.config?.lieutenant && b.config.clan === 'player');   // only the player's lieutenant runs here
const gate = g.doors.find(d => d.gate && d.place === 'world');
const run = (n, until = () => false) => { const sent = []; for (let i = 0; i < n && !until(); i++) { const out = mine.tick(); sent.push(...out); g.step(out); } return sent; };
const logged = re => L.record('player').log.some(x => re.test(x.text));
const home = () => { Object.assign(hero, { place: 'street', x: gate.x, z: gate.z }); g.step([]); };
// a few more crew in the city (easy campaign starts with one)
{ const U = g.settings.units.types, h = L.hq('player'), d = g.doors.find(x => x.to && x.place === h.room);
  for (let i = 0; i < 5; i++) g.spawn('thug', U.thug.sprite, d.x + i * 0.6, d.z + 1, { owner: 'player', hp: U.thug.hp }); }
for (let i = 0; i < 40; i++) g.step([]);

// --- the hero walks out through the real gate with the Hero group; the captain takes charge at the HQ -------------
const crew = g.clans.crewOf('player').filter(u => !u.dead && u.place === 'street');
assert.ok(crew.length >= 4, `starting crew ${crew.length}`);
Object.assign(hero, { place: 'street', x: gate.x, z: gate.z });
const party = crew.slice(0, 2), stay = crew.slice(2);
party.forEach((u, i) => Object.assign(u, { x: gate.x - 0.6 * (i + 1), z: gate.z - 0.6, order: { kind: 'follow', target: hero.id }, deployment: { ...u.deployment, group: 'hero' } }));
stay.forEach(u => { if (u.deployment?.group === 'hero') u.deployment.group = 'home'; });
assert.ok(!L.captainOf('player'), 'no captain while the boss is home');
g.step([{ id: hero.id, type: 'expedition', action: 'walk', units: [] }]);
assert.equal(hero.place, 'world', clan.notice?.text);
const cap = L.captainOf('player'), hq = L.hq('player');
assert.ok(cap && cap.place === hq.room, 'the captain is at the HQ the tick the boss leaves');
assert.ok(party.every(u => u.place === 'world'), 'the Hero group went out with the boss');
assert.ok(!cap.deployment || cap.deployment.group !== 'hero', 'the captain is not in the Hero group');
assert.ok(logged(/captain takes charge/));
{
  const sent = run(1200);
  assert.ok(sent.every(c => c.by === 'lieutenant'));
  assert.ok(!sent.some(c => c.type === 'deployment' && c.action === 'transfer'), 'never pulls crew to the absent boss');
  assert.ok(!sent.some(c => c.type === 'expedition' || c.type === 'frontier' || c.type === 'travel'), 'never leaves the city or touches towns');
  assert.notEqual(L.captainOf('player')?.place, 'world', 'the captain stays in the city');
  assert.ok(party.every(u => u.place === 'world'), 'the Hero group stays with the boss');
  assert.equal(hero.place, 'world');
}

// --- defend: a rival raids one of our businesses at night; the lieutenant calls a Rally --------------------------
{
  const own = Object.values(g.state.businesses).find(b => b.kind === 'teahouse' && b.owner !== 'player' && b.room) || Object.values(g.state.businesses).find(b => b.kind === 'teahouse');
  g.clans.setOwner(own.id, 'player');
  g.step([{ type: 'time', night: true }]);
  g.step([{ id: hero.id, type: 'lieutenant', orders: { defend: false } }]);
  assert.equal(L.gate(hero, { type: 'deployment', action: 'rally' }).ok, false, 'defend off: no Rally');
  g.step([{ id: hero.id, type: 'lieutenant', orders: { defend: true } }]);
  const raider = g.spawn('hero', 'ronin', own.ring[0], own.ring[1], { owner: 'kuroda' });
  g.state.clans.kuroda.lanterns = 1;
  g.step([{ id: raider, type: 'business', action: 'raid', business: own.id }]);
  assert.ok(g.state.attacks[own.id]?.mode === 'raid', `raid placed: ${g.state.clans.kuroda.notice?.text}`);
  Object.assign(g.state.entities[raider], { hp: 1e6, maxHp: 1e6 });
  const sent = run(400, () => g.rally.status('player').active);
  assert.ok(g.rally.status('player').active, 'the lieutenant called a Rally');
  assert.ok(sent.some(c => c.type === 'deployment' && c.action === 'rally'));
  assert.ok(logged(/Rally to defend/));
  run(200);
  assert.ok(party.every(u => u.place === 'world'), 'the Rally does not pull the Hero group back from the island');
  assert.equal(hero.place, 'world', 'nor the boss');
  delete g.state.attacks[own.id]; g.state.entities[raider].dead = true; g.state.entities[raider].diedAt = g.state.tick;
  run(1200, () => !g.rally.status('player').active);
}

// --- retake: a business we held comes free; the captain walks there and buys it back inside the budget -----------
{
  const price = k => g.businesses.rules[k]?.price ?? Infinity;
  const lost = Object.values(g.state.businesses).filter(b => b.owner === 'player' && !b.hideout && b.ring).sort((a, b) => price(a.kind) - price(b.kind))[0];
  assert.ok(lost, 'a business to lose');
  g.step([{ id: hero.id, type: 'lieutenant', budget: Math.min(settings.campaignCity.lieutenant.maxBudget, L.record('player').spent + price(lost.kind) + 100) }]);
  run(1);   // he sees it held
  g.clans.setOwner(lost.id, null);
  const ryo0 = clan.ryo, spent0 = L.record('player').spent;
  run(4000, () => lost.owner === 'player');
  assert.equal(lost.owner, 'player', `bought back (captain at ${L.captainOf('player')?.place})`);
  assert.ok(logged(/Buying back/));
  assert.ok(L.record('player').spent - spent0 >= price(lost.kind) - 1e-9, 'booked against the budget');
  assert.ok(ryo0 - clan.ryo >= price(lost.kind) - 1e-9);
  assert.ok(L.record('player').spent <= L.record('player').budget, 'within the budget');
  // taken by a rival instead: no purchase, that needs a raid
  run(1); g.clans.setOwner(lost.id, 'kuroda');
  const r0 = clan.ryo; run(600);
  assert.equal(lost.owner, 'kuroda', 'a rival-held business is not bought'); assert.ok(clan.ryo >= r0 - L.record('player').budget);
}

// --- the budget resets at dawn ------------------------------------------------------------------------------
{
  const r = L.record('player'); r.spent = r.budget;
  const day0 = g.state.clock?.day;
  g.step([{ type: 'time', night: true }]); g.step([{ type: 'time', night: false }]); g.step([]);
  assert.equal(g.state.clock.day, day0 + 1, 'a new day');
  assert.equal(L.record('player').spent, 0, 'spending resets each day');
}

// --- the captain falls while the boss is away: logged, and a new captain takes charge -----------------------
{
  const c = L.captainOf('player');
  Object.assign(c, { dead: true, diedAt: g.state.tick, hp: 0 });
  g.step([]);
  assert.ok(logged(/captain fell/));
  // not straight away: after captainWaitSeconds, for captainFee ryo (Tim 2026-11-06)
  for (let i = 0; i < 20; i++) g.step([]);
  assert.ok(!L.captainOf('player'), 'no instant free replacement');
  const wait = Math.round(L.rules.captainWaitSeconds * 20);
  for (let i = 0; i < wait + 5 && !L.captainOf('player'); i++) g.step([]);
  const c2 = L.captainOf('player');
  assert.ok(c2 && c2.id !== c.id && c2.place === L.hq('player').room, 'a new captain at the HQ');
  assert.ok((clan.ryoHistory || []).some(h => h.reason === 'New city captain' && h.amount === Math.min(L.rules.captainFee, h.before)), 'he costs ryo');
  assert.equal(Object.values(g.state.entities).filter(e => e.captain && e.owner === 'player' && !e.dead).length, 1, 'one captain only');
}

// --- fairness while the boss is away (Tim 2026-11-06): rivals raid him on about awayRaidShare of nights; a city
// holding no business gets a stipend each new day ---------------------------------------------------------------
{
  assert.ok(L.away('player'));
  const d0 = g.state.clock.day;
  let yes = 0;
  for (let d = 1; d <= 200; d++) { g.state.clock.day = d; if (L.raidable('kuroda', 'player')) yes++; }
  g.state.clock.day = d0;
  assert.ok(Math.abs(yes / 200 - L.rules.awayRaidShare) < 0.12, `raided on ${yes} of 200 nights`);
  assert.ok(L.raidable('kuroda', 'nobody'), 'a boss at home is raided as usual');
  const mine = Object.values(g.state.businesses).filter(b => b.owner === 'player' && !b.hideout);
  for (const b of mine) b.owner = null;
  const r = L.record('player');
  r.awaySince = d0 - 1; r.stipendDay = d0 - 1;
  g.step([]);
  assert.ok(logged(/family sends/), 'stipend paid');
  const n = (L.record('player').log || []).filter(x => /family sends/.test(x.text ?? x)).length;
  g.step([]);
  assert.equal((L.record('player').log || []).filter(x => /family sends/.test(x.text ?? x)).length, n, 'once a day');
  for (const b of mine) b.owner = 'player';
}

// --- wages (Tim 2026-11-06): each new day the clan pays wageShare of its treasury --------------------------------
{
  const r = L.record('player');
  clan.ryo = 5000; r.day = g.state.clock.day - 1;
  g.step([]);
  const wages = () => (clan.ryoHistory || []).filter(h => h.reason === 'Lieutenant wages').length;
  const paid = (clan.ryoHistory || []).filter(h => h.reason === 'Lieutenant wages').at(-1), n = wages();
  assert.ok(paid && paid.amount === Math.floor(5000 * L.rules.wageShare), `wage paid (${paid?.amount})`);
  assert.ok(logged(/Paid the lieutenant/));
  g.step([]);
  assert.equal(wages(), n, 'once a day');
}

// --- save while the boss is away: orders, budget, log and the captain come back -------------------------------
{
  const file = JSON.parse(JSON.stringify(makeSave(g, { bots: [mine] })));
  const g2 = createGame(options()); loadSave(g2, file);
  const a = L.record('player'), b = g2.lieutenant.record('player');
  assert.deepEqual([b.orders, b.budget, b.spent, b.log.length], [a.orders, a.budget, a.spent, a.log.length]);
  assert.ok(g2.lieutenant.captainOf('player') && g2.lieutenant.active('player'));
}

// --- the boss is knocked out on the island: he comes round out there (no town yet: by the gate, Tim 2026-11-06),
// the captain stays in charge and the Hero group is still with him; walking home, the captain stands down ---
{
  Object.assign(hero, { dead: true, diedAt: g.state.tick, hp: 0 });
  g.step([]);
  assert.ok(L.captainOf('player') && L.active('player'), 'still in charge while the boss lies on the island');
  const capId = L.captainOf('player').id;
  for (let i = 0; i < 60 * 20 && hero.dead; i++) g.step([]);
  assert.ok(!hero.dead && hero.place === 'world', `the boss came round on the island (${hero.place})`);
  g.step([]);
  assert.ok(L.captainOf('player') && L.active('player'), 'the captain stays in charge');
  assert.ok(party.every(u => u.place === 'world'), 'the Hero group is still out on the island with him');
  Object.assign(hero, { place: 'street', x: gate.x, z: gate.z });   // walks home
  g.step([]); g.step([]);
  assert.ok(!L.captainOf('player') && !g.state.entities[capId], 'the captain stands down');
  assert.ok(!L.active('player') && logged(/boss is back/));
}

// --- through the gate again and back: a fresh captain each time, he stands down when the boss walks home --------
{
  Object.assign(hero, { place: 'street', x: gate.x, z: gate.z });
  g.step([{ id: hero.id, type: 'expedition', action: 'walk', units: [] }]);
  assert.equal(hero.place, 'world', clan.notice?.text);
  const c = L.captainOf('player');
  assert.ok(c, 'captain again');
  home();
  assert.ok(!L.captainOf('player') && !g.state.entities[c.id], 'stands down when the boss is home');
  const cap2 = Object.values(g.state.entities).filter(e => e.captain && e.owner === 'player');
  assert.equal(cap2.length, 0, 'no captain left behind');
}

// --- a rival boss leaves too: his captain takes charge at his HQ and stands down on return ----------------------
{
  const boss = Object.values(g.state.entities).find(e => e.type === 'hero' && e.owner === 'kuroda' && e.id !== undefined && !e.dead && L.hq('kuroda'));
  assert.ok(boss, 'kuroda boss');
  const was = { place: boss.place, x: boss.x, z: boss.z };
  Object.assign(boss, { place: 'world', x: gate.to.x, z: gate.to.z }); g.step([]);
  const kc = L.captainOf('kuroda');
  assert.ok(kc && kc.place === L.hq('kuroda').room && kc.owner === 'kuroda', 'rival captain at the rival HQ');
  Object.assign(boss, was); g.step([]);
  assert.ok(!L.captainOf('kuroda'), 'rival captain stands down');
}
// --- Buy (Tim 2026-11-06): a Yakuza lieutenant buys one free business a day, inside the budget and the reserve ---------
const fresh = (kind, ryo = 3000) => {
  const g = createGame(options());
  const m = setupMatch(g, { clan: kind, difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: ryo }, seed: 9 });
  const hero = g.state.entities[m.heroId], L = g.lieutenant, brains = makeBots(g, m.rivals);
  const mine = brains.find(b => b.config?.lieutenant && b.config.clan === 'player');
  const gate = g.doors.find(d => d.gate && d.place === 'world');
  const away = () => { Object.assign(hero, { place: 'world', x: gate.to.x, z: gate.to.z, hp: 1e6, maxHp: 1e6, order: null }); for (const u of g.clans.crewOf('player')) u.order = { kind: 'move', x: u.x, z: u.z, arrived: true }; g.step([]); };
  const run = (n, until = () => false) => { const sent = []; for (let i = 0; i < n && !until(); i++) { const out = mine.tick(); sent.push(...out); g.step(out); } return sent; };
  return { g, m, hero, L, mine, brains, away, run, clan: g.state.clans.player, S: g.state };
};
{
  const t = fresh('yakuza'), held = () => Object.values(t.S.businesses).filter(b => b.owner === 'player' && !b.hideout).length;
  t.away();
  assert.equal(held(), 0);
  t.run(2000, () => held() > 0);
  assert.equal(held(), 1, `bought one: ${t.clan.notice?.text}`);
  assert.ok(t.L.record('player').log.some(x => /Buying the/.test(x.text)));
  assert.ok(t.L.record('player').spent <= t.L.record('player').budget);
  assert.ok(t.L.record('player').log.findIndex(x => /Buying the/.test(x.text)) < Math.max(0, t.L.record('player').log.findIndex(x => /Hired/.test(x.text))) || !t.L.record('player').log.some(x => /Hired/.test(x.text)), 'saves for the business before hiring');
  t.run(3000);
  assert.equal(held(), 1, 'one new business a day');
  assert.equal(t.L.gate(t.hero, { type: 'business', action: 'buy', business: 'x', expand: true }).why, 'one new business a day');
  // a new day, but the treasury is near the reserve: he buys nothing
  t.g.step([{ type: 'time', night: true }]); t.g.step([{ type: 'time', night: false }]);
  t.clan.ryo = 450;
  t.run(2000);
  assert.equal(held(), 1, 'the reserve is kept');
  // order off: nothing
  t.clan.ryo = 3000; t.g.step([{ id: t.hero.id, type: 'lieutenant', orders: { buy: false } }]);
  t.run(2000);
  assert.equal(held(), 1, 'Buy off');
  assert.equal(t.L.gate(t.hero, { type: 'contract', action: 'take', job: -1 }).ok, false, 'Yakuza never take contracts');
}

// --- Shinobi Jobs and Steal (Tim 2026-11-06): the captain takes Scout / bandits by day, one Steal a night; never Sabotage or boss ---
{
  const t = fresh('shinobi'), C = t.S.contracts, U = t.g.settings.units.types;
  const rival = Object.values(t.S.businesses).filter(b => !b.owner && !b.hideout && b.room).slice(0, 2);
  for (const b of rival) t.g.clans.setOwner(b.id, 'kuroda');
  const d = t.g.doors.find(x => x.to && x.place === t.L.hq('player').room);
  for (let i = 0; i < 3; i++) t.g.spawn('ninja', U.ninja.sprite, d.x + i * 0.5, d.z + 1, { owner: 'player', hp: U.ninja.hp });
  for (let i = 0; i < 20; i++) t.g.step([]);
  t.away();
  const job = (id, kind, b) => ({ id, kind, business: b?.id, hero: kind === 'boss' ? Object.values(t.S.entities).find(e => e.type === 'hero' && e.owner === 'kuroda')?.id : undefined, target: 'kuroda', label: `${kind} test`, client: 'town', ryo: 150, renown: 15 });
  C.board = [job(901, 'mark', rival[0]), job(902, 'boss'), job(903, 'steal', rival[0]), job(904, 'scout', rival[1])];
  assert.equal(t.L.gate(t.hero, { type: 'business', action: 'buy', business: rival[0].id, expand: true }).ok, false, 'Shinobi never buy');
  const renown0 = t.clan.renown || 0, kinds = new Set();
  const sent = t.run(3000, () => { const a = C.active.player; if (a) kinds.add(a.kind); return (t.clan.renown || 0) > renown0; });
  assert.ok((t.clan.renown || 0) > renown0, 'the scout job was done');
  assert.deepEqual([...kinds], ['scout'], 'by day: a Scout, never Sabotage, the boss or a daytime Steal');
  assert.ok(sent.filter(c => c.type === 'contract' && c.action === 'take').every(c => c.job === 904));
  assert.ok(t.L.record('player').log.some(x => /Took a contract: scout test/.test(x.text)));
  assert.ok(t.g.clans.crewOf('player').every(u => u.place !== 'world'), 'the city crew stay in the city');
  // night: one Steal
  t.g.step([{ type: 'time', night: true }]);
  C.readyAt.player = 0;
  C.board = [job(905, 'steal', rival[0]), job(906, 'mark', rival[1])];
  const r1 = t.clan.renown;
  t.run(4000, () => t.clan.renown > r1);
  assert.ok(t.clan.renown > r1, `the steal was done: ${t.clan.notice?.text}`);
  assert.equal(t.L.record('player').stoleDay, t.S.clock.day);
  C.readyAt.player = 0;
  C.board = [job(907, 'steal', rival[1])];
  t.run(1500);
  assert.ok(!C.active.player, 'one steal a night');
  C.board = [job(907, 'steal', rival[1])];   // the board may have been refreshed meanwhile: offer it again
  t.run(300);
  assert.ok(!C.active.player, 'one steal a night');
  assert.equal(t.L.gate(t.hero, { type: 'contract', action: 'take', job: 907 }).why, 'one steal a night');
}

// --- a rival bot's lieutenant hires for the city: the recruit does not walk out to its absent boss -------------------
{
  const t = fresh('yakuza'), kb = Object.values(t.S.entities).find(e => e.type === 'hero' && e.owner === 'kuroda');
  const kl = t.brains.find(b => b.config?.lieutenant && b.config.clan === 'kuroda');
  const gate = t.g.doors.find(d => d.gate && d.place === 'world');
  Object.assign(kb, { place: 'world', x: gate.to.x + 5, z: gate.to.z, hp: 1e6, maxHp: 1e6 });
  t.g.step([{ id: kb.id, type: 'lieutenant', orders: { buy: false } }]);   // with Buy on he saves for a business first
  const before = new Set(t.g.clans.crewOf('kuroda').map(u => u.id));
  for (let i = 0; i < 1500; i++) t.g.step(kl.tick());
  const hired = t.g.clans.crewOf('kuroda').filter(u => !before.has(u.id));
  assert.ok(hired.length > 0, 'the Kuroda captain hired');
  assert.ok(hired.every(u => u.place !== 'world' && !(u.order?.kind === 'follow' && u.order.target === kb.id)), 'recruits stay in the city');
}
console.log('test_lieutenant_hero: ok');
