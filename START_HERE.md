# Start here

Read this first. It links to the docs rather than repeating them.

## Working rules

- Usage: follow [docs/usage.md](docs/usage.md).
- This local folder is the main copy of the project.
- Plan first: ask Tim before building anything new. Big builds go in phases with a checklist in the plan file.
- Always build for multiplayer, playable single-player with bots: all game rules live in `game/src/sim` (runs in Node, no graphics), players and bots act only through the same commands, render only draws. See [docs/tech_plan.md](docs/tech_plan.md).
- Files: never delete old clips or sprite sheets without asking Tim. Move unwanted files into `to_delete/` at the folder root (Tim empties it).

## Run the game

Double-click `start_game.bat` (needs Node and internet). Controls: [docs/controls.md](docs/controls.md).

## Key docs

| Doc | What it covers |
|---|---|
| [README.md](README.md) | Project overview, repo layout, sprite export how-to |
| [docs/usage.md](docs/usage.md) | Usage-saving rules |
| [docs/documentation_role.md](docs/documentation_role.md) | Which doc owns which topic, and how doc changes are approved and written |
| [docs/architecture.md](docs/architecture.md) | High-level code architecture: modules, data flow, main loop |
| [docs/tech_plan.md](docs/tech_plan.md) | Code structure and build plan |
| [docs/controls.md](docs/controls.md) | Every working control, plus planned keys |
| [docs/crew_recruiting_plan.md](docs/crew_recruiting_plan.md) | Crew hiring and orders, phase by phase |
| [docs/combat_spec.md](docs/combat_spec.md) | Combat rules and feel, hero abilities, action bar, VFX plan |
| [docs/business_raids_plan.md](docs/business_raids_plan.md) | Owning businesses, payouts, attacks, War Lantern raids, defending (plan) |
| [docs/test_params.md](docs/test_params.md) | Every test URL parameter (`?fog=0`, `?raidme=den` ...) and what it does |
| [docs/rival_bot_plan.md](docs/rival_bot_plan.md) | Rival bot clan: rule-list brain, difficulties, home hideouts (plan, not built) |
| [docs/police_spec.md](docs/police_spec.md) | Police: heat tiers, arrests, bail, bribes |
| [docs/civilians_plan.md](docs/civilians_plan.md) | Townsfolk walking the streets |
| [docs/interiors_spec.md](docs/interiors_spec.md) | 3D interior rules and look |
| [docs/room_generator_plan.md](docs/room_generator_plan.md) | Room generator |
| [docs/buildings.md](docs/buildings.md) | Every building image: chat number, code id, file, source sheet, map placement |
| [docs/cast_tracker.md](docs/cast_tracker.md) | Characters, animations and sprite sheet status |
| [docs/gameplay_and_design.md](docs/gameplay_and_design.md) | Game design |
| [docs/art_direction.md](docs/art_direction.md) | The look and the sprite pipeline |
| [docs/roadmap.md](docs/roadmap.md) | Build layers and next steps |
| [assets/image_prompts.md](assets/image_prompts.md) | Image prompts (environment, items) |
| [assets/character_prompts.md](assets/character_prompts.md) | Character concept prompts |
