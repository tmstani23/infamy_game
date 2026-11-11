# Developer guide

Repo layout, look tests, sprite export and tech overview.

**UI rule: no scrollbars anywhere in the game UI** (including browser number spinners and similar controls). Long content uses Previous/Next pages or is split into several menus or tabs.

**UI rule: number settings are typeable boxes.** −/+ step buttons are only an extra beside the box where useful, never the only control.

UI menus are built with the helpers in game/src/menu_shell.js (msShell, msAside, msRow, msBtn, msSec, msPager, msNote, msConcept, msPaginate) and styled by game/src/menu_shell.css; the clan accent comes from body[data-clan] (CSS variables --ms-accent and friends). HUD icons are inline SVG in game/src/hud_icons.js (hudIcon(name)).

## Tech

The browser client uses JavaScript ES modules and three.js, with isometric character sprites rendered from 3D models. The simulation owns game rules and state; the client sends commands and renders the results. A local Node server serves the game and saves. The architecture is designed for multiplayer later; a networked multiplayer release is not built yet.

## Test status (2026-11-06)

12 stale tests in `game/tools` updated to current rules (and `mode_baseline.json` refreshed); `rewards.js` dawn exception for leaderDown removed; all 13 pass. `formatStat`/`modifierDisplay` moved to `src/character_stat_format.js` (re-exported from `character_panel.js`).

## Repo layout

| Path | What it is |
|---|---|
| `docs/` | Design and tech docs (listed in [START_HERE.md](../START_HERE.md)) |
| `game/` | The game: sim, render, data (see `docs/architecture.md`) |
| `look_tests/` | Standalone HTML experiments. Open any file in a browser. |
| `screenshots/` | Screenshots used in the README |
| `assets/` | Concepts, environment sheets, models, animations, sprites and prompt files (see `docs/art_direction.md`) |
| `tools/export_sprites.mjs` | Batch-exports each model with its animation set to `assets/sprites` |

## Look tests

- `look_tests/lantern_street.html`: rainy lantern-lit street with wet reflections, mist, a see-through cutaway and a Realistic to Anime style slider.
- `look_tests/voxel_character.html`: one ronin built from about 108,000 one-centimetre cubes, with idle and walk animations. Kept as an example only; the art pipeline uses sprites instead.

- `look_tests/sprite_render_test.html`: drop in a rigged model and Mixamo animations to preview all 8 isometric directions and export a transparent spritesheet.

All of them load three.js from a CDN, so they need an internet connection.

## Exporting sprites

This is the process for new characters and items and for updates to existing ones.

One-time setup in the `infamy_game` root: `npm install sharp playwright`.

```
node tools/export_sprites.mjs . <model> --pack
```

- `--pack` repacks just the exported models into the live catalog afterwards (runs `tools/repack_model.mjs`).
- `--portrait` also renders the 512 px character-page portrait (idle, front row) to `assets/sprites/portraits/`; with `--pack` it goes into `assets/sprites_packed/portraits/`.
- `--margin=N` sets the gutter between packed frames (passed through to the repack).
- Overwritten sheets are archived automatically to `assets/sprites_archive/<date>_<model>/` (once per day per file).

Repack without exporting: `node tools/repack_model.mjs <model> [more models] [--margin=4]`, `--all` for every model (slow), `--dry` to report sizes only, `--portrait` for portraits.

Add `--glow-only` to write just the weapon glow sheets (`<sheet>_glow.png`) and keep the colour sheets.

This renders each model in `assets/models` with its own animation set from `assets/animations` to `assets/sprites/<model>_<animation>.png`, overwriting earlier exports. Add model names after `.` to export only those (`node tools/export_sprites.mjs . thug brute`). Animation sets go by subfolder of `assets/animations`, keeping Mixamo's own filenames: `brawler/` (thug, brute), `gunner/` (mercenary), `ninja/` (ninja leader and ninja grunt), `archer/` (archer), `civilian/` (geisha and other townsfolk, the default). Files directly in `assets/animations` are the ronin's combat set. `Mutant ...` files in `brawler/` are brute-only and replace the plain clip of the same name (`Mutant Walking` replaces `Walking`). A filename prefix such as `brawler_walk.fbx` also works. The mapping is at the top of the script.

Packed sprite manifests may have 8, 16 or 32 directions. Train cars use 32 directions (rows start at S, 360/32 degrees apart) with 6 frames each; other models stay at 8. Packed train textures take about 344 MiB of graphics memory with mips. Trains: `tools/train_to_glb.py` (numpy + Pillow) turns the OBJ pieces in `assets/models/source/train/split` plus the guard zip into `assets/models/mounts/train_*.glb`; the MOUNTS train entries in `tools/export_sprites.mjs` then export them.

Without `--pack` an export is not added to the packed runtime catalog. A full sprite audit is only needed for catalog-wide policy changes; the packing gates are in `docs/art_direction.md`.

Held items (weapons, props) go in `assets/models/items/` as `.glb` (or `.fbx`), and `ITEMS` at the top of the script says who holds what (for example the mercenary holds `rifle.glb` in both hands). Sizes per character are in `SCALE` (the brute is 1.12x). The sprite test page has matching controls for trying an item and its grip by hand.

### Mounts and vehicles

Animals, vehicles and cannons are `.glb` files in `assets/models/mounts/` (git-ignored, like the other models). The `MOUNTS` table in `tools/export_sprites.mjs` lists each one with its file, size and clips; export them the same way (`node tools/export_sprites.mjs . mare --pack`). `tools/mounts_to_glb.py` (pip `bpy`) converts a Blender rig scene to that `.glb`. Export sizes and framing are written to `assets/sprites/mounts.json`.

Gatling rig (2026-11-10): `assets/models/source/gatling_rig/` (`gatling_rig.blend`, `gatling_rig.py`). The whole barrel spins on its true axis and stays straight. The salute burst is 80 ticks: 1 s of silent barrel spin, then 3 s of shots (one every 2 ticks, `sim/cannon_salute.js`) with tracers and the firing loop, then the wind-down. Tracers reach about 20 units (`render/abilityfx.js` `gatlingShot`). Sounds: `gatling_loop_1.ogg` while firing, `gatling_end_1.ogg` on stop (`render/sound.js`); there is no start clip.

Extra `MOUNTS` fields for vehicles:
- `wheels`: wheels fused into the model are cut out and rebuilt as spinning spoked wheels (`addWheels` in `look_tests/sprite_render_test.html`); `mesh`, `fwd`, `axle`, `list` (Blender coordinates read off the model) and `spokes`.
- `tilt`: turns one part about a pivot so it meets the ground (the rickshaw's cart).
- `supersample`: renders at that many times the size and draws down, for softer edges.

Vehicle footprint shadows are set in `game/data/art.json` `characterFraming` as `shadow: [length, width]` in world units.

### Frontier sheet 2, ride clip and rickshaw horse (2026-11-06)

- `python tools/add_frontier_sheet2_art.py`: cuts frontier sheet 2 plus the gates and walls into `game/art/buildings/`.
- `RIDE` table in `tools/export_sprites.mjs`: the hero's `ride` clip (`coach_sitting` for now).
- `MOUNTS` `extra`: more clips from animation-only `.glb` files, made by `assets/models/source/gallop_anim.py` (for example `assets/models/mounts/*_gallop.glb`).
- `rickshaw_horse`: rig script `assets/models/source/rickshaw_horse_rig/rickshaw_horse.py`, exported through `MOUNTS`.

### Music (2026-11-07)

Songs live in `assets/music/` subfolders by mood (`city/`, `frontier/`, `battle/`, `ceremony/`, `stealth/`); the list is in `game/src/menu_music.js`. The in-game shuffle plays every song once per cycle with no repeats; subfolders do not change the playlist.

## Campaign pass (2026-11-11)

### Campaign goals and first town
- Goal steps for the first town: founding permit, talk to the old surveyor (while clan.surveyPending), hire settlers, then the earlier steps.
- A lieutenant or surveyor guide talk counts toward a goal only while its card is the current goal.
- Quest marks (render/banners.js): over the lieutenant figure; over the governor figure by day, or the town hall when he is inside, until metGovernor.
- Lieutenant budget is a typeable box with a Set button.
- Campaign top bar shows Influence and the next tier.

### Permit gate and Rally
- land_office.mayLeave(clan): holds a permit, or owns a settlement, or already has crew in the world. Without it: the island gate refuses 'use', expeditions refuse, the player cannot hire settlers. Applies to rival clans too.
- While a Rally is active for a clan: no boarding at the capital station (rail.js board and allAboard), the hero cannot use the island gate, expeditionCheck refuses. All clans.
- At the capital only deployment group 'hero' boards a train; Rally crew do not.
- Hero group limit 6 counts crew left on the island; the crew cap counts crew everywhere.

### Rival founding (sim/bot_expedition.js; founding.bots in data/frontier.json)
- The first bot leaves founding.bots.afterPlayerDays (2) days after the player's first town; each next bot staggerDays (2) later. With no player town, bots leave from fallbackDay (10).
- A bot leaves when it can pay permit + 5 settlers + founding cost + reserve and is not raided or under half health. One town per bot. The boss stays in the town; the lieutenant runs the city.
- Yakuza and Kuroda bots first hold minBusinesses (2) businesses, waiting at most businessWaitDays (4) past their leave day.
- Bots (Shinobi included) save for the trip only from their leave day on.
- A city captain holding no business saves for a first one once he has 3 crew.
- A governor with initiative builds a lumber camp toward the nearest trees first when none are within worker range.

### Town governor
- game.js townGovernors: model units.rules.governorModel (governer1) at rules.governorSpot (cells, default [0.15, -0.62]) in front of each player town hall by day; owner null, guide true, not attackable; removed at night. Space near him or the hall talks.

### Lieutenant raids and crew care
- A raider entering with job 'raid' gets a move order to the attack's hold spot; the lieutenant sends 'use' only when businesses.entryStatus is ok.
- Notices caused by lieutenant-tagged commands are restored to the boss's previous notice; results from ticks still show. Attack bar and doorsOpen callout read "Your captain is raiding..." while the hero is in the world.
- War Lantern warm-up: lieutenant raiders attack a unit channeling the knock-down (rules knockGuardSeconds 4); the brain ticks every 10 ticks while a lantern is up. Rival boss and crew (bot.js assault) do the same.
- defendLantern: with the boss away and the Defend order on, the nearest street crew or the captain walks to a rival lantern and knocks; after a hit he retries after knockRetrySeconds 3.
- Crew care: under the Hire order the city captain bails jailed crew and revives clinic crew within the budget; same for AI clans.

### Workers and carts (data/frontier.json workers)
- lane {min 0.5, max 1.4, sway 0.2, ease 0.12}: each worker's drawn position is offset sideways by a fixed amount from a hash of its id; trip times unchanged; Move orders ease the lane to zero.
- buildingPad 1.2: the planner pads town building boxes, falling back to unpadded.
- War camp drop point: the edge of the camp building toward the worker.
- carts.stopEdge 0.5: ox carts are drawn between building edges; timing unchanged.

### Horses and vehicles
- Stored units (e.stored, place 'stable') are not drawn.
- Recall all stores every horse and vehicle: a rider id with no entity is cleared; remaining vehicle riders are set outside.
- A 'mounted' flag with no horse under it is dropped every second. An empty vehicle is idle.
- Take out (vehicle_garage.js parkSpot): rings around the stable from rules.garage.parkRing 9, step parkStep 4, clear of town buildings and at least a length plus parkGap 1 from other horses and vehicles.
- Whistle summon: H, the Mount menu button, the Vehicles panel button. Sound: custom clip horse_whistle_1 (cast 'horseWhistle').
- Left-click: one crew member selects only that one; any of your horses, rickshaws or omnibuses (loaded or empty) is selected and shown in the target frame; a horse ridden by crew selects her rider. Empty ones take no orders.
- Right-click in the world only loads or mounts. Getting off: Q, right-click the vehicle card or Mount card in the crew panel, right-click one seat for one rider, right-click the Frontier crew header for everyone.
- Double-click a vehicle card or Mount card: the camera follows it.
- Group move with mounted crew: block spacing 2.8 (1.1 on foot).
- Horses with riders and vehicles are idle unless they really move (rules moveStep: horses 0.12, vehicles 0.02 per tick).
- Self-driving on a move order (omnibus.js): planned path (nav.findPath, corners cut with clearLine), exact positions on free ground, pull-away and draw-up pace, pivot when the way is behind. Optional rules.omnibus.drive {pivotDegrees 70, pivotSpeed 0.15, startPace 0.25, pullAwaySeconds 0.7, drawUp 8}.

### Sim performance
- crew_orders.moveTo: a failed findPath for the same goal is retried after 20 ticks.

### Art and sounds
- art.json: rail_gate and lieutenant_post placed; cannon_battery, siege_workshop, burned_ruin, water_tower cut, unplaced. tools/add_buildings6_art.py cuts them from the buildings6 sheet.

### Vehicles, captain hiring, enforcers (2026-11-11)

- Vehicle boarding: selected crew run to the vehicle and get in once within rules.omnibus.popRange (default 10).
- Right-click a horse with crew selected: the nearest unmounted crew member gets a move order to her (unit.mountGo) and mounts within rules.mount.crewMountRange (default 5). No other horse is called. A stored horse refuses. Shift+H group mount is unchanged.
- Omnibus command { action: 'deploy', vehicles, units, hero: true }: the hero in units steps out alone; the vehicle's order becomes stay when riders remain.
- Hero boarding (omnibus board): any own vehicle with a free seat and no driver, loaded or empty; riders aboard keep their seats. With no units given: crew following the hero plus crew with a stop order or no order within reach x 2.5. Units given but farther: they walk to the vehicle (boardBus), also when the hero already sits in it.
- Client: right-click a loaded own vehicle with a free seat, hero within 6 and no crew selected to board: the hero boards. Q beside a vehicle with a free seat boards.
- Target frame status for a rickshaw or omnibus: In the stable, Going to the stable, Driven by you, Staying, Driving there, Following, Waiting to follow, Parked.
- The multi-unit selection panel is hidden when every selected unit is the player's, counting omnibusOwner and horseOwner.
- C (crewInput.selectAll) selects only crew where the hero is: place 'world' when he is on the island, any other place when he is in the capital.
- Vehicle separation (omnibus.js separate): the vehicle the hero drives is never the one pushed; pushed vehicles keep exact positions on free ground.
- Following vehicles (closeOn): step toward the place in the line = top speed x min(1, 0.2 + distance / 2.5); anim trot below 60% of top speed, run above. The line is measured from the hero's current position.
- drive(): arrival within stopAt + 0.02.
- Watch view: #attackbar sits at top 164px (under the watch banner and the Outside button) while body.city-watching.
- Lieutenant hiring (sim/lieutenant.js hirePlan): under the Hire order the city captain hires the clan's hireable non-settler unit he has fewest of (crew, hire queue, clinic and jail counted; cheapest on a tie). Units in settings lieutenant.hireBasic (thug, brute) are left out of that cycle and hired only when the treasury after reserves or the whole daily budget cannot cover the wanted unit. With no other unit hireable the basic units are the cycle.
- At the crew cap with an empty hire queue the captain dismisses one basic crewman in the city (not in a Rally, vehicle or saddle; normal dismiss refund) when the wanted unit fits the day's budget and the treasury, then hires it. Log line: "Let a thug go to hire better".
- Lieutenant command gate: a captain command { type: 'dismiss', unit, business } for one unit needs the Hire order. clans.dismiss accepts the captain of a bot clan. Player and rival captains share the rule; rival bosses at home (bot.js) are unchanged.
- While I'm away panel: the Hire crew box has a hover describing the rule.
- Irezumi enforcer (yakuza_enforcer) taunt: cooldownTicks 180 (9 s), durationTicks 80 (4 s), radius 5, all enemies in radius, damage taken x0.85.
- Masked bodyguard (shinobi_enforcer): damage 21, attack interval 1.2 s. Taunt effect: violet wave to the taunt radius and a seal that follows the taunted enemy for 3 s; her taunt sound plays louder and higher.
- units.json attackSpeed is the seconds between swings; damage per second = damage / attackSpeed.

### Rival hiring mix, crew fight back, Watch the city effects (2026-11-11)

- Hiring mix (sim/hire_mix.js): hireMix(game, clan, basic) returns the hireable non-settler unit the clan has fewest of (crew, hire queue, clinic and jail counted; cheapest on a tie) and the cheapest unit as fallback; units in settings lieutenant.hireBasic (thug, brute) are left out of the cycle unless nothing else is hireable. Used by the city captain (sim/lieutenant.js) and by rival bosses hiring in person (bossHire in sim/bot.js and sim/ninja_bot.js: the wanted unit when the treasury covers its price, else the cheapest).
- Sweep (sim/sweep.js): in every sweep state a squad member attacks whoever hit a squad member in the last 4 s (any owner except police and townsfolk, same place, within 9, visible), after the sweep's own targets.
- City captain (sim/lieutenant.js): attacks whoever hit him in the last 4 s before any errand (lieutenant-tagged attack order with place). He has no abilities.
- City captain replacement: a knocked-out captain is removed and replaced after captainWaitSeconds like a dead one. Every 2 s clinic, jail and respawn entries of the captain type and captain units that are neither the captain in charge nor the gate guide are removed.
- War Lantern defence (defendLantern): the nearest own crew on the street knocks it down; with none on the street, one crew member inside the clan's HQ room (the captain last) gets a street move order to the lantern.
- Deployment: while the boss's place is 'world', keepAtHQ is cleared on HQ reserves. The Keep at HQ checkbox is removed from crew cards; a hand transfer to HQ reserves pins crew while the boss is in the city. Crew card status for HQ reserves: "Recovering, deploys at full health" when hurt, "Kept at HQ, move to a sector to deploy" when pinned.
- Watch the city: render/view.js passes the camera's place to abilityFx.update and banners.update, so sweepfx, shakedownfx, crewfx and the raid ground markers draw for the place on screen (the city street, or a room viewed with Inside). Esc closes menus only; the Return to hero button and Home end Watch the city.
- Controls panel (index.html): Watch the city row and the Out on the island row updated for the above.

### Captain hiring and Sabotage, guard duty, top bar Standings (2026-11-11)

- Captain hiring fallback (sim/lieutenant.js): a basic unit (settings lieutenant.hireBasic) is hired only when the wanted unit's price exceeds the daily hire budget, or the clan has fewer than lieutenant.hireBasicBelow (3) crew and queued hires and the treasury cannot cover the wanted unit above what he keeps back. Otherwise he waits.
- Captain hiring before saving: with the Buy order on, the captain holds back the price of the cheapest free business plus lieutenant.reserve only once crew plus queued hires reach lieutenant.hireFirstShare (0.5) of the crew cap.
- Shinobi captain contracts: LIEUTENANT_JOBS = scout, mark (Sabotage), bandits under the Shinobi jobs order (one a day) and steal under the Steal order (one a night). Scout and Sabotage alternate (record.lastJob). For a Sabotage two city crew enter the business and stand on the back-room spot until the mark is planted and held. A Sabotage is called off after lieutenant.markJobMinutes (5). Captains never take boss contracts.
- Guard duty (sim/deployment_ai.js; city captains and rival bosses, not Shinobi): the sectors where the clan holds a non-HQ business are sorted by id; each day every second one guards its most expensive business (by purchase price) and the others patrol, and the two halves swap on the next day. A business under a raid or a Shakedown is guarded by its sector while the hit is on. A change is skipped while the sector has an operation or recovery. Returning to patrol restores the patrol objective and route saved when the guard was set. A guard duty this brain did not set is left unchanged. The brain's state { next, guards } is saved with the lieutenant brain (ai).
- Lieutenant commands: deployment action 'assignment' is allowed under the Defend order. Log lines: "Crew set to guard the <business>", "Crew back on patrol".
- Influence (sim/influence/influence.js): new accessor tiers() returns [{ at, label }] (empty when Influence is off).
- Top bar (src/top_bar.js, src/top_bar_standings.js): the #score element holds a clock block (day, time left in the day or night, crew of cap; hover gives the crew slot breakdown) and one chip per clan from territory.standings(), the player first and then by the big number. Campaign chip: Influence, tier, Renown. Classic chip: season points, Renown when above 0. Chip hover: breakdown, next tier and what Influence and Renown do. standingsModel(game, owner) and standingsDetail(game, owner, clan) read the state only. scoreText in src/main.js is removed.
- Standings panel (src/standings_panel.js, #standingspanel): opens on a click on a clan chip, closes on Esc, its Esc button or a second click on the same chip. A tab per clan. Left column: Influence, Tier, Renown, Businesses (Classic: Points, Renown, Businesses, Crew). Body in Campaign: Influence sources (Renown, businesses held, town trade), progress to the next tier, the tier list five to a page. Body in Classic: the point sources five to a page.
- Controls panel (index.html): new row "Click a clan in the top bar". Lieutenant panel: the Shinobi jobs label reads "Scout, Sabotage or Thin out the bandits (one a day)"; the Hire hover describes the fallback.
- Settings (data/settings.json, lieutenant): hireBasicBelow 3, hireFirstShare 0.5, markJobMinutes 5.
