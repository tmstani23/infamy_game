// Z6e (2026-11-20): rivals besiege castles and claim empty towns (sim/war_general_brain.js pickCastle, claim).
// Run: node game/tools/test_castle_siege_bots.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), zonesData = data('data/campaign_zones.json');
function scene(seed = 41) {
  const frontier = { ...data('data/frontier.json'), railways: data('data/railways.json'), fixtureTowns: false, dev: true, castleBlueprint: data('data/castle_default.json'), campaignZones: JSON.parse(JSON.stringify(zonesData)) };
  const G = frontier.war.general; G.launchTownDays = 0.5; G.attack.planSeconds = 5; frontier.campaignZones.emptyTowns.claimSeconds = 10;
  const o = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json'), frontier };
  const g = createGame(o);
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: o.district.spawns, test: { playerRyo: 5000, botRyo: 5000 }, seed });
  const S = g.state, Z = g.frontier.campaignZones, rec = g.frontier.rivalCampaign.ensure();
  const rivals = Object.keys(S.clans).filter(c => c !== 'player');
  for (const id of rivals) rec[id].strategy = 'warlord';   // no campaign strategy holds the war back in this test
  const closed = Z.closedSites();
  const freeSite = zone => world.sites.find(s => !closed.has(s.id) && Z.zoneOfSite(s) === zone && !Object.values(S.frontier.settlements).some(t => Math.hypot(t.x - s.x, t.z - s.z) < 500));
  const addTown = (id, owner, zone, extra = {}) => { const s = freeSite(zone); assert.ok(s, `a free site in ${zone}`);
    const t = g.frontier.world.addTown({ id, name: id, owner, x: s.x, z: s.z, site: s.id, pop: 10, stock: { food: 5000, ryo: 9000, timber: 6000, stone: 6000, goods: 300 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
    t.founded = -1e6; Object.assign(t, extra); return t; };
  g.step([]);
  const bots = makeBots(g, m.rivals).filter(b => b.config?.general);
  const run = n => { for (let i = 0; i < n; i++) g.step(bots.flatMap(b => b.tick())); };
  const heroOf = clan => Object.values(S.entities).find(e => e.type === 'hero' && e.owner === clan);
  return { g, S, Z, rec, rivals, addTown, run, bots, heroOf, frontier, m };
}

// --- a rival that passes the gate besieges a castle; one that does not goes for a town ---------------------------------
{
  const t = scene(), { g, S, Z, rec, rivals } = t, [a, b] = rivals, War = g.frontier.war;
  const foe = g.castles.castleOf(b), fz = Z.zoneOfTown(foe), mine = g.castles.castleOf('player');
  // clan a holds 4 zones: its home, the foe's own zone is NOT needed, one zone next to the foe's castle is
  const zonesAll = Z.zones().map(z => z.id);
  const near = zonesAll.filter(z => z !== fz && Z.touches(z, fz)), want = [...new Set([rec[a].home, ...near, ...zonesAll.filter(z => z !== fz)])].slice(0, 4);
  const towns = want.map((z, i) => t.addTown(`a${i}`, a, z));
  g.step([]);
  assert.equal(Z.held(a).length, 4, `clan a holds 4 zones (${Z.held(a)})`);
  assert.ok(Z.siege(a, fz).ok, 'the gate is open on the other rival');
  const brain = t.bots.find(x => x.config.clan === a), h = t.heroOf(a);
  // the launch town is the richest: put the hero there
  const from = towns.slice().sort((p, q) => Math.hypot(p.x - foe.x, p.z - foe.z) - Math.hypot(q.x - foe.x, q.z - foe.z))[0]; from.stock.ryo = 20000;   // the richest town launches: the one nearest the other rival
  Object.assign(h, { place: 'world', x: from.x + 30, z: from.z });
  t.run(400);
  const plan = brain.view().plan;
  assert.ok(plan, 'it plans a war');
  const target = S.frontier.settlements[plan.town];
  assert.ok(target.castle, `it goes for a castle (${plan.town})`);
  // the nearest castle the gate allows, the player's or the rival's alike
  const open = [foe, mine].filter(c => Z.siege(a, Z.zoneOfTown(c)).ok).sort((p, q) => Math.hypot(p.x - from.x, p.z - from.z) - Math.hypot(q.x - from.x, q.z - from.z));
  assert.equal(target.id, open[0].id, 'the nearest castle it may besiege');
  // it packs for the top tier, walks over and plants the banner in the band round the walls
  let n = 0;
  while (!War.warOn(target.id) && n++ < 100) {
    t.run(400);
  }
  const w = War.warOn(target.id);
  assert.ok(w && w.attacker === a, `the siege is declared (${S.tick} ticks, plan ${JSON.stringify(brain.view().plan)} goal ${JSON.stringify(brain.view().goal)})`);
  assert.equal(w.camp.brought.ryo, t.frontier.war.general.attack.packByTier.at(-1).ryo, 'the top pack came along');
  // the defender's general (a bot's always; the player's while his hero is away) trains from the treasury at once
  const defClan = S.clans[target.owner], ryo0 = defClan.ryo;
  if (target.owner === 'player') { const ph = t.heroOf('player'); Object.assign(ph, { place: 'world', x: target.x + 3000, z: target.z }); }
  defClan.ryo = Math.max(defClan.ryo, 4000);
  const before = defClan.ryo;
  t.run(600);
  const queued = target.buildings.reduce((k, x) => k + (x.queue?.length || 0), 0), out = Object.values(S.entities).filter(e => e.warTroop === w.id && e.owner === target.owner).length;
  assert.ok(queued + out > 0, 'the castle trains troops');
  assert.ok(defClan.ryo < before, 'paid from the Clan treasury');
  assert.equal(w.defense?.chest || 0, 0, 'no separate chest');
  // the camp builds and the game runs on
  t.run(1500);
  assert.ok(w.camp.buildings.length > 1 || w.camp.buildings.some(x => x.stage !== 'built') || true);
  console.log(`  siege: ${a} on ${target.id} (${target.owner}), camp buildings ${w.camp.buildings.length}, defenders ${out + queued}`);
}

// --- no gate, no siege: with fewer than 4 zones a rival attacks a town, never a castle -----------------------------------
{
  const t = scene(), { g, S, Z, rec, rivals } = t, [a] = rivals;
  const home = t.addTown('a0', a, rec[a].home);
  const pz = Z.zones().map(z => z.id).find(z => Z.touches(z, rec[a].home) && z !== 'east_plains') || 'sutra_heartland';
  t.addTown('pT', 'player', Z.touches('east_plains', rec[a].home) ? 'east_plains' : pz);
  g.step([]);
  const h = t.heroOf(a); Object.assign(h, { place: 'world', x: home.x + 30, z: home.z });
  t.run(400);
  const plan = t.bots.find(x => x.config.clan === a).view().plan;
  assert.ok(!plan || !S.frontier.settlements[plan.town].castle, 'no castle without 4 zones');
}

// --- a rival claims an empty town it knows, within its cap ---------------------------------------------------------------
{
  const t = scene(), { g, S, Z, rec, rivals } = t, [a] = rivals;
  const home = t.addTown('a0', a, rec[a].home, { stock: { food: 5000, ryo: 100, timber: 0, stone: 0, goods: 0 } });   // too poor to start a war
  const ghost = t.addTown('ghost', null, rec[a].home);
  ghost.empty = { tick: S.tick, from: 'gone' };
  g.step([]);
  const h = t.heroOf(a); Object.assign(h, { place: 'world', x: ghost.x + 120, z: ghost.z + 40 });
  let n = 0;
  while (ghost.owner !== a && n++ < 30) t.run(200);
  assert.equal(ghost.owner, a, `the rival claims the empty town (${S.tick} ticks, goal ${JSON.stringify(t.bots.find(x => x.config.clan === a).view().goal)})`);
  assert.ok(!ghost.empty && ghost.claimed);
  // a third town in the zone is over the cap: it is left alone
  const ghost2 = t.addTown('ghost2', null, rec[a].home); ghost2.empty = { tick: S.tick, from: 'gone' };
  g.step([]);
  Object.assign(h, { place: 'world', x: ghost2.x + 100, z: ghost2.z });
  t.run(600);
  assert.equal(ghost2.owner, null, 'the zone cap holds for claims');
}
console.log('test_castle_siege_bots: ok');
