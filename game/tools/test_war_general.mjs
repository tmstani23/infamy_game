// War checkpoint 8d-1 (Tim 2026-11-15): the bot general's core.
// (sim/frontier/war_general.js, sim/war_general_brain.js, save.js makeBots)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots, makeSave, loadSave } from '../src/sim/save.js';
import { STRATEGIES } from '../src/sim/frontier/war_general.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), U = data('data/units.json');
const frontierData = () => ({ ...data('data/frontier.json'), fixtureTowns: false, dev: true });
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json'), frontier: frontierData() });

function scene(seed = 47, tune = null) {
  const o = options(); tune?.(o.frontier);
  const g = createGame(o);
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: o.district.spawns, test: { playerRyo: 5000 }, seed });
  const S = g.state, hero = S.entities[m.heroId];
  const rivals = Object.keys(S.clans).filter(c => c !== 'player');
  const sites = world.sites.filter(s => Math.hypot(s.x - g.gate.island[0], s.z - g.gate.island[1]) > 700);
  const addTown = (id, owner, site, ryo) => g.frontier.world.addTown({ id, name: id, owner, x: site.x, z: site.z, pop: 14, founded: true,
    stock: { food: 5000, ryo, timber: 6000, stone: 6000, goods: 500 }, buildings: [{ type: o.frontier.founding.townHall, stage: 'built', cell: 0 }] });
  const far = sites.find(s => Math.hypot(s.x - sites[0].x, s.z - sites[0].z) > 2200);
  addTown('tP', 'player', sites[0], 4000); addTown('tR', rivals[0], far, 3000);
  Object.assign(hero, { place: 'world', x: sites[0].x + 60, z: sites[0].z });
  g.step([]);
  let bots = makeBots(g, m.rivals).filter(b => b.config?.general);
  const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return S.frontier.receipts.findLast(r => r.action === c.action); };
  const run = n => { for (let i = 0; i < n; i++) g.step(bots.flatMap(b => b.tick())); };
  return { g, S, hero, rivals, sites, far, cmd, run, m, o, get bots() { return bots; }, set bots(v) { bots = v; } };
}

// ---- strategy: rolled per seed for a bot, hidden default for the player, picked by command ----------------------
{
  const a = scene(47), b = scene(47), G = a.g.frontier.warGeneral;
  for (const r of a.rivals) { assert.ok(STRATEGIES.includes(G.strategyOf(r))); assert.equal(G.strategyOf(r), b.g.frontier.warGeneral.strategyOf(r), 'same seed, same strategy'); }
  assert.equal(G.strategyOf('player'), 'siege', 'the player starts on Siege');
  assert.equal(a.cmd({ action: 'warStrategy', strategy: 'rush' }).ok, true);
  assert.equal(a.S.clans.player.warStrategy, 'rush');
  assert.equal(a.cmd({ action: 'warStrategy', strategy: 'turtle' }).ok, false);
  // a rival keeps what it rolled
  const rh = Object.values(a.S.entities).find(e => e.type === 'hero' && e.owner === a.rivals[0]), was = G.strategyOf(a.rivals[0]);
  a.g.step([{ id: rh.id, type: 'frontier', action: 'warStrategy', strategy: STRATEGIES.find(s => s !== was) }]);
  assert.equal(G.strategyOf(a.rivals[0]), was);
  // every strategy turns up over a few seeds
  const seen = new Set();
  for (let seed = 1; seed <= 40 && seen.size < 3; seed++) { a.S.campaignSeed = seed; for (const r of a.rivals) { delete a.S.clans[r].warStrategy; seen.add(G.strategyOf(r)); } }
  assert.equal(seen.size, 3, 'all three strategies are rolled');
  // 8d-4: a client's snapshot carries its own strategy only, never a rival's
  for (const r of a.rivals) G.strategyOf(r);
  { const { createSnapshotEncoder } = await import('../src/sim_snapshot.js'); const text = JSON.stringify(createSnapshotEncoder(a.g, 'player').encode().set);
    assert.equal((text.match(/warStrategy/g) || []).length, 1, 'only the player clan carries warStrategy in the snapshot'); }
  console.log('ok strategy');
}

// ---- hand-over: the player's general runs his side only while his hero is outside the war circle -----------------
{
  const t = scene(), { S, hero, g } = t, G = g.frontier.warGeneral;
  assert.equal(t.cmd({ action: 'devStartWar', town: 'tP', side: 'defend' }).ok, true);
  const w = g.frontier.war.warOn('tP'), town = S.frontier.settlements.tP;
  assert.equal(w.defender, 'player');
  assert.equal(G.runs(w, 'player'), false, 'hero in the circle: no general');
  assert.equal(G.runs(w, w.attacker), true, 'a bot side always has its general');
  t.run(220);
  assert.equal(w.defense?.chest || 0, 0, 'the general leaves a watched side alone');
  // he walks out of the circle: the general fills the chest down to the keep line (half by default)
  const ryo0 = town.stock.ryo;
  hero.x = town.x + 1500;
  assert.equal(G.runs(w, 'player'), true);
  t.run(220);
  const keep = Math.floor(ryo0 * 0.5);
  assert.ok(Math.abs((w.defense.chest + (ryo0 - w.defense.put)) - ryo0) < 1e-6);
  assert.ok(w.defense.put >= ryo0 - keep - 10 && w.defense.put <= ryo0 - keep, `chest took ${w.defense.put} of ${ryo0}`);
  assert.equal(S.clans.player.ryo, 5000, 'the Clan treasury is never touched');
  // income later tops the chest up, the kept part stays
  g.frontier.world.change('tP', 'ryo', 300, 'test');
  const put1 = w.defense.put;
  t.run(120);
  assert.ok(w.defense.put >= put1 + 250, 'later income goes to the chest');
  assert.ok(town.stock.ryo >= keep - 40, `the kept part stays (${town.stock.ryo} of ${keep})`);
  // a new keep line: 0.9 keeps more, nothing more is taken
  assert.equal(t.cmd({ action: 'warKeep', town: 'tP', share: 0.9 }).ok, true);
  assert.equal(t.cmd({ action: 'warKeep', town: 'tP', share: 2 }).ok, false);
  assert.equal(t.cmd({ action: 'warKeep', town: 'tR', share: 0.5 }).ok, false, 'only your own town');
  g.frontier.world.change('tP', 'ryo', 100, 'test');
  const put2 = w.defense.put;
  t.run(120);
  assert.equal(w.defense.put, put2, 'under the new line nothing more goes in');
  // back in the circle: it stops
  assert.equal(t.cmd({ action: 'warKeep', town: 'tP', share: 0 }).ok, true);
  hero.x = town.x + 60;
  t.run(120);
  assert.equal(w.defense.put, put2, 'the hero is back: the general gives no orders');
  hero.x = town.x + 1500;
  t.run(120);
  assert.ok(town.stock.ryo < 60, 'away again with keep 0: all of it');
  console.log('ok hand-over');
}

// ---- a bot defender's general fills its chest; save and load carry on the same ---------------------------------
{
  const t = scene(), { S, g } = t;
  assert.equal(t.cmd({ action: 'devStartWar', town: 'tR', side: 'attack' }).ok, true);
  const w = g.frontier.war.warOn('tR');
  t.run(210);
  assert.ok(w.defense.put > 0, 'the bot town fills its war chest');
  const mine = c => t.bots.find(b => b.config.clan === c);
  assert.ok(mine(w.defender).saveState().wars[w.id]?.defender, 'its memory is kept by the brain');
  const save = JSON.parse(JSON.stringify(makeSave(g, { bots: t.bots })));
  const g2 = createGame(t.o), bots2 = loadSave(g2, save);
  assert.equal(bots2.filter(b => b.config?.general).length, Object.keys(S.clans).length, 'one general per clan after loading');
  g.frontier.world.change('tR', 'ryo', 500, 'test'); g2.frontier.world.change('tR', 'ryo', 500, 'test');
  const gens2 = bots2.filter(b => b.config?.general);
  for (let i = 0; i < 200; i++) { g.step(t.bots.flatMap(b => b.tick())); g2.step(gens2.flatMap(b => b.tick())); }
  const w2 = g2.frontier.war.warOn('tR');
  assert.deepEqual(w2.defense, w.defense, 'the loaded game fills the chest the same');
  for (const b of gens2) assert.deepEqual(b.saveState(), mine(b.config.clan).saveState(), 'and remembers the same');
  console.log('ok bot defender and save');
}
// ---- 8d-2: a bot town builds its defences in peace, then trains, meets attackers, mends and sorties --------------
{
  const t = scene(47, f => { f.war.town.musterSeconds = 5; f.war.general.buildSeconds = 5; }), { S, g } = t, G = g.frontier.warGeneral;
  const rival = t.rivals[0], town = S.frontier.settlements.tR, rules = G.rules();
  const want = rules.strategies[G.strategyOf(rival)].defend;
  const built = type => town.buildings.filter(b => b.type === type && b.stage === 'built').length;
  let n = 0;
  while (!built('barracks') && n++ < 400) t.run(100);
  assert.ok(built('barracks'), `the bot town built a barracks in peace (${n * 100} ticks)`);
  assert.equal(S.frontier.settlements.tP.buildings.some(b => b.type === 'barracks') || S.frontier.settlements.tP.projects?.some(p => p.type === 'barracks'), false, "the player's town is left alone");
  n = 0;
  while (!built('watchtower') && n++ < 400) t.run(100);
  assert.ok(built('watchtower'), 'and goes on down its list');
  // war: no stand-in troops; after the muster the barracks trains the strategy's mix from the chest
  assert.equal(t.cmd({ action: 'devStartWar', town: 'tR', side: 'attack' }).ok, true);
  const w = g.frontier.war.warOn('tR');
  const mine = () => Object.values(S.entities).filter(e => e.warTroop === w.id && e.owner === rival && !e.dead && e.type !== 'horse');
  n = 0;
  while (mine().length < 4 && n++ < 60) t.run(100);
  assert.ok(mine().length >= 4, `the town trained troops (${mine().length})`);
  assert.ok(mine().every(e => e.warUnit && want.mix[e.warUnit] > 0), 'only units of its mix, none from the stand-in defender');
  assert.ok(w.defense.put > 0 && w.defense.chest >= 0);
  // with nobody near they wait by the hall, toward the camp
  t.run(400);
  const ring = 600, far = e => Math.hypot(e.x - town.x, e.z - town.z);
  assert.ok(mine().every(e => far(e) < ring), 'they hold inside the ring');
  assert.equal(t.bots.find(b => b.config.clan === rival).view().wars[w.id].defender.mode, 'hold');
  // attackers by the town: the defenders go for them
  const foe = [0, 1, 2].map(i => S.entities[g.frontier.war.spawnTroop(w, 'grunt', town.x + 60 + i * 3, town.z + 40, 'player')]);
  for (const e of foe) { e.maxHp = e.hp = 5000; e.order = { kind: 'station', x: e.x, z: e.z }; }
  t.run(120);
  assert.equal(t.bots.find(b => b.config.clan === rival).view().wars[w.id].defender.mode, 'meet');
  assert.ok(mine().some(e => ['attackmove', 'attack'].includes(e.order?.kind) || e.attackTarget), 'defenders were sent at the attackers');
  // a damaged barracks: workers are sent to mend it
  const st = g.frontier.structures.list().find(x => x.town === 'tR' && x.type === 'barracks');
  if (town.workers?.length) {
    g.frontier.structures.damage('player', st, st.max * 0.5, 'test');
    t.run(120);
    assert.ok(town.workers.some(x => x.job?.key === st.key), 'workers mend the barracks');
  } else console.log('  (no town workers in this scene: mend not checked)');
  for (const e of foe) e.hp = 0, e.dead = true;
  console.log('ok bot defence');
}

// ---- 8d-3: a bot starts a war: packs at its launch town, walks over, plants the banner, camps, pushes, takes the hall
{
  const t = scene(47, f => { f.war.town.musterSeconds = 5; f.war.general.launchTownDays = 0.5; f.war.general.attack.planSeconds = 5; }), { S, g, hero } = t;
  const rival = t.rivals[0], tR = S.frontier.settlements.tR, tP = S.frontier.settlements.tP, War = g.frontier.war;
  S.clans[rival].warStrategy = 'rush';
  const rh = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === rival);
  Object.assign(rh, { place: 'world', x: tR.x + 30, z: tR.z });
  hero.x = tP.x + 1500;   // the player is away: his general holds the town
  const brain = t.bots.find(b => b.config.clan === rival);
  // a town founded less than launchTownDays ago launches nothing
  t.run(1200);
  assert.equal(brain.view().plan, null, 'too young a town: no war yet');
  assert.equal(S.clans[rival].warPack?.ryo || 0, 0);
  tR.founded = -6000 - 1;
  const ryo0 = tR.stock.ryo, treasury0 = S.clans[rival].ryo;
  t.run(400);
  assert.equal(brain.view().plan?.town, 'tP', 'it plans a war on the only town that is not its own');
  assert.equal(S.clans[rival].warPack.ryo, 1200, 'packed from the launch town');
  assert.ok(tR.stock.ryo < ryo0 - 1100 && S.clans[rival].ryo >= treasury0, 'the coffers pay, not the treasury');
  let n = 0;
  while (!War.warOn('tP') && n++ < 30) t.run(1000);
  const w = War.warOn('tP');
  assert.ok(w && w.attacker === rival, `the banner is planted (${S.tick} ticks)`);
  assert.equal(w.camp.brought?.ryo ?? w.camp.chest, 1200, 'the whole pack came along'); assert.ok(w.camp.chest <= 1200);
  t.run(120);
  assert.equal(brain.view().plan, null);
  // the camp: buildings in the strategy's order, troops, then the push
  n = 0;
  while (brain.view().wars[w.id]?.attacker?.mode !== 'push' && n++ < 12) t.run(500);
  assert.equal(brain.view().wars[w.id].attacker.mode, 'push', 'the army pushes once it is big enough');
  assert.ok(w.camp.buildings.some(b => b.type === 'barracks' && b.stage === 'built'));
  assert.ok(Object.values(S.entities).filter(e => e.warTroop === w.id && e.owner === rival && !e.dead).length >= 6);
  // the town has no defences here: the hall falls, the bot's hero takes it, the war ends (its last town: a sack)
  n = 0;
  while (War.warOn('tP') && n++ < 20) t.run(500);
  assert.equal(War.warOn('tP'), null, 'the war ends');
  assert.equal(S.frontier.wars.history.at(-1).result, 'sacked');
  // afterwards he walks home, and leaves the sacked town alone
  t.run(2000);
  assert.equal(brain.view().goal?.why, 'home');
  assert.equal(brain.view().plan, null, 'no new war on a town under truce');
  console.log('ok bot attack');
}

// ---- 8d-5 the military zone: painted ground for military buildings; the general builds there first ----------------
{
  const t = scene(), { S, g } = t, tP = S.frontier.settlements.tP, tR = S.frontier.settlements.tR;
  const isMil = type => !!t.o.frontier.buildings[type]?.military;
  const rectOf = s => { const m = Math.floor(s.grid.n / 2); return [m + 3, m + 3, m + 7, m + 6]; };
  const count = s => (s.grid.zone.match(/m/g) || []).length;
  assert.equal(t.cmd({ action: 'zone', town: 'tP', kind: 'military', rect: rectOf(tP) }).ok, true, 'paint the military zone');
  const painted = count(tP); assert.ok(painted >= 12, `military cells painted: ${painted}`);
  const cells = [...tP.grid.zone].map((c, i) => c === 'm' ? i : -1).filter(i => i >= 0);
  assert.equal(t.cmd({ action: 'zone', town: 'tP', kind: 'housing', rect: rectOf(tP) }).ok, false, 'housing cannot be zoned over it');
  const no = t.cmd({ action: 'place', town: 'tP', kind: 'storehouse', cells: [cells[0]] });
  assert.equal(no.ok, false); assert.match(no.reason, /military zone/);
  g.frontier.structures.list();   // the zone cells are no structures and break nothing
  assert.ok(!g.frontier.structures.list().some(st => st.town === 'tP' && st.kind === 'zone' && cells.includes(st.cell)), 'a military zone cell is not a building');
  // the player's general builds there only with the governor's initiative On
  tP.autoBuild = false; t.run(1300);
  assert.ok(!tP.projects.some(p => isMil(p.type)) && !tP.buildings.some(b => isMil(b.type)), 'initiative Off: he builds nothing');
  tP.autoBuild = true; t.run(1300);
  const mine = [...tP.projects, ...tP.buildings].filter(x => isMil(x.type));
  assert.ok(mine.length >= 1, 'initiative On: a military building is started');
  for (const x of mine) assert.ok((x.cells || [x.cell]).some(i => cells.includes(i)), 'inside the zone');
  assert.ok(count(tP) < painted, 'the cells it covers stop being zone');
  // no zone: the player's general builds nothing, even with the initiative On
  { const u = scene(), s = u.S.frontier.settlements.tP; s.autoBuild = true; u.run(1300); assert.ok(!s.projects.some(p => isMil(p.type)), 'no zone, no building'); }
  // a rival fills its zone first
  const rh = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === tR.owner);
  for (const p of [...tR.projects]) if (isMil(p.type)) g.step([{ id: rh.id, type: 'frontier', action: 'cancel', project: p.id }]);
  const had = new Set([...tR.projects, ...tR.buildings].map(x => x.id));
  g.step([{ id: rh.id, type: 'frontier', action: 'zone', town: 'tR', kind: 'military', rect: rectOf(tR) }]);
  const rc = [...tR.grid.zone].map((c, i) => c === 'm' ? i : -1).filter(i => i >= 0); assert.ok(rc.length >= 12, 'the rival zone is painted');
  t.run(2500);
  const fresh = [...tR.projects, ...tR.buildings].filter(x => isMil(x.type) && !had.has(x.id));
  assert.ok(fresh.length >= 1, 'the rival builds on'); assert.ok((fresh[0].cells || [fresh[0].cell]).some(i => rc.includes(i)), 'in its zone first');
  // the eraser clears zone cells
  const left = [...tP.grid.zone].map((c, i) => c === 'm' ? i : -1).filter(i => i >= 0);
  assert.equal(t.cmd({ action: 'remove', town: 'tP', cells: left }).ok, true); assert.equal(count(tP), 0, 'erased');
  console.log('ok military zone');
}
console.log('test_war_general: all passed');
