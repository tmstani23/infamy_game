// Top bar standings model (Tim 2026-11-10): a chip per clan, you first then by rank; Influence and Renown in campaign, points in classic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { standingsModel, standingsDetail } from '../src/top_bar_standings.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json') });
const fresh = mode => { const g = createGame(options()); setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode, bots: data('data/bots.json'), spawns: options().district.spawns, seed: 9 }); for (let i = 0; i < 5; i++) g.step([]); return g; };
{
  const g = fresh('campaign'), S = g.state, rivals = Object.keys(S.clans).filter(id => id !== 'player' && g.territory.standings().some(r => r.clan === id));
  assert.ok(rivals.length >= 2, 'rival clans are in the standings');
  S.clans[rivals[0]].renown = 120; S.clans[rivals[1]].renown = 300; S.clans.player.renown = 10;
  (S.influence ||= {})[rivals[0]] = { days: 40, trade: 5, tier: 0 };
  const m = standingsModel(g, 'player');
  assert.equal(m.campaign, true);
  assert.equal(m.rows.length, g.territory.standings().length, 'every clan has a chip');
  assert.deepEqual(m.rows.slice(0, 3).map(r => r.clan), ['player', rivals[1], rivals[0]], 'you first, then rivals by Influence');
  assert.equal(m.rows[0].name, 'You');
  const r = m.rows.find(x => x.clan === rivals[0]);
  assert.equal(r.big, 165); assert.equal(r.renown, 120); assert.equal(r.label, 'Influence');
  assert.match(r.hover, /Renown 120 \+ businesses held 40 \+ town trade 5/);
  assert.match(r.hover, /Next tier at \d+/);
  assert.match(m.clock.day, /^Day \d+$/); assert.match(m.clock.crew, /^Crew \d+ of \d+$/);
  assert.ok(m.rows.every(x => !/[^\x20-\x7e\n]/.test(x.hover + x.name)), 'plain text only');
  // the Standings panel detail for a rival
  const d = standingsDetail(g, 'player', rivals[0]), tiers = g.influence.tiers();
  assert.equal(d.coins[0].v, 165); assert.equal(d.coins[2].v, 120); assert.equal(d.me, false);
  assert.deepEqual(d.from.map(x => x.right), ['120', '40', '5']);
  assert.equal(d.next.at, tiers[0].at); assert.equal(d.next.left, tiers[0].at - 165);
  assert.equal(d.rows.length, tiers.length); assert.match(d.rows[0].right, /to go$/);
  S.clans[rivals[0]].renown = tiers[0].at;
  const d2 = standingsDetail(g, 'player', rivals[0]);
  assert.equal(d2.rows[0].right, 'Reached'); assert.equal(d2.coins[1].v, 1);
  assert.equal(standingsDetail(g, 'player', 'nobody'), null);
}
{
  const g = fresh('classic'), m = standingsModel(g, 'player');
  assert.equal(m.campaign, false);
  assert.ok(m.rows.every(r => r.label === 'Points' && r.tier === null));
  assert.match(m.clock.day, /^Day \d+ of \d+$/);
  assert.equal(m.rows[0].clan, 'player');
  const d = standingsDetail(g, 'player', 'player');
  assert.equal(d.coins[0].label, 'Points'); assert.equal(d.next, null); assert.deepEqual(d.from, []);
}
console.log('test_top_bar: ok');
