# Start here

Read this first. It links to the docs rather than repeating them.

## Working rules

- Usage: follow [docs/usage.md](docs/usage.md).
- Usage awareness: keep routine work lean. Ask Tim before work likely to consume substantial usage, including broad archive/history searches, large reviews, or extensive testing. Prefer targeted reads and checks.
- Test-param playtests: reuse one canonical manual playtest setup. Extend `game/src/test_params.js` instead of adding duplicate test-param simulation copies, and reuse an existing running playtest/server instead of launching parallel copies. See [docs/test_params.md](docs/test_params.md). Focused Node regression tests are still fine.
- This local folder is the main copy of the project.
- Plan first: ask Tim before building anything new. Big builds go in phases with a checklist in the plan file.
- Separation of concerns: keep world structure, game rules and presentation separate. Structural world edits start in the blueprint sources; generate the world and map reference from them. Artwork and UI follow that data. See [blueprint workflow](docs/frontier_build_steps.md#blueprint-and-presentation-workflow).
- Always build for multiplayer, playable single-player with bots: all game rules live in `game/src/sim` (runs in Node, no graphics), players and bots act only through the same commands, render only draws. See [docs/tech_plan.md](docs/tech_plan.md).
- Files: never delete old clips or sprite sheets without asking Tim. Move unwanted files into `to_delete/` at the folder root (Tim empties it).

## Run the game

Double-click `start_game.bat` (needs Node and internet). Controls: [docs/controls.md](docs/controls.md).

## Key docs

| Doc | What it covers |
|---|---|
| [README.md](README.md) | Public front page: pitch, screenshots, how to play |
| [docs/developer_guide.md](docs/developer_guide.md) | Tech overview, repo layout, look tests, sprite export how-to. **All sprite work (new or updated characters and items) uses [Exporting sprites](docs/developer_guide.md#exporting-sprites).** |
| [docs/usage.md](docs/usage.md) | Usage-saving rules |
| [docs/documentation_role.md](docs/documentation_role.md) | Which doc owns which topic, and how doc changes are approved and written |
| [docs/architecture.md](docs/architecture.md) | High-level code architecture: modules, data flow, main loop |
| [docs/performance_diagnosis.md](docs/performance_diagnosis.md) | Map performance measurements, diagnosed CPU hotspots and open profiling steps |
| [docs/tech_plan.md](docs/tech_plan.md) | Code structure and build plan |
| [docs/controls.md](docs/controls.md) | Every working control, plus planned keys |
| [docs/crew_recruiting_plan.md](docs/crew_recruiting_plan.md) | Crew hiring and orders, phase by phase |
| [docs/deployment_sector_plan.md](docs/deployment_sector_plan.md) | Deployment, sectors and Rally: built rules, checkpoints and manual playtest list |
| [docs/combat_spec.md](docs/combat_spec.md) | Combat rules and feel, hero abilities, action bar, VFX plan |
| [docs/business_raids_plan.md](docs/business_raids_plan.md) | Owning businesses, payouts, attacks, War Lantern raids, defending (plan) |
| [docs/test_params.md](docs/test_params.md) | Current test URL presets (`?test=...`) and renderer comparison switch |
| [docs/rival_bot_plan.md](docs/rival_bot_plan.md) | Rival bot clan: rule-list brain, difficulties, home hideouts (built 2026-10-19) |
| [docs/territory.md](docs/territory.md) | Territory areas, M game map, home-turf bonuses, season score and end (built 2026-10-20) |
| [docs/leader_balance.md](docs/leader_balance.md) | **Important, needs balancing:** leader bounty, underdog help, crew cap |
| [docs/ninja_clan_plan.md](docs/ninja_clan_plan.md) | Ninja (Shinobi) clan: contracts, mark, stealth, leader kit (plan) |
| [docs/police_spec.md](docs/police_spec.md) | Police: heat tiers, arrests, bail, bribes |
| [docs/civilians_plan.md](docs/civilians_plan.md) | Townsfolk walking the streets |
| [docs/interiors_spec.md](docs/interiors_spec.md) | 3D interior rules and look |
| [docs/room_generator_plan.md](docs/room_generator_plan.md) | Room generator |
| [docs/buildings.md](docs/buildings.md) | Every building image: chat number, code id, file, source sheet, map placement |
| [docs/cast_tracker.md](docs/cast_tracker.md) | Characters, animations and sprite sheet status |
| [docs/gameplay_and_design.md](docs/gameplay_and_design.md) | Game design |
| [docs/art_direction.md](docs/art_direction.md) | The look and the sprite pipeline |
| [docs/roadmap.md](docs/roadmap.md) | Build layers and next steps |
| [docs/frontier_campaign_plan.md](docs/frontier_campaign_plan.md) | Future capital, frontier, settlement, supply and RTS campaign design; not built |
| [docs/playtest_followup_plan.md](docs/playtest_followup_plan.md) | Phased playtest follow-up: map performance first, deployment, crew/economy, stealth and later refactor; proposals and open decisions |
| [assets/image_prompts.md](assets/image_prompts.md) | Image prompts (environment, items) |
| [assets/character_prompts.md](assets/character_prompts.md) | Character concept prompts |
| [assets/music_prompts.md](assets/music_prompts.md) | Suno music prompts and where tracks go |
