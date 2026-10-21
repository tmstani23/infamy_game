// Shared presence rules for services and business actions. House guards and
// incapacitated units cannot act as a player's representative.
export const canInteract = e => !!e && !!e.owner && e.type !== 'civilian' && !e.guard && !e.wild && !e.cop && !e.dead && !e.downed && !e.jailed;
export function interactionActor(state, id, present, preferred = []) {
  const owner = state.entities[id]?.owner;
  if (!owner || !state.clans?.[owner]) return null;
  const ids = [...new Set([...preferred, id, ...Object.keys(state.entities)])];
  return ids.map(key => state.entities[key]).find(e => e?.owner === owner && canInteract(e) && present(e)) || null;
}
