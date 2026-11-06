// Frontier E6 (Tim 2026-11-05): rival bots found their towns with the player's commands (permit and
// settlers at the Land Office, Choose site at the gate, found). They wait for the player's first town or
// fallbackDay, leave staggerDays apart, never pick the same site, never issue a rejected found, and their
// site picks change with the game seed. Classic bots never try.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const frontier = data('data/frontier.json'), B = frontier.founding.bots;
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, fixtureTowns: false } });
function match(mode, seed = 5) {
  const g = createGame(options());
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode, bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 3000, botRyo: 3000 }, seed });
  return { g, bots: makeBots(g, m.rivals), rivals: m.rivals };
}
const botTowns = g => Object.values(g.state.frontier.settlements).filter(s => s.founded !== undefined && g.state.clans[s.owner]?.bot);

// site picks: per-game seed, clan taste, never the same site for two clans
{
  const a = match('campaign', 5).g, b = match('campaign', 987654).g;
  const picks = g => ['kuroda', 'shinobi'].map(id => g.landOffice.botSite(id));
  assert.notDeepEqual(picks(a), picks(b), 'site picks vary with the game seed');
  let differ = 0;
  for (let s = 1; s <= 8; s++) { const g = match('campaign', s).g; differ += new Set(picks(g)).size === 2 ? 1 : 0; }
  assert.ok(differ >= 1);
}

// not due before the player founds or fallbackDay
{
  const { g, bots } = match('campaign');
  for (let i = 0; i < 400; i++) g.step(bots.flatMap(b => b.tick()));
  assert.ok(!Object.values(g.state.clans).some(c => c.bot && c.permit), 'nobody leaves early');
  assert.equal(g.landOffice.botDue('kuroda', 0), false);
  g.state.clock.day = B.fallbackDay;
  assert.equal(g.landOffice.botDue('kuroda', 0), true, 'fallbackDay: they go anyway');
  assert.equal(g.landOffice.botDue('kuroda', 1), false, 'the second bot leaves staggerDays later');
}

// the real run: the player has founded, the bots walk the whole way and found
{
  const { g, bots } = match('campaign');
  g.state.frontier.firstPlayerTownDay = g.state.clock.day;
  const rejected = [], cmds = [];
  let foundBy = null;
  for (let i = 0; i < 30000 && botTowns(g).length < 2; i++) {
    const out = bots.flatMap(b => b.tick());
    cmds.push(...out.filter(c => ['landOffice', 'expedition', 'frontier', 'hire'].includes(c.type) && (c.type !== 'hire' || c.unit === 'settler')).map(c => c.type + ':' + (c.action || c.unit)));
    g.step(out);
    for (const r of g.state.frontier.receipts) if (r.action === 'found' && !r.ok) rejected.push(r.reason);
    if (botTowns(g).length === 1 && foundBy === null) { foundBy = i; g.state.clock.day += B.staggerDays; }   // jump to the next bot's day
  }
  const towns = botTowns(g);
  assert.equal(towns.length, 2, `both bots founded (commands: ${[...new Set(cmds)].join(', ')})`);
  assert.deepEqual(rejected, [], 'no rejected found');
  assert.notEqual(towns[0].site, towns[1].site, 'different sites');
  assert.ok(towns.every(t => t.site), 'bots found on W1 sites');
  for (const id of ['landOffice:permit', 'hire:settler', 'expedition:site', 'frontier:found']) assert.ok(cmds.includes(id), `used ${id}`);
  for (const t of towns) assert.equal(g.state.clans[t.owner].permit, false);
  const bossesOut = Object.values(g.state.entities).filter(e => e.type === 'hero' && g.state.clans[e.owner]?.bot && e.place === 'world');
  for (const b of bossesOut) assert.ok(Object.values(g.state.entities).some(u => u.owner === b.owner && u.type !== 'hero' && u.type !== 'settler' && u.place === 'world'), 'a bot takes its Hero group along (Tim 2026-11-06)');
  assert.equal(bossesOut.length, 2, 'the bosses stay out at their towns (C2: lieutenants run the city)');
  for (let i = 0; i < 400; i++) g.step(bots.flatMap(b => b.tick()));
  for (const t of towns) assert.equal(t.autoBuild, true, 'a bot town\'s governor takes initiative');
}

// Classic: never
{
  const { g, bots } = match('classic');
  g.state.clock.day = 99;
  for (let i = 0; i < 200; i++) g.step(bots.flatMap(b => b.tick()));
  assert.ok(!Object.values(g.state.clans).some(c => c.permit) && !Object.values(g.state.entities).some(e => e.type === 'settler'));
}
console.log('test_bot_founding: ok');
