# Civilians plan

Status (2026-10-17): Tim OK'd the plan; the build is **paused** (usage). No code changed yet. Owned by the "Townsfolk walking the streets" thread.

Goal: townsfolk walk the waterfront streets in a way that looks real, as sim entities so it works in Node and in multiplayer.

## Research summary

From Assassin's Creed Unity and Hitman talks:
- People walk **to** places instead of drifting. The map has spots (stall, teahouse door, pier, shrine, bench); each civilian picks one, walks there, does something (idle, bow, chat in a pair), then moves on.
- Who goes where depends on the time of day: busy streets by day; at night most go home and only a few stay out (sailors at the docks, the geisha near the teahouse).
- Civilians keep a little distance from each other.
- When a fight breaks out nearby they play the scared clip, then flee away from it.

## Plan

1. `game/src/sim/civilians.js`: each civilian loops: pick a spot by type and time of day, walk the street path from `nav.js`, stay a few seconds, pick the next. Each rethinks about once a second, so 30 to 40 people stay cheap.
2. Spots: a `pois` list in `game/data/waterfront.json`, each tagged with who uses it (monk to the shrine, fisherman and sailor to the pier, merchant to the shop, geisha to the teahouse).
3. Sim clock: day and night move from the screen into the sim, so N sends a command and civilians can follow a schedule.
4. Fear: a fight or death within about 8 units makes civilians play scared, then walk fast away. Each scared civilian is marked as a witness for heat later.
5. Civilian types in `game/data/units.json`. Fleeing uses the walk clip played faster (there is no run clip).

## Build steps

- [ ] 1. Points of interest in the map data
- [ ] 2. `sim/civilians.js` (trips, schedules, fear)
- [ ] 3. Hook into `sim/game.js`, `units.json`, `render/characters.js`, `main.js` (shared with the crew thread: coordinate, small edits)
- [ ] 4. Node test
