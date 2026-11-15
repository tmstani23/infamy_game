// War checkpoint 8c (Tim 2026-11-09 and 2026-11-15): surrender and terms. The one-way surrender, the ceasefire,
// offers and answers, the ransom and who pays it, both endings for both sides, the estimate, bots answering and
// surrendering, timeouts and save parity. (sim/frontier/war_terms.js, war_end.js finish, game.js warNeutral)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), U = data('data/units.json');
function scene({ attackerIsPlayer = true, secondTown = true, ownTown = false, surrender = {} } = {}) {
  const frontier = data('data/frontier.json');
  Object.assign(frontier.war.surrender, surrender, { bot: { ...frontier.war.surrender.bot, ...(surrender.bot || {}) } });
  const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, fixtureTowns: false } };
  const g = createGame(options);
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
  g.civilians.populate();
  const S = g.state, hero = S.entities[m.heroId];
  const rival = Object.keys(S.clans).find(c => c !== 'player');
  const attacker = attackerIsPlayer ? 'player' : rival, defender = attackerIsPlayer ? rival : 'player';
  const far = world.sites.filter(s => Math.hypot(s.x - g.gate.island[0], s.z - g.gate.island[1]) > 700);
  const site = far[0] || world.sites[0], site2 = far.find(s => Math.hypot(s.x - site.x, s.z - site.z) > 1500) || far.at(-1);
  const hall = frontier.founding.townHall, add = (id, name, owner, s) => g.frontier.world.addTown({ id, name, owner, x: s.x, z: s.z, pop: 3, founded: true, stock: { food: 100, ryo: 1000 }, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
  add('tE', 'Enemyton', defender, site);
  if (secondTown) add('tF', 'Farton', defender, site2);
  if (ownTown) add('tH', 'Hometon', attacker, site2);
  const town = S.frontier.settlements.tE;
  for (const t of Object.values(S.frontier.settlements)) if (!t.capital) t.founded ||= 1;   // (tick 0 would read as not founded)
  Object.assign(hero, { place: 'world', x: site.x + 200, z: site.z });
  g.step([]);
  S.frontier.wars ||= { list: {}, cooldown: {}, history: [] };
  const cx = site.x - 350, cz = site.z;
  const camp = { x: cx, z: cz, chest: 800, stock: { timber: 50, stone: 20 }, brought: { timber: 200, stone: 100 }, workers: [], workerTraining: [], buildings: [
    { id: 'w1:hall', type: 'camp_hall', stage: 'built', x: cx, z: cz }, { id: 'w1:b1', type: 'barracks', stage: 'built', x: cx + 30, z: cz }] };
  S.frontier.wars.list.w1 = { id: 'w1', town: 'tE', attacker, defender, x: cx, z: cz, started: S.tick, state: 'active', camp };
  g.step([]);
  const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return S.frontier.receipts.findLast(r => r.action === c.action); };
  const troop = (owner, x, z, unit = 'grunt') => S.entities[g.spawn('swordsman', 'swordsman', x, z, { owner, place: 'world', area: 'world', warTroop: 'w1', warUnit: unit, order: { kind: 'stop' } })];
  const run = n => { for (let i = 0; i < n; i++) g.step([]); };
  const newsIn = (n, kind) => { const out = []; for (let i = 0; i < n; i++) { g.step([]); out.push(...S.news.filter(x => x.kind === kind)); } return out; };
  return { g, S, hero, rival, attacker, defender, town, site, site2, camp, cmd, troop, run, newsIn, frontier, options, T: g.frontier.warTerms, WE: g.frontier.warEnd, ST: g.frontier.structures, war: g.frontier.war, cx, cz,
    w: () => S.frontier.wars.list.w1, ended: () => S.frontier.wars.history.find(h => h.id === 'w1') };
}
const dayTicks = s => Math.round((s.options.settings.dayNight.daySeconds + s.options.settings.dayNight.nightSeconds) * 20);

{ // data
  const D = data('data/frontier.json').war;
  assert.equal(D.cooldownDays, 3, 'Tim 2026-11-15: 3 days after any war');
  assert.equal(D.surrender.cooldownDays, 3);
  assert.ok(D.surrender.offerSeconds === 60 && D.surrender.bot.lossAt >= 0.8 && D.surrender.bot.chance <= 0.1, 'a 60 s offer; bots surrender rarely');
}

{ // the player defends and surrenders to a bot: one way, ceasefire, a low offer, then accepted terms
  const s = scene({ attackerIsPlayer: false }), { g, S, hero, rival, town, T } = s;
  const mine = s.troop('player', town.x + 30, town.z), theirs = s.troop(rival, town.x + 34, town.z), theirs2 = s.troop(rival, town.x + 40, town.z + 4);
  s.run(2);
  assert.equal(g.attackAllowed(mine, theirs), true, 'the two sides fight before the surrender');
  let r = s.cmd({ action: 'warOffer', war: 'w1', amount: 100 }); assert.equal(r.reason, 'No surrender in this war');
  r = s.cmd({ action: 'warAnswer', war: 'w1', answer: 'accept' }); assert.equal(r.reason, 'No surrender in this war');
  theirs.order = { kind: 'attack', target: mine.id };
  r = s.cmd({ action: 'warSurrender', war: 'w1' }); assert.ok(r.ok, r.reason);
  const t = s.w().terms;
  assert.ok(t && t.by === 'defender' && t.clan === 'player' && t.offers === 0 && !t.offer, JSON.stringify(t));
  assert.equal(S.news.find(n => n.kind === 'warSurrender')?.side, 'defender');
  assert.equal(theirs.order.kind, 'stop', 'war troops stand down');
  r = s.cmd({ action: 'warSurrender', war: 'w1' }); assert.equal(r.reason, 'You have already surrendered');
  // the ceasefire
  assert.equal(g.attackAllowed(mine, theirs), false, 'ceasefire: war troops leave each other alone');
  assert.equal(g.attackAllowed(theirs, mine), false);
  assert.equal(g.attackAllowed(hero, theirs), false, 'and the hero in the circle');
  const hallSt = s.ST.find(`t|tE|${(town.buildings[0].cells || [town.buildings[0].cell])[0]}`);
  assert.equal(s.ST.damage(rival, hallSt, 50, 'melee'), false, 'no damage to buildings during the ceasefire');
  r = s.cmd({ action: 'warTakeCamp', war: 'w1' }); assert.equal(r.reason, 'A ceasefire is on: terms are on the table');
  r = s.cmd({ action: 'townTrain', war: 'w1', building: 'x', unit: 'grunt', count: 1 }); assert.equal(r.reason, 'A ceasefire is on: the war is ending');
  // the view and the suggestion
  let v = T.view('w1', 'player');
  assert.ok(v.mine && v.state === 'wait' && v.suggest >= 10 && v.suggest % 10 === 0 && v.fair === undefined, JSON.stringify(v));
  assert.equal(v.purse, 1000 + S.clans.player.ryo, 'town coffers plus the Clan treasury');
  const price = T.price(s.w(), rival);
  assert.equal(v.suggest, Math.min(price, v.purse), 'the box holds the bot judge\'s own price');
  let v2 = T.view('w1', rival); assert.ok(!v2.mine && Array.isArray(v2.fair) && v2.suggest === undefined, 'the other side sees a fair range, not the suggestion');
  // offers
  r = s.cmd({ action: 'warOffer', war: 'w1', amount: 0 }); assert.equal(r.reason, 'amount must be a positive whole number');
  r = s.cmd({ action: 'warOffer', war: 'w1', amount: 9999999 }); assert.equal(r.reason, `You have only ${v.purse} ryo`);
  r = s.cmd({ action: 'warAnswer', war: 'w1', answer: 'accept' }); assert.equal(r.reason, 'The other side answers your terms');
  assert.ok(price > 20, `a price to undercut (${price})`);
  r = s.cmd({ action: 'warOffer', war: 'w1', amount: 10 }); assert.ok(r.ok, r.reason);
  assert.equal(S.news.find(n => n.kind === 'warOffer')?.amount, 10);
  r = s.cmd({ action: 'warOffer', war: 'w1', amount: 20 }); assert.equal(r.reason, 'Your offer is still being weighed');
  assert.equal(T.view('w1', 'player').state, 'offer');
  const ans = s.newsIn(s.frontier.war.surrender.bot.answerSeconds * 20 + 2, 'warAnswer');
  assert.equal(ans[0]?.answer, 'no', 'the bot says no to a low offer');
  assert.ok(s.w().terms.last === 10 && !s.w().terms.offer && s.w().terms.low === 1);
  // a fair offer is taken: coffers first, then the treasury
  const coffers = Math.floor(town.stock.ryo), treasury = S.clans.player.ryo, theirRyo = S.clans[rival].ryo;
  const amount = Math.max(price, coffers + 50);   // more than the coffers hold, to see the treasury pay the rest
  assert.ok(amount <= coffers + treasury);
  r = s.cmd({ action: 'warOffer', war: 'w1', amount }); assert.ok(r.ok, r.reason);
  const ended = s.newsIn(s.frontier.war.surrender.bot.answerSeconds * 20 + 2, 'warEnded');
  assert.equal(ended[0]?.result, 'ransomed'); assert.equal(ended[0].surrender, 'defender'); assert.equal(ended[0].ransom, amount);
  const rec = s.ended();
  assert.ok(rec && rec.result === 'ransomed' && rec.ransom.amount === amount && rec.ransom.by === 'player' && rec.ransom.to === rival);
  assert.equal(town.owner, 'player', 'the defender keeps the town');
  assert.ok(town.stock.ryo < 2, 'the coffers pay first');
  assert.equal(S.clans.player.ryo, treasury - (amount - coffers), 'the treasury pays the rest');
  assert.ok(S.clans[rival].ryo >= theirRyo + amount + 800, 'the attacker gets the ransom and his own chest back');
  assert.deepEqual({ t: rec.materialsBack?.timber ?? 0 }, { t: 0 }, 'no own town: nothing comes back');
  assert.ok(theirs.rout && mine.rout && theirs2.rout, 'every war troop walks off');
  const until = S.frontier.wars.cooldown.tE;
  assert.ok(Math.abs(until - (S.tick + 3 * dayTicks(s))) < 200, 'a 3 day cooldown');
}

{ // the player defends, the bot refuses for good after three low offers: retreat, then the bot takes the town
  const s = scene({ attackerIsPlayer: false }), { g, S, hero, rival, town, T } = s;
  const mine = s.troop('player', town.x + 30, town.z), theirs = s.troop(rival, town.x + 34, town.z);
  s.cmd({ action: 'warSurrender', war: 'w1' });
  for (let i = 0; i < 3; i++) {
    const r = s.cmd({ action: 'warOffer', war: 'w1', amount: 10 }); assert.ok(r.ok, r.reason);
    s.run(s.frontier.war.surrender.bot.answerSeconds * 20 + 2);
    if (i < 2) assert.ok(!s.w().terms.offer && s.w().terms.low === i + 1 && !s.w().terms.state, `no ${i + 1}`);
  }
  const rec = s.ended() || s.w();
  assert.equal(rec.terms.ended, 'refused', 'three low offers: refused for good');
  assert.ok(mine.rout, 'the defender\'s troops walk off');
  assert.ok(Math.hypot(hero.x - s.site2.x, hero.z - s.site2.z) < 120, 'his hero goes to his nearest other town');
  s.run(s.frontier.war.surrender.bot.answerSeconds * 20 + 4);
  assert.equal(s.ended()?.result, 'captured', 'a bot attacker captures when it may');
  assert.equal(town.owner, rival);
  assert.ok(theirs.rout);
}

{ // leaving without terms, and the last-town rule for a bot attacker
  const s = scene({ attackerIsPlayer: false, secondTown: false }), { S, hero, rival, town } = s;
  s.cmd({ action: 'warSurrender', war: 'w1' });
  let r = s.cmd({ action: 'warLeave', war: 'w1' }); assert.ok(r.ok, r.reason);
  assert.ok(s.w().terms.state === 'outcome' && s.w().terms.ended === 'left');
  assert.equal(S.news.find(n => n.kind === 'warNoTerms')?.why, 'left');
  r = s.cmd({ action: 'warOffer', war: 'w1', amount: 50 }); assert.equal(r.reason, 'The terms were refused');
  r = s.cmd({ action: 'warLeave', war: 'w1' }); assert.equal(r.reason, 'You have already left');
  r = s.cmd({ action: 'warOutcome', war: 'w1', outcome: 'sack' }); assert.equal(r.reason, 'Only the attacker chooses');
  s.run(s.frontier.war.surrender.bot.answerSeconds * 20 + 4);
  assert.equal(s.ended()?.result, 'sacked', 'a last town can only be sacked');
  assert.equal(town.owner, 'player');
  assert.ok(Math.abs(S.frontier.wars.cooldown.tE - (S.tick + 3 * dayTicks(s))) < 200, 'the usual cooldown is 3 days too');
}

{ // the player attacks and surrenders: no offer in time counts as refused for good; the chest goes to the town
  const s = scene({ attackerIsPlayer: true }), { S, hero, rival, town, T } = s;
  let r = s.cmd({ action: 'warSurrender', war: 'w1' }); assert.ok(r.ok, r.reason);
  let v = T.view('w1', 'player'); assert.equal(v.purse, S.clans.player.ryo, 'an attacker pays from his Clan treasury only');
  assert.ok(v.seconds > 25 && v.seconds <= 30, 'the gap clock');
  const coffers = town.stock.ryo;
  s.run(s.frontier.war.surrender.gapSeconds * 20 + 2);
  const rec = s.ended();
  assert.ok(rec && rec.result === 'attackerSurrendered' && rec.terms.ended === 'timeout' && rec.spoils === 800, JSON.stringify(rec?.terms));
  assert.ok(town.stock.ryo > coffers + 700 && town.stock.ryo <= coffers + 800, 'his war chest goes to the town coffers');
  assert.ok(Math.hypot(hero.x - s.g.gate.island[0], hero.z - s.g.gate.island[1]) < 30, 'no own town: the hero falls back to the city gate');
}

{ // the player attacks and pays a bot defender: accepted terms, he goes home to his own town, nothing comes back
  const s = scene({ attackerIsPlayer: true, ownTown: true }), { S, hero, rival, town, T } = s;
  s.cmd({ action: 'warSurrender', war: 'w1' });
  const price = T.price(s.w(), rival), treasury = S.clans.player.ryo, coffers = town.stock.ryo;
  assert.equal(price, T.view('w1', 'player').suggest);
  assert.ok(price >= 10 && price <= treasury, `price ${price}`);
  const r = s.cmd({ action: 'warOffer', war: 'w1', amount: price }); assert.ok(r.ok, r.reason);
  s.run(s.frontier.war.surrender.bot.answerSeconds * 20 + 2);
  const rec = s.ended();
  assert.equal(rec?.result, 'ransomed'); assert.equal(rec.terms.by, 'attacker');
  assert.equal(S.clans.player.ryo, treasury - price + 800, 'he pays from the treasury and keeps his chest');
  assert.ok(town.stock.ryo > coffers + price - 20 && town.stock.ryo <= coffers + price, 'the ransom goes into the town coffers');
  assert.equal(rec.materialsBack, undefined, 'only a winner gets materials back');
  assert.ok(Math.hypot(hero.x - s.site2.x, hero.z - s.site2.z) < 120, 'the hero goes to his nearest own town');
}

{ // a bot surrenders to the player: the fair range, no, a raised offer, refuse for good, then the player's choice
  const s = scene({ attackerIsPlayer: true, ownTown: true, surrender: { bot: { notBeforeSeconds: 0, everySeconds: 1, lossAt: 0, chance: 1 } } }), { g, S, hero, rival, town, T } = s;
  s.camp.buildings.push({ id: 'w1:b2', type: 'barracks', stage: 'built', x: s.cx - 30, z: s.cz });
  const mine = s.troop('player', town.x + 30, town.z);
  S.clans[rival].ryo = 5000;
  const start = s.newsIn(45, 'warSurrender');
  assert.ok(start.some(n => n.clan === rival && n.side === 'defender'), 'the bot surrenders when its loss looks certain (forced here)');
  const offer = s.newsIn(s.frontier.war.surrender.bot.answerSeconds * 20 + 4, 'warOffer')[0];
  assert.ok(offer && offer.clan === rival && offer.to === 'player' && offer.amount >= 10, JSON.stringify(offer));
  let v = T.view('w1', 'player');
  assert.ok(!v.mine && v.offer.amount === offer.amount && v.fair[0] <= v.fair[1] && v.fair[0] >= 10, JSON.stringify(v));
  let r = s.cmd({ action: 'warOffer', war: 'w1', amount: 5 }); assert.equal(r.reason, 'Only the side that surrendered offers terms');
  r = s.cmd({ action: 'warAnswer', war: 'w1', answer: 'maybe' }); assert.equal(r.reason, 'Answer accept, no or never');
  r = s.cmd({ action: 'warAnswer', war: 'w1', answer: 'no' }); assert.ok(r.ok, r.reason);
  const offer2 = s.newsIn(s.frontier.war.surrender.bot.answerSeconds * 20 + 4, 'warOffer')[0];
  assert.ok(offer2 && offer2.amount > offer.amount, `the bot raises its offer (${offer.amount} -> ${offer2?.amount})`);
  r = s.cmd({ action: 'warAnswer', war: 'w1', answer: 'never' }); assert.ok(r.ok, r.reason);
  v = T.view('w1', 'player');
  assert.ok(v.state === 'outcome' && v.outcomes.length === 3 && v.outcomes.every(o => o.ok), JSON.stringify(v));
  r = s.cmd({ action: 'warOutcome', war: 'w1', outcome: 'raze' }); assert.equal(r.reason, 'Pick capture, sack or burn');
  // save parity in the outcome phase
  const save = JSON.parse(JSON.stringify(makeSave(g, { bots: [] })));
  const g2 = createGame(s.options); loadSave(g2, save);
  assert.deepEqual(g2.state.frontier.wars.list.w1.terms, s.w().terms, 'the surrender is in the save');
  r = s.cmd({ action: 'warOutcome', war: 'w1', outcome: 'burn' }); assert.ok(r.ok, r.reason);
  const rec = s.ended();
  assert.ok(rec.result === 'burned' && rec.terms.by === 'defender' && rec.returned === 800, JSON.stringify(rec.result));
  assert.ok(!S.frontier.settlements.tE, 'burned with no channel');
  assert.deepEqual([rec.materialsBack.timber, rec.materialsBack.stone], [50, 20], 'the winner gets his unused materials back');
}

{ // a bot's accepted surrender, and the player's choice timing out into a sack
  const s = scene({ attackerIsPlayer: true, ownTown: true, surrender: { bot: { notBeforeSeconds: 0, everySeconds: 1, lossAt: 0, chance: 1 } } }), { S, hero, rival, town, T } = s;
  S.clans[rival].ryo = 5000;
  s.newsIn(45, 'warSurrender');
  const offer = s.newsIn(s.frontier.war.surrender.bot.answerSeconds * 20 + 4, 'warOffer')[0];
  const treasury = S.clans.player.ryo;
  const r = s.cmd({ action: 'warAnswer', war: 'w1', answer: 'accept' }); assert.ok(r.ok, r.reason);
  const rec = s.ended();
  assert.ok(rec.result === 'ransomed' && rec.ransom.amount === offer.amount && rec.ransom.to === 'player');
  assert.equal(S.clans.player.ryo, treasury + offer.amount + 800, 'the ransom and his own chest reach his treasury');
  assert.deepEqual([rec.materialsBack.timber, rec.materialsBack.stone], [50, 20], 'the side that was surrendered to gets its unused materials back');
  assert.equal(town.owner, rival);

  const s2 = scene({ attackerIsPlayer: true, secondTown: false, surrender: { bot: { notBeforeSeconds: 0, everySeconds: 1, lossAt: 0, chance: 1 } } });
  s2.newsIn(45, 'warSurrender');
  s2.newsIn(s2.frontier.war.surrender.bot.answerSeconds * 20 + 4, 'warOffer');
  s2.run(s2.frontier.war.surrender.offerSeconds * 20 + 2);
  assert.equal(s2.w().terms.state, 'outcome', 'no answer in time counts as refused for good');
  assert.equal(s2.w().terms.ended, 'timeout');
  assert.deepEqual(s2.T.view('w1', 'player').outcomes.map(o => o.ok), [false, true, false], 'their last town: sack only');
  s2.run(s2.frontier.war.surrender.outcomeSeconds * 20 + 2);
  assert.equal(s2.ended()?.result, 'sacked', 'no choice in time: the town is sacked');
}

{ // the estimate: what a clan has met, never a chest; bots do not surrender while things look even
  const s = scene({ attackerIsPlayer: true }), { S, rival, town, T } = s;
  const before = T.chance(s.w(), rival);
  assert.ok(before > 0.02 && before < 0.98);
  for (let i = 0; i < 12; i++) s.troop('player', town.x + 20 + i * 2, town.z + 10);
  s.run(25);
  assert.ok((s.w().spotted?.[rival] || 0) > 0, 'the defender has spotted the army at its gates');
  const after = T.chance(s.w(), rival);
  assert.ok(after < before, `a spotted army lowers the defender's guess (${before} -> ${after})`);
  s.camp.chest = 999999;
  assert.equal(T.chance(s.w(), rival), after, 'the chest is never read');
  const p0 = T.price(s.w(), rival, 'attacker'); s.camp.chest = 5;
  assert.equal(T.price(s.w(), rival, 'attacker'), p0, 'nor for the price');
  assert.ok(T.townWorth(s.w()) >= 300 + Math.floor(town.stock.ryo), `a town is worth its tier and coffers at least (${T.townWorth(s.w())})`);
  s.run(40 * 20);
  assert.ok(!s.w()?.terms, 'no bot surrender this early');
}
console.log('war terms ok');
