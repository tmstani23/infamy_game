// Rebuilds the dev test saves from the current code, so they never go stale (frontier F0.5).
//   node game/tools/make_dev_save.mjs            -> saves/dev_classic.json, saves/dev_frontier.json
// Load them from the start screen (Load game) or Settings. Add a save only with Tim's OK (max 4).
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots, makeSave, loadSave, heroOf } from '../src/sim/save.js';
import { makeFile, validName } from '../src/save_store.js';

const data = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'),
  police: data('data/police.json'), settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json') };
const dir = new URL('../../saves/', import.meta.url);

const SAVES = {
  // A Classic city match: Yakuza, medium, 3 clans with bots, 20 s in, spare ryo to buy and hire.
  dev_classic: { clan: 'yakuza', difficulty: 'medium', ticks: 400, playerRyo: 3000 },
  // A campaign match (the island gate is open, W3.5) with the two fixture frontier towns: First Frontier is yours, Second Frontier is the first bot clan's (F2.9, F4).
  dev_frontier: { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', ticks: 400, playerRyo: 3000, frontier: true },
};

export function build(name, spec) {
  const game = createGame(options);
  const m = setupMatch(game, { clan: spec.clan, difficulty: spec.difficulty, mode: spec.mode, bots: data('data/bots.json'),
    spawns: options.district.spawns, test: { playerRyo: spec.playerRyo } });
  game.civilians.populate();
  const bots = makeBots(game, m.rivals);
  for (let i = 0; i < spec.ticks; i++) game.step(bots.flatMap(b => b.tick()));
  if (spec.frontier) game.frontier.world.assignStartOwners({ player: 'player', bot: m.rivals[0]?.clan });
  const save = makeSave(game, { bots });
  return makeFile(save, { clan: game.state.clans.player?.kind ?? spec.clan, mode: game.state.match.mode, label: `Dev: ${name}`, day: game.state.clock?.day });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('make_dev_save.mjs')) {
  mkdirSync(dir, { recursive: true });
  for (const [name, spec] of Object.entries(SAVES)) {
    if (!validName(name)) throw new Error('Bad save name ' + name);
    const file = build(name, spec), path = new URL(name + '.json', dir), tmp = new URL(name + '.json.tmp', dir);
    writeFileSync(tmp, JSON.stringify(file)); renameSync(tmp, path);
    // proves the F1 loader accepts it, as the Load menu would
    const g = createGame(options); loadSave(g, JSON.parse(readFileSync(path, 'utf8')));
    if (heroOf(g) == null) throw new Error(name + ' has no hero');
    console.log(`${name}: ok (tick ${file.tick}, hero ${heroOf(g)})`);
  }
}
