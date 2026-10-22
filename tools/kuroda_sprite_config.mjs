// Shared draft/production settings. Production export waits for Tim's review.
export const KURODA_FRAMING = { size: 256, cellWorld: 4.8, feetUp: .9 };
const clips = {
  idle: 'Great Sword Idle.fbx', walk: 'brawler/Walking.fbx', run: 'Run.fbx',
  sweep: 'Great Sword Slash.fbx', death: 'Two Handed Sword Death.fbx',
};
export const KURODA_SPRITES = {
  rival_yakuza: { model: 'rival_yakuza', item: { file: 'spear', proc: 'spear', mode: 'right', length: 1.85, grip: .4, palmOffset: .075, spear: true, shield: true },
    clips: { ...clips, attack: 'Upward Thrust.fbx' } },
  kuroda_spearman: { model: 'swordsman', item: { file: 'spear', proc: 'spear', mode: 'both', length: 2.25, grip: .28, palmOffset: .075, spear: true },
    clips: { ...clips, attack: 'Bayonet Stab.fbx' } },
};
