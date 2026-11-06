// The lieutenant's clan-tinted portrait (assets/sprites/portraits/lieutenant1_<clan>_portrait_idle.png).
// Shown in the gate talk (src/lieutenant_talk.js) and the While I'm away page (src/lieutenant_panel.js).
export function lieutenantPortrait(clan) {
  const tint = clan?.kind === 'ninja' ? 'shinobi' : clan?.faction === 'kuroda' ? 'kuroda' : clan ? 'yakuza' : null;
  return `../assets/sprites/portraits/lieutenant1_${tint ? tint + '_' : ''}portrait_idle.png`;
}
