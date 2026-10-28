# Crew recruiting plan

Status: Tim OK'd 2026-10-16 (phase 1 go). Each phase gets ticked when it is done and synced to Tim's folder, so a fresh session can pick up from here.

Follows the multiplayer rules: all rules in `game/src/sim` (Node, no graphics), players and bots act only through the same command messages, the sim owns all state, the browser only draws it and sends commands.

## Shinobi geisha (built 2026-10-26)

Shinobi-only `shinobi_geisha`: base 120 ryo with existing crew price scaling, 160 HP, twelve damage (latest balance adjustment 2026-10-27), one standard crew slot and eight-second hire. Normal clinic/jail/revive rules apply. [Diversion rules](deployment_sector_plan.md#diversion-5b-builtsim-checked-2026-10-26); [reused cast assets](cast_tracker.md#shinobi-geisha-runtime-alias-2026-10-26).

Balance follow-up (Tim, 2026-10-27): damage reduced from 28 to 14; other stats/charm behavior unchanged. Build coordinator reports `test_geisha` passed hire/charm/immunity/duration/cooldown/flee/fight coverage; cornered-hit assertion now reads configured damage. Tim balance playtest remains pending.

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

## Kuroda spearman (Tim, 2026-10-22)

Kuroda-only Spearman replaces Swordsman in hiring: 204 HP, 24 damage, reach 2.2; base price 120, hire 8 s, attack interval 1.2 s, walk 1.6/run 5.6. Normal price scaling and venue timing apply.

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
- Calling crew out (2026-10-21): [indoor patrol and exit rules](#phase-3c-indoor-patrols-tim-2026-10-21).
- Selection is sticky (2026-10-19): left-click toggles, drag adds, crew-bar names toggle, Esc clears; clicking a building or the ground keeps it.
- Clinic (2026-10-19, manual revive): downed crew of every clan (bots too) are carried to the clinic and stay until their boss pays at the clinic menu: `recoverCostShare` 25% once recovered, `reviveNowCostShare` 50% before. Move indoor crew outside before using G; see the indoor patrol rules below.
- [x] 6. Downed, execute and hospital (done 2026-10-17 via `combat_spec.md` section H, steps H1 to H4; Tim's playtest is H5).
- [ ] 7. Playtest pass with Tim: tune prices, timers, cap and speeds. Then on to the rival bot clan.

## Phase 3A (Tim, 2026-10-21)

Built and approved: exclusive control groups replace crew locking; indoor crew selection and pip double-click selection updated. Rules and keys: [crew controls](controls.md#crew).

## Phase 3B (Tim, 2026-10-21)

Built and approved: selected-crew attack assistance, independent squad targets, outdoor T broadcasts and protected hero execution. Rules: [controls](controls.md#crew) and [execution](combat_spec.md#h-downed-execute-and-hospital-approved-by-tim-2026-10-17).

## Phase 3C: indoor patrols (Tim, 2026-10-21)

- Crew sent into buildings patrol reachable indoor spots with pauses, defend against intruders and resume patrol after combat. Player and bot clans use the same rules.
- A hero visit or selection alone does not interrupt patrol. A normal command to selected crew returns them to normal control; crew left inside resume patrol after their active task finishes. Selection status shows Patrolling.
- Outdoor Follow cannot recall indoor crew. To leave together, issue Follow while the hero and selected crew are together inside, then keep those followers selected as the hero exits. Selection alone does not bring patrolling crew out; deselected followers left inside resume guarding.
- Otherwise, explicitly move selected crew to the street. Outdoor attack and clinic commands do not bring them out; move them outside first.

Phase 3E capacity (Tim, 2026-10-21): all ten businesses provide 23 total crew capacity, plus the hero; business/Renown progression has no additional hard maximum. Raids still allow six attacking crew plus hero.

## Recall and attack completion (Tim, 2026-10-21)

- Player attackers hold near a defeated target and defend normally; Follow requires an explicit command (Tim, 2026-10-25).
- Explicit Move/Follow recall works for every clan: commanded crew cancel windups and old hero assistance, ignore combat during return and ignore stale retreat hits after arrival. Fresh post-arrival assaults allow normal defense. Indoor exit restrictions above still apply.
- Smoke-expiry passive holding: [combat rules](combat_spec.md#f-hero-abilities-and-action-bar-approved-by-tim-2026-10-16-built).

## Player crew control (Tim, 2026-10-25)

- Player recruits and clinic returns hold position. Hero KO/respawn does not summon crew; existing followers hold when the leader goes down. Follow is explicit. Bot routines keep their own orders.
- Explicit attacks pursue until recalled; completion leaves player crew holding near the body. T cancellation can restore prior duties. Smoke passivity remains protected.
- Crew can be selected and ordered while the hero is KO'd or in another place; use the camera to control the relevant room/street. Selected crew can loot/execute where they are without sharing the hero's location.
- Inside your own hideout, dismiss healthy active crew for 15% of base hire price, rounded down. Clinic patients can be released permanently through the clinic menu.

Explicit Follow to an indoor hero brings selected outdoor crew through the entrance; outdoor Follow still cannot pull indoor guards out. Giving Follow while together inside allows selected followers to accompany the hero out.

## Open questions (later, not blocking)

- Upgrade list per unit type and what they cost.
- Do teahouses offer different unit types (e.g. dockside teahouse sells Riflemen)?

## Approved geisha playtest adjustment (2026-10-27)

- [x] **#9, implemented/checked 2026-10-27:** damage fourteen → twelve, bringing expected sustained damage near Ninja. Charm only while stationary and not attacking. Add pink aura/hearts while dancing and **Charming** channel bar on her buff UI. Current damage is twelve; attack speed/crit/dodge/health are unchanged.
- [x] Focused configured-damage/charm eligibility checks passed as reported below.
- [ ] Tim visual/balance playtest. [Overall phases](deployment_sector_plan.md#playtest-fixes-follow-on-approved-2026-10-27-not-implemented).

Phase 5C checkpoint (2026-10-27): damage fourteen → twelve gives approximate expected sustained damage 19.5 versus normal Ninja 19.17 before mitigation/tick effects. Automatic charm requires stationary/not attacking; explicit move/attack cancels dance/channel without refunding the ten-second cooldown. Authoritative `charming` start/until drives buff readout and labelled pink CHARMING bar. Renderer uses `e.lure.castUntil` instead of obsolete `dancingUntil`, with pink aura and pooled rising hearts (fifth particle-atlas shape) while dancing.

Extended `test_geisha` passed configured damage, stationary charm, move/attack precedence, channel metadata/cooldown and existing lure/flee/freeze/hire behavior. Render syntax passed; visual/balance review remains pending. No commit/push requested.

## Autonomous sector cleanup (implemented/checked 2026-10-28)

`sim/sector_cleanup.js` lets every clan's assigned sector crew execute nearby downed enemies and loot visible reachable drops within six units, same place/sector, then resume duty. Existing execution/loot rewards/rules apply, without hidden intelligence or duplicate claims. Never automatically execute civilians, friendlies or heroes; neutral police require existing hostility.

Preserve manual orders (including switch-away completion), Ambush, transfers/Rally, Guard travel, retreat/recovery, camping withdrawal and smoke passive/hold-fire. New orders interrupt cleanup. Reported `test_sector_cleanup` covers actual all-clan execution/loot, interruption and priorities; Tim playtest pending.

## Explicit single-worker body jobs (2026-10-28)

Right-click body dispatches one nearest reachable eligible crew member from selected command group; without selection use hero-party crew in viewed place, with hero fallback only if none. `sim/crew_jobs.js` uses existing execute/loot rules and prevents duplicate claims; hero proximity cannot steal the task and no group loot escorts are created. Existing explicit commands without the new job flag retain their old behavior.

Explicit job outranks group attack/move temporarily; those orders become return plans. After completion/interruption, physically rejoin current group and copy peers' latest order (including changes made while worker unselected), or resume duty. Solo-select plus new order or Stop/Cancel overrides immediately. Damage interrupts execution; Smoke drops job/holds fire; transfer/KO/stun cancels. Normal visibility/sector/group/Rally rules apply. No simultaneous mark scrubbing or automatic redeployment. Status: Collecting loot / Finishing off / Rejoining group. Automatic sector cleanup remains lower priority/unchanged. Reported crew-job/regression checks passed; Tim playtest pending.

Backlog interest (Tim, 2026-10-28; not built): a special crew type per clan inspired by geisha, with no finalized new unit/balance approval. Tim enjoyed observing rival combat, ambushing a weakened Kuroda boss, smoking the counterattack and combining geisha charm with Assassinate/cleanup; this feedback does not authorize new mechanics.
