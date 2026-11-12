// Tim 2026-11-11: rival clans handle the police like a player. The Shinobi rival bribes at Wanted (the Yakuza and
// Kuroda rivals already did), a rival's arrested crew go to jail and its boss bails them out, and a rival boss
// never swings back at a patrol officer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: { ...data('data/frontier.json'), fixtureTowns: false } });
function match() {
  const g = createGame(options());
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 3000, botRyo: 3000 }, seed: 5 });
  const bots = makeBots(g, m.rivals);
  return { g, run: (seconds, until) => { for (let i = 0; i < seconds * 20; i++) { g.step(bots.flatMap(b => b.tick())); if (until()) return true; } return false; } };
}
for (const id of ['shinobi', 'kuroda']) {
  // bribe at Wanted
  { const { g, run } = match(), c = g.state.clans[id];
    c.ryo = 3000; c.heat = 70;
    const before = c.ryo;
    assert.ok(run(240, () => (g.state.clans[id].ryoHistory || []).some(l => l.reason === 'Police bribe')), `${id}: bribed the police`);
    assert.ok(c.heat < 70 && c.ryo <= before); }
  // an arrested crewman sits in jail and is bailed out
  { const { g, run } = match(), c = g.state.clans[id];
    c.ryo = 3000;
    assert.ok(run(300, () => g.clans.crewOf(id).length >= 1), `${id}: hired a crewman`);
    const u = g.clans.crewOf(id)[0], n = g.clans.crewCount(id);
    g.police.jail(u); g.removeUnit ? g.removeUnit(u.id) : delete g.state.entities[u.id];
    assert.equal(c.jail?.length, 1, `${id}: arrested crew go to jail`);
    assert.equal(g.clans.crewCount(id), n, 'a prisoner still counts as crew');
    assert.ok(run(480, () => !c.jail.length && (c.ryoHistory || []).some(l => l.reason === 'Crew bailed out')), `${id}: bailed its crewman out`); }
}
console.log('test_rival_police: ok');
