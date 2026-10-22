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
export function matchOptions({ clan = 'yakuza', difficulty = 'easy' } = {}) {
  if (!CLAN_CHOICES.some(c => c.id === clan)) throw new Error(`Unknown clan: ${clan}`);
  if (!DIFFICULTY_CHOICES.some(d => d.id === difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  return { clan, difficulty };
}
