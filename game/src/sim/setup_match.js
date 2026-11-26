import { startClan } from './start_clan.js';
import { modeRules } from './modes/index.js';
import { CLAN_CHOICES, DEFAULT_HOME, matchOptions } from './match_options.js';
import { stageShakedownPreview } from './shakedown_preview.js';
import { stageAssignmentPreview } from './assignment_preview.js';

// Players keep the local 'player' id, while clan identity determines their
// leader, home and rivals. Bots and humans use the same fair clan initializer.
export function setupMatch(game, { clan, difficulty, mode, home, bots, spawns = {}, test = {}, seed = 1 }) {
  if (Object.keys(game.state.clans).length) throw new Error('Match setup requires a fresh game');
  const options = matchOptions({ clan, difficulty, mode, home });
  if (test.setup === 'bot') options.clan = 'yakuza';
  if (test.ninja) options.clan = 'shinobi';
  for (const levels of [bots.levels, bots.shinobiLevels])
    if (!levels?.[options.difficulty]) throw new Error(`Missing AI profile: ${options.difficulty}`);
  const selected = CLAN_CHOICES.find(c => c.id === options.clan);
  const originalHomes = { player: 'yakuza', [bots.clan.id]: 'kuroda' };
  for (const b of Object.values(game.state.businesses)) {
    const identity = originalHomes[b.hideout];
    if (identity) b.hideout = identity === selected.id ? 'player' : identity === 'yakuza' ? bots.yakuza.id : bots.clan.id;
  }
  const heroId = startClan(game, { id: 'player', name: `${selected.name} clan`, kind: selected.kind,
    model: selected.model, color: selected.color,   // every clan starts right outside its HQ door (2026-10-26)
    ryo: test.playerRyo });
  const startBiz = test.playerOwns && Object.values(game.state.businesses).find(b => b.kind === test.playerOwns);
  if (startBiz) game.clans.setOwner(startBiz.id, 'player');
  const rivals = [];
  for (const choice of CLAN_CHOICES.filter(c => c.id !== selected.id)) {
    const config = choice.id === 'yakuza' ? bots.yakuza : choice.id === 'kuroda' ? bots.clan : bots.shinobi;
    const hero = startClan(game, { id: config.id, name: config.name, kind: choice.kind, bot: true,
      model: config.boss, color: choice.color, ryo: choice.kind === 'ninja' ? undefined : test.botRyo });
    rivals.push({ clan: config.id, hero, kind: choice.kind,
      rules: (choice.kind === 'ninja' ? bots.shinobiLevels : bots.levels)[options.difficulty], seed: 4242 + rivals.length * 977 });
  }
  game.state.match = { ...options };
  // E6 (2026-11-05): bot site picks vary per game; the screen passes a random seed, tests a fixed one
  if (modeRules(game.state).founding) game.state.campaignSeed = Number.isFinite(seed) ? Math.floor(seed) : 1;
  // Z7 (2026-11-20): a new game from the start screen passes home 'pick': no castle yet, the player chooses his home
  // with the old surveyor after buying the founding permit (sim/frontier/land_office.js chooseHome). Tests and dev
  // saves may pass a zone (or 'random', rolled with the campaign seed); the default is East Plains.
  // The rivals roll their homes from the castle sites left (sim/frontier/rival_campaign.js)
  if (modeRules(game.state).founding && options.home === 'pick') game.state.match.home = null;
  else if (modeRules(game.state).founding) {
    const sites = game.frontier?.campaignZones?.castles?.().map(c => c.zone).filter(Boolean) || [];
    let r = (game.state.campaignSeed * 48271 + 11) % 2147483647 || 1;
    const pick = options.home === 'random' && sites.length ? sites[(r = (r * 16807) % 2147483647) % sites.length]
      : sites.includes(options.home) ? options.home : DEFAULT_HOME;
    game.state.match.home = options.home = pick;
    game.castles?.place('player', pick);
  }
  game.deployment.enable();
  const previewCommands=test.setup==='assignments'?stageAssignmentPreview(game,heroId,rivals):test.setup==='shakedown'?stageShakedownPreview(game,heroId,rivals):[];
  return { heroId, rivals, options, previewCommands };
}
