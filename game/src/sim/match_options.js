// Shared, browser-independent match choices owned by the sim.
export const CLAN_CHOICES = [
  { id: 'yakuza', name: 'Yakuza', kind: 'yakuza', model: 'ronin', color: '#24978c', home: 'Inn hideout',
    about: 'Build your fortune through businesses, street battles and a growing crew.' },
  { id: 'kuroda', name: 'Kuroda', kind: 'yakuza', model: 'rival_yakuza', color: '#b02424', home: 'Izakaya hideout',
    about: 'Lead aggressive spearmen with counters, sweeping snares and a protective formation.' },
  { id: 'shinobi', name: 'Shinobi', kind: 'ninja', model: 'ninja_leader', color: '#7a3fb0', home: 'Hidden village',
    about: 'Earn Renown through contracts. Strike from hiding, then disappear into the mist.' },
];
export const DIFFICULTY_CHOICES = [
  { id: 'easy', name: 'Easy', about: 'More cautious rivals with slower reactions.' },
  { id: 'medium', name: 'Medium', about: 'Adaptive rivals using their full ability kits.' },
  { id: 'hard', name: 'Hard', about: 'Faster reactions, bolder hunts and more aggressive raids.' },
];
// mode (frontier F0.4): 'classic' = today's city game with its season; 'campaign' = city plus the island
// (the gate opens, W3.5). Only 'classic' is offered on the start screen until the campaign is playable.
export const MODES = ['classic', 'campaign'];
export const MODE_CHOICES = [
  { id: 'classic', name: 'Classic', about: 'The city only: take businesses, win the season and earn Renown.' },
  { id: 'campaign', name: 'Campaign (early)', about: 'The city plus the island: found towns, send out settlers and workers. No season end; still unfinished.' },
];
// home (Z7): 'pick' = no castle at the start, the player chooses his home in the game with the old surveyor (the
// start screen sends this); or a zone whose castle he starts in, or 'random' (tests and dev saves). Campaign only; the
// zones are in data/campaign_zones.json, so an unknown zone falls back to the default when the match is set up
export const DEFAULT_HOME = 'east_plains';
export function matchOptions({ clan = 'yakuza', difficulty = 'easy', mode = 'classic', home = DEFAULT_HOME } = {}) {
  if (!CLAN_CHOICES.some(c => c.id === clan)) throw new Error(`Unknown clan: ${clan}`);
  if (!DIFFICULTY_CHOICES.some(d => d.id === difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (!MODES.includes(mode)) throw new Error(`Unknown mode: ${mode}`);
  if (mode !== 'campaign') return { clan, difficulty, mode };
  return { clan, difficulty, mode, home: typeof home === 'string' && /^[a-z_]+$/.test(home) ? home : DEFAULT_HOME };
}
