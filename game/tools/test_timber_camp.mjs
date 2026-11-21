// Tim 2026-11-11: a bot town on a site with no trees in worker reach (S22) builds a lumber camp toward the nearest
// trees before any other camp, so it never spends its start timber on a quarry and sits at 5 people for good.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const frontier = data('data/frontier.json'), B = frontier.founding.bots;
// Tim 2026-11-21: world_spots.json now gives every site an ordinary tree spot in reach (seed_resource_spots.mjs site
// floor). The rule stays for any site without one, so the test takes the trees within workers.range away from S22.
function noTrees(id) {
  const spots = data('data/world_spots.json'), site = data('data/world.json').sites.find(s => s.id === id), R = frontier.workers.range;
  const gone = new Set(spots.spots.filter(p => p.kind === 'timber' && Math.hypot(p.x - site.x, p.z - site.z) <= R).map(p => p.id));
  return { ...spots, spots: spots.spots.filter(p => !gone.has(p.id)), byChunk: Object.fromEntries(Object.entries(spots.byChunk || {}).map(([k, v]) => [k, v.filter(i => !gone.has(i))])) };
}
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'),
  resourceSpots: noTrees('S22'),
  frontier: { ...frontier, fixtureTowns: false } });
const g = createGame(options());
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 3000, botRyo: 3000 }, seed: 5 });
const bots = makeBots(g, m.rivals), S = g.state;
S.frontier.firstPlayerTownDay = S.clock.day - B.afterPlayerDays - B.businessWaitDays;
(S.frontier.siteClaims ||= {}).S22 = 'kuroda';   // the hill site with no trees within workers.range
const town = () => Object.values(S.frontier.settlements).find(s => s.owner === 'kuroda' && s.founded !== undefined);
for (let i = 0; i < 20000 && !town(); i++) g.step(bots.flatMap(b => b.tick()));
const t = town();
assert.ok(t, 'Kuroda founded');
assert.equal(t.site, 'S22');
const has = type => t.buildings.some(b => b.type === type) || t.projects.some(p => p.type === type);
for (let i = 0; i < 12000 && !(t.buildings.some(b => b.type === 'lumber_camp' && b.stage === 'built') && t.workers.some(w => w.trip?.resource === 'timber')); i++) {
  g.step(bots.flatMap(b => b.tick()));
  if (!has('lumber_camp')) assert.ok(!has('quarry'), 'no quarry before the lumber camp');
}
assert.ok(t.buildings.some(b => b.type === 'lumber_camp' && b.stage === 'built'), 'lumber camp built');
assert.ok(t.workers.some(w => w.trip?.resource === 'timber'), 'a worker cuts timber');
console.log('test_timber_camp: ok');
