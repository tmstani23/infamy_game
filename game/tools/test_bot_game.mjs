// The rival bot clan over a whole game: the ?test=bot setup (bot 5000 ryo, you hold the teahouse
// and wait in your hideout), easy level, with townsfolk, bandits, police and the day-night clock running.
// It should buy, hire, buy a War Lantern and raid you, without errors or getting stuck.
// Run: node tools/test_bot_game.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { createBot } from '../src/sim/bot.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const bots = data('data/bots.json');
const g = createGame({
  district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'),
});
g.clans.addClan('player', { name: 'Your clan' });
g.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true, ryo: 5000 });
const tea = Object.values(g.state.businesses).find(b => b.kind === 'teahouse');
g.clans.setOwner(tea.id, 'player');
g.civilians.populate();
const iz = Object.values(g.state.businesses).find(b => b.hideout === 'kuroda');
const boss = g.spawn('hero', 'rival_yakuza', iz.ring[0], iz.ring[1], { owner: 'kuroda', home: iz.ring });
const bot = createBot(g, { clan: 'kuroda', hero: boss, rules: bots.levels[bots.difficulty] });
// you wait inside your hideout (out on the street your boss would fight its crew as they pass)
const inn = g.rooms.find(r => r.name === 'inn');
g.spawn('hero', 'ronin', inn.spawn.x, inn.spawn.z, { owner: 'player', place: inn.name });

const log = [];
let raided = false, lastGoal = '';
for (let i = 0; i < 20 * 60 * 15; i++) {   // 15 minutes
  g.step(bot.tick());
  const gl = bot.goal()?.kind || '';
  if (gl !== lastGoal) { log.push(`${Math.round(i / 20)}s ${gl || 'idle'}`); lastGoal = gl; }
  if (Object.values(g.state.attacks).some(a => a.mode === 'raid' && a.clan === 'kuroda')) raided = true;
}
const k = g.state.clans.kuroda;
const owned = Object.values(g.state.businesses).filter(b => b.owner === 'kuroda' && !b.hideout).map(b => b.kind);
console.log('owned', owned, 'crew', g.clans.crewCount('kuroda'), 'ryo', Math.round(k.ryo), 'heat', k.heat, 'raided', raided, 'teahouse owner', tea.owner);
if (process.env.DBG) console.log(log.join('\n'));
// it picks by payout per cost and travel time over the bigger business list (Tim 2026-10-22/23), so no fixed pair
assert.ok(owned.length >= 3, 'bought several businesses');
assert.ok(g.clans.crewCount('kuroda') >= 4, 'hired a crew');
assert.ok(raided, 'raided your teahouse');
console.log('bot full game ok');
