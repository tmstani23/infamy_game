import { startClan } from './start_clan.js';
import { CLAN_CHOICES, matchOptions } from './match_options.js';
import { stageShakedownPreview } from './shakedown_preview.js';
import { stageAssignmentPreview } from './assignment_preview.js';

// Players keep the local 'player' id, while clan identity determines their
// leader, home and rivals. Bots and humans use the same fair clan initializer.
export function setupMatch(game, { clan, difficulty, bots, spawns = {}, test = {} }) {
  if (Object.keys(game.state.clans).length) throw new Error('Match setup requires a fresh game');
  const options = matchOptions({ clan, difficulty });
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
    model: selected.model, color: selected.color,   // every clan starts right outside its HQ door (Tim 2026-10-26)
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
  game.deployment.enable();
  const previewCommands=test.setup==='assignments'?stageAssignmentPreview(game,heroId,rivals):test.setup==='shakedown'?stageShakedownPreview(game,heroId,rivals):[];
  return { heroId, rivals, options, previewCommands };
}
