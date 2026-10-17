# Civilians plan

Status: **built 2026-10-17.**

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

## Built (2026-10-17)

- 20 townsfolk. Spots are the `pois` list in `game/data/waterfront.json`; types and tuning are in `game/data/civilians.json`.
- At night they go indoors (walking home 25% faster) and come back in the morning.
- Witnesses are marked `e.witness`.
- Fear: a 0.3 s flinch, then they run; runners that get jammed stop.
- Combat: attackable on order only, 60 HP, flee when hit, can be executed. A downed townsperson left alone for 5 s is helped home, and a replacement appears after about 60 s.
