# Territory, game map and season score

Status: built 2026-10-20 (plan OK'd by Tim 16:46). Ninja Renown points come with the ninja step. "As built" at the end lists the code and the numbers.

Source draft: `next_steps/territory_plan.md` in the project files.

Related docs:
- `business_raids_plan.md` section 9: territory = businesses held, quarter control, War Lantern always needed to take a rival business.
- `rival_bot_plan.md`: home hideouts (inn for you, izakaya for the bot clan), bots use the same rules.
- `police_spec.md`: heat cooling (territory makes it faster).
- `controls.md`: the M map key and mute moving to K.
- `roadmap.md`: the season score step.

## 1. Territory areas

- Every owned business marks a circle in its owner's colour: teahouse radius 10, warehouse 12, den 16, home hideout 12. The numbers live in `game/data/settings.json`.
- Overlaps: a spot belongs to the clan whose business is nearest. There are no contested zones, so the map stays readable.
- Unowned businesses mark nothing. A rival's area only shows once that business is revealed in the fog.
- Ninja (Shinobi) hold no businesses, so only their forest village marks territory.
- All of it is in the sim as a lookup (`game.territory.ownerAt(x, z)` gives the clan), so bots and multiplayer use the same thing.

## 2. Game map (M)

- Full-screen map over the game. The game keeps running (no pause, so it works in multiplayer). M or Esc closes it.
- Layers with toggles: Territory, Businesses (letters + owner colour), Police (HQ, boxes, officers you can see), Units you can see. All on by default. There is no fog toggle: the map always uses your fog.
- Quarters are drawn as white dotted outlines with their names centred; the outline turns the holder's colour when one clan holds every business in it.
- Hover a business: owner. Hover a quarter: its holder (+25% payout). Hover the score: the breakdown. Click: the camera jumps there and the map closes.
- A short key explains Territory, Quarter (hold it all for +25% payout) and Camera view.
- Mute moves from M to K, plus a mute button on the HUD. The Controls panel (? key) and `controls.md` change in the same batch.

## 3. Bonuses inside your own territory (hero + crew)

- Home streets: you see every unit inside your territory, enemies and townsfolk, except hidden ninja (see section 5).
- Alarm: "Rival crew in your territory" alert + minimap ping when a unit of an enemy clan enters (at most once per 30 s per area).
- Out-of-combat healing twice as fast as the normal slow regen.
- Heat cools faster while the hero stands in your territory: 1 per 20 s instead of 1 per 30 s.
- Crew move 10% faster (they know the streets).
- Holding a whole quarter: +25% payout on its businesses (`quarterBonus` 0.25), a callout ("You hold the Bund!", or a rival's if you have explored all its businesses) and the coloured outline on the map.

## 4. Season score and season end

- One score for all clans, most points wins.
  - Yakuza: points for businesses held, weighted teahouse 1, warehouse 2, den 3.
  - Ninja: 1 point per 50 Renown (2026-10-21; `season.renownPerPoint`), built with the ninja contracts (`ninja_clan_plan.md`).
- Score in the top bar ("Day 3/10 · You 2 · Kuroda 3") and on the M map. Scores are counted at dawn.
- Single-player season length: 10 day/night cycles (a setting).
- At season end: a results screen (score per clan, winner) with New game (reloads) or Keep playing. The start menu step adds Continue / Save.

## 5. Vision and fog

- Explored ground and buildings stay uncovered once seen.
- Units (enemies, townsfolk) only show while one of your characters is near them, or while they are inside your territory (RTS-style explored vs visible).
- Hidden ninja are the exception: they don't show in your territory until revealed (lantern light, detection, attacking and so on).
- The minimap follows the same rules as the M map.

## As built (2026-10-20)

- Code: `game/src/sim/territory.js` (`createTerritory`: `ownerAt`, `inOwn`, `areaAt`, `standings`, `quarters`; the grid is worked out from business owners, not kept in the state), `game/src/game_map.js` (the M map, reusing `minimap.js` big), the score line and results screen in `main.js`.
- Numbers: `settings.json` `territory` (radius per kind, `healFactor` 2, `heatCoolSeconds` 20, `crewSpeed` 1.1, `quarterBonus` 0.25, `intruderAlertSeconds` 30) and `season` (`cycles` 10, `renownPerPoint` 100); business scores in `businesses[kind].score` (teahouse 1, warehouse 2, den 3).
- Quarters are boxes in `port_town.json` `quarters`: Pleasure Quarter (teahouse + den), The Bund (warehouse, box [-58, -33, -26, -9]).
- News (`state.news`): `intruder` ("Rivals in your territory!" + minimap ping), `quarter` / `quarterLost`, `seasonEnd`.
- Test: `game/tools/test_territory.mjs`.
