// War checkpoint 8b-1 (2026-11-15): military buildings in towns and the town hall war upgrade.
// (sim/frontier/town_military.js, placement.js, commands.js warUpgradeHall, economy.js, upkeep.js, tiers.js, structures.js)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';
import { militaryTypes, militaryWhy, militaryFor, warUpgradeCheck, warUpgradeTick, militaryCount } from '../src/sim/frontier/town_military.js';
import { upgradeCheck } from '../src/sim/frontier/tiers.js';
import { buildTooltip } from '../src/build_tooltips.js';
import { createPlacement } from '../src/sim/frontier/placement.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), U = data('data/units.json'), FR = data('data/frontier.json');

{ // the data: every camp military building has a town entry with the camp's cost; limits and needs stay in war.buildings
  const camp = Object.keys(FR.war.buildings).filter(t => !['camp_hall', 'lumber_camp', 'quarry', 'palisade', 'gate', 'stable', 'stockade', 'camp_station', 'slipway'].includes(t));   // (ships S3: the slipway is camp only)   // (the stable and the stockade are town buildings of their own; camp_station is camp only, towns have their railway station, 8e-4)
  assert.deepEqual(militaryTypes(FR).sort(), camp.sort(), 'the same military buildings as a camp');
  for (const t of camp) {
    const b = FR.buildings[t];
    assert.ok(b.size >= 1 && b.military && b.buildTicks > 0, t);
    assert.deepEqual(b.cost, FR.war.buildings[t].cost, `${t} costs what it costs at a camp`);
    assert.ok(FR.war.structures.town[t] >= (FR.war.structures.camp[t] ?? 0), `${t} is at least as sturdy as at a camp`);   // (a town-only one, the shipyard, has no camp health)   // 8d-6 (2026-11-16): town military buildings have 2.5 times the camp health
    assert.ok(FR.upkeep.buildings[t], `${t} pays upkeep`);
    assert.equal(b.max, undefined, 'limits live in war.buildings only');
  }
  for (const tier of FR.tiers.list) for (const t of camp) assert.equal(tier.placed?.[t], undefined, 'no town hall tier limits');
}

function scene() {
  const frontier = data('data/frontier.json');
  const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, fixtureTowns: false } };
  const g = createGame(options);
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 43 });
  g.civilians.populate();
  const S = g.state, hero = S.entities[m.heroId];
  const rival = Object.keys(S.clans).find(c => c !== 'player');
  const site = world.sites.filter(s => Math.hypot(s.x - g.gate.island[0], s.z - g.gate.island[1]) > 700)[0];
  g.frontier.world.addTown({ id: 'tM', name: 'Mineton', owner: 'player', x: site.x, z: site.z, pop: 12, founded: true,
    stock: { food: 5000, ryo: 5000, timber: 5000, stone: 5000, goods: 500 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
  const town = S.frontier.settlements.tM;
  Object.assign(hero, { place: 'world', x: site.x + 60, z: site.z });
  g.step([]);   // the grid
  const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return S.frontier.receipts.findLast(r => r.action === c.action) || S.frontier.receipts.at(-1); };
  const run = n => { for (let i = 0; i < n; i++) g.step([]); };
  const placement = createPlacement({ data: frontier, state: S, construction: {} });
  return { g, S, hero, rival, town, site, cmd, run, frontier, options, P: () => placement };
}
// place a building at the first anchor cell nearest the hall the rules accept; a rule refusal (needs, limits) comes back as it is
const place = (s, kind) => {
  const { town, cmd } = s, { n } = town.grid, P = s.P();
  const order = [...Array(n * n).keys()].sort((a, b) => Math.hypot(a % n - n / 2, Math.floor(a / n) - n / 2) - Math.hypot(b % n - n / 2, Math.floor(b / n) - n / 2) || a - b);
  let first = null;
  for (const i of order) {
    const r = P.check(town, { kind, cells: [i] });
    if (r.ok && !r.cells.every(c => town.grid.ground[c] === 'c')) continue;   // cleared ground: no workers in this test
    if (r.ok) { const got = cmd({ action: 'place', town: 'tM', kind, cells: [i] }); if (got.ok || !/resource|unit/.test(got.reason)) return got; continue; }
    if (/^(Needs|A town has|Your clan)/.test(r.reason)) return r;
    first ??= r.reason;
  }
  return { ok: false, reason: 'no spot: ' + first };
};
const built = (s, type) => s.town.buildings.filter(b => b.type === type && b.stage === 'built').length;
const finish = (s, max = 4000) => { for (let i = 0; i < max && s.town.projects.length; i++) s.g.step([]); assert.equal(s.town.projects.length, 0, 'projects finish: ' + JSON.stringify(s.town.report?.waiting)); };

{ // placing, needs, limits, clan, the war upgrade, upkeep and save parity
  const s = scene(), { S, town, cmd, frontier } = s;
  assert.deepEqual(militaryFor(town, frontier, S).includes('hidden_dojo'), false, 'a Yakuza town has no hidden dojo');
  assert.ok(militaryFor(town, frontier, S).includes('kennel'));
  let r = place(s, 'rifle_range'); assert.equal(r.reason, 'Needs a built barracks');
  r = place(s, 'foundry'); assert.equal(r.reason, 'Needs the town hall war upgrade');
  r = place(s, 'clan_hall'); assert.equal(r.reason, 'Needs a built barracks and a built rifle range');
  assert.equal(militaryWhy(town, 'hidden_dojo', frontier, S), 'Your clan does not build the hidden dojo');
  r = cmd({ action: 'queue', settlement: 'tM', building: 'foundry' }); assert.equal(r.reason, 'Needs the town hall war upgrade', 'the queue command is held to the same rules');
  const timber0 = town.stock.timber;
  r = place(s, 'barracks'); assert.ok(r.ok, r.reason);
  assert.equal(town.projects.at(-1).type, 'barracks');
  finish(s);
  assert.equal(built(s, 'barracks'), 1);
  assert.ok(timber0 - town.stock.timber >= frontier.war.buildings.barracks.cost.timber - 1e-6, 'paid from town stock');
  for (let k = 0; k < 2; k++) { r = place(s, 'barracks'); assert.ok(r.ok, r.reason); }
  r = place(s, 'barracks'); assert.equal(r.reason, `A town has at most ${frontier.war.buildings.barracks.max} barracks`, 'projects count toward the limit');
  finish(s);
  r = place(s, 'rifle_range'); assert.ok(r.ok, r.reason);
  r = place(s, 'watchtower'); assert.ok(r.ok, r.reason);
  r = place(s, 'supply_tents'); assert.ok(r.ok, r.reason);
  finish(s);
  r = place(s, 'clan_hall'); assert.ok(r.ok, r.reason); finish(s);
  // kennel and hidden dojo: the clan hall and a town hall at tier 2 (2026-11-15)
  { const t0 = town.tier; town.tier = 1; r = place(s, 'kennel'); assert.equal(r.reason, 'Needs a town hall at tier 2'); town.tier = Math.max(2, t0 || 1); }
  r = place(s, 'kennel'); assert.ok(r.ok, r.reason); finish(s);
  // the war upgrade: refused while short, paid at once, then built by the town builders (upgradeWork), other projects wait
  const ryo = town.stock.ryo; town.stock.ryo = 10;
  assert.match(warUpgradeCheck(town, frontier, S).reason, /^Needs 300 timber, 250 stone, 300 ryo \(the town has 10 ryo\)$/);
  r = cmd({ action: 'warUpgradeHall', settlement: 'tM' }); assert.ok(!r.ok);
  town.stock.ryo = ryo;
  const before = { ...town.stock };
  r = cmd({ action: 'warUpgradeHall', settlement: 'tM' }); assert.ok(r.ok, r.reason);
  assert.ok(before.ryo - town.stock.ryo >= 300 - 1 && before.stone - town.stock.stone >= 250 - 1e-6, 'paid at once');
  assert.ok(town.warUpgrade && !town.warHall);
  r = cmd({ action: 'warUpgradeHall', settlement: 'tM' }); assert.equal(r.reason, 'The war upgrade is already under way');
  { r = place(s, 'watchtower'); assert.ok(r.ok, r.reason); const p = town.projects.at(-1), p0 = p.progress;
    for (let i = 0; i < 100; i++) s.g.step([]);
    assert.ok(town.builders > 0, 'the town builders work on it'); assert.ok(town.warUpgrade.left < town.warUpgrade.total, 'it moves with the builders');
    assert.equal(p.progress, p0, 'other projects wait'); assert.ok(town.report.waiting.includes('war upgrade'), 'and say why');
    cmd({ action: 'cancel', project: p.id }); }
  // save mid-upgrade: same game after load
  const save = JSON.parse(JSON.stringify(makeSave(s.g, { bots: [] })));
  const g2 = createGame(s.options); loadSave(g2, save);
  for (let i = 0; i < 200; i++) { s.g.step([]); g2.step([]); }
  { const A = JSON.stringify(g2.state), B = JSON.stringify(S); let i = 0; while (i < A.length && A[i] === B[i]) i++;
    assert.ok(A === B, `same after 200 ticks: differs at ${i}: ${A.slice(i - 150, i + 150)} | ${B.slice(i - 150, i + 150)}`); }
  let told = false;
  for (let i = 0; i < (frontier.war.town.upgradeWork + 5) * 20 && !town.warHall; i++) { s.g.step([]); told ||= S.news.some(n => n.kind === 'town' && n.event === 'warHall' && n.clan === 'player'); }
  assert.ok(town.warHall && !town.warUpgrade, 'the war upgrade is done');
  assert.ok(told, 'the owner is told');
  r = cmd({ action: 'warUpgradeHall', settlement: 'tM' }); assert.equal(r.reason, 'The town hall war upgrade is done');
  for (const t of ['foundry', 'armory']) { r = place(s, t); assert.ok(r.ok, `${t}: ${r.reason}`); }
  finish(s);
  r = place(s, 'foundry'); assert.equal(r.reason, 'A town has at most 1 foundry');
  // upkeep: unpaid only warns; the buildings keep working
  for (const k of ['timber', 'stone']) town.stock[k] = 0;
  s.run(40);
  assert.ok(town.militaryShort, 'short of military upkeep');
  assert.ok(town.report.waiting.includes('military upkeep'), 'the town panel warns');
  assert.equal(built(s, 'barracks'), 3, 'nothing stops working');
  town.stock.timber = 5000; town.stock.stone = 5000; s.run(40);
  assert.ok(!town.militaryShort);
  // the build bar tooltip names the shared limits
  const tip = buildTooltip('foundry', town, frontier, () => '');
  assert.match(tip, /town hall war upgrade/); assert.match(tip, /at most 1 in a town/); assert.match(tip, /keeps working/);
  // a war on the town: structures are military, the tower shoots, no tier upgrade starts
  S.frontier.wars ||= { list: {}, cooldown: {}, history: [] };
  S.frontier.wars.list.w9 = { id: 'w9', town: 'tM', attacker: s.rival, defender: 'player', x: town.x - 350, z: town.z, started: S.tick, state: 'active',
    camp: { x: town.x - 350, z: town.z, chest: 0, stock: {}, brought: {}, workers: [], workerTraining: [], buildings: [{ id: 'w9:hall', type: 'camp_hall', stage: 'built', x: town.x - 350, z: town.z }] } };
  assert.equal(upgradeCheck(town, frontier, S).reason, frontier.tiers.list[(town.tier || 1)]?.upgrade ? 'not while a war is on this town' : 'already the highest tier');
  s.run(2);
  const ST = s.g.frontier.structures, mine = ST.list().filter(st => st.town === 'tM' && st.kind === 'building');
  for (const t of ['barracks', 'rifle_range', 'watchtower', 'supply_tents', 'clan_hall', 'kennel', 'foundry', 'armory']) {
    const st = mine.find(x => x.type === t); assert.ok(st, t); assert.ok(st.military, `${t} is military`); assert.equal(st.max, frontier.war.structures.town[t]);
  }
  const tower = mine.find(x => x.type === 'watchtower');
  assert.ok(ST.watchers().some(w => w.owner === 'player' && Math.hypot(w.x - tower.x, w.z - tower.z) < 1), 'a town watchtower spots hidden units');
  const foe = S.entities[s.g.spawn('swordsman', 'swordsman', tower.x + 8, tower.z, { owner: s.rival, place: 'world', area: 'world', warTroop: 'w9', order: { kind: 'stop' } })];
  const hp = foe.hp; s.run(80);
  assert.ok(foe.hp < hp || foe.dead || foe.downed, 'the town watchtower shoots the attacker');
  const counted = s.g.frontier.warMorale.view('w9').town;
  assert.ok(JSON.stringify(counted).includes('barracks') && JSON.stringify(counted).includes('foundry'), 'the morale bar counts them: ' + JSON.stringify(counted).slice(0, 300));
  // ruins: the attacker knocks a barracks down; the Rebuild order brings it back during the war too, and the bar rises again (2026-11-17)
  { const b = mine.find(x => x.type === 'barracks');
    assert.ok(ST.canDamage(s.rival, b) && !ST.canDamage('player', b), 'only the attacker hits it');
    assert.ok(ST.damage(s.rival, b, 1e9, 'fire')); s.run(2);
    assert.equal(b.b.stage, 'ruined', 'a ruin');
    const mv = s.g.frontier.warMorale.view('w9').town;
    assert.ok(mv.pct < 100 && mv.down.some(d => d.type === 'barracks' && d.n === 1), 'the bar drops: ' + JSON.stringify(mv));
    // 2026-11-24: no Rebuild during the war (replaces 2026-11-17); a new one goes up on the ruin, from scratch
    const r2 = cmd({ action: 'rebuild', settlement: 'tM', building: b.b.id }); assert.ok(!r2.ok && /No rebuilding during a war/.test(r2.reason), r2.reason);
    assert.equal(militaryCount(town, 'barracks'), 2, 'a ruin does not count toward the limit');
    const timber1 = town.stock.timber, place2 = () => cmd({ action: 'place', town: 'tM', kind: 'barracks', cells: [b.b.cell], ...(Number.isInteger(b.b.rot) ? { rot: b.b.rot } : {}) });
    let r3 = place2(); assert.ok(r3.ok, r3.reason);
    assert.ok(!town.buildings.includes(b.b), 'the ruin under it is cleared');
    assert.ok(town.stock.timber <= timber1, 'nothing back for the ruin');
    // the site is easy to knock down (war.structures.site), and what was paid for it is lost
    s.run(2);
    const pj = town.projects.find(p => p.type === 'barracks' && p.authorized), site = pj && ST.find(`t|tM|site:${pj.id}`);
    assert.ok(!ST.list().some(st => st.kind === 'site'), 'sites stay out of list() (towers, morale)');
    assert.ok(site && site.max === frontier.war.structures.site, 'a site in the war: ' + JSON.stringify(site && site.max));
    const n0 = town.projects.length, t2 = town.stock.timber;
    assert.ok(ST.damage(s.rival, site, frontier.war.structures.site + 1, 'melee')); s.run(1);
    assert.equal(town.projects.length, n0 - 1, 'the site is gone');
    assert.equal(town.stock.timber, t2, 'nothing back');
    r3 = place2(); assert.ok(r3.ok, r3.reason);
    finish(s); assert.equal(built(s, 'barracks'), 3, 'a new one built during the war');
    s.run(2); assert.ok(s.g.frontier.warMorale.view('w9').town.pct > mv.pct, 'the bar rises again: ' + JSON.stringify(s.g.frontier.warMorale.view('w9').town.pct));
    delete S.frontier.wars.list.w9; s.run(1); }
  // a ruined hall pauses a running war upgrade
  { const t = { warUpgrade: { left: 4, total: 4 }, builders: 2, buildings: [{ type: 'town_hall', stage: 'ruined' }] };
    assert.equal(warUpgradeTick(t), false); assert.equal(t.warUpgrade.left, 4, 'paused');
    t.buildings[0].stage = 'built'; t.builders = 0; assert.equal(warUpgradeTick(t), false); assert.equal(t.warUpgrade.left, 4, 'no builders, no progress');
    t.builders = 2; warUpgradeTick(t); assert.equal(t.warUpgrade.left, 2); assert.equal(warUpgradeTick(t), true); assert.ok(t.warHall); }
}
console.log('town military ok');
