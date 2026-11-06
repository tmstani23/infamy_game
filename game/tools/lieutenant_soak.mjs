// Lieutenant soak (Tim 2026-11-06): the player's boss goes out to the island at the start and stays away; the rival
// bots play as usual and the player's city runs on its lieutenant (today's standing orders, default budget).
// Starts from a weak, average or strong city and prints every clan at each dawn, so you can see whether a city left
// alone drifts toward the rivals, collapses or gets stripped. Headless, rules only.
// Run from the repo root: node game/tools/lieutenant_soak.mjs [weak|average|strong] [days] [seed]
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots } from '../src/sim/save.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const start = process.argv[2] || 'average', days = Number(process.argv[3] || 3), seed = Number(process.argv[4] || 9);
const g = createGame({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json') });
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'medium', mode: 'campaign', bots: data('data/bots.json'), spawns: data('data/port_town.json').spawns, seed });
const S = g.state, hero = S.entities[m.heroId], player = S.clans.player, U = g.settings.units.types;
const biz = id => Object.values(S.businesses).filter(b => b.owner === id && !b.hideout);
const crew = id => g.clans.crewOf(id).filter(u => !u.dead).length;
// every clan starts a few days in: 2 businesses and 400 ryo; the player's city is then made weak, average or strong
const pool = Object.values(S.businesses).filter(b => !b.owner && !b.hideout && g.businesses.rules[b.kind]?.price);
for (const id of Object.keys(S.clans)) { for (const b of pool.splice(0, 2)) g.clans.setOwner(b.id, id); S.clans[id].ryo = 400; }
if (start === 'weak') {
  for (const b of biz('player')) g.clans.setOwner(b.id, null);
  player.ryo = 100;
} else if (start === 'strong') {
  for (const b of pool.splice(0, 4)) g.clans.setOwner(b.id, 'player');
  player.ryo = 3000;
  const d = g.doors.find(x => x.to && x.place === g.lieutenant.hq('player').room);
  for (let i = 0; i < 6; i++) g.spawn('thug', U.thug.sprite, d.x + i * 0.5, d.z + 1, { owner: 'player', hp: U.thug.hp });
}
const brains = makeBots(g, m.rivals);
const gate = g.doors.find(d => d.gate && d.place === 'world');
Object.assign(hero, { place: 'world', x: gate.to.x, z: gate.to.z, hp: 1e6, maxHp: 1e6, holdFire: true });   // away and safe
const ids = Object.keys(S.clans);
const row = label => console.log(label.padEnd(8) + ids.map(id => `${id.slice(0, 7).padEnd(7)} biz ${String(biz(id).length).padStart(2)} ryo ${String(Math.round(S.clans[id].ryo)).padStart(5)} crew ${String(crew(id)).padStart(2)} inf ${String(g.influence.value(id)).padStart(4)}`).join(' | '));
console.log(`start ${start}, seed ${seed}, ${days} days away`);
row('day ' + S.clock.day);
const end = S.tick + days * g.dayTicks * 1.2;
while (S.clock.day <= days && S.tick < end) {
  const cmds = brains.flatMap(b => b.tick() || []);
  g.step(cmds);
  if (S.dawn) row('day ' + S.clock.day);
}
const r = g.lieutenant.record('player');
console.log('player lieutenant log:', r.log.map(x => `d${x.day} ${x.text}`).join('; '));
console.log('player boss still away:', hero.place === 'world');
