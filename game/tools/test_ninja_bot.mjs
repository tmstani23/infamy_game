// Shinobi bot (sim/ninja_bot.js, Tim 2026-10-20: 3 clans, the two you don't play are bots): it
// hires ninja at the dojo, takes a job at the shrine and gets on with it, through the same commands.
// Run: node tools/test_ninja_bot.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { createNinjaBot } from '../src/sim/ninja_bot.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const bots = data('data/bots.json');
const g = createGame({
  district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: { ...data('data/settings.json'), dayNight: { auto: false } },
});
// a Yakuza game: you, Kuroda, and the Shinobi bot at the longhouse
g.clans.addClan('player', { name: 'Your clan' });
g.clans.addClan('kuroda', { bot: true });
const sc = bots.shinobi;
g.clans.addClan(sc.id, { name: sc.name, bot: true, kind: 'ninja' });
const lh = Object.values(g.state.businesses).find(b => b.hideout === sc.id);
assert.ok(lh && lh.owner === sc.id, 'longhouse is the Shinobi bot hideout');
assert.ok(Object.values(g.state.businesses).some(b => b.hideout === 'player'), 'your inn still there');
const boss = g.spawn('hero', sc.boss, lh.ring[0], lh.ring[1], { owner: sc.id, home: lh.ring });
g.state.clans[sc.id].ryo = 600;
const bot = createNinjaBot(g, { clan: sc.id, hero: boss, rules: bots.shinobiLevels[bots.difficulty] });
const kinds = new Set();
let hired = false, took = false, completed = 0;
for (let i = 0; i < 20 * 240; i++) {
  if (i === 20 * 60) g.step([{ type: 'time', night: true }]);
  g.step(bot.tick());
  completed += g.state.news.filter(n => n.kind === 'contractDone' && n.clan === sc.id).length;
  if (Object.values(g.state.entities).some(e => e.owner === sc.id && e.type !== 'hero')) hired = true;
  const j = g.state.contracts.active[sc.id];
  if (j) { took = true; kinds.add(j.kind); }
}
assert.ok(hired, 'hired ninja at the dojo');
assert.ok(took, `took a contract (${[...kinds].join(', ')})`);
assert.ok(completed > 0 && g.state.clans[sc.id].renown > 0, 'completed contracts through normal movement and combat');
console.log(`ninja bot ok (jobs: ${[...kinds].join(', ')}, renown ${g.state.clans[sc.id].renown})`);
