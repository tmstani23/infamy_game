// Shared match setup for players and bots. Test setups can override the starting
// squad or treasury; normal clans get one recruit and rules.startRyo.
export function startClan(game, { id, name = id, kind = 'yakuza', bot = false,
  model = kind === 'ninja' ? 'ninja_leader' : 'ronin', position, crew = 1, ryo } = {}) {
  game.clans.addClan(id, { name, kind, bot, ryo });
  const home = Object.values(game.state.businesses).find(b => b.hideout === id);
  const [x, z] = position || home.ring;
  const hero = game.spawn('hero', model, x, z, { owner: id, home: [x, z], dir: 0 });
  const type = kind === 'ninja' ? 'ninja' : 'thug';
  const sprite = game.settings.units.types[type].sprite;
  for (let k = 0; k < crew; k++) {
    const spot = game.nav.nearestFree(x + 1 + k, z + 1);
    if (!spot) throw new Error(`No starting crew space for ${id}`);
    game.spawn(type, sprite, ...spot, { owner: id, order: { kind: 'follow', target: hero } });
  }
  return hero;
}
