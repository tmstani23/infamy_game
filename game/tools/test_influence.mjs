// Frontier C4 (Tim 2026-11-05): in campaign mode Influence = Renown + businesses held per day + frontier
// trade; tiers fire once each and unlock the 2nd/3rd town permit, cheaper imports and better Market export
// prices. Renown itself is unchanged. Classic has no Influence at all.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const settings = data('data/settings.json'), I = settings.influence, frontier = data('data/frontier.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier });
function match(mode) {
  const g = createGame(options());
  setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode, bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 }, seed: 3 });
  return { g, clan: g.state.clans.player };
}
const dawn = g => { g.state.night = true; g.step([{ type: 'time', night: false }]); };
const own = (g, n) => Object.values(g.state.businesses).filter(b => !b.owner && !b.hideout && g.settings.units.rules.businesses[b.kind]).slice(0, n).forEach(b => g.clans.setOwner(b.id, 'player'));

// Classic: nothing
{
  const { g, clan } = match('classic');
  clan.renown = 5000; own(g, 3); dawn(g);
  assert.equal(g.influence.value('player'), 0); assert.equal(g.influence.tier('player'), 0);
  assert.equal(g.state.influence, undefined, 'no influence record in Classic');
  assert.equal(g.influence.exportFactor('player'), 1);
}

const { g, clan } = match('campaign');
const IN = g.influence;
// Renown counts, unchanged
clan.renown = 100;
assert.equal(IN.value('player'), 100);
// businesses held per day
own(g, 3); dawn(g);
assert.equal(IN.value('player'), 100 + 3 * I.perBusinessDay);
assert.equal(clan.renown, 100, 'Renown is not spent or converted');
// frontier trade: a Market sale
IN.sold('player', 200);
assert.equal(IN.value('player'), Math.floor(100 + 3 * I.perBusinessDay + 200 * I.perGoodSold));
// tiers fire once
clan.renown = I.tiers[1].at;
g.step([]);
const fired = () => g.state.influence.player.tier;
assert.equal(fired(), 2);
assert.ok(g.state.news.some(n => n.kind === 'influenceTier' && n.clan === 'player'), 'tier news');
g.step([]);
assert.ok(!g.state.news.some(n => n.kind === 'influenceTier' && n.clan === 'player'), 'fires once');
// unlocks: export bonus per tier, import discount, permits
assert.equal(IN.exportFactor('player'), 1 + 2 * I.exportBonusPerTier);
assert.equal(IN.importFactor('player'), 1 - 2 * I.importDiscountPerTier);
const permitTiers = I.tiers.filter(t => t.unlock === 'permit');
assert.equal(IN.maxTowns('player', frontier.founding.permit.maxTowns), frontier.founding.permit.maxTowns + I.tiers.slice(0, 2).filter(t => t.unlock === 'permit').length);
clan.renown = I.tiers.at(-1).at; g.step([]);
assert.equal(IN.maxTowns('player', 1), 1 + permitTiers.length, '2nd and 3rd town permits');

// the Market pays more per tier and counts as trade: two identical games, one at a higher tier
{
  const run = renown => {
    const { g } = match('campaign');
    g.state.clans.player.renown = renown;
    const t = g.frontier.world.addTown({ id: 'tm', name: 'M', region: null, owner: 'player', x: 3000, z: 3000, site: null, traits: { soil: 2, water: 2, defense: 2, nodes: {} },
      pop: 10, stock: { goods: 2000, food: 500 }, buildings: [{ type: 'town_hall' }, { type: 'market' }] });
    for (let i = 0; i < 400; i++) g.step([]);
    return { ryo: t.stock.ryo, goods: t.stock.goods, trade: g.state.influence.player.trade };
  };
  const base = run(0), high = run(I.tiers[2].at);
  assert.ok(base.goods < 2000 && base.trade > 0, 'the market sells and sales count as frontier trade');
  assert.equal(high.goods, base.goods, 'same goods sold');
  assert.ok(high.ryo > base.ryo, `higher tier, better price: ${high.ryo} vs ${base.ryo}`);
}

// saved with the game
{
  const g2 = createGame(options()); loadSave(g2, JSON.parse(JSON.stringify(makeSave(g, { bots: [] }))));
  assert.equal(g2.influence.value('player'), IN.value('player'));
}
console.log('test_influence: ok');
