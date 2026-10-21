# Crew recruiting plan

Status: Tim OK'd 2026-10-16 (phase 1 go). Each phase gets ticked when it is done and synced to Tim's folder, so a fresh session can pick up from here.

Follows the multiplayer rules: all rules in `game/src/sim` (Node, no graphics), players and bots act only through the same command messages, the sim owns all state, the browser only draws it and sends commands.

## Decisions (Tim, 2026-10-16)

- **Crew are RTS units**, not named characters. You hire a Thug, not a person. Types and upgrades make them better.
- **Teahouse = barracks.** Queue a hire, pay ryo once, the recruit arrives after a short timer.
- **No upkeep or wages.** Each extra crew member costs a bit more than the last.
- **Crew cap from property** (RTS supply): base capacity stays 3 (`settings.json` `crew.baseCap`); each held business adds its `crewSlots` (current balance: [businesses and raids](business_raids_plan.md#2-payouts)); no hard cap; about 20 to 30 across your zones in the endgame.
- **Most crew are stationed** in your zones as defenders. A raid still takes at most about 6, so size means holding more ground, not winning fights by numbers.
- **Downed, then dead or hospital.** Crew at 0 HP go down; if an enemy finishes them with a 3 s execute they are dead (rehire), otherwise they are carried to the hospital (see `combat_spec.md` H). Survivors heal only slowly (see `combat_spec.md`, Health) until sent to a **hospital** (bonesetter's clinic). The hero is knocked out, not killed, and gets back up at a safehouse.
- **Ryo is spent on:** hiring and replacing crew, hospital healing, unit-type upgrades (RTS research, e.g. "Thugs get clubs"), property, and police bribes.
- **Anti-snowball:** the property cap, rising hire cost, heat (bigger clans draw more), and the existing underdog bonus.

## Service presence (Tim, 2026-10-21)

Own eligible crew can provide presence for business and service actions: [menu controls](controls.md). Recruiting still requires the hero physically inside.

## Hiring venues (Phase 1, Tim, 2026-10-21)

- Hire at HQs and the teahouse; Shinobi hire at their HQ/dojo.
- Crew prices are equal across hiring venues. HQ hiring takes twice as long.
- Shop and Tenements do not recruit. Property capacity grants no free crew; see [business balance](business_raids_plan.md#2-payouts).

## Combat style (Tim, 2026-10-16)

RTS / Dota hybrid. Rules and feel are in `combat_spec.md`; keys in `controls.md`.

## Numbers to start with (tune in playtests)

- Normal clan starts: see [starting paths](gameplay_and_design.md#starting-paths-settled). Hire price = base price x (1 + 0.15 x crew you already have).
- Base prices: Thug 60, Brute 100, Swordsman 120. Hire timer: 5 to 10 seconds.
- Hospital: heals 1 HP a second per bed, costs a little ryo per HP.
- Layer 1 cap: 3 crew. Ranged units (Rifleman, Archer) wait for projectiles; Lookout, Demolitions, Ninja come later.

## Phases

- [x] 1. Clan state in the sim (done 2026-10-16: `game/src/sim/clans.js` with `addClan`, `crewOf`, `crewCap`, `hirePrice`, `setOwner`; `state.clans` and `state.businesses` (b0, b5, b6 on the waterfront, unowned at start) in `sim/game.js`; unit types and rules in `game/data/units.json`; `main.js` adds the player clan and the hero has `owner: 'player'`; `node game/tools/test_crew.mjs` passes. Nothing visible changes in the game yet.)
- [x] 2. Hire command (done 2026-10-16: command `{ id: heroId, type: 'hire', business, unit }`, handled by `clans.hire` in `sim/clans.js`. The hero must be inside that teahouse's room; any teahouse works, owned or not. Pays on queueing; checks locked types, cap (waiting hires count), queue limit (`maxQueue` 5) and ryo. One hire counts down at a time per clan, then the unit spawns at the teahouse door with `owner` and `hp`. `clan.notice` holds the last message for the UI. Crew speeds come from units.json. `node game/tools/test_crew.mjs` covers a player and a bot clan with the same commands. Not reachable from the browser yet: phase 3 adds the menu.)
- [x] 3. Hire menu and HUD (done 2026-10-16: press H anywhere inside a teahouse (no counter spot yet); `game/src/hire_menu.js` shows Thug / Brute / Swordsman with stats and price, keys 1-3 or click send `hire`, shows waiting hires and the last message; HUD line `ryo · crew n/cap`. New crew step out in a fan beside the door (`spawnOutside` in `sim/game.js`) instead of stacking on it. Sheets for thug, brute, swordsman added to `data/art.json` (thug idle = fighting idle, no plain idle exported). Checked in headless Chrome: hired a thug and a brute, both walked out of the teahouse door, no errors. Crew just stand there until phase 4.)
- [x] 4. Crew follow and orders (done 2026-10-16: `game/src/sim/nav.js` street walk grid (0.5 cells) + A* + straightened paths; `order { id: heroId, units, kind: follow | move | station, x, z }` in `sim/game.js` (only your own crew on the street; points inside buildings move to open ground). New crew follow their hero in rings of 6/12/18 places and wait outside while the hero is indoors; move/station spread into a square block; crew nudge apart so they never stack. Browser: `game/src/crew_input.js` click or drag-box to select (Shift adds), C all crew, right-click ground = go there, Ctrl+right-click = station (hold), right-click your hero or V = follow, Esc clears; green rings under selected crew. V not F because F is a hero ability key. Node test covers following round corners, a move across the map, refusing other clans' heroes; checked in headless Chrome. Crew going through doors was added 2026-10-17: selected crew go in with the hero, and leaving a building mirrors entering.)
- [x] 5. Fighting and death (done 2026-10-16: rules in `sim/game.js` combat section. Enemies = different clans in the same place. Crew auto-attack within AGGRO 6, leashed 10 to their hero / station / move point; a plain move ignores enemies until it arrives; `attack` order focuses one target, `attackmove` fights on the way then holds. Hits every `attackSpeed` seconds for `damage` once within `attackRange`. Dead crew play the death animation and are removed after 3 s; the hero (stats in units.json `hero`, 400 hp) is knocked out and gets up at `home` after 5 s with full hp. Hero auto-attacks the nearest enemy in reach while standing still. Browser: HP bars (red enemies, green own when hurt), death plays once and holds, right-click enemy = attack, X then left-click = attack-move. Three stand-in rival thugs stationed outside the den (`?enemies=0` turns off). Attack/death sheets in `data/art.json`: thug/brute punching (club versions come from the sprite thread under the same file names), swordsman and ronin great-sword slash. Tests: `node game/tools/test_combat.mjs`, `node game/tools/test_crew.mjs`. Not checked in a browser (Tim playtests). Attack timing and hero chase were added afterwards, see `combat_spec.md`.)
- Orders (2026-10-19): an `attack` order can carry `resume: true`; the crew keep their previous follow, hold, station or stop order in `order.prev` and go back to it when the target is dead, down, removed or out of sight. Resume also covers attack-move, going into a business (`enter`) and heading to the clinic. T uses it; bots can too. T again calls a T attack off (order kind `resume`: back to the previous order).
- Targeting (2026-10-19): crew of every clan only start a fight on an attack order or T, an attack-move or while stationed; otherwise they hit back at whoever hit them in the last 5 s (`e.hitBy`, `RETALIATE_SECONDS` in `game.js`) or stop an executor on a downed friend. Only house guards attack anyone nearby. Police are never auto-attacked except attack-wave officers.
- Calling crew out (2026-10-19): with the hero on the street, C and crew-bar names include crew inside buildings; street orders walk them out first (`crewOut()`, orders carry `place`); the building flashes when crew go in or out (`view.flashBuilding`).
- Selection is sticky (2026-10-19): left-click toggles, drag adds, crew-bar names toggle, Esc clears; clicking a building or the ground keeps it.
- Clinic (2026-10-19, manual revive): downed crew of every clan (bots too) are carried to the clinic and stay until their boss pays at the clinic menu: `recoverCostShare` 25% once recovered, `reviveNowCostShare` 50% before. The G heal order is unchanged (they walk out themselves).
- [x] 6. Downed, execute and hospital (done 2026-10-17 via `combat_spec.md` section H, steps H1 to H4; Tim's playtest is H5).
- [ ] 7. Playtest pass with Tim: tune prices, timers, cap and speeds. Then on to the rival bot clan.

## Open questions (later, not blocking)

- Upgrade list per unit type and what they cost.
- Do teahouses offer different unit types (e.g. dockside teahouse sells Riflemen)?
