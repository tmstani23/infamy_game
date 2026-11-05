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
export function matchOptions({ clan = 'yakuza', difficulty = 'easy', mode = 'classic' } = {}) {
  if (!CLAN_CHOICES.some(c => c.id === clan)) throw new Error(`Unknown clan: ${clan}`);
  if (!DIFFICULTY_CHOICES.some(d => d.id === difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (!MODES.includes(mode)) throw new Error(`Unknown mode: ${mode}`);
  return { clan, difficulty, mode };
}
