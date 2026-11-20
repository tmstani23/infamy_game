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
  const t = scene(47, f => { f.war.town.musterSeconds = 5; f.war.general.buildSeconds = 5; f.war.general.sallyEdge = 99; }), { S, g } = t, G = g.frontier.warGeneral;
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
  const inMix = u => want.mix[u] > 0 || Object.entries(rules.roles || {}).some(([r, at]) => want.mix[r] > 0 && (t.o.frontier.war.units[u]?.at || []).some(b => at.includes(b)));
  assert.ok(mine().every(e => e.warUnit && inMix(e.warUnit)), 'only units of its mix, none from the stand-in defender');
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
  // 8d-8 a sally: the army is worth sallyEdge times the attacker's troops it sees, so it goes for the camp below sortieAt
  const brainR = t.bots.find(b => b.config.clan === rival), free = () => mine().filter(e => !e.garrison && !e.order?.garrisonKey && !e.downed);
  t.run(200);
  assert.equal(brainR.view().wars[w.id].defender.mode, 'hold', 'not strong enough by the old rule, and no sally at edge 99');
  // (Z4e: its archers now stand in the town's watchtowers too, so fewer are left in the open)
  assert.ok(free().length >= 3 && free().length < want.sortieAt, `a small army (${free().length} of ${want.sortieAt})`);
  const strongGuard = [0, 1, 2, 3, 4, 5, 6, 7].map(i => S.entities[g.frontier.war.spawnTroop(w, 'enforcer', w.x + i * 2, w.z - 30, 'player')]);
  for (const e of strongGuard) e.order = { kind: 'station', x: e.x, z: e.z };
  g.frontier.data.war.general.sallyEdge = 1.5;
  t.run(120);
  assert.equal(brainR.view().wars[w.id].defender.mode, 'hold', 'the camp guard is a match for it: still no sally');
  const guard = Object.values(S.entities).filter(e => e.warTroop === w.id && e.owner === 'player' && !e.dead);
  for (const e of guard.slice(1)) e.hp = 0, e.dead = true;   // one of the camp guard is left
  t.run(120);
  assert.equal(brainR.view().wars[w.id].defender.mode, 'sortie', 'the stronger town sallies');
  assert.ok(free().some(e => (e.order?.kind === 'raze' && String(e.order.structure).startsWith(`c|${w.id}|`)) || (e.order?.kind === 'attackmove' && Math.hypot(e.order.x - w.x, e.order.z - w.z) < 200)), 'at the war camp (a building, or the workers mending by it)');
  // the attacker grows past it: the army comes home and rests
  const big = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => S.entities[g.frontier.war.spawnTroop(w, 'enforcer', w.x + i * 2, w.z - 30, 'player')]);
  for (const e of big) e.order = { kind: 'station', x: e.x, z: e.z };
  t.run(120);
  assert.notEqual(brainR.view().wars[w.id].defender.mode, 'sortie', 'outmatched: no sally');
  assert.ok(brainR.view().wars[w.id].defender.rest > S.tick, 'and a rest before the next');
  for (const e of big) e.hp = 0, e.dead = true;
  // Tim 2026-11-17: at its troop cap with ryo to train more, the town puts up supply tents (more than its list names)
  const tents = () => town.buildings.filter(b => b.type === 'supply_tents').length + (town.projects || []).filter(p => p.type === 'supply_tents').length;
  const listed = want.build.filter(x => x === 'supply_tents').length, cap0 = g.frontier.war.defense.troopCap(w.id);
  n = 0;
  while (g.frontier.war.warOn('tR') && (tents() <= listed || g.frontier.war.defense.troopCap(w.id) <= cap0) && n++ < 300) { t.run(100); w.defense.chest = Math.max(w.defense.chest, 2000); town.stock.timber = Math.max(town.stock.timber, 600); }
  assert.ok(tents() > listed, `supply tents beyond its list (${tents()} of ${listed} listed)`);
  assert.ok(g.frontier.war.defense.troopCap(w.id) > cap0, 'and a bigger troop cap');
  // Tim 2026-11-17: towns rebuild ruins during a war; the general rebuilds a ruined military building of its plan
  if (g.frontier.war.warOn('tR')) {
    const wt = g.frontier.structures.list().find(x => x.town === 'tR' && x.type === 'watchtower');
    g.frontier.structures.damage('player', wt, wt.max * 2, 'test');
    const ruin = town.buildings.find(b => b.type === 'watchtower' && b.stage === 'ruined');
    assert.ok(ruin, 'a watchtower is knocked down');
    for (const r of ['timber', 'stone', 'goods']) town.stock[r] = Math.max(town.stock[r] || 0, 900);
    n = 0;
    while (!(town.projects || []).some(p => p.replaces === ruin.id) && ruin.stage === 'ruined' && n++ < 60) t.run(20);
    assert.ok((town.projects || []).some(p => p.replaces === ruin.id) || ruin.stage !== 'ruined', `the general rebuilds it during the war (${n * 20} ticks)`);
  } else console.log('  (the war is over: rebuild in war not checked)');
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
  // the town has no defences here: the hall falls, the bot's hero takes it, the war ends (Z2: a last town is captured like any other)
  n = 0;
  while (War.warOn('tP') && n++ < 20) t.run(500);
  assert.equal(War.warOn('tP'), null, 'the war ends');
  assert.equal(S.frontier.wars.history.at(-1).result, 'captured');
  assert.notEqual(S.frontier.settlements.tP.owner, 'player', 'the town is his now');
  // afterwards he starts no new war: the player has no town left
  t.run(2000);
  assert.equal(brain.view().plan, null, 'no new war');
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
// ---- 8d-8: walls by strategy, the pack by the target's tier, clan specials, the camp digs in -----------------------
{
  // a bot town walls itself in peace: Siege all round, Raider one side, Rush not at all; gates first, nothing trapped
  const count = (s, ch) => [...s.grid.use].filter(c => c === ch).length, got = {};
  for (const k of ['siege', 'raider', 'rush']) {
    const t = scene(47, f => { f.war.general.buildSeconds = 5; }), tR = t.S.frontier.settlements.tR;
    t.S.clans[t.rivals[0]].warStrategy = k;
    let n = 0; while (!tR.buildings.some(b => b.type === 'barracks' && b.stage === 'built') && n++ < 400) t.run(100);
    assert.equal(count(tR, 'w'), 0, 'no wall before the first military building');   // the barracks was just finished
    t.run(1200);
    got[k] = [count(tR, 'w'), count(tR, 'g')];
    const P = t.g.frontier.modules.find(x => x.name === 'placement').placement;
    assert.equal(P.trapped(tR).size, 0, `${k}: nothing in the town is walled in`);
    assert.equal(count(t.S.frontier.settlements.tP, 'w'), 0, "the player's town is never walled for him");
    if (k === 'siege') {
      const brain = t.bots.find(b => b.config.clan === t.rivals[0]);
      assert.ok(brain.view().walls.tR, 'a finished wall is remembered');
      const was = got[k][0]; t.run(600); assert.equal(count(tR, 'w'), was, 'and left alone');
    }
  }
  assert.ok(got.siege[0] >= 40 && got.siege[1] >= 2, `Siege rings the town: ${got.siege}`);
  assert.ok(got.raider[0] >= 10 && got.raider[0] <= got.siege[0] * 0.75 && got.raider[1] >= 1, `Raider walls one side: ${got.raider}`);
  assert.deepEqual(got.rush, [0, 0], 'Rush builds none');
  console.log('ok walls', JSON.stringify(got));
}
{
  // the pack follows the target's tier; a launch town that cannot pay it starts nothing
  const tune = f => { const G = f.war.general; f.war.town.musterSeconds = 5; G.launchTownDays = 0.5; G.attack.planSeconds = 5;
    G.attack.packByTier[1] = { ryo: 2400, timber: 800, stone: 400 }; G.attack.fortify.afterSeconds = 60; G.attack.fortify.build = ['watchtower'];
    G.strategies.rush.attack.build = ['barracks', 'rifle_range', 'clan_hall']; G.strategies.rush.attack.mix = { grunt: 1, special: 3 }; G.strategies.rush.attack.pushAt = 30; };
  const set = t => { const rival = t.rivals[0], tR = t.S.frontier.settlements.tR, tP = t.S.frontier.settlements.tP;
    t.S.clans[rival].warStrategy = 'rush'; tP.tier = 2; tR.founded = -6000 - 1; t.hero.x = tP.x + 1500;
    const rh = Object.values(t.S.entities).find(e => e.type === 'hero' && e.owner === rival); Object.assign(rh, { place: 'world', x: tR.x + 30, z: tR.z });
    return { rival, tR, tP, brain: t.bots.find(b => b.config.clan === rival) }; };
  { const t = scene(47, tune), x = set(t); x.tR.stock.ryo = 2500; t.run(400);
    assert.equal(x.brain.view().plan, null, 'cannot pay the pack for a Village and keep its share: no war'); }
  const t = scene(47, tune), { S, g } = t, { rival, tR, brain } = set(t), War = g.frontier.war;
  t.run(400);
  assert.equal(brain.view().plan?.town, 'tP');
  assert.deepEqual([S.clans[rival].warPack.ryo, S.clans[rival].warPack.timber, S.clans[rival].warPack.stone], [2400, 800, 400], 'the pack for a tier 2 town');
  let n = 0;
  while (!War.warOn('tP') && n++ < 30) t.run(1000);
  const w = War.warOn('tP');
  assert.ok(w && w.attacker === rival, 'the banner is planted');
  assert.equal(w.camp.brought?.ryo ?? w.camp.chest, 2400);
  // clan specials: the camp works up to its clan hall and trains what its clan trains there (a role in the mix)
  const units = t.o.frontier.war.units, special = () => Object.values(S.entities).filter(e => e.warTroop === w.id && e.owner === rival && units[e.warUnit]?.special);
  n = 0;
  while (!special().length && War.warOn('tP') && n++ < 40) t.run(200);
  assert.ok(w.camp.buildings.some(b => b.type === 'clan_hall' && b.stage === 'built'), 'the camp built its clan hall');
  assert.ok(special().length >= 1, `a clan special was trained (${special().map(e => e.warUnit)})`);
  assert.ok(special().every(e => units[e.warUnit].clan === S.clans[rival].faction));
  const all = Object.values(S.entities).filter(e => e.warTroop === w.id && e.owner === rival && !e.dead);
  assert.ok(all.some(e => e.warUnit === 'grunt'), 'the barracks keeps training beside it');
  // dug in: after fortify.afterSeconds the camp puts up a watchtower (not on the Rush list) and a palisade line
  n = 0;
  while (!(w.camp.buildings.some(b => b.type === 'watchtower') && w.camp.buildings.some(b => b.type === 'palisade')) && War.warOn('tP') && n++ < 40) t.run(200);
  assert.equal(brain.view().wars[w.id].attacker.fort, true, 'the camp digs in when the fight draws out');
  assert.ok(w.camp.buildings.some(b => b.type === 'watchtower'), 'a watchtower'); assert.ok(w.camp.buildings.some(b => b.type === 'palisade'), 'and a palisade');
  console.log('ok pack by tier, specials, dug in');
  // Tim 2026-11-17: at its troop cap with ryo to train more, the camp puts up supply tents before the rest of its plan
  { const tune2 = f => { tune(f); const G = f.war.general; G.attack.packByTier[1] = { ryo: 2400, timber: 330, stone: 100 }; G.attack.fortify.afterSeconds = 1e6; G.buildOn = [];
      G.strategies.rush.attack.build = ['barracks', 'stockade']; G.strategies.rush.attack.mix = { grunt: 1 }; G.strategies.rush.attack.pushAt = 99; };
    const t2 = scene(47, tune2), x2 = set(t2), War2 = t2.g.frontier.war;
    let k2 = 0; while (!War2.warOn('tP') && k2++ < 40) t2.run(1000);
    const w2 = War2.warOn('tP'); assert.ok(w2 && w2.attacker === x2.rival, 'the banner is planted');
    const has = type => w2.camp.buildings.filter(b => b.type === type && b.stage !== 'ruined').length;
    for (k2 = 0; k2 < 400 && War2.warOn('tP') && !has('supply_tents'); k2++) t2.run(20);
    assert.ok(has('supply_tents') >= 1 && !has('stockade'), `supply tents jump the plan at the troop cap (tents ${has('supply_tents')}, stockade ${has('stockade')}, troops ${JSON.stringify(War2.troopView(w2.id))})`);
    for (k2 = 0; k2 < 40 && x2.brain.view().wars[w2.id]?.attacker.want?.timber !== 400; k2++) t2.run(20);
    assert.equal(x2.brain.view().wars[w2.id].attacker.want?.timber, 400, 'it saves for the stockade (ordered by train once linked)'); }
  console.log('ok supply tents on demand');
}
// ---- 8d-9: the stockade as a fortress (Tim 2026-11-16): generals build it, ranged troops hold it and shoot out ----
{
  const F0 = frontierData(), ST = F0.war.general.strategies, cnt = l => (l || []).filter(x => x === 'stockade').length;
  assert.deepEqual(['siege', 'raider', 'rush'].map(k => cnt(ST[k].defend.build)), [3, 1, 0], 'Siege every stockade, Raider one, Rush none');
  assert.equal(cnt(ST.siege.attack.build), 1, 'a Siege camp builds one'); assert.equal(cnt(F0.war.general.attack.fortify.build), 1, 'and a camp that digs in');
  const tune = f => { const G = f.war.general; f.war.town.musterSeconds = 5; G.buildSeconds = 5; G.sallyEdge = 99; G.strategies.siege.defend.build = ['barracks', 'rifle_range', 'stockade', 'stockade', 'stockade', 'stockade']; G.strategies.siege.defend.wall = { share: 0 };
    G.strategies.siege.defend.mix = { archer: 3, grunt: 1 }; };
  const forts = s => s.buildings.filter(b => b.type === 'stockade' && b.stage === 'built').length, under = s => [...s.buildings, ...(s.projects || [])].filter(b => b.type === 'stockade').length;
  // a Village gets one, a Town three
  { const t = scene(47, tune), tR = t.S.frontier.settlements.tR; t.S.clans[t.rivals[0]].warStrategy = 'siege'; tR.tier = 2;
    let n = 0; while (!forts(tR) && n++ < 400) t.run(100);
    t.run(1500);
    assert.equal(under(tR), 1, 'a Village has one stockade'); }
  const t = scene(47, tune), { S, g } = t, rival = t.rivals[0], tR = S.frontier.settlements.tR;
  S.clans[rival].warStrategy = 'siege'; tR.tier = 3;
  let n = 0; while (forts(tR) < 3 && n++ < 600) t.run(100);
  assert.equal(forts(tR), 3, `a Siege Town builds three stockades (${n * 100} ticks)`);
  assert.equal(S.frontier.settlements.tP.buildings.some(b => b.type === 'stockade'), false, "none in the player's town");
  // war: the ranged troops go into a stockade (not a house) and shoot at attackers from it
  assert.equal(t.cmd({ action: 'devStartWar', town: 'tR', side: 'attack' }).ok, true);
  const w = g.frontier.war.warOn('tR'), SX = g.frontier.structures;
  const fort = SX.list().filter(x => x.town === 'tR' && x.type === 'stockade');
  assert.equal(fort.length, 3); assert.ok(fort.every(x => x.max === 48000), 'a Town stockade has 48,000 health');
  const mine = () => Object.values(S.entities).filter(e => e.warTroop === w.id && e.owner === rival && !e.dead && e.type !== 'horse');
  const held = () => mine().filter(e => e.garrison?.zone);
  n = 0; while (held().length < 2 && n++ < 80) t.run(100);
  assert.ok(held().length >= 2, `ranged troops went inside (${held().length})`);
  assert.ok(held().every(e => e.garrison.fort && fort.some(x => x.key === e.garrison.key)), 'into a stockade, before any house');
  assert.ok(held().every(e => e.garrison.heal > 1), 'they recover faster inside');
  const st = fort.find(x => x.key === held()[0].garrison.key);
  const foe = S.entities[g.frontier.war.spawnTroop(w, 'grunt', st.x + 12, st.z, 'player')];   // by its wall foe.maxHp = foe.hp = 50000; foe.order = { kind: 'station', x: foe.x, z: foe.z };
  let shot = false; for (let i = 0; i < 200 && !shot; i++) { foe.x = st.x + 12; foe.z = st.z; t.run(1); shot = (S.projectiles || []).some(p => p.garrison && S.entities[p.a]?.garrison?.key === st.key); }
  assert.ok(shot, 'they shoot out of the stockade');
  // a hit on a troop inside lands on the stockade
  const before = SX.hpOf(st); g.frontier.garrison.shelter(held().find(e => e.garrison.key === st.key), 500, foe);
  assert.equal(SX.hpOf(st), before - 500, 'the stockade takes the hit');
  // the stockade falls: everyone inside piles out
  SX.damage('player', st, 1e6, 'test');
  assert.ok(mine().every(e => e.garrison?.key !== st.key), 'a fallen stockade lets everyone out');
  foe.hp = 0; foe.dead = true;
  console.log('ok stockade: towns');
}
{
  // a war camp builds the stockade; the ranged troops of the camp hold it and come out for the push
  const tune = f => { const G = f.war.general; f.war.town.musterSeconds = 5; G.launchTownDays = 0.5; G.attack.planSeconds = 5; G.attack.fortify.afterSeconds = 1e6;
    G.strategies.siege.attack.build = ['barracks', 'rifle_range', 'stockade']; G.strategies.siege.attack.mix = { archer: 3, grunt: 1 }; G.strategies.siege.attack.pushAt = 40; G.strategies.siege.attack.palisade = null; };
  const t = scene(47, tune), { S, g } = t, rival = t.rivals[0], tR = S.frontier.settlements.tR, tP = S.frontier.settlements.tP, War = g.frontier.war;
  S.clans[rival].warStrategy = 'siege'; tR.founded = -6000 - 1; t.hero.x = tP.x + 1500;
  const rh = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === rival); Object.assign(rh, { place: 'world', x: tR.x + 30, z: tR.z });
  let n = 0; while (!War.warOn('tP') && n++ < 40) t.run(1000);
  const w = War.warOn('tP'); assert.ok(w && w.attacker === rival, 'the banner is planted');
  w.camp.chest = (w.camp.chest || 0) + 6000; w.camp.stock.timber = (w.camp.stock.timber || 0) + 3000; w.camp.stock.stone = (w.camp.stock.stone || 0) + 2000;   // enough for the whole list
  const fortB = () => w.camp.buildings.find(b => b.type === 'stockade' && b.stage === 'built');
  n = 0; while (!fortB() && War.warOn('tP') && n++ < 80) t.run(200);
  assert.ok(fortB(), 'the camp built a stockade');
  const st = g.frontier.structures.list().find(x => x.camp && x.war === w.id && x.type === 'stockade');
  assert.equal(st.max, t.o.frontier.war.structures.campStockade[0], 'camp stockade health');
  const troops = () => Object.values(S.entities).filter(e => e.warTroop === w.id && e.owner === rival && !e.dead), brain = t.bots.find(b => b.config.clan === rival);
  n = 0; let seen = 0; while (!(seen = troops().filter(e => e.garrison?.key === st.key).length) && War.warOn('tP') && n++ < 300) t.run(20);
  assert.ok(seen >= 1, 'ranged troops of the camp wait inside it');
  assert.ok(troops().filter(e => e.garrison).every(e => ['archer', 'yumi', 'rifleman', 'teppo'].includes(e.warUnit)), 'only the ranged ones');
  assert.equal(brain.view().wars[w.id].attacker.mode, 'hold');
  g.frontier.data.war.general.strategies.siege.attack.pushAt = 3;   // enough for a push now
  n = 0; while (brain.view().wars[w.id]?.attacker.mode !== 'push' && War.warOn('tP') && n++ < 200) t.run(50);
  assert.equal(brain.view().wars[w.id].attacker.mode, 'push'); t.run(60);
  assert.equal(troops().filter(e => e.garrison?.key === st.key && brain.view().wars[w.id].attacker.wave?.includes(e.id)).length, 0, 'they come out for the push');
  console.log('ok stockade: war camp');
}
// ---- 8d-10: the camp answers a stockade with siege guns, and builds its plan before it pushes in full -------------
{
  const tune = f => { const G = f.war.general; f.war.town.musterSeconds = 5; G.launchTownDays = 0.5; G.attack.planSeconds = 5; G.attack.fortify.afterSeconds = 1e6;
    G.strategies.rush.attack.build = ['barracks', 'supply_tents', 'rifle_range']; G.strategies.rush.attack.pushAt = 3; G.strategies.rush.attack.palisade = null;
    G.strategies.rush.attack.bold = 1; G.attack.edgePush = 0; }; // bold and always ahead: the stockade guard alone holds it back
  const t = scene(47, tune), { S, g } = t, rival = t.rivals[0], tR = S.frontier.settlements.tR, tP = S.frontier.settlements.tP, War = g.frontier.war;
  S.clans[rival].warStrategy = 'rush'; tR.founded = -6000 - 1; t.hero.x = tP.x + 1500;
  const rh = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === rival); Object.assign(rh, { place: 'world', x: tR.x + 30, z: tR.z });
  // the player's town has a stockade (a Village may have one)
  tP.tier = 2;
  const P = g.frontier.modules.find(x => x.name === 'placement').placement, n = tP.grid.n;
  let fortAt = null; for (let i = 0; i < n * n && !fortAt; i++) { const r = P.check(tP, { kind: 'stockade', cells: [i] }); if (r.ok && Math.hypot(i % n - n / 2, Math.floor(i / n) - n / 2) > 3) fortAt = r.cells; }
  assert.ok(fortAt, 'room for a stockade'); tP.buildings.push({ id: 'bFort', type: 'stockade', stage: 'built', cell: fortAt[0], cells: fortAt });
  let k = 0; while (!War.warOn('tP') && k++ < 40) t.run(1000);
  const w = War.warOn('tP'); assert.ok(w && w.attacker === rival, 'the banner is planted');
  w.camp.chest = (w.camp.chest || 0) + 6000; w.camp.stock.timber = (w.camp.stock.timber || 0) + 4000; w.camp.stock.stone = (w.camp.stock.stone || 0) + 3000;
  const brain = t.bots.find(b => b.config.clan === rival), mem = () => brain.view().wars[w.id]?.attacker || {};
  let pushes = 0, early = 0, was = mem().mode;
  for (k = 0; k < 400 && War.warOn('tP') && !w.camp.buildings.some(b => b.type === 'foundry' && b.stage === 'built'); k++) {
    t.run(20);
    const m = mem(); if (m.mode === 'push' && was !== 'push') { pushes++; if (m.left > 0) early++; } was = m.mode;
    assert.ok(!m.early || !m.siegeUp, 'no early push into a stockade before siege guns');
  }
  assert.equal(mem().siegeUp, true, 'it saw the stockade');
  assert.ok(War.upgraded(w.camp), 'it bought the camp hall upgrade for the foundry');
  assert.ok(w.camp.buildings.some(b => b.type === 'foundry' && b.stage === 'built'), 'and built the foundry (not on the Rush list)');
  assert.ok(early <= 2, `no more than its probes before the plan stands (${early} of ${pushes})`);
  const units = t.o.frontier.war.units, siege = () => Object.values(S.entities).filter(e => e.warTroop === w.id && e.owner === rival && (units[e.warUnit]?.at || []).includes('foundry'));
  const queued = () => w.camp.buildings.some(b => b.type === 'foundry' && (b.queue || []).length);
  for (k = 0; k < 200 && War.warOn('tP') && !siege().length && !queued(); k++) t.run(20);
  assert.ok(siege().length || queued(), 'siege guns are trained');
  console.log('ok siege answer, plan before pushes');
}
// ---- finish 8e (Tim 2026-11-17): a general's temperament, and early pushes before its list is built ----------------
{
  // the roll: seeded per war and side, kept on the war, odds by strategy
  const t0 = scene(47), Gen = t0.g.frontier.warGeneral;
  assert.ok(Gen?.temper, 'the general rolls a temperament');
  const fake = (id, s) => ({ id, attacker: t0.rivals[0], defender: 'player' });
  let bold = 0; for (let i = 0; i < 200; i++) { const w = fake('w' + i); const a = Gen.temper(w, 'attacker'); assert.equal(Gen.temper(w, 'attacker'), a, 'kept'); assert.equal(w.temper.attacker, a); if (a === 'bold') bold++; }
  const odds = t0.o.frontier.war.general.strategies[Gen.strategyOf(t0.rivals[0])].attack.bold;
  assert.ok(Math.abs(bold / 200 - odds) < 0.15, `bold about ${odds} of the time (${bold}/200)`);
  const again = scene(47), Gen2 = again.g.frontier.warGeneral;
  for (let i = 0; i < 20; i++) assert.equal(Gen2.temper(fake('w' + i), 'attacker'), Gen.temper(fake('w' + i), 'attacker'), 'same seed, same roll');

  // a bold Rush general pushes in full once its core troops stand, with most of its list unbuilt
  const tune = f => { const G = f.war.general; f.war.town.musterSeconds = 5; G.launchTownDays = 0.5; G.attack.planSeconds = 5; G.attack.fortify.afterSeconds = 1e6;
    G.strategies.rush.attack.bold = 1; G.attack.edgePush = 99; G.attack.boldReady = { troops: 4, ranged: 0 }; G.strategies.rush.attack.pushAt = 4; G.strategies.rush.attack.palisade = null; };
  const t = scene(47, tune), { S, g } = t, rival = t.rivals[0], tR = S.frontier.settlements.tR, tP = S.frontier.settlements.tP, War = g.frontier.war;
  S.clans[rival].warStrategy = 'rush'; tR.founded = -6000 - 1; t.hero.x = tP.x + 1500;
  const rh = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === rival); Object.assign(rh, { place: 'world', x: tR.x + 30, z: tR.z });
  let k = 0; while (!War.warOn('tP') && k++ < 40) t.run(1000);
  const w = War.warOn('tP'); assert.ok(w && w.attacker === rival, 'the banner is planted');
  w.camp.chest = (w.camp.chest || 0) + 6000; w.camp.stock.timber = (w.camp.stock.timber || 0) + 4000; w.camp.stock.stone = (w.camp.stock.stone || 0) + 3000;
  const brain = t.bots.find(b => b.config.clan === rival), mem = () => brain.view().wars[w.id]?.attacker || {};
  let full = null;
  for (k = 0; k < 600 && War.warOn('tP') && !full; k++) { t.run(20); const m = mem(); if (m.mode === 'push' && m.left > 0 && m.early === 'bold') full = { ...m }; }
  assert.ok(full, 'a bold general pushes before its list is built');
  console.log(`ok temperament (bold ${bold}/200 at ${odds}), bold push with ${full.left} of its list left`);
}
// ---- 8e-7: the supply line: a bot camp builds its camp station and spur, the generals refill by train ------------
{
  const tune = f => { const G = f.war.general; f.war.town.musterSeconds = 5; G.launchTownDays = 0.5; G.attack.planSeconds = 5; G.attack.fortify.afterSeconds = 1e6;
    G.strategies.rush.attack.build = ['barracks', 'camp_station', 'supply_tents']; G.strategies.rush.attack.pushAt = 99; G.strategies.rush.attack.palisade = null;
    f.railways = data('data/railways.json'); f.railways.link.seconds = 30; };
  const t = scene(47, tune), { S, g } = t, rival = t.rivals[0], tR = S.frontier.settlements.tR, tP = S.frontier.settlements.tP, War = g.frontier.war, F = S.frontier;
  S.clans[rival].warStrategy = 'rush'; tR.founded = -6000 - 1; t.hero.x = tP.x + 1500;
  const rh = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === rival); Object.assign(rh, { place: 'world', x: tR.x + 30, z: tR.z });
  // both towns have a railway station and a line from the capital
  const nearCell = s => { let best = -1, bd = Infinity; s.grid.use.split('').forEach((c, i) => { if (c !== '.') return; const [x, z] = g.frontier.stable.centre(s, { cell: i }), d = Math.hypot(x - s.x, z - s.z); if (d > 25 && d < bd) { bd = d; best = i; } }); return best; };
  for (const s of [tR, tP]) { s.tier = Math.max(s.tier || 1, t.o.frontier.railways.link.minTier || 1); s.buildings.push({ id: `st${s.id}`, type: 'station', cell: nearCell(s), stage: 'built' }); }
  F.rail.links.rc1 = { id: 'rc1', owner: rival, from: 'capital', to: 'tR', done: true, length: 100, points: [[0, 0], [100, 0]], dist: [0, 100] };
  F.rail.links.rc2 = { id: 'rc2', owner: 'player', from: 'capital', to: 'tP', done: true, length: 100, points: [[0, 0], [100, 0]], dist: [0, 100] };
  let k = 0; while (!War.warOn('tP') && k++ < 40) t.run(1000);
  const w = War.warOn('tP'); assert.ok(w && w.attacker === rival, 'the banner is planted');
  w.camp.chest = (w.camp.chest || 0) + 3000; w.camp.stock.timber = (w.camp.stock.timber || 0) + 3000; w.camp.stock.stone = (w.camp.stock.stone || 0) + 2000;
  for (k = 0; k < 600 && !w.camp.station?.linked; k++) t.run(20);
  assert.ok(w.camp.buildings.some(b => b.type === 'camp_station' && b.stage === 'built'), 'the bot camp built its camp station');
  assert.ok(w.camp.station?.linked, 'and its spur: ' + JSON.stringify(w.camp.station));
  const node = w.camp.station.node, orders = () => Object.values(F.shipping.orders);
  // the treasury under its keep line: the war chest is topped up from the town coffers (down to the general's keep line)
  S.clans[rival].ryo = 900; g.frontier.world.syncCapital(); tR.stock.ryo = 3000;
  w.camp.chest = 50;
  for (k = 0; k < 20 && !orders().some(o => o.kind === 'ryo' && o.war === w.id); k++) t.run(20);
  const oc = orders().find(o => o.kind === 'ryo' && o.war === w.id);
  assert.ok(oc && oc.from === 'tR', 'coffers order: ' + JSON.stringify(oc));
  assert.equal(S.clans[rival].ryo, 900, 'the treasury below its keep line is not touched');
  g.step([{ id: rh.id, type: 'frontier', action: 'ship', mode: 'cancel', order: oc.id }]);
  // above the keep line: from the Clan treasury, within the daily share
  S.clans[rival].ryo = 5000; g.frontier.world.syncCapital(); w.camp.chest = 50;
  for (k = 0; k < 20 && !orders().some(o => o.kind === 'ryo' && o.war === w.id && o.state === 'open'); k++) t.run(20);
  const ot = orders().find(o => o.kind === 'ryo' && o.war === w.id && o.state === 'open');
  assert.ok(ot && ot.from === 'capital' && ot.auto, 'treasury order: ' + JSON.stringify(ot));
  assert.ok(ot.amount <= (5000 - 1000) * t.o.frontier.war.supply.autoShare, 'within the daily share');
  // Tim 2026-11-17: and one from the town coffers beside it, sized to what the camp can spend (never under refill)
  for (k = 0; k < 20 && !orders().some(o => o.kind === 'ryo' && o.war === w.id && o.state === 'open' && !o.auto); k++) t.run(20);
  const oc2 = orders().find(o => o.kind === 'ryo' && o.war === w.id && o.state === 'open' && !o.auto);
  assert.ok(oc2 && oc2.from === 'tR' && oc2.amount >= t.o.frontier.war.supply.refill, 'coffers order beside the treasury order: ' + JSON.stringify(oc2));
  // timber and stone ordered into the camp when its stock runs low
  w.camp.stock.timber = 0;
  for (k = 0; k < 20 && !orders().some(o => o.to === node && o.resource === 'timber'); k++) t.run(20);
  assert.ok(orders().some(o => o.to === node && o.resource === 'timber' && o.state === 'open'), 'timber ordered into the camp (the open ryo orders take no wagon room)');
  t.run(200);
  assert.ok(g.frontier.shipments.openIncoming(node, 'timber') + g.frontier.shipments.openIncoming(node, 'stone') <= 360, 'its orders stay within what the line queues');
  // the player's away general (hero outside the circle) refills the defending chest from the treasury by train, above the keep line only
  S.clans.player.ryo = 900; g.frontier.world.syncCapital(); w.defense ||= { chest: 0, put: 0 }; w.defense.chest = 0; tP.stock.ryo = 0;
  t.run(200);
  assert.ok(!orders().some(o => o.kind === 'ryo' && o.owner === 'player' && o.from === 'capital'), 'never below the keep line');
  S.clans.player.ryo = 3000; g.frontier.world.syncCapital();
  for (k = 0; k < 20 && !orders().some(o => o.kind === 'ryo' && o.owner === 'player'); k++) t.run(20);
  const od = orders().find(o => o.kind === 'ryo' && o.owner === 'player');
  assert.ok(od && od.defend && od.auto && od.to === 'tP', 'defending chest order: ' + JSON.stringify(od));
  assert.ok(S.clans.player.ryo >= 1000, 'the treasury keeps its keep line');
  // Tim 2026-11-17: the player's defending general also pulls ryo by train from his other towns, never below each town's keep line
  const site2 = t.sites.find(x => [tP, tR].every(s => Math.hypot(x.x - s.x, x.z - s.z) > 900));
  g.frontier.world.addTown({ id: 'tP2', name: 'tP2', owner: 'player', x: site2.x, z: site2.z, pop: 14, founded: true, tier: tP.tier,
    stock: { food: 5000, ryo: 2000, timber: 1000, stone: 1000, goods: 0 }, buildings: [{ type: t.o.frontier.founding.townHall, stage: 'built', cell: 0 }] });
  g.step([]); const tP2 = F.settlements.tP2; tP2.tier = tP.tier; tP2.buildings.push({ id: 'sttP2', type: 'station', cell: nearCell(tP2), stage: 'built' });
  F.rail.links.rc3 = { id: 'rc3', owner: 'player', from: 'capital', to: 'tP2', done: true, length: 100, points: [[0, 0], [100, 0]], dist: [0, 100] };
  for (const o of orders().filter(o => o.kind === 'ryo' && o.owner === 'player' && o.state === 'open')) g.step([{ id: t.hero.id, type: 'frontier', action: 'ship', mode: 'cancel', order: o.id }]);
  S.clans.player.ryo = 900; g.frontier.world.syncCapital(); w.defense.chest = 0; tP.stock.ryo = 0;
  for (k = 0; k < 30 && !orders().some(o => o.kind === 'ryo' && o.owner === 'player' && o.from === 'tP2'); k++) t.run(20);
  const o2 = orders().find(o => o.kind === 'ryo' && o.owner === 'player' && o.from === 'tP2');
  assert.ok(o2, 'an order from the player\'s other town: ' + JSON.stringify(orders().filter(o => o.owner === 'player')));
  assert.ok(o2.amount <= 2000 * (1 - g.frontier.warGeneral.keepOf(tP2)) + 1, `within its keep line (${o2.amount})`);
  // 8e-9: a general with an armory buys upgrades for the group it has most troops of
  w.camp.buildings.push({ id: `${w.id}:armX`, type: 'armory', stage: 'built', x: w.camp.x + 30, z: w.camp.z + 30 });
  w.camp.chest = 3000; w.camp.stock.timber = 3000; w.camp.stock.stone = 3000;
  if (!Object.values(S.entities).some(e => e.warTroop === w.id && e.owner === rival && !e.dead)) War.spawnTroop(w, 'grunt', w.camp.x + 5, w.camp.z);
  for (k = 0; k < 30 && !w.armory?.attacker?.work; k++) t.run(20);
  assert.ok(w.armory?.attacker?.work, 'the general bought an armory upgrade');
  // Tim 2026-11-17: a cut line is mended first (station, then sections); a ruin of a planned building is cleared and built over
  const sec = w.camp.buildings.find(b => b.type === 'rail_section'); sec.stage = 'ruined';
  w.camp.chest = 3000; w.camp.stock.timber = 3000; w.camp.stock.stone = 3000;
  for (k = 0; k < 30 && sec.stage === 'ruined'; k++) t.run(20);
  assert.ok(sec.stage !== 'ruined' && (sec.stage === 'built' || sec.rebuild !== undefined || sec.stage === 'site'), 'the general rebuilds the section: ' + sec.stage);
  const bk = w.camp.buildings.find(b => b.type === 'barracks' && b.stage === 'built'); bk.stage = 'ruined'; delete bk.queue; const at = [bk.x, bk.z];   // (a ruin loses its queue, structures.js)
  for (k = 0; k < 120 && w.camp.buildings.includes(bk); k++) t.run(20);   // (the section site and the supply tents it is short of come first: two sites at a time)
  assert.ok(!w.camp.buildings.includes(bk), 'the ruin is cleared');
  assert.ok(w.camp.buildings.some(b => b.type === 'barracks' && b.stage !== 'ruined' && b.x === at[0] && b.z === at[1]), 'a new barracks on its spot');
  // Tim 2026-11-17: its own list done, the camp goes on: supply tents beyond the one it names, then general.buildOn
  assert.ok(w.camp.buildings.filter(b => b.type === 'supply_tents' && b.stage !== 'ruined').length > 1, 'more supply tents after its list');
  // Tim 2026-11-17: it counts as needed only what the next attack.supply.planAhead buildings of its plan cost, and sells the rest
  const brain = t.bots.find(b => b.config.clan === rival), am = () => brain.view().wars[w.id]?.attacker || {};
  const list = War.campBuildList(w.id), ahead = t.o.frontier.war.general.attack.supply.planAhead, up = t.o.frontier.war.hallUpgrade?.cost || {};
  const most = r => list.map(x => x.cost?.[r] || 0).sort((a, b) => b - a).slice(0, ahead).reduce((a, b) => a + b, 0) + (up[r] || 0);
  w.camp.stock.timber = 3000; w.camp.stock.stone = 3000; let sold = false;
  for (k = 0; k < 20; k++) { t.run(20); sold ||= orders().some(o => o.kind === 'sell' && o.sellFrom === node); }
  for (const r of ['timber', 'stone']) assert.ok((am().planNeed?.[r] ?? 0) <= most(r), `${r} needed: only the next ${ahead} buildings (${am().planNeed?.[r]} <= ${most(r)})`);
  assert.ok(sold, 'the spare stock is sold at the capital');
  console.log('ok supply line, armory, mending, spare stock sold');
}
console.log('test_war_general: all passed');
