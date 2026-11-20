// Z6a (2026-11-20): declaring a castle siege. A castle can be besieged only by a clan that holds 4 of 6 zones, one
// of them the castle's own zone or next to it. The banner band is measured from the castle's outer edge.
// Run: node game/tools/test_castle_siege.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { castleBox } from '../src/sim/frontier/castle.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), bp = data('data/castle_default.json'), zonesData = data('data/campaign_zones.json');
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'),
  frontier: { ...frontier, railways: data('data/railways.json'), fixtureTowns: false, castleBlueprint: bp, campaignZones: zonesData } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
g.frontier.rivalCampaign.ensure();   // rolls the rivals' homes and places their castles
const S = g.state, hero = S.entities[m.heroId], war = g.frontier.war, Z = g.frontier.campaignZones;
const rivals = Object.keys(S.clans).filter(c => c !== 'player' && g.castles.castleOf(c));
assert.ok(rivals.length >= 1, 'a rival has a castle');
const W = frontier.war;

// a good banner spot round castle t: the first point on the middle of its band that passes every rule
function spotFor(t) {
  const [inner, outer] = war.band(t);
  for (const q of war.bandOutline(t, (inner + outer) / 2)) {
    hero.x = q.x; hero.z = q.z; hero.place = 'world';
    const r = war.check(hero, t.id, q);
    if (r.ok || /zones|zone next to/.test(r.reason || '')) return { p: { x: q.x, z: q.z }, r };
  }
  return null;
}
const boxDist = (t, p) => { const b = castleBox(bp, t.x, t.z, t.castle.rot, t.grid.cell);
  return Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(b.minZ - p.z, 0, p.z - b.maxZ)); };

for (const clan of rivals) {
  const t = g.castles.castleOf(clan), zone = Z.zoneOfTown(t);
  assert.ok(zone, `${clan}'s castle is in a zone`);
  // the band is from the walls: inner..outer from the box, never inside it
  const [inner, outer] = war.band(t);
  assert.equal(inner, W.band.inner); assert.ok(outer >= W.band.outer);
  const got = spotFor(t);
  assert.ok(got, `${clan}: there is ground for a banner round the castle`);
  const d = boxDist(t, got.p);
  assert.ok(d >= inner - 1 && d <= outer + 1, `${clan}: the spot is in the band from the walls (${d | 0})`);
  // too close: just outside the walls
  const near = war.bandOutline(t, 20).map(q => ({ x: q.x, z: q.z }));
  hero.x = near[0].x; hero.z = near[0].z;
  const close = war.check(hero, t.id, near[0]);
  assert.ok(!close.ok, 'a banner by the walls is refused');
  // the gate: the player holds no zones yet
  hero.x = got.p.x; hero.z = got.p.z;
  const r0 = war.check(hero, t.id, got.p);
  assert.ok(!r0.ok && /Hold 4 of 6 zones/.test(r0.reason), `refused for zones: ${r0.reason}`);
}

// the player takes 4 zones that are not next to the first rival's castle: still refused (no zone next to it)
const t = g.castles.castleOf(rivals[0]), cz = Z.zoneOfTown(t);
const closed = Z.closedSites?.() || new Set();
const siteIn = zone => world.sites.find(s => !closed.has(s.id) && Z.zoneOfSite(s) === zone && !Object.values(S.frontier.settlements).some(o => Math.hypot(o.x - s.x, o.z - s.z) < 400));
let n = 0;
const take = zone => { const s = siteIn(zone); assert.ok(s, `a free site in ${zone}`);
  g.frontier.world.addTown({ id: `t_${zone}`, name: zone, owner: 'player', x: s.x, z: s.z, site: s.id, pop: 3, stock: {}, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
  S.frontier.settlements[`t_${zone}`].founded = S.tick ?? 0; n++; };
// every rival town in a zone the player takes would stop the hold: drop the ones in the way (none at the start)
const far = Z.zones().map(z => z.id).filter(z => z !== cz && !Z.touches(z, cz));
const nearZ = Z.zones().map(z => z.id).filter(z => z === cz || Z.touches(z, cz));
for (const z of far) take(z);
const spot = spotFor(t);
hero.x = spot.p.x; hero.z = spot.p.z;
if (far.length >= 4) {
  const r1 = war.check(hero, t.id, spot.p);
  assert.ok(!r1.ok && /zone next to/.test(r1.reason), `refused for no zone next to it: ${r1.reason}`);
}
// add zones next to it (or its own) until 4 are held: the siege can be declared
for (const z of nearZ) { if (Z.held('player').length >= 4) break; if (!Z.townsIn(z).some(s => s.owner === 'player')) take(z); }
assert.ok(Z.held('player').length >= 4, `the player holds ${Z.held('player').length} zones`);
const r2 = war.check(hero, t.id, spot.p);
assert.ok(r2.ok, `the siege can be declared: ${r2.reason}`);
const pl = war.plant(hero, t.id, spot.p);
assert.ok(pl.ok, 'the banner is planted');
assert.equal(pl.war.town, t.id); assert.equal(pl.war.defender, rivals[0]);

// --- Z6b: the besieged castle trains from minute one, paid from the Clan treasury --------------------------------
const w = pl.war, D = g.frontier.war, foe = S.clans[rivals[0]];
const run = (e, c) => { (S.frontier.receipts ||= []); D.command(e, c); return S.frontier.receipts.at(-1); };
const shop = t.buildings.find(b => b.type === 'barracks' && b.stage === 'built');
assert.ok(shop, 'the castle has a barracks');
const unit = D.trainsAt('barracks', rivals[0])[0];
foe.ryo = 5000;
const foeHero = Object.values(S.entities).find(e => e.owner === rivals[0] && e.type === 'hero') || { id: 'x', owner: rivals[0], type: 'hero' };
const before = foe.ryo, each = D.ryoOf(rivals[0], unit);
const tr = run(foeHero, { action: 'townTrain', war: w.id, building: shop.id, unit, count: 2 });
assert.ok(tr?.ok, `the castle trains at once from the treasury: ${tr?.reason}`);
assert.equal(foe.ryo, before - 2 * each, 'paid from the Clan treasury');
const un = run(foeHero, { action: 'townUntrain', war: w.id, building: shop.id });
assert.ok(un?.ok); assert.equal(foe.ryo, before - each, 'a cancelled troop pays the treasury back');
assert.ok(!run(foeHero, { action: 'warChestTown', war: w.id, amount: 100 })?.ok, 'no chest to fill at a castle');

// --- Z6b: the keep has one outcome, and taking it ends the clan ------------------------------------------------------
const WE = g.frontier.warEnd;
assert.deepEqual(WE.outcomeList(w).map(o => o.id), ['fall']);
// the rival has a town and a business in the city, and a second war elsewhere
const farSite = world.sites.find(s => !closed.has(s.id) && !Object.values(S.frontier.settlements).some(o => Math.hypot(o.x - s.x, o.z - s.z) < 600));
g.frontier.world.addTown({ id: 'rivalTown', name: 'Rivalton', owner: rivals[0], x: farSite.x, z: farSite.z, site: farSite.id, pop: 4, stock: { ryo: 100 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
S.frontier.settlements.rivalTown.founded = S.tick ?? 0;
const biz = Object.values(S.businesses || {}).find(b => !b.owner && !b.hideout); if (biz) biz.owner = rivals[0];
const hideout = Object.values(S.businesses || {}).find(b => b.hideout === rivals[0]);
// every counted building of the castle down and the keep a ruin: the hero takes the keep
for (const b of t.buildings) if (b.stage === 'built' && (frontier.war.morale.weights[b.type] || 0) > 0) b.stage = 'ruined';
g.frontier.warMorale.tick();
assert.ok(g.frontier.warMorale.ready(w.id, 'town'), 'every counted building is down');
const hp = WE.hallPoint(w, 'town'); hero.x = hp.x + hp.r + 2; hero.z = hp.z; hero.place = 'world';
const ck = WE.check(hero, w, 'town', null);
assert.ok(ck.ok, `the keep can be taken: ${ck.reason}`);
assert.ok(WE.finish(w, 'fell', 'player'));
assert.ok(foe.out && foe.out.by === 'player', 'the clan is out');
assert.equal(t.owner, null, 'the castle stands empty'); assert.ok(t.fallen);
assert.equal(S.frontier.settlements.rivalTown.owner, null, 'its towns go empty'); assert.ok(S.frontier.settlements.rivalTown.empty);
if (biz) assert.equal(biz.owner, null, 'its businesses are free');
if (hideout) assert.ok(!hideout.hideout && hideout.closedHideout === rivals[0], 'its hideout closes');
assert.ok(!Object.values(S.entities).some(e => e.owner === rivals[0] && !e.warTroop && !e.dead), 'its units have left');
assert.ok(!D.active().some(o => o.attacker === rivals[0] || o.defender === rivals[0]), 'its wars are over');
assert.equal(S.campaignEnd ?? null, null, 'another rival is still in');
// the game runs on with a clan out and empty towns: an empty town does not grow or trade
const rt = S.frontier.settlements.rivalTown, pop0 = rt.pop, stock0 = JSON.stringify(rt.stock);
for (let i = 0; i < 400; i++) g.step([]);
assert.ok(rt.pop === pop0 && JSON.stringify(rt.stock) === stock0, 'an empty town stands still');

// --- Z6d: claiming an empty town -------------------------------------------------------------------------------------
const ET = g.frontier.emptyTowns, ER = zonesData.emptyTowns, claimRun = (e, c) => { g.frontier.command(e, { type: 'frontier', ...c }); return S.frontier.receipts.at(-1); };
assert.ok(ET.list().some(s => s.id === 'rivalTown'), 'the rival town is listed empty');
hero.x = rt.x + 300; hero.z = rt.z; delete hero.order;
assert.ok(!ET.check(hero, 'rivalTown').ok, 'too far from the hall');
const hpT = WE.hallPoint({ town: 'rivalTown' }, 'town'); hero.x = hpT.x + hpT.r + 2; hero.z = hpT.z;
// the zone cap: with two of your towns in that zone you cannot claim a third
const rz = Z.zoneOfTown(rt), mineIn = Z.townsIn(rz).filter(s => s.owner === 'player').length;
assert.ok(mineIn < (zonesData.townCap ?? 2), 'the test claims within the cap');
if (mineIn < (zonesData.townCap ?? 2)) {
  assert.ok(ET.check(hero, 'rivalTown').ok, `can claim: ${ET.check(hero, 'rivalTown').reason}`);
  const r = claimRun(hero, { id: hero.id, action: 'claimTown', town: 'rivalTown' });
  assert.ok(r.ok && hero.claimTown, `claim starts: ${r.reason}`);
  // a hit starts it over
  for (let i = 0; i < 20 * 10; i++) g.frontier.emptyTowns.tick(), S.tick++;
  hero.hp -= 1;
  g.frontier.emptyTowns.tick(); S.tick++;
  assert.ok(ET.view(hero).seconds >= ER.claimSeconds - 1, 'a hit starts the claim over');
  for (let i = 0; i < 20 * ER.claimSeconds + 5; i++) { g.frontier.emptyTowns.tick(); S.tick++; }
  assert.equal(rt.owner, 'player', 'the town is claimed'); assert.ok(!rt.empty && rt.claimed);
}
// decay: a second empty town turns to ruins, then is gone
g.frontier.world.addTown({ id: 'ghost', name: 'Ghost', owner: null, x: farSite.x + 900, z: farSite.z, pop: 2, stock: {}, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
const gh = S.frontier.settlements.ghost; gh.empty = { tick: S.tick, from: rivals[0] };
const dayT = Math.round((options.settings.dayNight.daySeconds + options.settings.dayNight.nightSeconds) * 20);
S.tick += Math.ceil(ER.ruinDays * dayT); while (S.tick % 20 !== 7) S.tick++; ET.tick();
assert.ok(gh.buildings.every(b => b.stage !== 'built') && gh.empty.ruined, 'it turns to ruins');
S.tick += Math.ceil((ER.decayDays - ER.ruinDays) * dayT); while (S.tick % 20 !== 7) S.tick++; ET.tick();
assert.ok(!S.frontier.settlements.ghost, 'then it is gone');
// the last rival out: the player wins
if (rivals[1]) {
  g.frontier.clanOut(rivals[1], 'player');
  assert.deepEqual(S.campaignEnd && { winner: S.campaignEnd.winner, lost: S.campaignEnd.lost }, { winner: 'player', lost: null }, 'the last clan standing wins');
}
for (let i = 0; i < 200; i++) g.step([]);
// another clan's castle is still behind the gate when that clan's zones are not held
// the player's clan out: the campaign is lost
{
  const g2 = createGame(options);
  setupMatch(g2, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
  g2.frontier.rivalCampaign.ensure();
  g2.frontier.clanOut('player', Object.keys(g2.state.clans).find(c => c !== 'player'));
  assert.equal(g2.state.campaignEnd?.lost, 'player', 'the player out: the campaign is lost');
  assert.equal(g2.castles.castleOf('player'), null, 'the player castle stands empty');
  for (let i = 0; i < 200; i++) g2.step([]);
}
console.log(`test_castle_siege: ok (${rivals.length} rival castles, ${n} towns taken)`);
