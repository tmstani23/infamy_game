// War audit 2026-11-15 (Tim: build every agreed rule that was missing): come round at the camp hall during a war,
// the winner's unused materials back, the Burn card's founding-limit line, war circle neutrality for other clans,
// riders as heavy units. (island_respawn.js, war_end.js materialsBack, war_outcome_menu.js, game.js warNeutral)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { outcomeModel } from '../src/war_outcome_menu.js';

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

{ // come round at the camp hall: the hero at once, crew after crewSeconds
  const s = scene({ secondTown: false }), { g, S, hero, cx, cz } = s;
  Object.assign(hero, { x: s.town.x + 200, z: s.town.z });
  assert.ok(g.islandRespawn.hero(hero), 'brought round');
  assert.ok(Math.hypot(hero.x - cx, hero.z - cz) < 60, `at the camp hall (${Math.round(Math.hypot(hero.x - cx, hero.z - cz))} away)`);
  assert.match(S.clans.player.notice.text, /war camp hall/);
  const u = S.entities[g.spawn('swordsman', 'swordsman', s.town.x + 150, s.town.z, { owner: 'player', place: 'world', area: 'world' })];
  assert.ok(g.islandRespawn.carry(u, null), 'crew queued');
  const r = S.clans.player.respawning.at(-1); assert.equal(r.camp, 'w1');
  r.left = 0.01; g.islandRespawn.tick(1, U.types);
  const back = Object.values(S.entities).filter(e => e.owner === 'player' && e.type === 'swordsman' && !e.dead && Math.hypot(e.x - cx, e.z - cz) < 60);
  assert.ok(back.length >= 1, 'the crew came round at the camp hall');
  // far from the war: the old rule (nearest town hall, or the city gate)
  Object.assign(hero, { x: s.town.x + 2500, z: s.town.z, dead: true });
  g.islandRespawn.hero(hero); assert.ok(Math.hypot(hero.x - cx, hero.z - cz) > 200, 'outside the circle he does not go to the camp');
}

{ // the winner gets back at most the unused part of what he brought, into his nearest own town
  const s = scene({ secondTown: false }), { g, S, camp, WE } = s;
  const mine = s.site2 || world.sites.find(x => Math.hypot(x.x - s.site.x, x.z - s.site.z) > 1600);
  g.frontier.world.addTown({ id: 'tH', name: 'Hometon', owner: 'player', x: mine.x, z: mine.z, pop: 3, founded: true, stock: { food: 100, ryo: 0, timber: 0, stone: 0 }, buildings: [{ type: s.frontier.founding.townHall, stage: 'built', cell: 0 }] });
  s.run(1);
  Object.assign(camp, { brought: { ryo: 0, timber: 300, stone: 100 }, stock: { timber: 500, stone: 40 } });
  const home = S.frontier.settlements.tH, t0 = home.stock.timber || 0, s0 = home.stock.stone || 0;
  assert.ok(WE.finish(s.w(), 'sacked', s.hero.id));
  const h = s.ended();
  assert.deepEqual(h.materialsBack, { town: 'tH', timber: 300, stone: 40 }, 'what he brought, never more, and only what is left');
  assert.ok(Math.abs(home.stock.timber - t0 - 300) < 1e-6 && Math.abs(home.stock.stone - s0 - 40) < 1e-6, 'into the nearest own town');
}
{ // a lost camp gives nothing back
  const s = scene({ secondTown: false }), { camp, WE } = s;
  Object.assign(camp, { brought: { timber: 300, stone: 100 }, stock: { timber: 300, stone: 100 } });
  WE.finish(s.w(), 'campFell'); assert.equal(s.ended().materialsBack, undefined);
}

{ // the Burn card warns at the founding limit and still lets him burn
  const s = scene({ secondTown: false }), { g, hero } = s;
  g.landOffice.atLimit = () => true;
  let m = outcomeModel(g, hero.id, s.w()), burn = m.cards.find(c => c.id === 'burn');
  assert.equal(burn.warn, 'You are at your founding limit: you could not found a town here');
  g.landOffice.atLimit = () => false;
  m = outcomeModel(g, hero.id, s.w()); assert.equal(m.cards.find(c => c.id === 'burn').warn, '');
}

{ // in a war circle only the two sides fight; other clans pass through; outside it frontier crews fight as before
  const s = scene({ secondTown: false }), { g, S, rival } = s;
  const third = Object.keys(S.clans).find(c => c !== 'player' && c !== rival);
  assert.ok(third, 'a third clan');
  const at = (owner, x, z, extra = {}) => S.entities[g.spawn('swordsman', 'swordsman', x, z, { owner, place: 'world', area: 'world', order: { kind: 'stop' }, ...extra })];
  const x = s.town.x + 250, z = s.town.z;
  const mineT = s.troop('player', x, z), theirs = at(rival, x + 2, z), other = at(third, x + 1, z + 1), myCrew = at('player', x - 1, z);
  assert.equal(g.attackAllowed(mineT, theirs), true, 'the two sides fight');
  assert.equal(g.attackAllowed(mineT, other), false, 'a war troop leaves a third clan alone');
  assert.equal(g.attackAllowed(other, mineT), false, 'and the other way round');
  Object.assign(s.hero, { x: x - 1, z, place: 'world' }); s.run(2);
  assert.equal(g.attackAllowed(s.hero, other), false, 'a side and a third clan inside the circle leave each other alone');
  assert.equal(g.attackAllowed(s.hero, theirs), true, 'the hero against the other side');
  const fx = s.town.x + 2500, b = at(third, fx + 1, z); Object.assign(s.hero, { x: fx, z }); s.run(2);
  assert.equal(g.attackAllowed(s.hero, b), true, 'outside a war circle frontier crews still fight');
}

{ // a unit on a horse is heavy in the push (units.json rules.riderWeight)
  assert.ok(U.rules.riderWeight > 1, 'riders are heavy');
}
console.log('test_war_audit: ok');
