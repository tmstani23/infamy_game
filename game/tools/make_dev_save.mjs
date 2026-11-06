// Rebuilds the dev test saves from the current code, so they never go stale (frontier F0.5).
//   node game/tools/make_dev_save.mjs            -> saves/dev_classic.json, dev_frontier.json, campaign_test_yakuza.json
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
  dev_frontier: { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', ticks: 400, playerRyo: 3000, frontier: true, settlers: 6 },
  // Campaign as a real game (no fixture towns), ready to test the campaign loop (Tim 2026-11-06): the city's businesses
  // are shared out evenly between the clans that hold them, and every clan has the Renown, 11 crew (3 spare over the permit's 8, so an early fight does not drop below it) and ryo to buy a
  // permit, hire settlers and found a town. Nobody holds a permit yet; rivals leave once you found (the real rule).
  campaign_test_yakuza: { clan: 'yakuza', difficulty: 'medium', mode: 'campaign', ticks: 400, realGame: true, cityMix: true, ryo: 3000, renown: 300, crew: 11 },
};

// Shares out the free businesses (the kinds that give crew room) between the clans that may hold them (the
// Shinobi clan holds none; its crew room comes from Renown). Biggest first, snake order, so the shares stay even.
function shareCity(game) {
  const room = game.settings.units.rules.capPerBusiness, ids = Object.keys(game.state.clans).filter(id => game.state.clans[id].kind !== 'ninja');
  const free = Object.values(game.state.businesses).filter(b => !b.owner && room[b.kind]).sort((a, b) => room[b.kind] - room[a.kind] || a.id.localeCompare(b.id));
  free.forEach((b, i) => { const lap = Math.floor(i / ids.length), k = i % ids.length; game.clans.setOwner(b.id, ids[lap % 2 ? ids.length - 1 - k : k]); });
}

// Tops every clan up to the spec's ryo, Renown and crew (crew spawn by the hero, following him).
function readyClans(game, spec) {
  for (const clan of Object.values(game.state.clans)) {
    clan.ryo = Math.max(clan.ryo || 0, spec.ryo); clan.renown = Math.max(clan.renown || 0, spec.renown);
    const hero = Object.values(game.state.entities).find(e => e.owner === clan.id && e.type === 'hero');
    const type = clan.kind === 'ninja' ? 'ninja' : 'thug', sprite = game.settings.units.types[type].sprite;
    for (let k = game.clans.crewCount(clan.id); k < spec.crew; k++) {
      const spot = game.nav.nearestFree(hero.x + 1 + k * 0.7, hero.z + 1);
      if (spot) game.spawn(type, sprite, ...spot, { owner: clan.id, order: { kind: 'follow', target: hero.id } });
    }
  }
}

export function build(name, spec) {
  const game = createGame(spec.realGame ? { ...options, frontier: { ...options.frontier, fixtureTowns: false } } : options);   // E6b: real games have no fixture towns
  const m = setupMatch(game, { clan: spec.clan, difficulty: spec.difficulty, mode: spec.mode, bots: data('data/bots.json'),
    spawns: options.district.spawns, test: { playerRyo: spec.playerRyo } });
  game.civilians.populate();
  if (spec.cityMix) shareCity(game);
  if (spec.crew) readyClans(game, spec);
  const bots = makeBots(game, m.rivals);
  for (let i = 0; i < spec.ticks; i++) game.step(bots.flatMap(b => b.tick()));
  if (spec.frontier) game.frontier.world.assignStartOwners({ player: 'player', bot: m.rivals[0]?.clan });
  // E2: settlers waiting round the hero, following him (dev travel on the World map takes them along), so founding can be tried at once.
  if (spec.settlers) game.state.clans.player.permit = true;   // E1: founding needs a permit (Land Office); the dev save holds one
  if (spec.settlers) { const h = game.state.entities[m.heroId]; for (let i = 0; i < spec.settlers; i++) game.spawn('settler', 'laborer', h.x + 1.5 + i * 0.7, h.z + 1.5, { owner: 'player', holdFire: true, order: { kind: 'follow', target: h.id } }); }
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
