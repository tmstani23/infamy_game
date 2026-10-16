# Crew recruiting plan

Status: Tim OK'd 2026-10-16 (phase 1 go). Hospital art: Tim is getting a new building sheet (prompt from the main chat). Each phase gets ticked when it is done and synced to Tim's folder, so a fresh session can pick up from here.

Follows the multiplayer rules: all rules in `game/src/sim` (Node, no graphics), players and bots act only through the same command messages, the sim owns all state, the browser only draws it and sends commands.

## Decisions (Tim, 2026-10-16)

- **Crew are RTS units**, not named characters. You hire a Thug, not a person. Types and upgrades make them better.
- **Teahouse = barracks.** Queue a hire, pay ryo once, the recruit arrives after a short timer.
- **No upkeep or wages.** Each extra crew member costs a bit more than the last.
- **Crew cap from property** (RTS supply): hero + 3 at the start; each held teahouse, warehouse or den adds about 2 to 4; about 20 to 30 across your zones in the endgame.
- **Most crew are stationed** in your zones as defenders. A raid still takes at most about 6, so size means holding more ground, not winning fights by numbers.
- **Dead is dead.** Crew killed in a fight are gone; rehire them. Survivors keep their damage (no regen) until sent to a **hospital** (bonesetter's clinic) to heal. The hero is knocked out, not killed, and gets back up at a safehouse.
- **Ryo is spent on:** hiring and replacing crew, hospital healing, unit-type upgrades (RTS research, e.g. "Thugs get clubs"), property, and police bribes.
- **Anti-snowball:** the property cap, rising hire cost, heat (bigger clans draw more), and the existing underdog bonus.

## Combat style (Tim, 2026-10-16): RTS / Dota hybrid

- Units have HP bars, attack range, attack speed and damage; they auto-attack the nearest enemy in range.
- Right-click an enemy to focus it; attack-move (A + click) fights along the way.
- The hero plays like a Dota character: a basic attack plus Q/E/R/F abilities on cooldowns (as already designed). Crew are the RTS army; crew get 1 to 2 abilities later.
- Hero moves with WASD (Tim, 2026-10-16); mouse aims abilities and attacks, right-click commands crew.

## Numbers to start with (tune in playtests)

- Starting ryo: 300. Hire price = base price x (1 + 0.15 x crew you already have).
- Base prices: Thug 60, Brute 100, Swordsman 120. Hire timer: 5 to 10 seconds.
- Hospital: heals 1 HP a second per bed, costs a little ryo per HP.
- Layer 1 cap: 3 crew. Ranged units (Rifleman, Archer) wait for projectiles; Lookout, Demolitions, Ninja come later.

## Phases

- [x] 1. Clan state in the sim (done 2026-10-16: `game/src/sim/clans.js` with `addClan`, `crewOf`, `crewCap`, `hirePrice`, `setOwner`; `state.clans` and `state.businesses` (b0, b5, b6 on the waterfront, unowned at start) in `sim/game.js`; unit types and rules in `game/data/units.json`; `main.js` adds the player clan and the hero has `owner: 'player'`; `node game/tools/test_crew.mjs` passes. Nothing visible changes in the game yet.)
- [x] 2. Hire command (done 2026-10-16: command `{ id: heroId, type: 'hire', business, unit }`, handled by `clans.hire` in `sim/clans.js`. The hero must be inside that teahouse's room; any teahouse works, owned or not. Pays on queueing; checks locked types, cap (waiting hires count), queue limit (`maxQueue` 5) and ryo. One hire counts down at a time per clan, then the unit spawns at the teahouse door with `owner` and `hp`. `clan.notice` holds the last message for the UI. Crew speeds come from units.json. `node game/tools/test_crew.mjs` covers a player and a bot clan with the same commands. Not reachable from the browser yet: phase 3 adds the menu.)
- [x] 3. Hire menu and HUD (done 2026-10-16: press H anywhere inside a teahouse (no counter spot yet); `game/src/hire_menu.js` shows Thug / Brute / Swordsman with stats and price, keys 1-3 or click send `hire`, shows waiting hires and the last message; HUD line `ryo · crew n/cap`. New crew step out in a fan beside the door (`spawnOutside` in `sim/game.js`) instead of stacking on it. Sheets for thug, brute, swordsman added to `data/art.json` (thug idle = fighting idle, no plain idle exported). Checked in headless Chrome: hired a thug and a brute, both walked out of the teahouse door, no errors. Crew just stand there until phase 4.)
- [x] 4. Crew follow and orders (done 2026-10-16: `game/src/sim/nav.js` street walk grid (0.5 cells) + A* + straightened paths; `order { id: heroId, units, kind: follow | move | station, x, z }` in `sim/game.js` (only your own crew on the street; points inside buildings move to open ground). New crew follow their hero in rings of 6/12/18 places and wait outside while the hero is indoors; move/station spread into a square block; crew nudge apart so they never stack. Browser: `game/src/crew_input.js` click or drag-box to select (Shift adds), C all crew, right-click ground = go there, Ctrl+right-click = station (hold), right-click your hero or V = follow, Esc clears; green rings under selected crew. V not F because F is a hero ability key. Node test covers following round corners, a move across the map, refusing other clans' heroes; checked in headless Chrome. Crew stay on the street: they don't go through doors yet.)
- [ ] 5. Fighting and death (RTS/Dota style above): HP bars, auto-attack in range, focus target, attack-move; at 0 HP they play the death animation and are removed. Hero at 0 HP is knocked out and gets up at the safehouse. Test against a dummy enemy.
- [ ] 6. Hospital: a clinic building (placeholder art); `order { units, heal, clinic }` sends crew there, they heal over time for ryo, then walk back or wait.
- [ ] 7. Playtest pass with Tim: tune prices, timers, cap and speeds. Then on to the rival bot clan.

## Open questions (later, not blocking)

- Upgrade list per unit type and what they cost.
- Do teahouses offer different unit types (e.g. dockside teahouse sells Riflemen)?
- How the hospital is placed: its own building, or an upgrade to a property you own.
