// Start-screen Continue/Load (F1.6b): a save of any clan boots a display copy whose hero and
// state match the worker's, the way main.js builds it (createGame + loadSave + heroOf).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots, makeSave, loadSave, heroOf } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'),
  police: data('data/police.json'), settings: data('data/settings.json') };
for (const clan of ['shinobi', 'kuroda']) {
  const game = createGame(options), m = setupMatch(game, { clan, difficulty: 'medium', bots: data('data/bots.json'), spawns: options.district.spawns, test: {} });
  game.civilians.populate();
  const bots = makeBots(game, m.rivals);
  for (let i = 0; i < 100; i++) game.step(bots.flatMap(b => b.tick()));
  const file = JSON.parse(JSON.stringify(makeSave(game, { bots })));   // through a file
  const replica = createGame(options); loadSave(replica, file);
  assert.equal(heroOf(replica), m.heroId, clan + ' hero id');
  assert.equal(replica.state.match.clan, clan);
  assert.equal(JSON.stringify(replica.state.entities), JSON.stringify(game.state.entities), clan + ' entities match');
  assert.equal(replica.state.tick, game.state.tick);
}
console.log('test_start_load: ok');
