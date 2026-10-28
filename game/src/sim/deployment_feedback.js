// Authoritative results, shared by bots and human clients. UI never infers
// acceptance from a click or optimistic local state.
export function deploymentFeedback(state, hero, command, ok, text) {
  const clan = state.clans[hero.owner], config = state.deployment?.clans[hero.owner];
  if (!clan || !config) return;
  clan.notice = { tick: state.tick, text };
  config.feedback = { sequence: (config.feedback?.sequence || 0) + 1, tick: state.tick,
    request: typeof command.request === 'string' ? command.request.slice(0, 80) : null,
    action: command.action, sector: command.sector || null, ok, text };
}
