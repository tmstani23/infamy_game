// War checkpoint 8a-3 to 8a-6 (Tim 2026-11-14): taking a hall (the channel), the outcomes Capture, Sack and Burn,
// the defender's win at the camp hall, the rout, the war chest and the cooldown.
// (sim/frontier/war_end.js, war_outcomes.js, world.js removeTown, structures.js hall repair, vehicle_garage.js)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), U = data('data/units.json');
function scene({ attackerIsPlayer = true, secondTown = true, seconds = 2 } = {}) {
  const frontier = data('data/frontier.json');
  frontier.war.channel.seconds = seconds;
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
  const town = S.frontier.settlements.tE;
  Object.assign(hero, { place: 'world', x: site.x + 400, z: site.z });
  g.step([]);   // the town gets its grid
  const free = town.grid.use.split('').findIndex((c, i) => c === '.' && i !== town.buildings[0].cell && !(town.buildings[0].cells || []).includes(i));
  town.buildings.push({ id: 'sk1', type: 'stockade', cell: free, stage: 'built' });
  S.frontier.wars ||= { list: {}, cooldown: {}, history: [] };
  const cx = site.x - 350, cz = site.z;
  const camp = { x: cx, z: cz, chest: 800, stock: { timber: 0, stone: 0 }, brought: {}, workers: [], workerTraining: [], buildings: [
    { id: 'w1:hall', type: 'camp_hall', stage: 'built', x: cx, z: cz }, { id: 'w1:b1', type: 'barracks', stage: 'built', x: cx + 30, z: cz }] };
  S.frontier.wars.list.w1 = { id: 'w1', town: 'tE', attacker, defender, x: cx, z: cz, started: S.tick, state: 'active', camp };
  g.step([]);
  const ST = g.frontier.structures, key = b => `t|tE|${(b.cells || [b.cell])[0]}`;
  const ruin = (clan, k) => { const st = ST.find(k); assert.ok(st, k); assert.ok(ST.damage(clan, st, 1e9, 'fire'), `damage ${k}`); };
  const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return S.frontier.receipts.findLast(r => r.action === c.action); };
  const troop = (owner, x, z) => S.entities[g.spawn('swordsman', 'swordsman', x, z, { owner, place: 'world', area: 'world', warTroop: 'w1', order: { kind: 'stop' } })];
  const run = n => { for (let i = 0; i < n; i++) g.step([]); };
  const newsOf = kind => S.news.find(n => n.kind === kind);
  return { g, S, hero, rival, attacker, defender, town, site, site2, camp, ST, key, ruin, cmd, troop, run, newsOf, frontier, options, WE: g.frontier.warEnd, war: g.frontier.war, cx, cz,
    w: () => S.frontier.wars.list.w1, ended: () => S.frontier.wars.history.find(h => h.id === 'w1') };
}
const near = (hero, p, dx = 3) => Object.assign(hero, { x: p.x + dx, z: p.z });
const dayTicks = s => Math.round((s.options.settings.dayNight.daySeconds + s.options.settings.dayNight.nightSeconds) * 20);

{ // the channel, the last town rule and Sack
  const s = scene({ secondTown: false, seconds: 3 }), { g, S, hero, rival, town, WE } = s;
  const hallKey = s.key(town.buildings[0]);
  let r = s.cmd({ action: 'warTake', war: 'w1', outcome: 'sack' });
  assert.ok(!r.ok && /Still standing: .*town hall/.test(r.reason) && /stockade/.test(r.reason), r.reason);
  s.ruin('player', s.key(town.buildings[1])); s.run(1);
  r = s.cmd({ action: 'warTake', war: 'w1', outcome: 'sack' });
  assert.ok(!r.ok && /Still standing: town hall$/.test(r.reason), r.reason);
  s.ruin('player', hallKey); s.run(1);
  assert.ok(s.ST.workTarget(town, s.ST.hallRuinKey(town)), 'workers may mend the ruined hall while nobody is taking it');
  r = s.cmd({ action: 'warTake', war: 'w1', outcome: 'sack' });
  assert.ok(!r.ok && r.reason === 'Walk up to the ruined hall', r.reason);
  const p = WE.hallPoint(s.w(), 'town'); near(hero, p);
  assert.deepEqual(WE.outcomeList(s.w()).map(o => o.ok), [true, true, true], 'a last town may be captured or burned too (Z2: the last-town rule is gone)');
  r = s.cmd({ action: 'warTake', war: 'w1' }); assert.equal(r.reason, 'Pick capture, sack or burn');
  r = s.cmd({ action: 'warTakeCamp', war: 'w1' }); assert.equal(r.reason, 'Only the defender takes the camp hall');
  r = s.cmd({ action: 'warTake', war: 'w1', outcome: 'sack' });
  assert.ok(r.ok, r.reason);
  const start = s.newsOf('hallChannel');
  assert.deepEqual({ ...start, x: 0, z: 0 }, { kind: 'hallChannel', war: 'w1', side: 'town', by: hero.id, clan: 'player', outcome: 'sack', x: 0, z: 0, town: 'tE' });
  assert.equal(hero.hallChannel, 'w1'); assert.equal(s.w().channel.outcome, 'sack');
  assert.ok(WE.channelOn('w1', 'town') && !WE.channelOn('w1', 'camp'));
  assert.equal(s.ST.workTarget(town, s.ST.hallRuinKey(town)), null, 'no mending the hall while it is being taken');
  r = s.cmd({ action: 'warTake', war: 'w1', outcome: 'sack' }); assert.equal(r.reason, 'Already taking the hall');
  s.run(20);
  let v = WE.view('w1');
  assert.ok(v.frac > 0.3 && v.frac < 0.45 && v.seconds === 2 && v.side === 'town' && v.clan === 'player', JSON.stringify(v));
  assert.ok(hero.hallChannel && Math.hypot(hero.x - (p.x + 3), hero.z - p.z) < 0.01, 'he stands still');
  // a hit starts the count again
  hero.hp -= 5; s.run(1);
  assert.ok(s.newsOf('hallChannelReset'), 'reset news'); assert.ok(WE.view('w1').frac < 0.05);
  s.run(10); hero.hitAt = S.tick; s.run(1);
  assert.ok(WE.view('w1').frac < 0.06, 'a hit that takes no health resets it too');
  // walking off stops it; so does Stop
  hero.x += 3; s.run(1);
  assert.equal(s.newsOf('hallChannelStop')?.why, 'moved'); assert.ok(!s.w().channel && !hero.hallChannel);
  assert.ok(s.ST.workTarget(town, s.ST.hallRuinKey(town)), 'the hall can be mended again');
  near(hero, p);
  assert.ok(s.cmd({ action: 'warTake', war: 'w1', outcome: 'sack' }).ok);
  assert.ok(s.cmd({ action: 'warTakeStop', war: 'w1' }).ok); assert.ok(!s.w().channel && !hero.hallChannel);
  assert.equal(s.cmd({ action: 'warTakeStop', war: 'w1' }).reason, 'Not taking a hall');
  // a new building going up does not stop a channel that has started
  assert.ok(s.cmd({ action: 'warTake', war: 'w1', outcome: 'sack' }).ok);
  town.buildings[1].stage = 'built'; s.run(2);
  assert.ok(s.w().channel, 'still running'); assert.ok(!g.frontier.warMorale.ready('w1', 'town'));
  // it completes: the sack
  const mine = [s.troop('player', town.x + 30, town.z + 5), s.troop('player', town.x - 20, town.z + 25)], theirs = s.troop(rival, town.x + 5, town.z - 30);
  const ryo0 = S.clans.player.ryo, rival0 = S.clans[rival].ryo;
  let end = null; for (let i = 0; i < 70 && !end; i++) { s.run(1); end = s.newsOf('warEnded'); }
  assert.ok(end, 'the war ended');
  assert.deepEqual({ ...end, x: 0, z: 0, ryo: 0 }, { kind: 'warEnded', war: 'w1', town: 'tE', townName: 'Enemyton', result: 'sacked', attacker: 'player', defender: rival, by: 'player', x: 0, z: 0, ryo: 0, chest: 800 });
  assert.ok(end.ryo >= 500 && end.ryo <= 502, `half the coffers (the town earns a little meanwhile): ${end.ryo}`);
  assert.ok(Math.abs(town.stock.ryo - end.ryo) < 2, 'half is left'); assert.equal(S.clans.player.ryo, ryo0 + end.ryo + 800, 'spoils and the war chest come home');
  assert.equal(S.clans[rival].ryo, rival0); assert.equal(town.owner, rival);
  assert.ok(!s.w() && s.ended().result === 'sacked' && s.ended().returned === 800);
  assert.equal(S.frontier.wars.cooldown.tE, s.ended().ended + Math.round(s.frontier.war.cooldownDays * dayTicks(s)));
  assert.ok(!hero.hallChannel);
  // the rout: every war troop of both sides runs from the town, then is gone
  const d0 = [...mine, theirs].map(e => Math.hypot(e.x - town.x, e.z - town.z));
  for (const e of [...mine, theirs]) assert.ok(e.rout && S.entities[e.id], 'routing');
  s.run(60);
  [...mine, theirs].forEach((e, i) => assert.ok(Math.hypot(e.x - town.x, e.z - town.z) > d0[i] + 3, `troop ${i} ran ${Math.hypot(e.x - town.x, e.z - town.z) - d0[i]}`));
  s.run(Math.round(s.frontier.war.rout.seconds * 20));
  for (const e of [...mine, theirs]) assert.ok(!S.entities[e.id], 'gone');
  assert.match(s.war.check(hero, 'tE', { x: hero.x, z: hero.z }).reason, /under truce for 3 more days/, 'no new war during the cooldown');
  g.frontier.world.checkInvariants();
  console.log('channel and sack ok');
}

{ // Capture
  const s = scene(), { g, S, hero, rival, town, WE } = s;
  s.ruin('player', s.key(town.buildings[1])); s.ruin('player', s.key(town.buildings[0])); s.run(1);
  near(hero, WE.hallPoint(s.w(), 'town'));
  assert.deepEqual(WE.outcomeList(s.w()).map(o => o.ok), [true, true, true]);
  const horse = S.entities[g.spawn('horse', 'mare_saddled', town.x, town.z, { horseOwner: rival, place: 'stable', stored: { town: 'tE' }, vehicle: true })];
  const worker = S.entities[g.spawn('civilian', 'farmer', town.x + 20, town.z, { place: 'world', area: 'world', worker: 'wx', town: 'tE', workerOwner: rival })];
  const limit0 = g.landOffice?.townsOf?.('player')?.length;
  assert.ok(s.cmd({ action: 'warTake', war: 'w1', outcome: 'capture' }).ok);
  const ryo0 = S.clans.player.ryo;
  let end = null; for (let i = 0; i < 60 && !end; i++) { s.run(1); end = s.newsOf('warEnded'); }
  assert.equal(end?.result, 'captured');
  assert.equal(town.owner, 'player'); assert.deepEqual(town.captured, { tick: s.ended().ended, from: rival });
  assert.ok(Math.abs(town.stock.ryo - 1000) < 3, 'the stores come with it'); assert.equal(S.clans.player.ryo, ryo0 + 800, 'the war chest comes home');
  assert.ok(!S.entities[worker.id], 'its people on the map are taken off');
  if (limit0 != null) assert.equal(g.landOffice.townsOf('player').length, limit0, 'a captured town does not count toward the founding limit');
  s.run(25);
  assert.notEqual(horse.stored.town, 'tE', `the old owner's stored horse moved: ${horse.stored.town}`);
  g.frontier.world.checkInvariants();
  // save and load mid-rout: the two games stay the same
  const save = JSON.parse(JSON.stringify(makeSave(g, { bots: [] })));
  const g2 = createGame(s.options); loadSave(g2, save);
  assert.ok(JSON.stringify(g2.state) === JSON.stringify(S), 'same right after load');
  for (let i = 0; i < 300; i++) { g.step([]); g2.step([]); }
  { const A = JSON.stringify(g2.state), B = JSON.stringify(S); let i = 0; while (i < A.length && A[i] === B[i]) i++;
    assert.ok(A === B, `same after 300 ticks: differs at ${i}: ${A.slice(i - 200, i + 200)} | ${B.slice(i - 200, i + 200)}`); }
  g.frontier.world.checkInvariants();
  console.log('capture ok');
}

{ // Burn
  const s = scene(), { g, S, hero, rival, town, WE } = s;
  s.ruin('player', s.key(town.buildings[1])); s.ruin('player', s.key(town.buildings[0])); s.run(1);
  near(hero, WE.hallPoint(s.w(), 'town'));
  const horse = S.entities[g.spawn('horse', 'mare_saddled', town.x, town.z, { horseOwner: rival, place: 'stable', stored: { town: 'tE' }, vehicle: true })];
  const troop = s.troop('player', town.x + 30, town.z);
  assert.ok(s.cmd({ action: 'warTake', war: 'w1', outcome: 'burn' }).ok);
  let end = null; for (let i = 0; i < 60 && !end; i++) { s.run(1); end = s.newsOf('warEnded'); }
  assert.equal(end?.result, 'burned'); assert.equal(end.townName, 'Enemyton');
  assert.ok(!S.frontier.settlements.tE && !S.frontier.totals.tE, 'the town is wiped');
  assert.ok(!Object.keys(S.frontier.fires || {}).some(k => k.startsWith('t|tE|')));
  assert.ok(troop.rout);
  s.run(400);   // the rest of the game carries on without it (economy ticks included)
  assert.ok(!S.entities[troop.id]);
  assert.notEqual(horse.stored.town, 'tE');
  assert.ok(!s.w() && s.ended().result === 'burned');
  g.frontier.world.checkInvariants();
  console.log('burn ok');
}

{ // the defender wins: the player takes the rival's camp hall
  const s = scene({ attackerIsPlayer: false }), { g, S, hero, rival, town, WE } = s;
  g.frontier.world.addTown({ id: 'tA', name: 'Rivalhome', owner: rival, x: s.site2.x + 600, z: s.site2.z, pop: 3, founded: true, stock: { food: 100 }, buildings: [{ type: s.frontier.founding.townHall, stage: 'built', cell: 0 }] });
  const home = S.frontier.settlements.tA;
  const boss = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === rival);
  Object.assign(boss, { place: 'world', x: s.cx + 40, z: s.cz + 10 });
  const crew = S.entities[g.spawn('grunt', 'grunt', s.cx + 42, s.cz + 12, { owner: rival, place: 'world', area: 'world' })];
  const awayCrew = S.entities[g.spawn('grunt', 'grunt', town.x + 2000, town.z, { owner: rival, place: 'world', area: 'world' })];
  const troop = s.troop(rival, s.cx + 20, s.cz + 20);
  const p = WE.hallPoint(s.w(), 'camp'); near(hero, p);
  let r = s.cmd({ action: 'warTakeCamp', war: 'w1' });
  assert.ok(!r.ok && /Still standing: .*camp hall/.test(r.reason), r.reason);
  s.ruin('player', 'c|w1|w1:b1'); s.ruin('player', 'c|w1|w1:hall'); s.run(1);
  near(hero, p);
  r = s.cmd({ action: 'warTake', war: 'w1', outcome: 'sack' }); assert.equal(r.reason, 'Only the attacker takes the town hall');
  r = s.cmd({ action: 'warTakeCamp', war: 'w1' }); assert.ok(r.ok, r.reason);
  assert.equal(s.newsOf('hallChannel').side, 'camp'); assert.equal(WE.view('w1').outcome, null);
  const ryo0 = S.clans[rival].ryo, away = [awayCrew.x, awayCrew.z];
  let end = null; for (let i = 0; i < 60 && !end; i++) { s.run(1); end = s.newsOf('warEnded'); }
  assert.equal(end?.result, 'campFell'); assert.equal(end.by, 'player');
  assert.ok(Math.abs(town.stock.ryo - 1800) < 3, `the war chest goes to the town coffers: ${town.stock.ryo}`); assert.equal(S.clans[rival].ryo, ryo0);
  assert.equal(town.owner, 'player'); assert.equal(s.ended().spoils, 800);
  assert.ok(Math.hypot(boss.x - home.x, boss.z - home.z) < 80, `their hero fell back home: ${Math.hypot(boss.x - home.x, boss.z - home.z)}`);
  assert.ok(Math.hypot(crew.x - home.x, crew.z - home.z) < 80, 'and his crew in the war circle');
  assert.deepEqual([awayCrew.x, awayCrew.z], away, 'crew elsewhere stay');
  assert.ok(troop.rout); s.run(Math.round(s.frontier.war.rout.seconds * 20) + 10); assert.ok(!S.entities[troop.id]);
  assert.ok(S.frontier.wars.cooldown.tE > S.tick);
  g.frontier.world.checkInvariants();
  console.log('camp fell ok');
}

{ // the screen side (tiny fake DOM): the prompt, the outcome picker, the war bar's channel strip
  const el = () => ({ hidden: false, innerHTML: '', dataset: {}, on: {}, kids: [], appendChild(c) { this.kids.push(c); }, addEventListener(t, f) { this.on[t] = f; } });
  globalThis.document = { getElementById: () => null, createElement: el, head: el(), body: el() };
  const { createWarOutcomeMenu, outcomeModel } = await import('../src/war_outcome_menu.js');
  const { warBarModel, warBarHtml } = await import('../src/war_bar.js');
  const s = scene({ seconds: 3 }), { g, S, hero, town, WE } = s, sent = [];
  const menu = createWarOutcomeMenu({ game: g, heroId: hero.id, send: c => sent.push(c) }), root = document.body.kids.at(-1);
  const flush = () => { g.step(sent.splice(0)); menu.update(); };
  assert.equal(menu.prompt(), ''); assert.equal(menu.use(), false, 'nothing to take yet');
  s.ruin('player', s.key(town.buildings[1])); s.ruin('player', s.key(town.buildings[0])); s.run(1);
  assert.equal(menu.prompt(), '', 'not at the hall');
  near(hero, WE.hallPoint(s.w(), 'town'));
  assert.equal(menu.prompt(), 'Space  Take the town hall');
  assert.ok(menu.use() && menu.isOpen()); menu.update();
  assert.ok(!root.hidden && /Take the town hall/.test(root.innerHTML) && /data-outcome="capture"/.test(root.innerHTML) && /data-outcome="burn"/.test(root.innerHTML), 'three choices');
  assert.match(root.innerHTML, /Take <b>5\d\d ryo<\/b>, half its coffers/);
  assert.ok(!/[\u2014\u00b7\u2192]/.test(root.innerHTML), 'no special characters');
  assert.equal(menu.prompt(), '', 'no prompt under the open picker');
  hero.x += 200; menu.update(); assert.ok(!menu.isOpen() && root.hidden, 'walking off closes it'); hero.x -= 200;
  // a last town: all three still have a button (Z2)
  delete S.frontier.settlements.tF;
  let cards = outcomeModel(g, hero.id, s.w()).cards;
  assert.deepEqual(cards.map(c => c.why), ['', '', '']);
  menu.use(); menu.update();
  assert.ok(/data-outcome="capture"/.test(root.innerHTML) && /data-outcome="sack"/.test(root.innerHTML));
  root.on.click({ target: { closest: () => ({ dataset: { outcome: 'sack' } }) } });
  assert.deepEqual(sent, [{ id: hero.id, type: 'frontier', action: 'warTake', war: 'w1', outcome: 'sack' }]); assert.ok(!menu.isOpen());
  flush();
  assert.ok(s.w().channel, 'the channel runs');
  assert.equal(menu.prompt(), 'Space  Stop taking the hall');
  s.run(20);
  const ch = menu.channelOf('w1');
  assert.ok(ch.mine && /^Taking the town hall: 2 s$/.test(ch.text) && ch.frac > 0.3, JSON.stringify(ch));
  const bar = warBarModel(g, hero.id); bar.channel = ch;
  assert.ok(bar.foe.ready && /wb-chan mine/.test(warBarHtml(bar)) && /Taking the town hall: 2 s/.test(warBarHtml(bar)));
  assert.ok(menu.use()); flush();
  assert.ok(!s.w().channel, 'Use again stops it'); assert.equal(menu.channelOf('w1'), null);
  assert.equal(menu.prompt(), 'Space  Take the town hall');
  // the screen's copy of the war (sim_snapshot.js) never lists the defender's other towns
  const { frontierFor } = await import('../src/sim_snapshot.js');
  const all = { isDiscovered: () => false, siteDiscovered: () => false };
  let snap = frontierFor(S.frontier, 'player', all, [], new Map());
  assert.equal(snap.wars.list.w1.lastTown, undefined, 'the last-town flag is gone (Z2)');
  g.frontier.world.addTown({ id: 'tG', name: 'Hidden', owner: s.rival, x: s.site2.x, z: s.site2.z, pop: 3, founded: true, stock: {}, buildings: [{ type: s.frontier.founding.townHall, stage: 'built', cell: 0 }] });
  snap = frontierFor(S.frontier, 'player', all, [], new Map());
  assert.ok(!snap.settlements.tG, 'the other town stays hidden');
  assert.deepEqual(WE.outcomeList(snap.wars.list.w1).map(o => o.ok), [true, true, true]);
  assert.equal(S.frontier.wars.list.w1.lastTown, undefined, 'never on the saved record');
  console.log('screen ok');
}
console.log('war end ok');
