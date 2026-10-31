// The hero's entrance/exit takes precedence over a remote crew service.
// Services still use selected crew (or another available clan representative)
// when the hero is not standing at a door.
export function interactionDoor(game, heroId, selected = []) {
  return game.doorNear(heroId) || game.serviceAt(heroId, null, selected)?.door || null;
}
